/**
 * k6 MQTT Pub/Sub Load Test
 *
 * Requires: xk6-mqtt extension (https://github.com/pmalhaire/xk6-mqtt)
 * Build:    xk6 build --with github.com/pmalhaire/xk6-mqtt
 *
 * Env vars:
 *   MQTT_BROKER  – broker address (default: tcp://localhost:1883)
 *   MQTT_TOPIC   – topic to publish/subscribe (default: k6/load-test)
 *   MQTT_QOS     – quality-of-service level 0|1|2 (default: 1)
 */

import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import mqtt from "k6/x/mqtt";

const broker = __ENV.MQTT_BROKER || "tcp://localhost:1883";
const topic = __ENV.MQTT_TOPIC || "k6/load-test";
const qos = parseInt(__ENV.MQTT_QOS || "1", 10);

const publishedMessages = new Counter("mqtt_messages_published");
const receivedMessages = new Counter("mqtt_messages_received");
const roundtripTime = new Trend("mqtt_roundtrip_ms", true);

export const options = {
  scenarios: {
    pubsub: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 50 },
        { duration: "1m", target: 50 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    mqtt_roundtrip_ms: ["p(95)<500", "p(99)<1000"],
    mqtt_messages_published: ["count>0"],
    mqtt_messages_received: ["count>0"],
  },
};

export default function () {
  const clientId = `k6-mqtt-${__VU}-${__ITER}`;

  const publisher = new mqtt.Client([broker], clientId + "-pub", "", "", false);
  const subscriber = new mqtt.Client(
    [broker],
    clientId + "-sub",
    "",
    "",
    false,
  );

  const subTopic = `${topic}/${__VU}`;
  subscriber.subscribe(subTopic, qos);

  const payload = JSON.stringify({
    vu: __VU,
    iter: __ITER,
    ts: Date.now(),
  });

  const sendTime = Date.now();
  publisher.publish(subTopic, qos, payload, false, false);
  publishedMessages.add(1);

  const msg = subscriber.receive(5000);
  if (msg) {
    receivedMessages.add(1);
    const elapsed = Date.now() - sendTime;
    roundtripTime.add(elapsed);

    const body = JSON.parse(msg.payload);
    check(body, {
      "payload matches": (b) => b.vu === __VU && b.iter === __ITER,
    });
  }

  sleep(0.5);

  subscriber.close();
  publisher.close();
}
