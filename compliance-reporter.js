import { getPool } from './db.js';
import { getEvidence } from './db-v2.js';
import { getEvidenceStore } from './evidence-store.js';

// ── Compliance Framework Mappings ──

const FRAMEWORK_MAPPINGS = {
  'soc2': {
    name: 'SOC 2 Type II',
    controls: [
      { id: 'CC6.1', title: 'Logical and Physical Access Controls', evidence_types: ['summary', 'audit_log'], description: 'System restricts access to authorized users; performance tests validate access controls under load.' },
      { id: 'CC7.1', title: 'System Monitoring', evidence_types: ['metrics', 'trace', 'log'], description: 'Performance metrics, distributed traces, and logs demonstrate continuous monitoring.' },
      { id: 'CC7.2', title: 'Anomaly Detection', evidence_types: ['analysis', 'slo_evaluation'], description: 'AI-driven analysis detects performance anomalies and SLO violations.' },
      { id: 'CC7.3', title: 'Change Management', evidence_types: ['summary', 'pr_gate'], description: 'Performance gates in CI/CD validate that changes do not degrade system performance.' },
      { id: 'CC8.1', title: 'Capacity Planning', evidence_types: ['cost_estimate', 'analysis'], description: 'Load test results inform capacity projections and scaling decisions.' },
      { id: 'A1.1', title: 'Availability Commitment', evidence_types: ['slo_evaluation', 'chaos'], description: 'SLO burn-rate tracking and chaos experiments validate availability commitments.' },
      { id: 'A1.2', title: 'Recovery & Continuity', evidence_types: ['chaos', 'replay'], description: 'Chaos engineering and traffic replay validate disaster recovery capabilities.' },
    ],
  },
  'iso27001': {
    name: 'ISO 27001:2022',
    controls: [
      { id: 'A.8.6', title: 'Capacity Management', evidence_types: ['summary', 'metrics', 'cost_estimate'], description: 'Load testing validates capacity requirements and scaling behavior.' },
      { id: 'A.8.16', title: 'Monitoring Activities', evidence_types: ['metrics', 'trace', 'log', 'analysis'], description: 'Continuous performance monitoring and AI-powered analysis.' },
      { id: 'A.8.25', title: 'Secure Development Lifecycle', evidence_types: ['pr_gate', 'summary'], description: 'Performance budgets enforced as part of the SDLC via PR gates.' },
      { id: 'A.8.29', title: 'Security Testing', evidence_types: ['chaos', 'replay'], description: 'Chaos experiments and traffic replay validate resilience under adversarial conditions.' },
      { id: 'A.5.23', title: 'Cloud Services', evidence_types: ['cost_estimate', 'metrics'], description: 'Cloud infrastructure cost modeling and performance benchmarks.' },
      { id: 'A.8.9', title: 'Configuration Management', evidence_types: ['summary', 'analysis'], description: 'Load test configurations are versioned and auditable.' },
    ],
  },
  'pci-dss': {
    name: 'PCI DSS v4.0',
    controls: [
      { id: '6.3.2', title: 'Security Testing', evidence_types: ['summary', 'chaos'], description: 'Performance and chaos tests validate system stability under stress.' },
      { id: '10.2', title: 'Audit Trail', evidence_types: ['audit_log', 'log'], description: 'Complete audit logs of all load testing activity and results.' },
      { id: '10.4.1', title: 'Audit Log Review', evidence_types: ['audit_log', 'analysis'], description: 'AI-driven analysis of test results with full audit trail.' },
      { id: '11.3', title: 'Penetration Testing', evidence_types: ['chaos', 'summary'], description: 'Chaos engineering exercises complement penetration testing.' },
      { id: '12.10', title: 'Incident Response', evidence_types: ['chaos', 'slo_evaluation'], description: 'Chaos experiments validate incident detection and SLO alerting.' },
    ],
  },
  'hipaa': {
    name: 'HIPAA Security Rule',
    controls: [
      { id: '164.312(b)', title: 'Audit Controls', evidence_types: ['audit_log', 'log'], description: 'Mechanisms to record and examine access and activity.' },
      { id: '164.312(c)(1)', title: 'Integrity Controls', evidence_types: ['compliance_bundle'], description: 'Evidence bundles with SHA-256 hashes verify data integrity.' },
      { id: '164.308(a)(7)', title: 'Contingency Plan', evidence_types: ['chaos', 'replay'], description: 'Chaos experiments and replay testing validate contingency procedures.' },
      { id: '164.308(a)(8)', title: 'Evaluation', evidence_types: ['summary', 'slo_evaluation', 'analysis'], description: 'Periodic performance evaluation through load testing and SLO tracking.' },
      { id: '164.312(e)(1)', title: 'Transmission Security', evidence_types: ['metrics', 'trace'], description: 'Performance validation of encrypted transmission pathways under load.' },
    ],
  },
};

// ── Report Generation ──

export async function generateComplianceReport(runId, framework) {
  const frameworkKey = framework.toLowerCase().replace(/\s+/g, '-');
  const mapping = FRAMEWORK_MAPPINGS[frameworkKey];
  if (!mapping) {
    const valid = Object.keys(FRAMEWORK_MAPPINGS).join(', ');
    throw new Error(`Unknown compliance framework "${framework}". Supported: ${valid}`);
  }

  const [evidence, run] = await Promise.all([
    getEvidence(runId),
    getRunInfo(runId),
  ]);

  const evidenceByType = {};
  for (const e of evidence) {
    if (!evidenceByType[e.type]) evidenceByType[e.type] = [];
    evidenceByType[e.type].push(e);
  }

  const controlResults = mapping.controls.map(control => {
    const linkedEvidence = control.evidence_types.flatMap(t => evidenceByType[t] || []);
    const covered = linkedEvidence.length > 0;
    return {
      control_id: control.id,
      title: control.title,
      description: control.description,
      status: covered ? 'covered' : 'gap',
      evidence_count: linkedEvidence.length,
      evidence_ids: linkedEvidence.map(e => e.id),
      evidence_types: [...new Set(linkedEvidence.map(e => e.type))],
    };
  });

  const covered = controlResults.filter(c => c.status === 'covered').length;
  const total = controlResults.length;

  const report = {
    framework: mapping.name,
    framework_key: frameworkKey,
    run_id: runId,
    test_name: run?.test_name || run?.name || 'Unknown',
    generated_at: new Date().toISOString(),
    summary: {
      total_controls: total,
      covered_controls: covered,
      gap_controls: total - covered,
      coverage_percent: total > 0 ? Math.round((covered / total) * 100) : 0,
    },
    controls: controlResults,
    evidence_summary: {
      total_evidence: evidence.length,
      types: Object.entries(evidenceByType).map(([type, items]) => ({
        type,
        count: items.length,
        total_bytes: items.reduce((s, e) => s + (e.size_bytes || 0), 0),
      })),
    },
    markdown: generateReportMarkdown(mapping, controlResults, run, evidence),
  };

  const store = getEvidenceStore();
  await store.store(runId, 'compliance_report', report, {
    retentionDays: 365 * 7,
    metadata: { framework: frameworkKey, coverage_percent: report.summary.coverage_percent },
  });

  return report;
}

// ── Evidence Bundle Export ──

export async function exportEvidenceBundle(runId) {
  const store = getEvidenceStore();

  const integrityResult = await store.verifyIntegrity(runId);
  const evidence = await getEvidence(runId);
  const run = await getRunInfo(runId);

  const manifest = {
    bundle_version: '1.0',
    run_id: runId,
    test_name: run?.test_name || run?.name || 'Unknown',
    exported_at: new Date().toISOString(),
    integrity: {
      method: 'SHA-256',
      total_items: integrityResult.total,
      valid_items: integrityResult.valid,
      invalid_items: integrityResult.invalid,
      all_valid: integrityResult.invalid === 0,
    },
    items: evidence.map(e => ({
      id: e.id,
      type: e.type,
      sha256: e.sha256,
      size_bytes: e.size_bytes,
      mime_type: e.mime_type,
      storage_url: e.storage_url,
      created_at: e.created_at,
      metadata: e.metadata,
    })),
    chain_of_custody: await buildChainOfCustody(runId),
  };

  const bundleEvidence = await store.store(runId, 'evidence_bundle', manifest, {
    retentionDays: 365 * 7,
    metadata: {
      bundle_type: 'export',
      evidence_count: evidence.length,
      integrity_valid: integrityResult.invalid === 0,
    },
  });

  return { manifest, evidence_id: bundleEvidence.id };
}

// ── Markdown Report Generator ──

function generateReportMarkdown(mapping, controlResults, run, evidence) {
  const now = new Date().toISOString();
  const covered = controlResults.filter(c => c.status === 'covered').length;
  const total = controlResults.length;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  let md = `# ${mapping.name} Compliance Report\n\n`;
  md += `**Run:** ${run?.id || 'N/A'}  \n`;
  md += `**Test:** ${run?.test_name || run?.name || 'N/A'}  \n`;
  md += `**Generated:** ${now}  \n`;
  md += `**Coverage:** ${covered}/${total} controls (${pct}%)  \n\n`;

  md += `---\n\n## Executive Summary\n\n`;
  md += `This report maps load testing evidence to ${mapping.name} controls. `;
  md += `${covered} of ${total} applicable controls have supporting evidence from test run \`${run?.id || 'N/A'}\`. `;
  if (total - covered > 0) {
    md += `${total - covered} control(s) require additional evidence.\n\n`;
  } else {
    md += `All controls have associated evidence.\n\n`;
  }

  md += `## Control Mapping\n\n`;

  for (const cr of controlResults) {
    const icon = cr.status === 'covered' ? 'PASS' : 'GAP';
    md += `### [${icon}] ${cr.control_id} — ${cr.title}\n\n`;
    md += `${cr.description}\n\n`;
    if (cr.evidence_count > 0) {
      md += `**Evidence (${cr.evidence_count} items):** ${cr.evidence_types.join(', ')}  \n`;
      md += `Evidence IDs: ${cr.evidence_ids.map(id => `\`${id}\``).join(', ')}\n\n`;
    } else {
      md += `**Status:** No evidence linked. Manual review required.\n\n`;
    }
  }

  md += `---\n\n## Evidence Inventory\n\n`;
  md += `| Type | Count | Size |\n|------|-------|------|\n`;

  const byType = {};
  for (const e of evidence) {
    if (!byType[e.type]) byType[e.type] = { count: 0, bytes: 0 };
    byType[e.type].count++;
    byType[e.type].bytes += e.size_bytes || 0;
  }
  for (const [type, stats] of Object.entries(byType)) {
    md += `| ${type} | ${stats.count} | ${formatBytes(stats.bytes)} |\n`;
  }

  md += `\n---\n\n## Integrity Verification\n\n`;
  md += `All evidence items are stored with SHA-256 content hashes. `;
  md += `Integrity can be verified at any time using the evidence store API.\n\n`;

  md += `---\n\n*Report generated by Sarfat Load Testing Platform*\n`;

  return md;
}

// ── Helpers ──

async function getRunInfo(runId) {
  const db = getPool();
  try {
    const result = await db.query(
      `SELECT tr.*, t.name as test_name
       FROM test_runs tr
       LEFT JOIN tests t ON t.id = tr.test_id
       WHERE tr.id = $1`,
      [runId]
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function buildChainOfCustody(runId) {
  const db = getPool();
  try {
    const result = await db.query(
      `SELECT action, user_id, created_at, details
       FROM audit_log
       WHERE resource_id = $1
       ORDER BY created_at ASC`,
      [runId]
    );
    return result.rows.map(r => ({
      action: r.action,
      user_id: r.user_id,
      timestamp: r.created_at,
      details: r.details,
    }));
  } catch {
    return [];
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ── Multi-Framework Report ──

export async function generateMultiFrameworkReport(runId, frameworks) {
  const results = {};
  for (const fw of frameworks) {
    try {
      results[fw] = await generateComplianceReport(runId, fw);
    } catch (err) {
      results[fw] = { error: err.message };
    }
  }
  return results;
}

export function getSupportedFrameworks() {
  return Object.entries(FRAMEWORK_MAPPINGS).map(([key, mapping]) => ({
    key,
    name: mapping.name,
    control_count: mapping.controls.length,
  }));
}
