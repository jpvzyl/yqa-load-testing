import { describe, it, expect } from 'vitest';
import { ShardDistributor, MetricAggregator } from '../worker-manager.js';

describe('ShardDistributor', () => {
  const distributor = new ShardDistributor();

  describe('estimateSpotCost', () => {
    it('calculates cost correctly for a single shard', () => {
      const shards = [{ vus_assigned: 1000 }];
      const cost = distributor.estimateSpotCost(shards);
      expect(cost).toBeCloseTo(1000 * 0.000002, 10);
    });

    it('sums cost across multiple shards', () => {
      const shards = [
        { vus_assigned: 1000 },
        { vus_assigned: 2000 },
        { vus_assigned: 500 },
      ];
      const cost = distributor.estimateSpotCost(shards);
      expect(cost).toBeCloseTo(3500 * 0.000002, 10);
    });

    it('returns 0 for empty shards', () => {
      expect(distributor.estimateSpotCost([])).toBe(0);
    });
  });
});

describe('MetricAggregator', () => {
  const aggregator = new MetricAggregator();

  describe('aggregateShardSummaries', () => {
    it('returns null for empty array', () => {
      expect(aggregator.aggregateShardSummaries([])).toBeNull();
    });

    it('passes through a single summary unchanged', () => {
      const summary = { http_reqs: 5000, http_req_duration_avg: 120, status: 'ok' };
      expect(aggregator.aggregateShardSummaries([summary])).toEqual(summary);
    });

    it('sums count-like metrics across shards', () => {
      const summaries = [
        { http_reqs: 3000, iterations: 500, data_received: 1024 },
        { http_reqs: 2000, iterations: 300, data_received: 2048 },
      ];
      const result = aggregator.aggregateShardSummaries(summaries);
      expect(result.http_reqs).toBe(5000);
      expect(result.iterations).toBe(800);
      expect(result.data_received).toBe(3072);
    });

    it('takes max for max-like metrics', () => {
      const summaries = [
        { http_req_duration_max: 800 },
        { http_req_duration_max: 1200 },
        { http_req_duration_max: 600 },
      ];
      const result = aggregator.aggregateShardSummaries(summaries);
      expect(result.http_req_duration_max).toBe(1200);
    });

    it('takes min for min-like metrics', () => {
      const summaries = [
        { http_req_duration_min: 10 },
        { http_req_duration_min: 5 },
        { http_req_duration_min: 15 },
      ];
      const result = aggregator.aggregateShardSummaries(summaries);
      expect(result.http_req_duration_min).toBe(5);
    });

    it('averages other numeric metrics', () => {
      const summaries = [
        { http_req_duration_avg: 100, http_req_duration_p95: 200 },
        { http_req_duration_avg: 200, http_req_duration_p95: 400 },
      ];
      const result = aggregator.aggregateShardSummaries(summaries);
      expect(result.http_req_duration_avg).toBe(150);
      expect(result.http_req_duration_p95).toBe(300);
    });

    it('uses first value for non-numeric fields', () => {
      const summaries = [
        { status: 'ok', http_reqs: 10 },
        { status: 'degraded', http_reqs: 20 },
      ];
      const result = aggregator.aggregateShardSummaries(summaries);
      expect(result.status).toBe('ok');
    });

    it('handles mixed keys across shards', () => {
      const summaries = [
        { http_reqs: 100, extra_count: 5 },
        { http_reqs: 200 },
      ];
      const result = aggregator.aggregateShardSummaries(summaries);
      expect(result.http_reqs).toBe(300);
      expect(result.extra_count).toBe(5);
    });
  });
});
