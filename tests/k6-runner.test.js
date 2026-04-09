import { describe, it, expect } from 'vitest';
import { generateK6Script, parseK6Summary, extractThresholdResults } from '../k6-runner.js';

describe('generateK6Script', () => {
  it('generates script from test config', () => {
    const test = {
      test_type: 'load',
      config: {
        target_url: 'https://example.com',
        vus: 20,
        duration: '60s',
        endpoints: [
          { method: 'GET', url: 'https://example.com/api', name: 'api_root' },
        ],
      },
    };
    const script = generateK6Script(test);
    expect(script).toContain("import http from 'k6/http'");
    expect(script).toContain('https://example.com/api');
    expect(script).toContain('export const options');
    expect(script).toContain('stages');
  });

  it('returns existing script_content when available', () => {
    const test = {
      script_content: 'console.log("custom script");',
      config: {},
    };
    expect(generateK6Script(test)).toBe('console.log("custom script");');
  });

  it('generates different stages for different test types', () => {
    const types = ['load', 'stress', 'spike', 'soak', 'breakpoint', 'smoke'];
    const scripts = types.map(type => generateK6Script({
      test_type: type,
      config: { target_url: 'http://localhost', vus: 10, duration: '30s' },
    }));

    const uniqueScripts = new Set(scripts);
    expect(uniqueScripts.size).toBe(types.length);
  });

  it('includes POST body for non-GET endpoints', () => {
    const test = {
      test_type: 'load',
      config: {
        target_url: 'http://localhost',
        vus: 5,
        duration: '10s',
        endpoints: [
          { method: 'POST', url: 'http://localhost/api/data', body: { name: 'test' }, name: 'create' },
        ],
      },
    };
    const script = generateK6Script(test);
    expect(script).toContain('http.post');
    expect(script).toContain('name');
  });
});

describe('parseK6Summary', () => {
  it('extracts key metrics from k6 summary', () => {
    const summary = {
      metrics: {
        http_reqs: { values: { count: 5000 } },
        http_req_duration: {
          values: { avg: 150.5, min: 10.2, max: 2500.0, med: 120.0, 'p(90)': 300.0, 'p(95)': 500.0, 'p(99)': 1200.0 },
        },
        http_req_failed: { values: { rate: 0.005 } },
        data_received: { values: { count: 1500000 } },
        data_sent: { values: { count: 500000 } },
        vus_max: { values: { value: 50 } },
        iterations: { values: { count: 4900 } },
        iteration_duration: { values: { avg: 1500 } },
      },
    };

    const result = parseK6Summary(summary);
    expect(result.http_reqs).toBe(5000);
    expect(result.http_req_duration_avg).toBe(150.5);
    expect(result.http_req_duration_p95).toBe(500.0);
    expect(result.http_req_failed_rate).toBe(0.005);
    expect(result.vus_max).toBe(50);
  });

  it('returns null for invalid summary', () => {
    expect(parseK6Summary(null)).toBeNull();
    expect(parseK6Summary({})).toBeNull();
    expect(parseK6Summary({ metrics: null })).toBeNull();
  });

  it('handles missing metrics gracefully', () => {
    const summary = {
      metrics: {
        http_reqs: { values: { count: 100 } },
      },
    };
    const result = parseK6Summary(summary);
    expect(result.http_reqs).toBe(100);
    expect(result.http_req_duration_avg).toBeNull();
  });
});

describe('extractThresholdResults', () => {
  it('extracts threshold pass/fail from summary', () => {
    const summary = {
      metrics: {
        http_req_duration: {
          thresholds: { 'p(95)<500': { ok: true } },
          values: {},
        },
        http_req_failed: {
          thresholds: { 'rate<0.01': { ok: false } },
          values: {},
        },
      },
    };

    const result = extractThresholdResults(summary);
    expect(Object.keys(result)).toHaveLength(2);

    const passing = Object.values(result).filter(t => t.passed);
    const failing = Object.values(result).filter(t => !t.passed);
    expect(passing).toHaveLength(1);
    expect(failing).toHaveLength(1);
  });

  it('returns empty object for no thresholds', () => {
    expect(extractThresholdResults(null)).toEqual({});
    expect(extractThresholdResults({})).toEqual({});
  });
});
