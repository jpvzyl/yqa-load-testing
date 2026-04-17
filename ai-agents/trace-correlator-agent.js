/**
 * Agent #5 — Trace Correlator (Sonnet)
 *
 * Takes metric-analyst findings + OTel spans + logs, outputs
 * attribution chains: slow span → service → operation → SQL query.
 */

import Anthropic from '@anthropic-ai/sdk';
import { traceCorrelatorSchema, validateAgentOutput, schemaToPromptHint } from './schemas.js';

const SONNET = 'claude-sonnet-4-20250514';
const AGENT_NAME = 'trace-correlator-agent';

const SYSTEM_PROMPT = `You are a distributed systems tracing expert for the Sarfat Load Testing Platform.

Given performance findings (bottlenecks, anomalies) along with OpenTelemetry spans and application logs,
your job is to attribute each finding to its root cause in the call chain.

For each finding, trace the path: slow span → service → operation → root cause (SQL query, external call,
contention, etc.).

Rules:
1. Every attribution MUST reference a specific finding_id from the input.
2. Build evidence chains that show the causal path from symptom to root cause.
3. If a slow span contains a SQL query, extract and include it.
4. Confidence: 0.9+ if direct span evidence, 0.6-0.8 if inferred from log patterns, <0.5 if speculative.
5. Build a service dependency graph showing which services call which.
6. Identify the critical path — the longest chain of synchronous calls.
7. Correlate log patterns (error spikes, warning clusters) with trace timing.
8. List any findings that could NOT be attributed to trace data.`;

const OUTPUT_INSTRUCTIONS = `Return ONLY valid JSON:
{
  "attributions": [
    {
      "finding_id": "bottleneck-1",
      "slow_span": "span name or ID",
      "service": "service-name",
      "operation": "GET /api/users",
      "duration_ms": 1500,
      "root_cause": "N+1 query pattern in user loader",
      "evidence_chain": [
        "HTTP handler received request (2ms)",
        "UserService.getAll() called (1ms)",
        "SELECT * FROM users executed 150 times (1450ms total)"
      ],
      "sql_query": "SELECT * FROM users WHERE org_id = $1",
      "confidence": 0.92
    }
  ],
  "service_dependency_graph": {
    "nodes": [{ "service": "api-gateway", "avg_latency_ms": 5 }],
    "edges": [{ "from": "api-gateway", "to": "user-service", "call_count": 1000, "avg_latency_ms": 50 }],
    "critical_path": ["api-gateway", "user-service", "postgres"]
  },
  "log_correlations": [
    {
      "finding_id": "bottleneck-1",
      "log_pattern": "Connection pool exhausted",
      "occurrences": 47,
      "severity": "high",
      "sample_message": "WARN: Pool has no available connections"
    }
  ],
  "unattributed_findings": ["anomaly-3"]
}

Return ONLY valid JSON, no markdown fences.`;

function buildPrompt(input) {
  const parts = [`Correlate the following performance findings with trace and log data.\n`];

  if (input.findings) {
    parts.push(`PERFORMANCE FINDINGS:\n${JSON.stringify(input.findings, null, 2)}\n`);
  }
  if (input.spans) {
    const spanSample = Array.isArray(input.spans) ? input.spans.slice(0, 200) : input.spans;
    parts.push(`OPENTELEMETRY SPANS (${Array.isArray(input.spans) ? input.spans.length : 'N/A'} total, showing sample):\n${JSON.stringify(spanSample, null, 2)}\n`);
  }
  if (input.logs) {
    const logSample = Array.isArray(input.logs) ? input.logs.slice(0, 100) : input.logs;
    parts.push(`APPLICATION LOGS (${Array.isArray(input.logs) ? input.logs.length : 'N/A'} total, showing sample):\n${JSON.stringify(logSample, null, 2)}\n`);
  }
  if (input.slow_traces) {
    parts.push(`SLOWEST TRACES:\n${JSON.stringify(input.slow_traces.slice(0, 50), null, 2)}\n`);
  }
  if (input.services) {
    parts.push(`KNOWN SERVICES:\n${JSON.stringify(input.services, null, 2)}\n`);
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
  const findings = input.findings || {};
  const bottlenecks = findings.bottlenecks || [];
  const findingIds = bottlenecks.map((b, i) => b.id || `bottleneck-${i}`);

  const attributions = bottlenecks.slice(0, 5).map((b, i) => ({
    finding_id: b.id || `bottleneck-${i}`,
    slow_span: 'unknown',
    service: b.component || 'unknown-service',
    operation: b.component || 'unknown',
    duration_ms: 0,
    root_cause: 'Requires trace data for root cause analysis',
    evidence_chain: ['No OTel spans available for correlation'],
    sql_query: null,
    confidence: 0.1,
  }));

  return {
    attributions,
    service_dependency_graph: {
      nodes: [],
      edges: [],
      critical_path: [],
    },
    log_correlations: [],
    unattributed_findings: findingIds.filter((_, i) => i >= 5),
    _meta: { agent: AGENT_NAME, model: 'fallback', attempt: 0 },
  };
}

export { AGENT_NAME, traceCorrelatorSchema as SCHEMA };
