# Working with Claude-Flow

A practical guide for using multi-agent orchestration in your projects.

---

## What is Claude-Flow?

Claude-Flow turns Claude Code into a multi-agent orchestration platform. Instead of one AI working sequentially, you get coordinated swarms of specialized agents working in parallel — a coder, tester, reviewer, and researcher all running at the same time.

You stay in the driver's seat: you decide what to build, spawn the agents, review their output, and commit when you're satisfied.

---

## Setup

### Prerequisites

- Node.js 20+
- Claude Code installed globally: `npm install -g @anthropic-ai/claude-code`

### Install Claude-Flow

```bash
# Option A: One-line install (recommended)
curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/claude-flow@main/scripts/install.sh | bash

# Option B: npm global install
npm install -g claude-flow@alpha

# Option C: Use without installing
npx claude-flow@alpha init
```

### Add MCP Server to Claude Code

This is the critical step — it gives Claude Code access to all 175+ claude-flow tools:

```bash
claude mcp add claude-flow -- npx -y claude-flow@latest mcp start
claude mcp list  # verify it's registered
```

### Initialize in Your Project

```bash
npx claude-flow@alpha init --wizard
```

This creates the `.claude-flow/` directory with config, memory storage, and session state.

---

## Configuration

### Key Files

| File | Purpose |
|------|---------|
| `.claude-flow/config.yaml` | Runtime config (topology, memory, neural) |
| `.claude/settings.json` | Claude Code hooks, permissions, env vars |
| `.claude-flow/CAPABILITIES.md` | Full reference of all agents and commands |

### Config (`.claude-flow/config.yaml`)

```yaml
swarm:
  topology: hierarchical-mesh   # Queen coordinates, workers mesh among themselves
  maxAgents: 15                 # Max concurrent agents
  autoScale: true

memory:
  backend: hybrid               # SQLite + in-memory LRU cache
  enableHNSW: true              # 150x faster vector search

neural:
  enabled: true                 # Self-learning patterns

hooks:
  enabled: true                 # Pre/post task hooks for learning
```

### Claude Code Settings (`.claude/settings.json`)

The settings file wires everything together:

- **Hooks**: Auto-route tasks, learn from edits, manage sessions
- **Permissions**: Allow claude-flow commands without prompts
- **Env vars**: Enable experimental agent teams
- **Attribution**: Auto-add co-author to commits

Key env vars:
```json
{
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
  "CLAUDE_FLOW_V3_ENABLED": "true",
  "CLAUDE_FLOW_HOOKS_ENABLED": "true"
}
```

---

## Using Agents

### Available Agent Types

| Category | Agents | Use For |
|----------|--------|---------|
| **Core Dev** | `coder`, `reviewer`, `tester`, `planner`, `researcher` | Daily development |
| **Architecture** | `system-architect`, `backend-dev`, `api-docs` | Design decisions |
| **Quality** | `code-analyzer`, `production-validator`, `tdd-london-swarm` | Code quality |
| **GitHub** | `pr-manager`, `code-review-swarm`, `issue-tracker` | Repo management |
| **Performance** | `perf-analyzer`, `performance-benchmarker` | Optimization |

### Spawning Agents in Claude Code

Use the `Task` tool to spawn agents. Independent tasks run in parallel:

```
# Single agent
Task(subagent_type="coder", prompt="Implement the contact export endpoint")

# Multiple agents in parallel (send in one message)
Task(subagent_type="coder",  prompt="Build the CSV export API")
Task(subagent_type="tester", prompt="Write tests for bulk operations")
Task(subagent_type="researcher", prompt="Research SAML/OIDC SSO libraries for Node")
```

### Running Agents in Background

Add `run_in_background=true` to keep the main session free:

```
Task(subagent_type="coder", prompt="...", run_in_background=true)
```

Check output later with the `Read` tool on the returned `output_file` path.

---

## Swarm Topologies

| Topology | When to Use |
|----------|-------------|
| `hierarchical` | Tight control, anti-drift — queen assigns all work |
| `mesh` | Distributed tasks where agents collaborate as peers |
| `hierarchical-mesh` | Best default — queen coordinates, workers mesh for sub-tasks |
| `ring` | Sequential pipelines (build → test → deploy) |
| `star` | Simple hub-and-spoke coordination |

### Task-to-Topology Mapping

| Task | Agents | Topology |
|------|--------|----------|
| Bug fix | researcher → coder → tester | mesh |
| New feature | architect → coder → tester → reviewer | hierarchical |
| Refactor | architect → coder → reviewer | mesh |
| Security audit | security-architect → auditor → reviewer | hierarchical |

---

## Hooks System

Hooks run automatically on Claude Code events:

| Hook | Trigger | What It Does |
|------|---------|--------------|
| `PreToolUse` (Bash) | Before any bash command | Risk assessment |
| `PostToolUse` (Write/Edit) | After file changes | Record edit outcomes for learning |
| `UserPromptSubmit` | Every new prompt | Routes task to best agent type |
| `SessionStart` | Session opens | Restores previous session state |
| `SessionEnd` | Session closes | Persists state for next session |
| `Stop` | Agent stops | Syncs memory to disk |
| `SubagentStart` | Agent spawns | Status tracking |

The routing hook is especially useful — it analyzes your prompt and recommends which agent type to use (the `+--- Primary Recommendation ---+` box you see on every prompt).

---

## Memory System

Claude-Flow maintains persistent memory across sessions:

- **Project memory**: `.claude/agent-memory/<agent>/` — shared across the team
- **Local memory**: `.claude/agent-memory-local/<agent>/` — machine-specific
- **User memory**: `~/.claude/agent-memory/<agent>/` — follows you across projects

### Key Commands

```bash
# Store a pattern
npx claude-flow@alpha memory store --key "auth-pattern" --value "JWT + refresh" --namespace patterns

# Search memory (uses HNSW vector search)
npx claude-flow@alpha memory search --query "authentication"

# List stored entries
npx claude-flow@alpha memory list --namespace patterns
```

High-confidence insights (>0.8) automatically transfer between agents.

---

## Best Practices

### 1. Parallelize Independent Work

Don't run agents sequentially. Spawn independent tasks in the same message:

```
# GOOD: All three run simultaneously
Task("coder",      "Build the API endpoint")
Task("tester",     "Write tests for existing endpoints")
Task("researcher", "Research competitor pricing models")

# BAD: Waiting for each one before starting the next
```

### 2. Keep Agents on Non-Overlapping Files

Each agent should own separate files. If two agents edit the same file, you get merge conflicts.

```
# GOOD: Clear file ownership
Task("coder", "Add export route in backend/src/routes/export.ts")
Task("coder", "Add export button in frontend/src/components/ExportButton.tsx")

# BAD: Both agents touching the same file
Task("coder", "Update backend/src/routes/contacts.ts to add export")
Task("coder", "Update backend/src/routes/contacts.ts to add bulk delete")
```

### 3. Use the Right Agent for the Job

- **researcher** — investigation, not code. Use when you need to understand something before building
- **planner** — breaking down large tasks. Use before spawning coders
- **coder** — implementation. The workhorse
- **tester** — writing and running tests. Spawn after code is written
- **reviewer** — code review and security. Spawn after implementation is done

### 4. Always Verify Agent Output

Agents can make mistakes. After they complete:

- Run the test suite (`npx jest`)
- Type-check (`npx tsc --noEmit`)
- Review the diff before committing

### 5. Use Background Agents for Long Tasks

Research, deep code analysis, and large refactors can take a while. Run them in the background so you can keep working:

```
Task("researcher", "...", run_in_background=true)
# Continue with other work
# Check results later via the output file
```

### 6. Chain Agents When Order Matters

Some workflows are sequential. Run one phase, review, then start the next:

```
# Phase 1: Research + Plan
Task("researcher", "Analyze the current auth flow and identify gaps")
Task("planner", "Design the SSO integration approach")

# Review their output, then...

# Phase 2: Implement
Task("coder", "Implement SAML provider based on the plan above")
Task("coder", "Add SSO settings UI page")

# Phase 3: Validate
Task("tester", "Write integration tests for the SSO flow")
Task("reviewer", "Security review the auth changes")
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| MCP server not responding | `claude mcp list` to verify, re-add if missing |
| Agent spawning fails | Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings |
| Memory search returns nothing | Run `npx claude-flow@alpha memory init --force` |
| Hooks not firing | Verify `.claude/helpers/hook-handler.cjs` exists |
| Agent file conflicts | Ensure agents work on non-overlapping files |

### Diagnostics

```bash
npx claude-flow@alpha doctor --fix   # Auto-diagnose and repair
npx claude-flow@alpha swarm status   # Check swarm health
npx claude-flow@alpha hooks metrics  # View hook performance
```

---

## Quick Reference Card

```bash
# Setup
npx claude-flow@alpha init --wizard
claude mcp add claude-flow -- npx -y claude-flow@latest mcp start

# Swarm
npx claude-flow@alpha swarm init --topology hierarchical-mesh --max-agents 8
npx claude-flow@alpha swarm status

# Agents
npx claude-flow@alpha agent spawn -t coder --name my-coder
npx claude-flow@alpha agent list

# Memory
npx claude-flow@alpha memory search --query "pattern"
npx claude-flow@alpha memory store --key "name" --value "data"

# Diagnostics
npx claude-flow@alpha doctor --fix
```
