import * as dbv2 from './db-v2.js';

export class WorkloadModeler {
  buildCompositeScript(model) {
    const scenarios = model.scenario_mix || [];
    if (scenarios.length === 0) throw new Error('Workload model has no scenarios');

    const totalWeight = scenarios.reduce((sum, s) => sum + (s.weight || 1), 0);

    let script = `import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const scenarioLatency = new Trend('scenario_latency');

export const options = {
  scenarios: {
`;

    for (const scenario of scenarios) {
      const ratio = (scenario.weight || 1) / totalWeight;
      const stages = model.stages || [
        { duration: '30s', target: Math.round(model.global_config?.vus * ratio || 10) },
        { duration: model.global_config?.duration || '5m', target: Math.round(model.global_config?.vus * ratio || 10) },
        { duration: '10s', target: 0 },
      ];

      script += `    '${this.sanitizeName(scenario.name)}': {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: ${JSON.stringify(stages)},
      exec: '${this.sanitizeName(scenario.name)}',
      tags: { scenario: '${scenario.name}' },
    },
`;
    }

    script += `  },
  thresholds: {
    'http_req_duration': ['p(95)<${model.global_config?.p95_threshold || 500}'],
    'errors': ['rate<${model.global_config?.error_rate_threshold || 0.01}'],
`;

    for (const scenario of scenarios) {
      script += `    'scenario_latency{scenario:${scenario.name}}': ['p(95)<${scenario.p95_threshold || model.global_config?.p95_threshold || 500}'],
`;
    }

    script += `  },
};

`;

    for (const scenario of scenarios) {
      script += this.generateScenarioFunction(scenario);
    }

    return script;
  }

  generateScenarioFunction(scenario) {
    const funcName = this.sanitizeName(scenario.name);
    const thinkTime = scenario.think_time || '1-3';
    const [thinkMin, thinkMax] = thinkTime.toString().split('-').map(Number);

    let body = '';

    if (scenario.script_content) {
      body = scenario.script_content;
    } else if (scenario.endpoints) {
      for (const ep of scenario.endpoints) {
        body += `  group('${ep.name || ep.url}', () => {\n`;
        body += `    const start = Date.now();\n`;

        if (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH') {
          body += `    const res = http.${ep.method.toLowerCase()}(\`\${__ENV.BASE_URL}${ep.url}\`, ${ep.body ? JSON.stringify(ep.body) : 'null'}, {
      headers: ${JSON.stringify(ep.headers || { 'Content-Type': 'application/json' })},
      tags: { endpoint: '${ep.url}' },
    });\n`;
        } else {
          body += `    const res = http.get(\`\${__ENV.BASE_URL}${ep.url}\`, {
      headers: ${JSON.stringify(ep.headers || {})},
      tags: { endpoint: '${ep.url}' },
    });\n`;
        }

        body += `    check(res, { '${ep.name || ep.url} status 2xx': r => r.status >= 200 && r.status < 300 });\n`;
        body += `    errorRate.add(res.status >= 400);\n`;
        body += `    scenarioLatency.add(Date.now() - start, { scenario: '${scenario.name}' });\n`;
        body += `  });\n`;
        body += `  sleep(${thinkMin + Math.random() * ((thinkMax || thinkMin) - thinkMin)});\n\n`;
      }
    } else {
      body = `  const res = http.get(\`\${__ENV.BASE_URL}${scenario.target_url || '/'}\`);\n`;
      body += `  check(res, { 'status 2xx': r => r.status >= 200 && r.status < 300 });\n`;
      body += `  sleep(${thinkMin});\n`;
    }

    return `export function ${funcName}() {
${body}
}

`;
  }

  sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  }

  async createFromSpec(projectId, spec) {
    const scenarios = [];
    for (const scenarioDef of spec.scenarios || []) {
      let scenario;
      if (scenarioDef.scenario_id) {
        scenario = await dbv2.getScenarioById(scenarioDef.scenario_id);
      } else {
        scenario = await dbv2.createScenario({
          project_id: projectId,
          name: scenarioDef.name,
          description: scenarioDef.description,
          protocol: scenarioDef.protocol || 'http',
          script_content: scenarioDef.script || '',
          config: scenarioDef.config || {},
        });
      }
      scenarios.push({
        scenario_id: scenario.id,
        name: scenarioDef.name || scenario.name,
        weight: scenarioDef.weight || 1,
        think_time: scenarioDef.think_time || '1-3',
        endpoints: scenarioDef.endpoints,
        script_content: scenario.script_content,
        p95_threshold: scenarioDef.p95_threshold,
      });
    }

    const model = await dbv2.createWorkloadModel({
      project_id: projectId,
      test_id: spec.test_id,
      name: spec.name,
      description: spec.description,
      scenario_mix: scenarios,
      global_config: spec.global_config || {},
      stages: spec.stages || [],
      regions: spec.regions || [],
      created_by: spec.created_by,
    });

    return model;
  }

  validateModel(model) {
    const errors = [];
    const mix = model.scenario_mix || [];

    if (mix.length === 0) errors.push('No scenarios defined');

    const totalWeight = mix.reduce((sum, s) => sum + (s.weight || 0), 0);
    if (totalWeight <= 0) errors.push('Total scenario weight must be > 0');

    for (const s of mix) {
      if (!s.name) errors.push('Each scenario needs a name');
      if ((s.weight || 0) < 0) errors.push(`Scenario "${s.name}" has negative weight`);
    }

    const names = mix.map(s => s.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) errors.push(`Duplicate scenario names: ${dupes.join(', ')}`);

    return { valid: errors.length === 0, errors };
  }

  describeModel(model) {
    const mix = model.scenario_mix || [];
    const totalWeight = mix.reduce((sum, s) => sum + (s.weight || 1), 0);

    return {
      name: model.name,
      total_scenarios: mix.length,
      distribution: mix.map(s => ({
        name: s.name,
        weight: s.weight || 1,
        percentage: ((s.weight || 1) / totalWeight * 100).toFixed(1) + '%',
        think_time: s.think_time || '1-3s',
        endpoints: s.endpoints?.length || 0,
      })),
      global: {
        vus: model.global_config?.vus,
        duration: model.global_config?.duration,
        regions: model.regions || [],
      },
    };
  }
}

export const workloadModeler = new WorkloadModeler();
