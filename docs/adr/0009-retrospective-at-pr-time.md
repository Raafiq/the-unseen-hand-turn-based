# ADR-0009: Retrospectives trigger at PR time, not via a per-turn Stop hook

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** maintainer + Product Owner

## Context

ADR-0005 set up a "retrospective loop": a **Stop-hook nudge**
(`.claude/hooks/retrospective-nudge.sh`) plus the `retrospective` skill. In
practice the Stop hook fired on **every task boundary — every turn**. As a
passive `exit 0` echo it never reached the agent (transcript-only), so it was
ignored; when reworked to actually surface (an `exit 0` + `{"decision":"block"}`
that blocks once per task), it interrupted **ordinary discussion turns**, which
is too noisy to be useful.

The actual goal is **durable cross-session learning** — capture a lesson before
it's lost so the next session doesn't repeat the mistake. That is best served at
an **infrequent, meaningful checkpoint**, not on every turn.

## Options considered

1. **Keep the passive per-turn Stop-hook nudge** — fires constantly, never reaches
   the agent, effectively ignored (the status quo that prompted this).
2. **Make the Stop hook actively block once per task** — reaches the agent, but
   interrupts every task boundary including pure conversation (demonstrated noisy).
3. **Trigger the retrospective at PR creation via a CLAUDE.md instruction** (+ the
   skill's "when to run") — infrequent, meaningful, right before work merges; can
   be *enforced* later with a `PreToolUse` hook on the PR-creation tool if agents
   skip the instruction.

## Decision

Option 3. **Remove the Stop-hook nudge** (`retrospective-nudge.sh` and the `Stop`
entry in `.claude/settings.json`). Add a CLAUDE.md working rule — *run the
`retrospective` skill before opening a PR (or requesting a merge)* — and re-point
the skill's "when to run" to that checkpoint. This **supersedes the Stop-hook-nudge
element of ADR-0005**; the rest of ADR-0005 (committed skills, permission
allowlist, the SessionStart hook, the MCP scaffold) stands unchanged.

## Consequences

- Retrospectives fire at the right altitude — **per slice/PR, not per turn** — with
  no interruption of ordinary work.
- It is a **soft instruction** (guidance the agent reads each session via CLAUDE.md),
  not harness-enforced. **Follow-up if needed:** add a `PreToolUse` hook matching the
  `create_pull_request` tool to enforce it exactly at PR time without per-turn noise.
  Noted here, not built.
- ADR-0005's other decisions are untouched; only its retrospective-trigger mechanism
  is amended.

## References

- ADR-0005 (agent-first setup — the superseded Stop-hook-nudge element),
  `CLAUDE.md` (Tooling & workflow), `.claude/skills/retrospective`.
