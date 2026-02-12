#!/bin/bash
# NERO — Autonomous CRM Development Runner
# Runs Claude Code in a loop with fresh context each cycle.
# Each cycle can spawn agent swarms for parallel work.
# The changelog is the persistent memory between runs.
#
# Usage:
#   ./nero.sh              # Run with defaults (10 min cycles)
#   ./nero.sh 15           # 15 minute cycles
#   ./nero.sh 10 50        # 10 min cycles, max 50 iterations
#   NERO_DRY_RUN=1 ./nero.sh  # Preview the prompt without running

set -euo pipefail

HEARTBEAT_MIN="${1:-10}"
MAX_CYCLES="${2:-0}"  # 0 = infinite
PROJECT_DIR="/Users/paulnispel/headless-crm"
LOG_DIR="$PROJECT_DIR/.nero"

mkdir -p "$LOG_DIR"

# Keep the machine awake
caffeinate -dims &
CAFFEINATE_PID=$!
trap "kill $CAFFEINATE_PID 2>/dev/null; echo '[NERO] Shutdown at $(date +%H:%M:%S).'" EXIT

cycle=0

echo "==========================================="
echo "  NERO — Autonomous Development Runner"
echo "==========================================="
echo "  Cycle length : ${HEARTBEAT_MIN} min"
echo "  Max cycles   : ${MAX_CYCLES:-unlimited}"
echo "  Project      : $PROJECT_DIR"
echo "  Logs         : $LOG_DIR/"
echo "  PID          : $$"
echo "  Started      : $(date '+%Y-%m-%d %H:%M:%S')"
echo "==========================================="
echo ""

while true; do
  cycle=$((cycle + 1))
  TODAY=$(date +%Y-%m-%d)

  if [ "$MAX_CYCLES" -gt 0 ] && [ "$cycle" -gt "$MAX_CYCLES" ]; then
    echo "[NERO] Max cycles ($MAX_CYCLES) reached. Stopping."
    break
  fi

  TIMESTAMP=$(date '+%H:%M:%S')
  LOGFILE="$LOG_DIR/${TODAY}-cycle-${cycle}.log"

  echo "[NERO] [$TIMESTAMP] === Cycle $cycle ==="

  # Inject CLAUDE.md as the identity/mission context
  CLAUDE_MD=$(cat "$PROJECT_DIR/CLAUDE.md" 2>/dev/null || echo "")

  PROMPT=$(cat <<PROMPT_EOF
$CLAUDE_MD

---

# NERO Autonomous Cycle

You are NERO. You think big. You build an outstanding product with outstanding features and outstanding UX/UI. This is not a toy — this is a real product that real devtool companies will pay for. Every cycle, you push it closer to launch.

## PHASE 1: Context Recovery (do this first, every cycle)
1. Read CLAUDE.md for your mission and identity
2. List .changelog/ files, read the LATEST one to find the "Next Steps" section
3. Run \`git log --oneline -10\` to see what was recently committed
4. Run \`cd backend && npx jest --no-coverage\` — record pass/fail count
5. Check \`git status --short\` for any uncommitted work

## PHASE 2: Plan This Cycle
Based on what you found:
- Identify 2-4 tasks that can be done IN PARALLEL this cycle
- Prioritize: P0 blockers > P1 beta-readiness > P2 product value > P3 nice-to-have
- Think like a founder: what would make a VP of Sales at Vercel or Supabase say "I need this"?
- If the roadmap is empty, research what's next — new features, better UX, integrations, landing page, pricing model — whatever moves the product forward

## PHASE 3: Execute with Agent Swarms
Use the Task tool to spawn MULTIPLE agents in PARALLEL. Examples:
- Task(subagent_type="coder") for feature implementation
- Task(subagent_type="tester") for writing/running tests
- Task(subagent_type="reviewer") for code review and security
- Task(subagent_type="researcher") for market/technical research

Spawn them all at once — don't wait for one to finish before starting the next.
Wait for all agents to complete, then verify their work.

## PHASE 4: Verify & Commit
1. Run the full test suite — if anything fails, fix it
2. Run \`cd frontend && npx tsc --noEmit\` to check frontend types
3. Stage all changes, commit with a clear message, push to origin
4. Update .changelog/YYYY-MM-DD.md (today's date) with everything that was done this cycle
5. Update the "Next Steps" section so the next cycle knows where to pick up

## Rules
- Never modify CLAUDE.md
- Never expose secrets or credentials
- If tests fail after agent work, fix them before committing
- Keep commits atomic — if agents did unrelated work, make separate commits
- If there's nothing productive left to do, output NERO_IDLE and stop

## Output
End with exactly one of:
  NERO_CYCLE_COMPLETE: <one-line summary>
  NERO_IDLE: <reason>
  NERO_ERROR: <what went wrong>
PROMPT_EOF
)

  if [ "${NERO_DRY_RUN:-0}" = "1" ]; then
    echo "[NERO] DRY RUN — prompt:"
    echo "$PROMPT"
    exit 0
  fi

  # Each cycle gets generous time and turns for swarm orchestration
  TIMEOUT_SEC=$(( HEARTBEAT_MIN * 60 + 300 ))

  timeout "$TIMEOUT_SEC" claude -p "$PROMPT" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Task,TodoWrite" \
    --max-turns 80 \
    > "$LOGFILE" 2>&1 || true

  # Parse the result
  RESULT=$(grep -E "NERO_(CYCLE_COMPLETE|IDLE|ERROR):" "$LOGFILE" 2>/dev/null | tail -1 || echo "")
  TIMESTAMP_END=$(date '+%H:%M:%S')

  if echo "$RESULT" | grep -q "NERO_IDLE"; then
    echo "[NERO] [$TIMESTAMP_END] $RESULT"
    echo "[NERO] Nothing to do. Stopping."
    break
  elif echo "$RESULT" | grep -q "NERO_ERROR"; then
    echo "[NERO] [$TIMESTAMP_END] $RESULT"
    echo "[NERO] Will retry next cycle..."
  elif [ -n "$RESULT" ]; then
    echo "[NERO] [$TIMESTAMP_END] $RESULT"
  else
    echo "[NERO] [$TIMESTAMP_END] Cycle $cycle done (no status line — check $LOGFILE)"
  fi

  echo "[NERO] Next cycle in ${HEARTBEAT_MIN}m..."
  echo ""
  sleep $((HEARTBEAT_MIN * 60))
done
