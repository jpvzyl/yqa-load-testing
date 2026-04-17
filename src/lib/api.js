import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sarfat_lt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sarfat_lt_token');
      if (!window.location.hash.includes('/login')) {
        window.location.hash = '#/login';
      }
    }
    return Promise.reject(err);
  }
);

export const auth = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (email, password, name) => api.post('/auth/register', { email, password, name }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export const dashboard = {
  get: (projectId) => api.get('/dashboard', { params: { project_id: projectId } }),
};

export const projects = {
  list: () => api.get('/projects'),
  create: (name, description) => api.post('/projects', { name, description }),
};

export const tests = {
  list: (projectId) => api.get('/tests', { params: { project_id: projectId } }),
  get: (id) => api.get(`/tests/${id}`),
  create: (data) => api.post('/tests', data),
  update: (id, data) => api.put(`/tests/${id}`, data),
  delete: (id) => api.delete(`/tests/${id}`),
  run: (id, config) => api.post(`/tests/${id}/run`, config || {}),
};

export const runs = {
  list: (testId, limit) => api.get('/runs', { params: { test_id: testId, limit } }),
  get: (id) => api.get(`/runs/${id}`),
  abort: (id) => api.post(`/runs/${id}/abort`),
  metrics: (id, metricName) => api.get(`/runs/${id}/metrics`, { params: { metric_name: metricName } }),
  metricsSummary: (id) => api.get(`/runs/${id}/metrics/summary`),
  endpoints: (id) => api.get(`/runs/${id}/endpoints`),
  analyze: (id) => api.post(`/runs/${id}/analyze`),
  analyses: (id) => api.get(`/runs/${id}/analyses`),
  reports: (id) => api.get(`/runs/${id}/reports`),
  generateReport: (id, type) => api.post(`/runs/${id}/reports`, { report_type: type }),
  baselineComparison: (id) => api.get(`/runs/${id}/baseline-comparison`),
  regression: (id) => api.get(`/runs/${id}/regression`),
  infra: (id) => api.get(`/runs/${id}/infra`),
  correlation: (id) => api.get(`/runs/${id}/correlation`),
  slaResults: (id) => api.get(`/runs/${id}/sla-results`),
};

export const reports = {
  list: () => api.get('/reports'),
  types: () => api.get('/report-types'),
};

export const baselines = {
  list: (testId) => api.get('/baselines', { params: { test_id: testId } }),
  create: (data) => api.post('/baselines', data),
};

export const compare = {
  runs: (id1, id2) => api.get(`/compare/${id1}/${id2}`),
};

export const slas = {
  list: (projectId) => api.get('/slas', { params: { project_id: projectId } }),
  create: (data) => api.post('/slas', data),
};

export const schedules = {
  list: () => api.get('/schedules'),
  create: (data) => api.post('/schedules', data),
};

export const importers = {
  openapi: (data) => api.post('/import/openapi', data),
  har: (data) => api.post('/import/har', data),
  postman: (data) => api.post('/import/postman', data),
  graphql: (data) => api.post('/import/graphql', data),
};

export const ai = {
  generateTest: (data) => api.post('/ai/generate-test', data),
};

const apiv2 = axios.create({
  baseURL: '/api/v2',
  headers: { 'Content-Type': 'application/json' },
});
apiv2.interceptors.request.use((config) => {
  const token = localStorage.getItem('sarfat_lt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
apiv2.interceptors.response.use((res) => res, (err) => {
  if (err.response?.status === 401) {
    localStorage.removeItem('sarfat_lt_token');
    if (!window.location.hash.includes('/login')) window.location.hash = '#/login';
  }
  return Promise.reject(err);
});

export const workers = {
  list: (filters) => apiv2.get('/workers', { params: filters }),
  status: () => apiv2.get('/workers/status'),
  register: (data) => apiv2.post('/workers', data),
  heartbeats: (id) => apiv2.get(`/workers/${id}/heartbeats`),
  deregister: (id) => apiv2.delete(`/workers/${id}`),
};

export const scenarios = {
  list: (projectId) => apiv2.get('/scenarios', { params: { project_id: projectId } }),
  get: (id) => apiv2.get(`/scenarios/${id}`),
  create: (data) => apiv2.post('/scenarios', data),
  update: (id, data) => apiv2.put(`/scenarios/${id}`, data),
  versions: (id) => apiv2.get(`/scenarios/${id}/versions`),
};

export const workloadModels = {
  list: (testId) => apiv2.get('/workload-models', { params: { test_id: testId } }),
  create: (data) => apiv2.post('/workload-models', data),
  update: (id, data) => apiv2.put(`/workload-models/${id}`, data),
  generate: (id) => apiv2.post(`/workload-models/${id}/generate`),
};

export const slosV2 = {
  list: (projectId) => apiv2.get('/slos', { params: { project_id: projectId } }),
  create: (data) => apiv2.post('/slos', data),
  burn: (id) => apiv2.get(`/slos/${id}/burn`),
  evaluate: (runId) => apiv2.post(`/runs/${runId}/slo-evaluation`),
};

export const performanceBudgets = {
  list: (projectId) => apiv2.get('/performance-budgets', { params: { project_id: projectId } }),
  create: (data) => apiv2.post('/performance-budgets', data),
  check: (runId) => apiv2.post(`/runs/${runId}/budget-check`),
};

export const traces = {
  list: (runId) => apiv2.get(`/runs/${runId}/traces`),
  waterfall: (traceId) => apiv2.get(`/traces/${traceId}`),
  logs: (traceId) => apiv2.get(`/traces/${traceId}/logs`),
  slow: (runId) => apiv2.get(`/runs/${runId}/slow-traces`),
  correlate: (runId) => apiv2.get(`/runs/${runId}/trace-correlation`),
  errorCorrelation: (runId) => apiv2.get(`/runs/${runId}/error-correlation`),
  runLogs: (runId) => apiv2.get(`/runs/${runId}/logs`),
};

export const chaos = {
  catalog: () => apiv2.get('/chaos/catalog'),
  list: (projectId) => apiv2.get('/chaos/experiments', { params: { project_id: projectId } }),
  create: (data) => apiv2.post('/chaos/experiments', data),
  execute: (id, runId) => apiv2.post(`/chaos/experiments/${id}/execute`, { run_id: runId }),
  evaluate: (id, runId) => apiv2.post(`/chaos/experiments/${id}/evaluate`, { run_id: runId }),
  results: (id) => apiv2.get(`/chaos/experiments/${id}/results`),
};

export const replay = {
  captures: (projectId) => apiv2.get('/captures', { params: { project_id: projectId } }),
  startCapture: (data) => apiv2.post('/captures', data),
  stopCapture: (id) => apiv2.post(`/captures/${id}/stop`),
  startReplay: (id, data) => apiv2.post(`/captures/${id}/replay`, data),
  activeReplays: () => apiv2.get('/replays'),
  completeReplay: (id) => apiv2.post(`/replays/${id}/complete`),
  getReplay: (id) => apiv2.get(`/replays/${id}`),
};

export const prGates = {
  list: (projectId) => apiv2.get('/pr-gates', { params: { project_id: projectId } }),
  configure: (data) => apiv2.post('/pr-gates', data),
  complete: (id, runId) => apiv2.post(`/pr-gates/${id}/complete`, { run_id: runId }),
};

export const costAnalysis = {
  estimate: (runId, data) => apiv2.post(`/runs/${runId}/cost-estimate`, data),
  get: (runId) => apiv2.get(`/runs/${runId}/cost-estimates`),
};

export const evidence = {
  list: (runId) => apiv2.get(`/runs/${runId}/evidence`),
  get: (id) => apiv2.get(`/evidence/${id}`),
  complianceBundle: (runId) => apiv2.post(`/runs/${runId}/compliance-bundle`),
  verify: (runId) => apiv2.post(`/runs/${runId}/verify-integrity`),
  stats: () => apiv2.get('/evidence/stats'),
};

export const compliance = {
  report: (runId, framework) => apiv2.post(`/runs/${runId}/compliance-report`, { framework }),
  frameworks: () => apiv2.get('/compliance/frameworks'),
};

export const aiV2 = {
  analyze: (runId) => apiv2.post(`/runs/${runId}/analyze-v2`),
  analyzeDiff: (runId, previousRunId) => apiv2.post(`/runs/${runId}/analyze-v2/diff`, { previous_run_id: previousRunId }),
  agents: () => apiv2.get('/ai/agents'),
  evals: (agentName) => apiv2.get(`/ai/evals/${agentName}`),
};

export const apm = {
  integrations: () => apiv2.get('/apm/integrations'),
  register: (data) => apiv2.post('/apm/integrations', data),
  supported: () => apiv2.get('/apm/supported'),
};

export const platformStatus = {
  get: () => apiv2.get('/status'),
};

export default api;
