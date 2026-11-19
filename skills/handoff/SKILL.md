---
name: handoff
description: "Write or refresh HANDOFF.md with a complete snapshot of the current factory state so the next session can resume without re-reading history. Works at any point: mid-station, between stations, or after a review loop. Triggers on: '/handoff', 'save state', 'write handoff', 'update handoff'."
---

# /handoff — write the factory handoff snapshot

Capture the current working state into `HANDOFF.md` at the project root so any new session can
resume exactly where this one stopped — without re-reading git log, tracker labels, or ADRs.

## When to use

- Explicitly: user types `/handoff`
- End of any session that has factory work in progress
- Before handing off to a different model or collaborator
- The factory skill calls this automatically at every gate (see factory SKILL.md)

## Steps

1. **Read current context** (in parallel):
   - `.factory.json` — project config (issue key prefix, branch prefix, commands)
   - `HANDOFF.md` — prior snapshot if it exists (for the "completed steps" list)
   - `git status` + `git log --oneline -10` — current branch, recent commits
   - Any open PR: `gh pr list --head $(git branch --show-current) --json number,url,title`
   - Issue state from the tracker named in `.factory.json` (`gh issue view` or the Linear MCP).
     The issue ID is the `<issuePrefix>-N` portion of the branch name.

2. **Determine station** from the issue's stage label + artifacts on disk:
   - No RFC file → station 1-design (or not started)
   - RFC exists, no test skeletons → station 2-tdd
   - Test skeletons exist, module not created → station 3-code (in progress)
   - Tests passing, no PR → station 4-pr
   - PR open, review findings pending → station 5-review
   - PR merged → station 6-deploy or 7-done

3. **Write `HANDOFF.md`** using the template below. Be specific and concrete — a resuming session
   reads this cold, so every claim must be verifiable from file paths or commit SHAs.

4. **Commit + push** `HANDOFF.md` on the current issue branch (never directly to the default
   branch — every change goes through a PR):
   ```
   git add HANDOFF.md
   git commit -m "chore: update HANDOFF.md"
   git push
   ```
   If nothing has changed since the last HANDOFF.md write, skip the commit.

5. **Confirm** to the user: "Handoff saved — next session can resume with `/factory <ISSUE>`."

## HANDOFF.md template

```markdown
# Factory handoff — <ISSUE>: <title>

> Snapshot written <ISO timestamp>. Resume with `/factory <ISSUE>` or `/handoff` to refresh.

## Active issue

| Field | Value |
|---|---|
| Issue | <ISSUE-ID> |
| Title | <title> |
| Branch | <branch> |
| Tracker | <issue url> |
| PR | <pr url or "not yet opened"> |
| CI | <"green" / "failing" / "pending" / "no PR yet"> |

## Current station

**<N>-<station-name>** — <one-line status, e.g. "RFC approved, test skeletons committed, awaiting user approval">

## Completed steps (this issue)

- [x] <step> — <commit SHA or artifact path>
- [x] <step>
- [ ] <step> ← next

## What the resuming session must do next

<Concrete, specific action. E.g. "User has approved the test plan. Run Station 3 (Code): implement
src/orders/refund.ts against the skeletons in test/refund.test.ts, add the additive migration, then
run the testCmd until green.">

## Key decisions made this issue (non-obvious, not in ADRs)

- <decision + why>

## Blockers / open questions

<"None" or a bullet list>

## Files changed so far (this issue, relative to main)

<git diff --stat main..HEAD output or a summarised list>
```

## Rules

- Write **concrete next action** — not "continue coding" but "implement X in src/Y.ts, the test
  skeletons are in test/Z.test.ts".
- List completed steps with SHA or path so the resuming session can verify without `git log`.
- If the issue is Done, write "No active issue. Last completed: <ISSUE>." and clear the table.
- Don't use `[skip ci]` on a commit that might end up as a PR's only commit — required checks
  never run and the PR stays blocked.
