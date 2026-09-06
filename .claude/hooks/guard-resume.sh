#!/usr/bin/env bash
# PreToolUse hook — resuming a finished agent is a deliberate act.
#
# THE MISTAKE THIS EXISTS FOR. One viewer-engineer was resumed three times on one
# transcript (2026-09-05) and spent over 600k tokens replaying its own history;
# a fresh agent did the same follow-up in 47k. CLAUDE.md now says "resume only
# when the follow-up needs its memory". Prose lost to habit within the hour.
#
# WHAT IT DOES. A SendMessage to anything other than "main" is denied unless the
# message starts with `RESUME-OK:` — the sender's written statement that this
# follow-up needs the agent's memory. Same shape as the git token: it cannot
# stop the agent, it makes the choice visible. Messages to "main" (a subagent
# reporting up) always pass.
set -u
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.tool_name // empty')" = "SendMessage" ] || exit 0
to=$(printf '%s' "$input" | jq -r '.tool_input.to // empty')
msg=$(printf '%s' "$input" | jq -r '.tool_input.message // empty')
[ -n "$to" ] || exit 0
[ "$to" = "main" ] && exit 0
case "$msg" in RESUME-OK:*) exit 0;; esac
cat >&2 <<MSG
BLOCK: this resumes agent "$to", which replays its whole transcript.

A new task gets a NEW agent with a short brief. Resume only when the follow-up
needs this agent's memory — and then say so: start the message with
  RESUME-OK: <one line on why its memory is needed>

Why: one agent was resumed three times and spent 600k tokens replaying itself;
a fresh agent did the follow-up in 47k (CLAUDE.md, "Two cost rules").
MSG
exit 2
