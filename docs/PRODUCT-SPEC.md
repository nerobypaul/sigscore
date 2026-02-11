# Product Spec: DevSignal CRM

> A headless, AI-first CRM for developer tools companies. Collapses the signal layer + CRM into one API-first system of record.

## Product Name

**DevSignal** — working name. The CRM that sees what developers are doing before sales ever picks up the phone.

---

## 1. Core Concept

DevSignal replaces the fragmented stack (HubSpot + Koala + Hightouch + Clay) with a single headless CRM that:

1. **Ingests developer signals natively** — GitHub, npm, PyPI, Docker, docs, API usage
2. **Scores accounts by product usage** — not MQLs, not lead scores, PQAs
3. **Resolves anonymous users to companies** — IP resolution, email domain matching, fingerprinting
4. **Exposes everything via API** — REST + GraphQL, no forced UI
5. **Uses AI to generate briefs and automate outreach** — not just store records

---

## 2. Data Model

### Core Objects

```
Organization (tenant)
├── Account (company being tracked)
│   ├── accountSignals[]        — raw signal events
│   ├── accountScore            — AI-computed PQA score
│   ├── contacts[]              — people at the account
│   ├── deals[]                 — sales opportunities
│   └── activities[]            — emails, calls, meetings, notes
├── Contact (individual person)
│   ├── contactSignals[]        — individual activity
│   ├── enrichment{}            — firmographic/demographic data
│   └── identities[]            — email, GitHub handle, npm username
├── Deal (sales opportunity)
│   ├── stage                   — PLG-native stages (see below)
│   ├── amount
│   ├── signals[]               — signals that influenced this deal
│   └── activities[]
├── Signal (first-class object)
│   ├── source                  — github, npm, docs, api, website, etc.
│   ├── type                    — repo_clone, package_install, page_view, api_call, etc.
│   ├── actor                   — resolved contact or anonymous fingerprint
│   ├── account                 — resolved account
│   ├── metadata{}              — source-specific data
│   └── timestamp
├── SignalSource (configured integration)
│   ├── type                    — github, npm, segment, webhook, etc.
│   ├── config{}                — API keys, repo list, etc.
│   └── status                  — active, paused, error
└── CustomObject (user-defined)
    ├── schema{}                — metadata-driven field definitions
    └── records[]
```

### PLG-Native Pipeline Stages

Replace traditional sales stages with stages that map to the devtool motion:

```
anonymous_usage    — IP-matched activity, no known identity
identified         — email/GitHub handle known
activated          — completed meaningful product action
team_adoption      — multiple users from same company
expansion_signal   — hitting limits, adding seats, enterprise features
sales_qualified    — sales rep engaged
negotiation        — pricing/contract discussion
closed_won         — deal closed
closed_lost        — deal lost
```

### Identity Resolution

Each Contact can have multiple identities:

```
identities: [
  { type: "email", value: "dev@acme.com", verified: true },
  { type: "github", value: "acme-dev", verified: true },
  { type: "npm", value: "~acmedev", verified: false },
  { type: "ip", value: "203.0.113.42", confidence: 0.7 }
]
```

Anonymous signals are matched to Accounts via:
1. Email domain → company match
2. IP → company reverse lookup (Clearbit Reveal-style)
3. GitHub org membership → company match
4. Explicit self-identification (signup form)

---

## 3. API Design

### REST API (v1)

```
# Auth
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me

# Accounts (companies being tracked)
GET    /api/v1/accounts                    — list, filter, sort, paginate
POST   /api/v1/accounts                    — create
GET    /api/v1/accounts/:id                — get with signals, contacts, deals
PUT    /api/v1/accounts/:id                — update
DELETE /api/v1/accounts/:id                — delete
GET    /api/v1/accounts/:id/signals        — signals for account
GET    /api/v1/accounts/:id/timeline       — unified activity timeline
GET    /api/v1/accounts/:id/score          — PQA score breakdown

# Contacts
GET    /api/v1/contacts
POST   /api/v1/contacts
GET    /api/v1/contacts/:id
PUT    /api/v1/contacts/:id
DELETE /api/v1/contacts/:id
POST   /api/v1/contacts/:id/resolve       — trigger identity resolution

# Deals
GET    /api/v1/deals
POST   /api/v1/deals
GET    /api/v1/deals/:id
PUT    /api/v1/deals/:id
DELETE /api/v1/deals/:id

# Signals (ingest + query)
POST   /api/v1/signals                    — ingest signal event
POST   /api/v1/signals/batch              — batch ingest
GET    /api/v1/signals                    — query signals
GET    /api/v1/signals/sources            — list configured sources

# Signal Sources (integrations)
GET    /api/v1/sources
POST   /api/v1/sources                    — configure new source
PUT    /api/v1/sources/:id
DELETE /api/v1/sources/:id
POST   /api/v1/sources/:id/test           — test connection

# AI
POST   /api/v1/ai/score/:accountId        — compute/refresh PQA score
POST   /api/v1/ai/brief/:accountId        — generate account brief
POST   /api/v1/ai/suggest/:accountId      — get next-best-action suggestions
POST   /api/v1/ai/enrich/:contactId       — enrich contact data

# Webhooks
GET    /api/v1/webhooks
POST   /api/v1/webhooks                   — register webhook
DELETE /api/v1/webhooks/:id

# Custom Objects
GET    /api/v1/objects                    — list custom object schemas
POST   /api/v1/objects                    — create custom object schema
GET    /api/v1/objects/:type              — list records
POST   /api/v1/objects/:type              — create record
GET    /api/v1/objects/:type/:id          — get record
PUT    /api/v1/objects/:type/:id          — update record
DELETE /api/v1/objects/:type/:id          — delete record

# Health
GET    /health
GET    /health/signals                    — signal pipeline health
```

### GraphQL API

For complex relational queries:

```graphql
query AccountWithContext($id: ID!) {
  account(id: $id) {
    name
    domain
    pqaScore {
      score
      factors { name weight value }
      trend
    }
    contacts {
      name
      email
      identities { type value }
      lastActive
    }
    signals(last: 50) {
      source
      type
      actor { name }
      metadata
      timestamp
    }
    deals {
      stage
      amount
      owner { name }
    }
  }
}
```

### Webhook Events

```
signal.received          — new signal ingested
signal.account_matched   — signal resolved to an account
account.score_changed    — PQA score updated
account.stage_changed    — account moved pipeline stages
account.expansion_signal — expansion signal detected
contact.identified       — anonymous → known resolution
contact.enriched         — enrichment data received
deal.created
deal.stage_changed
deal.closed
```

---

## 4. Signal Ingestion

### Built-in Signal Sources

| Source | Signals Captured | Method |
|--------|-----------------|--------|
| **GitHub** | Stars, forks, clones, issues, PRs, org membership | GitHub App + webhooks |
| **npm** | Package downloads by IP/org (via registry API) | Polling + CDN logs |
| **Website/Docs** | Page views, time on page, pricing visits | JS snippet or Segment |
| **Product API** | API calls, endpoints hit, error rates, usage volume | SDK or webhook |
| **Auth/Signup** | Registrations, activations, team invites | Webhook from product |
| **Segment** | Any Segment event (track, identify, group) | Segment destination |
| **Custom webhook** | Any event via HTTP POST | Webhook endpoint |

### Signal Processing Pipeline

```
Ingest → Validate → Deduplicate → Resolve Identity → Match Account → Score → Emit Event
```

1. **Ingest:** Accept signal via API, webhook, or polling
2. **Validate:** Schema validation, rate limiting
3. **Deduplicate:** Prevent double-counting (idempotency key)
4. **Resolve Identity:** Match signal actor to Contact (or create anonymous profile)
5. **Match Account:** Associate Contact/signal to Account
6. **Score:** Update PQA score for the Account
7. **Emit Event:** Fire webhooks, update timelines

---

## 5. AI Features

### PQA Scoring (Product-Qualified Account)

Scoring model factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| **User count** | High | Number of distinct users from the account |
| **Usage velocity** | High | Rate of increase in activity |
| **Feature breadth** | Medium | How many product features they're using |
| **Engagement recency** | Medium | How recently they were active |
| **Seniority signals** | Medium | Are decision-makers (VP, Director) involved? |
| **Limit proximity** | High | How close to hitting free-tier limits |
| **Competitor signals** | Low | Are they also evaluating competitors? |
| **Firmographic fit** | Medium | Company size, industry, funding match ICP |

Score output: 0-100 with tier labels:
- **Hot (80-100):** Sales should reach out now
- **Warm (50-79):** Nurture, monitor for expansion signals
- **Cold (20-49):** Early usage, not ready
- **Inactive (0-19):** Churned or dormant

### AI Account Briefs

Auto-generated brief for sales before outreach:

```markdown
## Acme Corp — PQA Score: 87 (Hot)

**What's happening:** 5 engineers installed your SDK in the last 7 days.
Usage jumped 340% week-over-week. Their VP Engineering (Jane Smith)
visited your pricing page twice on Thursday.

**Company:** Series B, 120 employees, raised $45M. Uses React, AWS, PostgreSQL.

**Current usage:** Free tier, 3 projects, 12,000 API calls/month (limit: 15,000).
Using auth + database features. Not yet using real-time or edge functions.

**Suggested approach:** They're hitting API limits soon. Reach out to Jane Smith
about the Team plan. Reference their GitHub org (github.com/acme-corp) —
they have 3 public repos using your SDK.

**Draft outreach:**
"Hi Jane, I noticed your team at Acme has been building some interesting
projects with [product]. You're approaching some usage thresholds that
the Team plan would handle nicely — happy to walk through what that
looks like for a team your size."
```

### Conversational CRM (Slack / CLI)

```
/crm top accounts          — top 10 by PQA score
/crm brief acme-corp       — generate account brief
/crm signals today         — today's notable signals
/crm who visited pricing   — contacts who viewed pricing page
```

---

## 6. Architecture

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Node.js 20+ / TypeScript | Existing codebase, ecosystem |
| **API Framework** | Express (REST) + Apollo Server (GraphQL) | Already scaffolded, proven |
| **Database** | PostgreSQL 16 | Already configured, JSONB for flexible schemas |
| **ORM** | Prisma 5 | Already in place, great DX |
| **Queue** | BullMQ + Redis | Async signal processing, enrichment jobs |
| **Cache** | Redis | API caching, rate limiting, session store |
| **AI** | Anthropic Claude API (primary), OpenAI (fallback) | Best for structured reasoning + generation |
| **Search** | PostgreSQL full-text + pg_trgm | Good enough to start, upgrade to Elasticsearch later |
| **Auth** | JWT + OAuth 2.0 | Already scaffolded |
| **MCP** | Custom MCP server | Expose CRM to AI assistants |

### System Architecture

```
                    ┌─────────────┐
                    │   Clients   │
                    │ (API / SDK) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   API GW    │
                    │ REST + GQL  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──┐  ┌─────▼─────┐  ┌──▼───────┐
       │  Core   │  │  Signal   │  │    AI    │
       │  CRUD   │  │  Engine   │  │  Engine  │
       │         │  │           │  │          │
       │Accounts │  │ Ingest    │  │ Scoring  │
       │Contacts │  │ Resolve   │  │ Briefs   │
       │ Deals   │  │ Match     │  │ Suggest  │
       │Activity │  │ Process   │  │ Enrich   │
       └────┬────┘  └─────┬─────┘  └────┬─────┘
            │              │              │
            └──────────────┼──────────────┘
                           │
                    ┌──────▼──────┐
                    │ PostgreSQL  │◄──── Redis (cache + queue)
                    │             │
                    │ Core tables │
                    │ Signal log  │
                    │ Score cache │
                    │ Custom obj  │
                    └─────────────┘
```

### Key Design Decisions

1. **Monolith-first.** No microservices. One deployable. Split later if needed.
2. **PostgreSQL for everything.** Signals, scores, custom objects, search. Avoid premature infrastructure complexity.
3. **BullMQ for async.** Signal processing, enrichment, AI scoring run as background jobs. API stays fast.
4. **Metadata-driven custom objects.** Schema stored as data in a `custom_object_schemas` table. Records stored in a `custom_object_records` table with JSONB data column. No DDL at runtime.
5. **Event sourcing for signals.** Signals are immutable events. Scores and timelines are derived views. Enables replay and reprocessing.

---

## 7. Database Schema Changes

### New Models (extend existing Prisma schema)

```prisma
// Signal source configuration
model SignalSource {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  type           SignalSourceType
  name           String
  config         Json     // API keys, repo list, endpoint URLs
  status         SignalSourceStatus @default(ACTIVE)
  lastSyncAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  signals        Signal[]

  @@index([organizationId, type])
}

// Raw signal events (append-only)
model Signal {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  sourceId       String
  source         SignalSource @relation(fields: [sourceId], references: [id])
  type           String   // repo_clone, package_install, page_view, etc.
  actorId        String?  // resolved Contact
  actor          Contact? @relation(fields: [actorId], references: [id])
  accountId      String?  // resolved Account
  account        Company? @relation(fields: [accountId], references: [id])
  anonymousId    String?  // fingerprint for unresolved actors
  metadata       Json     // source-specific data
  idempotencyKey String?  @unique
  timestamp      DateTime
  createdAt      DateTime @default(now())

  @@index([organizationId, timestamp])
  @@index([accountId, timestamp])
  @@index([actorId, timestamp])
  @@index([type, timestamp])
}

// PQA scores (computed, cached)
model AccountScore {
  id             String   @id @default(cuid())
  organizationId String
  accountId      String   @unique
  account        Company  @relation(fields: [accountId], references: [id])
  score          Int      // 0-100
  tier           ScoreTier
  factors        Json     // { factor: string, weight: number, value: number }[]
  signalCount    Int      @default(0)
  userCount      Int      @default(0)
  lastSignalAt   DateTime?
  trend          ScoreTrend @default(STABLE)
  computedAt     DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, score(sort: Desc)])
  @@index([organizationId, tier])
}

// Contact identity resolution
model ContactIdentity {
  id             String   @id @default(cuid())
  contactId      String
  contact        Contact  @relation(fields: [contactId], references: [id])
  type           IdentityType // email, github, npm, ip, domain
  value          String
  verified       Boolean  @default(false)
  confidence     Float    @default(1.0)
  createdAt      DateTime @default(now())

  @@unique([type, value])
  @@index([contactId])
}

// AI-generated account briefs (cached)
model AccountBrief {
  id             String   @id @default(cuid())
  accountId      String
  account        Company  @relation(fields: [accountId], references: [id])
  content        String   // markdown brief
  generatedAt    DateTime
  validUntil     DateTime // cache expiry
  promptTokens   Int?
  outputTokens   Int?
  createdAt      DateTime @default(now())

  @@index([accountId, generatedAt(sort: Desc)])
}

// Custom object schemas (metadata-driven)
model CustomObjectSchema {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  slug           String   // url-safe name
  name           String
  description    String?
  fields         Json     // field definitions: { name, type, required, default }[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  records        CustomObjectRecord[]

  @@unique([organizationId, slug])
}

// Custom object records
model CustomObjectRecord {
  id             String   @id @default(cuid())
  schemaId       String
  schema         CustomObjectSchema @relation(fields: [schemaId], references: [id])
  organizationId String
  data           Json     // actual field values
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([schemaId, organizationId])
}

// Webhook registrations
model WebhookEndpoint {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  url            String
  events         String[] // event types to subscribe to
  secret         String   // HMAC signing secret
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
}

// Enums
enum SignalSourceType {
  GITHUB
  NPM
  WEBSITE
  DOCS
  PRODUCT_API
  SEGMENT
  CUSTOM_WEBHOOK
}

enum SignalSourceStatus {
  ACTIVE
  PAUSED
  ERROR
}

enum ScoreTier {
  HOT        // 80-100
  WARM       // 50-79
  COLD       // 20-49
  INACTIVE   // 0-19
}

enum ScoreTrend {
  RISING
  STABLE
  FALLING
}

enum IdentityType {
  EMAIL
  GITHUB
  NPM
  TWITTER
  LINKEDIN
  IP
  DOMAIN
}
```

---

## 8. Implementation Phases

### Phase 1: Signal Engine (Week 1-2)
- Signal data model + migrations
- Signal ingest API (POST /signals, POST /signals/batch)
- Signal source configuration
- GitHub signal source (webhook receiver)
- Custom webhook signal source
- Basic identity resolution (email domain → account matching)
- Signal query API with filters

### Phase 2: AI Scoring + Briefs (Week 2-3)
- PQA scoring model (rule-based first, ML later)
- Account score computation jobs (BullMQ)
- Score API endpoints
- AI brief generation (Claude API integration)
- Account timeline API (unified signal + activity view)
- Webhook event system

### Phase 3: GraphQL + Advanced Features (Week 3-4)
- Apollo Server GraphQL API
- Custom object schema engine
- Advanced identity resolution (GitHub org, IP lookup)
- Enrichment integration (Clearbit/Apollo)
- Slack bot (conversational CRM)
- MCP server for AI assistant integration

### Phase 4: Polish + Deploy (Week 4-5)
- API documentation (OpenAPI + GraphQL playground)
- SDK (TypeScript)
- Rate limiting + API keys
- Admin dashboard (minimal, optional)
- Docker production config
- CI/CD pipeline
- Landing page

---

## 9. Success Metrics

- **Time to first signal:** < 5 minutes from signup to seeing first signal in API
- **API response time:** p95 < 200ms for reads, < 500ms for writes
- **Signal processing latency:** < 30 seconds from event to scored + matched
- **AI brief generation:** < 10 seconds
- **Accuracy:** Identity resolution > 70% for accounts with 3+ signals

---

## 10. What We're NOT Building (Scope Control)

- No full email sending platform (integrate with SendGrid/Resend)
- No meeting scheduler (integrate with Calendly)
- No call recording (integrate with Gong)
- No marketing automation (integrate with Customer.io)
- No complex permission system beyond org-level roles (for now)
- No mobile app
- No real-time collaboration UI
- Frontend dashboard is minimal / optional — API is the product
