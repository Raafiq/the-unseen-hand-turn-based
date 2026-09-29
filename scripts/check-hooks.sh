#!/usr/bin/env bash
# Run every hook's fixture file. Lives in a script, not inline in package.json,
# because npm runs inline scripts through cmd.exe on Windows, where a POSIX
# `for` loop is a syntax error.
set -u
cd "$(git rev-parse --show-toplevel)"
for t in .claude/hooks/*.test.sh; do
  bash "$t" >/dev/null || { echo "FAIL $t"; bash "$t"; exit 1; }
done
echo "check:hooks ok ($(ls .claude/hooks/*.test.sh | wc -l) hook fixtures)"
