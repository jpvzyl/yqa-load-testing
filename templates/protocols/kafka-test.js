/**
 * k6 Apache Kafka Producer/Consumer Load Test
 *
 * Requires: xk6-kafka extension (https://github.com/mostafa/xk6-kafka)
 * Build:    xk6 build --with github.com/mostafa/xk6-kafka
 *
 * Env vars:
 *   KAFKA_BROKERS – comma-separated broker list (default: localhost:9092)
 *   KAFKA_TOPIC   – topic name (default: k6-load-test)
 *   KAFKA_GROUP   – consumer group id (default: k6-group)
 */

import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import {
  Writer,
  Reader,
  Connection,
  SchemaRegistry,
  CODEC_PLAIN,
} from "k6/x/kafka";

const brokers = (__ENV.KAFKA_BROKERS || "localhost:9092").split(",");
const topic = __ENV.KAFKA_TOPIC || "k6-load-test";
const groupId = __ENV.KAFKA_GROUP || "k6-group";

const producedMessages = new Counter("kafka_messages_produced");
const consumedMessages = new Counter("kafka_messages_consumed");
const produceLatency = new Trend("kafka_produce_latency_ms", true);
const roundtripLatency = new Trend("kafka_roundtrip_ms", true);

export const options = {
  scenarios: {
    kafka_load: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 30 },
        { duration: "1m", target: 30 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    kafka_produce_latency_ms: ["p(95)<200", "p(99)<500"],
    kafka_roundtrip_ms: ["p(95)<1000", "p(99)<2000"],
    kafka_messages_produced: ["count>0"],
    kafka_messages_consumed: ["count>0"],
  },
};

const writer = new Writer({ brokers, topic });
const reader = new Reader({ brokers, topic, groupID: groupId });

export default function () {
  const now = Date.now();
  const key = `vu-${__VU}-${__ITER}`;
  const payload = JSON.stringify({
    vu: __VU,
    iter: __ITER,
    ts: now,
    data: "load-test-payload-" + Math.random().toString(36).substring(2, 15),
  });

  const produceBefore = Date.now();
  writer.produce({
    messages: [
      {
        key: CODEC_PLAIN.encode(key),
        value: CODEC_PLAIN.encode(payload),
      },
    ],
  });
  produceLatency.add(Date.now() - produceBefore);
  producedMessages.add(1);

  const messages = reader.consume({ limit: 1 });
  if (messages && messages.length > 0) {
    consumedMessages.add(messages.length);
    const body = JSON.parse(CODEC_PLAIN.decode(messages[0].value));
    const elapsed = Date.now() - body.ts;
    roundtripLatency.add(elapsed);

    check(body, {
      "message has vu field": (b) => b.vu !== undefined,
      "message has data": (b) => b.data && b.data.length > 0,
    });
  }

  sleep(0.3);
}

export function teardown() {
  writer.close();
  reader.close();
}
