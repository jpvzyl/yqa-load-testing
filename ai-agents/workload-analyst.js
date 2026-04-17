/**
 * Agent #1 — Workload Analyst (Sonnet)
 *
 * Takes recon data (API specs, traffic logs, analytics) and produces
 * a traffic model: scenarios, weight ratios, pacing strategy.
 */

import Anthropic from '@anthropic-ai/sdk';
import { workloadAnalystSchema, validateAgentOutput, schemaToPromptHint } from './schemas.js';

const SONNET = 'claude-sonnet-4-20250514';

const AGENT_NAME = 'workload-analyst';

const SYSTEM_PROMPT = `You are a world-class performance engineering workload modeler for the Sarfat Load Testing Platform.

Your job is to analyze reconnaissance data — API specifications, production traffic logs, analytics data,
endpoint catalogs, and business context — then produce a realistic traffic model that faithfully represents
how real users interact with the system under test.

Key principles:
1. Scenario weights MUST sum to 100%.
2. Every scenario must include at least one endpoint with method, path, and expected think time.
3. Pacing strategy should reflect realistic user behavior (poisson for organic traffic, constant for APIs).
4. Identify peak-hour multipliers from traffic data when available.
5. Document ALL assumptions explicitly — no silent guesses.
6. Confidence score reflects data quality: 0.9+ with production traffic, 0.5-0.7 with specs only, <0.5 with minimal data.`;

const OUTPUT_INSTRUCTIONS = `Return ONLY valid JSON matching this structure:
{
  "traffic_model": {
    "scenarios": [
      {
        "name": "scenario name",
        "description": "what this scenario represents",
        "weight_percent": 40,
        "endpoints": [
          { "method": "GET", "path": "/api/v1/resource", "headers": {}, "body": null }
        ],
        "think_time_ms": 3000,
        "pacing_strategy": "poisson"
      }
    ],
    "total_weight_check": 100,
    "peak_hour_multiplier": 1.5,
    "session_duration_s": 300
  },
  "data_sources_used": ["openapi_spec", "traffic_logs"],
  "assumptions": ["Assumed 60/40 read/write ratio based on typical SaaS patterns"],
  "confidence": 0.75
}

Return ONLY valid JSON, no markdown fences or commentary.`;

function buildPrompt(input) {
  const parts = [`Analyze the following reconnaissance data and produce a traffic model.\n`];

  if (input.api_spec) {
    parts.push(`API SPECIFICATION:\n${JSON.stringify(input.api_spec, null, 2)}\n`);
  }
  if (input.traffic_logs) {
    parts.push(`PRODUCTION TRAFFIC SAMPLE (${input.traffic_logs.length} entries):\n${JSON.stringify(input.traffic_logs.slice(0, 100), null, 2)}\n`);
  }
  if (input.analytics) {
    parts.push(`ANALYTICS DATA:\n${JSON.stringify(input.analytics, null, 2)}\n`);
  }
  if (input.endpoints_catalog) {
    parts.push(`ENDPOINTS CATALOG:\n${JSON.stringify(input.endpoints_catalog, null, 2)}\n`);
  }
  if (input.business_context) {
    parts.push(`BUSINESS CONTEXT:\n${input.business_context}\n`);
  }
  if (input.target_url) {
    parts.push(`TARGET URL: ${input.target_url}\n`);
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
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
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

  const text = response.content[0]?.text || '{}';
  const output = safeParseJson(text);

  const validation = validateAgentOutput(AGENT_NAME, output);
  if (!validation.valid) {
    console.log(`[${AGENT_NAME}] Validation failed: ${validation.errors.join('; ')}`);

    const retryPrompt = `${prompt}\n\nIMPORTANT: Your previous response failed validation with these errors:\n${validation.errors.join('\n')}\n\n${schemaToPromptHint(AGENT_NAME)}`;

    const retry = await client.messages.create({
      model: SONNET,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: retryPrompt }],
    });

    const retryOutput = safeParseJson(retry.content[0]?.text || '{}');
    const retryValidation = validateAgentOutput(AGENT_NAME, retryOutput);
    if (retryValidation.valid) {
      retryOutput._meta = { agent: AGENT_NAME, model: SONNET, tokens: retry.usage, attempt: 2 };
      return retryOutput;
    }
  }

  output._meta = {
    agent: AGENT_NAME,
    model: SONNET,
    tokens: response.usage,
    attempt: validation.valid ? 1 : 'fallback-after-retry',
  };

  return validation.valid ? output : buildFallback(input);
}

export function buildFallback(input) {
  const endpoints = input.endpoints_catalog || input.api_spec?.paths || {};
  const paths = typeof endpoints === 'object' && !Array.isArray(endpoints)
    ? Object.keys(endpoints)
    : (Array.isArray(endpoints) ? endpoints.map(e => e.endpoint || e.path || '/') : ['/api/health']);

  const getEndpoints = paths.filter(p => !p.includes('{'));
  const writeEndpoints = paths.filter(p => p.includes('{') || p.includes('create') || p.includes('update'));

  return {
    traffic_model: {
      scenarios: [
        {
          name: 'Browse / Read',
          description: 'User browsing and reading operations',
          weight_percent: 60,
          endpoints: getEndpoints.slice(0, 5).map(p => ({ method: 'GET', path: p })),
          think_time_ms: 3000,
          pacing_strategy: 'poisson',
        },
        {
          name: 'Write / Mutate',
          description: 'User creating or updating resources',
          weight_percent: 30,
          endpoints: writeEndpoints.slice(0, 3).map(p => ({ method: 'POST', path: p })),
          think_time_ms: 5000,
          pacing_strategy: 'constant',
        },
        {
          name: 'Health / Monitoring',
          description: 'Health check and monitoring calls',
          weight_percent: 10,
          endpoints: [{ method: 'GET', path: '/api/health' }],
          think_time_ms: 1000,
          pacing_strategy: 'fixed-interval',
        },
      ],
      total_weight_check: 100,
      peak_hour_multiplier: 1.5,
      session_duration_s: 300,
    },
    data_sources_used: ['fallback_heuristics'],
    assumptions: [
      'Assumed 60/30/10 read/write/health ratio (standard SaaS pattern)',
      'Assumed poisson inter-arrival for organic traffic',
      'Peak hour multiplier estimated at 1.5x (industry average)',
      'No production traffic data available — low confidence',
    ],
    confidence: 0.3,
    _meta: { agent: AGENT_NAME, model: 'fallback', attempt: 0 },
  };
}

export { AGENT_NAME, workloadAnalystSchema as SCHEMA };
