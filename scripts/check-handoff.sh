#!/usr/bin/env bash
# Handoff freshness gate.
#
# `docs/NEXT.md` is the one piece of session-to-session state a machine cannot derive:
# what the next slice is, why, and what will bite. It is therefore also the one piece
# that can silently rot — and per CLAUDE.md's evidence principle, a stale handoff reads
# as authoritative exactly like a current one, which makes it worse than none.
#
# The SessionStart hook already WARNS when the stamp falls behind. This is the hard
# stop: it fails the build once the handoff is too far behind to be trusted, so the
# convention cannot quietly decay into a lie.
#
# Deliberately lenient about WHEN you update it: a small PR need not touch the handoff.
# The budget below is generous enough that ordinary work never trips it, and only a
# genuinely neglected handoff does.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 1

FILE="docs/NEXT.md"
MAX_DRIFT="${HANDOFF_MAX_DRIFT:-20}"

fail() { echo "::error::$1"; echo "❌ check:handoff — $1" >&2; exit 1; }

[ -f "$FILE" ] || fail "$FILE is missing. It is the session handoff; recreate it with a '<!-- written-against: <sha> -->' stamp."

STAMP="$(grep -o 'written-against: [0-9a-f]\{7,40\}' "$FILE" 2>/dev/null | head -1 | awk '{print $2}')"
[ -n "${STAMP:-}" ] || fail "$FILE has no '<!-- written-against: <sha> -->' stamp, so its freshness cannot be checked. Add one pointing at the commit the handoff describes."

git cat-file -e "${STAMP}^{commit}" 2>/dev/null \
  || fail "$FILE is stamped '${STAMP}', which is not a commit in this repository. Re-stamp it to the branch head: sed -i \"s/written-against: [0-9a-f]*/written-against: \$(git rev-parse --short HEAD)/\" $FILE"

# An unrelated stamp (a rewritten or abandoned commit) is as untrustworthy as an old one.
git merge-base --is-ancestor "$STAMP" HEAD 2>/dev/null \
  || fail "$FILE is stamped '${STAMP}', which is not an ancestor of HEAD — the handoff describes a history this branch does not contain. Update it and re-stamp to the branch head."

DRIFT="$(git rev-list --count "${STAMP}..HEAD" 2>/dev/null || echo -1)"
[ "${DRIFT}" -ge 0 ] 2>/dev/null \
  || fail "could not measure drift from '${STAMP}' (is this a shallow clone? CI needs actions/checkout with fetch-depth: 0)."

if [ "$DRIFT" -gt "$MAX_DRIFT" ]; then
  fail "$FILE is ${DRIFT} commits behind HEAD (budget ${MAX_DRIFT}). The handoff has drifted far enough that the next session would be misled by it. Rewrite the next-slice/landmines sections, then re-stamp: sed -i \"s/written-against: [0-9a-f]*/written-against: \$(git rev-parse --short HEAD)/\" $FILE"
fi

echo "✅ check:handoff: $FILE is ${DRIFT} commit(s) behind HEAD (budget ${MAX_DRIFT})."
exit 0
