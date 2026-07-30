# ADR-0001: Customization spine = chassis + AP trees + hybrid jobs

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** maintainer + design review panel

## Context

Customization and the job system are the game's north star (`docs/00`). The first design draft stacked ~10 co-equal customization mechanics (chassis, AP trees, mastery, hybrids, weapon trees, ability rank-up, gear-as-ability, sockets, set bonuses, behavior scripting). The review panel warned this produces breadth masquerading as depth: overlapping progression currencies, an unbalanceable combo space, and diluted mastery per axis.

## Options considered

1. **Keep all systems co-equal** — maximal surface, but shallow and unbalanceable; violates the depth-over-breadth pillar.
2. **Pick a small spine; demote the rest** — name the 2–3 systems that ARE the identity; everything else is optional/deferred and must earn its place.
3. **Minimal (chassis only)** — safest to balance, but under-delivers the "intensive job system" pillar.

## Decision

Adopt three **core** axes as the spine: (1) the 5-slot ability chassis, (2) AP-driven job/skill trees with permanent mastery bonuses, (3) hybrid/fusion jobs. Everything else is `[OPTIONAL]` (gear-as-ability + sockets, weapon trees, set bonuses) or `[DEFERRED]` (behavior scripting), and is kept only if it feeds a real archetype in the build-fantasy catalog (`docs/03`).

## Consequences

- Clear, balanceable identity; each core axis can be made deep.
- A progression-currency reconciliation table (`docs/02` B0) and the anti-convergence law (`docs/02` B5) become required guardrails.
- We accept giving up some breadth up front; optional axes can be promoted later only via a new ADR + archetype justification.

## References

- `docs/00` (pillars, spine), `docs/02` (Part B), `docs/03` (acceptance test).
