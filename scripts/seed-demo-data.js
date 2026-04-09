// Seed demo data into the database for development and demos.
// Creates a project, 5 test types, 10 completed runs with realistic metrics,
// a baseline, and 3 SLA definitions.
//
// Usage: DATABASE_URL=postgres://... node scripts/seed-demo-data.js

import {
  initializeDatabase,
  createProject,
  createTest,
  createTestRun,
  updateTestRun,
  createBaseline,
  createSlaDefinition,
  getPool,
} from '../db.js';

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function buildK6Summary(testType) {
  const base = {
    load: { avgDur: 120, p95: 280, p99: 420, errRate: 0.003, rps: 450 },
    stress: { avgDur: 210, p95: 480, p99: 780, errRate: 0.012, rps: 820 },
    spike: { avgDur: 340, p95: 890, p99: 1400, errRate: 0.045, rps: 1200 },
    soak: { avgDur: 145, p95: 310, p99: 460, errRate: 0.005, rps: 420 },
    breakpoint: { avgDur: 280, p95: 650, p99: 1100, errRate: 0.035, rps: 1800 },
  };

  const b = base[testType] || base.load;
  const jitter = () => randomBetween(0.85, 1.15);

  const avgDur = b.avgDur * jitter();
  const p95 = b.p95 * jitter();
  const p99 = b.p99 * jitter();
  const errRate = Math.max(0, b.errRate * jitter());
  const rps = b.rps * jitter();
  const totalReqs = Math.floor(rps * randomBetween(100, 180));

  return {
    metrics: {
      http_req_duration: {
        type: 'trend',
        contains: 'time',
        values: {
          avg: avgDur,
          min: avgDur * 0.15,
          med: avgDur * 0.9,
          max: avgDur * 6,
          'p(90)': p95 * 0.88,
          'p(95)': p95,
          'p(99)': p99,
        },
      },
      http_req_waiting: {
        type: 'trend',
        contains: 'time',
        values: {
          avg: avgDur * 0.8,
          min: avgDur * 0.1,
          med: avgDur * 0.75,
          max: avgDur * 5,
          'p(90)': p95 * 0.75,
          'p(95)': p95 * 0.82,
          'p(99)': p99 * 0.85,
        },
      },
      http_req_failed: {
        type: 'rate',
        contains: 'default',
        values: { rate: errRate, passes: Math.floor(totalReqs * errRate), fails: totalReqs - Math.floor(totalReqs * errRate) },
      },
      http_reqs: {
        type: 'counter',
        contains: 'default',
        values: { count: totalReqs, rate: rps },
      },
      http_req_connecting: {
        type: 'trend',
        contains: 'time',
        values: { avg: 1.2, min: 0, med: 0, max: 45, 'p(90)': 0, 'p(95)': 2.1, 'p(99)': 12 },
      },
      http_req_tls_handshaking: {
        type: 'trend',
        contains: 'time',
        values: { avg: 0, min: 0, med: 0, max: 0, 'p(90)': 0, 'p(95)': 0, 'p(99)': 0 },
      },
      vus: {
        type: 'gauge',
        contains: 'default',
        values: { value: 0, min: 0, max: testType === 'spike' ? 300 : testType === 'stress' ? 200 : 50 },
      },
      vus_max: {
        type: 'gauge',
        contains: 'default',
        values: { value: testType === 'spike' ? 300 : testType === 'stress' ? 200 : 50, min: testType === 'spike' ? 300 : testType === 'stress' ? 200 : 50, max: testType === 'spike' ? 300 : testType === 'stress' ? 200 : 50 },
      },
      iterations: {
        type: 'counter',
        contains: 'default',
        values: { count: totalReqs, rate: rps * 0.95 },
      },
      iteration_duration: {
        type: 'trend',
        contains: 'time',
        values: { avg: avgDur + 1200, min: avgDur + 500, med: avgDur + 1100, max: avgDur + 3500, 'p(90)': avgDur + 2100, 'p(95)': avgDur + 2500, 'p(99)': avgDur + 3200 },
      },
      data_received: {
        type: 'counter',
        contains: 'data',
        values: { count: totalReqs * 2400, rate: rps * 2400 },
      },
      data_sent: {
        type: 'counter',
        contains: 'data',
        values: { count: totalReqs * 350, rate: rps * 350 },
      },
    },
    root_group: {
      name: '',
      path: '',
      id: 'd41d8cd98f00b204e9800998ecf8427e',
      groups: [],
      checks: [
        { name: 'status is 200', path: '::status is 200', id: 'a1b2c3', passes: totalReqs - Math.floor(totalReqs * errRate), fails: Math.floor(totalReqs * errRate) },
        { name: 'response time OK', path: '::response time OK', id: 'd4e5f6', passes: Math.floor(totalReqs * 0.95), fails: Math.floor(totalReqs * 0.05) },
      ],
    },
  };
}

const TEST_CONFIGS = [
  {
    name: 'API Health — Load Test',
    description: 'Standard load test against the API health endpoint. 50 VUs for 2 minutes.',
    test_type: 'load',
    protocol: 'http',
    tags: ['api', 'health', 'load'],
  },
  {
    name: 'API Stress — Progressive Ramp',
    description: 'Stress test ramping from 10 to 200 VUs to find the breaking point.',
    test_type: 'stress',
    protocol: 'http',
    tags: ['api', 'stress', 'capacity'],
  },
  {
    name: 'Auto-scaling — Spike Test',
    description: 'Spike test with sudden bursts to 200 and 300 VUs to validate auto-scaling.',
    test_type: 'spike',
    protocol: 'http',
    tags: ['api', 'spike', 'scaling'],
  },
  {
    name: 'Endurance — 30min Soak',
    description: 'Soak test holding 50 VUs for 30 minutes to detect memory leaks and degradation.',
    test_type: 'soak',
    protocol: 'http',
    tags: ['api', 'soak', 'endurance'],
  },
  {
    name: 'Capacity Ceiling — Breakpoint',
    description: 'Breakpoint test ramping arrival rate from 10 to 200 RPS to find exact capacity.',
    test_type: 'breakpoint',
    protocol: 'http',
    tags: ['api', 'breakpoint', 'capacity'],
  },
];

async function seed() {
  console.log('[Seed] Initializing database...');
  await initializeDatabase();

  console.log('[Seed] Creating demo project...');
  const project = await createProject(
    'Demo E-Commerce Platform',
    'Performance test suite for the demo e-commerce platform APIs including product catalog, cart, checkout, and search.'
  );
  console.log(`[Seed] Project created: ${project.id}`);

  console.log('[Seed] Creating demo tests...');
  const tests = [];
  for (const cfg of TEST_CONFIGS) {
    const test = await createTest({
      project_id: project.id,
      name: cfg.name,
      description: cfg.description,
      test_type: cfg.test_type,
      protocol: cfg.protocol,
      tags: cfg.tags,
      config: {
        stages: cfg.test_type === 'load'
          ? [{ duration: '30s', target: 50 }, { duration: '2m', target: 50 }, { duration: '15s', target: 0 }]
          : cfg.test_type === 'stress'
          ? [{ duration: '1m', target: 10 }, { duration: '2m', target: 50 }, { duration: '2m', target: 100 }, { duration: '2m', target: 200 }, { duration: '2m', target: 0 }]
          : cfg.test_type === 'spike'
          ? [{ duration: '1m', target: 5 }, { duration: '10s', target: 200 }, { duration: '30s', target: 200 }, { duration: '10s', target: 5 }, { duration: '2m', target: 5 }]
          : cfg.test_type === 'soak'
          ? [{ duration: '2m', target: 50 }, { duration: '30m', target: 50 }, { duration: '1m', target: 0 }]
          : [],
        thresholds: {
          'http_req_duration': ['p(95)<500'],
          'http_req_failed': ['rate<0.01'],
        },
      },
    });
    tests.push(test);
    console.log(`[Seed]   Test: ${test.name} (${test.id})`);
  }

  console.log('[Seed] Creating demo test runs...');
  const runs = [];
  const now = Date.now();

  for (let i = 0; i < 10; i++) {
    const testIndex = i % tests.length;
    const test = tests[testIndex];
    const daysAgo = 10 - i;
    const startedAt = new Date(now - daysAgo * 86400000 + randomBetween(0, 43200000));
    const durationMs = Math.floor(randomBetween(60000, 300000));
    const completedAt = new Date(startedAt.getTime() + durationMs);

    const summary = buildK6Summary(test.test_type);
    const score = randomBetween(65, 98);
    const grade = randomGrade(score);

    const p95 = summary.metrics.http_req_duration.values['p(95)'];
    const errRate = summary.metrics.http_req_failed.values.rate;
    const thresholdResults = {
      'http_req_duration{p(95)}': { ok: p95 < 500, value: p95, threshold: 500 },
      'http_req_failed{rate}': { ok: errRate < 0.01, value: errRate, threshold: 0.01 },
    };

    const run = await createTestRun({
      test_id: test.id,
      project_id: project.id,
      config_snapshot: test.config || {},
      environment: 'staging',
      trigger: i < 3 ? 'manual' : 'scheduled',
    });

    await updateTestRun(run.id, {
      status: 'complete',
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      k6_summary: summary,
      threshold_results: thresholdResults,
      performance_score: parseFloat(score.toFixed(1)),
      performance_grade: grade,
    });

    runs.push({ ...run, test_type: test.test_type });
    console.log(`[Seed]   Run ${i + 1}/10: ${test.name} — score ${score.toFixed(1)} (${grade})`);
  }

  console.log('[Seed] Creating baseline from best load test run...');
  const loadRun = runs.find((r) => r.test_type === 'load');
  const loadTest = tests.find((t) => t.test_type === 'load');
  if (loadRun && loadTest) {
    await createBaseline({
      test_id: loadTest.id,
      run_id: loadRun.id,
      environment: 'staging',
      metrics_summary: {
        http_req_duration_p95: 280,
        http_req_duration_avg: 120,
        http_req_failed_rate: 0.003,
        http_reqs_rate: 450,
      },
      thresholds: {
        'http_req_duration': { p95: 500, p99: 1000 },
        'http_req_failed': { rate: 0.01 },
      },
      is_active: true,
      notes: 'Auto-created baseline from best-performing load test run.',
    });
    console.log('[Seed]   Baseline created for load test');
  }

  console.log('[Seed] Creating SLA definitions...');
  const slas = [
    { name: 'Response Time P95', metric: 'http_req_duration_p95', operator: '<', threshold_value: 500, unit: 'ms', severity: 'critical' },
    { name: 'Error Rate', metric: 'http_req_failed_rate', operator: '<', threshold_value: 0.01, unit: 'ratio', severity: 'critical' },
    { name: 'Throughput', metric: 'http_reqs_rate', operator: '>', threshold_value: 100, unit: 'req/s', severity: 'warning' },
  ];

  for (const sla of slas) {
    await createSlaDefinition({ project_id: project.id, ...sla });
    console.log(`[Seed]   SLA: ${sla.name} (${sla.operator} ${sla.threshold_value} ${sla.unit})`);
  }

  console.log('\n[Seed] Done! Demo data seeded successfully.');
  console.log(`  Project:  ${project.name} (${project.id})`);
  console.log(`  Tests:    ${tests.length}`);
  console.log(`  Runs:     ${runs.length}`);
  console.log(`  Baseline: 1`);
  console.log(`  SLAs:     ${slas.length}`);
}

seed()
  .then(() => {
    const p = getPool();
    return p.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Seed] Fatal error:', err);
    process.exit(1);
  });
