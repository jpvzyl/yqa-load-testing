// Soak / Endurance Test — sustained load over an extended period.
// Detects memory leaks, connection pool exhaustion, file descriptor leaks,
// cache overflow, and gradual performance degradation.
//
// Duration is configurable: k6 run -e SOAK_DURATION=60m soak-test.js
//
// Usage: k6 run soak-test.js
//        k6 run -e BASE_URL=https://api.example.com -e SOAK_DURATION=60m soak-test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SOAK_DURATION = __ENV.SOAK_DURATION || '30m';

const errorRate = new Rate('custom_errors');
const requestDuration = new Trend('custom_request_duration', true);
const ttfb = new Trend('custom_ttfb', true);
const totalRequests = new Counter('custom_total_requests');

export const options = {
  stages: [
    { duration: '2m', target: 50 },          // ramp up
    { duration: SOAK_DURATION, target: 50 },  // sustained load
    { duration: '1m', target: 0 },            // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<600', 'p(99)<1200'],
    http_req_failed: ['rate<0.01'],
    custom_errors: ['rate<0.01'],
    custom_request_duration: ['p(95)<600'],
    custom_ttfb: ['p(95)<400'],
  },
};

export default function () {
  group('Soak target', () => {
    const res = http.get(`${BASE_URL}/`);

    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 600ms': (r) => r.timings.duration < 600,
      'body is not empty': (r) => r.body && r.body.length > 0,
      'no server errors': (r) => r.status < 500,
    });

    errorRate.add(!passed);
    requestDuration.add(res.timings.duration);
    ttfb.add(res.timings.waiting);
    totalRequests.add(1);
  });

  sleep(Math.random() * 2 + 1); // 1–3s think time to simulate realistic sustained traffic
}
