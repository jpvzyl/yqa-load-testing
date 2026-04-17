import * as dbv2 from './db-v2.js';
import { budgetChecker } from './slo-engine.js';

export class PRGateManager {
  constructor() {
    this.webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || '';
  }

  async handleWebhook(provider, event, payload) {
    switch (provider) {
      case 'github': return this.handleGitHubWebhook(event, payload);
      case 'gitlab': return this.handleGitLabWebhook(event, payload);
      default: throw new Error(`Unknown provider: ${provider}`);
    }
  }

  async handleGitHubWebhook(event, payload) {
    if (event === 'pull_request' && ['opened', 'synchronize', 'reopened'].includes(payload.action)) {
      return this.triggerPRTest({
        provider: 'github',
        repo_owner: payload.repository.owner.login,
        repo_name: payload.repository.name,
        pr_number: payload.pull_request.number,
        commit_sha: payload.pull_request.head.sha,
        branch: payload.pull_request.head.ref,
        changed_files: payload.pull_request.changed_files,
      });
    }
    return { action: 'ignored', reason: `Event ${event}/${payload.action} not handled` };
  }

  async handleGitLabWebhook(event, payload) {
    if (event === 'merge_request' && ['open', 'update'].includes(payload.object_attributes?.action)) {
      return this.triggerPRTest({
        provider: 'gitlab',
        repo_owner: payload.project?.namespace,
        repo_name: payload.project?.name,
        pr_number: payload.object_attributes.iid,
        commit_sha: payload.object_attributes.last_commit?.id,
        branch: payload.object_attributes.source_branch,
      });
    }
    return { action: 'ignored' };
  }

  async triggerPRTest(prInfo) {
    const pool = (await import('./db.js')).getPool();

    const projectResult = await pool.query(
      `SELECT p.* FROM projects p
       JOIN pr_gates pg ON pg.project_id = p.id
       WHERE pg.repo_owner = $1 AND pg.repo_name = $2
       LIMIT 1`,
      [prInfo.repo_owner, prInfo.repo_name]
    );

    let projectId = projectResult.rows[0]?.id;
    if (!projectId) {
      const configResult = await pool.query(
        `SELECT * FROM pr_gates WHERE repo_owner = $1 AND repo_name = $2 AND pr_number IS NULL LIMIT 1`,
        [prInfo.repo_owner, prInfo.repo_name]
      );
      projectId = configResult.rows[0]?.project_id;
    }

    if (!projectId) {
      return { action: 'skipped', reason: 'No project configured for this repository' };
    }

    const gate = await dbv2.createPrGate({
      project_id: projectId,
      provider: prInfo.provider,
      repo_owner: prInfo.repo_owner,
      repo_name: prInfo.repo_name,
      pr_number: prInfo.pr_number,
      commit_sha: prInfo.commit_sha,
      branch: prInfo.branch,
    });

    if (prInfo.provider === 'github') {
      await this.createGitHubCheckRun(prInfo, gate.id);
    }

    return { action: 'triggered', gate_id: gate.id, project_id: projectId };
  }

  async completePRGate(gateId, runId) {
    const pool = (await import('./db.js')).getPool();
    const gateResult = await pool.query('SELECT * FROM pr_gates WHERE id = $1', [gateId]);
    const gate = gateResult.rows[0];
    if (!gate) throw new Error('Gate not found');

    const runResult = await pool.query('SELECT * FROM test_runs WHERE id = $1', [runId]);
    const run = runResult.rows[0];
    if (!run) throw new Error('Run not found');

    const budgetResult = await budgetChecker.checkBudgets(runId, gate.project_id);
    const shouldBlock = budgetChecker.shouldBlockMerge(budgetResult.violations);

    const baselineResult = await pool.query(
      `SELECT tr.* FROM test_runs tr
       JOIN baselines b ON b.run_id = tr.id
       WHERE b.test_id = $1 AND b.is_active = TRUE LIMIT 1`,
      [run.test_id]
    );
    const baseline = baselineResult.rows[0];
    const performanceDiff = baseline ? this.computeDiff(run, baseline) : null;

    const gateResult2 = shouldBlock ? 'failure' : 'success';

    await dbv2.updatePrGate(gateId, {
      run_id: runId,
      status: 'complete',
      gate_result: gateResult2,
      budget_violations: budgetResult.violations,
      performance_diff: {
        ...performanceDiff,
        score: run.performance_score,
        grade: run.performance_grade,
        baseline_score: baseline?.performance_score,
      },
    });

    if (gate.provider === 'github') {
      const comment = this.buildPRComment(run, budgetResult, performanceDiff);
      await this.postGitHubComment(gate, comment);
      await this.updateGitHubCheckRun(gate, gateResult2, run);
    }

    return { gate_result: gateResult2, violations: budgetResult.violations, diff: performanceDiff };
  }

  computeDiff(currentRun, baselineRun) {
    const current = currentRun.k6_summary || {};
    const baseline = baselineRun.k6_summary || {};

    const metrics = ['http_req_duration_avg', 'http_req_duration_p95', 'http_req_duration_p99',
      'http_req_failed_rate', 'http_reqs_per_second'];
    const diff = {};

    for (const metric of metrics) {
      const currVal = current[metric];
      const baseVal = baseline[metric];
      if (currVal !== undefined && baseVal !== undefined && baseVal !== 0) {
        const change = ((currVal - baseVal) / baseVal) * 100;
        diff[metric] = {
          current: currVal,
          baseline: baseVal,
          change_percent: parseFloat(change.toFixed(2)),
          direction: change > 5 ? 'regression' : change < -5 ? 'improvement' : 'stable',
        };
      }
    }

    return diff;
  }

  buildPRComment(run, budgetResult, diff) {
    const summary = run.k6_summary || {};
    const grade = run.performance_grade || 'N/A';
    const score = run.performance_score || 0;

    let comment = budgetResult.passed
      ? `## ✅ Performance Check Passed (Sarfat)\n\n`
      : `## ❌ Performance Check Failed (Sarfat)\n\n`;

    comment += `**Score:** ${score}/100 (${grade})  \n`;
    comment += `**P95:** ${(summary.http_req_duration_p95 || 0).toFixed(0)}ms  \n`;
    comment += `**Error Rate:** ${((summary.http_req_failed_rate || 0) * 100).toFixed(2)}%  \n`;
    comment += `**RPS:** ${(summary.http_reqs_per_second || 0).toFixed(0)}  \n\n`;

    if (diff && Object.keys(diff).length > 0) {
      comment += `### Performance Diff vs Baseline\n\n`;
      comment += `| Metric | Baseline | Current | Change |\n`;
      comment += `|--------|----------|---------|--------|\n`;
      for (const [metric, data] of Object.entries(diff)) {
        const icon = data.direction === 'regression' ? '🔴' : data.direction === 'improvement' ? '🟢' : '⚪';
        const label = metric.replace(/_/g, ' ').replace('http req ', '');
        comment += `| ${label} | ${this.formatMetric(metric, data.baseline)} | ${this.formatMetric(metric, data.current)} | ${icon} ${data.change_percent > 0 ? '+' : ''}${data.change_percent}% |\n`;
      }
      comment += '\n';
    }

    comment += budgetChecker.formatViolationsForPR(budgetResult.violations);
    comment += `\n---\n*Sarfat Load Testing Platform*`;
    return comment;
  }

  formatMetric(name, value) {
    if (name.includes('rate')) return `${(value * 100).toFixed(2)}%`;
    if (name.includes('duration') || name.includes('p95') || name.includes('p99')) return `${value.toFixed(0)}ms`;
    if (name.includes('per_second')) return `${value.toFixed(0)} rps`;
    return String(value);
  }

  async createGitHubCheckRun(prInfo, gateId) {
    const token = process.env.GITHUB_APP_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) return;

    try {
      const res = await fetch(
        `https://api.github.com/repos/${prInfo.repo_owner}/${prInfo.repo_name}/check-runs`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Sarfat Performance',
            head_sha: prInfo.commit_sha,
            status: 'in_progress',
            external_id: gateId,
            output: {
              title: 'Performance test in progress',
              summary: 'Sarfat is running a performance test against this PR...',
            },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        await dbv2.updatePrGate(gateId, { check_run_id: data.id });
      }
    } catch (err) {
      console.warn(`[PRGate] Failed to create check run: ${err.message}`);
    }
  }

  async updateGitHubCheckRun(gate, conclusion, run) {
    const token = process.env.GITHUB_APP_TOKEN || process.env.GITHUB_TOKEN;
    if (!token || !gate.check_run_id) return;

    try {
      await fetch(
        `https://api.github.com/repos/${gate.repo_owner}/${gate.repo_name}/check-runs/${gate.check_run_id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'completed',
            conclusion,
            output: {
              title: `Performance: ${run.performance_grade} (${run.performance_score}/100)`,
              summary: `P95: ${(run.k6_summary?.http_req_duration_p95 || 0).toFixed(0)}ms, Errors: ${((run.k6_summary?.http_req_failed_rate || 0) * 100).toFixed(2)}%`,
            },
          }),
        }
      );
    } catch (err) {
      console.warn(`[PRGate] Failed to update check run: ${err.message}`);
    }
  }

  async postGitHubComment(gate, body) {
    const token = process.env.GITHUB_APP_TOKEN || process.env.GITHUB_TOKEN;
    if (!token || !gate.pr_number) return;

    try {
      if (gate.comment_id) {
        await fetch(
          `https://api.github.com/repos/${gate.repo_owner}/${gate.repo_name}/issues/comments/${gate.comment_id}`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
          }
        );
      } else {
        const res = await fetch(
          `https://api.github.com/repos/${gate.repo_owner}/${gate.repo_name}/issues/${gate.pr_number}/comments`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          await dbv2.updatePrGate(gate.id, { comment_id: data.id });
        }
      }
    } catch (err) {
      console.warn(`[PRGate] Failed to post comment: ${err.message}`);
    }
  }

  async configurePRGate(projectId, config) {
    return dbv2.createPrGate({
      project_id: projectId,
      provider: config.provider || 'github',
      repo_owner: config.repo_owner,
      repo_name: config.repo_name,
    });
  }
}

export const prGateManager = new PRGateManager();
