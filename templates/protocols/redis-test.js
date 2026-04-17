/**
 * k6 Redis Operations Load Test
 *
 * Requires: xk6-redis extension (https://github.com/grafana/xk6-redis)
 * Build:    xk6 build --with github.com/grafana/xk6-redis
 *
 * Env vars:
 *   REDIS_URL     – Redis connection URL (default: redis://localhost:6379)
 *   REDIS_PREFIX  – key prefix to avoid collisions (default: k6test)
 */

import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import redis from "k6/x/redis";

const redisUrl = __ENV.REDIS_URL || "redis://localhost:6379";
const prefix = __ENV.REDIS_PREFIX || "k6test";

const setOps = new Counter("redis_set_ops");
const getOps = new Counter("redis_get_ops");
const hashOps = new Counter("redis_hash_ops");
const listOps = new Counter("redis_list_ops");
const setLatency = new Trend("redis_set_latency_ms", true);
const getLatency = new Trend("redis_get_latency_ms", true);
const hashLatency = new Trend("redis_hash_latency_ms", true);
const listLatency = new Trend("redis_list_latency_ms", true);

export const options = {
  scenarios: {
    redis_ops: {
      executor: "ramping-vus",
      startVUs: 2,
      stages: [
        { duration: "20s", target: 20 },
        { duration: "1m", target: 50 },
        { duration: "1m", target: 50 },
        { duration: "20s", target: 0 },
      ],
    },
  },
  thresholds: {
    redis_set_latency_ms: ["p(95)<10", "p(99)<50"],
    redis_get_latency_ms: ["p(95)<10", "p(99)<50"],
    redis_hash_latency_ms: ["p(95)<15", "p(99)<60"],
    redis_list_latency_ms: ["p(95)<15", "p(99)<60"],
  },
};

const client = new redis.Client(redisUrl);

export default function () {
  const key = `${prefix}:str:${__VU}:${__ITER}`;
  const value = `payload-${Date.now()}-${Math.random()}`;

  // --- SET / GET ---
  let t = Date.now();
  client.set(key, value, 60);
  setLatency.add(Date.now() - t);
  setOps.add(1);

  t = Date.now();
  const got = client.get(key);
  getLatency.add(Date.now() - t);
  getOps.add(1);

  check(null, { "GET matches SET": () => got === value });

  // --- HSET / HGET ---
  const hashKey = `${prefix}:hash:${__VU}`;
  const field = `field-${__ITER}`;

  t = Date.now();
  client.hset(hashKey, field, value);
  const hval = client.hget(hashKey, field);
  hashLatency.add(Date.now() - t);
  hashOps.add(1);

  check(null, { "HGET matches HSET": () => hval === value });

  // --- LPUSH / LPOP ---
  const listKey = `${prefix}:list:${__VU}`;

  t = Date.now();
  client.lpush(listKey, value);
  const popped = client.lpop(listKey);
  listLatency.add(Date.now() - t);
  listOps.add(1);

  check(null, { "LPOP returns pushed value": () => popped === value });

  sleep(0.1);
}

export function teardown() {
  client.close();
}
