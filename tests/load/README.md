# DevSignal Load Test — Show HN Traffic Simulator

Pure Node.js load testing setup (zero external dependencies) that simulates
the traffic pattern of a Hacker News front-page post.

## Quick start

```bash
# Start the backend first
npm run dev --workspace=backend

# Quick smoke test (~60 seconds)
npm run test:load:quick

# Full 4-hour simulation
npm run test:load

# Custom duration (minutes)
node tests/load/run.js --duration 10

# Against a deployed target
LOAD_TEST_URL=https://app.devsignal.dev npm run test:load:quick
```

## What it simulates

| Endpoint | Weight | Auth | Rate Limit |
|----------|--------|------|------------|
| `GET /` (landing page) | 40% | No | None |
| `GET /health` | 10% | No | None |
| `GET /api-docs.json` | 10% | No | 100/min |
| `GET /api/v1/demo/status` | 10% | No | 3/min |
| `POST /api/v1/demo/seed` | 5% | No | 3/min |
| `GET /api/v1/companies` | 10% | Yes | 100/min |
| `POST /api/v1/signals` | 5% | Yes | 500/min |
| `POST /api/v1/auth/login` | 5% | No | 5/min |
| `GET /api/v1/contacts` | 5% | Yes | 100/min |

## Traffic pattern (full mode)

```
Concurrency
50 |          ___________
   |         /           \
30 |        /             \
   |       /               \
20 |      /                 \___________
   |     /                              \
 2 |____/                                \___
   |----+------+------+------+------+------+-> Time
   0   15min  105min  165min              240min
       ramp    peak    sustained          tail
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOAD_TEST_URL` | `http://localhost:3000` | Target server URL |
| `LOAD_TEST_TOKEN` | *(auto via demo/seed)* | JWT token for auth endpoints |
| `LOAD_TEST_ORG_ID` | *(auto via demo/seed)* | Organization ID for auth endpoints |

## Output

- Terminal report with P50/P95/P99 latency, RPS, error rate
- JSON report saved to `tests/load/results/report-<timestamp>.json`

## Interpreting results

- **429 on /demo/seed and /auth/login** — Expected. Rate limiters are working.
- **401 on authenticated endpoints** — Expected if no token provided.
- **P95 < 500ms** — Production ready.
- **P99 < 2000ms** — Acceptable under heavy load.
- **5xx error rate > 5%** — Needs investigation.
- **5xx error rate < 1%** — Excellent.

## Files

```
tests/load/
  run.js          Main entry point
  config.js       Endpoint definitions, traffic phases
  http-client.js  Minimal HTTP client (node:http/https)
  stats.js        Statistics collector and report formatter
  results/        Auto-generated JSON reports (gitignored)
  README.md       This file
```
