# Tasks: A Weapon Has a Range

**Input**: [spec.md](spec.md), [plan.md](plan.md), ADR-0049, `docs/01` AC-011..AC-016.
One editing agent in the checkout at a time. `[P]` marks read-only work that may run beside an editor.
Every new test names the MUTATION it goes red on, and the report says it was run.

## Phase 1 — Engine shape (combat-engineer, `src/sim`)

- [ ] T001 `state.ts`: freeze `migrate4to5` to call `basicAttackFrom({...u.weapon, range:{h:1,v:1}})` FIRST, before any schema change.
- [ ] T002 `state.ts`: `WeaponSchema` gains `range: RangeBoxSchema`; `basicAttackFrom` copies `weapon.range`; `defaultUnit` weapon gets `{h:1,v:1}`.
- [ ] T003 `state.ts`: `SCHEMA_VERSION = 12`; add `migrate11to12` (every unit's weapon gets `{h:1,v:1}`); register `MIGRATIONS[11]`.
- [ ] T004 `equipment.ts`: the item's weapon becomes `WeaponSchema.optional()`.
- [ ] T005 `build.ts`: `DEFAULT_BUILD_WEAPON` gets `{h:1,v:1}`; rewrite the `projectAbilities` docstring (range-up widens skills only).
- [ ] T006 Docstrings: `basicAttackFrom`, `exposureOf` (`ai.ts`), `reaction.ts:92`. (`session.ts:585` wording goes with T009.)
- [ ] T007 Sim test literals get `range:{h:1,v:1}`: `ai.test.ts`, `driver.test.ts`, `resolve.test.ts`, `encounter.test.ts`. Stripped older-version fixtures also delete `weapon.range`.
- [ ] T008 Regenerate the golden at `driver.test.ts:235`. Grep the diff: only `schemaVersion` and weapon `range` may move. Anything else moves → stop and report.

## Phase 2 — Viewer literals (viewer-engineer, `src/render`)

- [ ] T009 Add `range:{h:1,v:1}` to weapon literals in `demo.ts`, `session.test.ts`, `panels.test.ts`, `motion.test.ts`, `pacer.test.ts`; fix the "Reach 1" wording at `session.ts:585`. No logic change.

## Phase 3 — Content (content-author, `data/`)

- [ ] T010 `base-pack.json`: `"range":{"h":1,"v":1}` on all 8 weapons; add `wpn-long-bow` (`wp 4`, `speedWp`, `none`, `accuracy 100`, `range {h:4,v:3}`, `weaponEv 0`, tags `weapon, ranged`).
- [ ] T011 `camp-the-first-march.json`: add `wpn-long-bow` to battle 1's `grants`; set `pc-briar`'s `weapon` to `wpn-long-bow`. Aimed Shot untouched.
- [ ] T012 CHECKPOINT: `bash scripts/quiet.sh npm run check`. Any balance test red (`campaign-run`, `playtest`, `story`, `campaign-data`, `gauntlet`, `ttk`) → STOP, report, ask the owner. No retune.

## Phase 4 — Acceptance tests

- [ ] T013 (combat-engineer) AC-011, AC-012 in new `src/sim/weapon-range.test.ts`. Includes the identity check: Briar holds `wpn-long-bow`, and the bow is in the starting inventory.
- [ ] T014 (combat-engineer) AC-013 in `state.test.ts`.
- [ ] T015 (combat-engineer) AC-014 in `ai.test.ts`.
- [ ] T016 (combat-engineer) AC-015 in `reaction.test.ts`; the mutation hits `resolve.ts:236`.
- [ ] T017 (viewer-engineer) AC-016 in `session.test.ts`.

## Phase 5 — Review and record

- [ ] T018 [P] (reviewer) One adversarial pass over the diff; run each named mutation.
- [ ] T019 Fix the reviewer's findings (the owning engineer).
- [ ] T020 (docs-steward, SECOND-PASS-OK) Fix the AC errata in `docs/01` (fixture layout, `resolve.ts:236`); close `docs/defects.md` §1's row; mark ADR-0049 built; update `docs/INTENT.md`.
- [ ] T021 Retrospective; `npm run state` last; `npm run check` green.
- [ ] T022 (release-engineer) Push and open the PR, with the owner's go.
