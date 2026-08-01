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
- **FFT formula constants are illustrative until verified** against AeroStar's Battle Mechanics Guide and the FFHacktics Formulas wiki (`docs/01` §12). Do not hard-code combat numbers without a golden test-vector. Those primary sources are often **egress-blocked (HTTP 403) in this environment**, so `fft-fidelity` cross-corroborates via WebSearch and **tags confidence per constant**. Only mark a value `[VERIFIED]` when a source actually confirmed it — default to `[UNCERTAIN]`; never label an unconfirmed number verified (a review caught Protect/Shell and same-sign Zodiac mislabeled).
- **Sim schema growth (Zod gotchas):** Zod builds schemas at module-eval, so a runtime import cycle between two schema modules throws a `ReferenceError` (TDZ). When two `src/sim` schemas cross-reference, extract the shared enum/leaf schema into its own dependency-free module (the `element.ts` split) and re-export. And because the codec uses explicit migrations with **no schema `.default()`s**, adding a *required* field fans out to every typed literal (`defaultUnit`, tests, demo) — that's the migration-per-bump pattern working as intended, not a reason to reach for a Zod default.
- **Build-time units skip Zod until `serialize()`:** `buildBattleUnit` constructs a raw `UnitState` that isn't schema-validated until the codec serializes it, so any stat-modifier layer (traits now; equipment/status later) that produces an out-of-bounds value only throws at save/rewind, not at build. Every modifier layer must end with the pipeline's **final clamp** to the `UnitState` schema bounds (order: raw → growth → trait → clamp), and prove it with a serialize round-trip test.
- **An AC test must exercise the discriminating case.** For an Acceptance Criterion that asserts a *property* (e.g. AC-E3b "focus the lowest-effective-HP target"), use inputs where honoring the property gives a *different* result than the plausible wrong behavior — never a tie/degenerate case where all orderings coincide (a Slice-2 AI test "proved" lowest-HP focus with equal-magnitude foes, hiding a magnitude-first bug that only review caught). And a doc's AC outranks a specialist's design sub-detail that contradicts it — the AC is the spec.
- **A build's job identity can be *masked* in the benchmark.** The balance probe (`ai.ts`) only *uses* live-formula actions (physical/magic/heal — never `none`/passives) and picks the highest-magnitude in-range one. So a build authored to showcase a job fights as the *wrong* job whenever a borrowed **secondary out-damages its own primary** (Slice 3 shipped a Geomancer that cast black-magic and a wizard that cast summons until review/validation caught it). When authoring a showcase build, keep its signature skillset's live action un-dominated by the secondary — or its whole archetype is invisible to the diversity gate. Validate by asserting the skillset's action actually appears in `RunReport.abilityUsage`.

## Commands

Stack locked at P0 (ADR-0007): **Web / TypeScript** — a pure headless `src/sim/`
core + a (later) thin `src/render/` layer. Toolchain: TypeScript `strict`,
Vitest, Zod, Vite, ESLint (with a determinism guard), npm. Install with
`npm install`.

- **Build:** `npm run build` (typecheck + `vite build`)
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`)
- **Lint:** `npm run lint` (`eslint .` — bans unseeded RNG / wall-clock in `src/sim/**`)
- **Determinism guard:** `npm run check:rng` (greps `src/sim` for banned nondeterminism)
- **Test (all):** `npm run test` (`vitest run`) · watch: `npm run test:watch`
- **Test (single):** `npx vitest run src/sim/rng.test.ts` (or `npx vitest run -t "<name>"`)
- **Everything CI runs:** `npm run check` (typecheck + lint + check:rng + test)
- **Viewer (dev):** `npm run dev` (Vite) · **preview built app:** `npm run preview`
- **Visual tests:** `npm run test:visual` (build + Playwright screenshots/video) → `npm run gallery` (proof-sheet in `visual-artifacts/gallery/`)

The sim core is pure and headless — no rendering/UI deps in `src/sim/**` (ADR-0007,
`sim-determinism-guard` skill). `src/render/**` is the thin viewer (imports the
sim, never the reverse). CI runs `npm run check` + a visual-tests job on every
push/PR (`.github/workflows/ci.yml`); merges to `main` deploy the viewer + the
visual gallery (`/visual/`) to GitHub Pages (`.github/workflows/pages.yml`).

## Project skills (in `.claude/skills/`)

Committed, project-scoped skills for agent-first work — invoke by name:

- `repo-orientation` — where to find things and which doc answers what.
- `sim-determinism-guard` — the determinism invariants + a check; use before/while touching sim code.
- `game-design` — this game's house rules (pillars, balance philosophy, anti-convergence law, build-fantasy acceptance test); use for any design/balance work.
- `decision-record` — record a decision as an ADR under `docs/adr/`.
- `brainstorm` / `grill-me` — project-local ideation and adversarial spec-interrogation (our own adaptations).
- `retrospective` — capture lessons and **propose** (approval-gated) updates to this file, the docs, an ADR, or a new skill. **Run it before opening a PR** (see Tooling & workflow) and after any task that hit errors/surprises.

## Agent team (`.claude/agents/`)

Development uses a **Product-Owner-orchestrated** team. Because the main session is always the human's interlocutor, **Product Owner is the operating contract of the main session** — it holds the vision, is the single point of contact for requirements/decisions, and **delegates to specialist subagents**, integrating their results rather than surfacing raw sub-agent output to the human.

Specialists (delegate via the Agent tool): `systems-designer`, `fft-fidelity`, `reviewer` (adversarial) — active now; `combat-engineer`, `content-author`, `qe-tester` (test plans now; running tests + screenshots at P0), and `playtester` (spawn 2–3 personas) — full value at P0+. Design/review agents are read-only and return findings; only `combat-engineer`/`content-author` edit code/data. See `.claude/agents/README.md` for the full contract and personas.

## Tooling & workflow (for the P0 implementation phase)

- **Retrospective before every PR.** Before opening a PR (or requesting a merge), run the `retrospective` skill: capture any durable lessons from the work and **propose** (approval-gated) updates to CLAUDE.md / the docs / an ADR / a skill. This is the checkpoint where lessons get codified so the same mistake isn't repeated in a future session — it replaces the old per-turn Stop-hook nudge, which fired too often to be useful.
- **Present implementation plans as a readable HTML artifact.** Whenever you produce a non-trivial implementation/kickoff plan for the human's review, render it as a clean, scannable, theme-aware HTML artifact (via the `Artifact` tool + `artifact-design` skill) **in addition to** the plain plan file — the plan file stays the source of truth; the artifact is the review medium. Do this by default; don't wait to be asked.
- **Spec-driven development (hybrid):** at P0/P1, initialize **GitHub Spec Kit** (`specify init`, integrates with Claude Code). Port `docs/00` → `/speckit.constitution`, and each buildable-system doc (`01`, `02`, `05`, `06`) → a `/speckit.specify` feature spec using its Acceptance Criteria section. See `docs/08` §5.
- **Code intelligence:** `.mcp.json` scaffolds a code-graph/LSP MCP (Serena or a local-first graph), **disabled until P0** — a code graph over a docs-only repo adds noise, and can cost more tokens than it saves if misconfigured. Enable and measure once code exists.
- **Helper skills** (enable on claude.ai if not already): `brainstorming` and `grill-me` for design sessions; the `design` plugin for menu UX. Use `/fewer-permission-prompts` and the `session-start-hook` skill to add `.claude/settings.json` and a SessionStart hook once real commands exist.

## Remote-session signals ≠ user intent

This runs as a remote session: the container keeps working when the app is closed, and reopening injects a synthetic `Continue from where you left off` turn. That resume prompt, a Stop-hook nagging about uncommitted changes, and `<system-reminder>` blocks are **environment noise, not the user speaking** — never treat them as approval or as an instruction to proceed. If the only signal to act is one of these, **hold and re-state what you're waiting on**; explicit approval means words from the user. (A session once read repeated resume prompts as "stop asking and ship it" and phrased its own inference as the user's decision — the mistake this note exists to prevent.)
