# Changelog

## 2.1.0

- **Breaking: post-write chain replaced with inlined validation.** All three commands no
  longer invoke `/speckit-analyze`, `/speckit-converge`, or `/speckit-implement`. Instead,
  a validation pass runs from artifacts already in context — checking consistency, residue
  (`[X]` tasks that contradict edited artifacts), markers, and gaps. No file is re-read
  from disk. Saves ~55% of `sync-code` token consumption and ~20% of `sync-specs`.
- **Breaking: `sync-code` no longer runs implement.** After syncing artifacts to match the
  spec, the command lists open tasks and tells the user to run `/speckit-implement` when
  ready. This gives the user a review point between artifact updates and code changes, and
  eliminates the largest single token cost (43% of `sync-code` input in profiling).
- `sync-specs` pre-filter now prints the list of skipped files so the reader sees what
  wasn't checked — addresses the blind-window ambiguity where `✅ Nothing to sync` looked
  the same whether the feature was aligned or hiding old drift.
- `⚠ WEAKENED` lines are now grouped by root cause with `spec.md` obligations first and a
  count header (`⚠ WEAKENED (1 root cause, 4 obligations softened):`). Reduces approver
  fatigue when one code change softens the same bound across many artifacts.
- Version bump from 2.0.0 — the manifest now reflects prompt changes that shipped during
  the 2.0.0 development cycle.

## 2.0.0

- **Breaking: detection model** — `sync-specs` and `sync-code` now compare the current
  state of code/spec against artifacts, instead of relying on uncommitted diffs. Committed
  drift that was never synced is now detected.
- **Breaking: artifact scope** — all three commands can now read and write any `.md` file
  inside the feature directory, not just `spec.md`, `plan.md` and `tasks.md`. Secondary
  artifacts like `contracts/*.md`, `data-model.md`, and `research.md` are discovered
  automatically, matched by content (references, code blocks, claims), and proposed for
  editing when stale.
- `sync-rebase` remains diff-based (upstream range only); its artifact scope is expanded.
- Source-of-truth exclusions unchanged: `sync-code` never writes `spec.md`; `sync-specs`
  never writes source code.
- `sync-specs` evidence format changed from `+`/`-` diff lines to
  `"artifact says X, code says Y"`.
- `sync-code` no longer requires `spec.md` to be committed (no diff baseline needed).
- `removed` kind renamed to `missing` in `sync-specs` (reflects full-state semantics:
  the construct is absent, not necessarily recently removed).
- Fix: `untracked` exports that invalidate a count or exhaustive claim in a referenced
  artifact now produce a separate `behaviour` HIGH finding for the stale claim.
- Fix: slug granularity is now one slug per root cause, not per run. Findings about
  different constructs or unrelated changes get separate slugs and separate revision notes.
- Fix: `⚠ WEAKENED` scan now covers every written artifact, not just `spec.md`. A softened
  obligation in `plan.md`, `contracts/api.md`, or any other artifact is flagged at the gate.
- Fix: the per-artifact claim scan is now explicitly exhaustive — the agent must check every
  claim in each file, not stop after the first mismatch. Prevents residual misses where a
  second stale claim sits near an already-found one.
- `sync-specs` now uses a git pre-filter by default: only source files changed since the
  artifacts' last commit are read. Reduces token consumption by ~33% on large features.
  `--full` bypasses the filter and reads everything. Trade-off: drift committed before the
  artifacts' last commit is invisible without `--full`.
- Fix: `sync-specs` and `sync-rebase` now flag `⚠ WEAKENED` at the approval gate when
  a proposed edit removes, narrows, or softens a MUST/MUST NOT/SHALL/SHALL NOT/SHOULD
  in `spec.md`, so the approver sees where a code bug could be laundered into the spec.

## 1.0.0

- Rename: extension `drift` → `sync`; `speckit.drift.sync` → `speckit.sync.specs`
  (`/speckit-sync-specs`), `speckit.drift.rebase` → `speckit.sync.rebase`
  (`/speckit-sync-rebase`). Prompt content unchanged apart from command references.
- Add: `speckit.sync.code` (`/speckit-sync-code`) — the spec-first direction. Reads the
  uncommitted diff of `spec.md`, updates `plan.md` and `tasks.md` after one approval, then
  runs analyze → converge → implement → converge inline. Never writes `spec.md`.
- Fix: `sync-specs` and `sync-rebase` stop with "Nothing to sync" when findings exist but
  none reaches an artifact, instead of asking an empty approval question.
- Kept: the `[Drift: <slug>]` revision tag, so a note written by 0.x is still recognised
  and so the tag never collides with reconcile's `[Sync: …]`.

## drift 0.3.0

- Both commands run analyze and converge inline after the approved write; `sync` writes
  `plan.md`; `rebase` sanity-checks an `ORIG_HEAD`-derived old base.

## drift 0.2.0

- Scope by path only; `test` kind for new test assertions.

## drift 0.1.0

- Initial build: `speckit.drift.rebase`, `speckit.drift.sync`.
