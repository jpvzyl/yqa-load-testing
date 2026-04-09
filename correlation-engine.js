import * as db from './db.js';

export async function correlateMetrics(runId) {
  const [runMetrics, infraMetrics, endpointMetrics, run] = await Promise.all([
    db.getRunMetricsSummary(runId),
    db.getInfraMetrics(runId),
    db.getEndpointMetrics(runId),
    db.getRunById(runId),
  ]);

  if (infraMetrics.length === 0) {
    return {
      has_infra_data: false,
      message: 'No infrastructure metrics available for correlation',
    };
  }

  const timeline = buildCorrelationTimeline(runMetrics, infraMetrics, run);
  const saturationPoints = findSaturationPoints(infraMetrics);
  const resourceBottlenecks = identifyResourceBottlenecks(infraMetrics, endpointMetrics);

  return {
    has_infra_data: true,
    timeline,
    saturation_points: saturationPoints,
    resource_bottlenecks: resourceBottlenecks,
    summary: buildCorrelationSummary(saturationPoints, resourceBottlenecks),
  };
}

function buildCorrelationTimeline(runMetrics, infraMetrics, run) {
  if (!run?.started_at || !run?.completed_at) return [];

  const start = new Date(run.started_at).getTime();
  const end = new Date(run.completed_at).getTime();
  const bucketSize = Math.max(Math.round((end - start) / 60), 1000);
  const buckets = [];

  for (let t = start; t <= end; t += bucketSize) {
    const bucketStart = t;
    const bucketEnd = t + bucketSize;

    const infraInBucket = infraMetrics.filter(m => {
      const mt = new Date(m.time).getTime();
      return mt >= bucketStart && mt < bucketEnd;
    });

    const bucket = {
      timestamp: new Date(bucketStart).toISOString(),
      infra: {},
    };

    for (const m of infraInBucket) {
      if (!bucket.infra[m.metric_name]) {
        bucket.infra[m.metric_name] = [];
      }
      bucket.infra[m.metric_name].push(m.value);
    }

    for (const [key, values] of Object.entries(bucket.infra)) {
      bucket.infra[key] = values.reduce((s, v) => s + v, 0) / values.length;
    }

    buckets.push(bucket);
  }

  return buckets;
}

function findSaturationPoints(infraMetrics) {
  const byMetric = {};
  for (const m of infraMetrics) {
    if (!byMetric[m.metric_name]) byMetric[m.metric_name] = [];
    byMetric[m.metric_name].push({ time: m.time, value: m.value });
  }

  const saturationPoints = [];

  for (const [name, values] of Object.entries(byMetric)) {
    const sorted = values.sort((a, b) => new Date(a.time) - new Date(b.time));
    const maxValue = Math.max(...sorted.map(v => v.value));

    const thresholds = {
      cpu_percent: 80,
      cpu_load_1m: 0.8,
      memory_usage_percent: 85,
      memory_percent: 85,
      disk_io_percent: 70,
      network_utilization: 80,
      db_connections_percent: 80,
    };

    const threshold = thresholds[name];
    if (!threshold) continue;

    if (maxValue >= threshold) {
      const satPoint = sorted.find(v => v.value >= threshold);
      saturationPoints.push({
        resource: name,
        threshold,
        peak_value: maxValue,
        saturated_at: satPoint?.time,
        duration_above_threshold_samples: sorted.filter(v => v.value >= threshold).length,
      });
    }
  }

  return saturationPoints;
}

function identifyResourceBottlenecks(infraMetrics, endpointMetrics) {
  const bottlenecks = [];

  const avgByMetric = {};
  for (const m of infraMetrics) {
    if (!avgByMetric[m.metric_name]) avgByMetric[m.metric_name] = { sum: 0, count: 0, max: 0 };
    avgByMetric[m.metric_name].sum += m.value;
    avgByMetric[m.metric_name].count++;
    avgByMetric[m.metric_name].max = Math.max(avgByMetric[m.metric_name].max, m.value);
  }

  for (const [name, stats] of Object.entries(avgByMetric)) {
    const avg = stats.sum / stats.count;
    const max = stats.max;

    if (name.includes('cpu') && max > 80) {
      bottlenecks.push({
        resource: 'CPU',
        metric: name,
        avg_utilization: parseFloat(avg.toFixed(1)),
        peak_utilization: parseFloat(max.toFixed(1)),
        is_bottleneck: max > 90,
        recommendation: max > 90
          ? 'CPU is likely the primary bottleneck. Consider vertical scaling or optimizing CPU-intensive operations.'
          : 'CPU utilization is high. Monitor for further increases under heavier load.',
      });
    }

    if (name.includes('memory') && max > 80) {
      bottlenecks.push({
        resource: 'Memory',
        metric: name,
        avg_utilization: parseFloat(avg.toFixed(1)),
        peak_utilization: parseFloat(max.toFixed(1)),
        is_bottleneck: max > 90,
        recommendation: max > 90
          ? 'Memory is near exhaustion. Investigate memory leaks and consider increasing available memory.'
          : 'Memory utilization is elevated. Monitor for gradual increases during soak tests.',
      });
    }

    if (name.includes('disk') && max > 70) {
      bottlenecks.push({
        resource: 'Disk I/O',
        metric: name,
        avg_utilization: parseFloat(avg.toFixed(1)),
        peak_utilization: parseFloat(max.toFixed(1)),
        is_bottleneck: max > 85,
        recommendation: 'Disk I/O is high. Consider SSD upgrades, read replicas, or caching layers.',
      });
    }
  }

  return bottlenecks;
}

function buildCorrelationSummary(saturationPoints, resourceBottlenecks) {
  if (saturationPoints.length === 0 && resourceBottlenecks.length === 0) {
    return 'No infrastructure saturation detected during the test. Resources appear to have adequate headroom.';
  }

  const parts = [];

  if (saturationPoints.length > 0) {
    const first = saturationPoints.sort((a, b) => new Date(a.saturated_at) - new Date(b.saturated_at))[0];
    parts.push(`${first.resource} was the first resource to saturate (at ${first.peak_value.toFixed(1)}% utilization)`);
  }

  const primaryBottleneck = resourceBottlenecks.find(b => b.is_bottleneck);
  if (primaryBottleneck) {
    parts.push(`${primaryBottleneck.resource} is identified as the primary bottleneck (peak: ${primaryBottleneck.peak_utilization}%)`);
  }

  return parts.join('. ') + '.';
}
