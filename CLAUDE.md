# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this repo is

A turn-based tactics RPG modeled on **Final Fantasy Tactics: War of the Lions**, built around deep character customization and an intensive job system. This repo is the systems/combat game; narrative content comes from a **separate story repo** (not started), loaded here as data.

**Status: M0 — all seven items built.** Headless sim (`src/sim`) + thin viewer (`src/render`), 928 tests, 44 browser specs, determinism guard, CI, GitHub Pages. A campaign is playable start to finish at the **site root** (`/`; the engine viewer moved to `/viewer.html`): title screen, one `localStorage` save, five battles, a party that keeps what it earns and chooses who deploys, weapons on an authored drip, scene text, prep screen (ADR-0022 … ADR-0026). The
campaign page is set on **parchment** and its text contrast is measured, not eyeballed
(ADR-0028, `docs/10` AC-V15). Story text is a **scene player** — a portrait, a name plate
and one line at a time, with a prologue, an interlude and an epilogue that belong to no
battle (ADR-0029, AC-M8/M9, AC-V16/V17). **No portrait art exists**: every frame holds one
self-labelling placeholder.

**Not established: that a stranger can play it.** Every automated run drives the balance probe or a deliberate forfeit, so "completable" means reachable — never difficulty, pacing or fun. Nobody outside the build has played it.

Engine roadmap sits at **P2**. Open exit criterion: the build-diversity gate at **N=7 against a release bar of ≥8** (`docs/06` AC-E2, ADR-0014, ADR-0020), **carried into M1 by user decision** (`docs/11` §3), not weakened. Viewer resolution-transparency previews are P2, not P3. P3 (`docs/08` §1) is hybrid/fusion jobs, rewind UI, scan, speed toggle — the last three unshipped.

**`docs/` outranks the code.** A mismatch means the code is wrong, or the doc needs an explicit recorded change.

## Source of truth — read these first

- **`docs/NEXT.md` — FIRST if you are picking up work.** The next slice and what will bite. Stamped with the commit it was written against; the SessionStart hook flags it when stale — then treat its claims as hypotheses. (Branch, merge status and unpushed work are printed by the hook, so they cannot rot.)
- `README.md` — overview, pillars, conventions, doc index.
- `docs/00-vision-and-pillars.md` — pillars, the customization spine, testable success criteria. **The constitution seed.**
- `docs/01-combat-system.md` — the faithful FFT baseline + fidelity contract.
- `docs/02-job-and-customization-system.md` — **the core doc**: jobs + customization.
- `docs/05-simulation-and-state-model.md` — authoritative engine/state model.
- `docs/06-encounters-and-ai.md` — encounter design + AI as balance harness.
- `docs/10-viewer-and-interaction.md` — authoritative **viewer** spec.
- Also: `03` build fantasies, `04` differentiators, `07` economy/pacing, `08` roadmap, `09` tech stack, `11` M0 slice.
- `docs/adr/` — why settled decisions were made. Add a new ADR (`decision-record` skill) rather than relitigating one.

`docs/01, 02, 05, 06, 07, 10` each end with **Acceptance Criteria (SDD-ready)** — the testable spec for the matching code. AC letters: `01`→AC-0*, `02`→AC-J*, `05`→AC-S*, `06`→AC-E*, `07`→AC-P*, `10`→AC-V*.

## Locked decisions (do not relitigate without discussion)

- **Customization spine = three axes:** the 5-slot ability chassis + AP-driven job/skill trees with permanent mastery bonuses + hybrid/fusion jobs. Everything else is `[OPTIONAL]`/`[DEFERRED]` — don't promote it to core.
- **Respec:** permanent progress, free experiments. Learned abilities and masteries are never lost; loadout swaps are free.
- **Determinism is a P0 invariant** (`docs/05` §3). One seeded PRNG drives all randomness — hits, status, crits, AI, loot — in a declared roll order. **Never introduce `Math.random`, wall-clock or platform RNG into simulation code.** Rewind, saves and build-sharing depend on it. `npm run check:rng` only scans `src/sim`, but **any module that emits commands is state-bearing**: `src/render/session.ts` produces the command log, so hand-check it. (It is clean — no wall-clock, no timers, AI turns advance on an explicit Step, so "how many commands so far" is never a function of elapsed time.)
- **Sim core is pure and headless** — no rendering/UI deps in the simulation layer.

## Conventions

- Doc tags: `[BASELINE]` faithful to FFT/WotL · `[ENHANCEMENT]` intentional improvement · `[OPTIONAL]` may cut · `[DEFERRED]` post-1.0. Preserve them when editing docs.
- **Version baseline:** PSX FFT (1997) is the numeric spine; WotL deltas tagged `[WotL]`; the 2025 *Ivalice Chronicles* remaster is **not** the baseline.
- **FFT constants are illustrative until verified** against AeroStar's Battle Mechanics Guide and the FFHacktics wiki (`docs/01` §12). No hard-coded combat number without a golden test-vector. Those sources are often **egress-blocked (403) here**, so `fft-fidelity` cross-corroborates by WebSearch and tags confidence per constant. Default to `[UNCERTAIN]`; mark `[VERIFIED]` only when a source actually confirmed it.

## The evidence principle

**Whatever you use to prove something must be able to come out the other way.** A fixture, threshold, proxy, spec, caption or delegated report that would look *identical* whether the claim is true or false proves nothing — and is worse than no evidence, because it reads as proof and borrows the credibility of everything around it.

Each rule below is one instance, earned by a shipped defect. When you meet a form not on this list, it is still this principle.

**Fixtures and tests**

- **Use the discriminating case.** Inputs where the right behavior gives a *different* answer than the plausible wrong one — never a tie where all orderings coincide. When a change **flips a comparator's primary key**, a fixture that ties on that key is decided by the *old secondary* key and may coincide with the new behavior: make the two keys **disagree**. **And a fixture that ENDS at the boundary cannot test the boundary** — when the rule is about the last element of a sequence ("the final screen is credited no dwell"), a fixture with nothing after it scores identically under the rule and its negation; put something after it. A doc's AC outranks a specialist's contradicting sub-detail.
- **Check a named fixture is REALIZABLE before committing the AC.** An AC naming an impossible fixture yields a test that looks compliant, proves nothing, and — since the AC outranks the test — reads as correct under review. (AC-V7 asked for "a plateau tile beyond `jump`" on a map with no such tile.) Prefer **purpose-built fixtures** over shipped demo content.
- **The demo content is a repeat offender — measure it, don't assume it discriminates.** `makeDemoBattle()` gave identical turn order under a −80 and a −100 cost model across the whole window; a fold test written against it would have certified nothing. When a test's job is to tell model A from model B, **assert the fixture actually separates them**, and keep that assertion.
- **A test that covers a SUBSET reads as covering the SET.** The "every skillset donates a live action" check listed only four jobs, so two skillsets shipped entirely inert for the life of the repo. Enumerate what content actually exists, then either cover it all or name the exclusion in a manifest the test partitions against **exactly** — and verify the partition fails on a STALE entry too, not just a missing one. **The same holds for a reconciliation table in a doc:** `docs/02` B0 polices only the rows present, so character Level was never cut nor kept while two other sections assumed it existed (ADR-0021).

**Assertions**

- **An outcome SET that includes the failure case is not an assertion.** "Every encounter reached a DECISIVE outcome" reads as "the battle works" while every one of them ended in defeat, and an unreachable victory condition passed just as green. Assert the specific outcome you mean. If the honest assertion needs a lever, guard that the lever is honored — an ignored option gives two identical runs.
- **A discriminator you reasoned about is not a verified one.** When a test comment names the bug it catches, **run that mutation**. AC-V13's first draft was green against the very mutant its comment described.
- **A capability that validates its input and then discards it reads as working.** The support slot type-checked the ability, rejected unlearned ones and enforced the chassis rules — while `build.ts` ignored it entirely. Nine of fourteen builds wore a dead slot, misdiagnosed as content tuning across two slices. The check that can come out the other way is the **A/B on the built object**: construct the same input with and without, assert the outputs differ. Applies to any slot, flag, config key or toggle. Before blaming a weakness on tuning, confirm the lever is wired at all.
- **An A/B between two CALLERS of the same helper cannot see a bug in the helper.** Both paths agree perfectly — on the wrong answer. Each path needs one assertion reaching **through** the helper to an observable end.
- **A spec with no test is not a spec.** `docs/07` §3's time-to-kill band went unasserted, and shipped content missed it by 3–4× for the life of the repo: every build died to one basic attack, which made range, positioning and tempo invisible and collapsed the diversity gate. Prose in `docs/` outranks code, so an unasserted numeric target is worse than an absent one. **When a doc states a number a build could violate, either assert it (AC + test, cf. AC-P6) or mark it explicitly aspirational.**
- **Prose that describes evidence IS an assertion — including a comment explaining why a check is weakened.** A PR caption, a visual-proof README, an ADR's "we verified X": each is trusted without re-derivation. Either the test asserts the claim, or the prose says it is unasserted. A wrong *reason* is worse than none: `benchmark-suite.test.ts` exempted `black-magic` "because the spellblade is masked", which was not the binding constraint at all, making the gap look smaller than it was. A proof-sheet caption once described an enemy's charge reticle as an attack option. When a frame shows less than you hoped, the honest reading is usually the **stronger** argument.
- **External precedents lend credibility past what they support.** Name the claim a citation backs and say where it stops. Triangle Strategy and Fire Emblem were cited for a level-gap EXP curve — real — and silently read as backing "levels grant zero stats", which their levels contradict (ADR-0021; XCOM / Into the Breach are the precedents that fit).
- **A claim that something is UNASSERTED rots the day someone asserts it, and nothing
  goes red.** `docs/NEXT.md` said the range panel's separation from every ground had
  **nothing asserting any of it** — false as of the very commit the file was stamped
  against, which had added perceptual-distance floors for exactly that. The prose was
  then relayed to the user as a live coverage gap. A "nothing covers X" you read in a
  doc is a **hypothesis**: grep for the test before repeating it. This is the mirror of
  the future-tense rule above — there, the prediction comes true and the comment is
  wrong; here, the gap gets closed and the comment is wrong. Both are green.

- **Prose in the FUTURE TENSE rots with nothing going red.** `ASSUMED_FUTURE_TURN_COST`'s docstring named the move+act fold as a *future* slice's problem and said the −80 guess was "currently harmless". The fold landed; the oracle stayed green — correctly, the code was fine — so the comment kept reading as pending work nobody owed. A prediction is the one kind of comment whose own test **passing** is what makes it wrong. **When you land the thing a comment predicted, grep for the prediction.**

**Proxies and measurement**

- **Diff the ROWS, not the summary.** An invariant aggregate cannot tell "not wired" from "wired but not decisive". The reaction-slot A/B reported pass, variety count and in-band tallies **byte-identical** with effects stripped — which is exactly what a dead slot looks like — while 13 of 96 gauntlet rows had moved. Diff at the resolution the change acts on, then say which of the two answers you got.
- **A loop over a PROXY set encodes an invariant nobody wrote down.** The gate's self-maintaining "dropping one build costs one identity" sweep silently assumed one credited build per identity, and went red the day a second carrier landed. Loop over **the quantity the assertion is about**, and assert the proxy set is the same size.
- **A CHECKER THAT DECLINES TO CHECK STILL REPORTS PASS.** axe-core refuses to judge
  contrast over a background it cannot flatten — and reports the refusal as
  `incomplete`, not as a violation. On the parchment briefing screen it evaluated **2
  nodes, filed 106 as incomplete, and returned zero violations**: a green identical to
  the one an unreadable page produces. Reading a tool's summary is not reading its
  coverage. **Ask any analyzer how many things it actually looked at**, assert that
  number, and disable the rule it cannot honour rather than banking its green.
- **A non-monotonic sweep is a SIGNAL, not noise — never read a value off one.** Counts of 5, 2, 4, 3 at adjacent steps meant the system was straddling a **discontinuity** (integer time-to-kill crossing 1), not that the best step was best. Picking the local maximum calibrates to the metric and freezes on a knife-edge. **Find the plateau** — the plateau is evidence you fixed a mechanism rather than moved a number. **Perturb the BASELINE too:** a build two handoffs called sub-viable was straddling a discontinuity, so the recorded diagnosis of why it failed was wrong, twice.
- **When a metric collapses, check the REGIME before blaming the last change.** ADR-0015's move+act fold dropped the diversity count 6 → 1 and got blamed; it had merely removed the slack hiding the TTK violation above, and the follow-up slice scoped from that diagnosis was **unmeasurable as written**. The last thing that changed is the trigger, not necessarily the cause. **Trace one actual run before committing a diagnosis.**

**Guards and delegation**

- **Never anchor a check on the thing it is checking.** The Pages preflight escalated to an error only when the ref equalled the repository default branch — but that setting *was* the misconfiguration, so on the one branch that publishes it would have gone green. Anchor on an independent constant and assert the two agree (`PUBLISH_BRANCH` vs `on.push.branches`). Corollary: **fixing the first cause is not resolution** — infra faults chain; only end-to-end success proves it.
- **Delegated work — re-run the verification yourself, and treat a reported ENVIRONMENT limit as a hypothesis.** An agent reported "415 passed" where the same command failed on a loaded box (vitest's 5s default vs a 2.7s test, now pinned to 30s). Another reported it could not run Playwright, but Chromium is pre-installed at `/opt/pw-browsers`. Subagents do **not** inherit this session's environment knowledge.

> **Six more forms live in `src/sim/CLAUDE.md`** — gate constants calibrated to detect rather than pass, viability proxies that must exercise the real causal mechanism, identities that can be masked or propped up by an unmodeled cost, a comparator term whose reach depends on where it sits in the key sequence, a contribution proxy that decides which identities can exist, and a gate row that cannot tell "lost" from "could not end". They load when you work in that subtree.

## Engine and process rules

- **Subtree rules load with the subtree.** `src/sim/CLAUDE.md` holds the sim's edit-time gotchas (Zod TDZ + migration-per-bump, the build-time clamp, the probe's comparator, gate calibration, golden regeneration). `src/render/CLAUDE.md` holds the viewer's (preview purity, the single tile-driven mutator, the forecast projection boundary, absent-not-zero). Everything you must know *before* opening a file stays here.
- **A rename or namespace change lands in docs, code AND tests in one slice, or not at all.** Half-landed is strictly worse: dangling references *plus* the collision it was meant to fix. Check an AC letter is free before minting a set (viewer ACs shipped as AC-P, colliding with `docs/07`).
- **An N-bump moves ALL the gate's records together.** When `DIVERSITY_TARGET_N` changes or a build moves EXCLUDED↔MEASURABLE, sync in the same slice: the `gauntlet.ts` manifest, an ADR-0014 amendment, **`docs/06` AC-E2 (authoritative, outranks the ADR)**, **`docs/08` §1a's phase checklist**, **`docs/11` §3's M0 status table**, and a regenerated `npm run state`. The last three are authored, not derived, and each has gone stale in the past.
- **`npm run state` goes stale on ANY commit that adds a counted artifact** — an ADR, encounter, build or spec file — not only on a gate change. Regenerate it as the **last** step of a slice: a clean run taken mid-slice proves nothing about the commit you push. **And "derived" does not mean "complete":** each counter enumerates a **named directory**, so a new content directory is invisible until wired in (`data/campaign/encounters` shipped 5 battles the count could not see).
- **A "contained" ability edit often isn't.** A global ability-property edit (e.g. a shared `summon.*` range) is byte-identical only for *gauntlet substitution* slots — it also changes any **as-authored** encounter fielding a build that learns it, and `benchmark-suite.test.ts` will not flag the shift. Grep the ability across `data/encounters` + `data/builds` and state what moves.

## Commands

Stack locked at P0 (ADR-0007): **Web / TypeScript** — headless `src/sim/` + thin `src/render/`. TypeScript `strict`, Vitest, Zod, Vite, ESLint, npm. Install with `npm install`.

| Command | What it does |
| --- | --- |
| `npm run check` | **Everything CI runs**: typecheck + lint + check:rng + check:handoff + check:story + test |
| `npm run build` | typecheck + `vite build` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint .` — bans unseeded RNG / wall-clock in `src/sim/**` |
| `npm run check:rng` | greps `src/sim` for banned nondeterminism |
| `npm run check:story` | fails if a test asserts a literal phrase from `data/campaign/story/*.story.json` |
| `npm run check:handoff` | fails if `docs/NEXT.md`'s `written-against` stamp is missing, unresolvable, not an ancestor of HEAD, or >20 commits behind |
| `npm run check:counts` | fails if a status line's test counts have gone stale. Runs after `test`, reading the summary that run writes |
| `npm run test` | `vitest run` · watch: `npm run test:watch` |
| `npx vitest run <file>` | one file · or `npx vitest run -t "<name>"` |
| `npm run state` | regenerate the drift-proof state page → `state/index.html`; CI fails if the committed copy drifted |
| `npm run dev` / `preview` | Vite dev server / preview the built app |
| `npm run test:visual` | build + Playwright screenshots/video → `npm run gallery` for the proof-sheet |

Notes:

- **`npx playwright test` alone does NOT rebuild.** It serves whatever is in `dist`, so a spec for a feature you just wrote fails exactly like a broken feature. Rebuild before believing a browser failure.
- **`check:story`** exists because the story pack is swappable by contract (`docs/11` AC-M4); a test pinning its prose makes exercising that seam a build failure. Four did.
- **`check:counts`** exists because a count in prose that nothing derives went stale twice
  in two commits, both times caught by a human happening to look. It matches only the LIVE
  shape — `N tests, M browser specs`, a comma joining both — so the six **dated** evidence
  claims elsewhere ("shipped past 720 green tests") are deliberately not touched: those are
  the record of a past defect and correcting them would falsify it. It also fails if it
  finds fewer than three live claims, because a guard that only checks the numbers it finds
  passes vacuously the day someone rewords every site. Mutation-verified four ways.
- **`check:handoff`** runs on push events only — a `pull_request` event checks out a *merge* ref and would count base commits the branch never authored.
- CI runs `npm run check` + a visual-tests job on every push/PR. Merges to `main` deploy the viewer + gallery (`/visual/`) to Pages.

### GitHub Pages is a two-part system and the halves fail independently

`pages.yml`'s `build` job can be green while the site does not exist — true for the first **22** runs. Only `deploy` ever failed, from two different settings in sequence: Pages was never enabled, then the `github-pages` environment's branch policy allowed only a dead day-one branch. Both derived from the **repository default branch**, which was the real fault. Since 2026-08-09 GitHub refuses a blocked `deploy` at the environment gate before assigning a runner, so it fails in one second with no steps and **no logs** — reading like an infra blip rather than a misconfiguration.

Two preflights now open `build`: `/pages` must return 200 with `build_type == "workflow"`, **and** the environment must allow the branch. The second exists because the first is insufficient — `/pages` answers 200 while the gate still refuses every branch you have. Severity anchors on `PUBLISH_BRANCH`, not the default branch.

Treat a red Pages badge as "the site is stale", never as flakiness. **The sandbox cannot load `*.github.io`** — an agent can confirm the deployment API reported success, never that the page renders.

## Project skills (`.claude/skills/`)

Invoke by name:

- `repo-orientation` — where to find things and which doc answers what.
- `sim-determinism-guard` — determinism invariants + a check; use before touching sim code.
- `game-design` — house rules: pillars, balance philosophy, anti-convergence law, build-fantasy acceptance test.
- `decision-record` — record a decision as an ADR.
- `brainstorm` / `grill-me` — ideation and adversarial spec-interrogation.
- `retrospective` — capture lessons and **propose** (approval-gated) updates to this file, the docs, an ADR or a skill. **Run before opening a PR**, and after any task that hit surprises.

## Agent team (`.claude/agents/`)

**Product Owner is the operating contract of the main session** — it holds the vision, is the single point of contact for requirements and decisions, and **delegates to specialists**, integrating their results rather than surfacing raw sub-agent output.

**THE MAIN SESSION IS COMMAND CENTER, AND DOES NOT DO THE WORK (user, 2026-08-30).**
This is stronger than "delegate when convenient" and it replaces it:

1. **Every piece of work goes to an agent.** The main session decides, scopes, sequences,
   integrates, quality-gates, and talks to the user. It does not implement, author, test,
   review or design. No approval is needed to spawn a specialist.
2. **Work no agent covers is ESCALATED, never absorbed.** Name the gap, say what it would
   own, and propose either a **new hire** or **promoting an existing agent** to broader
   responsibility — then wait for the user's call. Quietly doing it yourself is the failure
   this roster exists to prevent.
3. **A roster nobody uses is a signal about the roster.** It was invoked **zero** times
   across an entire multi-slice session and nobody noticed until the user asked. The gap
   was the whole visual layer, which is why `viewer-engineer` and `art-director` exist —
   and the first review that was actually delegated found three blockers the main session
   and 880 green tests had both missed.

The judgement call is the *scoping*, not the doing. A slice usually needs two or three
specialists in sequence; sequencing them and reconciling what they hand back is the job.

Specialists: `systems-designer`, `fft-fidelity`, `reviewer` (adversarial), `combat-engineer`, `content-author`, **`viewer-engineer`** (everything under `src/render/`), **`art-director`** (how it looks — answers with rendered options, never prose), **`docs-steward`** (the written record, and auditing it for drift), **`release-engineer`** (branches, PR bodies, CI to green, the Pages deploy), `qe-tester`, `playtester` (spawn 2–3 personas). Design, review and playtest agents are read-only; `combat-engineer`, `content-author`, `viewer-engineer`, `docs-steward` and `release-engineer` edit their own territory, and `art-director` writes only scratch mockups. **Process and tooling — retrospectives, hooks, CI guards, the agent files — stay with the main session** (user, 2026-08-30): the one deliberate exception to "does not do the work", and not one to widen. Full contract in `.claude/agents/README.md`.

## Tooling & workflow

- **Retrospective before every PR — and re-write `docs/NEXT.md` in the same pass.** Run the `retrospective` skill, propose approval-gated updates, then rewrite `docs/NEXT.md` (next slice, landmines, what is *not* green-lit) and re-stamp `written-against` to the branch head. Writing the handoff while context is hot is the whole point.
- **Diagnose by TEST, never by theory — and never hand the human manual work** (user directive, 2026-08-08). Verify with a direct check before explaining: fetch the stored object, A/B against a working precedent, probe with the authenticated API. Say plainly what the sandbox **cannot** verify instead of asserting a cause. The agent automates the fix; suggesting the human do it by hand is a failure mode, not a fallback.
- **When the sandbox cannot reach an API, a CI runner can.** The proxy 403s `/repos/{owner}/{repo}`, `/pages`, `/environments`, `/deployments` and blocks `*.github.io` — but a temporary workflow step querying them with `${{ github.token }}` prints the answer in the log. That found the Pages branch policy after two wrong theories. Reach for it before guessing.
- **A PR body is AUTHORED, and "I pushed the branch" is not a delivery.** The harness forbids opening a PR unasked, so the human often opens it — and GitHub fills the body from the head commit message: hard-wrapped, no headings, trailers leaked. If you did not open the PR, find it and **replace an auto-filled body** (auto-filled iff it equals the head commit message) with: lede, review-artifact link, a `Claim / the bug it hides / caught by` evidence table, what is deliberately **not** asserted, the checks (cf. PR #35, #36). Re-fetch the stored body to confirm nothing mangled. No hook can catch this.
- **Visual proof in a PR.** Commit frames/video under `docs/visual/<slice>/` and embed images in the **PR body** as `https://github.com/<owner>/<repo>/raw/<branch>/<path>`; re-fetch afterwards to check for mangling. Do **not** embed images in API-posted comments (that path corrupts URLs and comments cannot be edited by the tooling). For motion: a filmstrip contact-sheet PNG (ffmpeg `fps=N,scale,tile`) plus an H.264 `run.mp4` and GIF (Playwright's bundled ffmpeg is VP8-only; use `ffmpeg-static`). Playable video lives on the Pages gallery after merge.
  - **[STALE — the repo has been PUBLIC since 2026-08-09]** The old mobile findings were private-repo-specific: `raw.githubusercontent.com` now returns **200**, and the claim that the GitHub mobile app inlines no image and plays no committed video is now an **unverified hypothesis**. Re-measure on-device before relying on it; don't delete it until something replaces it.
- **For a TASTE change, get a reference before you build.** The parchment slice was
  rebuilt twice from scratch — "too bright", then "too dark" — before the user sent one
  image, which settled it in a single pass. Aesthetic direction is not derivable from a
  description, and each blind iteration costs a full rebuild. Ask for a reference, or
  put 2–3 real options in front of them, before writing the stylesheet.
  - **OPTIONS THAT ARE ALL VARIATIONS OF THE CURRENT IMPLEMENTATION CANNOT ESCAPE A FAULT
    IN IT.** Three re-colourings of the battle board were rejected outright; every one of
    them kept the per-tile grid line, which *was* the fault ("actual grounds instead of
    this blocky generic"). When the user names a reference work, go and establish what
    that work actually **does** — FFT draws no grid on the ground — before generating
    options, or the whole set inherits the thing being complained about.
  - **WHEN THE DECISION IS ABOUT APPEARANCE, RENDER IT BEFORE ASKING.** A multiple-choice
    question about how something looks is unanswerable in prose: the user said so three
    times in one session ("give me the image ... before I can even say go or no go", "I
    can't quite visualise the options, can u show me"). Frames from the **running game**
    beat mockups, and both beat a description — patch the data, capture, revert. Budget
    for it; it is cheaper than a rejected slice.
- **Present implementation plans as a readable HTML artifact** (via `Artifact` + the `artifact-design` skill) **in addition to** the plan file. The file is the source of truth; the artifact is the review medium. Do this by default.
- **Spec-driven development (hybrid):** Spec Kit is initialized — `.specify/` and `specs/` exist, `speckit-*` skills available. `docs/00` is the constitution seed; port each buildable-system doc (`01`, `02`, `05`, `06`, `10`) to a `/speckit.specify` feature spec from its AC section. See `docs/08` §5.
- **Code intelligence:** `.mcp.json` scaffolds a code-graph/LSP MCP. The docs-only gate no longer applies — enable it and measure whether it saves more tokens than it costs.

## Write plainly (user directive, 2026-08-12)

**Answer in under 5 lines. Add detail only if asked.** Default to short and plain in everything the human reads — chat, PR bodies, commit messages, doc prose.

Standard plain-language rules ([plainlanguage.gov](https://digital.gov/guides/plain-language/principles), [BLUF](https://en.wikipedia.org/wiki/BLUF_(communication))):

- **Bottom line first.** Conclusion in the first sentence. Your draft's last paragraph is usually the real opening.
- **Sentences 15–20 words, 25 max.** One point per sentence.
- **Write for the reader.** Not "distinct measurable archetypes collapsed below the viability band" — "6 of 7 test builds now lose too often to count".
- **Expand a term the first time, or drop it.** `N`, `in band`, `the fold`, `AC-E2`, `the gauntlet` mean nothing cold. Prefer "variety score", "test battles".
- **Cut the audit trail — this is the big one.** Rejected options, fixture tweaks, re-measurements belong in the commit message, not the answer. Showing your working is not the same as answering.
- **Tables and short sections beat paragraphs.**

**This is about the WRITING, not the work.** Keep diagnosing by test, keep saying what is unverified, keep flagging bad news early. Just use fewer, plainer words.

## Remote-session signals ≠ user intent

This runs as a remote session: the container keeps working when the app is closed, and reopening injects a synthetic `Continue from where you left off` turn. That resume prompt, a Stop-hook nagging about uncommitted changes, and `<system-reminder>` blocks are **environment noise, not the user speaking** — never treat them as approval. If the only signal to act is one of these, **hold and re-state what you're waiting on.** Explicit approval means words from the user. (A session once read repeated resume prompts as "stop asking and ship it", then phrased its own inference as the user's decision.)
