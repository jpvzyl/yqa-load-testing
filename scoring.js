const WEIGHTS = {
  responseTime: 0.30,
  errorRate: 0.25,
  throughput: 0.20,
  stability: 0.15,
  thresholds: 0.10,
};

const GRADES = [
  { min: 90, grade: 'A+', label: 'Excellent', color: '#22c55e' },
  { min: 80, grade: 'A', label: 'Good', color: '#4ade80' },
  { min: 70, grade: 'B', label: 'Acceptable', color: '#facc15' },
  { min: 60, grade: 'C', label: 'Concerning', color: '#f97316' },
  { min: 40, grade: 'D', label: 'Poor', color: '#ef4444' },
  { min: 0, grade: 'F', label: 'Critical', color: '#dc2626' },
];

export function calculatePerformanceScore(summary, baseline, thresholdResults) {
  const responseTimeScore = calculateResponseTimeScore(summary, baseline);
  const errorRateScore = calculateErrorRateScore(summary);
  const throughputScore = calculateThroughputScore(summary, baseline);
  const stabilityScore = calculateStabilityScore(summary);
  const thresholdScore = calculateThresholdScore(thresholdResults);

  const overall = Math.round(
    responseTimeScore * WEIGHTS.responseTime +
    errorRateScore * WEIGHTS.errorRate +
    throughputScore * WEIGHTS.throughput +
    stabilityScore * WEIGHTS.stability +
    thresholdScore * WEIGHTS.thresholds
  );

  const clamped = Math.max(0, Math.min(100, overall));

  return {
    overall: clamped,
    grade: getGrade(clamped),
    components: {
      response_time: { score: responseTimeScore, weight: WEIGHTS.responseTime },
      error_rate: { score: errorRateScore, weight: WEIGHTS.errorRate },
      throughput: { score: throughputScore, weight: WEIGHTS.throughput },
      stability: { score: stabilityScore, weight: WEIGHTS.stability },
      thresholds: { score: thresholdScore, weight: WEIGHTS.thresholds },
    },
  };
}

function calculateResponseTimeScore(summary, baseline) {
  const p95 = summary.http_req_duration_p95;
  if (p95 === null || p95 === undefined) return 50;

  if (baseline?.metrics_summary?.http_req_duration_p95) {
    const baseP95 = baseline.metrics_summary.http_req_duration_p95;
    const ratio = p95 / baseP95;
    if (ratio <= 1) return 100;
    if (ratio >= 5) return 0;
    return Math.round(100 * (1 - (ratio - 1) / 4));
  }

  if (p95 <= 100) return 100;
  if (p95 <= 200) return 95;
  if (p95 <= 500) return 85;
  if (p95 <= 1000) return 70;
  if (p95 <= 2000) return 50;
  if (p95 <= 5000) return 25;
  return 0;
}

function calculateErrorRateScore(summary) {
  const rate = summary.http_req_failed_rate;
  if (rate === null || rate === undefined) return 100;
  if (rate === 0) return 100;
  if (rate < 0.001) return 95;
  if (rate < 0.01) return 85;
  if (rate < 0.05) return 60;
  if (rate < 0.10) return 30;
  return 0;
}

function calculateThroughputScore(summary, baseline) {
  const rps = summary.http_reqs;
  const duration = summary.iteration_duration_avg;
  if (!rps || !duration) return 50;

  const actualRps = (rps / (duration / 1000)) || rps;

  if (baseline?.metrics_summary?.throughput_rps) {
    const baseRps = baseline.metrics_summary.throughput_rps;
    const ratio = actualRps / baseRps;
    if (ratio >= 1) return 100;
    if (ratio >= 0.8) return 80;
    if (ratio >= 0.5) return 50;
    return Math.round(ratio * 100);
  }

  if (actualRps >= 100) return 100;
  if (actualRps >= 50) return 85;
  if (actualRps >= 10) return 70;
  if (actualRps >= 1) return 50;
  return 25;
}

function calculateStabilityScore(summary) {
  const avg = summary.http_req_duration_avg;
  const max = summary.http_req_duration_max;
  const p95 = summary.http_req_duration_p95;
  const p50 = summary.http_req_duration_med;

  if (!avg || !p95) return 50;

  const cv = p50 && avg ? Math.abs(p95 - p50) / avg : 1;

  if (cv < 0.1) return 100;
  if (cv < 0.3) return 85;
  if (cv < 0.5) return 70;
  if (cv < 1.0) return 50;
  if (cv < 2.0) return 25;
  return 0;
}

function calculateThresholdScore(thresholdResults) {
  if (!thresholdResults || Object.keys(thresholdResults).length === 0) return 75;

  const entries = Object.values(thresholdResults);
  const passed = entries.filter(t => t.passed).length;
  return Math.round((passed / entries.length) * 100);
}

export function getGrade(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
}

export function compareRuns(current, baseline) {
  if (!current || !baseline) return null;

  const metrics = [
    'http_req_duration_avg', 'http_req_duration_p95', 'http_req_duration_p99',
    'http_req_failed_rate', 'http_reqs', 'iteration_duration_avg',
  ];

  const comparison = {};
  for (const metric of metrics) {
    const curr = current[metric];
    const base = baseline[metric];
    if (curr !== null && base !== null && base !== 0) {
      const change = ((curr - base) / base) * 100;
      const isImprovement = metric.includes('duration') || metric.includes('failed')
        ? change < 0 : change > 0;
      comparison[metric] = {
        current: curr,
        baseline: base,
        change_percent: parseFloat(change.toFixed(2)),
        is_improvement: isImprovement,
        severity: getSeverity(Math.abs(change), metric),
      };
    }
  }

  return comparison;
}

function getSeverity(changePercent, metric) {
  const isLatency = metric.includes('duration') || metric.includes('failed');
  if (isLatency) {
    if (changePercent > 50) return 'critical';
    if (changePercent > 25) return 'high';
    if (changePercent > 10) return 'medium';
    return 'low';
  }
  if (changePercent > 30) return 'high';
  if (changePercent > 15) return 'medium';
  return 'low';
}

export { GRADES, WEIGHTS };
