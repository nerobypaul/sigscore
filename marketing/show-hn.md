# Show HN Post

**Title:** Show HN: Sigscore -- Developer signal intelligence for devtool companies

**URL:** https://github.com/nerobypaul/sigscore

---

**Post body:**

Hi HN,

I built Sigscore because every devtool company I talked to had the same problem: thousands of developers using their product, and no idea which ones are ready to buy.

The PLG CRM wave tried to solve this. Calixa, Koala, Toplyne, Endgame, Pocus -- all dead or acqui-hired. They failed because they bolted developer signals onto a CRM model that doesn't fit how devtools sell. Developers don't fill out forms. They star repos, open issues, install packages, ask questions on Discord, and complain on Reddit.

Sigscore is signal intelligence, not a CRM. It aggregates activity from 16 sources (GitHub, npm, PyPI, Segment, Slack, Discord, Stack Overflow, Twitter/X, Reddit, PostHog, and more), resolves identities across them, and scores every account 0-100 on product-qualified signals. When a developer goes from "kicking the tires" to "deploying in production," you know.

The AI layer uses Claude to generate account briefs and next-best-actions. It's BYOK -- you bring your own Anthropic API key, so there's no markup on AI costs.

Tech stack: Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ on the backend, React 18 + Vite on the frontend. The SDK (@sigscore/node) is zero-dependency and TypeScript-first. Everything is MIT licensed.

Self-hosting is free. The managed service starts at $0/mo for 1,000 contacts. For context, Common Room charges $1K+/mo and Reo.dev $500+/mo.

Live demo: https://sigscore.dev

I'd love feedback on the product, the scoring model, or the approach in general. Happy to answer questions about the architecture too.
