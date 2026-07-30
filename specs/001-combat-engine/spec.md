# Feature Specification: Combat Engine (Faithful FFT Baseline)

**Feature Branch**: `001-combat-engine`
**Created**: 2026-07-30
**Status**: Draft
**Source of truth**: [`docs/01-combat-system.md`](../../docs/01-combat-system.md) — this spec ports its **Acceptance Criteria (SDD-ready)** verbatim (docs/08 §5). The doc governs on any conflict.
**Constitution**: honors Principle III (tactical grid combat / FFT fidelity) and V (determinism).

## Overview

The `[BASELINE]` FFT/WotL combat rules, implementation-oriented: the CT/clock-tick
turn order, action economy, charged actions on a shared timeline, the stat model
(PA/MA/Speed/HP/MP + Brave/Faith), the weapon/magic damage formulas, evasion by
facing, Zodiac/Faith modifiers, status effects, battle flow, and the crystal
permadeath timer. Numeric constants follow **PSX (1997)** as documented by
AeroStar's BMG and FFHacktics; `[WotL]` deltas are tagged. **All constants are
illustrative until verified against those sources and pinned by a golden
test-vector** (`docs/01` §12) — verification is gated by the `fft-fidelity` agent.

## User Scenarios & Testing

### Actors
- **Engine** — advances the CT clock, resolves actions, applies the pipeline.
- **Player / AI unit** — takes an active turn at CT ≥ 100 (Move / Act / Wait).

### Primary journey (P1): a unit takes a turn
**Given** a battle with units of varied Speed, **When** the clock ticks until one
unit reaches CT ≥ 100, **Then** that unit (resolved by the pinned tie-break) gets
an active turn, may Move and/or Act and choose a facing, and the engine subtracts
the correct CT cost and carries the remainder.

### Edge cases
- Two+ actors reach CT ≥ 100 on the same tick → pinned tie-break decides order.
- A charged spell's target tile is vacated before it matures → it whiffs.
- The caster is KO'd / Stopped / Don't-Act before a charge matures → it cancels.
- A rear attack → only Accessory evasion applies.
- Phoenix Down / Raise on an Undead unit → it dies.

## Requirements (ported verbatim from `docs/01`)

Each requirement maps to a golden test-vector (`docs/01` §12) or an observable
behavior; the damage/floor requirements are enforced by the pipeline in
[`003-simulation`](../003-simulation/spec.md) (AC-S5).

- **AC-01 (turn order):** The scheduler SHALL advance every unit's CT by its Speed each tick and grant a turn at CT ≥ 100, resolving simultaneous ≥100 via the pinned tie-break order (`docs/05`). *Test:* a fixed set of Speeds produces a deterministic, reproducible turn sequence.
- **AC-02 (CT reduction):** On turn end, the system SHALL subtract 100 / 80 / 60 for move+act / one / neither, carrying the remainder. *Test:* act-at-108 → next CT 8.
- **AC-03 (Haste/Slow):** Haste SHALL scale CT accrual ×1.5 and Slow ×0.5 (floored); Stop SHALL freeze accrual. *Test:* hasted vs. base unit turn ratio ≈ 3:2.
- **AC-04 (charge resolution):** A charged ability SHALL resolve on the shared timeline at charge-CT ≥ 100 against its **target tile**, SHALL miss if the tile is vacated, and SHALL cancel if the caster is KO'd/Stopped/Don't-Act before resolution.
- **AC-05 (damage fidelity):** Each weapon-class and the magic formula SHALL match the golden test-vectors (§12) exactly, including integer-floor at every step.
- **AC-06 (evasion by facing):** Evasion SHALL be computed as independent multiplicative rolls, with Class ignored from the side and Class+Shield+Weapon ignored from the rear. *Test:* rear-attack hit-rate == accessory-only computation.
- **AC-07 (Zodiac/Faith on hit and damage):** Zodiac (×0.5–×1.5 across 5 tiers) and Faith SHALL modify both the %-hit/status-infliction chance and the magnitude.
- **AC-08 (special units):** Phoenix Down/Raise on Undead SHALL kill; a side entirely KO'd or Petrified SHALL be defeated.
- **AC-09 (permadeath):** A KO'd unit SHALL decrement its crystal counter from 3 on each of its would-be turns and SHALL become a Crystal/Chest at 0.

## Key Entities

- **Unit** — raw hidden stats (PA/MA/Speed/HP/MP/Brave/Faith), current job, CT, facing, position, status set, crystal counter.
- **ChargedAction** — a first-class timeline actor: source unit, target tile, ability speed, interrupt hooks (see [`004`? no] `docs/05` §1).
- **Weapon class** — determines the damage formula and Two-Hands/Two-Swords eligibility (`docs/01` §5a).
- **Status effect** — kind, CT-based duration, stat/flag overrides (`docs/01` §8, schema in `docs/05` §6).

## Success Criteria

- Constitution success criteria #4 (no free win-buttons — telegraphed counterplay)
  and the fidelity contract (`docs/01` §12) hold.
- **SC-C1:** every formula and turn-order rule above is covered by a golden vector
  or scripted scenario, verified by `fft-fidelity` before any constant is
  hard-coded (CLAUDE.md fidelity rule).

## Assumptions & Dependencies

- Depends on [`003-simulation`](../003-simulation/spec.md) for the scheduler,
  resolution pipeline, RNG, and floor-order (the *how*).
- PSX (1997) is the numeric baseline; the 2025 remaster is not.
- Constants remain `[NEEDS VERIFICATION]` until pinned against BMG/FFHacktics.
