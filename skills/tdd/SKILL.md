---
name: tdd
description: Turn an approved RFC (or a described change) into a concrete test plan and failing-test skeletons before any implementation. Produces a categorized test list (unit / integration / e2e), Given-When-Then per case, and skeleton test files. Use when the user says "/tdd", "outline the tests", "write the test plan", or at the TDD station of the factory pipeline.
---

# TDD — test design first

Given an approved RFC (or a clearly described change), design the tests **before** the code, so the
implementation is written to satisfy them.

## Steps

1. **Read the source of truth.** The RFC at `docs/rfcs/<ISSUE>-*.md` (its Decision + Consequences),
   the ADRs it cites, and the relevant existing code. Note the project's test setup: framework,
   where tests live, and the `testCmd` in `.factory.json`.

2. **Spawn parallel test-design agents** (when invoked from the factory): e.g. one focused on
   happy-path + core behavior, one on edge cases / failure modes / persistence boundaries.
   Synthesize into a single plan — dedupe, keep the highest-value cases.

3. **Produce the test list**, categorized:
   - **Unit** — pure logic (validation, calculations, rules).
   - **Integration** — real persistence and bindings, using the closest-to-production test
     runtime the stack offers (e.g. for Cloudflare Workers: `@cloudflare/vitest-pool-workers`
     with real D1/R2/Durable Object bindings, `SELF` from `cloudflare:test`).
   - **e2e** — the full request flow through the app's entry point.
   For each case write **Given / When / Then**.

   For every changed failure boundary, add cases that prove the repository's error-handling
   contract: exactly one owner for terminal failures, warnings only for attempts that will retry,
   explicit ownership of background rejections, safe request correlation, and no secrets/PII/raw
   payloads/exception text in diagnostics. Exercise the production call-site seam; a copied helper
   or test-only callback is not evidence. Include hostile secret-shaped values when testing
   allow-lists or redaction.

4. **Write failing-test skeletons** in the project's test directory matching the plan (`describe`/`it` with
   `it.todo` or `expect(...).toThrow()` placeholders that fail until implemented). Do **not**
   implement production code.

5. **Stop at the gate.** Present the categorized list + skeletons and ask the user to approve the
   test plan before implementation begins.

## Principles

- Test behavior and contracts, not internals. Each test maps to an RFC requirement or acceptance criterion.
- Cover the failure modes the RFC's Consequences section calls out.
- Map each changed `catch`, rejection callback, retry, translated response, and background task to
  a behavioral test or an explicit expected/quiet rationale under the observability ADR.
- Keep tests deterministic; never call live external services in unit tests.
- The test plan is the implementation spec — if a requirement has no test, it's not in the plan.
