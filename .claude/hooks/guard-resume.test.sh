#!/usr/bin/env bash
# Fixtures for .claude/hooks/guard-resume.sh.
set -u
cd "$(git rev-parse --show-toplevel)"
HOOK=.claude/hooks/guard-resume.sh
fails=0
t() { # want desc to message
  local want=$1 desc=$2 to=$3 msg=$4 got
  jq -nc --arg t "$to" --arg m "$msg" '{tool_name:"SendMessage",tool_input:{to:$t,message:$m}}' | bash "$HOOK" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then printf '  ok    (%s) %s\n' "$got" "$desc"
  else printf '  FAIL  want=%s got=%s :: %s\n' "$want" "$got" "$desc"; fails=$((fails + 1)); fi
}
echo "-- must BLOCK --"
t 2 "resume by agent id, no token"     "a7e5711946bb0e1d2" "Apply the reviewer fixes."
t 2 "resume by name, no token"         "viewer-engineer"   "One more pass please."
t 2 "token not at the start"           "a7e5711946bb0e1d2" "Please RESUME-OK: later"
t 2 "lowercase token"                  "a7e5711946bb0e1d2" "resume-ok: needs memory"
echo "-- must ALLOW --"
t 0 "report to main"                   "main"              "Done, 12 files changed."
t 0 "deliberate resume with the token" "a7e5711946bb0e1d2" "RESUME-OK: it holds the mutation table I need re-run."
echo "-- other tools pass through --"
jq -nc '{tool_name:"Bash",tool_input:{command:"ls"}}' | bash "$HOOK" >/dev/null 2>&1 && echo "  ok    (0) Bash is not gated" || { echo "  FAIL  Bash was gated"; fails=$((fails+1)); }
echo; [ "$fails" = 0 ] && echo "ALL OK" || { echo "$fails FAILED"; exit 1; }
