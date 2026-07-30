---
name: sim-determinism-guard
description: >-
  Enforce the the-unseen-hand simulation's determinism invariants. Use this
  BEFORE or WHILE writing/reviewing any code in the sim/engine layer — turn
  scheduling, RNG, hit/damage/status resolution, AI decisions, loot, save/load,
  or the rewind feature. Trigger whenever you're about to add randomness, a
  timestamp, a data structure to battle state, or anything that could make a
  battle non-reproducible. Determinism is a P0 architectural invariant here;
  rewind, saves, and build-sharing all depend on it.
---

# Simulation Determinism Guard

Determinism is a **P0 architectural invariant** (`docs/05` §3), not a feature to add later. Rewind, saves, and shareable build/challenge codes all require that a battle is byte-for-byte reproducible from `(seed, ordered commands)`. Retrofitting this after the fact is a rewrite — so guard it from the first line of sim code.

## The invariants

1. **One seeded PRNG per battle, and everything random draws from it.** Hits, status rolls, crits, AI choices, and loot all consume from the single seeded stream. No exceptions.
2. **No unseeded randomness in sim code, ever:** no `Math.random()`, no `crypto.getRandomValues`, no `Date.now()`/`new Date()`/`performance.now()`, no platform RNG, no unordered iteration over hash maps/sets that affects outcomes.
3. **Declared roll-consumption order.** Each action consumes randomness in a fixed, documented order (e.g. hit → reaction → crit → status). The Nth roll must be identical given the same state. Keep the order next to the resolution pipeline.
4. **Integer math, floored per step** (`docs/01` §5, `docs/05` §2). Multipliers (Haste 1.5, Zodiac 1.25, …) are applied then floored, in the pipeline's documented order. No floats leaking into damage.
5. **Pinned tie-break** in the scheduler (`docs/05` §1a): ct desc → charged-before-unit → unitId asc. Never rely on insertion/iteration order.
6. **Sim core is pure & headless** — no rendering/UI/IO deps. State is a single serializable `BattleState`; the same serialization backs both saves and rewind snapshots.

## How to use this skill

- **Writing sim code:** thread the seeded PRNG explicitly (inject it; never reach for a global). When you add anything to battle state, ask "does this serialize deterministically?" When you add an action, document its roll order.
- **Reviewing sim code:** run the check below, then read for the subtler cases the grep can't catch (unordered map iteration, float creep, wall-clock, AI reading anything outside `BattleState`).

## Quick check

Run the bundled script over the sim source to catch the obvious violations:

```bash
bash .claude/skills/sim-determinism-guard/scripts/check-rng.sh sim/
```

> **The check greps raw text — comments and strings included.** When you document
> the ban in sim code, name the banned APIs by description ("the platform RNG",
> "wall-clock") rather than writing the literal `Math.random` / `Date.now`, or the
> docstring itself trips the guard (as a comment in `rng.ts` did).

A clean run is necessary but **not sufficient** — the script finds banned calls, not logic bugs. The real test is the replay-equality harness: `replay(seed, commands)` must equal the live run (`docs/05` AC-S1). If you're unsure whether something breaks determinism, it probably does — make it draw from the seed or move it out of the sim.
