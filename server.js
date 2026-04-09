import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import { generateK6Script, executeK6, abortK6, isRunning, getActiveRuns, parseK6Summary, extractThresholdResults } from './k6-runner.js';
import { ingestK6JsonOutput } from './metrics-ingester.js';
import { calculatePerformanceScore, compareRuns } from './scoring.js';
import { runFullAnalysis, generateTestFromSpec, generateTestFromNaturalLanguage, generateAiReport } from './ai-analyzer.js';
import { captureBaseline, compareWithBaseline } from './baselines.js';
import { detectRegression } from './regression-detector.js';
import { generateReport, REPORT_TYPES } from './report-generator.js';
import { correlateMetrics } from './correlation-engine.js';
import { startCollection, stopCollection } from './infra-monitor.js';
import { initializeScheduler, registerJob, unregisterJob } from './scheduler.js';
import { notify, formatTestComplete } from './notifications.js';
import { importOpenAPI } from './importers/openapi-importer.js';
import { importHAR } from './importers/har-importer.js';
import { importPostman } from './importers/postman-importer.js';
import { importGraphQL } from './importers/graphql-importer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// --- WebSocket ---

const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Map();

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).slice(2);
  wsClients.set(clientId, { ws, subscriptions: new Set() });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'subscribe' && msg.run_id) {
        wsClients.get(clientId)?.subscriptions.add(msg.run_id);
      }
      if (msg.type === 'unsubscribe' && msg.run_id) {
        wsClients.get(clientId)?.subscriptions.delete(msg.run_id);
      }
    } catch (_e) { /* ignore */ }
  });

  ws.on('close', () => wsClients.delete(clientId));
});

function broadcastToRun(runId, message) {
  const payload = JSON.stringify(message);
  for (const [, client] of wsClients) {
    if (client.subscriptions.has(runId) && client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  }
}

// --- Auth Middleware ---

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.slice(7);
  const user = await db.validateSession(token);
  if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
  req.user = user;
  next();
}

// --- Auth Routes ---

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.authenticateUser(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = await db.createSession(user.id);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const user = await db.createUser(email, password, name);
    const token = await db.createSession(user.id);
    res.json({ token, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/v1/auth/logout', authenticate, async (req, res) => {
  const token = req.headers.authorization.slice(7);
  await db.deleteSession(token);
  res.json({ success: true });
});

app.get('/api/v1/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// --- Dashboard ---

app.get('/api/v1/dashboard', authenticate, async (req, res) => {
  try {
    const stats = await db.getDashboardStats(req.query.project_id);
    stats.active_runs = getActiveRuns().length;
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Projects ---

app.get('/api/v1/projects', authenticate, async (req, res) => {
  try {
    res.json(await db.getProjects());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/projects', authenticate, async (req, res) => {
  try {
    res.json(await db.createProject(req.body.name, req.body.description));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Tests CRUD ---

app.get('/api/v1/tests', authenticate, async (req, res) => {
  try {
    res.json(await db.getTests(req.query.project_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/tests/:id', authenticate, async (req, res) => {
  try {
    const test = await db.getTestById(req.params.id);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    res.json(test);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/tests', authenticate, async (req, res) => {
  try {
    const test = await db.createTest({ ...req.body, created_by: req.user.id });
    res.status(201).json(test);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/v1/tests/:id', authenticate, async (req, res) => {
  try {
    const test = await db.updateTest(req.params.id, req.body);
    res.json(test);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/v1/tests/:id', authenticate, async (req, res) => {
  try {
    await db.deleteTest(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Test Runs ---

app.get('/api/v1/runs', authenticate, async (req, res) => {
  try {
    const runs = req.query.test_id
      ? await db.getTestRuns(req.query.test_id, parseInt(req.query.limit || '50'))
      : await db.getAllRuns(parseInt(req.query.limit || '50'));
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/runs/:id', authenticate, async (req, res) => {
  try {
    const run = await db.getRunById(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Execute Test ---

app.post('/api/v1/tests/:id/run', authenticate, async (req, res) => {
  try {
    const test = await db.getTestById(req.params.id);
    if (!test) return res.status(404).json({ error: 'Test not found' });

    const run = await db.createTestRun({
      test_id: test.id,
      project_id: test.project_id,
      config_snapshot: { ...test.config, ...req.body.config },
      environment: req.body.environment || 'staging',
      trigger: req.body.trigger || 'manual',
      trigger_meta: req.body.trigger_meta || {},
      created_by: req.user.id,
    });

    res.status(202).json(run);

    executeTestInBackground(test, run);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/runs/:id/abort', authenticate, async (req, res) => {
  try {
    const aborted = abortK6(req.params.id);
    if (aborted) {
      await db.updateTestRun(req.params.id, { status: 'aborted', completed_at: new Date() });
      broadcastToRun(req.params.id, { type: 'status', status: 'aborted' });
    }
    res.json({ aborted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function executeTestInBackground(test, run) {
  const runId = run.id;

  try {
    await db.updateTestRun(runId, { status: 'initializing', started_at: new Date() });
    broadcastToRun(runId, { type: 'status', status: 'initializing' });

    const script = generateK6Script(test);

    const infraTargets = run.config_snapshot?.infra_targets;
    if (infraTargets) startCollection(runId, infraTargets);

    await db.updateTestRun(runId, { status: 'running' });
    broadcastToRun(runId, { type: 'status', status: 'running' });

    const result = await executeK6(
      runId,
      script,
      null,
      (progress) => broadcastToRun(runId, { type: 'progress', ...progress }),
      null
    );

    stopCollection(runId);

    await db.updateTestRun(runId, { status: 'collecting' });
    broadcastToRun(runId, { type: 'status', status: 'collecting' });

    const parsedSummary = parseK6Summary(result.summary);
    const thresholdResults = extractThresholdResults(result.summary);

    await ingestK6JsonOutput(runId, result.metricsPath);

    const baseline = test.id ? await db.getActiveBaseline(test.id, run.environment) : null;
    const score = calculatePerformanceScore(parsedSummary || {}, baseline, thresholdResults);

    await db.updateTestRun(runId, {
      status: 'analyzing',
      k6_summary: parsedSummary,
      threshold_results: thresholdResults,
      performance_score: score.overall,
      performance_grade: score.grade.grade,
      duration_ms: parsedSummary?.iteration_duration_avg
        ? Math.round(parsedSummary.iteration_duration_avg * (parsedSummary.iterations || 1))
        : null,
    });
    broadcastToRun(runId, { type: 'status', status: 'analyzing' });

    let analysis = null;
    try {
      analysis = await runFullAnalysis(runId);
    } catch (err) {
      console.warn(`[Run ${runId}] AI analysis failed: ${err.message}`);
    }

    const regression = await detectRegression(runId).catch(() => null);
    const baselineComparison = await compareWithBaseline(runId).catch(() => null);

    await db.updateTestRun(runId, {
      status: 'complete',
      completed_at: new Date(),
    });

    broadcastToRun(runId, {
      type: 'complete',
      status: 'complete',
      performance_score: score.overall,
      performance_grade: score.grade.grade,
      k6_summary: parsedSummary,
      regression: regression?.has_regression || false,
    });

    const notifConfig = run.config_snapshot?.notifications;
    if (notifConfig) {
      const notifData = formatTestComplete({ ...run, ...parsedSummary, performance_score: score.overall, performance_grade: score.grade.grade }, analysis);
      await notify('test_complete', notifData, notifConfig).catch(() => {});
    }

  } catch (err) {
    stopCollection(runId);
    console.error(`[Run ${runId}] Execution failed:`, err.message);
    await db.updateTestRun(runId, {
      status: 'failed',
      completed_at: new Date(),
      error_output: err.message,
    });
    broadcastToRun(runId, { type: 'error', status: 'failed', error: err.message });
  }
}

// --- Metrics ---

app.get('/api/v1/runs/:id/metrics', authenticate, async (req, res) => {
  try {
    const metrics = await db.getRunMetrics(req.params.id, req.query.metric_name);
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/runs/:id/metrics/summary', authenticate, async (req, res) => {
  try {
    res.json(await db.getRunMetricsSummary(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/runs/:id/endpoints', authenticate, async (req, res) => {
  try {
    res.json(await db.getEndpointMetrics(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- AI Analysis ---

app.post('/api/v1/runs/:id/analyze', authenticate, async (req, res) => {
  try {
    const result = await runFullAnalysis(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/runs/:id/analyses', authenticate, async (req, res) => {
  try {
    res.json(await db.getAnalyses(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/ai/generate-test', authenticate, async (req, res) => {
  try {
    const { spec, spec_type, description } = req.body;
    let script;
    if (description) {
      script = await generateTestFromNaturalLanguage(description);
    } else if (spec) {
      script = await generateTestFromSpec(spec, spec_type || 'openapi');
    } else {
      return res.status(400).json({ error: 'Provide spec or description' });
    }
    res.json({ script });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Reports ---

app.get('/api/v1/runs/:id/reports', authenticate, async (req, res) => {
  try {
    res.json(await db.getReports(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/reports', authenticate, async (req, res) => {
  try {
    res.json(await db.getReports());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/runs/:id/reports', authenticate, async (req, res) => {
  try {
    const report = await generateReport(req.params.id, req.body.report_type || 'executive_summary');
    res.status(201).json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/report-types', authenticate, (_req, res) => {
  res.json(REPORT_TYPES);
});

// --- Baselines ---

app.get('/api/v1/baselines', authenticate, async (req, res) => {
  try {
    res.json(await db.getBaselines(req.query.test_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/baselines', authenticate, async (req, res) => {
  try {
    const baseline = await captureBaseline(
      req.body.run_id, req.body.test_id, req.body.environment, req.body.notes
    );
    res.status(201).json(baseline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/runs/:id/baseline-comparison', authenticate, async (req, res) => {
  try {
    const comparison = await compareWithBaseline(req.params.id);
    res.json(comparison || { message: 'No baseline available' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Regression ---

app.get('/api/v1/runs/:id/regression', authenticate, async (req, res) => {
  try {
    const result = await detectRegression(req.params.id);
    res.json(result || { detectable: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Comparison ---

app.get('/api/v1/compare/:id1/:id2', authenticate, async (req, res) => {
  try {
    const [run1, run2] = await Promise.all([
      db.getRunById(req.params.id1),
      db.getRunById(req.params.id2),
    ]);
    if (!run1 || !run2) return res.status(404).json({ error: 'Run(s) not found' });
    const comparison = compareRuns(run1.k6_summary || {}, run2.k6_summary || {});
    res.json({ run1: { id: run1.id, score: run1.performance_score, summary: run1.k6_summary },
               run2: { id: run2.id, score: run2.performance_score, summary: run2.k6_summary },
               comparison });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Infrastructure ---

app.get('/api/v1/runs/:id/infra', authenticate, async (req, res) => {
  try {
    res.json(await db.getInfraMetrics(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/runs/:id/correlation', authenticate, async (req, res) => {
  try {
    res.json(await correlateMetrics(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SLA ---

app.get('/api/v1/slas', authenticate, async (req, res) => {
  try {
    res.json(await db.getSlaDefinitions(req.query.project_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/slas', authenticate, async (req, res) => {
  try {
    res.status(201).json(await db.createSlaDefinition(req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/runs/:id/sla-results', authenticate, async (req, res) => {
  try {
    res.json(await db.getSlaResults(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Schedules ---

app.get('/api/v1/schedules', authenticate, async (req, res) => {
  try {
    res.json(await db.getSchedules());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/schedules', authenticate, async (req, res) => {
  try {
    const schedule = await db.createSchedule(req.body);
    registerJob(schedule, (testId, opts) => {
      return db.getTestById(testId).then(test => {
        if (!test) throw new Error('Test not found');
        return db.createTestRun({ test_id: testId, project_id: test.project_id, ...opts })
          .then(run => executeTestInBackground(test, run));
      });
    });
    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Importers ---

app.post('/api/v1/import/openapi', authenticate, upload.single('file'), async (req, res) => {
  try {
    const content = req.file ? req.file.buffer.toString('utf-8') : req.body.spec;
    if (!content) return res.status(400).json({ error: 'Provide spec file or content' });
    res.json(importOpenAPI(content));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/import/har', authenticate, upload.single('file'), async (req, res) => {
  try {
    const content = req.file ? req.file.buffer.toString('utf-8') : req.body.har;
    if (!content) return res.status(400).json({ error: 'Provide HAR file or content' });
    res.json(importHAR(content));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/import/postman', authenticate, upload.single('file'), async (req, res) => {
  try {
    const content = req.file ? req.file.buffer.toString('utf-8') : req.body.collection;
    if (!content) return res.status(400).json({ error: 'Provide Postman collection file or content' });
    res.json(importPostman(content));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/import/graphql', authenticate, upload.single('file'), async (req, res) => {
  try {
    const content = req.file ? req.file.buffer.toString('utf-8') : req.body.schema;
    if (!content) return res.status(400).json({ error: 'Provide GraphQL schema' });
    res.json(importGraphQL(content, req.body.endpoint));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Static / SPA ---

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

// --- Start ---

const PORT = process.env.PORT || 3006;

async function start() {
  if (process.env.DATABASE_URL) {
    await db.initializeDatabase();
    initializeScheduler((testId, opts) => {
      return db.getTestById(testId).then(test => {
        if (!test) throw new Error('Test not found');
        return db.createTestRun({ test_id: testId, project_id: test.project_id, ...opts })
          .then(run => executeTestInBackground(test, run));
      });
    });
  } else {
    console.log('[Server] No DATABASE_URL — running without database (in-memory mode not available, set DATABASE_URL)');
  }

  server.listen(PORT, () => {
    console.log(`[Y-QA Load Testing] Server running on port ${PORT}`);
    console.log(`[Y-QA Load Testing] API: http://localhost:${PORT}/api/v1`);
    console.log(`[Y-QA Load Testing] WebSocket: ws://localhost:${PORT}/ws`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export { app, server };
