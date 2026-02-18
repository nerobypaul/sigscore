<div align="center">

# DevSignal

**Developer Signal Intelligence for devtool companies.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-288%20passing-brightgreen)](https://github.com/nerobypaul/headless-crm)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](Dockerfile)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/nerobypaul/headless-crm/pulls)

Know which developers love your product. Convert them into paying customers.

[Quick Start](#quick-start) | [Features](#features) | [Architecture](#architecture) | [SDK](#sdk) | [API](#api) | [Pricing](#pricing)

</div>

---

## What is DevSignal?

DevSignal aggregates developer activity across 16 signal sources -- GitHub stars, npm downloads, Stack Overflow questions, Discord messages, Reddit mentions, and more -- and ties that activity to real people and real companies. It scores every account on a 0-100 PQA (Product-Qualified Account) scale so your team knows exactly who is ready to buy.

If you run a devtool company, your best leads are already using your product. They are starring your repos, asking questions in your Discord, importing your SDK in production. DevSignal captures those signals, resolves identities across platforms, and surfaces the accounts that matter -- before they ever fill out a form.

Self-host it for free or use the managed service starting at $0/month. Either way, you get the same intelligence that Common Room charges $1,000+/month for.

## Live Demo

Try DevSignal now -- no signup required:

**[Launch Live Demo](https://devsignal.dev/landing)** -- Click "Try Live Demo" on the landing page to get a pre-seeded environment with realistic data.

## Why Not a CRM?

Every PLG CRM startup from the 2021-2023 wave is dead or pivoted. Calixa, Koala, Toplyne, Endgame, Pocus -- they all tried to bolt product data onto a traditional CRM and failed. The problem was never "we need another CRM." The problem was "we have no idea which developers care about our product."

DevSignal is not a CRM. It is a signal intelligence layer. It ingests developer activity, resolves identities, scores accounts, and pushes the results to whatever CRM you already use (HubSpot, Salesforce, or your own systems via API). It does one thing well: tell you who your most engaged developers are and when they are ready for a conversation.

## Features

### Signal Collection

- **16 signal sources** -- GitHub (stars, forks, issues, PRs), npm, PyPI, Segment, Slack, Discord, Stack Overflow, Twitter/X, Reddit, PostHog, Clearbit, LinkedIn, Intercom, Zendesk, and HubSpot
- **Real-time ingestion** via WebSocket and webhook listeners
- **Custom signals** via SDK or REST API -- track any event from your own application

### Scoring and Intelligence

- **PQA scoring (0-100)** with customizable rules -- weight signal types, set thresholds, auto-tier accounts as HOT/WARM/COLD
- **Identity resolution** across platforms -- match GitHub usernames to emails to Slack handles to company domains
- **AI account briefs** powered by Claude -- generate executive summaries, enrichment data, and next-best-action recommendations
- **Contact enrichment queue** with bulk processing

### Automation

- **10 pre-built playbooks** covering acquisition, expansion, retention, and engagement
- **Workflow engine** with triggers on signal_received, contact_created, deal_stage_changed, score_changed
- **Email sequences** with multi-step drip campaigns, personalization, and delay scheduling
- **Outbound webhooks** (8 event types, HMAC-SHA256 signed) with native Zapier/Make support

### CRM Sync

- **Bidirectional HubSpot sync** -- push scored accounts, pull deal updates
- **Bidirectional Salesforce sync** -- same as above, for enterprise
- **CRM import wizard** -- migrate existing data from CSV or direct API connection

### Platform

- **50 pages** across dashboard, contacts, companies, deals, signals, analytics, and settings
- **Custom dashboards** with drag-and-drop widget builder
- **Command palette** (Cmd+K) with global search
- **Account alerts** (6 trigger types) with email and in-app notifications
- **Shareable account reports** via public URLs
- **RBAC** with team invitations and role management
- **SAML SSO and OIDC** (PKCE) plus GitHub/Google OAuth
- **Full audit log** for compliance

## Architecture

```
                              +---------------------+
                              |    React Frontend    |
                              |  Vite + TailwindCSS  |
                              |  50 pages (250KB)    |
                              +----------+----------+
                                         |
                              +----------v----------+
                              |    Express Server    |
                              |  REST + GraphQL +    |
                              |  WebSocket (ws)      |
                              +----+-----+-----+----+
                                   |     |     |
                    +--------------+     |     +---------------+
                    |                    |                     |
           +--------v--------+  +-------v--------+  +--------v--------+
           |   PostgreSQL    |  |     Redis       |  |     BullMQ      |
           |   Prisma ORM   |  |  Cache + PubSub |  |   20 Queues     |
           |   40 models     |  |                 |  |   Workers       |
           +-----------------+  +-----------------+  +-----------------+
                                                              |
                              +-------------------------------v--------+
                              |          External Services             |
                              |  16 connectors | Claude AI | Resend   |
                              |  Stripe | Sentry | Clearbit           |
                              +----------------------------------------+
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS, React Router v6 |
| API | Express, Apollo Server (GraphQL), WebSocket |
| Database | PostgreSQL 16, Prisma ORM (40 models) |
| Queue | Redis 7, BullMQ (20 queues) |
| Auth | JWT, API keys, SAML SSO, OIDC, GitHub/Google OAuth |
| AI | Claude API (briefs, enrichment, next-best-actions) |
| Email | Resend |
| Search | PostgreSQL tsvector (weighted A/B/C/D relevance) |
| Monitoring | Sentry (frontend + backend) |
| Testing | Jest (288 tests) + Playwright (38 E2E specs) |
| Deployment | Docker multi-stage (4 stages), docker-compose |

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/nerobypaul/headless-crm.git
cd headless-crm

cp .env.example .env
# Set JWT_SECRET and JWT_REFRESH_SECRET at minimum

docker compose -f docker-compose.prod.yml up -d --build

# Or try the live demo instantly:
# https://devsignal.dev/landing
```

This starts four containers: PostgreSQL 16, Redis 7, the API server (serving the static frontend), and BullMQ workers. Migrations run automatically on first boot.

Open [http://localhost:3000](http://localhost:3000) to get started.

### Local Development

```bash
# Prerequisites: Node >= 18, PostgreSQL 16, Redis 7

git clone https://github.com/nerobypaul/headless-crm.git
cd headless-crm

npm install

# Start Postgres and Redis (or use your own instances)
docker compose up -d postgres redis

# Run migrations and seed demo data
cd backend && npx prisma migrate deploy && cd ..

# Start backend + frontend
npm run dev
```

The frontend dev server runs on port 5173 and proxies `/api` requests to the backend on port 3000.

## API

DevSignal exposes both REST and GraphQL endpoints, authenticated via JWT or API key.

### REST

```bash
# List top-scoring accounts
curl -H "Authorization: Bearer $TOKEN" \
  https://devsignal.dev/api/v1/companies?sort=pqaScore&order=desc&limit=10

# Ingest a signal
curl -X POST -H "X-API-Key: ds_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"type":"feature_used","sourceId":"app","metadata":{"feature":"api","action":"called"}}' \
  https://devsignal.dev/api/v1/signals

# Get account brief (AI-generated)
curl -H "Authorization: Bearer $TOKEN" \
  https://devsignal.dev/api/v1/companies/:id/brief
```

### GraphQL

```graphql
query TopAccounts {
  companies(orderBy: { pqaScore: desc }, take: 10) {
    id
    name
    pqaScore
    tier
    contacts {
      email
      firstName
      lastName
    }
    signals(take: 5, orderBy: { createdAt: desc }) {
      type
      source
      createdAt
    }
  }
}
```

The GraphQL playground is available at /api/v1/graphql in development mode. See the [live demo](https://devsignal.dev/landing) to explore.

## SDK

```bash
npm install @devsignal/node
```

```typescript
import { DevSignal } from '@devsignal/node';

const ds = new DevSignal({ apiKey: 'ds_live_xxxxxxxxxxxx' });

// Ingest a signal
await ds.signals.ingest({
  type: 'feature_used',
  sourceId: 'app',
  metadata: { feature: 'dashboard', action: 'viewed' },
});

// Query top accounts
const top = await ds.scores.topAccounts({ limit: 10, tier: 'HOT' });

// Upsert a contact
await ds.contacts.upsert({
  email: 'dev@company.com',
  firstName: 'Jane',
  lastName: 'Doe',
  company: 'Acme Corp',
});
```

The SDK also exposes `companies`, `deals`, and `scores` resources. See [`packages/sdk/`](packages/sdk/) for the full API reference. Zero dependencies, TypeScript-first.

## Pricing

Self-host for free, forever. Managed service tiers:

| | Free | Pro | Growth | Scale |
|---|---|---|---|---|
| **Price** | $0/mo | $79/mo | $199/mo | $299/mo |
| **Contacts** | 1,000 | 25,000 | 100,000 | Unlimited |
| **Signals/mo** | 5,000 | 100,000 | 500,000 | Unlimited |
| **Users** | 1 | 10 | 25 | Unlimited |
| **Signal Sources** | 3 | All 16 | All 16 | All 16 |
| **AI Briefs** | -- | 50/mo | 500/mo | Unlimited |
| **CRM Sync** | -- | HubSpot | HubSpot + Salesforce | HubSpot + Salesforce |
| **SSO/SAML** | -- | -- | -- | Included |
| **SLA** | -- | -- | -- | 99.9% |

## Project Structure

```
devsignal/
  backend/
    src/
      controllers/      # Request handlers
      services/         # Business logic + 16 connectors
      routes/           # REST API endpoints
      graphql/          # Schema, resolvers, 11 DataLoaders
      jobs/             # BullMQ queues, workers, scheduler
      middleware/       # Auth, RBAC, rate limiting, validation
    prisma/             # Schema (40 models) + migrations
  frontend/
    src/
      pages/            # 50 route pages (code-split with React.lazy)
      components/       # Shared UI components
      lib/              # API client, hooks, utilities
  packages/
    sdk/                # @devsignal/node SDK (zero deps)
  e2e/                  # Playwright E2E tests (38 specs)
  Dockerfile            # Multi-stage production build (4 stages)
  docker-compose.prod.yml
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

See the [API docs page](https://devsignal.dev/api-docs) for endpoint documentation. The GraphQL schema is self-documenting via introspection.

## License

[MIT](LICENSE)

---

<div align="center">

**DevSignal** -- Developer signal intelligence for devtool companies that want to know who loves their product.

[Live Demo](https://devsignal.dev) | [Website](https://devsignal.dev) | [GitHub](https://github.com/nerobypaul/headless-crm)

</div>
