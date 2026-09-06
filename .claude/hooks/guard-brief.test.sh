#!/usr/bin/env bash
# Fixtures for .claude/hooks/guard-brief.sh. Each BLOCK case is the ALLOW case
# minus exactly one thing, so a guard that stopped checking one word goes red.
set -u
cd "$(git rev-parse --show-toplevel)"
HOOK=.claude/hooks/guard-brief.sh
SID="test-$$-$RANDOM"
trap 'rm -rf "coverage/agent-spawns/$SID"' EXIT
fails=0
t() { # want desc type prompt
  local want=$1 desc=$2 type=$3 prompt=$4 got
  jq -nc --arg s "$SID" --arg t "$type" --arg p "$prompt" \
    '{session_id:$s,tool_name:"Agent",tool_input:{subagent_type:$t,prompt:$p}}' | bash "$HOOK" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then printf '  ok    (%s) %s\n' "$got" "$desc"
  else printf '  FAIL  want=%s got=%s :: %s\n' "$want" "$got" "$desc"; fails=$((fails + 1)); fi
}
ENG="Wire X. ASSERT the img src contains the key. MUTATION: point the table at placeholder, expect red. REPORT in under 15 lines."
echo "-- engineers --"
t 0 "full brief"                        viewer-engineer "$ENG"
t 0 "combat-engineer, full brief"       combat-engineer "$ENG"
t 2 "no MUTATION"                       viewer-engineer "Wire X. ASSERT the src. REPORT in under 15 lines."
t 2 "no ASSERT/DISCRIMINATOR"           viewer-engineer "Wire X. MUTATION: swap it. REPORT in under 15 lines."
t 2 "no report cap"                     viewer-engineer "Wire X. ASSERT the src. MUTATION: swap it. Report back."
t 0 "DISCRIMINATOR counts as ASSERT"    viewer-engineer "Wire X. DISCRIMINATOR: naturalWidth. MUTATION: swap. REPORT under 10 lines."
echo "-- art director --"
t 0 "one pass"                          art-director "Cut ten crops, one pass, no alternatives. REPORT in under 10 lines."
t 2 "no 'no alternatives' / 'one pass'" art-director "Cut ten crops. REPORT in under 10 lines."
echo "-- docs steward, once per session --"
t 0 "first spawn"                       docs-steward "Write the ADR. REPORT in under 10 lines."
t 2 "second spawn, no token"            docs-steward "Rewrite NEXT.md. REPORT in under 10 lines."
t 0 "second spawn with token"           docs-steward "SECOND-PASS-OK: the code changed after the ADR. Rewrite NEXT.md. REPORT in under 10 lines."
echo "-- others need only the cap --"
t 0 "reviewer with cap"                 reviewer "Review the diff. REPORT in under 25 lines."
t 2 "reviewer without cap"              reviewer "Review the diff."
echo "-- other tools pass through --"
jq -nc '{tool_name:"Bash",tool_input:{command:"ls"}}' | bash "$HOOK" >/dev/null 2>&1 && echo "  ok    (0) Bash is not gated" || { echo "  FAIL  Bash was gated"; fails=$((fails+1)); }
echo; [ "$fails" = 0 ] && echo "ALL OK" || { echo "$fails FAILED"; exit 1; }
