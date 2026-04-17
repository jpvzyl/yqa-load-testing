/**
 * Agent #9 — Executive Synthesiser (Opus 4.7)
 *
 * Takes ALL prior agent outputs (agents 1-8), produces executive summary,
 * risk assessment, go/no-go recommendation, and remediation roadmap.
 *
 * This is the only agent using Opus — it needs the deepest reasoning
 * to synthesise across multiple analysis streams.
 */

import Anthropic from '@anthropic-ai/sdk';
import { executiveSynthesiserSchema, validateAgentOutput, schemaToPromptHint } from './schemas.js';

const OPUS = 'claude-opus-4-7';
const AGENT_NAME = 'executive-synthesiser';

const SYSTEM_PROMPT = `You are producing an executive-grade performance assessment for the Sarfat Load Testing Platform.

You receive outputs from 8 specialist agents. Your job is to synthesise these into a cohesive executive
report suitable for CTO/VP Engineering sign-off.

Writing guidelines:
1. Executive summary: 3-5 paragraphs in business language. Lead with the verdict, then evidence, then impact.
2. Translate technical metrics into business terms (latency → user experience, errors → revenue loss).
3. Risk level is holistic: consider performance, reliability, capacity, and regression trends together.
4. Go/No-Go must be defensible: cite the specific evidence that drives the recommendation.
5. Remediation roadmap must be actionable with clear timeframes and expected outcomes.
6. Cost of inaction should quantify business risk (user churn, SLA penalties, revenue impact).
7. If agents disagree, note the disagreement and explain your reasoning.

Production readiness criteria:
- ready: All SLOs met, no critical bottlenecks, no regressions, adequate capacity headroom (>30%)
- conditional: Minor issues that should be monitored, SLOs met but marginal
- not-ready: Critical bottlenecks, SLO breaches, regressions, or insufficient capacity`;

const OUTPUT_INSTRUCTIONS = `Return ONLY valid JSON:
{
  "executive_summary": "3-5 paragraph business-impact summary suitable for C-suite",
  "risk_level": "low|moderate|high|critical",
  "production_readiness": "ready|conditional|not-ready",
  "go_nogo_recommendation": "GO|CONDITIONAL-GO|NO-GO",
  "key_findings": [
    {
      "finding": "description",
      "business_impact": "impact in business terms",
      "urgency": "immediate|short-term|medium-term",
      "effort_estimate": "2 days"
    }
  ],
  "regression_summary": {
    "has_regression": false,
    "regressed_metrics": [],
    "statistical_significance": "description",
    "probable_cause": "cause"
  },
  "sla_compliance": {
    "overall_status": "compliant|at-risk|breached",
    "summary": "SLA status description"
  },
  "capacity_forecast": {
    "current_load_description": "what load was tested",
    "time_to_capacity": "estimated time",
    "recommended_actions": ["action"]
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

Return ONLY valid JSON, no markdown fences.`;

function buildPrompt(input) {
  const parts = [`Synthesise the following agent outputs into an executive assessment.\n`];

  if (input.metric_analyst) {
    parts.push(`AGENT 4 — METRIC ANALYST:\n${JSON.stringify(input.metric_analyst, null, 2)}\n`);
  }
  if (input.trace_correlator) {
    parts.push(`AGENT 5 — TRACE CORRELATOR:\n${JSON.stringify(input.trace_correlator, null, 2)}\n`);
  }
  if (input.infra_correlator) {
    parts.push(`AGENT 6 — INFRA CORRELATOR:\n${JSON.stringify(input.infra_correlator, null, 2)}\n`);
  }
  if (input.regression_judge) {
    parts.push(`AGENT 7 — REGRESSION JUDGE:\n${JSON.stringify(input.regression_judge, null, 2)}\n`);
  }
  if (input.slo_judge) {
    parts.push(`AGENT 8 — SLO JUDGE:\n${JSON.stringify(input.slo_judge, null, 2)}\n`);
  }

  if (input.workload_analyst) {
    parts.push(`AGENT 1 — WORKLOAD ANALYST:\n${JSON.stringify(input.workload_analyst, null, 2)}\n`);
  }
  if (input.test_designer) {
    parts.push(`AGENT 2 — TEST DESIGNER:\n${JSON.stringify(input.test_designer, null, 2)}\n`);
  }

  if (input.run) {
    parts.push(`TEST RUN METADATA:\n${JSON.stringify({
      test_type: input.run.test_type,
      protocol: input.run.protocol,
      duration_ms: input.run.duration_ms,
      performance_score: input.run.performance_score,
      performance_grade: input.run.performance_grade,
      environment: input.run.environment,
    }, null, 2)}\n`);
  }

  if (input.baseline) {
    parts.push(`BASELINE:\n${JSON.stringify(input.baseline, null, 2)}\n`);
  }
  if (input.historical_runs) {
    parts.push(`HISTORICAL RUNS:\n${JSON.stringify(input.historical_runs, null, 2)}\n`);
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
    model: OPUS,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const output = safeParseJson(response.content[0]?.text || '{}');
  const validation = validateAgentOutput(AGENT_NAME, output);

  if (!validation.valid) {
    console.log(`[${AGENT_NAME}] Validation failed: ${validation.errors.join('; ')}`);
    const retryPrompt = `${prompt}\n\nValidation errors:\n${validation.errors.join('\n')}\n\n${schemaToPromptHint(AGENT_NAME)}`;
    const retry = await client.messages.create({
      model: OPUS,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: retryPrompt }],
    });
    const retryOutput = safeParseJson(retry.content[0]?.text || '{}');
    const rv = validateAgentOutput(AGENT_NAME, retryOutput);
    if (rv.valid) {
      retryOutput._meta = { agent: AGENT_NAME, model: OPUS, tokens: retry.usage, attempt: 2 };
      return retryOutput;
    }
    console.log(`[${AGENT_NAME}] Retry failed — using fallback`);
    return buildFallback(input);
  }

  output._meta = { agent: AGENT_NAME, model: OPUS, tokens: response.usage, attempt: 1 };
  return output;
}

export function buildFallback(input) {
  const ma = input.metric_analyst || {};
  const rj = input.regression_judge || {};
  const sj = input.slo_judge || {};
  const ic = input.infra_correlator || {};

  const grade = ma.performance_grade || 'N/A';
  const score = ma.overall_score || 0;
  const bottleneckCount = (ma.bottlenecks || []).length;
  const hasRegression = rj.has_regression || false;
  const sloStatus = sj.overall_compliance || 'unknown';

  let riskLevel = 'low';
  let readiness = 'ready';
  let recommendation = 'GO';

  if (score < 40 || sloStatus === 'breached' || (rj.overall_verdict === 'FAIL')) {
    riskLevel = 'critical';
    readiness = 'not-ready';
    recommendation = 'NO-GO';
  } else if (score < 60 || sloStatus === 'at-risk' || hasRegression) {
    riskLevel = 'high';
    readiness = 'not-ready';
    recommendation = 'NO-GO';
  } else if (score < 80 || bottleneckCount > 2) {
    riskLevel = 'moderate';
    readiness = 'conditional';
    recommendation = 'CONDITIONAL-GO';
  }

  const keyFindings = (ma.bottlenecks || []).slice(0, 5).map(b => ({
    finding: b.description || b.component,
    business_impact: b.impact || 'May affect user experience under load',
    urgency: b.severity === 'critical' ? 'immediate' : b.severity === 'high' ? 'short-term' : 'medium-term',
    effort_estimate: 'Requires assessment',
  }));

  return {
    executive_summary: `Load testing completed with a performance grade of ${grade} (${score}/100). ${bottleneckCount} bottleneck(s) were identified. ${hasRegression ? 'Performance regressions were detected compared to baseline.' : 'No regressions detected.'} SLO compliance: ${sloStatus}. ${recommendation === 'GO' ? 'The system is ready for production.' : recommendation === 'CONDITIONAL-GO' ? 'The system may proceed to production with monitoring of identified issues.' : 'The system is not recommended for production until identified issues are resolved.'} Configure ANTHROPIC_API_KEY for AI-powered executive synthesis.`,
    risk_level: riskLevel,
    production_readiness: readiness,
    go_nogo_recommendation: recommendation,
    key_findings: keyFindings,
    regression_summary: {
      has_regression: hasRegression,
      regressed_metrics: rj.regression_calls?.filter(r => r.verdict === 'REGRESSION').map(r => r.metric) || [],
      statistical_significance: rj.summary || 'N/A',
      probable_cause: 'Requires AI analysis',
    },
    sla_compliance: {
      overall_status: sloStatus,
      summary: sj.error_budget_summary?.recommendation || 'See SLO judge output for details',
    },
    capacity_forecast: {
      current_load_description: 'As tested',
      time_to_capacity: ic.capacity_analysis?.headroom_percent
        ? `Approximately ${Math.round(ic.capacity_analysis.headroom_percent)}% headroom remaining`
        : 'Requires infrastructure data for projection',
      recommended_actions: ic.capacity_analysis?.recommendations || ['Enable infrastructure monitoring for capacity planning'],
    },
    remediation_roadmap: {
      immediate: ma.quick_wins || [],
      short_term: ['Establish performance baselines', 'Configure SLO definitions'],
      medium_term: ['Implement continuous load testing in CI/CD'],
      architectural: ['Plan capacity for projected growth'],
    },
    cost_of_inaction: 'Undetected performance issues may impact user experience, revenue, and SLA compliance',
    estimated_optimization_cost: 'Requires detailed assessment',
    _meta: { agent: AGENT_NAME, model: 'fallback', attempt: 0 },
  };
}

export { AGENT_NAME, executiveSynthesiserSchema as SCHEMA };
