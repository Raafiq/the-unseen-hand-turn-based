---
name: retrospective
description: >-
  Capture durable lessons after a task in the-unseen-hand that hit errors,
  surprises, dead-ends, wasted effort, or a "we should remember this" moment —
  then PROPOSE (never auto-apply) updates to CLAUDE.md, the docs, an ADR, or a
  new/updated skill. Use this when a task went sideways, when the Stop-hook
  nudge fires, when the user says "retro", "post-mortem", "what did we learn",
  or "make sure this doesn't happen again". It turns one-off pain into
  codified, approval-gated improvements so the same mistake isn't repeated.
---

# Retrospective

The point is **compounding**: each stumble should make the repo's guidance a little better, so the next agent doesn't repeat it. But improvements are only valuable if they're *durable* and *trusted* — so this skill **proposes** changes and lets a human approve them. It never silently edits `CLAUDE.md`, the docs, or rules.

## When to run

- A task hit an error, a wrong assumption, a blocked action, or a surprising amount of rework.
- The Stop-hook nudge (`retrospective-nudge.sh`) reminded you.
- The user asks for a retro / post-mortem, or says "don't let this happen again".

## Process

1. **Reconstruct.** Briefly: what was the goal, what actually happened, and where did it diverge? Use the real transcript, not a tidy summary — the friction is the signal.
2. **Root-cause, don't blame the symptom.** Ask "why" until you reach something durable: a missing convention, an ambiguous doc, a wrong assumption, a foot-gun in the workflow. (Example from this repo's own history: "the PR failed" → because branches had unrelated histories → because there was no base branch → the durable lesson is "branch off the merged base; establish `main` first".)
3. **Decide if it's codifiable.** Not every stumble deserves a permanent rule — one-offs don't. Ask: will this recur? Would a future agent benefit? If not, note it and stop. Avoid over-fitting the guidance to a single incident.
4. **Draft the smallest durable fix**, mapped to the right home:
   - **A recurring working-rule or gotcha** → a line in `CLAUDE.md` (keep it lean; explain the *why*).
   - **A design/architecture decision or reversal** → an ADR via the `decision-record` skill.
   - **A doc was wrong/ambiguous** → an edit to that doc (preserve tag conventions).
   - **A repeatable multi-step workflow** → a new or updated skill via `skill-creator`.
5. **Propose, with the diff.** Show the exact change and the reasoning. Then **ask for approval.** Apply only what the human accepts.

## Guardrails

- **Approval-gated, always.** Propose; don't auto-write. The Stop hook only nudges — it changes nothing.
- **Prefer the why over the rule.** A rule the next agent understands beats an ALL-CAPS MUST it resents. Explain the failure so the guidance generalizes.
- **Keep guidance lean.** Every added line costs context on every future task. If a new rule earns its place, consider whether an old one can retire.
- **One incident ≠ a law.** Generalize only when the pattern is real; otherwise a short note is enough.

## Output

A short retro: **what happened → root cause → is it codifiable? → proposed change(s) with diffs → request for approval.** If nothing is worth codifying, say so — a clean "no durable lesson here" is a valid result.
