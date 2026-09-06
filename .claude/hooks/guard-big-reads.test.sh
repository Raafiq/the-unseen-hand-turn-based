#!/usr/bin/env bash
# Fixtures for .claude/hooks/guard-big-reads.sh.
# Uses generated files so the fixture does not depend on real file sizes drifting.
set -u
cd "$(git rev-parse --show-toplevel)"
HOOK=.claude/hooks/guard-big-reads.sh
tmp=$(mktemp -d coverage/big-reads.XXXX)
trap 'rm -rf "$tmp"' EXIT
seq 1 401 > "$tmp/big.ts"; seq 1 399 > "$tmp/small.ts"; seq 1 900 > "$tmp/big.png"
fails=0
r() { # want desc json
  local want=$1 desc=$2 json=$3 got
  printf '%s' "$json" | bash "$HOOK" >/dev/null 2>&1; got=$?
  if [ "$got" = "$want" ]; then printf '  ok    (%s) %s\n' "$got" "$desc"
  else printf '  FAIL  want=%s got=%s :: %s\n' "$want" "$got" "$desc"; fails=$((fails + 1)); fi
}
read_json() { jq -nc --arg p "$1" --arg l "${2:-}" '{tool_name:"Read",tool_input:({file_path:$p} + (if $l == "" then {} else {limit:($l|tonumber)} end))}'; }
bash_json() { jq -nc --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}'; }
B=$tmp/big.ts; S=$tmp/small.ts; P=$tmp/big.png
echo "-- must BLOCK --"
r 2 "Read big file, no limit"          "$(read_json "$B")"
r 2 "cat big file"                     "$(bash_json "cat $B")"
r 2 "cat big file among others"        "$(bash_json "cat $S $B")"
r 2 "cat big file after &&"            "$(bash_json "ls && cat $B")"
echo "-- must ALLOW --"
r 0 "Read big file with a limit"       "$(read_json "$B" 120)"
r 0 "Read small file whole"            "$(read_json "$S")"
r 0 "Read an image"                    "$(read_json "$P")"
r 0 "Read docs/NEXT.md whole"          "$(read_json "docs/NEXT.md")"
r 0 "cat small file"                   "$(bash_json "cat $S")"
r 0 "cat big file | head"              "$(bash_json "cat $B | head -40")"
r 0 "cat big file | grep"              "$(bash_json "cat $B | grep 7")"
r 0 "sed a range of the big file"      "$(bash_json "sed -n 100,140p $B")"
r 0 "cat a file that does not exist"   "$(bash_json "cat $tmp/nope.ts")"
r 0 "Read of a missing file"           "$(read_json "$tmp/nope.ts")"
echo; [ "$fails" = 0 ] && echo "ALL OK" || { echo "$fails FAILED"; exit 1; }
