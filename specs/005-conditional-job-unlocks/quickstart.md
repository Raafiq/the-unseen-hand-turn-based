# Quickstart — validating Conditional Job Unlocks

**Feature**: 005-conditional-job-unlocks | **Phase 1**

> **Nothing here is runnable yet — no code has been written.** This is the validation
> plan the implementation must satisfy, written now so the tests are designed before the
> code rather than fitted to it.

## Prerequisites

```bash
npm install
```

## The full gate

```bash
npm run check     # typecheck + lint + check:rng + check:handoff + check:story + test
```

`check:rng` is the load-bearing one for this feature: it greps `src/sim` for unseeded
randomness and wall-clock use. Deeds must not trip it.

## Scenario 1 — the unlock discriminates (SC-001, SC-002)

```bash
npx vitest run src/sim/progression.test.ts -t "deed unlock"
```

**Expected**: a unit at the threshold minus one is locked; at the threshold, unlocked; above
it, unlocked. And in the same test, a second unit with zero deeds is **still locked**.

Both halves matter. A one-sided check cannot tell "unlocked correctly" from "unlocked for
everyone" — the assertion has to be able to come out the other way.

## Scenario 2 — the field is wired, not just validated (SC-003)

```bash
npx vitest run src/sim/content.test.ts -t "unlock A/B"
```

**Expected**: build the same test pack twice — once with `unlock` on `bounty-hunter`, once
without — and assert `unlockedJobs` returns a **different** list for a zero-deed unit.

This is the test that catches the failure mode where the schema accepts `unlock`, the loader
validates it, and `prep.ts` ignores it entirely. Every other test in this feature passes
against that bug.

## Scenario 3 — old saves survive (SC-004)

```bash
npx vitest run src/sim/roster.test.ts -t "v3 to v4"
```

**Expected**: a v3 record serialized before this change deserializes to v4 with zeroed
deeds and an otherwise identical body. Assert field-by-field, not just "it didn't throw".

## Scenario 4 — a lost battle credits nothing (FR-008)

```bash
npx vitest run src/sim/campaign-run.test.ts -t "defeat"
```

**Expected**: fold a defeat, then a retry, then a victory. Deeds move only on the victory.

The failure this guards is someone moving the fold above `applyBattleResult`'s early
`gameOver` return. Write the assertion so that edit turns it red.

## Scenario 5 — the build-variety score does not move (SC-005)

```bash
npx vitest run src/sim/benchmark-suite.test.ts
```

**Expected**: unchanged — 7 credited identities against a target of 8.

Read the **rows**, not the summary count. An unchanged total can hide moved rows; this
repo has been bitten by exactly that (a reaction-slot A/B reported byte-identical
aggregates while 13 of 96 rows had moved).

## Scenario 6 — ⚠️ someone can actually reach it (SC-007)

```bash
npx vitest run src/sim/campaign-run.test.ts -t "threshold is reachable"
```

**Expected**: run a full headless campaign; assert at least one unit crosses the threshold.

**This is the test that fails today.** Phase 0 measured the shipped campaign at **12 enemy
units in total**, so the spec's threshold of 15 is unreachable even by a unit that solo-kills
the entire game. Every other scenario above would pass with the threshold at 15 while no
player ever saw the job.

Do not write this test against a hard-coded number. Read the threshold from the pack, so it
stays honest when OI-4 sets the real value.

## Manual check (after the headless gate is green)

```bash
npm run dev     # then open /game.html
```

Play to a battle where a unit crosses the threshold. Confirm: the job appears in the prep
screen for **that unit only**, it is labelled with the deed that earned it, and no locked
job was named anywhere beforehand.
