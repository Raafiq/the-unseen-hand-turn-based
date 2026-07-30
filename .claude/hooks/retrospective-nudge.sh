#!/usr/bin/env bash
# Stop hook — a lightweight NUDGE only. It never edits files.
# If the task you just finished hit errors, surprises, or dead-ends, capture the
# lesson via the `retrospective` skill so it can PROPOSE (approval-gated) updates
# to CLAUDE.md, the docs, an ADR, or a new skill.
set -euo pipefail

echo "[retrospective] If this task hit errors or surprises, run the 'retrospective' skill to capture lessons and propose durable updates (CLAUDE.md / docs / ADR / skill). This nudge changes nothing on its own."
exit 0
