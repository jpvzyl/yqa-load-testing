/**
 * Agent #8 — SLO Judge (Sonnet)
 *
 * Takes SLO definitions + run metrics + historical burn window,
 * outputs budget burn rates, compliance status, and projections.
 */

import Anthropic from '@anthropic-ai/sdk';
import { sloJudgeSchema, validateAgentOutput, schemaToPromptHint } from './schemas.js';

const SONNET = 'claude-sonnet-4-20250514';
const AGENT_NAME = 'slo-judge';

const SYSTEM_PROMPT = `You are an SLO (Service Level Objective) compliance judge for the Sarfat Load Testing Platform.

Given SLO definitions, current run metrics, and historical burn data, evaluate compliance and project
error budget exhaustion.

SLO evaluation rules:
1. For each SLO, compare actual metric value against the target.
2. Calculate margin: how far from the threshold (positive = headroom, negative = breached).
3. Compute burn rate: rate at which the error budget is being consumed.
   - 1h burn rate: budget consumed in the last hour relative to window budget
   - 6h burn rate: budget consumed in the last 6 hours relative to window budget
   - Burn rate > 1.0 means budget is being consumed faster than sustainable
4. Project budget exhaustion: at current burn rate, when will the budget run out?
5. Status per SLO:
   - healthy: within target with >50% budget remaining
   - warning: within target but budget <50% OR burn rate >1.0
   - critical: breached OR budget <10%
   - exhausted: budget fully consumed

Overall compliance:
- compliant: all SLOs healthy or warning with >20% budget
- at-risk: any SLO critical or budget <20%
- breached: any SLO exhausted or actively failing`;

const OUTPUT_INSTRUCTIONS = `Return ONLY valid JSON:
{
  "overall_compliance": "compliant|at-risk|breached",
  "slo_results": [
    {
      "slo_id": "uuid",
      "slo_name": "API Availability",
      "metric": "availability",
      "target": 99.9,
      "actual": 99.95,
      "passed": true,
      "margin_percent": 0.05,
      "budget_remaining_percent": 72,
      "burn_rate_1h": 0.5,
      "burn_rate_6h": 0.8,
      "projected_exhaustion": "not projected within window",
      "status": "healthy"
    }
  ],
  "error_budget_summary": {
    "total_budget_remaining_percent": 65,
    "fastest_burning_slo": "API Latency P95",
    "projected_budget_exhaustion": "12 days at current burn rate",
    "recommendation": "Investigate latency regression before budget exhaustion"
  },
  "historical_trend": {
    "direction": "stable",
    "compliance_rate_30d": 98.5,
    "worst_period": "2026-04-05 to 2026-04-06 (deploy v2.3.1)"
  },
  "alerts": [
    {
      "slo_name": "API Latency P95",
      "alert_type": "burn_rate",
      "message": "1h burn rate is 2.3x sustainable — investigate immediately",
      "severity": "high"
    }
  ]
}

Return ONLY valid JSON, no markdown fences.`;

function buildPrompt(input) {
  const parts = [`Evaluate SLO compliance for this load test run.\n`];

  if (input.slos) {
    parts.push(`SLO DEFINITIONS:\n${JSON.stringify(input.slos, null, 2)}\n`);
  }
  if (input.run_metrics) {
    parts.push(`CURRENT RUN METRICS:\n${JSON.stringify(input.run_metrics, null, 2)}\n`);
  }
  if (input.k6_summary) {
    parts.push(`K6 SUMMARY:\n${JSON.stringify(input.k6_summary, null, 2)}\n`);
  }
  if (input.endpoint_metrics) {
    parts.push(`ENDPOINT METRICS:\n${JSON.stringify(input.endpoint_metrics.slice(0, 20), null, 2)}\n`);
  }
  if (input.slo_burn_history) {
    parts.push(`HISTORICAL BURN DATA:\n${JSON.stringify(input.slo_burn_history, null, 2)}\n`);
  }
  if (input.sla_results) {
    parts.push(`SLA RESULTS (legacy):\n${JSON.stringify(input.sla_results, null, 2)}\n`);
  }

  parts.push(OUTPUT_INSTRUCTIONS);
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
    console.log(`[${AGENT_NAME}] Validation failed: ${validation.errors.join('; ')}`);
    const retryPrompt = `${prompt}\n\nValidation errors:\n${validation.errors.join('\n')}\n\n${schemaToPromptHint(AGENT_NAME)}`;
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
  const slos = input.slos || [];
  const summary = input.k6_summary || input.run_metrics || {};
  const slaResults = input.sla_results || [];

  const sloResults = slos.map(slo => {
    let actual = null;
    if (slo.metric === 'availability') actual = 1 - (summary.http_req_failed_rate || 0);
    else if (slo.metric === 'latency_p95') actual = summary.http_req_duration_p95 || 0;
    else if (slo.metric === 'latency_p99') actual = summary.http_req_duration_p99 || 0;
    else if (slo.metric === 'throughput') actual = summary.http_reqs_rate || summary.http_reqs || 0;
    else if (slo.metric === 'error_rate') actual = summary.http_req_failed_rate || 0;

    const isLatency = slo.metric?.includes('latency');
    const passed = actual != null && (isLatency ? actual <= slo.target : actual >= slo.target);
    const margin = actual != null && slo.target
      ? ((isLatency ? (slo.target - actual) / slo.target : (actual - slo.target) / slo.target) * 100)
      : null;

    return {
      slo_id: slo.id || null,
      slo_name: slo.name,
      metric: slo.metric,
      target: slo.target,
      actual: actual != null ? Math.round(actual * 10000) / 10000 : null,
      passed,
      margin_percent: margin != null ? Math.round(margin * 100) / 100 : null,
      budget_remaining_percent: null,
      burn_rate_1h: null,
      burn_rate_6h: null,
      projected_exhaustion: 'Requires historical data',
      status: passed ? 'healthy' : 'critical',
    };
  });

  if (sloResults.length === 0 && slaResults.length > 0) {
    for (const sla of slaResults) {
      sloResults.push({
        slo_id: sla.sla_id || null,
        slo_name: sla.name || `SLA ${sla.metric}`,
        metric: sla.metric || 'unknown',
        target: sla.threshold_value,
        actual: sla.actual_value,
        passed: sla.passed,
        margin_percent: sla.margin_percent,
        budget_remaining_percent: null,
        burn_rate_1h: null,
        burn_rate_6h: null,
        projected_exhaustion: null,
        status: sla.passed ? 'healthy' : 'critical',
      });
    }
  }

  const anyFailed = sloResults.some(r => !r.passed);

  return {
    overall_compliance: sloResults.length === 0 ? 'compliant' : anyFailed ? 'breached' : 'compliant',
    slo_results: sloResults,
    error_budget_summary: {
      total_budget_remaining_percent: null,
      fastest_burning_slo: sloResults.find(r => !r.passed)?.slo_name || null,
      projected_budget_exhaustion: 'Requires historical burn data',
      recommendation: anyFailed ? 'Address failing SLOs before next release' : 'All SLOs passing — continue monitoring',
    },
    historical_trend: {
      direction: 'stable',
      compliance_rate_30d: null,
      worst_period: null,
    },
    alerts: sloResults.filter(r => !r.passed).map(r => ({
      slo_name: r.slo_name,
      alert_type: 'breach',
      message: `${r.slo_name} breached: actual=${r.actual}, target=${r.target}`,
      severity: 'high',
    })),
    _meta: { agent: AGENT_NAME, model: 'fallback', attempt: 0 },
  };
}

export { AGENT_NAME, sloJudgeSchema as SCHEMA };
