# Software Factory

An approval-gated delivery pipeline for building software with Claude Code. Every issue moves
through the same stations, and nothing advances past a ✋ gate without a human saying so:

```
Grill → ✋ → RFC design → ✋ → TDD test plan → ✋ → Code (sandboxed worktree)
     → PR + test evidence → Adversarial review → ✋ → Deploy → Verify in prod
```

I built this to run a production SaaS product (a Cloudflare Workers + React app) where I was the
only human engineer and Claude did most of the typing. Over several hundred PRs it became the
part I'd most want to take to the next project. This repo is that part, without the product.

## Why it exists

Agents write code fast, and they forget decisions just as fast. The factory is built around four
ideas:

- **Decide in writing before writing code.** Each issue gets an RFC. Decisions that cut across
  issues are promoted to ADRs, and the design station has to read **every** ADR before it proposes
  anything. Six months in, the agent still knows why the system looks the way it does.
- **Tests are the spec.** The TDD station turns the approved RFC into a categorised test plan with
  failing skeletons. A requirement with no test isn't in the plan.
- **Assume the PR is wrong.** A separate read-only `adversarial-reviewer` agent hunts for bugs,
  RFC deviations and vacuous tests, then posts its findings on the PR. It's told to assume tests can
  lie.
- **Resumable by construction.** Pipeline state is kept outside the session: a `stage:*` label on
  the issue, the artifacts on disk, and a `HANDOFF.md` snapshot. `/factory ISSUE-42` picks up at
  the correct station in any fresh session.

## What's in here

| Path | What it is |
|---|---|
| [`skills/factory/`](skills/factory/SKILL.md) | The orchestrator. `/factory init` scaffolds a repo; `/factory <ISSUE>` runs or resumes an issue. |
| [`skills/tdd/`](skills/tdd/SKILL.md) | Turns an approved RFC into a test plan and failing-test skeletons. |
| [`skills/handoff/`](skills/handoff/SKILL.md) | Writes the `HANDOFF.md` state snapshot at every gate. |
| [`agents/adversarial-reviewer.md`](agents/adversarial-reviewer.md) | The skeptical PR reviewer, also as a [Codex agent](codex/agents/adversarial-reviewer.toml). |
| [`docs/factory.md`](docs/factory.md) | The pipeline contract: the stations, the gates, model policy, state tracking. |
| [`docs/field-notes.md`](docs/field-notes.md) | Production incidents that shaped the rules, and the rule each one produced. |
| [`docs/adr/0001-…`](docs/adr/0001-structured-observability-with-one-error-owner.md) | A worked example ADR: the error-ownership and log-privacy contract the TDD and review stations enforce. |
| [`enforcement/`](enforcement/) | ADR 0001 as code. An ESLint rule that fails any `catch` or `.catch()` that doesn't rethrow, log through the closed logger, or give an `expected-failure:` reason, plus the closed logger itself. Both are tested against hostile, secret-shaped input. |
| [`docs/rfcs/TEMPLATE.md`](docs/rfcs/TEMPLATE.md) | The RFC template. |
| [`templates/factory.json`](templates/factory.json) | Per-project wiring: commands, tracker, stage labels. |

## Install

As a Claude Code plugin:

```bash
claude plugin marketplace add bhagavansuraj/software-factory
claude plugin install software-factory@software-factory
```

Or copy `skills/*` into `.claude/skills/` and `agents/*` into `.claude/agents/`, either in your
repo (so the factory travels with the code) or in `~/.claude/` (so every project can use it).

Then, in your project:

```
/factory init        # once per repo: .factory.json, docs/factory.md, RFC template, ADR index, labels
/factory ISSUE-42    # run or resume an issue
```

### Companion skills

The Grill station uses `/grill-with-docs`, `/grilling` and `/domain-modeling` from
[Matt Pocock's skills](https://github.com/mattpocock/skills). I didn't write them, so they aren't
included here. Install them separately:

```bash
claude plugin install mattpocock-skills@claude-plugins-official
```

If you don't have them installed, the factory skips the Grill station and starts at Design.

## Rules the agent can't skip

Agents follow a rule more reliably when CI enforces it than when a prompt asks for it. The
factory's TDD and review stations check error ownership and log privacy. [`enforcement/`](enforcement/)
makes the first line of that check mechanical:

```js
// eslint.config.js
import requireObservableErrorHandling from "./enforcement/require-observable-error-handling.mjs";
export default [{
  plugins: { local: { rules: { "require-observable-error-handling": requireObservableErrorHandling } } },
  rules: { "local/require-observable-error-handling": "error", "no-console": "error" },
}];
```

```ts
try { await sendEmail(); }
catch { return null; }                                   // ✗ lint error: silent failure

catch (error) {                                          // ✓ recovered: this site owns it
  logger.warn({ operation: "email.send_failed", errorName: safeErrorName(error) });
  return null;
}

catch { /* expected-failure: malformed cookie → anonymous */ return null; }  // ✓ quiet, with a reason
```

Writing the hostile-input tests for the logger turned up two real gaps in the logger I'd been
running in production. Its error-name check let a JWT through, and its diagnostic redactor
missed JWTs entirely. Tests that use realistic secrets catch leaks that tests using obvious
fake secrets don't.

Run the tests with `npm install && npm run check`.

## Adapting it

The skills don't depend on any one project. The project-specific parts live in `.factory.json`
and your own ADRs. Two places name a stack:

- The reviewer's **platform footguns** section and the TDD station's test categories use
  Cloudflare Workers as the worked example. Replace them with your platform's sharp edges.
- [`docs/field-notes.md`](docs/field-notes.md) is specific to Cloudflare. Keep the rules that
  generalise and replace the rest with your own incidents. That file is where most of the value builds up.

## License

[MIT](LICENSE)
