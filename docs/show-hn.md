# Show HN: Sigscore -- Developer Pipeline Intelligence for devtool companies

We built Sigscore because HubSpot doesn't know what an npm download is.

My co-founder and I spent years at devtool companies watching the same broken movie: marketing runs campaigns, developers sign up through docs or `npm install`, product usage spikes -- and none of that data makes it into the CRM. The "source of truth" is blind to the most important signals in a developer-led business.

So we built Sigscore. It's a CRM purpose-built for devtool companies that run PLG motions.

**What it does:**

- Ingests developer signals natively -- npm/PyPI download trends, GitHub stars/forks/issues, API usage patterns, doc visits
- Scores accounts by actual product usage (PQA -- Product-Qualified Accounts), not form fills or "MQL" nonsense
- AI-generated account briefs: "3 engineers at Acme installed your SDK this week. Their CTO starred your repo. API usage up 40%."
- Workflow automation -- trigger Slack alerts, create deals, send webhooks when signal thresholds hit
- Identity resolution -- connects anonymous usage to real companies and people
- PLG-native pipeline stages: anonymous usage -> identified -> activated -> team adoption -> expansion signal -> sales qualified

**The stack:** Express + TypeScript + React + PostgreSQL + Prisma + Redis + BullMQ + Claude AI for briefs/enrichment. GraphQL + REST APIs. WebSocket real-time updates. Node SDK for custom signal ingestion.

**Self-hostable:** Full Docker Compose setup. Bring your own Postgres and Redis. We also run a hosted version.

**Pricing:**
- Free: 1,000 contacts, 5,000 signals/mo, 1 user
- Pro: $79/mo -- 25k contacts, 100k signals, 10 users, full AI
- Scale: $299/mo -- unlimited everything, SSO, SLA

**Why existing tools fail:** Calixa raised $16M and shut down. Koala raised $15M, got acqui-hired by Cursor. Endgame raised $17M and pivoted. They all tried to be "PLG CRM for everyone." That doesn't work. Developer tools companies have a specific data model -- npm packages, GitHub repos, API keys, free-tier limits -- and you need a CRM that speaks that language natively.

Reo.dev and Common Room do signal detection but aren't CRMs -- you still need Salesforce underneath. Attio is a great CRM but has zero native developer signal ingestion. We combine both: signals + CRM in one box, at 5-10x lower cost.

We're two people. Built the whole thing in a few weeks. The AI-assisted development story is its own thread, but the short version: Claude wrote most of the code while we focused on product decisions.

Would love feedback from anyone running a devtool company. **What signals would you want tracked if you were trying to convert developers into paying customers?**

GitHub: github.com/nerobypaul/sigscore
Site: sigscore.dev
