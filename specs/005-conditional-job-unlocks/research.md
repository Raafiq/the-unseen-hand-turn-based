# Phase 0 — Research: Conditional Job Unlocks

**Feature**: 005-conditional-job-unlocks | **Date**: 2026-08-25

Resolves the spec's NEEDS-CLARIFICATION items where evidence can settle them, and says
plainly which ones evidence cannot touch.

---

## R-1 — Where does a lifetime kill count come from? (resolves the FR-004 unknown)

**Decision**: Read `UnitContribution.kos` from the existing battle report. Add no new
counter.

**Rationale**: `src/sim/harness.ts:51` already defines `UnitContribution` with `kos`,
`healingDone`, `statusesInflicted` and `landedActions`, accounted from the resolvers'
outcomes (`src/sim/resolve.ts` emits `ko: boolean` at lines 248, 326, 422). The campaign's
AP grant already consumes it via `deriveRewards` → `applyBattleResult`. Deeds ride the
same pass.

The load-bearing reason is not convenience. **A second counter could disagree with the
first**, and the two would be independently plausible — there would be no way to tell from
a save which one was right. One accounting pass means a deed and its AP are either both
correct or both wrong, and the existing AP tests already police that path.

**Alternatives considered**:
- *A new per-battle KO tally in `BattleState`* — rejected. It duplicates a number the
  resolvers already produce, and it puts campaign-layer data inside battle state, which
  `docs/05` keeps strictly one-directional.
- *Counting from the command log on replay* — rejected. Correct, but it makes the deed a
  function of replay rather than of play, and it would be the only progression number
  derived that way.

---

## R-2 — Does the mapping from battle unit to save record already exist?

**Decision**: Yes. Reuse `deriveRewards`' placement walk; do not copy it.

**Rationale**: `contributionByUnit` is keyed by **battle** unit id, which `loadEncounter`
assigns from the placement's `slotId` — not the record id. `campaign-run.ts:208` already
maps back through `encounter.placements`, and its own docstring says a second copy would
drift the moment slot naming changed. `deriveDeedDeltas` must walk the same list.

**Alternatives considered**: keying deeds by battle unit id and resolving later — rejected,
it just moves the same mapping somewhere with less test coverage.

---

## R-3 — Is 15 kills reachable? **MEASURED — no.**

**Decision**: **The 15 threshold in the spec ships a dead feature. It must change, and no
single-counter kill threshold above ~6 is defensible against the shipped campaign.**

**Evidence** — enumerated from `data/campaign/encounters/*.json`, counting placements whose
`teamId` differs from the campaign's `playerTeam` (0):

| Battle | Enemy units | Player slots |
|---|---:|---:|
| `camp-b1-the-toll-road` | 1 | 2 |
| `camp-b2-ambush-at-the-ford` | 2 | 3 |
| `camp-b3-the-hollow-watch` | 3 | 4 |
| `camp-b4-the-broken-span` | 3 | 4 |
| `camp-b5-the-warchiefs-camp` | 3 | 4 |
| **TOTAL** | **12** | 17 |

**The entire campaign fields 12 enemy units.** A unit that deployed in all five battles and
personally landed *every kill in the game* would finish on 12. 15 is not merely unlikely —
it is **unreachable by construction**.

A realistic ceiling is far lower. The party is 4 and deployment is capped below roster size,
so kills spread across deployed units: a striker that deploys every battle and takes a
generous share lands roughly **3–5** across a full playthrough.

**Why this matters more than the number**: this is exactly the failure mode `CLAUDE.md`
names — *"a capability that validates its input and then discards it reads as working."*
Every test in the spec would have gone green with the threshold at 15. `unlockedJobs` would
correctly return a list, the schema would correctly validate, the migration would correctly
run, and **no player would ever see the job**. Only SC-007 ("at least one unit in a full
campaign run actually crosses it") can catch this, and it must be a real test, not prose.

**Consequence for the spec**: OI-3 resolves, but it forces OI-4 and reopens the design.
A threshold of 3–5 is reachable, but it is so low that a *first-playthrough striker* hits it
almost automatically — which makes the unlock feel like a scripted reward, not an earned
one. That is a legitimate design, but it is not the design the spec describes.

**Alternatives considered**:
- *Raise enemy counts in the shipped battles* — rejected here. `data/campaign/encounters/`
  is explicitly out of scope, and re-authoring five battles to make one unlock reachable is
  the tail wagging the dog.
- *Count deeds across playthroughs* — rejected. There is one save slot
  (`src/render/storage.ts`); there is nowhere to aggregate.
- *Key the unlock on a cheaper deed* (`landedActions`, `statusesInflicted`) — viable and
  reachable, but changes what the job means. A designer's call, not a researcher's.

---

## R-4 — Back-fill or zero the deeds on the v3→v4 migration? (resolves OI-2)

**Decision**: **Zero.** Back-filling is not merely undesirable — it is impossible.

**Rationale**: `CampaignSave.history` stores only `{ battleId, outcome }` per battle. There
is no per-unit KO record anywhere in the save, so there is nothing to back-fill *from*. Any
"back-fill" would be a fabricated number wearing a migration's clothes — precisely the
pattern `roster.ts`'s own `migrate2to3` docstring rejects when it refuses to hand a migrated
record a real weapon.

**Consequence**: an existing save's veteran unit starts at zero and its history is invisible.
That is a real cost and it should appear in a release note, not be silently absorbed.

**Alternatives considered**: *estimate from `history.length × average foes per battle`* —
rejected outright. It invents progression the player did not earn, and it would differ from
a fresh playthrough of the same battles.

---

## R-5 — Do deeds accrue in the balance-probe runs? (resolves OI-6)

**Decision**: No — campaign saves only.

**Rationale**: `gauntlet.ts` and `benchmark-suite.test.ts` construct `UnitRecord`s directly
and drive battles through `harness.ts`. They never call `applyBattleResult`, which is where
the fold lives. So the answer falls out of the existing structure rather than needing a flag.

**Consequence that must be asserted, not assumed**: this means the build-variety score
cannot move because of deeds. SC-005 asserts it. Without that assertion the claim is prose.

---

## R-6 — Should locked deed counters be visible? (resolves OI-7)

**Decision**: Show only counters that at least one job in the loaded pack gates on.

**Rationale**: `docs/02` §B3's hint-don't-enumerate rule. Showing all four counters when
only one matters is a spoiler by elimination — a player who sees "Felled / Healed /
Afflicted / Battles" and knows one is load-bearing has three-quarters of the answer.
Deriving the visible set from the pack also means a designer adding a deed job automatically
gets its counter surfaced, with no viewer change.

**Alternatives considered**: *show all four always* — simpler, but leaks the design space.
*Show none until unlock* — the unlock then arrives with no foreshadowing, which reads as a
bug rather than a reward.

---

## R-7 — Unresolvable here: OI-1 and OI-4

Stated plainly because a research doc that quietly dropped them would read as clearance.

| Item | Why research cannot settle it |
|---|---|
| **OI-1** — does a Deed earn a currency row, given `docs/02` §B4 is titled "Kill the grind"? | This is a values question about what the game is, not a fact about the code. It needs the user and the systems designer, and whichever way it goes it needs an ADR (plan.md V1/V2). |
| **OI-4** — Bounty Hunter's skillset, tree, growth curve, mastery trait | Content authoring. One concrete trap worth recording: a job shipped with `"tree": []` is **instantly mastered**, because `isMastered` calls `every` on an empty array and `every` on an empty array is `true`. That hands out a free mastery trait to anyone who unlocks the job. |

---

## Summary of Phase 0

| Item | Status | Answer |
|---|---|---|
| R-1 source of the kill count | ✅ resolved | reuse `UnitContribution.kos` |
| R-2 unit→record mapping | ✅ resolved | reuse `deriveRewards`' placement walk |
| **R-3 is 15 reachable** | ❌ **resolved against the spec** | **no — the campaign has 12 foes total** |
| R-4 migration back-fill | ✅ resolved | zero; back-fill is impossible |
| R-5 probe runs accrue deeds | ✅ resolved | no, by existing structure |
| R-6 counter visibility | ✅ resolved | only pack-gated counters |
| R-7 OI-1 / OI-4 | ⛔ **still blocking** | needs the user + a systems designer + an ADR |
