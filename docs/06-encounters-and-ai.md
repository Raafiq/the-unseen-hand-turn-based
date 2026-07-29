# 06 — Encounters & AI

**Why this is a first-class doc, not a QoL bullet:** customization only *means* something against encounters that test it. Encounter design is the **demand side** of the customization economy and the **primary balancer** (`docs/04` §2). The AI is the **test harness** that decides whether a build is actually viable.

---

## 1. Encounters are the balancer

A build is "viable" only relative to what it must beat. So:
- We maintain a **benchmark encounter suite** — the fixed set the success metric runs against (`docs/00`: ≥8 archetypes clear it within the efficiency band, none dominates).
- Balance passes **re-run the suite** after any `docs/02`/`docs/07` change. If one build clears everything at top efficiency, that's a balance bug surfaced by encounters, not spreadsheets.
- **Difficulty comes from smarter enemies and better-designed maps, not stat-inflation.** (The genre's most common complaint is "hard mode = bigger numbers.")

## 2. Encounter archetypes (design vocabulary)

Each archetype stresses a different axis of the player's builds:

| Archetype | What it tests | Design levers |
|---|---|---|
| **Skirmish (open field)** | Raw build efficiency, turn economy | Symmetric-ish forces, neutral terrain |
| **Siege / choke** | Positioning, AoE, ZoC-less flow | Height, walls, one approach |
| **Defend / survive N turns** | Sustain, control, Reraise | Waves, escalating pressure |
| **Escort / protect** | Mobility, healing, aggro management | Fragile ally with its own CT turns |
| **Assassinate boss** | Burst, disable, focus-fire | High-value target + guards |
| **Elevation puzzle** | Jump/Move/Teleport, ranged height bonus | Verticality, gaps, water |
| **Anti-cheese check** | Punishes dominant strategies | Mixed damage types, status immunity pockets, dispellers |
| **Attrition / no-heal** | Resource discipline, MP economy | Long map, scarce recovery, undead |

Story battles (from the narrative repo later) are authored instances of these; the engine is data-driven so they slot in without code (`docs/05` §6, `docs/08`).

## 3. Threat / difficulty model

- **Threat budget per encounter:** enemy count × tier × support density, tuned to a target **time-to-kill** band (`docs/07`) — not to the player's level (no mandatory scaling treadmill).
- **Difficulty tiers** (player-selectable, `docs/04` §6) adjust AI aggression/coordination and threat budget, **not** raw stat multipliers first. Stat bumps are the last lever, not the first.
- **Telegraphing:** big enemy plays (charged nukes, incoming hard-disables) are visible via the same resolution-transparency the player gets (`docs/04` §3) — fair difficulty.

## 4. AI as the test harness for builds

The AI must be good enough that **counterplay actually happens** — otherwise "power with counterplay" is a lie. Target behaviors:

- **Positioning:** use facing (attack from side/rear), height, and safe tiles; avoid clustering into player AoE; respect its own charged-spell tile targeting.
- **Focus-fire:** concentrate on the highest-value / lowest-effective-HP target; finish units in the crystal window to deny revives; punish the exposed alpha-striker (`docs/03` #2 counterplay).
- **Counter the player's build:** prefer magic vs. high-evasion physical walls; use Silence vs. casters, Dispel vs. self-buffers, status that ignores Faith vs. low-Faith tanks; disable the enabler (the Haste-bot, the summoner) first.
- **Resource sense:** don't waste charged nukes on a unit that will walk away; use terrain/elements; retreat/reposition when losing tempo.
- **Threat assessment:** value disables and tempo, not just damage (mirror the player's tools).

**Determinism:** all AI decisions draw from the seeded RNG in declared order (`docs/05` §3) so battles stay reproducible and rewind-safe. Tie-broken decisions must be deterministic.

## 5. Anti-degenerate guarantees (encounter-side)

- **No mandatory grind:** encounters give bounded, non-RNG-treadmill rewards (`docs/07`); you never *must* farm randoms to progress.
- **Anti-cheese encounters** exist specifically to answer dominant strategies (mixed damage, immunity pockets, dispellers) — the structural check on stun-lock, evasion-stacking, and Blade-Grasp walls (`docs/04` §1, §5).
- **Stun-lock cap:** repeated hard-disables on the same unit hit diminishing returns (implemented as a status rule, `docs/05`), so AI *and* player are bounded.

## Acceptance Criteria (SDD-ready)

- **AC-E1 (benchmark exists):** A named benchmark suite covering the §2 archetypes SHALL exist and be runnable headlessly for balance verification.
- **AC-E2 (diversity gate):** On the benchmark suite, ≥ 8 `docs/03` archetypes SHALL clear within the efficiency band and no single build SHALL clear all encounters at top efficiency.
- **AC-E3 (AI counterplay):** Enemy AI SHALL demonstrably (a) attack from side/rear when reachable, (b) focus the lowest-effective-HP valid target, and (c) select damage/status types that counter the opposing unit's defenses, in scripted test scenarios.
- **AC-E4 (determinism):** Given a fixed seed and player command log, AI decisions SHALL be reproducible (draws from the seeded stream only).
- **AC-E5 (difficulty without inflation):** Raising a difficulty tier SHALL first change AI behavior/threat budget; raw stat multipliers SHALL be a bounded, secondary lever.
