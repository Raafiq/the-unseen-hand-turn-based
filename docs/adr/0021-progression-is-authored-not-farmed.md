# ADR-0021 — Progression is authored, not farmed: Level grants no stats, and equipment is horizontal

- **Status:** Accepted
- **Date:** 2026-08-18
- **Supersedes / amends:** amends **ADR-0001** (customization spine) by closing the gap it left — `docs/02` B0's currency table never listed character **Level**, so it was neither cut nor reconciled. Amends `docs/02` B4 and **AC-J7**, whose "no incentive to de-level" wording presumes a growth-per-level model this ADR rules out.
- **Owner docs:** `docs/02` B0/B4 + AC-J7, `docs/07` §1/§3, `docs/08` §1

## Context

The question "where do levels and EXP come in?" had no answer in the repo, and the absence was invisible because everything around it read as settled.

- `docs/02` §12 (the FFT baseline) says acting awards **EXP** driving character **Level**. Part B never reconciled it. B0's rule is "if any two rows can't be told apart by a player, one is cut or merged" — Level is not a row at all.
- `docs/02` B4 and **AC-J7** both forbid rewarding **de-leveling**, which only means something if levels drive growth.
- In code, `UnitRecord.level` exists at `rosterSchemaVersion` 2 and **nothing reads it**. Growth is `raw × current-job multiplier` (`build.ts`), a static projection. Measured: `bld-aggro-tank` builds to PA 9 / HP 359 / 72-damage swing at level 10 **and at level 40 — byte-identical**.

So the shipped behaviour is already "level is not power". It was an accident, not a decision, and an accident is not a spec.

The design goal driving this (user, 2026-08-18): the game should reward **jobs and skills**, not attrition. A player must not be able to bulldoze an encounter by farming, and stat power should lean on equipment rather than on a level counter.

## Decision

**1. Character Level grants ZERO stats. Permanently, and by construction.**

Derived stats come from `raw × job growth`, modified by trait → support → clamp (`docs/05` §4). `level` is never an input. This is what the code already does; the ADR makes it intentional and guarded.

**2. The anti-grind invariant is AUTHORSHIP, not the choice of stat carrier.**

This is the finding that reframed the proposal, and it is the load-bearing clause. **Total power on both sides moves on an authored schedule the player cannot accelerate by repetition.** Gear on a farmable drip is exactly as ruinous as farmable levels; levels on an authored drip would have been fine. "Stats live on gear instead of levels" does not, by itself, prevent anything.

This extends `docs/07` §2's existing grind-budget contract (critical path funds one full build; optional battles are acceleration, never obligation) from AP to **every** power source.

**3. Equipment is HORIZONTAL. There is no weapon-power ladder.**

Equipment carries formula, range, element, resistances, status immunity and Brave/Faith shifts — the counterplay axes `docs/03` already asks for (#10 wants Faith-dropping gear; #12 wants elemental absorb; Speed and status-immunity gear appear as named counterplay). It does **not** carry a rising WP number as the campaign's power curve.

Two measurements forced this, both taken against the shipped builds:

- **A WP ladder breaks the TTK band.** Holding `raw.hp` fixed and raising the weapon tier, builds outside their `docs/07` §3 band go **0/15 → 1/15 → 6/15** at WP 8 → 12 → 16. At WP 16 the reference committed action is 180 damage and **every tank dies in 2 hits**, landing in the squishy band. Offense on gear and defence on the record scale independently; keeping them together would require authoring HP per act on both sides — the same content-tuning burden as levels, relabeled.
- **A WP ladder is not even uniform across archetypes.** The engine ships five weapon formulas. `bareHands` has **no WP term at all** (`floor(PA × Br / 100) × PA`), so a monk gains **nothing** from a weapon tier — and two of the seven counted identities are `punch-art.` carriers. `wpWp` is **quadratic** (WP 8 → 16 is 64 → 256, ×4) where `paWp` is linear (72 → 144, ×2). One global ladder would leave one archetype flat and let another run away.

**4. Level's remaining job is a GATE, and the gate is authored.**

Level gates which jobs and equipment tiers a unit may use, and it rises on the critical path. It is not bought with EXP.

**5. The EXP band is SPECIFIED BUT DEFERRED — and explicitly aspirational until it has a test.**

A level-gap-scaled EXP curve (Triangle Strategy's shape: large award when underlevelled, near-zero when overlevelled) is the right mechanism *if* level ever becomes earned rather than authored. It is **not** built, and per this repo's most expensive lesson — an unasserted number in `docs/` reads as governing while governing nothing — it gets **no AC** until an EXP system exists to assert against. `docs/07` carries it tagged `[DEFERRED]`, not as a target.

**Honesty about the precedent:** Triangle Strategy and Fire Emblem are cited for the *EXP band*, and that shape is well-evidenced. Neither supports decision 1 — **their levels do grant stats.** The closest precedent for "rank grants abilities, gear grants numbers" is XCOM, and the closest for authored, unfarmable supply is Into the Breach's reactor cores. This ADR is more radical than any single precedent and should not borrow their credibility for decision 1.

## Consequences

- **`docs/02` B0 gains a Level row** — the reconciliation gate finally covers it: earned by authored progression, spent on nothing, distinct because it is an access gate rather than a wallet.
- **B4 and AC-J7 are amended.** "No incentive to de-level" is now satisfied *by construction* rather than by tuning: growth cannot read a level it is never given. AC-J7's AP half (capped, level-independent grants) is unchanged and still tested.
- **Two new ACs** (`docs/02`): **AC-J10** level is not power — the same record built at two levels must be byte-identical; **AC-J11** no power source outside the authored schedule. Note honestly that AC-J10 **passes today, before any work** — it is a regression guard, not evidence for the design, and its worth is proven by mutation (wire `level` into `deriveStats` and watch it go red), not by its green tick.
- **The equipment layer is now scoped.** `build.ts`'s `DEFAULT_BUILD_WEAPON` placeholder becomes a real `weapon` on `UnitRecord`: a `rosterSchemaVersion` bump with a migration, a regenerated frozen golden, and a re-measurement of the diversity gate at N=7. ADR-0020's robustness evidence is a plateau at **one** point on the stat curve; horizontal gear keeps it at one point, which is a reason to prefer horizontal beyond the two measurements above.
- **We give up the "my unit grew stronger" beat.** Growth now reads entirely as new *abilities* and new *options*. That is a real loss of a familiar RPG pleasure, accepted deliberately, and it puts more weight on the AP economy's pacing (`docs/07` §4) to supply a sense of advancement.
- **The authored schedule has no author yet.** Act tiers live in the campaign, and the story repo does not exist (`docs/08` §4). Until it does, "authored" is enforced only by the benchmark encounters and this ADR.
- **Reversible at low cost.** Nothing here bumps a battle schema or changes a formula; decisions 1 and 2 are constraints on what may be added. Reversing means writing an ADR and wiring `level` into `deriveStats` — one function.

## Alternatives rejected

- **Levels grant stats, capped per chapter (Tactics Ogre: Reborn).** Airtight against overlevelling, but it is a blunt instrument players visibly resent, and it keeps growth-per-level — the exact model B4 was written to defuse.
- **Levels grant stats, enemies scale to your highest unit (FFT's own random battles).** Grinding self-defeats, but it produces the treadmill feel where nothing the player earns changes anything.
- **Cut `level` from the schema entirely.** Tempting while it is unread. Rejected: the access gate is genuinely useful for pacing (`docs/07` §4 stages currencies by act), and deleting a field to re-add it later costs two migrations.


## Amendment — 2026-09-01: decision 4's gate is NOT BUILT

Decision 4 reads in the present tense: *"~~Level gates which jobs and equipment tiers a unit
may use, and it rises on the critical path.~~"* Checked against the tree today, **neither
clause is true of the code**, and the sentence has been read as a description of shipped
behaviour.

- `level` appears in exactly one file, `src/sim/roster.ts` — the schema field (`min(1)`) and
  a default of 1 in `defaultUnitRecord`. No function reads it.
- No job check and no equipment check consults it; `loadout.ts` and the weapon catalog gate
  on learned abilities and inventory, not on a tier.
- Nothing writes it. The campaign party ships at level 1 and stays there; the 15 benchmark
  builds author level 10, which changes no built unit.

**What is unchanged:** decisions 1–3 and 5 stand, and the negative half — level grants no
stats — is real and asserted by AC-J10 (whose value is the mutation, not the green tick).
The gate stays the recorded intent and the reason `level` is not cut from the schema; it is
now marked `[NOT BUILT]` in `docs/02` B0 and `docs/07` §1 so no reader takes it for
behaviour. Building it needs a tier field on jobs and weapons plus a check with a
discriminating fixture — a unit one tier short must be refused where an equal unit at tier
is allowed.
