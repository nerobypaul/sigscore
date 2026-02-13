# DevSignal

**The AI-first headless CRM for devtool teams shipping PLG.**

DevSignal treats product usage signals as first-class CRM data. Instead of relying on form fills and sales calls, it ingests GitHub stars, npm installs, API calls, and custom events to automatically score and surface your hottest accounts.

## Why DevSignal?

Traditional CRMs don't understand product-led growth. DevSignal was built from scratch for devtool companies where:

- Users adopt the product before talking to sales
- Pipeline starts with `npm install`, not a demo request
- Account health is measured by API calls, not email opens

## Key Features

| Feature | Description |
|---------|-------------|
| **Signal Engine** | Ingest product usage events from GitHub, npm, docs, APIs. Append-only event log with identity resolution. |
| **PQA Scoring** | Product-Qualified Account scoring with 6-factor model. Auto-tier accounts as HOT / WARM / COLD / INACTIVE. |
| **PLG Pipeline** | Deal stages map to adoption: Anonymous Usage -> Identified -> Activated -> Team Adoption -> Expansion Signal -> Sales Qualified. |
| **AI Briefs** | One-click account intelligence generated from signal patterns. |
| **Full-text Search** | PostgreSQL tsvector with weighted relevance across contacts, companies, deals, signals. |
| **Real-time Updates** | WebSocket push for deal and signal events. |
| **Slack Alerts** | Automatic notifications on PQA tier changes. |
| **SDK-native** | `@devsignal/node` — zero dependencies, three lines to start sending signals. |
| **API-first** | REST + GraphQL. Build your own UI or use the included React dashboard. |

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### Setup

```bash
# Clone
git clone https://github.com/nerobypaul/headless-crm.git
cd headless-crm

# Backend
cd backend
cp .env.example .env  # Edit DATABASE_URL, REDIS_URL, JWT_SECRET
npm install
npx prisma generate
npx prisma db push
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Docker

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, the backend API, and the frontend.

### Send Your First Signal

```typescript
import { DevSignal } from '@devsignal/node';

const ds = new DevSignal({
  apiKey: 'ds_live_...',
  baseUrl: 'http://localhost:3001',
});

await ds.signals.track({
  type: 'repo_clone',
  anonymousId: 'user-fingerprint',
  metadata: { repo: 'acme/sdk', ref: 'main' },
});
```

## Architecture

```
frontend/          React 18 + Vite + TailwindCSS
backend/           Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ
packages/sdk/      @devsignal/node TypeScript SDK (zero deps)
```

### Backend Stack

- **Express** with JWT + API key authentication
- **Prisma** ORM with PostgreSQL
- **Redis** for caching and BullMQ job queues
- **WebSocket** for real-time updates
- **GraphQL** (Apollo Server) with DataLoader for N+1 prevention

### API Endpoints

| Category | Endpoints |
|----------|-----------|
| Auth | Register, login, refresh, profile |
| Contacts | CRUD + search + bulk import |
| Companies | CRUD + search + bulk import |
| Deals | CRUD + pipeline management |
| Activities | CRUD + filtering |
| Signals | Ingest, query, batch |
| Search | Global full-text search |
| AI | Account briefs, contact enrichment |
| Webhooks | Outbound event delivery |
| Settings | Slack integration |

Full API docs at `/docs` when running locally, or Swagger UI at `/api-docs`.

## Pricing

| | Free | Pro | Scale |
|---|---|---|---|
| Contacts | 1,000 | 25,000 | Unlimited |
| Signals/mo | 5,000 | 100,000 | Unlimited |
| Users | 1 | 10 | Unlimited |
| AI Briefs | - | Yes | Yes |
| Slack Alerts | - | Yes | Yes |
| SSO | - | - | Yes |
| Support | Community | Priority | Dedicated |
| Price | **$0/mo** | **$79/mo** | **$299/mo** |

## Project Status

- [x] P0: Core CRM (contacts, companies, deals, activities, tags, auth, API keys, webhooks)
- [x] P1: DataLoader, Node.js SDK, Signal Feed UI, PQA Dashboard, Onboarding
- [x] P2: GitHub connector, CSV import, WebSocket, Slack alerts
- [x] P3: Full-text search, global search UI, company detail, dashboard feed, AI enrichment
- [x] Go-to-Market: Landing page, API docs, pricing
- [x] P4: Docker, CI/CD
- [ ] E2E tests (Playwright)
- [ ] Stripe billing integration
- [ ] npm / PyPI signal connectors
- [ ] Multi-tenant SSO (SAML/OIDC)

## License

MIT
