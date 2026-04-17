#!/usr/bin/env node

import { readFileSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { parseSarfatYaml, validateSarfatSpec } from './sarfat-yaml-parser.js';

const API_URL = process.env.SARFAT_API_URL || 'http://localhost:3000';
const API_KEY = process.env.SARFAT_API_KEY || '';

// ── Helpers ──

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (API_KEY) h['Authorization'] = `Bearer ${API_KEY}`;
  return h;
}

async function api(method, endpoint, body) {
  const url = `${API_URL}${endpoint}`;
  const opts = { method, headers: headers() };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    fatal(`Cannot reach Sarfat API at ${API_URL}: ${err.message}`);
  }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    const msg = typeof data === 'object' ? (data.error || data.message || JSON.stringify(data)) : data;
    fatal(`API ${res.status}: ${msg}`);
  }
  return data;
}

function fatal(msg) {
  console.error(`\x1b[31mError:\x1b[0m ${msg}`);
  process.exit(1);
}

function success(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function info(msg) {
  console.log(`\x1b[36mℹ\x1b[0m ${msg}`);
}

function table(rows, columns) {
  if (!rows.length) { info('No results.'); return; }
  const widths = columns.map(c => Math.max(c.label.length, ...rows.map(r => String(c.get(r)).length)));

  const header = columns.map((c, i) => c.label.padEnd(widths[i])).join('  ');
  const sep = widths.map(w => '─'.repeat(w)).join('──');
  console.log(`\n  ${header}`);
  console.log(`  ${sep}`);
  for (const row of rows) {
    const line = columns.map((c, i) => String(c.get(row)).padEnd(widths[i])).join('  ');
    console.log(`  ${line}`);
  }
  console.log();
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ── Commands ──

async function cmdRun(target) {
  if (!target) fatal('Usage: sarfat run <test-id-or-file>');

  if (target.endsWith('.yaml') || target.endsWith('.yml')) {
    const filePath = path.resolve(target);
    if (!existsSync(filePath)) fatal(`File not found: ${filePath}`);
    const content = readFileSync(filePath, 'utf-8');
    const spec = parseSarfatYaml(content);
    const errors = validateSarfatSpec(spec);
    if (errors.length) fatal(`Invalid sarfat.yaml:\n  ${errors.join('\n  ')}`);

    info(`Applying test configuration from ${target}...`);
    const test = await api('POST', '/api/tests', {
      name: spec.metadata.name,
      config: spec.spec,
    });
    info(`Test created: ${test.id}`);
    target = test.id;
  }

  info(`Starting test run for ${target}...`);
  const run = await api('POST', `/api/tests/${target}/runs`, {});

  success(`Run started: ${run.id}`);
  info(`Status: ${run.status}`);
  info(`Track progress: ${API_URL}/runs/${run.id}`);

  if (process.argv.includes('--wait') || process.argv.includes('-w')) {
    await waitForRun(run.id);
  }
}

async function waitForRun(runId) {
  info('Waiting for run to complete...');
  const startTime = Date.now();

  while (true) {
    await new Promise(r => setTimeout(r, 5000));
    const run = await api('GET', `/api/runs/${runId}`);

    const elapsed = formatDuration(Date.now() - startTime);
    process.stdout.write(`\r  ⏳ ${run.status} (${elapsed})   `);

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      console.log();
      if (run.status === 'completed') {
        success(`Run completed in ${elapsed}`);
        await printRunSummary(run);
      } else {
        fatal(`Run ${run.status} after ${elapsed}`);
      }
      break;
    }
  }
}

async function printRunSummary(run) {
  const summary = run.k6_summary || run.summary;
  if (!summary) return;

  console.log('\n  ── Results ──');
  if (summary.metrics) {
    const m = summary.metrics;
    if (m.http_req_duration) {
      console.log(`  HTTP Duration  avg=${m.http_req_duration.avg?.toFixed(1)}ms  p95=${m.http_req_duration['p(95)']?.toFixed(1)}ms  p99=${m.http_req_duration['p(99)']?.toFixed(1)}ms`);
    }
    if (m.http_reqs) {
      console.log(`  Throughput     ${m.http_reqs.rate?.toFixed(1)} req/s  (total: ${m.http_reqs.count})`);
    }
    if (m.http_req_failed) {
      console.log(`  Error Rate     ${(m.http_req_failed.rate * 100).toFixed(2)}%`);
    }
  }
  console.log();
}

async function cmdApply(file) {
  if (!file) fatal('Usage: sarfat apply <sarfat.yaml>');

  const filePath = path.resolve(file);
  if (!existsSync(filePath)) fatal(`File not found: ${filePath}`);

  const content = readFileSync(filePath, 'utf-8');
  const spec = parseSarfatYaml(content);
  const errors = validateSarfatSpec(spec);
  if (errors.length) fatal(`Invalid sarfat.yaml:\n  ${errors.join('\n  ')}`);

  info(`Applying configuration: ${spec.metadata.name}`);

  const test = await api('POST', '/api/tests', {
    name: spec.metadata.name,
    description: spec.metadata.description,
    config: spec.spec,
  });
  success(`Test created: ${test.id} (${test.name})`);

  if (spec.spec.slos?.length) {
    info(`  ${spec.spec.slos.length} SLO(s) configured`);
  }
  if (spec.spec.chaos?.length) {
    info(`  ${spec.spec.chaos.length} chaos fault(s) configured`);
  }
  if (spec.spec.stages?.length) {
    info(`  ${spec.spec.stages.length} stage(s) configured`);
  }
  if (spec.spec.regions?.length) {
    info(`  Regions: ${spec.spec.regions.join(', ')}`);
  }

  console.log(`\n  Run with: sarfat run ${test.id}\n`);
}

async function cmdDiff(runId1, runId2) {
  if (!runId1 || !runId2) fatal('Usage: sarfat diff <run-id-1> <run-id-2>');

  info(`Comparing runs:\n    A: ${runId1}\n    B: ${runId2}`);

  const [runA, runB] = await Promise.all([
    api('GET', `/api/runs/${runId1}`),
    api('GET', `/api/runs/${runId2}`),
  ]);

  const sA = runA.k6_summary?.metrics || runA.summary?.metrics || {};
  const sB = runB.k6_summary?.metrics || runB.summary?.metrics || {};

  console.log('\n  ── Performance Comparison ──\n');

  const metrics = [
    { key: 'http_req_duration', label: 'HTTP Duration', sub: 'avg', unit: 'ms' },
    { key: 'http_req_duration', label: 'HTTP p95', sub: 'p(95)', unit: 'ms' },
    { key: 'http_req_duration', label: 'HTTP p99', sub: 'p(99)', unit: 'ms' },
    { key: 'http_reqs', label: 'Throughput', sub: 'rate', unit: 'req/s' },
    { key: 'http_req_failed', label: 'Error Rate', sub: 'rate', unit: '%', multiply: 100 },
  ];

  for (const m of metrics) {
    const valA = sA[m.key]?.[m.sub];
    const valB = sB[m.key]?.[m.sub];
    if (valA == null && valB == null) continue;

    const a = (valA ?? 0) * (m.multiply || 1);
    const b = (valB ?? 0) * (m.multiply || 1);
    const delta = a === 0 ? 0 : ((b - a) / a * 100);
    const arrow = delta > 5 ? '▲' : delta < -5 ? '▼' : '≈';
    const color = m.key === 'http_reqs'
      ? (delta > 0 ? '\x1b[32m' : delta < 0 ? '\x1b[31m' : '')
      : (delta < 0 ? '\x1b[32m' : delta > 0 ? '\x1b[31m' : '');

    console.log(`  ${m.label.padEnd(16)} ${a.toFixed(2).padStart(10)} → ${b.toFixed(2).padStart(10)}  ${color}${arrow} ${delta.toFixed(1)}%\x1b[0m`);
  }
  console.log();

  if (runA.slo_results || runB.slo_results) {
    console.log('  ── SLO Comparison ──\n');
    const sloA = runA.slo_results || [];
    const sloB = runB.slo_results || [];
    console.log(`  Run A: ${sloA.filter(s => s.passed).length}/${sloA.length} passed`);
    console.log(`  Run B: ${sloB.filter(s => s.passed).length}/${sloB.length} passed`);
    console.log();
  }
}

async function cmdInit() {
  const target = path.resolve('sarfat.yaml');
  if (existsSync(target)) fatal('sarfat.yaml already exists in this directory');

  const template = `apiVersion: sarfat.io/v1
kind: Test
metadata:
  name: my-load-test
  description: Load test generated by sarfat init
spec:
  workload_model:
    scenarios:
      - name: default
        protocol: http
        weight: 100
        script: |
          import http from 'k6/http';
          import { check, sleep } from 'k6';
          export default function () {
            const res = http.get('https://test-api.example.com/health');
            check(res, { 'status is 200': (r) => r.status === 200 });
            sleep(1);
          }
  stages:
    - name: ramp-up
      duration: 2m
      target_vus: 100
    - name: steady
      duration: 5m
      target_vus: 100
    - name: ramp-down
      duration: 1m
      target_vus: 0
  slos:
    - name: latency-p95
      metric: http_req_duration
      percentile: 95
      threshold_ms: 500
    - name: error-rate
      metric: http_req_failed
      target: 0.01
  chaos: []
  regions:
    - us-east-1
  on_completion:
    notify:
      - type: slack
        channel: "#perf-results"
`;

  writeFileSync(target, template, 'utf-8');
  success('Created sarfat.yaml');
  info('Edit the file, then run: sarfat apply sarfat.yaml');
}

async function cmdStatus() {
  info(`Sarfat API: ${API_URL}\n`);

  let workers, runs;
  try {
    [workers, runs] = await Promise.all([
      api('GET', '/api/workers'),
      api('GET', '/api/runs?status=running'),
    ]);
  } catch {
    const health = await api('GET', '/api/health').catch(() => null);
    if (health) {
      success('API is reachable');
      console.log(`  Version: ${health.version || 'unknown'}`);
    }
    return;
  }

  const workerList = Array.isArray(workers) ? workers : (workers.workers || []);
  const runList = Array.isArray(runs) ? runs : (runs.runs || []);

  console.log('  ── Workers ──\n');
  if (workerList.length === 0) {
    info('No workers registered');
  } else {
    table(workerList, [
      { label: 'Name', get: w => w.name },
      { label: 'Region', get: w => w.region },
      { label: 'Status', get: w => w.status },
      { label: 'VUs', get: w => `${w.current_vus || 0}/${w.capacity_vus}` },
      { label: 'Provider', get: w => w.provider },
    ]);

    const online = workerList.filter(w => w.status === 'online').length;
    const totalCap = workerList.reduce((s, w) => s + (w.capacity_vus || 0), 0);
    const usedCap = workerList.reduce((s, w) => s + (w.current_vus || 0), 0);
    console.log(`  ${online}/${workerList.length} online  |  VU capacity: ${usedCap.toLocaleString()}/${totalCap.toLocaleString()}\n`);
  }

  console.log('  ── Active Runs ──\n');
  if (runList.length === 0) {
    info('No active runs');
  } else {
    table(runList, [
      { label: 'Run ID', get: r => r.id.slice(0, 8) },
      { label: 'Test', get: r => r.test_name || r.test_id?.slice(0, 8) || '—' },
      { label: 'Status', get: r => r.status },
      { label: 'VUs', get: r => r.current_vus || r.vus || '—' },
      { label: 'Started', get: r => r.started_at ? new Date(r.started_at).toLocaleTimeString() : '—' },
    ]);
  }
}

function printUsage() {
  console.log(`
  \x1b[1mSarfat Load Testing CLI\x1b[0m

  Usage: sarfat <command> [options]

  Commands:
    run <test-id|file>           Run a test by ID or sarfat.yaml file
    apply <sarfat.yaml>          Apply a test configuration
    diff <run-id-1> <run-id-2>   Compare two test runs
    init                         Create a sarfat.yaml in current directory
    status                       Show platform status

  Options:
    -w, --wait                   Wait for run completion (with 'run')
    -h, --help                   Show this help message

  Environment:
    SARFAT_API_URL               API endpoint (default: http://localhost:3000)
    SARFAT_API_KEY               API authentication key

  Examples:
    sarfat init
    sarfat apply sarfat.yaml
    sarfat run sarfat.yaml --wait
    sarfat run 3f2a1b4c-... --wait
    sarfat diff abc123 def456
    sarfat status
`);
}

// ── Main ──

const [,, command, ...args] = process.argv;

if (!command || command === '-h' || command === '--help') {
  printUsage();
  process.exit(0);
}

const commands = {
  run:    () => cmdRun(args[0]),
  apply:  () => cmdApply(args[0]),
  diff:   () => cmdDiff(args[0], args[1]),
  init:   () => cmdInit(),
  status: () => cmdStatus(),
};

if (!commands[command]) {
  fatal(`Unknown command: ${command}\nRun 'sarfat --help' for usage.`);
}

commands[command]().catch(err => {
  fatal(err.message);
});
