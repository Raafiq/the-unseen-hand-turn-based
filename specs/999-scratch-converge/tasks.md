# Tasks: Scratch Calculator

## Phase 1: Setup

- [X] T001 Create `coverage/scratch-calc/calc.ts` per plan touch-points

## Phase 2: Core

- [X] T002 Implement `add(a, b)` returning `a + b` per FR-001
- [X] T003 Implement `sub(a, b)` returning `a - b` per FR-002

## Phase 3: Tests

- [X] T005 Add unit tests covering every export per SC-001

## Phase 4: Convergence

- [X] T006 Add `divide(a, b)` returning `a / b` and throwing `RangeError` when `b` is `0` in `coverage/scratch-calc/calc.ts` per FR-003 (missing)
- [X] T007 Add `coverage/scratch-calc/calc.test.ts` covering every export per SC-001 (missing)
- [X] T008 Remove `logCall`, `console.log` and module-level `callCount` from `coverage/scratch-calc/calc.ts`, or amend the plan, per plan: no-logging/no-side-effects constraint (contradicts)
- [X] T009 Review and justify or remove the `mul(a, b)` export in `coverage/scratch-calc/calc.ts`; no requirement in spec.md calls for it (unrequested)
- [X] T010 Correct T003's description to state `sub(a, b)` returns `a - b` per FR-002 (contradicts)
- [X] T011 Review and justify or remove the `resetCallCount()` export in `coverage/scratch-calc/calc.ts` (unrequested)

## Phase 5: Convergence

- [ ] T012 Change `divide(a, b)` in `coverage/scratch-calc/calc.ts` to return `null` when `b` is `0` instead of throwing `RangeError` per FR-003 (contradicts)
- [ ] T013 Update `coverage/scratch-calc/calc.test.ts` to assert `divide(1, 0)` returns `null` rather than throwing per FR-003 (contradicts)
