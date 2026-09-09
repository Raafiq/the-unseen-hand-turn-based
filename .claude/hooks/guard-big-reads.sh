#!/usr/bin/env bash
# PreToolUse hook — a big file is read in ranges, never whole.
#
# THE MISTAKE THIS EXISTS FOR. Every agent on the 2026-09-05 stage slice read
# docs/10 (700+ lines), index.html (600+), game.ts and the 2100-line diff in
# full, fresh, on every spawn. Four reviewers and three docs passes each paid
# for the same text. Nobody needed more than a section.
#
# WHAT IT DOES. A Read of a text file longer than $MAX_LINES with no `limit` is
# denied, with the line count and the ask: pass offset/limit, or grep first.
# In Bash, `cat <big file>` with no bounded consumer is denied the same way.
# Images, PDFs and files under the threshold pass. docs/INTENT.md passes whole:
# it is the handoff, and its own rule keeps it under ~150 lines.
set -u
MAX_LINES=400
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

is_text() { case "$1" in *.png|*.jpg|*.jpeg|*.gif|*.webp|*.pdf|*.ipynb|*.woff|*.woff2|*.ttf) return 1;; esac; return 0; }
exempt() { case "$1" in */docs/INTENT.md|docs/INTENT.md) return 0;; esac; return 1; }
lines_of() { wc -l <"$1" 2>/dev/null | tr -d ' '; }

refuse() { # $1 = path, $2 = line count, $3 = how
  cat >&2 <<MSG
BLOCK: $1 is $2 lines and this would read all of it ($3).

Read a range instead — pass offset and limit to Read, or grep for the section
you need and read around it. Files under $MAX_LINES lines pass whole.

Why: every agent on one slice re-read the same 700-line spec in full; the cost
was measured in hundreds of thousands of tokens (CLAUDE.md, "Two cost rules").
MSG
  exit 2
}

case "$tool" in
  Read)
    path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
    limit=$(printf '%s' "$input" | jq -r '.tool_input.limit // empty')
    [ -n "$path" ] && [ -f "$path" ] || exit 0
    is_text "$path" || exit 0
    exempt "$path" && exit 0
    [ -z "$limit" ] || exit 0
    n=$(lines_of "$path")
    [ "${n:-0}" -gt "$MAX_LINES" ] || exit 0
    refuse "$path" "$n" "Read with no limit"
    ;;
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
    [ -n "$cmd" ] || exit 0
    # Bounded consumer anywhere in the command: let it through.
    if printf '%s\n' "$cmd" | grep -Eq '\|[[:space:]]*(tail|head|grep|wc|sed|awk|cut|sort|uniq)([[:space:]]|$)'; then exit 0; fi
    # Each `cat <args>` segment: any existing text file over the threshold.
    printf '%s\n' "$cmd" | grep -Eo '(^|[;&|(][[:space:]]*)cat[[:space:]]+[^;&|]+' | sed -E 's/^[;&|(]*[[:space:]]*cat[[:space:]]+//' \
    | while read -r args; do
        # `cat > f` / `cat >> f <<EOF` WRITES the file; the redirection is the tell.
        case "$args" in *'>'*) continue;; esac
        for a in $args; do
          case "$a" in -*) continue;; esac
          f="$a"; [ -f "$f" ] || f="$root/$a"; [ -f "$f" ] || continue
          is_text "$f" || continue
          exempt "$f" && continue
          n=$(lines_of "$f")
          [ "${n:-0}" -gt "$MAX_LINES" ] || continue
          refuse "$a" "$n" "cat with no bounded consumer"
        done
      done
    exit $?
    ;;
esac
exit 0
