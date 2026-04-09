import YAML from 'yaml';

export function importOpenAPI(specContent) {
  let spec;
  try {
    spec = JSON.parse(specContent);
  } catch {
    spec = YAML.parse(specContent);
  }

  const baseUrl = extractBaseUrl(spec);
  const endpoints = extractEndpoints(spec);
  const authScheme = detectAuth(spec);

  const script = generateK6Script(baseUrl, endpoints, authScheme, spec.info);
  const config = {
    target_url: baseUrl,
    endpoints: endpoints.map(ep => ({
      method: ep.method.toUpperCase(),
      url: `${baseUrl}${ep.path}`,
      name: ep.operationId || `${ep.method}_${ep.path}`,
      headers: ep.headers || {},
      body: ep.requestBody || null,
      think_time: 1,
    })),
    vus: 10,
    duration: '60s',
  };

  return {
    script,
    config,
    metadata: {
      spec_title: spec.info?.title || 'Unknown API',
      spec_version: spec.info?.version || '1.0',
      endpoint_count: endpoints.length,
      auth_type: authScheme?.type || 'none',
      base_url: baseUrl,
    },
  };
}

function extractBaseUrl(spec) {
  if (spec.servers?.length > 0) {
    return spec.servers[0].url.replace(/\/$/, '');
  }
  if (spec.host) {
    const scheme = spec.schemes?.[0] || 'https';
    const basePath = spec.basePath || '';
    return `${scheme}://${spec.host}${basePath}`.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}

function extractEndpoints(spec) {
  const endpoints = [];
  const paths = spec.paths || {};

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
        const endpoint = {
          path,
          method: method.toLowerCase(),
          operationId: operation.operationId || `${method}_${path.replace(/[{}\/]/g, '_')}`,
          summary: operation.summary || '',
          parameters: operation.parameters || [],
          requestBody: null,
          headers: {},
          responses: operation.responses || {},
        };

        if (operation.requestBody?.content) {
          const jsonContent = operation.requestBody.content['application/json'];
          if (jsonContent?.schema) {
            endpoint.requestBody = generateSampleBody(jsonContent.schema, spec);
          }
        }

        if (operation.parameters) {
          for (const param of operation.parameters) {
            if (param.in === 'header') {
              endpoint.headers[param.name] = generateSampleValue(param.schema || param);
            }
          }
        }

        endpoints.push(endpoint);
      }
    }
  }

  return endpoints;
}

function detectAuth(spec) {
  const securitySchemes = spec.components?.securitySchemes || spec.securityDefinitions || {};

  for (const [name, scheme] of Object.entries(securitySchemes)) {
    if (scheme.type === 'http' && scheme.scheme === 'bearer') {
      return { type: 'bearer', name };
    }
    if (scheme.type === 'apiKey') {
      return { type: 'apiKey', name: scheme.name, in: scheme.in };
    }
    if (scheme.type === 'oauth2') {
      return { type: 'oauth2', name };
    }
  }
  return null;
}

function generateK6Script(baseUrl, endpoints, authScheme, info) {
  const authSetup = authScheme ? generateAuthCode(authScheme) : '';
  const imports = `import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';`;

  const options = `export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.01'],
  },
};`;

  const endpointFunctions = endpoints.map(ep => {
    const tag = ep.operationId || `${ep.method}_${ep.path}`;
    const pathWithParams = ep.path.replace(/\{(\w+)\}/g, '${params.$1}');
    const hasParams = ep.path.includes('{');
    const paramsLine = hasParams ? `  const params = { ${ep.parameters.filter(p => p.in === 'path').map(p => `${p.name}: '1'`).join(', ')} };` : '';
    const url = hasParams ? `\`${baseUrl}${pathWithParams}\`` : `'${baseUrl}${ep.path}'`;

    if (ep.method === 'get') {
      return `    // ${ep.summary || tag}
${paramsLine ? paramsLine + '\n' : ''}    const ${sanitize(tag)} = http.get(${url}, { headers, tags: { name: '${tag}' } });
    check(${sanitize(tag)}, { '${tag} ok': (r) => r.status >= 200 && r.status < 400 });
    sleep(1);`;
    }

    const body = ep.requestBody ? JSON.stringify(ep.requestBody) : 'null';
    return `    // ${ep.summary || tag}
${paramsLine ? paramsLine + '\n' : ''}    const ${sanitize(tag)} = http.${ep.method}(${url}, JSON.stringify(${body}), { headers: { ...headers, 'Content-Type': 'application/json' }, tags: { name: '${tag}' } });
    check(${sanitize(tag)}, { '${tag} ok': (r) => r.status >= 200 && r.status < 400 });
    sleep(1);`;
  });

  return `${imports}

const BASE_URL = '${baseUrl}';
const errorRate = new Rate('errors');

${options}

${authSetup}

export default function () {
  const headers = ${authScheme?.type === 'bearer' ? "{ Authorization: 'Bearer ' + __ENV.AUTH_TOKEN }" : authScheme?.type === 'apiKey' ? `{ '${authScheme.name}': __ENV.API_KEY }` : '{}'};

  group('${info?.title || 'API'} Load Test', function () {
${endpointFunctions.join('\n\n')}
  });
}
`;
}

function generateAuthCode(authScheme) {
  if (authScheme.type === 'bearer') {
    return `// Set AUTH_TOKEN environment variable or replace with token acquisition logic
// export AUTH_TOKEN=your-token-here`;
  }
  if (authScheme.type === 'apiKey') {
    return `// Set API_KEY environment variable
// export API_KEY=your-api-key-here`;
  }
  return '';
}

function generateSampleBody(schema, spec) {
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/components/schemas/', '').replace('#/definitions/', '');
    schema = spec.components?.schemas?.[refPath] || spec.definitions?.[refPath] || schema;
  }

  if (schema.example) return schema.example;

  const obj = {};
  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      obj[name] = generateSampleValue(prop);
    }
  }
  return obj;
}

function generateSampleValue(schema) {
  if (schema.example) return schema.example;
  if (schema.default) return schema.default;

  switch (schema.type) {
    case 'string':
      if (schema.format === 'email') return 'test@example.com';
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000001';
      if (schema.enum) return schema.enum[0];
      return 'string_value';
    case 'integer':
    case 'number':
      return schema.minimum || 1;
    case 'boolean':
      return true;
    case 'array':
      return [generateSampleValue(schema.items || { type: 'string' })];
    default:
      return 'value';
  }
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '').substring(0, 30) || 'res';
}
