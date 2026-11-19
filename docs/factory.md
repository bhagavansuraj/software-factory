# The Software Factory

Every issue, and every agent work session, moves through the same stations with explicit human
approval gates. This document is the **contract**. The [`/factory` skill](../skills/factory/SKILL.md)
is what executes it.

```
Grill (new issues only) → ✋ satisfied → RFC design → ✋ approve → TDD test plan → ✋ approve
   → Code (sandbox) → PR + evidence of tests passing → adversarial review (findings on PR)
   → ✋ approve PR → deploy via CI → verify in prod
```

## Why

Consistency and traceability. Design decisions are written down **before** code and reviewed.
When a decision cuts across issues, it's promoted to an ADR, and **every ADR must be consulted
before any new design**. That keeps the system principled as it grows and makes every change
auditable from issue to production.

## Stations

| # | Station | Output | Gate |
|---|---------|--------|------|
| 0.5 | **Grill** *(new issues only)* | A one-question-at-a-time interview (`/grill-with-docs`) that writes `CONTEXT.md` glossary entries and ADRs as decisions settle. When the human is satisfied, it rewrites the issue's story and acceptance criteria, posts a summary comment, and moves on to Design. | **Human satisfied**, then auto-proceeds |
| 1 | **Design** | `docs/rfcs/<ISSUE>-<slug>.md` (status `draft`), attached to the issue. Two **parallel design agents** draft competing approaches, which are synthesized into one RFC. Reads `docs/adr/` first. | **Human approves RFC**: status becomes `approved`, and cross-cutting decisions are promoted to ADRs |
| 2 | **TDD** | A test list and failing-test skeletons (via `/tdd`, with **parallel test-design agents**). | **Human approves test plan** |
| 3 | **Code** | The implementation, built in a **git worktree sandbox** on the issue branch. It continues until the tests and `checkCmd` pass, **plus a local check against real infrastructure** for anything the suite only mocks. | — |
| 4 | **PR** | A PR whose body links the RFC, pastes the test summary and links the green CI run. **The PR is attached to the issue** too, because a PR the tracker can't see looks abandoned. | — |
| 5 | **Review** | The `adversarial-reviewer` agent posts findings as one PR comment. Journey screenshots are attached to the issue. | **Human approves PR** |
| 6 | **Deploy** | Merge to the default branch. CI migrates and deploys. | — |
| 7 | **Verify** | A smoke test against `prodUrl`. The issue moves to Done. | — |

Approval gates pause the skill. You approve in chat and it resumes at the next station.

**Don't trust the label; verify it.** One issue in the original project stayed labeled
`stage:review` for 11 days after it had merged, deployed and passed review, because the session
that ran Verify never saved its state. Before resuming at a labeled station, check the ground truth:
does the PR exist, and is it still open? If it has merged, the label is stale. Verify, then flip
the issue to Done instead of redoing finished work.

## Error handling and observability are implementation invariants

Every issue that adds or changes a failure boundary applies the project's observability ADR (see
the [worked example](adr/0001-structured-observability-with-one-error-owner.md)). The factory
classifies each `catch`, promise rejection callback, retry loop, translated error response and
background task **before** code is written:

- **Propagated:** don't log locally. The root request boundary owns the terminal event.
- **Recovered or translated:** the call site owns exactly one terminal error event.
- **Retried:** emit a warning only for an attempt that will retry. Exhaustion has one error owner.
- **Background:** capture safe request context before scheduling, and own the terminal rejection.
- **Expected untrusted input:** stays quiet only with an explicit justification that lint enforces.

Diagnostics use allow-listed, bounded fields and safe correlation IDs. They never serialize
arbitrary errors, messages, stacks, URLs, bodies, credentials, tokens, email addresses or user
content. Database, schema, binding and provider failures must never be disguised as empty
successes.

The TDD station proves these properties through **production call-site seams**, including hostile
secret-shaped inputs. The Code station audits every changed boundary. The adversarial reviewer
blocks a release for silent failure, duplicate ownership, privacy leakage, an uncaptured
background rejection or a vacuous observability test.

## Model policy

The **Design** station runs on the strongest model available, because that's where the
leverage is. The RFC records a **Recommended execution model** scaled to the work:

- **Fast tier** (e.g. Haiku): trivial or mechanical changes such as config, renames, boilerplate and docs.
- **Standard tier** (e.g. Sonnet): ordinary feature work. This is the default when unsure.
- **Strongest tier** (e.g. Opus): high complexity, subtle correctness, security-sensitive or novel work.

The **Code** station runs on that model. Token cost stays proportional to difficulty, and hard work
still gets the strongest model.

## Local verification against real infrastructure

A green mocked test doesn't mean the code is verified. If a change touches a binding or service the
suite can only mock (hosted AI inference, external APIs, anything without a faithful local
simulator), smoke-test it against the real thing **before pushing**. Not after CI passes, and not
after a user reports a bug. [Field notes](field-notes.md) has the incidents behind this rule.

The same applies to deploy configuration. A dry run validates config, but it can't show what
happens only server-side during a real deploy. Changes to deploy jobs, routes or environments need
either a real deploy against a disposable target, or an explicit trace through the deploy CLI's
source for the parts a dry run doesn't exercise.

## Schema-rewriting migrations need a backup checkpoint

Any migration that drops or rebuilds a table needs a production export **first**. Restore it once
to prove it works; a command that exited 0 isn't proof. Migrations must stay additive and
backward-compatible, because the deployed app keeps serving the migrated schema while a PR sits
unmerged.

## State tracking

Pipeline state lives on the issue as a `stage:*` label (names set in `.factory.json`), together
with the ground-truth artifacts: does the RFC file exist, is there a PR, is CI green?
`/factory <ISSUE>` reads these to resume at the right station. `HANDOFF.md`, when present, is the
fastest way for a fresh session to learn the current state.

## Every change goes through a PR

That includes the changes that look too small to bother with: `HANDOFF.md` snapshots, docs-only
edits and chore commits. If your account can bypass branch protection, a direct push succeeds with
a "bypassed rule violations" notice. Treat that notice as an error you caused, not as confirmation.

Don't put `[skip ci]` on a PR's **only** commit. If you do, required checks never run and the PR
stays blocked forever.

## The decision system (consult before deciding)

- **RFCs** (`docs/rfcs/`): one per issue, the design for that specific change.
  Template: [`docs/rfcs/TEMPLATE.md`](rfcs/TEMPLATE.md).
- **ADRs** (`docs/adr/`): durable, cross-cutting decisions promoted from approved RFCs. The design
  station **reads every ADR before proposing a design**, and every RFC cites the ADRs it complies
  with. A design that contradicts an ADR updates the ADR explicitly; it never deviates silently.

## Infrastructure that lives outside config

If you create infrastructure that the app never binds (a backup bucket, an out-of-band queue), list
it in your project's copy of this document. Apart from the cloud dashboard, it's the only place an
auditor would think to look.
