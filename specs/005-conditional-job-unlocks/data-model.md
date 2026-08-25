# Phase 1 — Data Model: Conditional Job Unlocks

**Feature**: 005-conditional-job-unlocks | **Date**: 2026-08-25

Three entities. Two persist; one is transient. Two on-disk version lines move.

---

## Entity: `Deeds`

A permanent, monotonic tally of what a unit has done, across its whole career.

**Owner**: `UnitRecord` (`src/sim/roster.ts`). Not `BattleState` — the import direction is
one-way: records compile *into* battle units at deploy, never the reverse.

| Field | Type | Rule |
|---|---|---|
| `kos` | int ≥ 0 | Foes dropped to 0 HP by this unit |
| `healingDone` | int ≥ 0 | Σ HP restored to allies |
| `statusesInflicted` | int ≥ 0 | Σ statuses newly applied to others (a refresh does not count) |
| `battles` | int ≥ 0 | Battles this unit deployed in |

**The field set is deliberately the intersection with `UnitContribution`.** Every key here
must already exist on the contribution object, or it is a number with no source.
`landedActions` is available and deliberately excluded — see `contracts/deed-unlock.md`.

### Invariants

| # | Invariant | Enforced by |
|---|---|---|
| D1 | **Monotonic.** No function decreases any field. | No inverse exists — mirrors the deliberate absence of an unlearn/de-master function in `progression.ts`. |
| D2 | **Permanent.** Survives job change, death, revive, loadout swap. | `changeJob` spreads the record; no loadout mutator touches `deeds`. |
| D3 | **Unit-owned, not job-owned.** | Lives on the record. |
| D4 | Every field ≥ 0. | Zod `IntSchema.min(0)`. |

### Version line

`ROSTER_SCHEMA_VERSION` **3 → 4**. `migrate3to4` attaches `emptyDeeds()` — all zeros.
Per `src/sim/CLAUDE.md` the migration lands in the **same commit** as the bump.

Zeroing is a decision, not a fallback (research.md R-4): the save stores only
`{ battleId, outcome }` per battle, so there is no per-unit history to back-fill from.

---

## Entity: `JobUnlock`

An optional condition on a job in the content pack. **Absent means always available** — so
all 8 shipped jobs keep working with no pack edit.

| Field | Type | Rule |
|---|---|---|
| `deed` | enum of the 4 `Deeds` keys | Must name a real counter; validated at pack load |
| `atLeast` | int ≥ 1 | `0` is rejected — it means "always", which the absent field already means |
| `earnedLabel` | non-empty string | Shown **after** the unlock only (FR-006) |

**Owner**: `JobSchema` (`src/sim/job.ts`), as `unlock?`.

### Zod ordering hazard

`DeedKeySchema` and `JobUnlockSchema` must be declared **above** `JobSchema` in the file.
`src/sim/CLAUDE.md` records the temporal-dead-zone trap: a schema referenced before its
`const` initialises throws at module load, so it surfaces as an import-order crash rather
than a validation error.

### Relationship to the reserved `requires` field

`JobSchema` already reserves `requires: [jobId, jobId]` for hybrid/fusion jobs. `unlock` is
a **separate, orthogonal** axis. A job carrying both is out of scope and untested — the
loader should reject the combination rather than silently pick one.

### Version line

`CONTENT_SCHEMA_VERSION` **2 → 3**, with a migration. The migration is a no-op on shape
(the field is optional), but the bump is what lets a pack authored against v3 be **refused**
by an older build instead of silently loading with its unlock ignored.

### Load-time integrity (FR-005)

`loadContentPack` throws `ContentIntegrityError` — **at load, not at unlock** — when:

- `unlock.deed` is not one of the four keys
- `unlock.atLeast < 1`
- a job declares both `unlock` and `requires`

---

## Entity: `DeedDelta`

The per-battle increment. **Transient**: derived, folded, discarded. Never persisted.

| Field | Type |
|---|---|
| `kos` | int ≥ 0 |
| `healingDone` | int ≥ 0 |
| `statusesInflicted` | int ≥ 0 |
| `battles` | 0 or 1 |

**Keyed by record id**, not battle unit id — the conversion happens inside
`deriveDeedDeltas`, reusing the placement walk `deriveRewards` owns (research.md R-2).

`battles` is `1` for a deployed unit and `0` otherwise — the same participated/absent
distinction `ApReward.participated` already draws. A member with no entry folds as all-zero,
so **absence and non-participation agree**, the property `applyBattleResult`'s AP comment
already relies on.

---

## State transitions

```text
                       victory only (FR-008)
  UnitRecord(v4)  ─────────────────────────────▶  UnitRecord(v4)
     deeds: D                                        deeds: D + Δ
                            ▲
                            │ deriveDeedDeltas(placements, contributionByUnit)
                            │
                  RunReport.contributionByUnit  ← accounted from resolver outcomes
```

A **defeat** returns early in `applyBattleResult` (`status: "gameOver"`) before the party is
touched, so a lost battle folds nothing. `retryBattle` restores the same party. Together
these give FR-008 for free: a losable battle cannot be farmed. That is a property of the
**existing control flow**, not a new guard — which is exactly why it needs a test that would
go red if the fold were ever moved above the early return.

Unlock evaluation is **not a transition**. `isJobUnlocked` is a pure comparison computed on
read; no "unlocked" list is stored. That is what makes EC-1 fall out for free: a pack that
later raises a threshold cannot re-lock a job the player already has, because there is no
latch to invalidate — only a counter that never falls.

---

## What is deliberately NOT modeled

| Not modeled | Why |
|---|---|
| An `unlockedJobs` array on the record | Derived state in a save goes stale against the pack. Compute on read. |
| Per-battle deed history | Nothing reads it; a save field nothing consumes is a free future migration. |
| Assist credit on a shared kill | `UnitContribution.kos` credits the killing blow only. Splitting it needs a new resolver concept. |
| Deeds on enemy or guest units | Only `save.party` members carry records at all. |
