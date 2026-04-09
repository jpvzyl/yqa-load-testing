export function importHAR(harContent) {
  let har;
  try {
    har = typeof harContent === 'string' ? JSON.parse(harContent) : harContent;
  } catch (err) {
    throw new Error(`Invalid HAR file: ${err.message}`);
  }

  const entries = har.log?.entries || [];
  if (entries.length === 0) throw new Error('HAR file contains no entries');

  const filtered = entries.filter(entry => {
    const url = entry.request?.url || '';
    const mime = entry.response?.content?.mimeType || '';
    return !url.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)(\?|$)/i)
      && !mime.match(/^(image|font|text\/css|application\/javascript)/);
  });

  const requests = (filtered.length > 0 ? filtered : entries).map(entry => parseEntry(entry));
  const baseUrl = detectBaseUrl(requests);
  const correlations = detectCorrelations(requests);

  const script = generateK6Script(requests, baseUrl, correlations);
  const config = {
    target_url: baseUrl,
    endpoints: requests.map(r => ({
      method: r.method,
      url: r.url,
      name: r.name,
      headers: r.headers,
      body: r.body,
      think_time: r.thinkTime,
    })),
    vus: 10,
    duration: '60s',
  };

  return {
    script,
    config,
    metadata: {
      total_entries: entries.length,
      filtered_entries: requests.length,
      base_url: baseUrl,
      pages: har.log?.pages?.length || 0,
      correlations_detected: correlations.length,
      browser: har.log?.browser?.name || 'Unknown',
    },
  };
}

function parseEntry(entry) {
  const req = entry.request;
  const url = req.url;
  const method = req.method.toUpperCase();
  const parsedUrl = new URL(url);

  const skipHeaders = new Set([
    'host', 'connection', 'accept-encoding', 'user-agent', 'referer',
    'origin', 'cookie', 'sec-ch-ua', 'sec-fetch-mode', 'sec-fetch-dest',
    'sec-fetch-site', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
    'upgrade-insecure-requests', 'cache-control', 'pragma',
  ]);

  const headers = {};
  for (const h of req.headers || []) {
    if (!skipHeaders.has(h.name.toLowerCase()) && !h.name.startsWith(':')) {
      headers[h.name] = h.value;
    }
  }

  let body = null;
  if (req.postData?.text) {
    try {
      body = JSON.parse(req.postData.text);
    } catch {
      body = req.postData.text;
    }
  }

  return {
    url,
    method,
    path: parsedUrl.pathname,
    name: `${method} ${parsedUrl.pathname}`,
    headers,
    body,
    thinkTime: entry.time ? Math.max(0.5, Math.min(5, entry.time / 1000)) : 1,
    responseStatus: entry.response?.status,
    responseSize: entry.response?.content?.size || 0,
    startedDateTime: entry.startedDateTime,
  };
}

function detectBaseUrl(requests) {
  if (requests.length === 0) return 'http://localhost:3000';
  const url = new URL(requests[0].url);
  return `${url.protocol}//${url.host}`;
}

function detectCorrelations(requests) {
  const correlations = [];

  for (let i = 0; i < requests.length - 1; i++) {
    const current = requests[i];
    if (!current.body) continue;

    const bodyStr = typeof current.body === 'string' ? current.body : JSON.stringify(current.body);

    for (let j = i + 1; j < requests.length; j++) {
      const future = requests[j];
      const futureUrl = future.url;
      const futureHeaders = JSON.stringify(future.headers);
      const futureBody = future.body ? JSON.stringify(future.body) : '';

      const tokens = bodyStr.match(/[a-zA-Z0-9-_]{20,}/g) || [];
      for (const token of tokens) {
        if (futureUrl.includes(token) || futureHeaders.includes(token) || futureBody.includes(token)) {
          correlations.push({
            source_request: i,
            target_request: j,
            value_preview: token.substring(0, 30),
            type: 'dynamic_value',
          });
          break;
        }
      }
    }
  }

  return correlations;
}

function generateK6Script(requests, baseUrl) {
  const requestBlocks = requests.map((req, i) => {
    const relativeUrl = req.url.replace(baseUrl, '');
    const hasBody = req.body !== null;
    const headersStr = Object.keys(req.headers).length > 0
      ? JSON.stringify(req.headers, null, 4) : '{}';

    if (req.method === 'GET') {
      return `  // Step ${i + 1}: ${req.name}
  {
    const res = http.get(\`\${BASE_URL}${relativeUrl}\`, {
      headers: ${headersStr},
      tags: { name: '${req.name}' },
    });
    check(res, { 'step_${i + 1}_ok': (r) => r.status === ${req.responseStatus || 200} });
    sleep(${req.thinkTime.toFixed(1)});
  }`;
    }

    return `  // Step ${i + 1}: ${req.name}
  {
    const res = http.${req.method.toLowerCase()}(\`\${BASE_URL}${relativeUrl}\`, ${hasBody ? `JSON.stringify(${JSON.stringify(req.body)})` : 'null'}, {
      headers: { ...${headersStr}${hasBody ? ", 'Content-Type': 'application/json'" : ''} },
      tags: { name: '${req.name}' },
    });
    check(res, { 'step_${i + 1}_ok': (r) => r.status >= 200 && r.status < 400 });
    sleep(${req.thinkTime.toFixed(1)});
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
  group('Recorded User Journey', function () {
${requestBlocks.join('\n\n')}
  });
}
`;
}
