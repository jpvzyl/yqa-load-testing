import * as db from './db.js';

const activeCollectors = new Map();

export async function startCollection(runId, targets) {
  if (!targets || targets.length === 0) return;

  const collectors = [];
  for (const target of targets) {
    const collector = createCollector(runId, target);
    collectors.push(collector);
    collector.start();
  }

  activeCollectors.set(runId, collectors);
}

export function stopCollection(runId) {
  const collectors = activeCollectors.get(runId);
  if (collectors) {
    collectors.forEach(c => c.stop());
    activeCollectors.delete(runId);
  }
}

function createCollector(runId, target) {
  let intervalId = null;
  const intervalMs = target.interval_ms || 5000;

  return {
    start() {
      intervalId = setInterval(async () => {
        try {
          const metrics = await collectMetrics(target);
          if (metrics.length > 0) {
            await db.insertInfraMetrics(
              metrics.map(m => ({
                ...m,
                run_id: runId,
                host: target.host || target.url || 'unknown',
              }))
            );
          }
        } catch (err) {
          console.warn(`[InfraMonitor] Collection error for ${target.host}: ${err.message}`);
        }
      }, intervalMs);
    },
    stop() {
      if (intervalId) clearInterval(intervalId);
    },
  };
}

async function collectMetrics(target) {
  switch (target.type) {
    case 'http_endpoint':
      return collectFromEndpoint(target);
    case 'system_stats':
      return collectSystemStats(target);
    default:
      return collectFromEndpoint(target);
  }
}

async function collectFromEndpoint(target) {
  if (!target.url) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(target.url, {
      signal: controller.signal,
      headers: target.headers || {},
    });

    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json();
    return parseMetricsResponse(data);
  } catch (_err) {
    return [];
  }
}

function parseMetricsResponse(data) {
  const metrics = [];
  const now = new Date();

  const flatten = (obj, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'number') {
        metrics.push({
          time: now,
          metric_name: fullKey,
          value,
          metadata: {},
        });
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        flatten(value, fullKey);
      }
    }
  };

  flatten(data);
  return metrics;
}

async function collectSystemStats(_target) {
  const metrics = [];
  const now = new Date();

  try {
    const { execSync } = await import('child_process');

    const loadAvg = execSync("sysctl -n vm.loadavg 2>/dev/null || cat /proc/loadavg 2>/dev/null || echo '0 0 0'", { encoding: 'utf-8' });
    const loadValues = loadAvg.match(/[\d.]+/g);
    if (loadValues && loadValues.length >= 1) {
      metrics.push({ time: now, metric_name: 'cpu_load_1m', value: parseFloat(loadValues[0]), metadata: {} });
    }

    const memInfo = execSync("vm_stat 2>/dev/null | head -5 || free -m 2>/dev/null | head -3 || echo 'N/A'", { encoding: 'utf-8' });
    const pageSize = 16384;
    const freeMatch = memInfo.match(/Pages free:\s+(\d+)/);
    const activeMatch = memInfo.match(/Pages active:\s+(\d+)/);
    if (freeMatch && activeMatch) {
      const freeBytes = parseInt(freeMatch[1]) * pageSize;
      const activeBytes = parseInt(activeMatch[1]) * pageSize;
      const total = freeBytes + activeBytes;
      if (total > 0) {
        metrics.push({ time: now, metric_name: 'memory_usage_percent', value: (activeBytes / total) * 100, metadata: {} });
      }
    }
  } catch (_err) {
    // system stats collection is best-effort
  }

  return metrics;
}

export function getActiveCollectors() {
  return Array.from(activeCollectors.keys());
}
