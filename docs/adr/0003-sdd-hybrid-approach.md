# ADR-0003: Spec-driven development — hybrid (GDD now, Spec Kit at build)

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** maintainer

## Context

We want the design docs to drive implementation rigorously (spec-driven development), and evaluated tooling (GitHub Spec Kit, Kiro, Tessl, BMAD, OpenSpec). But classic SDD specs describe features you're about to *build*, and this repo is currently docs-only with no code and no locked stack. Half the docs are buildable-system specs; the other half (vision, build-fantasy catalog, differentiators) are game-design documents SDD doesn't replace.

## Options considered

1. **Go SDD-native now** — restructure into Spec Kit's constitution + `specs/` immediately; premature, would spec systems that might still be cut.
2. **Ignore SDD** — write plain design docs; loses the testable-spec rigor we want.
3. **Hybrid** — write SDD-ready design docs now (constitution seed + per-doc Acceptance Criteria), adopt Spec Kit at P0/P1 when there's code to build.

## Decision

Hybrid (option 3). `docs/00` seeds the constitution; buildable-system docs (`01`, `02`, `05`, `06`) each end with an "Acceptance Criteria (SDD-ready)" section. At P0/P1 we run `specify init` and port docs → constitution + feature specs. Spec Kit installs into Claude Code natively.

## Consequences

- Docs stay the source of truth and are already spec-shaped, so the P0 port is cheap.
- No premature tooling lock-in while systems may still change.
- Requires keeping Acceptance-Criteria sections current as docs evolve.

## References

- `docs/08` §5 (Spec Kit adoption seam), `docs/09`, and the Acceptance-Criteria sections in `docs/01/02/05/06`.
