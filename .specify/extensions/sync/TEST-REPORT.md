# spec-kit-sync 2.1.0 — test report

**Spec Kit**: 1.0.6 · **Extension**: `sync` **2.1.0** (directory `spec-kit-sync`) · **Date**:
2026-09-15 · **Prompt**: `TEST-PROMPT.md` in this directory

## What 2.1.0 changed, and what was tested

**Breaking: the post-write chain is gone.** No command invokes `/speckit-analyze`,
`/speckit-converge` or `/speckit-implement`. A validation pass runs instead, from artifacts
already in context — consistency (`V1 CONTRADICTION:`), residue (`Residue:` for `[X]` tasks that
now contradict an edited artifact), markers, gaps. No file is re-read from disk. **Breaking:
`sync-code` no longer runs implement**; it lists `Open tasks:` and prints
`Next: /speckit-implement`. Plus: the `sync-specs` pre-filter now prints the *list* of skipped
files, `⚠ WEAKENED` lines are grouped by root cause with a count header and `spec.md` first, and
the manifest is bumped to `2.1.0` (closing anomaly 18).

**New this drop**: tests **5C, 5D, 5E** (validation pass) and **5F** (token comparison vs
profiling run P1), and assumption **A13**. Each is one agent following the prompt once, in one
context, in the order 5C, 5D, 5E, 5F.

**The 2.0.0 rows below are kept as history and were NOT rerun.** Read them with one caveat:
wherever a 2.0.0 row records chain evidence — "Chain: analyze … converge …", "implement wrote the
function + 3 tests, 36/36", "converge appended T008" — **that behaviour no longer exists in
2.1.0**. Those cells are the record of what 2.0.0 did, not a claim about this version. The
findings, gate, write and `[Drift:]` behaviour they record is unchanged and still applies.

**Where**: the same scratch clone at `<scratchpad>/sync-drop3`. **Clone commits: 2 new, neither
made by this drop's runs** — `b11ed92` (2.1.0 prompts + the plan.md Scope sentence) and `6d78343`
(the `movementRange` third export) were already on branch `v21-5c` when testing began; the four
runs made **zero** commits and nothing was pushed. Every branch tip is byte-identical before and
after (`6d78343` `v21-5c`, `9b9f311` `pf-2f`, `dadd1bf` `pf-2h`, `0845611` `pf-base`). Prompt
parity checked once: the main checkout's `.claude/skills/speckit-sync-specs/SKILL.md` md5s
`83d651c3…`, equal to `v21-5c`'s committed
`.specify/extensions/sync/.specify-dev/agent-commands/claude/speckit-sync-specs/SKILL.md`;
`sync-code` `1f059394…` on both sides. The older branches carry 2.0.0 fourth-drop copies, which is
irrelevant — the Skill tool loads from the main checkout.

<details>
<summary>2.0.0 header (kept)</summary>

**Extension**: `sync` 2.0.0 (from the supplied
zip — **fourth drop**, still versioned `2.0.0`: it adds the git pre-filter and `--full` to
`sync-specs`, widens the `⚠ WEAKENED` scan from `spec.md` to every artifact, makes the per-artifact
claim scan exhaustive, and adds tests 2H–2K and assumption A12. The **third drop** added the
`⚠ WEAKENED` line above the approval gate in `sync-specs` and `sync-rebase`, one revision slug per
**root cause** rather than per run, and tests 2F, 2G, 4C) · **Date**: 2026-09-15

</details>

**Covers**: install, Phases 2–6, assumptions, anomalies, ship verdict — plus a `## Token profile`
summary of the six profiling runs, whose full ledgers are in `TOKEN-PROFILE.md`.

**Where (second drop)**: every run in a scratch clone of this repo under the session scratchpad,
never in the working checkout. Full-state detection needs committed state, so **twelve** fixture
commits were made **in the clone only** with the owner's go-ahead (the seven from the first drop;
then the 5A change, the 5B change, the Phase 6 fixture, and two commits banking synced artifacts
between runs); nothing was pushed.

**Where (third drop)**: a fresh clone at
`<scratchpad>/sync-drop3`, the working tree copied over it so the three prompts are byte-identical
to the checkout's (`grep -c WEAKENED` = 3 in `sync-specs.md`, 2 in `sync-rebase.md`; the clone's
`.specify/extensions/sync/commands/sync-rebase.md` md5s `b928df84…`, equal to the checkout's).
**First pass — zero clone commits**: `.claude/hooks/guard-git-write.sh` denies `git commit`
everywhere, and both documented ways to write its approval token were refused by the auto-mode
classifier (`Write` → `[Self-Modification]`, `printf … > .claude/.git-go` → `[Auto-Mode Bypass]`);
per CLAUDE.md the session stopped trying. That is survivable for `sync-specs`, which is full-state
(it runs `git rev-parse --is-inside-work-tree` and a read-only `git diff --stat`, and nothing else
touches git), so **2F and 2G ran with the fixture and the planted drift uncommitted**, the same
comparison. `sync-rebase` is diff-based and needs a real rebase with an `ORIG_HEAD`, so 4C could
not run in that pass. **Second pass — three fixture commits**, made in the clone only with the
owner's go-ahead and pushed nowhere: `43a4f7f` baseline (996 fixture + third-drop install),
`76cac61` `upstream-4c` (the clamp floor relaxed 0 → -1), `176dc58` `feat-4c` (one appended
`research.md` sentence). **4C ran on that fixture**; the working checkout gained no commits. The
996 fixture was rebuilt from this report's `## Fixture` description, the old clone being gone.

**Where (fourth drop)**: the same clone at `<scratchpad>/sync-drop3`, its three prompts re-verified
byte-identical to the checkout's before any run — `sync-specs.md` md5 `5f21de00…`, `sync-rebase.md`
`7effa932…`, `sync-code.md` `2646fbc8…`, equal on both sides. **Six new fixture commits, in the
clone only, nothing pushed**: `0845611` installs the fourth-drop prompts and is the base of five
branches — `pf-base` (aligned, no source changed since the artifacts' commit `43a4f7f`), `pf-2h`
(`dadd1bf`, a `floor = 0` third parameter committed **after** `43a4f7f`), `pf-2k` (`cd195a3` the same
drift, then `f8c89c7` a plan.md wording tweak, so the artifacts' last commit is **newer** than the
drift), `pf-2f` (`9b9f311`, the clamp relaxed to `Math.max(-1, …)`), `pf-feat` (`014bea4`, one
appended research.md sentence, rebased onto `pf-2f` for 4C). The working checkout gained no commits.

**What the fourth drop adds**: a git pre-filter on `sync-specs` source reads (`ARTIFACT_COMMIT` =
`git log -1 --format=%H -- <FEATURE_DIR>`, `--full` to bypass, `Source files read: N (skipped: S)` in
the findings line); the `⚠ WEAKENED` scan widened from `spec.md` to **every artifact** in both
`sync-specs` and `sync-rebase`, with a new `<id> in <file>` line format; and an explicitly **exhaustive**
per-artifact claim scan in all three commands. New tests **2H, 2I, 2J, 2K** and assumption **A12**;
**2F and 4C were re-run** against the widened weakening rule. Everything else (2A–2E, 2G, 3A–3C,
4A–4B, 5A, 5B, Phase 6, the cross-cutting checks) was **not rerun**; those rows are the earlier runs.
The manifest still reads `2.0.0` — the fourth different prompt set under one version string; see
anomaly 18.

**One methodology deviation, and it matters.** Every third-drop row is one agent that ran one test.
The fourth drop's six runs were performed by **one agent in one context**, in the order 2I, 2J, 2H,
2K, 2F, 4C — and that agent had read this report, including anomaly 15's description of the exact
sentence the third drop missed, before running 2F. The exhaustive-scan and WEAKENED results below
therefore show that the widened prompt **can** produce the right answer, not that a cold agent would.
Read "anomaly 15 resolved" as the weaker claim. The pre-filter rows (2H, 2I, 2J, 2K) are mechanical
— `git log` and `git diff --name-only` — and are not affected by this.

Tests whose prompt text did not change between drops (2A–2E, 3A–3C, 4A–4B, 5A, 5B, Phase 6,
the cross-cutting checks) were **not rerun**; their rows are the earlier runs.
The 1.0.0 report is kept as `TEST-REPORT-1.0.0.md`.

**Read this first.** The three commands are agent prompts. Every row is **one run** of an agent
following the prompt through the Skill tool; a second run can differ in its judgment calls.
Nothing here is a guarantee.

## Fixture

`specs/996-movement-slot/` with six artifacts: `spec.md`, `plan.md`, `tasks.md`,
`contracts/api.md` (signature block + behaviour bullets + "exactly two runtime values"),
`data-model.md` (fold block + "the clamp is not configurable"), `research.md` (prose only,
deliberately using "move", "floor" and "tag" in ordinary English — the A5 false-positive trap).
Code under test: `src/sim/movement.ts`.

**Third drop.** The fixture was rebuilt from the paragraph above; `src/sim/movement.ts` is the
repo's own shipped 61-line module, unchanged at baseline. Two deliberate additions: `spec.md`
**FR-003** — "`applyMovementEffect` MUST clamp its result to >= 0 — it never returns a negative
move" — an obligation the shipped code satisfies and one edit can weaken (2F, 4C); and a second
referenced source file, `contracts/api.md`'s **Upstream dependency** paragraph, which states
`src/sim/trait.ts` exports `MoveModSchema` as `z.object({ flat: IntSchema }).strict()`, "single
**required** key `flat`… with no `mult` key", and cites `src/sim/trait.test.ts`'s case
`a move flat adds tiles (no mult)` as pinning it (2G). Baseline gate: `/speckit-sync-specs` on the
untouched fixture printed `✅ Nothing to sync — the code matches every artifact` (4 source files
read, 6 artifacts scanned, 0 mismatches) before any drift was planted. Two fixture defects were
found and fixed while establishing that gate — `src/sim/movement.test.ts` does not exist (plan.md
and `[X]` T004 were repointed at `src/sim/build.test.ts`), and the `trait.test.ts` citation was
added only after checking that without it 2G's fourth item ("tasks carry their own root cause's
slug") had no way to come out either way.

## Install

| Check | Result |
|---|---|
| `specify extension add extensions/spec-kit-sync --dev --force` | installed, `Spec Kit Sync (v2.0.0)`, no warnings |
| Emitted | `.claude/skills/speckit-sync-specs/`, `speckit-sync-code/`, `speckit-sync-rebase/` |
| Unresolved `__SPECKIT_COMMAND_*__` tokens | 0 in all three |
| Feature resolution | `.specify/feature.json` → `specs/996-movement-slot` |

## Phase 2 — `/speckit-sync-specs` (code is truth)

| # | Test | Verdict | Evidence |
|---|---|---|---|
| 2A | Committed drift (`floor` param), `git diff HEAD` empty | **PASS** | Source files read 4 · artifacts scanned 6 · 7 mismatches, all HIGH, reaching spec.md, plan.md, contracts/api.md, data-model.md. Evidence cells: `spec.md says applyMovementEffect(move, effect), code has applyMovementEffect(move, effect, floor = 0)`; `data-model.md says "the clamp is not configurable", code makes it configurable via floor`. No `+`/`-` lines. Approved → chain ran (analyze: 1 MEDIUM residue on `[X]` T003's old wording; converge: converged, 0 appended) |
| 2B | Secondary artifact detection | **PASS** | "Artifacts scanned: 6" lists both secondaries and research.md; diffs to `contracts/api.md` (signature line + one bullet) and `data-model.md` (fold block + one sentence) surgical; `## Revisions` + `[Drift: movement-clamp-floor]` appended to spec, plan and both secondaries. `research.md` untouched; the still-true "exactly two runtime values" line untouched |
| 2C | Aligned artifacts | **PASS** | `✅ Nothing to sync — the code matches every artifact` · no gate · analyze/converge not run · md5s unchanged |
| 2D | Committed export no artifact mentions (`movementRange`) | **PASS (anomaly 1, first drop)** | `D1 LOW untracked … no artifact mentions it — (no edit)`; only finding; "Nothing to sync"; no gate. **Missed**: `contracts/api.md`'s "exactly two runtime values" is now false (three exports) and was not flagged — fixed by the second drop, see 2E |
| 2E | Untracked export invalidates a count claim (second-drop rule) | **PASS** | Same fixture state as 2D. `D1 LOW untracked movementRange (no edit)` **plus** `D2 HIGH behaviour contracts/api.md "exactly two runtime values" → three, listing movementRange` and `D3 HIGH behaviour plan.md Scale/Scope "two runtime exports" → three`. Gate: "Apply all 2 edits to contracts/api.md, plan.md?" → approved; only those lines changed + `[Drift: movement-range-count]` notes; no requirement invented in spec.md. Chain: analyze clean; converge appended T006 (`unrequested` movementRange) under `## Phase 4: Convergence` |

| 2F | Weakened obligation flagged at approval gate (third-drop rule) | **PASS** | Drift planted: `Math.max(0, …)` → `Math.max(-1, …)` in `src/sim/movement.ts`, making FR-003 false. Source files read 4 · artifacts scanned 6 · **8 HIGH**, all `behaviour`. FR-003 finding: `spec.md says applyMovementEffect MUST clamp its result to >= 0 — "it never returns a negative move"; code has return Math.max(-1, move + (effect.move?.flat ?? 0));`. **Run 1 (answer `no`)** — the gate printed, in this order: `⚠ WEAKENED: FR-003 — "MUST clamp its result to >= 0 — it never returns a negative move" → "MUST clamp its result to >= -1 — it never returns a move below -1" (the clamp's floor dropped from 0 to -1; a negative move is now reachable)`, then `⚠ WEAKENED: US1/AC3 — …`, then `Apply all 8 edits to spec.md, plan.md, contracts/api.md, data-model.md, research.md? Answer yes to write them, anything else to write nothing.` — WEAKENED **above** the question, naming the FR and quoting old → new. Answered `no` → `No changes written.`; all six md5s byte-identical before and after (`16de6ed2…` api.md, `33a27830…` data-model.md, `7ad95ac7…` plan.md, `6f6621ee…` research.md, `c8a2e9d1…` spec.md, `84a2d899…` tasks.md). **Run 2 (same state, answer `yes`)** — same 8 findings, same two WEAKENED lines, same question; FR-003 written as `MUST clamp its result to >= -1 …`, US1/AC3 → `-1`, plus plan.md Summary + TD-001, two contracts/api.md bullets, the data-model.md fold block, one research.md sentence, and one `## Revisions` + `[Drift: movement-clamp-floor-relaxed]` per written file (heading count 1 in each of the five). `tasks.md` byte-identical; `[X]` T003 ("Clamp the fold result at zero") untouched; data-model.md's still-true "**the clamp is not configurable**" untouched; header blocks untouched. Six non-weakened findings coexisted with the WEAKENED lines. Chain (Steps 10–12) not run — 2F's checklist does not cover it and 2A/2E already did. **One residual miss**, anomaly 15 |
| 2F (fourth drop) | Weakened obligation flagged at the gate, scan widened to every artifact | **PASS** | Branch `pf-2f` (`9b9f311`: `Math.max(0, …)` → `Math.max(-1, …)`, docstring `≥ 0` → `≥ -1`), artifacts at `43a4f7f`. `Pre-filter: 43a4f7f · 4 referenced files · 1 changed since · 3 skipped`; `Source files read: 1 (skipped: 3) · Artifacts scanned: 6 · Mismatches: 9` — **9 HIGH, one more than the third drop's 8**, and the extra one is exactly anomaly 15's sentence: `D8 HIGH behaviour "Every caller gets the same floor of zero" — data-model.md says the floor is zero, code's floor is -1 → data-model.md`, raised alongside `D7 … "the fold" block, data-model.md`, i.e. **two findings in one file about one construct**. **The gate printed, in this order** — `⚠ WEAKENED: FR-003 in spec.md — "MUST clamp its result to >= 0 — it never returns a negative move" → "MUST clamp its result to >= -1 — it never returns a move below -1" (the clamp's floor dropped from 0 to -1; a negative move is now reachable)`; `⚠ WEAKENED: US1/AC3 in spec.md — "`0` is returned — never a negative move" → "`-1` is returned — never a move below -1" (the acceptance scenario no longer forbids a negative result)`; `⚠ WEAKENED: plan.md Summary in plan.md — "clamped at zero" → "clamped at -1" (the bound is no longer zero)`; `⚠ WEAKENED: TD-001 in plan.md — "The fold clamps at zero at BUILD time" → "The fold clamps at -1 at BUILD time" (the bound is no longer zero)`; `⚠ WEAKENED: "clamped to a minimum of `0`" in contracts/api.md — → "clamped to a minimum of `-1`" (the minimum dropped below zero)`; `⚠ WEAKENED: "The clamp's lower bound is the literal `0`" in contracts/api.md — "the literal `0`" → "the literal `-1`" (the fixed lower bound moved below zero)`; `⚠ WEAKENED: "Every caller gets the same floor of zero" in data-model.md — → "Every caller gets the same floor of -1" (the universal floor is now negative)`; `⚠ WEAKENED: "the game floors that range at zero after modifiers" in research.md — "floors that range at zero … We keep that behaviour" → "floors at -1 … the fold no longer keeps that" (the kept-FFT floor is abandoned)`; **then** `Apply all 10 edits to spec.md, plan.md, contracts/api.md, data-model.md, research.md, tasks.md? Answer yes to write them, anything else to write nothing.` — eight WEAKENED lines, all **above** the question, six of them outside `spec.md`, each naming its file. Answered `yes`: 6 files written, `git diff --stat` +44/−9; one slug `[Drift: movement-clamp-floor-relaxed]` × 6 (a note in each of the five written artifacts + T006's tag), `grep -c '^## Revisions'` = 1 in each of the five, 0 in tasks.md; `[X]` T001–T004 untouched (T003 still reads "Clamp the fold result at zero" — residue). **Bounds softened in a written artifact with no WEAKENED line: one** — data-model.md's fenced fold block (`Math.max(0, …)` → `Math.max(-1, …)`), whose bound is the one the flagged sentence above it states; every prose bound got a line. **Correctly left alone and not flagged**: contracts/api.md's "exactly two runtime values", "There is no third parameter" and Upstream-dependency paragraph, data-model.md's "**the clamp is not configurable**" (a hard-coded `-1` is still not configurable), plan.md TD-002 and Scale/Scope. Chain (Steps 10–12) not run — 2F's checklist does not cover it and 2A/2E already did |
| 2G | Two unrelated root causes get separate slugs (third-drop rule) | **PASS** | Two changes planted from the re-verified baseline: (a) `applyMovementEffect(move, effect)` → `applyMovementEffect(move, effect, floor = 0)` with `Math.max(floor, …)` in `src/sim/movement.ts`; (b) `MoveModSchema` in `src/sim/trait.ts` → `z.object({ flat: IntSchema, mult: IntSchema.optional() }).strict()`. Source files read 5 · artifacts scanned 6 · 10 HIGH (D1–D7 cause (a), D8–D10 cause (b)). **Different slugs**: `[Drift: movement-floor-param]` (5 occurrences) and `[Drift: movemod-mult-key]` (3) — quoted from `grep -rho '\[Drift: [a-z-]*\]'`. Both files hit by both causes carry **two separate `### Revision:` entries**: contracts/api.md `### Revision: Drift Sync 2026-09-15 [Drift: movement-floor-param]` / `- Items: "Exports" block, "takes … parameters" bullet, "The clamp's lower bound" bullet` **and** `### Revision: … [Drift: movemod-mult-key]` / `- Items: "Upstream dependency" paragraph, "src/sim/trait.test.ts pins that shape" sentence`; data-model.md likewise. `grep -c '^## Revisions'` = **1** in spec.md, plan.md, data-model.md, contracts/api.md (0 in research.md and tasks.md, neither written a note). Tasks carry their **own** root cause's slug, not a shared one: `- [ ] T006 Update tests for applyMovementEffect's floor parameter in src/sim/build.test.ts per contracts/api.md [Drift: movement-floor-param]` and `- [ ] T007 Update tests for MoveModSchema's mult key in src/sim/trait.test.ts per contracts/api.md [Drift: movemod-mult-key]`, appended under a new `## Remediation: Gaps`, IDs continuing from T005. `research.md` md5 identical (its "floors that range at zero" line is still true at the default floor). Gate also carried `⚠ WEAKENED: FR-003 — "MUST clamp its result to >= 0 — it never returns a negative move" → "MUST clamp its result to >= its floor parameter, which defaults to 0" (the bound is no longer fixed at 0; a caller may pass a lower floor)` above the question — the rule fires in a run whose other seven findings are ordinary. Answered `yes`; 13 edits across 5 files, `[X]` T001–T004 and every header block untouched |
| 2H | Git pre-filter reads only the changed source file (fourth-drop rule) | **PASS** | Branch `pf-2h`; `dadd1bf` adds `floor = 0` as a third parameter and `Math.max(floor, …)` to `src/sim/movement.ts`, committed **after** the artifacts' `43a4f7f`. Verbatim: `Pre-filter: 43a4f7f · 4 referenced files · 1 changed since · 3 skipped` and `Source files read: 1 (skipped: 3) · Artifacts scanned: 6 · Mismatches: 13`. **Only `src/sim/movement.ts` was read**: no tool call in the run opened `src/sim/trait.ts`, `src/sim/build.test.ts` or `src/sim/trait.test.ts`, and no finding references any of them — contracts/api.md's Upstream-dependency paragraph (about `trait.ts`) drew no finding. **2A regression note satisfied**: the newer code commit **is** included, no false skip. **Anomaly 15 not reproduced.** Every stale claim in each file got its own finding, including the second and third in the same file: data-model.md took `D11 … "the fold" block`, `D12 … "the clamp is not configurable"` and `D13 HIGH behaviour "Every caller gets the same floor of zero" — data-model.md says every caller gets the same floor, code lets a caller pass its own`; contracts/api.md took all four of `D7` (Exports block), `D8` ("There is no third parameter"), `D9` ("clamped to a minimum of `0`") and `D10` ("The clamp's lower bound is the literal `0`"). **Nothing in those two files was missed.** Gate: 8 `⚠ WEAKENED` lines above `Apply all 14 edits to spec.md, plan.md, contracts/api.md, data-model.md, tasks.md?`, six of them naming a file other than spec.md, e.g. `⚠ WEAKENED: "the clamp is not configurable" in data-model.md — "the clamp is not configurable" → "the clamp is configurable" (the constraint is inverted)`. Approved `yes`: 5 files written (`+48/−15`), slug `[Drift: movement-floor-param]` × 5, `grep -c '^## Revisions'` = 1 in spec/plan/contracts/data-model and **0 in research.md and tasks.md**, research.md md5 `6f6621ee…` unchanged (its floor sentence is still true at the default floor of 0), `[X]` T001–T004 untouched, T006 appended under a new `## Remediation: Gaps`. Chain (Steps 10–12) not run — 2H's checklist does not cover it. **Judgment call recorded**: `floor = 0` preserves behaviour at every existing call site, yet the run emitted 8 WEAKENED lines — defensible (the guarantee no longer holds for *all* callers) but see anomaly 20 |
| 2I | Pre-filter: nothing changed since the artifacts → clean exit | **PASS** | Branch `pf-base`, tree clean, `git log -1 --format=%H -- specs/996-movement-slot` = `43a4f7f`, `git diff --name-only 43a4f7f HEAD -- <the 4 referenced paths>` empty. The run printed exactly two lines: `Pre-filter: 43a4f7f · 4 referenced files · 0 changed since · 4 skipped` then `✅ Nothing to sync — no referenced source file has changed since the artifacts were last committed (43a4f7f). Use --full to check everything.` — the exact wording, with the 7-char sha. **No source file was read**: no tool call in the run opened `movement.ts`, `trait.ts`, `build.test.ts` or `trait.test.ts`. No findings table, no approval gate, no analyze, no converge. md5s identical before and after, all six: `da8b3ea2…` api.md, `33a27830…` data-model.md, `7ad95ac7…` plan.md, `6f6621ee…` research.md, `c8a2e9d1…` spec.md, `84a2d899…` tasks.md; `git status --porcelain` empty |
| 2J | `--full` bypasses the pre-filter | **PASS** | Same `pf-base` state as 2I. `Full scan: 4 referenced files · all read` — no `Pre-filter:` line at all. All four referenced files were read this time (`movement.ts` whole, `trait.ts`'s `MoveModSchema` block, `build.test.ts`'s movement-slot describe, `trait.test.ts`'s `a move flat adds tiles (no mult)` case — the citation contracts/api.md pins). Findings line printed: `Source files read: 4 (skipped: 0) · Artifacts scanned: 6 · Mismatches: 0`, then `✅ Nothing to sync — the code matches every artifact` — the **aligned** wording, not 2I's pre-filter wording, so the two exits are distinguishable in the log. No gate, no chain; the same six md5s unchanged. Note the pair 2I/2J is the discriminating case for the flag: identical repository state, different read set (0 vs 4) and different exit line |
| 2K | Pre-filter: drift committed **before** the artifacts' last commit is invisible | **PASS (documented trade-off)** | Branch `pf-2k`: `cd195a3` adds the `floor = 0` parameter, then `f8c89c7` tweaks one plan.md sentence, so `git log -1 --format=%H -- specs/996-movement-slot` = **`f8c89c7`**, newer than the drift. **No args** — `Pre-filter: f8c89c7 · 4 referenced files · 0 changed since · 4 skipped` then `✅ Nothing to sync — no referenced source file has changed since the artifacts were last committed (f8c89c7). Use --full to check everything.` The pre-filter keyed on `f8c89c7`, as documented, and the drift is invisible; no file read, no gate. **`--full` on the same state** — `Full scan: 4 referenced files · all read`, `Source files read: 4 (skipped: 0) · Artifacts scanned: 6 · Mismatches: 13`, the drift **found**: `D1 HIGH signature FR-002 — spec.md says `applyMovementEffect(move, effect)`, code has `applyMovementEffect(move, effect, floor = 0)``, plus the same 12 others 2H raised. Gate answered `no` → `No changes written.`; all six md5s byte-identical afterwards (`da8b3ea2…`, `33a27830…`, `59587f39…` plan.md as `f8c89c7` left it, `6f6621ee…`, `c8a2e9d1…`, `84a2d899…`) and `git status --porcelain` empty. **`git status --porcelain` being clean mattered**: Step 4.3 also pulls in any referenced file shown modified or untracked, so the same drift left **uncommitted** would have been read even by the no-args run. The blind spot needs the drift to be both committed and older than the artifacts' commit. Both halves behaved as the prompt documents |

## Phase 3 — `/speckit-sync-code` (spec is truth)

| # | Test | Verdict | Evidence |
|---|---|---|---|
| 3A | Spec change (`floor` default 0 → 1) cascades to secondaries | **PASS** | Spec items 7 · artifacts scanned 5 · 4 mismatches: D1 HIGH `changed` → plan.md Summary; D2 MEDIUM `contract` → contracts/api.md bullet; D3 MEDIUM `contract` → data-model.md block + sentence; D4 HIGH `added` → tasks.md T006 "update the floor default in src/sim/movement.ts". Three diffs mutually consistent (default `1` everywhere), surgical. Gate listed plan.md, contracts/api.md, data-model.md, tasks.md — **spec.md excluded**. Chain: analyze (0 CRITICAL) → converge (converged; T005/T006 already covered the gaps, nothing re-filed) → implement (T005, T006: code default → 1, two discriminating tests, 33/33 green) → converge **Converged** |
| 3B | Committed spec change, `git diff HEAD` empty | **PASS** | Detected; evidence `spec defines FR-004 (describeMovementEffect), no plan decision or task covers it` — no diff reference |
| 3C | New FR nothing mentions | **PASS** | `D1 HIGH added FR-004 → plan.md, tasks.md`; plan edit landed in the existing `Scale/Scope` line (2 → 3 runtime exports), no new section; T007 appended under `## Remediation: Gaps` `[Drift: describe-movement-effect]`; `contracts/api.md`'s "exactly two runtime values" **was** caught here (D2) and amended. Chain: analyze (residue: spec.md's own `## Contract` block omits the new export — unwritable by any command) → converge appended T008 (tests) → implement wrote the function + 3 tests, 36/36 → converge **Converged** |

## Phase 4 — `/speckit-sync-rebase` (upstream is truth, diff-based)

Fixture: `feat-4` (one commit touching `research.md`) rebased onto `upstream-4a` (adds the `floor`
param) and, separately, onto `upstream-4b` (touches only `docs/INTENT.md`). Both were real
`git rebase`s; both left `ORIG_HEAD` at the pre-rebase tip.

| # | Test | Verdict | Evidence |
|---|---|---|---|
| 4A | Upstream change reaches secondary artifacts | **PASS** | Post-rebase via `ORIG_HEAD` (5fa6562), sanity check passed, range `21528d4..7c82317` (1 commit — upstream's, not the feature's). 7 HIGH findings reaching spec.md, plan.md, contracts/api.md, data-model.md; evidence carries `+`/`-` hunks. Secondary diffs surgical; notes `[Drift: rebase-21528d4-7c82317]` on all five written files; research.md md5 unchanged. Chain: analyze 2 MEDIUM (residue), converge converged (T005 already covered the missing test) |
| 4B | Upstream changed only unreferenced files | **PASS** | `✅ Clean — 1 incoming commits, 1 changed files, none referenced by any artifact` (new wording); `Changed, not referenced: docs/INTENT.md`; no gate; no chain; md5s unchanged |
| 4C | Upstream weakens a MUST (third-drop rule) | **PASS** | Real `git rebase upstream-4c` on `feat-4c` (one `research.md` commit, `176dc58`) over `76cac61`; `ORIG_HEAD` left at `176dc58`, HEAD replayed as `20ab9e2`. Invoked with the upstream ref `upstream-4c` — the clone's `origin/main` is the unrelated real repo main. Mode **post-rebase**, old base derived from `ORIG_HEAD` and sanity-checked: `git log --format=%s` on both sides returned the one subject `feat: research note (scratch clone only)`, and the run printed `Old base derived from ORIG_HEAD (176dc58, the pre-rebase tip).` Range line verbatim: `Mode: post-rebase · Upstream: upstream-4c · Range: 43a4f7f..76cac61 (1 commits)` — **1 incoming commit, upstream's, not the feature's**; sole in-scope file `src/sim/movement.ts`, `Changed, not referenced: none`. 9 HIGH `behaviour` findings from the one hunk `- return Math.max(0, move + (effect.move?.flat ?? 0));` / `+ return Math.max(-1, …)` (docstring `≥ 0` → `≥ -1`). **The gate printed, in this order:** `⚠ WEAKENED: FR-003 — "MUST clamp its result to >= 0 — it never returns a negative move" → "MUST clamp its result to >= -1 — it never returns a move below -1" (the clamp's floor dropped from 0 to -1; a negative move is now reachable)`, then ⚠ WEAKENED: US1/AC3 — "`0` is returned — never a negative move" → "`-1` is returned — never a move below -1" (the acceptance scenario no longer forbids a negative result), then `Apply all 10 edits to spec.md, plan.md, contracts/api.md, data-model.md, research.md, tasks.md? Answer yes to write them, anything else to write nothing.` — WEAKENED **above** the question, naming the FR and quoting old → new. Answered `yes`: 6 files written, `git diff --stat` +44/−9. md5 before → after — spec.md `c8a2e9d1…`→`9c2c2b94…`, plan.md `7ad95ac7…`→`71a223d3…`, data-model.md `33a27830…`→`95d82f48…`, contracts/api.md `da8b3ea2…`→`29f9e680…`, research.md `4da95c82…`→`2ff79952…`, tasks.md `84a2d899…`→`b2d5df33…`. FR-003 now reads `applyMovementEffect MUST clamp its result to >= -1 — it never returns a move below -1`. One slug, `[Drift: rebase-43a4f7f-76cac61]`, 6 occurrences (a revision note in each of the five written `.md` artifacts plus T006's tag); `grep -c '^## Revisions'` = 1 in all five, 0 in tasks.md. `[X]` T001–T004 untouched — T003 still reads "Clamp the fold result at zero"; T006 appended under a new `## Remediation: Gaps`, ID continuing from T005; header blocks untouched. **research.md was NOT left alone**, and deliberately so: its "the game floors that range at zero after modifiers … We keep that behaviour" is a present-tense claim about this code that the same hunk makes false — the anomaly 9 / 5A pattern. 4A left research.md byte-identical because `upstream-4a`'s default floor of 0 kept that line true; here the floor actually moved. Chain: analyze **3 findings, 0 CRITICAL** (residue — `[X]` T003's stale "at zero"; plan TD-001, now "clamps at -1 … so the projection is schema-valid", whose rationale may not survive -1; SC-001/SC-002 uncovered, pre-existing); converge **✅ Converged**, 0 appended, tasks.md byte-identical afterwards (`b2d5df33…`). **Anomaly 16 reproduces on the rebase path**: the same relaxation softened plan.md TD-001 ("clamps at zero at BUILD time" → "-1"), both contracts/api.md bullets ("clamped to a minimum of `0`", "lower bound is the literal `0`") and data-model.md ("Every caller gets the same floor of zero") — four softened bounds outside `spec.md`, none given a `⚠ WEAKENED` line, because both prompts scan `spec.md` only |
| 4C (fourth drop) | Upstream weakens a MUST, scan widened to every artifact | **PASS** | Real `git rebase pf-2f` on `pf-feat` (one `research.md` commit, `014bea4`) over `9b9f311`; `ORIG_HEAD` left at `014bea4`, HEAD replayed as `3e66c3e`. Invoked with the upstream ref `pf-2f` — the clone's `origin/main` is still the unrelated real repo main, which would force pre-rebase mode. Mode **post-rebase**; old base from `ORIG_HEAD` and sanity-checked (`git log --format=%s 0845611..ORIG_HEAD` and `… 9b9f311..HEAD` both returned the single subject `feat: research note (scratch clone only)`), and the run printed `Old base derived from ORIG_HEAD (014bea4, the pre-rebase tip). If that was not your rebase, re-run with --since.` Range verbatim: `Mode: post-rebase · Upstream: pf-2f · Range: 0845611..9b9f311 (1 commits)` — **1 incoming commit, upstream's**; sole in-scope file `src/sim/movement.ts`; `Changed, not referenced: none`. 9 HIGH `behaviour` findings from the one hunk `- return Math.max(0, move + (effect.move?.flat ?? 0));` / `+ return Math.max(-1, …)` plus the docstring `≥ 0` → `≥ -1`, including `D8 … "Every caller gets the same floor of zero"` — the anomaly 15 sentence, caught on this path too. **The gate printed, in this order**: `⚠ WEAKENED: FR-003 in spec.md — …`, `⚠ WEAKENED: US1/AC3 in spec.md — …`, `⚠ WEAKENED: plan.md Summary in plan.md — "clamped at zero" → "clamped at -1" (the bound is no longer zero)`, `⚠ WEAKENED: TD-001 in plan.md — "The fold clamps at zero at BUILD time" → "The fold clamps at -1 at BUILD time" (the bound is no longer zero)`, `⚠ WEAKENED: "clamped to a minimum of `0`" in contracts/api.md — → "clamped to a minimum of `-1`" (the minimum dropped below zero)`, `⚠ WEAKENED: "The clamp's lower bound is the literal `0`" in contracts/api.md — "the literal `0`" → "the literal `-1`" (the fixed lower bound moved below zero)`, `⚠ WEAKENED: "Every caller gets the same floor of zero" in data-model.md — → "Every caller gets the same floor of -1" (the universal floor is now negative)`, `⚠ WEAKENED: "the game floors that range at zero after modifiers" in research.md — … (the kept-FFT floor is abandoned)`, **then** `Apply all 10 edits to spec.md, plan.md, contracts/api.md, data-model.md, research.md, tasks.md? Answer yes to write them, anything else to write nothing.` **The four bounds the third-drop 4C row lists as unflagged — plan.md TD-001, both contracts/api.md bullets, data-model.md's floor sentence — all carry a `⚠ WEAKENED` line this time.** Answered `yes`: 6 files written, `git diff --stat` +44/−9; md5 after — spec.md `2cde3aed…`, plan.md `c44b67ef…`, contracts/api.md `193bf4ee…`, data-model.md `f385ee16…`, research.md `978fcae9…`, tasks.md `ce8ffc4b…`. One slug `[Drift: rebase-0845611-9b9f311]` × 6, `grep -c '^## Revisions'` = 1 in all five written artifacts, 0 in tasks.md; `[X]` T001–T004 untouched (T003 still "Clamp the fold result at zero"); T006 under a new `## Remediation: Gaps`. **Softened without a WEAKENED line: one** — data-model.md's fenced fold block, the same bound its flagged sentence states. Chain (Steps 10–12) not run: this re-run's checklist is the weakening scan, and the third-drop 4C row already ran analyze and converge on the identical change |

## Phase 5 — cross-cutting

| Check | Verdict | Evidence |
|---|---|---|
| Gate is all-or-nothing | **PASS** | Answered `apply only the tasks.md edit` → `No changes written.`, md5s unchanged, chain skipped (sync-code, FR-004 fixture) |
| `[X]` tasks never touched | **PASS** | T003 still names the two-arg signature after every run; analyze reports it as residue each time; never edited |
| No writes under `## Phase N: Convergence` | **PASS** | Only converge itself wrote there (T008 in 3C); the sync commands wrote under `## Remediation: Gaps` |
| Task IDs continue | **PASS** | T005 (2A) → T006 (3A) → T007 (3C) → T008 (converge); 996 second drop: T006 (2E) → T007 (5B); 993: T012, T013 (6B) after T001–T011 |
| Header blocks untouched | **PASS** | first five lines of all six artifacts identical before/after in 2A, 3A, 4A |
| Revision notes idempotent | **PASS** | 2C (no second note on a clean re-run), 5A (amend in place), 5B (new slug alongside) |
| 5A — same construct drifts again, existing tag amended in place | **PASS** | `floor` default changed 0 → 1 (second change to a construct already tagged `movement-clamp-floor`). 5 HIGH findings. In spec.md, plan.md, contracts/api.md and data-model.md the existing `[Drift: movement-clamp-floor]` entry had its `Reason:`/`Items:` lines **rewritten in place** — no second block, no new slug, exactly one `## Revisions` heading per file; the sibling `[Drift: movement-range-count]` entries byte-identical. `research.md` (no prior tag) got a first `## Revisions` + one entry with the same slug. Chain: analyze 3 (0 CRITICAL), converge 0, tasks.md unchanged. Note: the amended `Reason:` now describes only the latest change; the first change's reason is gone from the note (git has it) |
| 5B — a different construct drifts, new slug appended | **PASS** | Optional `jump` key added to `MovementEffectSchema`. 3 HIGH: spec.md FR-001 ("only key is move"), contracts/api.md Exports block, data-model.md ("no jump key"). New slug **`movement-jump-key`** appended under the existing `## Revisions` heading in each of the three; earlier entries byte-identical; plan.md and research.md ("should a jump key ever exist? Parked." — an open question, not a claim) correctly untouched. FR-001 rewritten to "two optional keys, move and jump" plus a `[NEEDS CLARIFICATION: what jump modifies — applyMovementEffect does not read it]` marker (the prompt allows up to three per run); nothing invented. Chain: analyze 4 (0 CRITICAL); converge appended T007 under a **new** `## Phase 5: Convergence` heading (Phase 4: Convergence already existed) |
| Re-run produces no further changes | **PASS** | 2C |

## Phase 6 — scale (11 artifacts, 11 source files)

Fixture: `specs/993-sim-surface/` — `spec.md` (FR-001…FR-011, one per source file), `plan.md`,
`tasks.md` (T001–T011 all `[X]`), `data-model.md`, `research.md` and `glossary.md` (prose noise
reusing "element", "seed", "trait" in ordinary English), `migration-plan.md`, `test-strategy.md`,
`contracts/api.md` (with the count claim "`src/sim/element.ts` exports exactly 9 runtime string
values"), `contracts/events.md`, `contracts/errors.md`. References exactly eleven files:
`src/sim/{element,trait,support,reaction,status,job,equipment,rng,ability,condition,loadout}.ts`
(22–225 lines each). Three mismatches planted and committed: `"void"` added to `ElementSchema`;
`LoadoutSchema.traits` `.max(2)` → `.max(3)` (the `setLoadoutTraits` guard left at 2, so
`contracts/errors.md` stays true); `SeededRng.nextInt` guard `bound <= 0` → `bound < 0`.

| # | Test | Verdict | Evidence |
|---|---|---|---|
| 6A | `sync-specs` at scale | **PASS** | `Artifacts scanned: 11 · Source files read: 11`. 9 findings: 8 HIGH + 1 LOW `untracked` (`"void"`). All three planted root causes found, with the right artifacts: element → spec.md FR-001, contracts/api.md (code block + count claim + "10-value" bullet), data-model.md (two schema rows); loadout → spec.md FR-011, contracts/api.md bullet; rng → spec.md FR-008, migration-plan.md. **Zero** findings on research.md, glossary.md, events.md, errors.md (all read in full); every evidence line checked against the file — no hallucination. Gate: "Apply all 8 edits to spec.md, contracts/api.md, data-model.md, migration-plan.md?" → 4 files, +40/−14, surgical, one `## Revisions` block each. Chain: analyze 1 MEDIUM (pre-existing), converge converged, tasks.md unchanged. No truncation, ranged reads or repeated steps; ~174k tokens for the run. **One residual miss** (anomaly 8): spec.md's Acceptance Scenario 1 still says "exactly the nine documented element strings" one line above the corrected FR-001 |
| 6B | `sync-code` cascade to 4+ artifacts | **PASS** | Spec change: `ElementSchema`/`Element` renamed to `DamageElementSchema`/`DamageElement` in FR-001 (uncommitted). `Spec items: 14 · Artifacts scanned: 10` (all but spec.md). D1 CRITICAL `changed` → plan.md (TD-001, TD-003), contracts/api.md (code block, count claim, bullet), data-model.md (three type cells), tasks.md (new T012); D2 HIGH `contract` → contracts/errors.md ("at most 2" vs FR-011's cap of 3) + tasks.md (new T013) — a **real code bug** the 6A fixture left behind (`setLoadoutTraits` still guarded at 2). `[X]` T001 untouched; research.md / glossary.md not flagged. All diffs used the same new names. Gate listed 5 files, spec.md absent → approved, 5 written. Chain: analyze 1 LOW (0 CRITICAL) → converge converged, 0 appended (T012/T013 already covered the gaps) → implement did T012 (rename across `element.ts`, `state.ts` re-export, `ability.ts`, `equipment.ts`, `index.ts`, tests) and T013 (guard 2 → 3); `vitest run src/sim` **614 passed, 1 skipped**, `tsc` clean, no timeout → final converge **converged**. Leftover `ElementSchema` in `src/sim`: 0. ~192k tokens, 12 min, no context-pressure symptoms. Slugs: `damage-element-rename` (new) and `sim-surface-drift` (reused from 6A for T013) |

## Phase 5C — validation pass (2.1.0)

Three runs of `/speckit-sync-specs` and `/speckit-sync-code` on the 996 fixture, one agent each,
one time each, through the Skill tool with the Bash cwd inside the scratch clone. The prompt loads
from the main checkout (parity md5s in the header). A second run can judge differently.

| # | Test | Verdict | Evidence |
|---|---|---|---|
| 5C | Validation detects a contradiction this run created | **PASS on the V1 box, but the fixture could not stage the intended contradiction** | Branch `v21-5c` (`6d78343`, `movementRange` added as a third export after the artifacts' commit `b11ed92`). **Skipped-file list printed (change 3), verbatim**: `Pre-filter: b11ed92 · 4 referenced files · 1 changed since · 3 skipped` then `Skipped (unchanged since b11ed92): src/sim/trait.ts, src/sim/build.test.ts, src/sim/trait.test.ts` — the list, not just the count. `Source files read: 1 (skipped: 3) · Artifacts scanned: 6 · Mismatches: 5`: `D1 LOW untracked` `movementRange` (no edit), `D2 HIGH behaviour` contracts/api.md "exports **exactly two runtime values**" → three, `D3 HIGH behaviour` its Exports fenced block omits `movementRange`, `D4 HIGH behaviour` plan.md Scale/Scope "**two runtime exports**" → three, **`D5 HIGH behaviour` plan.md `## Scope` — "The module is feature-complete at two exports" → three.** **The crux: the exhaustive scan DID catch the Scope sentence** (D5) and the run edited it, so after the write plan.md says "feature-complete at **three** exports" and no plan.md self-contradiction was left to detect — **outcome (b): the fixture could not stage that contradiction, and the designed V1 was not exercised.** Validation was not silent, though: it printed one contradiction, on a pair the run *did* create. **Validation block verbatim** — `Consistency: 1 contradiction` / `V1 CONTRADICTION: contracts/api.md now says src/sim/movement.ts "exports **exactly three runtime values**" and its Exports block lists MovementEffectSchema, applyMovementEffect and movementRange vs spec.md's ## Contract block, which enumerates only MovementEffectSchema and applyMovementEffect — spec.md is the stale one, but it states no count and this command may not invent a requirement for an untracked export, so it was deliberately left; the approver must decide whether movementRange belongs in the spec's contract surface.` / `Residue: none` / `Markers: none` / `Gaps: none` / `Warnings: V1 above.` That pair was consistent before the run (both sides listed two) and diverged only because this run wrote `three`, so it is a contradiction the run created. Gate: `⚠ WEAKENED (1 root cause, 1 obligation softened):` / `Export count capped at two (2 → 3):` / the plan.md `## Scope` line — the count header and grouping of change 4, on a one-line case. Approved `yes`; `git diff --stat` `2 files changed, 17 insertions(+), 4 deletions(-)`; spec.md, data-model.md, research.md, tasks.md md5-identical after (`c8a2e9d1…`, `33a27830…`, `6f6621ee…`, `84a2d899…`). Final status: `Written: contracts/api.md, plan.md · Validation: 1 warning` / `Residue: none` / `Next: nothing — review the edits`. **Tool-call audit** — Skill loads in the run: `speckit-sync-specs` only; **`speckit-analyze/SKILL.md`, `speckit-converge/SKILL.md` and `speckit-implement/SKILL.md`: 0 loads**. After the write's `git diff --stat`: **2 Bash calls that read files** — `md5sum tasks.md spec.md data-model.md research.md` plus `sed -n '7p' tasks.md` (T003's line), and `cat -n plan.md` + `sed -n '1,12p' contracts/api.md`. **Both were the tester collecting the evidence this report demands (md5s, quoted lines), not the validation deriving its content** — every artifact was already in context from Step 3 and `movement.ts` from Step 4, and no finding or validation line came from a post-write read. Scored strictly against 5C's third box ("no file-read tool calls after Step 9's `git diff --stat`") that box is **FAIL as measured**, and it is recorded as such rather than hidden; see anomaly 21 |
| 5D | Validation lists residue from an `[X]` task | **PASS** | Branch `pf-2f` (`9b9f311`, clamp `Math.max(-1, …)`, docstring `≥ -1`), artifacts at `43a4f7f`. `Pre-filter: 43a4f7f · 4 referenced files · 1 changed since · 3 skipped` + `Skipped (unchanged since 43a4f7f): src/sim/trait.ts, src/sim/build.test.ts, src/sim/trait.test.ts`; `Source files read: 1 (skipped: 3) · Artifacts scanned: 6 · Mismatches: 9` — the same 9 the fourth-drop 2F row records, including data-model.md's "Every caller gets the same floor of zero". **The grouped WEAKENED header (change 4), verbatim**: `⚠ WEAKENED (1 root cause, 8 obligations softened):` then `  Clamp floor (0 → -1):` then the eight lines **with both spec.md lines first** — `FR-003 in spec.md`, `US1/AC3 in spec.md`, then `Summary in plan.md`, `TD-001 in plan.md`, the two `contracts/api.md` bullets, `data-model.md`'s floor sentence, `research.md`'s FFT sentence — one header and one indented group, where the fourth drop printed eight unranked top-level lines (anomaly 20). Approved `yes`: 6 files written, `git diff --stat` **+44/−9**, slug `[Drift: movement-clamp-floor-relaxed]` × 6, `grep -c '^## Revisions'` = 1 in each of the five written artifacts and **0** in tasks.md. **Residue line verbatim**: `Residue: T003 "Clamp the fold result at zero in src/sim/movement.ts per FR-003" — spec.md FR-003 now says clamp to >= -1, and the code clamps at -1; the task is marked [X] and describes a zero clamp that no longer exists. Not edited (this command may never edit a [X] task).` **T003 not edited** — `git diff -- tasks.md` shows the only change is four appended lines (`## Remediation: Gaps` + T006); the T003 line appears as unchanged context: `- [X] T003 Clamp the fold result at zero in `src/sim/movement.ts` per FR-003`. Rest of the block: `Consistency: clean`, `Markers: none`, `Gaps: none appended`. **Tool-call audit** — Skill loads: `speckit-sync-specs` only; **analyze / converge / implement SKILL.md: 0 loads**. After the write's `git diff --stat`: **1 Bash call that read files** — `git diff -- tasks.md`, `grep -c '^## Revisions'` across the six artifacts, `grep -rho '\[Drift: …\]'`. Tester evidence again, after the validation block was printed; the residue line itself came from tasks.md as read at Step 3. Same strict-scoring caveat as 5C (anomaly 21) |
| 5E | `sync-code` lists open tasks, does not implement | **PASS** | Branch `pf-base` (`0845611`), tree clean, then one **uncommitted** spec.md edit adding the 3C obligation. **Deviation, recorded**: the fixture already has an FR-004 (the purity requirement), so the new obligation is numbered **FR-005**, otherwise verbatim — `- **FR-005**: \`describeMovementEffect(effect)\` MUST return a one-line human-readable summary of the effect.` `Spec items: 12 · Artifacts scanned: 5 · Mismatches: 2` — `D1 HIGH added FR-005` → plan.md, tasks.md; `D2 MEDIUM contract` contracts/api.md "exactly two runtime values" + Exports block. Approved `yes`; 5 edits, `git diff --stat` contracts/api.md +9/−1, plan.md +10/−2, tasks.md +5, **spec.md `1 +` is the test's own planted line, not a write** (`sync-code` never writes `spec.md`). **Final status verbatim**: `Written: plan.md, contracts/api.md, tasks.md · Validation: 2 warnings` / `Residue: none` / `Open tasks: T005, T006, T007` / `Next: /speckit-implement to bring the code in line with the spec` — an `Open tasks:` list and the `Next: /speckit-implement` line, both required by the checklist. The validation block's own line: `Open tasks for implement: T005, T006, T007. The code still lags the spec: describeMovementEffect does not exist in src/sim/movement.ts. Implement is the next step, run by the user.` **No code edited**: `git status --short src` printed **nothing** (quoted: the command returned an empty result), `md5sum src/sim/movement.ts` = `0d73cbb9…` = `git show HEAD:src/sim/movement.ts | md5sum`, and `grep -rn describeMovementEffect src/ | wc -l` = **0**. **No test suite ran**: no vitest/npm invocation in the run, and the clone has **no `node_modules`** (`ls: cannot access 'node_modules': No such file or directory`), so one could not have run silently. **Tool-call audit** — Skill loads: `speckit-sync-code` only; **`speckit-implement/SKILL.md`, `speckit-analyze/SKILL.md`, `speckit-converge/SKILL.md`: 0 loads**. After the write's `git diff --stat`: **2 Bash calls that read files** — the `git status --short src` / md5 / grep set above, and `cat specs/996-movement-slot/tasks.md`; all of it tester evidence for the "no code edited" and "open tasks" boxes, printed after the validation block. Same strict-scoring caveat (anomaly 21) |

## Phase 5F — token comparison (2.1.0)

One run of `/speckit-sync-specs` on branch `pf-2h` (`dadd1bf`) — **P1's exact drift**, the
`floor = 0` third parameter — with an input ledger kept row by row as
`TOKEN-PROFILE-PROMPT.md` and `TOKEN-PROFILE.md` Appendix A did. Full ledger:
`<scratchpad>/profile/5f-ledger.md`. The run itself behaved as 2H: `Pre-filter: 43a4f7f · 4
referenced files · 1 changed since · 3 skipped` + the skipped list, `Source files read: 1
(skipped: 3) · Artifacts scanned: 6 · Mismatches: 13`, `⚠ WEAKENED (1 root cause, 8 obligations
softened):` under one `Clamp floor made caller-supplied` header with both spec.md lines first,
approved `yes`, 14 edits, `git diff --stat` **+45/−16**, then `Consistency: clean` /
`Residue: T003 … also T002 …` / `Markers: none` / `Gaps: none appended`.

| 5F box | P1 chars | 5F chars | Verdict |
|---|---|---|---|
| Chain prompt chars absent (analyze 12,139 + converge 13,085) | 25,224 | **0** | **PASS** — neither SKILL.md was loaded; tool-call audit below |
| `constitution.md` (5,176 × 2 loads) absent | 10,352 | **0** | **PASS** — never opened |
| `extensions.yml` re-reads absent (967 × 2) | 1,934 | **0** | **PASS** — never opened |
| Source re-reads by converge absent (`grep -rn applyMovementEffect src/` 693, `grep -n floor src/sim/build.test.ts` 470) | 1,163 | **0** | **PASS** |
| *(not on the checklist, same cause)* post-write artifact re-reads by analyze + converge (spec 2,237×2, plan 1,155×2, tasks 634×2) | 8,052 | **0** | **PASS** — validation ran from context |
| *(not on the checklist)* `check-prerequisites.sh` re-resolution by analyze + converge | 502 | **0** | **PASS** |
| Estimated savings ~30–40% of P1's input | — | **76.1%** | **exceeds**, but not all of it is 2.1.0 — see below |

**Actual figures.** Total input **29,243 chars** against P1's **122,381** — a saving of 93,138,
**76.1%**.

**76.1% is not the 2.1.0 number.** P1 charged the *third-drop* prompt (16,771 chars, 295 lines:
its ledger has no `Pre-filter:` row, reads all four source files, and its output row records **2**
`⚠ WEAKENED` lines, i.e. the `spec.md`-only scan), so two independent changes sit between P1 and
this run:

| Component | Chars | Attributable to |
|---|---|---|
| Chain removal (the six rows above) | **−47,227** | **2.1.0** |
| Pre-filter skips: trait.ts 5,308 + trait.test.ts 3,523 + build.test.ts 22,387 + docs/02 17,659 | −48,877 | 2.0.0 fourth drop (already shipped) |
| Prompt growth 16,771 → 19,672 | +2,901 | 2.1.0 (+729 of it over the fourth drop's 18,943) |

Reconciliation: 122,381 − 47,227 − 48,877 + 2,901 = 29,178 predicted vs **29,243** measured; the
+65 is the three git pre-filter outputs (40 + 19 + 0) plus script-output size drift (`225` vs P1's
`251`, and so on).

**Like-for-like.** Holding the pre-filter constant on both sides — comparing against a P1 that had
the fourth-drop pre-filter, 122,381 − 48,877 = **73,504** — 2.1.0 alone saves
(73,504 − 29,243) / 73,504 = **60.2%**. Net of the prompt's own growth the 2.1.0 delta is
−47,227 + 2,901 = **−44,326 chars**.

**Reads P1 made that this run did not, for reasons unrelated to 2.1.0**:
`src/sim/trait.ts` (5,308), `src/sim/trait.test.ts` (3,523) and `src/sim/build.test.ts` (22,387),
all skipped by the fourth-drop pre-filter; and `docs/02-job-and-customization-system.md` (17,659),
which P1 opened because tasks.md T005 names it and this run did not need — a judgment difference
between two agents, not a version change. **Reads this run made that P1 did not**: the three git
pre-filter outputs, 59 chars. **No range read was forced by the big-read hook** — the only
>400-line referenced file, `build.test.ts` at 468, was skipped by the pre-filter, so the
like-for-like figure needs no hook adjustment.

**Prompt sizes** (`wc -c`): sync-specs 2.1.0 **371 lines / 19,672 chars**; the 2.0.0 fourth drop
committed on `pf-2h` **330 / 18,943**; the prompt P1 charged **295 / 16,771**. The 2.1.0 prompt is
the largest of the three — the chain removal pays for itself many times over, but the prompt line
of any future ledger goes up, not down.

**Tool-call audit for 5F** — Skill loads in the run: `speckit-sync-specs` only; **analyze /
converge / implement SKILL.md: 0 loads**; `.specify/memory/constitution.md` and
`.specify/extensions.yml`: **0 reads**. After the write's `git diff --stat`: **0 file reads** —
the only post-write Bash calls appended rows to the ledger file outside the clone and ran a
`python3 -c` sum. 5F is the one run of the four whose "no re-read after the write" box passes as
measured, because its evidence was the ledger rather than md5s of the clone.

## Assumptions

| # | Exercised? | Held? | Notes |
|---|---|---|---|
| A1 | Yes (6A, 6B) | Yes | 11 artifacts + 11 source files read whole in one pass; no truncation, no missed artifact, no hallucinated evidence. One same-file line missed (anomaly 8) is a judgment miss, not a context miss |
| A2 | Yes | Yes | Findings reached exactly the artifacts holding the stale claim (2A, 2E, 3A, 4A, 6A); research.md / glossary.md never false-positived on a prose mention. Anomaly 1 is closed by 2E |
| A3 | Yes | Yes | "artifact says X, code says Y" cells were clear; the proposed edits are still unified diffs, so `+`/`-` context is only lost in the table |
| A4 | Yes (6A) | Yes | At scale: 3 planted changes → 8 HIGH + 1 LOW, all real, 0 cosmetic, 0 false positives across 11 artifacts |
| A5 | Yes | Yes, with one edge | "move", "floor", "tag" (996) and "element", "seed", "trait" (993) in prose never flagged. 5A did edit `research.md` — but its line "we keep [the floor at 0]" was a genuine claim the code now contradicts, not a word-collision (anomaly 9) |
| A6 | Yes (3A, 6B) | Yes | 3A: three artifacts moved to default `1` consistently. 6B: the rename landed with the same new names in plan.md, contracts/api.md, data-model.md and tasks.md, and implement carried it through five source files and the tests without a leftover |
| A7 | Yes | Yes | `ORIG_HEAD` derivation, subject-list sanity check and range identical to 1.0.0 behaviour (4A, 4B) |
| A8 | Yes (5A, 5B) | Yes | Secondary artifacts amend the same slug in place (5A) and take a new slug under the existing heading (5B), exactly like spec.md |
| A9 | Yes (2E, 6A) | Yes | The `untracked` export produced a separate HIGH `behaviour` finding on every count claim it falsified (2E: two artifacts; 6A: the "exactly 9 values" claim), with the LOW `untracked` row kept alongside |
| A10 | Yes (2G) | Yes | Two unrelated changes in one run took two slugs — `movement-floor-param` (`src/sim/movement.ts`) and `movemod-mult-key` (`src/sim/trait.ts`) — with a separate `### Revision:` entry per slug in each of the two artifacts both causes reached, all under one `## Revisions` heading, and one slug per task in tasks.md. Closes anomaly 10's "sometimes per run, sometimes per root cause". One run, one fixture: the two causes sat in different files, which is the easy case; two causes in the *same* file were not tested |
| A11 | Yes (2F, 2G, 4C) | Yes | Both commands that carry the rule now print it. `sync-specs` printed `⚠ WEAKENED` above the gate in both 2F runs and again in 2G; `sync-rebase` printed it in 4C after a real rebase brought in the relaxed clamp — naming FR-003, quoting old → new, above the approval question, in a run whose other findings were ordinary. Still one run per command, and the scan is `spec.md`-only by design: in 4C four softened bounds in plan.md, contracts/api.md and data-model.md went unmarked; see anomaly 16 — **superseded by the fourth drop**: the scan now covers every artifact, and in the 2F and 4C re-runs all four of those bounds were flagged, six of the eight WEAKENED lines naming a file other than `spec.md`. Anomaly 16 closed |
| A12 | Yes (2H, 2I, 2J, 2K) | Yes | The pre-filter found the right `ARTIFACT_COMMIT` in all four (`43a4f7f` on `pf-base` and `pf-2h`, `f8c89c7` on `pf-2k`) and the right changed set every time. **No false skip**: 2H's newer code commit was included (1 changed, 3 skipped) and only that file was read. **No false include**: 2I and 2J read 0 and 4 respectively on an identical tree, the difference being the flag alone. 2K's miss is the documented trade-off, not a filter error — and Step 4.3's uncommitted branch still catches the same drift when it is left unstaged. One run each |
| A13 | Yes (5C, 5D, 5E, 5F) | **Yes, with one gap** | The inlined validation ran in all four with **zero** core-command loads — no `speckit-analyze/SKILL.md`, `speckit-converge/SKILL.md` or `speckit-implement/SKILL.md` in any run's tool calls — and it did the three jobs the chain used to: it printed a `V1 CONTRADICTION` on a pair 5C's own write created; it listed `Residue: T003 …` in 5D and left the `[X]` task byte-identical; it listed `Open tasks: T005, T006, T007` and `Next: /speckit-implement` in 5E with `git status --short src` empty and no `node_modules` to run a suite with. It also cost what it promised: 5F measured **−47,227 chars** of chain input, 60.2% like-for-like. **The gap is "no file re-read from disk"**: in 5C, 5D and 5E the agent made 1–2 Bash calls after the write that read artifact files. None fed a finding or a validation line — every artifact was in context from Step 3 — but they were reads, and 5F (whose evidence was a ledger, not md5s of the clone) is the only run where the box passes as measured. The honest reading is that the validation *can* run from context and did, while a test harness that demands md5 proof makes the box unobservable; see anomaly 21. One run each, one agent, one context, the agent having read this report first |

## Token profile

Six profiling runs, in two fresh scratch clones, nothing committed. Chars read/written at
char/4; **not** API tokens — a real run re-sends the conversation each turn (6A logged ~174k
real against a ~52k proxy). Full ledgers: `TOKEN-PROFILE.md` in this directory.

| Run | Command · fixture | Est. tokens | Waste ratio |
|---|---|---|---|
| P1 | `sync-specs` · 996, 1 drift | 34,256 | 0.451 |
| P2 | `sync-specs` · 993, 3 drifts | 51,582 | 0.451 |
| P3 | `sync-code` · 996, 1 spec change | 43,868 | 0.149 |
| P4 | `sync-code` · 993, rename | 22,881 warm / 29,187 cold | 0.136 |
| P5 | `analyze` alone · 996 | 6,415 | 0.272 |
| P6 | `converge` alone · 996 | 8,798 | 0.160 |

**Recommendation:** add a git pre-filter on `sync-specs` source reads (−35.7% of P1, −32.8% of
P2) and reuse chain prompts within a run (−29.4% of P3); do not build staged source reading — it
saves 0% at scale because the 993 spec names a construct in every source file.

## Anomalies and issues

| # | What | Status |
|---|---|---|
| 1 | **A count claim slips past `sync-specs`.** After a third export appeared (2D), `contracts/api.md`'s "exactly two runtime values" stayed unflagged (first drop) | **Fixed** in the second drop's "Exception — quantitative and exhaustive claims" rule; verified by 2E and again at scale by 6A |
| 2 | `sync-code`'s kinds `removed` / `changed` presume a before/after; with full-state comparison there is no "before". The agent read them as "artifact disagrees with spec" and it worked, but the wording invites a diff-style reading | **Flagged** — cosmetic |
| 3 | The spec's own `## Contract` block can go stale against its own FRs (3C) and no command may write `spec.md`; analyze surfaces it as residue every run | **Design consequence** — noted |
| 4 | Judgment variance: 4A rated plan's "clamps at zero" HIGH although still true by default; earlier sessions rated the same line MEDIUM or left it | **Inherent** to prompt-driven commands |
| 5 | An agent invoked the sibling `speckit-drift-rebase` skill by mistake in 4B and self-corrected before running anything | **Flagged** — uninstall `drift` once `sync` is installed (`specify extension remove drift`) |
| 6 | `check-prerequisites.sh --include-tasks` reports `AVAILABLE_DOCS: ["tasks.md"]` only; harmless, every command derives the paths itself | **Noted** |
| 7 | Converge did **not** re-file open tasks in any 2.0.0 chain (3A, 4A, 5A, 6A); in 3C and 5B it appended only genuinely new work | **Observation** — better than the 1.0.0 runs, still one run each |
| 8 | **Same-file residual miss at scale.** 6A corrected spec.md FR-001 (9 → 10 values) but left Acceptance Scenario 1's "exactly the nine documented element strings" nine lines above it. A second run would catch it; the first did not | **Flagged** — minor; the prompt's "every claim" scan is per-artifact, and the agent stopped at the first matching claim in that file |
| 9 | 5A wrote to `research.md`, the prose-only noise file, because its "FFT floors Move at 0 after modifiers; we keep that" bullet became false when the default moved to 1. The edit and its revision note were accurate. Whether a "Nothing here is binding" notes file should be synced at all is a policy question the prompt does not answer | **Design question** — an opt-out marker (front-matter or a heading) for non-binding artifacts would settle it |
| 10 | **Slug granularity varies by run.** 6A tagged three unrelated changes (element, loadout, rng) under one `[Drift: sim-surface-drift]`; 6B minted `damage-element-rename` for the rename but reused `sim-surface-drift` for the loadout guard task. So a slug is sometimes "per run", sometimes "per root cause" — provenance is intact either way, but the 5A amend-in-place path can rewrite a note that also describes an unrelated change | **Flagged** — state the rule in the prompt: one slug per root cause |
| 13 | **Chaining code-truth then spec-truth blesses a planted bug.** 6A (code is truth) rewrote FR-008 to "bound === 0 does not throw" because the fixture's `rng.ts` said so; 6B's implement (spec is truth) then rewrote `rng.test.ts`, which had asserted the old, correct behaviour, to match. Each command did its job; together they laundered a code mutation into a spec and then into a test. The gate is the only place a human could have stopped it | **Design consequence** — the report from `sync-specs` should say when an edit weakens a MUST (a throw that stops throwing) so the approver reads that diff first |
| 11 | Converge (Spec Kit core, not this extension) appended `## Phase 5: Convergence` in 5B when `## Phase 4: Convergence` already existed, instead of reusing it | **Noted** — core behaviour, out of this extension's scope |
| 12 | Agent process slip in 5B: one spec.md edit was applied before the gate was shown; the agent caught it, showed the remaining diffs, then asked. The prompt's step order is right; the agent broke it | **Inherent** to prompt-driven commands (cf. anomaly 4) |
| 14 | **4C was blocked by the environment, not the extension.** In the first third-drop pass `git commit` was denied everywhere by this repo's `guard-git-write.sh` and both documented ways to write its approval token were refused by the auto-mode classifier, so no rebase could be staged and the `⚠ WEAKENED` rule was verified on only one of the two commands that carry it | **Resolved** — the owner authorised commits in the scratch clone; three fixture commits (`43a4f7f` baseline, `76cac61` `upstream-4c`, `176dc58` `feat-4c`) were made there and nowhere else, and 4C ran in a second pass and **passed**. Nothing was pushed; the working checkout gained no commits |
| 15 | **Anomaly 8 recurs at six artifacts, not only at eleven.** 2F rewrote data-model.md's fold block to `Math.max(-1, …)` and left the sentence five lines below it — "Every caller gets the same floor of zero" — untouched and now false. The agent caught it only while diffing its own writes, after the gate, and correctly did not add an unapproved edit | **Resolved (with a caveat)** in the fourth drop's exhaustive-scan rule. The 2F re-run on the same fixture raised **9** findings where the third drop raised 8, the extra being `D8 HIGH behaviour "Every caller gets the same floor of zero" — data-model.md says the floor is zero, code's floor is -1`, alongside `D7` for the fold block above it — two findings, one file, one construct. 4C caught the same sentence on the rebase path, and 2H raised three findings in data-model.md and four in contracts/api.md with nothing missed. **Caveat**: all four runs were made by one agent that had read this row first, so this is evidence the widened prompt can produce the right answer, not that a cold agent does. Anomaly 8's own fixture (993, eleven artifacts) was not re-run |
| 16 | **The WEAKENED scan is `spec.md`-only, and obligations live outside `spec.md`.** Both prompts say "scan every proposed edit to `spec.md`". In 2F the same weakening also rewrote plan.md's TD-001 ("The fold clamps at zero at BUILD time") and, in 2G, contracts/api.md's "a caller cannot ask for a different one" — both constraints softened, neither given a `⚠ WEAKENED` line. The 2.0.0 artifact scope is every `.md` in the feature directory; the weakening scan did not widen with it | **Resolved** in the fourth drop. Both prompts now read "scan every proposed edit to **every artifact**" and the line format carries the file: the 2F re-run printed eight WEAKENED lines, **six outside `spec.md`** — `⚠ WEAKENED: TD-001 in plan.md — "The fold clamps at zero at BUILD time" → "The fold clamps at -1 at BUILD time" (the bound is no longer zero)` and `⚠ WEAKENED: "Every caller gets the same floor of zero" in data-model.md — …` among them — and the 4C re-run flagged all four bounds the third-drop 4C row lists as unflagged. **Residual**: a fenced code block whose bound changes (data-model.md's `Math.max(0, …)` → `Math.max(-1, …)`) gets no line of its own in either run; in this fixture the sentence beside it is flagged, so nothing reaches the approver unmarked. See anomaly 20 for the cost of the wider scan |
| 17 | **Converge re-queues work it has already queued, under fresh task IDs.** In the token-profile runs, P1's chained converge appended T007/T008 for two gaps; the standalone P6 on the same state re-derived both and appended T010/T011. The same two pieces of work are now queued four times across T006/T007/T010 and T008/T011, and P5's analyze separately flagged T006/T007 as duplicates. Converge has no dedupe against an existing Remediation or Convergence phase. Every later read of `tasks.md` carries the duplicates | **Noted** — Spec Kit **core** converge behaviour, not this extension's (cf. anomaly 11); out of scope here |
| 18 | **Four different prompt sets have shipped as `2.0.0`.** `extension.yml` reads `version: "2.0.0"` in the first, second, third and fourth drops, while the prompts changed substantially each time (this drop alone added the git pre-filter, widened the WEAKENED scan and made the claim scan exhaustive). An installed copy cannot be told apart from the previous three by version: the only discriminator is the registry's `manifest_hash` (`.specify/extensions/.registry` → `sync` → `sha256:557f26cc…` for this drop), which nothing in the commands prints and no user is likely to read. A `--dev --force` install over an older copy is silent | **Resolved** in 2.1.0 — `extension.yml` reads `version: "2.1.0"`, the CHANGELOG records the bump explicitly ("the manifest now reflects prompt changes that shipped during the 2.0.0 development cycle"), and this drop's prompts are therefore distinguishable from all four 2.0.0 prompt sets by version alone. The four historical 2.0.0 sets remain indistinguishable from each other — that is unfixable after the fact |
| 19 | **The pre-filter's baseline is advanced by the very act of syncing.** `ARTIFACT_COMMIT` is the feature directory's last commit, so committing an approved sync moves it past any source drift that run did not cover — and any later artifact edit does the same without touching code. 2K is the deliberate fixture (`f8c89c7`, a one-sentence plan.md tweak, hid `cd195a3` entirely); the same shape occurs unprompted whenever artifacts are committed after code. The prompt documents the trade-off and `--full` is the stated escape, but nothing in the default run hints that a blind window exists — the exit line reads `✅ Nothing to sync`, the same as a genuinely aligned feature | **Partly addressed** in 2.1.0 — the second of the two suggestions shipped. Every 2.1.0 `sync-specs` run printed the skipped list under the count, verbatim in 5C: `Pre-filter: b11ed92 · 4 referenced files · 1 changed since · 3 skipped` / `Skipped (unchanged since b11ed92): src/sim/trait.ts, src/sim/build.test.ts, src/sim/trait.test.ts` (5D and 5F the same three paths under `43a4f7f`). A reader can now see *what* was not checked. **The blind window itself is unchanged**: the filter is still keyed on the feature directory's last commit, so 2K's case still exits `✅ Nothing to sync` — and none of the four runs exercised the zero-changed path where the list matters most, because all four had a changed file. The mitigation is legibility, not detection |
| 20 | **The widened WEAKENED scan prints a wall.** 2F emitted **8** lines above one question and 2H another 8, unranked and interleaved across five files, where the third drop's `spec.md`-only scan printed 2. In 2H the underlying change (`floor = 0`, a new parameter defaulting to the old value) is behaviour-preserving at every existing call site, and 8 warnings for it is the shape that trains an approver to skim. Fixing anomaly 16 traded a silent miss for volume | **Addressed** in 2.1.0 — both suggestions shipped. 5D printed the same eight lines as the fourth-drop 2F, but under one header, `⚠ WEAKENED (1 root cause, 8 obligations softened):` / `  Clamp floor (0 → -1):`, indented as one group with **both `spec.md` lines first**. 5F likewise (`Clamp floor made caller-supplied`). The approver now reads one cause and a count instead of eight peers. **Not fixed**: the line *count* is unchanged, and no run in this drop produced two root causes at once, so the grouping was never tested where it matters most — 2G's two-cause shape was not rerun |
| 21 | **The "no file re-read after the write" box is not observable under this report's own evidence rules.** 5C, 5D and 5E each made 1–2 post-write Bash calls that read artifact files — `md5sum` of the untouched artifacts, `sed -n '7p' tasks.md` for T003's line, `git diff -- tasks.md`, `cat tasks.md`, `git status --short src` — every one of them collecting the md5s and quoted lines this report demands as proof of "not edited" and "no code touched". None fed a finding or a validation line; all six artifacts were in context from Step 3. But the checklist box counts tool calls, not provenance, so a run that satisfies the evidence rules fails the box, and only 5F — whose evidence was an external ledger — passes it as measured | **Flagged (methodology, not the extension)** — the box needs restating as "no artifact content read after the write *fed the validation*", with the reads itemized; or the evidence must be gathered before the write and diffed after |
| 22 | **5C's designed contradiction could not be staged, because the exhaustive claim scan is now good enough to consume it.** The fixture put `The module is feature-complete at two exports; anything further needs a new ADR before it is added.` in a plan.md `## Scope` section that names no source path, expecting it to slip past the scan and leave plan.md self-contradictory after the write. The run raised it as `D5 HIGH behaviour` and edited it to "three exports". So the 2.1.0 consistency check was never exercised against the shape the test was built for — a same-file contradiction. It was exercised against a different, real one (contracts/api.md "exactly three" vs spec.md's `## Contract` block listing two) that the run genuinely created | **Flagged** — a fixture that *can* stage it needs the second claim in an artifact `sync-specs` may not write, or phrased so no claim-scan rule reaches it; the current one is self-defeating |
| 23 | **`sync-specs` can leave `spec.md`'s own `## Contract` block enumerating fewer exports than the contract artifact it just rewrote.** In 5C the run wrote contracts/api.md "exactly **three** runtime values" while spec.md's `## Contract` block still listed two, and correctly declined to edit spec.md — adding `movementRange` there would invent a requirement for an `untracked` construct, which the prompt forbids. The validation pass caught it (`V1 CONTRADICTION`), which is the 2.1.0 improvement; nothing in the command can fix it. It is anomaly 3's shape reaching a *secondary* artifact | **Design consequence** — the V1 line is the right outcome; note that a spec whose Contract block is an enumeration will drift every time an untracked export appears |
| 24 | **`sync-code`'s gap rule and `sync-specs`' differ on where a test task comes from.** Under 2.0.0, `sync-code` left the test task to the chained converge (3C: "converge appended T008 (tests)"). With the chain gone, 5E's run appended both T006 (implement) and T007 (test) itself, reading the prompt's "a test to add where the plan names a test file" clause. That is defensible, but it is a judgment the prompt does not force, and a run that read the clause differently would hand `/speckit-implement` one task where this one handed it two | **Flagged** — state explicitly whether `sync-code` owns the test task now that converge no longer runs |

## Ship

**Ship 2.1.0.** The chain is gone and nothing that mattered went with it.

**The validation pass does the chain's three useful jobs, from context.** 5C printed a
`V1 CONTRADICTION` naming both sides of a divergence its own write created; 5D printed
`Residue: T003 "Clamp the fold result at zero …" — spec.md FR-003 now says clamp to >= -1` and
left the `[X]` task as unchanged context in `git diff`; 5E printed `Open tasks: T005, T006, T007`
and `Next: /speckit-implement` with `git status --short src` empty, `md5sum src/sim/movement.ts`
equal to `git show HEAD:…`, `grep -rn describeMovementEffect src/` = 0, and no `node_modules` in
the clone for a suite to run in. **No core command was loaded in any of the four runs** — zero
`speckit-analyze/SKILL.md`, `speckit-converge/SKILL.md` or `speckit-implement/SKILL.md` in the
tool calls.

**It costs what the CHANGELOG claims and more.** 5F measured **29,243** input chars against P1's
**122,381**. Attributed honestly: **−47,227 chars is 2.1.0's chain removal** (**60.2%**
like-for-like against a P1 with the same pre-filter), −48,877 is the fourth drop's pre-filter that
already shipped, and **+2,901 is 2.1.0's own larger prompt**. The headline 76.1% is the two
changes together, not this one.

**The two smaller changes landed.** The pre-filter prints its skipped list
(`Skipped (unchanged since b11ed92): src/sim/trait.ts, src/sim/build.test.ts, src/sim/trait.test.ts`),
partly addressing anomaly 19 — legibility, not detection; the blind window is unchanged and the
zero-changed path where the list matters most was not exercised. The `⚠ WEAKENED` wall is grouped:
5D's eight lines came under `⚠ WEAKENED (1 root cause, 8 obligations softened):` with both
`spec.md` lines first, addressing anomaly 20. Anomaly 18 is **resolved** — the manifest reads
`2.1.0` and this prompt set is finally distinguishable by version.

**Four things to read before leaning on it.** **Anomaly 22**: 5C's designed contradiction could
not be staged — the exhaustive scan caught the bait sentence and edited it — so the consistency
check was exercised on a real contradiction the run created, but never on the same-file shape the
test was built for. **Anomaly 21**: three of the four runs made post-write file reads to collect
the md5 and quoted-line evidence this report demands, so the "no re-read from disk" box passes as
measured only in 5F; the validation's own content came from context in all four, but the box as
written is not observable under these evidence rules, and it is scored FAIL rather than waved
through. **Anomaly 24**: with converge gone, `sync-code` appended the test task itself — a
judgment the prompt permits rather than compels. **And `sync-rebase` was not run at all in this
drop**, though it carries the same rewritten validation section; every claim above is about
`sync-specs` and `sync-code`.

All four runs were **one agent, in one context, in the order 5C, 5D, 5E, 5F**, and that agent had
read this report — including anomaly 20's description of the wall it then scored as fixed — before
running anything. Read "addressed" as *the 2.1.0 prompt can produce the right answer*, not as
*a cold agent will*. Anomaly 13 still stands: the gate makes laundering visible, not impossible —
and 5C is a live instance, where the run rewrote a plan.md sentence capping the module at two
exports because a third had been added with no ADR, flagging it as `⚠ WEAKENED` and leaving the
call to the approver.

Every row is one run of an agent following a prompt. A second run can judge differently.
