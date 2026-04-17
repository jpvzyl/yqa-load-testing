import { describe, it, expect } from 'vitest';
import { PRGateManager } from '../pr-gate.js';

const manager = new PRGateManager();

describe('PRGateManager.computeDiff', () => {
  it('calculates correct percentage changes', () => {
    const current = { k6_summary: { http_req_duration_avg: 110, http_req_duration_p95: 220, http_req_failed_rate: 0.02, http_reqs_per_second: 500 } };
    const baseline = { k6_summary: { http_req_duration_avg: 100, http_req_duration_p95: 200, http_req_failed_rate: 0.01, http_reqs_per_second: 500 } };
    const diff = manager.computeDiff(current, baseline);

    expect(diff.http_req_duration_avg.change_percent).toBe(10);
    expect(diff.http_req_duration_p95.change_percent).toBe(10);
    expect(diff.http_req_failed_rate.change_percent).toBe(100);
  });

  it('classifies direction as regression for >5% increase', () => {
    const current = { k6_summary: { http_req_duration_avg: 120 } };
    const baseline = { k6_summary: { http_req_duration_avg: 100 } };
    const diff = manager.computeDiff(current, baseline);
    expect(diff.http_req_duration_avg.direction).toBe('regression');
  });

  it('classifies direction as improvement for >5% decrease', () => {
    const current = { k6_summary: { http_req_duration_avg: 80 } };
    const baseline = { k6_summary: { http_req_duration_avg: 100 } };
    const diff = manager.computeDiff(current, baseline);
    expect(diff.http_req_duration_avg.direction).toBe('improvement');
  });

  it('classifies direction as stable for small changes', () => {
    const current = { k6_summary: { http_req_duration_avg: 102 } };
    const baseline = { k6_summary: { http_req_duration_avg: 100 } };
    const diff = manager.computeDiff(current, baseline);
    expect(diff.http_req_duration_avg.direction).toBe('stable');
  });
});

describe('PRGateManager.formatMetric', () => {
  it('formats rate as percentage', () => {
    expect(manager.formatMetric('http_req_failed_rate', 0.053)).toBe('5.30%');
  });

  it('formats duration as ms', () => {
    expect(manager.formatMetric('http_req_duration_p95', 234.7)).toBe('235ms');
  });

  it('formats per_second as rps', () => {
    expect(manager.formatMetric('http_reqs_per_second', 1234.5)).toBe('1235 rps');
  });
});

describe('PRGateManager.buildPRComment', () => {
  const run = {
    performance_score: 85,
    performance_grade: 'A',
    k6_summary: { http_req_duration_p95: 180, http_req_failed_rate: 0.005, http_reqs_per_second: 1200 },
  };

  it('includes score and grade', () => {
    const comment = manager.buildPRComment(run, { passed: true, violations: [] }, null);
    expect(comment).toContain('85/100');
    expect(comment).toContain('(A)');
  });

  it('includes P95 and error rate', () => {
    const comment = manager.buildPRComment(run, { passed: true, violations: [] }, null);
    expect(comment).toContain('180ms');
    expect(comment).toContain('0.50%');
  });

  it('shows checkmark when passed', () => {
    const comment = manager.buildPRComment(run, { passed: true, violations: [] }, null);
    expect(comment).toContain('✅');
  });

  it('shows X when failed', () => {
    const comment = manager.buildPRComment(run, { passed: false, violations: [] }, null);
    expect(comment).toContain('❌');
  });
});
