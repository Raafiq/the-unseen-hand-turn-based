# Feature Specification: Simulation & State Model (Engine)

**Feature Branch**: `003-simulation`
**Created**: 2026-07-30
**Status**: Draft
**Source of truth**: [`docs/05-simulation-and-state-model.md`](../../docs/05-simulation-and-state-model.md) — this spec ports its **Acceptance Criteria (SDD-ready)** verbatim (docs/08 §5). The doc governs on any conflict.
**Constitution**: the engineering backbone of Principle V (determinism). This is the P0 slice built first.

## Overview

The authoritative engine model: *how* the rules of [`001-combat-engine`](../001-combat-engine/spec.md)
are computed with no ambiguity. Covers the tick scheduler (units **and** charged
actions on one timeline) with the **pinned tie-break**, the ordered action
resolution pipeline (with integer-floor points), the single seeded PRNG in a
declared roll order, the rewind substrate (seeded command-replay + snapshot
optimization), the serializable `BattleState`, the ordered stat-derivation
pipeline, save format + schema versioning/migration, and the data schemas.
Implementability gate: an engineer can write the scheduler and damage pipeline
from `docs/05` alone, without inventing tie-break or interrupt rules.

## User Scenarios & Testing

### Primary journey (P1): a reproducible battle
**Given** a `battleSeed` and an ordered command log, **When** the engine runs,
**Then** every tick's `BattleState` is byte-identical to any replay of the same
`(seed, commands)` — the basis for rewind, saves, and build-sharing.

### Edge cases
- Simultaneous CT ≥ 100 actors → resolved by `(ct desc, charge-before-unit, unitId asc)`.
- Any unseeded random call reaches sim code → CI/lint fails (determinism guard).
- A save with an unsupported `schemaVersion` → fails loudly, never partial-loads.
- Rewind K turns then replay the same commands → identical to never rewinding.

## Requirements (ported verbatim from `docs/05`)

> P0 status: AC-S1/S2/S3/S5/S6/S7 landed (seeded PRNG, serializable
> `BattleState`, pinned scheduler, damage pipeline, and the command-log
> replay-equality harness with a frozen-golden oracle). **AC-S4 is PARTIAL** —
> charge interrupt covers KO + Stop; Sleep/Don't-Act/Petrify/Silence and
> interrupt-latching are tracked deferrals (**ADR-0010**).

- **AC-S1 (determinism):** Given identical `(seed, command log)`, the engine SHALL reproduce byte-identical `BattleState` at every tick. *Test:* replay equality harness.
- **AC-S2 (single RNG stream):** The sim SHALL consume randomness only from the seeded PRNG in the declared order; a lint/test SHALL fail on any unseeded random call in sim code.
- **AC-S3 (tie-break):** Simultaneous ct≥100 actors SHALL resolve by (ct desc, charge-before-unit, unitId asc). *Test:* crafted tie scenario yields the pinned order.
- **AC-S4 (charge interrupt):** A charged action whose caster is KO/Stop/Sleep/Don't-Act at its resolve tick SHALL produce no effect; one whose target tile is vacated SHALL whiff.
- **AC-S5 (formula fidelity):** The damage pipeline SHALL match every golden test-vector (`docs/01` §12) exactly, including floor order.
- **AC-S6 (serialization round-trip):** `deserialize(serialize(state)) == state` for BattleState and campaign save; a save with an unsupported `schemaVersion` SHALL fail with a clear error, never load partially.
- **AC-S7 (rewind):** Rewinding K turns then replaying the same commands SHALL yield the same result as never having rewound.

## Key Entities

- **BattleState** — the single serializable source of truth:
  `{ schemaVersion, seed, tick, rngCounter, grid, units[], chargeQueue[], turnLog[] }`
  (plain data only). Same serialization backs rewind snapshots and saves.
- **Actor** — `Unit | ChargedAction`, both with `ct`, `ctRate()`, and a tie-break key.
- **SeededRng** — one stream per battle; state is `(seed, drawCount)` so it
  reconstructs at any cursor (implemented: `src/sim/rng.ts`).
- **Command log** — the ordered player/AI commands; `(seed, commands)` is the
  replay/share format.
- **Migration** — `version N → N+1` transform; unsupported versions fail loudly.

## Success Criteria

- **SC-S1:** the replay-equality harness passes for representative battles (AC-S1/S7).
- **SC-S2:** the determinism guard (static: `check:rng` + ESLint; dynamic: replay
  harness) is wired into CI and green.

## Assumptions & Dependencies

- Locked decision: determinism is a P0 invariant (ADR-0004); tech stack Web/TS
  with a pure headless `src/sim/` core (ADR-0007).
- Feeds every other feature: [`001`](../001-combat-engine/spec.md) (formulas/floor
  order), [`002`](../002-job-system/spec.md) (data schemas), [`004`](../004-encounters-ai/spec.md) (AI draws from the seeded stream).
