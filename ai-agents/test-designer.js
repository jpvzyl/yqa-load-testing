/**
 * Agent #2 — Test Designer (Sonnet)
 *
 * Takes workload model + testing goals, outputs a complete test plan
 * with stages, thresholds, scenarios, and rationale.
 */

import Anthropic from '@anthropic-ai/sdk';
import { testDesignerSchema, validateAgentOutput, schemaToPromptHint } from './schemas.js';

const SONNET = 'claude-sonnet-4-20250514';
const AGENT_NAME = 'test-designer';

const SYSTEM_PROMPT = `You are a senior performance test architect for the Sarfat Load Testing Platform.

Given a workload model and testing goals, design a comprehensive test plan. You must:

1. Choose the right test type (load, stress, spike, soak, breakpoint, scalability) based on the stated goal.
2. Design k6-compatible stages with realistic ramp patterns.
3. Set meaningful thresholds (p95, p99, error rate, throughput) aligned with stated SLOs or industry norms.
4. Map workload scenarios into the test plan with correct weight distribution.
5. Estimate total test duration and peak VU count.
6. Identify risks and assumptions.

Industry benchmarks for reference:
- Web app p95 < 500ms, API p95 < 200ms
- Error rate < 1% for load, < 5% for stress
- Soak tests: minimum 30 minutes sustained load
- Breakpoint: 10+ incremental steps`;

const OUTPUT_INSTRUCTIONS = `Return ONLY valid JSON:
{
  "test_plan": {
    "name": "descriptive test name",
    "objective": "what this test validates",
    "test_type": "load",
    "protocol": "http",
    "stages": [
      { "duration": "30s", "target_vus": 50, "ramp_type": "linear" }
    ],
    "thresholds": {
      "http_req_duration": ["p(95)<500"],
      "http_req_failed": ["rate<0.01"]
    },
    "scenarios": [
      {
        "name": "scenario name",
        "weight_percent": 60,
        "executor": "ramping-vus"
      }
    ]
  },
  "rationale": "why this test design was chosen",
  "risks": ["risk 1", "risk 2"],
  "estimated_duration_s": 300,
  "estimated_peak_vus": 100
}

Return ONLY valid JSON, no markdown fences.`;

function buildPrompt(input) {
  const parts = [`Design a load test plan based on the following inputs.\n`];

  if (input.workload_model) {
    parts.push(`WORKLOAD MODEL:\n${JSON.stringify(input.workload_model, null, 2)}\n`);
  }
  if (input.goals) {
    parts.push(`TESTING GOALS:\n${Array.isArray(input.goals) ? input.goals.join('\n') : input.goals}\n`);
  }
  if (input.slos) {
    parts.push(`SERVICE LEVEL OBJECTIVES:\n${JSON.stringify(input.slos, null, 2)}\n`);
  }
  if (input.constraints) {
    parts.push(`CONSTRAINTS:\n${JSON.stringify(input.constraints, null, 2)}\n`);
  }
  if (input.target_vus) {
    parts.push(`TARGET VU COUNT: ${input.target_vus}\n`);
  }
  if (input.target_duration_s) {
    parts.push(`TARGET DURATION: ${input.target_duration_s}s\n`);
  }
  if (input.previous_results) {
    parts.push(`PREVIOUS TEST RESULTS SUMMARY:\n${JSON.stringify(input.previous_results, null, 2)}\n`);
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
    const retryPrompt = `${prompt}\n\nYour previous response had validation errors:\n${validation.errors.join('\n')}\n\n${schemaToPromptHint(AGENT_NAME)}`;
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
    console.log(`[${AGENT_NAME}] Retry also failed — using fallback`);
    return buildFallback(input);
  }

  output._meta = { agent: AGENT_NAME, model: SONNET, tokens: response.usage, attempt: 1 };
  return output;
}

export function buildFallback(input) {
  const targetVus = input.target_vus || 50;
  const duration = input.target_duration_s || 300;
  const scenarios = input.workload_model?.traffic_model?.scenarios || [];

  return {
    test_plan: {
      name: `Load Test — ${targetVus} VUs`,
      objective: 'Validate system performance under expected load',
      test_type: 'load',
      protocol: 'http',
      stages: [
        { duration: '30s', target_vus: Math.round(targetVus * 0.5), ramp_type: 'linear' },
        { duration: `${Math.max(60, duration - 60)}s`, target_vus: targetVus, ramp_type: 'linear' },
        { duration: '30s', target_vus: 0, ramp_type: 'linear' },
      ],
      thresholds: {
        'http_req_duration': ['p(95)<500', 'p(99)<1500'],
        'http_req_failed': ['rate<0.01'],
      },
      scenarios: scenarios.length > 0
        ? scenarios.map(s => ({ name: s.name, weight_percent: s.weight_percent, executor: 'ramping-vus' }))
        : [{ name: 'default', weight_percent: 100, executor: 'ramping-vus' }],
    },
    rationale: 'Standard load test pattern: ramp to target, hold, ramp down. Fallback template used.',
    risks: [
      'Test plan generated from template — may not match actual usage patterns',
      'Thresholds set to industry defaults — adjust for application-specific SLOs',
    ],
    estimated_duration_s: duration,
    estimated_peak_vus: targetVus,
    _meta: { agent: AGENT_NAME, model: 'fallback', attempt: 0 },
  };
}

export { AGENT_NAME, testDesignerSchema as SCHEMA };
