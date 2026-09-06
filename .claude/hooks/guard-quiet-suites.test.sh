#!/usr/bin/env bash
# Fixtures for .claude/hooks/guard-quiet-suites.sh.
# Each case is the SHAPE of a command an agent actually sent on 2026-09-05.
set -u
cd "$(git rev-parse --show-toplevel)"
HOOK=.claude/hooks/guard-quiet-suites.sh
fails=0
t() {
  local want=$1 desc=$2 cmd=$3 got
  jq -nc --arg c "$cmd" '{tool_name:"Bash",tool_input:{command:$c}}' | bash "$HOOK" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then printf '  ok    (%s) %s\n' "$got" "$desc"
  else printf '  FAIL  want=%s got=%s :: %s\n' "$want" "$got" "$desc"; fails=$((fails + 1)); fi
}
echo "-- must BLOCK --"
t 2 "bare npm run test"                 "npm run test"
t 2 "bare npm test"                     "npm test"
t 2 "bare npm run check"                "npm run check"
t 2 "bare npm run build"                "npm run build"
t 2 "bare npm run test:visual"          "npm run test:visual"
t 2 "bare npm run state"                "npm run state"
t 2 "bare npx vitest run"               "npx vitest run src/render/stage.test.ts"
t 2 "bare playwright test"              "npx playwright test e2e/stage.spec.ts -g expanded"
t 2 "bare tsc"                          "npx tsc -p tsconfig.json --noEmit"
t 2 "build then bare playwright"        "npm run build && npx playwright test e2e/stage.spec.ts"
t 2 "2>&1 alone is not bounded"         "npm run test 2>&1"
t 2 "tail on the build, bare suite"     "npm run build | tail -2; npx playwright test"
echo "-- must ALLOW --"
t 0 "the wrapper"                       "bash scripts/quiet.sh npm run test"
t 0 "the wrapper with QUIET_TAIL"       "QUIET_TAIL=60 bash scripts/quiet.sh npx playwright test e2e/stage.spec.ts"
t 0 "piped to tail"                     "npm run test 2>&1 | tail -5"
t 0 "piped to grep"                     "npm run check 2>&1 | grep -E 'passed|failed'"
t 0 "redirected to a file"              "npx playwright test > coverage/pw.log 2>&1"
t 0 "not a suite"                       "npm run lint"
t 0 "check:counts is not the suite"     "npm run check:counts"
t 0 "grep mentioning vitest"            "grep -n vitest package.json"
t 0 "the verb inside a commit message"  "git commit -m \"run npm run test before pushing\""
t 0 "the verb inside a heredoc"         $'git commit -F - <<\'MSG\'\nthen npm run test\nMSG'
t 0 "the verb inside an echo"           "echo 'npm run check'"
t 0 "git status"                        "git status --short"
echo; [ "$fails" = 0 ] && echo "ALL OK" || { echo "$fails FAILED"; exit 1; }
