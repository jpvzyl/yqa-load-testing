export function importPostman(collectionContent) {
  let collection;
  try {
    collection = typeof collectionContent === 'string' ? JSON.parse(collectionContent) : collectionContent;
  } catch (err) {
    throw new Error(`Invalid Postman collection: ${err.message}`);
  }

  const info = collection.info || {};
  const items = flattenItems(collection.item || []);
  const variables = (collection.variable || []).reduce((acc, v) => {
    acc[v.key] = v.value;
    return acc;
  }, {});

  const baseUrl = variables.baseUrl || variables.base_url || detectBaseUrl(items);
  const requests = items.map(item => parseItem(item, variables));

  const script = generateK6Script(requests, baseUrl, info);
  const config = {
    target_url: baseUrl,
    endpoints: requests.map(r => ({
      method: r.method,
      url: r.url,
      name: r.name,
      headers: r.headers,
      body: r.body,
      think_time: 1,
    })),
    vus: 10,
    duration: '60s',
  };

  return {
    script,
    config,
    metadata: {
      collection_name: info.name || 'Unknown',
      collection_id: info._postman_id || 'N/A',
      request_count: requests.length,
      base_url: baseUrl,
      variables: Object.keys(variables),
    },
  };
}

function flattenItems(items) {
  const flat = [];
  for (const item of items) {
    if (item.item) {
      flat.push(...flattenItems(item.item));
    } else if (item.request) {
      flat.push(item);
    }
  }
  return flat;
}

function parseItem(item, variables) {
  const req = item.request;
  const method = (typeof req.method === 'string' ? req.method : 'GET').toUpperCase();

  let url;
  if (typeof req.url === 'string') {
    url = resolveVariables(req.url, variables);
  } else if (req.url?.raw) {
    url = resolveVariables(req.url.raw, variables);
  } else if (req.url?.host && req.url?.path) {
    const host = Array.isArray(req.url.host) ? req.url.host.join('.') : req.url.host;
    const path = Array.isArray(req.url.path) ? req.url.path.join('/') : req.url.path;
    const protocol = req.url.protocol || 'https';
    url = `${protocol}://${host}/${path}`;
    url = resolveVariables(url, variables);
  } else {
    url = 'http://localhost:3000';
  }

  const headers = {};
  for (const h of req.header || []) {
    if (!h.disabled) {
      headers[h.key] = resolveVariables(h.value, variables);
    }
  }

  let body = null;
  if (req.body) {
    if (req.body.mode === 'raw' && req.body.raw) {
      try {
        body = JSON.parse(resolveVariables(req.body.raw, variables));
      } catch {
        body = resolveVariables(req.body.raw, variables);
      }
    } else if (req.body.mode === 'urlencoded') {
      body = (req.body.urlencoded || []).reduce((acc, p) => {
        if (!p.disabled) acc[p.key] = resolveVariables(p.value, variables);
        return acc;
      }, {});
    } else if (req.body.mode === 'formdata') {
      body = (req.body.formdata || []).filter(p => !p.disabled && p.type !== 'file')
        .reduce((acc, p) => { acc[p.key] = resolveVariables(p.value, variables); return acc; }, {});
    }
  }

  return {
    name: item.name || `${method} ${url}`,
    method,
    url,
    headers,
    body,
    tests: item.event?.find(e => e.listen === 'test')?.script?.exec || [],
  };
}

function resolveVariables(str, variables) {
  if (!str) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `\${__ENV.${key}}`);
}

function detectBaseUrl(items) {
  for (const item of items) {
    const req = item.request;
    if (!req) continue;
    let url = typeof req.url === 'string' ? req.url : req.url?.raw || '';
    url = url.replace(/\{\{.*?\}\}/g, 'placeholder');
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch { continue; }
  }
  return 'http://localhost:3000';
}

function generateK6Script(requests, baseUrl, info) {
  const requestBlocks = requests.map((req, i) => {
    const urlPart = req.url.replace(baseUrl, '');
    const hasBody = req.body !== null;
    const headersStr = Object.keys(req.headers).length > 0
      ? JSON.stringify(req.headers, null, 4) : '{}';

    if (req.method === 'GET') {
      return `    // ${req.name}
    {
      const res = http.get(\`\${BASE_URL}${urlPart}\`, {
        headers: ${headersStr},
        tags: { name: '${sanitize(req.name)}' },
      });
      check(res, { '${sanitize(req.name)}_ok': (r) => r.status >= 200 && r.status < 400 });
      sleep(1);
    }`;
    }

    return `    // ${req.name}
    {
      const res = http.${req.method.toLowerCase()}(\`\${BASE_URL}${urlPart}\`, ${hasBody ? `JSON.stringify(${JSON.stringify(req.body)})` : 'null'}, {
        headers: { ...${headersStr}${hasBody ? ", 'Content-Type': 'application/json'" : ''} },
        tags: { name: '${sanitize(req.name)}' },
      });
      check(res, { '${sanitize(req.name)}_ok': (r) => r.status >= 200 && r.status < 400 });
      sleep(1);
    }`;
  });

  return `import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE_URL = '${baseUrl}';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '2m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  group('${info.name || 'Postman Collection'} Load Test', function () {
${requestBlocks.join('\n\n')}
  });
}
`;
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
}
