# 00 — Vision & Pillars

> **This doc is the constitution seed.** When we adopt GitHub Spec Kit at implementation (`docs/08`), the pillars, the customization spine, the success criteria, and the non-goals below become the governing, non-negotiable principles that every feature spec must honor. Treat them as constraints, not suggestions.

## Elevator pitch

A tactical RPG that takes the **Final Fantasy Tactics** combat engine — the CT clock-tick turn order, the isometric grid, the deep job system — and rebuilds it around one thing above all else: **the fantasy of building a character.** You collect abilities across a broad web of jobs, recombine them onto a five-slot chassis, fuse jobs into hybrids, and field a party where no two players' units look alike. FFT's mechanics are the foundation; the customization is the whole point.

Narrative comes later, from a **separate story repository** (not yet started). This repo is the systems game: combat, jobs, customization, encounters. Battles are authored as **data**, so the story layer can plug in later without touching the engine (`docs/08`).

## Design pillars (priority order)

1. **Customization sandbox.** Depth over breadth. The measure of success is not the *number* of options but the number of *meaningfully different, viable* builds. Opportunity cost is sacred — see the anti-convergence law in `docs/02`.
2. **Intensive job system.** A broad, branching job web with **directed** progression (spend AP to walk trees) rather than passive grind. Mastery is permanent and portable.
3. **Tactical grid combat.** The faithful CT/height/facing/charge engine from `docs/01`.
4. **Readable, low-friction UX.** Deep math, honest interface. **Resolution transparency** (hit %, damage, CT forecast, hidden multipliers) is adopted fully; **progression/discovery** (what a fusion unlocks) is preserved, hinted not spoiled. Accessibility is a first-class concern, not a footnote (`docs/04`).

## The customization spine

The review panel's sharpest warning: don't ship *ten shallow systems sharing a menu.* So three axes are declared **the identity of the game**; everything else is explicitly secondary (`[OPTIONAL]`/`[DEFERRED]`), gated behind the build-fantasy catalog (`docs/03`) and the cut-lines (`docs/08`):

| Spine axis | Why it's core |
|---|---|
| **5-slot ability chassis** | FFT's soul — cross-job recombination. Non-negotiable. |
| **AP-driven job & skill trees** | Directed investment + permanent mastery bonuses. The anti-grind heart. |
| **Hybrid / fusion jobs** | Combinatorial discovery; the biggest replay driver unique to us. |

Secondary/optional axes (kept only if they feed real archetypes in `docs/03`): gear-as-ability + sockets `[OPTIONAL]`, weapon skill-trees `[OPTIONAL]`, set bonuses `[OPTIONAL]`, behavior scripting `[DEFERRED]`.

## Success criteria (testable)

These are acceptance tests, not aspirations:

1. **Build diversity.** Against the benchmark encounter suite (`docs/06`), **≥ 8 distinct archetypes** from `docs/03` can clear it within a defined efficiency band — with **no single dominant build** clearing everything at top efficiency.
2. **Generic ≈ unique.** A fully-built generic can rival a named unique. Uniques are *premium chassis with a signature trait*, not premade gods (`docs/04`).
3. **Investment, not grind.** Reaching a target build is bounded by a defined **grind budget** (`docs/07`) — no degenerate farming loop (Throw-Stone-on-your-own-ally) is ever the optimal path.
4. **No free win-buttons.** Every high-power option has telegraphed counterplay (the Calculator / Blade-Grasp lesson, `docs/04`).
5. **No 2-hour bounce.** A new player reaches their first satisfying self-made build within the onboarding arc (`docs/08`) without needing a wiki.

## Non-goals (scope guardrails)

- **Not** a narrative engine (that's the other repo). Battles are data-driven placeholders until the story layer arrives.
- **Not** a faithful *content* clone — we recreate FFT's *mechanics*, not its maps/characters/story.
- **Not** an MMO / live-service. Single-player, community sharing via build codes (`docs/04`), not netcode.
- **Not** chasing photorealism or a large art budget — a small team; scope discipline is a stated design input (`docs/08`).
