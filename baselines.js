import * as db from './db.js';
import { parseK6Summary } from './k6-runner.js';

export async function captureBaseline(runId, testId, environment, notes) {
  const run = await db.getRunById(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== 'complete') throw new Error('Can only baseline completed runs');

  const metricsSummary = await db.getRunMetricsSummary(runId);
  const endpointMetrics = await db.getEndpointMetrics(runId);

  const summary = {
    ...run.k6_summary,
    performance_score: run.performance_score,
    performance_grade: run.performance_grade,
    endpoint_count: endpointMetrics.length,
    metric_aggregates: metricsSummary.reduce((acc, m) => {
      acc[m.metric_name] = {
        avg: parseFloat(m.avg_value),
        min: parseFloat(m.min_value),
        max: parseFloat(m.max_value),
        p50: parseFloat(m.p50),
        p90: parseFloat(m.p90),
        p95: parseFloat(m.p95),
        p99: parseFloat(m.p99),
        samples: parseInt(m.sample_count),
      };
      return acc;
    }, {}),
  };

  const thresholds = deriveThresholds(summary);

  return db.createBaseline({
    test_id: testId || run.test_id,
    run_id: runId,
    environment: environment || run.environment || 'staging',
    metrics_summary: summary,
    thresholds,
    is_active: true,
    notes,
  });
}

function deriveThresholds(summary) {
  const thresholds = {};

  if (summary.http_req_duration_p95) {
    thresholds.http_req_duration_p95 = {
      warning: summary.http_req_duration_p95 * 1.1,
      critical: summary.http_req_duration_p95 * 1.5,
    };
  }

  if (summary.http_req_duration_avg) {
    thresholds.http_req_duration_avg = {
      warning: summary.http_req_duration_avg * 1.15,
      critical: summary.http_req_duration_avg * 1.5,
    };
  }

  if (summary.http_req_failed_rate !== undefined) {
    thresholds.http_req_failed_rate = {
      warning: Math.max(summary.http_req_failed_rate * 2, 0.005),
      critical: Math.max(summary.http_req_failed_rate * 5, 0.02),
    };
  }

  if (summary.http_reqs) {
    thresholds.http_reqs = {
      warning: summary.http_reqs * 0.85,
      critical: summary.http_reqs * 0.7,
    };
  }

  return thresholds;
}

export async function compareWithBaseline(runId) {
  const run = await db.getRunById(runId);
  if (!run || !run.test_id) return null;

  const baseline = await db.getActiveBaseline(run.test_id, run.environment);
  if (!baseline) return null;

  const currentSummary = run.k6_summary || {};
  const baselineSummary = baseline.metrics_summary || {};
  const thresholds = baseline.thresholds || {};

  const comparisons = {};
  const violations = [];

  const metricsToCompare = [
    { key: 'http_req_duration_avg', label: 'Avg Response Time', unit: 'ms', lowerBetter: true },
    { key: 'http_req_duration_p95', label: 'P95 Response Time', unit: 'ms', lowerBetter: true },
    { key: 'http_req_duration_p99', label: 'P99 Response Time', unit: 'ms', lowerBetter: true },
    { key: 'http_req_failed_rate', label: 'Error Rate', unit: '%', lowerBetter: true },
    { key: 'http_reqs', label: 'Total Requests', unit: '', lowerBetter: false },
    { key: 'iteration_duration_avg', label: 'Avg Iteration Duration', unit: 'ms', lowerBetter: true },
  ];

  for (const metric of metricsToCompare) {
    const current = currentSummary[metric.key];
    const base = baselineSummary[metric.key];

    if (current === null || current === undefined || base === null || base === undefined) continue;

    const changePercent = base !== 0 ? ((current - base) / base) * 100 : 0;
    const isImprovement = metric.lowerBetter ? changePercent < 0 : changePercent > 0;

    const entry = {
      label: metric.label,
      current,
      baseline: base,
      change_percent: parseFloat(changePercent.toFixed(2)),
      is_improvement: isImprovement,
      unit: metric.unit,
    };

    if (thresholds[metric.key]) {
      const th = thresholds[metric.key];
      if (metric.lowerBetter) {
        if (current > th.critical) {
          entry.violation = 'critical';
          violations.push({ metric: metric.label, level: 'critical', current, threshold: th.critical });
        } else if (current > th.warning) {
          entry.violation = 'warning';
          violations.push({ metric: metric.label, level: 'warning', current, threshold: th.warning });
        }
      } else {
        if (current < th.critical) {
          entry.violation = 'critical';
          violations.push({ metric: metric.label, level: 'critical', current, threshold: th.critical });
        } else if (current < th.warning) {
          entry.violation = 'warning';
          violations.push({ metric: metric.label, level: 'warning', current, threshold: th.warning });
        }
      }
    }

    comparisons[metric.key] = entry;
  }

  const hasRegression = violations.some(v => v.level === 'critical');

  return {
    baseline_id: baseline.id,
    baseline_date: baseline.created_at,
    comparisons,
    violations,
    has_regression: hasRegression,
    regression_severity: violations.length === 0 ? 'none'
      : violations.some(v => v.level === 'critical') ? 'critical' : 'warning',
    summary: violations.length === 0
      ? 'Performance is within baseline thresholds'
      : `${violations.length} threshold violation(s) detected`,
  };
}
