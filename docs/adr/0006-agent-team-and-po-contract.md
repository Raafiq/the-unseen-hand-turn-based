# ADR-0006: Specialized agent team with a Product-Owner contract

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** maintainer

## Context

Development is agent-driven, and we want specialized agents (design, fidelity, review, engineering, content, QE, playtest) plus a single "Product Owner" that liaises with the human and coordinates the rest. A key constraint shapes the design: in Claude Code the **main session is always the human's interlocutor** — subagents are spawned by it, run in isolation, and return results to it; they cannot independently talk to the user or gate access to the user.

## Options considered

1. **PO as a background subagent that owns the human conversation** — not possible; subagents can't hold the user conversation or sit "in front of" the main session.
2. **No PO; user talks to a flat set of specialists** — loses the single-point-of-contact and vision-holder the user wants; noisy.
3. **PO as the main-session operating contract + delegatable specialist subagents** — the session the human talks to *acts as* PO (vision, requirements, decisions, delegation) and invokes specialists via the Agent tool, integrating their output.

## Decision

Option 3. Define `product-owner.md` as the main-session contract and a roster of specialist subagents in `.claude/agents/` (`systems-designer`, `fft-fidelity`, `reviewer`, `combat-engineer`, `content-author`, `qe-tester`, `playtester`). Design/review/fidelity/playtest agents are read-only and return findings; `combat-engineer`/`content-author` may edit. `playtester` is one definition spawned 2–3× with distinct personas (newcomer / min-maxer / veteran).

## Consequences

- The human has a single, vision-consistent interlocutor (the PO/main session); specialists never dump raw output on the user.
- Some agents (`combat-engineer`, `content-author`, full `qe-tester` with screenshots, hands-on `playtester`) only deliver real value at P0+ once the stack and a build exist; they're defined now but their tool/model scoping is revisited then.
- The team mirrors the review-panel pattern that worked well during design; determinism and doc acceptance criteria remain the shared contract.

## References

- `.claude/agents/README.md`, `.claude/agents/*.md`, `docs/08` (P0 timing), ADR-0005 (agent-first setup).
