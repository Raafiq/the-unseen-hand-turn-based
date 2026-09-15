---
description: "Detect uncommitted code changes that drift from the feature's spec or plan, update spec.md, plan.md and tasks.md to match after one approval, then run analyze and converge inline"
argument-hint: ""
scripts:
  sh: ../../scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
  ps: ../../scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
  py: ../../scripts/python/check_prerequisites.py --json --require-tasks --include-tasks
---
Act as the **Implementation Auditor** for one feature. Code has changed in the working tree
and has not been committed. Your job is to read that change from git, work out which spec
items it makes untrue, and propose the edits that make the spec describe what the code now
does. **The working-tree diff is the only detector and the only evidence. The spec tells you
what it used to say; the diff tells you what changed; the edit is "spec said X, code now does
Y, spec now says Y". Nothing is written before one explicit approval.**

## User Input

```text
$ARGUMENTS
```

This command takes **no arguments**. If `$ARGUMENTS` is non-empty, print
`ERROR: __SPECKIT_COMMAND_DRIFT_SYNC__ takes no arguments. Set the active feature with SPECIFY_FEATURE_DIRECTORY or .specify/feature.json.`
and stop. **A rejected invocation writes nothing.**

## Operating Constraints (hard boundary)

- **Writes**: only `spec.md`, `plan.md` and `tasks.md` inside the feature directory, only
  in Step 9, only after the Step 8 approval. Never source code. Never any other file.
- **Git is a detector, not a tool for writing**: `status`, `diff`, `ls-files`, `show` are
  allowed. `add`, `commit`, `stash`, `checkout`, `reset`, `push` are never run, whatever
  the user asks.
- **The diff is the source of truth.** Do not read source files that are not in the diff,
  do not scan the repository for other drift, do not take content from git history, other
  branches, other features, notes or memory. Content written into `spec.md` comes from the
  spec itself or from `+`/`-` lines of the diff.
- **Never invent a requirement.** A change that maps to no spec item is reported as
  `untracked` and left alone.
- **Never edit a task marked `[X]` or `[x]`.** Never delete, renumber or reorder a task,
  a requirement or a section. Never write under a `## Phase N: Convergence` heading.
- **The header block above the first `##` heading of `spec.md` is never edited.**

## Step 1: Resolve the feature (gate)

Run `{SCRIPT}` once from the repository root and parse `FEATURE_DIR` from its JSON.

- If the script cannot resolve a feature, print
  `ERROR: Feature directory not found. Set SPECIFY_FEATURE_DIRECTORY=specs/<feature> (or run the specify command that writes .specify/feature.json) and re-run.`
  and stop. Do not guess the feature from the git branch.
- Derive `SPEC = FEATURE_DIR/spec.md`, `PLAN = FEATURE_DIR/plan.md`, `TASKS = FEATURE_DIR/tasks.md`.
  If the script reports one missing, relay its message naming the core command to run, and stop.
- Confirm git: `git rev-parse --is-inside-work-tree` must print `true`; otherwise print
  `ERROR: not a git repository, or git is not on PATH` and stop.

## Step 2: Get the working-tree diff

1. `git diff HEAD` — staged and unstaged changes to tracked files, in one diff.
2. `git ls-files --others --exclude-standard` — untracked files. For each, obtain its
   content as an all-`+` diff with `git diff --no-index -- /dev/null <file>` (exit code 1
   is normal for that command). Ignore untracked files under the feature directory itself.
3. If both are empty, report **✅ Clean — the working tree matches HEAD** and stop. Nothing
   is written.

Changes to `FEATURE_DIR`'s own artifacts are not drift; exclude them from the diff and say
so in the report if any were present.

## Step 3: Extract what the spec references

Read `SPEC` and `PLAN` in full. Build a **reference table**, one row per reference and
where it appears, named by the citation ladder — an ID (`FR-003`, `SC-001`, `US1/AC2`,
`TD-001`), else a quoted heading or opening phrase (`"export interface Tag"` for a code
block), never a bare section name:

- **Paths**: any token with `/` and a file extension in the spec, plus every path the plan
  lists. Keep the path, its basename, and its basename without extension.
- **Identifiers from fenced code blocks**: every `export`ed name and every `interface`,
  `type`, `class`, `enum`, `function`, `const` declared in a block, wherever the block sits —
  inside an FR, under an acceptance scenario, or under a heading such as `## Contract`.
- **Identifiers from prose**: any backticked single token that looks like code — contains
  `()`, `.`, `_`, or mixed case.
- **Plan claims**: every sentence in `plan.md` that states a decision or a fact about the
  code — each `TD-###`, each `**Constraints**` clause, each Technical Context value, each
  Summary sentence that says what the code does or never does (`"clamps at zero"`,
  `"depends only on trait.ts"`, `"pure functions only"`). A claim names no path and no
  identifier, so it is checked only against hunks already in scope (Step 6).

## Step 4: Filter the diff to the feature's scope

A changed file is **in scope** only when `spec.md` or `plan.md` references it by path —
its path, basename or extension-less basename matches a referenced path. **An identifier
hit alone never brings a file into scope.** Identifiers are matched only inside files
`plan.md` lists (Project Structure, module references), where a `+`/`-` line carrying one
maps the hunk to the spec item it touches (Step 6). A file `plan.md` does not list enters
scope only through a `spec.md` path reference, never through a name it happens to share.

Every other changed file is **out of scope**: list it under "Changed, out of scope" in the
report, take no finding from it, and do not open it. If nothing is in scope, report
**✅ Clean — `<N>` changed files, none in this feature's scope**, list them, and stop.

## Step 5: Parse in-scope changes into semantic changes

For each in-scope file, read its hunks and record each **semantic change** with the exact
`+`/`-` lines as evidence:

- an export **added**, **removed** or **renamed**
- a function **signature** changed (parameters, optionality, return type)
- a **type / interface** changed (fields added, removed, retyped)
- **behaviour** changed inside a function the spec describes: a new or removed branch, a
  different return, a different thrown error, a different default
- a **test** assertion added or modified — `expect`, `assert`, `it`, `describe`, `test` —
  in a file matching `*.test.*`, `*.spec.*` or `__tests__/*`

Record nothing the hunks do not show. Whitespace-only and comment-only hunks are recorded
as `cosmetic` and produce no edit.

## Step 6: Map to spec items and classify

For each semantic change, find every spec item it affects — an FR, SC, acceptance scenario,
or fenced block (inside an FR, under a scenario, or under `## Contract`) — **and every plan
claim it makes false** (a switched data structure, a new dependency, a dropped constraint, a
changed default the Summary states) — and produce one finding with a stable id (`D1`,
`D2`, …), a **kind**, a **severity**, the **source item**, the **evidence**, and the
**artifact it reaches**. A change can reach both `spec.md` and `plan.md`; record one finding
per artifact item.

| Kind | Meaning |
|---|---|
| `removed` | an export, type or behaviour a spec item depends on is gone from the code |
| `signature` | a described function or type changed shape |
| `behaviour` | the code now does something different from what the item states |
| `untracked` | the change maps to no spec item |
| `plan` | the change makes a plan claim false — an architecture or module choice, a data structure, a dependency, a constraint, a stated default (reaches `plan.md`) |
| `test` | a test assertion added or modified in a test file the spec or plan names, or a test scenario the spec describes |
| `cosmetic` | whitespace, comments, formatting |

| Severity | Rule |
|---|---|
| CRITICAL | `removed` — the item's export, type or behaviour is gone |
| HIGH | `signature` or `behaviour` on an item the spec describes, where the code is plainly the intended side |
| MEDIUM | `behaviour` or `plan` that contradicts an item where the developer may have meant the artifact's version (the approval gate decides); a `plan` finding on a constraint the code now breaks is HIGH |
| LOW | `untracked`, `test`, `cosmetic` |

A `test` change maps to a spec item only when the spec explicitly references that test file
or names the scenario the assertion covers; otherwise classify it `untracked` LOW. Either
way it gets **no proposed edit** unless a scenario's text is now literally false.

An `untracked` finding gets **no proposed edit**. It is surfaced so the developer can decide
whether it needs a requirement; this command never writes one.

## Step 7: Propose edits

Print the findings first:

```markdown
## Drift Findings — sync

Diff: <N> files changed (<S> staged, <U> unstaged, <T> untracked) · In scope: <M>

| ID | Severity | Kind | Source | Evidence | Reaches |
|----|----------|------|--------|----------|---------|
| D1 | HIGH | signature | FR-001, "export interface Tag" | `src/tags.ts`: `-export function parseTag(input: string)` / `+export function parseTag(input: string, opts?: ParseOptions)` | spec.md |

Changed, out of scope: <list, or "none">
```

Then, for every finding that reaches an artifact, draft the exact edit and show it as a
**unified diff** against the current file. Rules:

- **Surgical.** Change the lines the finding reaches and nothing else. Never rewrite a
  section, never reflow prose, never touch the header block.
- **`spec.md`**: amend the FR / SC / scenario prose **and** every fenced block that states
  the old shape — the block inside the FR body and any block under `## Contract` alike, so
  the spec never carries two signatures. New parameters, fields and branches are described
  in the FR's own wording; keep the Given/When/Then form a scenario already uses. Write only
  what the diff shows; a value the diff does not state (a default the spec would need, a
  unit) is written as `[NEEDS CLARIFICATION: <what>]`, at most three per run.
- **`removed`**: never delete the item. Append ` [NEEDS REVISION: <name> removed from <path>]`
  to the item's line and append a decision task (below).
- **`plan.md`**: amend the existing line that holds the false claim — a `**Key**: value` in
  Technical Context, a `TD-###` sentence, a Summary sentence, a Project Structure path.
  Write what the diff shows the code now does, in the plan's own wording. Never add a
  section the plan lacks; if the drift fits nowhere, say so under Outstanding and leave
  the plan alone. The plan gets its own revision note (below).
- **`tasks.md`**: append only work the diff leaves visibly undone:
  - a decision task per `removed` finding
    (`Decide whether to retire or restore <item> after <name> was removed from <path>`);
  - an update task when a test file the plan or tasks name for the changed item is **absent
    from the diff** (`Update tests for <item> in <exact/test/path>`).
  Never a task for `untracked` or `cosmetic`. Format:
  `- [ ] T{NNN} <verb> <what> in <exact/path> per <source> [Drift: <slug>]`.
  Continue the file's ID width and sequence from its highest ID. No `[P]`. Place under
  `## Remediation: Gaps`, creating it at the end of the file only if absent. Never under a
  `## Phase N: Convergence` heading; never touch a `[X]` task.
- **Revision note.** `SLUG` is a short hyphenated name for the dominant drift, derived from
  the finding of highest severity (`parse-tag-options`). First read the `[Drift: …]` tags
  already in `spec.md`, `plan.md` and `tasks.md`: if one names the same drift, reuse that
  slug and amend that entry's `Reason:` and `Items:` lines in place. Otherwise append,
  under a single `## Revisions` heading at the bottom of each artifact you edit (create it
  on first use):

  ```markdown
  ### Revision: Drift Sync <YYYY-MM-DD> [Drift: <SLUG>]
  - Reason: <one line — what the code now does differently>
  - Items: <each entry amended, by the citation ladder>
  ```

  An artifact this run does not edit gets no note. `tasks.md` gets no note; its
  `[Drift: …]` tags are the record.

## Step 8: Approval gate (once, all-or-nothing)

After every proposed diff, ask exactly one question:

> Apply all <N> edits to <spec.md[, plan.md][, tasks.md]>? Answer `yes` to write them,
> anything else to write nothing.

Wait for the answer. Only a plain, explicit `yes` (or `y`) applies. Any other answer,
silence, or a request to apply a subset writes **nothing**: print `No changes written.` and
stop. There is no partial apply.

## Step 9: Apply and report

Write the approved edits exactly as shown, nothing more. Verify your own writes with
`git diff --stat -- <FEATURE_DIR>` (read-only) and print:

```markdown
## Drift Sync — applied

| File (absolute path) | Change |
|---|---|
| /abs/FEATURE_DIR/spec.md | amended FR-001, US1/AC1, "export interface Tag" block; revision note [Drift: <slug>] |
| /abs/FEATURE_DIR/plan.md | amended TD-001; revision note [Drift: <slug>] |
| /abs/FEATURE_DIR/tasks.md | appended T007 under ## Remediation: Gaps |

Findings: <count by severity> · Edits applied: <N> · Untracked (no edit): <U> · Out of scope files: <M>
Outstanding: <plan drift that fit no section, NEEDS REVISION / NEEDS CLARIFICATION markers written, or "none">
```

Then continue to Step 10. Do not stop here.

## Step 10: Run analyze inline

Invoke `__SPECKIT_COMMAND_ANALYZE__` now, in this session, the same way you would run it
yourself, and wait for it to finish — printing its name is not running it. Then print,
under `## Post-write check — analyze`, its findings table verbatim (or `clean`), and:

- If any finding is **CRITICAL**, print `⚠ WARNING: analyze reports CRITICAL — <one line
  per finding>` **before** Step 11, and say whether this run's edits created it (compare
  with the artifacts as they stood before Step 9) or it predates the run.
- Findings that predate this run — stale text in a `[X]` task this command may not edit,
  for example — are listed as **residue**, not as this run's fault, with one line each.

## Step 11: Run converge inline

Invoke `__SPECKIT_COMMAND_CONVERGE__` the same way and wait. Print, under
`## Post-write check — converge`, its outcome and its findings table verbatim.

- If converge classifies anything this run wrote as `contradicts` or `unrequested`, print
  `⚠ WARNING: converge disputes this run's edits — <which item, which finding>`.
- If it appended tasks, list them and say for each whether it is real remaining work or a
  restatement of something this run already recorded. Converge's own
  `## Phase N: Convergence` write is expected and is not one of this command's writes.

## Step 12: Final status

```markdown
## Drift Sync — final status

Written: <files> · analyze: <clean | N findings, M CRITICAL> · converge: <converged | K tasks appended>
Warnings: <each ⚠ line from Steps 10–11, or "none">
Next: <__SPECKIT_COMMAND_IMPLEMENT__ to complete the K appended tasks | nothing — proceed to review>
```

## Done Criteria

- A rejected invocation, an unresolved feature, or a clean tree wrote nothing.
- Every finding names its source item by the citation ladder and quotes its `+`/`-`
  evidence; every out-of-scope changed file is listed and unopened; every `untracked`
  change has no edit.
- Every plan claim the in-scope hunks make false has a `plan` finding and a proposed edit
  to the line that holds it; a plan untouched by the change was not written.
- After a write, analyze and converge were both actually invoked and their findings printed
  verbatim; every CRITICAL analyze finding and every converge dispute of this run's edits
  carries a `⚠ WARNING` line; the final status names the next command.
- No spec item was deleted; every `removed` finding left a `[NEEDS REVISION]` marker and a
  decision task.
- Nothing was written before an explicit `yes`; on `yes`, exactly the shown diffs were
  written and nothing else; no `[X]` task was edited, no task landed under a Convergence
  phase, no ID was reused.
- Re-running on the same working tree changes nothing further.
