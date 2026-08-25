# Feature Specification: Conditional Job Unlocks ("Deed Jobs")

**Feature Branch**: `005-conditional-job-unlocks`

**Created**: 2026-08-25

**Status**: ❌ **CUT — 2026-08-25, by user decision.** Not deferred, not blocked: rejected.

> ## Why this was cut
>
> It would have added a **fourth axis** to a customization spine locked at three
> (ADR-0001: the 5-slot chassis, AP trees + mastery, hybrid/fusion jobs). The
> constitution requires a new ADR to add one, and the feature did not earn it.
>
> Two independent reasons, either sufficient on its own:
>
> 1. **It breaks the spine.** A behaviour-gated unlock is a genuinely new progression
>    concept. `docs/02` §B0's rule is that no feature is real until it earns a currency
>    row, and a "Deed" row could not be told apart from a grind.
> 2. **It rewards farming.** `docs/02` §B4 is titled *"Kill the grind, kill the
>    exploits"*. A kill-count threshold is, by construction, a reason to farm kills —
>    the exact shape §B4 designs out.
>
> A third finding made the cut easy rather than causing it: the shipped campaign fields
> **12 enemy units in total**, so the worked example's 15-kill threshold was unreachable
> by a unit that solo-killed the entire game (`research.md` R-3).
>
> **What survives.** If behaviour-gated content is wanted later, the existing
> **hybrid/fusion** axis already expresses "you have to earn this" through job mastery
> combinations, with no new concept and no farming incentive. That is where to put it.
>
> These files are kept as the record of a considered rejection, so the idea is not
> re-proposed from scratch. **Do not implement any of it.**


**Input**: User description: "introducing unique jobs if certain conditions are met.
e.g bounty hunter if character has killed 15 enemies"

## Overview

Some jobs cannot be bought. They are **earned by what a unit has done** — a lifetime
counter of battlefield deeds crosses a threshold and a new job appears in that unit's
job list. Bounty Hunter after 15 kills is the worked example.

Today `PrepModel.jobIds()` returns every job in the content pack, so **no job is gated
by anything**. Mastery and hybrids are the only unlock ideas in the design, and both key
off tree completion, not behaviour.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A job appears because of how you fought (Priority: P1)

A player fields the same thief across five battles, using it to finish wounded enemies.
After the fifth battle the prep screen shows a job that was never there before: **Bounty
Hunter**, marked as newly unlocked, on that unit only. No other party member has it.

**Why this priority**: this is the whole feature. Without it there is nothing to ship.
It is also the only part that must touch the save format, so it has to land first.

**Independent Test**: run a scripted campaign where one unit accumulates 15 KOs and
another accumulates 0, then assert `unlockedJobs(recordA)` contains `bounty-hunter` and
`unlockedJobs(recordB)` does not. Fully testable headless, no viewer needed.

**Acceptance Scenarios**:

1. **Given** a unit record with `deeds.kos = 14`, **When** a battle is folded in where
   that unit landed 1 KO, **Then** `deeds.kos` is 15 and `bounty-hunter` is in that
   unit's unlocked job list.
2. **Given** a unit record with `deeds.kos = 15` and `bounty-hunter` already unlocked,
   **When** the same battle is folded in a second time, **Then** the unlocked list is
   unchanged (idempotent, no duplicate).
3. **Given** two party members in the same battle, **When** only one lands KOs,
   **Then** only that one's `deeds.kos` increases.

---

### User Story 2 - The condition is discoverable, not a spoiler (Priority: P2)

Before it unlocks, the player sees that *something* is trackable — the unit sheet shows
"Felled: 9" — but not the list of jobs it might open. After it unlocks, the prep screen
says which deed did it.

**Why this priority**: `docs/02` B3 sets the house rule for hybrids — recipes are
**hinted, not enumerated**. A deed job that shipped as a hidden dice-roll would read as a
bug; one that shipped as a checklist would collapse into a quest log. This is the same
transparency split, and it is presentation, so it can land after P1.

**Independent Test**: assert the prep view-model exposes `deedCounters` for a unit and
does NOT expose any unlock threshold or job id for a job that is still locked.

**Acceptance Scenarios**:

1. **Given** a unit at 9 KOs, **When** the prep screen renders, **Then** a counter reads
   9 and no locked deed job is named anywhere in the view-model.
2. **Given** a unit that just crossed 15, **When** the prep screen renders, **Then**
   Bounty Hunter is listed and labelled with the deed that unlocked it.

---

### User Story 3 - The pack, not the code, decides the conditions (Priority: P3)

A designer adds a second deed job to `data/base-pack.json` with a different counter and
threshold, and it works with no code change.

**Why this priority**: one hard-coded job is a demo. It is also the cheapest way to prove
the abstraction is real — but the game ships fine with one deed job, so it is P3.

**Independent Test**: author a throwaway test pack with a job gated on
`healingDone >= 500`, load it, and assert the same unlock function gates it. No branch in
`progression.ts` may name `bounty-hunter`.

**Acceptance Scenarios**:

1. **Given** a content pack with two deed-gated jobs on different counters, **When** a
   unit meets one threshold, **Then** exactly that job unlocks.
2. **Given** a pack whose job names an unknown counter, **When** it loads, **Then**
   `loadContentPack` throws `ContentIntegrityError` at load time, not at unlock time.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The unit record MUST carry a permanent, monotonic `deeds` counter block.
  It is **write-once-upward**: nothing removes or decrements a deed, matching the AC-J3
  rule that permanent progress is never lost. Adding it bumps
  `ROSTER_SCHEMA_VERSION` 3 → 4 with a migration registered in `ROSTER_MIGRATIONS`.

  Sketch:

  ```ts
  // src/sim/roster.ts — illustrative only, the prose above is normative.
  export const DeedsSchema = z
    .object({
      /** Foes this unit dropped to 0 HP, across every battle it has fought. */
      kos: IntSchema.min(0),
      /** Σ HP restored to allies. */
      healingDone: IntSchema.min(0),
      /** Σ statuses newly applied to others. */
      statusesInflicted: IntSchema.min(0),
    })
    .strict();

  /** Zeroed deeds — one definition, so a fresh record and a migrated one agree. */
  export function emptyDeeds(): Deeds { /* ... */ }

  // migrate3to4: zero, NOT back-filled. See OI-2.
  const migrate3to4: RosterMigration = (record) => ({
    ...record,
    rosterSchemaVersion: 4,
    deeds: emptyDeeds(),
  });
  ```

- **FR-002**: A job in the content pack MAY declare an unlock condition. Absent field =
  always available (every job shipping today keeps working untouched). The condition
  names a **deed key** and a **minimum**, never a code branch.

  Sketch:

  ```ts
  // src/sim/job.ts — illustrative only.
  export const DeedKeySchema = z.enum(["kos", "healingDone", "statusesInflicted"]);

  export const JobUnlockSchema = z
    .object({
      deed: DeedKeySchema,
      atLeast: IntSchema.min(1),
      /** Player-facing line shown AFTER it unlocks, not before (FR-006). */
      earnedLabel: z.string().min(1),
    })
    .strict();

  // JobSchema gains:  unlock: JobUnlockSchema.optional()
  ```

  ```json
  // data/base-pack.json — the worked example.
  {
    "id": "bounty-hunter",
    "primarySkillset": "bounty",
    "unlock": { "deed": "kos", "atLeast": 15, "earnedLabel": "Felled 15 foes" },
    "genderLock": null,
    "growth": { "...": "TBD — see OI-4" },
    "masteryBonus": { "trait": "trt-mark" },
    "tree": []
  }
  ```

- **FR-003**: A pure predicate MUST decide whether a record has unlocked a job, and a
  pure list function MUST return every job that record may enter. No RNG, no clock — this
  is engine substrate and falls under the P0 determinism invariant.

  Sketch:

  ```ts
  // src/sim/progression.ts — illustrative only.
  export function isJobUnlocked(record: UnitRecord, jobId: string, registry: ContentRegistry): boolean {
    const u = registry.job(jobId).unlock;
    return u === undefined || record.deeds[u.deed] >= u.atLeast;
  }

  /** Pack order, so the prep list never reshuffles under the player. */
  export function unlockedJobs(record: UnitRecord, registry: ContentRegistry): string[] { /* ... */ }
  ```

- **FR-004**: Deeds MUST be folded into the record from the SAME battle report that
  already funds the AP grant, so a deed and its AP are credited by one accounting pass and
  cannot disagree. `UnitContribution` already carries `kos`, `healingDone` and
  `statusesInflicted`, accounted from resolver outcomes — this reads them, it does not
  add a second counter.

  Sketch:

  ```ts
  // src/sim/campaign-run.ts — deriveRewards gains a parallel deed delta.
  export function deriveDeedDeltas(
    def: CampaignDef, save: CampaignSave, encounter: Encounter,
    contributionByUnit: Readonly<Record<string, UnitContribution>>,
  ): Record<string, DeedDelta> { /* same placement → recordId mapping as deriveRewards */ }

  // src/sim/campaign.ts — applyBattleResult folds it alongside awardAp.
  const party = save.party.map((rec) =>
    addDeeds(awardAp(rec, result.rewards[rec.id] ?? NO_AP), result.deeds[rec.id] ?? NO_DEEDS),
  );
  ```

- **FR-005**: `loadContentPack` MUST reject a pack, **at load time**, whose job declares
  an unknown deed key, a threshold below 1, or **both `unlock` and the reserved `requires`
  field** (deed-gating and hybrid-recipe gating are separate axes and combining them is
  untested — the loader refuses rather than silently picking one). Bumps
  `CONTENT_SCHEMA_VERSION` 2 → 3.

- **FR-006**: The prep screen MUST list only unlocked jobs, MUST show the unit's deed
  counters, and MUST NOT name or describe a job that is still locked.

  Sketch:

  ```ts
  // src/render/prep.ts — jobIds() currently returns EVERY pack job (the gate goes here).
  jobIds(): string[] {
    return unlockedJobs(this.selectedRecord(), this.registry);
  }
  ```

- **FR-007**: An unlock MUST NOT auto-change the unit's job, auto-spend AP, or alter the
  loadout. It widens the choice set and does nothing else — free respec (AC-J4) means the
  player decides, always.

- **FR-008**: A deed MUST be credited by **team allegiance at the moment of the action**,
  which is exactly what the resolvers already record. A unit on the opposing team when it
  was felled counts, including a charmed ally (EC-3); a unit on your own team does not.
  The resolver's accounting is the single source of truth and MUST NOT be re-litigated
  downstream — a second allegiance judgement in the deed layer could disagree with the one
  that paid the AP.

- **FR-009**: Deeds MUST NOT be earned from a battle the player lost and retried. Retrying
  a lost battle already leaves the party untouched (`campaign.ts:retryBattle`), and
  `applyBattleResult` returns on defeat before the party is touched; deeds inherit both, so
  a player cannot farm a losable fight.

### Key Entities

- **Deeds**: a per-unit, permanent, monotonic counter block on `UnitRecord` — `kos`,
  `healingDone`, `statusesInflicted`. Career totals, not per-battle. Never decremented,
  never reset by job change or death. **Every key must already exist on
  `UnitContribution`**, or it is a number with no source.
- **JobUnlock**: an optional per-job condition in the content pack — one deed key, one
  minimum, one player-facing label shown only after the fact.
- **DeedDelta**: the per-battle increment derived from `UnitContribution`, keyed by
  record id. Transient; folded and discarded.

## Affected Files *(mandatory)*

All paths below were verified to exist at `ba9f7be` except those marked NEW.

### To be changed

| File | Change | Serves | Notes |
|---|---|---|---|
| `src/sim/roster.ts` | MODIFY | FR-001 | Add `DeedsSchema` + `deeds` field; `ROSTER_SCHEMA_VERSION` 3→4; register `migrate3to4`; extend `defaultUnitRecord`. Per `src/sim/CLAUDE.md`, the migration lands in the SAME commit as the bump. |
| `src/sim/job.ts` | MODIFY | FR-002 | Add `DeedKeySchema` + `JobUnlockSchema`; `JobSchema` gains `unlock?`. Watch the Zod temporal-dead-zone rule — declare before `JobSchema`. |
| `src/sim/progression.ts` | MODIFY | FR-003, FR-004 | Add `isJobUnlocked`, `unlockedJobs`, `addDeeds`. Pure, no RNG — same contract as `awardAp`. |
| `src/sim/campaign-run.ts` | MODIFY | FR-004 | Add `deriveDeedDeltas`, reusing the placement→`recordId` mapping `deriveRewards` already owns. Do not copy that mapping. |
| `src/sim/campaign.ts` | MODIFY | FR-004, FR-008 | `BattleResult` carries deeds; `applyBattleResult` folds them on victory only. `CAMPAIGN_SCHEMA_VERSION` needs no bump — deeds live inside `UnitRecord`. |
| `src/sim/content.ts` | MODIFY | FR-005 | Integrity check for the unlock field; `CONTENT_SCHEMA_VERSION` 2→3 + migration. |
| `src/sim/index.ts` | MODIFY | FR-003 | Barrel exports for the new public functions. |
| `src/render/prep.ts` | MODIFY | FR-006, FR-007 | `jobIds()` (line ~444) is the single gate point. Add `deedCounters` to the view-model. `JOB_LABEL` needs a Bounty Hunter entry. |
| `data/base-pack.json` | MODIFY | FR-002 | The `bounty-hunter` job, its skillset, its abilities, its mastery trait. |
| `src/sim/roster.test.ts` | MODIFY | FR-001 | v3→v4 migration round-trip; deeds survive `changeJob`. |
| `src/sim/progression.test.ts` | MODIFY | FR-003 | Threshold boundary at 14/15/16; idempotence; monotonicity. |
| `src/sim/campaign-run.test.ts` | MODIFY | FR-004, FR-008 | Deeds credit the KO'ing unit only; a lost-then-retried battle credits nothing. |
| `src/sim/content.test.ts` | MODIFY | FR-005 | Unknown deed key and `atLeast: 0` both throw at load. |
| `src/render/prep.test.ts` | MODIFY | FR-006 | Locked job absent from the view-model; counter present; unlocked job named. |
| `docs/02-job-and-customization-system.md` | MODIFY | all | **Blocking, see OI-1.** B0's currency table needs a Deed row or the feature is cut by the project's own rule. |
| `docs/adr/` | NEW | all | An ADR recording the B4 tension in OI-1, whichever way it resolves. |
| `state/index.html` | MODIFY | — | Regenerate with `npm run state` as the LAST step — a new ADR and a new job are both counted artifacts. |

### To be referenced (read-only)

| File | Why it matters |
|---|---|
| `src/sim/harness.ts` | `UnitContribution` (line 51) already counts `kos`, `healingDone`, `statusesInflicted` from resolver outcomes. This feature consumes it; adding a parallel counter would let the two disagree. |
| `src/sim/resolve.ts` | Where `ko: boolean` is emitted (lines 248, 326, 422) — the ground truth the contribution is accounted from. |
| `src/sim/loadout.ts` | The `UnitRecord` refine rule couples `currentJob` to `loadout.secondary`; entering a newly-unlocked job can strand a secondary. |
| `docs/02` §B0, §B3, §B4 | The currency gate, the hint-don't-enumerate rule, and the anti-grind rule this feature is in tension with. |
| `src/sim/CLAUDE.md` | Zod TDZ, migration-per-bump, gate-calibration rules. |
| `data/builds/*.json` | 15 authored builds — none currently reference a gated job. |

### Deliberately NOT touched

| File | Why it is out of scope |
|---|---|
| `src/sim/gauntlet.ts` | The build-variety gate is at 7 of a target 8 and carried into M1. A new job that credited a new identity would move the score for a reason unrelated to build diversity. Bounty Hunter is EXCLUDED from the gate manifest in this slice. |
| `src/sim/rng.ts` | No randomness is introduced. Deeds are counted from outcomes that already happened. |
| `src/sim/state.ts` | `BattleState` is untouched — deeds are campaign-layer, compiled INTO a battle unit at deploy, never back. |
| `data/campaign/encounters/*` | The five shipped battles are not re-authored — but they field only **12 enemies total**, which is what makes OI-3 blocking. Re-scoping them is the alternative to lowering the threshold. |

## Edge Cases & Open Items *(mandatory)*

### Edge Cases

| # | Condition | Decided behaviour |
|---|---|---|
| EC-1 | Unit is in Bounty Hunter, and a future pack raises the threshold to 20 | Stays. Unlock is latched by the deed counter, and the counter never falls. Re-locking a job would violate AC-J3. |
| EC-2 | Unit crosses the threshold mid-battle | Nothing happens until the battle is folded into the save. Battle state has no job list. |
| EC-3 | Unit KOs a charmed ally | Counts. It was an enemy-team unit at the moment of the KO — the resolver's own accounting is the ground truth and it does not re-litigate allegiance. |
| EC-4 | Unit lands the KO via a reaction, not its own turn | Counts — **verified**. `driver.ts:181` (`reactionEvents`) emits a `ResolutionEvent` with `sourceUnitId: r.reactorId` and `kos: r.ko ? 1 : 0`, so `accountEvents` credits the reactor. |
| EC-5 | Two units damage the same foe; one lands the killing blow | Only the killer scores. No assist credit. |
| EC-6 | Player enters Bounty Hunter while holding a Secondary that IS Bounty Hunter | Impossible — the schema `refine` in `roster.ts` rejects it. The prep screen must clear the secondary on the job change, as it already does. |
| EC-7 | A v3 save is loaded | Migrates to v4 with all deeds at zero. See OI-2 — this is a decision, not a fallback. |
| EC-8 | A pack removes a deed job a save has unlocked | `registry.job()` throws on the unknown id. Loading must fail loudly, matching the existing content-integrity posture. |

### Open Items — resolve before implementing

| # | Question | Severity | Default if unanswered | Owner |
|---|---|---|---|---|
| OI-1 | **`docs/02` B4 is titled "Kill the grind, kill the exploits" and says no action rewards more AP for being degenerate. A kill-count unlock is an explicit incentive to farm kills — the exact shape B4 designs out.** Does a Deed earn a B0 currency row, or is this feature cut by the project's own gate? B0's rule: two rows a player cannot tell apart, one is cut. Deed vs Mastery is arguably distinguishable (behaviour vs completion); Deed vs a grind is not. | BLOCKING | none — must be answered | user + `systems-designer` |
| OI-2 | Back-fill deeds on the v3→v4 migration, or zero them? Zeroing means an existing save's veteran unit starts from 0 and the player's history is invisible. Back-filling is impossible — no per-unit KO history is stored, only `history[].outcome`. | BLOCKING | zero, and say so in the release note | user |
| OI-3 | **Is 15 KOs reachable? MEASURED — no.** The five shipped battles field **12 enemy units in total**, so 15 is unreachable even by a unit that solo-kills the entire game (research.md R-3). The threshold must change, or the campaign must. Every test in this spec would have passed at 15 while no player ever saw the job. | **STILL BLOCKING** — the measurement resolves the question, not the design | none — pick a reachable number, a different deed key, or re-scope the campaign | user |
| OI-4 | Bounty Hunter's actual content: skillset, tree, growth curve, mastery trait. A job with `"tree": []` is instantly mastered by `isMastered` (`every` on an empty array is true), which would hand out a free mastery trait. | BLOCKING | none | `systems-designer` + `content-author` |
| OI-5 | Does Bounty Hunter enter the build-variety gate manifest? Excluded in this slice (above), but `src/sim/CLAUDE.md` requires an N-bump to move the manifest, ADR-0014, `docs/06` AC-E2, `docs/08` §1a, `docs/11` §3 and `npm run state` together. | DECIDE | excluded, recorded in the manifest as an explicit exclusion | user |
| OI-6 | Do deeds accrue in the balance-probe gauntlet runs, or only in campaign saves? The gauntlet builds records directly and never folds a battle result. | DECIDE | campaign only — the gauntlet never calls `applyBattleResult` | `combat-engineer` |
| OI-7 | Should any deed counter be visible before its first unlock, given no shipped job is gated on `healingDone` or `statusesInflicted`? Showing three counters when one matters is a spoiler by elimination. | **RESOLVED** (research.md R-6) | show only counters some pack job gates on | user |
| OI-8 | `docs/` outranks code in this repo, so a spec with no source doc has nothing authoritative behind it. Does this become `docs/12-conditional-jobs.md` before implementation, or stay spike-only? | TRACK | spike-only; do not implement from this file | user |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A unit that lands 15 KOs across a campaign has Bounty Hunter in its job
  list; a unit in the same campaign that lands 0 does not. Both assertions in one test —
  a one-sided check cannot tell "unlocked correctly" from "unlocked for everyone".
- **SC-002**: The threshold discriminates at the boundary: 14 locked, 15 unlocked, 16
  unlocked. A fixture that only tests 0 and 100 would pass against an off-by-one.
- **SC-003**: Stripping the `unlock` field from `bounty-hunter` in a test pack changes
  the output of `unlockedJobs` for a 0-deed unit. This is the A/B that proves the field is
  *wired*, not merely validated — per the "capability that validates its input and then
  discards it" rule in `CLAUDE.md`.
- **SC-004**: Every existing save round-trips: a v3 record serialized before this change
  deserializes to a v4 record with zeroed deeds and an otherwise byte-identical body.
- **SC-005**: The build-variety score is **unchanged** by this slice (7 of a target 8).
  If it moves, the gate manifest was touched and OI-5 was not honoured.
- **SC-006**: `npm run check` passes, including `check:rng` — no new nondeterminism.
- **SC-007**: For the threshold chosen in OI-3, at least one unit in a full headless
  campaign run actually crosses it. A feature nobody can reach is not shipped.

## Assumptions

- The campaign save is the only place deeds persist. There is exactly one `localStorage`
  save slot (`src/render/storage.ts`), so there is no cross-save aggregation to design.
- `UnitContribution`'s counters are trustworthy per-unit totals. They are accounted from
  resolver outcomes and already fund the AP grant, so this feature adds no new measurement
  surface — if they were wrong, AP would already be wrong.
- Deeds are **career** totals on a unit, not on the player and not on a job. A unit that
  earns Bounty Hunter and then changes to Knight keeps it.
- Hybrid/fusion jobs (`docs/08` P3, the `requires` field already reserved in `JobSchema`)
  are a **separate** unlock axis. A job may be gated by a hybrid recipe or by a deed;
  combining both is out of scope and untested here.
- One deed job ships. The pack-driven design (P3) is proven by a test pack, not by a
  second shipped job.
