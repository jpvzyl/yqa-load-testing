/**
 * k6 GraphQL Subscription Load Test (over WebSocket)
 *
 * Tests GraphQL subscriptions using the graphql-ws protocol (graphql-transport-ws).
 * Uses the built-in k6 WebSocket module.
 *
 * Env vars:
 *   WS_URL            – WebSocket endpoint (default: ws://localhost:4000/graphql)
 *   GQL_SUB_QUERY     – subscription query (default: a generic subscription)
 *   GQL_LISTEN_SEC    – seconds to listen for events (default: 15)
 *   GQL_AUTH_TOKEN    – optional bearer token for connection_init payload
 */

import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import ws from "k6/ws";

const wsUrl = __ENV.WS_URL || "ws://localhost:4000/graphql";
const listenSec = parseInt(__ENV.GQL_LISTEN_SEC || "15", 10);
const authToken = __ENV.GQL_AUTH_TOKEN || "";

const subscriptionQuery =
  __ENV.GQL_SUB_QUERY ||
  `subscription { onEvent { id type payload timestamp } }`;

const eventsReceived = new Counter("gql_sub_events_received");
const subscriptionErrors = new Counter("gql_sub_errors");
const eventLatency = new Trend("gql_sub_event_latency_ms", true);
const connectionTime = new Trend("gql_sub_connection_time_ms", true);
const successRate = new Rate("gql_sub_success_rate");

export const options = {
  scenarios: {
    graphql_subs: {
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
    gql_sub_event_latency_ms: ["p(95)<500", "p(99)<1000"],
    gql_sub_connection_time_ms: ["p(95)<2000"],
    gql_sub_success_rate: ["rate>0.90"],
    gql_sub_events_received: ["count>0"],
  },
};

export default function () {
  const connectStart = Date.now();

  const res = ws.connect(
    wsUrl,
    { headers: { "Sec-WebSocket-Protocol": "graphql-transport-ws" } },
    function (socket) {
      let eventCount = 0;
      const subId = `sub-${__VU}-${__ITER}`;

      socket.on("open", () => {
        connectionTime.add(Date.now() - connectStart);

        // graphql-ws: connection_init
        const initPayload = authToken
          ? { type: "connection_init", payload: { Authorization: `Bearer ${authToken}` } }
          : { type: "connection_init", payload: {} };
        socket.send(JSON.stringify(initPayload));
      });

      socket.on("message", (msg) => {
        const data = JSON.parse(msg);

        switch (data.type) {
          case "connection_ack":
            // Subscribe after connection is acknowledged
            socket.send(
              JSON.stringify({
                id: subId,
                type: "subscribe",
                payload: { query: subscriptionQuery },
              }),
            );
            successRate.add(1);
            break;

          case "next":
            eventsReceived.add(1);
            eventCount++;
            if (data.payload?.data) {
              const event = Object.values(data.payload.data)[0];
              if (event?.timestamp) {
                eventLatency.add(Date.now() - new Date(event.timestamp).getTime());
              }
            }
            break;

          case "error":
            subscriptionErrors.add(1);
            successRate.add(0);
            console.error(`GraphQL subscription error: ${JSON.stringify(data.payload)}`);
            break;

          case "complete":
            break;
        }
      });

      socket.on("error", (err) => {
        subscriptionErrors.add(1);
        successRate.add(0);
        console.error(`WebSocket error: ${err.error()}`);
      });

      socket.setTimeout(() => {
        // Unsubscribe cleanly before closing
        socket.send(JSON.stringify({ id: subId, type: "complete" }));
        socket.close();
      }, listenSec * 1000);
    },
  );

  check(res, {
    "WebSocket status 101": (r) => r && r.status === 101,
  });

  sleep(1);
}
