# Field notes

These incidents from running the factory in production each changed a rule. The stack was
Cloudflare Workers (one Worker serving a React SPA and a Hono API), D1, R2, Workers AI and GitHub
Actions. The specifics are about Cloudflare; the rules mostly aren't.

---

## 1. All mocked tests passed; every real call returned 502

**What happened.** A résumé-parsing feature used Workers AI with a JSON-schema `response_format`.
The unit tests were green, CI was green and the feature had been checked locally. Every real call in
the PR preview failed. Workers AI's constrained JSON decoder rejects union types such as
`"type": ["string", "null"]`. No mock could have known that.

**Rule.** Workers AI has no local simulator, so a green mocked test proves nothing about it. Run
`wrangler dev` in *mixed mode* (no `--local`): `AI` proxies to the real service while D1 and R2
stay simulated. Smoke-test before pushing. This became the factory's general
"[verify against real infra](factory.md#local-verification-against-real-infrastructure)" rule.

## 2. A clean dry run would still have hijacked the production domain

**What happened.** A change to isolate staging passed every `wrangler deploy --dry-run` check. The
first *real* staging deploy would still have moved the production custom domain onto the staging
Worker. In non-interactive CI, wrangler's custom-domain publishing step reassigns routes
unconditionally, and that step only runs during a real deploy. **The adversarial reviewer caught
it** by tracing the installed `wrangler` source. No test caught it.

**Rule.** A dry run validates config, not server-side effects. Deploy-shaped changes need either a
real deploy against a disposable target or a trace through the CLI's source. It's also the best
argument for an adversarial review station that reads dependencies, not just the diff.

## 3. Two smoke tests "verified" code that wasn't running

**What happened.** The Cloudflare Vite plugin writes `.wrangler/deploy/config.json`, which points
`wrangler dev` at the **last build output** instead of the source. Two rounds of smoke testing
"verified" a prompt change that wasn't in the running Worker at all. The clue was output passing a
filter that the source code would have rejected.

**Rule.** Run `npm run build` immediately before `wrangler dev`. If the server does something the
source says is impossible, suspect a stale bundle before anything else.

## 4. Preview URLs have no logs at all

**What happened.** A preview-only failure was impossible to debug. `wrangler tail` connected
successfully and then showed nothing. Cloudflare doesn't support Workers Logs, `tail` or Logpush
for Preview URLs.

**Rule.** Reproduce in mixed-mode `wrangler dev` first. If you need a real stack trace, deploy a
temporary named Worker, which does support `tail`. Delete it as soon as you're done.

## 5. Previews share a database with something

**What happened.** A preview URL is a different Worker *version*, not a different database. Any PR
that added a migration returned 500 on every database request in its preview until the migration
was applied to the database that preview was bound to.

**Rule.** Bind previews to the staging database (never production) and apply migrations before each
preview upload. Because of that, migrations must be additive and backward-compatible: the deployed
staging app keeps serving the migrated schema while the PR stays open. A PR's first preview build
also *records* its migrations as applied, so never edit a migration after you've pushed it.

## 6. A PR invisible to the tracker sat for a week

**What happened.** The RFC was attached to the issue but the PR wasn't. To anyone reading the
issue, the work looked abandoned, and the PR went unreviewed for more than a week.

**Rule.** The PR station attaches the PR link to the issue, not just the RFC.

## 7. A label claimed `stage:review` 11 days after the issue shipped

**What happened.** The Verify station ran in a session that never saved its state, so the label was
never updated.

**Rule.** [Don't trust the label](factory.md#stations). Check it against the PR and the deploy
before resuming. The same incident is why `HANDOFF.md` is written at **every** gate and not just at
the end.

## 8. `[skip ci]` left a PR permanently blocked

**What happened.** A handoff-only PR whose only commit was tagged `[skip ci]` never got its
required status checks, so it could never merge, short of an admin override.

**Rule.** `[skip ci]` is only for commits that ride along with other commits. Never use it on a PR's
only commit.
