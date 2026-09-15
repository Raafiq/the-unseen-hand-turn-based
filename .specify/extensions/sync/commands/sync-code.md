---
description: "Spec is the source of truth: compare spec.md against every other artifact in the feature directory, update any stale .md file after one approval, then run analyze, converge, implement and converge inline"
argument-hint: ""
scripts:
  sh: ../../scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
  ps: ../../scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
  py: ../../scripts/python/check_prerequisites.py --json --require-tasks --include-tasks
---
Act as the **Plan Steward** for one feature. `spec.md` is the source of truth. Your job is
to compare what `spec.md` says against what every other artifact in the feature directory
claims, find where they disagree, propose the edits that bring every artifact in line with
the spec, ask once, and then drive the code to the new spec through the core commands.
**The spec is the source of truth and is never written here. Each artifact tells you what it
claims; the spec tells you what is true; the edit is "artifact assumes X, spec says Y,
artifact now says Y". Nothing is written before one explicit approval.**

## User Input

```text
$ARGUMENTS
```

This command takes **no arguments**. If `$ARGUMENTS` is non-empty, print
`ERROR: __SPECKIT_COMMAND_SYNC_CODE__ takes no arguments. Set the active feature with SPECIFY_FEATURE_DIRECTORY or .specify/feature.json.`
and stop. **A rejected invocation writes nothing.**

## Operating Constraints (hard boundary)

- **Writes**: only `.md` files inside the feature directory **other than `spec.md`**, only
  in Step 8 (and gap tasks in Step 9), only after the Step 7 approval. **Never `spec.md`**
  — it is the source of truth. Never source code — the user runs
  `/speckit-implement` separately after reviewing the sync output. Never any file outside
  the feature directory.
- **Git**: `rev-parse`, `ls-files` are allowed for repository confirmation and file listing.
  `add`, `commit`, `stash`, `checkout`, `reset`, `rebase`, `push` are never run, whatever
  the user asks.
- **The spec is the source of truth.** Do not take content from git history, other branches,
  other features, notes or memory. Content written into an artifact comes from the artifact
  itself or from `spec.md`. Source files may be read **only** to resolve a described target
  to a real path for a task, never to decide what the spec means.
- **Never invent intent.** A spec statement that implies no change to any other artifact and
  no work is reported and left alone.
- **Never edit a task marked `[X]` or `[x]`.** Never delete, renumber or reorder a task,
  a decision or a section. Never write under a `## Phase N: Convergence` heading.
- **The header block above the first `##` heading of any artifact is never edited.**

## Step 1: Resolve the feature (gate)

Run `{SCRIPT}` once from the repository root and parse `FEATURE_DIR` from its JSON.

- If the script cannot resolve a feature, print
  `ERROR: Feature directory not found. Set SPECIFY_FEATURE_DIRECTORY=specs/<feature> (or run the specify command that writes .specify/feature.json) and re-run.`
  and stop. Do not guess the feature from the git branch.
- Derive `SPEC = FEATURE_DIR/spec.md`, `PLAN = FEATURE_DIR/plan.md`, `TASKS = FEATURE_DIR/tasks.md`.
  If the script reports one missing, relay its message naming the core command to run, and stop.
- Confirm git: `git rev-parse --is-inside-work-tree` must print `true`; otherwise print
  `ERROR: not a git repository, or git is not on PATH` and stop.

## Step 2: Read the spec as source of truth

Read `SPEC` in full. Extract every obligation, requirement, acceptance criterion, code
block, and stated fact — each FR, SC, US/AC, edge case, and fenced block. These are the
**truth statements** that every other artifact must agree with.

## Step 3: Discover and read other artifacts

List every `.md` file inside `FEATURE_DIR` except `spec.md`. Each is a **target artifact**.
Read them all in full. From each, record every **claim** — a sentence, code block, decision,
path, or constraint that states something about the system's behaviour, structure, or
contract. Record where each claim lives (artifact path, citation ladder).

From `tasks.md` specifically, also record every task with its ID, its `[X]`/`[ ]` state,
the file path it names and the spec item it cites (`per FR-002`).

## Step 4: Compare spec against artifacts

For each truth statement in `spec.md`, check whether every artifact that references the
same item agrees. For each mismatch, produce one finding with a stable id (`D1`, `D2`, …),
a **kind**, a **severity**, the **source item** (citation ladder), the **evidence** ("spec
says X, artifact says Y"), and the **artifact it reaches**.

**Scan every claim in every artifact exhaustively.** Do not stop after the first mismatch
in a file — a single artifact can hold multiple stale claims about the same spec item (e.g.
a code block, a count, and a prose statement, all in the same file). Each gets its own
finding.

Also check: does the spec state an obligation that no open task covers and no artifact
mentions? That is an `added` finding — work exists that nothing tracks.

| Kind | Meaning |
|---|---|
| `removed` | an FR, scenario, criterion or section that other artifacts depend on is gone from the spec |
| `changed` | an FR, scenario or criterion now demands something different from what the artifact states |
| `added` | a spec obligation that no other artifact mentions and no open task covers |
| `contract` | a code block in the spec differs from the same block in another artifact |
| `wording` | phrasing only; the obligation is unchanged |

| Severity | Rule |
|---|---|
| CRITICAL | `removed`, or a `changed` FR that a plan decision depends on |
| HIGH | a `changed` or `added` criterion or FR that alters what the plan must deliver |
| MEDIUM | a `contract` change an artifact references; an `added` item the plan already covers |
| LOW | `wording` |

## Step 5: Findings table

```markdown
## Sync Code — findings

Spec items: <S> · Artifacts scanned: <A> · Mismatches: <M>

| ID | Severity | Kind | Source | Evidence | Reaches |
|----|----------|------|--------|----------|---------|
| D1 | HIGH | added | FR-004 | spec defines FR-004 (`describeMovementEffect`), no plan decision or task covers it | plan.md, tasks.md |
| D2 | MEDIUM | contract | FR-002, "floor signature" | spec says `floor(value: number, min: number)`, contracts/api.md says `floor(value: number)` | contracts/api.md |

Wording (no edit): <list, or "none">
```

A `wording` finding is listed and, unless an artifact line quotes the old wording verbatim,
gets no edit. If no finding reaches an artifact, report **✅ Nothing to sync — every
artifact agrees with the spec**, list the findings, and stop; Steps 9–13 do not run.

## Step 6: Propose edits

For every finding that reaches an artifact, draft the exact edit and show it as a **unified
diff** against the current file. Rules:

- **Surgical.** Change the lines the finding reaches and nothing else. Never rewrite a
  section, never reflow prose, never touch the header block.
- **`plan.md`**: amend the line that holds the invalidated claim — a `TD-###` sentence, a
  `**Key**: value` in Technical Context, a Summary sentence, a Project Structure path, a
  phase line. A new deliverable with no home goes as a new `TD-###` line (continuing the
  numbering) under the existing Technical Decisions section, or a new path line under
  Project Structure when the spec names the file; never a new section. Write only what the
  spec states; a value it does not state is `[NEEDS CLARIFICATION: <what>]`, at most three
  per run.
- **`removed`**: never delete a plan decision. Append ` [NEEDS REVISION: <FR-###> removed from spec]`
  to each plan line that depended on the removed item, and list every task citing it under
  Outstanding as an orphan — an open orphan gets a decision task (below); a `[X]` orphan is
  left as the record of what was built.
- **Secondary artifacts** (`contracts/*.md`, `data-model.md`, `research.md`, etc.): amend
  the specific line, block or section that disagrees with the spec. Apply the same surgical
  rule. Fenced code blocks are updated to match the spec's version. Prose claims are
  reworded to match the spec. Never add sections the artifact lacks.
- **`tasks.md`**: append one task per obligation the spec states that no open task covers —
  a new FR to implement, a changed criterion to re-satisfy, a changed contract to apply, a
  test to add where the plan names a test file — and one decision task per open orphan
  (`Decide whether to retire or rewrite <T###> after <FR-###> was removed`). Format:
  `- [ ] T{NNN} <verb> <what> in <exact/path> per <source> [Drift: <slug>]`. The path
  comes from the plan's Project Structure or from an existing file in the repository
  (read-only lookup); when neither gives one, write the task without a path and list it
  under Outstanding. Continue the file's ID width and sequence from its highest ID. No
  `[P]`. Place under `## Remediation: Gaps`, creating it at the end of the file only if
  absent. Never under a `## Phase N: Convergence` heading; never touch a `[X]` task.
- **Revision note.** Each distinct **root cause** gets its own `SLUG` — a short hyphenated
  name describing the spec change (`parse-tags-fr`, `damage-element-rename`). Two findings
  are the same root cause when they trace to the same spec edit in the same FR or section;
  findings about different FRs, different constructs, or unrelated spec changes get separate
  slugs even when they appear in the same run. First read the `[Drift: …]` tags already in
  every artifact: if one names the same root cause, reuse that slug and amend that entry's
  `Reason:` and `Items:` lines in place. Otherwise append, under a single `## Revisions`
  heading at the bottom of each artifact you edit (create it on first use):

  ```markdown
  ### Revision: Sync Code <YYYY-MM-DD> [Drift: <SLUG>]
  - Reason: <one line — what the spec now says differently>
  - Items: <each entry amended or added, by the citation ladder>
  ```

  `tasks.md` gets no note; its `[Drift: …]` tags are the record.

## Step 7: Approval gate (once, all-or-nothing)

After every proposed diff, ask exactly one question:

> Apply all <N> edits to <list of artifacts>? Answer `yes` to write them, anything else to
> write nothing.

Wait for the answer. Only a plain, explicit `yes` (or `y`) applies. Any other answer,
silence, or a request to apply a subset writes **nothing**: print `No changes written.` and
stop. There is no partial apply. Steps 9–10 do not run.

## Step 8: Apply and report

Write the approved edits exactly as shown, nothing more. Verify your own writes with
`git diff --stat -- <FEATURE_DIR>` (read-only) and print:

```markdown
## Sync Code — applied

| File (absolute path) | Change |
|---|---|
| /abs/FEATURE_DIR/plan.md | added TD-003; amended Project Structure; revision note [Drift: <slug>] |
| /abs/FEATURE_DIR/contracts/api.md | amended "floor signature" block; revision note [Drift: <slug>] |
| /abs/FEATURE_DIR/tasks.md | appended T007 under ## Remediation: Gaps |

Findings: <count by severity> · Edits applied: <N> · Wording (no edit): <W> · Artifacts scanned: <A>
Outstanding: <orphaned [X] tasks, NEEDS REVISION / NEEDS CLARIFICATION markers, tasks without a path, or "none">
```

Then continue to Step 9. Do not stop here.

## Step 9: Validate

**Do not invoke analyze, converge, implement, or any other core command.** The artifacts are
already in context from Steps 2–3. Validate the just-written state by scanning them in
place:

**Consistency check.** Re-read each artifact you edited (from context, not disk). For each,
check whether any line this run wrote now contradicts a line in another artifact this run
also wrote, or a line in an artifact this run did not touch. Report each as:

```
V1 CONTRADICTION: <what this run wrote in file A> vs <what file B says> — <which is wrong>
```

If none: `Consistency: clean`.

**Residue check.** List every `[X]` task whose description now contradicts the spec or an
artifact this run edited (e.g. T001 says "ElementSchema" but spec now says
"DamageElementSchema"). These are **residue** — this command may not edit them:

```
Residue: T001 "Implement ElementSchema" — spec.md now says DamageElementSchema
```

If none: `Residue: none`.

**Marker check.** List every `[NEEDS REVISION]` and `[NEEDS CLARIFICATION]` marker this run
wrote, with the file and line.

**Gap check.** Scan `spec.md` for obligations that have no open or completed task after this
run's edits to `tasks.md`. If this run already appended a task for it, skip. Otherwise
report and append one task per gap under `## Remediation: Gaps` using the same format and
rules as Step 6. This is the only write Step 9 may make.

**Open work check.** List every `- [ ]` task now in `tasks.md` — these are what
`/speckit-implement` will execute when the user runs it. Note that the code still lags the
spec; implement is the next step, run by the user.

Print:

```markdown
## Sync Code — validation

Consistency: <clean | N contradictions>
Residue: <none | list>
Markers: <none | list>
Gaps: <none | N tasks appended>
Open tasks for implement: <T### list, or "none">
Warnings: <each contradiction or gap, or "none">
```

## Step 10: Final status

```markdown
## Sync Code — final status

Written: <files> · Validation: <clean | N warnings>
Residue: <list, or "none">
Open tasks: <T### list, or "none">
Next: <__SPECKIT_COMMAND_IMPLEMENT__ to bring the code in line with the spec | nothing — no open tasks>
```

## Done Criteria

- A rejected invocation or an unresolved feature wrote nothing.
- `spec.md` was not written; every finding names its source item by the citation ladder
  and quotes evidence from both the spec and the stale artifact.
- Every claim in every artifact that the spec contradicts has a finding and a proposed edit
  to the line that holds it; a new deliverable with no home got a `TD-###` or a structure
  line, never a new section; no decision was deleted.
- Every obligation the spec states and no open task covers got one task with an exact path
  (or is listed as pathless under Outstanding); every orphaned task is listed; no `[X]`
  task was edited; no task landed under a Convergence phase; no ID was reused.
- Nothing was written before an explicit `yes`; on `yes`, exactly the shown diffs were
  written and nothing else.
- After a write, the validation pass ran from context (no core command invoked, no file
  re-read from disk); every contradiction and gap carries a warning line; residue from
  `[X]` tasks is listed; open tasks are listed for the user to review before implementing.
- Re-running on the same spec and artifacts changes nothing further.
