// Spike Test — sudden traffic bursts to verify auto-scaling and recovery.
// Two spikes with calm periods between to observe system behavior under
// abrupt load changes and whether it recovers gracefully.
//
// Usage: k6 run spike-test.js
//        k6 run -e BASE_URL=https://api.example.com spike-test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const errorRate = new Rate('custom_errors');
const requestDuration = new Trend('custom_request_duration', true);
const spikeRecoveryTime = new Trend('spike_recovery_time', true);

export const options = {
  stages: [
    { duration: '1m', target: 5 },    // low baseline
    { duration: '10s', target: 200 },  // spike #1
    { duration: '30s', target: 200 },  // hold spike
    { duration: '10s', target: 5 },    // drop back
    { duration: '2m', target: 5 },     // recovery period
    { duration: '10s', target: 300 },  // spike #2 (larger)
    { duration: '30s', target: 300 },  // hold spike
    { duration: '10s', target: 5 },    // drop back
    { duration: '1m', target: 5 },     // final recovery
    { duration: '15s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.10'],
    custom_errors: ['rate<0.10'],
    spike_recovery_time: ['p(95)<1500'],
  },
};

export default function () {
  group('Spike target', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/`);
    const elapsed = Date.now() - start;

    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 2000ms': (r) => r.timings.duration < 2000,
      'no server errors': (r) => r.status < 500,
    });

    errorRate.add(!passed);
    requestDuration.add(res.timings.duration);
    spikeRecoveryTime.add(elapsed);
  });

  sleep(Math.random() * 0.5 + 0.1);
}
