import { describe, it, expect } from 'vitest';
import { WorkloadModeler } from '../workload-modeler.js';

const modeler = new WorkloadModeler();

describe('WorkloadModeler.sanitizeName', () => {
  it('removes special characters and lowercases', () => {
    expect(modeler.sanitizeName('User Login Flow')).toBe('user_login_flow');
  });

  it('replaces dashes and other punctuation', () => {
    expect(modeler.sanitizeName('API-v2/checkout')).toBe('api_v2_checkout');
  });

  it('preserves underscores and alphanumerics', () => {
    expect(modeler.sanitizeName('my_test_123')).toBe('my_test_123');
  });
});

describe('WorkloadModeler.validateModel', () => {
  it('fails when scenario_mix is empty', () => {
    const result = modeler.validateModel({ scenario_mix: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No scenarios defined');
  });

  it('passes for a valid model', () => {
    const model = {
      scenario_mix: [
        { name: 'browse', weight: 3 },
        { name: 'checkout', weight: 1 },
      ],
    };
    const result = modeler.validateModel(model);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when a scenario has negative weight', () => {
    const model = {
      scenario_mix: [{ name: 'bad', weight: -1 }],
    };
    const result = modeler.validateModel(model);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('negative weight'))).toBe(true);
  });

  it('fails on duplicate scenario names', () => {
    const model = {
      scenario_mix: [
        { name: 'login', weight: 1 },
        { name: 'login', weight: 2 },
      ],
    };
    const result = modeler.validateModel(model);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
  });
});

describe('WorkloadModeler.describeModel', () => {
  it('calculates correct percentage distribution', () => {
    const model = {
      name: 'Production Mix',
      scenario_mix: [
        { name: 'browse', weight: 7 },
        { name: 'search', weight: 2 },
        { name: 'checkout', weight: 1 },
      ],
      global_config: { vus: 100, duration: '10m' },
      regions: ['us-east-1'],
    };

    const desc = modeler.describeModel(model);
    expect(desc.name).toBe('Production Mix');
    expect(desc.total_scenarios).toBe(3);
    expect(desc.distribution[0].percentage).toBe('70.0%');
    expect(desc.distribution[1].percentage).toBe('20.0%');
    expect(desc.distribution[2].percentage).toBe('10.0%');
  });
});

describe('WorkloadModeler.buildCompositeScript', () => {
  const model = {
    scenario_mix: [
      { name: 'browse', weight: 3, target_url: '/products' },
      { name: 'checkout', weight: 1, target_url: '/checkout' },
    ],
    global_config: { vus: 50, duration: '5m', p95_threshold: 300, error_rate_threshold: 0.02 },
  };

  it('generates scenario functions', () => {
    const script = modeler.buildCompositeScript(model);
    expect(script).toContain('export function browse()');
    expect(script).toContain('export function checkout()');
  });

  it('includes thresholds', () => {
    const script = modeler.buildCompositeScript(model);
    expect(script).toContain('thresholds');
    expect(script).toContain("'http_req_duration'");
    expect(script).toContain("'errors'");
  });

  it('references __ENV.BASE_URL', () => {
    const script = modeler.buildCompositeScript(model);
    expect(script).toContain('__ENV.BASE_URL');
  });

  it('throws when no scenarios defined', () => {
    expect(() => modeler.buildCompositeScript({ scenario_mix: [] })).toThrow('no scenarios');
  });
});
