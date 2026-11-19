---
name: factory
description: "Two modes: (1) `/factory init` scaffolds the factory structure in a repo (run once). (2) `/factory <ISSUE>` runs an issue through the pipeline: grill → RFC design → approve → TDD → approve → code → PR with test evidence → adversarial review → approve → deploy → verify prod. Resumable and stage-aware. Also triggers on: 'work on <ISSUE>', 'ship <issue>', 'start the next issue', 'set up the factory for this project'."
---

# Factory pipeline

## Which mode?

- **`/factory init`**, or any repo without a `.factory.json`: use **[Init mode](#init-mode)** to
  scaffold the structure. Run it once per repo.
- **`/factory <ISSUE>`**: use **[Pipeline mode](#pipeline-mode)** to drive one issue through the stations.

## Tracker

`.factory.json`'s `tracker` field is either `"linear"` or `"github"`. The steps below say
"label the issue", "comment on the issue" and "attach to the issue". Here's how each maps:

| Action | `github` | `linear` |
|---|---|---|
| Read issue | `gh issue view <n> --json title,body,labels,state` | Linear MCP `get_issue` |
| Set stage label | `gh issue edit <n> --remove-label <old> --add-label <new>` | Linear MCP `save_issue` (labels) |
| Comment | `gh issue comment <n> --body …` | Linear MCP `save_comment` |
| Attach a link | comment containing the link | Linear MCP `create_attachment` |
| Close | closes on merge via `Closes #<n>` in the PR body | move the issue to Done |

---

## Init mode

Scaffold the factory in any project, in any language or stack.

| Path | Purpose |
|---|---|
| `.factory.json` | Project wiring consumed by this skill |
| `docs/factory.md` | The pipeline contract |
| `docs/rfcs/TEMPLATE.md` | RFC template |
| `docs/adr/README.md` | ADR index |
| `docs/adr/0001-<slug>.md` | Foundational ADR: the stack, key choices and the delivery process |
| `AGENTS.md` (create or append) | A pointer to the factory, plus local dev notes |

### Steps

1. **Gather config** from context, and ask for whatever isn't obvious: tracker (and the Linear
   team, if Linear), issue prefix, branch prefix, check/test/build/deploy commands, prod URL (may
   be empty), and whether CI/CD is already wired.
2. **Write `.factory.json`** following the schema in this plugin's `templates/factory.json`.
3. **Write the docs.** Adapt this plugin's `docs/factory.md`, `docs/rfcs/TEMPLATE.md` and
   `docs/adr/README.md`. Keep the structure and drop anything about a stack the project doesn't use.
4. **Write `docs/adr/0001-<slug>.md`**: the foundational ADR. Keep it brief but honest. If the
   project has a request/response boundary, propose an observability ADR modeled on the plugin's
   worked example.
5. **Update `AGENTS.md`** with the factory pointer and local dev notes.
6. **Create the eight `stage:*` labels** in the tracker.
7. **Branch (`chore/factory-init`), commit, push and open a PR**, then confirm CI passes. Don't
   merge it: merging is the user's first gate.
8. **Report back.** The next step is `/factory <first-issue>`. List any CI secrets or workflows
   the pipeline expects that don't exist yet.

---

## Pipeline mode

Drive one issue through fixed stations with human approval gates. **Each invocation does the next
chunk of work and stops at the next gate.** Never run through an approval gate.

### Model policy

- **Design runs on the strongest model.** If the session isn't on it, spawn the design agents with
  that model and suggest switching with `/model`.
- **Design picks the execution model** for the Code station and records it in the RFC: the fast
  tier for mechanical work, the standard tier by default, and the strongest tier for complex,
  subtle or security-sensitive work.

### 0. Load context and locate the station

1. Read `.factory.json`. If it's missing, offer **init mode** instead.
2. Read **`HANDOFF.md`** if it exists; it's the fastest route to current state. If its issue and
   station match the request, start from it, but check that the artifacts it names exist.
3. Read `docs/factory.md` and **every accepted ADR in `docs/adr/`** before designing anything.
4. Fetch the issue. Work out the station from its `stage:*` label **and** the ground truth: does
   the RFC file exist? A PR? Is CI green? Has it merged? **Never trust the label alone.** A merged
   PR under a `stage:review` label means the label is stale. Resume at the earliest incomplete
   station and tell the user which one before acting.

### 0.5. Grill (new issues only; no gate, moves straight on to Design)

Runs only for a brand-new issue: no RFC file and no `stage:*` label. Needs `/grill-with-docs` from
[mattpocock/skills](https://github.com/mattpocock/skills). If it isn't installed, say so and
skip to Design.

- Run `/grill-with-docs`: one question at a time, waiting for each answer, updating `CONTEXT.md`
  and writing ADRs as decisions settle.
- When the user says they're satisfied:
  1. Commit the new or updated `CONTEXT.md` and ADR files to the issue branch.
  2. **Rewrite the issue description**: a one- or two-sentence **story**, then numbered
     **acceptance criteria** specific enough that a reviewer can check each one without asking.
  3. **Comment on the issue** with a summary:
     ```
     ## Grill station output — <ISSUE>
     **Decisions made** — …
     **ADRs created/updated** — … (or "none")
     **Glossary terms added** — … (or "none")
     **Open questions carried into RFC** — … (or "none")
     ```
  4. Label the issue `stage:design` and go straight to Design.

### 1. Design (gate: human approves the RFC)

- Re-read every ADR and any related RFCs. The design must comply with them. If it can't, the ADR
  is updated explicitly; it never deviates silently.
- For every changed failure boundary, the RFC classifies the outcome as expected/quiet,
  propagated, recovered/translated, retried or background. It names the single error owner, the
  safe diagnostic fields and the correlation behavior, following the project's observability ADR.
  Observability is never deferred to implementation.
- **Spawn 2 parallel Plan agents** on the strongest model to draft competing approaches.
  Synthesize them into **one** RFC at `<rfcDir>/<ISSUE>-<slug>.md`, recording the losing approach
  under *Alternatives considered*. Skip the parallel agents only when you already hold the full
  context first-hand, and say that you're skipping them.
- The RFC includes a **Recommended execution model** with a one-line rationale.
- Commit and push the RFC to the issue branch, attach it to the issue, label `stage:design`, and
  run `/handoff`. **STOP** for approval.
- On approval: set the RFC status to `approved`, promote cross-cutting decisions to ADRs, label
  `stage:design-approved`, and run `/handoff`.

### 2. TDD (gate: human approves the test plan)

- Run `/tdd` on the approved RFC. Parallel test-design agents converge on a categorized list
  (unit / integration / e2e), with Given-When-Then for each case and failing-test skeletons.
- Include failure-observability cases for every changed boundary. The production call path emits
  exactly one terminal event (or an intentional retry warning), keeps safe correlation, and
  leaks no secrets, PII, raw bodies, URLs, exception messages or stacks. The tests go through the
  **production seam**, never a test-only imitation of it.
- Label `stage:tests` and run `/handoff`. **STOP** for approval.
- On approval: label `stage:tests-approved` and run `/handoff`.

### 3. Code

- Use the RFC's **Recommended execution model**. If it differs from the session's model, spawn the
  implementation agent on that model or ask the user to switch. If the model keeps taking wrong
  turns, stop and recommend escalating rather than shipping sloppy work.
- Work in a sandbox on the issue branch (`EnterWorktree`, or an Agent with `isolation: worktree`).
  Label `stage:coding`. Implement until the tests pass and `<checkCmd>` is clean.
- **Verify against real infrastructure** for anything the suite only mocks: hosted AI, external
  APIs, deploy configuration. A green mock isn't evidence.
- Before calling the code complete, audit every new or modified `catch`, rejection callback, retry
  loop, translated response and background task against the observability ADR. Read the
  observability tests' assertions and look for vacuous mocks.
- Run `/handoff` once the tests are green.

### 4. PR

- Push and open the PR with `gh pr create`. The body links the RFC, includes the test summary and
  links the CI run. **Attach the PR to the issue**: a PR the tracker can't see looks abandoned.
- Monitor CI. Label `stage:review` and run `/handoff`.

### 5. Review (gate: human approves the PR)

- Spawn the `adversarial-reviewer` agent with the PR number and the RFC path. It posts one PR
  comment with its findings.
- Silent failures, duplicate terminal events, unsafe log fields, uncaptured background errors and
  tests that bypass the production seam all block release.
- Summarize the findings and give the preview URL. Run `/handoff`. **STOP** for PR approval, and
  loop through fixes if there are findings.
- **On approval, capture journey screenshots before deploying:**
  1. Prerequisites: a preview or staging URL, and a reachable browser tool.
  2. If either is missing, **STOP** and tell the user what's missing. They can reply
     **"skip screenshots"**, which you record on the issue, or connect a browser and reply
     **"retry screenshots"**.
  3. Otherwise walk the user flow the issue touched and take 3–6 screenshots (entry, key
     interaction, result). Post them on the issue as **"Journey screenshots — ready to merge"**.

### 6. Deploy

- Merge with `gh pr merge` and watch the CI deploy run. Label `stage:deploy` and run `/handoff`.

### 7. Verify

- Confirm the smoke test passed and verify against `prodUrl`. Label `stage:done` and close the issue.
- Run `/handoff` with "No active issue. Last completed: `<ISSUE>` — <title>."

### Rules

- Honor every ✋ gate. Never advance a stage label without approval.
- Keep the stage labels, the RFC `Status` and `HANDOFF.md` in step with reality.
- Every RFC cites the ADRs it complies with. Cross-cutting decisions become new ADRs.
- Reuse existing patterns before inventing new ones.
- **Every change goes through a PR**, including handoff snapshots. Never push directly to the
  default branch, even when branch protection would let you.
