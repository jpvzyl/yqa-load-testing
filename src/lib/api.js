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

export default api;
