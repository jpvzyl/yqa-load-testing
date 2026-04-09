// Standard Load Test — ramp up to 50 VUs, hold steady, ramp down.
// Validates that the system handles expected production traffic within SLA.
//
// Usage: k6 run load-test.js
//        k6 run -e BASE_URL=https://api.example.com load-test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const errorRate = new Rate('custom_errors');
const requestDuration = new Trend('custom_request_duration', true);
const ttfb = new Trend('custom_ttfb', true);

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // ramp up
    { duration: '2m', target: 50 },   // hold steady
    { duration: '15s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    custom_errors: ['rate<0.01'],
    custom_request_duration: ['p(95)<500'],
    custom_ttfb: ['p(95)<300'],
  },
};

export default function () {
  group('GET request', () => {
    const res = http.get(`${BASE_URL}/`);

    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500,
      'body is not empty': (r) => r.body && r.body.length > 0,
      'no server errors': (r) => r.status < 500,
    });

    errorRate.add(!passed);
    requestDuration.add(res.timings.duration);
    ttfb.add(res.timings.waiting);
  });

  sleep(Math.random() * 2 + 0.5); // 0.5–2.5s think time
}
