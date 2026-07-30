# ADR-0004: Determinism (seeded RNG + serializable state) is a P0 invariant

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** maintainer + technical-architect review

## Context

The game wants rewind (à la Tactics Ogre's Chariot), robust saves, and shareable build/challenge codes. All three require that a battle is exactly reproducible. Rewind + RNG + a shared charge timeline is a classic footgun: if determinism is bolted on after the core loop is built, it becomes a rewrite.

## Options considered

1. **Add determinism later** — simplest early code, but retrofitting reproducibility across scheduler, RNG, AI, and save/load is effectively a rewrite (rejected).
2. **Snapshot-only rewind** — serialize full state per turn without guaranteeing pure/seeded computation; larger saves, and still fragile if any nondeterminism leaks.
3. **Seeded, pure, serializable from P0** — one seeded PRNG in a declared roll order, a pure/headless sim, and a single serializable `BattleState`; rewind via seeded command-replay with snapshots as an optimization.

## Decision

Option 3, treated as a **P0 architectural invariant**: no unseeded randomness or wall-clock in sim code, ever; a declared roll-consumption order; integer/floored math; a pinned scheduler tie-break; sim core pure and headless. Rewind UI can ship later, but its substrate ships at P0.

## Consequences

- Rewind, saves, and community sharing all fall out of the same mechanism.
- Constrains sim code (enforced by the `sim-determinism-guard` skill + `check-rng.sh` + a replay-equality test).
- Slightly more discipline up front; avoids a later rewrite.

## References

- `docs/05` §3, and `docs/04` §8 (build-sharing depends on this).
