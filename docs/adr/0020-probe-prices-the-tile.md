# ADR-0020 — The probe prices the tile, not just the act; the movement slot ships with it

- **Status:** Accepted
- **Date:** 2026-08-20
- **Supersedes / amends:** amends **ADR-0019** (`DEFERRED_MOVEMENT_EFFECTS`: `steal.move-plus-2` removed — the slot is live). Amends **ADR-0014** (AC-E2 note; N held at 7). Retires the `bld-spellblade` mask recorded in **ADR-0016** / **ADR-0017**.
- **Owner docs:** `docs/02` §2, `docs/05` §4, `docs/06` AC-E2 + AC-E3(d), `src/sim/CLAUDE.md`

## Context

ADR-0017 and ADR-0019 woke the support and reaction chassis slots. Movement was the last
one left, and ADR-0019 filed it as deferred by **scope**: 8 of 15 builds equip
`steal.move-plus-2`, so switching it on is a one-sided +2 Move across most of the
candidate field. The handoff called it "one line of code and a measurement".

The code was one line. **The measurement failed.**

| | before | with +2 Move |
|---|---|---|
| variety score | 7 | **5** |
| gate `pass` | true | **false** |
| `bld-arcane-artillery` | 5/12 | **1/12** |
| `bld-glass-summoner` | 5/12 | **1/12** |
| `bld-spellblade` | 6/12 | **2/12** |
| `bld-counter-wall` | 12/12 | 10/12 |

Every caster collapsed. Melee went flat or slightly worse. **No build improved anywhere.**

Traced on `skirmish-a`, same seed:

```
Move 3                                Move 5
t13  cand   move 1,0 ; charge         t13  cand   move 5,0 ; charge
t17  cand   charge resolves           t13  opp-1  move 4,1 ; hit cand −90
…                                     t13  opp-2  move 4,0 ; KO cand
victory, 19 turns                     t17  cand   charge … cancelled
```

`compareCandidate` enumerates every reachable tile, prices the **act** available from
each, and has no term for how exposed the tile is. **Low `move` had been keeping fragile
builds alive by accident.** A mobility grant was, in this engine, a liability stat.

## The rejected fixes, measured rather than argued

An earlier draft of this ADR concluded the slot was *blocked*. It was not — it was
under-diagnosed. Three fixes were built and run against the gate:

| approach | result |
|---|---|
| prefer the tile **nearest** where the actor stands, among equal acts | **N=5** — nearest is not safest |
| **stay put** unless you cannot act at all from here | **N=5**, and it tripped the dominance ban |
| prefer the tile **fewest living foes can strike** | **N=7**, with +2 Move live |

The second is worth dwelling on, because it is the intuitive one: *the AI does not have to
move just because it can.* Making that the rule is strictly worse. The probe's problem was
never that it moves — it is that it cannot tell a safe tile from a dangerous one, and
forcing it to stand still just picks a different wrong tile.

## Decision

**1. `exposureOf(state, actor, tile)` counts the living foes whose `move` plus weapon
reach covers `tile`.** A deliberately generous, pathing-free upper bound: Chebyshev
distance, ignoring obstacles and occupancy. Pathfinding would cost |reachable| × |foes|
searches per turn and would not change the *order* this is used for. Effective team on
both sides, so a charmed unit fears the side it now fights.

**2. It sits BELOW the AC-E3(b) focus keys and above `facingRank`, and that position was
calibrated across six placements** — above the class branch → 7; inside CHIP above
`targetEffHp` → 5; below `targetEffHp` → 5; **above `facingRank` → 7**; below
`facingRank` → 5; absent → 5.

Two work. The shipped one is the least invasive: the focus rule (*finish the
lowest-effective-HP target*) is untouched, and exposure decides only **which tile** to do
that from. The aggressive placement also reaches 7 but overrides a documented AC and
measures worse on anti-convergence (two every-cell sweepers instead of one).

**3. The movement slot ships in the same commit, never before.** `steal.move-plus-2` is
authored as `{ move: { flat: 2 } }` and folded at `growth → trait → {support, movement} →
clamp`. Support and movement touch disjoint fields, so their order relative to each other
is not a question that can be got wrong.

**4. The three remaining movement abilities stay deferred** with mechanism blockers —
`aim.scout` (no line of sight modeled), `geomancy.lava-walk` (no terrain hazards),
`geomancy.terrain-stride` (impassable is binary, so only half of it could ship).

## Consequences

**All five chassis slots are now live** (`docs/02` §2). The locked customization spine's
first axis is complete after three slices, all three of which were the same defect class:
a slot that validates its input and then discards it reads as working.

**The variety score holds at 7 — that is the *result*, not a non-event.** Move +2 alone
takes it to 5; the exposure term alone leaves the aggregate untouched; together they hold
7 with the slot live. Neither half ships alone.

**Robustness: a plateau, not a knife-edge.** N=7 flat across raw-HP ×0.95…×1.15, dropping
to 6 at ×0.90 — which is *exactly where the pre-slice baseline drops too*. The baseline
was perturbed alongside the fix, per the ADR-0016 protocol; the two sit on the same
plateau, so nothing here is calibrated to the metric.

**Anti-convergence improved, and that was not the goal.** `winsAllInBand` 2 → **1**
(`bld-faithzero-monk` alone): a candidate that no longer walks into the open loses cells it
used to sweep. `dominantBuilds` stays empty. Gauntlet timeouts 1 → **0**.

**`bld-spellblade` is no longer masked.** It had been masked since the TTK re-tune and
pinned positively so it could not be silently fixed — this is that pin firing. The
magnitude cause is unchanged and still asserted (`ttk.test.ts`: borrowed black magic 37 <
its own knight swing 90). What changed is that **from the tiles a cautious probe prefers,
the melee swing is out of reach**, so range-5 black magic is what is left. The mask was
never purely a magnitude fact; it was a magnitude fact *plus a probe that always closed*.
The spellblade is now honestly **sub-viable** (3 of 6 reference maps against a floor of 4)
rather than masked — a smaller gap, and a content problem rather than an AI one.

**The exposure term moved 36 of 108 gauntlet runs on unchanged content while every
aggregate verdict stayed identical.** Recorded because it is the second time in three
slices that a live capability moved no summary — diff the rows.

## Alternatives rejected

- **Ship Move +2 and re-baseline N to 5.** The diversity gate is P2's open exit criterion.
- **Ship it but unequip `move-plus-2` from the casters.** Tunes content around an AI
  defect and leaves the defect unrecorded.
- **Conclude the slot is blocked** (the earlier draft of this ADR, opened as a PR and
  closed unmerged). The diagnosis was right and the conclusion was wrong: "blocked" was
  reached after measuring one candidate fix, not three.
- **Add pathfinding to the exposure metric.** Expensive per turn, and it cannot change the
  comparison's outcome often enough to matter. Revisit if exposure is ever *displayed*.
