# ADR-0002: Respec = permanent progress, free experiments

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** maintainer + design review panel

## Context

The design must reconcile two goals that pull opposite ways: "reaching a build is investment, not grind" (`docs/00` success criteria) and "experimentation should be cheap" (deep customization is worthless if trying builds is punished, per FFT's sunk-cost JP problem). A frictionless "respec anything anytime" makes builds weightless; a costly respec punishes the experimentation the whole game is about.

## Options considered

1. **Costly respec** — builds carry weight, but discourages the experimentation that is the point; repeats FFT's sunk-cost pain.
2. **Fully frictionless** — maximal flexibility, but builds mean nothing and converge on one god-build.
3. **Permanent progress, free experiments** — learned abilities/masteries are never lost; loadout swaps are free; identity accretes through what you've *mastered* over time.

## Decision

Option 3. Everything learned is permanent and never lost; changing any loadout slot is free and reversible. A character's accumulated masteries are what make it "theirs", so identity still accretes without making swaps costly.

## Consequences

- Encourages theorycrafting and experimentation (supports the customization pillar and build-sharing).
- Build weight comes from *accumulated mastery* and opportunity cost (`docs/02` B5), not from respec friction.
- Requires the anti-convergence law to do the work of keeping builds distinct, since respec won't.

## References

- `docs/02` B7, `docs/07` (free respec cost), `docs/00`.
