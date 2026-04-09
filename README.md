# Y-QA Load Testing Platform

**AI-Powered Performance Testing & Resilience Validation**

A full-stack, enterprise-grade load testing platform combining k6's industrial-strength engine with Claude AI analysis to deliver automated bottleneck detection, capacity forecasting, and executive-ready reporting.

## Overview

| Feature | Description |
|---------|-------------|
| **Load Engine** | k6 (Grafana) — 30K+ VUs, 300K RPS per instance |
| **AI Analysis** | 3-pass Claude pipeline: Metrics → Infrastructure → Executive Synthesis |
| **Protocols** | HTTP/HTTPS, WebSocket, gRPC, GraphQL |
| **Test Creation** | Visual builder, Monaco script editor, AI generation, API spec import |
| **Reporting** | Executive summaries, technical deep-dives, SLA compliance, capacity planning |
| **Baselines** | Automated regression detection with statistical significance |
| **Real-time** | WebSocket-powered live dashboard during test execution |

## Tech Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 4, Recharts, Framer Motion, Monaco Editor
- **Backend**: Express 5, Node.js 20+, WebSocket
- **Load Engine**: k6 (Grafana)
- **Database**: PostgreSQL 16 (with optional TimescaleDB for time-series)
- **AI**: Anthropic Claude (Sonnet for analysis, Opus for synthesis)
- **Auth**: bcryptjs, Bearer tokens

## Quick Start

### Prerequisites

- Node.js >= 20
- PostgreSQL >= 16
- k6 ([install](https://grafana.com/docs/k6/latest/set-up/install-k6/))

### Setup

```bash
# Clone and install
cd Load-Testing
npm install

# Set environment variables
export DATABASE_URL=postgresql://user:pass@localhost:5432/yqa_loadtest
export ANTHROPIC_API_KEY=sk-ant-...    # Optional, enables AI analysis
export PORT=3006                        # Optional, defaults to 3006

# Initialize database
npm run migrate

# Seed demo data (optional)
npm run seed

# Development
npm run dev:all    # Starts Vite dev server + Express API

# Production
npm run build
npm start
```

### Default Login

- Email: `admin@sarfat.io`
- Password: `loadtest2026`

## Architecture

```
┌──────────────────────────────────────────────┐
│              React SPA (Vite)                 │
│  Dashboard │ Builder │ Monitor │ Reports      │
└──────────────┬───────────────────────────────┘
               │ HTTP / WebSocket
┌──────────────▼───────────────────────────────┐
│            Express API Server                 │
│  Auth │ Tests │ Runs │ Analysis │ Reports     │
├───────────────┬───────────┬──────────────────┤
│   k6 Engine   │  Claude   │   PostgreSQL     │
│  (child proc) │    AI     │   (data store)   │
└───────────────┴───────────┴──────────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Authenticate |
| GET | `/api/v1/dashboard` | Dashboard stats |
| GET/POST | `/api/v1/tests` | Test CRUD |
| POST | `/api/v1/tests/:id/run` | Execute a test |
| GET | `/api/v1/runs` | List test runs |
| GET | `/api/v1/runs/:id` | Run details |
| POST | `/api/v1/runs/:id/abort` | Abort running test |
| GET | `/api/v1/runs/:id/metrics` | Run metrics |
| GET | `/api/v1/runs/:id/endpoints` | Endpoint breakdown |
| POST | `/api/v1/runs/:id/analyze` | Trigger AI analysis |
| POST | `/api/v1/runs/:id/reports` | Generate report |
| GET/POST | `/api/v1/baselines` | Baseline management |
| GET | `/api/v1/runs/:id/regression` | Regression detection |
| GET | `/api/v1/compare/:id1/:id2` | Compare two runs |
| GET/POST | `/api/v1/slas` | SLA definitions |
| POST | `/api/v1/import/openapi` | Import OpenAPI spec |
| POST | `/api/v1/import/har` | Import HAR file |
| POST | `/api/v1/import/postman` | Import Postman collection |
| POST | `/api/v1/import/graphql` | Import GraphQL schema |
| POST | `/api/v1/ai/generate-test` | AI test generation |

## Test Types

| Type | Description |
|------|-------------|
| **Smoke** | Verify script works with 1-5 VUs |
| **Load** | Validate under expected traffic |
| **Stress** | Find the breaking point |
| **Spike** | Test sudden traffic surges |
| **Soak** | Detect issues under sustained load (hours) |
| **Breakpoint** | Find exact capacity ceiling |
| **Scalability** | Measure scaling characteristics |

## AI Analysis Pipeline

1. **Pass 1 — Metric Analysis** (Claude Sonnet): Performance profiling, bottleneck identification, anomaly detection
2. **Pass 2 — Infrastructure Correlation** (Claude Sonnet): Resource bottleneck mapping, capacity ceiling estimation
3. **Pass 3 — Executive Synthesis** (Claude Opus): Business-impact summary, go/no-go recommendation, remediation roadmap

## Importing Tests

Generate k6 scripts automatically from:
- **OpenAPI/Swagger** specifications (JSON or YAML)
- **HAR files** (browser recordings)
- **Postman collections**
- **GraphQL schemas** (introspection or SDL)
- **Natural language** descriptions (via AI)

## Deployment

### Heroku

```bash
heroku create your-app-name
heroku addons:create heroku-postgresql:essential-0
heroku config:set ANTHROPIC_API_KEY=sk-ant-...
git push heroku main
```

### Docker

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y curl gpg && \
    curl -s https://dl.k6.io/key.gpg | gpg --dearmor > /usr/share/keyrings/k6-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" > /etc/apt/sources.list.d/k6.list && \
    apt-get update && apt-get install -y k6
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 3006
CMD ["node", "server.js"]
```

## Portfolio

Part of the Sarfat quality assurance suite:

| Program | Focus |
|---------|-------|
| **ISO 27001 Certification** | Compliance & governance |
| **Y-QA Pen Testing** | Security assessment |
| **Tech Due Diligence** | Investment-grade technical review |
| **Y-QA Load Testing** | Performance & resilience validation |

## License

Proprietary — Sarfat Holdings

---

*Built with precision by Sarfat Engineering*
