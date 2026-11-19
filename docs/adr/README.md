# Architecture Decision Records

Durable, cross-cutting decisions, promoted from approved RFCs when a decision affects more than one
issue. **The factory's design station reads every accepted ADR before proposing a new design**, and
every RFC cites the ADRs it complies with.

Format: `NNNN-short-title.md`, numbered in sequence. Status moves from `proposed` to `accepted`, and
later to `superseded` if replaced. A superseded ADR stays in the index with a pointer to its
replacement. Decisions are never silently deleted.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-structured-observability-with-one-error-owner.md) | Safe structured observability with exactly-one error ownership *(worked example)* | accepted |
