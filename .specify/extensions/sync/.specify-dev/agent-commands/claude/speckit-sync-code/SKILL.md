---
name: speckit-sync-code
description: 'Spec is the source of truth: compare spec.md against every other artifact in the feature directory, update any stale .md file after one approval, then run analyze, converge, implement and converge inline'
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: the-unseen-hand
  source: sync:commands/sync-code.md
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
`ERROR: /speckit-sync-code takes no arguments. Set the active feature with SPECIFY_FEATURE_DIRECTORY or .specify/feature.json.`
and stop. **A rejected invocation writes nothing.**

## Operating Constraints (hard boundary)

- **Writes**: only `.md` files inside the feature directory **other than `spec.md`**, only
  in Step 8, only after the Step 7 approval. **Never `spec.md`** — it is the source of
  truth. Never source code — Step 11 invokes `/speckit-implement` as its own
  command for that. Never any file outside the feature directory.
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

Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` once from the repository root and parse `FEATURE_DIR` from its JSON.

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
stop. There is no partial apply. Steps 9–13 do not run.

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

## Step 9: Run analyze inline

Invoke `/speckit-analyze` now, in this session, the same way you would run it
yourself, and wait for it to finish — printing its name is not running it. Then print,
under `## Post-write check — analyze`, its findings table verbatim (or `clean`), and:

- If any finding is **CRITICAL**, print `⚠ WARNING: analyze reports CRITICAL — <one line
  per finding>` **before** Step 10, and say whether this run's edits created it (compare
  with the artifacts as they stood before Step 8) or it predates the run.
- Findings that predate this run — stale text in a `[X]` task this command may not edit,
  for example — are listed as **residue**, not as this run's fault, with one line each.

## Step 10: Run converge inline

Invoke `/speckit-converge` the same way and wait. Print, under
`## Post-write check — converge`, its outcome and its findings table verbatim. The code is
expected to lag the spec here; that is the point.

- If converge classifies anything this run wrote as `contradicts` or `unrequested`, print
  `⚠ WARNING: converge disputes this run's edits — <which item, which finding>`.
- If it appended tasks, list them and say for each whether it is real remaining work or a
  restatement of a task this run already appended. Converge's own
  `## Phase N: Convergence` write is expected and is not one of this command's writes.

## Step 11: Run implement inline — only when there is open work

Let `OPEN` be every `- [ ]` task now in `tasks.md`. If `OPEN` is empty, print
`No open tasks — skipping implement.` and go to Step 12.

Otherwise print the list under `## Implement — open tasks it will execute` — **all** of
them, including tasks older than this run, because `/speckit-implement` executes
every open task in the file, not only the ones this run or converge appended — then invoke
`/speckit-implement` the same way and wait. When it finishes, print
`git status --short` and `git diff --stat` (read-only) under `## Implement — what changed`,
and list which tasks it marked `[X]`.

## Step 12: Run converge again

Invoke `/speckit-converge` once more and wait. Print its outcome under
`## Post-implement check — converge`.

- `converged` → the code now satisfies the spec, plan and tasks.
- `tasks_appended` → list the new tasks and print
  `⚠ Not converged after one implement pass — run /speckit-implement again, then /speckit-converge.`
  Do not loop; one implement pass per run.

## Step 13: Final status

```markdown
## Sync Code — final status

Written: <files> · analyze: <clean | N findings, M CRITICAL> · converge: <converged | K tasks appended> · implement: <skipped | executed T### …> · final converge: <converged | K' tasks appended>
Warnings: <each ⚠ line from Steps 9–12, or "none">
Next: <nothing — the code matches the spec | /speckit-implement for the K' remaining tasks | review the NEEDS REVISION markers>
```

## Done Criteria

- A rejected invocation or an unresolved feature wrote nothing and ran no core command.
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
- After a write, analyze, converge, implement (when open work existed) and converge were
  actually invoked, in that order, and their output printed verbatim; every CRITICAL
  analyze finding and every converge dispute carries a `⚠ WARNING` line; the open tasks
  implement would execute were listed before it ran; the final status names the next
  command or says nothing is left.
- Re-running on the same spec and artifacts changes nothing further.