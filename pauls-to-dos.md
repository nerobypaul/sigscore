# Paul's To-Dos

Things NERO cannot do autonomously.

---

## DONE: DevSignal is Live

**URL:** https://energetic-wisdom-production.up.railway.app

12/12 smoke tests passing. DB healthy (302ms), Redis healthy (147ms).

**Services running:**
- `energetic-wisdom` — API + frontend (node dist/server.js)
- `worker` — BullMQ background jobs (node dist/worker.js)
- PostgreSQL + Redis on Railway

---

## Still Needs Your API Keys (not blocking, but enables features)

| # | Service | URL | Env var to set on Railway |
|---|---------|-----|--------------------------|
| 1 | Anthropic | https://console.anthropic.com/settings/keys | `ANTHROPIC_API_KEY` (enables AI account briefs) |
| 2 | Stripe | https://dashboard.stripe.com/test/apikeys | `STRIPE_SECRET_KEY` (enables billing) |
| 3 | Resend | https://resend.com/api-keys | `RESEND_API_KEY` (enables transactional email) |
| 4 | Sentry | https://sentry.io | `SENTRY_DSN` (enables error monitoring) |

To set a variable: `railway service link 2ac88bec-9cfc-4d8b-b49b-95b387846a4d && railway variables set KEY=value`

---

## Optional: Custom Domain

1. Buy `devsignal.dev` (or your preferred domain)
2. Railway > web service > Settings > Networking > Custom Domain > enter domain
3. Railway shows a CNAME target — add it in your DNS provider
4. Update `FRONTEND_URL`: `railway variables set FRONTEND_URL=https://devsignal.dev`

---

## Optional: OAuth Apps (for "Login with GitHub/Google")

### GitHub OAuth
1. https://github.com/settings/developers > New OAuth App
2. Application name: `DevSignal`
3. Homepage URL: `https://<your-domain>`
4. Callback URL: `https://<your-domain>/oauth/callback`
5. Set on Railway: `OAUTH_GITHUB_CLIENT_ID` + `OAUTH_GITHUB_CLIENT_SECRET`

### Google OAuth
1. https://console.cloud.google.com > APIs & Services > Credentials > Create OAuth Client ID
2. Type: Web application
3. Redirect URI: `https://<your-domain>/oauth/callback`
4. Set on Railway: `OAUTH_GOOGLE_CLIENT_ID` + `OAUTH_GOOGLE_CLIENT_SECRET`

---

## Show HN Launch Checklist

- [ ] Make repo public: https://github.com/nerobypaul/headless-crm > Settings > Danger Zone > Change visibility > Public
- [ ] Go to https://news.ycombinator.com/submit
- [ ] **Title**: `Show HN: DevSignal – Open-source developer signal intelligence for devtool companies`
- [ ] **URL**: `https://devsignal.dev` (or Railway URL if no custom domain yet)
