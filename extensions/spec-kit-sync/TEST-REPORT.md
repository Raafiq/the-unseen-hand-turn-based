# spec-kit-sync 2.0.0 — test report

**Spec Kit**: 1.0.6 · **Extension**: `sync` 2.0.0 (directory `spec-kit-sync`, from the supplied
zip; **third drop** adds two rules — the `⚠ WEAKENED` line above the approval gate in
`sync-specs` and `sync-rebase`, and one revision slug per **root cause** rather than per run —
and tests 2F, 2G, 4C) · **Date**: 2026-09-15 · **Prompt**: `TEST-PROMPT.md` in this directory

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
| 2G | Two unrelated root causes get separate slugs (third-drop rule) | **PASS** | Two changes planted from the re-verified baseline: (a) `applyMovementEffect(move, effect)` → `applyMovementEffect(move, effect, floor = 0)` with `Math.max(floor, …)` in `src/sim/movement.ts`; (b) `MoveModSchema` in `src/sim/trait.ts` → `z.object({ flat: IntSchema, mult: IntSchema.optional() }).strict()`. Source files read 5 · artifacts scanned 6 · 10 HIGH (D1–D7 cause (a), D8–D10 cause (b)). **Different slugs**: `[Drift: movement-floor-param]` (5 occurrences) and `[Drift: movemod-mult-key]` (3) — quoted from `grep -rho '\[Drift: [a-z-]*\]'`. Both files hit by both causes carry **two separate `### Revision:` entries**: contracts/api.md `### Revision: Drift Sync 2026-09-15 [Drift: movement-floor-param]` / `- Items: "Exports" block, "takes … parameters" bullet, "The clamp's lower bound" bullet` **and** `### Revision: … [Drift: movemod-mult-key]` / `- Items: "Upstream dependency" paragraph, "src/sim/trait.test.ts pins that shape" sentence`; data-model.md likewise. `grep -c '^## Revisions'` = **1** in spec.md, plan.md, data-model.md, contracts/api.md (0 in research.md and tasks.md, neither written a note). Tasks carry their **own** root cause's slug, not a shared one: `- [ ] T006 Update tests for applyMovementEffect's floor parameter in src/sim/build.test.ts per contracts/api.md [Drift: movement-floor-param]` and `- [ ] T007 Update tests for MoveModSchema's mult key in src/sim/trait.test.ts per contracts/api.md [Drift: movemod-mult-key]`, appended under a new `## Remediation: Gaps`, IDs continuing from T005. `research.md` md5 identical (its "floors that range at zero" line is still true at the default floor). Gate also carried `⚠ WEAKENED: FR-003 — "MUST clamp its result to >= 0 — it never returns a negative move" → "MUST clamp its result to >= its floor parameter, which defaults to 0" (the bound is no longer fixed at 0; a caller may pass a lower floor)` above the question — the rule fires in a run whose other seven findings are ordinary. Answered `yes`; 13 edits across 5 files, `[X]` T001–T004 and every header block untouched |

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
| A11 | Yes (2F, 2G, 4C) | Yes | Both commands that carry the rule now print it. `sync-specs` printed `⚠ WEAKENED` above the gate in both 2F runs and again in 2G; `sync-rebase` printed it in 4C after a real rebase brought in the relaxed clamp — naming FR-003, quoting old → new, above the approval question, in a run whose other findings were ordinary. Still one run per command, and the scan is `spec.md`-only by design: in 4C four softened bounds in plan.md, contracts/api.md and data-model.md went unmarked; see anomaly 16 |

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
| 15 | **Anomaly 8 recurs at six artifacts, not only at eleven.** 2F rewrote data-model.md's fold block to `Math.max(-1, …)` and left the sentence five lines below it — "Every caller gets the same floor of zero" — untouched and now false. The agent caught it only while diffing its own writes, after the gate, and correctly did not add an unapproved edit | **Flagged** — the per-artifact "every claim" scan stops at the first matching claim in a file, exactly as anomaly 8 described. Not scale-dependent |
| 16 | **The WEAKENED scan is `spec.md`-only, and obligations live outside `spec.md`.** Both prompts say "scan every proposed edit to `spec.md`". In 2F the same weakening also rewrote plan.md's TD-001 ("The fold clamps at zero at BUILD time") and, in 2G, contracts/api.md's "a caller cannot ask for a different one" — both constraints softened, neither given a `⚠ WEAKENED` line. The 2.0.0 artifact scope is every `.md` in the feature directory; the weakening scan did not widen with it | **Flagged** — decide whether the scan should cover every written artifact, or say in the prompt that it deliberately does not |

## Ship

**Ship.** Both third-drop rules are verified on every command that carries them. The
`⚠ WEAKENED` line lands above the approval question, names the FR and quotes the old and new
obligation, on `sync-specs` (2F, 2G) and now on `sync-rebase` (4C) — in 4C after a real rebase
brought in a commit relaxing the clamp, with the range derived post-rebase from `ORIG_HEAD`,
sanity-checked, and printed as `43a4f7f..76cac61 (1 commits)`. A `no` still writes nothing (2F,
six md5s byte-identical). Two unrelated root causes take two slugs, two revision entries per
affected artifact under one `## Revisions` heading, and one slug per task — closing anomaly 10.
Anomaly 14 is closed: 4C ran once the owner authorised three fixture commits in a scratch clone.

Three things to read before leaning on it. **Anomaly 16 is now confirmed on both paths**: the
weakening scan covers `spec.md` only, while 2.0.0 writes every artifact — in 4C the same
relaxation softened plan.md's TD-001, two `contracts/api.md` bullets and data-model.md's floor
sentence, and none of the four got a `⚠ WEAKENED` line, so a MUST softened outside `spec.md`
reaches the approver unmarked. **Anomaly 15** — a second stale claim in a file the run already
edited still gets missed, and a `[X]` task the command may not edit (T003, "Clamp the fold result
at zero") is left contradicting the rewritten FR; analyze reports it as residue every time, which
is the only safety net. **Anomaly 9 is not settled**: 4C wrote to `research.md`, the file headed
"Nothing here is binding", because one of its sentences was a present-tense claim about the code.
The edit was accurate; whether a notes file should be synced at all is still a policy the prompt
does not state. Anomaly 13 stays the reason the gate matters: the third drop makes the laundering
visible, it does not prevent it.

Every row is one run of an agent following a prompt. A second run can judge differently.
