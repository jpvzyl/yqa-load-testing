import { getPool } from './db.js';

export async function initializeDatabaseV2() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS workers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      region VARCHAR(100) NOT NULL,
      provider VARCHAR(50) DEFAULT 'kubernetes',
      status VARCHAR(30) NOT NULL DEFAULT 'offline',
      capacity_vus INTEGER NOT NULL DEFAULT 30000,
      current_vus INTEGER NOT NULL DEFAULT 0,
      version VARCHAR(50),
      capabilities TEXT[] DEFAULT '{}',
      endpoint VARCHAR(500),
      auth_token_hash VARCHAR(255),
      labels JSONB DEFAULT '{}',
      last_heartbeat_at TIMESTAMPTZ,
      registered_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS worker_heartbeats (
      time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      cpu_percent DOUBLE PRECISION,
      memory_percent DOUBLE PRECISION,
      memory_bytes BIGINT,
      active_vus INTEGER DEFAULT 0,
      active_runs INTEGER DEFAULT 0,
      network_rx_bytes BIGINT,
      network_tx_bytes BIGINT,
      status VARCHAR(30) DEFAULT 'healthy'
    );

    CREATE TABLE IF NOT EXISTS test_shards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL REFERENCES workers(id),
      shard_index SMALLINT NOT NULL,
      total_shards SMALLINT NOT NULL,
      vus_assigned INTEGER NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      k6_summary JSONB,
      error_output TEXT,
      metrics_count BIGINT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      protocol VARCHAR(50) DEFAULT 'http',
      script_content TEXT NOT NULL,
      config JSONB DEFAULT '{}',
      tags TEXT[] DEFAULT '{}',
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scenario_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      script_content TEXT NOT NULL,
      config JSONB DEFAULT '{}',
      change_message TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(scenario_id, version)
    );

    CREATE TABLE IF NOT EXISTS workload_models (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      scenario_mix JSONB NOT NULL DEFAULT '[]',
      global_config JSONB DEFAULT '{}',
      stages JSONB DEFAULT '[]',
      regions TEXT[] DEFAULT '{}',
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS endpoints_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      service VARCHAR(255),
      endpoint VARCHAR(500) NOT NULL,
      method VARCHAR(10) NOT NULL DEFAULT 'GET',
      protocol VARCHAR(50) DEFAULT 'http',
      schema_request JSONB,
      schema_response JSONB,
      typical_latency_ms DOUBLE PRECISION,
      typical_rps DOUBLE PRECISION,
      discovered_from VARCHAR(50),
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS slos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      service VARCHAR(255),
      endpoint VARCHAR(500),
      metric VARCHAR(50) NOT NULL,
      target DOUBLE PRECISION NOT NULL,
      window VARCHAR(10) NOT NULL DEFAULT '30d',
      percentile DOUBLE PRECISION,
      threshold_ms DOUBLE PRECISION,
      error_budget_policy JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS slo_burn (
      time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      slo_id UUID NOT NULL REFERENCES slos(id) ON DELETE CASCADE,
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      window_type VARCHAR(20) NOT NULL,
      burn_rate DOUBLE PRECISION NOT NULL,
      budget_remaining DOUBLE PRECISION NOT NULL,
      good_events BIGINT NOT NULL DEFAULT 0,
      total_events BIGINT NOT NULL DEFAULT 0,
      is_burning BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS performance_budgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      endpoint VARCHAR(500) NOT NULL,
      method VARCHAR(10) DEFAULT 'GET',
      p95_ms DOUBLE PRECISION,
      p99_ms DOUBLE PRECISION,
      error_rate_max DOUBLE PRECISION DEFAULT 0.001,
      min_throughput_rps DOUBLE PRECISION,
      enforcement VARCHAR(20) NOT NULL DEFAULT 'warn',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS traces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      trace_id VARCHAR(64) NOT NULL,
      span_id VARCHAR(32),
      parent_span_id VARCHAR(32),
      service_name VARCHAR(255),
      operation_name VARCHAR(500),
      duration_ms DOUBLE PRECISION,
      status_code VARCHAR(20),
      attributes JSONB DEFAULT '{}',
      events JSONB DEFAULT '[]',
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      trace_id VARCHAR(64),
      span_id VARCHAR(32),
      service_name VARCHAR(255),
      severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
      message TEXT NOT NULL,
      attributes JSONB DEFAULT '{}',
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS captured_traffic (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      capture_method VARCHAR(50) NOT NULL,
      source_environment VARCHAR(100),
      duration_seconds INTEGER,
      request_count BIGINT DEFAULT 0,
      total_bytes BIGINT DEFAULT 0,
      storage_url TEXT,
      storage_hash VARCHAR(64),
      anonymization_rules JSONB DEFAULT '[]',
      anonymized BOOLEAN DEFAULT FALSE,
      status VARCHAR(30) NOT NULL DEFAULT 'capturing',
      metadata JSONB DEFAULT '{}',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS replay_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      capture_id UUID NOT NULL REFERENCES captured_traffic(id) ON DELETE CASCADE,
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      replay_mode VARCHAR(30) NOT NULL DEFAULT 'verbatim',
      speed_multiplier DOUBLE PRECISION DEFAULT 1.0,
      target_environment VARCHAR(255),
      total_requests BIGINT DEFAULT 0,
      replayed_requests BIGINT DEFAULT 0,
      matched_responses BIGINT DEFAULT 0,
      diverged_responses BIGINT DEFAULT 0,
      parity_percent DOUBLE PRECISION,
      divergence_report JSONB,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chaos_experiments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      fault_timeline JSONB NOT NULL DEFAULT '[]',
      hypothesis JSONB,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chaos_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      experiment_id UUID NOT NULL REFERENCES chaos_experiments(id) ON DELETE CASCADE,
      run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      fault_type VARCHAR(50) NOT NULL,
      fault_applied_at TIMESTAMPTZ,
      fault_removed_at TIMESTAMPTZ,
      hypothesis_passed BOOLEAN,
      impact_metrics JSONB DEFAULT '{}',
      observations TEXT,
      evidence_ids UUID[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      storage_url TEXT NOT NULL,
      sha256 VARCHAR(64) NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      mime_type VARCHAR(100) DEFAULT 'application/json',
      retention_days INTEGER DEFAULT 90,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_evals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_name VARCHAR(100) NOT NULL,
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      input_hash VARCHAR(64),
      output JSONB NOT NULL,
      expected_output JSONB,
      scores JSONB DEFAULT '{}',
      pass BOOLEAN,
      eval_version VARCHAR(20),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pr_gates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      provider VARCHAR(20) NOT NULL DEFAULT 'github',
      repo_owner VARCHAR(255) NOT NULL,
      repo_name VARCHAR(255) NOT NULL,
      pr_number INTEGER,
      commit_sha VARCHAR(64),
      branch VARCHAR(255),
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      gate_result VARCHAR(20),
      budget_violations JSONB DEFAULT '[]',
      comment_id BIGINT,
      check_run_id BIGINT,
      performance_diff JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cost_estimates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      provider VARCHAR(30) NOT NULL DEFAULT 'aws',
      region VARCHAR(50),
      current_monthly_cost DOUBLE PRECISION,
      cost_per_request DOUBLE PRECISION,
      cost_at_2x DOUBLE PRECISION,
      cost_at_5x DOUBLE PRECISION,
      cost_at_10x DOUBLE PRECISION,
      scaling_curve JSONB DEFAULT '[]',
      infrastructure_breakdown JSONB DEFAULT '{}',
      recommendations JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(50),
      resource_id UUID,
      details JSONB DEFAULT '{}',
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
    CREATE INDEX IF NOT EXISTS idx_workers_region ON workers(region);
    CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_worker ON worker_heartbeats(worker_id, time DESC);
    CREATE INDEX IF NOT EXISTS idx_test_shards_run ON test_shards(run_id);
    CREATE INDEX IF NOT EXISTS idx_test_shards_worker ON test_shards(worker_id);
    CREATE INDEX IF NOT EXISTS idx_scenarios_project ON scenarios(project_id);
    CREATE INDEX IF NOT EXISTS idx_workload_models_test ON workload_models(test_id);
    CREATE INDEX IF NOT EXISTS idx_endpoints_catalog_project ON endpoints_catalog(project_id);
    CREATE INDEX IF NOT EXISTS idx_slos_project ON slos(project_id);
    CREATE INDEX IF NOT EXISTS idx_slo_burn_slo ON slo_burn(slo_id, time DESC);
    CREATE INDEX IF NOT EXISTS idx_performance_budgets_project ON performance_budgets(project_id);
    CREATE INDEX IF NOT EXISTS idx_traces_run ON traces(run_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON traces(trace_id);
    CREATE INDEX IF NOT EXISTS idx_logs_run ON logs(run_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_trace ON logs(trace_id);
    CREATE INDEX IF NOT EXISTS idx_captured_traffic_project ON captured_traffic(project_id);
    CREATE INDEX IF NOT EXISTS idx_replay_sessions_capture ON replay_sessions(capture_id);
    CREATE INDEX IF NOT EXISTS idx_chaos_experiments_run ON chaos_experiments(run_id);
    CREATE INDEX IF NOT EXISTS idx_chaos_results_experiment ON chaos_results(experiment_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_run ON evidence(run_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence(type);
    CREATE INDEX IF NOT EXISTS idx_ai_evals_agent ON ai_evals(agent_name);
    CREATE INDEX IF NOT EXISTS idx_pr_gates_project ON pr_gates(project_id);
    CREATE INDEX IF NOT EXISTS idx_pr_gates_repo ON pr_gates(repo_owner, repo_name, pr_number);
    CREATE INDEX IF NOT EXISTS idx_cost_estimates_run ON cost_estimates(run_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
  `);

  console.log('[DB] v2 schema initialized (21 new tables)');
}

// --- Workers ---

export async function registerWorker(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO workers (name, region, provider, capacity_vus, version, capabilities, endpoint, labels)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [data.name, data.region, data.provider || 'kubernetes', data.capacity_vus || 30000,
     data.version, data.capabilities || [], data.endpoint, JSON.stringify(data.labels || {})]
  );
  return result.rows[0];
}

export async function getWorkers(filters = {}) {
  const db = getPool();
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;
  if (filters.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
  if (filters.region) { conditions.push(`region = $${idx++}`); params.push(filters.region); }
  const result = await db.query(
    `SELECT * FROM workers WHERE ${conditions.join(' AND ')} ORDER BY region, name`, params
  );
  return result.rows;
}

export async function updateWorkerStatus(id, status, currentVus) {
  const db = getPool();
  const fields = ['status = $1', 'updated_at = NOW()'];
  const params = [status];
  let idx = 2;
  if (currentVus !== undefined) { fields.push(`current_vus = $${idx++}`); params.push(currentVus); }
  if (status === 'online') { fields.push(`last_heartbeat_at = NOW()`); }
  params.push(id);
  await db.query(`UPDATE workers SET ${fields.join(', ')} WHERE id = $${idx}`, params);
}

export async function insertWorkerHeartbeat(data) {
  const db = getPool();
  await db.query(
    `INSERT INTO worker_heartbeats (worker_id, cpu_percent, memory_percent, memory_bytes, active_vus, active_runs, network_rx_bytes, network_tx_bytes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [data.worker_id, data.cpu_percent, data.memory_percent, data.memory_bytes,
     data.active_vus || 0, data.active_runs || 0, data.network_rx_bytes, data.network_tx_bytes, data.status || 'healthy']
  );
  await db.query(`UPDATE workers SET last_heartbeat_at = NOW(), current_vus = $1 WHERE id = $2`,
    [data.active_vus || 0, data.worker_id]);
}

export async function getWorkerHeartbeats(workerId, limit = 100) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM worker_heartbeats WHERE worker_id = $1 ORDER BY time DESC LIMIT $2',
    [workerId, limit]
  );
  return result.rows;
}

// --- Shards ---

export async function createTestShard(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO test_shards (run_id, worker_id, shard_index, total_shards, vus_assigned, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.run_id, data.worker_id, data.shard_index, data.total_shards, data.vus_assigned, 'pending']
  );
  return result.rows[0];
}

export async function updateTestShard(id, data) {
  const db = getPool();
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(['k6_summary'].includes(key) ? JSON.stringify(val) : val);
      idx++;
    }
  }
  values.push(id);
  await db.query(`UPDATE test_shards SET ${fields.join(', ')} WHERE id = $${idx}`, values);
}

export async function getRunShards(runId) {
  const db = getPool();
  const result = await db.query(
    `SELECT ts.*, w.name as worker_name, w.region as worker_region
     FROM test_shards ts JOIN workers w ON w.id = ts.worker_id
     WHERE ts.run_id = $1 ORDER BY ts.shard_index`, [runId]
  );
  return result.rows;
}

// --- Scenarios ---

export async function getScenarios(projectId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM scenarios WHERE project_id = $1 ORDER BY updated_at DESC', [projectId]
  );
  return result.rows;
}

export async function getScenarioById(id) {
  const db = getPool();
  const result = await db.query('SELECT * FROM scenarios WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function createScenario(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO scenarios (project_id, name, description, protocol, script_content, config, tags, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [data.project_id, data.name, data.description, data.protocol || 'http',
     data.script_content, JSON.stringify(data.config || {}), data.tags || [], data.created_by]
  );
  const scenario = result.rows[0];
  await db.query(
    `INSERT INTO scenario_versions (scenario_id, version, script_content, config, change_message, created_by)
     VALUES ($1, 1, $2, $3, 'Initial version', $4)`,
    [scenario.id, data.script_content, JSON.stringify(data.config || {}), data.created_by]
  );
  return scenario;
}

export async function updateScenario(id, data) {
  const db = getPool();
  const current = await getScenarioById(id);
  if (!current) throw new Error('Scenario not found');
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && key !== 'change_message') {
      fields.push(`${key} = $${idx}`);
      values.push(key === 'config' ? JSON.stringify(val) : val);
      idx++;
    }
  }
  fields.push('updated_at = NOW()');
  values.push(id);
  const result = await db.query(
    `UPDATE scenarios SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values
  );
  if (data.script_content) {
    const versionResult = await db.query(
      'SELECT MAX(version) as max_v FROM scenario_versions WHERE scenario_id = $1', [id]
    );
    const nextVersion = (versionResult.rows[0]?.max_v || 0) + 1;
    await db.query(
      `INSERT INTO scenario_versions (scenario_id, version, script_content, config, change_message, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, nextVersion, data.script_content, JSON.stringify(data.config || current.config || {}),
       data.change_message || `Version ${nextVersion}`, data.created_by]
    );
  }
  return result.rows[0];
}

export async function getScenarioVersions(scenarioId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM scenario_versions WHERE scenario_id = $1 ORDER BY version DESC', [scenarioId]
  );
  return result.rows;
}

// --- Workload Models ---

export async function getWorkloadModels(testId) {
  const db = getPool();
  const where = testId ? 'WHERE test_id = $1' : '';
  const params = testId ? [testId] : [];
  const result = await db.query(
    `SELECT * FROM workload_models ${where} ORDER BY updated_at DESC`, params
  );
  return result.rows;
}

export async function createWorkloadModel(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO workload_models (test_id, project_id, name, description, scenario_mix, global_config, stages, regions, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [data.test_id, data.project_id, data.name, data.description,
     JSON.stringify(data.scenario_mix || []), JSON.stringify(data.global_config || {}),
     JSON.stringify(data.stages || []), data.regions || [], data.created_by]
  );
  return result.rows[0];
}

export async function updateWorkloadModel(id, data) {
  const db = getPool();
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(['scenario_mix', 'global_config', 'stages'].includes(key) ? JSON.stringify(val) : val);
      idx++;
    }
  }
  fields.push('updated_at = NOW()');
  values.push(id);
  const result = await db.query(
    `UPDATE workload_models SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values
  );
  return result.rows[0];
}

// --- Endpoints Catalog ---

export async function getEndpointsCatalog(projectId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM endpoints_catalog WHERE project_id = $1 ORDER BY endpoint', [projectId]
  );
  return result.rows;
}

export async function upsertCatalogEndpoint(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO endpoints_catalog (project_id, service, endpoint, method, protocol, schema_request, schema_response, typical_latency_ms, typical_rps, discovered_from)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT DO NOTHING RETURNING *`,
    [data.project_id, data.service, data.endpoint, data.method || 'GET', data.protocol || 'http',
     JSON.stringify(data.schema_request), JSON.stringify(data.schema_response),
     data.typical_latency_ms, data.typical_rps, data.discovered_from]
  );
  return result.rows[0];
}

// --- SLOs ---

export async function getSlos(projectId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM slos WHERE project_id = $1 AND is_active = TRUE ORDER BY created_at DESC', [projectId]
  );
  return result.rows;
}

export async function createSlo(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO slos (project_id, name, service, endpoint, metric, target, window, percentile, threshold_ms, error_budget_policy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [data.project_id, data.name, data.service, data.endpoint, data.metric,
     data.target, data.window || '30d', data.percentile, data.threshold_ms,
     JSON.stringify(data.error_budget_policy || {})]
  );
  return result.rows[0];
}

export async function insertSloBurn(data) {
  const db = getPool();
  await db.query(
    `INSERT INTO slo_burn (slo_id, run_id, window_type, burn_rate, budget_remaining, good_events, total_events, is_burning)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [data.slo_id, data.run_id, data.window_type, data.burn_rate, data.budget_remaining,
     data.good_events, data.total_events, data.is_burning || false]
  );
}

export async function getSloBurnHistory(sloId, limit = 100) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM slo_burn WHERE slo_id = $1 ORDER BY time DESC LIMIT $2', [sloId, limit]
  );
  return result.rows;
}

// --- Performance Budgets ---

export async function getPerformanceBudgets(projectId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM performance_budgets WHERE project_id = $1 AND is_active = TRUE ORDER BY endpoint',
    [projectId]
  );
  return result.rows;
}

export async function createPerformanceBudget(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO performance_budgets (project_id, endpoint, method, p95_ms, p99_ms, error_rate_max, min_throughput_rps, enforcement)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [data.project_id, data.endpoint, data.method || 'GET', data.p95_ms, data.p99_ms,
     data.error_rate_max || 0.001, data.min_throughput_rps, data.enforcement || 'warn']
  );
  return result.rows[0];
}

export async function evaluatePerformanceBudgets(runId, projectId) {
  const db = getPool();
  const [budgets, endpoints] = await Promise.all([
    db.query('SELECT * FROM performance_budgets WHERE project_id = $1 AND is_active = TRUE', [projectId]),
    db.query('SELECT * FROM endpoint_metrics WHERE run_id = $1', [runId]),
  ]);
  const violations = [];
  for (const budget of budgets.rows) {
    const ep = endpoints.rows.find(
      e => e.endpoint === budget.endpoint && (budget.method === '*' || e.method === budget.method)
    );
    if (!ep) continue;
    const checks = [];
    if (budget.p95_ms && ep.p95_duration > budget.p95_ms) {
      checks.push({ metric: 'p95', budget: budget.p95_ms, actual: ep.p95_duration, exceeded: true });
    }
    if (budget.p99_ms && ep.p99_duration > budget.p99_ms) {
      checks.push({ metric: 'p99', budget: budget.p99_ms, actual: ep.p99_duration, exceeded: true });
    }
    if (budget.error_rate_max && ep.error_rate > budget.error_rate_max) {
      checks.push({ metric: 'error_rate', budget: budget.error_rate_max, actual: ep.error_rate, exceeded: true });
    }
    if (checks.some(c => c.exceeded)) {
      violations.push({ budget, endpoint_metrics: ep, checks, enforcement: budget.enforcement });
    }
  }
  return { violations, total_budgets: budgets.rows.length, budgets_checked: budgets.rows.length, passed: violations.length === 0 };
}

// --- Traces ---

export async function insertTraces(traces) {
  const db = getPool();
  if (traces.length === 0) return;
  const values = [];
  const placeholders = [];
  let idx = 1;
  for (const t of traces) {
    placeholders.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8}, $${idx+9}, $${idx+10})`);
    values.push(t.run_id, t.trace_id, t.span_id, t.parent_span_id, t.service_name, t.operation_name,
      t.duration_ms, t.status_code, JSON.stringify(t.attributes || {}), t.started_at, t.ended_at);
    idx += 11;
  }
  await db.query(
    `INSERT INTO traces (run_id, trace_id, span_id, parent_span_id, service_name, operation_name,
     duration_ms, status_code, attributes, started_at, ended_at) VALUES ${placeholders.join(', ')}`, values
  );
}

export async function getTracesByRun(runId, limit = 100) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM traces WHERE run_id = $1 ORDER BY started_at DESC LIMIT $2', [runId, limit]
  );
  return result.rows;
}

export async function getTraceById(traceId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM traces WHERE trace_id = $1 ORDER BY started_at ASC', [traceId]
  );
  return result.rows;
}

export async function getSlowTraces(runId, thresholdMs = 1000, limit = 50) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM traces WHERE run_id = $1 AND duration_ms > $2 ORDER BY duration_ms DESC LIMIT $3',
    [runId, thresholdMs, limit]
  );
  return result.rows;
}

// --- Logs ---

export async function insertLogs(logs) {
  const db = getPool();
  if (logs.length === 0) return;
  const values = [];
  const placeholders = [];
  let idx = 1;
  for (const l of logs) {
    placeholders.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6})`);
    values.push(l.run_id, l.trace_id, l.span_id, l.service_name, l.severity || 'INFO', l.message, JSON.stringify(l.attributes || {}));
    idx += 7;
  }
  await db.query(
    `INSERT INTO logs (run_id, trace_id, span_id, service_name, severity, message, attributes) VALUES ${placeholders.join(', ')}`, values
  );
}

export async function getLogsByRun(runId, severity, limit = 200) {
  const db = getPool();
  const conditions = ['run_id = $1'];
  const params = [runId];
  let idx = 2;
  if (severity) { conditions.push(`severity = $${idx++}`); params.push(severity); }
  params.push(limit);
  const result = await db.query(
    `SELECT * FROM logs WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC LIMIT $${idx}`, params
  );
  return result.rows;
}

export async function getLogsByTrace(traceId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM logs WHERE trace_id = $1 ORDER BY timestamp ASC', [traceId]
  );
  return result.rows;
}

// --- Captured Traffic ---

export async function getCapturedTraffic(projectId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM captured_traffic WHERE project_id = $1 ORDER BY created_at DESC', [projectId]
  );
  return result.rows;
}

export async function createCapturedTraffic(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO captured_traffic (project_id, name, capture_method, source_environment, anonymization_rules, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.project_id, data.name, data.capture_method, data.source_environment,
     JSON.stringify(data.anonymization_rules || []), 'capturing', data.created_by]
  );
  return result.rows[0];
}

export async function updateCapturedTraffic(id, data) {
  const db = getPool();
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(['anonymization_rules', 'metadata'].includes(key) ? JSON.stringify(val) : val);
      idx++;
    }
  }
  values.push(id);
  await db.query(`UPDATE captured_traffic SET ${fields.join(', ')} WHERE id = $${idx}`, values);
}

// --- Replay Sessions ---

export async function createReplaySession(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO replay_sessions (capture_id, run_id, replay_mode, speed_multiplier, target_environment, total_requests, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.capture_id, data.run_id, data.replay_mode || 'verbatim',
     data.speed_multiplier || 1.0, data.target_environment, data.total_requests || 0, 'pending']
  );
  return result.rows[0];
}

export async function updateReplaySession(id, data) {
  const db = getPool();
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(['divergence_report'].includes(key) ? JSON.stringify(val) : val);
      idx++;
    }
  }
  values.push(id);
  await db.query(`UPDATE replay_sessions SET ${fields.join(', ')} WHERE id = $${idx}`, values);
}

export async function getReplaySessions(captureId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM replay_sessions WHERE capture_id = $1 ORDER BY created_at DESC', [captureId]
  );
  return result.rows;
}

// --- Chaos ---

export async function createChaosExperiment(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO chaos_experiments (run_id, project_id, name, fault_timeline, hypothesis, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.run_id, data.project_id, data.name, JSON.stringify(data.fault_timeline || []),
     JSON.stringify(data.hypothesis), data.status || 'pending', data.created_by]
  );
  return result.rows[0];
}

export async function getChaosExperiments(projectId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM chaos_experiments WHERE project_id = $1 ORDER BY created_at DESC', [projectId]
  );
  return result.rows;
}

export async function createChaosResult(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO chaos_results (experiment_id, run_id, fault_type, fault_applied_at, fault_removed_at, hypothesis_passed, impact_metrics, observations, evidence_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [data.experiment_id, data.run_id, data.fault_type, data.fault_applied_at, data.fault_removed_at,
     data.hypothesis_passed, JSON.stringify(data.impact_metrics || {}), data.observations, data.evidence_ids || []]
  );
  return result.rows[0];
}

export async function getChaosResults(experimentId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM chaos_results WHERE experiment_id = $1 ORDER BY fault_applied_at ASC', [experimentId]
  );
  return result.rows;
}

// --- Evidence ---

export async function createEvidence(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO evidence (run_id, type, storage_url, sha256, size_bytes, mime_type, retention_days, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [data.run_id, data.type, data.storage_url, data.sha256, data.size_bytes || 0,
     data.mime_type || 'application/json', data.retention_days || 90, JSON.stringify(data.metadata || {})]
  );
  return result.rows[0];
}

export async function getEvidence(runId, type) {
  const db = getPool();
  const conditions = ['run_id = $1'];
  const params = [runId];
  if (type) { conditions.push('type = $2'); params.push(type); }
  const result = await db.query(
    `SELECT * FROM evidence WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`, params
  );
  return result.rows;
}

// --- AI Evals ---

export async function saveAiEval(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO ai_evals (agent_name, run_id, input_hash, output, expected_output, scores, pass, eval_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [data.agent_name, data.run_id, data.input_hash, JSON.stringify(data.output),
     data.expected_output ? JSON.stringify(data.expected_output) : null,
     JSON.stringify(data.scores || {}), data.pass, data.eval_version]
  );
  return result.rows[0];
}

export async function getAiEvals(agentName, limit = 50) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM ai_evals WHERE agent_name = $1 ORDER BY created_at DESC LIMIT $2',
    [agentName, limit]
  );
  return result.rows;
}

// --- PR Gates ---

export async function createPrGate(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO pr_gates (project_id, provider, repo_owner, repo_name, pr_number, commit_sha, branch, run_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [data.project_id, data.provider || 'github', data.repo_owner, data.repo_name,
     data.pr_number, data.commit_sha, data.branch, data.run_id, 'pending']
  );
  return result.rows[0];
}

export async function updatePrGate(id, data) {
  const db = getPool();
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(['budget_violations', 'performance_diff'].includes(key) ? JSON.stringify(val) : val);
      idx++;
    }
  }
  fields.push('updated_at = NOW()');
  values.push(id);
  await db.query(`UPDATE pr_gates SET ${fields.join(', ')} WHERE id = $${idx}`, values);
}

export async function getPrGates(projectId, limit = 50) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM pr_gates WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2', [projectId, limit]
  );
  return result.rows;
}

// --- Cost Estimates ---

export async function createCostEstimate(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO cost_estimates (run_id, project_id, provider, region, current_monthly_cost, cost_per_request,
     cost_at_2x, cost_at_5x, cost_at_10x, scaling_curve, infrastructure_breakdown, recommendations)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [data.run_id, data.project_id, data.provider || 'aws', data.region,
     data.current_monthly_cost, data.cost_per_request, data.cost_at_2x, data.cost_at_5x, data.cost_at_10x,
     JSON.stringify(data.scaling_curve || []), JSON.stringify(data.infrastructure_breakdown || {}),
     JSON.stringify(data.recommendations || [])]
  );
  return result.rows[0];
}

export async function getCostEstimates(runId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM cost_estimates WHERE run_id = $1 ORDER BY created_at DESC', [runId]
  );
  return result.rows;
}

// --- Audit Log ---

export async function logAudit(data) {
  const db = getPool();
  await db.query(
    `INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [data.user_id, data.action, data.resource_type, data.resource_id,
     JSON.stringify(data.details || {}), data.ip_address, data.user_agent]
  );
}

export async function getAuditLog(filters = {}, limit = 100) {
  const db = getPool();
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;
  if (filters.user_id) { conditions.push(`user_id = $${idx++}`); params.push(filters.user_id); }
  if (filters.resource_type) { conditions.push(`resource_type = $${idx++}`); params.push(filters.resource_type); }
  if (filters.resource_id) { conditions.push(`resource_id = $${idx++}`); params.push(filters.resource_id); }
  if (filters.action) { conditions.push(`action = $${idx++}`); params.push(filters.action); }
  params.push(limit);
  const result = await db.query(
    `SELECT al.*, u.email, u.name as user_name FROM audit_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE ${conditions.join(' AND ')} ORDER BY al.created_at DESC LIMIT $${idx}`, params
  );
  return result.rows;
}
