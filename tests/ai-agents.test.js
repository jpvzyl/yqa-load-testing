import { describe, it, expect } from 'vitest';
import { AGENT_SCHEMAS, validateAgentOutput } from '../ai-agents/schemas.js';

describe('Agent schemas registry', () => {
  const expectedAgents = [
    'workload-analyst', 'test-designer', 'script-generator', 'metric-analyst',
    'trace-correlator-agent', 'infra-correlator-agent', 'regression-judge',
    'slo-judge', 'executive-synthesiser', 'remediation-coach',
  ];

  it('contains all 10 agent schemas', () => {
    expect(Object.keys(AGENT_SCHEMAS)).toHaveLength(10);
    for (const name of expectedAgents) {
      expect(AGENT_SCHEMAS).toHaveProperty(name);
    }
  });

  it('each schema has required "type" and "properties" fields', () => {
    for (const [name, schema] of Object.entries(AGENT_SCHEMAS)) {
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(typeof schema.properties).toBe('object');
      expect(schema.title).toBeDefined();
    }
  });

  it('each schema has a non-empty required array', () => {
    for (const [name, schema] of Object.entries(AGENT_SCHEMAS)) {
      expect(Array.isArray(schema.required)).toBe(true);
      expect(schema.required.length).toBeGreaterThan(0);
    }
  });
});

describe('validateAgentOutput', () => {
  it('validates correct metric-analyst output', () => {
    const output = {
      performance_grade: 'A',
      overall_score: 85,
      executive_headline: 'System performs well under load',
      bottlenecks: [{ component: 'db', severity: 'medium', confidence: 0.8, evidence: 'slow queries' }],
      anomalies: [{ description: 'Spike at 5min', confidence: 0.7 }],
      error_analysis: { dominant_errors: ['timeout'] },
      response_time_analysis: { p50_assessment: 'Good' },
      throughput_analysis: { peak_rps: 1200 },
      quick_wins: ['Add connection pooling'],
    };
    const result = validateAgentOutput('metric-analyst', output);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects output missing required fields', () => {
    const output = {
      performance_grade: 'B',
      // missing: overall_score, executive_headline, bottlenecks, anomalies, etc.
    };
    const result = validateAgentOutput('metric-analyst', output);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('required field missing'))).toBe(true);
  });

  it('rejects unknown agent name', () => {
    const result = validateAgentOutput('nonexistent-agent', {});
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Unknown agent');
  });

  it('validates regression-judge output structure', () => {
    const output = {
      has_regression: false,
      overall_verdict: 'PASS',
      regression_calls: [],
      trend_direction: 'stable',
      summary: 'No regressions detected.',
    };
    const result = validateAgentOutput('regression-judge', output);
    expect(result.valid).toBe(true);
  });
});
