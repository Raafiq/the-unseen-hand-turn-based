#!/usr/bin/env bash
# Stop hook — actively surfaces a retrospective prompt to the assistant at each
# task boundary, instead of only whispering to the transcript.
#
# How it stays safe (no infinite loop, no session wedge):
#   - It emits `{"decision":"block","reason":...}` on exit 0 (the supported way a
#     Stop hook feeds an instruction back to Claude and makes it continue).
#   - A per-task FILE GATE (keyed on prompt_id, falling back to session_id) means
#     it blocks AT MOST ONCE per task: the second Stop for the same task finds the
#     gate and exits 0, so the turn ends normally. (The Stop schema has no
#     `stop_hook_active` field, so the gate is the loop guard.)
#   - The gate is set BEFORE the block is emitted, so a mid-script failure can
#     never cause a re-block.
#   - It does NOT force a retrospective — it forces a conscious decision. If the
#     task was smooth, the assistant notes "no durable lesson" and concludes.
#
# Every firing appends to .claude/hooks/retrospective-nudge.log (gitignored) so
# "has it been running?" is answerable from a file.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG="$ROOT/.claude/hooks/retrospective-nudge.log"

input="$(cat 2>/dev/null || true)"

ids="$(printf '%s' "$input" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
sid = str(d.get("session_id") or "nosession")
pid = str(d.get("prompt_id") or sid)
print(sid + "\t" + pid)
' 2>/dev/null || printf 'nosession\tnosession')"
SESSION="${ids%%$'\t'*}"
PROMPT="${ids##*$'\t'}"

GATE="/tmp/claude-retro-gate-${SESSION}-${PROMPT}"
TS="$(date -u +%FT%TZ 2>/dev/null || echo unknown)"

if [ -f "$GATE" ]; then
  printf '%s\tskip (already fired this task)\tsession=%s prompt=%s\n' "$TS" "$SESSION" "$PROMPT" >>"$LOG" 2>/dev/null || true
  exit 0
fi

# Set the gate first — this is the loop guard; it must exist before we block.
: >"$GATE" 2>/dev/null || true
printf '%s\tfired (block)\tsession=%s prompt=%s\n' "$TS" "$SESSION" "$PROMPT" >>"$LOG" 2>/dev/null || true

# Emit ONLY the JSON on stdout (Claude parses stdout as the hook result).
python3 - <<'PY'
import json
reason = (
    "Task boundary reached (retrospective Stop hook). If the work since the last "
    "user turn hit errors, wrong assumptions, blocked actions, or notable rework, "
    "run the `retrospective` skill now to capture the lesson and PROPOSE "
    "(approval-gated) durable updates — CLAUDE.md, the docs, an ADR, or a skill. "
    "If it was smooth with nothing worth codifying, briefly say 'no durable lesson' "
    "and conclude. This nudge fires at most once per task and will not loop."
)
print(json.dumps({"decision": "block", "reason": reason}))
PY
exit 0
