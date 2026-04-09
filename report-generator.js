import * as db from './db.js';
import { generateAiReport } from './ai-analyzer.js';

const REPORT_TYPES = {
  executive_summary: { title: 'Executive Summary', audience: 'C-suite, stakeholders' },
  technical_report: { title: 'Technical Deep-Dive', audience: 'Engineering leads' },
  remediation_plan: { title: 'Remediation Plan', audience: 'Development teams' },
  sla_compliance: { title: 'SLA Compliance Report', audience: 'Operations, contracts' },
  capacity_planning: { title: 'Capacity Planning Report', audience: 'Infrastructure, finance' },
  comparison: { title: 'Comparison Report', audience: 'Performance engineers' },
  trend_analysis: { title: 'Trend Analysis Report', audience: 'Engineering management' },
};

export async function generateReport(runId, reportType) {
  const config = REPORT_TYPES[reportType];
  if (!config) throw new Error(`Unknown report type: ${reportType}`);

  const run = await db.getRunById(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  let content;
  let isAiGenerated = false;

  try {
    content = await generateAiReport(runId, reportType);
    isAiGenerated = !!process.env.ANTHROPIC_API_KEY;
  } catch (err) {
    console.warn(`[Reports] AI generation failed, using template: ${err.message}`);
    content = await buildTemplateReport(run, reportType);
  }

  const report = await db.createReport({
    run_id: runId,
    report_type: reportType,
    title: `${config.title} — ${run.test_name || 'Load Test'}`,
    content,
    executive_summary: {
      test_name: run.test_name,
      test_type: run.test_type,
      score: run.performance_score,
      grade: run.performance_grade,
      date: run.created_at,
    },
    format: 'markdown',
    ai_generated: isAiGenerated,
  });

  return report;
}

async function buildTemplateReport(run, reportType) {
  const summary = run.k6_summary || {};
  const analyses = await db.getAnalyses(run.id);
  const pass1 = analyses.find(a => a.pass_number === 1)?.content;
  const pass3 = analyses.find(a => a.pass_number === 3)?.content;
  const endpoints = await db.getEndpointMetrics(run.id);

  const date = new Date(run.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const header = `# ${REPORT_TYPES[reportType].title}

**Test:** ${run.test_name || 'Load Test'}
**Type:** ${(run.test_type || 'load').toUpperCase()} Test
**Date:** ${date}
**Performance Score:** ${run.performance_score ?? 'N/A'}/100 (Grade: ${run.performance_grade || 'N/A'})
**Duration:** ${run.duration_ms ? (run.duration_ms / 1000).toFixed(1) + 's' : 'N/A'}

---
`;

  switch (reportType) {
    case 'executive_summary':
      return header + buildExecutiveSummary(summary, pass1, pass3);
    case 'technical_report':
      return header + buildTechnicalReport(summary, pass1, endpoints);
    case 'remediation_plan':
      return header + buildRemediationPlan(pass1, pass3);
    case 'sla_compliance':
      return header + await buildSlaReport(run.id);
    case 'capacity_planning':
      return header + buildCapacityReport(summary, pass1, pass3);
    default:
      return header + buildTechnicalReport(summary, pass1, endpoints);
  }
}

function buildExecutiveSummary(summary, pass1, pass3) {
  return `## Overview

${pass3?.executive_summary || 'Load testing has been completed. The results are summarized below.'}

## Key Performance Indicators

| Metric | Value | Assessment |
|--------|-------|-----------|
| Response Time (avg) | ${fmt(summary.http_req_duration_avg, 'ms')} | ${assess(summary.http_req_duration_avg, 500, 1000)} |
| Response Time (P95) | ${fmt(summary.http_req_duration_p95, 'ms')} | ${assess(summary.http_req_duration_p95, 500, 2000)} |
| Error Rate | ${summary.http_req_failed_rate ? (summary.http_req_failed_rate * 100).toFixed(2) + '%' : 'N/A'} | ${assess(summary.http_req_failed_rate, 0.01, 0.05)} |
| Peak Virtual Users | ${summary.vus_max || 'N/A'} | — |
| Total Requests | ${summary.http_reqs?.toLocaleString() || 'N/A'} | — |

## Risk Assessment

**Risk Level:** ${pass3?.risk_level || (pass1?.overall_score >= 70 ? 'Low' : 'Moderate')}
**Production Readiness:** ${pass3?.production_readiness || 'Requires review'}
**Recommendation:** ${pass3?.go_nogo_recommendation || 'CONDITIONAL-GO'}

## Top Findings

${(pass1?.bottlenecks || []).slice(0, 5).map((b, i) =>
    `${i + 1}. **${b.component}** (${b.severity}) — ${b.description}`
  ).join('\n') || 'No critical findings.'}

## Next Steps

${(pass3?.remediation_roadmap?.immediate || ['Review detailed technical report', 'Establish performance baselines']).map(a => `- ${a}`).join('\n')}
`;
}

function buildTechnicalReport(summary, pass1, endpoints) {
  const endpointTable = endpoints.slice(0, 20).map(ep =>
    `| ${ep.method} | ${ep.endpoint.substring(0, 60)} | ${fmt(ep.avg_duration, 'ms')} | ${fmt(ep.p95_duration, 'ms')} | ${ep.request_count} | ${(ep.error_rate * 100).toFixed(2)}% |`
  ).join('\n');

  return `## Response Time Analysis

| Percentile | Value |
|-----------|-------|
| P50 (Median) | ${fmt(summary.http_req_duration_med, 'ms')} |
| P90 | ${fmt(summary.http_req_duration_p90, 'ms')} |
| P95 | ${fmt(summary.http_req_duration_p95, 'ms')} |
| P99 | ${fmt(summary.http_req_duration_p99, 'ms')} |
| Average | ${fmt(summary.http_req_duration_avg, 'ms')} |
| Maximum | ${fmt(summary.http_req_duration_max, 'ms')} |

## HTTP Timing Breakdown

| Phase | Average |
|-------|---------|
| Blocked | ${fmt(summary.http_req_blocked_avg, 'ms')} |
| Connecting | ${fmt(summary.http_req_connecting_avg, 'ms')} |
| TLS Handshake | ${fmt(summary.http_req_tls_handshaking_avg, 'ms')} |
| Sending | ${fmt(summary.http_req_sending_avg, 'ms')} |
| Waiting (TTFB) | ${fmt(summary.http_req_waiting_avg, 'ms')} |
| Receiving | ${fmt(summary.http_req_receiving_avg, 'ms')} |

## Endpoint Performance

| Method | Endpoint | Avg | P95 | Requests | Error Rate |
|--------|----------|-----|-----|----------|-----------|
${endpointTable || '| — | No endpoint data | — | — | — | — |'}

## Bottleneck Analysis

${(pass1?.bottlenecks || []).map((b, i) => `### ${i + 1}. ${b.component}
- **Severity:** ${b.severity}
- **Evidence:** ${b.evidence}
- **Impact:** ${b.impact}
- **Saturation Point:** ${b.saturation_point || 'Unknown'}
`).join('\n') || 'No bottlenecks identified.'}

## Throughput Analysis

${pass1?.throughput_analysis ? `
- **Peak RPS:** ${pass1.throughput_analysis.peak_rps}
- **Sustainable RPS:** ${pass1.throughput_analysis.sustainable_rps}
- **Scaling Behavior:** ${pass1.throughput_analysis.scaling_behavior}
- **Limiting Factor:** ${pass1.throughput_analysis.limiting_factor}
` : 'Throughput analysis requires AI analysis.'}
`;
}

function buildRemediationPlan(pass1, pass3) {
  const roadmap = pass3?.remediation_roadmap || {};
  return `## Priority Remediation Items

### Immediate (0-1 weeks)
${(roadmap.immediate || pass1?.quick_wins || ['No immediate actions identified']).map(a => `- [ ] ${a}`).join('\n')}

### Short Term (1-4 weeks)
${(roadmap.short_term || ['Establish performance baselines', 'Configure SLA definitions']).map(a => `- [ ] ${a}`).join('\n')}

### Medium Term (1-3 months)
${(roadmap.medium_term || ['Implement continuous load testing in CI/CD']).map(a => `- [ ] ${a}`).join('\n')}

### Architectural (3+ months)
${(roadmap.architectural || ['Plan capacity for projected growth']).map(a => `- [ ] ${a}`).join('\n')}

## Effort Estimates

${(pass3?.key_findings || []).map(f =>
    `| ${f.finding} | ${f.urgency} | ${f.effort_estimate} |`
  ).join('\n') ? `| Finding | Urgency | Effort |
|---------|---------|--------|
${(pass3?.key_findings || []).map(f => `| ${f.finding} | ${f.urgency} | ${f.effort_estimate} |`).join('\n')}` : 'Detailed effort estimates require AI analysis.'}

## Cost-Benefit Analysis

**Cost of Inaction:** ${pass3?.cost_of_inaction || 'Unquantified without AI analysis'}
**Estimated Optimization Cost:** ${pass3?.estimated_optimization_cost || 'Requires assessment'}
`;
}

async function buildSlaReport(runId) {
  const results = await db.getSlaResults(runId);
  if (results.length === 0) return '## SLA Compliance\n\nNo SLA definitions configured for this project.\n';

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  return `## SLA Compliance Summary

**Overall Status:** ${passed === total ? 'COMPLIANT' : 'BREACHED'}
**Pass Rate:** ${passed}/${total} (${((passed / total) * 100).toFixed(0)}%)

## Individual SLA Results

| SLA | Metric | Threshold | Actual | Margin | Status |
|-----|--------|-----------|--------|--------|--------|
${results.map(r =>
    `| ${r.name} | ${r.metric} ${r.operator} ${r.threshold_value}${r.unit || ''} | ${r.threshold_value}${r.unit || ''} | ${r.actual_value.toFixed(2)}${r.unit || ''} | ${r.margin_percent?.toFixed(1) || '—'}% | ${r.passed ? 'PASS' : 'FAIL'} |`
  ).join('\n')}
`;
}

function buildCapacityReport(summary, pass1, pass3) {
  return `## Current Capacity

${pass3?.capacity_forecast ? `
- **Current Load Tested:** ${pass3.capacity_forecast.current_load_description}
- **Time to Capacity:** ${pass3.capacity_forecast.time_to_capacity}
` : `
- **Peak VUs:** ${summary.vus_max || 'N/A'}
- **Total Requests:** ${summary.http_reqs?.toLocaleString() || 'N/A'}
`}

## Scaling Recommendations

${pass1?.throughput_analysis ? `
The system demonstrates **${pass1.throughput_analysis.scaling_behavior}** scaling behavior.
The primary limiting factor is: **${pass1.throughput_analysis.limiting_factor}**.

- Sustainable throughput: **${pass1.throughput_analysis.sustainable_rps} RPS**
- Peak throughput achieved: **${pass1.throughput_analysis.peak_rps} RPS**
` : 'Requires AI analysis for detailed scaling recommendations.'}

## Recommended Actions

${(pass3?.capacity_forecast?.recommended_actions || ['Run breakpoint tests to determine exact capacity ceiling', 'Establish baseline metrics for trend analysis', 'Configure infrastructure monitoring for resource correlation']).map(a => `1. ${a}`).join('\n')}
`;
}

function fmt(val, unit) {
  if (val === null || val === undefined) return 'N/A';
  return `${parseFloat(val).toFixed(1)}${unit}`;
}

function assess(val, good, bad) {
  if (val === null || val === undefined) return '—';
  if (val <= good) return 'Good';
  if (val <= bad) return 'Acceptable';
  return 'Needs Improvement';
}

export { REPORT_TYPES };
