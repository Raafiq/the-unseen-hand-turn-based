# ADR-0018 — Control is priced in the same currency as damage, and Charm decides battles

- **Status:** Accepted
- **Date:** 2026-08-16
- **Supersedes / amends:** amends **ADR-0014** (diversity-gate phased target: `N` 6 → 7). Extends **ADR-0011** (status behaviour = code, tuning = data) with the first behaviour flag that changes allegiance.
- **Owner docs:** `docs/01` §8, `docs/05` §2/§6, `docs/06` AC-E2, `src/sim/CLAUDE.md`

## Context

Two capabilities were authored, validated, shipped — and inert.

The balance probe skipped every `formula: "none"` action, so a disable could never be selected however good it was.
And `status.charm` was a marker: nothing in the sim read allegiance from a status, so a charmed unit went on attacking the side that charmed it.

Between them they made a whole design axis unmeasurable.
`docs/01` §8 says statuses "swing battles more than raw damage", and the shipped roster had no build that expressed control at all — the Thief's entire skillset was inert (`content.ts` `DEFERRED_SKILLSETS`), and no shipped record even used the job.

## Decision

**1. A status is valued in HP-equivalent, folded into `magnitude` — there is NO `DISABLE` action class.**

`ai.ts` prices a debuff as the damage the target will now not deal:

```
turnsDenied = addedCT × swing × target.speed / 100      (a turn is 100 CT; a status decays 1 CT/tick)
value       = min( turnsDenied × attackDamage(target, actor),  target.hp )
```

- `swing` is `1` for `preventsAction`, `1 - ctFactor` for a CT debuff, and **`2` for control** (they lose the turn, I gain it).
- `addedCT` is **marginal** over what the target already carries, so re-applying a live status is worth `0` and the probe cannot lock into a disable loop.
- The **cap is `target.hp`**: no status is worth more than removing the unit outright, which also bounds a permanent status without inventing a horizon constant.
- A status the sim does not READ scores `0`, so an ability inflicting an inert status stays unpicked. That is the half that can come out the other way.

A scaffolded `DISABLE` class had sat above `CHIP` since Slice 2. Using it would have made every landable status out-rank every attack unconditionally — the bucket-first key `src/sim/CLAUDE.md` bans — and would have overridden the AC-E3(b) FOCUS rule (charm a healthy foe rather than finish a dying one). Pricing control in the same currency keeps one uniform, transitive total order. The class was deleted, not left as scaffolding.

**2. Charm changes which team a unit fights for, through ONE seam.**

`state.ts` `effectiveTeamOf(unit)` is the only place allegiance is decided. `ActiveStatus` gains `controlsTarget` (a catalog behaviour flag, ADR-0011) and `controlledByTeamId` (stamped at inflict time — the catalog cannot know the inflicter). Schema v9 → v10; the migration stamps `false`/`null`, so a migrated save plays byte-identically.

The seam is read by: the probe's targeting, both AoE friend/foe filters, the driver's damage attribution, movement traversal, and the victory conditions. It is **not** read by the scheduler (allegiance is not a CT concept) or the harness's team HP reports (a body still belongs to the roster that deployed it).

**3. Victory counts the team a unit FIGHTS FOR — charming the last defender ends the battle.**

This is the load-bearing half, and it was not the first implementation. Counting a charmed body for its nominal team produced a **livelock**: nobody on the charmer's side will attack an ally, and the charmer re-applies control the moment it lapses. Measured: a 580-tick timeout with 18 charms landed and one enemy standing. The same class of bug appeared in traversal — a charmed body on a corridor map blocked the lane its captors needed and nobody would clear it (453-tick timeout).

Control is the thief's win condition. The rule is symmetric: if your last unit is charmed, you lose.

`[UNCERTAIN vs FFT]` — the source game's rule for an all-charmed enemy team is unverified (proxy-blocked sources, `docs/01` §12). Tagged for `fft-fidelity`.

**4. "Landed" includes a landed status.**

`ResolutionEvent`/`UnitContribution` gain `statusesInflicted`, and the diversity gate's `inBand` contribution test counts it. This is a **fix, not a loosening**: judging contribution by HP movement alone scored a pure-control build at zero on every map it decided, so the gate could never have credited one. The anti-"carried by the fillers" property is unchanged — an inert candidate still lands none of damage, healing or status.

## Consequences

- **`N` 6 → 7.** `bld-cutpurse` (`steal.`) is a genuinely new signature prefix: 4/6 phys maps, `losingMatchups: ["magic"]`, signature landed on every clear. `docs/06` AC-E2, the `gauntlet.ts` manifest and `npm run state` move with it.
- **Zero shipped runs changed from decision 1 alone.** Measured by A/B over the whole gauntlet: every ability-usage histogram byte-identical. `magnitude` is only the SECOND comparator key, so it decides among acts on the *same* focus target — and the shipped inflicting abilities (`aim.head-shot`, `aim.leg-shot`, `geomancy.quicksand`) were already the biggest hit there. The capability is live (unit-tested five ways) and currently changes nothing on this roster; that is the honest report, not a claim of impact.
- **The frozen golden moved by representation only** — `schemaVersion` and the two new `ActiveStatus` fields; every roll-bearing field byte-identical, classified before regeneration.
- **The cutpurse sits exactly at `VIABLE_MIN_MAPS`.** That is the intended shape, not slack: at raw Speed 7 it reads 6/6 with *no* losing matchup — the convergence failure `docs/02` B5 exists to prevent — so the shipped value is the roster's uniform 8 and the archetype's quickness comes from job growth. Robustness: 4/6 flat across speeds 8–11 and across a common raw-HP perturbation of ×0.95…×1.15, N=7 at every step; it drops out at ×0.90.
- **Infliction is still unconditional on a hit** (no status roll — ADR-0010's declared deferral). With a 100 % charm, the only thing preventing a permanent lock is the victory rule above. A real per-status accuracy roll needs its own declared slot in the `docs/05` §3 order and would change this calculus.
- **Four of `steal`'s five actions remain inert** (economy / equipment layer). The skillset left `DEFERRED_SKILLSETS`, so a new ABILITY-level manifest (`DEFERRED_ACTIONS`) carries the named blockers and drives the prep panel's "no effect yet" marking — a skillset-level check goes quiet the moment one action in the set is live.

## Alternatives rejected

- **Give the steal line damage** (fork B in the slice plan). Cheaper and keeps the probe untouched, but it makes the Thief a worse Knight and buys a number instead of a mechanic.
- **A `DISABLE` action class.** See decision 1: intransitive risk and it overrides the focus rule.
- **A flat per-status bonus.** Cannot distinguish Stop-on-a-fast-caster from Stop-on-a-slow-tank; the turn-economy model does, and it is asserted (`ai.test.ts` C5).
- **Diminishing returns / charm immunity after expiry.** Would also break the livelock, but needs new per-unit memory in the schema and states a rule the player cannot see. The victory rule is one line and is legible in play.
