# ADR-0005: Agent-first project setup (config + skills + retrospective loop)

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** maintainer

## Context

The project will be developed largely with AI coding agents, so the repo should be optimized for agent-first usage from the start: durable context, consistent conventions, and a way to compound lessons. We evaluated committing project-scoped skills, a code-intelligence MCP ("code graph"), and a continuous-improvement loop.

## Options considered

1. **No repo tooling** — rely on ad-hoc prompting; guidance drifts and lessons are lost between sessions.
2. **Code-graph MCP now** — enable Serena / a local-first graph immediately; but a code graph over a docs-only repo adds noise and can cost more tokens than it saves.
3. **Committed skills + config now; MCP scaffolded, enabled at P0; a retrospective loop** — durable, agent-first, without premature tooling.

## Decision

Option 3. Commit `CLAUDE.md`, `.claude/settings.json` (permission allowlist + hooks), a guarded SessionStart hook, `.gitignore`, and seven project skills (`repo-orientation`, `sim-determinism-guard`, `game-design`, `decision-record`, `brainstorm`, `grill-me`, `retrospective`). Scaffold a code-intelligence MCP in `.mcp.example.json`, disabled until P0. Add a retrospective loop: a Stop-hook *nudge* + a `retrospective` skill that **proposes** (approval-gated) updates to guidance.

## Consequences

- Every session/teammate/CI agent inherits the same conventions and locked decisions.
- `brainstorm`/`grill-me` are authored project-local versions (Anthropic's account-level skills can't be copied); they may drift from the account versions — acceptable, since they're tuned to this game.
- The retrospective loop never auto-edits; humans approve all codified changes, avoiding silent guidance drift.
- `git push` is intentionally not in the permission allowlist, given force-push safety sensitivities.

## References

- `CLAUDE.md`, `.claude/`, `docs/09`, `docs/08`.
