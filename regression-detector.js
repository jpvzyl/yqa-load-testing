import * as db from './db.js';

export async function detectRegression(runId) {
  const run = await db.getRunById(runId);
  if (!run || !run.test_id) return null;

  const recentRuns = await db.getTestRuns(run.test_id, 20);
  const completed = recentRuns
    .filter(r => r.status === 'complete' && r.id !== runId && r.k6_summary)
    .slice(0, 10);

  if (completed.length < 2) {
    return { detectable: false, reason: 'Insufficient historical data (need at least 2 prior runs)' };
  }

  const metrics = [
    { key: 'http_req_duration_avg', label: 'Avg Response Time', lowerBetter: true },
    { key: 'http_req_duration_p95', label: 'P95 Response Time', lowerBetter: true },
    { key: 'http_req_duration_p99', label: 'P99 Response Time', lowerBetter: true },
    { key: 'http_req_failed_rate', label: 'Error Rate', lowerBetter: true },
  ];

  const regressions = [];

  for (const metric of metrics) {
    const historicalValues = completed
      .map(r => r.k6_summary?.[metric.key])
      .filter(v => v !== null && v !== undefined);

    const currentValue = run.k6_summary?.[metric.key];
    if (currentValue === null || currentValue === undefined || historicalValues.length < 2) continue;

    const { mean, stddev } = calculateStats(historicalValues);
    if (stddev === 0) continue;

    const zScore = (currentValue - mean) / stddev;
    const isRegression = metric.lowerBetter ? zScore > 2 : zScore < -2;
    const isSevere = metric.lowerBetter ? zScore > 3 : zScore < -3;

    const pValue = zScoreToPValue(Math.abs(zScore));

    if (isRegression) {
      regressions.push({
        metric: metric.key,
        label: metric.label,
        current_value: currentValue,
        historical_mean: parseFloat(mean.toFixed(4)),
        historical_stddev: parseFloat(stddev.toFixed(4)),
        z_score: parseFloat(zScore.toFixed(3)),
        p_value: parseFloat(pValue.toFixed(6)),
        statistically_significant: pValue < 0.05,
        severity: isSevere ? 'critical' : 'warning',
        change_from_mean_percent: parseFloat(((currentValue - mean) / mean * 100).toFixed(2)),
        direction: metric.lowerBetter
          ? (currentValue > mean ? 'degraded' : 'improved')
          : (currentValue < mean ? 'degraded' : 'improved'),
      });
    }
  }

  const trendAnalysis = analyzeTrend(completed, run);

  return {
    detectable: true,
    has_regression: regressions.length > 0,
    regressions,
    trend: trendAnalysis,
    sample_size: completed.length,
    confidence_level: completed.length >= 5 ? 'high' : completed.length >= 3 ? 'medium' : 'low',
    summary: regressions.length === 0
      ? 'No statistically significant regressions detected'
      : `${regressions.length} regression(s) detected: ${regressions.map(r => r.label).join(', ')}`,
  };
}

function analyzeTrend(historicalRuns, currentRun) {
  const scores = historicalRuns
    .filter(r => r.performance_score !== null)
    .map(r => ({ score: r.performance_score, date: r.created_at }))
    .reverse();

  if (scores.length < 3) return { direction: 'insufficient_data', description: 'Need more data points' };

  const recentScores = scores.slice(-5);
  const diffs = [];
  for (let i = 1; i < recentScores.length; i++) {
    diffs.push(recentScores[i].score - recentScores[i - 1].score);
  }

  const avgDiff = diffs.reduce((s, d) => s + d, 0) / diffs.length;

  if (avgDiff > 2) return { direction: 'improving', description: 'Performance scores are trending upward' };
  if (avgDiff < -2) return { direction: 'degrading', description: 'Performance scores are trending downward' };
  return { direction: 'stable', description: 'Performance scores are stable' };
}

function calculateStats(values) {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return { mean, stddev: Math.sqrt(variance) };
}

function zScoreToPValue(z) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 1 - (0.5 * (1.0 + sign * y));
}

export function welchTTest(sample1, sample2) {
  const stats1 = calculateStats(sample1);
  const stats2 = calculateStats(sample2);
  const n1 = sample1.length;
  const n2 = sample2.length;

  const se = Math.sqrt((stats1.stddev ** 2) / n1 + (stats2.stddev ** 2) / n2);
  if (se === 0) return { t_statistic: 0, p_value: 1, significant: false };

  const t = (stats1.mean - stats2.mean) / se;

  const v1 = (stats1.stddev ** 2) / n1;
  const v2 = (stats2.stddev ** 2) / n2;
  const df = (v1 + v2) ** 2 / ((v1 ** 2) / (n1 - 1) + (v2 ** 2) / (n2 - 1));

  const pValue = 2 * (1 - approximateTCdf(Math.abs(t), df));

  return {
    t_statistic: parseFloat(t.toFixed(4)),
    degrees_of_freedom: parseFloat(df.toFixed(2)),
    p_value: parseFloat(pValue.toFixed(6)),
    significant: pValue < 0.05,
    mean_difference: parseFloat((stats1.mean - stats2.mean).toFixed(4)),
  };
}

function approximateTCdf(t, df) {
  const x = df / (df + t * t);
  return 1 - 0.5 * incompleteBeta(df / 2, 0.5, x);
}

function incompleteBeta(a, b, x) {
  if (x === 0 || x === 1) return x;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCf(a, b, x) / a;
  }
  return 1 - bt * betaCf(b, a, 1 - x) / b;
}

function betaCf(a, b, x) {
  const maxIter = 100;
  const eps = 3e-7;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < eps) break;
  }

  return h;
}

function lgamma(x) {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
  let ser = 1.000000000190015;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  for (let j = 0; j < 6; j++) {
    ser += cof[j] / (x + j + 1);
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
