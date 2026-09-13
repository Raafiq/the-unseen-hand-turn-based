# Spec Kit `analyze` / `converge` — Behaviour Verification

**Date**: 2026-09-13
**Repo**: `Raafiq/the-unseen-hand-turn-based`
**Branch**: `claude/speckit-behavior-verify-qaq6dh`
**Method**: read the installed files, then run the commands against a purpose-built
scratch feature (`specs/999-scratch-converge`) with deliberately planted drift.

---

## 0. Read this first — three things that change the plan

1. **`converge` did not exist before v1.0.6.** The prior session put it at v0.11.2. The
   command file's first commit is `0c29d89` (PR #3001) and the earliest tag containing it
   is **v1.0.6** — the version installed today. It is days old, not months. Every
   assumption built on "converge has been out since 0.11.2" is void.
2. **Feature resolution no longer uses the git branch, and its state file is gitignored.**
   Both commands resolve the active feature from `SPECIFY_FEATURE_DIRECTORY` or
   `.specify/feature.json`. `.specify/.gitignore` (new in 1.0.6) ignores `feature.json`.
   Every developer must set the active feature on their own machine, and CI cannot.
   Before this session, both commands errored out of the box in this repo.
3. **This repo is a bad proxy for your Nx monorepo.** The handoff says specs are "verbose
   and contain implementation code". This repo's four specs are 72–81 lines each and
   contain **zero fenced code blocks**. Findings about spec shape (E4) do not transfer.

---

## 1. Installed version and overrides

| Item | Value |
|---|---|
| CLI version | `specify 1.0.6` |
| `.specify/init-options.json` | `speckit_version: "1.0.6"`, `integration: claude`, `script: sh`, `ai_skills: true` |
| Installed integrations | `claude` only |
| Extensions | **none** — no `.specify/extensions/`, no `.specify/extensions.yml` |
| Presets | none installed |
| `.claude/commands/` | **does not exist** — nothing stale to clean up |
| `.composed/` overrides | none |
| Unresolved `__SPECKIT_COMMAND_*__` tokens | **0** across `.claude/` and `.specify/` |
| Upgrade performed | `0.14.5.dev0` → `1.0.6`, via `specify init --here --force --non-interactive` |

**No overrides.** Everything below is core behaviour, unmodified.

Invocation is hyphenated: `/speckit-analyze`, `/speckit-converge`.

### Caveat that governs every finding below

`analyze` and `converge` are **agent prompts** (`SKILL.md`), not programs. The only
deterministic parts are the shell scripts. A finding marked "observed" is one sample of
LLM behaviour following that prompt, not a guarantee. Findings marked "from prompt text"
are stronger: they are what the instructions say, and are stable across runs.

---

## 2. Findings table

### A. What each command reads

| # | Question | Verdict | Evidence | Confidence |
|---|---|---|---|---|
| A1 | Does `analyze` read source code? | **No — artifacts only** | `speckit-analyze/SKILL.md:41` "Identify inconsistencies … across the three core artifacts (`spec.md`, `plan.md`, `tasks.md`)". Step 2 "Load Artifacts" names only those three plus the constitution. No code-reading instruction anywhere. | High |
| A2 | Does `analyze` read `research.md` / `data-model.md` / `contracts/` / `quickstart.md`? | **No** | Grep for those filenames in `speckit-analyze/SKILL.md` returns **zero** hits. It parses `AVAILABLE_DOCS` from the script but never acts on it. | High |
| A3 | Does `converge` read those optional docs? | **No** | Same grep over `speckit-converge/SKILL.md`: **zero** hits. Step 2 reads `spec.md` (FR/SC/stories/edge cases), `plan.md` ("Data Model **references**" — the plan's mention, not the file), `tasks.md`, constitution. | High |
| A4 | Does either read `.specify/memory/constitution.md`? | **Yes, both** | analyze Step 2 "From constitution: Load `.specify/memory/constitution.md`"; converge Step 1 `CONSTITUTION = .specify/memory/constitution.md (if present)`. Converge skips gracefully if it is an unfilled template. | High |
| A5 | How is the active feature resolved? | **`SPECIFY_FEATURE_DIRECTORY` env var → `.specify/feature.json` → error. Never the git branch.** | `common.sh:181-206`. `get_current_branch()` (`common.sh:79-88`) returns `$SPECIFY_FEATURE` or empty — it does **not** call `git rev-parse`. With no feature set the script printed `ERROR: Feature directory not found. Set SPECIFY_FEATURE_DIRECTORY or run the specify command to create .specify/feature.json`. | High |

**A3 is the one you cared about: safe.** Converge cannot pull you back to a stale
`data-model.md`, because it never opens it. The exposure is different — see C4.

**A5 side effect worth naming**: `.specify/.gitignore` ignores `feature.json`, so the
active feature is per-checkout, per-machine state. Two developers on the same branch can
have two different active features. CI has none.

### B. What each command writes

| # | Question | Verdict | Evidence | Confidence |
|---|---|---|---|---|
| B1 | Is `analyze` strictly read-only? | **Yes** | Prompt: "**STRICTLY READ-ONLY**: Do **not** modify any files" and "**NEVER modify files**". **Observed**: ran analyze against the scratch feature; `sha256sum -c` on all three artifacts came back OK for all three. | High |
| B2 | Does `analyze` output remediation, and in what shape? | **Prose + markdown tables. Not a diff, not a task list.** It then *asks*. | Step 6 emits a findings table (ID/Category/Severity/Location/Summary/Recommendation), a coverage table, constitution issues, unmapped tasks, metrics. Step 7 suggests commands as text. Step 8: "Would you like me to suggest concrete remediation edits for the top N issues?" — "(Do NOT apply them automatically.)" | High |
| B3 | Does `converge` write anywhere but `tasks.md`? | **No** | "The command's **only** write is appending a new `## Phase N: Convergence` section to `tasks.md`." Explicitly forbidden: modifying `spec.md`/`plan.md`, rewriting/renumbering/deleting existing tasks, touching application code. **Observed** across 3 runs: `diff` showed pure appends; nothing else changed. | High |
| B4 | Dedicated section header, or interleaved? | **Dedicated header, appended at the end** | Step 7: `## Phase N: Convergence`, N = highest existing phase + 1, task IDs continue from the max. **Observed**: run 1 appended `## Phase 4: Convergence` (T006–T011); run 3 appended `## Phase 5: Convergence` (T012–T013) below it, leaving Phase 4 untouched. | High |
| B5 | What happens when the codebase already satisfies everything? | **`tasks.md` left byte-for-byte unchanged; reports `✅ Converged`** | Prompt: "MUST leave `tasks.md` **byte-for-byte unchanged** (no empty Convergence header)". **Observed** on run 2: sha256 identical before and after. | High |

**One more, unasked and worth knowing: `converge` never executes anything.** It reads
code; it does not run your tests, build, or typecheck. Its verdict is a reading of source
text. A test that compiles but fails at runtime will not be caught.

### C. Edge cases

| # | Question | Verdict | Evidence | Confidence |
|---|---|---|---|---|
| C1 | Code does X plus extra Y that no artifact mentions — flagged? | **Yes**, as gap-type **`unrequested`** | The prompt has a dedicated gap type: "the code contains work not called for by the spec, plan, or tasks (surfaced for awareness — converge does **not** delete code, it only appends a task to review/justify or remove it)". **Observed**: planted a `logCall()`/`console.log`/module counter and a `resetCallCount()` export; converge raised F3 (`contradicts` the plan's no-side-effects rule, HIGH) and F5 (`unrequested`, LOW) and appended T008/T011. | Medium-High (prompt is explicit; severity assignment is model judgement) |
| C2 | Requirement deleted from `spec.md`, code still implements it — flagged? | **Yes**, as `unrequested` | **Observed**: `mul(a,b)` was in the code with `tasks.md` T004 citing a non-existent `FR-004`. Converge raised F4 (`unrequested`, MEDIUM) and appended T009 "Review and justify or remove the `mul(a, b)` export … no requirement in spec.md calls for it". **You do not have to hand-edit `tasks.md` on removals** — but converge will not delete the code either, it only files a task. | Medium-High |
| C3 | Task marked `[X]` but `spec.md` has since changed so the task contradicts the spec — what happens? | **Flagged, but only by a stretched reading of the prompt** | **Observed**: T003 `[X]` said `sub` returns `b - a` while FR-002 said `a - b` (code was correct). Converge raised F6 (`contradicts`, MEDIUM) and appended T010 to fix T003's wording. **But**: Step 4 says produce a finding "for each item in the intent inventory … inspect the current **code**". A stale task is an artifact-vs-artifact problem, and the prompt has no gap type for it. A different run may well miss this. **Treat C3 as `analyze`'s job, not converge's.** | **Low** — do not rely on this |
| C4 | `spec.md` changed, `plan.md` left stale — does converge pull code back toward the old plan? | **No. It pulled toward the new spec. Prior session's claim REFUTED.** | **Observed**: changed FR-003 from "throw `RangeError`" to "return `null`, MUST NOT throw", and added a `plan.md` "Error Handling" section explicitly rejecting a sentinel return. Converge appended T012/T013 moving the code to the **new spec**, and said nothing about the plan conflict. | Medium — one run; the prompt states no spec-over-plan precedence rule, so this could go the other way |
| C5 | Does `analyze` flag a constitution violation that `implement` then reintroduces? | **Yes — the carry-forward gap is real** | `speckit-implement/SKILL.md:102` reads `.specify/memory/constitution.md` directly, but the file contains **zero** references to `analyze` or its report. Nothing carries an analyze finding into implement. Constitution findings must be carried forward by hand — or by a converge run, which re-derives them from the constitution itself. | High |
| C6 | Does converge terminate in one pass, or always need a second? | **It terminates. Two passes total: one to find, one to confirm.** | **Observed**: run 1 → `tasks_appended` (6 tasks). Implemented them. Run 2 → `converged`, zero findings, `tasks.md` byte-identical. The loop is real, not theatre — but a `converged` verdict costs one extra run you cannot skip. | Medium-High |

**C4 is the important correction.** Your real exposure is the mirror image of what the
prior session feared: converge silently **ignores** the stale `plan.md` rather than
obeying it. Nothing tells you the plan is now wrong. Only `analyze` catches that — in my
run it raised the spec/plan conflict as a HIGH inconsistency.

---

## 3. Claims verdict

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `analyze` checks artifacts against each other; `converge` checks code against artifacts | **CONFIRMED** | analyze Goal: "across the three core artifacts". converge Goal: "assess the current state of the code". |
| 2 | `analyze` has never checked code — cross-artifact since v0.0.17 | **SPLIT: behaviour CONFIRMED, version REFUTED** | Scanned every historical revision of `templates/commands/analyze.md` for code-reading language: zero hits, so it never read code. But the file's first commit is `c7b61f4`, earliest containing tag **v0.0.52** — not v0.0.17. |
| 3 | `converge` was introduced in v0.11.2 | **REFUTED** | First commit `0c29d89` ("feat: add /speckit.converge command (#3001)"); earliest containing tag **v1.0.6**. |
| 4 | `converge` is append-only; its only write is adding tasks to `tasks.md` | **CONFIRMED** | Prompt states it as a MUST NOT list. Observed over 3 runs; existing tasks and both other artifacts never changed. |
| 5 | `converge` is not a diff tool — no git, no branch comparison, no history | **CONFIRMED** | Verbatim from the prompt: "This is **not** a diff tool and does **not** track changes … no git, no branch comparison, no history." |
| 6 | `converge` cannot conclude the code is right and the spec is wrong; code always loses | **CONFIRMED, with a caveat** | It can never write `spec.md`. But `unrequested` findings do surface "the code has something the spec does not" without demanding deletion — the appended task says *review/justify or remove*. So it can raise the question; it cannot resolve it in the code's favour. |
| 7 | Nothing in core Spec Kit reads across feature directories under `specs/` | **CONFIRMED** | Neither skill references `specs/` or sibling features. Both are bounded to `FEATURE_DIR`. Converge Step 3 goes further: "Bound the assessment to these — do **not** infer scope beyond what the artifacts define." |
| 8 | Nothing propagates a `spec.md` change down into `plan.md` or `tasks.md` | **CONFIRMED** | analyze cannot write. converge writes only `tasks.md`, and derives it from code-vs-intent, not from spec-vs-plan. No command re-derives a plan from a changed spec. |
| 9 | No epic/parent level — `specs/` is a flat set of feature directories | **CONFIRMED** | `create-new-feature.sh:342` `FEATURE_DIR="$SPECS_DIR/$BRANCH_NAME"` — exactly one level. No epic/parent concept in the scripts. |
| 10 | After a rebase onto `main`, neither command detects a changed dependency | **CONFIRMED** | Follows from 5 and 7: no git, no history, no cross-feature reads. |

---

## 4. Routing guide (corrected)

Read the "Reality" column. Everything in it was checked against the installed v1.0.6.

| # | Situation | Do this | Reality |
|---|---|---|---|
| **S0** | *(new)* Before anything | Set the active feature: `export SPECIFY_FEATURE_DIRECTORY=specs/<feature>` or write `.specify/feature.json` | **Mandatory in 1.0.6.** No branch fallback. `feature.json` is gitignored, so every machine sets it separately. |
| S1 | Code doesn't do what `spec.md` says | `/speckit-converge` → `/speckit-implement` → `/speckit-converge` | Works as advertised. Terminates in 2 converge runs. Converge reads code but never runs it. |
| S2 | Requirement changed | Edit `spec.md` **and** `plan.md` → `/speckit-analyze` → `/speckit-implement` → `/speckit-converge` | Correct, and the `plan.md` edit is **not optional**. If you skip it, converge silently follows the new spec and never tells you the plan is stale (C4). `analyze` is the only thing that catches it. |
| S3 | Review feedback, style/naming only | Fix code. Touch no artifacts. | Correct. Converge may raise the change as `unrequested` if it added an export; a rename inside existing scope will not trip it. |
| S4 | Review feedback that changes behaviour | Same as S2 | Correct. |
| S5 | Developer changed code and the code is right | **No core route.** Hand-edit `spec.md`, then `/speckit-analyze`. | Confirmed gap. Converge can *surface* it as `unrequested` but only ever proposes reverting the code. Nothing writes `spec.md` from code. |
| S6 | Behaviour-neutral optimisation | Update `plan.md`. Invisible to `spec.md`. | Correct. Also invisible to converge, which reads plan "architecture/stack choices and technical constraints" — a caching change that contradicts a stated constraint *will* be caught; one the plan never mentions will not. |
| S7 | Behaviour removed from the spec | Edit `spec.md`, then `/speckit-converge` | **Better than the prior session thought.** You do not have to hand-strike old tasks: converge flags the orphaned code as `unrequested` and appends a review task (C2). It will not delete the code or the old task for you. |
| S8 | Feature branch rebased onto changed `main` | Re-read `plan.md` by hand | Confirmed gap. No git awareness anywhere. |

**On the spec/plan split in this repo (S6):** it does not hold here, but not for the
reason the handoff assumed. This repo's specs are thin prose ported from `docs/`, with no
code blocks at all, and **there are no `plan.md` files** — all four features under
`specs/` contain `spec.md` and nothing else. There is no split to violate; there is no
plan layer. Re-run this question against the Nx repo.

---

## 5. Extension recommendation

**Do not build `spec-backfill` yet. Evaluate `spec-kit-reconcile` first.**

The S5 gap is real — nothing in core writes `spec.md` from code, and `converge` is
structurally incapable of it. But the catalog already has a direct match:
**Reconcile Extension v1.2.1** (`stn1slv/spec-kit-reconcile`), described as "Reconcile
implementation drift by surgically updating the feature's own spec, plan, and tasks" —
which is `spec-backfill`'s job plus the `plan.md` coverage you listed as a known blind
spot. Two near-misses worth a look: **Canon v0.1.0** (adds explicit `code-first` and
`spec-drift` workflows, but needs a Canon Core preset) and **Intent Reconciliation
v1.0.2**. None of the other named candidates fit: `ci-guard` gates CI, `bugfix` patches
specs from bug reports, `cleanup` is a post-implementation quality gate,
`architecture-guard` generates refactor tasks, `api-evolve` is contract lifecycle,
`archive` folds merged features into memory. All catalog entries above are **community =
discovery-only**: not installable directly, and not reviewed by GitHub. Vet the source
before running anything. If Reconcile is unsuitable, build `spec-backfill` — the draft is
sound and the blocker you thought you had is not real.

### Extension sub-findings

| # | Verdict | Evidence |
|---|---|---|
| **E1** | Gap is **real**, but likely already covered | Confirmed by C2/C6 and claim 6: converge only ever proposes reverting code. See the Reconcile candidate above. |
| **E2** | Manifest **valid**; version floor is **wrong** | `specify extension add /tmp/extval --dev` → "✓ Extension installed successfully!". `schema_version: "1.0"` matches `SCHEMA_VERSION = "1.0"`. But `speckit_version: ">=0.11.2"` is wrong: `run.md` hands the spec-wins direction to `converge`, which did not exist before **v1.0.6**. Change the floor to `">=1.0.6"`. |
| **E3** | **Correct** | `run.md` Step 1 calls `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` — the right mechanism for 1.0.6. Its explicit "Do not guess the feature from the current git branch" is now redundant but harmless: the script cannot do that any more. Consider adding `--require-spec`, since the command reads `spec.md`. |
| **E3b** | **NOT a blocker — resolved** | Installed the draft against a scratch project. It wrote `.claude/skills/speckit-spec-backfill-run/SKILL.md`. **Nothing was written to `.claude/commands/`.** `register_commands_for_claude` (`extensions/__init__.py:3652`) delegates to `register_commands_for_agent`, which emits `SKILL.md`. `_skill_name_for_command` (`:1384`) maps `speckit.spec-backfill.run` → `speckit-spec-backfill-run`. The manifest shape is right as drafted; `EXTENSION-API-REFERENCE.md` is stale docs, not stale code. Zero `__SPECKIT_COMMAND_*__` tokens in the output. **One real defect found**: `run.md`'s literal `/speckit.converge` (line 26) is passed through **unrewritten**, pointing users at a command that does not exist. Write `/speckit-converge`. |
| **E4** | **Could not determine** — wrong repo | "Code blocks are binding" produces **zero** `C###` items here: all four specs contain 0 fenced blocks. This repo cannot estimate your finding volume. Re-run the detection manually against one real Nx feature spec before committing to the rule. My instinct is that it will be noisy, but I have no measurement. |
| **E5** | **Against, for now** | Converge does not read `data-model.md` or `contracts/` either (A3), so widening puts `spec-backfill` alone in territory no other command polices, with no counterpart to hand findings to. Ship narrow, measure the noise from E4, widen only if schema drift actually shows up. |
| **E6** | Surveyed — see recommendation above | Full catalog dump at `/tmp/extsearch.txt` (2771 lines). |

---

## 6. Open questions

| Question | What would settle it |
|---|---|
| **E4 — will binding code blocks be noisy?** | Run the Step 2/3 detection by hand against one real Nx `spec.md`. This repo has no code blocks, so it cannot answer. |
| **C3 and C4 reliability.** | Each is one run of a prompt with no precedence rule written into it. Repeat 3–5 times, ideally on two models, before depending on either. C3 in particular I would not rely on. |
| **Is `spec-kit-reconcile` actually good?** | Read the source at `github.com/stn1slv/spec-kit-reconcile`. Community catalog entries are unreviewed and this one shows 0 downloads / 0 stars. |
| **How should `feature.json` be handled by a team?** | It is gitignored by design. Unresolved: whether to commit it anyway, wrap the commands in a script that exports `SPECIFY_FEATURE_DIRECTORY`, or derive it from the branch yourself. |
| **Does converge behave the same on a large feature?** | The scratch feature was 3 requirements and 1 file. Converge's Step 3 bounds scope to files named in `plan.md`/`tasks.md` plus keyword search — on a large Nx feature that scoping step is where it will succeed or fail. Untested. |

---

## Appendix: reproducing this

Scratch artifacts left in place on this branch:

- `specs/999-scratch-converge/{spec,plan,tasks}.md` — planted drift; `tasks.md` shows both
  appended Convergence phases
- `coverage/scratch-calc/calc.ts`, `calc.test.ts` — gitignored
- `.specify/feature.json` — gitignored; points at the scratch feature

Delete `specs/999-scratch-converge/` before merging. Note that `coverage/` is outside
`tsconfig.json`'s `include` and vitest's `src/**` pattern, so the scratch test file was
never executed — which mirrors how converge works anyway.
