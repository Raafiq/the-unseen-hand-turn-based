# Changelog

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
