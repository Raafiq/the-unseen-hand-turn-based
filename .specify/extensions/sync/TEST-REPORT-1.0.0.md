# spec-kit-sync 1.0.0 — build and test report

**Spec Kit**: 1.0.6 · **Extension**: `sync` 1.0.0 (directory `spec-kit-sync`) · **Date**: 2026-09-14
**Where**: every run in a scratch clone of this repo under the session scratchpad, never in
the working checkout. The `sync-code` tests needed `spec.md` committed at `HEAD`; with the
owner's go-ahead one fixture commit was made **in the clone only** (`3fd0bba`, branch
`sync-code-fixture`), never in this repository, never pushed.

**Read this first.** The three commands are agent prompts. Every row is **one run** of an
agent following the prompt through the Skill tool; a second run can differ, and several
did in their judgment calls (noted under Issues). Nothing here is a guarantee.

## Files

```
extensions/spec-kit-sync/
├── extension.yml          id sync · 1.0.0 · speckit.sync.specs / .code / .rebase
├── CHANGELOG.md
├── README.md
├── TEST-REPORT.md         this file
└── commands/
    ├── sync-specs.md      drift 0.3.0 sync.md, references renamed (+ one fix, issue 4)
    ├── sync-code.md       new
    └── sync-rebase.md     drift 0.3.0 rebase.md, references renamed (+ the same fix)
```

`extensions/spec-kit-drift/` (0.3.0) is left in place as the record; it is superseded.

## Install

| Check | Result |
|---|---|
| `specify extension add extensions/spec-kit-sync --dev` | installed, no warnings, `Spec Kit Sync (v1.0.0)` |
| Emitted | `.claude/skills/speckit-sync-specs/`, `speckit-sync-code/`, `speckit-sync-rebase/` — skills layout |
| Unresolved `__SPECKIT_COMMAND_*__` tokens | 0 in all three; `/speckit-analyze`, `/speckit-converge`, `/speckit-implement` and the three self-references render correctly |
| Command names | `speckit.sync.specs`, `speckit.sync.code`, `speckit.sync.rebase` — see issue 1 for why not `speckit.sync.sync-code` |

## Regression — renamed commands (fixtures from 0.3.0)

| # | Test | Verdict | What happened |
|---|---|---|---|
| REG1 | `/speckit-sync-specs`, export signature change (`floor` param) | **PASS** | D1 HIGH `signature` FR-002 + Contract; both amended; same shape as 0.3.0 S1 |
| REG2 | `/speckit-sync-rebase 8098246` on the really-rebased branch (`ORIG_HEAD` path) | **PASS** | old base `d39d6b5` from `ORIG_HEAD`, sanity check passed, same two findings as 0.3.0 O1; `[NEEDS REVISION]` now names the removed sections; chain ran, no disputes |
| REG3 | `/speckit-sync-specs`, module-level state breaks a plan constraint | **PASS** | `plan` findings on Constraints and Summary with a plan diff; SC-001 flagged; all three files written; chain ran |

## `sync-code` — SC1–SC8

Fixture: `specs/996-movement-slot/` committed and converged; each scenario is one
uncommitted edit to `spec.md`.

| # | Test | Verdict | What happened |
|---|---|---|---|
| SC1 | Add FR-004 (`describeMovementEffect`) | **PASS** | D1 HIGH `added` → plan `Scale/Scope` 2→3 exports, new TD-002, Phase 2 line; T005 implement + T006 tests under `## Remediation: Gaps`; gate listed plan.md, tasks.md |
| SC2 | Change an acceptance criterion (+2 → +3) | **PASS** | D1 HIGH `changed` US1/AC1 → tasks.md only (plan states no amount); T005 to update the assertion in `src/sim/build.test.ts`; `no` → nothing written |
| SC3 | Change a code block inside an FR body (`floor` signature) | **PASS** | D1 HIGH `contract` FR-002 → plan Summary "clamps at zero" edit + T005 implement `floor`; `no` → nothing written |
| SC4 | Remove FR-003 | **PASS** | D1 CRITICAL `removed` → TD-001 gets `[NEEDS REVISION: FR-003 removed from spec]` (never deleted); orphan check found none; `no` → nothing written |
| SC5 | Wording only ("only key" → "sole key") | **PASS** | D1 LOW `wording`, `✅ Nothing to sync`, no gate |
| SC6 | Clean spec | **PASS** | `✅ Clean — spec.md matches HEAD`, no gate |
| SC7 | After approval: analyze → converge → implement → converge, inside the command | **PASS** | all four invoked in order via the Skill tool. analyze: 0 CRITICAL (a MEDIUM: the `## Contract` block has no `describeMovementEffect` line). converge: appended T007 — a restatement of T005 (issue 5). implement: listed T005/T006/T007, wrote `describeMovementEffect` + a discriminating test, 32/32 green, marked all three `[X]`. No step reverted or contradicted another |
| SC8 | Final converge | **PASS** | `✅ Converged — the implementation satisfies the spec, plan, and tasks.` Final status: `Next: nothing — the code matches the spec` |

## Integration — I1–I3

| # | Test | Verdict | What happened |
|---|---|---|---|
| I1 | sync-code (SC7 state), then sync-specs with no further code change | **PASS** | sync-specs: one LOW `untracked` (the new test), `✅ Nothing to sync` — the new export matched FR-004; no gate, no work |
| I2 | sync-specs (code change), then sync-code on the spec edits it wrote | **PASS — no circular work** | sync-code found FR-002 already covered by the plan edit and T005; `✅ Nothing to sync`; no gate; Steps 11–15 did not run |
| I3 | Code and spec edited at once; sync-specs then sync-code | **PASS** | sync-specs wrote spec.md only and left FR-004 alone (code-driven). sync-code treated FR-002 as covered, FR-004 as new: plan edit, no duplicate task (T005 already open from converge). Chain: converge appended T006 (duplicate of T005, issue 5) → implement closed both → final converge **Converged**. No conflict between the two commands |

## Issues

| # | Issue | Status |
|---|---|---|
| 1 | The handoff's command names `speckit.sync.sync-specs/…` would render as `/speckit-sync-sync-specs`: the generated skill for `speckit.<id>.<cmd>` is `speckit-<id>-<cmd>` (`_skill_name_for_command`). The invocations the handoff wants require `speckit.sync.specs`, `.code`, `.rebase` | **Fixed** — manifest uses those; file names stay `sync-specs.md` etc. |
| 2 | `sync-code` has no baseline unless `spec.md` is committed | **By design, made explicit** — Step 2 errors with "commit the spec first" when `spec.md` is untracked; README says so |
| 3 | `/speckit-implement` executes **every** open task in `tasks.md`, not only the ones this run appended | **Documented and surfaced** — Step 13 lists all open tasks before invoking it |
| 4 | `sync-specs` / `sync-rebase` could reach the gate with findings but zero edits ("Apply all 0 edits?") | **Fixed** — both now stop with `✅ Nothing to sync` when nothing reaches an artifact. A small change to prompts the handoff said to leave alone; flagged |
| 5 | Core converge re-files an already-open task in some runs (SC7: T007 = T005; I3: T006 = T005) and recognises it in others (I2, and 0.3.0's I1). `sync-code` itself de-duplicates against open tasks; converge does not | **Core behaviour, not this extension's** — implement closes both; the duplicate is cosmetic. The command reports each appended task as "restatement" when it is one |
| 6 | Judgment varies run to run: the same `floor` change was a MEDIUM `plan` finding on the Summary in I2 and REG1, and "not invalidated" in I3; analyze rated the planted FR-004 gap CRITICAL in one run and LOW in another | **Flagged** — inherent to prompt-driven commands; the gate and the inline chain are what catch a miss |
| 7 | `[Drift: <slug>]` tag kept under the new name | **Deliberate** — reconcile matches on `[Sync: …]`; a distinct tag keeps each tool's notes its own, and 0.x notes still match |
| 8 | Fixture needed one scratch commit | **Done with the owner's explicit go-ahead**, in the clone only |

## Ship

**Ship.** REG1–3, SC1–8 and I1–3 all pass; the chain never fought itself and the two
directions never created circular work. What remains true: single runs, and converge's
double-filing is a core quirk the command reports rather than fixes.
