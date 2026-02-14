# DevSignal

**Developer Pipeline Intelligence for devtool companies.**

DevSignal tracks npm downloads, GitHub activity, API usage, and product signals -- then tells you which developers are ready to buy. Purpose-built for devtool companies running PLG.

> "Your npm installs are pipeline. You just can't see it yet."

## Why DevSignal?

Traditional CRMs don't understand developer-led growth. HubSpot doesn't know what an npm download is. Salesforce can't tell you which company's engineers are evaluating your tool.

DevSignal was built for devtool companies where:

- Users adopt the product before talking to sales
- Pipeline starts with `npm install`, not a demo request
- Account health is measured by API calls and GitHub activity, not email opens
- The buyer is the Head of Growth, not the VP of Sales

### The PLG CRM Graveyard

Calixa ($16.3M), Koala ($15M), Endgame ($17M) -- they all tried to build "PLG CRM for everyone" and failed. DevSignal wins by being specifically for devtools, at a price point that doesn't require procurement approval.

## Features

### Signal Engine
Ingest developer activity from multiple sources with automatic identity resolution.

| Connector | Signals |
|-----------|---------|
| **npm** | Download velocity, version adoption, company resolution |
| **PyPI** | Package downloads, version tracking |
| **GitHub** | Stars, forks, issues, PRs, contributor patterns |
| **Segment** | identify, track, group, page/screen events |
| **Webhooks** | Any custom event via REST API |
| **SDK** | `@devsignal/node` -- zero deps, three lines to start |

### PQA Scoring (Product-Qualified Accounts)
6-factor scoring model with automatic tier classification: HOT / WARM / COLD / INACTIVE. Scores update in real-time as new signals arrive.

### PLG-Native Pipeline
Deal stages that map to how devtool companies actually sell:

```
Anonymous Usage -> Identified -> Activated -> Team Adoption -> Expansion Signal -> Sales Qualified -> Negotiation -> Closed Won
```

### AI Intelligence
- **Account Briefs** -- One-click AI-generated intelligence from signal patterns
- **Contact Enrichment** -- AI-powered profile enrichment
- **Next-Best-Actions** -- Suggested actions based on account signals

### Account 360
5-tab company intelligence hub: Overview, Timeline, Contacts, Deals, AI Intelligence. The "demo closer" page.

### Email Sequences
Multi-step automated outreach triggered by signals. Template variables ({{firstName}}, {{company}}, {{pqaScore}}), enrollment management, open/click tracking.

### Custom Dashboards
10 widget types across stat cards, list widgets, and chart widgets. Drag to arrange, auto-saves. The "open every morning" feature.

### Workflow Automation
Signal-driven workflows with 4 triggers and 6 action types:
- **Triggers:** signal_received, contact_created, deal_stage_changed, score_changed
- **Actions:** create_deal, update_deal_stage, send_webhook, send_slack, add_tag, log

### Interactive Slack Bot
Block Kit notifications with action buttons: claim account, snooze, view brief, dismiss. 5 alert types: hot accounts, signups, deal changes, workflow failures, weekly digest.

### CRM Import
4-step wizard for migrating from HubSpot or Salesforce. Auto-detects CSV format, maps fields, upserts with deduplication.

### More
- **Saved Views** -- Custom filtered views per entity type, shareable
- **Audit Log** -- Enterprise compliance trail (who did what, when)
- **Team Members + RBAC** -- OWNER > ADMIN > MEMBER > VIEWER hierarchy
- **Full-text Search** -- PostgreSQL tsvector with weighted relevance
- **Real-time Updates** -- WebSocket push for signals and deal events
- **Bulk Operations** -- Delete, tag, CSV export across all entities
- **GraphQL API** -- Apollo Server with DataLoader for N+1 prevention
- **API Keys** -- Scoped API key authentication for external integrations

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

# Install all workspaces
npm install

# Backend
cd backend
cp .env.example .env  # Edit DATABASE_URL, REDIS_URL, JWT_SECRET
npx prisma generate
npx prisma db push
npm run dev

# Frontend (new terminal)
cd frontend
npm run dev
```

### Docker

```bash
docker compose up -d
```

Starts PostgreSQL, Redis, the backend API, and the frontend.

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
e2e/               Playwright test suite (38 tests)
```

### Backend Stack

- **Express** with JWT + refresh tokens + API key authentication
- **Prisma** ORM with PostgreSQL (24 models)
- **Redis** for caching and BullMQ job queues (7 queues)
- **BullMQ** for async workers: signal sync, workflow execution, webhook delivery, email sends
- **WebSocket** (ws) for real-time updates with JWT auth
- **GraphQL** (Apollo Server) with DataLoader (11 loaders)
- **Claude API** for AI briefs, enrichment, next-best-actions

### API Endpoints

| Category | Endpoints |
|----------|-----------|
| Auth | Register, login, refresh, profile |
| Contacts | CRUD, search, bulk import, timeline |
| Companies | CRUD, search, Account 360 |
| Deals | CRUD, pipeline management, inline editing |
| Signals | Ingest, query, batch, connectors |
| Search | Global full-text search |
| AI | Account briefs, enrichment, next-best-actions |
| Sequences | Email sequence CRUD, enrollment, stats |
| Dashboards | Custom dashboard CRUD, widget data |
| Workflows | Automation rules with triggers and actions |
| Webhooks | Outbound event delivery with retry |
| Connectors | npm, PyPI, GitHub, Segment sources |
| Import | CSV import, HubSpot/Salesforce migration |
| Bulk | Delete, tag, CSV export |
| Notifications | In-app + Slack with Block Kit |
| Members | RBAC team management |
| Audit | Enterprise compliance log |
| Billing | Stripe integration, usage tracking |
| Analytics | Time-series metrics, pipeline analytics |
| Saved Views | Custom filtered views |

Full API docs at `/api-docs` (Swagger UI) or `/api/openapi.json` (raw spec).

## Pricing

| | Free | Pro | Scale |
|---|---|---|---|
| Contacts | 1,000 | 25,000 | Unlimited |
| Signals/mo | 5,000 | 100,000 | Unlimited |
| Users | 1 | 10 | Unlimited |
| AI Briefs | -- | Yes | Yes |
| Email Sequences | -- | Yes | Yes |
| Slack Bot | -- | Yes | Yes |
| Custom Dashboards | -- | Yes | Yes |
| CRM Import | -- | Yes | Yes |
| Audit Log | -- | -- | Yes |
| SSO | -- | -- | Yes |
| Support | Community | Priority | Dedicated |
| Price | **$0/mo** | **$79/mo** | **$299/mo** |

## Project Status

### Completed (P0-P26)
- [x] Core CRM: contacts, companies, deals, activities, tags, auth, API keys
- [x] Signal engine: ingest, identity resolution, append-only event log
- [x] PQA scoring: 6-factor model with auto-tiering
- [x] PLG pipeline: devtool-native deal stages
- [x] GraphQL API with DataLoader (11 loaders)
- [x] Node SDK (`@devsignal/node`, zero deps)
- [x] GitHub connector: stars, forks, issues, PRs
- [x] npm connector: download stats, registry metadata, company matching
- [x] PyPI connector: package downloads, version tracking
- [x] Segment connector: all 5 call types with HMAC verification
- [x] CSV import with field mapping
- [x] HubSpot/Salesforce CRM import wizard
- [x] Full-text search (PostgreSQL tsvector, weighted relevance)
- [x] WebSocket real-time updates
- [x] AI engine: account briefs, contact enrichment, next-best-actions
- [x] Account 360: 5-tab company intelligence hub
- [x] Workflow automation: 4 triggers, 6 action types
- [x] BullMQ async workers: signal sync, workflow execution, webhooks, email
- [x] Interactive Slack bot: Block Kit alerts with action buttons
- [x] Email sequence automation with template variables
- [x] Custom dashboard builder (10 widget types)
- [x] Saved views with sharing
- [x] Bulk operations: delete, tag, CSV export
- [x] In-app notifications with real-time bell
- [x] Team members with RBAC (OWNER/ADMIN/MEMBER/VIEWER)
- [x] Audit log for enterprise compliance
- [x] Stripe billing with usage enforcement
- [x] Onboarding flow with demo data seeder
- [x] Docker (multi-stage builds)
- [x] CI/CD (GitHub Actions, 5 jobs)
- [x] Playwright E2E tests (38 tests, 6 suites)
- [x] Landing page, Use Cases, Pricing pages
- [x] API docs (Swagger UI + OpenAPI spec)

### Up Next
- [ ] CRM bi-directional sync (Salesforce + HubSpot live sync via OAuth)
- [ ] Customizable lead scoring builder (no-code)
- [ ] Multi-tenant SSO (SAML/OIDC)
- [ ] API developer portal with interactive docs

## Competitive Positioning

DevSignal is **Developer Pipeline Intelligence** -- not a CRM, not a community tool.

| vs. | DevSignal Advantage |
|-----|---------------------|
| **HubSpot/Salesforce** | Native developer signals. No custom setup needed. |
| **Common Room** ($1K+/mo) | 12x cheaper. Purpose-built for devtools, not community management. |
| **Reo.Dev** | Self-serve in 10 minutes. No sales call required. $79/mo transparent pricing. |
| **Spreadsheets** | AI scoring, real-time signals, automated workflows. |

## License

MIT
