---

description: "Task list for 005-conditional-job-unlocks"
---

# Tasks: Conditional Job Unlocks ("Deed Jobs")

**Input**: Design documents from `/specs/005-conditional-job-unlocks/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: INCLUDED. This repo's `docs/` outrank its code, and its house rule is that an
unasserted numeric target is worse than an absent one. Every functional requirement here
carries a test task.

> ## ❌ CUT — no task here will be done
>
> The feature was **rejected on 2026-08-25** rather than unblocked: it would have added a
> fourth axis to a customization spine locked at three, and rewarded exactly the farming
> `docs/02` §B4 designs out. See `spec.md` for the full rationale.
>
> All 44 tasks below are **void**. They are kept only so a future proposal can see what the
> work would actually have cost — 9 source files, 5 test files, two save-format version
> bumps and a migration, for one job.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3, mapping to the spec's prioritized user stories

## Path Conventions

Single project. Headless sim in `src/sim/`, thin viewer in `src/render/`, content in
`data/`. **Tests colocate** as `<module>.test.ts` — this repo has no `tests/` directory.

---

## Phase 1: Unblock (Decisions — NO CODE)

**Purpose**: Resolve the four BLOCKING open items. Nothing below Phase 1 may start until
every task here is done.

- [ ] T001 Decide OI-1: does a "Deed" earn a currency row in `docs/02-job-and-customization-system.md` §B0, given §B4 is titled "Kill the grind, kill the exploits"? Outcome is either an amended §B0 table or the feature is cut. Owner: user + systems-designer.
- [ ] T002 Write the ADR in `docs/adr/` recording T001's outcome and the ADR-0001 spine amendment (the feature adds a **fourth** customization axis to a spine locked at three). Blocked by T001. Use the `decision-record` skill.
- [ ] T003 Decide OI-4: author Bounty Hunter's skillset, tree, growth curve and mastery trait as a design brief. Must specify a **non-empty tree** — `isMastered` calls `every` on the tree, and `every` on an empty array is `true`, so an empty-tree job is instantly mastered and hands out a free trait. Owner: systems-designer + content-author.
- [ ] T004 Set the real threshold, informed by `research.md` R-3: the shipped campaign fields **12 enemy units total**, so 15 is unreachable. Either pick a reachable number, switch to a different deed key, or re-scope the campaign. Owner: user.
- [ ] T004a **Probe the candidate threshold before committing to it.** Run a headless campaign with the balance probe and record the actual per-unit KO distribution. `research.md` R-3's "3–5 per unit" is an **estimate, not a measurement** — do not set a threshold against it. This is a throwaway script, not shipped code; it exists so T033 cannot be the first time anyone learns the number is wrong. Depends on T004.

**Checkpoint**: All four decisions recorded and the threshold is backed by a measurement, not an estimate. Only now does code work become legitimate.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two schema bumps and the pure predicates every story depends on.

**⚠️ CRITICAL**: No user story can begin until this phase is complete.

- [ ] T005 (FR-001) Add `DeedsSchema` and `emptyDeeds()` to `src/sim/roster.ts`, with the **three** counters from `data-model.md` (`kos`, `healingDone`, `statusesInflicted`), each `IntSchema.min(0)`. A `battles` key was drafted and cut — nothing consumes it.
- [ ] T006 (FR-001) Add the `deeds` field to `UnitRecordSchema` in `src/sim/roster.ts`, bump `ROSTER_SCHEMA_VERSION` 3 → 4, register `migrate3to4` in `ROSTER_MIGRATIONS`, and extend `defaultUnitRecord`. All in **one commit** — `src/sim/CLAUDE.md` requires the migration to land with the bump. Depends on T005.
- [ ] T007 [P] (FR-002) Add `DeedKeySchema` and `JobUnlockSchema` to `src/sim/job.ts`, declared **above** `JobSchema` (Zod temporal-dead-zone trap), and add `unlock: JobUnlockSchema.optional()` to `JobSchema`.
- [ ] T008 (FR-001, FR-004) Add `addDeeds(record, delta)` to `src/sim/progression.ts` — field-wise addition returning a new record, with **no inverse function**. Depends on T005.
- [ ] T009 (FR-003) Add `isJobUnlocked(record, jobId, registry)` and `unlockedJobs(record, registry)` to `src/sim/progression.ts`. `unlockedJobs` returns **pack order** (filter `registry.jobById.keys()`, never sort). Depends on T006, T007.
- [ ] T010 (FR-005) Add load-time integrity checks to `src/sim/content.ts`: reject an unknown `unlock.deed`, an `atLeast < 1`, and a job declaring both `unlock` and `requires` — **all three are stated in spec.md FR-005**. Throw `ContentIntegrityError`. Bump `CONTENT_SCHEMA_VERSION` 2 → 3 with a migration. Depends on T007.
- [ ] T011 [P] (FR-003) Export `isJobUnlocked`, `unlockedJobs`, `addDeeds`, `emptyDeeds` and the new types from `src/sim/index.ts`.
- [ ] T012 (FR-001, SC-004) Add the v3→v4 migration round-trip test to `src/sim/roster.test.ts`: a v3 record deserializes to v4 with zeroed deeds and an otherwise **field-by-field identical** body (SC-004). Not just "it didn't throw". Depends on T006.
- [ ] T013 [P] (FR-005) Add integrity tests to `src/sim/content.test.ts`: an unknown deed key throws, `atLeast: 0` throws, and `unlock` + `requires` together throws — all **at load time**, not at unlock (SC/FR-005). Depends on T010.

**Checkpoint**: `npm run check` green. Schemas and predicates exist; nothing is wired to play yet.

---

## Phase 3: User Story 1 — A job appears because of how you fought (P1) 🎯 MVP

**Goal**: A unit that lands enough kills across a campaign gains a job no other unit has.

**Independent Test**: Run a scripted campaign where one unit accumulates the threshold in
KOs and another accumulates 0; assert `unlockedJobs` differs between them.

### Tests for User Story 1

- [ ] T014 [P] [US1] (FR-003, SC-002) Boundary test in `src/sim/progression.test.ts`: at threshold−1 **locked**, at threshold **unlocked**, at threshold+1 **unlocked** (SC-002). Read the threshold from the test pack, never hard-code it.
- [ ] T015 [P] [US1] (FR-003, SC-001) Two-sided test in `src/sim/progression.test.ts`: in the same assertion, a unit at the threshold is unlocked **and** a zero-deed unit is still locked (SC-001). A one-sided check cannot tell "unlocked correctly" from "unlocked for everyone".
- [ ] T016 [P] [US1] (FR-001) Idempotence + monotonicity test in `src/sim/progression.test.ts`: folding the same delta twice increases the counter twice but never produces a duplicate in `unlockedJobs`; no sequence of calls lowers a counter (invariant D1).
- [ ] T017 [P] [US1] (FR-001) Permanence test in `src/sim/roster.test.ts`: deeds survive `changeJob`, a loadout swap, and a KO+revive (invariant D2).
- [ ] T018 [US1] (FR-004) Credit-attribution test in `src/sim/campaign-run.test.ts`: two party members in one battle, only one lands KOs — only that one's `deeds.kos` moves.
- [ ] T018a [P] [US1] (FR-008) **FR-008 allegiance test** in `src/sim/campaign-run.test.ts`: a KO against a charmed ally (an own-team unit temporarily on the enemy team) **counts**, and a KO against a unit still on your own team does not. Assert both in one test — the deed layer must take the resolver's allegiance verdict, not form its own.
- [ ] T019 [US1] (FR-009) Defeat/retry test in `src/sim/campaign-run.test.ts`: fold a defeat, then a retry, then a victory; deeds move **only** on the victory (FR-009). Write it so that moving the fold above `applyBattleResult`'s early `gameOver` return turns it red.

### Implementation for User Story 1

- [ ] T020 [US1] (FR-004) Add `DeedDelta` and `deriveDeedDeltas(def, save, encounter, contributionByUnit)` to `src/sim/campaign-run.ts`, keyed by **record id**. Extract the shared placement→recordId walk from `deriveRewards` rather than copying it — that function's own docstring warns a second copy would drift.
- [ ] T021 [US1] (FR-004, FR-009) Add `deeds` to `BattleResult` and fold it in `applyBattleResult` in `src/sim/campaign.ts`, **inside the victory branch only**, alongside `awardAp`. Depends on T008, T020.
- [ ] T022 [US1] (FR-004) Wire `deriveDeedDeltas` into `resolveCampaignBattle` in `src/sim/campaign-run.ts` so the headless and viewer paths share it. Depends on T020, T021.
- [ ] T023 [US1] (FR-002) Author the `bounty-hunter` job in `data/base-pack.json` from T003's brief, with the T004 threshold. **Non-empty tree** required. Depends on T003, T004, T007.
- [ ] T024 [US1] (FR-006) Gate the viewer: change `jobIds()` in `src/render/prep.ts` (line ~444) from `[...this.registry.jobById.keys()]` to `unlockedJobs(record, registry)`. Add the Bounty Hunter entry to `JOB_LABEL`. Depends on T009.
- [ ] T024a [P] [US1] (FR-007) **FR-007 non-mutation test** in `src/sim/progression.test.ts`: crossing a threshold changes `unlockedJobs`' output and changes **nothing else** — assert `currentJob`, `ap`, `loadout` and `learned` are all identical before and after. This is the Principle VI (free respec) guarantee, and without it an unlock that silently switched the unit's job would pass every other test here.
- [ ] T025 [US1] (FR-007, EC-6) Handle the stranded-secondary case in `src/render/prep.ts`: entering a newly-unlocked job must clear a `loadout.secondary` equal to it, or `UnitRecordSchema`'s `refine` rejects the record (EC-6). Depends on T024.

**Checkpoint**: US1 fully functional. A unit earns a job by fighting. This is the MVP.

---

## Phase 4: User Story 2 — Discoverable, not a spoiler (P2)

**Goal**: The player sees a counter climbing, never a list of what it might open.

**Independent Test**: The prep view-model exposes `deedCounters` and exposes **nothing**
about a still-locked job.

- [ ] T026 [P] [US2] (FR-006) Negative test in `src/render/prep.test.ts`: with a unit below the threshold, no locked job's id, label, threshold or `earnedLabel` appears anywhere in the view-model. Assert **absence** — this is the whole story.
- [ ] T027 [P] [US2] (FR-006) Positive test in `src/render/prep.test.ts`: a unit above the threshold sees the job listed **and** labelled with the deed that earned it.
- [ ] T028 [US2] (FR-006) Add `deedCounters()` to `src/render/prep.ts`, returning only counters that at least one job in the loaded pack gates on (research.md R-6). Derive from the pack so a new deed job surfaces its counter with no viewer change. Depends on T024.
- [ ] T029 [US2] (FR-006) Render the counters and the earned label in the prep screen. Depends on T028.

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — The pack decides, not the code (P3)

**Goal**: A designer adds a second deed job with no code change.

**Independent Test**: A throwaway test pack gates a job on `healingDone >= 500`; the same
unlock function gates it.

- [ ] T030 [P] [US3] (FR-002) Multi-job test in `src/sim/content.test.ts`: a test pack with two deed jobs on **different** counters — meeting one threshold unlocks exactly that job.
- [ ] T031 [US3] (FR-002, SC-003) **Wiring A/B** in `src/sim/content.test.ts`: build the same test pack twice, once with `unlock` on `bounty-hunter` and once without, and assert `unlockedJobs` returns a **different** list for a zero-deed unit (SC-003). This is the only test that catches a field the schema validates and `prep.ts` then ignores — every other test in this feature passes against that bug.
- [ ] T032 [US3] (FR-002) Grep `src/sim/progression.ts` and `src/render/prep.ts` for the literal `bounty-hunter` and remove any branch naming it. The unlock path must be data-driven end to end.

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T033 (SC-007) **Reachability test** in `src/sim/campaign-run.test.ts`: run a full headless campaign and assert at least one unit crosses the threshold (SC-007). Read the threshold from the pack. **This is the test that would have caught the 15-kill error** — every other test in this list passes with an unreachable threshold while no player ever sees the job.
- [ ] T033a (EC-8) **EC-8 crash-path test** in `src/sim/content.test.ts`: load a save whose unit has unlocked a job, against a pack that no longer defines it. `registry.job()` throws on the unknown id, so assert it fails **loudly and with the job id in the message** — a save silently losing a job the player earned is worse than a refused load.
- [ ] T034 (SC-005) Confirm the build-variety score has not moved: run `npx vitest run src/sim/benchmark-suite.test.ts` and **diff the rows, not the summary count** (SC-005). An unchanged total can hide moved rows.
- [ ] T035 Record Bounty Hunter's exclusion from the build-variety manifest in `src/sim/gauntlet.ts` as an **explicit** entry, not an omission — the manifest partition must fail on a stale entry too.
- [ ] T036 [P] Update `docs/02-job-and-customization-system.md` §B0 with the Deed currency row agreed in T001. Depends on T001.
- [ ] T037 [P] Add a release note that existing saves start at zero deeds and prior history is not recoverable (research.md R-4, OI-2).
- [ ] T038 (SC-006) Run `npm run check` — full gate, including `check:rng` (SC-006).
- [ ] T039 Run through `quickstart.md` manually via `npm run dev` at `/game.html`.
- [ ] T040 Regenerate `npm run state` as the **last** step — a new ADR and a new job are both counted artifacts, and a clean run taken mid-slice proves nothing about the commit you push.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Unblock)**: no dependencies — but **nothing else may start** until it is done
- **Phase 2 (Foundational)**: depends on Phase 1; blocks all user stories
- **Phase 3–5 (Stories)**: depend on Phase 2; then P1 → P2 → P3, or in parallel if staffed
- **Phase 6 (Polish)**: depends on all desired stories

### Story dependencies

- **US1 (P1)**: after Phase 2. No dependency on other stories. Ships alone as the MVP.
- **US2 (P2)**: after Phase 2. Touches `prep.ts`, which US1's T024 also touches — sequence T024 before T028.
- **US3 (P3)**: after Phase 2. Fully independent; test-pack only, no shipped content.

### Critical path

```text
T001 → T002 ─┐
T003 ────────┼→ T023 ─┐
T004 ────────┘        │
T005 → T006 → T008 ───┼→ T020 → T021 → T022 → T033
T007 → T009 → T024 ───┘
```

`T033` (reachability) is the true terminus. Until it passes, the feature is not shipped —
only built.

### Parallel opportunities

- Phase 2: T007 ∥ T011 ∥ T013 (different files)
- US1 tests: T014 ∥ T015 ∥ T016 ∥ T017 (all pure, different concerns)
- US2 tests: T026 ∥ T027
- Polish: T036 ∥ T037

---

## Parallel Example: User Story 1 tests

```bash
# All four are pure and touch different assertions — run together:
npx vitest run src/sim/progression.test.ts -t "boundary"
npx vitest run src/sim/progression.test.ts -t "two-sided"
npx vitest run src/sim/progression.test.ts -t "idempotence"
npx vitest run src/sim/roster.test.ts -t "permanence"
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 — **the decisions**. Without these the rest is unauthorized work.
2. Phase 2 — schemas and predicates.
3. Phase 3 — US1.
4. **STOP. Run T033.** If no unit reaches the threshold in a full campaign, the feature is
   not done regardless of how green everything else is.

### Incremental delivery

US1 ships a working unlock. US2 makes it legible. US3 makes it authorable. Each is a
standalone increment; stopping after any of them leaves a coherent game.

---

## Notes

- `[P]` = different files, no dependencies on incomplete tasks.
- This repo's tests colocate (`<module>.test.ts`). There is no `tests/` directory.
- Every task above T004 is **written but not authorized**. Phase 1 is the gate.
