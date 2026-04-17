import * as dbv2 from './db-v2.js';

const BURN_RATE_ALERTS = [
  { short_window: '5m', long_window: '1h', burn_rate_threshold: 14.4, budget_consumed: 0.02, severity: 'page' },
  { short_window: '30m', long_window: '6h', burn_rate_threshold: 6.0, budget_consumed: 0.05, severity: 'page' },
  { short_window: '2h', long_window: '24h', burn_rate_threshold: 3.0, budget_consumed: 0.10, severity: 'ticket' },
  { short_window: '6h', long_window: '72h', burn_rate_threshold: 1.0, budget_consumed: 0.10, severity: 'info' },
];

export class SLOEngine {
  async evaluateRunAgainstSLOs(runId, projectId) {
    const slos = await dbv2.getSlos(projectId);
    if (slos.length === 0) return { evaluated: false, message: 'No SLOs defined' };

    const pool = (await import('./db.js')).getPool();
    const endpointsResult = await pool.query('SELECT * FROM endpoint_metrics WHERE run_id = $1', [runId]);
    const endpoints = endpointsResult.rows;
    const runResult = await pool.query('SELECT * FROM test_runs WHERE id = $1', [runId]);
    const run = runResult.rows[0];

    const results = [];

    for (const slo of slos) {
      const result = this.evaluateSingleSLO(slo, run, endpoints);
      results.push(result);

      await dbv2.insertSloBurn({
        slo_id: slo.id,
        run_id: runId,
        window_type: 'instant',
        burn_rate: result.burn_rate,
        budget_remaining: result.budget_remaining,
        good_events: result.good_events,
        total_events: result.total_events,
        is_burning: result.is_burning,
      });
    }

    const overallCompliant = results.every(r => r.budget_remaining > 0);
    const burning = results.filter(r => r.is_burning);

    return {
      evaluated: true,
      total_slos: slos.length,
      compliant: results.filter(r => r.budget_remaining > 0).length,
      at_risk: results.filter(r => r.budget_remaining > 0 && r.budget_remaining < 0.2).length,
      breached: results.filter(r => r.budget_remaining <= 0).length,
      overall_status: overallCompliant ? (burning.length > 0 ? 'at-risk' : 'compliant') : 'breached',
      results,
      alerts: this.generateAlerts(results),
    };
  }

  evaluateSingleSLO(slo, run, endpoints) {
    const summary = run?.k6_summary || {};

    let goodEvents = 0;
    let totalEvents = 0;

    switch (slo.metric) {
      case 'availability': {
        const totalReqs = summary.http_reqs || 0;
        const failedReqs = Math.round(totalReqs * (summary.http_req_failed_rate || 0));
        totalEvents = totalReqs;
        goodEvents = totalReqs - failedReqs;
        break;
      }
      case 'latency': {
        const endpoint = slo.endpoint
          ? endpoints.find(e => e.endpoint === slo.endpoint)
          : null;

        if (endpoint) {
          totalEvents = endpoint.request_count || 0;
          const p = slo.percentile || 95;
          const pKey = `p${p}_duration`;
          const actualLatency = endpoint[pKey] || endpoint.p95_duration || 0;
          goodEvents = actualLatency <= (slo.threshold_ms || 1000)
            ? totalEvents
            : Math.round(totalEvents * (1 - (actualLatency - (slo.threshold_ms || 1000)) / actualLatency));
        } else {
          totalEvents = summary.http_reqs || 0;
          const p95 = summary.http_req_duration_p95 || 0;
          goodEvents = p95 <= (slo.threshold_ms || 1000)
            ? totalEvents
            : Math.round(totalEvents * (slo.target / 100));
        }
        break;
      }
      case 'throughput': {
        totalEvents = 1;
        const rps = summary.http_reqs_per_second || summary.http_reqs || 0;
        goodEvents = rps >= (slo.threshold_ms || 0) ? 1 : 0;
        break;
      }
      case 'error_rate': {
        totalEvents = summary.http_reqs || 0;
        const errorRate = summary.http_req_failed_rate || 0;
        goodEvents = Math.round(totalEvents * (1 - errorRate));
        break;
      }
      default:
        totalEvents = 1;
        goodEvents = 1;
    }

    const sli = totalEvents > 0 ? (goodEvents / totalEvents) * 100 : 100;
    const target = slo.target;
    const errorBudgetTotal = 100 - target;
    const errorBudgetUsed = Math.max(0, 100 - sli);
    const budgetRemaining = errorBudgetTotal > 0 ? Math.max(0, 1 - (errorBudgetUsed / errorBudgetTotal)) : 1;
    const burnRate = errorBudgetTotal > 0 ? errorBudgetUsed / errorBudgetTotal : 0;

    return {
      slo_id: slo.id,
      slo_name: slo.name,
      service: slo.service,
      endpoint: slo.endpoint,
      metric: slo.metric,
      target,
      actual_sli: parseFloat(sli.toFixed(4)),
      good_events: goodEvents,
      total_events: totalEvents,
      error_budget_total: errorBudgetTotal,
      error_budget_used: errorBudgetUsed,
      budget_remaining: parseFloat(budgetRemaining.toFixed(4)),
      burn_rate: parseFloat(burnRate.toFixed(4)),
      is_burning: burnRate > 1,
      status: budgetRemaining <= 0 ? 'breached' : budgetRemaining < 0.2 ? 'at-risk' : 'healthy',
    };
  }

  generateAlerts(results) {
    const alerts = [];
    for (const result of results) {
      for (const alertDef of BURN_RATE_ALERTS) {
        if (result.burn_rate >= alertDef.burn_rate_threshold) {
          alerts.push({
            slo_name: result.slo_name,
            severity: alertDef.severity,
            burn_rate: result.burn_rate,
            threshold: alertDef.burn_rate_threshold,
            window: alertDef.long_window,
            budget_consumed: `${(result.burn_rate * alertDef.budget_consumed * 100).toFixed(1)}%`,
            message: `SLO "${result.slo_name}" burning at ${result.burn_rate.toFixed(1)}x (${alertDef.severity})`,
          });
          break;
        }
      }
    }
    return alerts;
  }

  async getBurnHistory(sloId, windowDays = 30) {
    const history = await dbv2.getSloBurnHistory(sloId, windowDays * 24);
    if (history.length === 0) return { slo_id: sloId, history: [], trend: 'unknown' };

    const recentBudget = history[0]?.budget_remaining || 1;
    const oldestBudget = history[history.length - 1]?.budget_remaining || 1;
    const trend = recentBudget >= oldestBudget ? 'improving' : recentBudget > 0.5 ? 'stable' : 'degrading';

    const projectedExhaustion = this.projectExhaustion(history);

    return {
      slo_id: sloId,
      current_budget: recentBudget,
      trend,
      projected_exhaustion: projectedExhaustion,
      data_points: history.length,
      history: history.map(h => ({
        time: h.time,
        burn_rate: h.burn_rate,
        budget_remaining: h.budget_remaining,
        is_burning: h.is_burning,
      })),
    };
  }

  projectExhaustion(history) {
    if (history.length < 2) return null;
    const recent = history.slice(0, Math.min(10, history.length));
    const budgets = recent.map(h => h.budget_remaining);
    const avgBurnPerPoint = budgets.length > 1
      ? (budgets[budgets.length - 1] - budgets[0]) / (budgets.length - 1)
      : 0;

    if (avgBurnPerPoint >= 0) return null;

    const currentBudget = budgets[0];
    const pointsToExhaustion = currentBudget / Math.abs(avgBurnPerPoint);
    const hoursToExhaustion = pointsToExhaustion;

    if (hoursToExhaustion > 24 * 365) return null;

    const exhaustionDate = new Date(Date.now() + hoursToExhaustion * 3600000);
    return {
      estimated_date: exhaustionDate.toISOString(),
      hours_remaining: Math.round(hoursToExhaustion),
      days_remaining: Math.round(hoursToExhaustion / 24),
    };
  }
}

export class PerformanceBudgetChecker {
  async checkBudgets(runId, projectId) {
    return dbv2.evaluatePerformanceBudgets(runId, projectId);
  }

  formatViolationsForPR(violations) {
    if (violations.length === 0) {
      return '✅ **Performance Check Passed** — All endpoints within budget.\n';
    }

    let comment = '❌ **Performance Budget Violations Detected**\n\n';
    comment += '| Endpoint | Metric | Budget | Actual | Status |\n';
    comment += '|----------|--------|--------|--------|--------|\n';

    for (const v of violations) {
      for (const check of v.checks) {
        if (check.exceeded) {
          comment += `| \`${v.budget.method} ${v.budget.endpoint}\` | ${check.metric} | ${this.formatValue(check.metric, check.budget)} | ${this.formatValue(check.metric, check.actual)} | ${v.enforcement === 'block' ? '🚫 BLOCK' : '⚠️ WARN'} |\n`;
        }
      }
    }

    const blocking = violations.filter(v => v.enforcement === 'block');
    if (blocking.length > 0) {
      comment += `\n**${blocking.length} blocking violation(s)** — merge is blocked until resolved.\n`;
    }

    return comment;
  }

  formatValue(metric, value) {
    if (metric === 'error_rate') return `${(value * 100).toFixed(2)}%`;
    if (metric.startsWith('p')) return `${value.toFixed(0)}ms`;
    return String(value);
  }

  shouldBlockMerge(violations) {
    return violations.some(v => v.enforcement === 'block');
  }
}

export const sloEngine = new SLOEngine();
export const budgetChecker = new PerformanceBudgetChecker();
