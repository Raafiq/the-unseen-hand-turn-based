# Implementation Plan: Conditional Job Unlocks ("Deed Jobs")

**Branch**: `claude/speckit-tooling-spike-voxuhy` (spec branch id `005-conditional-job-unlocks`) | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-conditional-job-unlocks/spec.md`

> **SPIKE. The Constitution Check below FAILS. Do not implement from this plan.**
> It was generated to exercise the Spec Kit tooling, not to authorize work.

## Summary

Add a permanent, monotonic per-unit **deed ledger** to `UnitRecord`, and let a content
pack gate a job behind a deed threshold. Bounty Hunter at N kills is the worked example.
The deed counters are folded from the same battle report that already funds the AP grant,
so no new measurement surface is created. `PrepModel.jobIds()` — which today returns every
job in the pack — becomes the single gate point.

**The threshold in the spec is wrong.** Phase 0 measured the shipped campaign: it fields
**12 enemy units in total**, so 15 kills is unreachable by any unit under any play. See
`research.md` R-3.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict`. ES modules, `.js` import specifiers.

**Primary Dependencies**: Zod (schemas + migrations), Vitest (tests), Vite (viewer build).
No new dependency is introduced by this feature.

**Storage**: One `localStorage` slot (`src/render/storage.ts`). Three independent on-disk
version lines: battle state, roster records, content packs. This feature bumps **two** —
roster 3→4 and content 2→3.

**Testing**: Vitest, headless. 752 tests + 23 Playwright browser specs. New tests attach to
existing files (`roster.test.ts`, `progression.test.ts`, `campaign-run.test.ts`,
`content.test.ts`, `prep.test.ts`) — no new test file is needed.

**Target Platform**: Browser (Vite), plus a fully headless simulation path used by CI.

**Project Type**: Single project — headless sim (`src/sim/`) + thin viewer (`src/render/`).

**Performance Goals**: N/A. Deed folding is O(party size) once per battle.

**Constraints**: The simulation core is pure and headless — no rendering imports, no
unseeded randomness, no wall-clock. `npm run check:rng` enforces this over `src/sim`.

**Scale/Scope**: 8 jobs, 15 authored builds, 5 campaign battles, a 4-member party.
~9 source files and 5 test files change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Verdict | Note |
|---|---|---|---|
| I | Customization sandbox / anti-convergence | ⚠️ **AT RISK** | A deed job widens the option set without adding opportunity cost. It is a *free* fourth unlock axis unless it earns a currency row. See violation V1. |
| II | Intensive job system — mastery permanent and portable | ✅ PASS | Deeds are permanent, monotonic, and owned by the unit. Nothing removes them. |
| III | Tactical grid combat / FFT fidelity | ✅ PASS | No combat formula, constant, or turn-order rule is touched. |
| IV | Readable, low-friction UX — hint, don't spoil | ✅ PASS | P2 explicitly hides locked jobs and shows only the counter, matching the hybrid-recipe rule. |
| V | **Determinism (P0, non-negotiable)** | ✅ PASS | Deeds are counted from resolver outcomes that already happened. No new randomness, no clock. `isJobUnlocked` is a pure comparison. |
| VI | Respec = permanent progress, free experiments | ✅ PASS | FR-007 forbids an unlock from auto-changing job, spending AP, or touching the loadout. |

### Spine check

The locked customization spine is three axes (ADR-0001): the 5-slot chassis, AP trees +
mastery, hybrid/fusion jobs. **A deed-gated unlock is a fourth axis.** The constitution
says promoting a secondary axis to core, or adding a fourth, **requires a new ADR**.

### Success-criteria check

Constitution success criterion 3 — *"Investment, not grind; no degenerate farming loop is
ever optimal"* — is the one this feature strains. A kill-count unlock is, by construction,
a reason to farm kills.

### ❌ GATE RESULT: FAIL — 2 unjustified violations, 4 unresolved clarifications

| ID | Violation |
|---|---|
| **V1** | Adds a fourth customization-spine axis. Requires a new ADR superseding/amending ADR-0001. None exists. |
| **V2** | `docs/02` §B0 rule: no feature is real until it earns a currency row. A "Deed" row does not exist, and §B4 ("Kill the grind") argues against it. |

Unresolved: **OI-1, OI-2, OI-3, OI-4** are marked BLOCKING in the spec. Phase 0 resolves
OI-3 with a measurement and proposes answers for OI-2, OI-6, OI-7; **OI-1 and OI-4 remain
open and are the user's and the systems designer's calls.**

## Project Structure

### Documentation (this feature)

```text
specs/005-conditional-job-unlocks/
├── spec.md              # The feature spec (already written)
├── plan.md              # This file
├── research.md          # Phase 0 — the measurement that kills the 15 threshold
├── data-model.md        # Phase 1 — Deeds, JobUnlock, DeedDelta + the migration
├── quickstart.md        # Phase 1 — how to prove it works end to end
├── contracts/
│   └── deed-unlock.md   # Phase 1 — the public sim surface this feature adds
└── tasks.md             # Phase 2 (/speckit-tasks) — NOT created here
```

### Source Code (repository root)

```text
src/
├── sim/                     # pure, headless, deterministic — the engine
│   ├── roster.ts            # MODIFY  Deeds schema + field; version 3→4 + migration
│   ├── job.ts               # MODIFY  DeedKey + JobUnlock schemas; JobSchema.unlock?
│   ├── progression.ts       # MODIFY  isJobUnlocked, unlockedJobs, addDeeds
│   ├── campaign-run.ts      # MODIFY  deriveDeedDeltas (mirrors deriveRewards)
│   ├── campaign.ts          # MODIFY  applyBattleResult folds deeds on victory
│   ├── content.ts           # MODIFY  integrity check; version 2→3 + migration
│   ├── index.ts             # MODIFY  barrel exports
│   ├── harness.ts           # REFERENCE  UnitContribution already counts kos
│   └── gauntlet.ts          # NOT TOUCHED  build-variety score must not move
└── render/                  # thin viewer — no sim logic
    └── prep.ts              # MODIFY  jobIds() is the single gate; add deedCounters

data/
├── base-pack.json           # MODIFY  the bounty-hunter job
└── campaign/encounters/     # NOT TOUCHED  but see research.md R-3

docs/
├── 02-job-and-customization-system.md  # MODIFY  §B0 needs a Deed row (blocked, V2)
└── adr/                                # NEW     ADR for V1 and V2
```

**Structure Decision**: Single project, existing layout. Every engine change lands in
`src/sim/` and stays pure; the viewer touches exactly one function. No new directory, no
new module, no new test file. This is deliberate — the feature's whole risk is in the two
schema bumps and the design question, not in structure.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **V1** — a fourth spine axis | The feature's entire premise is an unlock keyed to behaviour rather than to tree completion or job combination. Nothing in the existing three axes can express "did 15 things". | Gating Bounty Hunter behind **mastery of two jobs** would reuse the hybrid axis with zero new concepts — but it is then a hybrid job, not this feature. That is the honest simpler alternative, and it may well be the right answer. |
| **V2** — a currency row that incentivises farming | A deed threshold is only meaningful if the player can influence it, and anything a player can influence in a repeatable battle is farmable. | Making the deed **non-farmable by construction** — e.g. keying on *battles survived*, which the campaign hands out at a fixed rate — sidesteps §B4 entirely. It also makes the unlock a stealth level gate, which duplicates the existing Level row and is cut by §B0's own "two rows a player can't tell apart" rule. |

Both violations resolve the same way: **an ADR, or a cut.** Neither is an implementation
decision, so neither is resolvable inside this plan.
