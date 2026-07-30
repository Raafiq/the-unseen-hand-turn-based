# Feature Specification: Encounters & AI

**Feature Branch**: `004-encounters-ai`
**Created**: 2026-07-30
**Status**: Draft
**Source of truth**: [`docs/06-encounters-and-ai.md`](../../docs/06-encounters-and-ai.md) — this spec ports its **Acceptance Criteria (SDD-ready)** verbatim (docs/08 §5). The doc governs on any conflict.
**Constitution**: the demand side of Principle I and the enforcement of success criteria #1 and #4.

## Overview

Encounters are the **balancer** and the AI is the **test harness** that decides
whether a build is actually viable. A named **benchmark encounter suite** (the §2
archetypes: skirmish, siege, defend, escort, assassinate, elevation, anti-cheese,
attrition) is the fixed set the build-diversity success metric runs against.
Difficulty comes from **smarter enemies and better maps, not stat inflation**. The
AI must position (facing/height), focus-fire the lowest-effective-HP target, and
counter the opposing build — and every AI decision draws from the seeded stream so
battles stay reproducible.

## User Scenarios & Testing

### Actors
- **Enemy AI** — takes turns via the same engine as the player; draws only from
  `BattleState` and the seeded RNG.
- **Balance harness** — runs the benchmark suite headlessly and reports the
  diversity metric.

### Primary journey (P1): balance verification
**Given** the benchmark suite and the `docs/03` archetypes, **When** the harness
runs headlessly, **Then** it reports whether ≥ 8 archetypes clear within the
efficiency band and whether any single build dominates.

### Edge cases
- Reachable flank/rear → AI attacks from side/rear.
- Opposing high-evasion physical wall → AI prefers magic / evasion-ignoring tools.
- Charged nuke vs. a target that will move → AI does not waste it.
- Raising difficulty → AI behavior/threat budget changes before any stat multiplier.

## Requirements (ported verbatim from `docs/06`)

> Roadmap: the benchmark suite + diversity gate become CI from P2 (docs/08 AC-R3);
> AI counterplay behaviors are scripted-scenario tested as the AI lands.

- **AC-E1 (benchmark exists):** A named benchmark suite covering the §2 archetypes SHALL exist and be runnable headlessly for balance verification.
- **AC-E2 (diversity gate):** On the benchmark suite, ≥ 8 `docs/03` archetypes SHALL clear within the efficiency band and no single build SHALL clear all encounters at top efficiency.
- **AC-E3 (AI counterplay):** Enemy AI SHALL demonstrably (a) attack from side/rear when reachable, (b) focus the lowest-effective-HP valid target, and (c) select damage/status types that counter the opposing unit's defenses, in scripted test scenarios.
- **AC-E4 (determinism):** Given a fixed seed and player command log, AI decisions SHALL be reproducible (draws from the seeded stream only).
- **AC-E5 (difficulty without inflation):** Raising a difficulty tier SHALL first change AI behavior/threat budget; raw stat multipliers SHALL be a bounded, secondary lever.

## Key Entities (schemas: `docs/05` §6)

- **Battle / Map definition** — the narrative-repo data contract: `map`,
  `deployZones`, `spawns`, `victory`/`defeat`, `events`, `loot`, `seed`
  (docs/08 §4). Loads without engine changes.
- **Encounter archetype** — a design category (§2) with its stress axis and levers.
- **AI decision** — a scored choice over legal actions, tie-broken deterministically.
- **Threat budget** — enemy count × tier × support density, tuned to a
  time-to-kill band (`docs/07`), not to player level.

## Success Criteria

- Constitution success criteria #1 (build diversity) and #4 (telegraphed
  counterplay) are *measured here* — this feature is how they become CI.
- **SC-E1:** the diversity metric runs headlessly and is reproducible (AC-E4).

## Assumptions & Dependencies

- Depends on [`003-simulation`](../003-simulation/spec.md) (seeded RNG, headless
  sim, battle schema) and [`001`](../001-combat-engine/spec.md)/[`002`](../002-job-system/spec.md)
  (the mechanics AI plays and builds it must test).
- Story battles are authored instances of these archetypes, supplied later by the
  separate narrative repo via the versioned battle contract.
