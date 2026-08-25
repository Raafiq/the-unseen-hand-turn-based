# Contract — the public surface this feature adds

**Feature**: 005-conditional-job-unlocks | **Phase 1**

This project's external interface is the `src/sim/` barrel (`src/sim/index.ts`) — the
headless engine the viewer, the balance probe and the tests all consume. That is the
contract that matters here; there is no HTTP surface.

Every function below is **pure and deterministic**: no randomness, no clock, no IO, no
mutation. Inputs are never touched; a changed record is always a new object. This is the
same contract `progression.ts` already states for `awardAp` and `learnAbility`, and it is
what keeps `npm run check:rng` green.

---

## `src/sim/progression.ts`

### `isJobUnlocked(record, jobId, registry) → boolean`

| | |
|---|---|
| **Returns `true` when** | the job declares no `unlock`, **or** `record.deeds[unlock.deed] >= unlock.atLeast` |
| **Throws** | if `jobId` is unknown — `registry.job()` already throws, and this deliberately does not swallow it. An unknown job id is a content bug, not a locked job, and the two must not look alike. |
| **Note** | `canLearn` catches the same throw and returns a reason instead. That asymmetry is intentional: `canLearn` answers a player action, this answers a content query. |

### `unlockedJobs(record, registry) → string[]`

Every job id the record may enter, **in pack order**.

Pack order, not sorted and not insertion order, so the prep list never reshuffles under the
player when a deed crosses a threshold. `registry.jobById` is a `Map`, which preserves
insertion order from the authored array — so this is a filter, not a sort.

### `addDeeds(record, delta) → UnitRecord`

Field-wise addition. New record; `deeds` is the only field that changes.

**No inverse exists, deliberately** — the same way `progression.ts` has no unlearn and no
de-master. Invariant D1 (monotonic) is enforced by the absence of a subtract function, not
by a runtime check, because a check can be bypassed by a caller and a missing function
cannot.

---

## `src/sim/campaign-run.ts`

### `deriveDeedDeltas(def, save, encounter, contributionByUnit) → Record<recordId, DeedDelta>`

Mirrors `deriveRewards` exactly: walks `encounter.placements`, skips non-player teams and
non-`ref` units, skips ids not in `save.party`, and keys the result by **record id**.

**Must reuse that walk, not copy it.** `deriveRewards`' own docstring says a second copy
would drift the moment slot naming changed — this is that second copy, so the shared part
gets extracted rather than duplicated.

---

## `src/sim/campaign.ts`

### `BattleResult` gains `deeds: Record<recordId, DeedDelta>`

`applyBattleResult` folds it **inside the victory branch only**, alongside `awardAp`.

The defeat branch already returns before the party is touched. Nothing new enforces
FR-008 — the ordering does. That is worth one test whose failure mode is "someone moved the
fold above the early return".

---

## `src/sim/job.ts` / `src/sim/content.ts`

`JobSchema.unlock?: JobUnlock`, plus load-time integrity per `data-model.md`.

A pack that omits `unlock` on every job is **byte-identical in behaviour** to today. That
is the compatibility claim, and SC-003 is what proves the field is *wired* rather than
merely validated: strip `unlock` from `bounty-hunter` in a test pack and `unlockedJobs`
must give a different answer for a zero-deed unit. Without that A/B, a completely ignored
field passes every other test in this spec.

---

## `src/render/prep.ts` — the viewer boundary

### `jobIds()` — behaviour change

Currently returns `[...this.registry.jobById.keys()]` — **every job in the pack**. Becomes
`unlockedJobs(record, registry)`.

This is the single gate point. No other call site filters jobs, which is why the change is
one line and why nothing else can leak a locked job.

### `deedCounters()` — new

Returns only the counters some job in the loaded pack gates on (research.md R-6). Derived
from the pack, so adding a deed job surfaces its counter with no viewer change.

**Must not expose**: a locked job's id, its label, its threshold, or its `earnedLabel`.
That is the P2 assertion, and it is a negative one — the test has to check for *absence*.

---

## Deliberate exclusions

| Excluded | Why |
|---|---|
| A `battles` deed key | Drafted and cut. Nothing gated on it, nothing populated it, no test asserted it — a counter that only a future feature might read. |
| `landedActions` as a deed key | It is the AP grant's own signal (`campaign-run.ts` reads it for `meaningfulActions`). Gating a job on the same number that funds AP couples two currencies that `docs/02` §B0 requires be tellable apart. |
| A deed key for damage dealt | It scales with weapon and level, so the "threshold" would really be a gear check wearing a behaviour label. |
| Any mutator that lowers a deed | Invariant D1. |
| Exposure of deeds to `BattleState` | Campaign layer only; the import direction stays one-way. |
