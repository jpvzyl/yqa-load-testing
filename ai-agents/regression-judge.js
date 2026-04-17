/**
 * Agent #7 — Regression Judge (Sonnet)
 *
 * Takes current run + baseline + prior runs, outputs regression calls
 * with statistical evidence (z-scores, p-values). Supports "diff mode"
 * for retest verification: marks findings as RESOLVED/UNCHANGED/NEW.
 */

import Anthropic from '@anthropic-ai/sdk';
import { regressionJudgeSchema, validateAgentOutput, schemaToPromptHint } from './schemas.js';

const SONNET = 'claude-sonnet-4-20250514';
const AGENT_NAME = 'regression-judge';

const SYSTEM_PROMPT = `You are a statistical regression judge for the Sarfat Load Testing Platform.

Your role is to determine whether the current test run shows performance regressions compared to baseline
and historical data. You MUST use statistical methods, not just raw comparisons.

Methodology:
1. For each key metric, compute z-score: z = (current - historical_mean) / historical_stddev
2. Flag as regression if z > 2 (warning) or z > 3 (critical) AND in the degrading direction
3. Compute approximate p-value for statistical significance (p < 0.05 = significant)
4. Report improvement if z < -2 in the improving direction
5. If baseline exists, compare directly and compute % change

Key metrics to evaluate:
- http_req_duration (avg, p50, p95, p99) — higher = regression
- http_req_failed rate — higher = regression
- http_reqs throughput — lower = regression
- iterations — lower = regression

DIFF MODE (when previous_findings is provided):
Compare current findings against previous findings and classify each as:
- RESOLVED: Finding from previous run no longer present
- UNCHANGED: Finding still exists with similar severity
- WORSENED: Finding exists but got worse
- IMPROVED: Finding exists but improved
- NEW: Finding not present in previous run

Overall verdict:
- PASS: No regressions detected, all metrics stable or improving
- WARN: Minor regressions detected (z > 2 but < 3) or marginal changes
- FAIL: Significant regressions detected (z > 3 or p < 0.01)`;

const OUTPUT_INSTRUCTIONS = `Return ONLY valid JSON:
{
  "has_regression": false,
  "overall_verdict": "PASS|WARN|FAIL",
  "regression_calls": [
    {
      "metric": "http_req_duration_p95",
      "current_value": 450,
      "baseline_value": 380,
      "change_percent": 18.4,
      "z_score": 2.1,
      "p_value": 0.036,
      "severity": "medium",
      "verdict": "REGRESSION",
      "statistical_evidence": "z=2.1, p=0.036 — statistically significant at 95% confidence"
    }
  ],
  "diff_findings": [
    {
      "finding_id": "bottleneck-1",
      "status": "RESOLVED",
      "previous_severity": "high",
      "current_severity": null,
      "evidence": "P95 dropped from 1200ms to 380ms"
    }
  ],
  "trend_direction": "improving|stable|degrading",
  "summary": "Human-readable summary of regression analysis"
}

Return ONLY valid JSON, no markdown fences.`;

function buildPrompt(input) {
  const parts = [`Perform regression analysis on this load test run.\n`];

  if (input.current_run) {
    parts.push(`CURRENT RUN METRICS:\n${JSON.stringify(input.current_run, null, 2)}\n`);
  }
  if (input.baseline) {
    parts.push(`BASELINE:\n${JSON.stringify(input.baseline, null, 2)}\n`);
  }
  if (input.historical_runs) {
    parts.push(`HISTORICAL RUNS (last ${input.historical_runs.length}):\n${JSON.stringify(input.historical_runs, null, 2)}\n`);
  }
  if (input.current_findings) {
    parts.push(`CURRENT FINDINGS (from metric analyst):\n${JSON.stringify(input.current_findings, null, 2)}\n`);
  }

  if (input.previous_findings) {
    parts.push(`\n=== DIFF MODE ENABLED ===`);
    parts.push(`PREVIOUS FINDINGS (from prior run):\n${JSON.stringify(input.previous_findings, null, 2)}\n`);
    parts.push(`Compare current findings against previous and classify each as RESOLVED/UNCHANGED/WORSENED/IMPROVED/NEW.\n`);
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
  const current = input.current_run || {};
  const baseline = input.baseline || {};
  const currentSummary = current.k6_summary || current;
  const baselineSummary = baseline.metrics_summary || baseline;

  const regressionCalls = [];
  const metricsToCheck = [
    { metric: 'http_req_duration_p95', higher_is_worse: true },
    { metric: 'http_req_duration_avg', higher_is_worse: true },
    { metric: 'http_req_failed_rate', higher_is_worse: true },
    { metric: 'http_reqs_rate', higher_is_worse: false },
  ];

  let hasRegression = false;
  for (const { metric, higher_is_worse } of metricsToCheck) {
    const curr = currentSummary[metric];
    const base = baselineSummary[metric];
    if (curr == null || base == null || base === 0) continue;

    const changePct = ((curr - base) / Math.abs(base)) * 100;
    const isWorse = higher_is_worse ? changePct > 10 : changePct < -10;

    if (isWorse) hasRegression = true;

    regressionCalls.push({
      metric,
      current_value: curr,
      baseline_value: base,
      change_percent: Math.round(changePct * 100) / 100,
      z_score: null,
      p_value: null,
      severity: Math.abs(changePct) > 50 ? 'critical' : Math.abs(changePct) > 20 ? 'high' : 'medium',
      verdict: isWorse ? 'REGRESSION' : Math.abs(changePct) < 5 ? 'STABLE' : 'IMPROVEMENT',
      statistical_evidence: 'Statistical analysis requires historical distribution (unavailable in fallback)',
    });
  }

  const diffFindings = [];
  if (input.previous_findings && input.current_findings) {
    const prevBottlenecks = input.previous_findings.bottlenecks || [];
    const currBottlenecks = input.current_findings.bottlenecks || [];

    for (const prev of prevBottlenecks) {
      const match = currBottlenecks.find(c => c.component === prev.component);
      diffFindings.push({
        finding_id: prev.id || prev.component,
        status: match ? 'UNCHANGED' : 'RESOLVED',
        previous_severity: prev.severity,
        current_severity: match?.severity || null,
        evidence: match ? 'Finding still present' : 'Finding no longer detected',
      });
    }
    for (const curr of currBottlenecks) {
      const match = prevBottlenecks.find(p => p.component === curr.component);
      if (!match) {
        diffFindings.push({
          finding_id: curr.id || curr.component,
          status: 'NEW',
          previous_severity: null,
          current_severity: curr.severity,
          evidence: 'New finding not present in previous run',
        });
      }
    }
  }

  return {
    has_regression: hasRegression,
    overall_verdict: hasRegression ? 'WARN' : 'PASS',
    regression_calls: regressionCalls,
    diff_findings: diffFindings,
    trend_direction: hasRegression ? 'degrading' : 'stable',
    summary: hasRegression
      ? `Potential regressions detected in ${regressionCalls.filter(r => r.verdict === 'REGRESSION').length} metric(s). Statistical validation requires AI analysis.`
      : 'No significant regressions detected compared to baseline.',
    _meta: { agent: AGENT_NAME, model: 'fallback', attempt: 0 },
  };
}

export { AGENT_NAME, regressionJudgeSchema as SCHEMA };
