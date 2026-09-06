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

# The ledger row is the second half of a retrospective (2026-09-06): the owner asked
# "could we have cut the token usage?" after a retro that never looked. Fresh means
# either uncommitted changes to the ledger, or its last commit within the window —
# never the file's mtime, which a fresh clone sets to now.
ledger="$repo_root/docs/token-ledger.md"
ledger_fresh=0
if [ -f "$ledger" ]; then
  if ! git -C "$repo_root" diff --quiet HEAD -- docs/token-ledger.md 2>/dev/null; then
    ledger_fresh=1
  else
    last=$(git -C "$repo_root" log -1 --format=%ct -- docs/token-ledger.md 2>/dev/null || echo 0)
    [ "${last:-0}" -gt $(( $(date +%s) - max_age_min * 60 )) ] && ledger_fresh=1
  fi
fi

if [ -f "$marker" ] && [ -n "$(find "$marker" -mmin -"$max_age_min" 2>/dev/null)" ]; then
  if [ "$ledger_fresh" = 1 ]; then
    exit 0
  fi
  echo "BLOCK: the retrospective ran but docs/token-ledger.md has no row from this session. Cost the session (retrospective skill, step 0), append the row, then retry the PR." >&2
  exit 2
fi

echo "BLOCK: no retrospective recorded for this session (marker $marker missing or older than ${max_age_min}min). Run the retrospective skill first — it ends by touching the marker — then retry the PR. If a retrospective genuinely already ran this session, 'touch $marker' and retry." >&2
exit 2
