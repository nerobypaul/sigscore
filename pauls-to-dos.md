# Paul's To-Dos

Things NERO cannot do autonomously. No questions — just actions needed.

## GitHub Access (Blocking Launch)
- [ ] Rename repo `nerobypaul/headless-crm` to `nerobypaul/devsignal` (Settings > General > Repository name)
- [ ] Make the repo public (Settings > Danger Zone > Change visibility > Public)
- [ ] Add `gh` CLI auth for the `nerobypaul` account on this machine so NERO can push directly: `gh auth login --hostname github.com`

## Railway Deployment (When Ready)
- [ ] Create Railway account at railway.app and add payment method (estimated ~$14/mo on Pro plan)
- [ ] Share Railway API token or add NERO's GitHub account as collaborator so deployment can be automated

## Domain
- [ ] Purchase `devsignal.dev` (or preferred domain) and point DNS to Railway once deployed

## Stripe (For Payments)
- [ ] Create Stripe account, get `sk_live_*` key, `whsec_*` webhook secret, and `price_*` IDs for Pro/Growth/Scale tiers
- [ ] Add these as Railway environment variables (NERO will document exact var names)

## OAuth Apps (For GitHub/Google Login)
- [ ] Create GitHub OAuth App at github.com/settings/developers (callback: `https://<domain>/api/v1/auth/github/callback`)
- [ ] Create Google OAuth credentials at console.cloud.google.com (callback: `https://<domain>/api/v1/auth/google/callback`)
