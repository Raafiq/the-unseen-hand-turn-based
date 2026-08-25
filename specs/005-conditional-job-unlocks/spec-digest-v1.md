## Conditional Job Unlocks ("Deed Jobs")
Unlocks a job on a unit once its lifetime tally of battlefield deeds passes a threshold.

| § | In plain words | From |
|---|---|---|
| Status | Cut on 2026-08-25. Rejected, not deferred. | prose |
| Overview | Today every job in the pack is always available. | prose |
| US1 (P1) | A unit earns a job by how it fought. | prose |
| US1 | Only that unit gets it, not the party. | prose |
| US2 (P2) | Player sees the counter climb, never the locked job. | prose |
| US3 (P3) | A designer adds a deed job with no code change. | prose |
| FR-001 | Each unit keeps a running count of its deeds. | prose |
| FR-001 | Counts only go up. Nothing takes them away. | prose |
| FR-001 | Save format version 3 becomes 4, with a migration. | prose |
| FR-001 | Three counts: kills, healing done, statuses applied. | code |
| FR-001 | Old saves start every count at zero. | code |
| FR-002 | A job may name one count and a minimum. | prose |
| FR-002 | A job with no condition is always available. | prose |
| FR-002 | Minimum must be at least 1. | code |
| FR-002 | Label shown only after the job is earned. | code |
| FR-002 | Worked example: Bounty Hunter at 15 kills. | code |
| FR-003 | One function answers "has this unit earned it". | prose |
| FR-003 | No randomness, no clock — same battle replays the same. | prose |
| FR-003 | No condition means unlocked. | code |
| FR-003 | Job list keeps pack order so it never reshuffles. | code |
| FR-004 | Deeds counted from the same report that pays experience. | prose |
| FR-004 | The counts already exist; nothing new is measured. | prose |
| FR-004 | Deeds added at the same moment as experience. | code |
| FR-005 | Bad pack fails on load, not later. | prose |
| FR-005 | Rejects unknown count, minimum under 1, or both gate types. | prose |
| FR-005 | Content format version 2 becomes 3. | prose |
| FR-006 | Prep screen lists earned jobs only. | prose |
| FR-006 | Prep screen shows the unit's counts. | prose |
| FR-006 | Never names a job the unit has not earned. | prose |
| FR-006 | One line in the prep screen does the filtering. | code |
| FR-007 | Earning a job changes nothing else about the unit. | prose |
| FR-007 | Player chooses whether to switch. | prose |
| FR-008 | Credit follows which team the target was on. | prose |
| FR-008 | Judged once, by the battle engine, never re-judged. | prose |
| FR-009 | Losing and retrying a battle earns nothing. | prose |
| Entities | Deeds: career totals on a unit, never reset. | prose |
| Entities | JobUnlock: one count, one minimum, one label. | prose |
| Entities | DeedDelta: one battle's increase, then discarded. | prose |
| Files | 9 source files, 5 test files, 1 data file change. | prose |
| Files | Build-variety scoring deliberately left alone. | prose |
| Files | Campaign battles not re-authored. | prose |

| Edge case | Behaviour | § |
|---|---|---|
| Pack later raises the threshold | Unit keeps the job. Counts never fall. | EC-1 |
| Count passes threshold mid-battle | Nothing until the battle is saved. | EC-2 |
| Unit kills a charmed ally | Counts. It was on the enemy team then. | EC-3 |
| Kill lands via a reaction, not a turn | Counts. Credited to the reacting unit. | EC-4 |
| Two units hurt one foe | Only the killing blow scores. No assists. | EC-5 |
| Entering a job already held as Secondary | Rejected by the save rules; prep clears it. | EC-6 |
| Old save loaded | Upgrades with all counts at zero. | EC-7 |
| Pack drops a job a save has earned | Load fails loudly. | EC-8 |
| Job's growth numbers | Left as "TBD — see OI-4". | FR-002 code |
| Job ships with an empty tree | Instantly mastered; hands out a free bonus. | OI-4 |
| Count name not one of the three | Rejected when the pack loads. | FR-005 |
| Minimum set to 0 | Rejected when the pack loads. | FR-005 |
| Job declares both gate types | Rejected when the pack loads. | FR-005 |
| Unit not in the battle | No entry; folds as zero. | FR-004 code |

| Open item | § |
|---|---|
| Does a Deed earn a B0 currency row, or is this feature cut by the project's own gate? | OI-1 |
| Back-fill deeds on the v3→v4 migration, or zero them? | OI-2 |
| Is 15 KOs reachable? MEASURED — no. The threshold must change, or the campaign must. | OI-3 |
| Bounty Hunter's actual content: skillset, tree, growth curve, mastery trait. | OI-4 |
| Does Bounty Hunter enter the build-variety gate manifest? | OI-5 |
| Do deeds accrue in the balance-probe gauntlet runs, or only in campaign saves? | OI-6 |
| Does this become `docs/12-conditional-jobs.md` before implementation, or stay spike-only? | OI-8 |
| `"growth": { "...": "TBD — see OI-4" }` | FR-002 code |

## Code

<details><summary>FR-001 — each unit keeps three deed counts; old saves start at zero</summary>

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
</details>

<details><summary>FR-002 — a job may name one count, a minimum of at least 1, and a label</summary>

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
</details>

<details><summary>FR-002 — Bounty Hunter unlocks at 15 kills; its growth numbers are TBD</summary>

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
</details>

<details><summary>FR-003 — no condition means unlocked; job list keeps pack order</summary>

```ts
// src/sim/progression.ts — illustrative only.
export function isJobUnlocked(record: UnitRecord, jobId: string, registry: ContentRegistry): boolean {
  const u = registry.job(jobId).unlock;
  return u === undefined || record.deeds[u.deed] >= u.atLeast;
}

/** Pack order, so the prep list never reshuffles under the player. */
export function unlockedJobs(record: UnitRecord, registry: ContentRegistry): string[] { /* ... */ }
```
</details>

<details><summary>FR-004 — deeds added at the same moment as experience; absent unit folds as zero</summary>

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
</details>

<details><summary>FR-006 — the prep screen shows only jobs the selected unit has earned</summary>

```ts
// src/render/prep.ts — jobIds() currently returns EVERY pack job (the gate goes here).
jobIds(): string[] {
  return unlockedJobs(this.selectedRecord(), this.registry);
}
```
</details>
