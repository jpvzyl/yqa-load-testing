import { spawn } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const SCRIPTS_DIR = path.join(process.cwd(), '.k6-scripts');
const activeProcesses = new Map();

if (!existsSync(SCRIPTS_DIR)) {
  mkdirSync(SCRIPTS_DIR, { recursive: true });
}

export function generateK6Script(test) {
  if (test.script_content) return test.script_content;

  const config = test.config || {};
  const scenarios = config.scenarios || {};
  const thresholds = config.thresholds || {};
  const target = config.target_url || 'http://localhost:3000';
  const vus = config.vus || 10;
  const duration = config.duration || '30s';
  const testType = test.test_type || 'load';

  const stagesByType = {
    load: [
      { duration: '30s', target: vus },
      { duration: duration, target: vus },
      { duration: '10s', target: 0 },
    ],
    stress: [
      { duration: '2m', target: Math.round(vus * 0.5) },
      { duration: '5m', target: vus },
      { duration: '2m', target: Math.round(vus * 1.5) },
      { duration: '5m', target: Math.round(vus * 2) },
      { duration: '2m', target: 0 },
    ],
    spike: [
      { duration: '1m', target: Math.round(vus * 0.1) },
      { duration: '10s', target: vus },
      { duration: '3m', target: vus },
      { duration: '10s', target: Math.round(vus * 0.1) },
      { duration: '1m', target: 0 },
    ],
    soak: [
      { duration: '2m', target: vus },
      { duration: config.soak_duration || '30m', target: vus },
      { duration: '2m', target: 0 },
    ],
    breakpoint: Array.from({ length: 10 }, (_, i) => ({
      duration: '2m',
      target: Math.round(vus * (i + 1) * 0.5),
    })),
    smoke: [
      { duration: '1m', target: 1 },
    ],
  };

  const stages = stagesByType[testType] || stagesByType.load;

  const defaultThresholds = {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>10'],
    ...thresholds,
  };

  const endpoints = config.endpoints || [{ method: 'GET', url: target, name: 'default' }];
  const requestBlocks = endpoints.map((ep, i) => {
    const method = (ep.method || 'GET').toLowerCase();
    const url = ep.url || target;
    const name = ep.name || `endpoint_${i}`;
    const headers = ep.headers ? JSON.stringify(ep.headers) : '{}';
    const body = ep.body ? JSON.stringify(ep.body) : 'null';

    if (method === 'get') {
      return `  {
    const res = http.get('${url}', { headers: ${headers}, tags: { name: '${name}' } });
    check(res, { '${name} status 200': (r) => r.status === 200 });
    sleep(${ep.think_time || 1});
  }`;
    }
    return `  {
    const res = http.${method}('${url}', ${body}, { headers: ${headers}, tags: { name: '${name}' } });
    check(res, { '${name} status ok': (r) => r.status >= 200 && r.status < 400 });
    sleep(${ep.think_time || 1});
  }`;
  });

  return `import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const reqDuration = new Trend('req_duration');

export const options = {
  stages: ${JSON.stringify(stages, null, 2)},
  thresholds: ${JSON.stringify(defaultThresholds, null, 2)},
  ${Object.keys(scenarios).length > 0 ? `scenarios: ${JSON.stringify(scenarios, null, 2)},` : ''}
  noConnectionReuse: false,
  userAgent: 'Sarfat-LoadTest/1.0',
};

export default function () {
${requestBlocks.join('\n\n')}
}
`;
}

export async function executeK6(runId, script, onMetric, onProgress, onComplete) {
  const scriptPath = path.join(SCRIPTS_DIR, `${runId}.js`);
  const metricsPath = path.join(SCRIPTS_DIR, `${runId}-metrics.json`);

  writeFileSync(scriptPath, script, 'utf-8');

  const args = [
    'run',
    '--out', `json=${metricsPath}`,
    '--summary-export', path.join(SCRIPTS_DIR, `${runId}-summary.json`),
    '--no-color',
    scriptPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('k6', args, {
      env: { ...process.env, K6_NO_USAGE_REPORT: 'true' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    activeProcesses.set(runId, proc);
    let stdoutBuffer = '';
    let stderrBuffer = '';
    const metricsBatch = [];

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutBuffer += text;

      const progress = parseK6Progress(text);
      if (progress && onProgress) {
        onProgress(progress);
      }
    });

    proc.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
    });

    proc.on('close', (code) => {
      activeProcesses.delete(runId);

      if (metricsBatch.length > 0 && onMetric) {
        onMetric(metricsBatch);
      }

      let summary = null;
      try {
        const summaryPath = path.join(SCRIPTS_DIR, `${runId}-summary.json`);
        if (existsSync(summaryPath)) {
          summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
        }
      } catch (_e) { /* summary parsing is best-effort */ }

      cleanup(runId);

      if (onComplete) {
        onComplete({
          exitCode: code,
          summary,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          metricsPath,
        });
      }

      if (code === 0 || code === 99) {
        resolve({ exitCode: code, summary, metricsPath });
      } else {
        reject(new Error(`k6 exited with code ${code}: ${stderrBuffer.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      activeProcesses.delete(runId);
      cleanup(runId);
      reject(err);
    });
  });
}

export function abortK6(runId) {
  const proc = activeProcesses.get(runId);
  if (proc) {
    proc.kill('SIGINT');
    activeProcesses.delete(runId);
    return true;
  }
  return false;
}

export function isRunning(runId) {
  return activeProcesses.has(runId);
}

export function getActiveRuns() {
  return Array.from(activeProcesses.keys());
}

function parseK6Progress(text) {
  const lines = text.split('\n');
  for (const line of lines) {
    const vuMatch = line.match(/running.*?(\d+)\s+VUs/i);
    const iterMatch = line.match(/(\d+)\s+complete.*?(\d+)\s+interrupted/i);
    const durationMatch = line.match(/(\d+m\d+\.\ds)\/(\d+m\d+s)/);

    if (vuMatch || iterMatch || durationMatch) {
      return {
        vus: vuMatch ? parseInt(vuMatch[1]) : undefined,
        iterations: iterMatch ? parseInt(iterMatch[1]) : undefined,
        elapsed: durationMatch ? durationMatch[1] : undefined,
        total: durationMatch ? durationMatch[2] : undefined,
        raw: line.trim(),
      };
    }
  }
  return null;
}

function cleanup(runId) {
  const scriptPath = path.join(SCRIPTS_DIR, `${runId}.js`);
  try {
    if (existsSync(scriptPath)) unlinkSync(scriptPath);
  } catch (_e) { /* best effort */ }
}

export function parseK6Summary(summary) {
  if (!summary || !summary.metrics) return null;

  const m = summary.metrics;
  const get = (name, stat) => m[name]?.values?.[stat] ?? null;

  return {
    http_reqs: get('http_reqs', 'count'),
    http_req_duration_avg: get('http_req_duration', 'avg'),
    http_req_duration_min: get('http_req_duration', 'min'),
    http_req_duration_max: get('http_req_duration', 'max'),
    http_req_duration_med: get('http_req_duration', 'med'),
    http_req_duration_p90: get('http_req_duration', 'p(90)'),
    http_req_duration_p95: get('http_req_duration', 'p(95)'),
    http_req_duration_p99: get('http_req_duration', 'p(99)'),
    http_req_failed_rate: get('http_req_failed', 'rate'),
    http_req_blocked_avg: get('http_req_blocked', 'avg'),
    http_req_connecting_avg: get('http_req_connecting', 'avg'),
    http_req_tls_handshaking_avg: get('http_req_tls_handshaking', 'avg'),
    http_req_waiting_avg: get('http_req_waiting', 'avg'),
    http_req_receiving_avg: get('http_req_receiving', 'avg'),
    http_req_sending_avg: get('http_req_sending', 'avg'),
    data_received: get('data_received', 'count'),
    data_sent: get('data_sent', 'count'),
    iteration_duration_avg: get('iteration_duration', 'avg'),
    vus_max: get('vus_max', 'value') || get('vus', 'max'),
    iterations: get('iterations', 'count'),
    checks_passes: m.checks?.values?.passes ?? null,
    checks_fails: m.checks?.values?.fails ?? null,
  };
}

export function extractThresholdResults(summary) {
  if (!summary?.metrics) return {};
  const results = {};
  for (const [name, metric] of Object.entries(summary.metrics)) {
    if (metric.thresholds) {
      for (const [threshold, passed] of Object.entries(metric.thresholds)) {
        results[`${name}{${threshold}}`] = { passed: passed.ok, threshold };
      }
    }
  }
  return results;
}
