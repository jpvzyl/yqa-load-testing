/**
 * k6 gRPC Bidirectional Streaming Load Test
 *
 * Uses the built-in k6/net/grpc module (k6 ≥ v0.49 supports streaming).
 *
 * Env vars:
 *   GRPC_HOST     – gRPC server host:port (default: localhost:50051)
 *   GRPC_PROTO    – path to .proto file (default: ./service.proto)
 *   GRPC_SERVICE  – fully-qualified service name (default: test.EchoService)
 *   GRPC_METHOD   – streaming method name (default: BidiEcho)
 *   GRPC_INSECURE – set "true" to skip TLS (default: true)
 */

import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import grpc from "k6/net/grpc";

const host = __ENV.GRPC_HOST || "localhost:50051";
const protoPath = __ENV.GRPC_PROTO || "./service.proto";
const serviceName = __ENV.GRPC_SERVICE || "test.EchoService";
const methodName = __ENV.GRPC_METHOD || "BidiEcho";
const insecure = (__ENV.GRPC_INSECURE || "true") === "true";

const messagesSent = new Counter("grpc_stream_messages_sent");
const messagesReceived = new Counter("grpc_stream_messages_received");
const streamLatency = new Trend("grpc_stream_message_latency_ms", true);
const streamSetupTime = new Trend("grpc_stream_setup_ms", true);

const client = new grpc.Client();
client.load([], protoPath);

export const options = {
  scenarios: {
    grpc_streaming: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "20s", target: 5 },
        { duration: "1m", target: 20 },
        { duration: "1m", target: 20 },
        { duration: "20s", target: 0 },
      ],
    },
  },
  thresholds: {
    grpc_stream_message_latency_ms: ["p(95)<200", "p(99)<500"],
    grpc_stream_setup_ms: ["p(95)<300"],
    grpc_stream_messages_sent: ["count>0"],
    grpc_stream_messages_received: ["count>0"],
  },
};

export default function () {
  const connectParams = { plaintext: insecure };

  const setupStart = Date.now();
  client.connect(host, connectParams);
  streamSetupTime.add(Date.now() - setupStart);

  const fqMethod = `${serviceName}/${methodName}`;
  const stream = new grpc.Stream(client, fqMethod);

  const messagesPerIteration = 5;
  let received = 0;

  stream.on("data", (response) => {
    messagesReceived.add(1);
    received++;
    if (response.ts) {
      streamLatency.add(Date.now() - response.ts);
    }
  });

  stream.on("error", (err) => {
    console.error(`gRPC stream error: ${err.message}`);
  });

  for (let i = 0; i < messagesPerIteration; i++) {
    stream.write({
      message: `vu-${__VU}-iter-${__ITER}-msg-${i}`,
      ts: Date.now(),
      sequence: i,
    });
    messagesSent.add(1);
    sleep(0.05);
  }

  stream.end();

  check(null, {
    "received at least one response": () => received > 0,
  });

  client.close();
  sleep(0.2);
}
