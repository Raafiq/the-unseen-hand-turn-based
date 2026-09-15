# spec-kit-sync 2.0.0 — test report

**Spec Kit**: 1.0.6 · **Extension**: `sync` 2.0.0 (directory `spec-kit-sync`, from the supplied
zip) · **Date**: 2026-09-14 · **Prompt**: `TEST-PROMPT.md` in this directory
**Where**: every run in a scratch clone of this repo under the session scratchpad, never in the
working checkout. Full-state detection needs committed state, so seven fixture commits were made
**in the clone only** with the owner's go-ahead (baseline with secondary artifacts, the 2A drift,
the 2D export, the 3B spec change, one feature commit and two "upstream" commits for Phase 4);
nothing was pushed. The 1.0.0 report is kept as `TEST-REPORT-1.0.0.md`.

**Read this first.** The three commands are agent prompts. Every row is **one run** of an agent
following the prompt through the Skill tool; a second run can differ in its judgment calls.
Nothing here is a guarantee.

## Fixture

`specs/996-movement-slot/` with six artifacts: `spec.md`, `plan.md`, `tasks.md`,
`contracts/api.md` (signature block + behaviour bullets + "exactly two runtime values"),
`data-model.md` (fold block + "the clamp is not configurable"), `research.md` (prose only,
deliberately using "move", "floor" and "tag" in ordinary English — the A5 false-positive trap).
Code under test: `src/sim/movement.ts`.

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
| 2D | Committed export no artifact mentions (`movementRange`) | **PASS (anomaly 1)** | `D1 LOW untracked … no artifact mentions it — (no edit)`; only finding; "Nothing to sync"; no gate. **Missed**: `contracts/api.md`'s "exactly two runtime values" is now false (three exports) and was not flagged |

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

## Phase 5 — cross-cutting

| Check | Verdict | Evidence |
|---|---|---|
| Gate is all-or-nothing | **PASS** | Answered `apply only the tasks.md edit` → `No changes written.`, md5s unchanged, chain skipped (sync-code, FR-004 fixture) |
| `[X]` tasks never touched | **PASS** | T003 still names the two-arg signature after every run; analyze reports it as residue each time; never edited |
| No writes under `## Phase N: Convergence` | **PASS** | Only converge itself wrote there (T008 in 3C); the sync commands wrote under `## Remediation: Gaps` |
| Task IDs continue | **PASS** | T005 (2A) → T006 (3A) → T007 (3C) → T008 (converge) |
| Header blocks untouched | **PASS** | first five lines of all six artifacts identical before/after in 2A, 3A, 4A |
| Revision notes idempotent | **PARTIAL** | Re-runs report "Nothing to sync" so no second note is written (2C); 3A correctly minted a new slug for a new change. The "amend the existing `[Drift:]` entry" path (same drift still stale on a second run) was **not exercised** |
| Re-run produces no further changes | **PASS** | 2C |

## Assumptions

| # | Exercised? | Held? | Notes |
|---|---|---|---|
| A1 | No | — | 6 artifacts, 2–4 source files; no truncation or hallucination seen, but the 5+/10+ scale was not run |
| A2 | Yes | Mostly | Findings reached exactly the artifacts holding the stale claim (2A, 3A, 4A); research.md never false-positived. One miss: anomaly 1 |
| A3 | Yes | Yes | "artifact says X, code says Y" cells were clear; the proposed edits are still unified diffs, so `+`/`-` context is only lost in the table |
| A4 | Yes (small) | Yes | One code change → 7 findings across 4 artifacts, all real; the only LOW was the intended `untracked`. Not run at scale |
| A5 | Yes | Yes | "move", "floor", "tag" in prose never flagged (2A, 3A, 4A) |
| A6 | Yes | Yes | 3A: plan + contracts + data-model all moved to default `1`, consistently |
| A7 | Yes | Yes | `ORIG_HEAD` derivation, subject-list sanity check and range identical to 1.0.0 behaviour (4A, 4B) |
| A8 | Partly | Yes so far | Notes written to secondary artifacts with the shared slug; the amend-in-place path not exercised (see Phase 5) |

## Anomalies and issues

| # | What | Status |
|---|---|---|
| 1 | **A count claim slips past `sync-specs`.** After a third export appeared (2D), `contracts/api.md`'s "exactly two runtime values" stayed unflagged: the prompt says an unreferenced construct is not a finding, and the agent applied that to the claim the construct falsifies. `sync-code` caught the same line once the spec listed three exports (3C) | **Flagged** — one-line prompt fix: a claim that a referenced file exports "exactly N" is checked against the file's actual export list |
| 2 | `sync-code`'s kinds `removed` / `changed` presume a before/after; with full-state comparison there is no "before". The agent read them as "artifact disagrees with spec" and it worked, but the wording invites a diff-style reading | **Flagged** — cosmetic |
| 3 | The spec's own `## Contract` block can go stale against its own FRs (3C) and no command may write `spec.md`; analyze surfaces it as residue every run | **Design consequence** — noted |
| 4 | Judgment variance: 4A rated plan's "clamps at zero" HIGH although still true by default; earlier sessions rated the same line MEDIUM or left it | **Inherent** to prompt-driven commands |
| 5 | An agent invoked the sibling `speckit-drift-rebase` skill by mistake in 4B and self-corrected before running anything | **Flagged** — uninstall `drift` once `sync` is installed (`specify extension remove drift`) |
| 6 | `check-prerequisites.sh --include-tasks` reports `AVAILABLE_DOCS: ["tasks.md"]` only; harmless, every command derives the paths itself | **Noted** |
| 7 | Converge did **not** re-file open tasks in any 2.0.0 chain (3A, 4A); in 3C it appended only genuinely new test work | **Observation** — better than the 1.0.0 runs, still one run each |

## Ship

**Ship.** All nine tests and the cross-cutting checks pass on 2.0.0; the chain converged in both
sync-code runs and the two secondaries were found, edited and annotated by all three commands.
Fix anomaly 1 before relying on `sync-specs` to police "exactly N exports" claims, and run A1/A4
once on a real multi-artifact feature — this fixture is small.
