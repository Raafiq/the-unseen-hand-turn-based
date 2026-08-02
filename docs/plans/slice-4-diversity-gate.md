# Slice 4 — Build-Diversity Gate (AC-E2 / AC-R3) — Plan of Record

Source: systems-designer methodology spec (this session). Status: **IMPLEMENTED** — see the calibration outcome below; ADR-0014 and `src/sim/gauntlet.ts` are the final truth where this pre-implementation plan differs.

> **Calibration outcome (as shipped).** `N = 4`, not 5 — `spellblade` and `arcane-artillery` share the
> `black-magic.` signature prefix, so 5 was never reachable, and `arcane-artillery` is sub-viable (pure
> caster → charge-whiff timeouts). Measurable identities: `aim.`, `black-magic.`, `geomancy.`, `punch-art.`.
> The dominance ban shipped **relative/threshold-free** (not the absolute `TOP_EFF_TICKS` band this plan
> sketched — that was gerrymandered to pass and was cut): a build fails only if it clears all six maps AND
> no other measurable build clears any map faster. Band uses `WIN_CEIL_TICKS=300` for the grind-exclusion
> only. Builds that clear all six with no losing matchup are **surfaced** (`winsAllInBand`), not failed —
> the interim gate proves the diversity *count* + a gross-over-tune check, NOT opportunity-cost/anti-
> convergence, which needs **multi-matchup opposition** (the named next step). Full rationale: ADR-0014.

## Headline finding
AC-E2's "**≥ 8 archetypes clear within the efficiency band**" **cannot be met honestly with today's greedy 1-ply balance probe.** Only ~**5** of the 11 shipped builds have a *distinct, probe-measurable identity*. Five more field as the *same* PA-8 brawler (masked identity) or depend on AI/mechanics that don't exist yet.

### Build → archetype → measurability
| Build | Archetype | Measurable identity today? |
|---|---|---|
| `bld-spellblade` | #8 Spellblade | ✅ `black-magic.fire` |
| `bld-terrain-geo` | #12 Geomancer | ✅ instant AoE lands |
| `bld-longshot` | #17 Longshot | ✅ `aim.*` |
| `bld-faithzero-monk` | #9 Anti-Mage | ✅ (partial — matters vs casters) |
| `bld-arcane-artillery` | caster/nuker | ✅ (weak archetype attribution) |
| `bld-counter-wall` | #1 Counter Wall | ❌ counter is a **reaction** (passive, not a live action) |
| `bld-aggro-tank` | #15 Provoker | ❌ **no taunt/provoke mechanic**; probe ignores threat |
| `bld-battle-cleric` | #13 sustain | ⚠️ AI-limited (probe heals only when no foe reachable) |
| `bld-reraise-cleric` | #13 Reraise | ❌ AI-limited + Reraise is a reaction |
| `bld-glass-summoner` | #7 Summoner | ❌ charged AoE never lands (focus-fired first) |
| `bld-warlord` | boss chassis | — (the assassinate *target*, not an archetype) |

**Honest distinct-identity count ≈ 5**, below the AC-E2 bar of 8. The gap is *named engine features*: support-aware AI (+summoner, +2 clerics), a provoke/threat mechanic (+aggro-tank), reaction-as-live modeling (+counter/reraise).

## Recommended methodology (the gate itself)
1. **Substitution gauntlet.** Hold everything constant except one candidate: `{2 neutral filler allies + candidate}` vs a **fixed 3-unit opposition `O`**, across the **6 shipped maps** (reuse maps/objectives, replace placements). ~5 builds × 6 maps ≈ 30 deterministic headless runs. Clearance is attributable to the candidate.
2. **Efficiency band on `ticks`** (the CT clock — unit-count-independent, unlike `turns`). `inBand ≡ victory ∧ ticks ≤ WIN_CEIL ∧ candidate contributed`. `topEff ≡ inBand ∧ ticks ≤ TOP_EFF`. Defaults illustrative `[UNCERTAIN]`: `WIN_CEIL≈160`, `TOP_EFF≈90` — **calibrate-then-freeze** as a first step (run the gauntlet, set from the observed clear distribution, freeze as named constants; a drifting percentile band would hide the regressions the gate must catch).
3. **Distinct-exercised-identity count ≥ N** (recommend N=5). A build counts under its archetype only if its **signature action landed** (not merely issued) and it contributed — so masked brawlers don't inflate the count.
4. **Anti-convergence / dominance ban:** gate FAILS if any single build clears **all 6 maps at top efficiency** (a build that pays no opportunity cost — docs/02 B5). Viable = clears ≥ 4/6 in band.
5. **Honesty manifest:** committed `MEASURABLE` allow-list + `EXCLUDED` list, each excluded build tagged with the capability that unblocks it. `≥ 8` (full AC-E2) marked **BLOCKED**, N rises as capabilities land.

## Load-bearing dependency (implement first)
`RunReport.abilityUsage` counts *issued* commands aggregated across units (why a cancelled summon still "counts"). The gate needs a new **per-unit landed-contribution** metric:
`contributionByUnit: Record<unitId, { damageDealt, healingDone, kos, signatureActionsLanded }>`.
This is the honesty linchpin — sequence it before the gate. (The harness header already anticipates this deferred "damage-by-formula" work.)

## Discriminating tests (must FAIL against a real problem)
Dominance bites (inject an over-tuned build → gate fails); diversity floor bites (degrade a build below band → count drops → fails); band excludes grind-wins (near-`maxTicks` victory not in band); masking/attribution (signature out-damaged by secondary → not credited); carried-by-filler (inert candidate that "wins" → not counted); determinism (same seeds → byte-identical report).

## Open decisions (for the human)
1. **AC-E2 amendment** — phased `≥ N`-with-manifest now, `≥ 8` gates release blocked on named features (recommended) **vs** hold AC-E2 formally unmet **vs** build enabling AI first. → `decision-record`.
2. **N + viability fraction** — proposed N=5, viable ≥ 4/6.
3. **Control party** — 2 filler allies (needed for support archetypes later) vs solo.
