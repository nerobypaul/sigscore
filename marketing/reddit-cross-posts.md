# Reddit Cross-Post Drafts

Post these 2-4 hours AFTER the Show HN goes live. Each is tailored to the subreddit's audience.
**Never cross-post identical text.** Reddit will flag duplicate posts.

---

## r/SaaS

**Title:** We built developer signal intelligence for $79/mo. Common Room charges $1K+.

**Body:**

We just launched Sigscore on Hacker News and wanted to share here too.

**The problem:** If you run a devtool company, your best leads are developers who are already using your product. They're starring your repos, installing your packages, asking questions in Discord, and complaining on Reddit. But there's no affordable way to track that activity, tie it to real companies, and know who's ready to buy.

Common Room charges $1K+/mo. Reo.dev charges $500+/mo. For a Series A team with 5 engineers, that's not happening.

**What we built:** Sigscore aggregates signals from 16 sources (GitHub, npm, PyPI, Discord, Stack Overflow, Reddit, Twitter/X, PostHog, and more), resolves identities across them, and scores every account 0-100. The scoring is fully customizable -- you define what "hot" means for your product.

Pricing: Free tier (1,000 contacts), Pro at $79/mo, Scale at $299/mo for unlimited everything. Self-hosting is free forever (MIT license, Docker Compose included).

**Why not just build it ourselves?** Because identity resolution across 16 platforms is genuinely hard, and the scoring model needs to be continuously tuned. We've spent months on this so you don't have to.

Try the live demo (no signup): https://sigscore.dev

HN discussion: [link to HN thread]

Happy to answer questions about pricing, architecture, or how it compares to Common Room.

---

## r/devtools

**Title:** I built an open-source tool that tracks which developers love your product across GitHub, npm, Discord, and 13 other sources

**Body:**

Sharing something I've been building for the last few months.

**Context:** I was head of growth at a devtool company. We had thousands of developers using our CLI, and the only way to figure out which companies they came from was GitHub API scripts + npm download trackers + a massive spreadsheet. It was terrible.

**What Sigscore does:**

1. Connects to 16 signal sources (GitHub stars/forks/issues, npm downloads, PyPI installs, Discord messages, Stack Overflow questions, Reddit mentions, Twitter/X, PostHog events, etc.)
2. Resolves identities across platforms -- matches GitHub usernames to emails to Slack handles to company domains
3. Scores every account 0-100 on a "Product-Qualified Account" scale
4. Generates AI-powered account briefs (Claude API, BYOK so no markup)

**Tech stack for the curious:**
- Backend: Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ (20 queues)
- Frontend: React 18 + Vite + Tailwind (code-split, 250KB initial bundle)
- All frontend charts are pure SVG/CSS -- zero charting library dependencies
- GraphQL with Apollo Server + 11 DataLoaders for efficient batching
- 40 Prisma models, identity resolution across 16 platforms

**The identity resolution problem** is the hardest part. We use email domain matching, GitHub org membership, profile bio parsing, and cross-platform username correlation. Accuracy is ~70% for GitHub-to-company matching. Not perfect, but way better than manual tracking.

MIT licensed, self-hostable via Docker Compose.

Try it without signing up: https://sigscore.dev

Source: https://github.com/nerobypaul/sigscore

Would love feedback from anyone building devtools -- what signals matter most to you?

---

## r/selfhosted

**Title:** Sigscore -- self-hostable developer signal intelligence (Docker Compose, MIT license, PostgreSQL + Redis)

**Body:**

Built this for devtool companies that want to track developer activity across GitHub, npm, Discord, and 13 other platforms. Sharing here because it's fully self-hostable and I think this community will appreciate the architecture.

**Self-hosting details:**

```bash
git clone https://github.com/nerobypaul/sigscore.git
cd headless-crm
cp .env.example .env
# Set JWT_SECRET and JWT_REFRESH_SECRET
docker compose -f docker-compose.prod.yml up -d --build
```

That gives you 4 containers:
- PostgreSQL 16 (data store, 40 Prisma models)
- Redis 7 (cache, pub/sub, job queue backend)
- API server (Express + serves the React frontend as static files)
- BullMQ worker (background jobs -- 20 queues for syncing GitHub, npm, Discord, etc.)

**Resource usage:** The Docker image is ~150MB (multi-stage Alpine build). Runs fine on a $5-10/mo VPS. PostgreSQL is the main resource consumer -- expect ~500MB RAM for the full stack with moderate usage.

**What it does:** Aggregates developer activity signals, resolves identities across platforms, and scores company accounts on a 0-100 scale so you know who's evaluating your product. Think of it as self-hosted Common Room (which charges $1K+/mo for their managed version).

**Stack:** Express + TypeScript + Prisma ORM, React 18 + Vite frontend (code-split, 250KB initial), WebSocket for real-time updates, BullMQ for background processing.

**Data ownership:** Everything stays in your PostgreSQL database. No external calls required except the integrations you choose to enable (GitHub API, npm registry, etc.). AI features (Claude API) are optional and BYOK.

MIT licensed. PRs welcome.

Source: https://github.com/nerobypaul/sigscore

Live demo if you want to see it before self-hosting: https://sigscore.dev

---

## Timing Guide

1. **Show HN** goes live first (Tuesday or Wednesday, 8-9 AM ET)
2. **r/SaaS** -- post 2-4 hours after HN, once you have some upvotes to reference
3. **r/devtools** -- same day, 4-6 hours after HN
4. **r/selfhosted** -- can post same day or next day
5. **Indie Hackers** -- 1-2 days after HN (use the HN traction as social proof)
6. **Product Hunt** -- wait 1-2 weeks after HN (different audience, separate launch)

## Tips
- Link back to the HN thread in each Reddit post
- Respond to every comment within 30 minutes for the first 2-3 hours
- Be genuine -- Reddit hates self-promotion that reads like marketing copy
- Lead with the technical problem, not the product features
- If someone asks about pricing, be transparent about margins and costs
