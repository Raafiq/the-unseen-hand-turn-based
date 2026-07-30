---
name: brainstorm
description: >-
  Generate a wide, divergent set of ideas for the-unseen-hand — new jobs,
  abilities, hybrid/fusion combos, status effects, encounters, economy hooks, or
  build archetypes. Use this whenever the user wants options, is stuck, says
  "brainstorm", "ideas for", "what could we do with", or is exploring a design
  space before committing. It deliberately widens before it narrows, then
  filters through this game's house rules so the ideas are usable, not generic.
---

# Brainstorm (project-local)

> This is a project-local adaptation, not Anthropic's account-level `brainstorming` skill. It's tuned to this game and applies our house rules. If the account-level skill is enabled, prefer it for pure open-ended ideation; use this when the ideas must land inside *this* game's design.

The goal is **divergence first, judgment second**. Most design value is lost by converging too early. So generate broadly, then filter — don't self-censor during generation.

## Process

1. **Frame the space.** Restate what we're ideating on and any hard constraints (which pillar it serves, what it must not break). Pull the relevant doc for grounding (`docs/02` for jobs/abilities, `docs/03` for archetypes, `docs/06` for encounters, `docs/07` for economy).
2. **Diverge — aim for ~10–15 raw ideas.** Push past the obvious first three. Deliberately vary the angle:
   - **Recombination** — a new secondary/reaction/support pairing on the chassis.
   - **Fusion** — what two mastered jobs could become.
   - **Inversion** — take an FFT staple and flip a rule (cost, timing, targeting).
   - **Terrain/positioning** — ideas that only make sense because of height/facing/CT.
   - **Counterplay-first** — start from "what should beat build X?" and design the answer.
   - **Fantasy-first** — start from a player pitch ("I want to feel like…") and back into systems.
3. **Cluster & label.** Group the raw ideas; name the interesting clusters.
4. **Filter through house rules** (see the `game-design` skill): for the promising few, name the pillar served, the opportunity cost, the counterplay, and the archetype(s) fed (`docs/03`). Ideas that feed zero archetypes or violate anti-convergence are cut here, not earlier.
5. **Hand off** a short slate: 3–5 candidates worth developing, each one line, plus the wild cards worth remembering. Offer to `grill-me` the strongest one or open an ADR if it changes a locked decision.

## Stance

Quantity and variety in step 2; honesty in step 4. Don't pre-filter during divergence, and don't fall in love during convergence. Flag any idea that's fun but off-thesis as `[OPTIONAL]`/`[DEFERRED]` rather than quietly promoting it to core.
