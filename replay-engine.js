import { createHash } from 'crypto';
import * as dbv2 from './db-v2.js';
import { getEvidenceStore } from './evidence-store.js';

export class Anonymizer {
  constructor(rules = []) {
    this.rules = rules;
    this.piiPatterns = [
      { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
      { name: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
      { name: 'phone', regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g },
      { name: 'credit_card', regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
      { name: 'ip_v4', regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
    ];
  }

  anonymize(request, salt = '') {
    const result = JSON.parse(JSON.stringify(request));

    for (const rule of this.rules) {
      this.applyRule(result, rule, salt);
    }

    this.detectAndRedactPII(result, salt);

    return result;
  }

  applyRule(obj, rule, salt) {
    const value = this.getNestedValue(obj, rule.field);
    if (value === undefined) return;

    let replacement;
    switch (rule.action) {
      case 'redact':
        replacement = '[REDACTED]';
        break;
      case 'hash':
        replacement = createHash('sha256').update(String(value) + (rule.salt || salt)).digest('hex').slice(0, 16);
        break;
      case 'replace_token':
        replacement = 'Bearer sarfat-test-token-' + createHash('md5').update(String(value)).digest('hex').slice(0, 8);
        break;
      case 'replace_synthetic':
        replacement = this.generateSynthetic(rule.field, value);
        break;
      case 'replace_with_test_session':
        replacement = 'sarfat-replay-session-' + Date.now();
        break;
      case 'mask':
        replacement = String(value).replace(/./g, (c, i) => i < 4 ? c : '*');
        break;
      default:
        replacement = '[ANONYMIZED]';
    }

    this.setNestedValue(obj, rule.field, replacement);
  }

  detectAndRedactPII(obj, salt) {
    const jsonStr = JSON.stringify(obj);

    for (const pattern of this.piiPatterns) {
      const matches = jsonStr.match(pattern.regex);
      if (matches) {
        for (const match of matches) {
          const hashed = createHash('sha256').update(match + salt).digest('hex').slice(0, 12);
          this.replaceInObject(obj, match, `[${pattern.name.toUpperCase()}_${hashed}]`);
        }
      }
    }
  }

  generateSynthetic(field, original) {
    if (field.includes('card_number')) {
      return this.generateLuhn();
    }
    if (field.includes('email')) {
      return `user-${createHash('md5').update(String(original)).digest('hex').slice(0, 8)}@test.sarfat.io`;
    }
    if (field.includes('phone')) {
      return '555-' + String(Math.floor(Math.random() * 9000000) + 1000000).slice(0, 3) + '-' +
        String(Math.floor(Math.random() * 9000) + 1000);
    }
    return '[SYNTHETIC]';
  }

  generateLuhn() {
    const digits = [];
    for (let i = 0; i < 15; i++) digits.push(Math.floor(Math.random() * 10));
    let sum = 0;
    for (let i = 0; i < 15; i++) {
      let d = digits[14 - i];
      if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    digits.push((10 - (sum % 10)) % 10);
    return digits.join('').replace(/(.{4})/g, '$1-').slice(0, 19);
  }

  getNestedValue(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (part.includes('*')) {
        return undefined;
      }
      if (current === undefined || current === null) return undefined;
      if (part.endsWith('_*')) {
        const prefix = part.slice(0, -2);
        for (const key of Object.keys(current)) {
          if (key.startsWith(prefix)) return current[key];
        }
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) return;
      current = current[parts[i]];
    }
    const lastPart = parts[parts.length - 1];
    if (lastPart.endsWith('_*')) {
      const prefix = lastPart.slice(0, -2);
      for (const key of Object.keys(current)) {
        if (key.startsWith(prefix)) current[key] = value;
      }
    } else {
      current[lastPart] = value;
    }
  }

  replaceInObject(obj, search, replacement) {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.replaceInObject(obj[key], search, replacement);
      }
    }
  }
}

export class CaptureAgent {
  constructor(options = {}) {
    this.method = options.method || 'api_gateway';
    this.isCapturing = false;
    this.captureId = null;
    this.requestBuffer = [];
    this.bufferLimit = options.bufferLimit || 10000;
  }

  async startCapture(projectId, name, environment, options = {}) {
    const capture = await dbv2.createCapturedTraffic({
      project_id: projectId,
      name,
      capture_method: this.method,
      source_environment: environment,
      anonymization_rules: options.anonymizationRules || this.defaultRules(),
      created_by: options.created_by,
    });

    this.captureId = capture.id;
    this.isCapturing = true;
    this.requestBuffer = [];

    console.log(`[Capture] Started: ${name} (${this.method}) — ID: ${capture.id}`);
    return capture;
  }

  async ingestRequest(request) {
    if (!this.isCapturing) return;

    this.requestBuffer.push({
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
      headers: this.sanitizeHeaders(request.headers),
      body: request.body,
      status: request.status,
      response_time_ms: request.response_time_ms,
      response_size: request.response_size,
    });

    if (this.requestBuffer.length >= this.bufferLimit) {
      await this.flushBuffer();
    }
  }

  async stopCapture() {
    this.isCapturing = false;
    await this.flushBuffer();

    if (this.captureId) {
      await dbv2.updateCapturedTraffic(this.captureId, {
        status: 'captured',
        completed_at: new Date(),
        request_count: this.requestBuffer.length,
      });
    }

    console.log(`[Capture] Stopped: ${this.captureId}`);
    return this.captureId;
  }

  async flushBuffer() {
    if (this.requestBuffer.length === 0) return;
    const evidence = getEvidenceStore();
    const batch = this.requestBuffer.splice(0);
    await evidence.store(this.captureId, 'captured_requests', batch, {
      metadata: { batch_size: batch.length, capture_method: this.method },
    });
  }

  sanitizeHeaders(headers) {
    if (!headers) return {};
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];
    for (const h of sensitiveHeaders) {
      if (sanitized[h]) sanitized[h] = '[CAPTURED]';
    }
    return sanitized;
  }

  defaultRules() {
    return [
      { field: 'headers.authorization', action: 'replace_token' },
      { field: 'headers.cookie', action: 'redact' },
      { field: 'body.email', action: 'hash', salt: process.env.ANONYMIZER_SALT || 'sarfat' },
      { field: 'body.password', action: 'redact' },
      { field: 'body.ssn', action: 'redact' },
      { field: 'body.card_number', action: 'replace_synthetic' },
      { field: 'body.cvv', action: 'redact' },
    ];
  }
}

export class ReplayEngine {
  constructor() {
    this.activeReplays = new Map();
  }

  async startReplay(captureId, targetEnvironment, options = {}) {
    const pool = (await import('./db.js')).getPool();
    const captureResult = await pool.query('SELECT * FROM captured_traffic WHERE id = $1', [captureId]);
    const capture = captureResult.rows[0];
    if (!capture) throw new Error(`Capture ${captureId} not found`);

    const session = await dbv2.createReplaySession({
      capture_id: captureId,
      replay_mode: options.mode || 'verbatim',
      speed_multiplier: options.speedMultiplier || 1.0,
      target_environment: targetEnvironment,
      total_requests: capture.request_count,
    });

    this.activeReplays.set(session.id, {
      session,
      capture,
      targetEnvironment,
      mode: options.mode || 'verbatim',
      speed: options.speedMultiplier || 1.0,
      anonymizer: new Anonymizer(capture.anonymization_rules || []),
      status: 'running',
      replayed: 0,
      matched: 0,
      diverged: 0,
      divergences: [],
    });

    console.log(`[Replay] Started session ${session.id} — mode: ${options.mode || 'verbatim'}, speed: ${options.speedMultiplier || 1}x`);
    return session;
  }

  async replayRequest(sessionId, request) {
    const replay = this.activeReplays.get(sessionId);
    if (!replay) return null;

    const anonymized = replay.anonymizer.anonymize(request);

    const targetUrl = `${replay.targetEnvironment}${anonymized.url}`;

    try {
      const startTime = Date.now();
      const response = await fetch(targetUrl, {
        method: anonymized.method,
        headers: { ...anonymized.headers, 'x-sarfat-replay': 'true', 'x-sarfat-session': sessionId },
        body: ['GET', 'HEAD', 'DELETE'].includes(anonymized.method) ? undefined : JSON.stringify(anonymized.body),
      });
      const elapsed = Date.now() - startTime;

      replay.replayed++;

      const parity = this.checkParity(request, {
        status: response.status,
        elapsed_ms: elapsed,
      }, replay.mode);

      if (parity.matches) {
        replay.matched++;
      } else {
        replay.diverged++;
        if (replay.divergences.length < 100) {
          replay.divergences.push({
            url: anonymized.url,
            method: anonymized.method,
            original_status: request.status,
            replay_status: response.status,
            original_time_ms: request.response_time_ms,
            replay_time_ms: elapsed,
            reason: parity.reason,
          });
        }
      }

      return { ...parity, elapsed_ms: elapsed };
    } catch (err) {
      replay.replayed++;
      replay.diverged++;
      return { matches: false, reason: `Fetch error: ${err.message}`, elapsed_ms: 0 };
    }
  }

  checkParity(original, replayed, mode) {
    const reasons = [];

    if (original.status !== replayed.status) {
      const statusGroup = s => Math.floor(s / 100);
      if (statusGroup(original.status) !== statusGroup(replayed.status)) {
        reasons.push(`Status code divergence: ${original.status} → ${replayed.status}`);
      }
    }

    if (mode === 'verbatim' && original.response_time_ms) {
      const ratio = replayed.elapsed_ms / original.response_time_ms;
      if (ratio > 3) {
        reasons.push(`Response time 3x+ slower: ${original.response_time_ms}ms → ${replayed.elapsed_ms}ms`);
      }
    }

    return {
      matches: reasons.length === 0,
      reason: reasons.join('; ') || 'Parity confirmed',
    };
  }

  async completeReplay(sessionId) {
    const replay = this.activeReplays.get(sessionId);
    if (!replay) return null;

    replay.status = 'complete';
    const parityPercent = replay.replayed > 0
      ? (replay.matched / replay.replayed * 100).toFixed(1) : 0;

    await dbv2.updateReplaySession(sessionId, {
      status: 'complete',
      completed_at: new Date(),
      replayed_requests: replay.replayed,
      matched_responses: replay.matched,
      diverged_responses: replay.diverged,
      parity_percent: parseFloat(parityPercent),
      divergence_report: {
        total: replay.diverged,
        top_divergences: replay.divergences.slice(0, 20),
        by_reason: this.groupDivergences(replay.divergences),
      },
    });

    const evidence = getEvidenceStore();
    await evidence.storeReplayParity(replay.capture.id || sessionId, {
      session_id: sessionId,
      parity_percent: parseFloat(parityPercent),
      replayed: replay.replayed,
      matched: replay.matched,
      diverged: replay.diverged,
      divergences: replay.divergences,
    });

    this.activeReplays.delete(sessionId);

    return {
      session_id: sessionId,
      parity_percent: parseFloat(parityPercent),
      replayed: replay.replayed,
      matched: replay.matched,
      diverged: replay.diverged,
      top_divergences: replay.divergences.slice(0, 20),
    };
  }

  groupDivergences(divergences) {
    const groups = {};
    for (const d of divergences) {
      const key = d.reason;
      if (!groups[key]) groups[key] = 0;
      groups[key]++;
    }
    return Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count }));
  }

  getActiveReplays() {
    const result = [];
    for (const [id, replay] of this.activeReplays) {
      result.push({
        session_id: id,
        mode: replay.mode,
        speed: replay.speed,
        replayed: replay.replayed,
        matched: replay.matched,
        diverged: replay.diverged,
        parity_percent: replay.replayed > 0 ? (replay.matched / replay.replayed * 100).toFixed(1) : 0,
      });
    }
    return result;
  }
}

export class ParityValidator {
  validateSchema(original, replayed) {
    const origKeys = Object.keys(original).sort();
    const replayKeys = Object.keys(replayed).sort();

    const missing = origKeys.filter(k => !replayKeys.includes(k));
    const extra = replayKeys.filter(k => !origKeys.includes(k));
    const typeMismatches = [];

    for (const key of origKeys) {
      if (replayed[key] !== undefined && typeof original[key] !== typeof replayed[key]) {
        typeMismatches.push({ field: key, original: typeof original[key], replayed: typeof replayed[key] });
      }
    }

    return {
      matches: missing.length === 0 && typeMismatches.length === 0,
      missing_fields: missing,
      extra_fields: extra,
      type_mismatches: typeMismatches,
    };
  }

  validateCriticalFields(original, replayed, criticalFields) {
    const mismatches = [];
    for (const field of criticalFields) {
      const origVal = this.getField(original, field);
      const replayVal = this.getField(replayed, field);
      if (JSON.stringify(origVal) !== JSON.stringify(replayVal)) {
        mismatches.push({ field, original: origVal, replayed: replayVal });
      }
    }
    return { matches: mismatches.length === 0, mismatches };
  }

  getField(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  generateParityReport(results) {
    const total = results.length;
    const matching = results.filter(r => r.matches).length;
    const parity = total > 0 ? (matching / total * 100).toFixed(1) : 0;

    return {
      total_requests: total,
      matching_requests: matching,
      divergent_requests: total - matching,
      parity_percent: parseFloat(parity),
      top_divergences: results.filter(r => !r.matches)
        .slice(0, 20)
        .map(r => ({
          url: r.url,
          reason: r.reason || 'Schema/field mismatch',
          details: r.details,
        })),
    };
  }
}

export const anonymizer = new Anonymizer();
export const captureAgent = new CaptureAgent();
export const replayEngine = new ReplayEngine();
export const parityValidator = new ParityValidator();
