# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`the-unseen-hand-turn-based` is the systems/combat game for a turn-based tactics RPG modeled on **Final Fantasy Tactics: War of the Lions**, built around **deep character customization** and an **intensive job system**. Narrative content will come from a **separate story repo** (not started); this repo stays narrative-agnostic and loads story battles as data.

**Status: P2 — customization depth, in progress.** A pure headless simulation (`src/sim`) plus a thin viewer (`src/render`) with click-to-act player control, backed by 457 tests, a determinism guard, CI, and a GitHub Pages deploy. **P2's open exit criterion is the build-diversity gate, at N=5 against a release bar of ≥8** (`docs/06` AC-E2, ADR-0014, ADR-0016). The viewer's resolution-transparency previews are a P2 deliverable, not P3 — P3 (`docs/08` §1) is hybrid/fusion jobs, rewind UI, scan and the speed toggle, and none of the last three are shipped. The docs in `docs/` are the **source of truth and outrank the code** when the two disagree — a mismatch means the code is wrong, or the doc needs an explicit, recorded change.

## Source of truth — read these first

Design lives in `docs/`. Read in this order before proposing changes:

- **`docs/NEXT.md` — read this FIRST if you are picking up work.** The handoff a machine
  cannot derive: the next slice, why it matters, and what will bite. It is stamped with the
  commit it was written against and the SessionStart hook flags it once it falls behind —
  if the hook calls it stale, treat its claims as hypotheses and re-derive. (The *derived*
  facts — branch, whether it is already merged, unpushed work — are printed by the hook
  itself, so they cannot rot.)
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

**Whatever you use to prove something must be able to come out the other way.** A fixture, threshold, proxy, spec, caption, or delegated report that would look *identical* whether the claim is true or false proves nothing — and is worse than no evidence, because it reads as proof and borrows the credibility of the things around it. Every rule below is one instance of this, each earned by a shipped defect or a review catch. The list keeps growing; when you meet a form that is not on it, it is this principle again, not a new gotcha.

- **Tests — use the discriminating case.** Inputs where honoring the property gives a *different* result than the plausible wrong behavior; never a tie where all orderings coincide (a Slice-2 AI test "proved" lowest-effHp focus with equal-magnitude foes, hiding a magnitude-first bug). When a change **flips a comparator's primary key**, a fixture that ties on that key is still decided by the *old secondary* key, which may coincide with the new behavior and hide the regression — make the two keys **disagree** (heal-triage needed Faith-scaled magnitude so effHp and total-heal point opposite ways). A doc's AC outranks a specialist's contradicting sub-detail: the AC is the spec.
- **Specs — check a named fixture is REALIZABLE before committing the AC.** This bites harder than the test rule: an AC naming an impossible fixture yields a test that looks compliant, proves nothing, and (since the AC outranks the test) looks *correct* under review. `docs/10` AC-V7 specified "a plateau tile beyond `jump`" on a demo map whose max orthogonal height delta is **1** and lowest `jump` is **1** — nothing is jump-excluded anywhere on it. Prefer **purpose-built fixtures** over shipped demo content, so an AC never depends on content a later slice may change (this is why the viewer's state machine is DOM-free and constructible over an arbitrary `BattleState`).
- **The demo content is a repeat offender — measure it, don't assume it discriminates.** One commit after the rule above was written, `makeDemoBattle()` turned out to produce **identical turn order under a −80 and a −100 cost model** across the whole 8-slot window: a fold test written against it would have passed under both and certified nothing. It took a purpose-built speed ladder (20/17/14/11) to separate them. When a test's job is to tell model A from model B, **assert that the fixture actually separates them**, and keep that assertion so nobody later "simplifies" it back to the demo map.
- **Prose that describes evidence IS an assertion — including a comment saying why a check is WEAKENED.** A PR caption, a visual-proof README, an ADR's "we verified X" — each is trusted without re-derivation. Either the test producing the artifact asserts the claim, or the prose must say it is unasserted. `benchmark-suite.test.ts` exempted `black-magic` from its required-skillset list "because the spellblade is masked" — plausible, specific, and **not the binding constraint**: no benchmark encounter fielded a black-mage *at all*, so the exemption could never have lifted however the mask resolved. A wrong reason makes a gap look smaller and better-understood than it is; verify the stated reason is what actually blocks it, or the note becomes a decoy. A proof-sheet caption ("the one enemy it could reach is tinted red") was **empirically false** — the target set was empty and the red shape was the enemy's *charge reticle*, so it would have had a reviewer read an incoming-nuke warning as an attack option; the same README's blanket "every frame's claim is asserted" let it borrow the tests' credibility. When a frame shows less than you hoped, the honest reading is usually the **stronger** argument.
- **Delegated work — re-run the verification yourself, and treat a reported ENVIRONMENT limit as a hypothesis.** An agent reported "415 passed" where the same command on a loaded box failed (a real CI-flake class: vitest's 5s default vs a 2.7s gauntlet test, now pinned to 30s). Another reported it *could not run Playwright*, but Chromium is pre-installed at `/opt/pw-browsers` — subagents do **not** inherit this session's environment knowledge.
- **Guards — never anchor a check on the thing it is checking.** The Pages branch-policy preflight escalated to an error only when the ref equalled the repository's *default branch* — but that setting was itself the misconfiguration (a dead day-one branch), so on `main`, the one branch that publishes, it would have warned and gone green. A threshold, severity, or expected value derived from the config (or code) under test cannot come out the other way. Anchor on an independent constant and assert the two agree (`PUBLISH_BRANCH` vs `on.push.branches`). Corollary: **fixing the first cause is not resolution** — infra faults chain, and only an end-to-end success proves it. Pages had two sequential causes; the fix for the first left the second untouched and invisible.
- **A CAPABILITY THAT VALIDATES ITS INPUT AND THEN DISCARDS IT READS AS WORKING.** The support slot type-checked the equipped ability, rejected unlearned ones and enforced the chassis rules — every signal a reviewer looks for said it was live — while `build.ts` ignored it entirely. Nine of fourteen builds shipped wearing a dead slot, and the resulting weakness was diagnosed as *content tuning* across two slices (ADR-0016, then ADR-0017 found it). Equip-time validation looks **identical** whether or not the effect exists; the check that can come out the other way is the **A/B on the built object** — construct the same input with the thing present and absent, and assert the outputs differ. Applies to any slot, flag, config key or feature toggle: **assert the thing it feeds actually changes.** Corollary for diagnosis: before attributing a weakness to tuning, confirm the lever it leans on is wired at all.
- **A SPEC WITH NO TEST IS NOT A SPEC — it reads as governing while governing nothing.** This is the principle applied to the docs themselves, and it is the most expensive form found so far. `docs/07` §3 stated the time-to-kill band ("a squishy unit dies in ~1–2 committed actions; a tank in ~3–4") from the project's first week. Nothing asserted it, and the shipped content missed it by **3–4×** for the entire life of the repo: *every* build, squishy and tank alike, died to **one** basic attack. Fights lasted 2–4 turns and were decided by turn order, which made range, positioning, tempo and every signature ability invisible — and collapsed the diversity gate — while the doc kept reading as if the band held. Prose in `docs/` outranks the code, so an unasserted numeric target is worse than an absent one: reviewers and future agents trust it. **When a doc states a number a build could violate, either assert it (an AC + a test, cf. AC-P6) or mark it explicitly aspirational.**
- **A TEST THAT COVERS A SUBSET READS AS COVERING THE SET.** Not the same failure as the unasserted spec above — here the spec HAS a test, the test passes, and the gap is invisible because nothing states what it skipped. Twice in one slice: the "every job's skillset donates a live-formula action" check listed only the four **P2** jobs, so Knight's `battle-skill` and Thief's `steal` shipped **entirely inert** (every action `formula: "none"`) for the life of the repo; and `ttk.test.ts` held the shipped **builds** to the `docs/07` band while the viewer's hand-authored demo roster — which nothing covered — sat 3–4× outside it just as long, so the playable demo one-shot everything. Both had a green suite the whole time. **When you write or read an assertion over "the content", enumerate what content actually exists**, then either cover all of it or name the exclusion in a manifest the test partitions against exactly (`DEFERRED_SKILLSETS`, `DEFERRED_SUPPORT_EFFECTS`, the gate's `EXCLUDED`) — and verify the partition fails on a STALE entry too, not just a missing one.
- **When a metric collapses, check the REGIME before you accept the last change as the cause.** ADR-0015's move+act fold landed and the diversity count fell 6 → 1, so the fold was blamed and a whole follow-up slice was scoped around "give ranged builds an answer to fast melee". Wrong: the fold merely removed the one turn of slack that had been hiding the TTK violation above, and the scoped slice was **unmeasurable as written** — at one-shot lethality no tactical lever can be observed at all. The last thing that changed is the *trigger*, not necessarily the *cause*. **Trace one actual run before committing a diagnosis** (the turn log showed three units dying on the first tick anyone acted, which no amount of reasoning about tempo would have produced).
- **DIFF THE ROWS, NOT THE SUMMARY — an invariant aggregate cannot tell "not wired" from "wired but not decisive".** The A/B for the reaction slot compared `pass`, the variety count and the in-band tallies with the effects stripped and reported them **byte-identical** — which is precisely what a dead slot looks like, and it nearly sent working code back to be re-debugged. Per-run, **13 of 96** gauntlet rows had moved. A pass/fail verdict and a count of identities are *designed* to be stable; they are the wrong instrument for "did this do anything". Diff at the resolution the change acts on, and then say which of the two answers you got — a capability can be live and still move no aggregate (`src/sim/CLAUDE.md`'s secondary-key rule is the other half of this).
- **A LOOP OVER A PROXY SET ENCODES AN INVARIANT NOBODY WROTE DOWN.** The gate's "dropping any one measurable build costs exactly one identity" sweep was deliberately built to be self-maintaining — it enumerated whatever was MEASURABLE rather than naming builds. It still hard-coded a silent assumption: **one credited build per identity**. The moment a second `punch-art.` carrier landed it went red claiming the gate had stopped detecting a lost identity, when what had actually changed was the assumption. Enumerating the set does not make a test proxy-free. Loop over **the quantity the assertion is about** (here the signature prefix, which is what the count keys on), and assert the proxy set is the same size — so the day they diverge you are told rather than misled.
- **A non-monotonic sweep is a SIGNAL, not noise — never read a value off one.** Sweeping a global HP scale gave counts of 5, 2, 4, 3 at adjacent steps. That jitter was not measurement error and not a reason to pick the best-scoring step: it meant the system was straddling a **discontinuity** (integer time-to-kill crossing 1), where every matchup flips at a slightly different threshold. Picking the local maximum there would have been calibrating to the metric *and* frozen on a knife-edge. Once the band was met the jitter disappeared and the count held at 5–6 across ±15%. **Find the plateau; the plateau is the evidence that you fixed a mechanism rather than moved a number.** If there is no plateau, you have not found the real variable yet. **Perturb the BASELINE too, not just your fix.** Before the support slot landed, the *pre-fix* count read 6, 6, **5**, 5, 5, 6 across adjacent HP scales: the build two consecutive handoffs called sub-viable was straddling a discontinuity, not stably failing. A metric that jitters *before you change anything* means the recorded diagnosis of why it fails is probably wrong too — which it was, twice.

> **Six more forms of this principle live in `src/sim/CLAUDE.md`** — gate constants
> calibrated to detect rather than pass, viability proxies that must exercise the real
> causal mechanism, benchmark identities that can be masked or propped up by an unmodeled
> cost, a comparator term whose reach is decided by where it sits in the key sequence, a
> contribution proxy that silently decides which identities can exist at all, and a gate
> row that cannot tell "lost" from "could not end". They are edit-time rules for the probe and the diversity gate, so they
> load when you work in that subtree.

### Engine and process rules

- **Subtree rules load with the subtree.** `src/sim/CLAUDE.md` holds the sim's edit-time
  gotchas (Zod TDZ + the migration-per-bump pattern, the build-time clamp, the probe's
  comparator, gate calibration, golden regeneration); `src/render/CLAUDE.md` holds the
  viewer's (preview purity, the single tile-driven mutator, the forecast projection
  boundary, the absent-not-zero rule). Everything that must be known *before* you open a
  file — the locked decisions, the evidence principle, the two rules below — stays here.
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
- **Handoff freshness:** `npm run check:handoff` — fails if `docs/NEXT.md`'s `written-against` stamp is missing, unresolvable, not an ancestor of HEAD, or more than 20 commits behind. CI enforces it on push events only (a `pull_request` event checks out a *merge* ref, which would count base commits the branch never authored).
- **Test (all):** `npm run test` (`vitest run`) · watch: `npm run test:watch`
- **Test (single):** `npx vitest run src/sim/rng.test.ts` (or `npx vitest run -t "<name>"`)
- **Everything CI runs:** `npm run check` (typecheck + lint + check:rng + check:handoff + test)
- **State dashboard:** `npm run state` (regenerate the generated, drift-proof "state of the engine" page → `state/index.html`, published to `/state/`; derives all counts + a LIVE diversity-gate run, prose lives in `scripts/state-content.ts`; CI fails if the committed copy drifted)
- **Viewer (dev):** `npm run dev` (Vite) · **preview built app:** `npm run preview`
- **Visual tests:** `npm run test:visual` (build + Playwright screenshots/video) → `npm run gallery` (proof-sheet in `visual-artifacts/gallery/`)

The sim core is pure and headless — no rendering/UI deps in `src/sim/**` (ADR-0007,
`sim-determinism-guard` skill). `src/render/**` is the thin viewer (imports the
sim, never the reverse). CI runs `npm run check` + a visual-tests job on every
push/PR (`.github/workflows/ci.yml`); merges to `main` deploy the viewer + the
visual gallery (`/visual/`) to GitHub Pages (`.github/workflows/pages.yml`).

**Pages is a two-part system and the halves fail independently.** `pages.yml`'s
`build` job can be green while the site does not exist — true for the first **22**
runs (2026-07-30 … 2026-08-12); only `deploy` ever failed. Two *different* settings
caused it in sequence: Pages was never enabled (`404 … Ensure GitHub Pages has been
enabled`), then the `github-pages` environment's deployment-branch policy allowed
only a dead day-one branch. Both were derived from the **repository default branch**,
which is the thing that was actually wrong. Since 2026-08-09 GitHub rejects a
refused `deploy` at the environment gate *before assigning a runner*, so it fails in
one second with no steps and **no downloadable logs at all** — which reads like an
infra blip rather than a misconfiguration.

Two preflights now open the `build` job: `/pages` must return 200 with
`build_type == "workflow"`, **and** the environment must allow the branch. The second
exists because the first is not sufficient — `/pages` answers 200 while the gate still
refuses every branch you have, so a guard stopping at the first goes green on a dead
deploy. Its severity anchors on `PUBLISH_BRANCH`, not the default branch: anchoring on
a setting that is itself the bug fails open. Treat a red Pages badge in the README as
"the site is stale", never as flakiness, and never assert the deploy works without
checking it. **The sandbox cannot load `*.github.io`** — an agent can confirm the
deployment API reported success, never that the page renders.

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

- **Retrospective before every PR — and re-write `docs/NEXT.md` in the same pass.** Before opening a PR (or requesting a merge), run the `retrospective` skill: capture any durable lessons from the work and **propose** (approval-gated) updates to CLAUDE.md / the docs / an ADR / a skill. Then update `docs/NEXT.md` — the next slice, the landmines, what is *not* green-lit — and re-stamp its `written-against` to the branch head. Writing the handoff while the context is hot is the whole point; reconstructing it a session later is how it goes wrong. This is the checkpoint where lessons get codified so the same mistake isn't repeated in a future session — it replaces the old per-turn Stop-hook nudge, which fired too often to be useful.
- **Diagnose by TEST, never by theory — and never hand the human manual work** (user directive, 2026-08-08). When something misbehaves, verify with a direct check *before* explaining it: fetch the stored object, A/B against the working precedent, probe with the authenticated API — and say plainly what the sandbox *cannot* verify (e.g. how a private repo's page renders for a logged-in viewer) instead of asserting a cause. The PR-18 visual-proof incident asserted two wrong root-causes before an A/B against PR #8 plus a device screenshot found the real ones. Corollary: the agent automates the fix; suggesting the human do it by hand (drag-drop uploads, manual edits) is a failure mode, not a fallback. **When the sandbox cannot reach an API, a CI runner can** — the proxy 403s `/repos/{owner}/{repo}`, `/pages`, `/environments`, `/deployments` and blocks all `*.github.io`, but a temporary workflow step querying them with `${{ github.token }}` reads the answer straight out of the log. That found the Pages branch policy after two wrong theories; reach for it before guessing or asking the human to go look.
- **Visual proof in a PR (verified recipe).** Commit frames/video under `docs/visual/<slice>/` (cf. `docs/visual/p1`, PR #8) and embed images in the **PR body** as `https://github.com/<owner>/<repo>/raw/<branch>/<path>` — renders inline on desktop web; re-fetch the stored body afterwards to confirm no mangling. Do NOT embed images via API-posted *comments* (that path corrupted URLs with stray backticks, and comments cannot be edited or deleted by the tooling). For mobile-readable motion, commit a **filmstrip contact-sheet PNG** (ffmpeg `fps=N,scale,tile`); keep an H.264 **`run.mp4`** + GIF for desktop (Playwright's bundled ffmpeg is VP8-only; use `ffmpeg-static` via npm). Playable video for any browser lives on the Pages gallery (`/visual/`) after merge.
  - **[STALE — the repo is PUBLIC as of 2026-08-09]** The rest of this recipe was measured while the repo was private, and each finding was *private-repo-specific*: that `raw.githubusercontent.com` 404s (it now returns **200** — verified this session, and 200-vs-404 is exactly the discriminating difference), and the on-device PR-18 limits that the GitHub **mobile app** inlines no image and plays no committed video or GIF, leaving static tap-through as the only medium. Those mobile limits are now **unverified hypotheses**, not facts — the public-repo behaviour may differ. Re-measure on-device before relying on them; do not delete them until something has actually replaced them.
- **Present implementation plans as a readable HTML artifact.** Whenever you produce a non-trivial implementation/kickoff plan for the human's review, render it as a clean, scannable, theme-aware HTML artifact (via the `Artifact` tool + `artifact-design` skill) **in addition to** the plain plan file — the plan file stays the source of truth; the artifact is the review medium. Do this by default; don't wait to be asked.
- **Spec-driven development (hybrid):** **GitHub Spec Kit is initialized** — `.specify/` and `specs/` exist and the `speckit-*` skills are available. `docs/00` is the constitution seed; port each buildable-system doc (`01`, `02`, `05`, `06`, `10`) to a `/speckit.specify` feature spec using its Acceptance Criteria section. See `docs/08` §5.
- **Code intelligence:** `.mcp.json` scaffolds a code-graph/LSP MCP (Serena or a local-first graph). It was gated off while the repo was docs-only; **code now exists, so the gate no longer applies** — enable it and measure whether it saves more tokens than it costs before leaving it on.
- **Helper skills** (enable on claude.ai if not already): `brainstorming` and `grill-me` for design sessions; the `design` plugin for menu UX. Use `/fewer-permission-prompts` and the `session-start-hook` skill to add `.claude/settings.json` and a SessionStart hook once real commands exist.

## Write plainly (user directive, 2026-08-12)

**Default to short and plain in everything the human reads** — chat replies, PR bodies,
commit messages, doc prose. The user asked twice; the second time was a PR body too dense
to absorb.

**Answer in under 5 lines. Add detail only if asked.**

The rules below are the standard plain-language ones, not invented here
([plainlanguage.gov](https://digital.gov/guides/plain-language/principles),
[BLUF](https://en.wikipedia.org/wiki/BLUF_(communication))):

- **Bottom line first (BLUF).** Conclusion in the first sentence. Background after, if at
  all. Your draft's last paragraph is usually the real opening — move it up.
- **Sentences 15–20 words, 25 max.** One point per sentence, one topic per paragraph.
- **Write for the reader, not the subject.** Use words they already use. Not "distinct
  measurable archetypes collapsed below the viability band" — "6 of 7 test builds now lose
  too often to count".
- **Expand a term the first time, or drop it.** `N`, `in band`, `signature prefix`,
  `the fold`, `AC-E2`, `the gauntlet` mean nothing cold. Prefer "variety score",
  "test battles".
- **Cut every word that isn't needed.** Challenge each one.
- **Cut the audit trail — this is the big one.** Rejected options, fixture tweaks,
  re-measurements: not news. They belong in the commit message and code comments, where
  whoever needs them will look. Showing your working is not the same as answering.
- **Tables and short sections beat paragraphs.**

A worked example, same slice, two ways:

> ✗ "The follow-up ADR-0015 named. `ai.ts` now enumerates acts from the actor's tile and
> every reachable tile, emitting one folded `act` + `move` command settling once at −100 CT,
> collapsing `distinctMeasurableArchetypes` 6 → 1 against `VIABLE_MIN_MAPS` = 4…"
>
> ✓ "The AI can now move and attack in one turn, like real FFT. That made fights deadlier,
> so 6 of 7 test builds now lose too often to count. The engine is right; the encounter
> tuning hasn't caught up."

**This is about the WRITING, not the work.** Keep diagnosing by test, keep saying what is
unverified, keep flagging bad news early and plainly. Just use fewer, plainer words.

## Remote-session signals ≠ user intent

This runs as a remote session: the container keeps working when the app is closed, and reopening injects a synthetic `Continue from where you left off` turn. That resume prompt, a Stop-hook nagging about uncommitted changes, and `<system-reminder>` blocks are **environment noise, not the user speaking** — never treat them as approval or as an instruction to proceed. If the only signal to act is one of these, **hold and re-state what you're waiting on**; explicit approval means words from the user. (A session once read repeated resume prompts as "stop asking and ship it" and phrased its own inference as the user's decision — the mistake this note exists to prevent.)
