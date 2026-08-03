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

> **Implementation status (P2 Slice 3; support-aware update 2026-08-03; survive-condition update 2026-08-03).** The benchmark suite authors the archetypes expressible today — Skirmish, Siege/choke, Assassinate, Elevation, Anti-cheese, Attrition (`data/encounters/`). **The `survive` win/lose condition has now LANDED** (`src/sim/condition.ts`): `survive {teamId, ticks}` `[ENHANCEMENT]` — a team wins by keeping ≥1 unit alive until the CT clock (`state.tick`) reaches `ticks`. NOTE the field is **`ticks` (the CT clock), NOT rounds/turns**: a unit acts roughly every ~(100/Speed) ticks, so "survive ~5 rounds" at the default Speed 5 is authored as `ticks: 100`. Tag rationale: the turn/CT-bounded objective *category* is baseline (FFT has protect-until / defeat-within-N), but a pure win-BY-survival *victory* is an enhancement (canonical in FFTA/FFTA2, not our PSX baseline). Pair a survive VICTORY with an `eliminateTeams{[teamId]}` defeat (the two are exact complements at the threshold tick — no spurious draw); the symmetric `survive`-as-DEFEAT is the **defeat-within-N-ticks** objective. Authoring: set `maxTurns` generously and `maxTicks` only slightly above `ticks` so the tick cap is binding and `timeout` stays a genuine error signal (the `survive.ticks <= maxTicks` refine is a coarse guard; the `maxTurns` decision-cap is dynamic and NOT statically guarded). **What has NOT landed yet:** a **Defend benchmark ENCOUNTER** wired into the gauntlet, and measurement of the **sustain identity** it would exercise — the condition exists, but no survive-objective encounter/build is in the diversity gate yet, so Defend is not yet a measured archetype (a later slice). **Escort / protect** still needs support-aware **positioning** (hold-position / protect-the-enabler / body-screen a fragile ally) — still `[DEFERRED]` on engine capability. **Heal-in-encounter partially landed:** the balance-probe now **triages** — it heals the lowest-effective-HP ally (AC-E3(b) mirrored onto allies, ADR-0014 amendment), so a healer with a wounded ally *in range* saves the dying one first. But the probe still has **no hold/protect positioning**, so a fragile ally or squishy healer with nothing in range still advances toward the enemy; Escort does not unlock, and Defend is not *measured*, until positioning + a survive encounter land. Don't re-attempt Escort against the current probe.
>
> **AoE-resolution slice (post-Slice-3).** Area abilities now resolve against every appropriate unit in their box (`aoe` threaded through the combat projection; instant + charged, targeted foes/allies, one seeded roll per target in id order). **Instant** AoE (Geomancer) lands and is measured in-suite. **Charged** AoE (Summoner) resolves correctly (proved end-to-end with the real build/AI/harness) but is **not exercised by the current suite**: the glass caster is the lowest-HP unit, so the probe focus-fires it and it dies before its slow summon matures — its damage output is unmeasured, and `abilityUsage` counts the *issued* (then cancelled) command, not landed damage. This is the **same limitation family** — a slow-setup / glass-cannon archetype needs a support-aware AI (protect the enabler) and/or less-lethal pacing to become measurable, not content tuning. Friendly-fire AoE (the anti-clump counterplay of §4) is a deliberate later slice; today's AoE is targeted (no friendly fire).

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
- **AC-E2 (diversity gate):** On the benchmark suite, ≥ 8 `docs/03` archetypes SHALL clear within the efficiency band and no single build SHALL clear all encounters at top efficiency. **Phased (ADR-0014):** the greedy 1-ply probe can measure a *distinct identity* for **5** of the shipped archetypes today (`aim.`, `black-magic.`, `geomancy.`, `punch-art.`, `white-magic.` — `spellblade` and `arcane-artillery` share the `black-magic.` prefix, so those two collapse to one; the rest field as masked brawlers or need capabilities that don't exist — support-aware positioning, predictive charge-targeting, provoke, reaction-as-live). The CI gate enforces `distinctMeasurableArchetypes ≥ N` (**N=5 now**) **plus** a relative, threshold-free dominance ban (a build fails only if it clears all six gauntlet maps and no other measurable build clears any faster), with a committed `MEASURABLE`/`EXCLUDED` manifest naming each blocker. **Support-aware AI slice (landed, ADR-0014 amendment 2026-08-03):** a **heal-triage** refinement (the probe heals the lowest-effective-HP ally — AC-E3(b)'s focus rule mirrored onto allies — not the biggest overheal) shipped, and `bld-reraise-cleric` moved EXCLUDED→MEASURABLE as the **`white-mage`** identity (its *offensive* white-magic via `holy`; it was mis-excluded — only its unmodeled reaction/sustain identity was blocked). ⚠ **N=5 is not a durable floor:** the `white-magic.` identity is **contingent on MP being unenforced** (`holy` costs 56 MP vs the cleric's 24; the sim does not check MP yet) — when MP enforcement lands, holy becomes unaffordable, `cure` cannot backfill on the phys axis, and N regresses 5→4; uniquely among the phased capabilities, MP enforcement *lowers* N. `battle-cleric` (prefix collapse) and `glass-summoner` (charge-whiff + focus-fire) stayed EXCLUDED with refined tags. **Multi-matchup opposition (landed, ADR-0014 amendment):** the gauntlet fields each candidate against an `OPPOSITIONS` set of distinct *threat* profiles — `phys` (the reference bruiser team) + `magic` (the Coven: instant Faith-scaling geomancy) — so threat, not just geometry, varies. Opportunity cost is real and *surfaced* per build (`losingMatchups`): spellblade/terrain-geo/faithzero-monk/reraise-cleric fold to magic while longshot clears both axes (a non-uniform matrix). **Scope honesty:** the diversity count still keys on the `phys` **reference** opposition only (a build is *supposed* to lose to some threat, so requiring viability everywhere would collapse the count), so a magic regression is *surfaced* (`losingMatchups`/`noLosingMatchup`), not enforced — the sole hard fail stays relative dominance (now over `{maps × oppositions}`). The magic axis is a second distinct threat, **not** an isolated candidate-Faith test: shared Faith-50 filler allies + team-elimination + magnitude-focus targeting mean it rewards tempo/range as much as personal Faith (so the anti-mage build still shows a *team*-level magic loss — its personal resistance can't save its allies without support-aware positioning); the isolated Faith cliff is proved by a must-fail straddle test. Anti-convergence is thus *tested and surfaced*, not yet auto-enforced; `≥ 8` remains the release bar and `N` rises only as a new signature prefix (job/skillset) or those capabilities land.
- **AC-E3 (AI counterplay):** Enemy AI SHALL demonstrably (a) attack from side/rear when reachable, (b) focus the lowest-effective-HP valid target, and (c) select damage/status types that counter the opposing unit's defenses, in scripted test scenarios.
- **AC-E4 (determinism):** Given a fixed seed and player command log, AI decisions SHALL be reproducible (draws from the seeded stream only).
- **AC-E5 (difficulty without inflation):** Raising a difficulty tier SHALL first change AI behavior/threat budget; raw stat multipliers SHALL be a bounded, secondary lever.
