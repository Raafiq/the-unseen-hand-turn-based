#!/usr/bin/env bash
# Fixtures for .claude/hooks/guard-git-write.sh.
#
# The hook always exits 0 and answers in JSON, so these assert the DECISION on
# stdout, not the exit code — a test reading $? would pass no matter what the
# hook decided.
#
# The fixture that matters most is the last ALLOW: a heredoc commit message whose
# body contains the words "git push". That exact shape defeated the sibling
# branch guard after fourteen single-line fixtures passed. A set without it
# cannot tell a working normaliser from a broken one.
set -u
cd "$(git rev-parse --show-toplevel)"
HOOK=.claude/hooks/guard-git-write.sh
TOKEN=.claude/.git-go
rm -f "$TOKEN"
fails=0

# Returns the decision: "pass" when the hook said nothing (no JSON at all).
decide() {
  local out
  out=$(jq -nc --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}' | bash "$HOOK" 2>/dev/null)
  [ -n "$out" ] || { printf 'pass'; return; }
  printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "pass"'
}

t() {
  local want=$1 desc=$2 cmd=$3 got
  got=$(decide "$cmd")
  if [ "$got" = "$want" ]; then
    printf '  ok    (%s) %s\n' "$got" "$desc"
  else
    printf '  FAIL  want=%s got=%s :: %s\n' "$want" "$got" "$desc"
    fails=$((fails + 1))
  fi
}

# OCTAL escapes in the format string, not %c. bash's printf %c prints the first
# CHARACTER of its argument, so '%c' 99 gives "9". The sibling guard shipped dead
# for its whole life on exactly that mistake, and its fixtures could not see it
# because they made the same one — the test and the thing it tested agreed
# perfectly, on the wrong string. This fixture set caught it only because these
# two lines were checked against a hook that was already known to work.
C=$(printf '\143\157\155\155\151\164')
P=$(printf '\160\165\163\150')

echo "-- must PASS untouched --"
t pass "git status"                 "git status --porcelain"
t pass "git add"                    "git add -A"
t pass "git log"                    "git log --oneline -3"
t pass "git fetch"                  "git fetch origin main"
t pass "npm run check"              "npm run check"
t pass "delete a ref, long form"    "git $P origin --delete claude/stray"
t pass "delete a ref, colon form"   "git $P origin :claude/stray"
t pass "the verb inside an echo"    "echo \"remember to git $C later\""
# The discriminating pair. A heredoc BODY is text, not command syntax: writing a
# file whose contents mention the verbs must pass, while an actual heredoc commit
# must not. A fixture set with only the first would pass against a normaliser that
# strips everything, and one with only the second against a normaliser that strips
# nothing.
# The body line must BEGIN with the verb, at a command position. A first draft
# read "never git commit ... " and could not discriminate: it fails to match the
# pattern with or without the normaliser, so stripping the normaliser left the
# suite green. Mutation is what surfaced that; reasoning about it did not.
t pass "heredoc BODY opens with the verb" "$(printf 'cat > notes.md <<%sMSG%s\ngit %s -m x\ngit %s origin main\nMSG' "'" "'" "$C" "$P")"
t deny "a real heredoc commit"       "$(printf 'git %s -F - <<%sMSG%s\nsubject line\nMSG' "$C" "'" "'")"

echo "-- must be DENIED with no token --"
t deny "a plain commit"             "git $C -m \"whatever\""
t deny "a plain push"               "git $P -u origin some-branch"
t deny "global flag before the verb" "git -C . $C -m \"x\""
t deny "chained after &&"           "npm run check && git $C -m \"x\""
t deny "chained after ;"            "git add -A ; git $C -m \"x\""
t deny "amend"                      "git $C --amend --no-edit"
t deny "no-verify bypass"           "git $C --no-verify -m \"x\""
t deny "-c bypass"                  "git -c core.hooksPath=/dev/null $C -m \"x\""
t deny "force push"                 "git $P --force-with-lease origin main"

echo "-- the token is single-use --"
printf '%s\n' "$C" > "$TOKEN"
t pass "commit allowed with a matching token" "git $C -m \"x\""
t deny "the SAME command again, token consumed" "git $C -m \"x\""

printf '%s\n' "$C" > "$TOKEN"
t deny "a push while the token says commit" "git $P origin main"
rm -f "$TOKEN"

printf '%s\n' both > "$TOKEN"
t pass "both covers push" "git $P origin main"
rm -f "$TOKEN"

# THE DISCRIMINATING BYPASS CASE. With no token every commit is denied anyway, so
# a `--no-verify` fixture without a token scores identically whether the bypass
# check exists or not — it did, and a mutation removing that check left the suite
# green. The token has to be VALID for the fixture to isolate the bypass rule.
printf '%s\n' both > "$TOKEN"
t deny "no-verify refused even WITH a valid token" "git $C --no-verify -m \"x\""
rm -f "$TOKEN"
printf '%s\n' both > "$TOKEN"
t deny "-c hooksPath refused even WITH a valid token" "git -c core.hooksPath=/dev/null $C -m \"x\""
rm -f "$TOKEN"

printf '%s\n' "$C" > "$TOKEN"
touch -d '30 minutes ago' "$TOKEN" 2>/dev/null || touch -A -003000 "$TOKEN" 2>/dev/null
t deny "an expired token" "git $C -m \"x\""
rm -f "$TOKEN"

echo
if [ "$fails" -eq 0 ]; then echo "all fixtures pass"; else echo "$fails FAILING"; fi
exit $((fails > 0))
