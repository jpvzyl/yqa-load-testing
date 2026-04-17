/**
 * Sarfat Load Testing Platform v2 — AI Agent Schemas
 *
 * JSON Schema definitions for all 10 pipeline agents.
 * Used for output validation, retry logic, and eval scoring.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSchema(title, properties) {
  const required = [];
  const cleaned = {};
  for (const [key, def] of Object.entries(properties)) {
    const { _required, ...rest } = def;
    cleaned[key] = rest;
    if (_required) required.push(key);
  }
  return { title, type: 'object', properties: cleaned, required };
}

// ---------------------------------------------------------------------------
// Reusable fragments
// ---------------------------------------------------------------------------

const severityEnum = { type: 'string', enum: ['critical', 'high', 'medium', 'low'] };

const confidenceScore = { type: 'number', minimum: 0, maximum: 1 };

const findingObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    severity: severityEnum,
    confidence: confidenceScore,
    evidence: { type: 'string' },
    impact: { type: 'string' },
  },
  required: ['id', 'title', 'severity', 'confidence'],
};

// ---------------------------------------------------------------------------
// Agent 1 — Workload Analyst
// ---------------------------------------------------------------------------

export const workloadAnalystSchema = buildSchema('WorkloadAnalystOutput', {
  traffic_model: {
    _required: true,
    type: 'object',
    properties: {
      scenarios: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            weight_percent: { type: 'number' },
            endpoints: { type: 'array', items: { type: 'object' } },
            think_time_ms: { type: 'number' },
            pacing_strategy: { type: 'string', enum: ['constant', 'poisson', 'fixed-interval'] },
          },
          required: ['name', 'weight_percent', 'endpoints'],
        },
      },
      total_weight_check: { type: 'number' },
      peak_hour_multiplier: { type: 'number' },
      session_duration_s: { type: 'number' },
    },
    required: ['scenarios'],
  },
  data_sources_used: { _required: true, type: 'array', items: { type: 'string' } },
  assumptions: { _required: true, type: 'array', items: { type: 'string' } },
  confidence: { _required: true, ...confidenceScore },
});

// ---------------------------------------------------------------------------
// Agent 2 — Test Designer
// ---------------------------------------------------------------------------

export const testDesignerSchema = buildSchema('TestDesignerOutput', {
  test_plan: {
    _required: true,
    type: 'object',
    properties: {
      name: { type: 'string' },
      objective: { type: 'string' },
      test_type: { type: 'string', enum: ['load', 'stress', 'spike', 'soak', 'breakpoint', 'scalability'] },
      protocol: { type: 'string' },
      stages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            duration: { type: 'string' },
            target_vus: { type: 'number' },
            ramp_type: { type: 'string' },
          },
          required: ['duration', 'target_vus'],
        },
      },
      thresholds: { type: 'object' },
      scenarios: { type: 'array', items: { type: 'object' } },
    },
    required: ['name', 'objective', 'test_type', 'stages'],
  },
  rationale: { _required: true, type: 'string' },
  risks: { _required: true, type: 'array', items: { type: 'string' } },
  estimated_duration_s: { _required: true, type: 'number' },
  estimated_peak_vus: { _required: true, type: 'number' },
});

// ---------------------------------------------------------------------------
// Agent 3 — Script Generator
// ---------------------------------------------------------------------------

export const scriptGeneratorSchema = buildSchema('ScriptGeneratorOutput', {
  script: { _required: true, type: 'string' },
  language: { _required: true, type: 'string', enum: ['javascript'] },
  k6_options: { _required: true, type: 'object' },
  imports_used: { _required: true, type: 'array', items: { type: 'string' } },
  custom_metrics: { type: 'array', items: { type: 'string' } },
  data_files_needed: { type: 'array', items: { type: 'string' } },
  validation_notes: { type: 'array', items: { type: 'string' } },
});

// ---------------------------------------------------------------------------
// Agent 4 — Metric Analyst
// ---------------------------------------------------------------------------

export const metricAnalystSchema = buildSchema('MetricAnalystOutput', {
  performance_grade: { _required: true, type: 'string', enum: ['A+', 'A', 'B', 'C', 'D', 'F'] },
  overall_score: { _required: true, type: 'number', minimum: 0, maximum: 100 },
  executive_headline: { _required: true, type: 'string' },
  bottlenecks: {
    _required: true,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        component: { type: 'string' },
        description: { type: 'string' },
        severity: severityEnum,
        confidence: confidenceScore,
        evidence: { type: 'string' },
        saturation_point_vus: { type: 'number' },
        saturation_point_rps: { type: 'number' },
        impact: { type: 'string' },
      },
      required: ['component', 'severity', 'confidence', 'evidence'],
    },
  },
  anomalies: {
    _required: true,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        evidence: { type: 'string' },
        confidence: confidenceScore,
        possible_causes: { type: 'array', items: { type: 'string' } },
      },
      required: ['description', 'confidence'],
    },
  },
  error_analysis: {
    _required: true,
    type: 'object',
    properties: {
      dominant_errors: { type: 'array', items: { type: 'string' } },
      correlation_with_load: { type: 'string' },
      root_cause_hypothesis: { type: 'string' },
    },
  },
  response_time_analysis: {
    _required: true,
    type: 'object',
    properties: {
      p50_assessment: { type: 'string' },
      p95_assessment: { type: 'string' },
      p99_assessment: { type: 'string' },
      distribution_shape: { type: 'string', enum: ['normal', 'bimodal', 'long-tail', 'uniform'] },
      outlier_analysis: { type: 'string' },
    },
  },
  throughput_analysis: {
    _required: true,
    type: 'object',
    properties: {
      peak_rps: { type: 'number' },
      sustainable_rps: { type: 'number' },
      scaling_behavior: { type: 'string', enum: ['linear', 'sublinear', 'degrading', 'cliff'] },
      limiting_factor: { type: 'string' },
    },
  },
  quick_wins: { _required: true, type: 'array', items: { type: 'string' } },
  deep_investigation_needed: { type: 'array', items: { type: 'string' } },
});

// ---------------------------------------------------------------------------
// Agent 5 — Trace Correlator
// ---------------------------------------------------------------------------

export const traceCorrelatorSchema = buildSchema('TraceCorrelatorOutput', {
  attributions: {
    _required: true,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        finding_id: { type: 'string' },
        slow_span: { type: 'string' },
        service: { type: 'string' },
        operation: { type: 'string' },
        duration_ms: { type: 'number' },
        root_cause: { type: 'string' },
        evidence_chain: { type: 'array', items: { type: 'string' } },
        sql_query: { type: 'string' },
        confidence: confidenceScore,
      },
      required: ['finding_id', 'service', 'operation', 'confidence'],
    },
  },
  service_dependency_graph: {
    type: 'object',
    properties: {
      nodes: { type: 'array', items: { type: 'object' } },
      edges: { type: 'array', items: { type: 'object' } },
      critical_path: { type: 'array', items: { type: 'string' } },
    },
  },
  log_correlations: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        finding_id: { type: 'string' },
        log_pattern: { type: 'string' },
        occurrences: { type: 'number' },
        severity: severityEnum,
        sample_message: { type: 'string' },
      },
    },
  },
  unattributed_findings: { type: 'array', items: { type: 'string' } },
});

// ---------------------------------------------------------------------------
// Agent 6 — Infra Correlator
// ---------------------------------------------------------------------------

export const infraCorrelatorSchema = buildSchema('InfraCorrelatorOutput', {
  resource_saturation_map: {
    _required: true,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        resource: { type: 'string' },
        host: { type: 'string' },
        peak_utilization_percent: { type: 'number' },
        saturation_timestamp: { type: 'string' },
        vus_at_saturation: { type: 'number' },
        rps_at_saturation: { type: 'number' },
        application_impact: { type: 'string' },
        recommendation: { type: 'string' },
        confidence: confidenceScore,
      },
      required: ['resource', 'peak_utilization_percent', 'confidence'],
    },
  },
  capacity_analysis: {
    _required: true,
    type: 'object',
    properties: {
      current_ceiling_vus: { type: 'number' },
      current_ceiling_rps: { type: 'number' },
      headroom_percent: { type: 'number' },
      first_resource_to_saturate: { type: 'string' },
      scaling_path: { type: 'string', enum: ['vertical', 'horizontal', 'both', 'optimize-first'] },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
  },
  database_analysis: {
    type: 'object',
    properties: {
      connection_pool_health: { type: 'string' },
      query_performance_trend: { type: 'string' },
      slow_queries_identified: { type: 'number' },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
  },
  network_analysis: {
    type: 'object',
    properties: {
      bandwidth_utilization: { type: 'string' },
      latency_contribution_ms: { type: 'number' },
      dns_overhead_ms: { type: 'number' },
      tls_overhead_ms: { type: 'number' },
    },
  },
  apm_insights: { type: 'array', items: { type: 'string' } },
});

// ---------------------------------------------------------------------------
// Agent 7 — Regression Judge
// ---------------------------------------------------------------------------

export const regressionJudgeSchema = buildSchema('RegressionJudgeOutput', {
  has_regression: { _required: true, type: 'boolean' },
  overall_verdict: { _required: true, type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
  regression_calls: {
    _required: true,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        metric: { type: 'string' },
        current_value: { type: 'number' },
        baseline_value: { type: 'number' },
        change_percent: { type: 'number' },
        z_score: { type: 'number' },
        p_value: { type: 'number' },
        severity: severityEnum,
        verdict: { type: 'string', enum: ['REGRESSION', 'IMPROVEMENT', 'STABLE'] },
        statistical_evidence: { type: 'string' },
      },
      required: ['metric', 'current_value', 'baseline_value', 'verdict'],
    },
  },
  diff_findings: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        finding_id: { type: 'string' },
        status: { type: 'string', enum: ['RESOLVED', 'UNCHANGED', 'NEW', 'WORSENED', 'IMPROVED'] },
        previous_severity: severityEnum,
        current_severity: severityEnum,
        evidence: { type: 'string' },
      },
      required: ['finding_id', 'status'],
    },
  },
  trend_direction: { _required: true, type: 'string', enum: ['improving', 'stable', 'degrading'] },
  summary: { _required: true, type: 'string' },
});

// ---------------------------------------------------------------------------
// Agent 8 — SLO Judge
// ---------------------------------------------------------------------------

export const sloJudgeSchema = buildSchema('SloJudgeOutput', {
  overall_compliance: { _required: true, type: 'string', enum: ['compliant', 'at-risk', 'breached'] },
  slo_results: {
    _required: true,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        slo_id: { type: 'string' },
        slo_name: { type: 'string' },
        metric: { type: 'string' },
        target: { type: 'number' },
        actual: { type: 'number' },
        passed: { type: 'boolean' },
        margin_percent: { type: 'number' },
        budget_remaining_percent: { type: 'number' },
        burn_rate_1h: { type: 'number' },
        burn_rate_6h: { type: 'number' },
        projected_exhaustion: { type: 'string' },
        status: { type: 'string', enum: ['healthy', 'warning', 'critical', 'exhausted'] },
      },
      required: ['slo_name', 'metric', 'target', 'actual', 'passed', 'status'],
    },
  },
  error_budget_summary: {
    _required: true,
    type: 'object',
    properties: {
      total_budget_remaining_percent: { type: 'number' },
      fastest_burning_slo: { type: 'string' },
      projected_budget_exhaustion: { type: 'string' },
      recommendation: { type: 'string' },
    },
  },
  historical_trend: {
    type: 'object',
    properties: {
      direction: { type: 'string', enum: ['improving', 'stable', 'degrading'] },
      compliance_rate_30d: { type: 'number' },
      worst_period: { type: 'string' },
    },
  },
  alerts: { type: 'array', items: { type: 'object' } },
});

// ---------------------------------------------------------------------------
// Agent 9 — Executive Synthesiser
// ---------------------------------------------------------------------------

export const executiveSynthesiserSchema = buildSchema('ExecutiveSynthesiserOutput', {
  executive_summary: { _required: true, type: 'string' },
  risk_level: { _required: true, type: 'string', enum: ['low', 'moderate', 'high', 'critical'] },
  production_readiness: { _required: true, type: 'string', enum: ['ready', 'conditional', 'not-ready'] },
  go_nogo_recommendation: { _required: true, type: 'string', enum: ['GO', 'CONDITIONAL-GO', 'NO-GO'] },
  key_findings: {
    _required: true,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        finding: { type: 'string' },
        business_impact: { type: 'string' },
        urgency: { type: 'string', enum: ['immediate', 'short-term', 'medium-term'] },
        effort_estimate: { type: 'string' },
      },
      required: ['finding', 'business_impact', 'urgency'],
    },
  },
  regression_summary: {
    type: 'object',
    properties: {
      has_regression: { type: 'boolean' },
      regressed_metrics: { type: 'array', items: { type: 'string' } },
      statistical_significance: { type: 'string' },
      probable_cause: { type: 'string' },
    },
  },
  sla_compliance: {
    type: 'object',
    properties: {
      overall_status: { type: 'string' },
      summary: { type: 'string' },
    },
  },
  capacity_forecast: {
    type: 'object',
    properties: {
      current_load_description: { type: 'string' },
      time_to_capacity: { type: 'string' },
      recommended_actions: { type: 'array', items: { type: 'string' } },
    },
  },
  remediation_roadmap: {
    _required: true,
    type: 'object',
    properties: {
      immediate: { type: 'array', items: { type: 'string' } },
      short_term: { type: 'array', items: { type: 'string' } },
      medium_term: { type: 'array', items: { type: 'string' } },
      architectural: { type: 'array', items: { type: 'string' } },
    },
  },
  cost_of_inaction: { _required: true, type: 'string' },
  estimated_optimization_cost: { type: 'string' },
});

// ---------------------------------------------------------------------------
// Agent 10 — Remediation Coach
// ---------------------------------------------------------------------------

export const remediationCoachSchema = buildSchema('RemediationCoachOutput', {
  prioritized_actions: {
    _required: true,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        rank: { type: 'number' },
        title: { type: 'string' },
        category: { type: 'string', enum: ['code', 'config', 'infra', 'architecture', 'monitoring'] },
        severity: severityEnum,
        effort: { type: 'string', enum: ['trivial', 'small', 'medium', 'large', 'epic'] },
        expected_impact: { type: 'string' },
        description: { type: 'string' },
        code_diff: { type: 'string' },
        file_path: { type: 'string' },
        technology: { type: 'string' },
        confidence: confidenceScore,
      },
      required: ['rank', 'title', 'category', 'effort', 'expected_impact'],
    },
  },
  quick_wins: {
    _required: true,
    type: 'array',
    items: { type: 'string' },
  },
  stack_specific_notes: {
    type: 'object',
    properties: {
      language: { type: 'string' },
      framework: { type: 'string' },
      database: { type: 'string' },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
  },
  estimated_total_effort: { _required: true, type: 'string' },
  expected_improvement: {
    _required: true,
    type: 'object',
    properties: {
      p95_reduction_percent: { type: 'number' },
      error_rate_reduction_percent: { type: 'number' },
      throughput_increase_percent: { type: 'number' },
      confidence: confidenceScore,
    },
  },
});

// ---------------------------------------------------------------------------
// Schema registry — keyed by agent name
// ---------------------------------------------------------------------------

export const AGENT_SCHEMAS = {
  'workload-analyst': workloadAnalystSchema,
  'test-designer': testDesignerSchema,
  'script-generator': scriptGeneratorSchema,
  'metric-analyst': metricAnalystSchema,
  'trace-correlator-agent': traceCorrelatorSchema,
  'infra-correlator-agent': infraCorrelatorSchema,
  'regression-judge': regressionJudgeSchema,
  'slo-judge': sloJudgeSchema,
  'executive-synthesiser': executiveSynthesiserSchema,
  'remediation-coach': remediationCoachSchema,
};

// ---------------------------------------------------------------------------
// Lightweight validator — returns { valid, errors }
// ---------------------------------------------------------------------------

export function validateAgentOutput(agentName, output) {
  const schema = AGENT_SCHEMAS[agentName];
  if (!schema) return { valid: false, errors: [`Unknown agent: ${agentName}`] };
  return validateObject(output, schema, '');
}

function validateObject(obj, schema, path) {
  const errors = [];

  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, errors: [`${path || 'root'}: expected object, got ${typeof obj}`] };
  }

  for (const field of schema.required || []) {
    if (obj[field] === undefined || obj[field] === null) {
      errors.push(`${path}.${field}: required field missing`);
    }
  }

  for (const [key, propSchema] of Object.entries(schema.properties || {})) {
    const val = obj[key];
    if (val === undefined || val === null) continue;

    if (propSchema.type === 'string' && typeof val !== 'string') {
      errors.push(`${path}.${key}: expected string, got ${typeof val}`);
    } else if (propSchema.type === 'number' && typeof val !== 'number') {
      errors.push(`${path}.${key}: expected number, got ${typeof val}`);
    } else if (propSchema.type === 'boolean' && typeof val !== 'boolean') {
      errors.push(`${path}.${key}: expected boolean, got ${typeof val}`);
    } else if (propSchema.type === 'array' && !Array.isArray(val)) {
      errors.push(`${path}.${key}: expected array, got ${typeof val}`);
    } else if (propSchema.type === 'object' && propSchema.properties && typeof val === 'object') {
      const nested = validateObject(val, propSchema, `${path}.${key}`);
      errors.push(...nested.errors);
    }

    if (propSchema.enum && !propSchema.enum.includes(val)) {
      errors.push(`${path}.${key}: value "${val}" not in enum [${propSchema.enum.join(', ')}]`);
    }
    if (propSchema.minimum !== undefined && typeof val === 'number' && val < propSchema.minimum) {
      errors.push(`${path}.${key}: ${val} < minimum ${propSchema.minimum}`);
    }
    if (propSchema.maximum !== undefined && typeof val === 'number' && val > propSchema.maximum) {
      errors.push(`${path}.${key}: ${val} > maximum ${propSchema.maximum}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Schema-as-text for prompt injection (retry hints)
// ---------------------------------------------------------------------------

export function schemaToPromptHint(agentName) {
  const schema = AGENT_SCHEMAS[agentName];
  if (!schema) return '';
  return `Your output MUST be a JSON object conforming to this schema:\n${JSON.stringify(schema, null, 2)}`;
}
