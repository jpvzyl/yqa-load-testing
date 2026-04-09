export const TEST_TYPES = [
  { id: 'smoke', label: 'Smoke Test', description: 'Verify script works with minimal load', icon: '💨', color: '#94a3b8' },
  { id: 'load', label: 'Load Test', description: 'Validate performance under expected load', icon: '📊', color: '#3b82f6' },
  { id: 'stress', label: 'Stress Test', description: 'Find breaking point beyond normal load', icon: '🔥', color: '#f97316' },
  { id: 'spike', label: 'Spike Test', description: 'Test sudden large surge of traffic', icon: '⚡', color: '#eab308' },
  { id: 'soak', label: 'Soak Test', description: 'Detect issues under sustained long-duration load', icon: '🌊', color: '#06b6d4' },
  { id: 'breakpoint', label: 'Breakpoint Test', description: 'Find exact capacity ceiling', icon: '💥', color: '#ef4444' },
  { id: 'scalability', label: 'Scalability Test', description: 'Measure linear vs degrading scaling', icon: '📈', color: '#22c55e' },
];

export const PROTOCOLS = [
  { id: 'http', label: 'HTTP/HTTPS' },
  { id: 'websocket', label: 'WebSocket' },
  { id: 'grpc', label: 'gRPC' },
  { id: 'graphql', label: 'GraphQL' },
];

export const RUN_STATUSES = {
  created: { label: 'Created', color: '#94a3b8', bg: 'bg-gray-500/20' },
  queued: { label: 'Queued', color: '#94a3b8', bg: 'bg-gray-500/20' },
  initializing: { label: 'Initializing', color: '#60a5fa', bg: 'bg-blue-500/20' },
  running: { label: 'Running', color: '#3b82f6', bg: 'bg-blue-500/20' },
  collecting: { label: 'Collecting', color: '#8b5cf6', bg: 'bg-purple-500/20' },
  analyzing: { label: 'Analyzing', color: '#a855f7', bg: 'bg-purple-500/20' },
  complete: { label: 'Complete', color: '#22c55e', bg: 'bg-green-500/20' },
  failed: { label: 'Failed', color: '#ef4444', bg: 'bg-red-500/20' },
  aborted: { label: 'Aborted', color: '#f59e0b', bg: 'bg-yellow-500/20' },
};

export const GRADES = {
  'A+': { color: '#22c55e', bg: 'bg-green-500/20', label: 'Excellent' },
  'A': { color: '#4ade80', bg: 'bg-green-500/15', label: 'Good' },
  'B': { color: '#facc15', bg: 'bg-yellow-500/20', label: 'Acceptable' },
  'C': { color: '#f97316', bg: 'bg-orange-500/20', label: 'Concerning' },
  'D': { color: '#ef4444', bg: 'bg-red-500/20', label: 'Poor' },
  'F': { color: '#dc2626', bg: 'bg-red-500/25', label: 'Critical' },
};

export const REPORT_TYPES = [
  { id: 'executive_summary', label: 'Executive Summary', icon: '📋' },
  { id: 'technical_report', label: 'Technical Deep-Dive', icon: '🔬' },
  { id: 'remediation_plan', label: 'Remediation Plan', icon: '🔧' },
  { id: 'sla_compliance', label: 'SLA Compliance', icon: '📜' },
  { id: 'capacity_planning', label: 'Capacity Planning', icon: '📐' },
];

export const IMPORT_TYPES = [
  { id: 'openapi', label: 'OpenAPI / Swagger', accept: '.json,.yaml,.yml', icon: '📄' },
  { id: 'har', label: 'HAR (HTTP Archive)', accept: '.har,.json', icon: '🌐' },
  { id: 'postman', label: 'Postman Collection', accept: '.json', icon: '📮' },
  { id: 'graphql', label: 'GraphQL Schema', accept: '.json,.graphql,.gql', icon: '◈' },
];

export const METRIC_LABELS = {
  http_req_duration_avg: 'Avg Response Time',
  http_req_duration_p95: 'P95 Response Time',
  http_req_duration_p99: 'P99 Response Time',
  http_req_duration_med: 'Median Response Time',
  http_req_failed_rate: 'Error Rate',
  http_reqs: 'Total Requests',
  vus_max: 'Peak VUs',
  iteration_duration_avg: 'Avg Iteration Duration',
  data_received: 'Data Received',
  data_sent: 'Data Sent',
};
