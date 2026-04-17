/**
 * Agent #6 — Infra Correlator (Sonnet)
 *
 * Takes metric-analyst findings + infrastructure metrics + APM data,
 * outputs resource saturation mapping and capacity analysis.
 */

import Anthropic from '@anthropic-ai/sdk';
import { infraCorrelatorSchema, validateAgentOutput, schemaToPromptHint } from './schemas.js';

const SONNET = 'claude-sonnet-4-20250514';
const AGENT_NAME = 'infra-correlator-agent';

const SYSTEM_PROMPT = `You are an infrastructure performance expert for the Sarfat Load Testing Platform.

Given performance findings and infrastructure metrics (CPU, memory, disk, network, DB connections),
map each bottleneck to its infrastructure root cause.

Saturation thresholds:
- CPU: >80% = warning, >95% = critical
- Memory: >85% = warning, >95% = critical
- Disk I/O: >70% = warning, >90% = critical
- Network: >60% of bandwidth = warning
- DB connections: >80% of pool = warning, >95% = critical
- DB query time: p95 >100ms = warning, >500ms = critical

Capacity analysis rules:
1. Current ceiling = VU/RPS at which the FIRST resource hits saturation.
2. Headroom = % remaining before the first resource saturates at current growth.
3. Recommend scaling path: vertical if single-resource bottleneck, horizontal if compute-bound,
   optimize-first if software-level issue (query optimization, caching, connection pooling).`;

const OUTPUT_INSTRUCTIONS = `Return ONLY valid JSON:
{
  "resource_saturation_map": [
    {
      "resource": "CPU",
      "host": "app-server-1",
      "peak_utilization_percent": 92,
      "saturation_timestamp": "2026-04-09T14:32:00Z",
      "vus_at_saturation": 200,
      "rps_at_saturation": 500,
      "application_impact": "Response times doubled beyond 200 VUs",
      "recommendation": "Scale horizontally or optimize CPU-intensive operations",
      "confidence": 0.88
    }
  ],
  "capacity_analysis": {
    "current_ceiling_vus": 250,
    "current_ceiling_rps": 600,
    "headroom_percent": 15,
    "first_resource_to_saturate": "CPU",
    "scaling_path": "horizontal",
    "recommendations": ["Add auto-scaling policy at 70% CPU"]
  },
  "database_analysis": {
    "connection_pool_health": "healthy — 40% utilisation",
    "query_performance_trend": "stable",
    "slow_queries_identified": 2,
    "recommendations": ["Add index on users.org_id"]
  },
  "network_analysis": {
    "bandwidth_utilization": "low — 15% of available bandwidth",
    "latency_contribution_ms": 5,
    "dns_overhead_ms": 2,
    "tls_overhead_ms": 8
  },
  "apm_insights": ["GC pauses averaging 50ms every 30s"]
}

Return ONLY valid JSON, no markdown fences.`;

function buildPrompt(input) {
  const parts = [`Correlate performance findings with infrastructure metrics.\n`];

  if (input.findings) {
    parts.push(`PERFORMANCE FINDINGS:\n${JSON.stringify(input.findings, null, 2)}\n`);
  }
  if (input.infra_metrics) {
    const sample = Array.isArray(input.infra_metrics) ? input.infra_metrics.slice(0, 200) : input.infra_metrics;
    parts.push(`INFRASTRUCTURE METRICS (${Array.isArray(input.infra_metrics) ? input.infra_metrics.length : 'N/A'} samples):\n${JSON.stringify(sample, null, 2)}\n`);
  }
  if (input.apm_data) {
    parts.push(`APM DATA:\n${JSON.stringify(input.apm_data, null, 2)}\n`);
  }
  if (input.topology) {
    parts.push(`INFRASTRUCTURE TOPOLOGY:\n${JSON.stringify(input.topology, null, 2)}\n`);
  }
  if (input.k6_summary) {
    parts.push(`K6 SUMMARY:\n${JSON.stringify(input.k6_summary, null, 2)}\n`);
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
  const infraMetrics = input.infra_metrics || [];
  const cpuMetrics = infraMetrics.filter(m => m.metric_name?.includes('cpu'));
  const memMetrics = infraMetrics.filter(m => m.metric_name?.includes('mem'));

  const peakCpu = cpuMetrics.reduce((max, m) => Math.max(max, m.value || 0), 0);
  const peakMem = memMetrics.reduce((max, m) => Math.max(max, m.value || 0), 0);

  const saturationMap = [];
  if (peakCpu > 0) {
    saturationMap.push({
      resource: 'CPU',
      host: cpuMetrics[0]?.host || 'unknown',
      peak_utilization_percent: peakCpu,
      saturation_timestamp: null,
      vus_at_saturation: null,
      rps_at_saturation: null,
      application_impact: peakCpu > 80 ? 'Likely contributing to latency increases' : 'Within acceptable range',
      recommendation: peakCpu > 80 ? 'Consider horizontal scaling or optimising CPU-intensive operations' : 'No action needed',
      confidence: 0.5,
    });
  }
  if (peakMem > 0) {
    saturationMap.push({
      resource: 'Memory',
      host: memMetrics[0]?.host || 'unknown',
      peak_utilization_percent: peakMem,
      saturation_timestamp: null,
      vus_at_saturation: null,
      rps_at_saturation: null,
      application_impact: peakMem > 85 ? 'Risk of OOM or excessive GC pressure' : 'Within acceptable range',
      recommendation: peakMem > 85 ? 'Increase memory or investigate memory leaks' : 'No action needed',
      confidence: 0.5,
    });
  }

  return {
    resource_saturation_map: saturationMap,
    capacity_analysis: {
      current_ceiling_vus: null,
      current_ceiling_rps: null,
      headroom_percent: null,
      first_resource_to_saturate: saturationMap[0]?.resource || 'unknown',
      scaling_path: 'optimize-first',
      recommendations: [
        'Collect more infrastructure metrics for accurate capacity analysis',
        'Enable APM integration for deeper insights',
      ],
    },
    database_analysis: {
      connection_pool_health: 'Unknown — no DB metrics available',
      query_performance_trend: 'Unknown',
      slow_queries_identified: 0,
      recommendations: ['Enable database monitoring'],
    },
    network_analysis: {
      bandwidth_utilization: 'Unknown',
      latency_contribution_ms: null,
      dns_overhead_ms: null,
      tls_overhead_ms: null,
    },
    apm_insights: ['No APM data available — enable APM integration for runtime insights'],
    _meta: { agent: AGENT_NAME, model: 'fallback', attempt: 0 },
  };
}

export { AGENT_NAME, infraCorrelatorSchema as SCHEMA };
