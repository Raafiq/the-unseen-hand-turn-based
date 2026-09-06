#!/usr/bin/env bash
# Fixtures for .claude/hooks/require-retro-before-pr.sh, run inside a scratch git repo
# so the real marker and ledger are never touched. Each BLOCK is the ALLOW minus one thing.
set -u
ROOT=$(git rev-parse --show-toplevel)
HOOK=$ROOT/.claude/hooks/require-retro-before-pr.sh
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
cd "$T" && git init -q && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
mkdir -p .claude docs
fails=0
t() { # want desc
  local want=$1 desc=$2 got
  jq -nc '{tool_name:"mcp__github__create_pull_request",tool_input:{}}' | bash "$HOOK" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then printf '  ok    (%s) %s\n' "$got" "$desc"
  else printf '  FAIL  want=%s got=%s :: %s\n' "$want" "$got" "$desc"; fails=$((fails + 1)); fi
}
t 2 "no marker, no ledger"
touch .claude/.retro-done
t 2 "fresh marker, no ledger file"
printf '| row |\n' > docs/token-ledger.md && git add docs/token-ledger.md && git -c user.email=t@t -c user.name=t commit -q -m ledger
t 0 "fresh marker, ledger committed just now"
GIT_COMMITTER_DATE="2020-01-01T00:00:00" git -c user.email=t@t -c user.name=t commit -q --amend --no-edit --date="2020-01-01T00:00:00"
t 2 "fresh marker, ledger last committed years ago, clean tree"
printf '| new row |\n' >> docs/token-ledger.md
t 0 "fresh marker, ledger has uncommitted changes"
touch -d '5 hours ago' .claude/.retro-done
t 2 "stale marker, fresh ledger"
echo "-- other tools pass through --"
jq -nc '{tool_name:"Bash",tool_input:{command:"ls"}}' | bash "$HOOK" >/dev/null 2>&1 && echo "  ok    (0) plain Bash is not gated" || { echo "  FAIL  Bash was gated"; fails=$((fails+1)); }
echo; [ "$fails" = 0 ] && echo "ALL OK" || { echo "$fails FAILED"; exit 1; }
