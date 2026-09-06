#!/usr/bin/env bash
# PreToolUse hook — a suite, build or check command must not dump its whole
# output into the agent's context.
#
# THE MISTAKE THIS EXISTS FOR. Two viewer-engineer runs spent over 600k tokens in
# one session (2026-09-05). Most of it was suite output: every `npm run test`,
# `playwright test` and `npm run build` was read back in full, and the mutation
# discipline runs each of them a dozen times per slice. A prose rule ("pipe
# through tail") was already in CLAUDE.md and was not followed under pressure.
#
# WHAT IT DOES. A Bash command that runs vitest, playwright, tsc, vite build, or
# `npm run test|test:visual|check|build|state` is denied unless its output is
# bounded: wrapped in `scripts/quiet.sh` (preferred — it keeps the exit code),
# or piped into tail/head/grep/wc/sed, or redirected to a file.
#
# Quoted strings and heredoc bodies are stripped first, as in the other guards:
# a commit message that mentions `npm run test` is text, not a command.
set -u
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.tool_name // empty')" = "Bash" ] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -n "$cmd" ] || exit 0

# ── normalise: drop heredoc bodies and quoted strings (mawk-safe, lifted from
# guard-git-write.sh) ─────────────────────────────────────────────────────────
norm=$(printf '%s\n' "$cmd" | awk '
  skip { if ($0 == term) skip = 0; next }
  {
    print
    p = index($0, "<<")
    if (p > 0) {
      t = substr($0, p + 2)
      sub(/^-/, "", t)
      sub(/^[ \t]+/, "", t)
      if (substr(t, 1, 1) == sprintf("%c", 34)) t = substr(t, 2)
      if (substr(t, 1, 1) == sprintf("%c", 39)) t = substr(t, 2)
      if (match(t, /^[A-Za-z_][A-Za-z0-9_]*/) == 1) {
        term = substr(t, 1, RLENGTH); skip = 1
      }
    }
  }')
norm=$(printf '%s' "$norm" | sed -e "s/'[^']*'/''/g" -e 's/"[^"]*"/""/g')

# Split into command segments (; && ||) and judge each one on its own: a
# bounded build followed by a bare suite is still a bare suite.
segs=$(printf '%s' "$norm" | sed -e 's/&&/\n/g' -e 's/||/\n/g' -e 's/;/\n/g')
suite='(^|[|(][[:space:]]*|^[[:space:]]*)(npx[[:space:]]+)?(vitest([[:space:]]|$)|playwright[[:space:]]+test|vite[[:space:]]+build|tsc([[:space:]]|$)|npm[[:space:]]+test([[:space:]]|$)|npm[[:space:]]+run[[:space:]]+(test|test:visual|check|build|state)([[:space:]]|$))'
offender=""
while IFS= read -r seg; do
  [ -n "$seg" ] || continue
  printf '%s\n' "$seg" | grep -Eq "$suite" || continue
  printf '%s\n' "$seg" | grep -Eq 'scripts/quiet\.sh' && continue
  printf '%s\n' "$seg" | grep -Eq '\|[[:space:]]*(tail|head|grep|wc|sed|awk)([[:space:]]|$)' && continue
  printf '%s\n' "$seg" | grep -Eq '(^|[^&0-9])>[[:space:]]*[^&[:space:]]' && continue
  offender=$seg; break
done <<< "$segs"
[ -n "$offender" ] || exit 0

cat >&2 <<MSG
BLOCK: this runs a suite, build or check and would read its whole output into context.

Wrap it so only the tail comes back and the exit code is kept:
  bash scripts/quiet.sh $(printf '%s' "$cmd" | head -1 | cut -c1-80)
(QUIET_TAIL=60 for more lines; the full log lands in coverage/quiet/.)
A pipe into tail/head/grep, or a redirect to a file, also passes — but a bare
"| tail" returns TAIL's exit code, so a red suite reads green. Prefer the wrapper.

Why: two agents spent 600k tokens reading suite output in one session (CLAUDE.md,
"Two cost rules").
MSG
exit 2
