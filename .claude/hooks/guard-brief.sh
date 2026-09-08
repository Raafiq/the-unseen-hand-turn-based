#!/usr/bin/env bash
# PreToolUse hook — a brief names its evidence before an agent is spent on it.
#
# THE MISTAKE THIS EXISTS FOR. The portrait slice (2026-09-06) cost ~830k tokens;
# about a third was avoidable and all of it was in the BRIEFS, not the agents:
#   - the first engineer brief did not ask for identity assertions (asset NAME,
#     not just "some 192px image") or for a mutation per new test, so a second
#     engineer pass (160k) closed what the reviewer then found;
#   - the art director was briefed without "one pass, no alternatives" and
#     delivered face detection plus a fallback set (89k for ten crops);
#   - docs-steward ran twice (150k) because the first pass was briefed before
#     the code constraint (six crops, not ten) had been checked.
# CLAUDE.md already said all of this in prose. Prose lost to habit within the
# hour, exactly as with guard-resume.sh — so the brief is checked at the call.
#
# WHAT IT DOES. Denies an Agent spawn whose prompt lacks the words the waste
# was missing. Like the git token it cannot stop the orchestrator — it can
# always add the words — it makes the omission visible at the moment it costs.
#   every spawn      : a report cap ("REPORT ... under N lines")
#   viewer-engineer, : "MUTATION" (which mutation each new test goes red on) and
#   combat-engineer    "ASSERT" or "DISCRIMINAT" (what each test asserts,
#                      including the IDENTITY of the thing, not only presence)
#   art-director     : "no alternatives" or "one pass"
#   docs-steward     : the SECOND spawn in a session is denied unless the prompt
#                      starts with "SECOND-PASS-OK:" — docs are written once, at
#                      the end, against verified code. Marker per session under
#                      coverage/agent-spawns/ (gitignored).
#   release-engineer : a brief that names a PR is denied while .claude/.retro-done
#                      is missing or older than 240 min — the retro runs BEFORE the
#                      release engineer, or it bounces off require-retro-before-pr.sh
#                      (2026-09-07: 57k; 2026-09-08: 45k).
set -u
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.tool_name // empty')" = "Agent" ] || exit 0
type=$(printf '%s' "$input" | jq -r '.tool_input.subagent_type // "general-purpose"')
prompt=$(printf '%s' "$input" | jq -r '.tool_input.prompt // empty')
sid=$(printf '%s' "$input" | jq -r '.session_id // "unknown"')
repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

missing=()
printf '%s\n' "$prompt" | grep -Eiq 'report[^[:cntrl:]]*under [0-9]+ lines' \
  || missing+=("a report cap — a line with REPORT ... under N lines")

case "$type" in
  viewer-engineer|combat-engineer)
    printf '%s\n' "$prompt" | grep -q 'MUTATION' \
      || missing+=("MUTATION — for each new test, the mutation it must go red on (run it, say so in the report)")
    printf '%s\n' "$prompt" | grep -Eq 'ASSERT|DISCRIMINAT' \
      || missing+=("ASSERT / DISCRIMINATOR — what each new test asserts, including the IDENTITY of the thing (name, key, id), not only that something is present")
    ;;
  art-director)
    printf '%s\n' "$prompt" | grep -Eiq 'no alternatives|one pass' \
      || missing+=("'no alternatives' or 'one pass' — say exactly what to deliver; the art director otherwise renders fallback sets and builds tooling")
    ;;
  docs-steward)
    marker="$repo_root/coverage/agent-spawns/$sid/docs-steward"
    if [ -f "$marker" ]; then
      case "$prompt" in
        SECOND-PASS-OK:*) ;;
        *) missing+=("SECOND-PASS-OK: <why> at the start — docs-steward already ran this session. Docs are written ONCE, at the end, against verified code (two passes cost 150k on 2026-09-06)");;
      esac
    fi
    ;;
  release-engineer)
    if printf '%s\n' "$prompt" | grep -Eiq 'pull request|(^|[^[:alnum:]])PR([^[:alnum:]]|$)|create_pull_request'; then
      retro="${RETRO_MARKER:-$repo_root/.claude/.retro-done}"
      if [ ! -f "$retro" ] || [ -z "$(find "$retro" -mmin -240 2>/dev/null)" ]; then
        missing+=("a retrospective — run the retrospective skill FIRST (it touches .claude/.retro-done); a release engineer spawned before it bounces off require-retro-before-pr.sh (57k on 2026-09-07, 45k on 2026-09-08)")
      fi
    fi
    ;;
esac

if [ ${#missing[@]} -gt 0 ]; then
  {
    echo "BLOCK: the brief for \"$type\" is missing what the last waste was missing:"
    for m in "${missing[@]}"; do echo "  - $m"; done
    echo
    echo "Add it and call again. Why: a third of the portrait slice's 830k tokens went to"
    echo "second passes the first brief should have prevented (CLAUDE.md, \"Brief rules\")."
  } >&2
  exit 2
fi

if [ "$type" = "docs-steward" ]; then
  mkdir -p "$(dirname "$marker")" && : > "$marker"
fi
exit 0
