import { describe, it, expect } from 'vitest';
import { buildRealtimeMetrics } from '../metrics-ingester.js';

describe('buildRealtimeMetrics', () => {
  it('parses k6 JSON output lines', () => {
    const output = [
      JSON.stringify({ type: 'Point', metric: 'http_req_duration', data: { value: 150.5, time: '2026-01-01T00:00:00Z', tags: { url: 'http://example.com' } } }),
      JSON.stringify({ type: 'Point', metric: 'vus', data: { value: 10, time: '2026-01-01T00:00:00Z', tags: {} } }),
      JSON.stringify({ type: 'Metric', metric: 'http_reqs', data: {} }),
    ].join('\n');

    const metrics = buildRealtimeMetrics(output);
    expect(metrics).toHaveLength(2);
    expect(metrics[0].metric_name).toBe('http_req_duration');
    expect(metrics[0].value).toBe(150.5);
    expect(metrics[1].metric_name).toBe('vus');
    expect(metrics[1].value).toBe(10);
  });

  it('handles empty input', () => {
    expect(buildRealtimeMetrics('')).toEqual([]);
    expect(buildRealtimeMetrics('\n\n')).toEqual([]);
  });

  it('skips invalid JSON lines', () => {
    const output = 'not json\n' + JSON.stringify({ type: 'Point', metric: 'vus', data: { value: 5 } });
    const metrics = buildRealtimeMetrics(output);
    expect(metrics).toHaveLength(1);
  });
});
