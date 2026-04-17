/**
 * k6 HTTP/3 (QUIC) Load Test
 *
 * Requires: xk6-quic extension
 * Build:    xk6 build --with github.com/nicholasgasior/xk6-quic
 *
 * Env vars:
 *   BASE_URL      – target HTTP/3 server URL (default: https://localhost:443)
 *   REQUEST_PATH  – path to request (default: /)
 *   PAYLOAD_SIZE  – POST body size in bytes for write tests (default: 1024)
 */

import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import quic from "k6/x/quic";

const baseUrl = __ENV.BASE_URL || "https://localhost:443";
const requestPath = __ENV.REQUEST_PATH || "/";
const payloadSize = parseInt(__ENV.PAYLOAD_SIZE || "1024", 10);

const requestsSent = new Counter("http3_requests_total");
const requestLatency = new Trend("http3_request_latency_ms", true);
const handshakeTime = new Trend("http3_handshake_ms", true);
const ttfbTrend = new Trend("http3_ttfb_ms", true);
const successRate = new Rate("http3_success_rate");
const bytesReceived = new Counter("http3_bytes_received");

export const options = {
  scenarios: {
    http3_load: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "20s", target: 10 },
        { duration: "1m", target: 30 },
        { duration: "1m", target: 30 },
        { duration: "20s", target: 0 },
      ],
    },
  },
  thresholds: {
    http3_request_latency_ms: ["p(95)<500", "p(99)<1000"],
    http3_handshake_ms: ["p(95)<300"],
    http3_ttfb_ms: ["p(95)<400", "p(99)<800"],
    http3_success_rate: ["rate>0.95"],
  },
};

function generatePayload(size) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function () {
  const url = `${baseUrl}${requestPath}`;

  // --- HTTP/3 GET ---
  const hsStart = Date.now();
  const conn = quic.open(baseUrl, { insecureSkipVerify: true });
  handshakeTime.add(Date.now() - hsStart);

  let reqStart = Date.now();
  const getResp = conn.get(requestPath);
  const latency = Date.now() - reqStart;

  requestLatency.add(latency);
  ttfbTrend.add(latency);
  requestsSent.add(1);

  const getSuccess = getResp && getResp.status >= 200 && getResp.status < 400;
  successRate.add(getSuccess ? 1 : 0);

  if (getResp && getResp.body) {
    bytesReceived.add(getResp.body.length);
  }

  check(getResp, {
    "GET status 2xx/3xx": (r) => r && r.status >= 200 && r.status < 400,
    "GET has body": (r) => r && r.body && r.body.length > 0,
  });

  // --- HTTP/3 POST ---
  const payload = generatePayload(payloadSize);

  reqStart = Date.now();
  const postResp = conn.post(requestPath, payload, {
    "Content-Type": "application/octet-stream",
  });
  requestLatency.add(Date.now() - reqStart);
  requestsSent.add(1);

  const postSuccess = postResp && postResp.status >= 200 && postResp.status < 400;
  successRate.add(postSuccess ? 1 : 0);

  check(postResp, {
    "POST status 2xx/3xx": (r) => r && r.status >= 200 && r.status < 400,
  });

  conn.close();
  sleep(0.3);
}
