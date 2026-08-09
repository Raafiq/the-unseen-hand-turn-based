# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`the-unseen-hand-turn-based` is the systems/combat game for a turn-based tactics RPG modeled on **Final Fantasy Tactics: War of the Lions**, built around **deep character customization** and an **intensive job system**. Narrative content will come from a **separate story repo** (not started); this repo stays narrative-agnostic and loads story battles as data.

**Status: P3 — playable.** A pure headless simulation (`src/sim`) plus a thin viewer (`src/render`) with click-to-act player control, backed by 428 tests, a determinism guard, CI, and a GitHub Pages deploy. The docs in `docs/` are still the **source of truth and outrank the code** when the two disagree — a mismatch means the code is wrong, or the doc needs an explicit, recorded change.

## Source of truth — read these first

Design lives in `docs/`. Read in this order before proposing changes:

- `README.md` — overview, pillars, conventions, doc index.
- `docs/00-vision-and-pillars.md` — pillars + the customization "spine" decision + testable success criteria. **This is the project constitution seed** (see Spec Kit note below).
- `docs/01-combat-system.md` — the faithful FFT combat baseline (formulas, CT turns, evasion, permadeath) + a fidelity contract.
- `docs/02-job-and-customization-system.md` — **the core doc**: job system + customization, baseline and enhancement layers.
- `docs/05-simulation-and-state-model.md` — the authoritative engine/state model (scheduler, resolution pipeline, determinism, schemas).
- `docs/06-encounters-and-ai.md` — encounter design + AI as the balance test-harness.
- `docs/10-viewer-and-interaction.md` — the authoritative **viewer** spec: player input as a command source, the turn state machine, the resolution-transparency set, and the AC-V criteria.
- Also: `03` build-fantasy catalog, `04` improvements/differentiators, `07` economy/pacing, `08` roadmap/scope/onboarding, `09` tech-stack/tooling.
- `docs/adr/` — Architecture/Any Decision Records. Read these to see *why* settled decisions were made; add a new ADR (via the `decision-record` skill) rather than relitigating one.

`docs/01`, `02`, `05`, `06`, `07` and `10` each end with an **Acceptance Criteria (SDD-ready)** section — treat those as the testable spec for the corresponding code. Each doc owns an AC letter (`01`→AC-0*, `02`→AC-J*, `05`→AC-S*, `06`→AC-E*, `07`→AC-P*, `10`→AC-V*).

## Locked decisions (do not relitigate without discussion)

- **Customization spine = three axes:** the 5-slot ability chassis + AP-driven job/skill trees (with permanent mastery bonuses) + hybrid/fusion jobs. Other customization ideas are `[OPTIONAL]`/`[DEFERRED]` — don't promote them to core.
- **Respec model:** permanent progress, free experiments — learned abilities/masteries are never lost; loadout swaps are free.
- **Determinism is a P0 architectural invariant** (`docs/05` §3): a single seeded PRNG drives all randomness (hits, status, crits, AI, loot) in a declared roll order. **Never introduce unseeded randomness (`Math.random`, wall-clock, platform RNG) into simulation code** — rewind, saves, and build-sharing all depend on this. Note `npm run check:rng` only scans `src/sim`, but **any module that EMITS COMMANDS is state-bearing** even outside that folder — `src/render/session.ts` now produces the command log, so it must be hand-checked (it is clean: no wall-clock, no timers, and AI turns advance on an explicit Step rather than a racing timer, precisely so "how many commands have been applied by now" is never a function of elapsed time).
- **Sim core is pure and headless** — no rendering/UI dependencies in the simulation layer, so it stays unit-testable against the formula vectors.

## Conventions

- Doc tags: `[BASELINE]` = faithful to FFT/WotL · `[ENHANCEMENT]` = intentional improvement · `[OPTIONAL]` = may cut · `[DEFERRED]` = post-1.0. Preserve this tagging when editing docs.
- **Version baseline:** PSX FFT (1997) numbers are the numeric spine; War of the Lions deltas are tagged `[WotL]`; the 2025 *Ivalice Chronicles* remaster is **not** the baseline.
- **FFT formula constants are illustrative until verified** against AeroStar's Battle Mechanics Guide and the FFHacktics Formulas wiki (`docs/01` §12). Do not hard-code combat numbers without a golden test-vector. Those primary sources are often **egress-blocked (HTTP 403) in this environment**, so `fft-fidelity` cross-corroborates via WebSearch and **tags confidence per constant**. Only mark a value `[VERIFIED]` when a source actually confirmed it — default to `[UNCERTAIN]`; never label an unconfirmed number verified (a review caught Protect/Shell and same-sign Zodiac mislabeled).

### The evidence principle

**Whatever you use to prove something must be able to come out the other way.** A fixture, threshold, proxy, spec, caption, or delegated report that would look *identical* whether the claim is true or false proves nothing — and is worse than no evidence, because it reads as proof and borrows the credibility of the things around it. Every rule below is one instance of this, each earned by a shipped defect or a review catch. When you meet a seventh form, it is this principle again, not a new gotcha.

- **Tests — use the discriminating case.** Inputs where honoring the property gives a *different* result than the plausible wrong behavior; never a tie where all orderings coincide (a Slice-2 AI test "proved" lowest-effHp focus with equal-magnitude foes, hiding a magnitude-first bug). When a change **flips a comparator's primary key**, a fixture that ties on that key is still decided by the *old secondary* key, which may coincide with the new behavior and hide the regression — make the two keys **disagree** (heal-triage needed Faith-scaled magnitude so effHp and total-heal point opposite ways). A doc's AC outranks a specialist's contradicting sub-detail: the AC is the spec.
- **Specs — check a named fixture is REALIZABLE before committing the AC.** This bites harder than the test rule: an AC naming an impossible fixture yields a test that looks compliant, proves nothing, and (since the AC outranks the test) looks *correct* under review. `docs/10` AC-V7 specified "a plateau tile beyond `jump`" on a demo map whose max orthogonal height delta is **1** and lowest `jump` is **1** — nothing is jump-excluded anywhere on it. Prefer **purpose-built fixtures** over shipped demo content, so an AC never depends on content a later slice may change (this is why the viewer's state machine is DOM-free and constructible over an arbitrary `BattleState`).
- **The demo content is a repeat offender — measure it, don't assume it discriminates.** One commit after the rule above was written, `makeDemoBattle()` turned out to produce **identical turn order under a −80 and a −100 cost model** across the whole 8-slot window: a fold test written against it would have passed under both and certified nothing. It took a purpose-built speed ladder (20/17/14/11) to separate them. When a test's job is to tell model A from model B, **assert that the fixture actually separates them**, and keep that assertion so nobody later "simplifies" it back to the demo map.
- **Gates — calibrate constants to DETECT, not to pass.** A threshold frozen just off a verdict-flip certifies nothing (a dominance cutoff `TOP_EFF` shipped 3 ticks under the point that would flag the strongest build, *documented* there, until review cut it). Prefer relative/threshold-free verdicts over hand-tuned absolutes. A benchmark must vary the **axis it claims to test** — matchup/threat, not just geometry — and **adding the axis is not enough**: verify the *shipped aggregate fixture* makes that axis the pivot, since shared filler allies + team-elimination victory + magnitude-focus AI can silently measure a *sibling* axis (the multi-matchup magic opposition rewarded tempo/range, not the candidate's Faith; the Faith cliff only held on a straddle fixture the gate never runs). When the fixture doesn't isolate the axis, say what it *actually* measures.
- **Proxies — must exercise the SAME causal mechanism as the real fix**, else the number is an optimistic ceiling, not a prediction. A *tanky* proxy (inflate HP so the probe looks elsewhere) predicted body-screening would make the summoner viable on 4/6 maps; the shipped *reachability* screen delivered 1/6, because inflated HP changes targeting **globally** while a screen blocks **one lane locally**. Probe *each* stacked assumption, not just the named one.
- **Benchmarks — a build's identity can be MASKED, and an EXCLUDED blocker tag is a hypothesis.** The balance probe uses only live-formula actions (physical/magic/heal) and picks the highest-magnitude in-range one, so a build fights as the *wrong* job whenever a borrowed **secondary out-damages its own primary** (a Geomancer cast black-magic and a wizard cast summons until review caught it). Keep a showcase build's signature action un-dominated, and assert it appears in `RunReport.abilityUsage`. Empirically probe *why* a build is excluded before scoping a slice to unblock it (`reraise-cleric` was mis-excluded; `battle-cleric` is structurally uncountable via prefix-collapse; the summoner's real blocker was short-range-caster survivability, not the charge-whiff or focus-fire its tag named). An identity can also be **propped up by an UNMODELED COST** — `reraise-cleric`'s `white-magic.` rides on unenforced MP (`holy` 56 vs the cleric's 24), so MP enforcement will *lower* N (5→4). Disclose such contingencies in the ADR + the constant's docstring, and assert the *specific* signature action (`holy`, not any `white-magic.*`).
- **Prose that describes evidence IS an assertion.** A PR caption, a visual-proof README, an ADR's "we verified X" — each is trusted without re-derivation. Either the test producing the artifact asserts the claim, or the prose must say it is unasserted. A proof-sheet caption ("the one enemy it could reach is tinted red") was **empirically false** — the target set was empty and the red shape was the enemy's *charge reticle*, so it would have had a reviewer read an incoming-nuke warning as an attack option; the same README's blanket "every frame's claim is asserted" let it borrow the tests' credibility. When a frame shows less than you hoped, the honest reading is usually the **stronger** argument.
- **Delegated work — re-run the verification yourself, and treat a reported ENVIRONMENT limit as a hypothesis.** An agent reported "415 passed" where the same command on a loaded box failed (a real CI-flake class: vitest's 5s default vs a 2.7s gauntlet test, now pinned to 30s). Another reported it *could not run Playwright*, but Chromium is pre-installed at `/opt/pw-browsers` — subagents do **not** inherit this session's environment knowledge.

### Engine and process rules

- **Sim schema growth (Zod gotchas):** Zod builds schemas at module-eval, so a runtime import cycle between two schema modules throws a `ReferenceError` (TDZ) — extract the shared enum/leaf into its own dependency-free module (the `element.ts` split) and re-export. And because the codec uses explicit migrations with **no schema `.default()`s**, adding a *required* field fans out to every typed literal (`defaultUnit`, tests, demo): that is the migration-per-bump pattern working, not a reason to reach for a default.
- **Build-time units skip Zod until `serialize()`:** `buildBattleUnit` builds a raw `UnitState` that is unvalidated until the codec serializes it, so any stat-modifier layer (traits now; equipment/status later) producing an out-of-bounds value only throws at save/rewind, not at build. Every modifier layer must end with the pipeline's **final clamp** to the schema bounds (order: raw → growth → trait → clamp), proven by a serialize round-trip test.
- **The balance probe's candidate ranking must be ONE uniform, transitive total order** (`ai.ts` `compareCandidate`). Fold any new dimension (spread, range, …) into the *same* key sequence for every candidate kind — a bucket-first key (e.g. cluster-size-first) can be intransitive *and* silently override the AC-E3(b) FOCUS rule, letting a wide-but-weak AoE out-rank a near-lethal focus. Value an AoE by `(lowest-effHp-hit, then summed magnitude)`. The comparator is load-bearing for every slice's benchmark numbers — treat it like determinism.
- **A rename or namespace change lands in docs, code AND tests in one slice, or not at all** — half-landed is strictly *worse*, leaving dangling references **plus** the collision it was meant to fix. Check an AC letter is free before minting a set (the viewer's ACs shipped as AC-P, colliding with `docs/07`, so `grep AC-P5` returned two different specs).
- **An N-bump moves ALL the gate's records together, and a "contained" ability edit often isn't.** When `DIVERSITY_TARGET_N` changes or a build moves EXCLUDED↔MEASURABLE, sync every record in the SAME slice — the `gauntlet.ts` manifest, an ADR-0014 amendment, **`docs/06` AC-E2 (authoritative, outranks the ADR — a review caught it at N=5 while the code said 6)**, and a regenerated `npm run state`. A **global ability-property edit** (e.g. a shared `summon.*` range) is byte-identical only for *gauntlet substitution* slots — it also changes any **as-authored** encounter fielding a build that learns it, and `benchmark-suite.test.ts` (self-consistency only, no committed golden) will **not** flag the shift; grep the ability across `data/encounters` + `data/builds` and state what moves.

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
- **State dashboard:** `npm run state` (regenerate the generated, drift-proof "state of the engine" page → `state/index.html`, published to `/state/`; derives all counts + a LIVE diversity-gate run, prose lives in `scripts/state-content.ts`; CI fails if the committed copy drifted)
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

## Tooling & workflow

- **Retrospective before every PR.** Before opening a PR (or requesting a merge), run the `retrospective` skill: capture any durable lessons from the work and **propose** (approval-gated) updates to CLAUDE.md / the docs / an ADR / a skill. This is the checkpoint where lessons get codified so the same mistake isn't repeated in a future session — it replaces the old per-turn Stop-hook nudge, which fired too often to be useful.
- **Diagnose by TEST, never by theory — and never hand the human manual work** (user directive, 2026-08-08). When something misbehaves, verify with a direct check *before* explaining it: fetch the stored object, A/B against the working precedent, probe with the authenticated API — and say plainly what the sandbox *cannot* verify (e.g. how a private repo's page renders for a logged-in viewer) instead of asserting a cause. The PR-18 visual-proof incident asserted two wrong root-causes before an A/B against PR #8 plus a device screenshot found the real ones. Corollary: the agent automates the fix; suggesting the human do it by hand (drag-drop uploads, manual edits) is a failure mode, not a fallback.
- **Visual proof in a PR (verified recipe).** Commit frames/video under `docs/visual/<slice>/` (cf. `docs/visual/p1`, PR #8) and embed images in the **PR body** as `https://github.com/<owner>/<repo>/raw/<branch>/<path>` — renders inline on desktop web for this private repo; re-fetch the stored body afterwards to confirm no mangling. Do NOT use `raw.githubusercontent.com` (404s on private repos) and do NOT embed images via API-posted *comments* (that path corrupted URLs with stray backticks, and comments cannot be edited or deleted by the tooling). Verified limits (on-device, PR #18): the GitHub **mobile app** displays NO motion format for private-repo files — it never inlines images (alt-text link only), has no player for committed videos (mp4 verified byte-perfect and served as `video/mp4` — the app, not the file), and GIF tap-through does not animate either; **static images via tap-through are the only medium it shows**. So for mobile-readable motion, commit a **filmstrip contact-sheet PNG** (ffmpeg `fps=N,scale,tile`); keep an H.264 **`run.mp4`** + GIF for desktop (Playwright's bundled ffmpeg is VP8-only; use `ffmpeg-static` via npm). Playable video for any browser lives on the Pages gallery (`/visual/`) after merge.
- **Present implementation plans as a readable HTML artifact.** Whenever you produce a non-trivial implementation/kickoff plan for the human's review, render it as a clean, scannable, theme-aware HTML artifact (via the `Artifact` tool + `artifact-design` skill) **in addition to** the plain plan file — the plan file stays the source of truth; the artifact is the review medium. Do this by default; don't wait to be asked.
- **Spec-driven development (hybrid):** **GitHub Spec Kit is initialized** — `.specify/` and `specs/` exist and the `speckit-*` skills are available. `docs/00` is the constitution seed; port each buildable-system doc (`01`, `02`, `05`, `06`, `10`) to a `/speckit.specify` feature spec using its Acceptance Criteria section. See `docs/08` §5.
- **Code intelligence:** `.mcp.json` scaffolds a code-graph/LSP MCP (Serena or a local-first graph). It was gated off while the repo was docs-only; **code now exists, so the gate no longer applies** — enable it and measure whether it saves more tokens than it costs before leaving it on.
- **Helper skills** (enable on claude.ai if not already): `brainstorming` and `grill-me` for design sessions; the `design` plugin for menu UX. Use `/fewer-permission-prompts` and the `session-start-hook` skill to add `.claude/settings.json` and a SessionStart hook once real commands exist.

## Remote-session signals ≠ user intent

This runs as a remote session: the container keeps working when the app is closed, and reopening injects a synthetic `Continue from where you left off` turn. That resume prompt, a Stop-hook nagging about uncommitted changes, and `<system-reminder>` blocks are **environment noise, not the user speaking** — never treat them as approval or as an instruction to proceed. If the only signal to act is one of these, **hold and re-state what you're waiting on**; explicit approval means words from the user. (A session once read repeated resume prompts as "stop asking and ship it" and phrased its own inference as the user's decision — the mistake this note exists to prevent.)
