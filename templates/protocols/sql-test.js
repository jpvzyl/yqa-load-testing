/**
 * k6 Direct SQL Database Wire Protocol Load Test
 *
 * Requires: xk6-sql extension (https://github.com/grafana/xk6-sql)
 * Build:    xk6 build --with github.com/grafana/xk6-sql
 *
 * Supported drivers: postgres, mysql, sqlite3, sqlserver, clickhouse
 *
 * Env vars:
 *   SQL_DRIVER     – database driver (default: postgres)
 *   SQL_CONN       – connection string (default: postgres://k6:k6pass@localhost:5432/k6db?sslmode=disable)
 *   SQL_SETUP      – run setup to create test table (default: true)
 */

import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import sql from "k6/x/sql";

const driver = __ENV.SQL_DRIVER || "postgres";
const connString =
  __ENV.SQL_CONN ||
  "postgres://k6:k6pass@localhost:5432/k6db?sslmode=disable";
const runSetup = (__ENV.SQL_SETUP || "true") === "true";

const queryCount = new Counter("sql_queries_total");
const insertCount = new Counter("sql_inserts_total");
const selectLatency = new Trend("sql_select_latency_ms", true);
const insertLatency = new Trend("sql_insert_latency_ms", true);
const updateLatency = new Trend("sql_update_latency_ms", true);
const querySuccessRate = new Rate("sql_query_success_rate");

export const options = {
  scenarios: {
    sql_load: {
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
    sql_select_latency_ms: ["p(95)<100", "p(99)<300"],
    sql_insert_latency_ms: ["p(95)<100", "p(99)<300"],
    sql_update_latency_ms: ["p(95)<150", "p(99)<400"],
    sql_query_success_rate: ["rate>0.99"],
  },
};

const db = sql.open(driver, connString);

export function setup() {
  if (!runSetup) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS k6_test (
      id SERIAL PRIMARY KEY,
      vu_id INTEGER NOT NULL,
      iter INTEGER NOT NULL,
      payload TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

export default function () {
  // --- INSERT ---
  const payload = `test-data-${__VU}-${__ITER}-${Date.now()}`;
  let t = Date.now();
  try {
    db.exec(
      "INSERT INTO k6_test (vu_id, iter, payload) VALUES ($1, $2, $3)",
      __VU,
      __ITER,
      payload,
    );
    insertLatency.add(Date.now() - t);
    insertCount.add(1);
    querySuccessRate.add(1);
  } catch (err) {
    querySuccessRate.add(0);
    console.error(`INSERT failed: ${err}`);
  }

  // --- SELECT (point query) ---
  t = Date.now();
  try {
    const rows = sql.query(
      db,
      "SELECT id, payload FROM k6_test WHERE vu_id = $1 ORDER BY id DESC LIMIT 5",
      __VU,
    );
    selectLatency.add(Date.now() - t);
    queryCount.add(1);
    querySuccessRate.add(1);

    check(rows, {
      "SELECT returned rows": (r) => r && r.length > 0,
    });
  } catch (err) {
    querySuccessRate.add(0);
    console.error(`SELECT failed: ${err}`);
  }

  // --- UPDATE ---
  t = Date.now();
  try {
    db.exec(
      "UPDATE k6_test SET payload = $1 WHERE vu_id = $2 AND iter = $3",
      `updated-${Date.now()}`,
      __VU,
      __ITER,
    );
    updateLatency.add(Date.now() - t);
    queryCount.add(1);
    querySuccessRate.add(1);
  } catch (err) {
    querySuccessRate.add(0);
    console.error(`UPDATE failed: ${err}`);
  }

  sleep(0.1);
}

export function teardown() {
  db.close();
}
