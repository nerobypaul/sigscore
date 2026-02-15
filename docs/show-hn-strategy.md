# Show HN Launch Strategy

## Post Title (76 chars)
```
Show HN: DevSignal – Developer signal intelligence for devtool companies
```

## Post Body
```
Hey HN,

I built DevSignal because I worked at a devtool company and had no idea who was
actually using our tool. The only options were Common Room ($1K+/mo) and Reo.dev
($500+/mo) — both sales-led, slow to onboard, and way too expensive for a
Series A team.

DevSignal ingests signals from 13 sources — GitHub stars, npm downloads, PyPI
installs, Discord messages, Stack Overflow questions, Reddit mentions, Twitter/X,
PostHog product events, Segment, and more — and uses identity resolution to tie
anonymous developer activity to real company accounts. Every account gets a PQA
(Product-Qualified Account) score from 0-100 based on user count, usage velocity,
feature breadth, engagement recency, seniority signals, and firmographic fit.

The scoring is fully customizable with a no-code rule builder, so you define what
"hot" means for your product. AI-powered account briefs (Claude API) generate
one-click intelligence before sales conversations.

Tech stack:
- Backend: Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ (16 queues)
- Frontend: React 18 + Vite + Tailwind (code-split, 250KB initial bundle)
- GraphQL: Apollo Server with DataLoader (11 loaders)
- Auth: JWT + refresh tokens + API keys + SAML SSO + OIDC (PKCE) + GitHub/Google OAuth
- Real-time: WebSocket with JWT auth, org-scoped broadcast
- Deployment: Multi-stage Docker build (~150MB image), docker-compose for self-hosting
- 33 Prisma models, 16 BullMQ job queues, 13 connector services

Integrations: GitHub, npm, PyPI, Segment, Slack, HubSpot, Salesforce, Discord,
Stack Overflow, Twitter/X, Reddit, PostHog, Clearbit. Outbound webhooks for
Zapier/Make (HMAC-signed, 8 event types).

Pricing starts at $0/mo (1,000 contacts, 5,000 signals). Pro is $79/mo. Docker
compose file included for self-hosting.

Live at: https://devsignal.dev
GitHub: https://github.com/nerobypaul/devsignal

Would love feedback from anyone building devtools or running PLG growth.
```

## Founder's First Comment (post within 60 seconds)
```
Founder here. Some context on why this exists and decisions made along the way.

**Why I built this**

I was head of growth at a devtool company. We had thousands of developers using
our CLI tool and no idea which companies they came from. Common Room wanted $1K+/mo
and a 4-week onboarding. We ended up cobbling together GitHub API scripts, npm
download trackers, and a massive spreadsheet. It was terrible.

DevSignal is the tool I wished existed: connect GitHub, see results in 2 minutes.

**Technical decisions and trade-offs**

- Chose Express over Fastify/Hono for ecosystem maturity and hiring ease.
- Prisma over raw SQL because the schema has 33 models and migrations matter
  more than microsecond query performance at this stage.
- BullMQ with 16 separate queues because connector sync jobs have wildly
  different intervals (GitHub: 15min, Stack Overflow: 6hr, Clearbit: daily).
- No ML for scoring. The PQA model is rule-based with configurable weights.
  Rule-based scoring is transparent and debuggable. Customers see exactly
  why an account scored 87.
- All frontend charts are pure SVG/CSS. Zero charting library dependencies.
  Bundle stayed at 250KB initial.

**What's not great yet**

- No mobile responsive dashboard (landing page is responsive, app is not)
- Identity resolution has ~70% accuracy on GitHub-to-company matching.
  Uses email domain + org membership + profile bio. False positives happen.
- AI briefs (Claude API) add ~3s latency. Considering pre-generating them.

**What's next**

- LinkedIn connector (company page followers, employee signals)
- Intercom/Zendesk connector (support tickets as signals)
- Historical score snapshots for trend visualization
- Demo mode for exploring without signup

Happy to answer questions about architecture, devtool GTM, or anything else.
```

## Timing
- **Primary**: Tuesday or Wednesday, 8-9 AM ET
- **Alternative**: Sunday 11 AM ET (less competition, more technical audience)
- Clear 4-6 hours after posting to respond to every comment

## Pre-launch Checklist
- [ ] Make GitHub repo public (or remove open-source claims)
- [ ] Rename repo from headless-crm to devsignal
- [ ] Add LICENSE file (MIT) -- DONE
- [ ] Add README.md with architecture, quickstart, screenshots
- [ ] Remove fake social proof from landing page -- DONE
- [ ] Fix pricing FAQ self-host answer -- DONE
- [ ] Deploy to Railway and verify /health
- [ ] Load test for ~2,000-5,000 visitors in 4 hours
- [ ] Build demo mode with pre-seeded data
- [ ] Prepare Reddit cross-posts (r/SaaS, r/devtools, r/selfhosted)

## Reddit Cross-Posts
See full drafts in the agent output. Key points:
- r/SaaS: Post 2-4 hours after HN, lead with competitive angle
- r/devtools: Same day, lead with technical pain point
- r/selfhosted: Focus on Docker Compose self-hosting angle
- Never cross-post identical text
