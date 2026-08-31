#!/usr/bin/env bash
# PreToolUse guard — refuse a push that would strand commits on a MERGED branch.
#
# THE INCIDENT (2026-08-31). PR #48 merged mid-session. A later commit was then
# pushed to the same branch, where it could never be reviewed or merged: a merged
# pull request cannot pick up new commits. Nothing caught it. The SessionStart
# hook's merged-branch warning only fires while HEAD is still an ancestor of
# origin/main — the moment one new commit lands, the branch stops looking merged
# and looks like ordinary unpushed work, which is exactly what the Stop hook
# then reported it as.
#
# THE DISCRIMINATOR. A branch was merged and then continued iff origin/main holds
# a merge commit M whose SECOND parent (the branch tip that was merged) is an
# ancestor of HEAD, while M ITSELF is not. Both halves are load-bearing:
#   · stranded      — HEAD sits on the old tip, M is not in its history  → fires
#   · restarted     — HEAD sits on top of M, so M IS in its history      → silent
#   · fresh branch  — M is in main, which is in HEAD's history           → silent
# Testing only "M^2 is an ancestor" fires on a correctly restarted branch too,
# which is the one case this guard must stay quiet for.
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo '{}')
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$CMD" ] && exit 0
printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)' || exit 0

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0
git rev-parse --verify -q origin/main >/dev/null 2>&1 || exit 0

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
[ "$BRANCH" = "main" ] && exit 0
git merge-base --is-ancestor HEAD origin/main 2>/dev/null && exit 0

for M in $(git rev-list --merges -n 40 origin/main 2>/dev/null); do
  P2="$(git rev-parse -q --verify "${M}^2" 2>/dev/null)" || continue
  git merge-base --is-ancestor "$P2" HEAD 2>/dev/null || continue
  git merge-base --is-ancestor "$M" HEAD 2>/dev/null && continue
  cat >&2 <<MSG
BLOCK: this branch was already MERGED into origin/main, and these commits are stranded.
  merge commit ${M:0:9} brought ${P2:0:9} into main; HEAD is built on ${P2:0:9} but NOT on the merge.
  A merged pull request cannot pick up new commits — pushing here reviews nothing.
  Restart THIS branch from main, keeping the name, and carry the work over:
    git fetch origin main
    git checkout -B ${BRANCH} origin/main
    git cherry-pick <your commits>
  Then open a NEW pull request. If you deliberately intend to push to the old ref, say so to the user first.
MSG
  exit 2
done
exit 0
