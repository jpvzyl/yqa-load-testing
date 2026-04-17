# Sarfat Load Testing Platform — Full Technical Summary

**Version:** 1.0.0  
**Date:** 9 April 2026  
**Status:** Production — Live on Heroku  
**Codebase:** 77 source files, ~14,000 lines of code  

---

## 1. What It Is

The Sarfat Load Testing Platform is a full-stack, AI-powered performance testing and resilience validation system. It combines **k6** (Grafana's industry-leading load engine) with **Claude AI** (Anthropic) to deliver automated test execution, real-time monitoring, intelligent bottleneck detection, and executive-grade reporting — all through a modern React web application.

It is the fourth program in the Sarfat quality assurance portfolio:

| Program | Focus | Status |
|---------|-------|--------|
| ISO 27001 Certification | Compliance & governance | Live |
| Sarfat Pen Testing | Security assessment (SAST/DAST) | Live |
| Tech Due Diligence | Investment-grade technical review | In development |
| **Sarfat Load Testing** | **Performance & resilience validation** | **Live** |

---

## 2. Live Deployment

| Resource | URL / Detail |
|----------|-------------|
| **Production App** | https://sarfat-load-testing-1dbce1e484e6.herokuapp.com/ |
| **GitHub Repo** | https://github.com/jpvzyl/yqa-load-testing |
| **Heroku App** | `sarfat-load-testing` (sarfat team) |
| **Database** | PostgreSQL Essential-0 (AWS us-east-1) |
| **AI Engine** | Anthropic API (Sonnet 4 + Opus 4.7) |
| **Login** | `admin@sarfat.io` / `loadtest2026` |

---

## 3. Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19.1 | UI framework |
| Vite | 6.3 | Build tool and dev server |
| Tailwind CSS | 4.1 | Utility-first CSS with custom dark theme |
| Recharts | 2.15 | Charts and data visualisation (Area, Line, Bar, Pie) |
| Framer Motion | 12.6 | Page transitions, counting animations, entrance effects |
| Lucide React | 0.487 | Icon library (80+ icons used) |
| Monaco Editor | 4.7 | VS Code-grade k6 script editor in-browser |
| React Router | 7.5 | Client-side routing (HashRouter for static hosting) |
| Axios | 1.8 | HTTP client with auth interceptors |
| date-fns | 4.1 | Date formatting |
| clsx | 2.1 | Conditional class composition |

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | ≥ 20 (24.14 on Heroku) | Runtime |
| Express | 5.1 | REST API framework (40+ endpoints) |
| WebSocket (ws) | 8.18 | Real-time metrics streaming during test execution |
| PostgreSQL (pg) | 8.13 | Primary data store (14 tables, 14 indexes) |
| Anthropic SDK | 0.39 | Claude AI integration (Sonnet 4 + Opus 4.7) |
| bcryptjs | 2.4 | Password hashing |
| Multer | 1.4 | File upload handling (API specs, HAR files) |
| AdmZip | 0.5 | Archive handling |
| node-cron | 3.0 | Scheduled test execution |
| YAML | 2.7 | OpenAPI YAML spec parsing |
| uuid | 11.1 | UUID generation for all entities |

### Load Engine

| Technology | Detail |
|-----------|--------|
| **k6** (Grafana) | Industry-leading load generator |
| Language | Go binary, JavaScript scripting |
| Capacity | 30,000-40,000 VUs per instance, up to 300,000 RPS |
| Memory | ~256MB (vs JMeter's 760MB for equivalent load) |
| Protocols | HTTP/1.1, HTTP/2, HTTPS, WebSocket, gRPC (native); GraphQL (via HTTP) |
| Integration | Spawned as child process, JSON output ingested into PostgreSQL |

### Testing & Quality

| Tool | Purpose |
|------|---------|
| Vitest 3.1 | Unit and integration testing (21 tests passing) |
| Supertest 7.1 | HTTP endpoint testing |
| ESLint 9.24 | Code quality |
| Testing Library 16.3 | React component testing |

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (React SPA)                                │
│                                                                             │
│  Dashboard │ Test Builder │ Script Editor │ Live Monitor │ AI Insights      │
│  Reports │ Baselines │ Comparison │ SLA │ Trends │ Capacity │ Pitch Deck   │
│                                                                             │
│  Dark glass-morphism UI │ Recharts │ Monaco Editor │ Framer Motion          │
└────────────────────┬──────────────────────────────────────────────┬──────────┘
                     │ HTTP REST (40+ endpoints)                    │ WebSocket
                     │ Bearer token auth                            │ (live metrics)
┌────────────────────▼──────────────────────────────────────────────▼──────────┐
│                          EXPRESS 5 API SERVER                                │
│                                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │   Auth   │ │  Tests   │ │   Runs   │ │ Reports  │ │ Importers│          │
│  │  Module  │ │   CRUD   │ │  Engine  │ │  Engine  │ │  Module  │          │
│  └──────────┘ └──────────┘ └────┬─────┘ └──────────┘ └──────────┘          │
│                                  │                                           │
│  ┌──────────────────────────────▼────────────────────────────────────────┐   │
│  │                        TEST EXECUTION PIPELINE                        │   │
│  │                                                                       │   │
│  │  1. Script Generation (from visual builder / AI / manual / import)    │   │
│  │  2. k6 Process Spawn (child_process, JSON + summary output)           │   │
│  │  3. Real-time Progress → WebSocket broadcast                          │   │
│  │  4. Metrics Ingestion (stream-parse JSON → PostgreSQL)                │   │
│  │  5. Performance Scoring (5-component weighted algorithm)              │   │
│  │  6. AI Analysis Pipeline (3-pass Claude: Sonnet → Sonnet → Opus)     │   │
│  │  7. Regression Detection (z-scores, Welch's t-test)                  │   │
│  │  8. Baseline Comparison (derived thresholds)                          │   │
│  │  9. SLA Evaluation                                                    │   │
│  │  10. Report Generation (AI or template)                               │   │
│  │  11. Notification Dispatch (Slack, webhook, email)                    │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Infra Monitor │  │  Correlation │  │  Scheduler   │  │Notifications │    │
│  │   (metrics)   │  │   Engine     │  │  (node-cron) │  │ (Slack/hook) │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────────────┐
│                          POSTGRESQL 16                                        │
│                                                                              │
│  users │ sessions │ projects │ tests │ test_runs │ run_metrics               │
│  endpoint_metrics │ infra_metrics │ baselines │ ai_analyses                   │
│  reports │ sla_definitions │ sla_results │ test_schedules                    │
│                                                                              │
│  14 tables │ 14 indexes │ UUID primary keys │ JSONB for flexible data       │
└──────────────────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────────────┐
│                       ANTHROPIC CLAUDE AI                                    │
│                                                                              │
│  Pass 1 (Sonnet 4)  → Metric analysis, bottleneck detection, anomalies     │
│  Pass 2 (Sonnet 4)  → Infrastructure correlation, resource mapping          │
│  Pass 3 (Opus 4.7)  → Executive synthesis, go/no-go, remediation roadmap   │
│                                                                              │
│  Also: AI test generation from specs/natural language                        │
│  Also: AI-powered report content generation                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Database Schema (14 Tables)

| Table | Rows Purpose | Key Fields |
|-------|-------------|------------|
| `users` | User accounts | id, email, password_hash, name, role |
| `sessions` | Auth tokens (Bearer, configurable TTL) | token, user_id, expires_at |
| `projects` | Multi-tenant project containers | name, description, settings (JSONB) |
| `tests` | Test definitions (reusable configs) | name, test_type, protocol, script_content, config (JSONB), tags |
| `test_runs` | Execution instances with full results | status, k6_summary (JSONB), performance_score, performance_grade, threshold_results (JSONB), environment, trigger |
| `run_metrics` | Time-series metric data points | time, metric_name, metric_type, value, tags (JSONB) |
| `endpoint_metrics` | Aggregated per-endpoint stats | endpoint, method, p50/p90/p95/p99 durations, error_rate, throughput_rps, status_codes (JSONB) |
| `infra_metrics` | Infrastructure metrics during tests | host, metric_name, value, metadata (JSONB) |
| `baselines` | Performance baseline snapshots | metrics_summary (JSONB), thresholds (JSONB), is_active |
| `ai_analyses` | AI analysis results per pass | analysis_type, pass_number, model_used, content (JSONB), token counts |
| `reports` | Generated reports | report_type, content (full Markdown), executive_summary (JSONB), ai_generated |
| `sla_definitions` | SLA/SLO objective definitions | metric, operator, threshold_value, severity |
| `sla_results` | Per-run SLA compliance results | passed, actual_value, margin_percent |
| `test_schedules` | Cron-based recurring test configs | cron_expression, timezone, notify_on |

---

## 6. Backend Modules (13 Files, 3,783 Lines)

### `server.js` (650 lines)
The Express 5 API server with WebSocket support. Handles 40+ REST endpoints across auth, tests, runs, metrics, AI analysis, reports, baselines, regression, comparison, SLA, schedules, infrastructure, and importers. Manages the full test execution lifecycle in the background and broadcasts real-time updates via WebSocket.

### `db.js` (738 lines)
PostgreSQL schema definition (14 tables with indexes), migrations, and complete CRUD operations. Includes auth (user creation, bcrypt password verification, session management), project/test/run management, metrics insertion and aggregation (with `PERCENTILE_CONT` for p50/p90/p95/p99), baseline management, SLA tracking, and dashboard statistics.

### `k6-runner.js` (279 lines)
k6 process orchestrator. Generates k6 JavaScript scripts from test configurations (supporting 6 test types with different stage patterns). Manages k6 as a child process with JSON and summary output. Parses k6 progress for real-time broadcasting. Extracts and normalises the k6 end-of-test summary into a standard format with all key metrics (response times, percentiles, error rates, throughput, data transfer, VU counts, check results).

### `metrics-ingester.js` (166 lines)
Parses k6 JSON output (line-delimited JSON) and batch-inserts metrics into PostgreSQL (500 rows per batch). Simultaneously aggregates per-endpoint metrics (request counts, durations, percentiles, error rates, status code distribution, throughput). Infers metric types (trend, counter, rate, gauge) from metric names.

### `scoring.js` (178 lines)
Five-component weighted performance scoring algorithm:

| Component | Weight | Calculation |
|-----------|--------|-------------|
| Response Time | 30% | P95 vs baseline (or absolute thresholds): 100 if ≤100ms, down to 0 at ≥5000ms |
| Error Rate | 25% | 100 at 0%, 85 at <1%, 60 at <5%, 0 at ≥10% |
| Throughput | 20% | Actual RPS vs baseline/target |
| Stability | 15% | Coefficient of variation (P95-P50)/avg — lower is better |
| Thresholds | 10% | Percentage of k6 thresholds that passed |

Grades: A+ (90-100), A (80-89), B (70-79), C (60-69), D (40-59), F (0-39). Also provides run-to-run comparison with percentage changes and severity classification.

### `ai-analyzer.js` (603 lines)
Three-pass Claude AI analysis pipeline:

- **Pass 1 — Metric Analysis** (Claude Sonnet 4): Analyses k6 summary, endpoint metrics, and threshold results. Produces: performance grade, bottleneck list with severity/evidence/saturation points, anomaly detection, error correlation analysis, response time distribution assessment, throughput scaling behavior, quick wins, and areas needing investigation.

- **Pass 2 — Infrastructure Correlation** (Claude Sonnet 4): Takes Pass 1 results + infrastructure metrics. Maps bottlenecks to specific resources (CPU/memory/disk/network/DB), estimates capacity ceiling, provides scaling recommendations, database analysis, and network analysis.

- **Pass 3 — Executive Synthesis** (Claude Opus 4.7): Takes Pass 1 + Pass 2 + baseline data + historical runs + SLA results. Produces: executive summary (C-suite language), risk level, production readiness, go/no-go recommendation, key findings with effort estimates, regression analysis with statistical significance, SLA compliance status, capacity forecast with time-to-capacity, phased remediation roadmap (immediate/short-term/medium-term/architectural), cost of inaction, and optimisation cost estimate.

Also includes: AI test script generation from OpenAPI specs, GraphQL schemas, or natural language descriptions. Full fallback analysis when no API key is configured.

### `baselines.js` (158 lines)
Baseline capture and comparison engine. Captures complete metric snapshots from successful runs, derives threshold ranges (warning = baseline × 1.1-1.15, critical = baseline × 1.5), and compares current runs against active baselines with per-metric violation detection.

### `regression-detector.js` (211 lines)
Statistical regression detection using z-scores and Welch's t-test. Compares current run metrics against historical distribution (last 10 runs). Flags regressions when z > 2 (warning) or z > 3 (critical) with p-value calculation. Includes trend analysis (improving/stable/degrading) across performance scores. Full implementation of the incomplete beta function for accurate p-value computation.

### `report-generator.js` (267 lines)
Seven report types with AI-enhanced or template-based generation:

| Report Type | Audience | Content |
|-------------|----------|---------|
| Executive Summary | C-suite, stakeholders | Business impact, KPIs, risk assessment, recommendations |
| Technical Deep-Dive | Engineering leads | Percentile breakdown, HTTP timing, endpoint table, bottleneck analysis |
| Remediation Plan | Development teams | Prioritised action items with effort estimates, cost-benefit |
| SLA Compliance | Operations, contracts | Per-SLA pass/fail with margins |
| Capacity Planning | Infrastructure, finance | Current capacity, scaling recommendations, growth projections |
| Comparison | Performance engineers | Side-by-side run metrics |
| Trend Analysis | Engineering management | Multi-run performance trends |

### `infra-monitor.js` (147 lines)
Infrastructure metrics collection during test execution. Supports HTTP endpoint polling (fetches JSON metrics from target systems), system stats collection (CPU load, memory utilisation via `vm_stat`/`sysctl`), and custom metric endpoints. Runs on configurable intervals (default 5s) and inserts metrics correlated to run timelines.

### `correlation-engine.js` (185 lines)
Correlates load test metrics with infrastructure metrics along a shared timeline. Finds saturation points (when resources exceed thresholds — CPU>80%, memory>85%, disk>70%), identifies the first resource to saturate, and maps resource bottlenecks to application performance impact.

### `scheduler.js` (74 lines)
Cron-based test scheduling using `node-cron`. Loads schedules from database on startup, registers/unregisters jobs dynamically via API, supports timezone configuration, and triggers test execution with `scheduled` trigger type.

### `notifications.js` (127 lines)
Multi-channel notification dispatch:
- **Slack**: Rich attachments with color-coded status, metric fields, footer branding
- **Webhooks**: JSON payload with HMAC-SHA256 signature verification
- **Email**: Logging-based (extensible to SMTP/SES)

Includes formatted messages for test completion (score, grade, metrics, bottlenecks) and regression alerts.

---

## 7. Importers (4 Files, 848 Lines)

| Importer | Input | Output |
|----------|-------|--------|
| `openapi-importer.js` (246 lines) | OpenAPI 2.0/3.x specs (JSON or YAML) | k6 script with all endpoints, auth detection, sample request bodies, think times |
| `har-importer.js` (187 lines) | HAR (HTTP Archive) browser recordings | k6 script filtered to API calls (excludes static assets), with dynamic value correlation detection |
| `postman-importer.js` (190 lines) | Postman Collection v2.x | k6 script with variable resolution, nested folder flattening, auth header mapping |
| `graphql-importer.js` (225 lines) | GraphQL introspection JSON or SDL | k6 script with query/mutation coverage, return field generation, sample variable values |

All importers produce:
- Complete, runnable k6 JavaScript scripts
- Configuration objects for the test builder
- Metadata (endpoint count, auth type, base URL, etc.)

---

## 8. Frontend (22 Pages, 7 Components, 5 Lib Files — 5,976 Lines)

### Design Language
- **Dark theme**: Deep navy background (`#070b14`), glass-morphism cards with backdrop blur
- **Accent**: Electric blue (`#3b82f6`) for performance/speed connotation
- **Status colours**: Green (success/pass), amber (warning), red (danger/fail)
- **Animations**: Staggered entrance animations, counting number effects, smooth page transitions
- **Data density**: Dashboard-heavy with multiple chart types, metric grids, and sortable tables

### Navigation Structure (Sidebar)

| Section | Pages |
|---------|-------|
| **Overview** | Dashboard, Performance Trends |
| **Testing** | Tests (library), Test Builder (no-code), Script Editor (Monaco), Scenarios (templates), Import (OpenAPI/HAR/Postman/GraphQL) |
| **Execution** | Test Runs (history), Schedules |
| **Analysis** | AI Insights (3-pass), Baselines, Comparisons, Capacity Planning |
| **Reporting** | Reports (7 types), SLA Compliance |
| **System** | Integrations (CI/CD), Infrastructure (monitoring targets), Settings, Pitch Deck |

### Key Pages

**Dashboard** — Hero metric cards (total tests, runs, avg score, active runs) with animated counters. Performance trend AreaChart from Recharts. Recent runs table with status badges, score grades, and duration. Quick action buttons.

**Test Builder** — Visual no-code test creation: test type selector, protocol picker, target URL, VU/duration config, dynamic endpoint builder (add/remove rows with method, URL, headers, body, think time), threshold configuration. Generates k6 scripts from form data.

**Script Editor** — Full Monaco Editor (VS Code engine) with `vs-dark` theme and k6 JavaScript support. Template dropdown, save/run buttons, script validation. Takes most of the screen with a sidebar for controls.

**Live Monitor** — Real-time WebSocket-connected dashboard. Animated hero metrics (VUs, RPS, response time, error rate), streaming LineCharts for response time and throughput, scrolling error feed, progress indicator, abort button with confirmation.

**Run Detail** — Deep-dive with performance gauge and grade badge. Six tabs: Overview (10-metric grid + timing breakdown), Endpoints (full table), AI Analysis (3-pass results), Reports (generate/view), Regression (statistical results), SLA (pass/fail table).

**AI Insights** — Pipeline visualisation showing Pass 1 → 2 → 3 with status indicators. Expandable results per pass: bottlenecks, capacity analysis, executive summary, risk level, go/no-go recommendation, remediation roadmap.

**Pitch Deck** — Full marketing page (public, no auth): gradient hero, stats bar, feature cards, competitive comparison table (vs k6 Cloud, LoadRunner, Artillery), 4-tier pricing, service offerings, CTA.

### Reusable Components

| Component | Purpose |
|-----------|---------|
| `Layout.jsx` (213 lines) | Full sidebar with 6 sections, mobile hamburger, Sarfat branding, NavLink active states |
| `MetricCard.jsx` (85 lines) | Animated number counting, trend indicator (up/down), colour accent bar |
| `PerformanceGauge.jsx` (57 lines) | Circular SVG gauge (0-100) with framer-motion animated fill, grade letter centre |
| `GlassCard.jsx` (17 lines) | Reusable glass-morphism card with hover effects |
| `ScoreGrade.jsx` (25 lines) | Letter grade badge (A+ through F) with matching colours |
| `ThresholdBadge.jsx` (18 lines) | Pass/fail indicator with check/X icons |
| `ProtectedRoute.jsx` (21 lines) | Auth gate — spinner while loading, redirect if unauthenticated |

---

## 9. Test Types & Methodology

### Supported Test Types

| Type | Pattern | Purpose | k6 Stages |
|------|---------|---------|-----------|
| **Smoke** | 1 VU, 1 min | Verify script works | Flat at 1 VU |
| **Load** | Ramp → hold → ramp down | Validate under expected traffic | 30s ramp → hold → 10s down |
| **Stress** | Progressive ramp through multiple stages | Find breaking point | 5 stages: 50% → 100% → 150% → 200% → 0 |
| **Spike** | Low → sudden surge → recovery | Test auto-scaling and recovery | 10% → 100% → hold → back to 10% |
| **Soak** | Sustained moderate load | Detect memory leaks, gradual degradation | Ramp → hold 30min+ → down |
| **Breakpoint** | Incremental ramp (10 steps) | Find exact capacity ceiling | 50% increments up to 500% |
| **Scalability** | Step-wise increase | Measure scaling characteristics | Custom step function |

### Performance Scoring

```
Score = (ResponseTime × 0.30) + (ErrorRate × 0.25) + (Throughput × 0.20) 
      + (Stability × 0.15) + (Thresholds × 0.10)

Grade:  A+ (90-100)  A (80-89)  B (70-79)  C (60-69)  D (40-59)  F (0-39)
```

### Regression Detection Algorithm

1. Collect last 10 completed runs for the same test
2. Calculate mean and standard deviation for each metric
3. Compute z-score: `z = (current - mean) / stddev`
4. Flag regression if z > 2 (warning) or z > 3 (critical)
5. Calculate p-value using error function approximation
6. Statistically significant if p < 0.05
7. Welch's t-test available for comparing two sample distributions

---

## 10. k6 Test Templates (9 Files, 901 Lines)

| Template | File | Description |
|----------|------|-------------|
| Standard Load | `load-test.js` | 50 VUs, 30s ramp, 2min hold, p95<500ms |
| Stress | `stress-test.js` | 10→200 VUs progressive, 2min per stage |
| Spike | `spike-test.js` | 5→200→5→300 VU spikes with recovery |
| Soak | `soak-test.js` | 50 VUs for 30min (configurable via env) |
| Breakpoint | `breakpoint-test.js` | ramping-arrival-rate: 10→200 RPS |
| API CRUD | `api-crud.js` | Create→Read→Update→Delete with data correlation |
| WebSocket | `websocket-chat.js` | Connect, join room, send messages, measure latency |
| GraphQL | `graphql-queries.js` | Queries and mutations over HTTP POST |
| E-Commerce | `ecommerce-flow.js` | Browse→Search→View→Cart→Checkout journey |

All templates use `__ENV.BASE_URL` for configurability, include custom metrics, assertions, and are ready to run with `k6 run <file>`.

---

## 11. API Reference (40+ Endpoints)

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Login with email/password → Bearer token |
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/logout` | Invalidate session |
| GET | `/api/v1/auth/me` | Current user info |

### Dashboard & Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/dashboard` | Stats: total tests, runs, avg score, recent runs |
| GET | `/api/v1/projects` | List projects |
| POST | `/api/v1/projects` | Create project |

### Tests
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/tests` | List all tests (with run counts, last score) |
| GET | `/api/v1/tests/:id` | Get test detail |
| POST | `/api/v1/tests` | Create test |
| PUT | `/api/v1/tests/:id` | Update test |
| DELETE | `/api/v1/tests/:id` | Delete test |
| POST | `/api/v1/tests/:id/run` | Execute test → returns run ID |

### Runs & Metrics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/runs` | List runs (filterable by test_id) |
| GET | `/api/v1/runs/:id` | Run detail with full k6 summary |
| POST | `/api/v1/runs/:id/abort` | Abort running test |
| GET | `/api/v1/runs/:id/metrics` | Raw time-series metrics |
| GET | `/api/v1/runs/:id/metrics/summary` | Aggregated metrics with percentiles |
| GET | `/api/v1/runs/:id/endpoints` | Per-endpoint performance breakdown |

### AI Analysis
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/runs/:id/analyze` | Trigger 3-pass AI analysis |
| GET | `/api/v1/runs/:id/analyses` | Get analysis results (pass 1/2/3) |
| POST | `/api/v1/ai/generate-test` | Generate k6 script from spec or description |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/reports` | List all reports |
| GET | `/api/v1/runs/:id/reports` | Reports for a specific run |
| POST | `/api/v1/runs/:id/reports` | Generate report (7 types) |
| GET | `/api/v1/report-types` | Available report types |

### Baselines & Regression
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/baselines` | List baselines |
| POST | `/api/v1/baselines` | Capture baseline from run |
| GET | `/api/v1/runs/:id/baseline-comparison` | Compare run vs active baseline |
| GET | `/api/v1/runs/:id/regression` | Statistical regression detection |
| GET | `/api/v1/compare/:id1/:id2` | Compare two runs side-by-side |

### SLA, Schedules, Infrastructure
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/v1/slas` | SLA definitions |
| GET | `/api/v1/runs/:id/sla-results` | Per-run SLA compliance |
| GET/POST | `/api/v1/schedules` | Scheduled test configurations |
| GET | `/api/v1/runs/:id/infra` | Infrastructure metrics |
| GET | `/api/v1/runs/:id/correlation` | Infra ↔ load correlation |

### Importers
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/import/openapi` | Import OpenAPI/Swagger spec → k6 script |
| POST | `/api/v1/import/har` | Import HAR browser recording → k6 script |
| POST | `/api/v1/import/postman` | Import Postman collection → k6 script |
| POST | `/api/v1/import/graphql` | Import GraphQL schema → k6 script |

---

## 12. File Structure (77 Source Files)

```
Load-Testing/
├── package.json                           # sarfat-load-testing, Node ≥20, ESM
├── vite.config.js                         # Vite 6, Tailwind 4, proxy to :3006
├── vitest.config.js                       # Node environment, tests/ directory
├── eslint.config.js                       # ESLint 9, JSX support
├── index.html                             # SPA entry point
├── Procfile                               # web: node server.js
├── README.md                              # Setup, API reference, deployment
├── LOAD_TESTING_PROGRAM_PLAN.md           # Full program specification
├── SARFAT-LOAD-TESTING-SUMMARY.md         # This document
│
├── server.js                 (650 lines)  # Express 5 API + WebSocket + SPA
├── db.js                     (738 lines)  # PostgreSQL schema + CRUD
├── k6-runner.js              (279 lines)  # k6 process management
├── metrics-ingester.js       (166 lines)  # k6 JSON → database pipeline
├── scoring.js                (178 lines)  # 5-component performance scoring
├── ai-analyzer.js            (603 lines)  # 3-pass Claude AI pipeline
├── baselines.js              (158 lines)  # Baseline capture & comparison
├── regression-detector.js    (211 lines)  # Statistical regression detection
├── report-generator.js       (267 lines)  # 7 report types
├── infra-monitor.js          (147 lines)  # Infrastructure metrics collection
├── correlation-engine.js     (185 lines)  # Load ↔ infra correlation
├── scheduler.js               (74 lines)  # Cron-based scheduling
├── notifications.js          (127 lines)  # Slack / webhook / email
│
├── importers/
│   ├── openapi-importer.js   (246 lines)  # OpenAPI/Swagger → k6
│   ├── har-importer.js       (187 lines)  # HAR recording → k6
│   ├── postman-importer.js   (190 lines)  # Postman collection → k6
│   └── graphql-importer.js   (225 lines)  # GraphQL schema → k6
│
├── templates/                             # 9 production-ready k6 templates
│   ├── load-test.js, stress-test.js, spike-test.js, soak-test.js
│   ├── breakpoint-test.js, api-crud.js, websocket-chat.js
│   ├── graphql-queries.js, ecommerce-flow.js
│
├── src/
│   ├── main.jsx                           # Entry: AuthProvider > HashRouter > App
│   ├── App.jsx                            # React Router v7 (22 routes)
│   ├── index.css                          # Tailwind 4 + custom theme + animations
│   │
│   ├── lib/                               # Shared utilities
│   │   ├── api.js            (105 lines)  # Axios client, auth interceptors
│   │   ├── auth.jsx           (53 lines)  # AuthContext, useAuth hook
│   │   ├── constants.js       (65 lines)  # Test types, protocols, grades, statuses
│   │   ├── utils.js           (71 lines)  # Formatters, color helpers
│   │   └── websocket.js       (73 lines)  # WebSocket client, subscribe/unsubscribe
│   │
│   ├── components/                        # 7 reusable components (436 lines)
│   │   ├── Layout.jsx, GlassCard.jsx, MetricCard.jsx
│   │   ├── PerformanceGauge.jsx, ScoreGrade.jsx
│   │   ├── ThresholdBadge.jsx, ProtectedRoute.jsx
│   │
│   └── pages/                             # 22 pages (5,173 lines)
│       ├── Dashboard.jsx, Login.jsx
│       ├── Tests.jsx, TestDetail.jsx, TestBuilder.jsx
│       ├── ScriptEditor.jsx, Scenarios.jsx, Import.jsx
│       ├── TestRuns.jsx, RunDetail.jsx, LiveMonitor.jsx
│       ├── AiInsights.jsx, Baselines.jsx, Comparison.jsx
│       ├── Reports.jsx, SlaCompliance.jsx, Trends.jsx
│       ├── CapacityPlanning.jsx, Infrastructure.jsx
│       ├── Integrations.jsx, Settings.jsx, PitchDeck.jsx
│
├── tests/                                 # 3 test files, 21 tests (285 lines)
│   ├── scoring.test.js       (132 lines)  # 9 tests
│   ├── k6-runner.test.js     (123 lines)  # 9 tests
│   └── metrics-ingester.test.js (30 lines) # 3 tests
│
└── scripts/
    ├── migrate.js             (24 lines)  # Database migration runner
    └── seed-demo-data.js     (319 lines)  # Demo data seeder
```

---

## 13. Competitive Position

| Capability | k6 Cloud | LoadRunner | Artillery | **Sarfat** |
|-----------|----------|------------|-----------|-----------|
| AI analysis (3-pass) | No | No | No | **Yes (Sonnet + Opus)** |
| Visual test builder | No | Yes | No | **Yes** |
| AI test generation | No | No | No | **Yes (from specs + NL)** |
| Multi-protocol | Yes | Yes | Partial | **Yes** |
| Real-time WebSocket dashboard | Yes | Yes | No | **Yes** |
| Baseline regression (statistical) | Manual | Manual | No | **Automated (z-score, t-test)** |
| Infrastructure correlation | Separate (Grafana) | Separate | No | **Built-in** |
| Executive reporting (AI) | No | Basic | No | **7 report types, AI-generated** |
| SLA lifecycle management | Thresholds only | Yes | No | **Full** |
| Self-hosted option | No | No | Yes | **Yes** |
| Starting price | $165/mo | Contact | $0 | **$0** |

---

## 14. Monetisation Model

### SaaS Tiers

| Tier | Price | Includes |
|------|-------|---------|
| Starter | Free | Core engine, 5 tests, basic dashboard |
| Professional | $199/mo | Unlimited tests, AI analysis, reporting, baselines, 3 users |
| Team | $499/mo | + CI/CD integration, scheduled tests, infra monitoring, 10 users |
| Enterprise | Custom | + SSO, audit logs, custom branding, SLA management, dedicated support |

### Consulting Services

| Service | Fee Range |
|---------|-----------|
| Performance Audit (one-time) | $5,000 – $15,000 |
| Continuous Performance (monthly) | $2,000 – $8,000/mo |
| Pre-Launch Assessment | $8,000 – $25,000 |
| Capacity Planning | $5,000 – $12,000 |
| Performance Remediation | $10,000 – $30,000 |

---

## 15. Git History

```
701516cb  Upgrade executive synthesis to Claude Opus 4.7
5145c91a  Rebrand from Y-QA to Sarfat across entire codebase
e5bc5c6f  Fix Express 5 wildcard route syntax for SPA fallback
b7aa8eb5  Initial commit: Y-QA Load Testing Platform
```

---

*Built by Sarfat Engineering — 9 April 2026*
