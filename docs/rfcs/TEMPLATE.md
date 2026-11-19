# RFC: <ISSUE-ID> — <Title>

- **Issue:** <tracker URL>
- **Author:** <name>
- **Status:** draft  <!-- draft → approved → superseded -->
- **Date:** <YYYY-MM-DD>
- **Recommended execution model:** <fast | standard | strongest tier> — <one-line rationale (complexity vs cost)>

## Context

What problem does this issue solve? What's the current state and the constraints?
Link any prior history (Claude chats, artifacts) that informs this.

## Relevant ADRs / principles

List the ADRs (`docs/adr/`) this design must comply with, and how it does.
If this design contradicts an existing ADR, say so explicitly and justify — that triggers
an ADR update, not a silent deviation.

## Decision

The proposed approach. Be concrete: data shapes, API/tool signatures, file paths, control flow.
This is what the implementation will follow.

### Failure behavior and observability

For every changed failure boundary, classify it as expected/quiet, propagated, recovered/translated,
retried, or background. Name the single terminal error owner, the safe structured event (if any),
request-correlation behavior, and fields that are deliberately excluded. Apply the observability ADR; never leave
error handling or log privacy as an implementation detail.

## Alternatives considered

The other approaches the parallel design agents surfaced, and why they were not chosen.

## Consequences

Trade-offs, follow-ups, risks, and what this makes easier or harder later.
Note any decision here that is cross-cutting enough to be promoted to an ADR on approval.

## Test strategy (filled at the TDD station)

Outline of unit / integration / e2e coverage. Detailed list lives with the tests.
Include production-seam tests for failure ownership, retry/background behavior, safe correlation,
and absence of secrets, PII, raw payloads, exception messages, and stacks.
