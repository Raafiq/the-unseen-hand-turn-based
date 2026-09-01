#!/usr/bin/env bash
# Fixtures for .claude/hooks/guard-designated-branch.sh.
#
# The last two are the ones that matter: they are the SHAPE of command that
# actually arrives — a heredoc commit message describing this hook, followed by
# the publish. Every single-line fixture passed while that shape failed.
set -u
cd "$(git rev-parse --show-toplevel)"
HOOK=.claude/hooks/guard-designated-branch.sh
# The record is REAL session state; the fixtures must not leave it overwritten.
saved=$(cat .claude/.session-branch 2>/dev/null || true)
restore() { if [ -n "$saved" ]; then printf '%s\n' "$saved" > .claude/.session-branch; else rm -f .claude/.session-branch; fi; }
trap restore EXIT
# The "no refspec" case resolves against the ACTUAL checked-out branch, so the
# designation under test has to be that branch or the fixture fails wherever it
# is run from. It did: it passed only on the one branch whose name was hardcoded.
DESIGNATED=$(git rev-parse --abbrev-ref HEAD)
echo "$DESIGNATED" > .claude/.session-branch
fails=0

t() {
  local want=$1 desc=$2 cmd=$3 got
  jq -nc --arg c "$cmd" '{tool_name:"Bash",tool_input:{command:$c}}' \
    | bash "$HOOK" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then
    printf '  ok    (%s) %s\n' "$got" "$desc"
  else
    printf '  FAIL  want=%s got=%s :: %s\n' "$want" "$got" "$desc"
    fails=$((fails + 1))
  fi
}

P=$(printf '\160\165\163\150')   # see the note in the guard: %c is not a char code

echo "-- must ALLOW --"
t 0 "the designated branch"        "git $P -u origin $DESIGNATED"
t 0 "force-with-lease, designated" "git $P --force-with-lease -u origin $DESIGNATED"
t 0 "no refspec, on the branch"    "git $P"
t 0 "delete, long form"            "git $P origin --delete claude/landing-page-swap"
t 0 "delete, colon form"           "git $P origin :claude/landing-page-swap"
t 0 "the verb inside a message"    "git commit -m \"then run git $P origin whatever\""
t 0 "the verb inside an echo"      "echo \"git $P origin nope\""
t 0 "HEAD:designated"              "git $P origin HEAD:$DESIGNATED"

echo "-- must BLOCK --"
t 2 "an invented branch"           "git $P -u origin claude/landing-page-swap"
t 2 "straight at main"             "git $P origin main"
t 2 "after a chained check"        "npm run check && git $P -u origin claude/landing-page-swap"
t 2 "src:dst destination"          "git $P origin HEAD:claude/landing-page-swap"
t 2 "--force at another branch"    "git $P --force origin some/other-branch"
t 2 "inside a command substitution" "out=\$(git $P origin some/other-branch)"

echo "-- the shape that actually arrives --"
# A heredoc whose BODY names the verb and a different branch, then the real
# publish at the designated one. The first parser read the message as arguments.
heredoc_ok="git commit -q -F - <<'MSG'
chore(hooks): refuse to $P anywhere but the designated branch

A slice was $P'ed to claude/landing-page-swap by mistake and had to be moved.
14 cases run against the parser, allow and block both.
MSG
git $P -u origin $DESIGNATED"
t 0 "heredoc prose + designated publish" "$heredoc_ok"

heredoc_bad="git commit -q -F - <<'MSG'
chore: some message mentioning $P and origin main
MSG
git $P -u origin claude/landing-page-swap"
t 2 "heredoc prose + invented branch" "$heredoc_bad"

echo "-- no record: fail open --"
mv .claude/.session-branch /tmp/sb-fixture
t 0 "unknown designation"           "git $P -u origin claude/landing-page-swap"
mv /tmp/sb-fixture .claude/.session-branch

echo
[ "$fails" -eq 0 ] && echo "all fixtures pass" || { echo "$fails FAILING"; exit 1; }
