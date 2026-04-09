// Stress Test — progressive ramp through increasing VU levels.
// Finds the ceiling where errors begin and response times degrade.
//
// Usage: k6 run stress-test.js
//        k6 run -e BASE_URL=https://api.example.com stress-test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const errorRate = new Rate('custom_errors');
const requestDuration = new Trend('custom_request_duration', true);
const ttfb = new Trend('custom_ttfb', true);

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // warm-up
    { duration: '2m', target: 25 },   // below normal
    { duration: '2m', target: 50 },   // normal load
    { duration: '2m', target: 100 },  // above normal
    { duration: '2m', target: 150 },  // high stress
    { duration: '2m', target: 200 },  // peak stress
    { duration: '2m', target: 0 },    // recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
    custom_errors: ['rate<0.05'],
    custom_request_duration: ['p(95)<800'],
    custom_ttfb: ['p(95)<500'],
  },
};

export default function () {
  group('Stress endpoint', () => {
    const res = http.get(`${BASE_URL}/`);

    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 800ms': (r) => r.timings.duration < 800,
      'body is not empty': (r) => r.body && r.body.length > 0,
      'no server errors': (r) => r.status < 500,
    });

    errorRate.add(!passed);
    requestDuration.add(res.timings.duration);
    ttfb.add(res.timings.waiting);
  });

  sleep(Math.random() * 1.5 + 0.5);
}
