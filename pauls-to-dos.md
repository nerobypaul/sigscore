# Production Deployment Checklist

**Current Status:** App deployed to Railway at https://energetic-wisdom-production.up.railway.app
**Services:** web (API + frontend) + worker (BullMQ) + PostgreSQL + Redis
**Health:** 12/12 smoke tests passing

---

## 🔑 Required API Keys

Set via Railway CLI: `railway variables set KEY=value`

### 1. Stripe (Billing System)

- [ ] **Create Stripe account** at https://stripe.com
- [ ] **Get live secret key**: Dashboard > Developers > API Keys > Reveal test/live key
  - [ ] Set `STRIPE_SECRET_KEY=sk_live_...`
  - [ ] Set `STRIPE_PUBLISHABLE_KEY=pk_live_...` (for frontend)
- [ ] **Create 3 products** in Stripe Dashboard:
  - [ ] Pro tier: $79/mo → Copy price ID → Set `STRIPE_PRICE_PRO=price_...`
  - [ ] Growth tier: $199/mo → Copy price ID → Set `STRIPE_PRICE_GROWTH=price_...`
  - [ ] Scale tier: $299/mo → Copy price ID → Set `STRIPE_PRICE_SCALE=price_...`
- [ ] **Create webhook endpoint**: Dashboard > Developers > Webhooks > Add endpoint
  - URL: `https://energetic-wisdom-production.up.railway.app/api/v1/billing/webhook`
  - Events: Select "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.payment_succeeded", "invoice.payment_failed"
  - [ ] Copy signing secret → Set `STRIPE_WEBHOOK_SECRET=whsec_...`

### 2. Resend (Transactional Email)

- [ ] **Sign up** at https://resend.com
- [ ] **Verify sending domain**: Dashboard > Domains > Add Domain
  - Add DNS records (DKIM, SPF, etc.) at your domain provider
  - Wait for verification (can take 10-30 minutes)
- [ ] **Create API key**: Dashboard > API Keys > Create API Key
  - [ ] Set `RESEND_API_KEY=re_...`

### 3. Sentry (Error Monitoring)

- [ ] **Create Sentry account** at https://sentry.io
- [ ] **Create project**: Node.js platform
- [ ] **Copy DSN**: Project Settings > Client Keys (DSN)
  - [ ] Set `SENTRY_DSN=https://...@sentry.io/...`

### 4. Anthropic (AI Features)

- [ ] **Get API key** from https://console.anthropic.com/settings/keys
  - [ ] Set `ANTHROPIC_API_KEY=sk-ant-...`

### 5. GitHub OAuth (Login with GitHub)

- [ ] **Create OAuth App**: https://github.com/settings/developers > New OAuth App
  - Application name: `DevSignal`
  - Homepage URL: `https://energetic-wisdom-production.up.railway.app`
  - Callback URL: `https://energetic-wisdom-production.up.railway.app/api/v1/auth/github/callback`
- [ ] **Copy credentials**:
  - [ ] Set `OAUTH_GITHUB_CLIENT_ID=...`
  - [ ] Set `OAUTH_GITHUB_CLIENT_SECRET=...`

### 6. Google OAuth (Login with Google)

- [ ] **Go to** https://console.cloud.google.com
- [ ] **Create project** or select existing one
- [ ] **Enable Google+ API**: APIs & Services > Library > Search "Google+ API" > Enable
- [ ] **Configure consent screen**: APIs & Services > OAuth consent screen
  - User Type: External
  - App name: `DevSignal`
  - Support email: your email
  - Authorized domains: `railway.app` (or your custom domain)
- [ ] **Create credentials**: APIs & Services > Credentials > Create OAuth Client ID
  - Application type: Web application
  - Authorized redirect URIs: `https://energetic-wisdom-production.up.railway.app/api/v1/auth/google/callback`
- [ ] **Copy credentials**:
  - [ ] Set `OAUTH_GOOGLE_CLIENT_ID=...`
  - [ ] Set `OAUTH_GOOGLE_CLIENT_SECRET=...`

---

## 🌐 Custom Domain Setup (Optional but Recommended)

- [ ] **Register domain**: Buy `devsignal.dev` or similar at Namecheap/Cloudflare/etc.
- [ ] **Add to Railway**:
  - Railway > energetic-wisdom service > Settings > Networking > Custom Domain
  - Enter your domain (e.g., `devsignal.dev`)
- [ ] **Update DNS**: Add CNAME record at your DNS provider
  - Name: `@` (or `www`)
  - Target: (Railway will show target like `energetic-wisdom-production.up.railway.app`)
- [ ] **Update environment variables** with new domain:
  - [ ] `railway variables set FRONTEND_URL=https://devsignal.dev`
  - [ ] `railway variables set CORS_ORIGIN=https://devsignal.dev`
  - [ ] `railway variables set API_URL=https://devsignal.dev/api/v1`
- [ ] **Update OAuth callbacks**:
  - [ ] GitHub OAuth app: Change callback to `https://devsignal.dev/api/v1/auth/github/callback`
  - [ ] Google OAuth: Add `https://devsignal.dev/api/v1/auth/google/callback` to authorized redirect URIs
- [ ] **Update Stripe webhook**: Change URL to `https://devsignal.dev/api/v1/billing/webhook`

---

## 📦 SDK Publishing

- [ ] **Create npm account** if you don't have one: https://www.npmjs.com/signup
- [ ] **Create @devsignal organization**: https://www.npmjs.com/org/create
- [ ] **Login via CLI**: `npm login`
- [ ] **Publish SDK**:
  ```bash
  cd packages/sdk
  npm publish --access public
  ```
- [ ] **Verify**: Check https://www.npmjs.com/package/@devsignal/node

---

## 🚀 Show HN Launch

### Pre-launch

- [ ] **Make repo public**: https://github.com/nerobypaul/headless-crm
  - Settings > Danger Zone > Change visibility > Public
- [ ] **Polish README.md**:
  - [ ] Add demo GIF/screenshot
  - [ ] Clear installation instructions
  - [ ] Link to live demo
  - [ ] Add "Show HN" badge once live
- [ ] **Test production app end-to-end**:
  - [ ] Sign up flow works
  - [ ] OAuth login works (GitHub + Google)
  - [ ] Can create contacts, deals, signals
  - [ ] Billing checkout flow works (use Stripe test mode first)
  - [ ] Email notifications arrive
  - [ ] All integrations connect successfully

### Launch Day

- [ ] **Submit to Hacker News**: https://news.ycombinator.com/submit
  - **Title**: `Show HN: DevSignal – Developer signal intelligence for devtool companies`
  - **URL**: `https://devsignal.dev` (or Railway URL if no custom domain)
  - **Text** (optional): Brief description (~200 chars)
- [ ] **Monitor**:
  - [ ] Watch HN comments, respond quickly
  - [ ] Monitor Sentry for errors
  - [ ] Watch Railway metrics for CPU/memory/database spikes
  - [ ] Check Redis queue depths in BullMQ dashboard
- [ ] **Be responsive**: Reply to every comment within 30 minutes for first 2-3 hours

### Post-launch

- [ ] **Tweet about it**: Link to HN thread + demo
- [ ] **Post in relevant communities**:
  - [ ] r/SideProject
  - [ ] r/webdev
  - [ ] Indie Hackers
  - [ ] Product Hunt (wait 1-2 weeks after Show HN)

---

## ✅ Already Configured (No Action Needed)

These are already set in Railway:

- ✅ `DATABASE_URL` — Railway-managed PostgreSQL
- ✅ `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` — Railway-managed Redis
- ✅ `JWT_SECRET`, `JWT_REFRESH_SECRET` — Generated secrets
- ✅ `CORS_ORIGIN` — Set to production URL
- ✅ `NODE_ENV=production`
- ✅ Start commands configured (web + worker)
- ✅ Web + Worker services both running
- ✅ Database migrations applied
- ✅ Health checks passing

---

## 🔍 Monitoring Checklist

Once keys are set, verify features work:

- [ ] **Billing**: Create test subscription, verify webhook events received
- [ ] **Email**: Trigger welcome email, check inbox
- [ ] **AI Briefs**: Generate account brief, verify Anthropic API call succeeds
- [ ] **Error Tracking**: Trigger test error, verify it appears in Sentry
- [ ] **OAuth**: Login with GitHub and Google accounts
- [ ] **Background Jobs**: Check Railway worker logs, verify BullMQ processing signals

---

## 📊 Success Metrics to Track

- User signups (first 100)
- Stripe conversions (free → paid)
- HN upvotes + comments
- GitHub stars
- Sentry error rate (<1% of requests)
- API response times (p95 <500ms)
- Worker job completion rate (>99%)

---

## 🆘 Troubleshooting

**If health checks fail:**
- Check Railway logs: `railway logs --service web` or `railway logs --service worker`
- Verify DATABASE_URL is accessible: `railway run --service web "node -e \"console.log(process.env.DATABASE_URL)\""`

**If Stripe webhooks fail:**
- Verify signing secret matches: Railway dashboard > Variables > STRIPE_WEBHOOK_SECRET
- Check webhook endpoint logs in Stripe dashboard

**If emails don't send:**
- Verify domain DNS records in Resend dashboard (all green checkmarks)
- Check Resend logs for bounces/errors

**If OAuth fails:**
- Verify callback URLs match exactly (trailing slash matters!)
- Check client ID/secret are set correctly in Railway
