# DevSignal Financial Model

**Last updated:** 2026-02-18
**Stage:** Pre-revenue / Pre-seed
**Purpose:** Working financial reference — not a pitch deck

---

## 1. Executive Summary

DevSignal is a Developer Signal Intelligence platform targeting Series A-C devtool companies. It aggregates signals across 16 data sources (GitHub, npm, Slack, HubSpot, Salesforce, and more) to surface product-qualified accounts and next-best-action recommendations for go-to-market teams.

**Business model:** SaaS subscription (monthly/annual), 4 tiers.

**Positioning advantage:** Direct competitors charge $500-1,000+/month. DevSignal enters at $79/month — roughly 12x cheaper — while covering the same core use case (developer signal intelligence, account scoring, enrichment). This is not a feature gap; it is a deliberate pricing wedge.

**Cost structure:** Lean. Infrastructure runs on Railway for ~$40-55/month at launch. AI (Claude API) is variable but manageable. The only high-ceiling costs are Anthropic API at scale and Clearbit enrichment if used per-lookup.

**Path to revenue:** Show HN launch -> PLG free tier with frictionless demo -> paid conversion via signal limits and team size gates. No outbound sales required at early stage.

---

## 2. Cost Structure (Monthly)

### 2.1 Fixed Infrastructure Costs

| Service | Plan | Monthly Cost | Notes |
|---------|------|-------------|-------|
| Railway App Service | Starter | $20 | Express API + static SPA |
| Railway Worker Service | Starter | $10 | BullMQ, 21 queues |
| Railway PostgreSQL 16 | Starter | $5-20 | Scales with storage |
| Railway Redis 7 | Starter | $5 | 256MB max, LRU eviction |
| Resend (email) | Free / Pro | $0-20 | Free covers 3K/mo; Pro = 50K/mo for $20 |
| Sentry (monitoring) | Free | $0 | Free tier: 5K errors/mo |
| Domain (devsignal.dev) | Annual | ~$1.25/mo | ~$15/year amortized |
| GitHub | Free | $0 | Public repo |
| **Fixed subtotal** | | **$41-76/mo** | |

### 2.2 Variable Costs (Scale-Dependent)

| Service | Unit Cost | Driver | Notes |
|---------|-----------|--------|-------|
| Anthropic Claude API (Sonnet) | ~$0.003-0.015 per account brief | # of customers x accounts processed | Sonnet: $3/M input tokens, $15/M output tokens. ~500-2,000 tokens per brief. |
| Clearbit enrichment | ~$99-199/mo flat OR ~$0.10-0.25/lookup | # of contacts enriched | Per-lookup model preferred at small scale; flat plan at 1K+ enrichments/mo |
| Stripe processing fees | 2.9% + $0.30 per transaction | MRR | Only on paid transactions |
| Railway compute overage | ~$0.000463/vCPU-min | Traffic spikes | Unlikely until $50K MRR+ |

### 2.3 Anthropic API Cost Model

Average account brief: ~1,000 input tokens + ~500 output tokens = $0.003 input + $0.0075 output = **~$0.0105 per brief**.

| Customer Count | Avg Accounts per Customer | Briefs/Month (10% active) | Claude API Cost |
|---------------|--------------------------|---------------------------|-----------------|
| 10 | 500 | 500 | ~$5 |
| 50 | 500 | 2,500 | ~$26 |
| 100 | 500 | 5,000 | ~$53 |
| 200 | 500 | 10,000 | ~$105 |
| 500 | 500 | 25,000 | ~$263 |

Claude API cost remains well under 1% of revenue through the first 500 customers. It only becomes material if customers are generating briefs aggressively across their full account list without caching.

**Optimization levers available:**
- Cache briefs per account (already in Redis) — regenerate only on signal change
- Rate-limit brief generation per tier (free = no AI, Pro = 100/mo, Growth = 1K/mo, Scale = unlimited)
- Use Haiku for lightweight enrichment tasks, Sonnet only for full briefs

### 2.4 Monthly Burn Summary by Stage

| Stage | Customers | Fixed | Claude API | Clearbit | Stripe Fees | Total Burn |
|-------|-----------|-------|------------|----------|-------------|------------|
| Pre-launch | 0 | $46 | $0 | $0 | $0 | **$46** |
| Early (10 paid) | 10 | $56 | $5 | $99 | ~$30 | **~$190** |
| Growth (50 paid) | 50 | $76 | $26 | $199 | ~$150 | **~$450** |
| Scale (200 paid) | 200 | $96 | $105 | $199 | ~$600 | **~$1,000** |

---

## 3. Revenue Projections (12 Months)

### 3.1 Pricing Tiers — ARPU Reference

| Tier | Price/Mo | Signal Limit | Contact Limit | Users |
|------|----------|-------------|---------------|-------|
| Free | $0 | 5K/mo | 1K | 1 |
| Pro | $79 | 100K/mo | 25K | 10 |
| Growth | $199 | 500K/mo | 100K | 25 |
| Scale | $299 | Unlimited | Unlimited | Unlimited + SSO + SLA |

### 3.2 Scenario A — Conservative

**Assumptions:** Slow organic growth, mostly Pro tier, limited upsell.

| Month | Free Users | Pro | Growth | Scale | MRR | MoM Growth |
|-------|-----------|-----|--------|-------|-----|-----------|
| M1 | 20 | 1 | 0 | 0 | $79 | — |
| M2 | 40 | 2 | 0 | 0 | $158 | +100% |
| M3 | 70 | 3 | 1 | 0 | $436 | +176% |
| M4 | 100 | 4 | 1 | 0 | $515 | +18% |
| M5 | 130 | 5 | 1 | 0 | $594 | +15% |
| M6 | 160 | 5 | 2 | 0 | $793 | +34% |
| M7 | 190 | 7 | 2 | 0 | $951 | +20% |
| M8 | 220 | 9 | 3 | 1 | $1,608 | +69% |
| M9 | 250 | 10 | 4 | 1 | $1,885 | +17% |
| M10 | 280 | 12 | 4 | 1 | $2,043 | +8% |
| M11 | 310 | 13 | 5 | 2 | $2,617 | +28% |
| M12 | 340 | 15 | 5 | 2 | $2,776 | +6% |

**M12 ARR (Conservative): $33,312**

### 3.3 Scenario B — Moderate

**Assumptions:** Show HN drives a spike, steady PLG flywheel, 5-8% monthly free-to-paid conversion.

| Month | Free Users | Pro | Growth | Scale | MRR | MoM Growth |
|-------|-----------|-----|--------|-------|-----|-----------|
| M1 | 50 | 3 | 1 | 0 | $436 | — |
| M2 | 100 | 6 | 2 | 0 | $872 | +100% |
| M3 | 160 | 9 | 3 | 0 | $1,308 | +50% |
| M4 | 220 | 10 | 4 | 1 | $1,885 | +44% |
| M5 | 280 | 10 | 5 | 1 | $2,284 | +21% |
| M6 | 330 | 10 | 5 | 1 | $2,284 | 0% |
| M7 | 380 | 13 | 6 | 2 | $3,221 | +41% |
| M8 | 430 | 16 | 8 | 2 | $3,858 | +20% |
| M9 | 490 | 19 | 9 | 3 | $4,594 | +19% |
| M10 | 550 | 22 | 10 | 3 | $5,171 | +13% |
| M11 | 620 | 25 | 11 | 4 | $6,004 | +16% |
| M12 | 690 | 28 | 13 | 5 | $7,039 | +17% |

**M12 ARR (Moderate): $84,468**

### 3.4 Scenario C — Aggressive

**Assumptions:** Show HN hits front page, 1-2 viral developer community posts, 10%+ free-to-paid conversion, proactive Growth/Scale upsell.

| Month | Free Users | Pro | Growth | Scale | MRR | MoM Growth |
|-------|-----------|-----|--------|-------|-----|-----------|
| M1 | 150 | 8 | 3 | 1 | $1,532 | — |
| M2 | 300 | 15 | 6 | 2 | $3,064 | +100% |
| M3 | 450 | 20 | 10 | 3 | $5,467 | +78% |
| M4 | 550 | 22 | 12 | 4 | $6,322 | +16% |
| M5 | 650 | 24 | 14 | 5 | $7,277 | +15% |
| M6 | 750 | 26 | 16 | 6 | $8,232 | +13% |
| M7 | 850 | 30 | 18 | 7 | $9,671 | +17% |
| M8 | 950 | 35 | 20 | 8 | $11,145 | +15% |
| M9 | 1,050 | 40 | 23 | 9 | $13,087 | +17% |
| M10 | 1,150 | 44 | 26 | 10 | $14,840 | +13% |
| M11 | 1,250 | 48 | 29 | 11 | $16,593 | +12% |
| M12 | 1,350 | 52 | 32 | 12 | $18,346 | +11% |

**M12 ARR (Aggressive): $220,152**

### 3.5 MRR Summary at M12

| Scenario | M12 MRR | M12 ARR | Paying Customers |
|----------|---------|---------|-----------------|
| Conservative | $2,776 | $33,312 | 22 |
| Moderate | $7,039 | $84,468 | 46 |
| Aggressive | $18,346 | $220,152 | 96 |

---

## 4. Unit Economics

### 4.1 ARPU by Tier

| Tier | Price | % of Mix (Est.) | Contribution |
|------|-------|----------------|-------------|
| Free | $0 | 90-95% of signups | $0 |
| Pro | $79 | 60-70% of paid | $79 |
| Growth | $199 | 25-35% of paid | $199 |
| Scale | $299 | 5-10% of paid | $299 |

**Blended ARPU (paid only):** Assuming 65% Pro / 28% Growth / 7% Scale:
`(0.65 × $79) + (0.28 × $199) + (0.07 × $299) = $51.35 + $55.72 + $20.93 = **~$128/mo**`

### 4.2 Gross Margin per Tier

Variable costs per customer per month (Stripe + Claude API proportional share):

| Tier | Revenue | Stripe Fee | Claude API | Clearbit (prorated) | Gross Profit | Gross Margin |
|------|---------|-----------|-----------|---------------------|-------------|-------------|
| Free | $0 | $0 | ~$0.50 | ~$2.00 | -$2.50 | N/A |
| Pro | $79 | ~$2.59 | ~$1.05 | ~$4.00 | ~$71.36 | **90%** |
| Growth | $199 | ~$6.08 | ~$2.65 | ~$6.00 | ~$184.27 | **93%** |
| Scale | $299 | ~$8.98 | ~$5.25 | ~$8.00 | ~$276.77 | **93%** |

Note: Clearbit prorated assumes 100 customers sharing $199/mo flat plan. Per-lookup model changes this significantly at low customer counts.

**Blended gross margin (paid customers): ~91%**

This is typical SaaS and reflects the extremely low marginal cost of serving additional customers on the same infrastructure.

### 4.3 Lifetime Value (LTV)

Assumptions:
- Average customer lifetime: 18 months (monthly churn target < 5%; 5% monthly = ~60% annual = ~20 months avg life; conservatively 18)
- Blended ARPU: $128/mo

**LTV = ARPU × Avg Lifetime × Gross Margin**
**LTV = $128 × 18 × 0.91 = ~$2,095**

By tier:

| Tier | ARPU | Gross Margin | Lifetime | LTV |
|------|------|-------------|----------|-----|
| Pro | $79 | 90% | 18 mo | **$1,279** |
| Growth | $199 | 93% | 18 mo | **$3,330** |
| Scale | $299 | 93% | 18 mo | **$5,005** |

### 4.4 CAC Target (LTV:CAC > 3:1)

| Tier | LTV | Max CAC (3:1) | Max CAC (5:1) |
|------|-----|--------------|--------------|
| Pro | $1,279 | $426 | $256 |
| Growth | $3,330 | $1,110 | $666 |
| Scale | $5,005 | $1,668 | $1,001 |
| **Blended** | **$2,095** | **$698** | **$419** |

**PLG strategy significantly reduces CAC.** If free-to-paid conversion happens with zero sales touch, CAC is essentially the cost of content/marketing per acquired customer. At 1,000 free signups/mo with 5% conversion = 50 new paid customers. If content spend is $1,000/mo, blended CAC = $20 — far below any tier's LTV threshold.

### 4.5 Payback Period

At blended ARPU of $128/mo and 91% gross margin, gross profit per customer per month = $116.

| CAC | Payback Period |
|-----|---------------|
| $50 | 0.4 months |
| $200 | 1.7 months |
| $500 | 4.3 months |
| $1,000 | 8.6 months |

Target: payback under 6 months. This is achievable as long as CAC stays below ~$700 per customer.

---

## 5. Break-Even Analysis

**Break-even** = monthly costs covered by MRR.

### 5.1 Cost baseline by stage

| Stage | Monthly Fixed + Variable Costs |
|-------|-------------------------------|
| Pre-launch (0 customers) | ~$46 |
| 10 paid customers | ~$190 |
| 25 paid customers | ~$280 |
| 50 paid customers | ~$450 |
| 100 paid customers | ~$620 |
| 200 paid customers | ~$1,000 |

### 5.2 Break-Even Month by Scenario

**Scenario A (Conservative):**
Break-even requires ~$280 MRR (covers infrastructure + minimal variable costs at 25 customers).
MRR crosses $280 at M4 ($515). **Break-even: Month 4.**

| Month | MRR | Monthly Burn | Net |
|-------|-----|-------------|-----|
| M1 | $79 | $190 | -$111 |
| M2 | $158 | $220 | -$62 |
| M3 | $436 | $260 | **+$176** |
| M4+ | Growing | ~$300 | Positive |

**Scenario B (Moderate):**
Break-even at M2 ($872 MRR vs. ~$300 burn). **Break-even: Month 2.**

| Month | MRR | Monthly Burn | Net |
|-------|-----|-------------|-----|
| M1 | $436 | $280 | +$156 |
| M2+ | $872 | ~$350 | Positive |

**Scenario C (Aggressive):**
Break-even at M1 ($1,532 MRR vs. ~$380 burn). **Break-even: Month 1.**

### 5.3 Cumulative Cash Position (Starting from $0)

Assumes founder takes $0 salary during bootstrapped phase. All costs are infrastructure + services.

**Scenario A — Cumulative:**

| Month | MRR | Monthly Burn | Monthly Net | Cumulative |
|-------|-----|-------------|------------|-----------|
| M1 | $79 | $190 | -$111 | -$111 |
| M2 | $158 | $220 | -$62 | -$173 |
| M3 | $436 | $260 | +$176 | +$3 |
| M4 | $515 | $280 | +$235 | +$238 |
| M5 | $594 | $300 | +$294 | +$532 |
| M6 | $793 | $320 | +$473 | +$1,005 |
| M12 | $2,776 | ~$500 | +$2,276 | ~$9,000 |

The business is cash-flow positive from month 3 in the conservative scenario. Maximum cash exposure: **$173** — trivially fundable from personal resources.

**Scenario B — Cumulative:**

The business is cash-flow positive from day 1 if Show HN converts at moderate expectations. No external funding required.

---

## 6. Key Metrics to Track

### 6.1 Primary SaaS Metrics

| Metric | Target | Red Flag | How to Measure |
|--------|--------|----------|---------------|
| MRR | Growing >10% MoM | <5% MoM | Stripe MRR dashboard |
| ARR | — | — | MRR × 12 |
| MRR Growth Rate | 15-20% MoM early | <10% | Month-over-month delta |
| Paying Customers | — | — | Stripe active subscriptions |
| Free Users | Growing | Flatline | Database org count |
| Free-to-Paid Conversion | 5-8% | <3% | Paid / Total free (90-day cohort) |
| Monthly Churn Rate | <3% | >5% | Cancelled / Active at start of month |
| Annual Churn Rate | <30% | >50% | 1 - (1 - monthly_churn)^12 |
| ARPU | $128+ | <$80 | MRR / Paying customers |
| LTV | $2,000+ | <$1,000 | ARPU × Lifetime × Gross margin |
| CAC | <$700 | >$1,500 | Total marketing spend / New customers |
| LTV:CAC | >3:1 | <2:1 | LTV / CAC |
| Payback Period | <6 months | >12 months | CAC / (ARPU × Gross margin) |
| Gross Margin | >88% | <80% | (Revenue - Variable costs) / Revenue |

### 6.2 Product-Specific Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Signals processed/month | Growing | Proxy for platform value delivery |
| Account briefs generated/month | Growing | AI feature adoption |
| Integration connections per account | 3+ | Depth = retention |
| API calls per customer per month | Growing | Engagement signal |
| Avg accounts tracked per customer | 500+ | Indicates serious use |
| Demo-to-signup conversion | 20%+ | Demo mode effectiveness |
| Signal sources connected per org | 4+ | More sources = higher stickiness |

### 6.3 Infrastructure Health Metrics

| Metric | Alert Threshold | Service |
|--------|----------------|---------|
| API error rate | >1% | Sentry |
| Claude API cost/day | >$20 | Manual check or BullMQ job |
| Redis memory usage | >200MB | Railway dashboard |
| PostgreSQL size | >4GB on starter | Railway dashboard |
| Queue backlog (BullMQ) | >1K jobs | Bull Board or Redis keys |
| Stripe failed payments | Any | Stripe dashboard |

### 6.4 Churn Analysis Framework

Track churn by:
- **Tier:** Pro churns at different rates than Growth/Scale
- **Cohort:** Month-1 cohorts often have higher churn (wrong fit)
- **Signal volume:** Low signal processing correlates with churn risk
- **Time to value:** Did they connect at least 2 integrations? That's the retention hook.

---

## 7. Funding Considerations

### 7.1 Current Stage

**Bootstrapped / Pre-seed.** No external funding required to launch or reach break-even.

The fundamental math is compelling: total cash exposure before break-even is under $200 in the conservative scenario. This product can reach ramen profitability with 4-5 paying Pro customers.

### 7.2 Runway Analysis

Assuming a $10,000 personal runway buffer (typical for solo founder):

| Scenario | Break-Even Month | Cash at M12 | Runway from $10K |
|----------|-----------------|-------------|-----------------|
| Conservative | M3 | ~$9,000+ | Never at risk |
| Moderate | M1 | ~$50,000+ | Never at risk |
| Aggressive | M1 | ~$150,000+ | Never at risk |

No scenario requires external capital to sustain operations. The only reason to raise would be to accelerate growth (hire sales/marketing, expand integrations, build ML scoring).

### 7.3 When Bootstrapped Makes Sense

Stay bootstrapped if:
- MRR growing 10-20%/month organically through PLG
- Gross margin holding at 88%+
- Churn below 4%/month
- No competitor has raised and is aggressively undercutting on price

This scenario plays out like a calm SaaS business with $250K-500K ARR in 2-3 years on zero outside capital.

### 7.4 When to Consider Raising

Raise if:
- A well-funded competitor (Common Room, Reo.dev) drops pricing to match
- Enterprise demand requires dedicated sales + compliance investment (SOC 2, SAML at scale)
- Proven PLG flywheel shows $15K+ MRR and 20%+ MoM growth — raise to pour fuel on it
- Opportunity to own a specific vertical (e.g., open-source devtool companies) before anyone else

**Optimal raise timing:** After reaching $10K MRR with consistent 15%+ monthly growth. At that point, the business can raise a $500K-1.5M pre-seed at a reasonable valuation ($3-8M) with real traction data.

### 7.5 Pre-Seed Scenario Modeling

If raising $750K at M8-M10:

| Use of Funds | Monthly Budget | Duration |
|-------------|---------------|---------|
| Founder salary (1 FTE) | $8,000 | 18 months |
| First hire (engineer or growth) | $7,000 | 12 months |
| Marketing / content / SEO | $2,000 | 18 months |
| Infrastructure scale | $1,500 | 18 months |
| Legal / compliance | $500 | 18 months |
| **Total** | **$19,000/mo** | ~18 months runway |

At Scenario B's M8 MRR of $3,858, self-generated revenue covers ~20% of burn. By M18, if moderate growth continues, MRR should be $12-15K — covering 60-75% of monthly burn without additional raises.

---

## 8. Sensitivity Analysis

### 8.1 Churn Rate Impact on LTV

| Monthly Churn | Avg Lifetime | Blended LTV |
|--------------|-------------|-------------|
| 2% | 50 months | ~$5,800 |
| 3% | 33 months | ~$3,840 |
| 5% | 20 months | ~$2,330 |
| 8% | 12.5 months | ~$1,450 |
| 12% | 8.3 months | ~$970 |

At 5% monthly churn, LTV is still $2,330 — more than 3x the typical CAC target for PLG products. At 8%+, the business struggles to stay ahead of acquisition costs.

**The single most important metric to obsess over early: monthly churn.** Every percentage point of churn improvement has compounding impact on LTV and ARR ceiling.

### 8.2 Tier Mix Impact on MRR

For 50 paying customers:

| Mix Scenario | Pro | Growth | Scale | MRR |
|-------------|-----|--------|-------|-----|
| All Pro | 50 | 0 | 0 | $3,950 |
| Balanced | 33 | 13 | 4 | $5,813 |
| Upsell-heavy | 20 | 20 | 10 | $8,560 |
| All Scale | 0 | 0 | 50 | $14,950 |

Moving 10 customers from Pro to Growth adds $1,200 MRR with zero new customer acquisition. Growth tier upsell is the highest-leverage near-term revenue action.

### 8.3 Clearbit Cost Scenarios

| Model | Cost | Breakeven customers |
|-------|------|---------------------|
| Flat $99/mo | $99 | 2 Pro customers |
| Flat $199/mo | $199 | 3 Pro customers |
| Per-lookup $0.10 (avg 100 lookups/customer/mo) | $10/customer | Scales linearly |
| Per-lookup $0.25 | $25/customer | Becomes $1,250 at 50 customers |

**Recommendation:** Start with flat plan ($199/mo), switch to negotiated volume deal after 200 customers.

---

## 9. Year 2 Outlook

Projections beyond month 12 are speculative, but useful for target-setting.

### Conservative Year 2 Target
- $8,000 MRR by M18 (~$96K ARR)
- 50-80 paying customers
- Still bootstrapped

### Moderate Year 2 Target
- $20,000 MRR by M18 (~$240K ARR)
- 120-150 paying customers
- Considering seed raise or revenue-based financing

### Aggressive Year 2 Target
- $50,000 MRR by M18 (~$600K ARR)
- 300+ paying customers
- Active seed fundraising, hiring 2 FTEs

---

## 10. Open Questions

- **Clearbit pricing:** Is per-lookup or flat more cost-effective at early stage? Need to test how many enrichments are actually triggered per customer per month before committing to flat.
- **Annual discount:** Should annual plans be offered at -20% (standard) from day one, or wait until there's a retention problem? Annual plans improve cash flow but reduce flexibility.
- **Free tier limits:** Are 1K contacts / 5K signals generous enough to drive real PLG value, or should limits be more aggressive to force faster conversion? Worth A/B testing at 500+ free users.
- **Scale tier pricing:** $299 may be too low if customers are replacing $1K+/month Common Room subscriptions. Could test $499 for Scale with custom enterprise at $999.
- **Usage-based component:** Consider adding overage pricing (e.g., $5 per additional 10K signals) rather than hard limits — reduces churn and increases ARPU naturally.

---

*This document is maintained as a working reference. Update monthly after first revenue.*
