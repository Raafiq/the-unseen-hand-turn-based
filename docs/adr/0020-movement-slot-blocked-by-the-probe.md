# ADR-0020 — The movement slot is blocked by the AI, not by scope — measured

- **Status:** Accepted
- **Date:** 2026-08-18
- **Supersedes / amends:** amends **ADR-0019** (`DEFERRED_MOVEMENT_EFFECTS`: `steal.move-plus-2` reclassified SCOPE → BLOCKED, with a measured cause). Re-opens the survivability question **ADR-0017** first named.
- **Owner docs:** `docs/02` §2, `docs/06` AC-E2, `src/sim/CLAUDE.md`

## Context

ADR-0019 left `steal.move-plus-2` as the one entry in `DEFERRED_MOVEMENT_EFFECTS`
deferred by **scope** rather than by a missing mechanic. The stated reason was blast
radius: 8 of 15 shipped builds equip it, none of the gauntlet's opposition or filler
builds do, so switching it on is a one-sided +2 Move across most of the candidate field.
The handoff called the slice "one line of code and a measurement".

The code was indeed one line. **The measurement failed.**

## What was measured

The full fold was built — `movement.ts` with a `MovementEffectSchema`, an authored
`movementEffect` on `steal.move-plus-2`, and the layer folded at
`growth → trait → support → movement → clamp` — and the diversity gate was run against it.

| | before | after |
|---|---|---|
| variety score (`distinctMeasurableArchetypes`) | 7 | **5** |
| gate `pass` | true | **false** |
| `bld-arcane-artillery` (in band / 12) | 5 | **1** |
| `bld-glass-summoner` | 5 | **1** |
| `bld-spellblade` | 6 | **2** |
| `bld-counter-wall` | 12 | 10 |
| `bld-reraise-cleric` | 9 | 8 |
| `bld-cutpurse` · `bld-longshot` · `bld-terrain-geo` · `bld-faithzero-monk` | 5 · 11 · 11 · 12 | unchanged |

`black-magic.` and `summon.` were both lost. **No build improved on any map.**

## The cause, traced rather than reasoned

`skirmish-a`, `bld-arcane-artillery`, same seed, effect off then on:

```
OFF (Move 3)                          ON (Move 5)
t13  cand   move 1,0                  t13  cand   move 5,0
t13  cand   charge                    t13  cand   charge
…                                     t13  opp-1  move 4,1 ; hit cand −90
t17  cand   charge … aoe whiff        t13  opp-2  move 4,0 ; KO cand
…                                     t17  cand   charge … cancelled
victory, 19 turns, signature landed   defeat, signature never landed
```

At Move 3 the wizard's only reachable cast tiles are behind its own line. At Move 5 it can
reach `5,0` — which is inside two enemies' strike envelope — and it goes there, because
that tile buys a marginally better act.

**`compareCandidate` prices the ACT and never the TILE.** It enumerates every reachable
tile, scores the best action available from each, and carries no term for how many foes
could strike the tile it lands on. Low Move was keeping fragile builds alive *by accident*:
the safety was a side effect of not being able to walk anywhere.

This is the same structural-survivability failure ADR-0017 diagnosed for the wizard —
"focus-fired mid-charge" — arriving from the opposite direction. There it was fixed by
giving the summoner *range* so it never had to close. Extra *Move* does the reverse.

## Decision

**1. `steal.move-plus-2` stays inert, and its manifest entry is reclassified BLOCKED with
the measured cause.** The fold itself is not shipped: a schema and a layer that no content
may safely author is speculative generality, and re-deriving it is an hour's work against
a now-known target.

**2. The blocker is named precisely and testably: the probe must price a tile's exposure
before extra Move can be an advantage.** Not "movement needs more design".

**3. The claim rests on an assertion, not on this ADR's prose.** `ai.test.ts` pins the
mechanism on a purpose-built fixture — one actor at successive Move values on an otherwise
identical board. The load-bearing pair is Move 4 vs Move 5: **both act**, and the extra
tile buys a lower-effective-HP target at the cost of standing inside one more foe's reach.
The exposure ladder across Move 2…7 is `[0, 0, 2, 3, 3, 3]` — monotone non-decreasing,
which is the signature of a comparator with no safety term anywhere in its key sequence.

That test is written to go **RED** when the probe learns to weigh exposure. That is the
moment `steal.move-plus-2` may leave the manifest.

**4. A safety term added at the BOTTOM of the key sequence will not fix this.** In the
discriminating pair the exposure is lost to `targetEffHp` — the comparator's *primary*
key — not to a tiebreak. `src/sim/CLAUDE.md` already records that a term folded into a
secondary key only decides ties; this is the same rule pointing at where the next slice's
term has to sit, and how large a behavioural change that implies.

## Consequences

**The variety score is unchanged at 7. Nothing shipped that a player can see.** What
shipped is a measurement, a trace, and a test — and a manifest entry that now names a real
cause instead of a scheduling decision. A future session reading "scope" would have
scoped a one-line slice and hit the same wall.

**The last dead chassis slot stays dead, and the reason is now the AI, not the slot.**
`docs/02` §2's implementation-status block is updated to say so. This is worth stating
plainly because it inverts the natural reading: after ADR-0017 and ADR-0019 the obvious
inference was "the fifth slot is one more slice of the same work". It is not.

**The next slice is an AI slice, and it is bigger than this one was.** Teaching
`compareCandidate` to weigh exposure changes the probe from greedy-max-damage to
risk-aware. That is arguably closer to FFT's own AI, and it is a change to the one
function `src/sim/CLAUDE.md` calls "load-bearing for every slice's benchmark numbers" —
so it needs its own measurement, its own robustness sweep, and its own ADR.

**A second reading, worth keeping in view:** every caster in the field is one blow from
death (`docs/07` §3's band, enforced by AC-P6), so *any* forward step is fatal for them.
An exposure term is one answer; a field where a caster can survive one hit is another.
The next slice should price both before committing, rather than assuming the AI is the
only lever.

## Alternatives rejected

- **Ship the fold and re-baseline N to 5.** The diversity gate is P2's open exit
  criterion. Lowering it to accommodate a regression is the failure mode ADR-0014 exists
  to prevent.
- **Ship it, but unequip `move-plus-2` from the three caster builds.** The gate would hold
  and the AI defect would stay unrecorded — tuning content around a broken lever, which
  `CLAUDE.md` names explicitly ("before attributing a weakness to tuning, confirm the lever
  it leans on is wired at all"). Here the inverse: before tuning content around a lever,
  confirm the lever is not exposing a defect.
- **Keep the schema and fold, author nothing.** A live mechanism with zero shipped users
  is unprovable by any test over real content, and invites a later session to author an
  effect without re-running the measurement.
