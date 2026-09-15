# Spec Kit Sync

Three commands, one rule: **one comparison, one command, one approval.** Each command detects
mismatches between code and artifacts, proposes surgical edits to the feature's own `.md`
files, asks once, and then runs the core Spec Kit commands that finish the loop — inline, in
the same output.

| Command | Source of truth | Detects | Writes (after approval) | Then runs |
|---|---|---|---|---|
| `/speckit-sync-specs` | the code | mismatches between current source files and any `.md` artifact that references them | any `.md` in feature dir | analyze → converge |
| `/speckit-sync-code` | the spec | mismatches between `spec.md` and every other `.md` artifact | any `.md` except `spec.md` | analyze → converge → implement → converge |
| `/speckit-sync-rebase` | incoming `main` | upstream commits that touch what any artifact references | any `.md` in feature dir | analyze → converge |

Command names in the manifest are `speckit.sync.specs`, `speckit.sync.code` and
`speckit.sync.rebase`; the generated skill for `speckit.<id>.<cmd>` is `speckit-<id>-<cmd>`,
which is what gives the invocations above.

## Install

```bash
specify extension add /path/to/spec-kit-sync --dev
```

Requires Spec Kit `>=1.0.6` and a `git` binary on `PATH`. The active feature is resolved
the way core does it: `SPECIFY_FEATURE_DIRECTORY`, then `.specify/feature.json`. There is
no git-branch fallback.

## `/speckit-sync-specs` — code is truth

```text
/speckit-sync-specs        # after changing code, committed or not
```

Reads every source file that any artifact in the feature directory references, compares the
current code against what each artifact claims (signatures, types, behaviour, code blocks,
prose claims), and proposes edits for every mismatch — "artifact says X, code says Y,
artifact now says Y". Changes that map to nothing are reported as `untracked` LOW and left
alone; no requirement is invented. After the approved write it runs `/speckit-analyze` and
`/speckit-converge`.

## `/speckit-sync-code` — spec is truth

```text
/speckit-sync-code         # after editing spec.md
```

Reads `spec.md` as the source of truth and compares it against every other `.md` file in the
feature directory. Finds where plan decisions, contract files, data models, or tasks
disagree with what the spec now states, and proposes surgical edits. It never writes
`spec.md` — that is the developer's edit and the source of truth — and never edits source
directly. After the approved write it runs `/speckit-analyze`, `/speckit-converge`, then
`/speckit-implement` if there is open work, then `/speckit-converge` again to confirm.
Note that `/speckit-implement` executes every open task in `tasks.md`, not only the ones
this run appended; the command lists them before invoking it.

## `/speckit-sync-rebase [<upstream>] [--since <old-base>]` — main came in

```text
/speckit-sync-rebase                          # preview what origin/main would bring in
/speckit-sync-rebase upstream/main            # a different upstream
/speckit-sync-rebase --since a6be379          # after a rebase: audit old-base..origin/main
```

Two modes. **Before the rebase**, the incoming range is `merge-base(HEAD, upstream)..upstream`
— a preview. **After the rebase**, the old base comes from `--since`, else from `ORIG_HEAD`
(what `git rebase` leaves behind), which is sanity-checked: the commits behind it must be
the commits now on `HEAD`. A stale `ORIG_HEAD` stops the run with a `--since` hint. Changed
files enter scope only when any artifact references them by path; a referenced file that
upstream deleted is never silently dropped — the item is marked `[NEEDS REVISION: …]` and a
decision task is appended. After the approved write it runs `/speckit-analyze` and
`/speckit-converge`.

## What every command does after the write

`/speckit-analyze`, then `/speckit-converge`, run **inside** the command and print their
findings inline. A CRITICAL analyze finding, or a converge finding that disputes what the
command just wrote, is surfaced as a `⚠ WARNING` line. Tasks converge appends are listed
with a verdict (real remaining work, or a restatement of what the command already
recorded). `sync-code` additionally runs `/speckit-implement` and a confirming converge.
The final status block names what was written, what each core command found, and the next
command to run — or that nothing is left.

## Conventions shared with `reconcile`

- Never edit a task marked `[X]`; append instead, under `## Remediation: Gaps`, continuing
  the file's `T###` sequence, with an exact file path and no `[P]` marker.
- Never write under a `## Phase N: Convergence` heading — that ledger belongs to converge.
- Surgical, line-level edits; the header block above the first `##` is never touched.
- A `## Revisions` block at the end of each edited artifact, one `### Revision:` entry per
  run, keyed by a slug in a `[Drift: <slug>]` tag. A re-run for the same drift amends its
  own entry. The tag is `Drift:` — not `Sync:`, which is reconcile's tag — so each tool's
  notes stay recognisable and a note written by the 0.x `drift` extension still matches.
- Fenced code blocks are amended wherever they sit — inside an FR, or under `## Contract`.
  Converge only *reads* blocks inside FR / acceptance-scenario bodies, so keep binding
  snippets there if converge is meant to police them.

## What these commands never do

- Edit source code themselves (`sync-code` delegates that to `/speckit-implement`), or run
  any mutating git command (`add`, `commit`, `stash`, `checkout`, `reset`, `rebase`, `push`).
- Write anything before the approval gate, or write a subset of the proposed edits.
- Write any file outside the feature directory.
