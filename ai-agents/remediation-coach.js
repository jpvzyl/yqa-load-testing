/**
 * Agent #10 — Remediation Coach (Sonnet)
 *
 * Takes findings + customer stack info, outputs prioritized actions
 * with code diffs, effort estimates, and expected impact.
 */

import Anthropic from '@anthropic-ai/sdk';
import { remediationCoachSchema, validateAgentOutput, schemaToPromptHint } from './schemas.js';

const SONNET = 'claude-sonnet-4-20250514';
const AGENT_NAME = 'remediation-coach';

const SYSTEM_PROMPT = `You are a performance remediation expert for the Sarfat Load Testing Platform.

Given performance findings (bottlenecks, anomalies, regressions) and information about the customer's
technology stack, produce prioritised remediation actions.

Priorities (highest first):
1. Critical bottlenecks with easy fixes (quick wins)
2. High-severity items blocking production readiness
3. Medium items that improve capacity and reliability
4. Low-priority improvements for long-term performance

For each action:
1. Provide a clear title and category (code, config, infra, architecture, monitoring).
2. Estimate effort: trivial (<1h), small (1-4h), medium (1-2d), large (1-2w), epic (>2w).
3. Describe expected impact quantitatively where possible ("reduce p95 by ~30%").
4. If the fix involves a code or config change, provide the actual diff.
5. Include the file path and technology when suggesting code changes.
6. Assign a confidence score: how confident are you this fix will resolve the issue?

Stack-specific recommendations:
- Tailor advice to the customer's language, framework, and database.
- Reference official documentation or known best practices.
- Avoid suggesting technologies the customer isn't using unless the benefit is substantial.`;

const OUTPUT_INSTRUCTIONS = `Return ONLY valid JSON:
{
  "prioritized_actions": [
    {
      "rank": 1,
      "title": "Add database connection pooling",
      "category": "config",
      "severity": "critical",
      "effort": "small",
      "expected_impact": "Reduce p95 latency by ~40% and eliminate connection errors",
      "description": "The database connection pool is exhausting under load...",
      "code_diff": "--- config/database.yml\\n+++ config/database.yml\\n@@ -1,3 +1,5 @@\\n pool: 5\\n+pool: 25\\n+timeout: 5000",
      "file_path": "config/database.yml",
      "technology": "PostgreSQL",
      "confidence": 0.85
    }
  ],
  "quick_wins": [
    "Enable response compression (gzip) — 5 min, reduces bandwidth by 60-80%",
    "Add Redis caching for /api/users — 2h, eliminates repeated DB queries"
  ],
  "stack_specific_notes": {
    "language": "Node.js",
    "framework": "Express",
    "database": "PostgreSQL",
    "recommendations": ["Use connection pooling with pg-pool"]
  },
  "estimated_total_effort": "3-5 developer days",
  "expected_improvement": {
    "p95_reduction_percent": 40,
    "error_rate_reduction_percent": 90,
    "throughput_increase_percent": 25,
    "confidence": 0.7
  }
}

Return ONLY valid JSON, no markdown fences.`;

function buildPrompt(input) {
  const parts = [`Produce prioritised remediation actions for the following findings.\n`];

  if (input.findings) {
    parts.push(`PERFORMANCE FINDINGS:\n${JSON.stringify(input.findings, null, 2)}\n`);
  }
  if (input.trace_attributions) {
    parts.push(`TRACE ATTRIBUTIONS (root causes):\n${JSON.stringify(input.trace_attributions, null, 2)}\n`);
  }
  if (input.infra_analysis) {
    parts.push(`INFRASTRUCTURE ANALYSIS:\n${JSON.stringify(input.infra_analysis, null, 2)}\n`);
  }
  if (input.regression_calls) {
    parts.push(`REGRESSION CALLS:\n${JSON.stringify(input.regression_calls, null, 2)}\n`);
  }
  if (input.slo_results) {
    parts.push(`SLO RESULTS:\n${JSON.stringify(input.slo_results, null, 2)}\n`);
  }

  if (input.stack) {
    parts.push(`CUSTOMER TECHNOLOGY STACK:\n${JSON.stringify(input.stack, null, 2)}\n`);
  }
  if (input.codebase_context) {
    parts.push(`CODEBASE CONTEXT:\n${input.codebase_context}\n`);
  }
  if (input.existing_optimizations) {
    parts.push(`EXISTING OPTIMIZATIONS ALREADY IN PLACE:\n${JSON.stringify(input.existing_optimizations, null, 2)}\n`);
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
      model: SONNET,
      max_tokens: 8192,
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
  const findings = input.findings || {};
  const bottlenecks = findings.bottlenecks || [];
  const stack = input.stack || {};

  const actions = bottlenecks.slice(0, 10).map((b, i) => ({
    rank: i + 1,
    title: `Address: ${b.component || b.description || 'Performance issue'}`,
    category: guessCategoryFromBottleneck(b),
    severity: b.severity || 'medium',
    effort: b.severity === 'critical' ? 'medium' : 'small',
    expected_impact: `Resolve ${b.severity || 'medium'}-severity bottleneck affecting ${b.impact || 'system performance'}`,
    description: b.description || 'See performance findings for details',
    code_diff: null,
    file_path: null,
    technology: stack.language || null,
    confidence: 0.3,
  }));

  if (actions.length === 0) {
    actions.push({
      rank: 1,
      title: 'Enable comprehensive monitoring',
      category: 'monitoring',
      severity: 'medium',
      effort: 'small',
      expected_impact: 'Gain visibility into production performance patterns',
      description: 'Set up APM, infrastructure metrics, and distributed tracing to identify optimisation opportunities.',
      code_diff: null,
      file_path: null,
      technology: null,
      confidence: 0.8,
    });
  }

  return {
    prioritized_actions: actions,
    quick_wins: [
      'Enable response compression (gzip/brotli)',
      'Review and optimise N+1 database queries',
      'Add caching headers for static content',
      'Configure connection pooling if not already enabled',
    ],
    stack_specific_notes: {
      language: stack.language || 'Unknown',
      framework: stack.framework || 'Unknown',
      database: stack.database || 'Unknown',
      recommendations: ['Configure ANTHROPIC_API_KEY for stack-specific remediation advice'],
    },
    estimated_total_effort: 'Requires AI analysis for accurate estimation',
    expected_improvement: {
      p95_reduction_percent: null,
      error_rate_reduction_percent: null,
      throughput_increase_percent: null,
      confidence: 0.1,
    },
    _meta: { agent: AGENT_NAME, model: 'fallback', attempt: 0 },
  };
}

function guessCategoryFromBottleneck(b) {
  const text = `${b.component} ${b.description} ${b.impact}`.toLowerCase();
  if (text.includes('sql') || text.includes('query') || text.includes('database') || text.includes('db')) return 'code';
  if (text.includes('cpu') || text.includes('memory') || text.includes('disk') || text.includes('network')) return 'infra';
  if (text.includes('cache') || text.includes('pool') || text.includes('config')) return 'config';
  if (text.includes('architecture') || text.includes('scale')) return 'architecture';
  return 'code';
}

export { AGENT_NAME, remediationCoachSchema as SCHEMA };
