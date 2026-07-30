---
name: game-design
description: >-
  Apply the-unseen-hand's house design rules when doing ANY design or balance
  work — proposing a job, ability, hybrid, status, weapon, encounter, economy
  tweak, or difficulty option, or evaluating whether something is "too strong",
  "fun", or "worth adding". Use this whenever the task involves game feel,
  balance, new content, or a customization idea, even if the user doesn't say
  "design". It keeps proposals consistent with the pillars, the balance
  philosophy, and the anti-convergence law instead of drifting into generic
  game-design instincts.
---

# Game Design — House Rules

This game has an opinionated design spine. Generic "good game design" is not the bar; consistency with *these* rules is. Read the owning doc for depth; this skill is the checklist that keeps proposals on-thesis.

## The pillars, in priority order (`docs/00`)

1. **Customization sandbox** — depth over breadth. Success is the number of *meaningfully different, viable* builds, not the number of options.
2. **Intensive job system** — broad, branching, with directed (AP) progression, not grind.
3. **Tactical grid combat** — the faithful CT/height/facing/charge engine.
4. **Readable, honest UX** — full resolution transparency; discovery preserved.

When pillars conflict, the higher one wins. A change that adds options but flattens meaningful choice fails pillar 1 even if it "adds content".

## The laws every proposal must pass

- **Anti-convergence / opportunity cost (`docs/02` B5):** *Depth comes from what you give up, not what you hold.* No slot, currency, or unlock may reduce total build tension. Every specialization must cost a generalization. If your idea lets a build "have it all", it's wrong.
- **Power with counterplay (`docs/04` §2):** a strong option is fine **iff** it has telegraphed, actionable counterplay (range, dispel, status-type mismatch, positioning, tempo). *Free + spammable + no-response* is the one thing outright banned (the Calculator / Blade-Grasp lesson).
- **Uniques are premium chassis, not premade gods (`docs/02` B6):** special characters get a signature trait + one exclusive line, but route through the same system; a built generic can rival them.
- **Investment, not grind (`docs/07`):** progression is bounded by the grind-budget; no degenerate farming loop may be optimal. Mastery is permanent; respec is free.
- **Determinism-friendly:** anything with randomness must fit the single seeded stream (`sim-determinism-guard`).

## The acceptance test for the job system (`docs/03`)

Every customization system must feed **≥ 1 target archetype** in the build-fantasy catalog. **If a proposed system produces zero archetypes, it gets cut**, not added. When proposing a new job/ability/hybrid, name the archetype(s) it enables and how each is countered.

## How to evaluate a proposal

For any new/changed content, answer, briefly and explicitly:
1. **Which pillar** does it serve, and does it flatten any other?
2. **What does it cost the player** (opportunity cost)? If "nothing", redesign.
3. **What's the counterplay?** Name it concretely.
4. **Which archetype(s)** does it feed (`docs/03`)? If none, don't add it.
5. **Baseline or enhancement?** Tag it `[BASELINE]`/`[ENHANCEMENT]`/`[OPTIONAL]`/`[DEFERRED]` and keep the FFT reference (`docs/01`) uncorrupted.
6. **Numbers:** integer, floored, within the tuning philosophy (`docs/07`); constants verified or marked illustrative.

If a proposal is genuinely good but conflicts with a locked decision, don't silently diverge — use the `decision-record` skill to argue it as an ADR.
