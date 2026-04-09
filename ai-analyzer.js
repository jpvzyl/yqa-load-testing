import Anthropic from '@anthropic-ai/sdk';
import * as db from './db.js';

const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
};

const SONNET = 'claude-sonnet-4-20250514';
const OPUS = 'claude-sonnet-4-20250514'; // fallback to sonnet if opus unavailable

export async function runFullAnalysis(runId, options = {}) {
  const run = await db.getRunById(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const metricsSummary = await db.getRunMetricsSummary(runId);
  const endpointMetrics = await db.getEndpointMetrics(runId);
  const infraMetrics = await db.getInfraMetrics(runId);
  const slaResults = await db.getSlaResults(runId);

  const pass1 = await runPass1(runId, run, metricsSummary, endpointMetrics);

  let pass2 = null;
  if (infraMetrics.length > 0) {
    pass2 = await runPass2(runId, pass1, infraMetrics);
  }

  const baseline = run.test_id
    ? await db.getActiveBaseline(run.test_id, run.environment)
    : null;
  const historicalRuns = run.test_id
    ? await db.getTestRuns(run.test_id, 10)
    : [];

  const pass3 = await runPass3(runId, pass1, pass2, baseline, historicalRuns, slaResults);

  return { pass1, pass2, pass3 };
}

async function runPass1(runId, run, metricsSummary, endpointMetrics) {
  const client = getClient();

  const input = {
    test_type: run.test_type,
    protocol: run.protocol,
    duration_ms: run.duration_ms,
    k6_summary: run.k6_summary,
    threshold_results: run.threshold_results,
    performance_score: run.performance_score,
    performance_grade: run.performance_grade,
    metrics_summary: metricsSummary,
    endpoint_metrics: endpointMetrics.slice(0, 20),
  };

  const prompt = `You are a world-class performance engineer analyzing load test results.

TEST CONFIGURATION:
- Test type: ${run.test_type}
- Protocol: ${run.protocol || 'http'}
- Duration: ${run.duration_ms ? Math.round(run.duration_ms / 1000) + 's' : 'unknown'}

K6 SUMMARY:
${JSON.stringify(run.k6_summary, null, 2)}

METRICS SUMMARY (aggregated):
${JSON.stringify(metricsSummary, null, 2)}

ENDPOINT BREAKDOWN (top 20):
${JSON.stringify(endpointMetrics.slice(0, 20), null, 2)}

THRESHOLD RESULTS:
${JSON.stringify(run.threshold_results, null, 2)}

Analyze these results and produce a JSON response with this exact structure:
{
  "performance_grade": "A+/A/B/C/D/F",
  "overall_score": 0-100,
  "executive_headline": "one-line summary of performance",
  "bottlenecks": [
    {
      "component": "which component/endpoint",
      "description": "what is the bottleneck",
      "severity": "critical/high/medium/low",
      "evidence": "specific metric data proving this",
      "saturation_point": "VU count or RPS where degradation began",
      "impact": "business/user impact"
    }
  ],
  "anomalies": [
    {
      "description": "what was unusual",
      "evidence": "metric data",
      "possible_causes": ["cause1", "cause2"]
    }
  ],
  "error_analysis": {
    "dominant_errors": ["error types"],
    "correlation_with_load": "how errors relate to load level",
    "root_cause_hypothesis": "most likely cause"
  },
  "response_time_analysis": {
    "p50_assessment": "description",
    "p95_assessment": "description",
    "p99_assessment": "description",
    "distribution_shape": "normal/bimodal/long-tail/uniform",
    "outlier_analysis": "description"
  },
  "throughput_analysis": {
    "peak_rps": number,
    "sustainable_rps": number,
    "scaling_behavior": "linear/sublinear/degrading/cliff",
    "limiting_factor": "what limits throughput"
  },
  "quick_wins": ["immediately actionable improvement 1", "improvement 2"],
  "deep_investigation_needed": ["areas needing further analysis"]
}

Return ONLY valid JSON, no markdown code fences.`;

  let content;

  if (client) {
    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '{}';
    content = safeParseJson(text);

    await db.saveAnalysis({
      run_id: runId,
      analysis_type: 'metric_analysis',
      pass_number: 1,
      model_used: SONNET,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
      content,
    });
  } else {
    content = buildFallbackPass1(run, metricsSummary, endpointMetrics);
    await db.saveAnalysis({
      run_id: runId,
      analysis_type: 'metric_analysis',
      pass_number: 1,
      model_used: 'fallback',
      content,
    });
  }

  return content;
}

async function runPass2(runId, pass1, infraMetrics) {
  const client = getClient();

  const prompt = `You are correlating load test performance with infrastructure metrics to identify root causes.

PERFORMANCE ANALYSIS (from Pass 1):
${JSON.stringify(pass1, null, 2)}

INFRASTRUCTURE METRICS DURING TEST (sampled):
${JSON.stringify(infraMetrics.slice(0, 100), null, 2)}

For each bottleneck identified, determine which infrastructure resource was the limiting factor.

Produce JSON with this structure:
{
  "resource_bottlenecks": [
    {
      "resource": "CPU/Memory/Disk/Network/DB Connections",
      "host": "hostname",
      "peak_utilization": "percentage or value",
      "saturation_timestamp": "when it saturated",
      "corresponding_vus": "approximate VU count at saturation",
      "application_impact": "how it affected the application",
      "recommendation": "specific fix"
    }
  ],
  "capacity_analysis": {
    "current_ceiling_vus": 0,
    "current_ceiling_rps": 0,
    "headroom_percent": 0,
    "first_resource_to_saturate": "resource name",
    "scaling_path": "vertical/horizontal/both",
    "specific_recommendations": ["recommendation 1"]
  },
  "database_analysis": {
    "connection_pool_health": "assessment",
    "query_performance_trend": "assessment",
    "recommendations": ["recommendation"]
  },
  "network_analysis": {
    "bandwidth_utilization": "assessment",
    "latency_contribution": "assessment"
  }
}

Return ONLY valid JSON.`;

  let content;

  if (client) {
    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    content = safeParseJson(response.content[0]?.text || '{}');

    await db.saveAnalysis({
      run_id: runId,
      analysis_type: 'infra_correlation',
      pass_number: 2,
      model_used: SONNET,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
      content,
    });
  } else {
    content = { resource_bottlenecks: [], capacity_analysis: {}, database_analysis: {}, network_analysis: {} };
    await db.saveAnalysis({
      run_id: runId,
      analysis_type: 'infra_correlation',
      pass_number: 2,
      model_used: 'fallback',
      content,
    });
  }

  return content;
}

async function runPass3(runId, pass1, pass2, baseline, historicalRuns, slaResults) {
  const client = getClient();

  const historicalSummary = historicalRuns
    .filter(r => r.performance_score !== null)
    .map(r => ({
      id: r.id,
      score: r.performance_score,
      grade: r.performance_grade,
      date: r.created_at,
      duration_ms: r.duration_ms,
    }));

  const prompt = `You are producing an executive-grade performance assessment for stakeholders.

METRIC ANALYSIS (Pass 1):
${JSON.stringify(pass1, null, 2)}

${pass2 ? `INFRASTRUCTURE ANALYSIS (Pass 2):\n${JSON.stringify(pass2, null, 2)}` : 'No infrastructure data available.'}

BASELINE: ${baseline ? JSON.stringify(baseline.metrics_summary, null, 2) : 'No baseline established'}

SLA RESULTS: ${JSON.stringify(slaResults, null, 2)}

HISTORICAL RUNS (last 10): ${JSON.stringify(historicalSummary, null, 2)}

Produce a comprehensive executive synthesis in JSON:
{
  "executive_summary": "3-5 paragraph business-impact summary suitable for C-suite",
  "risk_level": "low/moderate/high/critical",
  "production_readiness": "ready/conditional/not-ready",
  "go_nogo_recommendation": "GO/CONDITIONAL-GO/NO-GO",
  "key_findings": [
    {
      "finding": "description",
      "business_impact": "impact in business terms",
      "urgency": "immediate/short-term/medium-term",
      "effort_estimate": "hours/days/weeks"
    }
  ],
  "regression_analysis": {
    "has_regression": false,
    "regressed_metrics": [],
    "statistical_significance": "description",
    "probable_cause": "cause if applicable"
  },
  "sla_compliance": {
    "overall_status": "compliant/at-risk/breached",
    "summary": "description of SLA status"
  },
  "capacity_forecast": {
    "current_load_description": "what load was tested",
    "time_to_capacity": "estimated time until capacity is reached",
    "recommended_actions": ["action 1"]
  },
  "remediation_roadmap": {
    "immediate": ["0-1 week actions"],
    "short_term": ["1-4 week actions"],
    "medium_term": ["1-3 month actions"],
    "architectural": ["3+ month strategic changes"]
  },
  "cost_of_inaction": "business cost description",
  "estimated_optimization_cost": "rough cost estimate"
}

Return ONLY valid JSON.`;

  let content;

  if (client) {
    const response = await client.messages.create({
      model: OPUS,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    content = safeParseJson(response.content[0]?.text || '{}');

    await db.saveAnalysis({
      run_id: runId,
      analysis_type: 'executive_synthesis',
      pass_number: 3,
      model_used: OPUS,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
      content,
    });
  } else {
    content = buildFallbackPass3(pass1, pass2, slaResults);
    await db.saveAnalysis({
      run_id: runId,
      analysis_type: 'executive_synthesis',
      pass_number: 3,
      model_used: 'fallback',
      content,
    });
  }

  return content;
}

export async function generateTestFromSpec(spec, specType) {
  const client = getClient();
  if (!client) throw new Error('ANTHROPIC_API_KEY required for AI test generation');

  const prompt = `You are a k6 load testing expert. Generate a comprehensive k6 load test script from this ${specType} specification.

SPECIFICATION:
${typeof spec === 'string' ? spec : JSON.stringify(spec, null, 2)}

Generate a production-ready k6 script that:
1. Tests all major endpoints/operations
2. Includes realistic think times between requests
3. Handles authentication if applicable
4. Extracts and reuses dynamic values (tokens, IDs)
5. Includes appropriate checks/assertions
6. Has configurable stages for load ramping
7. Defines sensible thresholds

Return ONLY the k6 JavaScript code, no explanations or markdown fences.`;

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0]?.text || '';
}

export async function generateTestFromNaturalLanguage(description) {
  const client = getClient();
  if (!client) throw new Error('ANTHROPIC_API_KEY required for AI test generation');

  const prompt = `You are a k6 load testing expert. Generate a k6 load test script from this description:

"${description}"

Generate a complete, production-ready k6 script. Include:
1. Appropriate imports
2. Realistic options (stages, thresholds)
3. The test function with proper HTTP calls
4. Checks and assertions
5. Think times
6. Custom metrics if useful

Return ONLY the k6 JavaScript code, no explanations or markdown fences.`;

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0]?.text || '';
}

// --- Fallback analysis when no API key ---

function buildFallbackPass1(run, metricsSummary, endpointMetrics) {
  const summary = run.k6_summary || {};
  const duration = summary.http_req_duration_avg || 0;
  const errorRate = summary.http_req_failed_rate || 0;
  const p95 = summary.http_req_duration_p95 || 0;

  let grade = 'A';
  let score = 85;
  if (p95 > 2000 || errorRate > 0.05) { grade = 'D'; score = 40; }
  else if (p95 > 1000 || errorRate > 0.01) { grade = 'C'; score = 60; }
  else if (p95 > 500) { grade = 'B'; score = 75; }

  const bottlenecks = [];
  if (p95 > 1000) {
    bottlenecks.push({
      component: 'HTTP Response Time',
      description: `P95 response time of ${p95.toFixed(0)}ms exceeds acceptable threshold`,
      severity: p95 > 2000 ? 'critical' : 'high',
      evidence: `p95=${p95.toFixed(0)}ms, avg=${duration.toFixed(0)}ms`,
      saturation_point: 'Unknown without time-series analysis',
      impact: 'Users experience slow page loads and potential timeouts',
    });
  }
  if (errorRate > 0.01) {
    bottlenecks.push({
      component: 'Error Rate',
      description: `Error rate of ${(errorRate * 100).toFixed(2)}% exceeds 1% threshold`,
      severity: errorRate > 0.05 ? 'critical' : 'high',
      evidence: `error_rate=${(errorRate * 100).toFixed(2)}%`,
      saturation_point: 'Requires correlation with VU ramp',
      impact: 'Users encounter errors, potential data loss or failed transactions',
    });
  }

  const slowEndpoints = endpointMetrics
    .filter(e => e.p95_duration > 1000)
    .map(e => ({
      component: `${e.method} ${e.endpoint}`,
      description: `Slow endpoint with p95 of ${e.p95_duration?.toFixed(0)}ms`,
      severity: e.p95_duration > 2000 ? 'high' : 'medium',
      evidence: `p95=${e.p95_duration?.toFixed(0)}ms, errors=${e.error_count}`,
      saturation_point: 'N/A',
      impact: 'Contributes to overall latency',
    }));

  return {
    performance_grade: grade,
    overall_score: score,
    executive_headline: `System performance is ${grade === 'A' ? 'excellent' : grade === 'B' ? 'acceptable' : 'below expectations'} under load`,
    bottlenecks: [...bottlenecks, ...slowEndpoints.slice(0, 5)],
    anomalies: [],
    error_analysis: {
      dominant_errors: errorRate > 0 ? ['HTTP errors detected'] : ['No errors'],
      correlation_with_load: 'Requires AI analysis for detailed correlation',
      root_cause_hypothesis: errorRate > 0.01 ? 'Server capacity may be insufficient for tested load' : 'System handling errors appropriately',
    },
    response_time_analysis: {
      p50_assessment: `Median response time: ${(summary.http_req_duration_med || 0).toFixed(0)}ms`,
      p95_assessment: `95th percentile: ${p95.toFixed(0)}ms`,
      p99_assessment: `99th percentile: ${(summary.http_req_duration_p99 || 0).toFixed(0)}ms`,
      distribution_shape: 'Requires detailed analysis',
      outlier_analysis: `Max response time: ${(summary.http_req_duration_max || 0).toFixed(0)}ms`,
    },
    throughput_analysis: {
      peak_rps: summary.http_reqs || 0,
      sustainable_rps: summary.http_reqs || 0,
      scaling_behavior: 'Requires multi-stage analysis',
      limiting_factor: 'Requires AI analysis',
    },
    quick_wins: [
      p95 > 500 ? 'Investigate and optimize slow endpoints' : 'Performance is within acceptable range',
      errorRate > 0.01 ? 'Address error sources to improve reliability' : 'Error handling is solid',
      'Enable response caching where possible',
      'Review database query performance',
    ],
    deep_investigation_needed: [
      'Detailed time-series analysis for saturation point detection',
      'Infrastructure resource correlation',
      'Database query profiling under load',
    ],
  };
}

function buildFallbackPass3(pass1, pass2, slaResults) {
  const slasPassed = slaResults.filter(s => s.passed).length;
  const slasTotal = slaResults.length;

  return {
    executive_summary: `Load testing has been completed. The system achieved a performance grade of ${pass1?.performance_grade || 'N/A'} with an overall score of ${pass1?.overall_score || 'N/A'}/100. ${pass1?.bottlenecks?.length || 0} bottleneck(s) were identified. ${slasTotal > 0 ? `${slasPassed}/${slasTotal} SLAs passed.` : 'No SLAs defined.'} Enable ANTHROPIC_API_KEY for detailed AI-powered analysis.`,
    risk_level: pass1?.overall_score >= 80 ? 'low' : pass1?.overall_score >= 60 ? 'moderate' : 'high',
    production_readiness: pass1?.overall_score >= 70 ? 'conditional' : 'not-ready',
    go_nogo_recommendation: pass1?.overall_score >= 80 ? 'GO' : pass1?.overall_score >= 60 ? 'CONDITIONAL-GO' : 'NO-GO',
    key_findings: (pass1?.bottlenecks || []).map(b => ({
      finding: b.description,
      business_impact: b.impact,
      urgency: b.severity === 'critical' ? 'immediate' : 'short-term',
      effort_estimate: 'Requires detailed assessment',
    })),
    regression_analysis: { has_regression: false, regressed_metrics: [], statistical_significance: 'N/A', probable_cause: 'N/A' },
    sla_compliance: {
      overall_status: slasTotal === 0 ? 'no-slas-defined' : slasPassed === slasTotal ? 'compliant' : 'breached',
      summary: slasTotal > 0 ? `${slasPassed}/${slasTotal} SLAs passing` : 'No SLAs configured',
    },
    capacity_forecast: {
      current_load_description: 'As tested',
      time_to_capacity: 'Requires AI analysis for projection',
      recommended_actions: ['Configure ANTHROPIC_API_KEY for detailed capacity forecasting'],
    },
    remediation_roadmap: {
      immediate: pass1?.quick_wins || [],
      short_term: ['Establish performance baselines', 'Configure SLA definitions'],
      medium_term: ['Implement continuous load testing in CI/CD'],
      architectural: ['Plan capacity for projected growth'],
    },
    cost_of_inaction: 'Undetected performance issues may impact user experience and revenue',
    estimated_optimization_cost: 'Requires detailed assessment',
  };
}

function safeParseJson(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (_e) {
    return { raw_text: text, parse_error: true };
  }
}

export async function generateAiReport(runId, reportType) {
  const client = getClient();
  const analyses = await db.getAnalyses(runId);
  const run = await db.getRunById(runId);

  if (!analyses.length && !run) {
    throw new Error('No analysis data available for report generation');
  }

  const pass1 = analyses.find(a => a.pass_number === 1)?.content;
  const pass2 = analyses.find(a => a.pass_number === 2)?.content;
  const pass3 = analyses.find(a => a.pass_number === 3)?.content;

  if (!client) {
    return buildFallbackReport(run, pass1, pass3, reportType);
  }

  const prompt = `Generate a professional ${reportType} report in Markdown format for this load test.

TEST: ${run.test_name || 'Load Test'} (${run.test_type})
DATE: ${new Date(run.created_at).toISOString()}

AI ANALYSIS:
${JSON.stringify({ pass1, pass2, pass3 }, null, 2)}

Generate a complete, well-structured Markdown report appropriate for the "${reportType}" type.
For executive_summary: focus on business impact and recommendations.
For technical_report: include detailed metrics, charts descriptions, and technical analysis.
For remediation_plan: prioritized action items with effort estimates.
For sla_compliance: SLA-by-SLA analysis with trends.
For capacity_planning: growth projections and scaling recommendations.

Return ONLY the Markdown content.`;

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0]?.text || '';
}

function buildFallbackReport(run, pass1, pass3, reportType) {
  const summary = run?.k6_summary || {};
  const title = `${reportType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} — ${run?.test_name || 'Load Test'}`;

  return `# ${title}

**Date:** ${new Date(run?.created_at || Date.now()).toLocaleDateString()}
**Test Type:** ${run?.test_type || 'load'}
**Status:** ${run?.status || 'complete'}
**Performance Score:** ${run?.performance_score || 'N/A'}/100 (${run?.performance_grade || 'N/A'})

## Executive Summary

${pass3?.executive_summary || 'Analysis pending. Configure ANTHROPIC_API_KEY for AI-powered reporting.'}

## Key Metrics

| Metric | Value |
|--------|-------|
| Total Requests | ${summary.http_reqs || 'N/A'} |
| Avg Response Time | ${summary.http_req_duration_avg ? summary.http_req_duration_avg.toFixed(0) + 'ms' : 'N/A'} |
| P95 Response Time | ${summary.http_req_duration_p95 ? summary.http_req_duration_p95.toFixed(0) + 'ms' : 'N/A'} |
| P99 Response Time | ${summary.http_req_duration_p99 ? summary.http_req_duration_p99.toFixed(0) + 'ms' : 'N/A'} |
| Error Rate | ${summary.http_req_failed_rate ? (summary.http_req_failed_rate * 100).toFixed(2) + '%' : 'N/A'} |
| Max VUs | ${summary.vus_max || 'N/A'} |

## Findings

${(pass1?.bottlenecks || []).map((b, i) => `### ${i + 1}. ${b.component}\n- **Severity:** ${b.severity}\n- **Description:** ${b.description}\n- **Evidence:** ${b.evidence}\n- **Impact:** ${b.impact}`).join('\n\n') || 'No significant findings.'}

## Recommendations

${pass3?.remediation_roadmap ? Object.entries(pass3.remediation_roadmap).map(([phase, items]) => `### ${phase.charAt(0).toUpperCase() + phase.slice(1)}\n${(items || []).map(i => `- ${i}`).join('\n')}`).join('\n\n') : 'Enable AI analysis for detailed recommendations.'}

---
*Generated by Y-QA Load Testing Platform*
`;
}
