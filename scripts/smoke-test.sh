#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# DevSignal Deployment Smoke Test
# Verifies critical endpoints on a live deployment using only curl.
# Usage: ./scripts/smoke-test.sh [BASE_URL] [--verbose]
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}"  # strip trailing slash
VERBOSE=false
MAX_TIME=2  # seconds — any response slower than this is a failure

for arg in "$@"; do
  [[ "$arg" == "--verbose" ]] && VERBOSE=true
done

# Colors (disabled when stdout is not a terminal)
if [[ -t 1 ]]; then
  GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[0;33m"
  BOLD="\033[1m"; RESET="\033[0m"
else
  GREEN=""; RED=""; YELLOW=""; BOLD=""; RESET=""
fi

PASSED=0
FAILED=0
TOTAL=0

# ── Helpers ──────────────────────────────────────────────────────────

log_pass() { ((PASSED++)); ((TOTAL++)); printf "${GREEN}  PASS${RESET}  %s  (%ss)\n" "$1" "$2"; }
log_fail() { ((FAILED++)); ((TOTAL++)); printf "${RED}  FAIL${RESET}  %s  (expected %s, got %s — %ss)\n" "$1" "$2" "$3" "$4"; }

run_test() {
  local label="$1" method="$2" url="$3" expect_status="$4"
  shift 4
  local extra_curl_args=("$@")

  local tmpfile
  tmpfile=$(mktemp)

  local http_code time_total
  http_code=$(curl -s -o "$tmpfile" -w "%{http_code}|%{time_total}" \
    --max-time "$MAX_TIME" -X "$method" "${extra_curl_args[@]}" "$url" 2>/dev/null) || {
    log_fail "$label" "$expect_status" "timeout/error" "$MAX_TIME"
    $VERBOSE && printf "${YELLOW}    curl error for %s %s${RESET}\n" "$method" "$url"
    rm -f "$tmpfile"
    return
  }

  time_total="${http_code#*|}"
  http_code="${http_code%%|*}"

  if [[ "$http_code" == "$expect_status" ]]; then
    log_pass "$label" "$time_total"
  else
    log_fail "$label" "$expect_status" "$http_code" "$time_total"
  fi

  if $VERBOSE; then
    printf "${YELLOW}    %s %s → %s (%ss)${RESET}\n" "$method" "$url" "$http_code" "$time_total"
    head -c 500 "$tmpfile" 2>/dev/null | sed 's/^/    /'
    printf "\n"
  fi

  rm -f "$tmpfile"
}

run_cors_test() {
  local label="$1" url="$2"
  local tmpfile
  tmpfile=$(mktemp)

  local raw
  raw=$(curl -s -D "$tmpfile" -o /dev/null -w "%{http_code}|%{time_total}" \
    --max-time "$MAX_TIME" -X OPTIONS \
    -H "Origin: https://app.devsignal.io" \
    -H "Access-Control-Request-Method: POST" \
    "$url" 2>/dev/null) || {
    log_fail "$label" "CORS headers" "timeout/error" "$MAX_TIME"
    rm -f "$tmpfile"
    return
  }

  local time_total="${raw#*|}"
  local http_code="${raw%%|*}"

  if grep -qi "access-control-allow" "$tmpfile" 2>/dev/null; then
    log_pass "$label" "$time_total"
  else
    log_fail "$label" "CORS headers present" "missing CORS headers (HTTP $http_code)" "$time_total"
  fi

  if $VERBOSE; then
    printf "${YELLOW}    OPTIONS %s → %s (%ss)${RESET}\n" "$url" "$http_code" "$time_total"
    grep -i "access-control" "$tmpfile" 2>/dev/null | sed 's/^/    /' || printf "    (no CORS headers)\n"
  fi

  rm -f "$tmpfile"
}

# ── Banner ───────────────────────────────────────────────────────────

printf "\n${BOLD}DevSignal Smoke Test${RESET}\n"
printf "Target: %s\n" "$BASE_URL"
printf "Max response time: %ss\n\n" "$MAX_TIME"

# ── Tests ────────────────────────────────────────────────────────────

run_test "GET  /health (liveness)"               GET  "$BASE_URL/health"           200
run_test "GET  /health/ready (readiness)"         GET  "$BASE_URL/health/ready"     200
run_test "GET  / (landing page / SPA)"            GET  "$BASE_URL/"                 200
run_test "POST /api/v1/auth/login (bad creds)"    POST "$BASE_URL/api/v1/auth/login" 401 \
  -H "Content-Type: application/json" -d '{"email":"smoke@test.invalid","password":"wrong"}'
run_test "GET  /api/v1/changelog (public)"        GET  "$BASE_URL/api/v1/changelog" 200
run_test "GET  /api-docs (Swagger UI)"            GET  "$BASE_URL/api-docs/"        200
run_test "GET  /api-docs.json (OpenAPI spec)"     GET  "$BASE_URL/api-docs.json"    200
run_test "GET  /api/v1/nonexistent (API 404)"     GET  "$BASE_URL/api/v1/nonexistent" 404
run_test "GET  /nonexistent-page (SPA fallback)"  GET  "$BASE_URL/nonexistent-page" 200
run_test "GET  /sitemap.xml (SEO)"                GET  "$BASE_URL/sitemap.xml"      200
run_test "GET  /robots.txt (SEO)"                 GET  "$BASE_URL/robots.txt"       200

run_cors_test "OPTIONS /api/v1/graphql (CORS)"         "$BASE_URL/api/v1/graphql"

# ── Summary ──────────────────────────────────────────────────────────

printf "\n${BOLD}Results: %s/%s passed${RESET}" "$PASSED" "$TOTAL"
if [[ "$FAILED" -gt 0 ]]; then
  printf "  ${RED}(%s failed)${RESET}\n\n" "$FAILED"
  exit 1
else
  printf "  ${GREEN}All clear.${RESET}\n\n"
  exit 0
fi
