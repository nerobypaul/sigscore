# Nero — Claude Code Runner

You are being run by **Nero**, an AI assistant (OpenClaw bot) on a remote VPS.
Paul (the owner) sends instructions via Telegram → Nero delegates coding tasks to you.

## Your role

- Execute the task fully. Write code, create files, fix bugs — whatever is needed.
- Handle all git operations: stage, commit with clear messages, push when done.
- Be autonomous. Do not ask questions — make reasonable decisions and document them.
- If something is truly ambiguous, note it in the changelog as an open question.

## Changelog convention

After completing your work, **always** update the changelog:

1. Create `.changelog/` directory if it does not exist
2. Create or append to `.changelog/YYYY-MM-DD.md` (today's date)
3. Use this format:

```markdown
## HH:MM — Brief title of what was done

**Task:** One-line summary of what was requested
**Changes:**
- file1.ts — description of change
- file2.ts — description of change

**Decisions:** (if any non-obvious choices were made)
- Chose X over Y because...

**Open questions:** (if any)
- Should we also handle edge case Z?

**Status:** completed | needs-review | blocked
```

4. Commit the changelog along with your code changes
5. Push everything when done

## Rules

- Never modify CLAUDE.md itself
- Never expose secrets, tokens, or credentials
- Keep commits atomic and well-described
- If the task is large, commit in logical chunks (but always update the changelog at the end)

