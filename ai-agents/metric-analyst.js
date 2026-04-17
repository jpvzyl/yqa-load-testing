/**
 * Agent #4 — Metric Analyst (Sonnet)
 *
 * Takes k6 summary + time-series data, outputs bottlenecks, anomalies,
 * saturation points — each with confidence scores.
 */

import Anthropic from '@anthropic-ai/sdk';
import { metricAnalystSchema, validateAgentOutput, schemaToPromptHint } from './schemas.js';

const SONNET = 'claude-sonnet-4-20250514';
const AGENT_NAME = 'metric-analyst';

const SYSTEM_PROMPT = `You are a world-class performance engineer analyzing load test results for the Sarfat Load Testing Platform.

Your analysis must be data-driven and precise. For every claim, cite the specific metric value that supports it.

Scoring rubric:
- A+ (90-100): p95 < 200ms, error rate < 0.1%, stable throughput
- A  (80-89):  p95 < 500ms, error rate < 0.5%
- B  (70-79):  p95 < 1000ms, error rate < 1%
- C  (60-69):  p95 < 2000ms, error rate < 3%
- D  (40-59):  p95 < 5000ms, error rate < 5%
- F  (0-39):   p95 >= 5000ms or error rate >= 5%

Confidence scores:
- 0.9-1.0: Direct metric evidence, statistically significant
- 0.7-0.8: Strong correlation with supporting data
- 0.5-0.6: Inferred from patterns, moderate certainty
- 0.3-0.4: Hypothesis based on limited data
- 0.1-0.2: Speculation, needs further investigation

Saturation points: Identify the VU count or RPS where response times begin non-linear growth (hockey stick).
Look for the inflection point where latency doubles from baseline.`;

const OUTPUT_INSTRUCTIONS = `Return ONLY valid JSON:
{
  "performance_grade": "A/B/C/D/F",
  "overall_score": 0-100,
  "executive_headline": "one-line summary",
  "bottlenecks": [
    {
      "component": "endpoint or subsystem",
      "description": "what the bottleneck is",
      "severity": "critical|high|medium|low",
      "confidence": 0.0-1.0,
      "evidence": "specific metric data",
      "saturation_point_vus": null,
      "saturation_point_rps": null,
      "impact": "user/business impact"
    }
  ],
  "anomalies": [
    {
      "description": "what was unusual",
      "evidence": "metric data",
      "confidence": 0.0-1.0,
      "possible_causes": ["cause1"]
    }
  ],
  "error_analysis": {
    "dominant_errors": ["error types"],
    "correlation_with_load": "description",
    "root_cause_hypothesis": "hypothesis"
  },
  "response_time_analysis": {
    "p50_assessment": "description",
    "p95_assessment": "description",
    "p99_assessment": "description",
    "distribution_shape": "normal|bimodal|long-tail|uniform",
    "outlier_analysis": "description"
  },
  "throughput_analysis": {
    "peak_rps": 0,
    "sustainable_rps": 0,
    "scaling_behavior": "linear|sublinear|degrading|cliff",
    "limiting_factor": "what limits throughput"
  },
  "quick_wins": ["actionable improvement"],
  "deep_investigation_needed": ["area needing analysis"]
}

Return ONLY valid JSON, no markdown fences.`;

function buildPrompt(input) {
  const parts = [`Analyze the following load test results.\n`];

  if (input.test_type) parts.push(`TEST TYPE: ${input.test_type}`);
  if (input.protocol) parts.push(`PROTOCOL: ${input.protocol}`);
  if (input.duration_ms) parts.push(`DURATION: ${Math.round(input.duration_ms / 1000)}s`);

  if (input.k6_summary) {
    parts.push(`\nK6 SUMMARY:\n${JSON.stringify(input.k6_summary, null, 2)}`);
  }
  if (input.metrics_summary) {
    parts.push(`\nAGGREGATED METRICS:\n${JSON.stringify(input.metrics_summary, null, 2)}`);
  }
  if (input.endpoint_metrics) {
    parts.push(`\nENDPOINT BREAKDOWN (top 20):\n${JSON.stringify(input.endpoint_metrics.slice(0, 20), null, 2)}`);
  }
  if (input.time_series) {
    parts.push(`\nTIME-SERIES SAMPLES (${input.time_series.length} points):\n${JSON.stringify(input.time_series.slice(0, 200), null, 2)}`);
  }
  if (input.threshold_results) {
    parts.push(`\nTHRESHOLD RESULTS:\n${JSON.stringify(input.threshold_results, null, 2)}`);
  }

  parts.push(`\n${OUTPUT_INSTRUCTIONS}`);
  return parts.join('\n');
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function safeParseJson(text) {
  try {
    return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch {
    return { raw_text: text, parse_error: true };
  }
}

export async function run(input) {
  const client = getClient();
  if (!client) {
    console.log(`[${AGENT_NAME}] No API key — using fallback`);
    return buildFallback(input);
  }

  const prompt = buildPrompt(input);
  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const output = safeParseJson(response.content[0]?.text || '{}');
  const validation = validateAgentOutput(AGENT_NAME, output);

  if (!validation.valid) {
    console.log(`[${AGENT_NAME}] Validation failed (attempt 1): ${validation.errors.join('; ')}`);
    const retryPrompt = `${prompt}\n\nYour previous output had these validation errors:\n${validation.errors.join('\n')}\n\n${schemaToPromptHint(AGENT_NAME)}`;
    const retry = await client.messages.create({
      model: SONNET,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: retryPrompt }],
    });
    const retryOutput = safeParseJson(retry.content[0]?.text || '{}');
    const rv = validateAgentOutput(AGENT_NAME, retryOutput);
    if (rv.valid) {
      retryOutput._meta = { agent: AGENT_NAME, model: SONNET, tokens: retry.usage, attempt: 2 };
      return retryOutput;
    }
    console.log(`[${AGENT_NAME}] Retry failed — using fallback`);
    return buildFallback(input);
  }

  output._meta = { agent: AGENT_NAME, model: SONNET, tokens: response.usage, attempt: 1 };
  return output;
}

export function buildFallback(input) {
  const summary = input.k6_summary || {};
  const p95 = summary.http_req_duration_p95 || 0;
  const errorRate = summary.http_req_failed_rate || 0;
  const avgDuration = summary.http_req_duration_avg || 0;

  let grade = 'A';
  let score = 85;
  if (p95 > 5000 || errorRate >= 0.05) { grade = 'F'; score = 30; }
  else if (p95 > 2000 || errorRate >= 0.03) { grade = 'D'; score = 45; }
  else if (p95 > 1000 || errorRate >= 0.01) { grade = 'C'; score = 65; }
  else if (p95 > 500) { grade = 'B'; score = 75; }

  const bottlenecks = [];
  if (p95 > 1000) {
    bottlenecks.push({
      component: 'HTTP Response Time',
      description: `P95 of ${p95.toFixed(0)}ms exceeds acceptable threshold`,
      severity: p95 > 2000 ? 'critical' : 'high',
      confidence: 0.9,
      evidence: `p95=${p95.toFixed(0)}ms, avg=${avgDuration.toFixed(0)}ms`,
      saturation_point_vus: null,
      saturation_point_rps: null,
      impact: 'Users experience slow page loads',
    });
  }
  if (errorRate > 0.01) {
    bottlenecks.push({
      component: 'Error Rate',
      description: `Error rate of ${(errorRate * 100).toFixed(2)}% exceeds 1% threshold`,
      severity: errorRate > 0.05 ? 'critical' : 'high',
      confidence: 0.95,
      evidence: `error_rate=${(errorRate * 100).toFixed(2)}%`,
      saturation_point_vus: null,
      saturation_point_rps: null,
      impact: 'Users encounter failed requests',
    });
  }

  const slowEndpoints = (input.endpoint_metrics || [])
    .filter(e => e.p95_duration > 1000)
    .slice(0, 5)
    .map(e => ({
      component: `${e.method} ${e.endpoint}`,
      description: `Slow endpoint: p95 = ${e.p95_duration?.toFixed(0)}ms`,
      severity: e.p95_duration > 2000 ? 'high' : 'medium',
      confidence: 0.85,
      evidence: `p95=${e.p95_duration?.toFixed(0)}ms, error_count=${e.error_count}`,
      saturation_point_vus: null,
      saturation_point_rps: null,
      impact: 'Contributes to overall latency',
    }));

  return {
    performance_grade: grade,
    overall_score: score,
    executive_headline: `System scores ${grade} (${score}/100) under load — ${bottlenecks.length} bottleneck(s) detected`,
    bottlenecks: [...bottlenecks, ...slowEndpoints],
    anomalies: [],
    error_analysis: {
      dominant_errors: errorRate > 0 ? ['HTTP errors detected'] : ['No errors'],
      correlation_with_load: 'Requires time-series analysis',
      root_cause_hypothesis: errorRate > 0.01 ? 'Server capacity may be insufficient' : 'System handling load well',
    },
    response_time_analysis: {
      p50_assessment: `Median: ${(summary.http_req_duration_med || 0).toFixed(0)}ms`,
      p95_assessment: `P95: ${p95.toFixed(0)}ms`,
      p99_assessment: `P99: ${(summary.http_req_duration_p99 || 0).toFixed(0)}ms`,
      distribution_shape: 'normal',
      outlier_analysis: `Max: ${(summary.http_req_duration_max || 0).toFixed(0)}ms`,
    },
    throughput_analysis: {
      peak_rps: summary.http_reqs_rate || summary.http_reqs || 0,
      sustainable_rps: summary.http_reqs_rate || summary.http_reqs || 0,
      scaling_behavior: 'linear',
      limiting_factor: 'Requires detailed analysis',
    },
    quick_wins: [
      p95 > 500 ? 'Optimise slow endpoints (see bottlenecks)' : 'Response times are within acceptable range',
      errorRate > 0.01 ? 'Investigate error sources' : 'Error handling is solid',
      'Enable response caching for read-heavy endpoints',
      'Review database query plans under load',
    ],
    deep_investigation_needed: [
      'Saturation point detection via time-series correlation',
      'Infrastructure resource analysis',
      'Database query profiling',
    ],
    _meta: { agent: AGENT_NAME, model: 'fallback', attempt: 0 },
  };
}

export { AGENT_NAME, metricAnalystSchema as SCHEMA };
