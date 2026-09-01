#!/usr/bin/env bash
# PreToolUse hook — refuse to publish a branch other than the one this session
# was given.
#
# THE MISTAKE THIS EXISTS FOR. The session prompt names one branch and says never
# publish to another without permission. A slice began with `git checkout -B
# some-other-name origin/main`, ran to completion, and was sent there; the work
# then had to be moved, and a stray remote branch was left behind that this
# sandbox cannot remove (the proxy 403s both the git delete-ref and the REST API).
#
# THE PUBLISH IS THE HARMFUL STEP, NOT THE CHECKOUT. Branching locally is cheap
# and reversible; publishing a branch is neither. So this gates one verb only, and
# names the branch it expected — a message at the moment of the mistake, which no
# amount of prose in CLAUDE.md achieved.
#
# WHY THE COMMAND IS NORMALISED BEFORE IT IS PARSED. Fourteen synthetic cases
# passed and the guard STILL fired falsely on the first real command it saw: a
# `git commit -F - <<'MSG' ... MSG` followed by the publish, whose message
# described this very hook and so contained the verb. Splitting on the first
# occurrence read that prose as arguments and reported the branch "against".
# Heredoc bodies and quoted strings are TEXT, not command syntax, so they are
# stripped first — and the fixtures now include the exact command that caught it.
# Single-line fixtures could not have: they did not resemble the real input.
#
# DELETIONS ARE ALLOWED. Removing a ref is the cleanup this failure mode needs,
# and blocking it would make the guard the reason the mess stays.
set -u
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.tool_name // empty')" = "Bash" ] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

# ── normalise ───────────────────────────────────────────────────────────────
# 1. Drop heredoc BODIES, keeping the line that opens them (the real command is on
#    it). The quote characters around a heredoc word are matched by CODE POINT so
#    this program needs no literal quote of its own. 2. Blank out quoted strings.
#    3. Turn every command separator into a newline, so each remaining line begins
#    at a command position by construction.
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
norm=${norm//;/$'\n'}
norm=${norm//&/$'\n'}
norm=${norm//|/$'\n'}
norm=${norm//'$('/$'\n'}
norm=${norm//'`'/$'\n'}

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
record="$repo_root/.claude/.session-branch"
# No record means no designation is KNOWN. Fail open rather than blocking on a
# checkout this hook cannot reason about — a guard that fires when it is
# uninformed gets switched off, and then it guards nothing.
[ -f "$record" ] || exit 0
want=$(tr -d '[:space:]' < "$record")
[ -n "$want" ] || exit 0

# THIS LINE WAS DEAD FOR THE GUARD'S WHOLE LIFE. It read
#   printf '%c%c%c%c' 112 117 115 104
# expecting "push". bash's printf %c prints the FIRST CHARACTER of its argument,
# not a character code, so it yielded "1111" and this hook greppped for `git 1111`
# — every real publish sailed through. The fixtures did not catch it because they
# built their verb the same wrong way: test and subject agreed perfectly, on the
# wrong answer. Octal escapes in the FORMAT string are what printf honours.
verb=$(printf '\160\165\163\150')

while IFS= read -r seg; do
  printf '%s\n' "$seg" \
    | grep -Eq "^[[:space:]]*git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*${verb}([[:space:]]|$)" \
    || continue

  # A deletion in any spelling: `--delete`, `-d`, or a refspec with an empty source.
  printf '%s\n' "$seg" \
    | grep -Eq '([[:space:]](--delete|-d)([[:space:]]|$)|[[:space:]]:[^[:space:]])' \
    && continue

  # Which ref is targeted. Take the tokens after the verb, drop flags, drop the
  # remote, and read the refspec's DESTINATION (`src:dst` targets dst). With no
  # refspec at all, git uses the current branch.
  rest=${seg#*"$verb"}
  target=""
  seen_remote=0
  for tok in $rest; do
    case "$tok" in
      -*) continue ;;
      *) if [ "$seen_remote" -eq 0 ]; then seen_remote=1; continue; fi
         target=${tok##*:}; break ;;
    esac
  done
  [ -n "$target" ] || target=$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null)
  target=${target#refs/heads/}
  { [ -n "$target" ] && [ "$target" != "HEAD" ]; } || continue
  [ "$target" = "$want" ] && continue

  cat >&2 <<MSG
BLOCK: this session's designated branch is "$want", but this targets "$target".

Use "$want" instead — including for follow-up work after its PR merged, which
keeps the same branch name (reset it from the default branch, never invent a new
one). A published stray branch cannot be removed from this sandbox.

If the human has explicitly designated a different branch this session, record it
and retry:  echo <branch> > $record
MSG
  exit 2
done <<< "$norm"

exit 0
