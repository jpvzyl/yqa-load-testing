// Breakpoint Test — ramping-arrival-rate to find exact capacity ceiling.
// Increases request rate from 10 to 200 RPS in 10 RPS increments every 2 minutes.
// The system's breaking point is wherever errors spike or latency degrades sharply.
//
// Usage: k6 run breakpoint-test.js
//        k6 run -e BASE_URL=https://api.example.com breakpoint-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const errorRate = new Rate('custom_errors');
const requestDuration = new Trend('custom_request_duration', true);
const ttfb = new Trend('custom_ttfb', true);
const throughput = new Counter('custom_throughput');

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 250,
      maxVUs: 500,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '2m', target: 20 },
        { duration: '2m', target: 30 },
        { duration: '2m', target: 40 },
        { duration: '2m', target: 50 },
        { duration: '2m', target: 60 },
        { duration: '2m', target: 80 },
        { duration: '2m', target: 100 },
        { duration: '2m', target: 120 },
        { duration: '2m', target: 150 },
        { duration: '2m', target: 180 },
        { duration: '2m', target: 200 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.10'],
    custom_errors: ['rate<0.10'],
    custom_request_duration: ['p(95)<1000'],
    custom_ttfb: ['p(95)<600'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/`);

  const passed = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
    'no server errors': (r) => r.status < 500,
  });

  errorRate.add(!passed);
  requestDuration.add(res.timings.duration);
  ttfb.add(res.timings.waiting);
  throughput.add(1);
}
