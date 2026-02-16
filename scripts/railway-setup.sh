#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# DevSignal — Railway Setup Helper
# Run once to provision infrastructure on Railway.
# Prerequisites: `npm i -g @railway/cli` and `railway login`
# ─────────────────────────────────────────────────────────────
set -euo pipefail

BOLD="\033[1m"; GREEN="\033[0;32m"; YELLOW="\033[0;33m"; RESET="\033[0m"

printf "\n${BOLD}DevSignal — Railway Setup${RESET}\n\n"

# ── 1. Link to Railway project ───────────────────────────────
printf "${YELLOW}Step 1: Link project${RESET}\n"
printf "  If you haven't created a project yet:\n"
printf "    railway init\n"
printf "  Or link to an existing one:\n"
printf "    railway link\n\n"

# ── 2. Add PostgreSQL ────────────────────────────────────────
printf "${YELLOW}Step 2: Add PostgreSQL${RESET}\n"
printf "  railway add --plugin postgresql\n"
printf "  Railway auto-sets DATABASE_URL in the service env.\n\n"

# ── 3. Add Redis ─────────────────────────────────────────────
printf "${YELLOW}Step 3: Add Redis${RESET}\n"
printf "  railway add --plugin redis\n"
printf "  Railway auto-sets REDIS_URL in the service env.\n\n"

# ── 4. Set environment variables ─────────────────────────────
printf "${YELLOW}Step 4: Set required environment variables${RESET}\n"
printf "  Copy from .env.example and set each one:\n\n"

REQUIRED_VARS=(
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "ANTHROPIC_API_KEY"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "RESEND_API_KEY"
  "SENTRY_DSN"
  "FRONTEND_URL"
)

OPTIONAL_VARS=(
  "OAUTH_GITHUB_CLIENT_ID"
  "OAUTH_GITHUB_CLIENT_SECRET"
  "OAUTH_GOOGLE_CLIENT_ID"
  "OAUTH_GOOGLE_CLIENT_SECRET"
  "HUBSPOT_CLIENT_ID"
  "HUBSPOT_CLIENT_SECRET"
  "SLACK_SIGNING_SECRET"
)

printf "  ${BOLD}Required:${RESET}\n"
for var in "${REQUIRED_VARS[@]}"; do
  printf "    railway variables set %s=<value>\n" "$var"
done

printf "\n  ${BOLD}Optional (integrations):${RESET}\n"
for var in "${OPTIONAL_VARS[@]}"; do
  printf "    railway variables set %s=<value>\n" "$var"
done

# ── 5. Deploy ────────────────────────────────────────────────
printf "\n${YELLOW}Step 5: Deploy${RESET}\n"
printf "  railway up\n\n"
printf "  Railway detects the Dockerfile automatically.\n"
printf "  Prisma migrations run on startup (CMD in Dockerfile).\n\n"

# ── 6. Worker service (optional) ─────────────────────────────
printf "${YELLOW}Step 6: Add worker service (for BullMQ jobs)${RESET}\n"
printf "  In Railway dashboard, create a second service from the same repo.\n"
printf "  Override the start command:\n"
printf "    node dist/worker.js\n"
printf "  Share the same PostgreSQL + Redis plugins.\n\n"

# ── 7. Custom domain ─────────────────────────────────────────
printf "${YELLOW}Step 7: Custom domain${RESET}\n"
printf "  railway domain\n"
printf "  Then add a CNAME record for devsignal.dev → <railway-domain>\n\n"

# ── 8. Verify ────────────────────────────────────────────────
printf "${YELLOW}Step 8: Run smoke test${RESET}\n"
printf "  ./scripts/smoke-test.sh https://devsignal.dev\n\n"

printf "${GREEN}${BOLD}Setup complete!${RESET} Your DevSignal instance should be live.\n\n"
