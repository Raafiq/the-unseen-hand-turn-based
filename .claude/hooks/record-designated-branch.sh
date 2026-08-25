#!/usr/bin/env bash
# SessionStart hook — record which branch this session was handed.
#
# WHY A FILE AND NOT A LOOKUP. The designated branch is named in the session's
# system prompt and nowhere else: no hook can read it, and nothing in the repo
# knows it. What IS reliable is that a remote session is checked out ON that
# branch when it starts, so the branch at STARTUP is the designation.
#
# STARTUP ONLY. `source` is "resume"/"clear" when the app is reopened, by which
# time the agent may have checked out something else — recording then would
# launder a wrong branch into the record and disarm `guard-designated-branch.sh`,
# which is the one thing this file must not do. A stale record from a previous
# session is handled by the age check below, not by trusting a resume.
set -u

input=$(cat 2>/dev/null || true)
source_kind=$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null || true)
[ "$source_kind" = "resume" ] && exit 0
[ "$source_kind" = "clear" ] && exit 0

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
record="$repo_root/.claude/.session-branch"
branch=$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
[ -z "$branch" ] || [ "$branch" = "HEAD" ] && exit 0

# Rewrite when missing or stale. Half a day is longer than a working session and
# far shorter than the gap between them, so a record never survives to misguard a
# session that started somewhere else.
if [ ! -f "$record" ] || [ -z "$(find "$record" -mmin -720 2>/dev/null)" ]; then
  printf '%s\n' "$branch" > "$record"
fi
exit 0
