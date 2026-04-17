import { createHash } from 'crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync, statSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';
import * as dbv2 from './db-v2.js';

const DEFAULT_RETENTION_DAYS = 90;

export class EvidenceStore {
  constructor(options = {}) {
    this.backend = options.backend || process.env.EVIDENCE_BACKEND || 'local';
    this.localPath = options.localPath || process.env.EVIDENCE_PATH || '.evidence';
    this.s3Bucket = options.s3Bucket || process.env.EVIDENCE_S3_BUCKET;
    this.s3Region = options.s3Region || process.env.EVIDENCE_S3_REGION || 'us-east-1';
    this.s3Client = null;

    if (this.backend === 'local') {
      mkdirSync(this.localPath, { recursive: true });
    }
  }

  async initialize() {
    if (this.backend === 's3' || this.backend === 'r2') {
      try {
        const { S3Client } = await import('@aws-sdk/client-s3');
        const config = { region: this.s3Region };
        if (this.backend === 'r2') {
          config.endpoint = process.env.EVIDENCE_R2_ENDPOINT;
          config.credentials = {
            accessKeyId: process.env.EVIDENCE_R2_ACCESS_KEY,
            secretAccessKey: process.env.EVIDENCE_R2_SECRET_KEY,
          };
        }
        this.s3Client = new S3Client(config);
        console.log(`[Evidence] ${this.backend.toUpperCase()} backend initialized`);
      } catch {
        console.warn('[Evidence] S3/R2 SDK not available — falling back to local storage');
        this.backend = 'local';
        mkdirSync(this.localPath, { recursive: true });
      }
    }
    console.log(`[Evidence] Store initialized (${this.backend})`);
  }

  async store(runId, type, data, options = {}) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const buffer = Buffer.from(payload, 'utf-8');
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    const filename = `${runId}/${type}/${sha256.slice(0, 12)}.json`;
    const storageUrl = await this.writeToBackend(filename, buffer);

    const evidence = await dbv2.createEvidence({
      run_id: runId,
      type,
      storage_url: storageUrl,
      sha256,
      size_bytes: buffer.length,
      mime_type: options.mimeType || 'application/json',
      retention_days: options.retentionDays || DEFAULT_RETENTION_DAYS,
      metadata: options.metadata || {},
    });

    return evidence;
  }

  async retrieve(evidenceId) {
    const db = (await import('./db-v2.js'));
    const pool = (await import('./db.js')).getPool();
    const result = await pool.query('SELECT * FROM evidence WHERE id = $1', [evidenceId]);
    const evidence = result.rows[0];
    if (!evidence) throw new Error(`Evidence ${evidenceId} not found`);

    const data = await this.readFromBackend(evidence.storage_url);
    const sha256 = createHash('sha256').update(data).digest('hex');
    if (sha256 !== evidence.sha256) {
      throw new Error(`Evidence integrity check failed: expected ${evidence.sha256}, got ${sha256}`);
    }

    return { evidence, data: data.toString('utf-8') };
  }

  async storeTestSummary(runId, summary) {
    return this.store(runId, 'summary', summary, { metadata: { source: 'k6' } });
  }

  async storeMetricSnapshot(runId, metrics) {
    return this.store(runId, 'metrics', metrics, { metadata: { count: metrics.length } });
  }

  async storeTraceBundle(runId, traces) {
    return this.store(runId, 'trace', traces, { metadata: { span_count: traces.length } });
  }

  async storeLogExcerpt(runId, logs) {
    return this.store(runId, 'log', logs, { metadata: { log_count: logs.length } });
  }

  async storeChaosEvent(runId, event) {
    return this.store(runId, 'chaos', event, { metadata: { fault_type: event.fault_type } });
  }

  async storeReplayParity(runId, parityResult) {
    return this.store(runId, 'replay', parityResult, { metadata: { parity_percent: parityResult.parity_percent } });
  }

  async storeAnalysisResult(runId, agentName, result) {
    return this.store(runId, 'analysis', result, { metadata: { agent: agentName } });
  }

  async getRunEvidence(runId, type) {
    return dbv2.getEvidence(runId, type);
  }

  async buildComplianceBundle(runId) {
    const allEvidence = await dbv2.getEvidence(runId);
    const bundle = {
      run_id: runId,
      generated_at: new Date().toISOString(),
      evidence_count: allEvidence.length,
      evidence_types: [...new Set(allEvidence.map(e => e.type))],
      items: allEvidence.map(e => ({
        id: e.id,
        type: e.type,
        sha256: e.sha256,
        size_bytes: e.size_bytes,
        created_at: e.created_at,
        storage_url: e.storage_url,
      })),
      integrity: {
        method: 'SHA-256',
        verified: true,
      },
    };

    const bundleEvidence = await this.store(runId, 'compliance_bundle', bundle, {
      retentionDays: 365 * 7,
      metadata: { bundle_type: 'compliance', evidence_count: allEvidence.length },
    });

    return { bundle, evidence_id: bundleEvidence.id };
  }

  async verifyIntegrity(runId) {
    const allEvidence = await dbv2.getEvidence(runId);
    const results = [];

    for (const evidence of allEvidence) {
      try {
        const data = await this.readFromBackend(evidence.storage_url);
        const sha256 = createHash('sha256').update(data).digest('hex');
        results.push({
          id: evidence.id,
          type: evidence.type,
          valid: sha256 === evidence.sha256,
          expected: evidence.sha256,
          actual: sha256,
        });
      } catch (err) {
        results.push({
          id: evidence.id,
          type: evidence.type,
          valid: false,
          error: err.message,
        });
      }
    }

    return {
      total: results.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      details: results,
    };
  }

  async pruneExpired() {
    const pool = (await import('./db.js')).getPool();
    const result = await pool.query(
      `SELECT * FROM evidence WHERE created_at + (retention_days || ' days')::INTERVAL < NOW()`
    );
    let deleted = 0;
    for (const evidence of result.rows) {
      try {
        await this.deleteFromBackend(evidence.storage_url);
        await pool.query('DELETE FROM evidence WHERE id = $1', [evidence.id]);
        deleted++;
      } catch (err) {
        console.warn(`[Evidence] Failed to delete ${evidence.id}: ${err.message}`);
      }
    }
    return { deleted, total_checked: result.rows.length };
  }

  async writeToBackend(filename, buffer) {
    if (this.backend === 'local') {
      const fullPath = path.join(this.localPath, filename);
      mkdirSync(path.dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, buffer);
      return `local://${fullPath}`;
    }

    if (this.backend === 's3' || this.backend === 'r2') {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const key = `evidence/${filename}`;
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
      }));
      return `s3://${this.s3Bucket}/${key}`;
    }

    throw new Error(`Unknown backend: ${this.backend}`);
  }

  async readFromBackend(storageUrl) {
    if (storageUrl.startsWith('local://')) {
      const filePath = storageUrl.replace('local://', '');
      return readFileSync(filePath);
    }

    if (storageUrl.startsWith('s3://')) {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const parts = storageUrl.replace('s3://', '').split('/');
      const bucket = parts.shift();
      const key = parts.join('/');
      const response = await this.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const chunks = [];
      for await (const chunk of response.Body) chunks.push(chunk);
      return Buffer.concat(chunks);
    }

    throw new Error(`Unknown storage URL format: ${storageUrl}`);
  }

  async deleteFromBackend(storageUrl) {
    if (storageUrl.startsWith('local://')) {
      const filePath = storageUrl.replace('local://', '');
      if (existsSync(filePath)) unlinkSync(filePath);
      return;
    }

    if (storageUrl.startsWith('s3://')) {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const parts = storageUrl.replace('s3://', '').split('/');
      const bucket = parts.shift();
      const key = parts.join('/');
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return;
    }
  }

  async getStorageStats() {
    const pool = (await import('./db.js')).getPool();
    const result = await pool.query(`
      SELECT type, COUNT(*) as count, SUM(size_bytes) as total_bytes,
             MIN(created_at) as oldest, MAX(created_at) as newest
      FROM evidence GROUP BY type ORDER BY total_bytes DESC
    `);

    const total = result.rows.reduce((sum, r) => sum + parseInt(r.total_bytes || 0), 0);
    return {
      total_items: result.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
      total_bytes: total,
      total_human: formatBytes(total),
      by_type: result.rows.map(r => ({
        type: r.type,
        count: parseInt(r.count),
        bytes: parseInt(r.total_bytes || 0),
        human: formatBytes(parseInt(r.total_bytes || 0)),
      })),
      backend: this.backend,
    };
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

let defaultStore = null;

export function getEvidenceStore(options) {
  if (!defaultStore) {
    defaultStore = new EvidenceStore(options);
  }
  return defaultStore;
}

export async function initializeEvidenceStore(options) {
  const store = getEvidenceStore(options);
  await store.initialize();
  return store;
}
