---
name: speckit-sync-specs
description: 'Code is the source of truth: compare referenced source files against every artifact in the feature directory, update any stale .md file after one approval, then run analyze and converge inline'
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: the-unseen-hand
  source: sync:commands/sync-specs.md
---

Act as the **Implementation Auditor** for one feature. The code is the source of truth.
Your job is to read the current state of every source file the feature's artifacts
reference, compare it against what each artifact claims, and propose the edits that make
every artifact describe what the code actually does. **The current code is the only
evidence. Each artifact tells you what it claims; the code tells you what is true; the edit
is "artifact says X, code says Y, artifact now says Y". Nothing is written before one
explicit approval.**

## User Input

```text
$ARGUMENTS
```

This command takes **no arguments**. If `$ARGUMENTS` is non-empty, print
`ERROR: /speckit-sync-specs takes no arguments. Set the active feature with SPECIFY_FEATURE_DIRECTORY or .specify/feature.json.`
and stop. **A rejected invocation writes nothing.**

## Operating Constraints (hard boundary)

- **Writes**: only `.md` files inside the feature directory, only in Step 9, only after the
  Step 8 approval. Never source code. Never any file outside the feature directory.
- **Git**: `rev-parse`, `ls-files`, `status` are allowed for repository confirmation and
  file listing. `add`, `commit`, `stash`, `checkout`, `reset`, `push` are never run,
  whatever the user asks.
- **The code is the source of truth.** Read every referenced source file in its current
  on-disk state. Do not read source files the artifacts do not reference. Do not take
  content from git history, other branches, other features, notes or memory. Content
  written into an artifact comes from the artifact itself or from the current source file.
- **Never invent a requirement.** A code construct that no artifact references is not a
  finding.
- **Never edit a task marked `[X]` or `[x]`.** Never delete, renumber or reorder a task,
  a requirement or a section. Never write under a `## Phase N: Convergence` heading.
- **The header block above the first `##` heading of any artifact is never edited.**

## Step 1: Resolve the feature (gate)

Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` once from the repository root and parse `FEATURE_DIR` from its JSON.

- If the script cannot resolve a feature, print
  `ERROR: Feature directory not found. Set SPECIFY_FEATURE_DIRECTORY=specs/<feature> (or run the specify command that writes .specify/feature.json) and re-run.`
  and stop. Do not guess the feature from the git branch.
- Derive `SPEC = FEATURE_DIR/spec.md`, `PLAN = FEATURE_DIR/plan.md`, `TASKS = FEATURE_DIR/tasks.md`.
  If the script reports one missing, relay its message naming the core command to run, and stop.
- Confirm git: `git rev-parse --is-inside-work-tree` must print `true`; otherwise print
  `ERROR: not a git repository, or git is not on PATH` and stop.

## Step 2: Discover artifacts

List every `.md` file inside `FEATURE_DIR` (non-recursive is sufficient; if the directory
contains subdirectories with `.md` files, include those too). Each is an **artifact** this
command may read and, if stale, propose edits to. Record them by path and note `spec.md`,
`plan.md` and `tasks.md` as the primary artifacts; all others are secondary.

## Step 3: Build the reference table

Read every artifact in full. Build a **reference table** — one row per reference and the
artifact(s) it appears in, named by the citation ladder (an ID like `FR-003`, `SC-001`,
`US1/AC2`, `TD-001`, else a quoted heading or opening phrase like `"export interface Tag"`
for a code block), never a bare section name:

- **Paths**: any token containing `/` and a file extension in any artifact. Keep the path,
  its basename, and its basename without extension.
- **Identifiers from fenced code blocks**: every `export`ed name and every `interface`,
  `type`, `class`, `enum`, `function`, `const` declared in a block, wherever the block
  sits — inside an FR, under an acceptance scenario, under a heading such as `## Contract`,
  or in any secondary artifact.
- **Identifiers from prose**: any backticked single token that looks like code — contains
  `()`, `.`, `_`, or mixed case.
- **Claims**: every sentence in any artifact that states a decision or a fact about the
  code — each `TD-###`, each `**Constraints**` clause, each Summary sentence that says what
  the code does or never does (`"clamps at zero"`, `"depends only on trait.ts"`,
  `"pure functions only"`). A claim names no path and no identifier, so it is checked only
  against source files already in scope. Record which artifact and line the claim lives in.

## Step 4: Read referenced source files

For each unique path in the reference table, read the file's current on-disk content. If a
referenced file does not exist, record it as **missing** — this may produce a finding in
Step 5.

Do not read files the artifacts do not reference. The reference table is the scope boundary.

## Step 5: Compare and classify

For each artifact claim, code block, or reference, compare it against the current state of
the source file it describes. Produce one finding per mismatch, with a stable id (`D1`,
`D2`, …), a **kind**, a **severity**, the **source item** (citation ladder), the
**evidence** ("artifact says X, code says Y"), and the **artifact it reaches** (the file
that needs editing).

A single code change can produce findings in multiple artifacts — e.g. a signature change
may reach `spec.md`, `contracts/api.md`, and `plan.md`. Record one finding per artifact.

| Kind | Meaning |
|---|---|
| `missing` | a file, export, type or behaviour an artifact depends on does not exist in the codebase |
| `signature` | a function or type the artifact describes has a different shape in the code |
| `behaviour` | the code does something different from what the artifact states |
| `stale-ref` | a path, import or module name the artifact cites has moved or been renamed |
| `untracked` | a code construct exists at a referenced path but no artifact mentions it |
| `cosmetic` | the mismatch is naming, formatting or comment-level only |

| Severity | Rule |
|---|---|
| CRITICAL | `missing` — the artifact's export, type, file or behaviour does not exist |
| HIGH | `signature` or `behaviour` — the code plainly differs from what the artifact states |
| MEDIUM | `stale-ref` — the artifact's path or name is wrong but the construct still exists elsewhere |
| LOW | `untracked`, `cosmetic` |

An `untracked` finding gets **no proposed edit**. It is surfaced so the developer can decide
whether it needs a requirement; this command never writes one.

**Exception — quantitative and exhaustive claims.** After classifying `untracked` constructs,
re-check every artifact claim that makes a count or exhaustive assertion about a referenced
file's exports, members, or values (e.g. "exactly two runtime values", "three public
methods", "only `foo` and `bar` are exported"). If an `untracked` construct at that file
makes the count or enumeration false, produce a **separate** `behaviour` HIGH finding for
each such claim, reaching the artifact that holds it. The `untracked` finding stays (it
records that no artifact names the construct); the `behaviour` finding records that a
claim the artifact *does* make is now wrong. The `untracked` construct itself still gets no
requirement — only the stale count or enumeration is edited.

## Step 6: Findings table

```markdown
## Sync Specs — findings

Source files read: <N> · Artifacts scanned: <A> · Mismatches: <M>

| ID | Severity | Kind | Source | Evidence | Reaches |
|----|----------|------|--------|----------|---------| 
| D1 | HIGH | signature | FR-001, "export interface Tag" | spec.md says `parseTag(input: string)`, code has `parseTag(input: string, opts?: ParseOptions)` | spec.md |
| D2 | HIGH | signature | "parseTag signature", contracts/api.md | contracts/api.md says `parseTag(input: string)`, code has `parseTag(input: string, opts?: ParseOptions)` | contracts/api.md |

Untracked (no edit): <list, or "none">
```

## Step 7: Propose edits

For every finding that reaches an artifact, draft the exact edit and show it as a **unified
diff** against the current file. Rules:

- **Surgical.** Change the lines the finding reaches and nothing else. Never rewrite a
  section, never reflow prose, never touch the header block.
- **`spec.md`**: amend the FR / SC / scenario prose **and** every fenced block that states
  the old shape — the block inside the FR body and any block under `## Contract` alike, so
  the spec never carries two signatures. New parameters, fields and branches are described
  in the FR's own wording; keep the Given/When/Then form a scenario already uses. Write only
  what the code shows; a value the code does not make clear (a default the spec would need,
  a unit) is written as `[NEEDS CLARIFICATION: <what>]`, at most three per run.
- **`missing`**: never delete the item. Append ` [NEEDS REVISION: <what> not found in codebase]`
  to the item's line and append a decision task (below).
- **`plan.md`**: amend the existing line that holds the false claim — a `**Key**: value` in
  Technical Context, a `TD-###` sentence, a Summary sentence, a Project Structure path.
  Write what the code shows, in the plan's own wording. Never add a section the plan lacks;
  if the drift fits nowhere, say so under Outstanding and leave the plan alone.
- **Secondary artifacts** (`contracts/*.md`, `research.md`, `data-model.md`, etc.): amend
  the specific line, block or section that is stale. Apply the same surgical rule — change
  only what the finding reaches. Fenced code blocks are updated to match the code. Prose
  claims are reworded to match reality. Never add sections the artifact lacks.
- **`tasks.md`**: append only work the comparison leaves visibly undone:
  - a decision task per `missing` finding
    (`Decide whether to retire or restore <item> — <what> not found in codebase`);
  - an update task when a test file the plan or tasks name for the changed item has not
    been updated (`Update tests for <item> in <exact/test/path>`).
  Never a task for `untracked` or `cosmetic`. Format:
  `- [ ] T{NNN} <verb> <what> in <exact/path> per <source> [Drift: <slug>]`.
  Continue the file's ID width and sequence from its highest ID. No `[P]`. Place under
  `## Remediation: Gaps`, creating it at the end of the file only if absent. Never under a
  `## Phase N: Convergence` heading; never touch a `[X]` task.
- **Revision note.** Each distinct **root cause** gets its own `SLUG` — a short hyphenated
  name describing the logical change (`parse-tag-options`, `movement-jump-key`). Two
  findings are the same root cause when they trace to the same code change in the same
  construct; findings about different constructs, different files, or unrelated behavioural
  changes get separate slugs even when they appear in the same run. First read the
  `[Drift: …]` tags already in every artifact: if one names the same root cause, reuse that
  slug and amend that entry's `Reason:` and `Items:` lines in place. Otherwise append, under
  a single `## Revisions` heading at the bottom of each artifact you edit (create it on
  first use):

  ```markdown
  ### Revision: Drift Sync <YYYY-MM-DD> [Drift: <SLUG>]
  - Reason: <one line — what the code does differently from what the artifact claimed>
  - Items: <each entry amended, by the citation ladder>
  ```

  An artifact this run does not edit gets no note. `tasks.md` gets no note; its
  `[Drift: …]` tags are the record.

If no finding reaches an artifact (every finding is `untracked` or `cosmetic`), report
**✅ Nothing to sync — the code matches every artifact**, list the findings, and stop. No
gate, and Steps 10–12 do not run.

## Step 8: Approval gate (once, all-or-nothing)

**Before presenting the gate**, scan every proposed edit to `spec.md` for **weakened
obligations**: an edit that removes, narrows, or softens a MUST, MUST NOT, SHALL, SHALL NOT
or SHOULD (e.g. a throw that stops throwing, a guard that accepts a wider range, a
constraint that is dropped or downgraded). For each, print a `⚠ WEAKENED` line:

```
⚠ WEAKENED: FR-008 — "MUST throw on bound <= 0" → "MUST throw on bound < 0" (bound === 0 no longer throws)
```

These lines appear **above** the approval question so the approver reads them first. A
weakened obligation is not an error — the code may be right and the old spec wrong — but it
is the place where a code bug can be laundered into the spec. The approver decides.

After the `⚠ WEAKENED` lines (if any) and every proposed diff, ask exactly one question:

> Apply all <N> edits to <list of artifacts>? Answer `yes` to write them, anything else to
> write nothing.

Wait for the answer. Only a plain, explicit `yes` (or `y`) applies. Any other answer,
silence, or a request to apply a subset writes **nothing**: print `No changes written.` and
stop. There is no partial apply.

## Step 9: Apply and report

Write the approved edits exactly as shown, nothing more. Verify your own writes with
`git diff --stat -- <FEATURE_DIR>` (read-only) and print:

```markdown
## Sync Specs — applied

| File (absolute path) | Change |
|---|---|
| /abs/FEATURE_DIR/spec.md | amended FR-001, US1/AC1, "export interface Tag" block; revision note [Drift: <slug>] |
| /abs/FEATURE_DIR/contracts/api.md | amended "parseTag signature" block; revision note [Drift: <slug>] |
| /abs/FEATURE_DIR/tasks.md | appended T007 under ## Remediation: Gaps |

Findings: <count by severity> · Edits applied: <N> · Untracked (no edit): <U> · Artifacts scanned: <A>
Outstanding: <NEEDS REVISION / NEEDS CLARIFICATION markers written, or "none">
```

Then continue to Step 10. Do not stop here.

## Step 10: Run analyze inline

Invoke `/speckit-analyze` now, in this session, the same way you would run it
yourself, and wait for it to finish — printing its name is not running it. Then print,
under `## Post-write check — analyze`, its findings table verbatim (or `clean`), and:

- If any finding is **CRITICAL**, print `⚠ WARNING: analyze reports CRITICAL — <one line
  per finding>` **before** Step 11, and say whether this run's edits created it (compare
  with the artifacts as they stood before Step 9) or it predates the run.
- Findings that predate this run — stale text in a `[X]` task this command may not edit,
  for example — are listed as **residue**, not as this run's fault, with one line each.

## Step 11: Run converge inline

Invoke `/speckit-converge` the same way and wait. Print, under
`## Post-write check — converge`, its outcome and its findings table verbatim.

- If converge classifies anything this run wrote as `contradicts` or `unrequested`, print
  `⚠ WARNING: converge disputes this run's edits — <which item, which finding>`.
- If it appended tasks, list them and say for each whether it is real remaining work or a
  restatement of something this run already recorded. Converge's own
  `## Phase N: Convergence` write is expected and is not one of this command's writes.

## Step 12: Final status

```markdown
## Sync Specs — final status

Written: <files> · analyze: <clean | N findings, M CRITICAL> · converge: <converged | K tasks appended>
Warnings: <each ⚠ line from Steps 10–11, or "none">
Next: </speckit-implement to complete the K appended tasks | nothing — proceed to review>
```

## Done Criteria

- A rejected invocation or an unresolved feature wrote nothing.
- Every finding names its source item by the citation ladder and quotes evidence from both
  the artifact and the code; every `untracked` finding has no edit.
- Every claim in every artifact that the code contradicts has a finding and a proposed edit
  to the line that holds it; an artifact untouched by any finding was not written.
- After a write, analyze and converge were both actually invoked and their findings printed
  verbatim; every CRITICAL analyze finding and every converge dispute of this run's edits
  carries a `⚠ WARNING` line; the final status names the next command.
- No spec item was deleted; every `missing` finding left a `[NEEDS REVISION]` marker and a
  decision task.
- Nothing was written before an explicit `yes`; on `yes`, exactly the shown diffs were
  written and nothing else; no `[X]` task was edited, no task landed under a Convergence
  phase, no ID was reused.
- Re-running on the same codebase and artifacts changes nothing further.