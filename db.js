import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

let pool;

function getPool() {
  if (!pool) {
    const isProduction = process.env.NODE_ENV === 'production';
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function initializeDatabase() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      role VARCHAR(50) DEFAULT 'member',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      test_type VARCHAR(50) NOT NULL DEFAULT 'load',
      protocol VARCHAR(50) DEFAULT 'http',
      script_content TEXT,
      script_source VARCHAR(50) DEFAULT 'manual',
      config JSONB NOT NULL DEFAULT '{}',
      tags TEXT[] DEFAULT '{}',
      is_template BOOLEAN DEFAULT FALSE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      status VARCHAR(30) NOT NULL DEFAULT 'created',
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      duration_ms BIGINT,
      config_snapshot JSONB NOT NULL DEFAULT '{}',
      k6_summary JSONB,
      threshold_results JSONB,
      performance_score DOUBLE PRECISION,
      performance_grade VARCHAR(5),
      environment VARCHAR(50) DEFAULT 'staging',
      trigger VARCHAR(50) DEFAULT 'manual',
      trigger_meta JSONB DEFAULT '{}',
      error_output TEXT,
      notes TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS run_metrics (
      time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      metric_name VARCHAR(100) NOT NULL,
      metric_type VARCHAR(20) NOT NULL,
      value DOUBLE PRECISION NOT NULL,
      tags JSONB DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS endpoint_metrics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      endpoint VARCHAR(500) NOT NULL,
      method VARCHAR(10) NOT NULL,
      request_count BIGINT NOT NULL DEFAULT 0,
      error_count BIGINT NOT NULL DEFAULT 0,
      avg_duration DOUBLE PRECISION,
      min_duration DOUBLE PRECISION,
      max_duration DOUBLE PRECISION,
      p50_duration DOUBLE PRECISION,
      p90_duration DOUBLE PRECISION,
      p95_duration DOUBLE PRECISION,
      p99_duration DOUBLE PRECISION,
      avg_size DOUBLE PRECISION,
      throughput_rps DOUBLE PRECISION,
      error_rate DOUBLE PRECISION,
      status_codes JSONB DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS infra_metrics (
      time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      host VARCHAR(255) NOT NULL,
      metric_name VARCHAR(100) NOT NULL,
      value DOUBLE PRECISION NOT NULL,
      metadata JSONB DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS baselines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      environment VARCHAR(50),
      metrics_summary JSONB NOT NULL DEFAULT '{}',
      thresholds JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_analyses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      analysis_type VARCHAR(50) NOT NULL,
      pass_number SMALLINT NOT NULL,
      model_used VARCHAR(100),
      input_tokens INTEGER,
      output_tokens INTEGER,
      content JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      report_type VARCHAR(50) NOT NULL,
      title VARCHAR(255),
      content TEXT NOT NULL,
      executive_summary JSONB,
      format VARCHAR(20) DEFAULT 'markdown',
      ai_generated BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sla_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      metric VARCHAR(100) NOT NULL,
      operator VARCHAR(10) NOT NULL,
      threshold_value DOUBLE PRECISION NOT NULL,
      unit VARCHAR(20),
      severity VARCHAR(20) DEFAULT 'warning',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sla_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
      sla_id UUID REFERENCES sla_definitions(id) ON DELETE CASCADE,
      passed BOOLEAN NOT NULL,
      actual_value DOUBLE PRECISION NOT NULL,
      threshold_value DOUBLE PRECISION NOT NULL,
      margin_percent DOUBLE PRECISION
    );

    CREATE TABLE IF NOT EXISTS test_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
      cron_expression VARCHAR(100) NOT NULL,
      timezone VARCHAR(50) DEFAULT 'UTC',
      is_active BOOLEAN DEFAULT TRUE,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      notify_on TEXT[] DEFAULT '{failure}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_tests_project ON tests(project_id);
    CREATE INDEX IF NOT EXISTS idx_test_runs_test ON test_runs(test_id);
    CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);
    CREATE INDEX IF NOT EXISTS idx_test_runs_project ON test_runs(project_id);
    CREATE INDEX IF NOT EXISTS idx_run_metrics_run ON run_metrics(run_id, time DESC);
    CREATE INDEX IF NOT EXISTS idx_run_metrics_name ON run_metrics(run_id, metric_name, time DESC);
    CREATE INDEX IF NOT EXISTS idx_endpoint_metrics_run ON endpoint_metrics(run_id);
    CREATE INDEX IF NOT EXISTS idx_infra_metrics_run ON infra_metrics(run_id, time DESC);
    CREATE INDEX IF NOT EXISTS idx_baselines_test ON baselines(test_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_sla_results_run ON sla_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_ai_analyses_run ON ai_analyses(run_id);
    CREATE INDEX IF NOT EXISTS idx_reports_run ON reports(run_id);
  `);

  const demoEmail = 'admin@sarfat.io';
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [demoEmail]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash('loadtest2026', 10);
    await db.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)',
      [demoEmail, hash, 'Admin', 'admin']
    );
  }

  console.log('[DB] Schema initialized');
}

// --- Auth ---

export async function createUser(email, password, name) {
  const db = getPool();
  const hash = await bcrypt.hash(password, 10);
  const result = await db.query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, role, created_at',
    [email, hash, name]
  );
  return result.rows[0];
}

export async function authenticateUser(email, password) {
  const db = getPool();
  const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (result.rows.length === 0) return null;
  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function createSession(userId) {
  const db = getPool();
  const token = uuidv4();
  const ttl = parseInt(process.env.TOKEN_TTL_HOURS || '72', 10);
  const expiresAt = new Date(Date.now() + ttl * 3600000);
  await db.query(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt]
  );
  return token;
}

export async function validateSession(token) {
  const db = getPool();
  const result = await db.query(
    `SELECT s.*, u.email, u.name, u.role FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { id: row.user_id, email: row.email, name: row.name, role: row.role };
}

export async function deleteSession(token) {
  const db = getPool();
  await db.query('DELETE FROM sessions WHERE token = $1', [token]);
}

// --- Projects ---

export async function getProjects() {
  const db = getPool();
  const result = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
  return result.rows;
}

export async function createProject(name, description) {
  const db = getPool();
  const result = await db.query(
    'INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING *',
    [name, description]
  );
  return result.rows[0];
}

// --- Tests ---

export async function getTests(projectId) {
  const db = getPool();
  const where = projectId ? 'WHERE project_id = $1' : '';
  const params = projectId ? [projectId] : [];
  const result = await db.query(
    `SELECT t.*, (SELECT COUNT(*) FROM test_runs WHERE test_id = t.id) as run_count,
     (SELECT performance_score FROM test_runs WHERE test_id = t.id AND status = 'complete' ORDER BY created_at DESC LIMIT 1) as last_score
     FROM tests t ${where} ORDER BY t.updated_at DESC`,
    params
  );
  return result.rows;
}

export async function getTestById(id) {
  const db = getPool();
  const result = await db.query('SELECT * FROM tests WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function createTest(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO tests (project_id, name, description, test_type, protocol, script_content, script_source, config, tags, is_template, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [data.project_id, data.name, data.description, data.test_type || 'load', data.protocol || 'http',
     data.script_content, data.script_source || 'manual', JSON.stringify(data.config || {}),
     data.tags || [], data.is_template || false, data.created_by]
  );
  return result.rows[0];
}

export async function updateTest(id, data) {
  const db = getPool();
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(key === 'config' ? JSON.stringify(val) : val);
      idx++;
    }
  }
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const result = await db.query(
    `UPDATE tests SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deleteTest(id) {
  const db = getPool();
  await db.query('DELETE FROM tests WHERE id = $1', [id]);
}

// --- Test Runs ---

export async function getTestRuns(testId, limit = 50) {
  const db = getPool();
  const where = testId ? 'WHERE tr.test_id = $1' : '';
  const params = testId ? [testId, limit] : [limit];
  const limitParam = testId ? '$2' : '$1';
  const result = await db.query(
    `SELECT tr.*, t.name as test_name, t.test_type, t.protocol
     FROM test_runs tr LEFT JOIN tests t ON t.id = tr.test_id
     ${where} ORDER BY tr.created_at DESC LIMIT ${limitParam}`,
    params
  );
  return result.rows;
}

export async function getAllRuns(limit = 50) {
  const db = getPool();
  const result = await db.query(
    `SELECT tr.*, t.name as test_name, t.test_type, t.protocol
     FROM test_runs tr LEFT JOIN tests t ON t.id = tr.test_id
     ORDER BY tr.created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getRunById(id) {
  const db = getPool();
  const result = await db.query(
    `SELECT tr.*, t.name as test_name, t.test_type, t.protocol, t.script_content
     FROM test_runs tr LEFT JOIN tests t ON t.id = tr.test_id
     WHERE tr.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createTestRun(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO test_runs (test_id, project_id, status, config_snapshot, environment, trigger, trigger_meta, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [data.test_id, data.project_id, 'created', JSON.stringify(data.config_snapshot || {}),
     data.environment || 'staging', data.trigger || 'manual',
     JSON.stringify(data.trigger_meta || {}), data.created_by]
  );
  return result.rows[0];
}

export async function updateTestRun(id, data) {
  const db = getPool();
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(['k6_summary', 'threshold_results', 'config_snapshot', 'trigger_meta'].includes(key)
        ? JSON.stringify(val) : val);
      idx++;
    }
  }
  values.push(id);
  const result = await db.query(
    `UPDATE test_runs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
}

// --- Metrics ---

export async function insertRunMetrics(metrics) {
  const db = getPool();
  if (metrics.length === 0) return;
  const values = [];
  const placeholders = [];
  let idx = 1;
  for (const m of metrics) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
    values.push(m.time || new Date(), m.run_id, m.metric_name, m.metric_type, m.value, JSON.stringify(m.tags || {}));
    idx += 6;
  }
  await db.query(
    `INSERT INTO run_metrics (time, run_id, metric_name, metric_type, value, tags) VALUES ${placeholders.join(', ')}`,
    values
  );
}

export async function getRunMetrics(runId, metricName) {
  const db = getPool();
  const where = metricName
    ? 'WHERE run_id = $1 AND metric_name = $2'
    : 'WHERE run_id = $1';
  const params = metricName ? [runId, metricName] : [runId];
  const result = await db.query(
    `SELECT * FROM run_metrics ${where} ORDER BY time ASC`,
    params
  );
  return result.rows;
}

export async function getRunMetricsSummary(runId) {
  const db = getPool();
  const result = await db.query(
    `SELECT metric_name, metric_type,
       COUNT(*) as sample_count,
       AVG(value) as avg_value,
       MIN(value) as min_value,
       MAX(value) as max_value,
       PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY value) as p50,
       PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY value) as p90,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95,
       PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99
     FROM run_metrics WHERE run_id = $1
     GROUP BY metric_name, metric_type`,
    [runId]
  );
  return result.rows;
}

// --- Endpoint Metrics ---

export async function upsertEndpointMetrics(runId, endpoints) {
  const db = getPool();
  for (const ep of endpoints) {
    await db.query(
      `INSERT INTO endpoint_metrics (run_id, endpoint, method, request_count, error_count,
        avg_duration, min_duration, max_duration, p50_duration, p90_duration, p95_duration, p99_duration,
        avg_size, throughput_rps, error_rate, status_codes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT DO NOTHING`,
      [runId, ep.endpoint, ep.method, ep.request_count, ep.error_count,
       ep.avg_duration, ep.min_duration, ep.max_duration,
       ep.p50_duration, ep.p90_duration, ep.p95_duration, ep.p99_duration,
       ep.avg_size, ep.throughput_rps, ep.error_rate, JSON.stringify(ep.status_codes || {})]
    );
  }
}

export async function getEndpointMetrics(runId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM endpoint_metrics WHERE run_id = $1 ORDER BY request_count DESC',
    [runId]
  );
  return result.rows;
}

// --- Infrastructure Metrics ---

export async function insertInfraMetrics(metrics) {
  const db = getPool();
  if (metrics.length === 0) return;
  const values = [];
  const placeholders = [];
  let idx = 1;
  for (const m of metrics) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
    values.push(m.time || new Date(), m.run_id, m.host, m.metric_name, m.value, JSON.stringify(m.metadata || {}));
    idx += 6;
  }
  await db.query(
    `INSERT INTO infra_metrics (time, run_id, host, metric_name, value, metadata) VALUES ${placeholders.join(', ')}`,
    values
  );
}

export async function getInfraMetrics(runId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM infra_metrics WHERE run_id = $1 ORDER BY time ASC',
    [runId]
  );
  return result.rows;
}

// --- Baselines ---

export async function getBaselines(testId) {
  const db = getPool();
  const result = await db.query(
    'SELECT b.*, tr.performance_score, tr.performance_grade FROM baselines b LEFT JOIN test_runs tr ON tr.id = b.run_id WHERE b.test_id = $1 ORDER BY b.created_at DESC',
    [testId]
  );
  return result.rows;
}

export async function getActiveBaseline(testId, environment) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM baselines WHERE test_id = $1 AND environment = $2 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
    [testId, environment]
  );
  return result.rows[0] || null;
}

export async function createBaseline(data) {
  const db = getPool();
  if (data.is_active) {
    await db.query(
      'UPDATE baselines SET is_active = FALSE WHERE test_id = $1 AND environment = $2',
      [data.test_id, data.environment]
    );
  }
  const result = await db.query(
    `INSERT INTO baselines (test_id, run_id, environment, metrics_summary, thresholds, is_active, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.test_id, data.run_id, data.environment,
     JSON.stringify(data.metrics_summary), JSON.stringify(data.thresholds),
     data.is_active !== false, data.notes]
  );
  return result.rows[0];
}

// --- AI Analyses ---

export async function saveAnalysis(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO ai_analyses (run_id, analysis_type, pass_number, model_used, input_tokens, output_tokens, content)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.run_id, data.analysis_type, data.pass_number, data.model_used,
     data.input_tokens, data.output_tokens, JSON.stringify(data.content)]
  );
  return result.rows[0];
}

export async function getAnalyses(runId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM ai_analyses WHERE run_id = $1 ORDER BY pass_number ASC',
    [runId]
  );
  return result.rows;
}

// --- Reports ---

export async function getReports(runId) {
  const db = getPool();
  const where = runId ? 'WHERE run_id = $1' : '';
  const params = runId ? [runId] : [];
  const result = await db.query(
    `SELECT * FROM reports ${where} ORDER BY created_at DESC`,
    params
  );
  return result.rows;
}

export async function createReport(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO reports (run_id, report_type, title, content, executive_summary, format, ai_generated)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.run_id, data.report_type, data.title, data.content,
     JSON.stringify(data.executive_summary || {}), data.format || 'markdown',
     data.ai_generated || false]
  );
  return result.rows[0];
}

// --- SLA ---

export async function getSlaDefinitions(projectId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM sla_definitions WHERE project_id = $1 AND is_active = TRUE ORDER BY created_at DESC',
    [projectId]
  );
  return result.rows;
}

export async function createSlaDefinition(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO sla_definitions (project_id, name, metric, operator, threshold_value, unit, severity)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.project_id, data.name, data.metric, data.operator,
     data.threshold_value, data.unit, data.severity || 'warning']
  );
  return result.rows[0];
}

export async function saveSlaResults(results) {
  const db = getPool();
  for (const r of results) {
    await db.query(
      `INSERT INTO sla_results (run_id, sla_id, passed, actual_value, threshold_value, margin_percent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [r.run_id, r.sla_id, r.passed, r.actual_value, r.threshold_value, r.margin_percent]
    );
  }
}

export async function getSlaResults(runId) {
  const db = getPool();
  const result = await db.query(
    `SELECT sr.*, sd.name, sd.metric, sd.operator, sd.unit, sd.severity
     FROM sla_results sr JOIN sla_definitions sd ON sd.id = sr.sla_id
     WHERE sr.run_id = $1`,
    [runId]
  );
  return result.rows;
}

// --- Schedules ---

export async function getSchedules() {
  const db = getPool();
  const result = await db.query(
    `SELECT ts.*, t.name as test_name FROM test_schedules ts
     LEFT JOIN tests t ON t.id = ts.test_id ORDER BY ts.created_at DESC`
  );
  return result.rows;
}

export async function createSchedule(data) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO test_schedules (test_id, cron_expression, timezone, is_active, notify_on)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.test_id, data.cron_expression, data.timezone || 'UTC',
     data.is_active !== false, data.notify_on || ['failure']]
  );
  return result.rows[0];
}

export async function updateSchedule(id, data) {
  const db = getPool();
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(val);
      idx++;
    }
  }
  values.push(id);
  const result = await db.query(
    `UPDATE test_schedules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
}

// --- Dashboard helpers ---

export async function getDashboardStats(projectId) {
  const db = getPool();
  const projectFilter = projectId ? 'AND project_id = $1' : '';
  const params = projectId ? [projectId] : [];

  const [totalTests, totalRuns, recentRuns, avgScore] = await Promise.all([
    db.query(`SELECT COUNT(*) as count FROM tests WHERE 1=1 ${projectFilter.replace('AND', 'WHERE')}`, params),
    db.query(`SELECT COUNT(*) as count FROM test_runs WHERE 1=1 ${projectFilter}`, params),
    db.query(
      `SELECT tr.*, t.name as test_name, t.test_type FROM test_runs tr
       LEFT JOIN tests t ON t.id = tr.test_id
       WHERE 1=1 ${projectFilter} ORDER BY tr.created_at DESC LIMIT 10`,
      params
    ),
    db.query(
      `SELECT AVG(performance_score) as avg_score FROM test_runs
       WHERE status = 'complete' AND performance_score IS NOT NULL ${projectFilter}`,
      params
    ),
  ]);

  return {
    total_tests: parseInt(totalTests.rows[0].count),
    total_runs: parseInt(totalRuns.rows[0].count),
    recent_runs: recentRuns.rows,
    avg_score: avgScore.rows[0].avg_score ? parseFloat(avgScore.rows[0].avg_score).toFixed(1) : null,
  };
}

export { getPool };
