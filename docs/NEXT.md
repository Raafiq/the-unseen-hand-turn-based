<!-- written-against: 32d6cdc62037f68b38c62e74a53a95fb8531c974 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls more than 10 commits behind HEAD. If the hook
> says it is stale, treat every claim below as a hypothesis and re-derive.

---

## Where things stand

**P2 — customization depth, in progress.** 500 tests / 29 files, 11 Playwright specs.
**Variety score is still 6**, release bar 8. `pass=true`, no dominant build.

The last slice was a **defect fix, not a content slice**, and deliberately did not move the
count. Three things that read as working were not:

| what | was | now |
|---|---|---|
| `power` on a physical skill | ignored — every one dealt a plain weapon swing | live, re-priced |
| `inflicts` on any ability | never applied by any resolver | applied on a landed hit |
| dead skillsets (`battle-skill`, `steal`) | silently inert | named manifest + shown in the UI |

Also fixed along the way: the demo roster was **far outside the `docs/07` §3 time-to-kill
band** (a "tank" died in 2 committed actions where the band says 3–4, a squishy in 1), the
Archer had no ranged attack at all, and the e2e fixtures had been broken by demo drift four
times. All three are addressed; see "What changed that you would not guess" below.

---

## The next slice — TEACH THE PROBE TO VALUE CONTROL, THEN LAND A THIEF

This is Steps 3–4 of `docs/plans/slice-live-effects-and-steal.md`, deferred there
deliberately so the defect fix stayed reviewable. **The decisions are already taken** (that
file's §0): fork A, and the cut after Step 2. You are picking up an agreed plan, not a
proposal.

### The job in one line

**Statuses now land, but the AI cannot see them — so no build can signature on control,
and the Thief that would raise the count does not exist yet.**

### Step 3 — `ai.ts` values an inflicted status

`ai.ts:127` skips every `formula: "none"` action, and `estMagnitude` ranks purely on
damage. So Charm, Stop and Slow are invisible to the balance probe **no matter what they
inflict**. Fold a status term into the **single uniform, transitive** comparator
(`src/sim/CLAUDE.md`: never a bucket-first key). A `none`-formula action with a real
`inflicts` must become selectable; one with nothing must stay skipped.

### Step 4 — Charm behaviour + author a Thief

- `steal.heart` already applies `status.charm` as a status. **Charm BEHAVIOUR — the
  inflicter controlling the target — is unimplemented**, so it is an inert marker today.
  Check `docs/05` before assuming it is an AI-only change: a charmed unit acting for the
  other side touches team logic and every victory condition.
- **There is no Thief build.** No shipped record has `currentJob: "thief"`. Authoring one
  is part of this slice, not a follow-up.
- Then bump `DIVERSITY_TARGET_N` 6 → 7, which moves the `gauntlet.ts` manifest, an ADR-0014
  amendment, **`docs/06` AC-E2 (authoritative)** and a regenerated `npm run state`, together.

### Traps waiting for you

1. **An `ai.ts` comparator change moves EVERY benchmark number and the frozen golden.**
   Budget for a re-tune, and classify the golden diff first (`src/sim/CLAUDE.md`).
2. **Only ONE shipped build currently carries an inflicting ability** — `bld-longshot`
   (`aim.head-shot` → Stop). Measured: Stop lands on two of six gauntlet maps today. If
   your comparator change makes control attractive, the archer is where it shows up first,
   and it is already the build closest to over-performing.
3. **Four of `steal`'s five actions are unreachable** — `gil` needs the post-battle economy,
   `armor`/`helmet`/`weapon` need the equipment layer (`docs/05` §4). Only `heart` is in
   reach. `DEFERRED_SKILLSETS` in `content.ts` states this; keep it accurate or the
   partition test fails.
4. **Do not fix `bld-spellblade` expecting the count to move.** Its prefix collapses onto
   the wizard's. Unchanged.
5. **The browser tests are NOT in `npm run check`.** Run `npm run test:visual` too.

---

## What changed that you would not guess

- **`inflicts` carries RESOLVED templates, not ids** (schema v9). That was the actual
  blocker for the whole life of the repo: a resolver may not read the content catalog
  (ADR-0011), so an id list was unusable. Projection happens once, in `build.ts`.
- **Infliction consumes NO rng draw** — unconditional on a hit. That is why wiring it moved
  the frozen golden by exactly one character (`schemaVersion`). A real per-status chance is
  a fidelity change needing its own declared roll slot; do not smuggle it in.
- **`ActiveStatus` moved to its own leaf module** (`active-status.ts`) because `ability.ts`
  needs the schema and `state.ts` imports `ability.ts` — the Zod module-eval (TDZ) cycle.
  `state.ts` re-exports everything, so no call site changed.
- **The routing discriminant is `isBasicAttack`, not `formula === "physical"`.** Four sites
  must agree: driver dispatch, AoE resolver, `ai.ts` `estMagnitude`, viewer `preview.ts`.
- **The preview now DISCLOSES `inflicts`**, and `session.test.ts` moved that key from its
  banned list to its required one. The rule did not change; the engine did.
- **The demo roster was re-tuned to the TTK band** and `src/render/demo.test.ts` pins it,
  with a non-vacuity guard that runs the pre-slice HP through the same bands and asserts
  three of four fail.
- **e2e fixtures now DISCOVER their tiles** from live state through the shipped seam
  (`findArcPair` in `play.spec.ts`) instead of hard-coding coordinates that demo content
  invalidates. Gallery captions lost their hard-coded tiles and damage numbers to match.

## Standing constraints that outlive any one slice

- **Jobs are deprioritised** (user decision). The road to ≥8 runs through **new signature
  prefixes**, not through the EXCLUDED manifest — three of its four entries are
  prefix-collapse cases.
- **`battle-skill` is excluded from content work by user decision** (2026-08-16): the
  break/debuff vocabulary reads as thin and a **multi-job skill rework** is wanted later.
  It is listed in `DEFERRED_SKILLSETS` with its blocker; do not quietly revive it.
- **The frozen golden is a tripwire, not a maintenance item.** Never regenerate it to make a
  test pass — classify the diff, and expect only representation fields to move.
- **`order: "after"`** (act-then-move) exists in the schema and driver, covered headlessly,
  deliberately unreachable from the UI.
- **The MP contingency is unchanged and still live.** `white-magic.holy` (56 MP off a 24
  budget) and `summon.*` ride unenforced MP; enforcing it would drop the count.

## Environment facts that cost real time to learn

- **Playwright browsers: the sandbox and this Windows box differ.** The old note here said
  "Chromium is pre-installed at `/opt/pw-browsers`, never run `playwright install`" — that
  is true of the **Linux sandbox only**. On the Windows host the project's Playwright wanted
  build **1187** while only 1179/1228 were present, and every browser spec failed with a
  missing-executable error that reads like a code failure. `npx playwright install chromium`
  fixes it (~240 MB, one time). `.claude/launch.json` now exists so the viewer can be
  launched directly.
- **A bare JSON import breaks ONLY the browser job.** `e2e/play.spec.ts` imports
  `src/render/demo.ts` through Node's ESM loader, which requires
  `with { type: "json" }`; Vite (dev, build, vitest) does not. So `npm run check` stays
  green while `npm run test:visual` fails to even load.
- **Scratch probes belong outside the tree.** `coverage/` is gitignored and works well; a
  `vite-node` script importing `src/sim/*` is the fastest way to measure the gate.
- **Use the check-runs API for CI.** The legacy commit-status endpoint reports
  `pending / total_count: 0` because nothing posts there.
- **The sandbox proxy blocks `/repos/*/pages`, `/environments`, `/deployments` and all
  `*.github.io` egress**, but a *runner* can reach them with `${{ github.token }}`.
- **GitHub auto-merge is NOT enabled** on this repo — watch the checks and merge.

## Pages — RESOLVED 2026-08-12 (first successful deploy on run #23)

`pages.yml` was always correct; runs #1–#22 failed on two sequential *settings*, both
derived from the repository default branch. Two preflights now guard the `build` job, the
second because the first is not sufficient. **An agent can confirm the deployment API
reported success but cannot confirm the page renders** — `*.github.io` is blocked.
