# Spec Kit Drift

Two commands that use **git as the detector** for artifact drift, then amend the
feature's own `spec.md`, `plan.md` and `tasks.md` after a single approval.

| Command | Detects | Writes (after approval) |
|---|---|---|
| `speckit.drift.rebase` | Upstream commits (default `origin/main`) that touch files or names the spec or plan reference | `spec.md`, `plan.md`, `tasks.md` |
| `speckit.drift.sync` | Uncommitted working-tree changes (staged, unstaged, and untracked files) that change what the spec or plan describes | `spec.md`, `plan.md`, `tasks.md` |

Under the skills layout the invocations are `/speckit-drift-rebase` and `/speckit-drift-sync`.

**One command, the whole loop.** After the approved write, both commands run
`/speckit-analyze` and then `/speckit-converge` themselves and print their findings inline.
A CRITICAL analyze finding, or a converge finding that disputes what the command just
wrote, is surfaced as a `⚠ WARNING` line; tasks converge appends are listed with a verdict
(real remaining work, or a restatement of what the command already recorded); the final
status block names the next command (`/speckit-implement`, or nothing). You approve once
and read one output.

## Why

Core Spec Kit has no git awareness: `converge` compares code to artifacts with no history,
and the community `reconcile` extension amends artifacts only from a drift the developer
describes by hand. Two gaps follow: nothing notices when a rebase onto `main` breaks an
assumption in the spec or plan, and drift the developer forgot to describe is never
reconciled. Both commands here read the diff, and only the diff, to close them.

## Install

```bash
specify extension add /path/to/spec-kit-drift --dev
```

Requires Spec Kit `>=1.0.6` and a `git` binary on `PATH`. The active feature is resolved
the way core does it: `SPECIFY_FEATURE_DIRECTORY`, then `.specify/feature.json`. There is
no git-branch fallback.

## `speckit.drift.rebase [<upstream>] [--since <old-base>]`

Finds the commits that came in from `<upstream>` and diffs them, filtered to files the
spec or plan reference by path or by an identifier they name. Works in two modes:

- **Before the rebase** (the branch has not been rebased yet): incoming range is
  `merge-base(HEAD, upstream)..upstream`. Use it as a preview.
- **After the rebase** (HEAD already sits on the upstream tip): the old base is taken from
  `--since`, or from `ORIG_HEAD` if `git rebase` left one. If neither resolves, the command
  asks for `--since` and stops.

Findings are ranked CRITICAL → LOW, edits are shown as unified diffs, and nothing is written
until you answer the one approval question. A referenced file that upstream deleted is
never silently dropped from the spec: the item is marked `[NEEDS REVISION: …]` and a
decision task is appended.

```text
/speckit-drift-rebase                          # preview what origin/main would bring in
/speckit-drift-rebase upstream/main            # a different upstream
/speckit-drift-rebase --since a6be379          # after a rebase: audit old-base..origin/main
/speckit-drift-rebase origin/main --since HEAD@{1}
```

**`ORIG_HEAD`.** After a real `git rebase`, the old base is read from `ORIG_HEAD` (the
pre-rebase tip) and the command prints where the range came from. `ORIG_HEAD` is also
written by `merge`, `reset` and `pull`, so it is sanity-checked: the commits behind it must
be the same commits now on `HEAD` (a rebase replays them). A stale `ORIG_HEAD` fails that
check and the command stops with a `--since` hint; `--since` always wins.

## `speckit.drift.sync`

Takes no arguments. Writes `spec.md`, `plan.md` and `tasks.md`: a code change that makes a
plan claim false (a switched data structure, a new dependency, a dropped constraint, a
changed default the Summary states) is a `plan` finding with a proposed plan edit, covered
by the same single approval as the spec edits.

```text
/speckit-drift-sync        # after editing code, before committing
```

Reads `git diff HEAD` plus untracked files, keeps only changes in files the spec or plan
names by path, turns each into a semantic change (export added / removed, signature, type,
behaviour, test), maps it to the spec item it affects, and proposes the edit "spec said X,
code now does Y, spec now says Y". Changes that map to no spec item are reported as
`untracked` LOW and left alone — no requirement is invented for them. A new test assertion
is a `test` LOW finding with no edit. An identifier match (`parseTag` appearing in a hunk)
only maps hunks to spec items inside plan-listed files; a name shared by an unlisted file
never pulls it into scope.

## Conventions shared with `reconcile`

- Never edit a task marked `[X]`; append instead, under `## Remediation: Gaps`, continuing
  the file's `T###` sequence, with an exact file path and no `[P]` marker.
- Never write under a `## Phase N: Convergence` heading — that ledger belongs to converge.
- Surgical, line-level edits; the header block above the first `##` is never touched.
- A `## Revisions` block at the end of `spec.md` / `plan.md`, one `### Revision:` entry per
  run, keyed by a slug in a `[Drift: <slug>]` tag. A re-run for the same drift amends its
  own entry rather than adding a second. The tag is `Drift:` rather than reconcile's
  `Sync:` so that each tool's notes are recognisable as its own.
- Fenced code blocks are amended wherever they sit — inside an FR, or under `## Contract`.
  Note that converge only *reads* blocks inside FR / acceptance-scenario bodies, so keep
  binding snippets there if converge is meant to police them.

## What these commands never do

- Edit source code, or run any mutating git command (`add`, `commit`, `stash`, `checkout`).
- Read code that is not in the diff. If it is not in the diff, it is not in scope.
- Write anything before the approval gate, or write a subset of the proposed edits.
