#!/usr/bin/env bash
# Every agent file names a seat. Never fable. (CLAUDE.md, "Model routing")
#
# WHY. Before 2026-09-04 no agent named a model, so every subagent inherited the
# top seat; on a Fable session that put Fable in every specialist. A new agent
# file without `model:` reopens that silently. This fails the build instead.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
fail=0
for f in .claude/agents/*.md; do
  [ "$(basename "$f")" = "README.md" ] && continue
  seat=$(sed -n '2,/^---$/p' "$f" | sed -n 's/^model:[[:space:]]*//p' | head -1)
  case "$seat" in
    opus|sonnet|haiku|claude-opus-*|claude-sonnet-*|claude-haiku-*) ;;
    "")      echo "FAIL $f: no model: line, it would inherit the top seat"; fail=1 ;;
    *fable*) echo "FAIL $f: fable is the top seat only"; fail=1 ;;
    *)       echo "FAIL $f: model '$seat' is not a known seat"; fail=1 ;;
  esac
done
[ $fail -eq 0 ] && echo "check:agents ok ($(ls .claude/agents/*.md | grep -vc README) agent files)"
exit $fail
