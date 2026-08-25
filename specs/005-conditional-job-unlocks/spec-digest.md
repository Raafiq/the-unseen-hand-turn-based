## Conditional Job Unlocks ("Deed Jobs")
Unlocks a job on a unit once its lifetime tally of battlefield deeds passes a threshold.

> **Status: CUT — rejected on 2026-08-25, not deferred.** Everything below describes a
> thing that is **not being built**; read it as a record of a rejected proposal, and do not
> review or implement code against it.

| § | In plain words | From |
|---|---|---|
| Overview | Today every job in the content pack is available to every unit. | prose |
| US1 (P1) | A unit earns a job by how it fought, not by spending. | prose |
| US1 | Only the unit that did the deeds gets the job, not the party. | prose |
| US2 (P2) | Player sees the count climbing but is never shown a locked job. | prose |
| US3 (P3) | A designer adds a deed-gated job by editing the content pack, no code change. | prose |
| FR-001 | Each unit keeps a lifetime count of three deeds. | prose |
| FR-001 | Counts only ever go up. Nothing removes or lowers one. | prose |
| FR-001 | Save file version 3 becomes 4, with a migration. | prose |
| FR-001 | The three counts are `kos`, `healingDone`, `statusesInflicted`. | code |
| FR-001 | A save written before this change loads with all three counts at 0. | code |
| FR-002 | A job may name one deed count and a minimum to reach. | prose |
| FR-002 | A job with no `unlock` field is available to everyone, as today. | prose |
| FR-002 | `atLeast` must be 1 or more. | code |
| FR-002 | `earnedLabel` is shown only after the job is unlocked. | code |
| FR-002 | Worked example: `bounty-hunter` unlocks at `kos` of 15. | code |
| FR-003 | One function answers whether a unit has unlocked a given job. | prose |
| FR-003 | No randomness and no clock, so the same inputs always give the same answer. | prose |
| FR-003 | A job with no `unlock` field returns unlocked without checking counts. | code |
| FR-004 | Deeds are folded in from the same battle report that pays AP. | prose |
| FR-004 | `UnitContribution` already counts these three; no new measurement is added. | prose |
| FR-004 | Deeds are added in the same expression that awards AP. | code |
| FR-005 | A bad content pack is rejected when it loads, not when a job unlocks. | prose |
| FR-005 | Rejects an unknown deed name, an `atLeast` below 1, or a job carrying both `unlock` and `requires`. | prose |
| FR-005 | Content pack version 2 becomes 3. | prose |
| FR-006 | The prep screen lists only jobs the selected unit has unlocked. | prose |
| FR-006 | The prep screen shows that unit's deed counts. | prose |
| FR-006 | The prep screen never names or describes a job that is still locked. | prose |
| FR-006 | `jobIds()` today returns every job in the pack; the filter replaces it. | code |
| FR-007 | Unlocking a job changes nothing else — not the current job, AP, or loadout. | prose |
| FR-008 | Credit follows which team the target was on at the moment of the action. | prose |
| FR-008 | The battle engine's allegiance verdict is final and is not re-judged later. | prose |
| FR-009 | A battle the player lost and retried earns no deeds. | prose |
| Entities | `Deeds`: career totals on a unit, never reset by job change or death. | prose |
| Entities | Every deed name must already exist on `UnitContribution`. | prose |
| Entities | `JobUnlock`: one deed name, one minimum, one label shown after the fact. | prose |
| Entities | `DeedDelta`: one battle's increase, keyed by record id, then discarded. | prose |
| Files | 9 source files change, 5 test files, 1 data file, 2 docs. | prose |
| Files | Build-variety scoring [undefined in spec] is deliberately left untouched. | prose |
| Files | The five shipped campaign battles are not re-authored. | prose |
| Files | Those five battles field 12 enemy units in total. | prose |

| Edge case | Behaviour | § |
|---|---|---|
| Deed name not one of the three | Content pack rejected at load. | FR-005 |
| `atLeast` set to 0 | Content pack rejected at load. | FR-005 |
| Job declares both `unlock` and `requires` | Content pack rejected at load. | FR-005 |
| Content pack later raises a threshold above a unit's count | Unit keeps the job. Counts never fall. | EC-1 |
| Count passes the threshold mid-battle | Nothing happens until the battle is folded into the save. | EC-2 |
| Unit kills a charmed ally | Counts. It was on the enemy team at that moment. | EC-3 |
| Kill lands through a reaction, not the unit's own turn | Counts. Credited to the reacting unit. | EC-4 |
| Two units damage one foe, one lands the kill | Only the killer scores. No assist credit. | EC-5 |
| Unlocked job is already the unit's Secondary | Save rules reject it; the prep screen clears the Secondary. | EC-6 |
| Save written before this change is loaded | Migrates with all three counts at 0. | EC-7 |
| Content pack drops a job a save has unlocked | Load fails loudly. | EC-8 |
| Unit was not deployed in the battle | No entry in the result; folds as zero. | FR-004 |
| Unlocking a job | Changes nothing else about the unit. | FR-007 |
| Unlocking a job whose tree is empty | Job is instantly mastered and grants a free mastery trait. | OI-4 |

| Open item | State | § |
|---|---|---|
| Does a Deed earn a B0 currency row [undefined in spec], or is this feature cut by the project's own gate? | BLOCKING | OI-1 |
| Back-fill deeds on the v3→v4 migration, or zero them? | BLOCKING — code already picks one | OI-2 |
| Is 15 KOs reachable? MEASURED — no. The threshold must change, or the campaign must. | STILL BLOCKING | OI-3 |
| Bounty Hunter's actual content: skillset, tree, growth curve, mastery trait. | BLOCKING | OI-4 |
| Does Bounty Hunter enter the build-variety gate manifest [undefined in spec]? | DECIDE | OI-5 |
| Do deeds accrue in the balance-probe gauntlet runs [undefined in spec], or only in campaign saves? | DECIDE | OI-6 |
| Should any deed counter be visible before its first unlock? → show only counters some job in the pack gates on | RESOLVED | OI-7 |
| Does this become `docs/12-conditional-jobs.md` before implementation, or stay spike-only? | TRACK | OI-8 |

## Code

Not shown in any code below:

- a kill counts by which team the target was on at that moment, so killing a charmed ally counts — §FR-008, §EC-3
- a kill landed by a reaction credits the reacting unit — §EC-4
- only the killing blow scores; no assist credit — §EC-5
- a battle the player lost and retried earns no deeds — §FR-009
- unlocking a job changes nothing else about the unit — §FR-007
- a job whose tree is empty is instantly mastered and grants a free mastery trait — §OI-4

<details><summary>FR-001 — defines the three deed counts and migrates old saves to all-zero; <code>emptyDeeds</code> body not shown</summary>

```ts
// CUT — see Status at top
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

<details><summary>FR-002 — restricts a job's unlock to one of three deed names, a minimum of 1 or more, and a non-empty label</summary>

```ts
// CUT — see Status at top
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

<details><summary>FR-002 — the worked example: <code>bounty-hunter</code> at 15 kills, with growth left unfilled — see §OI-3, §OI-4</summary>

```json
// CUT — see Status at top
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

<details><summary>FR-003 — <code>isJobUnlocked</code> returns true when a job has no unlock or the count meets the minimum; <code>unlockedJobs</code> body not shown</summary>

```ts
// CUT — see Status at top
// src/sim/progression.ts — illustrative only.
export function isJobUnlocked(record: UnitRecord, jobId: string, registry: ContentRegistry): boolean {
  const u = registry.job(jobId).unlock;
  return u === undefined || record.deeds[u.deed] >= u.atLeast;
}

/** Pack order, so the prep list never reshuffles under the player. */
export function unlockedJobs(record: UnitRecord, registry: ContentRegistry): string[] { /* ... */ }
```
</details>

<details><summary>FR-004 — the second snippet adds deeds in the same expression that awards AP, and substitutes <code>NO_DEEDS</code> for a unit with no entry; <code>deriveDeedDeltas</code> body not shown</summary>

```ts
// CUT — see Status at top
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

<details><summary>FR-006 — replaces the prep screen's full job list with the selected unit's unlocked jobs</summary>

```ts
// CUT — see Status at top
// src/render/prep.ts — jobIds() currently returns EVERY pack job (the gate goes here).
jobIds(): string[] {
  return unlockedJobs(this.selectedRecord(), this.registry);
}
```
</details>
