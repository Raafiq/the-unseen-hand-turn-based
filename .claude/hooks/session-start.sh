#!/usr/bin/env bash
# SessionStart hook — prepare a session (web/remote or local) to work in this repo.
# Guarded and forward-looking: no-ops cleanly while the repo is docs-only.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# Once a JS/TS stack lands, ensure dependencies are present.
if [ -f package.json ]; then
  if [ ! -d node_modules ]; then
    echo "[session-start] installing dependencies…"
    (npm ci || npm install) >/dev/null 2>&1 \
      && echo "[session-start] dependencies ready" \
      || echo "[session-start] dependency install failed — run 'npm install' manually"
  fi
fi

echo "[session-start] the-unseen-hand — read CLAUDE.md and docs/00 for project context; docs/ is the source of truth."
exit 0
