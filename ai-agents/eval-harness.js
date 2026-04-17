/**
 * Sarfat Load Testing Platform v2 — AI Agent Evaluation Harness
 *
 * Scores agent outputs against expected outputs using precision, recall,
 * and quality metrics. Tracks eval results over time via the ai_evals table.
 */

import { validateAgentOutput, AGENT_SCHEMAS } from './schemas.js';
import { saveAiEval, getAiEvals } from '../db-v2.js';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function computePrecision(actual, expected) {
  if (!expected || !actual) return null;

  const expectedKeys = flattenKeys(expected);
  const actualKeys = flattenKeys(actual);

  if (actualKeys.length === 0) return 0;

  let correct = 0;
  for (const key of actualKeys) {
    if (expectedKeys.includes(key)) correct++;
  }
  return correct / actualKeys.length;
}

function computeRecall(actual, expected) {
  if (!expected || !actual) return null;

  const expectedKeys = flattenKeys(expected);
  const actualKeys = flattenKeys(actual);

  if (expectedKeys.length === 0) return 1;

  let found = 0;
  for (const key of expectedKeys) {
    if (actualKeys.includes(key)) found++;
  }
  return found / expectedKeys.length;
}

function flattenKeys(obj, prefix = '') {
  const keys = [];
  if (typeof obj !== 'object' || obj === null) return keys;

  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (key === '_meta') continue;
    keys.push(fullKey);
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      keys.push(...flattenKeys(val, fullKey));
    }
    if (Array.isArray(val) && val.length > 0) {
      keys.push(`${fullKey}[]`);
      if (typeof val[0] === 'object' && val[0] !== null) {
        keys.push(...flattenKeys(val[0], `${fullKey}[0]`));
      }
    }
  }
  return keys;
}

function scoreArraySimilarity(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) return null;
  if (expected.length === 0) return actual.length === 0 ? 1 : 0.5;

  const actualStrs = actual.map(item => JSON.stringify(item));
  const expectedStrs = expected.map(item => JSON.stringify(item));

  let matches = 0;
  for (const exp of expectedStrs) {
    if (actualStrs.includes(exp)) {
      matches++;
    } else {
      const partial = actualStrs.find(a => {
        try {
          const ae = JSON.parse(a);
          const ee = JSON.parse(exp);
          if (typeof ae === 'object' && typeof ee === 'object') {
            const commonKeys = Object.keys(ee).filter(k => k in ae);
            const matchingValues = commonKeys.filter(k => JSON.stringify(ae[k]) === JSON.stringify(ee[k]));
            return commonKeys.length > 0 && matchingValues.length / commonKeys.length > 0.5;
          }
        } catch { /* noop */ }
        return false;
      });
      if (partial) matches += 0.5;
    }
  }

  return matches / expected.length;
}

function computeQualityScore(agentName, output) {
  const validation = validateAgentOutput(agentName, output);
  if (!validation.valid) return 1;

  let score = 3;

  const schema = AGENT_SCHEMAS[agentName];
  if (!schema) return score;

  const requiredPresent = (schema.required || []).filter(f => output[f] != null).length;
  const requiredTotal = (schema.required || []).length;
  if (requiredTotal > 0 && requiredPresent === requiredTotal) score++;

  const optionalFields = Object.keys(schema.properties || {}).filter(k => !(schema.required || []).includes(k));
  const optionalPresent = optionalFields.filter(f => output[f] != null).length;
  if (optionalFields.length > 0 && optionalPresent / optionalFields.length > 0.5) score++;

  const hasDetailedContent = JSON.stringify(output).length > 500;
  if (hasDetailedContent) score = Math.min(score + 0.5, 5);

  const hasArrayContent = Object.values(output).some(v => Array.isArray(v) && v.length > 0);
  if (hasArrayContent) score = Math.min(score + 0.5, 5);

  return Math.round(score * 10) / 10;
}

// ---------------------------------------------------------------------------
// Core evaluation function
// ---------------------------------------------------------------------------

/**
 * Evaluate an agent's output against expected output.
 *
 * @param {string} agentName - Agent identifier
 * @param {object} output - Actual agent output
 * @param {object} expectedOutput - Expected/golden output
 * @param {object} [options] - Additional options
 * @param {string} [options.runId] - Associated run ID
 * @param {string} [options.evalVersion] - Eval version tag
 * @returns {object} Evaluation result with scores
 */
export async function evaluateAgent(agentName, output, expectedOutput, options = {}) {
  const validation = validateAgentOutput(agentName, output);

  const cleanOutput = { ...output };
  delete cleanOutput._meta;

  const cleanExpected = expectedOutput ? { ...expectedOutput } : null;
  if (cleanExpected) delete cleanExpected._meta;

  const precision = computePrecision(cleanOutput, cleanExpected);
  const recall = computeRecall(cleanOutput, cleanExpected);
  const quality = computeQualityScore(agentName, cleanOutput);

  const f1 = precision != null && recall != null && (precision + recall) > 0
    ? (2 * precision * recall) / (precision + recall)
    : null;

  const fieldScores = {};
  if (cleanExpected) {
    const schema = AGENT_SCHEMAS[agentName];
    for (const field of schema?.required || []) {
      if (cleanExpected[field] !== undefined) {
        const actualVal = cleanOutput[field];
        const expectedVal = cleanExpected[field];

        if (Array.isArray(expectedVal)) {
          fieldScores[field] = scoreArraySimilarity(actualVal, expectedVal);
        } else if (typeof expectedVal === 'object' && expectedVal !== null) {
          fieldScores[field] = computePrecision(actualVal, expectedVal);
        } else if (expectedVal === actualVal) {
          fieldScores[field] = 1.0;
        } else if (typeof expectedVal === 'number' && typeof actualVal === 'number') {
          const pctDiff = Math.abs(expectedVal - actualVal) / Math.max(Math.abs(expectedVal), 1);
          fieldScores[field] = Math.max(0, 1 - pctDiff);
        } else if (typeof expectedVal === 'string' && typeof actualVal === 'string') {
          fieldScores[field] = expectedVal.toLowerCase() === actualVal.toLowerCase() ? 1.0 : 0.0;
        } else {
          fieldScores[field] = actualVal != null ? 0.5 : 0.0;
        }
      }
    }
  }

  const pass = validation.valid && quality >= 3 && (f1 === null || f1 >= 0.5);

  const scores = {
    schema_valid: validation.valid,
    validation_errors: validation.errors,
    precision,
    recall,
    f1,
    quality,
    field_scores: fieldScores,
    pass,
  };

  const evalRecord = {
    agent_name: agentName,
    run_id: options.runId || null,
    input_hash: options.inputHash || null,
    output: cleanOutput,
    expected_output: cleanExpected,
    scores,
    pass,
    eval_version: options.evalVersion || '1.0',
  };

  try {
    await saveAiEval(evalRecord);
  } catch (err) {
    console.error(`[eval] Failed to persist eval for ${agentName}:`, err.message);
  }

  return {
    agent_name: agentName,
    scores,
    pass,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Eval suite runner
// ---------------------------------------------------------------------------

/**
 * Run a full eval suite for an agent using stored golden outputs.
 *
 * @param {string} agentName - Agent identifier
 * @param {object} [options]
 * @param {Array} [options.testCases] - Array of { input, expectedOutput }
 * @param {string} [options.evalVersion] - Eval version tag
 * @returns {object} Suite results with aggregate scores
 */
export async function runEvalSuite(agentName, options = {}) {
  const testCases = options.testCases || [];

  if (testCases.length === 0) {
    console.log(`[eval] No test cases provided for ${agentName} — running schema-only validation`);
    const historicalEvals = await getAiEvals(agentName, 20).catch(() => []);
    return {
      agent_name: agentName,
      test_cases_run: 0,
      historical_evals: historicalEvals.length,
      aggregate: null,
      results: [],
      historical_trend: computeTrend(historicalEvals),
    };
  }

  console.log(`[eval] Running ${testCases.length} test cases for ${agentName}`);

  const agent = await import(`./${agentName}.js`);
  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const { input, expectedOutput } = testCases[i];
    console.log(`[eval] ${agentName} test case ${i + 1}/${testCases.length}`);

    try {
      const output = await agent.run(input);
      const evalResult = await evaluateAgent(agentName, output, expectedOutput, {
        inputHash: createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16),
        evalVersion: options.evalVersion || '1.0',
      });
      results.push({ index: i, ...evalResult });
    } catch (err) {
      console.error(`[eval] ${agentName} test case ${i + 1} failed:`, err.message);
      results.push({
        index: i,
        agent_name: agentName,
        scores: { schema_valid: false, pass: false, error: err.message },
        pass: false,
      });
    }
  }

  const passing = results.filter(r => r.pass).length;
  const avgQuality = results
    .map(r => r.scores?.quality)
    .filter(q => q != null)
    .reduce((sum, q, _, arr) => sum + q / arr.length, 0);
  const avgF1 = results
    .map(r => r.scores?.f1)
    .filter(f => f != null)
    .reduce((sum, f, _, arr) => sum + f / arr.length, 0);

  const historicalEvals = await getAiEvals(agentName, 50).catch(() => []);

  return {
    agent_name: agentName,
    test_cases_run: testCases.length,
    passing,
    failing: testCases.length - passing,
    pass_rate: testCases.length > 0 ? passing / testCases.length : null,
    aggregate: {
      avg_quality: Math.round(avgQuality * 100) / 100,
      avg_f1: Math.round(avgF1 * 1000) / 1000,
    },
    results,
    historical_trend: computeTrend(historicalEvals),
  };
}

// ---------------------------------------------------------------------------
// Trend analysis from historical evals
// ---------------------------------------------------------------------------

function computeTrend(evals) {
  if (!evals || evals.length < 2) return { direction: 'insufficient_data', data_points: evals?.length || 0 };

  const sorted = [...evals].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const recentHalf = sorted.slice(Math.floor(sorted.length / 2));
  const olderHalf = sorted.slice(0, Math.floor(sorted.length / 2));

  const recentPassRate = recentHalf.filter(e => e.pass).length / recentHalf.length;
  const olderPassRate = olderHalf.filter(e => e.pass).length / olderHalf.length;

  const recentAvgQuality = recentHalf
    .map(e => e.scores?.quality)
    .filter(q => q != null)
    .reduce((sum, q, _, arr) => sum + q / arr.length, 0);
  const olderAvgQuality = olderHalf
    .map(e => e.scores?.quality)
    .filter(q => q != null)
    .reduce((sum, q, _, arr) => sum + q / arr.length, 0);

  let direction = 'stable';
  if (recentPassRate > olderPassRate + 0.1 || recentAvgQuality > olderAvgQuality + 0.3) {
    direction = 'improving';
  } else if (recentPassRate < olderPassRate - 0.1 || recentAvgQuality < olderAvgQuality - 0.3) {
    direction = 'degrading';
  }

  return {
    direction,
    data_points: evals.length,
    recent_pass_rate: Math.round(recentPassRate * 100) / 100,
    older_pass_rate: Math.round(olderPassRate * 100) / 100,
    recent_avg_quality: Math.round(recentAvgQuality * 100) / 100,
    older_avg_quality: Math.round(olderAvgQuality * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Bulk eval across all agents
// ---------------------------------------------------------------------------

/**
 * Run evals for all agents with provided test cases.
 *
 * @param {object} testSuites - Map of agentName → [{ input, expectedOutput }]
 * @param {object} [options]
 * @returns {object} Results per agent
 */
export async function runAllEvals(testSuites = {}, options = {}) {
  const allResults = {};

  for (const agentName of Object.keys(AGENT_SCHEMAS)) {
    const testCases = testSuites[agentName] || [];
    allResults[agentName] = await runEvalSuite(agentName, { testCases, ...options });
  }

  const totalCases = Object.values(allResults).reduce((s, r) => s + r.test_cases_run, 0);
  const totalPassing = Object.values(allResults).reduce((s, r) => s + (r.passing || 0), 0);

  return {
    total_agents: Object.keys(allResults).length,
    total_test_cases: totalCases,
    total_passing: totalPassing,
    total_failing: totalCases - totalPassing,
    overall_pass_rate: totalCases > 0 ? Math.round((totalPassing / totalCases) * 100) / 100 : null,
    per_agent: allResults,
  };
}
