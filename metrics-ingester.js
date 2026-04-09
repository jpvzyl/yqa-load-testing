import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import * as db from './db.js';

const BATCH_SIZE = 500;

export async function ingestK6JsonOutput(runId, metricsPath) {
  if (!existsSync(metricsPath)) {
    console.warn(`[Metrics] No metrics file found at ${metricsPath}`);
    return { ingested: 0, endpoints: [] };
  }

  const endpointMap = new Map();
  let batch = [];
  let ingested = 0;

  const rl = createInterface({
    input: createReadStream(metricsPath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch (_e) {
      continue;
    }

    if (entry.type !== 'Point') continue;

    const metricName = entry.metric;
    const metricType = inferMetricType(metricName);
    const value = entry.data?.value;
    const time = entry.data?.time;
    const tags = entry.data?.tags || {};

    if (value === undefined || value === null) continue;

    batch.push({
      time: time ? new Date(time) : new Date(),
      run_id: runId,
      metric_name: metricName,
      metric_type: metricType,
      value,
      tags,
    });

    if (metricName === 'http_req_duration' && tags.url) {
      accumulateEndpoint(endpointMap, tags, value);
    }

    if (batch.length >= BATCH_SIZE) {
      await db.insertRunMetrics(batch);
      ingested += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await db.insertRunMetrics(batch);
    ingested += batch.length;
  }

  const endpoints = finalizeEndpoints(endpointMap, runId);
  if (endpoints.length > 0) {
    await db.upsertEndpointMetrics(runId, endpoints);
  }

  console.log(`[Metrics] Ingested ${ingested} data points, ${endpoints.length} endpoints for run ${runId}`);
  return { ingested, endpoints };
}

function inferMetricType(name) {
  if (name.includes('duration') || name.includes('waiting') || name.includes('blocked') ||
      name.includes('connecting') || name.includes('tls_handshaking') || name.includes('receiving') ||
      name.includes('sending') || name === 'iteration_duration') return 'trend';
  if (name.includes('reqs') || name.includes('iterations') || name.includes('data_')) return 'counter';
  if (name.includes('failed') || name.includes('rate') || name === 'errors') return 'rate';
  if (name === 'vus' || name === 'vus_max') return 'gauge';
  return 'trend';
}

function accumulateEndpoint(map, tags, duration) {
  const key = `${tags.method || 'GET'}::${tags.url || tags.name || 'unknown'}`;

  if (!map.has(key)) {
    map.set(key, {
      method: tags.method || 'GET',
      endpoint: tags.url || tags.name || 'unknown',
      durations: [],
      errors: 0,
      totalSize: 0,
      sizeCount: 0,
      statusCodes: {},
    });
  }

  const ep = map.get(key);
  ep.durations.push(duration);

  const status = tags.status || '0';
  ep.statusCodes[status] = (ep.statusCodes[status] || 0) + 1;

  if (parseInt(status) >= 400 || status === '0') {
    ep.errors++;
  }
}

function finalizeEndpoints(map, runId) {
  return Array.from(map.values()).map(ep => {
    const durations = ep.durations.sort((a, b) => a - b);
    const count = durations.length;
    const sum = durations.reduce((s, d) => s + d, 0);
    const totalDuration = count > 0 ? (durations[count - 1] - durations[0]) / 1000 : 1;

    return {
      run_id: runId,
      endpoint: ep.endpoint,
      method: ep.method,
      request_count: count,
      error_count: ep.errors,
      avg_duration: sum / count,
      min_duration: durations[0],
      max_duration: durations[count - 1],
      p50_duration: percentile(durations, 0.50),
      p90_duration: percentile(durations, 0.90),
      p95_duration: percentile(durations, 0.95),
      p99_duration: percentile(durations, 0.99),
      avg_size: ep.sizeCount > 0 ? ep.totalSize / ep.sizeCount : 0,
      throughput_rps: count / Math.max(totalDuration, 1),
      error_rate: count > 0 ? ep.errors / count : 0,
      status_codes: ep.statusCodes,
    };
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function buildRealtimeMetrics(k6Output) {
  const metrics = [];
  const lines = k6Output.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'Point') {
        metrics.push({
          metric_name: entry.metric,
          value: entry.data?.value,
          time: entry.data?.time,
          tags: entry.data?.tags || {},
        });
      }
    } catch (_e) { /* skip non-JSON lines */ }
  }

  return metrics;
}
