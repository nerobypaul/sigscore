# Show HN: DevSignal - An AI-first headless CRM built for devtool PLG teams

**URL:** https://devsignal.dev/landing

**Text:**

Hi HN,

I built DevSignal because every CRM I used at devtool companies was designed for
traditional sales — not product-led growth. None of them could answer "which
free-tier accounts are about to convert?" without duct-taping together 5 tools.

DevSignal is an open-source, API-first CRM purpose-built for devtool teams
shipping PLG. The core idea: treat product usage signals as first-class CRM data.

**What makes it different:**

- **Signal Engine** — Ingest GitHub stars, npm installs, docs pageviews, API
  calls, and custom events. Append-only event log with identity resolution.

- **PQA Scoring** — Product-Qualified Account scoring replaces MQLs. A 6-factor
  model (signal velocity, user diversity, feature breadth, recency, growth rate,
  engagement depth) auto-scores every account as HOT/WARM/COLD/INACTIVE.

- **PLG Pipeline** — Deal stages map to product adoption: Anonymous Usage ->
  Identified -> Activated -> Team Adoption -> Expansion Signal -> Sales Qualified.

- **AI Briefs** — One-click account intelligence generated from signal patterns.

- **SDK-native** — `@devsignal/node` with zero dependencies. Three lines of code
  to start sending signals.

- **Headless / API-first** — REST + GraphQL. Build your own UI or use ours.

**Tech stack:** TypeScript, Express, Prisma, PostgreSQL (tsvector full-text
search), Redis, BullMQ, React 18, Vite, TailwindCSS.

**What's built:** Full CRM (contacts, companies, deals, activities, tags),
signal engine with GitHub webhook connector, PQA scoring, AI enrichment,
full-text search, real-time WebSocket updates, Slack alerts, CSV import,
outbound webhooks, Node.js SDK, landing page, API docs.

Repo: https://github.com/nerobypaul/headless-crm

I'd love feedback on the signal-to-score model and whether this matches how
your devtool team thinks about pipeline. What signals would you want to track?
