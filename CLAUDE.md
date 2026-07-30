# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`the-unseen-hand-turn-based` is the systems/combat game for a turn-based tactics RPG modeled on **Final Fantasy Tactics: War of the Lions**, built around **deep character customization** and an **intensive job system**. Narrative content will come from a **separate story repo** (not started); this repo stays narrative-agnostic and loads story battles as data.

**Status: planning / pre-code.** The repository currently contains **design documentation only** — no application code, build tooling, or tests yet. The docs are the deliverable and the source of truth for the code that follows.

## Source of truth — read these first

Design lives in `docs/`. Read in this order before proposing changes:

- `README.md` — overview, pillars, conventions, doc index.
- `docs/00-vision-and-pillars.md` — pillars + the customization "spine" decision + testable success criteria. **This is the project constitution seed** (see Spec Kit note below).
- `docs/01-combat-system.md` — the faithful FFT combat baseline (formulas, CT turns, evasion, permadeath) + a fidelity contract.
- `docs/02-job-and-customization-system.md` — **the core doc**: job system + customization, baseline and enhancement layers.
- `docs/05-simulation-and-state-model.md` — the authoritative engine/state model (scheduler, resolution pipeline, determinism, schemas).
- `docs/06-encounters-and-ai.md` — encounter design + AI as the balance test-harness.
- Also: `03` build-fantasy catalog, `04` improvements/differentiators, `07` economy/pacing, `08` roadmap/scope/onboarding, `09` tech-stack/tooling.

`docs/01`, `02`, `05`, `06` each end with an **Acceptance Criteria (SDD-ready)** section — treat those as the testable spec for the corresponding code.

## Locked decisions (do not relitigate without discussion)

- **Customization spine = three axes:** the 5-slot ability chassis + AP-driven job/skill trees (with permanent mastery bonuses) + hybrid/fusion jobs. Other customization ideas are `[OPTIONAL]`/`[DEFERRED]` — don't promote them to core.
- **Respec model:** permanent progress, free experiments — learned abilities/masteries are never lost; loadout swaps are free.
- **Determinism is a P0 architectural invariant** (`docs/05` §3): a single seeded PRNG drives all randomness (hits, status, crits, AI, loot) in a declared roll order. **Never introduce unseeded randomness (`Math.random`, wall-clock, platform RNG) into simulation code** — rewind, saves, and build-sharing all depend on this.
- **Sim core is pure and headless** — no rendering/UI dependencies in the simulation layer, so it stays unit-testable against the formula vectors.

## Conventions

- Doc tags: `[BASELINE]` = faithful to FFT/WotL · `[ENHANCEMENT]` = intentional improvement · `[OPTIONAL]` = may cut · `[DEFERRED]` = post-1.0. Preserve this tagging when editing docs.
- **Version baseline:** PSX FFT (1997) numbers are the numeric spine; War of the Lions deltas are tagged `[WotL]`; the 2025 *Ivalice Chronicles* remaster is **not** the baseline.
- **FFT formula constants are illustrative until verified** against AeroStar's Battle Mechanics Guide and the FFHacktics Formulas wiki (`docs/01` §12). Do not hard-code combat numbers in code without verifying them and adding a golden test-vector.

## Commands

No build/lint/test tooling exists yet — the stack is deliberately deferred (`docs/09`; leaning Web/TypeScript). Fill this section in when P0 code lands:

- Build: _TBD_
- Lint: _TBD_
- Test (all): _TBD_
- Test (single): _TBD_

## Tooling & workflow (for the P0 implementation phase)

- **Spec-driven development (hybrid):** at P0/P1, initialize **GitHub Spec Kit** (`specify init`, integrates with Claude Code). Port `docs/00` → `/speckit.constitution`, and each buildable-system doc (`01`, `02`, `05`, `06`) → a `/speckit.specify` feature spec using its Acceptance Criteria section. See `docs/08` §5.
- **Helper skills** (enable on claude.ai if not already): `brainstorming` and `grill-me` for design sessions; the `design` plugin for menu UX. Use `/fewer-permission-prompts` and the `session-start-hook` skill to add `.claude/settings.json` and a SessionStart hook once real commands exist.

## Git / PR notes

- The design docs are merged on `main`. Branch new work off `main`.
- History-rewriting pushes (force-push) are blocked by the environment's safety classifier — merge via PR rather than rewriting a pushed branch.
