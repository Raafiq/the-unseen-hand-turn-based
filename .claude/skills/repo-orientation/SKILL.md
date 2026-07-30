---
name: repo-orientation
description: >-
  Orient yourself in the the-unseen-hand tactics-game repo — where things live,
  which design doc answers which question, the locked decisions, and the tag
  conventions. Use this at the START of any non-trivial task in this repo,
  whenever you're unsure which doc is authoritative, when a request touches
  combat/jobs/customization/encounters/economy, or before proposing a change so
  you build on the existing design instead of reinventing it.
---

# Repo Orientation

This repo is the **systems/combat game** for a turn-based tactics RPG modeled on Final Fantasy Tactics: War of the Lions. It is currently **docs-only** (planning phase). The docs are the source of truth for the code that will follow. Narrative comes later from a separate story repo.

**Always read the relevant doc before acting.** Don't infer the design from memory of FFT — this project deviates from FFT deliberately in tagged places.

## Which doc answers which question

| You need… | Read |
|---|---|
| Vision, pillars, the customization "spine", success criteria | `docs/00-vision-and-pillars.md` |
| FFT combat rules: CT turns, formulas, evasion, status, permadeath | `docs/01-combat-system.md` |
| **Jobs & customization (the core)**: chassis, AP trees, hybrids, respec | `docs/02-job-and-customization-system.md` |
| Target build archetypes (the job-system acceptance test) | `docs/03-build-fantasy-catalog.md` |
| What we changed vs FFT + balance philosophy + QoL + accessibility | `docs/04-improvements-and-differentiators.md` |
| Engine model: scheduler, resolution pipeline, determinism, schemas | `docs/05-simulation-and-state-model.md` |
| Encounter design + AI as the balance test-harness | `docs/06-encounters-and-ai.md` |
| Economy, pacing, grind-budget, tuning philosophy | `docs/07-economy-and-pacing.md` |
| Roadmap, cut-lines, onboarding, narrative-repo seam | `docs/08-roadmap-scope-and-onboarding.md` |
| Tech stack (deferred), tooling, helper skills | `docs/09-tech-stack-and-tooling.md` |
| **Why a settled decision was made** | `docs/adr/` (Architecture/Any Decision Records) |

`docs/01`, `02`, `05`, `06` each end with an **Acceptance Criteria (SDD-ready)** section — that's the testable spec for the corresponding code.

## Locked decisions (don't relitigate — open an ADR instead)

- **Customization spine = 5-slot ability chassis + AP job/skill trees (permanent mastery) + hybrid/fusion jobs.** Everything else is `[OPTIONAL]`/`[DEFERRED]`; don't promote it to core.
- **Respec:** permanent progress, free experiments — learned things are never lost; loadout swaps are free.
- **Determinism is a P0 invariant** — a single seeded PRNG drives all randomness in a declared order. Never add unseeded randomness to sim code. (See the `sim-determinism-guard` skill.)
- **Sim core is pure & headless** — no render/UI deps, so it stays unit-testable.

## Conventions

- Doc tags: `[BASELINE]` (faithful FFT) · `[ENHANCEMENT]` (intentional improvement) · `[OPTIONAL]` (may cut) · `[DEFERRED]` (post-1.0). Preserve them when editing.
- **Version baseline:** PSX FFT (1997) numbers; WotL deltas tagged `[WotL]`; the 2025 Ivalice Chronicles remaster is not the baseline.
- FFT formula constants are **illustrative until verified** against AeroStar's Battle Mechanics Guide + FFHacktics (`docs/01` §12). Don't hard-code combat numbers without a golden test-vector.

## When you're about to change something

1. Read the owning doc (table above) and its Acceptance Criteria.
2. Check `docs/adr/` for a decision that already settles it.
3. If your change contradicts a locked decision, stop and use the `decision-record` skill to propose an ADR rather than quietly diverging.
