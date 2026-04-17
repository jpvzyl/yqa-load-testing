import { describe, it, expect, vi } from 'vitest';
import { NatsMetricBus } from '../nats-client.js';

describe('NatsMetricBus.matchSubject', () => {
  const bus = new NatsMetricBus();

  it('matches exact subject', () => {
    expect(bus.matchSubject('metrics.run1.w1.http', 'metrics.run1.w1.http')).toBe(true);
  });

  it('matches wildcard ">" (multi-level)', () => {
    expect(bus.matchSubject('metrics.run1.>', 'metrics.run1.w1.http')).toBe(true);
    expect(bus.matchSubject('metrics.>', 'metrics.run1.w1.http')).toBe(true);
  });

  it('matches single wildcard "*"', () => {
    expect(bus.matchSubject('metrics.*.w1.http', 'metrics.run1.w1.http')).toBe(true);
  });

  it('rejects non-matching subjects', () => {
    expect(bus.matchSubject('metrics.run1.w1.http', 'metrics.run2.w1.http')).toBe(false);
    expect(bus.matchSubject('control.>', 'metrics.run1.w1')).toBe(false);
  });

  it('rejects when part count differs (no ">")', () => {
    expect(bus.matchSubject('metrics.run1', 'metrics.run1.w1')).toBe(false);
  });
});

describe('In-process bus', () => {
  it('delivers published messages to subscribers', async () => {
    const bus = new NatsMetricBus();
    bus.startInProcessBus();

    const received = [];
    await bus.subscribe('metrics.test-run.>', (data) => {
      received.push(data);
    });

    await bus.publishMetric('test-run', 'w1', 'http_reqs', { value: 42 });

    expect(received).toHaveLength(1);
    expect(received[0].value).toBe(42);
    expect(received[0].run_id).toBe('test-run');
    expect(received[0].metric_name).toBe('http_reqs');

    if (bus.flushInterval) clearInterval(bus.flushInterval);
  });
});

describe('Buffer management', () => {
  it('buffers metrics and flushes them', async () => {
    const batches = [];
    const bus = new NatsMetricBus({
      onMetricBatch: async (runId, metrics) => {
        batches.push({ runId, metrics });
      },
    });
    bus.startInProcessBus();

    bus.bufferMetric('run-1', JSON.stringify({ value: 1 }));
    bus.bufferMetric('run-1', JSON.stringify({ value: 2 }));
    bus.bufferMetric('run-1', JSON.stringify({ value: 3 }));

    await bus.flushMetrics();

    expect(batches).toHaveLength(1);
    expect(batches[0].runId).toBe('run-1');
    expect(batches[0].metrics).toHaveLength(3);

    if (bus.flushInterval) clearInterval(bus.flushInterval);
  });
});

describe('NatsMetricBus.getStatus', () => {
  it('reports correct mode and buffer counts', () => {
    const bus = new NatsMetricBus();
    const status = bus.getStatus();

    expect(status.mode).toBe('in-process');
    expect(status.connected).toBe(false);
    expect(status.buffered_runs).toBe(0);
    expect(status.buffered_metrics).toBe(0);
  });

  it('reflects buffered metrics in status', () => {
    const bus = new NatsMetricBus();
    bus.bufferMetric('run-a', '{"v":1}');
    bus.bufferMetric('run-a', '{"v":2}');
    bus.bufferMetric('run-b', '{"v":3}');

    const status = bus.getStatus();
    expect(status.buffered_runs).toBe(2);
    expect(status.buffered_metrics).toBe(3);
  });
});
