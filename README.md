# The Unseen Hand — Turn-Based Tactics (Working Title)

[![CI](https://github.com/Raafiq/the-unseen-hand-turn-based/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Raafiq/the-unseen-hand-turn-based/actions/workflows/ci.yml)
[![Pages](https://github.com/Raafiq/the-unseen-hand-turn-based/actions/workflows/pages.yml/badge.svg?branch=main)](https://github.com/Raafiq/the-unseen-hand-turn-based/actions/workflows/pages.yml)

**Play it:** [▶ the campaign](https://raafiq.github.io/the-unseen-hand-turn-based/) ·
[engine viewer](https://raafiq.github.io/the-unseen-hand-turn-based/viewer.html) ·
[visual gallery](https://raafiq.github.io/the-unseen-hand-turn-based/visual/) ·
[state of the engine](https://raafiq.github.io/the-unseen-hand-turn-based/state/)

A turn-based tactics game in the tradition of **Final Fantasy Tactics: War of the Lions (FFT/WotL)**, built around one obsession: **deep character customization powered by an intensive job system.** Narrative will come from a separate story repository (not yet started); this repo is the combat/systems game.

> **Status: M0 — all seven items built.** A pure headless simulation (`src/sim`) plus a thin viewer (`src/render`), backed by 922 tests, 44 browser specs, a determinism guard, CI, and a GitHub Pages deploy. The stack is Web / TypeScript (ADR-0007).
>
> **You can play a campaign start to finish** — title screen, New Game / Continue, five battles in order, a scene player that reads story a line at a time beside a portrait frame, a prep screen between battles (spend AP, change job, change loadout), weapons on an authored drip, a party that keeps what it earns, and one save slot in the browser (ADR-0022 … ADR-0026, ADR-0029). The campaign is the **site root** (`/`); the engine viewer is `/viewer.html`. ~~What M0 still lacks: equipment and onboarding.~~ Both shipped (ADR-0025, ADR-0026). **What is NOT established: that a stranger can play it** — nobody outside the build has played it, so difficulty, pacing and session length are all unmeasured (`docs/11` §3).
>
> The **engine** roadmap sits at P2 with one open exit criterion — the build-diversity gate, at **N=7** against a release bar of ≥8 (`docs/06` AC-E2, ADR-0014) — **carried into M1 by an explicit decision** (`docs/11` §3): it is a balance-quality bar, not a playability one. The docs in `docs/` remain the source of truth and outrank the code where they disagree.

## Design pillars (in priority order)

1. **Customization sandbox** — the joy of collecting abilities across many jobs and recombining them onto a character.
2. **Intensive job system** — a broad, branching web of jobs with directed, non-grindy progression.
3. **Tactical grid combat** — the FFT CT/clock-tick engine: positioning, height, facing, charge timing.
4. **Readable, low-friction UX** — the math is deep; the interface is honest. Full resolution transparency; discovery preserved where it's fun.

## The customization spine (the 3 systems that ARE the game)

To avoid "ten shallow systems sharing a menu," three axes are the identity. Everything else is optional flavor, tagged as such:

- **The 5-slot ability chassis** — Primary job command + one Secondary command from any learned job + one Reaction + one Support + one Movement. FFT's soul; kept intact.
- **AP-driven job & skill-tree progression** — spend earned AP to walk branching per-job trees (directed, not passive JP drip); mastery grants permanent cross-job passives.
- **Hybrid / fusion jobs** — mastering two base jobs unlocks a hybrid with a blended kit + unique abilities; a combinatorial discovery web.

## Documentation index

| Doc | What it covers |
|---|---|
| [`docs/00-vision-and-pillars.md`](docs/00-vision-and-pillars.md) | Vision, pillars, the spine decision, testable success criteria, non-goals |
| [`docs/01-combat-system.md`](docs/01-combat-system.md) | **Faithful FFT baseline**: CT turns, charge timing, grid/height/facing, weapon & magic formulas, evasion, status, battle flow, permadeath |
| [`docs/02-job-and-customization-system.md`](docs/02-job-and-customization-system.md) | **The core doc.** FFT job baseline + reconciled enhancement layer (currency table, spine, respec, anti-convergence) |
| [`docs/03-build-fantasy-catalog.md`](docs/03-build-fantasy-catalog.md) | Target build archetypes — the acceptance test for the job system |
| [`docs/04-improvements-and-differentiators.md`](docs/04-improvements-and-differentiators.md) | FFT criticisms + our answers, balance-as-process, peer-game lessons, QoL, accessibility, build-sharing |
| [`docs/05-simulation-and-state-model.md`](docs/05-simulation-and-state-model.md) | Authoritative engine model: scheduler, resolution pipeline, determinism/RNG/rewind, save/versioning, data schemas |
| [`docs/06-encounters-and-ai.md`](docs/06-encounters-and-ai.md) | Encounter archetypes + AI as the test harness for builds |
| [`docs/07-economy-and-pacing.md`](docs/07-economy-and-pacing.md) | AP/mastery/hybrid pacing, respec cost, grind-budget curve, numbers/tuning philosophy |
| [`docs/08-roadmap-scope-and-onboarding.md`](docs/08-roadmap-scope-and-onboarding.md) | Phased roadmap, Must/Should/Could cut-lines, onboarding ramp, narrative-repo seam |
| [`docs/09-tech-stack-and-tooling.md`](docs/09-tech-stack-and-tooling.md) | Tech-stack lean (deferred), helper skills, community/tooling |
| [`docs/10-viewer-and-interaction.md`](docs/10-viewer-and-interaction.md) | Authoritative viewer spec: player input as a command source, the turn state machine, resolution-transparency set, AC-V criteria |
| [`docs/11-whole-game-and-mvp.md`](docs/11-whole-game-and-mvp.md) | The **game** roadmap (as opposed to the engine one): what a playable whole needs, the MVP slice that comes first, and the AC-M criteria |

## How these docs feed the code (spec-driven, hybrid)

These documents are the **authoritative, SDD-ready source of truth**, and they outrank the code where the two disagree. We use a **hybrid approach**:

- **Now (planning):** write these as design docs. `docs/00` is the seed for a project **constitution**; the buildable-system docs (`01`, `02`, `05`, `06`) each end with an explicit **Acceptance Criteria (SDD-ready)** section written as testable, EARS-flavored statements.
- **At implementation (P0/P1):** initialize **[GitHub Spec Kit](https://github.com/github/spec-kit)** (installs into Claude Code natively), port `docs/00` → constitution and each system doc → `specs/<feature>/spec.md`, and generate `plan.md`/`tasks.md` per feature then.
- The creative/vision docs (`03` build-fantasy catalog, `04` differentiators) stay **GDD** — they inform specs but are not themselves implementation specs.

## Conventions

- **`[BASELINE]`** = faithful to FFT/WotL (the reference). **`[ENHANCEMENT]`** = an intentional improvement over the original. **`[OPTIONAL]`** = flavor we may cut. **`[DEFERRED]`** = post-1.0 exploration.
- **Version baseline:** PSX *Final Fantasy Tactics* (1997) battle-mechanics numbers are the numeric spine; *War of the Lions* (PSP, 2007) deltas are tagged. The 2025 *Ivalice Chronicles* remaster is **not** used as the baseline.
- Formula constants are treated as **illustrative until verified** against AeroStar's Battle Mechanics Guide and the FFHacktics Formulas wiki (see `docs/01`).
