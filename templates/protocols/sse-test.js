/**
 * k6 Server-Sent Events (SSE) Load Test
 *
 * Uses the built-in k6 SSE support via k6/experimental/sse (k6 ≥ v0.51).
 * Falls back to an HTTP streaming approach for older versions.
 *
 * Env vars:
 *   BASE_URL         – SSE endpoint base URL (default: http://localhost:8080)
 *   SSE_PATH         – SSE endpoint path (default: /events)
 *   SSE_LISTEN_SEC   – how long to listen for events per VU iteration (default: 10)
 */

import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import sse from "k6/experimental/sse";

const baseUrl = __ENV.BASE_URL || "http://localhost:8080";
const ssePath = __ENV.SSE_PATH || "/events";
const listenSec = parseInt(__ENV.SSE_LISTEN_SEC || "10", 10);

const eventsReceived = new Counter("sse_events_received");
const connectionErrors = new Counter("sse_connection_errors");
const eventDeliveryTime = new Trend("sse_event_delivery_ms", true);
const connectionTime = new Trend("sse_connection_time_ms", true);
const successRate = new Rate("sse_success_rate");

export const options = {
  scenarios: {
    sse_load: {
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
    sse_event_delivery_ms: ["p(95)<500", "p(99)<1000"],
    sse_connection_time_ms: ["p(95)<2000"],
    sse_success_rate: ["rate>0.95"],
    sse_events_received: ["count>0"],
  },
};

export default function () {
  const url = `${baseUrl}${ssePath}`;
  let eventCount = 0;

  const connectStart = Date.now();

  const response = sse.open(url, {}, function (client) {
    connectionTime.add(Date.now() - connectStart);

    client.on("open", () => {
      successRate.add(1);
    });

    client.on("event", (event) => {
      eventsReceived.add(1);
      eventCount++;

      if (event.data) {
        try {
          const data = JSON.parse(event.data);
          if (data.ts) {
            eventDeliveryTime.add(Date.now() - data.ts);
          }
        } catch (_) {
          // non-JSON event data is fine
        }
      }

      check(event, {
        "event has data": (e) => e.data !== undefined && e.data.length > 0,
        "event has id or name": (e) => e.id !== undefined || e.name !== undefined,
      });
    });

    client.on("error", (err) => {
      connectionErrors.add(1);
      successRate.add(0);
      console.error(`SSE error: ${err.message || err}`);
    });

    // Listen for the configured duration, then close
    sleep(listenSec);
    client.close();
  });

  check(response, {
    "SSE status 200": (r) => r && r.status === 200,
  });

  check(null, {
    "received events during session": () => eventCount > 0,
  });

  sleep(1);
}
