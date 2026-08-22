#!/usr/bin/env bash
# PreToolUse hook — the retrospective skill's own rung-2 workflow gate, applied
# to itself: a PR may only be opened after a session retrospective has run
# (CLAUDE.md "Retrospective before every PR"). The retrospective ends by
# touching the marker below; this hook blocks PR creation while the marker is
# missing or stale, which is the moment the reminder is actually actionable.
# (The old per-turn Stop-hook nudge was removed for firing too often; this one
# fires only when a PR is about to be created.)

set -u
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')

# Only PR-creation calls are gated: the GitHub MCP tool, or a Bash `gh pr create`.
# The Bash check requires `gh` at a command position (line start or after ;, &, |,
# $(, or backtick) — a command that merely MENTIONS the phrase, e.g. in a commit
# message, must not be blocked (that false positive bit the very first commit).
if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
  if ! printf '%s\n' "$cmd" | grep -Eq '(^|[;&|]|\$\(|`)[[:space:]]*gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)'; then
    exit 0
  fi
elif [ "$tool" != "mcp__github__create_pull_request" ]; then
  exit 0
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || repo_root=.
marker="$repo_root/.claude/.retro-done"
max_age_min=240 # a session-scale window; a retro from a previous day is stale

if [ -f "$marker" ] && [ -n "$(find "$marker" -mmin -"$max_age_min" 2>/dev/null)" ]; then
  exit 0
fi

echo "BLOCK: no retrospective recorded for this session (marker $marker missing or older than ${max_age_min}min). Run the retrospective skill first — it ends by touching the marker — then retry the PR. If a retrospective genuinely already ran this session, 'touch $marker' and retry." >&2
exit 2
