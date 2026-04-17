import { describe, it, expect } from 'vitest';
import { OTelCollector } from '../otel-collector.js';

describe('OTelCollector.generateTraceContext', () => {
  const collector = new OTelCollector();

  it('produces a 32-character traceId', () => {
    const ctx = collector.generateTraceContext();
    expect(ctx.traceId).toHaveLength(32);
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces a 16-character spanId', () => {
    const ctx = collector.generateTraceContext();
    expect(ctx.spanId).toHaveLength(16);
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces valid traceparent format', () => {
    const ctx = collector.generateTraceContext();
    expect(ctx.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(ctx.traceparent).toBe(`00-${ctx.traceId}-${ctx.spanId}-01`);
  });
});

describe('OTelCollector.generateVUHeaders', () => {
  const collector = new OTelCollector();

  it('includes traceparent header', () => {
    const headers = collector.generateVUHeaders('run-1', 5, 10);
    expect(headers).toHaveProperty('traceparent');
    expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('includes sarfat run/vu/iter headers', () => {
    const headers = collector.generateVUHeaders('run-abc', 3, 7);
    expect(headers['x-sarfat-run-id']).toBe('run-abc');
    expect(headers['x-sarfat-vu']).toBe('3');
    expect(headers['x-sarfat-iter']).toBe('7');
  });
});

describe('OTelCollector.parseOTLP', () => {
  const collector = new OTelCollector();

  it('extracts spans from resourceSpans', () => {
    const body = {
      resourceSpans: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'api-svc' } }] },
        scopeSpans: [{
          spans: [
            { traceId: 'abc123', spanId: 'span1', name: 'GET /users', startTimeUnixNano: '1000000', endTimeUnixNano: '2000000', status: { code: 1 }, attributes: [] },
            { traceId: 'abc123', spanId: 'span2', name: 'db.query', startTimeUnixNano: '1100000', endTimeUnixNano: '1500000', status: { code: 2 }, attributes: [] },
          ],
        }],
      }],
    };
    const { spans } = collector.parseOTLP(body);
    expect(spans).toHaveLength(2);
    expect(spans[0].service_name).toBe('api-svc');
    expect(spans[0].operation_name).toBe('GET /users');
    expect(spans[1].status_code).toBe('ERROR');
  });

  it('extracts logs from resourceLogs', () => {
    const body = {
      resourceLogs: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'worker' } }] },
        scopeLogs: [{
          logRecords: [
            { severityText: 'ERROR', body: { stringValue: 'Connection timeout' }, attributes: [], traceId: 't1', spanId: 's1' },
          ],
        }],
      }],
    };
    const { logs } = collector.parseOTLP(body);
    expect(logs).toHaveLength(1);
    expect(logs[0].service_name).toBe('worker');
    expect(logs[0].severity).toBe('ERROR');
    expect(logs[0].message).toBe('Connection timeout');
  });

  it('returns empty arrays when no data', () => {
    const { spans, logs } = collector.parseOTLP({});
    expect(spans).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });
});

describe('OTelCollector.flattenAttributes', () => {
  const collector = new OTelCollector();

  it('converts OTel attribute arrays to flat objects', () => {
    const attrs = [
      { key: 'http.method', value: { stringValue: 'GET' } },
      { key: 'http.status_code', value: { intValue: '200' } },
      { key: 'http.duration', value: { doubleValue: 1.5 } },
      { key: 'http.ok', value: { boolValue: true } },
    ];
    const flat = collector.flattenAttributes(attrs);
    expect(flat['http.method']).toBe('GET');
    expect(flat['http.status_code']).toBe(200);
    expect(flat['http.duration']).toBe(1.5);
    expect(flat['http.ok']).toBe(true);
  });

  it('returns empty object for null/undefined', () => {
    expect(collector.flattenAttributes(null)).toEqual({});
    expect(collector.flattenAttributes(undefined)).toEqual({});
  });
});

describe('OTelCollector.severityFromNumber', () => {
  const collector = new OTelCollector();

  it('maps 1-4 to TRACE', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(collector.severityFromNumber(n)).toBe('TRACE');
    }
  });

  it('maps 5-8 to DEBUG', () => {
    for (const n of [5, 6, 7, 8]) {
      expect(collector.severityFromNumber(n)).toBe('DEBUG');
    }
  });

  it('maps 9-12 to INFO', () => {
    expect(collector.severityFromNumber(9)).toBe('INFO');
    expect(collector.severityFromNumber(12)).toBe('INFO');
  });

  it('maps 13-16 to WARN', () => {
    expect(collector.severityFromNumber(13)).toBe('WARN');
    expect(collector.severityFromNumber(16)).toBe('WARN');
  });

  it('maps 17-20 to ERROR', () => {
    expect(collector.severityFromNumber(17)).toBe('ERROR');
    expect(collector.severityFromNumber(20)).toBe('ERROR');
  });

  it('maps 21+ to FATAL', () => {
    expect(collector.severityFromNumber(21)).toBe('FATAL');
    expect(collector.severityFromNumber(24)).toBe('FATAL');
  });

  it('returns INFO for null/undefined', () => {
    expect(collector.severityFromNumber(null)).toBe('INFO');
    expect(collector.severityFromNumber(undefined)).toBe('INFO');
  });
});

describe('OTelCollector.shouldSample', () => {
  it('always returns false with rate 0', () => {
    const collector = new OTelCollector();
    collector.sampleRate = 0; // set directly since constructor treats 0 as falsy
    for (let i = 0; i < 50; i++) {
      expect(collector.shouldSample()).toBe(false);
    }
  });

  it('always returns true with rate 1', () => {
    const collector = new OTelCollector({ sampleRate: 1 });
    for (let i = 0; i < 50; i++) {
      expect(collector.shouldSample()).toBe(true);
    }
  });
});

describe('OTelCollector.injectTraceHeaders', () => {
  const collector = new OTelCollector();

  it('injects header generation code into scripts with default export', () => {
    const script = 'export default function() { http.get("/"); }';
    const result = collector.injectTraceHeaders(script, 'run-xyz');
    expect(result).toContain('sarfatHeaders');
    expect(result).toContain('__sarfat_genTraceId');
    expect(result).toContain('run-xyz');
    expect(result).toContain('export default function');
  });

  it('returns unmodified script when no default export', () => {
    const script = 'function helper() { return 1; }';
    const result = collector.injectTraceHeaders(script, 'run-abc');
    expect(result).toBe(script);
  });
});
