# Tasks: Tag Parser

## Phase 1: Setup

- [X] T001 Create `coverage/scratch-tags/tags.ts` per plan Project Structure

## Phase 2: Core

- [X] T002 Implement `parseTag(input)` splitting on the first `:` per FR-001
- [X] T003 Implement `formatTag(tag)` returning `key:value` per FR-003

## Phase 3: Tests

- [X] T004 Add unit tests covering both exports and the `TypeError` path per SC-001

## Phase 4: Convergence

- [X] T005 Trim surrounding whitespace from the key and value returned by `parseTag` in `coverage/scratch-tags/tags.ts` per FR-001 (partial)
- [X] T006 Add a test asserting `parseTag('  env : prod  ')` returns `{ key: 'env', value: 'prod' }` in `coverage/scratch-tags/tags.test.ts` per US1/AC1 (missing)
