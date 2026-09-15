---
name: speckit-sync-rebase
description: After a rebase, detect incoming upstream changes that affect files or names any artifact in the feature directory references, and propose edits to any stale .md file
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: the-unseen-hand
  source: sync:commands/sync-rebase.md
---

Act as the **Rebase Auditor** for one feature. Commits have come in from an upstream branch
(usually `main`). Your job is to find which of those commits touch something that any
artifact in the feature directory relies on, rank what that breaks, and propose the edits
that put every artifact back in line with what upstream now is. **Git is the only detector.
The diff is the only evidence. Nothing is written before one explicit approval.**

## User Input

```text
$ARGUMENTS
```

### Input Parsing

`$ARGUMENTS` holds at most two things, in any order:

- `--since <ref>` — the commit the feature was based on **before** the rebase. Optional;
  only consulted in post-rebase mode (Step 2).
- one bare token — the upstream ref. Optional; default `origin/main`.

Anything else (a second bare token, an unknown `--flag`, a `--since` with no value) is an
error: print `ERROR: Usage: /speckit-sync-rebase [<upstream-ref>] [--since <old-base-ref>]`
and stop. **A rejected invocation writes nothing.**

## Operating Constraints (hard boundary)

- **Writes**: only `.md` files inside the feature directory, only in Step 9, only after the
  Step 8 approval. Never source code. Never any file outside the feature directory.
- **Git is a detector, not a tool for writing**: `rev-parse`, `merge-base`, `log`, `diff`,
  `show`, `ls-files` are allowed. `add`, `commit`, `stash`, `checkout`, `reset`, `rebase`,
  `push` are never run, whatever the user asks.
- **The diff is the source of truth.** Do not read source files that are not in the
  incoming diff, do not scan the repository for other drift, do not take content from any
  other feature, branch, note or memory. Content written into an artifact comes from the
  artifact itself, from the incoming diff, or from `git show <tip>:<file>` for a file the
  diff names.
- **Never edit a task marked `[X]` or `[x]`.** Never delete, renumber or reorder a task,
  a requirement or a section. Never write under a `## Phase N: Convergence` heading.
- **Never remove a spec item because upstream deleted the file behind it.** Mark it for
  revision and append a decision task instead (Step 7).
- **The header block above the first `##` heading of `spec.md` and `plan.md` is never edited.**

## Step 1: Resolve the feature (gate)

Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` once from the repository root and parse `FEATURE_DIR` from its JSON.

- If the script cannot resolve a feature, print
  `ERROR: Feature directory not found. Set SPECIFY_FEATURE_DIRECTORY=specs/<feature> (or run the specify command that writes .specify/feature.json) and re-run.`
  and stop. Do not guess the feature from the git branch.
- Derive `SPEC = FEATURE_DIR/spec.md`, `PLAN = FEATURE_DIR/plan.md`, `TASKS = FEATURE_DIR/tasks.md`.
  The script already requires `spec.md`, `plan.md` and `tasks.md`; if it reports one missing,
  relay its message naming the core command to run, and stop.
- Confirm git: `git rev-parse --is-inside-work-tree` must print `true`; otherwise print
  `ERROR: not a git repository, or git is not on PATH` and stop.

## Step 2: Identify the incoming range

Let `UPSTREAM` be the parsed upstream ref (default `origin/main`).

1. `UPSTREAM_TIP = git rev-parse --verify "$UPSTREAM^{commit}"`. If that fails, print
   `ERROR: upstream ref '<UPSTREAM>' does not resolve` and stop.
2. `NEW_BASE = git merge-base HEAD "$UPSTREAM"`.
3. Decide the mode:
   - **Pre-rebase** (`NEW_BASE != UPSTREAM_TIP`): the branch has not been rebased yet.
     `OLD_BASE = NEW_BASE`, `INCOMING_TIP = UPSTREAM_TIP`. This previews what a rebase will
     bring in.
   - **Post-rebase** (`NEW_BASE == UPSTREAM_TIP`): HEAD already contains everything on
     upstream — either the branch was just rebased, or upstream never moved. The old base
     is, in order: the `--since` value (`git rev-parse --verify <ref>^{commit}`); else, if
     `ORIG_HEAD` exists (`git rebase` leaves one), `git merge-base ORIG_HEAD "$UPSTREAM"`,
     accepted only when it differs from `NEW_BASE`; else there is nothing to audit: report
     **✅ Clean — HEAD already contains `<UPSTREAM>` and no rebase is recorded. If you have
     just rebased and want the incoming changes audited, re-run with `--since <old-base-ref>`.**
     and stop. Otherwise `OLD_BASE = <that>`, `INCOMING_TIP = NEW_BASE`.
     **When the old base came from `ORIG_HEAD`, sanity-check it** — `ORIG_HEAD` is also
     written by `merge`, `reset` and `pull`, so it can be stale:
     - A rebase replays the branch's own commits, so the commits between the old base and
       `ORIG_HEAD` must be the same commits as those between the new base and `HEAD`.
       Compare `git log --format=%s "$OLD_BASE"..ORIG_HEAD` with
       `git log --format=%s "$NEW_BASE"..HEAD` as ordered lists of subjects; the second
       may be shorter by commits upstream already carried, but every subject in it must
       appear in the first, in order. If they do not match, print
       `ERROR: ORIG_HEAD (<sha7>) is not this branch's pre-rebase tip — the commits behind it are not the ones on HEAD. It is probably left over from an earlier rebase, merge or reset. Re-run with --since <old-base-ref>.`
       and stop. (Do not use `merge-base --is-ancestor` for this: a merge-base is an
       ancestor of upstream by definition, so that check can never fail.)
     - Print `Old base derived from ORIG_HEAD (<sha7>, the pre-rebase tip). If that was not
       your rebase, re-run with --since.` so the source of the range is visible.
     `--since` always overrides `ORIG_HEAD`.
4. If `OLD_BASE == INCOMING_TIP`, report **✅ Clean — no incoming commits between
   `<OLD_BASE>` and `<UPSTREAM>`** and stop. Nothing is written.
5. Record `MODE`, both SHAs (abbreviated to 7), and
   `COMMITS = git rev-list --count "$OLD_BASE".."$INCOMING_TIP"` for the report.

## Step 3: Discover artifacts and extract references

List every `.md` file inside `FEATURE_DIR`. Each is an **artifact** this command may read
and, if stale, propose edits to. Read them all in full. Build a **reference table** — one
row per reference and the artifact(s) it appears in, named by the citation ladder (an ID
like `FR-003`, `SC-001`, `US1/AC2`, `T004`, else a quoted heading or opening phrase like
`"export interface Tag"` for a code block), never a bare section name:

- **Paths**: any token containing `/` and a file extension in any artifact, or any path a
  plan section such as Project Structure lists (with or without a trailing description).
  Keep the path, its basename, and its basename without extension.
- **Identifiers from fenced code blocks**: every `export`ed name and every `interface`,
  `type`, `class`, `enum`, `function`, `const` declared in a block, wherever the block sits —
  inside an FR, under an acceptance scenario, under a heading such as `## Contract`, or in
  any secondary artifact (`contracts/*.md`, `data-model.md`, etc.).
- **Identifiers from prose**: any backticked single token that looks like code — contains
  `()`, `.`, `_`, or mixed case (`parseTag`, `Tag`, `formatTag(tag)`).
- **Claims**: every sentence in any artifact that states an obligation or a fact about the
  code — each `TD-###` decision, each `**Constraints**` clause, each Summary sentence that
  says what the code does or never does. A claim names no path and no identifier, so it can
  only be checked against a hunk that is already in scope (Step 4); record it so Step 5 can.

Be conservative: a name that appears anywhere in any artifact is referenced.

## Step 4: Diff the incoming range, bounded to the references

1. `git diff --name-status "$OLD_BASE" "$INCOMING_TIP"` gives every changed file with its
   status (`A`, `M`, `D`, `R…`).
2. A changed file is **in scope** only when any artifact references it by path — its path,
   basename or extension-less basename matches a referenced path. **An identifier hit alone
   never brings a file into scope.** Identifiers are matched only inside files an artifact
   lists by path (architecture, Project Structure, module references), where a `+`/`-` line
   carrying one maps the hunk to the artifact item it touches (Step 5). A file no artifact
   lists enters scope only through a path reference, never through a name it happens to
   share. Every other changed file is **out of scope**: list it under "Changed, not
   referenced" in the report, take no finding from it, and do not open it.
3. For each in-scope file read **only** `git diff "$OLD_BASE" "$INCOMING_TIP" -- <file>`.
   Where a signature or type must be confirmed beyond the hunk, `git show "$INCOMING_TIP":<file>`
   is allowed for that file alone. A status of `D`, or `R` away from a referenced path, is a
   **removal** of a referenced file.

If no file is in scope, report **✅ Clean — `<COMMITS>` incoming commits, `<N>` changed files,
none referenced by any artifact**, list the changed files, and stop. Nothing is written.

## Step 5: Cross-reference and classify

For each in-scope change, for each artifact item that references the file or the touched
identifier, produce one finding with a stable id (`D1`, `D2`, …), a **kind**, a **severity**,
the **source item** (citation ladder), the **evidence** (file, status, the `+`/`-` lines
that matter, the commit if one commit owns the change), and the **artifact it reaches**
(the `.md` file that needs editing).

**Scan every claim in every artifact exhaustively.** Do not stop after the first mismatch
in a file — a single artifact can hold multiple stale claims about the same construct (e.g.
a signature in a code block, a count in a bullet, and a behavioural statement in prose, all
in the same file, all now wrong). Each gets its own finding.

A single upstream change can produce findings in multiple artifacts — e.g. a deleted export
may reach `spec.md`, `contracts/api.md`, and `plan.md`. Record one finding per artifact.

| Kind | Meaning |
|---|---|
| `removed` | a file, export, interface or type the item depends on is gone |
| `signature` | a function or type the item describes changed shape |
| `behaviour` | the diff changes what the item says the code does (branches, returns, errors) |
| `restructured` | a file or module an artifact names moved, split or was renamed |
| `cosmetic` | naming, import path or formatting only |

| Severity | Rule |
|---|---|
| CRITICAL | `removed` — an export, interface, type or file an artifact depends on was changed beyond recognition or deleted |
| HIGH | `signature` or `behaviour` on something an artifact describes |
| MEDIUM | `restructured` on something an artifact references |
| LOW | `cosmetic` |

An item reached only by a `cosmetic` change still gets a finding, so the reader can see it,
but a proposed edit only when the artifact's text is now literally wrong (a renamed import
path an artifact lists, say).

**Then check every claim in every artifact against every in-scope hunk.** A hunk that makes
a claim false (`applyDeployment` now substitutes placements; TD-002 says the save never
does) is a `behaviour` finding whose source is that claim (`plan: TD-002`) and which
reaches the artifact that holds it. Claims are the one reference that has no name to match
on, so this pass is what keeps a prose-only decision from slipping through.

## Step 6: Findings table

Print, sorted CRITICAL → LOW, before any proposal:

```markdown
## Sync Rebase — findings

Mode: <pre-rebase|post-rebase> · Upstream: <UPSTREAM> · Range: <OLD_BASE7>..<INCOMING_TIP7> (<COMMITS> commits)

| ID | Severity | Kind | Source | Evidence | Reaches |
|----|----------|------|--------|----------|---------|
| D1 | CRITICAL | removed | FR-002, "export interface Tag" | `src/tags.ts` deleted in <sha7> | spec.md, tasks.md |

Changed, not referenced: <list, or "none">
```

## Step 7: Propose edits

For every finding that reaches an artifact, draft the exact edit and show it as a **unified
diff** against the current file. Rules:

- **Surgical.** Change the lines the finding reaches and nothing else. Never rewrite a
  section, never reflow prose, never touch the header block.
- **`spec.md`**: amend the FR / SC / scenario text and any fenced block that states the
  old shape — the block inside the FR body and any block under a heading such as
  `## Contract` alike, so the spec never carries two signatures. Write only what the diff
  shows; a value the diff does not state is written as `[NEEDS CLARIFICATION: <what>]`
  (at most three per run).
- **`removed`**: never delete the item. Append ` [NEEDS REVISION: <what> removed upstream in <sha7>]`
  to the end of the item's line — `<what>` names the thing that is gone (a file, an export,
  a type, the sections an FR lists), not the file it lived in when the file still exists —
  and append a decision task (below). If the spec's fenced
  block declares the removed name, leave the block and add the same marker on the line
  above it.
- **`plan.md`**: amend the existing section that holds the stale statement — a
  `**Key**: value` line in Technical Context, a path line in Project Structure, a sentence
  in Summary. Never add a section the plan lacks; if the drift fits nowhere, say so under
  Outstanding and leave the plan alone.
- **Secondary artifacts** (`contracts/*.md`, `data-model.md`, `research.md`, etc.): amend
  the specific line, block or section that is stale. Apply the same surgical rule. Fenced
  code blocks are updated to match what upstream now has. Prose claims are reworded to match
  reality. Never add sections the artifact lacks.
- **`tasks.md`**: append only work the rebase leaves undone — a decision task for every
  `removed` finding (`Decide whether to retire or restore <item> after <path> was removed upstream`),
  and an update task when any artifact names a test file for the changed item that the
  incoming diff did not touch. Format:
  `- [ ] T{NNN} <verb> <what> in <exact/path> per <source> [Drift: <slug>]`.
  Continue the file's ID width and sequence from its highest ID. No `[P]`. Place under
  `## Remediation: Gaps`, creating it at the end of the file only if absent. Never under a
  `## Phase N: Convergence` heading; never near a `[X]` task.
- **Revision note.** `SLUG = rebase-<OLD_BASE7>-<INCOMING_TIP7>`. If any artifact already
  carries `[Drift: <SLUG>]`, amend that entry's `Reason:` and `Items:` lines in place
  rather than adding another. Otherwise append, under a single `## Revisions` heading at
  the bottom of each artifact you edit (create the heading on first use):

  ```markdown
  ### Revision: Drift Rebase <YYYY-MM-DD> [Drift: <SLUG>]
  - Reason: <one line — what came in from upstream>
  - Items: <each entry amended, by the citation ladder>
  ```

  An artifact this run does not edit gets no note.

If no finding reaches an artifact (every finding is `cosmetic`), report **✅ Nothing to
sync — the incoming changes leave every artifact true**, list the findings, and stop. No
gate, and Steps 10–12 do not run.

## Step 8: Approval gate (once, all-or-nothing)

**Before presenting the gate**, scan every proposed edit to **every artifact** for **weakened
obligations**: an edit that removes, narrows, or softens a MUST, MUST NOT, SHALL, SHALL NOT
or SHOULD — in `spec.md` (an FR, a scenario, a contract block) or in any other artifact (a
plan decision like "the fold clamps at zero", a contract bullet like "clamped to a minimum
of 0", a data-model sentence that states a bound).

**Group by root cause, `spec.md` first.** Multiple weakened lines about the same construct
are one root cause. Print a root-cause header, then the lines — `spec.md` first, then other
artifacts:

```
⚠ WEAKENED (1 root cause, 4 obligations softened):

  Floor bound (0 → -1):
    FR-003 in spec.md — "MUST clamp >= 0" → "MUST clamp >= -1"
    TD-001 in plan.md — "clamps at zero" → "clamps at -1"
    "clamped to a minimum of `0`" in contracts/api.md — → "minimum of `-1`"
    "Every caller gets the same floor of zero" in data-model.md — → "floor of -1"
```

These lines appear **above** the approval question so the approver reads them first. A
weakened obligation is not an error — upstream may have deliberately relaxed the constraint
— but it is where an upstream regression can be silently adopted into the spec.

Print every proposed diff, then ask exactly one question:

> Apply all <N> edits to <list of artifacts>? Answer `yes` to write them, anything else to
> write nothing.

Wait for the answer. Only a plain, explicit `yes` (or `y`) applies. Any other answer,
silence, or a request to apply a subset writes **nothing**: print `No changes written.` and
stop. There is no partial apply; the user edits by hand if they want a subset.

## Step 9: Apply and report

Write the approved edits exactly as shown, nothing more. Then verify your own writes with
`git diff --stat -- <FEATURE_DIR>` (read-only) and print:

```markdown
## Sync Rebase — applied

| File (absolute path) | Change |
|---|---|
| /abs/FEATURE_DIR/spec.md | amended FR-001, "export interface Tag" block; revision note |
| /abs/FEATURE_DIR/tasks.md | appended T007 under ## Remediation: Gaps |

Findings: <count by severity> · Edits applied: <N> · Out of scope files: <M>
Outstanding: <NEEDS REVISION / NEEDS CLARIFICATION markers written, plan drift that fit no section, or "none">
```

Then continue to Step 10. Do not stop here.

## Step 10: Validate

**Do not invoke analyze, converge, or any other core command.** The artifacts are already in
context from Step 3. Validate the just-written state by scanning them in place:

**Consistency check.** Re-read each artifact you edited (from context, not disk). For each,
check whether any line this run wrote now contradicts a line in another artifact this run
also wrote, or a line in an artifact this run did not touch. Report each as:

```
V1 CONTRADICTION: <what this run wrote in file A> vs <what file B says> — <which is wrong>
```

If none: `Consistency: clean`.

**Residue check.** List every `[X]` task whose description now contradicts an artifact this
run edited. These are **residue** — this command may not edit them:

```
Residue: T003 "Clamp the fold result at zero" — spec.md now says >= -1
```

If none: `Residue: none`.

**Marker check.** List every `[NEEDS REVISION]` and `[NEEDS CLARIFICATION]` marker this run
wrote, with the file and line.

**Gap check.** Scan `spec.md` for obligations that have no open or completed task after this
run's edits. If this run already appended a task for it, skip. Otherwise report and append
one task per gap under `## Remediation: Gaps` using the same format and rules as Step 7.
This is the only write Step 10 may make.

Print:

```markdown
## Sync Rebase — validation

Consistency: <clean | N contradictions>
Residue: <none | list>
Markers: <none | list>
Gaps: <none | N tasks appended>
Warnings: <each contradiction or gap, or "none">
```

## Step 11: Final status

```markdown
## Sync Rebase — final status

Written: <files> · Validation: <clean | N warnings>
Residue: <list, or "none">
Next: <nothing — review the edits | address the N markers>
```

## Done Criteria

- A rejected invocation, an unresolved feature, an unresolvable upstream, or an
  undeterminable old base wrote nothing.
- The incoming range was computed from git and printed with its mode; no file outside that
  diff was read for content.
- Every finding names its source item by the citation ladder and its evidence by file and
  hunk; every out-of-scope changed file is listed and untouched.
- No spec item was deleted; every `removed` finding left a `[NEEDS REVISION]` marker and a
  decision task.
- Nothing was written before an explicit `yes`; on `yes`, exactly the shown diffs were
  written and nothing else; no `[X]` task was edited, no task landed under a Convergence
  phase, no ID was reused.
- An `ORIG_HEAD`-derived old base was sanity-checked and its origin printed; a stale one
  stopped the run with the `--since` hint.
- After a write, the validation pass ran from context (no core command invoked, no file
  re-read from disk); every contradiction and gap carries a warning line; residue from
  `[X]` tasks is listed.
- Re-running with the same range and an unchanged tree changes nothing further.