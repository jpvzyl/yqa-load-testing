import { workerPool, shardDistributor } from './worker-manager.js';
import * as dbv2 from './db-v2.js';
import { workloadModeler } from './workload-modeler.js';
import { sloEngine, budgetChecker } from './slo-engine.js';
import { getOTelCollector, traceCorrelator, logCorrelator } from './otel-collector.js';
import { chaosEngine, FAULT_CATALOG } from './chaos-engine.js';
import { captureAgent, replayEngine } from './replay-engine.js';
import { prGateManager } from './pr-gate.js';
import { costModeler } from './cost-modeler.js';
import { getEvidenceStore } from './evidence-store.js';
import { apmManager, SUPPORTED_APMS } from './apm-integrations.js';
import { runAgentPipeline, runSingleAgent, AGENTS } from './ai-agents/agent-runner.js';
import { handleOIDCCallback, handleSAMLResponse } from './sso.js';
import { getMetricBus } from './nats-client.js';
import { generateComplianceReport, getSupportedFrameworks } from './compliance-reporter.js';

export function registerV2Routes(app, authenticate) {

  // =========================================================================
  // Workers
  // =========================================================================

  app.get('/api/v2/workers', authenticate, async (req, res) => {
    try {
      const filters = {};
      if (req.query.region) filters.region = req.query.region;
      if (req.query.status) filters.status = req.query.status;
      res.json(await dbv2.getWorkers(filters));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/workers', authenticate, async (req, res) => {
    try {
      const worker = await workerPool.register(req.body);
      res.status(201).json(worker);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/workers/status', authenticate, async (_req, res) => {
    try {
      res.json(await workerPool.getPoolStatus());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/workers/:id/heartbeat', async (req, res) => {
    try {
      const ack = await workerPool.heartbeat(req.params.id, req.body);
      res.json(ack);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/v2/workers/:id', authenticate, async (req, res) => {
    try {
      await workerPool.deregister(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/workers/:id/heartbeats', authenticate, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '100');
      res.json(await dbv2.getWorkerHeartbeats(req.params.id, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Shards
  // =========================================================================

  app.get('/api/v2/runs/:id/shards', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getRunShards(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/runs/:id/distribute', authenticate, async (req, res) => {
    try {
      const { total_vus, regions, requirements } = req.body;
      const plan = await shardDistributor.planDistribution(
        req.params.id, total_vus, regions || [], requirements || {},
      );
      const dispatch = await shardDistributor.executeDistribution(req.params.id, plan);
      res.status(201).json({ plan, dispatch });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Scenarios
  // =========================================================================

  app.get('/api/v2/scenarios', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getScenarios(req.query.project_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/scenarios', authenticate, async (req, res) => {
    try {
      const scenario = await dbv2.createScenario({ ...req.body, created_by: req.user.id });
      res.status(201).json(scenario);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/scenarios/:id', authenticate, async (req, res) => {
    try {
      const scenario = await dbv2.getScenarioById(req.params.id);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      res.json(scenario);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/v2/scenarios/:id', authenticate, async (req, res) => {
    try {
      const scenario = await dbv2.updateScenario(req.params.id, {
        ...req.body,
        created_by: req.user.id,
      });
      res.json(scenario);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/scenarios/:id/versions', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getScenarioVersions(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Workload Models
  // =========================================================================

  app.get('/api/v2/workload-models', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getWorkloadModels(req.query.test_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/workload-models', authenticate, async (req, res) => {
    try {
      const model = await dbv2.createWorkloadModel({ ...req.body, created_by: req.user.id });
      res.status(201).json(model);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/v2/workload-models/:id', authenticate, async (req, res) => {
    try {
      const model = await dbv2.updateWorkloadModel(req.params.id, req.body);
      res.json(model);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/workload-models/:id/generate', authenticate, async (req, res) => {
    try {
      const model = await dbv2.getWorkloadModels(null);
      const target = model.find(m => m.id === req.params.id);
      if (!target) return res.status(404).json({ error: 'Workload model not found' });
      const script = workloadModeler.buildCompositeScript(target);
      res.json({ script, model: workloadModeler.describeModel(target) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // SLOs
  // =========================================================================

  app.get('/api/v2/slos', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getSlos(req.query.project_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/slos', authenticate, async (req, res) => {
    try {
      const slo = await dbv2.createSlo(req.body);
      res.status(201).json(slo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/slos/:id/burn', authenticate, async (req, res) => {
    try {
      const days = parseInt(req.query.days || '30');
      res.json(await sloEngine.getBurnHistory(req.params.id, days));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/runs/:id/slo-evaluation', authenticate, async (req, res) => {
    try {
      const { project_id } = req.body;
      if (!project_id) return res.status(400).json({ error: 'project_id is required' });
      const result = await sloEngine.evaluateRunAgainstSLOs(req.params.id, project_id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Performance Budgets
  // =========================================================================

  app.get('/api/v2/performance-budgets', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getPerformanceBudgets(req.query.project_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/performance-budgets', authenticate, async (req, res) => {
    try {
      const budget = await dbv2.createPerformanceBudget(req.body);
      res.status(201).json(budget);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/runs/:id/budget-check', authenticate, async (req, res) => {
    try {
      const { project_id } = req.body;
      if (!project_id) return res.status(400).json({ error: 'project_id is required' });
      const result = await budgetChecker.checkBudgets(req.params.id, project_id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Traces & Logs
  // =========================================================================

  app.get('/api/v2/runs/:id/traces', authenticate, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '100');
      res.json(await dbv2.getTracesByRun(req.params.id, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/traces/:traceId', authenticate, async (req, res) => {
    try {
      const waterfall = await traceCorrelator.getTraceWaterfall(req.params.traceId);
      if (!waterfall) return res.status(404).json({ error: 'Trace not found' });
      res.json(waterfall);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/traces/:traceId/logs', authenticate, async (req, res) => {
    try {
      res.json(await logCorrelator.getLogsForTrace(req.params.traceId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/runs/:id/slow-traces', authenticate, async (req, res) => {
    try {
      const threshold = parseInt(req.query.threshold_ms || '1000');
      const limit = parseInt(req.query.limit || '50');
      res.json(await dbv2.getSlowTraces(req.params.id, threshold, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/runs/:id/trace-correlation', authenticate, async (req, res) => {
    try {
      res.json(await traceCorrelator.correlateRunWithTraces(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/runs/:id/logs', authenticate, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '200');
      res.json(await dbv2.getLogsByRun(req.params.id, req.query.severity, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/runs/:id/error-correlation', authenticate, async (req, res) => {
    try {
      res.json(await logCorrelator.correlateErrorsWithPerformance(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/otel/traces', async (req, res) => {
    try {
      const collector = getOTelCollector();
      const runId = req.headers['x-sarfat-run-id'] || req.body.run_id;
      if (!runId) return res.status(400).json({ error: 'run_id required (header or body)' });

      const { spans } = collector.parseOTLP(req.body);
      if (spans.length > 0) await collector.ingestSpanBatch(runId, spans);
      res.json({ accepted: spans.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/otel/logs', async (req, res) => {
    try {
      const collector = getOTelCollector();
      const runId = req.headers['x-sarfat-run-id'] || req.body.run_id;
      if (!runId) return res.status(400).json({ error: 'run_id required (header or body)' });

      const { logs } = collector.parseOTLP(req.body);
      if (logs.length > 0) await collector.ingestLogBatch(runId, logs);
      res.json({ accepted: logs.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/otel/status', authenticate, async (_req, res) => {
    try {
      const collector = getOTelCollector();
      res.json(collector.getStatus());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Chaos Engineering
  // =========================================================================

  app.get('/api/v2/chaos/catalog', authenticate, (_req, res) => {
    res.json(FAULT_CATALOG);
  });

  app.get('/api/v2/chaos/experiments', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getChaosExperiments(req.query.project_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/chaos/experiments', authenticate, async (req, res) => {
    try {
      const experiment = await chaosEngine.createExperiment({
        ...req.body,
        created_by: req.user.id,
      });
      res.status(201).json(experiment);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/v2/chaos/experiments/:id/execute', authenticate, async (req, res) => {
    try {
      const { run_id } = req.body;
      if (!run_id) return res.status(400).json({ error: 'run_id is required' });
      const result = await chaosEngine.executeTimeline(req.params.id, run_id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/chaos/experiments/:id/evaluate', authenticate, async (req, res) => {
    try {
      const { run_id, run_metrics } = req.body;
      if (!run_id) return res.status(400).json({ error: 'run_id is required' });
      const result = await chaosEngine.evaluateHypothesis(req.params.id, run_id, run_metrics);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/chaos/experiments/:id/results', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getChaosResults(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Traffic Replay
  // =========================================================================

  app.get('/api/v2/captures', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getCapturedTraffic(req.query.project_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/captures', authenticate, async (req, res) => {
    try {
      const { project_id, name, environment, options } = req.body;
      const capture = await captureAgent.startCapture(
        project_id, name, environment, { ...options, created_by: req.user.id },
      );
      res.status(201).json(capture);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/captures/:id/stop', authenticate, async (req, res) => {
    try {
      const captureId = await captureAgent.stopCapture();
      res.json({ capture_id: captureId, stopped: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/captures/:id/replay', authenticate, async (req, res) => {
    try {
      const { target_environment, mode, speed_multiplier } = req.body;
      if (!target_environment) {
        return res.status(400).json({ error: 'target_environment is required' });
      }
      const session = await replayEngine.startReplay(req.params.id, target_environment, {
        mode, speedMultiplier: speed_multiplier,
      });
      res.status(201).json(session);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/replays', authenticate, async (_req, res) => {
    try {
      res.json(replayEngine.getActiveReplays());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/replays/:id/complete', authenticate, async (req, res) => {
    try {
      const result = await replayEngine.completeReplay(req.params.id);
      if (!result) return res.status(404).json({ error: 'Replay session not found' });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/replays/:id', authenticate, async (req, res) => {
    try {
      const replays = replayEngine.getActiveReplays();
      const replay = replays.find(r => r.session_id === req.params.id);
      if (!replay) return res.status(404).json({ error: 'Replay session not found' });
      res.json(replay);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // PR Gates
  // =========================================================================

  app.post('/api/v2/webhooks/github', async (req, res) => {
    try {
      const event = req.headers['x-github-event'];
      const result = await prGateManager.handleWebhook('github', event, req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/webhooks/gitlab', async (req, res) => {
    try {
      const event = req.headers['x-gitlab-event']?.replace(' Hook', '').toLowerCase().replace(/ /g, '_');
      const result = await prGateManager.handleWebhook('gitlab', event, req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/pr-gates', authenticate, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '50');
      res.json(await dbv2.getPrGates(req.query.project_id, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/pr-gates', authenticate, async (req, res) => {
    try {
      const gate = await prGateManager.configurePRGate(req.body.project_id, req.body);
      res.status(201).json(gate);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/pr-gates/:id/complete', authenticate, async (req, res) => {
    try {
      const { run_id } = req.body;
      if (!run_id) return res.status(400).json({ error: 'run_id is required' });
      const result = await prGateManager.completePRGate(req.params.id, run_id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Cost Modeling
  // =========================================================================

  app.post('/api/v2/runs/:id/cost-estimate', authenticate, async (req, res) => {
    try {
      const { project_id, provider, region, infrastructure } = req.body;
      const estimate = await costModeler.estimateCosts(req.params.id, project_id, {
        provider, region, infrastructure,
      });
      res.status(201).json(estimate);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/runs/:id/cost-estimates', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getCostEstimates(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Evidence Store
  // =========================================================================

  app.get('/api/v2/runs/:id/evidence', authenticate, async (req, res) => {
    try {
      const store = getEvidenceStore();
      res.json(await store.getRunEvidence(req.params.id, req.query.type));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/evidence/:id', authenticate, async (req, res) => {
    try {
      const store = getEvidenceStore();
      const { evidence, data } = await store.retrieve(req.params.id);
      res.json({ evidence, data: JSON.parse(data) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/runs/:id/compliance-bundle', authenticate, async (req, res) => {
    try {
      const store = getEvidenceStore();
      const result = await store.buildComplianceBundle(req.params.id);
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/runs/:id/verify-integrity', authenticate, async (req, res) => {
    try {
      const store = getEvidenceStore();
      res.json(await store.verifyIntegrity(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/evidence/stats', authenticate, async (_req, res) => {
    try {
      const store = getEvidenceStore();
      res.json(await store.getStorageStats());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // APM Integrations
  // =========================================================================

  app.get('/api/v2/apm/integrations', authenticate, (_req, res) => {
    try {
      res.json(apmManager.getStatus());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/apm/integrations', authenticate, async (req, res) => {
    try {
      const { name, config } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const integration = apmManager.register(name, config || {});
      res.status(201).json({ name, type: integration.constructor.name, registered: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/v2/apm/supported', authenticate, (_req, res) => {
    res.json({ supported: SUPPORTED_APMS });
  });

  // =========================================================================
  // AI Pipeline v2
  // =========================================================================

  app.post('/api/v2/runs/:id/analyze-v2', authenticate, async (req, res) => {
    try {
      const result = await runAgentPipeline(req.params.id, req.body);
      res.json(result.summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/runs/:id/analyze-v2/diff', authenticate, async (req, res) => {
    try {
      const { previous_run_id, ...options } = req.body;
      if (!previous_run_id) return res.status(400).json({ error: 'previous_run_id is required' });
      const result = await runAgentPipeline(req.params.id, {
        ...options,
        previousRunId: previous_run_id,
      });
      res.json(result.summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/ai/agent/:name', authenticate, async (req, res) => {
    try {
      const result = await runSingleAgent(req.params.name, req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/ai/agents', authenticate, (_req, res) => {
    try {
      const agents = Object.keys(AGENTS).map(name => ({
        name,
        available: true,
      }));
      res.json(agents);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/ai/evals/:agentName', authenticate, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '50');
      res.json(await dbv2.getAiEvals(req.params.agentName, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Endpoints Catalog
  // =========================================================================

  app.get('/api/v2/endpoints-catalog', authenticate, async (req, res) => {
    try {
      res.json(await dbv2.getEndpointsCatalog(req.query.project_id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/endpoints-catalog', authenticate, async (req, res) => {
    try {
      const entry = await dbv2.upsertCatalogEndpoint(req.body);
      res.status(201).json(entry);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // SSO & Auth
  // =========================================================================

  app.post('/api/v2/auth/sso/oidc/callback', async (req, res) => {
    try {
      const { code, provider_id } = req.body;
      if (!code || !provider_id) {
        return res.status(400).json({ error: 'code and provider_id are required' });
      }
      const { user, tokens } = await handleOIDCCallback(code, provider_id);
      const { createSession } = await import('./db.js');
      const sessionToken = await createSession(user.id);
      res.json({ token: sessionToken, user, sso_tokens: tokens });
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  });

  app.post('/api/v2/auth/sso/saml/callback', async (req, res) => {
    try {
      const { SAMLResponse, provider_id } = req.body;
      if (!SAMLResponse || !provider_id) {
        return res.status(400).json({ error: 'SAMLResponse and provider_id are required' });
      }
      const { user } = await handleSAMLResponse(SAMLResponse, provider_id);
      const { createSession } = await import('./db.js');
      const sessionToken = await createSession(user.id);
      res.json({ token: sessionToken, user });
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  });

  app.get('/api/v2/audit-log', authenticate, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '100');
      const filters = {};
      if (req.query.user_id) filters.user_id = req.query.user_id;
      if (req.query.resource_type) filters.resource_type = req.query.resource_type;
      if (req.query.resource_id) filters.resource_id = req.query.resource_id;
      if (req.query.action) filters.action = req.query.action;
      res.json(await dbv2.getAuditLog(filters, limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Compliance
  // =========================================================================

  app.post('/api/v2/runs/:id/compliance-report', authenticate, async (req, res) => {
    try {
      const { framework } = req.body;
      if (!framework) return res.status(400).json({ error: 'framework is required' });
      const report = await generateComplianceReport(req.params.id, framework);
      res.status(201).json(report);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/v2/compliance/frameworks', authenticate, (_req, res) => {
    try {
      res.json(getSupportedFrameworks());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Platform Status
  // =========================================================================

  app.get('/api/v2/status', authenticate, async (_req, res) => {
    try {
      const [poolStatus, otelStatus, natsBus] = await Promise.all([
        workerPool.getPoolStatus().catch(() => ({ error: 'unavailable' })),
        Promise.resolve(getOTelCollector().getStatus()).catch(() => ({ error: 'unavailable' })),
        Promise.resolve(getMetricBus().getStatus()).catch(() => ({ error: 'unavailable' })),
      ]);

      let evidenceStatus;
      try {
        evidenceStatus = await getEvidenceStore().getStorageStats();
      } catch {
        evidenceStatus = { error: 'unavailable' };
      }

      res.json({
        platform: 'sarfat-load-testing',
        version: 'v2',
        timestamp: new Date().toISOString(),
        workers: poolStatus,
        nats: natsBus,
        otel: otelStatus,
        evidence: evidenceStatus,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
