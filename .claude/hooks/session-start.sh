#!/usr/bin/env bash
# SessionStart hook — prepare a session (web/remote or local) to work in this repo,
# and print a DERIVED orientation block so a new session can pick up the thread
# without a human pasting a handoff prompt.
#
# Design note: everything printed here is derived from git at session start, so it
# cannot go stale. The parts a machine CANNOT derive — what the next slice is and
# why — live in docs/NEXT.md, which is stamped with the commit it was written
# against; this hook flags it when it falls behind. A handoff that looks identical
# whether it is current or three slices old is worse than none (CLAUDE.md, the
# evidence principle), so staleness has to be visible.
#
# Must stay FAST and must never fail a session: no network, no test runs, and every
# git call is guarded.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0

if [ -f package.json ] && [ ! -d node_modules ]; then
  echo "[session-start] installing dependencies…"
  (npm ci || npm install) >/dev/null 2>&1 \
    && echo "[session-start] dependencies ready" \
    || echo "[session-start] dependency install failed — run 'npm install' manually"
fi

echo "[session-start] the-unseen-hand — CLAUDE.md + docs/00 are the entry point; docs/ outranks the code."
echo "[session-start] Subtree rules load with the subtree: src/sim/CLAUDE.md, src/render/CLAUDE.md."

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
echo "[session-start] branch: ${BRANCH}"

# The trap this exists to prevent: silently continuing on a branch whose PR already
# merged, which stacks new commits on merged history. Uses the LAST-KNOWN origin/main
# (no fetch — hooks must not block on the network), so it can lag; it errs toward
# telling you to check rather than staying quiet.
if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
  if [ "$BRANCH" != "main" ] && git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
    echo "[session-start] ⚠ this branch is ALREADY MERGED into last-known origin/main."
    echo "[session-start]   Start fresh work from main: git fetch origin main && git checkout -B <new-branch> origin/main"
  fi
  BEHIND="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
  AHEAD="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
  [ "${BEHIND:-0}" != "0" ] && echo "[session-start] ${BEHIND} commit(s) behind last-known origin/main (fetch to confirm)."
  [ "${AHEAD:-0}" != "0" ] && echo "[session-start] ${AHEAD} unpushed commit(s) on this branch."
fi

DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
[ "${DIRTY:-0}" != "0" ] && echo "[session-start] ${DIRTY} uncommitted change(s) in the working tree."

# docs/NEXT.md carries the intent a machine cannot derive. Flag it when it has fallen
# behind the commit it was written against, so a reader knows whether to trust it.
if [ -f docs/NEXT.md ]; then
  STAMP="$(grep -o 'written-against: [0-9a-f]\{7,40\}' docs/NEXT.md 2>/dev/null | head -1 | awk '{print $2}')"
  if [ -n "${STAMP:-}" ] && git cat-file -e "${STAMP}^{commit}" 2>/dev/null; then
    DRIFT="$(git rev-list --count "${STAMP}..HEAD" 2>/dev/null || echo 0)"
    if [ "${DRIFT:-0}" -gt 10 ]; then
      echo "[session-start] ⚠ docs/NEXT.md is ${DRIFT} commits behind HEAD — treat its plan as POSSIBLY STALE and re-derive before acting."
    else
      echo "[session-start] docs/NEXT.md is current (${DRIFT} commits since it was written) — read it for the next slice."
    fi
  else
    echo "[session-start] docs/NEXT.md has no resolvable stamp — treat its plan as unverified."
  fi
else
  echo "[session-start] no docs/NEXT.md — ask the user what the next slice is before starting work."
fi

exit 0
