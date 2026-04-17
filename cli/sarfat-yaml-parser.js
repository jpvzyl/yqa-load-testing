import YAML from 'yaml';

const SUPPORTED_API_VERSIONS = ['sarfat.io/v1'];
const SUPPORTED_KINDS = ['Test'];
const VALID_PROTOCOLS = ['http', 'grpc', 'websocket', 'graphql', 'tcp'];
const VALID_METRICS = [
  'http_req_duration', 'http_req_failed', 'http_reqs',
  'grpc_req_duration', 'ws_connecting', 'ws_msgs_received',
  'iteration_duration', 'data_received', 'data_sent', 'vus',
];
const VALID_FAULT_TYPES = [
  'latency', 'error', 'cpu_stress', 'memory_stress',
  'network_partition', 'dns_failure', 'pod_kill', 'disk_io',
];

export function parseSarfatYaml(content) {
  if (!content || typeof content !== 'string') {
    throw new Error('Content must be a non-empty string');
  }

  let doc;
  try {
    doc = YAML.parse(content);
  } catch (err) {
    throw new Error(`YAML parse error: ${err.message}`);
  }

  if (!doc || typeof doc !== 'object') {
    throw new Error('YAML document must be a mapping');
  }

  return {
    apiVersion: doc.apiVersion,
    kind: doc.kind,
    metadata: normalizeMetadata(doc.metadata),
    spec: normalizeSpec(doc.spec),
  };
}

function normalizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') return { name: 'unnamed-test' };
  return {
    name: meta.name || 'unnamed-test',
    description: meta.description || '',
    labels: meta.labels || {},
    annotations: meta.annotations || {},
  };
}

function normalizeSpec(spec) {
  if (!spec || typeof spec !== 'object') return {};
  return {
    workload_model: normalizeWorkloadModel(spec.workload_model),
    stages: normalizeStages(spec.stages),
    slos: normalizeSlos(spec.slos),
    chaos: normalizeChaos(spec.chaos),
    regions: Array.isArray(spec.regions) ? spec.regions : [],
    on_completion: spec.on_completion || {},
  };
}

function normalizeWorkloadModel(wm) {
  if (!wm || typeof wm !== 'object') return { scenarios: [] };
  const scenarios = Array.isArray(wm.scenarios)
    ? wm.scenarios.map(s => ({
        name: s.name || 'default',
        protocol: s.protocol || 'http',
        weight: s.weight ?? 100,
        script: s.script || '',
        script_ref: s.script_ref || null,
        config: s.config || {},
        thinkTime: s.thinkTime || s.think_time || null,
      }))
    : [];
  return { scenarios, global_config: wm.global_config || {} };
}

function normalizeStages(stages) {
  if (!Array.isArray(stages)) return [];
  return stages.map(s => ({
    name: s.name || 'stage',
    duration: s.duration || '1m',
    target_vus: s.target_vus ?? s.target ?? 0,
    ramp_type: s.ramp_type || 'linear',
  }));
}

function normalizeSlos(slos) {
  if (!Array.isArray(slos)) return [];
  return slos.map(s => ({
    name: s.name || 'slo',
    metric: s.metric,
    target: s.target,
    percentile: s.percentile,
    threshold_ms: s.threshold_ms,
    service: s.service || null,
    endpoint: s.endpoint || null,
    window: s.window || '30d',
  }));
}

function normalizeChaos(chaos) {
  if (!Array.isArray(chaos)) return [];
  return chaos.map(c => ({
    name: c.name || 'fault',
    fault_type: c.fault_type || c.type,
    target: c.target || '*',
    inject_at: c.inject_at || c.at || '50%',
    duration: c.duration || '30s',
    intensity: c.intensity ?? 1.0,
    hypothesis: c.hypothesis || null,
  }));
}

export function validateSarfatSpec(doc) {
  const errors = [];

  if (!doc.apiVersion) {
    errors.push('Missing required field: apiVersion');
  } else if (!SUPPORTED_API_VERSIONS.includes(doc.apiVersion)) {
    errors.push(`Unsupported apiVersion "${doc.apiVersion}". Supported: ${SUPPORTED_API_VERSIONS.join(', ')}`);
  }

  if (!doc.kind) {
    errors.push('Missing required field: kind');
  } else if (!SUPPORTED_KINDS.includes(doc.kind)) {
    errors.push(`Unsupported kind "${doc.kind}". Supported: ${SUPPORTED_KINDS.join(', ')}`);
  }

  if (!doc.metadata?.name) {
    errors.push('metadata.name is required');
  } else if (!/^[a-z0-9][a-z0-9._-]*$/.test(doc.metadata.name)) {
    errors.push('metadata.name must match /^[a-z0-9][a-z0-9._-]*$/');
  }

  const spec = doc.spec;
  if (!spec || typeof spec !== 'object') {
    errors.push('spec is required and must be a mapping');
    return errors;
  }

  const scenarios = spec.workload_model?.scenarios || [];
  if (scenarios.length === 0) {
    errors.push('spec.workload_model.scenarios must contain at least one scenario');
  }
  for (const [i, s] of scenarios.entries()) {
    if (!s.name) errors.push(`scenarios[${i}]: name is required`);
    if (s.protocol && !VALID_PROTOCOLS.includes(s.protocol)) {
      errors.push(`scenarios[${i}]: unsupported protocol "${s.protocol}"`);
    }
    if (!s.script && !s.script_ref) {
      errors.push(`scenarios[${i}]: either script or script_ref is required`);
    }
    if (typeof s.weight === 'number' && (s.weight < 0 || s.weight > 100)) {
      errors.push(`scenarios[${i}]: weight must be between 0 and 100`);
    }
  }

  const totalWeight = scenarios.reduce((s, sc) => s + (sc.weight ?? 0), 0);
  if (scenarios.length > 1 && totalWeight !== 100) {
    errors.push(`Scenario weights must sum to 100 (got ${totalWeight})`);
  }

  for (const [i, stage] of (spec.stages || []).entries()) {
    if (!stage.duration) errors.push(`stages[${i}]: duration is required`);
    if (stage.target_vus == null) errors.push(`stages[${i}]: target_vus is required`);
    if (typeof stage.target_vus === 'number' && stage.target_vus < 0) {
      errors.push(`stages[${i}]: target_vus must be >= 0`);
    }
  }

  for (const [i, slo] of (spec.slos || []).entries()) {
    if (!slo.metric) errors.push(`slos[${i}]: metric is required`);
    else if (!VALID_METRICS.includes(slo.metric)) {
      errors.push(`slos[${i}]: unknown metric "${slo.metric}"`);
    }
    if (slo.target == null && slo.threshold_ms == null) {
      errors.push(`slos[${i}]: either target or threshold_ms is required`);
    }
  }

  for (const [i, c] of (spec.chaos || []).entries()) {
    if (!c.fault_type) errors.push(`chaos[${i}]: fault_type is required`);
    else if (!VALID_FAULT_TYPES.includes(c.fault_type)) {
      errors.push(`chaos[${i}]: unknown fault_type "${c.fault_type}"`);
    }
  }

  return errors;
}
