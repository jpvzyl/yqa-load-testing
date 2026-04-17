/**
 * Agent #3 — Script Generator (Sonnet)
 *
 * Takes a test plan + protocol info, outputs a complete k6 JavaScript
 * script with options, stages, scenarios, checks, and custom metrics.
 */

import Anthropic from '@anthropic-ai/sdk';
import { scriptGeneratorSchema, validateAgentOutput, schemaToPromptHint } from './schemas.js';

const SONNET = 'claude-sonnet-4-20250514';
const AGENT_NAME = 'script-generator';

const SYSTEM_PROMPT = `You are an expert k6 script author for the Sarfat Load Testing Platform.

Given a test plan (stages, scenarios, thresholds) and protocol information, generate a production-ready
k6 load test script in JavaScript.

Requirements:
1. Script must be syntactically valid k6 JavaScript (ES6 modules via k6's import system).
2. Use \`import http from 'k6/http'\`, \`import { check, sleep } from 'k6'\`, etc.
3. Include \`export const options = { ... }\` with stages, thresholds, and scenarios.
4. Each scenario function should use realistic think times via \`sleep()\`.
5. Add \`check()\` assertions for status codes and response body content.
6. Use \`__ENV.BASE_URL\` for the target URL so it's configurable.
7. Handle authentication flows if endpoints require it.
8. Include custom metrics (Trend, Counter, Rate) where they add value.
9. Add data parameterisation using SharedArray if test data is needed.
10. The script must be immediately runnable with \`k6 run script.js\`.`;

const OUTPUT_INSTRUCTIONS = `Return ONLY valid JSON:
{
  "script": "// full k6 script content here as a single string",
  "language": "javascript",
  "k6_options": {
    "stages": [...],
    "thresholds": {...}
  },
  "imports_used": ["k6/http", "k6", "k6/metrics"],
  "custom_metrics": ["metric_name_1"],
  "data_files_needed": [],
  "validation_notes": ["notes about the generated script"]
}

Return ONLY valid JSON, no markdown fences.`;

function buildPrompt(input) {
  const parts = [`Generate a complete k6 load test script.\n`];

  if (input.test_plan) {
    parts.push(`TEST PLAN:\n${JSON.stringify(input.test_plan, null, 2)}\n`);
  }
  if (input.protocol) {
    parts.push(`PROTOCOL: ${input.protocol}\n`);
  }
  if (input.target_url) {
    parts.push(`TARGET URL: ${input.target_url}\n`);
  }
  if (input.endpoints) {
    parts.push(`ENDPOINTS:\n${JSON.stringify(input.endpoints, null, 2)}\n`);
  }
  if (input.auth) {
    parts.push(`AUTHENTICATION:\n${JSON.stringify(input.auth, null, 2)}\n`);
  }
  if (input.workload_model) {
    parts.push(`WORKLOAD MODEL:\n${JSON.stringify(input.workload_model, null, 2)}\n`);
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
    const retryPrompt = `${prompt}\n\nValidation errors from your previous response:\n${validation.errors.join('\n')}\n\n${schemaToPromptHint(AGENT_NAME)}`;
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
  const plan = input.test_plan || {};
  const stages = plan.stages || [
    { duration: '30s', target_vus: 10 },
    { duration: '2m', target_vus: 50 },
    { duration: '30s', target_vus: 0 },
  ];
  const baseUrl = input.target_url || 'http://localhost:3000';

  const k6Stages = stages.map(s => `    { duration: '${s.duration}', target: ${s.target_vus} }`).join(',\n');

  const script = `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
${k6Stages}
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || '${baseUrl}';

export default function () {
  const res = http.get(\`\${BASE_URL}/api/health\`);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(Math.random() * 3 + 1);
}
`;

  return {
    script,
    language: 'javascript',
    k6_options: {
      stages: stages.map(s => ({ duration: s.duration, target: s.target_vus })),
      thresholds: {
        http_req_duration: ['p(95)<500', 'p(99)<1500'],
        http_req_failed: ['rate<0.01'],
      },
    },
    imports_used: ['k6/http', 'k6'],
    custom_metrics: [],
    data_files_needed: [],
    validation_notes: ['Fallback script — basic health check pattern. Replace with actual endpoints.'],
    _meta: { agent: AGENT_NAME, model: 'fallback', attempt: 0 },
  };
}

export { AGENT_NAME, scriptGeneratorSchema as SCHEMA };
