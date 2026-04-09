// REST API CRUD Test — full create → read → update → delete lifecycle.
// Uses response data correlation to chain requests (extract ID from create).
// Realistic think times between operations.
//
// Usage: k6 run api-crud.js
//        k6 run -e BASE_URL=https://api.example.com -e API_TOKEN=xxx api-crud.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_TOKEN = __ENV.API_TOKEN || '';

const errorRate = new Rate('custom_errors');
const createDuration = new Trend('create_duration', true);
const readDuration = new Trend('read_duration', true);
const updateDuration = new Trend('update_duration', true);
const deleteDuration = new Trend('delete_duration', true);

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.02'],
    custom_errors: ['rate<0.02'],
    create_duration: ['p(95)<600'],
    read_duration: ['p(95)<300'],
    update_duration: ['p(95)<600'],
    delete_duration: ['p(95)<600'],
  },
};

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (API_TOKEN) h['Authorization'] = `Bearer ${API_TOKEN}`;
  return h;
}

export default function () {
  let resourceId;

  // --- CREATE ---
  group('Create resource', () => {
    const payload = JSON.stringify({
      name: `item-${Date.now()}-${__VU}`,
      description: 'Load test item',
      value: Math.floor(Math.random() * 1000),
    });

    const res = http.post(`${BASE_URL}/api/resources`, payload, { headers: headers() });

    const passed = check(res, {
      'create: status is 201 or 200': (r) => r.status === 201 || r.status === 200,
      'create: has id in response': (r) => {
        try {
          const body = JSON.parse(r.body);
          return !!body.id;
        } catch (_) {
          return false;
        }
      },
    });

    errorRate.add(!passed);
    createDuration.add(res.timings.duration);

    try {
      const body = JSON.parse(res.body);
      resourceId = body.id;
    } catch (_) {
      // correlation failed — subsequent steps will be skipped
    }
  });

  sleep(Math.random() * 1 + 0.5);

  if (!resourceId) return;

  // --- READ ---
  group('Read resource', () => {
    const res = http.get(`${BASE_URL}/api/resources/${resourceId}`, { headers: headers() });

    const passed = check(res, {
      'read: status is 200': (r) => r.status === 200,
      'read: correct id': (r) => {
        try {
          return JSON.parse(r.body).id === resourceId;
        } catch (_) {
          return false;
        }
      },
    });

    errorRate.add(!passed);
    readDuration.add(res.timings.duration);
  });

  sleep(Math.random() * 1 + 0.5);

  // --- UPDATE ---
  group('Update resource', () => {
    const payload = JSON.stringify({
      name: `updated-${Date.now()}`,
      value: Math.floor(Math.random() * 9999),
    });

    const res = http.put(`${BASE_URL}/api/resources/${resourceId}`, payload, { headers: headers() });

    const passed = check(res, {
      'update: status is 200': (r) => r.status === 200,
      'update: body reflects change': (r) => {
        try {
          return JSON.parse(r.body).name.startsWith('updated-');
        } catch (_) {
          return false;
        }
      },
    });

    errorRate.add(!passed);
    updateDuration.add(res.timings.duration);
  });

  sleep(Math.random() * 1 + 0.5);

  // --- DELETE ---
  group('Delete resource', () => {
    const res = http.del(`${BASE_URL}/api/resources/${resourceId}`, null, { headers: headers() });

    const passed = check(res, {
      'delete: status is 200 or 204': (r) => r.status === 200 || r.status === 204,
    });

    errorRate.add(!passed);
    deleteDuration.add(res.timings.duration);
  });

  // Verify deletion
  group('Verify deletion', () => {
    const res = http.get(`${BASE_URL}/api/resources/${resourceId}`, { headers: headers() });

    check(res, {
      'verify: status is 404': (r) => r.status === 404,
    });
  });

  sleep(Math.random() * 1.5 + 0.5);
}
