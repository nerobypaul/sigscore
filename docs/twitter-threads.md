# DevSignal Twitter/X Threads

Five ready-to-post thread drafts. Each follows hook-story-CTA format.

---

## Thread 1: The PLG CRM Graveyard

**Hook:** The most dangerous category in B2B SaaS right now? "PLG CRM." Here's the graveyard:

1/ The most dangerous category in B2B SaaS right now? "PLG CRM."

Here's the graveyard:

- Calixa: raised $16M. Shut down Jan 2024.
- Koala: raised $15M. Acqui-hired by Cursor. Product sunset Sep 2025.
- Endgame: raised $17M. Pivoted to AI enterprise sales.

That's $48M+ burned. Why?

2/ They all made the same mistake: they tried to be "the PLG layer for every SaaS company."

The TAM looks huge on a pitch deck. In reality, "PLG" means completely different things for Notion vs. Datadog vs. Resend.

3/ A collaboration tool's signals: invites sent, docs created, weekly active users.

A devtool's signals: npm downloads, GitHub stars, API calls, SDK installs, free-tier limit hits.

These are not the same product. They never were.

4/ Second mistake: they were all signal layers, not systems of record.

You still needed HubSpot or Salesforce underneath. So you were paying $1k/mo for signals PLUS $300/seat/mo for CRM.

The Head of Growth at a 20-person startup doesn't have that budget.

5/ Third mistake: per-seat pricing. PLG companies need 5-10 people looking at pipeline data -- engineers, PMs, founders, growth, sales. At $50-100/seat, that's $500-1000/mo before you've tracked a single signal.

6/ So what actually works?

You need a CRM that IS the signal layer. Not a bolt-on. Not middleware. The signals -- npm downloads, GitHub activity, API usage -- have to be first-class objects in the data model.

7/ You need PLG-native pipeline stages. Not "Prospect -> Demo -> Proposal -> Closed."

More like: Anonymous Usage -> Identified -> Activated -> Team Adoption -> Expansion Signal -> Sales Qualified.

Because that's how devtools actually sell.

8/ You need to pick a niche. "PLG" is not a niche. "Developer tools companies with open source + paid product" is a niche.

They all have npm packages. They all have GitHub repos. They all have API keys. Same data model. Same go-to-market.

9/ And you need to price it so the Head of Growth can put it on a credit card. Not "book a demo" pricing. Not "custom enterprise" pricing.

$79/mo. Done.

10/ We built DevSignal to be the thing the PLG CRM graveyard couldn't figure out: a developer pipeline intelligence platform that IS the CRM, built specifically for devtool companies.

Signals + CRM + AI briefs + workflow automation. One product. One price.

devsignal.dev

---

## Thread 2: Why HubSpot Fails for DevTool Companies

**Hook:** Your best lead just ran `npm install your-package` 47 times this week. HubSpot has no idea.

1/ Your best lead just ran `npm install your-package` 47 times this week.

HubSpot has no idea.

Here's why traditional CRMs are structurally broken for devtool companies:

2/ HubSpot and Salesforce are built around one assumption: buyers fill out forms.

Lead fills out form -> enters CRM -> sales rep calls -> demo -> close.

Developers don't fill out forms. They read docs, install packages, clone repos, and start building. Your pipeline is invisible.

3/ When a devtool company puts product data into HubSpot, it looks like this:

Custom property: "npm_downloads_last_30d"
Custom property: "github_stars"
Custom property: "api_calls_weekly"
Custom property: "free_tier_usage_pct"

You're cramming a round peg into a square hole.

4/ Those custom properties update via Zapier -> Hightouch -> Census -> some reverse ETL pipeline that breaks every other week.

And when it breaks, nobody notices for days because the CRM data was already stale.

5/ The pipeline stages in HubSpot:

Subscriber -> Lead -> MQL -> SQL -> Opportunity -> Customer

Name one devtool company where this reflects reality. I'll wait.

6/ What the pipeline actually looks like:

Anonymous dev uses your tool -> Signs up -> Gets activated -> Their teammate joins -> Team hits free tier limits -> Someone asks about enterprise -> Deal starts

That's 7 distinct stages. HubSpot gives you "Lead."

7/ The pricing makes it worse. HubSpot Enterprise -- where you get custom objects and reporting -- starts at $1,200/mo.

For a 30-person devtool startup trying to figure out who to talk to first? Absurd.

8/ So what do growth teams actually do? They open Amplitude in one tab, HubSpot in another, and a spreadsheet in the third.

They manually cross-reference product data with CRM records. Every. Single. Day.

This is the job that should not exist.

9/ What if the CRM already knew about npm downloads? What if GitHub stars were a first-class data type? What if "team adoption" was a pipeline stage?

What if the system just told you: "Acme Corp has 4 engineers using your SDK. API usage up 60%. Ready for outreach."

10/ That's what we built with DevSignal. A CRM where developer signals aren't custom properties bolted on with duct tape -- they're the foundation.

npm, PyPI, GitHub, API usage. Native. Real-time. Scored by AI.

HubSpot for the rest of SaaS. DevSignal for devtools.

devsignal.dev

---

## Thread 3: The Development Acceleration Era

**Hook:** AI just mass-produced 10 million new developers. Now the hard question: who's going to sell to them?

1/ AI just mass-produced 10 million new developers.

Cursor has 1M+ users. Replit has 30M+. GitHub Copilot is on 1.8M paid seats.

People who never wrote code are now shipping products. This changes everything for devtool companies.

2/ More developers = more devtools.

Every AI-assisted developer still needs: hosting (Vercel, Railway), databases (Supabase, Neon), APIs (Resend, Knock), monitoring (Axiom), auth (Clerk), payments (Stripe).

The devtool TAM just 10x'd.

3/ But here's the problem nobody's talking about: more developers also means more noise.

If you're Resend and your npm downloads go from 100k/mo to 1M/mo, great. But which of those million downloads are from companies that will pay $100/mo? $1,000/mo? $10,000/mo?

4/ This is the intelligence problem. And it gets worse every month.

At 10k developers using your free tier, you could eyeball the data. At 100k? At 1M? You need a system that separates signal from noise automatically.

5/ Traditional CRMs can't help. They were built for a world where you had 200 leads/month from a webinar.

Now you have 200 leads/hour from `npm install`. Different problem. Different infrastructure.

6/ The companies that win the next era of devtools will be the ones that answer: "Which developer is about to become a customer?" in real-time.

Not "who filled out a form."
Not "who attended a webinar."
Who is actually USING the product?

7/ The signals are there. They're just scattered:

- npm download trends (are they growing?)
- GitHub activity (are they contributing? Opening issues?)
- API usage (are they hitting rate limits?)
- Team patterns (is it one dev or five?)
- Doc visits (are they reading the enterprise page?)

8/ AI makes this solvable. You can now take those scattered signals, score them, and generate an account brief in seconds:

"Acme Corp: 5 devs, installed SDK 3 weeks ago, API calls up 300%, just visited pricing page. CTO follows you on Twitter."

9/ This is Developer Pipeline Intelligence. The category that needs to exist for the AI-accelerated development era.

Not a CRM. Not a signal tool. Not analytics. The system that turns raw developer activity into pipeline.

10/ We're building DevSignal for this exact moment. The devtool market is about to 10x. The companies that capture that growth will be the ones that know which developers are ready to buy.

$79/mo. Signals + CRM + AI. Purpose-built for devtools.

devsignal.dev

---

## Thread 4: How to Know Which Developer Is Ready to Buy

**Hook:** I spent 3 years at a devtool company. Here are the 7 signals that predict a developer is about to become a paying customer:

1/ I spent 3 years at a devtool company.

Here are the 7 signals that predict a developer is about to become a paying customer (most growth teams miss at least 4 of these):

2/ Signal 1: npm/PyPI download velocity, not volume.

1,000 downloads from one company in steady state = existing user.
100 downloads that grew from 0 in two weeks = new team adopting.

The delta matters more than the absolute number.

3/ Signal 2: GitHub activity beyond stars.

A star is vanity. Here's what actually matters:
- Opening issues = actively using
- Submitting PRs = deeply invested
- Forking = building on top of you
- Watching = following releases

Stars are marketing metrics. Issues are buying signals.

4/ Signal 3: API call patterns.

Steady usage = current plan is fine.
Usage hitting 80% of limits = about to need upgrade.
Sudden 3x spike = new project or team member.
Calls from new IP ranges = expansion to new team.

Your API logs are a goldmine. Most companies ignore them.

5/ Signal 4: Multiple users from the same company.

One developer using your tool = experiment.
Three developers from @acme.com = team adoption.
Five developers + someone from engineering leadership = expansion signal.

This is the strongest predictor of enterprise conversion.

6/ Signal 5: Doc page visits -- specifically which pages.

Homepage visit = browsing.
Quickstart guide = evaluating.
Enterprise/security/SSO page = about to ask about paid plans.
Pricing page twice in one week = warm. Call them now.

7/ Signal 6: Free tier limit proximity.

At 60% of limits: comfortable.
At 80%: aware they're approaching.
At 95%: either upgrade, churn, or find workarounds.

The 80-95% window is your golden outreach moment. Most companies don't track this.

8/ Signal 7: The "champion" pattern.

One developer who:
- Installed the package
- Opened 3 GitHub issues
- Visited docs 10+ times
- Added 2 teammates

This person is your internal champion. They're already selling for you. Find them. Enable them.

9/ Now the hard part: none of these signals live in one place.

npm data is on npmjs.com. GitHub data is in the API. API logs are in your backend. Doc visits are in analytics. User data is in your auth system.

The intelligence is distributed across 5+ systems.

10/ That's the core problem DevSignal solves.

We ingest all these signals natively -- npm, PyPI, GitHub, API usage, doc visits -- score them with AI, and tell you exactly which accounts are ready for outreach.

No more cross-referencing tabs. No more gut feelings.

devsignal.dev/signals

---

## Thread 5: We Built an Entire CRM in 2 Weeks With AI

**Hook:** We just built a production CRM -- 20 data models, GraphQL + REST APIs, real-time WebSocket, AI scoring, workflow engine, Stripe billing, full React UI -- in 2 weeks. With AI writing most of the code. Here's what we learned:

1/ We just built a production CRM in 2 weeks.

20 Prisma models. GraphQL + REST dual API. Real-time WebSocket. AI-generated account briefs. Workflow automation. Stripe billing. Full React UI with Tailwind.

AI wrote most of the code. Here's how we actually did it.

2/ First, the stack decision: Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ.

Not Next.js. Not tRPC. Not the trendy choice. We picked the most boring, well-documented stack possible. AI writes better code when the training data is abundant.

3/ Week 1 was foundation. We did 8 "sprints" (really just focused sessions):

P0: Auth, API keys, core CRUD, error handling
P1: GraphQL with DataLoader, Node SDK
P2: GitHub connector, CSV import, WebSocket
P3: Full-text search, AI enrichment

Each sprint: spec -> implement -> test -> ship.

4/ The AI development pattern that worked:

1. Write the spec yourself. Be precise. Data model, API endpoints, edge cases.
2. Let AI implement file by file.
3. Review the output. Fix the weird parts.
4. Write tests to catch what you missed.

Spec quality = output quality. Garbage in, garbage out.

5/ What AI was great at:

- CRUD endpoints (boring, repetitive -- perfect for AI)
- Prisma schema + migrations
- React components from a description
- Test boilerplate
- Error handling patterns
- GraphQL resolvers + DataLoader setup

6/ What AI was bad at:

- Architecture decisions (it'll build whatever you ask, even if it's wrong)
- Multi-file refactors (context window limits)
- Subtle business logic (PQA scoring weights, workflow trigger conditions)
- Performance optimization (it generates correct but naive code)

7/ Week 2 was product differentiation:

P6: Workflow automation engine
P8: Real workflow actions (HTTP, Slack, tagging)
P10: npm signal connector
P11: 38 Playwright E2E tests
P12: PyPI connector, bulk operations

This is where human product sense mattered most. AI writes code. You decide what to build.

8/ The numbers:

- 203 backend tests, 16 suites
- 38 E2E tests across 6 spec files
- 20 Prisma models
- 11 GraphQL DataLoaders
- Full Docker setup with multi-stage builds
- CI/CD pipeline with 5 jobs
- Node SDK (zero deps, published to npm)

Two people. Two weeks.

9/ Honest take: AI didn't replace us. It compressed the boring parts.

Instead of 3 days writing CRUD endpoints, it was 3 hours. That freed us to spend time on the stuff that matters: what signals to track, how to score accounts, what the workflow engine should automate.

AI is a time compressor, not a human replacer.

10/ The meta-irony: we built a developer pipeline intelligence tool using AI-accelerated development.

The same thesis applies to our product. More AI = more developers = more devtools = more need for DevSignal.

We're live. Repo is open source.

github.com/nerobypaul/headless-crm
devsignal.dev

11/ If you're building a devtool and want to know which developers are ready to buy, we built this for you.

$79/mo. Signals + CRM + AI. No HubSpot needed.

DMs open for early access.
