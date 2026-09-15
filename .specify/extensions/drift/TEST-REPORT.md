# spec-kit-drift — build and test report

**Spec Kit**: 1.0.6 · **Extension**: `drift` 0.2.0 (directory `spec-kit-drift`; the 0.1.0 results are the main tables, the 0.2.0 fixes and retest are the last section) · **Dates**: 2026-09-13 / 14
**Where**: every run in a scratch clone of this repo under the session scratchpad, never in
the working checkout. Rebase ranges are real commits from this repo's history; sync
mutations are uncommitted edits to `src/sim/movement.ts` and `src/sim/build.test.ts`.

**Read this first.** The two commands are agent prompts. Every row below is **one run** of
an LLM following that prompt; a second run can differ. Nothing here is a guarantee. In some
runs the agent executed the SKILL.md steps by hand with git plumbing rather than through
the Skill tool; the steps followed were the same text.

## Install

| Check | Result |
|---|---|
| `specify extension add extensions/spec-kit-drift --dev` | installed, no warnings |
| Emitted | `.claude/skills/speckit-drift-rebase/SKILL.md`, `.claude/skills/speckit-drift-sync/SKILL.md` — skills layout, nothing in `.claude/commands/` |
| Unresolved `__SPECKIT_COMMAND_*__` tokens | 0 in both; `__SPECKIT_COMMAND_ANALYZE__` etc. rendered as `/speckit-analyze` |
| `{SCRIPT}` | rendered as `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` |
| Manifest | id had to be `drift` (see issue 1) |

## Results

Fixtures: `specs/996-movement-slot/` (sync; converge reported Converged before every sync
test) and `specs/995-campaign-save/` (rebase; describes `campaign.ts` as of `a6be379`).

### Rebase — `/speckit-drift-rebase`

| # | Test | Verdict | What happened |
|---|---|---|---|
| R1 | Incoming commit changes exports the spec describes (`81a50c9`: schema version 2→3, new `deployment` key, loader now applies it) | **PASS** | 3 HIGH findings (`signature` ×2, `behaviour`), source-refs FR-001 / FR-002 + Contract / FR-003 + US1/AC1; spec diff amended all three FRs **and** the `## Contract` block, plus a `## Revisions` note |
| R2 | Incoming commit changes only unreferenced files (`9be1571`) | **PASS** | `✅ Clean — 1 incoming commits, 19 changed files, none referenced` — no gate, nothing written. Two files were swept into scope by incidental name reuse and produced no finding (issue 5) |
| R3 | Incoming commit deletes a file the plan references (`1e67d09` removed `docs/NEXT.md`) | **PASS** | D1 CRITICAL `removed`, source `plan: TD-001`; TD-001 kept and suffixed `[NEEDS REVISION: docs/NEXT.md removed upstream in 1e67d09]`; decision task T005 appended under `## Remediation: Gaps` with `[Drift: rebase-e28fbf2-1e67d09]`; 46 other changed files ignored |
| R4 | Incoming commit changes a module only the plan names (`src/sim/index.ts`) and contradicts a prose-only plan decision (TD-002) | **FAIL → fixed → PASS** | First run: `index.ts` found (LOW `cosmetic`, plan line still true, no edit — correct) but **TD-002 was not flagged** (issue 4). After the fix: D4 HIGH `behaviour`, source `plan: TD-002`, plan diff proposed |
| R5 | No rebase, upstream not moved | **FAIL (by design review) → fixed → PASS** | Original Step 2 would have errored; fixed before the first run (issue 3). Run: `✅ Clean — HEAD already contains 81a50c9 and no rebase is recorded …` with the `--since` hint, no gate |
| R6 / I2 | After approval, `/speckit-analyze` | **PASS with expected residue** | Analyze reports: `[X]` task text stale (T001 "seven keys", T003 "as authored"), and TD-002 vs the amended FR-003 (first run, before the R4 fix). Neither is something the command may edit (issue 6) |
| R7 | After approval, `/speckit-converge` | **PASS** | Converge did not touch the rebased spec edits: 0 `missing` / `partial`. It appended 2 real items: TD-002 `contradicts` (pre-fix run) and an `unrequested` for the render UI the narrow plan never scoped |
| R1b | Pre-rebase preview: HEAD at `a6be379`, upstream `81a50c9`, no `--since` | **PASS** | Mode `pre-rebase`, range `a6be379..81a50c9`; the same four findings as the post-rebase run (FR-001, FR-002, FR-003, `plan: TD-002`), diffs for spec.md and plan.md, tasks.md untouched; `no` → `No changes written.` |

### Sync — `/speckit-drift-sync`

| # | Test | Verdict | What happened |
|---|---|---|---|
| S1 | Export signature the spec describes changed (new optional `floor` param) | **PASS** | D1 HIGH `signature`, source FR-002 + Contract; diff amended FR-002 prose **and** the `## Contract` block; `## Revisions` note `[Drift: movement-floor-param]`; one task T005 "Update tests … in src/sim/build.test.ts" |
| S2 | New export no artifact mentions | **PASS** | D3 LOW `untracked`, **no proposed edit**, no invented FR |
| S3 | Internal logic change, no signature change (clamp `0`→`1`, plus a `const` extraction) | **PASS** | Clamp: D1 MEDIUM `behaviour` on FR-002 (rated MEDIUM because nothing in the diff shows intent — gate decides). Extraction: D2 LOW `cosmetic`, no edit |
| S4 | Clean tree | **PASS** | `✅ Clean — the working tree matches HEAD`; feature's own untracked dir ignored; no gate |
| S5 | After approval, converge | **PASS** | `✅ Converged`, 0 `contradicts`, 0 `unrequested`, tasks.md byte-identical |
| S6 | tasks.md after approval | **PASS** | New task under `## Remediation: Gaps`, `[X]` tasks untouched, IDs continued |
| S7 | Staged + unstaged changes | **PASS (note)** | Header `1 staged, 1 unstaged, 3 untracked · In scope: 2`; `movement.ts` → finding; `build.test.ts` in scope but its added assertion produced **no finding** (issue 7). plan.md flagged `plan-stale` and left unwritten |
| I1 | sync → approve → converge | **PASS** | Converge clean; it did **not** re-file sync's open T005 (issue 9) |
| I3 | Feature already has an open reconcile task under `## Remediation: Gaps` | **PASS** | Heading count stayed 1, T005 byte-identical, no ID reuse |

Also verified: a `no` at the gate prints `No changes written.` and leaves all three md5s
unchanged (S2/S3, R4 retest, R1b); nothing is written before the question (every run).

## Issues found

| # | Issue | Status |
|---|---|---|
| 1 | The handoff's ID `spec-kit-drift` and commands `speckit.drift.*` cannot coexist: 1.0.6 refuses a command whose namespace differs from `extension.id` (`extensions/__init__.py:1138`). Same convention as `reconcile` / `spec-kit-reconcile` | **Fixed** — id `drift`, directory `spec-kit-drift`; skill names match the handoff's expected `speckit-drift-*` |
| 2 | The handoff's git recipe `git diff <merge-base>..HEAD` returns the **feature's own** commits, not upstream's. Incoming changes are `old-base..new-base` | **Fixed** — two modes: pre-rebase preview (`merge-base..upstream`) and post-rebase (`--since <old-base>`, else `ORIG_HEAD`) |
| 3 | "Upstream never moved" and "already rebased" look identical (`merge-base == upstream tip`); the first draft errored on the former | **Fixed** before R5 ran — clean report with a `--since` hint; `ORIG_HEAD` staleness noted in README |
| 4 | A plan decision written as prose with no path or identifier (TD-002) never entered the reference table, so a hunk that contradicted it produced no finding | **Fixed** — Step 3 records plan claims; Step 5 checks every claim against every in-scope hunk. Re-tested: flagged HIGH with a plan diff |
| 5 | Whole-word identifier matching sweeps in files by incidental name reuse (`campaignSchemaVersion` in a JSON data file, `UnitRecord` / `parseEncounter` in a render file). No false finding in four runs, but extra reads and noise | **Fixed in 0.2.0** — a file enters scope only by a path reference; identifiers map hunks to spec items inside plan-listed files only. Retested (see 0.2.0 below) |
| 6 | After a rebase edit, completed `[X]` tasks still describe the old behaviour ("seven keys"); analyze flags them. The never-edit-`[X]` rule (adopted from reconcile) makes this unavoidable | **Flagged** — design consequence, shared with reconcile. A follow-up could append a `(superseded by Revision …)` note task; not done |
| 7 | S7: an added `expect` line in a referenced test file was in scope but yielded no finding — Step 5 records exports / signatures / types / behaviour, and a new assertion is none of those | **Fixed in 0.2.0** — `test` kind, LOW, no edit. Retested (see 0.2.0 below) |
| 8 | `git diff HEAD` does not show untracked files, and gitignored code (e.g. anything under `coverage/`) is invisible to git entirely | **Fixed** for untracked (`git ls-files --others --exclude-standard`); gitignored is inherent |
| 9 | Converge did **not** double-count sync's open task, unlike Round 2's reconcile run. Difference in the evidence: sync's task named the exact gap (`floor` tests) converge would otherwise have filed | **Observation**, one run — not a guarantee |
| 10 | Test-method limits: single runs; no real `git rebase` was performed (the `ORIG_HEAD` branch of Step 2 is untested; `--since` and pre-rebase mode are); agents sometimes hand-executed the prompt; converge/analyze at old commits used that commit's older `.specify` scripts | **Flagged** |

## Recommendation

**Iterate, then ship — adopt now for the sync path, pilot the rebase path on one real rebase first.**
S5 and I1, the tests that decide whether the extension is usable at all, passed cleanly:
converge accepted every synced spec and did not fight or re-file. Sync is a strict upgrade
over reconcile for the "code is right, spec is stale" case because detection comes from
the diff rather than from a description the developer has to remember to write — with the
same append-only, never-edit-`[X]`, never-touch-`plan.md` rules. Rebase is the genuinely
new capability and found everything the fixtures planted, including a deleted file and,
after one prompt fix, a prose-only plan decision; but every rebase run used `--since` or
the preview mode, so run it once after a real `git rebase` (to exercise `ORIG_HEAD`) and
once on a real Nx feature (to see how noisy issue 5 gets at scale) before documenting it
as the team flow. Decide issue 5's scoping rule and whether issue 7's test additions should
surface; both are one-line prompt changes.

## 0.2.0 — fixes and retest (2026-09-14)

### Prompt diffs

**Fix 1 — scope by path only** (`commands/rebase.md` Step 4.2 and `commands/sync.md` Step 4).

Before:

> A changed file is **in scope** when either holds:
> - its path, basename or extension-less basename matches a referenced path; or
> - `git diff … -- <file>` contains a referenced identifier on a `+` or `-` line (a whole-word match).

After:

> A changed file is **in scope** only when `spec.md` or `plan.md` references it by path — its path, basename or extension-less basename matches a referenced path. **An identifier hit alone never brings a file into scope.** Identifiers are matched only inside files `plan.md` lists (architecture, Project Structure, module references), where a `+`/`-` line carrying one maps the hunk to the spec item it touches. A file `plan.md` does not list enters scope only through a `spec.md` path reference, never through a name it happens to share.

**Fix 2 — `test` kind** (`commands/sync.md` Steps 5 and 6).

Before (Step 5 list ended at):

> - **behaviour** changed inside a function the spec describes: a new or removed branch, a different return, a different thrown error, a different default

After (added):

> - a **test** assertion added or modified — `expect`, `assert`, `it`, `describe`, `test` — in a file matching `*.test.*`, `*.spec.*` or `__tests__/*`

Step 6: kinds table gains `test`; severity LOW row is now `untracked`, `test`, `cosmetic`; and:

> A `test` change maps to a spec item only when the spec explicitly references that test file or names the scenario the assertion covers; otherwise classify it `untracked` LOW. Either way it gets **no proposed edit** unless a scenario's text is now literally false.

### Retest

| # | Test | Verdict | What happened |
|---|---|---|---|
| R2 | Incoming commit changes only unreferenced files | **PASS** | `src/sim/build.ts` (previously swept in by `UnitRecord`) now under "Changed, not referenced". `docs/NEXT.md` stays in scope — it **is** referenced by path in TD-001 — and yields no finding. Clean, no gate |
| R1 | Incoming commit changes exports the spec describes | **PASS** | In scope: the four plan-listed `src/sim` files only; the JSON data file and `campaign-shell.ts` now out of scope. Same four findings (FR-001, FR-002 + Contract, FR-003, `plan: TD-002`) |
| S1 | Export signature change | **PASS** | D1 HIGH `signature`, FR-002 + Contract; diff amends prose and the Contract block |
| S7 | Staged + unstaged incl. an added `expect` in the test file | **PASS** | The assertion is now its own row: `D2 LOW test FR-002 … none (no edit)`. Header `1 staged, 1 unstaged, 3 untracked · In scope: 2` |
| S5 | After approval, converge | **PASS — no fight** | Converge changed nothing sync wrote; plan.md md5 unchanged through both commands. It appended T005 (real: no test exercises a non-default `floor`) and T006 (a re-file of the `plan-stale` finding sync can only report, since sync never writes plan.md). 1 `contradicts` (the plan), 0 `unrequested` |

Difference from the 0.1.0 S5 run: then, `build.test.ts` was absent from the diff, so sync
appended an "update tests" task and converge was clean; now the test file was in the diff,
sync appended nothing, and converge filed the missing `floor` test itself. Same end state.

### Ship checks

| Check | Result |
|---|---|
| `extension.yml` version | `0.2.0` |
| `CHANGELOG.md` | added |
| README | usage examples for both commands, `--since`, pre-rebase preview mode, sync never writes `plan.md`, `ORIG_HEAD` caveat (untested on a real `git rebase`) |
| `specify extension validate` | **does not exist in 1.0.6** (`list add remove search info update enable disable set-priority catalog`). The manifest was validated by `specify extension add … --dev --force`, which runs the same `ManifestValidation` and installed `Spec Kit Drift (v0.2.0)` with no warnings |
| Rendered skills | `.claude/skills/speckit-drift-rebase/SKILL.md`, `.claude/skills/speckit-drift-sync/SKILL.md`; 0 unresolved tokens; both carry the new scope rule; sync carries the `test` kind |

### Shipped directory

```
extensions/spec-kit-drift/
├── extension.yml          id drift · 0.2.0 · speckit.drift.rebase, speckit.drift.sync
├── CHANGELOG.md
├── README.md
├── TEST-REPORT.md         this file
└── commands/
    ├── rebase.md
    └── sync.md
```
