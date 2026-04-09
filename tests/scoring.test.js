import { describe, it, expect } from 'vitest';
import { calculatePerformanceScore, getGrade, compareRuns, GRADES } from '../scoring.js';

describe('calculatePerformanceScore', () => {
  it('returns high score for excellent metrics', () => {
    const summary = {
      http_req_duration_avg: 50,
      http_req_duration_p95: 100,
      http_req_duration_p99: 200,
      http_req_duration_med: 40,
      http_req_duration_max: 500,
      http_req_failed_rate: 0,
      http_reqs: 10000,
      iteration_duration_avg: 1500,
    };
    const result = calculatePerformanceScore(summary, null, {});
    expect(result.overall).toBeGreaterThanOrEqual(80);
    expect(result.grade.grade).toMatch(/A/);
  });

  it('returns low score for poor metrics', () => {
    const summary = {
      http_req_duration_avg: 5000,
      http_req_duration_p95: 8000,
      http_req_duration_p99: 12000,
      http_req_duration_med: 4000,
      http_req_duration_max: 30000,
      http_req_failed_rate: 0.15,
      http_reqs: 100,
      iteration_duration_avg: 10000,
    };
    const result = calculatePerformanceScore(summary, null, {});
    expect(result.overall).toBeLessThan(40);
    expect(result.grade.grade).toMatch(/[DF]/);
  });

  it('factors in threshold pass rate', () => {
    const summary = {
      http_req_duration_avg: 200,
      http_req_duration_p95: 400,
      http_req_duration_med: 180,
      http_req_failed_rate: 0.001,
      http_reqs: 5000,
      iteration_duration_avg: 2000,
    };
    const allPass = { 'a': { passed: true }, 'b': { passed: true } };
    const allFail = { 'a': { passed: false }, 'b': { passed: false } };

    const scorePass = calculatePerformanceScore(summary, null, allPass);
    const scoreFail = calculatePerformanceScore(summary, null, allFail);

    expect(scorePass.overall).toBeGreaterThan(scoreFail.overall);
  });

  it('compares against baseline when provided', () => {
    const summary = {
      http_req_duration_avg: 300,
      http_req_duration_p95: 600,
      http_req_duration_med: 250,
      http_req_failed_rate: 0.005,
      http_reqs: 5000,
      iteration_duration_avg: 2000,
    };
    const baseline = {
      metrics_summary: { http_req_duration_p95: 200, throughput_rps: 100 },
    };
    const result = calculatePerformanceScore(summary, baseline, {});
    expect(result.components.response_time.score).toBeLessThan(100);
  });

  it('returns all score components', () => {
    const summary = {
      http_req_duration_avg: 100,
      http_req_duration_p95: 200,
      http_req_duration_med: 80,
      http_req_failed_rate: 0,
      http_reqs: 1000,
      iteration_duration_avg: 1000,
    };
    const result = calculatePerformanceScore(summary, null, {});
    expect(result.components).toHaveProperty('response_time');
    expect(result.components).toHaveProperty('error_rate');
    expect(result.components).toHaveProperty('throughput');
    expect(result.components).toHaveProperty('stability');
    expect(result.components).toHaveProperty('thresholds');
  });
});

describe('getGrade', () => {
  it('returns correct grades for score ranges', () => {
    expect(getGrade(95).grade).toBe('A+');
    expect(getGrade(85).grade).toBe('A');
    expect(getGrade(75).grade).toBe('B');
    expect(getGrade(65).grade).toBe('C');
    expect(getGrade(50).grade).toBe('D');
    expect(getGrade(20).grade).toBe('F');
  });
});

describe('compareRuns', () => {
  it('calculates percentage changes between runs', () => {
    const current = { http_req_duration_avg: 300, http_req_duration_p95: 600, http_req_failed_rate: 0.02, http_reqs: 5000, http_req_duration_p99: 1000, iteration_duration_avg: 2000 };
    const baseline = { http_req_duration_avg: 200, http_req_duration_p95: 400, http_req_failed_rate: 0.01, http_reqs: 5000, http_req_duration_p99: 800, iteration_duration_avg: 1500 };

    const result = compareRuns(current, baseline);
    expect(result).not.toBeNull();
    expect(result.http_req_duration_avg.change_percent).toBe(50);
    expect(result.http_req_duration_avg.is_improvement).toBe(false);
  });

  it('returns null when data is missing', () => {
    expect(compareRuns(null, null)).toBeNull();
    expect(compareRuns({}, null)).toBeNull();
  });
});

describe('GRADES constant', () => {
  it('has all expected grades', () => {
    expect(GRADES).toHaveLength(6);
    expect(GRADES[0].grade).toBe('A+');
    expect(GRADES[GRADES.length - 1].grade).toBe('F');
  });
});
