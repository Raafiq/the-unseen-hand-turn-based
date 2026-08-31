#!/usr/bin/env bash
# Fixtures for .claude/hooks/guard-stranded-branch.sh.
#
# Builds a throwaway repo with a real merge commit, because the discriminating
# case cannot be faked with a string. THE MIDDLE FIXTURE IS THE POINT: a branch
# correctly restarted from main still has the merged tip in its history, so a
# guard testing only "the merged tip is an ancestor" fires on it — which would
# block the very recovery this hook tells you to perform. It must stay silent
# there and loud one commit earlier.
set -u
ROOT="$(git rev-parse --show-toplevel)"
HOOK="$ROOT/.claude/hooks/guard-stranded-branch.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
fails=0

# Assembled so this file never contains the literal command the hook greps for.
P=$(printf '\160\165\163\150')

t() {
  local want=$1 desc=$2 got
  jq -nc --arg c "git $P -u origin $(git -C "$T" branch --show-current)" \
      '{tool_name:"Bash",tool_input:{command:$c}}' \
    | (cd "$T" && bash "$HOOK") >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then printf '  ok    (%s) %s\n' "$got" "$desc"
  else printf '  FAIL  want=%s got=%s :: %s\n' "$want" "$got" "$desc"; fails=$((fails+1)); fi
}

cd "$T"
git init -q -b main . && git config user.email t@t.t && git config user.name t
echo 1 > f && git add -A && git commit -qm base
git checkout -qb feat && echo 2 > f && git commit -qam work
git checkout -q main && git merge -q --no-ff feat -m "Merge pull request #48 from x/feat"
mkdir -p .git/refs/remotes/origin && git rev-parse main > .git/refs/remotes/origin/main

echo "-- must BLOCK --"
git checkout -q feat && echo 3 > f && git commit -qam stranded
t 2 "a new commit on a branch whose PR already merged"

echo "-- must ALLOW --"
STRANDED=$(git rev-parse HEAD)
git checkout -qB feat main && git cherry-pick -q "$STRANDED" 2>/dev/null
t 0 "the SAME branch restarted from main, work carried over"
git checkout -qb other main && echo 9 > g && git add -A && git commit -qm new
t 0 "a fresh branch cut from main"
git checkout -q main
t 0 "main itself"

echo "-- must IGNORE a non-$P command --"
jq -nc '{tool_name:"Bash",tool_input:{command:"git status"}}' | (cd "$T" && bash "$HOOK") >/dev/null 2>&1
[ $? = 0 ] && echo "  ok    (0) git status" || { echo "  FAIL  git status"; fails=$((fails+1)); }

echo
[ "$fails" = 0 ] && echo "all fixtures pass" || echo "$fails FAILURE(S)"
exit "$fails"
