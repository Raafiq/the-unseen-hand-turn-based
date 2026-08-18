# Slice — the reaction slot goes live

**Goal.** Make the chassis's REACTION slot a real capability. Today `build.ts` validates the
equipped reaction and then discards it: 7 of 15 shipped builds wear a dead reaction. This is
the same defect class the support slot had (ADR-0017), which cost two slices of
mis-diagnosis before it was found.

**Not in this slice.** The MOVEMENT slot (8 builds wear `steal.move-plus-2`). It is a
different mechanism (move/jump stats, not the resolve pipeline) and waking it hands +2 Move
to 8 of 15 builds at once — a global tempo change on a roster whose seventh identity sits
exactly at the viability floor. It gets a named blocker and the next handoff.

---

## 1. What "live" means

| reaction | kind | behaviour |
|---|---|---|
| `punch-art.counter` | `counter` | after taking a landed PHYSICAL blow from a foe inside the reactor's own basic-attack range, strike back once |
| `punch-art.hamedo` | `preemptive` | an incoming PHYSICAL blow from inside that range is NULLIFIED and the reactor strikes first |
| `white-magic.reraise` | DEFERRED | reviving a KO'd unit is unmodeled — every resolver refuses a downed target and the crystal countdown has no reverse |
| `white-magic.retribution` | DEFERRED | counters a MAGIC blow with a holy strike; no unit has a magic-formula counter-source |
| `steal.gilgame-heart` | DEFERRED | gil-on-hit is post-battle economy (docs/07), outside battle state |

Trigger chance is **Brave%** (docs/01 §4). Not authorable — FFT's Brave-based reactions all
use it, and a per-ability multiplier is a balance knob nothing in the design asks for.

## 2. Declared roll order (docs/05 §3)

Per (attacker, defender) blow — this is the **whole** RNG change:

```
1. HIT ROLL          — always drawn (unchanged)
2. REACTION ROLL     — drawn IFF the defender's equipped reaction's trigger condition
                       holds for this blow. A unit equips at most one reaction, so at
                       most one draw. Evaluated at the reaction's own stage:
                       PRE-apply for `preemptive`, POST-apply for `counter`.
3. COUNTER HIT ROLL  — drawn IFF (2) fired and the reaction strikes back.
```

A unit with no reaction, or one whose condition does not hold, consumes **exactly the draws
it consumes today** — so every existing golden moves by representation only.

The hit roll is drawn even when `preemptive` then nullifies the blow. That wastes a draw
relative to FFT's "the attack never happens", but it is unobservable in outcome and it keeps
"the hit roll is unconditional" as an invariant rather than a special case.

## 3. Trigger predicate — `counter`

All of: the blow was PHYSICAL · it LANDED and removed HP · the defender is still alive ·
the attacker is alive and within the defender's own basic-attack range · the blow was not
itself a reaction (no counter-of-counter) · the Brave roll passes.

`preemptive` is the same minus "removed HP"/"still alive" (it is checked before the write)
and it discards the incoming damage, KO and status.

## 4. Attribution — the part that would otherwise be invisible

`driver.ts`'s `hpDiffEvent` credits a whole-state HP diff to the acting unit, with an
explicit tripwire that says a future reaction path must "surface here and account itself".
Counter damage lands on the **attacker**, i.e. the event's own source, which `hpDiffEvent`
deliberately leaves uncredited — so without a change the counter would be **invisible to the
diversity gate**, and `bld-counter-wall` would still score zero.

So each fired reaction emits its **own** `ResolutionEvent`, credited to the REACTOR and
labelled with the reaction ability id. That is what lets a counter count as a landed
signature action.

## 5. Files

| file | change |
|---|---|
| `src/sim/reaction.ts` *(new)* | schemas, `DEFERRED_REACTION_EFFECTS`, pure predicates. Dependency-free (no Zod TDZ cycle) |
| `src/sim/ability.ts` | `reactionEffect?` on the authored ability |
| `src/sim/content.ts` | integrity: a `reactionEffect` on a non-reaction ability throws |
| `src/sim/state.ts` | `UnitState.reaction`; SCHEMA_VERSION 10 → 11 + `migrate10to11` |
| `src/sim/build.ts` | project the equipped reaction onto the unit |
| `src/sim/resolve.ts` | the reaction stage, shared by attack / ability / AoE |
| `src/sim/driver.ts` | one extra `ResolutionEvent` per fired reaction |
| `src/render/preview.ts` | `counterRisk` on `ActPreview` — the absent row is now a lie |
| `src/sim/gauntlet.ts` | `bld-counter-wall` EXCLUDED → MEASURABLE |
| `data/base-pack.json` | `reactionEffect` on counter + hamedo |

## 6. Evidence the tests must produce

- **A/B on the built object** — the same record with and without the reaction equipped must
  produce a DIFFERENT `UnitState`, and a different resolve outcome. Equip-time validation
  looks identical either way; only this can come out the other way.
- **Discriminating negatives** — a MAGIC blow does not trigger `counter`; an out-of-range
  physical blow does not; a counter does not counter a counter; a KO'd defender does not
  counter.
- **Attribution** — the counter's damage is credited to the REACTOR, not the attacker.
- **Site coverage** — a manifest test enumerating the damage sites (attack / ability / AoE /
  charge) and stating which fire reactions and why, so "charged actions are magic-only" is
  asserted rather than assumed.
- **Determinism** — reaction-less units' rolls are byte-identical; the frozen golden moves by
  the new field only.

## 7. Balance risk, to be measured not argued

`bld-faithzero-monk` already clears every {map × opposition} cell (`winsAllInBand`). Hamedo
makes it harder to kill AND adds damage. If it also becomes fastest everywhere, the
threshold-free dominance ban trips and the gate FAILS. Measure before and after; if it
trips, that is a real anti-convergence signal, not a test to loosen.

`bld-counter-wall`'s signature prefix is `punch-art.`, which **collapses onto**
`bld-faithzero-monk`'s. Retiring its blocker is therefore not expected to raise the variety
score by itself. Say so plainly rather than implying the count will move.
