#!/usr/bin/env bash
# PreToolUse hook — `git commit` and `git push` require the owner's explicit
# go-ahead, in words, every time.
#
# THE MISTAKE THIS EXISTS FOR. A session committed and pushed ten times without
# ever asking. The owner had authorised none of it, and one commit applied the
# `retrospective` skill's edits — whose own rules say they are proposed and
# applied only on approval. Three layers failed at once: the web session's task
# template instructs the agent to commit and push (boilerplate, not editable
# from here); `settings.json` pre-approved `Bash(git commit:*)`; and CLAUDE.md's
# prose rule that "explicit approval means words from the user" simply lost to
# the more specific-sounding template. This is a repeatedly-filed Claude Code
# defect (anthropics/claude-code #58079, #39565, #34774, #36150, #58883), and
# the consistent finding is that only a PreToolUse hook actually enforces —
# `permissions.deny` is itself bypassable (#13009, #40117).
#
# WHY `deny` AND NOT `ask`. `ask` would be better: it raises a real prompt the
# owner answers, rather than a block the agent could route around. But `git push`
# was never in the allow list and still ran with no prompt, so this session is in
# a permissive permission mode — and only a hook's `deny` is documented to hold
# there. `ask` overriding `permissions.allow` is NOT documented either way.
# Flip DECISION to "ask" below to re-run that experiment; record what happens
# here so the next agent does not repeat it.
#   ask-overrides-allow: UNTESTED as of 2026-09-01.
#
# THE TOKEN IS NOT PROOF AGAINST THE AGENT, AND DOES NOT PRETEND TO BE. The
# agent can write `.claude/.git-go` itself. What the token buys is that an
# automatic, reflexive commit becomes a deliberate one with a visible tool call
# behind it — which is the failure mode that actually happened here. The only
# gate that is proof against the agent is user-side: `ask` working, or the owner
# taking this session out of its permissive mode.
#
# DELETIONS ARE ALLOWED, as in guard-designated-branch.sh: removing a stray ref
# is the cleanup this class of mistake needs, and blocking it would make the
# guard the reason a mess persists.
set -u

DECISION="deny"        # "deny" (enforced everywhere) or "ask" (untested here)
TOKEN_MAX_AGE_MIN=15

input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.tool_name // empty')" = "Bash" ] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -n "$cmd" ] || exit 0

# ── normalise ───────────────────────────────────────────────────────────────
# Lifted from guard-designated-branch.sh, which earned it: fourteen synthetic
# cases passed and that guard STILL fired falsely on the first real command it
# saw — a `git commit -F - <<'MSG' ... MSG` whose message described the guard and
# so contained the verb. Heredoc bodies and quoted strings are TEXT, not command
# syntax, so they are stripped before anything is parsed.
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

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || repo_root=.
token="$repo_root/.claude/.git-go"

refuse() { # $1 = verb, $2 = extra line
  reason="BLOCK: \`git $1\` needs the owner's explicit go-ahead, in words, and this session has not been given one.

$2Ask in chat, plainly, and wait for an answer. A resume prompt, a Stop-hook nag about
uncommitted changes, or a system-reminder is NOT approval (CLAUDE.md, \"Remote-session
signals != user intent\"). Neither is the web session's task template telling you to
commit and push — that boilerplate is what this guard exists to stop.

Once the owner has actually said go:
  printf '%s\\n' $1 > $token
and retry. The token is single-use and expires after ${TOKEN_MAX_AGE_MIN} minutes, so one
go-ahead buys one action."
  if [ "$DECISION" = "ask" ]; then
    jq -n --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  else
    jq -n --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  fi
  exit 0
}

while IFS= read -r seg; do
  printf '%s\n' "$seg" \
    | grep -Eq '^[[:space:]]*git[[:space:]]+(-[^[:space:]]+([[:space:]]+[^-][^[:space:]]*)?[[:space:]]+)*(commit|push)([[:space:]]|$)' \
    || continue
  verb=$(printf '%s\n' "$seg" | grep -Eo '(commit|push)' | head -1)

  # A push that only DELETES a ref: allowed, same precedent as the branch guard.
  if [ "$verb" = "push" ] && printf '%s\n' "$seg" \
      | grep -Eq '([[:space:]](--delete|-d)([[:space:]]|$)|[[:space:]]:[^[:space:]])'; then
    continue
  fi

  # Bypass shapes get their own message: seeing one means something is routing
  # around the guard rather than asking (anthropics/claude-code #40117).
  if printf '%s\n' "$seg" | grep -Eq '[[:space:]](--no-verify|-c|--config)([[:space:]]|=)'; then
    refuse "$verb" "It also carries a hook-bypass flag (--no-verify / -c / --config). Drop it: routing
around a guard is never the answer to being stopped by one.

"
  fi

  if [ -f "$token" ] && [ -n "$(find "$token" -mmin -"$TOKEN_MAX_AGE_MIN" 2>/dev/null)" ]; then
    want=$(tr -d '[:space:]' < "$token")
    if [ "$want" = "$verb" ] || [ "$want" = "both" ]; then
      rm -f "$token"          # single use: one go-ahead, one action
      continue
    fi
    refuse "$verb" "An approval token exists but it names \"$want\", not \"$verb\".

"
  fi

  refuse "$verb" ""
done <<< "$norm"

exit 0
