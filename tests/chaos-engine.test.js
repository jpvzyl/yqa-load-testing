import { describe, it, expect } from 'vitest';
import { ChaosEngine, FAULT_CATALOG } from '../chaos-engine.js';

const engine = new ChaosEngine();

describe('FAULT_CATALOG', () => {
  it('contains all 14 fault types', () => {
    const expectedTypes = [
      'network_latency', 'packet_loss', 'bandwidth_throttle', 'connection_drop',
      'slow_response', 'dependency_blackhole', 'dns_failure', 'pod_kill',
      'container_pause', 'memory_pressure', 'disk_io_saturation', 'clock_skew',
      'cpu_stress', 'certificate_expiry',
    ];
    expect(Object.keys(FAULT_CATALOG)).toHaveLength(14);
    for (const type of expectedTypes) {
      expect(FAULT_CATALOG).toHaveProperty(type);
      expect(FAULT_CATALOG[type]).toHaveProperty('name');
      expect(FAULT_CATALOG[type]).toHaveProperty('mechanisms');
    }
  });
});

describe('ChaosEngine.validateTimeline', () => {
  it('accepts a valid timeline', () => {
    const timeline = [
      { at: '0s', type: 'baseline' },
      { at: '30s', type: 'network_latency', target: 'api-service' },
      { at: '2m', type: 'recover' },
    ];
    expect(() => engine.validateTimeline(timeline)).not.toThrow();
  });

  it('throws on empty array', () => {
    expect(() => engine.validateTimeline([])).toThrow('non-empty array');
  });

  it('throws when event is missing "at" offset', () => {
    const timeline = [{ type: 'network_latency', target: 'svc' }];
    expect(() => engine.validateTimeline(timeline)).toThrow('"at" offset');
  });

  it('throws on unknown fault type', () => {
    const timeline = [{ at: '10s', type: 'unknown_fault' }];
    expect(() => engine.validateTimeline(timeline)).toThrow('Unknown fault type');
  });
});

describe('ChaosEngine.validateHypothesis', () => {
  it('accepts a valid hypothesis', () => {
    const hypothesis = {
      statement: 'Service stays under 500ms p95 during latency injection',
      metrics: [{ name: 'http_req_duration', threshold: '500ms', comparator: 'less_than' }],
    };
    expect(() => engine.validateHypothesis(hypothesis)).not.toThrow();
  });

  it('throws when statement is missing', () => {
    expect(() => engine.validateHypothesis({ metrics: [] })).toThrow('statement');
  });

  it('throws when metric is missing required fields', () => {
    const hypothesis = {
      statement: 'Test',
      metrics: [{ name: 'latency' }],
    };
    expect(() => engine.validateHypothesis(hypothesis)).toThrow('threshold');
  });
});

describe('ChaosEngine.parseOffset', () => {
  it('parses milliseconds', () => expect(engine.parseOffset('200ms')).toBe(200));
  it('parses seconds', () => expect(engine.parseOffset('5s')).toBe(5000));
  it('parses minutes', () => expect(engine.parseOffset('2m')).toBe(120000));
  it('parses hours', () => expect(engine.parseOffset('1h')).toBe(3600000));
  it('passes through numbers', () => expect(engine.parseOffset(750)).toBe(750));
});

describe('ChaosEngine.parseThreshold', () => {
  it('parses ms suffix', () => expect(engine.parseThreshold('800ms')).toBe(800));
  it('parses s suffix and converts to ms', () => expect(engine.parseThreshold('2s')).toBe(2000));
  it('parses percentage and converts to fraction', () => expect(engine.parseThreshold('5%')).toBeCloseTo(0.05));
  it('passes through numbers', () => expect(engine.parseThreshold(42)).toBe(42));
});

describe('ChaosEngine.buildToxiproxyCommand', () => {
  it('builds correct latency toxic command', () => {
    const cmd = engine.buildToxiproxyCommand({
      type: 'network_latency',
      target: 'upstream-svc',
      params: { delay: '300ms', jitter: '50ms' },
    });
    expect(cmd).toContain('toxiproxy-cli toxic add');
    expect(cmd).toContain('-t latency');
    expect(cmd).toContain('latency=300');
    expect(cmd).toContain('upstream-svc');
  });
});

describe('ChaosEngine.buildTcCommand', () => {
  it('builds correct tc netem delay command', () => {
    const cmd = engine.buildTcCommand({
      type: 'network_latency',
      params: { delay: '200ms', jitter: '50ms' },
    });
    expect(cmd).toContain('tc qdisc add dev');
    expect(cmd).toContain('netem delay');
    expect(cmd).toContain('200ms');
  });

  it('builds packet loss command', () => {
    const cmd = engine.buildTcCommand({
      type: 'packet_loss',
      params: { loss_percent: 10 },
    });
    expect(cmd).toContain('netem loss');
    expect(cmd).toContain('10%');
  });
});
