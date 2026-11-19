# 0001. Safe structured observability with exactly-one error ownership

- **Status:** accepted
- **Note:** This is a worked example taken from a production project. The factory's TDD and review
  stations enforce this ADR. Copy it, adapt it to your stack, or replace it with your own.

## Context

Failures in a request-handling service were logged inconsistently. Some were logged at every
layer they passed through, some were swallowed by `catch {}`, and some serialized whole exception
objects that carried request bodies, URLs and user-submitted text into the log sink. Agents writing
code made all three mistakes often, because nothing structural prevented them.

## Decision

Failures are emitted as **versioned, structured events through a closed logging API**:

- A **root boundary** (the framework's top-level error handler) owns unhandled request failures.
- A **call site** owns a failure only when it recovers from it, translates it into a different
  response, or runs it after the response has been sent (background work).
- Every request carries a **safe correlation ID**. A client-supplied ID is accepted only if it
  matches a strict format, and otherwise is replaced.
- A silent `catch` or rejection handler needs an **explicit expected-failure justification**,
  which a lint rule enforces.

Logs deliberately **exclude** arbitrary exception messages and stacks, raw URLs and bodies,
secrets, authentication material, email addresses and user-authored content. Provider diagnostics
are allow-listed, redacted and bounded.

## Consequences

- Each failure produces exactly one terminal event, so alert counts mean what they say.
- The privacy boundary is structural. It doesn't depend on every future caller remembering to
  sanitize free text.
- **Trade-off:** less forensic detail. Some debugging needs a local reproduction instead of reading
  a stack from the logs.
- External sinks, retention and alerting are separate operational decisions, not covered here.
- Observability tests must exercise the **production call-site seam**. A copied helper or test-only
  callback proves nothing. Allow-lists are tested against opaque, secret-shaped values.
