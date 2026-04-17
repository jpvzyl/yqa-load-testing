/**
 * Sarfat Load Testing Platform v2 — AI Agent Pipeline Orchestrator
 *
 * Runs the 10-agent pipeline in dependency order, validates outputs
 * against schemas, retries on failure, and persists results.
 *
 * Pipeline:
 *   Phase 1 (pre-test):  workload-analyst → test-designer → script-generator
 *   Phase 2 (analysis):  metric-analyst ─┬→ trace-correlator-agent
 *                                         ├→ infra-correlator-agent
 *                                         ├→ regression-judge
 *                                         └→ slo-judge
 *   Phase 3 (synthesis): executive-synthesiser → remediation-coach
 */

import { validateAgentOutput, schemaToPromptHint, AGENT_SCHEMAS } from './schemas.js';
import * as db from '../db.js';

import * as workloadAnalyst from './workload-analyst.js';
import * as testDesigner from './test-designer.js';
import * as scriptGenerator from './script-generator.js';
import * as metricAnalyst from './metric-analyst.js';
import * as traceCorrelator from './trace-correlator-agent.js';
import * as infraCorrelator from './infra-correlator-agent.js';
import * as regressionJudge from './regression-judge.js';
import * as sloJudge from './slo-judge.js';
import * as executiveSynthesiser from './executive-synthesiser.js';
import * as remediationCoach from './remediation-coach.js';

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------

const AGENTS = {
  'workload-analyst': workloadAnalyst,
  'test-designer': testDesigner,
  'script-generator': scriptGenerator,
  'metric-analyst': metricAnalyst,
  'trace-correlator-agent': traceCorrelator,
  'infra-correlator-agent': infraCorrelator,
  'regression-judge': regressionJudge,
  'slo-judge': sloJudge,
  'executive-synthesiser': executiveSynthesiser,
  'remediation-coach': remediationCoach,
};

const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Run a single agent with retry + fallback
// ---------------------------------------------------------------------------

export async function runSingleAgent(agentName, input) {
  const agent = AGENTS[agentName];
  if (!agent) throw new Error(`Unknown agent: ${agentName}`);

  console.log(`[pipeline] Running ${agentName}...`);
  const startMs = Date.now();

  let output = null;
  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      output = await agent.run(input);

      const validation = validateAgentOutput(agentName, output);
      if (validation.valid) {
        const elapsed = Date.now() - startMs;
        console.log(`[pipeline] ${agentName} completed in ${elapsed}ms (attempt ${attempt})`);
        return { agentName, output, attempt, elapsed, valid: true };
      }

      console.log(`[pipeline] ${agentName} output invalid (attempt ${attempt}): ${validation.errors.slice(0, 3).join('; ')}`);
      lastError = validation.errors.join('; ');
    } catch (err) {
      console.error(`[pipeline] ${agentName} error (attempt ${attempt}):`, err.message);
      lastError = err.message;
    }
  }

  console.log(`[pipeline] ${agentName} failed after ${MAX_RETRIES} attempts — using fallback`);
  output = agent.buildFallback(input);
  output._meta = { ...(output._meta || {}), fallback_reason: lastError };

  const elapsed = Date.now() - startMs;
  return { agentName, output, attempt: MAX_RETRIES, elapsed, valid: false, fallback: true };
}

// ---------------------------------------------------------------------------
// Save agent output to DB
// ---------------------------------------------------------------------------

async function persistAgentOutput(runId, agentName, result) {
  try {
    const passMap = {
      'workload-analyst': 0,
      'test-designer': 0,
      'script-generator': 0,
      'metric-analyst': 1,
      'trace-correlator-agent': 1,
      'infra-correlator-agent': 2,
      'regression-judge': 3,
      'slo-judge': 3,
      'executive-synthesiser': 4,
      'remediation-coach': 5,
    };

    await db.saveAnalysis({
      run_id: runId,
      analysis_type: agentName,
      pass_number: passMap[agentName] ?? 0,
      model_used: result.output?._meta?.model || 'unknown',
      input_tokens: result.output?._meta?.tokens?.input_tokens,
      output_tokens: result.output?._meta?.tokens?.output_tokens,
      content: result.output,
    });
  } catch (err) {
    console.error(`[pipeline] Failed to persist ${agentName} output:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Full 10-agent pipeline
// ---------------------------------------------------------------------------

export async function runAgentPipeline(runId, options = {}) {
  const pipelineStart = Date.now();
  const results = {};
  const isDiffMode = !!options.previousRunId;

  console.log(`[pipeline] Starting 10-agent pipeline for run ${runId}${isDiffMode ? ' (DIFF MODE)' : ''}`);

  // Gather run data from DB
  const run = await db.getRunById(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const [metricsSummary, endpointMetrics, infraMetrics, slaResults] = await Promise.all([
    db.getRunMetricsSummary(runId),
    db.getEndpointMetrics(runId),
    db.getInfraMetrics(runId),
    db.getSlaResults(runId),
  ]);

  const baseline = run.test_id ? await db.getActiveBaseline(run.test_id, run.environment) : null;
  const historicalRuns = run.test_id ? await db.getTestRuns(run.test_id, 10) : [];

  let previousAnalyses = null;
  if (isDiffMode) {
    try {
      const prevAnalysisRows = await db.getAnalyses(options.previousRunId);
      previousAnalyses = {};
      for (const row of prevAnalysisRows) {
        previousAnalyses[row.analysis_type] = row.content;
      }
    } catch (err) {
      console.log(`[pipeline] Could not load previous analyses: ${err.message}`);
    }
  }

  // Optional: Load trace / log data for trace correlator
  let spans = [];
  let logs = [];
  try {
    const dbv2 = await import('../db-v2.js');
    if (dbv2.getTracesByRun) spans = await dbv2.getTracesByRun(runId, 500);
    if (dbv2.getLogsByRun) logs = await dbv2.getLogsByRun(runId, null, 500);
  } catch {
    // trace/log tables may not exist yet
  }

  // Optional: Load SLO definitions
  let slos = [];
  let sloBurnHistory = [];
  try {
    const dbv2 = await import('../db-v2.js');
    if (run.project_id && dbv2.getSlos) slos = await dbv2.getSlos(run.project_id);
    if (slos.length > 0 && dbv2.getSloBurnHistory) {
      const burns = await Promise.all(slos.map(s => dbv2.getSloBurnHistory(s.id, 50)));
      sloBurnHistory = burns.flat();
    }
  } catch {
    // SLO tables may not exist yet
  }

  // ── Phase 1: Pre-test agents (skip if no recon data) ──

  if (options.reconData) {
    results['workload-analyst'] = await runSingleAgent('workload-analyst', options.reconData);
    await persistAgentOutput(runId, 'workload-analyst', results['workload-analyst']);

    results['test-designer'] = await runSingleAgent('test-designer', {
      workload_model: results['workload-analyst'].output,
      goals: options.goals,
      slos: slos.length > 0 ? slos : undefined,
      target_vus: options.targetVus,
      target_duration_s: options.targetDuration,
    });
    await persistAgentOutput(runId, 'test-designer', results['test-designer']);

    results['script-generator'] = await runSingleAgent('script-generator', {
      test_plan: results['test-designer'].output?.test_plan,
      protocol: run.protocol || 'http',
      target_url: options.reconData?.target_url,
      workload_model: results['workload-analyst'].output,
    });
    await persistAgentOutput(runId, 'script-generator', results['script-generator']);
  }

  // ── Phase 2: Analysis agents (run in parallel where possible) ──

  results['metric-analyst'] = await runSingleAgent('metric-analyst', {
    test_type: run.test_type,
    protocol: run.protocol,
    duration_ms: run.duration_ms,
    k6_summary: run.k6_summary,
    metrics_summary: metricsSummary,
    endpoint_metrics: endpointMetrics,
    threshold_results: run.threshold_results,
  });
  await persistAgentOutput(runId, 'metric-analyst', results['metric-analyst']);

  const metricFindings = results['metric-analyst'].output;

  const [traceResult, infraResult, regressionResult, sloResult] = await Promise.all([
    // Trace correlator
    runSingleAgent('trace-correlator-agent', {
      findings: metricFindings,
      spans,
      logs,
      slow_traces: spans.filter(s => s.duration_ms > 1000).slice(0, 50),
    }),
    // Infra correlator
    runSingleAgent('infra-correlator-agent', {
      findings: metricFindings,
      infra_metrics: infraMetrics,
      k6_summary: run.k6_summary,
    }),
    // Regression judge
    runSingleAgent('regression-judge', {
      current_run: { k6_summary: run.k6_summary, performance_score: run.performance_score },
      baseline: baseline?.metrics_summary ? { metrics_summary: baseline.metrics_summary } : null,
      historical_runs: historicalRuns.filter(r => r.k6_summary).map(r => ({
        id: r.id,
        k6_summary: r.k6_summary,
        performance_score: r.performance_score,
        performance_grade: r.performance_grade,
        created_at: r.created_at,
      })),
      current_findings: metricFindings,
      previous_findings: isDiffMode ? previousAnalyses?.['metric-analyst'] : undefined,
    }),
    // SLO judge
    runSingleAgent('slo-judge', {
      slos,
      run_metrics: metricsSummary,
      k6_summary: run.k6_summary,
      endpoint_metrics: endpointMetrics,
      slo_burn_history: sloBurnHistory,
      sla_results: slaResults,
    }),
  ]);

  results['trace-correlator-agent'] = traceResult;
  results['infra-correlator-agent'] = infraResult;
  results['regression-judge'] = regressionResult;
  results['slo-judge'] = sloResult;

  await Promise.all([
    persistAgentOutput(runId, 'trace-correlator-agent', traceResult),
    persistAgentOutput(runId, 'infra-correlator-agent', infraResult),
    persistAgentOutput(runId, 'regression-judge', regressionResult),
    persistAgentOutput(runId, 'slo-judge', sloResult),
  ]);

  // ── Phase 3: Synthesis agents ──

  results['executive-synthesiser'] = await runSingleAgent('executive-synthesiser', {
    metric_analyst: metricFindings,
    trace_correlator: traceResult.output,
    infra_correlator: infraResult.output,
    regression_judge: regressionResult.output,
    slo_judge: sloResult.output,
    workload_analyst: results['workload-analyst']?.output,
    test_designer: results['test-designer']?.output,
    run,
    baseline,
    historical_runs: historicalRuns.slice(0, 5).map(r => ({
      id: r.id,
      score: r.performance_score,
      grade: r.performance_grade,
      date: r.created_at,
    })),
  });
  await persistAgentOutput(runId, 'executive-synthesiser', results['executive-synthesiser']);

  results['remediation-coach'] = await runSingleAgent('remediation-coach', {
    findings: metricFindings,
    trace_attributions: traceResult.output?.attributions,
    infra_analysis: infraResult.output,
    regression_calls: regressionResult.output?.regression_calls,
    slo_results: sloResult.output?.slo_results,
    stack: options.stack || { language: 'Node.js', framework: 'Express', database: 'PostgreSQL' },
  });
  await persistAgentOutput(runId, 'remediation-coach', results['remediation-coach']);

  // ── Pipeline summary ──

  const totalElapsed = Date.now() - pipelineStart;
  const agentsRun = Object.keys(results).length;
  const agentsFailed = Object.values(results).filter(r => r.fallback).length;
  const totalTokens = Object.values(results).reduce((sum, r) => {
    const meta = r.output?._meta?.tokens;
    return sum + (meta?.input_tokens || 0) + (meta?.output_tokens || 0);
  }, 0);

  const summary = {
    run_id: runId,
    agents_run: agentsRun,
    agents_succeeded: agentsRun - agentsFailed,
    agents_fallback: agentsFailed,
    total_elapsed_ms: totalElapsed,
    total_tokens: totalTokens,
    diff_mode: isDiffMode,
    agent_results: Object.fromEntries(
      Object.entries(results).map(([name, r]) => [name, {
        valid: r.valid,
        attempt: r.attempt,
        elapsed: r.elapsed,
        fallback: r.fallback || false,
      }])
    ),
  };

  console.log(`[pipeline] Pipeline complete: ${agentsRun} agents, ${agentsFailed} fallbacks, ${totalElapsed}ms, ${totalTokens} tokens`);

  return { results, summary };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { AGENTS, AGENT_SCHEMAS, validateAgentOutput };
