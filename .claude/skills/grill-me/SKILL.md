---
name: grill-me
description: >-
  Adversarially pressure-test a the-unseen-hand design, spec, or plan before it
  gets built. Use this whenever something is about to be committed to — a job/
  ability/economy proposal, a doc's Acceptance Criteria, a schema, an
  implementation plan — or when the user says "grill me", "poke holes", "what am
  I missing", "stress-test this", or "is this actually good". It attacks the
  idea from the angles most likely to expose a flaw, so weaknesses surface now
  instead of after implementation.
---

# Grill Me (project-local)

> Project-local adaptation, not Anthropic's account-level `grill-me`. Tuned to this game's failure modes and pairs with the Acceptance-Criteria sections in the docs.

The job is to **try to break the idea**, charitably but relentlessly, before reality does. Assume the proposal is wrong somewhere and find where. Be specific — a vague "this might be unbalanced" is useless; "a Speed-stacked Two-Swords build clears encounter type X in one turn with no counter" is actionable.

## Attack surfaces (go through these deliberately)

1. **Anti-convergence:** does it let a build "have it all"? Where's the opportunity cost? Could it collapse build diversity toward one dominant option?
2. **No-counterplay:** is there a free/spammable/no-response line? Walk the strongest degenerate loop it enables (the Calculator / Blade-Grasp test).
3. **Archetype coverage:** which `docs/03` archetype does it actually feed? If none, why does it exist? Does it obsolete an existing archetype?
4. **Determinism:** any randomness, timing, or ordering that would break reproducibility (`sim-determinism-guard`)?
5. **Fidelity & numbers:** are constants verified or illustrative? Integer/floor order right (`docs/01`, `docs/07`)? Does it silently contradict `docs/01` baseline?
6. **Economy/pacing:** does it distort the grind-budget or create a degenerate farm (`docs/07`)?
7. **Encounter stress:** name an encounter archetype (`docs/06`) that should punish it. Does the AI have the tools to?
8. **Scope/cut-line:** is this a `Must`, or content-trap creep a small team can't afford (`docs/08`)? Does it multiply art/balance cost (e.g. N² hybrids)?
9. **Onboarding/readability:** does it add cognitive load a new player can't absorb (`docs/00` pillar 4)? Is the hidden math surfaced?
10. **Reversibility:** if we're wrong, how expensive is it to undo? Does it lock in a schema or invariant?

## Output

Rank the findings by severity. For each: the **concrete failure scenario** (inputs → bad outcome), why it matters, and a suggested fix or a question the author must answer. End with the single **most likely reason this fails** and whether it's a blocker or a manageable risk.

## Stance

Adversarial, not contrarian — the aim is a stronger design, not a rejected one. If it survives a genuine grilling, say so plainly; don't manufacture objections. If a flaw actually kills a locked decision, route it to the `decision-record` skill rather than hand-waving.
