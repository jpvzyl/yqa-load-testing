/**
 * k6 AMQP (RabbitMQ) Load Test
 *
 * Requires: xk6-amqp extension (https://github.com/grafana/xk6-amqp)
 * Build:    xk6 build --with github.com/grafana/xk6-amqp
 *
 * Env vars:
 *   AMQP_URL      – connection string (default: amqp://guest:guest@localhost:5672/)
 *   AMQP_EXCHANGE – exchange name (default: k6-exchange)
 *   AMQP_QUEUE    – queue name (default: k6-queue)
 *   AMQP_ROUTING_KEY – routing key (default: k6.test)
 */

import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import Amqp from "k6/x/amqp";

const url = __ENV.AMQP_URL || "amqp://guest:guest@localhost:5672/";
const exchangeName = __ENV.AMQP_EXCHANGE || "k6-exchange";
const queueName = __ENV.AMQP_QUEUE || "k6-queue";
const routingKey = __ENV.AMQP_ROUTING_KEY || "k6.test";

const publishedCount = new Counter("amqp_messages_published");
const consumedCount = new Counter("amqp_messages_consumed");
const publishLatency = new Trend("amqp_publish_latency_ms", true);
const roundtripLatency = new Trend("amqp_roundtrip_ms", true);

export const options = {
  scenarios: {
    amqp_pubsub: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "20s", target: 10 },
        { duration: "1m", target: 25 },
        { duration: "1m", target: 25 },
        { duration: "20s", target: 0 },
      ],
    },
  },
  thresholds: {
    amqp_publish_latency_ms: ["p(95)<100", "p(99)<300"],
    amqp_roundtrip_ms: ["p(95)<500", "p(99)<1000"],
    amqp_messages_published: ["count>0"],
  },
};

export function setup() {
  Amqp.start({ connection_url: url });
  Amqp.declareExchange({
    name: exchangeName,
    kind: "direct",
    durable: true,
    auto_delete: false,
  });
  Amqp.declareQueue({
    name: queueName,
    durable: true,
    auto_delete: false,
  });
  Amqp.bindQueue({
    queue_name: queueName,
    exchange_name: exchangeName,
    routing_key: routingKey,
  });
}

export default function () {
  const payload = JSON.stringify({
    vu: __VU,
    iter: __ITER,
    ts: Date.now(),
    body: "amqp-load-test-" + Math.random().toString(36).substring(2, 10),
  });

  const publishStart = Date.now();
  Amqp.publish({
    exchange: exchangeName,
    routing_key: routingKey,
    content_type: "application/json",
    body: payload,
  });
  publishLatency.add(Date.now() - publishStart);
  publishedCount.add(1);

  const message = Amqp.consume({
    queue_name: queueName,
    auto_ack: true,
  });

  if (message) {
    consumedCount.add(1);
    const body = JSON.parse(message.body);
    roundtripLatency.add(Date.now() - body.ts);

    check(body, {
      "has vu": (b) => b.vu !== undefined,
      "has body content": (b) => b.body && b.body.startsWith("amqp-load-test"),
    });
  }

  sleep(0.2);
}
