import { describe, it, expect } from 'vitest';
import { SLOEngine, PerformanceBudgetChecker } from '../slo-engine.js';

const engine = new SLOEngine();
const checker = new PerformanceBudgetChecker();

describe('SLOEngine.evaluateSingleSLO', () => {
  describe('availability metric', () => {
    it('returns 100% SLI when there are 0% errors', () => {
      const slo = { id: 's1', name: 'Availability', metric: 'availability', target: 99.9 };
      const run = { k6_summary: { http_reqs: 10000, http_req_failed_rate: 0 } };
      const result = engine.evaluateSingleSLO(slo, run, []);

      expect(result.actual_sli).toBe(100);
      expect(result.good_events).toBe(10000);
      expect(result.total_events).toBe(10000);
    });

    it('returns 95% SLI when there are 5% errors', () => {
      const slo = { id: 's2', name: 'Availability', metric: 'availability', target: 99.9 };
      const run = { k6_summary: { http_reqs: 10000, http_req_failed_rate: 0.05 } };
      const result = engine.evaluateSingleSLO(slo, run, []);

      expect(result.actual_sli).toBe(95);
      expect(result.good_events).toBe(9500);
    });
  });

  describe('latency metric', () => {
    it('marks all events as good when p95 is under threshold', () => {
      const slo = { id: 's3', name: 'Latency', metric: 'latency', target: 99, threshold_ms: 500 };
      const run = { k6_summary: { http_reqs: 5000, http_req_duration_p95: 300 } };
      const result = engine.evaluateSingleSLO(slo, run, []);

      expect(result.actual_sli).toBe(100);
      expect(result.good_events).toBe(5000);
    });

    it('uses endpoint-specific latency when endpoint is specified', () => {
      const slo = { id: 's4', name: 'API Latency', metric: 'latency', target: 99, threshold_ms: 200, endpoint: '/api/users' };
      const endpoints = [{ endpoint: '/api/users', request_count: 1000, p95_duration: 150 }];
      const run = { k6_summary: {} };
      const result = engine.evaluateSingleSLO(slo, run, endpoints);

      expect(result.good_events).toBe(1000);
      expect(result.actual_sli).toBe(100);
    });
  });

  describe('burn rate and budget', () => {
    it('sets is_burning to true when burn_rate > 1', () => {
      const slo = { id: 's5', name: 'Avail', metric: 'availability', target: 99.9 };
      const run = { k6_summary: { http_reqs: 10000, http_req_failed_rate: 0.05 } };
      const result = engine.evaluateSingleSLO(slo, run, []);

      // error_budget_total = 0.1, error_budget_used = 5 => burn_rate = 50
      expect(result.burn_rate).toBeGreaterThan(1);
      expect(result.is_burning).toBe(true);
    });

    it('sets is_burning to false when within budget', () => {
      const slo = { id: 's6', name: 'Avail', metric: 'availability', target: 95 };
      const run = { k6_summary: { http_reqs: 10000, http_req_failed_rate: 0.01 } };
      const result = engine.evaluateSingleSLO(slo, run, []);

      // error_budget_total = 5, error_budget_used = 1 => burn_rate = 0.2
      expect(result.burn_rate).toBeLessThanOrEqual(1);
      expect(result.is_burning).toBe(false);
    });

    it('calculates budget_remaining correctly', () => {
      const slo = { id: 's7', name: 'Avail', metric: 'availability', target: 99 };
      const run = { k6_summary: { http_reqs: 10000, http_req_failed_rate: 0.005 } };
      const result = engine.evaluateSingleSLO(slo, run, []);

      // error_budget_total = 1, error_budget_used = 0.5 => remaining = 0.5
      expect(result.error_budget_total).toBe(1);
      expect(result.error_budget_used).toBeCloseTo(0.5, 1);
      expect(result.budget_remaining).toBeCloseTo(0.5, 1);
    });
  });
});

describe('PerformanceBudgetChecker', () => {
  describe('formatViolationsForPR', () => {
    it('returns checkmark message for empty violations', () => {
      const result = checker.formatViolationsForPR([]);
      expect(result).toContain('✅');
      expect(result).toContain('Performance Check Passed');
    });

    it('produces table for violations', () => {
      const violations = [{
        budget: { method: 'GET', endpoint: '/api/data' },
        enforcement: 'warn',
        checks: [
          { metric: 'p95', exceeded: true, budget: 200, actual: 450 },
        ],
      }];
      const result = checker.formatViolationsForPR(violations);
      expect(result).toContain('❌');
      expect(result).toContain('Performance Budget Violations');
      expect(result).toContain('/api/data');
      expect(result).toContain('⚠️ WARN');
    });

    it('shows BLOCK status for blocking violations', () => {
      const violations = [{
        budget: { method: 'POST', endpoint: '/api/checkout' },
        enforcement: 'block',
        checks: [
          { metric: 'error_rate', exceeded: true, budget: 0.01, actual: 0.05 },
        ],
      }];
      const result = checker.formatViolationsForPR(violations);
      expect(result).toContain('🚫 BLOCK');
      expect(result).toContain('blocking violation');
    });
  });

  describe('shouldBlockMerge', () => {
    it('returns true when any violation has enforcement "block"', () => {
      const violations = [
        { enforcement: 'warn' },
        { enforcement: 'block' },
      ];
      expect(checker.shouldBlockMerge(violations)).toBe(true);
    });

    it('returns false when all violations are warnings', () => {
      const violations = [
        { enforcement: 'warn' },
        { enforcement: 'warn' },
      ];
      expect(checker.shouldBlockMerge(violations)).toBe(false);
    });

    it('returns false for empty violations', () => {
      expect(checker.shouldBlockMerge([])).toBe(false);
    });
  });
});

describe('SLOEngine.generateAlerts', () => {
  it('fires page-severity alert when burn_rate > 14.4', () => {
    const results = [{
      slo_name: 'Critical SLO',
      burn_rate: 15,
      budget_remaining: 0,
    }];
    const alerts = engine.generateAlerts(results);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('page');
    expect(alerts[0].threshold).toBe(14.4);
    expect(alerts[0].slo_name).toBe('Critical SLO');
  });

  it('fires ticket-severity alert for moderate burn rate', () => {
    const results = [{
      slo_name: 'Moderate SLO',
      burn_rate: 4,
      budget_remaining: 0.3,
    }];
    const alerts = engine.generateAlerts(results);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('ticket');
  });

  it('returns no alerts when burn rate is low', () => {
    const results = [{
      slo_name: 'Healthy SLO',
      burn_rate: 0.5,
      budget_remaining: 0.8,
    }];
    const alerts = engine.generateAlerts(results);
    expect(alerts).toHaveLength(0);
  });
});
