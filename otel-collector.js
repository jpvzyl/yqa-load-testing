import { v4 as uuidv4 } from 'uuid';
import * as dbv2 from './db-v2.js';

export class OTelCollector {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate !== undefined ? options.sampleRate : parseFloat(process.env.OTEL_SAMPLE_RATE || '0.1');
    this.maxSpansPerRun = options.maxSpansPerRun || 10000;
    this.maxLogsPerRun = options.maxLogsPerRun || 5000;
    this.batchSize = options.batchSize || 100;
    this.spanBuffer = new Map();
    this.logBuffer = new Map();
    this.flushInterval = null;
  }

  start() {
    this.flushInterval = setInterval(() => this.flushAll(), 5000);
    console.log(`[OTel] Collector started (sample rate: ${this.sampleRate * 100}%)`);
  }

  stop() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flushAll();
  }

  generateTraceContext() {
    const traceId = uuidv4().replace(/-/g, '');
    const spanId = uuidv4().replace(/-/g, '').slice(0, 16);
    return {
      traceId,
      spanId,
      traceparent: `00-${traceId}-${spanId}-01`,
      headers: {
        'traceparent': `00-${traceId}-${spanId}-01`,
      },
    };
  }

  generateVUHeaders(runId, vu, iter) {
    const ctx = this.generateTraceContext();
    return {
      ...ctx.headers,
      'x-sarfat-run-id': runId,
      'x-sarfat-vu': String(vu),
      'x-sarfat-iter': String(iter),
    };
  }

  injectTraceHeaders(scriptContent, runId) {
    const injection = `
// Sarfat OTel trace injection
const __sarfat_genTraceId = () => {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 32; i++) id += hex[Math.floor(Math.random() * 16)];
  return id;
};
const __sarfat_genSpanId = () => {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 16; i++) id += hex[Math.floor(Math.random() * 16)];
  return id;
};

function sarfatHeaders() {
  const traceId = __sarfat_genTraceId();
  const spanId = __sarfat_genSpanId();
  return {
    'traceparent': '00-' + traceId + '-' + spanId + '-01',
    'x-sarfat-run-id': __ENV.SARFAT_RUN_ID || '${runId}',
    'x-sarfat-vu': String(__VU),
    'x-sarfat-iter': String(__ITER),
  };
}
`;
    if (scriptContent.includes('export default function')) {
      return injection + '\n' + scriptContent;
    }
    return scriptContent;
  }

  shouldSample() {
    return Math.random() < this.sampleRate;
  }

  async ingestSpan(runId, span) {
    if (!this.shouldSample() && span.status_code !== 'ERROR') return;

    if (!this.spanBuffer.has(runId)) this.spanBuffer.set(runId, []);
    const buffer = this.spanBuffer.get(runId);

    buffer.push({
      run_id: runId,
      trace_id: span.traceId || span.trace_id,
      span_id: span.spanId || span.span_id,
      parent_span_id: span.parentSpanId || span.parent_span_id,
      service_name: span.serviceName || span.service_name || 'unknown',
      operation_name: span.operationName || span.operation_name || span.name,
      duration_ms: span.duration_ms || (span.endTimeUnixNano && span.startTimeUnixNano
        ? (span.endTimeUnixNano - span.startTimeUnixNano) / 1e6 : null),
      status_code: span.status?.code || span.status_code,
      attributes: span.attributes || {},
      events: span.events || [],
      started_at: span.started_at || new Date(span.startTimeUnixNano ? span.startTimeUnixNano / 1e6 : Date.now()),
      ended_at: span.ended_at || (span.endTimeUnixNano ? new Date(span.endTimeUnixNano / 1e6) : null),
    });

    if (buffer.length >= this.batchSize) {
      await this.flushSpans(runId);
    }
  }

  async ingestSpanBatch(runId, spans) {
    for (const span of spans) {
      await this.ingestSpan(runId, span);
    }
  }

  async ingestLog(runId, log) {
    if (!this.logBuffer.has(runId)) this.logBuffer.set(runId, []);
    const buffer = this.logBuffer.get(runId);

    buffer.push({
      run_id: runId,
      trace_id: log.traceId || log.trace_id,
      span_id: log.spanId || log.span_id,
      service_name: log.serviceName || log.service_name || 'unknown',
      severity: log.severity || log.severityText || 'INFO',
      message: log.body || log.message || '',
      attributes: log.attributes || {},
    });

    if (buffer.length >= this.batchSize) {
      await this.flushLogs(runId);
    }
  }

  async ingestLogBatch(runId, logs) {
    for (const log of logs) {
      await this.ingestLog(runId, log);
    }
  }

  parseOTLP(body) {
    const spans = [];
    const logs = [];

    if (body.resourceSpans) {
      for (const rs of body.resourceSpans) {
        const serviceName = rs.resource?.attributes?.find(a => a.key === 'service.name')?.value?.stringValue;
        for (const ss of rs.scopeSpans || []) {
          for (const span of ss.spans || []) {
            spans.push({
              trace_id: span.traceId,
              span_id: span.spanId,
              parent_span_id: span.parentSpanId,
              service_name: serviceName,
              operation_name: span.name,
              startTimeUnixNano: parseInt(span.startTimeUnixNano),
              endTimeUnixNano: parseInt(span.endTimeUnixNano),
              status_code: span.status?.code === 2 ? 'ERROR' : 'OK',
              attributes: this.flattenAttributes(span.attributes),
              events: (span.events || []).map(e => ({
                name: e.name,
                timestamp: e.timeUnixNano,
                attributes: this.flattenAttributes(e.attributes),
              })),
            });
          }
        }
      }
    }

    if (body.resourceLogs) {
      for (const rl of body.resourceLogs) {
        const serviceName = rl.resource?.attributes?.find(a => a.key === 'service.name')?.value?.stringValue;
        for (const sl of rl.scopeLogs || []) {
          for (const log of sl.logRecords || []) {
            logs.push({
              service_name: serviceName,
              severity: log.severityText || this.severityFromNumber(log.severityNumber),
              message: log.body?.stringValue || JSON.stringify(log.body) || '',
              trace_id: log.traceId,
              span_id: log.spanId,
              attributes: this.flattenAttributes(log.attributes),
            });
          }
        }
      }
    }

    return { spans, logs };
  }

  flattenAttributes(attrs) {
    if (!attrs || !Array.isArray(attrs)) return {};
    const result = {};
    for (const attr of attrs) {
      const val = attr.value;
      if (val.stringValue !== undefined) result[attr.key] = val.stringValue;
      else if (val.intValue !== undefined) result[attr.key] = parseInt(val.intValue);
      else if (val.doubleValue !== undefined) result[attr.key] = val.doubleValue;
      else if (val.boolValue !== undefined) result[attr.key] = val.boolValue;
      else result[attr.key] = JSON.stringify(val);
    }
    return result;
  }

  severityFromNumber(num) {
    if (!num) return 'INFO';
    if (num <= 4) return 'TRACE';
    if (num <= 8) return 'DEBUG';
    if (num <= 12) return 'INFO';
    if (num <= 16) return 'WARN';
    if (num <= 20) return 'ERROR';
    return 'FATAL';
  }

  async flushSpans(runId) {
    const buffer = this.spanBuffer.get(runId);
    if (!buffer || buffer.length === 0) return;
    const batch = buffer.splice(0, this.batchSize);
    try {
      await dbv2.insertTraces(batch);
    } catch (err) {
      console.error(`[OTel] Failed to flush spans for ${runId}: ${err.message}`);
    }
  }

  async flushLogs(runId) {
    const buffer = this.logBuffer.get(runId);
    if (!buffer || buffer.length === 0) return;
    const batch = buffer.splice(0, this.batchSize);
    try {
      await dbv2.insertLogs(batch);
    } catch (err) {
      console.error(`[OTel] Failed to flush logs for ${runId}: ${err.message}`);
    }
  }

  async flushAll() {
    for (const runId of this.spanBuffer.keys()) await this.flushSpans(runId);
    for (const runId of this.logBuffer.keys()) await this.flushLogs(runId);
  }

  getStatus() {
    return {
      sample_rate: this.sampleRate,
      buffered_spans: Array.from(this.spanBuffer.values()).reduce((s, b) => s + b.length, 0),
      buffered_logs: Array.from(this.logBuffer.values()).reduce((s, b) => s + b.length, 0),
      active_runs: this.spanBuffer.size,
    };
  }
}

export class TraceCorrelator {
  async correlateRunWithTraces(runId) {
    const [slowTraces, endpointMetrics] = await Promise.all([
      dbv2.getSlowTraces(runId, 500, 100),
      (await import('./db.js')).getPool().query(
        'SELECT * FROM endpoint_metrics WHERE run_id = $1 ORDER BY p95_duration DESC', [runId]
      ),
    ]);

    const correlations = [];
    const endpointMap = new Map();
    for (const ep of endpointMetrics.rows) {
      endpointMap.set(`${ep.method} ${ep.endpoint}`, ep);
    }

    const tracesByService = {};
    for (const trace of slowTraces) {
      const service = trace.service_name || 'unknown';
      if (!tracesByService[service]) tracesByService[service] = [];
      tracesByService[service].push(trace);
    }

    for (const [service, traces] of Object.entries(tracesByService)) {
      const avgDuration = traces.reduce((s, t) => s + (t.duration_ms || 0), 0) / traces.length;
      const maxDuration = Math.max(...traces.map(t => t.duration_ms || 0));
      const operations = [...new Set(traces.map(t => t.operation_name))];

      correlations.push({
        service,
        slow_span_count: traces.length,
        avg_duration_ms: avgDuration,
        max_duration_ms: maxDuration,
        operations,
        sample_trace_ids: traces.slice(0, 5).map(t => t.trace_id),
      });
    }

    const tracesByOperation = {};
    for (const trace of slowTraces) {
      const op = trace.operation_name || 'unknown';
      if (!tracesByOperation[op]) tracesByOperation[op] = [];
      tracesByOperation[op].push(trace);
    }

    const hotspots = Object.entries(tracesByOperation)
      .map(([op, traces]) => ({
        operation: op,
        count: traces.length,
        avg_duration_ms: traces.reduce((s, t) => s + (t.duration_ms || 0), 0) / traces.length,
        services: [...new Set(traces.map(t => t.service_name))],
      }))
      .sort((a, b) => b.avg_duration_ms - a.avg_duration_ms)
      .slice(0, 20);

    return {
      run_id: runId,
      total_slow_traces: slowTraces.length,
      correlations_by_service: correlations.sort((a, b) => b.avg_duration_ms - a.avg_duration_ms),
      hotspots,
      p99_traces: slowTraces.slice(0, 10).map(t => ({
        trace_id: t.trace_id,
        service: t.service_name,
        operation: t.operation_name,
        duration_ms: t.duration_ms,
        started_at: t.started_at,
      })),
    };
  }

  async getTraceWaterfall(traceId) {
    const spans = await dbv2.getTraceById(traceId);
    if (spans.length === 0) return null;

    const root = spans.find(s => !s.parent_span_id) || spans[0];
    const byParent = {};
    for (const span of spans) {
      const parent = span.parent_span_id || 'root';
      if (!byParent[parent]) byParent[parent] = [];
      byParent[parent].push(span);
    }

    function buildTree(spanId) {
      const children = byParent[spanId] || [];
      return children.map(child => ({
        span_id: child.span_id,
        service: child.service_name,
        operation: child.operation_name,
        duration_ms: child.duration_ms,
        status: child.status_code,
        attributes: child.attributes,
        children: buildTree(child.span_id),
      }));
    }

    return {
      trace_id: traceId,
      root_service: root.service_name,
      root_operation: root.operation_name,
      total_duration_ms: root.duration_ms,
      span_count: spans.length,
      tree: {
        span_id: root.span_id,
        service: root.service_name,
        operation: root.operation_name,
        duration_ms: root.duration_ms,
        status: root.status_code,
        children: buildTree(root.span_id),
      },
    };
  }
}

export class LogCorrelator {
  async getErrorLogsForRun(runId, limit = 100) {
    return dbv2.getLogsByRun(runId, 'ERROR', limit);
  }

  async getLogsForTrace(traceId) {
    return dbv2.getLogsByTrace(traceId);
  }

  async correlateErrorsWithPerformance(runId) {
    const [errors, metrics] = await Promise.all([
      dbv2.getLogsByRun(runId, 'ERROR', 500),
      (await import('./db.js')).getPool().query(
        'SELECT * FROM run_metrics WHERE run_id = $1 AND metric_name = \'http_req_duration\' ORDER BY time ASC', [runId]
      ),
    ]);

    const errorTimeline = {};
    for (const log of errors) {
      const minute = new Date(log.timestamp).toISOString().slice(0, 16);
      if (!errorTimeline[minute]) errorTimeline[minute] = 0;
      errorTimeline[minute]++;
    }

    const errorsByService = {};
    for (const log of errors) {
      const svc = log.service_name || 'unknown';
      if (!errorsByService[svc]) errorsByService[svc] = { count: 0, messages: new Set() };
      errorsByService[svc].count++;
      errorsByService[svc].messages.add(log.message.slice(0, 200));
    }

    return {
      total_errors: errors.length,
      error_timeline: errorTimeline,
      errors_by_service: Object.entries(errorsByService).map(([svc, data]) => ({
        service: svc,
        count: data.count,
        unique_messages: [...data.messages].slice(0, 10),
      })),
      sample_errors: errors.slice(0, 20).map(e => ({
        timestamp: e.timestamp,
        service: e.service_name,
        message: e.message.slice(0, 500),
        trace_id: e.trace_id,
      })),
    };
  }
}

export class DatabaseCorrelator {
  async correlateWithPgStatStatements(runId, pgConnection) {
    if (!pgConnection) return { available: false, message: 'No PostgreSQL connection for SUT' };

    try {
      const result = await pgConnection.query(`
        SELECT query, calls, total_exec_time, mean_exec_time, stddev_exec_time,
               rows, shared_blks_hit, shared_blks_read
        FROM pg_stat_statements
        ORDER BY total_exec_time DESC
        LIMIT 20
      `);

      const queries = result.rows.map(row => ({
        query: row.query.slice(0, 500),
        calls: parseInt(row.calls),
        total_time_ms: parseFloat(row.total_exec_time),
        mean_time_ms: parseFloat(row.mean_exec_time),
        stddev_ms: parseFloat(row.stddev_exec_time),
        rows_returned: parseInt(row.rows),
        cache_hit_ratio: row.shared_blks_hit + row.shared_blks_read > 0
          ? (row.shared_blks_hit / (row.shared_blks_hit + row.shared_blks_read) * 100).toFixed(1)
          : 100,
      }));

      return {
        available: true,
        top_queries: queries,
        total_queries: queries.length,
        slowest_mean: queries[0]?.mean_time_ms || 0,
        recommendations: this.generateDbRecommendations(queries),
      };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  generateDbRecommendations(queries) {
    const recs = [];
    for (const q of queries) {
      if (q.mean_time_ms > 100) {
        recs.push(`Query averaging ${q.mean_time_ms.toFixed(0)}ms needs optimization: ${q.query.slice(0, 100)}...`);
      }
      if (parseFloat(q.cache_hit_ratio) < 95) {
        recs.push(`Low cache hit ratio (${q.cache_hit_ratio}%) — consider adding indexes or increasing shared_buffers`);
      }
      if (q.stddev_ms > q.mean_time_ms * 2) {
        recs.push(`High variance query (stddev ${q.stddev_ms.toFixed(0)}ms vs mean ${q.mean_time_ms.toFixed(0)}ms) indicates inconsistent performance`);
      }
    }
    return recs.slice(0, 10);
  }
}

let defaultCollector = null;

export function getOTelCollector(options) {
  if (!defaultCollector) {
    defaultCollector = new OTelCollector(options);
  }
  return defaultCollector;
}

export const traceCorrelator = new TraceCorrelator();
export const logCorrelator = new LogCorrelator();
export const dbCorrelator = new DatabaseCorrelator();
