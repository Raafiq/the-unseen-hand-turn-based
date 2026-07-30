# Feature Specification: Job & Customization System

**Feature Branch**: `002-job-system`
**Created**: 2026-07-30
**Status**: Draft
**Source of truth**: [`docs/02-job-and-customization-system.md`](../../docs/02-job-and-customization-system.md) — this spec ports its **Acceptance Criteria (SDD-ready)** verbatim (docs/08 §5). The doc governs on any conflict.
**Constitution**: the centerpiece — Principles I (customization sandbox), II (intensive job system), VI (free respec), and the customization spine.

## Overview

The core of the game: the **5-slot ability chassis** (Primary + Secondary +
Reaction + Support + Movement, plus up to two mastery Traits), **AP-driven job &
skill trees** with permanent portable mastery, **hybrid/fusion jobs**, and **free
respec**. Part A is the faithful FFT JP→job-level→tree baseline; Part B is the
reconciled enhancement layer, gated by a currency table (B0) and the
**anti-convergence law** so the game stays *one deep system*, not ten shallow
ones. Every mechanic must earn a currency row and feed a `docs/03` archetype or it
is cut.

## User Scenarios & Testing

### Actors
- **Player** — spends AP in job trees, equips a loadout in the prep screen.
- **Unit** — carries permanent learned abilities/masteries and a current job.

### Primary journey (P1): build a character (the "aha")
**Given** a unit that has learned abilities in more than one job, **When** the
player equips a Secondary command from another job plus a Reaction/Support/
Movement, **Then** a distinct build emerges, and **When** they change any slot,
**Then** it costs nothing and is reversible (free respec).

### Primary journey (P2): unlock a hybrid
**Given** a unit has mastered two base jobs that form a hybrid recipe, **When**
both masteries are complete, **Then** the hybrid job becomes available; recipes
are hinted, not enumerated.

### Edge cases
- Job change / death+revive / loadout swap → learned abilities & masteries persist.
- Two mutually-exclusive strong branches → SHALL NOT be simultaneously equippable.
- A repeatable action that yields outsized AP, or de-leveling for growth → rejected.

## Requirements (ported verbatim from `docs/02`)

- **AC-J1 (chassis):** A unit SHALL equip exactly one Secondary command (any learned job), one Reaction, one Support, one Movement, and up to two mastery Traits; the Primary SHALL be fixed by the current job.
- **AC-J2 (AP purchase):** Abilities SHALL be acquired only by spending AP on the owning job's tree; the system SHALL NOT grant abilities from equipment unless the `[OPTIONAL]` gear-as-ability module is enabled.
- **AC-J3 (mastery permanence):** Learned abilities and job masteries SHALL persist across job changes, deaths (post-revive), and loadout swaps, and SHALL never be consumable or refundable.
- **AC-J4 (free respec):** Changing any loadout slot in the prep screen SHALL cost no resource and SHALL be reversible.
- **AC-J5 (hybrid unlock):** A hybrid job SHALL become available iff its two required base jobs are both mastered; recipes SHALL be hinted, not enumerated, in-game.
- **AC-J6 (anti-convergence):** No two mutually-exclusive strong branches SHALL be simultaneously equippable; deployment SHALL be capped below roster size.
- **AC-J7 (no degenerate AP):** No single repeatable action SHALL yield disproportionate AP; growth SHALL NOT reward de-leveling.
- **AC-J8 (currency distinctness):** The shipped currency set SHALL contain no two currencies with identical earn+spend semantics (the B0 rule, enforced in review).

## Key Entities (schemas: `docs/05` §6)

- **Job** — id, growth multipliers, primary skillset, tree (nodes with apCost +
  requires), mastery bonus; hybrids add `requires: [jobA, jobB]`.
- **Ability** — id, type (action/reaction/support/movement), skillset, apCost,
  and combat fields (range/aoe/power/formula/inflicts).
- **Loadout** — the 5 slots + up to two traits, on a Unit save record.
- **Unit save record** — level, currentJob, raw stats, brave/faith, `learned[]`,
  `mastered[]`, loadout, equipment.

## Success Criteria

- Constitution success criteria #1 (≥8 viable archetypes, no dominant build),
  #2 (generic ≈ unique), and #3 (investment not grind) — validated against the
  benchmark suite ([`004-encounters-ai`](../004-encounters-ai/spec.md), AC-E2).
- **SC-J1:** the `docs/03` build-fantasy archetypes are each expressible on the
  chassis (the job-system acceptance test).

## Assumptions & Dependencies

- Depends on the deterministic, data-driven state model ([`003-simulation`](../003-simulation/spec.md), `docs/05` §6): jobs/abilities are external data, validated against schemas.
- Locked decisions: the spine (ADR-0001), respec model (ADR-0002) — changes need a new ADR.
- Roadmap: chassis + a few jobs at P1; full trees/mastery/respec at P2; hybrids at P3 (curated set only, per `docs/08` cut-line).
