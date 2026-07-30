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
- `docs/adr/` — Architecture/Any Decision Records. Read these to see *why* settled decisions were made; add a new ADR (via the `decision-record` skill) rather than relitigating one.

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

## Project skills (in `.claude/skills/`)

Committed, project-scoped skills for agent-first work — invoke by name:

- `repo-orientation` — where to find things and which doc answers what.
- `sim-determinism-guard` — the determinism invariants + a check; use before/while touching sim code.
- `game-design` — this game's house rules (pillars, balance philosophy, anti-convergence law, build-fantasy acceptance test); use for any design/balance work.
- `decision-record` — record a decision as an ADR under `docs/adr/`.
- `brainstorm` / `grill-me` — project-local ideation and adversarial spec-interrogation (our own adaptations).
- `retrospective` — after a task that hit errors/surprises, capture lessons and **propose** (approval-gated) updates to this file, the docs, an ADR, or a new skill.

## Agent team (`.claude/agents/`)

Development uses a **Product-Owner-orchestrated** team. Because the main session is always the human's interlocutor, **Product Owner is the operating contract of the main session** — it holds the vision, is the single point of contact for requirements/decisions, and **delegates to specialist subagents**, integrating their results rather than surfacing raw sub-agent output to the human.

Specialists (delegate via the Agent tool): `systems-designer`, `fft-fidelity`, `reviewer` (adversarial) — active now; `combat-engineer`, `content-author`, `qe-tester` (test plans now; running tests + screenshots at P0), and `playtester` (spawn 2–3 personas) — full value at P0+. Design/review agents are read-only and return findings; only `combat-engineer`/`content-author` edit code/data. See `.claude/agents/README.md` for the full contract and personas.

## Tooling & workflow (for the P0 implementation phase)

- **Spec-driven development (hybrid):** at P0/P1, initialize **GitHub Spec Kit** (`specify init`, integrates with Claude Code). Port `docs/00` → `/speckit.constitution`, and each buildable-system doc (`01`, `02`, `05`, `06`) → a `/speckit.specify` feature spec using its Acceptance Criteria section. See `docs/08` §5.
- **Code intelligence:** `.mcp.json` scaffolds a code-graph/LSP MCP (Serena or a local-first graph), **disabled until P0** — a code graph over a docs-only repo adds noise, and can cost more tokens than it saves if misconfigured. Enable and measure once code exists.
- **Helper skills** (enable on claude.ai if not already): `brainstorming` and `grill-me` for design sessions; the `design` plugin for menu UX. Use `/fewer-permission-prompts` and the `session-start-hook` skill to add `.claude/settings.json` and a SessionStart hook once real commands exist.
