#!/usr/bin/env bash
# Run a noisy command quietly: full output goes to a log file, only the tail
# reaches the caller's context, and the command's REAL exit code is preserved.
#
# WHY. Every agent that ran a suite read its whole output back into context —
# 976 vitest lines, 135 Playwright lines, a Vite build — and did it again after
# every mutation. Two agents spent over 600k tokens that way in one session
# (2026-09-05). `cmd | tail` is the cheap fix, but it returns TAIL's exit code,
# so a red suite reads as green. This wrapper keeps the code.
#
# Usage:   bash scripts/quiet.sh npm run test
#          QUIET_TAIL=60 bash scripts/quiet.sh npx playwright test e2e/stage.spec.ts
# Output:  the last $QUIET_TAIL lines (default 30), then one line naming the log
#          and the exit code. Logs live in coverage/quiet/ (gitignored).
set -u
[ $# -gt 0 ] || { echo "usage: scripts/quiet.sh <command> [args...]" >&2; exit 64; }
root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
dir="$root/coverage/quiet"
mkdir -p "$dir"
slug=$(printf '%s' "$*" | tr -c 'A-Za-z0-9' '-' | cut -c1-60)
log="$dir/$(date +%Y%m%d-%H%M%S)-$slug.log"
"$@" >"$log" 2>&1
code=$?
tail -n "${QUIET_TAIL:-30}" "$log"
echo "── quiet: exit $code · full log: ${log#$root/} ($(wc -l <"$log") lines)"
exit $code
