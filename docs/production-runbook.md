# DevSignal Production Runbook

**Last updated:** 2026-02-18
**Maintainer:** engineering@devsignal.dev
**Security incidents:** security@devsignal.dev

This document is written for an on-call engineer responding at 3 AM. Every section
is actionable. Skip the theory and follow the steps.

---

## Table of Contents

1. [Deployment](#1-deployment)
2. [Monitoring and Observability](#2-monitoring-and-observability)
3. [Common Operations](#3-common-operations)
4. [Incident Response](#4-incident-response)
5. [Troubleshooting](#5-troubleshooting)
6. [Disaster Recovery](#6-disaster-recovery)
7. [Security Procedures](#7-security-procedures)
8. [Scheduled Jobs Reference](#8-scheduled-jobs-reference)

---

## 1. Deployment

### Architecture Recap

```
[Railway / Docker Host]
  ├── app service      — Express API + static frontend (server.ts)
  ├── worker service   — BullMQ job processor (worker.ts)
  ├── postgres         — PostgreSQL 16 (primary datastore)
  └── redis            — Redis 7 (BullMQ queues + rate limiting + caching)
```

The app service runs migrations on every startup before accepting traffic
(`npx prisma migrate deploy`). The worker service starts only after the app
passes its health check.

---

### 1.1 Railway Deployment (Primary Path)

Railway watches the `main` branch and auto-deploys on every push.

**Manual redeploy (no code change):**

1. Open Railway dashboard -> select the `devsignal` project
2. Click the `app` service -> Deployments tab -> Redeploy latest

**Rollback to a previous deploy:**

1. Railway dashboard -> `app` service -> Deployments tab
2. Find the last known-good deployment
3. Click the three-dot menu -> Redeploy

**Check deployment status:**

```bash
# View recent deploy logs (Railway CLI)
railway logs --service app --tail 200

# Check worker
railway logs --service worker --tail 200
```

**Environment variable changes:**

1. Railway dashboard -> service -> Variables tab
2. Add or update the variable
3. Click Deploy (Railway does NOT auto-redeploy on variable changes)

---

### 1.2 Docker Compose Deployment (Self-Hosted / Fallback)

**First-time setup:**

```bash
# 1. Clone the repo
git clone https://github.com/nerobypaul/headless-crm.git
cd headless-crm

# 2. Create env file
cp .env.example .env
# Edit .env — fill in every value. See Section 1.4 for the required list.

# 3. Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# 4. Verify health
curl http://localhost:3000/health
# Expected: {"status":"ok",...}
```

**Deploy a new version:**

```bash
git pull origin main

# Rebuild app + worker images (postgres and redis keep their data volumes)
docker compose -f docker-compose.prod.yml build app worker

# Rolling restart: bring up new containers, stop old ones
docker compose -f docker-compose.prod.yml up -d --no-deps app worker
```

**Check service health:**

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs app --tail 100
docker compose -f docker-compose.prod.yml logs worker --tail 100
```

**Stop all services:**

```bash
docker compose -f docker-compose.prod.yml down
# Volumes are preserved. To also wipe data (DESTRUCTIVE):
docker compose -f docker-compose.prod.yml down -v
```

---

### 1.3 Database Migrations

Migrations run automatically on app startup via `railway-app.toml`:

```
startCommand = "npx prisma migrate deploy --schema ./prisma/schema.prisma && node dist/server.js"
```

**Run migrations manually (emergency):**

```bash
# Railway
railway run --service app npx prisma migrate deploy

# Docker Compose
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy

# Direct (if you have DATABASE_URL set locally)
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

**Check migration status:**

```bash
railway run --service app npx prisma migrate status
```

---

### 1.4 Environment Variables Checklist

All variables must be set before first deploy. Values marked REQUIRED have no
safe default.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | REQUIRED | `postgresql://user:pass@host:5432/devsignal` |
| `REDIS_HOST` | REQUIRED | Hostname only (no protocol) |
| `REDIS_PORT` | REQUIRED | Default: 6379 |
| `REDIS_PASSWORD` | optional | Set if Redis has auth enabled |
| `JWT_SECRET` | REQUIRED | Min 64 random bytes |
| `JWT_REFRESH_SECRET` | REQUIRED | Min 64 random bytes, different from JWT_SECRET |
| `JWT_EXPIRES_IN` | optional | Default: `15m` |
| `JWT_REFRESH_EXPIRES_IN` | optional | Default: `7d` |
| `CORS_ORIGIN` | REQUIRED | Production domain, e.g. `https://app.devsignal.dev` |
| `FRONTEND_URL` | REQUIRED | Same as CORS_ORIGIN |
| `API_URL` | REQUIRED | Backend URL |
| `NODE_ENV` | REQUIRED | Must be `production` |
| `PORT` | optional | Default: 3000 |
| `ANTHROPIC_API_KEY` | REQUIRED | AI briefs, enrichment, next-best-actions |
| `ANTHROPIC_MODEL` | optional | Default: claude-sonnet-4-5-20250929 |
| `STRIPE_SECRET_KEY` | REQUIRED | Billing |
| `STRIPE_WEBHOOK_SECRET` | REQUIRED | Stripe webhook signature verification |
| `RESEND_API_KEY` | REQUIRED | Transactional email |
| `SENTRY_DSN` | optional | Error tracking (strongly recommended in prod) |
| `GITHUB_CLIENT_ID` | optional | GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | optional | GitHub OAuth |
| `GOOGLE_CLIENT_ID` | optional | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | optional | Google OAuth |
| `VITE_API_URL` | build-time | Injected during Docker build for frontend |
| `POSTGRES_USER` | Docker only | Default: devsignal |
| `POSTGRES_PASSWORD` | Docker only | Change from default |
| `POSTGRES_DB` | Docker only | Default: devsignal |

---

### 1.5 First Deployment: Create Initial Admin

After the first successful deploy:

```bash
# Railway
railway run --service app node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
// Run your seed script or manually insert the first org + admin user
"

# OR use the register endpoint directly (it creates the first org)
curl -X POST https://app.devsignal.dev/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@yourcompany.com","password":"...","name":"Admin","organizationName":"DevSignal"}'
```

---

## 2. Monitoring and Observability

### 2.1 Health Check

```bash
curl https://app.devsignal.dev/health
```

Expected response (HTTP 200):

```json
{
  "status": "ok",
  "timestamp": "2026-02-18T03:00:00.000Z",
  "uptime": 86400,
  "database": "ok",
  "redis": "ok"
}
```

If `database` or `redis` is not `"ok"`, treat it as a P1 incident.

**Automated health check (cron-style monitoring):**

```bash
# Add to external uptime monitor (UptimeRobot, Better Uptime, etc.)
# URL: https://app.devsignal.dev/health
# Method: GET
# Expected status: 200
# Check interval: 1 minute
```

---

### 2.2 Sentry

- **Backend errors:** Sentry project `devsignal-backend`
- **Frontend errors:** Sentry project `devsignal-frontend`
- **Performance tracing:** enabled on all API routes

**What to look at during an incident:**

1. Issues tab -> sort by "First seen" to catch new regressions
2. Performance tab -> slowest transactions
3. Filter by `environment: production` and the incident time window

---

### 2.3 Key Metrics to Watch

| Metric | Healthy | Investigate | Alert |
|---|---|---|---|
| API p99 response time | < 500ms | 500ms-2s | > 2s |
| API error rate (5xx) | < 0.1% | 0.1-1% | > 1% |
| BullMQ queue depth (any queue) | < 100 | 100-1000 | > 1000 |
| BullMQ failed jobs | 0 | 1-10 | > 10 |
| Redis memory usage | < 150MB | 150-220MB | > 220MB (maxmemory is 256MB) |
| PostgreSQL connections | < 80 | 80-95 | > 95 |
| Worker process restart count | 0 | 1-2 | > 2 in 1h |

---

### 2.4 Logging

Logs are in JSON format in production (Winston). Each log entry has:

- `level`: error / warn / info / debug
- `message`: human-readable description
- `timestamp`: ISO 8601
- Context fields: `organizationId`, `userId`, `requestId`, `queue`, `jobId`, etc.

**Tailing logs:**

```bash
# Railway
railway logs --service app --tail 500
railway logs --service worker --tail 500

# Docker Compose
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f worker

# Filter for errors only
railway logs --service app | grep '"level":"error"'
```

**Common log patterns:**

```
# Successful request
{"level":"info","message":"POST /api/v1/signals 200 45ms"}

# Job started
{"level":"info","message":"Processing job","queue":"signal-processing","jobId":"..."}

# Job failed (will retry)
{"level":"error","message":"Job failed","queue":"webhook-delivery","attempt":2,"error":"..."}

# Rate limit triggered
{"level":"warn","message":"Rate limit exceeded","ip":"1.2.3.4","endpoint":"/api/v1/auth/login"}
```

---

### 2.5 Redis Monitoring

```bash
# Connect to Redis
railway run --service redis redis-cli
# Docker: docker compose -f docker-compose.prod.yml exec redis redis-cli

# Memory usage
INFO memory

# Key count and stats
INFO keyspace

# Connected clients
INFO clients

# BullMQ queue depths (each queue has waiting/active/delayed/failed lists)
# Format: bull:<queue-name>:wait
LLEN bull:signal-processing:wait
LLEN bull:webhook-delivery:wait
LLEN bull:score-computation:wait

# Check all queue waiting lengths at once
KEYS bull:*:wait
```

---

## 3. Common Operations

### 3.1 Scaling Services on Railway

**Scale app replicas (Railway Pro/Teams required):**

1. Railway dashboard -> `app` service -> Settings -> Scaling
2. Set desired number of replicas (start with 2 for HA)
3. Railway load-balances across replicas automatically

**Scale worker concurrency:**

Worker concurrency is set in `backend/src/jobs/workers.ts`. To increase it,
set `WORKER_CONCURRENCY` environment variable (if implemented) or edit the
`concurrency` option in code and redeploy.

For Railway, the fastest path to more throughput is adding a second worker
service instance with the same `railway-worker.toml` configuration.

---

### 3.2 Database Backup and Restore

**Railway managed backups:**

Railway provides continuous backups with point-in-time recovery (PITR).
Access them via: Railway dashboard -> database service -> Backups tab.

**Manual backup (Docker Compose or emergency):**

```bash
# Create a dump
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U devsignal devsignal > backup-$(date +%Y%m%d-%H%M%S).sql

# Or using pg_dump directly if you have DATABASE_URL
pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%Y%m%d-%H%M%S).dump
```

**Restore from dump:**

```bash
# Stop the app first to prevent writes during restore
docker compose -f docker-compose.prod.yml stop app worker

# Restore
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U devsignal devsignal < backup-TIMESTAMP.sql

# Or using pg_restore for Fc format
pg_restore -d "$DATABASE_URL" --no-owner backup-TIMESTAMP.dump

# Restart
docker compose -f docker-compose.prod.yml start app worker
```

---

### 3.3 Redis Cache Clearing

Redis holds: BullMQ job data, rate limit counters, and application cache.

**Clear only rate limit counters (safe during incident):**

```bash
redis-cli --scan --pattern "rl:*" | xargs redis-cli del
```

**Clear application cache (safe):**

```bash
redis-cli --scan --pattern "cache:*" | xargs redis-cli del
```

**CAUTION: Flush entire Redis (drops all BullMQ jobs too):**

```bash
# Only do this if you are certain queues can be rebuilt
redis-cli FLUSHDB
# After this, any in-flight jobs are lost. Re-trigger integrations manually.
```

---

### 3.4 Manually Triggering BullMQ Jobs

Use the Node.js REPL or a one-shot script. The pattern is the same for all queues.

```bash
# Get a shell in the app container
railway run --service app node
# Docker: docker compose -f docker-compose.prod.yml exec app node

# In the REPL:
const { Queue } = require('bullmq');
const redis = new (require('ioredis'))({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  family: 0  // Required for Railway IPv6
});

// Trigger a score snapshot for one org
const q = new Queue('score-snapshot', { connection: redis });
await q.add('capture-score-snapshot', { organizationId: 'org_abc123' });

// Trigger HubSpot sync for one org
const hs = new Queue('hubspot-sync', { connection: redis });
await hs.add('hubspot-sync', { organizationId: 'org_abc123', fullSync: true });

// Trigger demo cleanup manually
const cleanup = new Queue('demo-cleanup', { connection: redis });
await cleanup.add('demo-cleanup-manual', { trigger: 'manual' });

await redis.quit();
```

**Trigger the full score snapshot scheduler (all orgs):**

```bash
# This re-enqueues the scheduler sentinel, which worker picks up
# and fans out to per-org jobs
const q = new Queue('score-snapshot', { connection: redis });
await q.add('score-snapshot-scheduler', { organizationId: '__scheduler__' });
```

---

### 3.5 Rotating JWT Secrets (Rolling Rotation)

JWT secrets cannot be swapped instantly — existing refresh tokens would
be invalidated, logging everyone out. Use rolling rotation:

**Step 1: Add a secondary secret (no downtime)**

Add `JWT_SECRET_PREVIOUS` env var with the current value of `JWT_SECRET`.
Ensure the auth middleware accepts tokens signed with either secret.
*(If this code path does not yet exist, skip to the hot-swap procedure below.)*

**Step 2: Update the primary secret**

Set `JWT_SECRET` to the new random value (min 64 bytes):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Deploy the new env var.

**Step 3: Wait for refresh token TTL**

Default refresh TTL is 7 days. After 7 days, all tokens signed with the old
secret have expired. Remove `JWT_SECRET_PREVIOUS`.

**Hot-swap (forces everyone to log in again — use only if secret is compromised):**

1. Set `JWT_SECRET` to a new value
2. Set `JWT_REFRESH_SECRET` to a new value
3. Redeploy immediately
4. All existing sessions are invalidated — users must log in again
5. Notify users via status page

---

### 3.6 Rotating API Keys

DevSignal API keys are stored hashed in the database. Rotation requires the
user to generate a new key via the API or dashboard.

**Admin-forced rotation (if a key is compromised):**

```sql
-- Connect to the database and find the key
SELECT id, name, "organizationId", "lastUsedAt" FROM "ApiKey"
WHERE "keyPrefix" = 'dsk_abc'; -- prefix is shown in the dashboard

-- Revoke it immediately (hard delete or set revoked flag)
UPDATE "ApiKey" SET "revokedAt" = NOW() WHERE id = 'key_id_here';
```

Then notify the customer to generate a new key.

---

### 3.7 Adding a New Integration Source

1. Create the connector service in `backend/src/services/<name>-connector.ts`
2. Add a new Queue in `backend/src/jobs/queue.ts` (follow existing patterns)
3. Add the worker handler in `backend/src/jobs/workers.ts`
4. Add a scheduler entry in `backend/src/jobs/scheduler.ts` if periodic sync is needed
5. Add the sync route in `backend/src/routes/integrations.ts`
6. Update Prisma schema if new models or enum values are needed
7. Run `npx prisma migrate dev --name add_<name>_integration`
8. Run `npx prisma generate`
9. Add the QUEUE_NAMES constant in `queue.ts`
10. Test locally, then deploy

---

## 4. Incident Response

### 4.1 Severity Definitions

| Level | Definition | Examples |
|---|---|---|
| P1 | Complete outage — product unusable for all customers | App down, database unreachable, all auth broken |
| P2 | Major degradation — significant feature broken for most customers | Signal processing stopped, webhooks not delivering, login broken for subset |
| P3 | Minor degradation — non-critical feature broken, workaround exists | One integration sync failing, slow enrichment, search degraded |
| P4 | Cosmetic or minor — no functional impact | UI glitch, wrong label, log noise |

---

### 4.2 Response Time Targets

| Severity | Acknowledge | Mitigate | Resolve |
|---|---|---|---|
| P1 | 5 minutes | 30 minutes | 2 hours |
| P2 | 15 minutes | 1 hour | 4 hours |
| P3 | 1 hour | 4 hours | 24 hours |
| P4 | 1 business day | Next sprint | Next sprint |

---

### 4.3 Incident Response Steps

**1. Confirm the incident**

```bash
# Is the app responding?
curl -o /dev/null -s -w "%{http_code}" https://app.devsignal.dev/health

# Are there active Sentry alerts?
# Check Sentry dashboard

# Are queues backing up?
redis-cli LLEN bull:signal-processing:wait
```

**2. Assess blast radius**

- How many organizations are affected?
- Is it all customers or a subset (one org, one plan tier, one integration)?
- Is data at risk or only availability?

**3. Communicate immediately (P1/P2)**

Post to your status channel within 5 minutes — even if you do not have a
root cause yet (see Section 4.4 for template).

**4. Mitigate first, investigate second**

Common fast mitigations:
- **App unresponsive**: Redeploy last known-good version
- **Database connection pool exhausted**: Restart the app service (releases connections)
- **Redis full**: Clear cache keys (see Section 3.3)
- **Queue backed up**: Scale worker instances
- **Bad deploy**: Roll back (see Section 1.1)

**5. Root cause investigation**

After mitigation, use logs + Sentry to find the root cause.

**6. Post-incident review**

Within 48 hours of a P1 or P2 incident, complete the template in Section 4.5.

---

### 4.4 Status Update Template

Post this to your status channel on incident open, and update every 30 minutes
until resolved.

```
INCIDENT — [P1/P2/P3] — [SHORT TITLE]

Status: INVESTIGATING | MITIGATING | RESOLVED
Time detected: HH:MM UTC
Impact: [What is broken and who is affected]
Current action: [What you are doing right now]
Next update: HH:MM UTC

-- @engineer-name
```

**Resolution notice:**

```
RESOLVED — [SHORT TITLE]

Resolved at: HH:MM UTC
Duration: X hours Y minutes
Root cause: [One sentence]
Fix applied: [What was done]
Post-incident review: scheduled for [date]
```

---

### 4.5 Post-Incident Review Template

Create a file at `.changelog/postmortem-YYYY-MM-DD-<slug>.md`:

```markdown
# Postmortem: [Incident Title]

**Date:** YYYY-MM-DD
**Severity:** P1 / P2
**Duration:** X hours Y minutes
**Author:** @engineer

## Timeline (UTC)

- HH:MM — Incident detected
- HH:MM — [action taken]
- HH:MM — Mitigation applied
- HH:MM — Resolved

## Root Cause

[One paragraph explaining what broke and why]

## Contributing Factors

- [Factor 1]
- [Factor 2]

## Impact

- [N] organizations affected
- [N] minutes of downtime / degradation
- [Describe data impact if any]

## What Went Well

- [Thing 1]

## What Went Wrong

- [Thing 1]

## Action Items

| Action | Owner | Due |
|---|---|---|
| [Preventive fix] | @engineer | YYYY-MM-DD |
| [Monitoring improvement] | @engineer | YYYY-MM-DD |
```

---

## 5. Troubleshooting

### 5.1 App Not Starting

**Symptoms:** Health check returns non-200, app container keeps restarting.

**Checklist:**

```bash
# 1. Check startup logs for the first error
railway logs --service app --tail 500 | head -100

# Common errors:
#   "connect ECONNREFUSED" -> DATABASE_URL wrong or postgres not ready
#   "ENOTFOUND <hostname>" -> REDIS_HOST wrong
#   "P1001" (Prisma) -> database unreachable
#   "P3005" (Prisma) -> migration failed (schema conflict)
#   "address already in use" -> port conflict

# 2. Verify DATABASE_URL is reachable
railway run --service app node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => { console.log('DB OK'); c.end(); }).catch(e => console.error(e));
"

# 3. Verify Redis is reachable
railway run --service app node -e "
const Redis = require('ioredis');
const r = new Redis({ host: process.env.REDIS_HOST, port: process.env.REDIS_PORT, family: 0 });
r.ping().then(v => { console.log('Redis:', v); r.quit(); });
"

# 4. Check for failed migrations
railway run --service app npx prisma migrate status
```

---

### 5.2 Worker Queues Backing Up

**Symptoms:** Queue depth rising (see Section 2.3 thresholds), signals delayed,
webhooks not delivered, enrichment stale.

**Diagnosis:**

```bash
# Check queue depths for all queues
redis-cli --scan --pattern "bull:*:wait" | while read key; do
  echo "$key: $(redis-cli LLEN $key)"
done

# Check failed jobs
redis-cli --scan --pattern "bull:*:failed" | while read key; do
  echo "$key: $(redis-cli ZCARD $key)"
done

# Check worker logs for errors
railway logs --service worker --tail 500 | grep '"level":"error"'
```

**Common causes and fixes:**

| Cause | Fix |
|---|---|
| Worker process crashed | Redeploy worker service |
| Redis memory full | Clear cache keys (Section 3.3), increase maxmemory |
| External API rate limit (GitHub, HubSpot, etc.) | Pause the relevant sync queue, wait for rate limit window |
| Database slow (worker jobs time out) | Check pg slow queries (Section 5.3) |
| Concurrency too low for load | Add a second worker service instance |

**Pause a specific queue to stop adding load:**

```bash
# In Redis, mark the queue as paused (BullMQ respects this)
railway run --service app node -e "
const { Queue } = require('bullmq');
const redis = new (require('ioredis'))({ host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT, family: 0 });
const q = new Queue('hubspot-sync', { connection: redis });
await q.pause();
console.log('Queue paused');
await redis.quit();
"

# Resume it later
# await q.resume();
```

---

### 5.3 High API Response Times

**Symptoms:** p99 latency above 2s, user complaints about slow load.

**Step 1: Identify the slow endpoint**

Check Sentry Performance tab or filter logs:

```bash
railway logs --service app | grep -E '"duration":[0-9]{4,}' | tail -50
```

**Step 2: Check for slow PostgreSQL queries**

```sql
-- Connect to Postgres
-- Railway: railway connect postgres
-- Docker: docker compose exec postgres psql -U devsignal devsignal

-- Find queries running longer than 1 second right now
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '1 second'
  AND state != 'idle';

-- Top slow queries from pg_stat_statements (if enabled)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check for table bloat or missing indexes
SELECT schemaname, tablename, n_dead_tup, n_live_tup,
       round(n_dead_tup::numeric / nullif(n_live_tup,0) * 100, 1) AS dead_ratio
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;
```

**Step 3: Check Redis latency**

```bash
redis-cli --latency-history -i 1
# Normal: <1ms. If >5ms, Redis is under memory pressure.
```

**Step 4: Check database connection pool**

```sql
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction';
-- If "idle in transaction" is high -> connection leak, restart app service
```

---

### 5.4 Authentication Failures

**Symptoms:** Users get 401s, can't log in, JWT invalid errors.

```bash
# Check for JWT_SECRET mismatch (most common cause after a rotation)
railway logs --service app | grep -i "jwt\|token\|invalid\|unauthorized" | tail -50

# Verify JWT_SECRET is set and non-empty
railway run --service app node -e "console.log('JWT_SECRET length:', process.env.JWT_SECRET?.length)"

# Check system clock skew (tokens with wrong timestamps)
railway run --service app node -e "console.log(new Date().toISOString())"
# Compare with: date -u
```

**Common fixes:**

| Symptom | Cause | Fix |
|---|---|---|
| "invalid signature" | JWT_SECRET mismatch | Ensure secret matches across all app instances |
| "jwt expired" for fresh tokens | Clock skew > token TTL | Sync server time (NTP), increase `JWT_EXPIRES_IN` |
| Refresh token rejected | JWT_REFRESH_SECRET rotated | See Section 3.5 rolling rotation |
| OAuth callback fails | Redirect URI mismatch | Update OAuth app config with correct production URL |

---

### 5.5 Webhook Delivery Failures

**Symptoms:** Customers report not receiving webhook events. `webhook-delivery`
queue has high failure count.

```bash
# Check failed webhook jobs
redis-cli ZRANGE bull:webhook-delivery:failed 0 9

# Check worker logs for delivery errors
railway logs --service worker | grep "webhook-delivery" | grep error | tail -20
```

**Common causes:**

| Cause | Diagnosis | Fix |
|---|---|---|
| Target URL unreachable | HTTP error in job payload | Customer must fix their endpoint |
| HMAC signature rejected | Log shows 4xx from target | Verify `WEBHOOK_SECRET` matches what customer expects |
| Payload too large | 413 from target | Check signal metadata size |
| All 5 retries exhausted | Job in failed set | Manually re-enqueue after customer fixes endpoint |

**Manually re-enqueue failed webhook jobs:**

```bash
railway run --service app node -e "
const { Queue } = require('bullmq');
const redis = new (require('ioredis'))({ host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT, family: 0 });
const q = new Queue('webhook-delivery', { connection: redis });
const failed = await q.getFailed(0, 100);
for (const job of failed) {
  await job.retry();
}
console.log('Re-enqueued', failed.length, 'jobs');
await redis.quit();
"
```

---

### 5.6 Rate Limiting Issues

**Symptoms:** Legitimate requests getting 429, or rate limits not being enforced.

**Verify Redis rate limit keys are working:**

```bash
redis-cli --scan --pattern "rl:*" | head -20
# If empty and NODE_ENV=production, rate limiting is falling back to in-memory
# (lost on restart) — check Redis connectivity
```

**Configuration reference (`backend/src/middleware/rate-limit.ts`):**

| Limiter | Endpoint | Limit |
|---|---|---|
| `authLimiter` | `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/forgot-password` | 5 req/min per IP |
| `apiLimiter` | `/api/v1/*` | 100 req/min per IP |
| `webhookLimiter` | `/api/v1/webhooks/*` | 200 req/min per IP |
| `demoLimiter` | `/api/v1/demo/*` | 10 req/min per IP |
| `signalLimiter` | `/api/v1/signals` | 500 req/min per IP |

**If a legitimate customer is being rate limited:**

Identify their IP from logs and check their request pattern. If legitimate,
consider IP allowlisting or increasing limits for their tier. Changes require
a code change and redeploy.

---

### 5.7 Memory Leaks

**Symptoms:** Worker or app process memory growing unbounded, OOM kills.

**Diagnose:**

```bash
# Check container memory usage
railway metrics --service app  # if available
docker stats devsignal-app devsignal-worker  # Docker Compose

# Check for connection pool exhaustion
# In PostgreSQL:
SELECT count(*) FROM pg_stat_activity;
# If near max_connections (default 100), app is not releasing connections

# Check for unclosed Redis connections
redis-cli INFO clients
# "connected_clients" should be proportional to app instances * pool size
```

**Common causes:**

| Cause | Fix |
|---|---|
| Prisma connection not released | Ensure `prisma.$disconnect()` is called in shutdown handler |
| BullMQ workers not closed | Ensure `closeAllWorkers()` is called on SIGTERM |
| Event listeners accumulating | Look for `on()` calls not paired with `off()` in long-lived services |
| Large result sets loaded into memory | Add pagination to database queries returning large arrays |

**Emergency fix (leak but service otherwise healthy):**

Schedule a rolling restart during low-traffic hours:

```bash
# Railway: redeploy triggers graceful restart (SIGTERM -> 30s -> SIGKILL)
railway redeploy --service app
railway redeploy --service worker
```

---

## 6. Disaster Recovery

### 6.1 Objectives

| Metric | Target |
|---|---|
| RTO (Recovery Time Objective) | 1 hour |
| RPO (Recovery Point Objective) | 1 hour |

These targets assume Railway infrastructure is available. If Railway itself
is down, see Section 6.4 (failover to Docker Compose).

---

### 6.2 Full System Restore Procedure

Use this when the entire environment needs to be rebuilt from scratch.

**Step 1: Provision infrastructure**

- New Railway project with PostgreSQL and Redis plugins
- OR new server with Docker installed

**Step 2: Restore environment variables**

Keep a copy of all production env vars in a secure secrets manager
(1Password, Vault, AWS Secrets Manager). Retrieve and apply them.

**Step 3: Restore the database**

```bash
# From Railway backup:
# Railway dashboard -> postgres service -> Backups -> Restore point

# From pg_dump file:
pg_restore -d "$NEW_DATABASE_URL" --no-owner backup.dump
```

**Step 4: Deploy the application**

```bash
# Railway (connect new project to repo)
railway link
railway up

# Docker Compose
git clone https://github.com/nerobypaul/headless-crm.git
cd headless-crm
cp .env.example .env  # restore from secrets manager
docker compose -f docker-compose.prod.yml up -d --build
```

**Step 5: Run migrations**

```bash
railway run --service app npx prisma migrate deploy
```

**Step 6: Verify**

```bash
curl https://new-domain.devsignal.dev/health
# Expected: 200 {"status":"ok","database":"ok","redis":"ok"}
```

**Step 7: Update DNS**

Point the production domain to the new environment. TTL propagation: 0-5 min
if TTL was already low, up to 48h otherwise.

**Step 8: Smoke test**

- Log in as admin
- Verify signals are being ingested
- Verify at least one integration sync completes
- Verify a webhook delivers

---

### 6.3 Database Point-in-Time Recovery

**Railway (preferred):**

1. Railway dashboard -> `postgres` service -> Backups tab
2. Select a recovery point (Railway provides PITR with ~1h granularity)
3. Click Restore — this creates a new database instance
4. Update `DATABASE_URL` in the app and worker services
5. Redeploy app and worker

**Manual PITR with WAL archives (Docker Compose with WAL-G):**

This requires WAL-G to be configured at postgres setup time. If it is,
follow the WAL-G restore procedure using the archived WAL segments.

---

### 6.4 Failover: Railway -> Docker Compose

If Railway is experiencing a platform outage:

1. Provision a cloud VM (DigitalOcean Droplet, AWS EC2, Hetzner) with Docker
2. Restore database from the most recent backup (Section 6.2 Step 3)
3. Deploy with Docker Compose (Section 1.2)
4. Update DNS to point to the new IP
5. Monitor for 30 minutes before declaring stable

Estimated time: 45-60 minutes.

---

## 7. Security Procedures

### 7.1 Credential Rotation Schedule

| Credential | Rotation Frequency | Owner |
|---|---|---|
| `JWT_SECRET` | Every 90 days or immediately on compromise | Engineering |
| `JWT_REFRESH_SECRET` | Every 90 days or immediately on compromise | Engineering |
| `STRIPE_SECRET_KEY` | Annually or on compromise | Engineering |
| `ANTHROPIC_API_KEY` | Annually or on compromise | Engineering |
| `RESEND_API_KEY` | Annually or on compromise | Engineering |
| `GITHUB_CLIENT_SECRET` | Annually | Engineering |
| `GOOGLE_CLIENT_SECRET` | Annually | Engineering |
| Database passwords | Every 180 days | Engineering |
| Redis password | Every 180 days | Engineering |
| Customer API keys | On customer request or suspicion of compromise | Engineering (per customer) |

---

### 7.2 Security Patch Process

1. **Dependabot / manual audit:** Run `npm audit` weekly against the monorepo root
2. **Triage:** Classify findings by CVSS score — critical (>= 9.0) gets patched
   within 24h, high (7.0-8.9) within 7 days, medium/low in next sprint
3. **Test:** Apply patch in a branch, run `npm test` and E2E suite (`npx playwright test`)
4. **Deploy:** Merge to main, Railway auto-deploys

```bash
# Check for vulnerabilities
npm audit --workspace=backend
npm audit --workspace=frontend
npm audit --workspace=packages/sdk

# Fix auto-fixable issues
npm audit fix --workspace=backend
```

---

### 7.3 Vulnerability Disclosure

External vulnerability reports should be sent to **security@devsignal.dev**.

Triage SLA:
- **Critical / High:** Acknowledge within 24 hours, patch within 72 hours
- **Medium:** Acknowledge within 72 hours, patch within 30 days
- **Low / Informational:** Acknowledge within 7 days, schedule in next sprint

---

### 7.4 Access Control Review

Review quarterly:
- Railway project members — remove any former team members
- GitHub repository collaborators
- Sentry team members
- Stripe restricted key holders
- Any shared OAuth app credentials

---

### 7.5 Incident: Suspected Credential Compromise

If any secret is suspected to be compromised:

1. **Rotate immediately** — do not wait to confirm (see Section 7.1 for each credential)
2. **Audit logs** — check Railway deploy logs and Sentry for unauthorized actions
3. **Database audit** — check for unusual data access patterns

```sql
-- Check for unusual org creation (may indicate leaked registration endpoint)
SELECT id, name, "createdAt" FROM "Organization"
ORDER BY "createdAt" DESC LIMIT 20;

-- Check for unusual API key usage
SELECT k.id, k."keyPrefix", k."lastUsedAt", o.name as org
FROM "ApiKey" k JOIN "Organization" o ON k."organizationId" = o.id
ORDER BY k."lastUsedAt" DESC LIMIT 20;
```

4. **Notify affected customers** if their data was accessed
5. **File a postmortem** (Section 4.5)

---

## 8. Scheduled Jobs Reference

All cron jobs are registered via BullMQ repeatable jobs in
`backend/src/jobs/scheduler.ts`. They run in the worker process.

### 8.1 Job Schedule

| Job Name | Cron | Description |
|---|---|---|
| `sync-all-npm` | `0 */6 * * *` | Sync npm package download signals for all connected packages |
| `sync-all-pypi` | `0 */12 * * *` | Sync PyPI download signals |
| `hubspot-sync-scheduler` | `*/15 * * * *` | Fan out HubSpot sync to all connected orgs |
| `discord-sync-scheduler` | `*/30 * * * *` | Fan out Discord sync to all connected orgs |
| `salesforce-sync-scheduler` | `*/15 * * * *` | Fan out Salesforce sync to all connected orgs |
| `stackoverflow-sync-scheduler` | `0 */6 * * *` | Fan out Stack Overflow sync to all connected orgs |
| `twitter-sync-scheduler` | `*/30 * * * *` | Fan out Twitter/X mention sync to all connected orgs |
| `reddit-sync-scheduler` | `0 */2 * * *` | Fan out Reddit mention sync to all connected orgs |
| `linkedin-sync-scheduler` | `0 */6 * * *` | Fan out LinkedIn sync to all connected orgs |
| `posthog-sync-scheduler` | `0 * * * *` | Fan out PostHog event sync to all connected orgs |
| `clearbit-enrichment-scheduler` | `0 3 * * *` | Auto-enrich companies missing Clearbit data (daily 3 AM UTC) |
| `score-snapshot-scheduler` | `0 2 * * *` | Capture PQA score snapshots for all orgs (daily 2 AM UTC) |
| `weekly-digest-scheduler` | `0 9 * * 1` | Send weekly signal digest emails (Mondays 9 AM UTC) |
| `demo-cleanup-scheduler` | `0 4 * * *` | Remove demo orgs older than 24 hours (daily 4 AM UTC) |

---

### 8.2 Verifying Scheduled Jobs Are Running

```bash
# Check repeatable jobs registered in Redis
railway run --service app node -e "
const { Queue } = require('bullmq');
const redis = new (require('ioredis'))({ host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT, family: 0 });
const q = new Queue('score-snapshot', { connection: redis });
const repeatable = await q.getRepeatableJobs();
console.log(JSON.stringify(repeatable, null, 2));
await redis.quit();
"
```

If the list is empty, the scheduler was never initialized. Trigger a worker
restart — the scheduler runs `setupScheduler()` on worker startup.

---

### 8.3 Manually Re-Running a Scheduled Job

Use the pattern in Section 3.4. Example for the score snapshot:

```bash
railway run --service app node -e "
const { Queue } = require('bullmq');
const redis = new (require('ioredis'))({ host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT, family: 0 });
const q = new Queue('score-snapshot', { connection: redis });
// Trigger scheduler sentinel — worker fans out to all orgs
await q.add('score-snapshot-scheduler', { organizationId: '__scheduler__' }, { jobId: 'manual-score-snapshot-' + Date.now() });
console.log('Score snapshot job enqueued');
await redis.quit();
"
```

---

### 8.4 Removing a Stuck Repeatable Job

If a scheduled job is stuck in an infinite retry loop:

```bash
railway run --service app node -e "
const { Queue } = require('bullmq');
const redis = new (require('ioredis'))({ host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT, family: 0 });
const q = new Queue('hubspot-sync', { connection: redis });

// List repeatable jobs and their keys
const jobs = await q.getRepeatableJobs();
console.log(jobs);

// Remove a specific repeatable job by its key (from the list above)
await q.removeRepeatableByKey('YOUR_REPEATABLE_JOB_KEY_HERE');

// Clean failed jobs older than 24h
await q.clean(24 * 60 * 60 * 1000, 100, 'failed');

await redis.quit();
"
```

---

## Quick Reference Card

**Health check:** `curl https://app.devsignal.dev/health`

**App logs (Railway):** `railway logs --service app --tail 200`

**Worker logs (Railway):** `railway logs --service worker --tail 200`

**Redis connect:** `railway run --service redis redis-cli`

**DB connect:** `railway connect postgres`

**Redeploy app:** Railway dashboard -> app service -> Deployments -> Redeploy

**Run migration:** `railway run --service app npx prisma migrate deploy`

**P1 contact:** Post in #incidents Slack channel, page on-call engineer

**Security issues:** security@devsignal.dev

---

*This runbook is a living document. Update it whenever a new operational
procedure is established or an incident reveals a missing entry.*
