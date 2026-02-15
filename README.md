<div align="center">

<!-- Replace with actual logo when available -->
# DevSignal

**Turn developer signals into pipeline.**

[![Build](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/nerobypaul/headless-crm)
[![Tests](https://img.shields.io/badge/tests-288%20passing-brightgreen)](https://github.com/nerobypaul/headless-crm)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

DevSignal is an open-source developer signal intelligence platform that helps devtool companies identify, score, and convert their most engaged developers into paying customers.

[Quick Start](#quick-start) | [Features](#key-features) | [SDK](#sdk-usage) | [Architecture](#architecture) | [Pricing](#pricing)

</div>

---

## Why This Exists

Devtool companies have a blind spot: thousands of developers use their tools every day, but there is no way to know who they are, which companies they work for, or when they are ready to buy. The signal data is scattered across GitHub, npm, Stack Overflow, Discord, and a dozen other places.

Existing solutions like Common Room ($1,000+/mo) and Reo.dev ($500+/mo) are built for enterprise budgets. DevSignal delivers the same intelligence at a fraction of the cost, and you can self-host it for free.

## Key Features

**13 Signal Sources** -- Ingest developer activity from GitHub (stars, forks, issues, PRs), npm, PyPI, Segment, Slack, Discord, Stack Overflow, Twitter/X, Reddit, PostHog, Clearbit, HubSpot, and Salesforce.

**PQA Scoring (0-100)** -- Product-Qualified Account scoring with customizable rules. Automatically tier accounts as HOT, WARM, or COLD based on signal velocity, breadth, and recency.

**Identity Resolution** -- Tie anonymous activity across platforms to real people and companies. Match GitHub usernames to Stack Overflow profiles to Slack accounts to email addresses.

**AI-Powered Account Briefs** -- Generate executive summaries for any account using Claude. Get context on what a company does, how they use your product, and what to say in outreach.

**CRM Sync** -- Bidirectional sync with HubSpot and Salesforce. Push scored accounts and contacts to your existing pipeline without changing workflows.

**Automated Workflows and Playbooks** -- 10 pre-built playbooks covering acquisition, expansion, retention, and engagement. Trigger actions on signal_received, contact_created, deal_stage_changed, or score_changed.

**Email Sequences** -- Multi-step drip campaigns with personalization, delay scheduling, and send-time optimization.

**Outbound Webhooks** -- Subscribe to 8 event types (signal.created, contact.created, score.changed, and more) with HMAC-SHA256 signing. Native Zapier and Make integration via REST Hooks.

**Real-time WebSocket Updates** -- Live signal feed with JWT-authenticated, organization-scoped broadcast.

**GraphQL + REST API** -- Full GraphQL API with DataLoader (11 loaders) plus REST endpoints. API key authentication for programmatic access.

**Node.js SDK** -- Zero-dependency `@devsignal/node` package for signal ingestion and data access.

## Architecture

```
Frontend    React 18 + Vite + TailwindCSS + React Router v6
               |
API         Express + Apollo GraphQL + WebSocket (ws)
               |
Services    Prisma ORM + BullMQ (16 queues) + Redis cache
               |
Data        PostgreSQL + Redis
               |
External    13 connectors + Resend email + Claude AI + Sentry
```

**By the numbers:**

| Metric | Count |
|---|---|
| Prisma models | 33 |
| BullMQ job queues | 16 |
| Data source connectors | 13 |
| GraphQL DataLoaders | 11 |
| Tests passing | 288 |
| Frontend pages | 35+ (code-split, 250KB initial bundle) |

## Quick Start

### Docker (recommended)

```bash
# 1. Clone the repo
git clone https://github.com/nerobypaul/headless-crm.git
cd headless-crm

# 2. Configure environment
cp .env.example .env
# Edit .env -- at minimum set JWT_SECRET and JWT_REFRESH_SECRET

# 3. Start everything
docker compose -f docker-compose.prod.yml up -d --build

# 4. Open the app
open http://localhost:3000
```

This starts four containers: PostgreSQL 16, Redis 7, the API server (serving the static frontend), and BullMQ workers. The app runs database migrations automatically on first boot.

### Local Development

```bash
# Install dependencies
npm install

# Start PostgreSQL and Redis
docker compose up -d postgres redis

# Run database migrations
cd backend && npx prisma migrate deploy && cd ..

# Start backend and frontend in parallel
npm run dev --workspace=backend &
npm run dev --workspace=frontend
```

The frontend dev server proxies `/api` requests to the backend at `http://localhost:3000`.

## SDK Usage

```bash
npm install @devsignal/node
```

```typescript
import { DevSignal } from '@devsignal/node';

const ds = new DevSignal({ apiKey: 'ds_live_xxxxxxxxxxxx' });

// Ingest a signal from your application
await ds.signals.ingest({
  type: 'feature_used',
  sourceId: 'app',
  metadata: { feature: 'dashboard', action: 'viewed' },
});

// Query top accounts by PQA score
const top = await ds.scores.topAccounts({ limit: 10, tier: 'HOT' });

// Create or update a contact
await ds.contacts.upsert({
  email: 'dev@company.com',
  firstName: 'Jane',
  lastName: 'Doe',
  company: 'Acme Corp',
});
```

The SDK also exposes `companies`, `deals`, and `scores` resources. See [`packages/sdk/`](packages/sdk/) for the full API.

## Pricing

DevSignal is open-source and free to self-host. Managed hosting tiers:

| | Free | Pro | Growth | Scale |
|---|---|---|---|---|
| **Price** | $0/mo | $79/mo | $199/mo | $299/mo |
| **Contacts** | 1,000 | 25,000 | 100,000 | Unlimited |
| **Signals/mo** | 5,000 | 100,000 | 500,000 | Unlimited |
| **Users** | 1 | 10 | 25 | Unlimited |
| **Signal Sources** | 3 | All 13 | All 13 | All 13 |
| **AI Briefs** | -- | 50/mo | 500/mo | Unlimited |
| **CRM Sync** | -- | HubSpot | HubSpot + Salesforce | HubSpot + Salesforce |
| **SSO/SAML** | -- | -- | -- | Yes |
| **SLA** | -- | -- | -- | 99.9% |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS, React Router v6 |
| API | Express, Apollo Server (GraphQL), WebSocket (ws) |
| Database | PostgreSQL 16, Prisma ORM (33 models) |
| Cache and Queue | Redis 7, BullMQ (16 queues) |
| Auth | JWT + refresh tokens, API keys, SAML SSO, OIDC (PKCE), GitHub OAuth, Google OAuth |
| AI | Claude API (account briefs, contact enrichment, next-best-actions) |
| Email | Resend SDK |
| Search | PostgreSQL tsvector with weighted relevance (A/B/C/D) |
| Monitoring | Sentry (backend + frontend) |
| SDK | @devsignal/node (TypeScript, zero dependencies) |
| Deployment | Docker multi-stage build (4 stages), docker-compose, Railway |
| Testing | Jest (unit, 288 tests), Playwright (E2E, 38 specs) |

## Project Structure

```
devsignal/
  backend/
    src/
      controllers/      # Request handlers
      services/         # Business logic + 13 connectors
      routes/           # REST API endpoints
      graphql/          # Schema, resolvers, DataLoaders
      jobs/             # BullMQ queues, workers, scheduler
      middleware/       # Auth, RBAC, rate limiting
    prisma/             # Schema (33 models) + migrations
  frontend/
    src/
      pages/            # 35+ route pages (code-split with React.lazy)
      components/       # Shared UI components
      lib/              # API client, utilities
  packages/
    sdk/                # @devsignal/node SDK
  e2e/                  # Playwright end-to-end tests
  docker-compose.prod.yml
  Dockerfile            # Multi-stage production build
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

```bash
# Run unit tests
npm test --workspace=backend

# Run E2E tests
npx playwright test --config=e2e/playwright.config.ts

# Lint
npm run lint --workspace=backend
npm run lint --workspace=frontend
```

## License

[MIT](LICENSE)

---

<div align="center">

Built for devtool companies that want to know who loves their product.

</div>
