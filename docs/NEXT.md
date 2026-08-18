<!-- written-against: 45c5a9cf41efc3f43ebd4ea1155b24b0d08153a0 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive.

---

## Where things stand

**P2 — customization depth, in progress.** 562 tests / 31 files, 12 Playwright specs.
**Variety score is 7**, release bar 8. `pass=true`, no dominant build.

Two slices back to back on the chassis slots:

- **ADR-0019** woke the **reaction** slot. Counter and Hamedo fire at Brave%, and a fired
  reaction is credited to the **reactor** rather than vanishing into the attacker's HP diff.
- **ADR-0020** measured the **movement** slot and did **not** ship it. See below — this is
  the important one, because it inverts what the previous handoff told you.

---

## The last dead slot is an AI problem. Read this before scoping anything.

The previous handoff called movement "one line of code and a measurement". The code was
one line. **The measurement failed: +2 Move dropped the variety score 7 → 5 and failed the
gate.** Every caster collapsed (`arcane-artillery` and `glass-summoner` 5/12 → 1/12,
`spellblade` 6 → 2), melee went flat or slightly worse, and **no build improved anywhere.**

The fold was fine. `compareCandidate` enumerates every reachable tile, prices the **act**
available from each, and has **no term for how exposed the tile is**. Low Move was keeping
fragile builds alive *by accident*. Traced on `skirmish-a`: at Move 3 the wizard casts from
behind its own line and wins in 19 turns; at Move 5 it walks to `5,0` inside two enemies'
strike envelope, casts, and dies on that tick with its charge cancelled.

`ai.test.ts` now pins this on a purpose-built Move ladder — exposure `[0, 0, 2, 3, 3, 3]`
across Move 2…7 — and **goes red the day the probe learns to weigh danger.** That is the
moment `steal.move-plus-2` may leave `DEFERRED_MOVEMENT_EFFECTS`.

---

## The next slice — NOT YET CHOSEN. Pick with the human.

1. **Teach the probe to price exposure.** The named blocker above, and the biggest lever
   left. **Scope it honestly:** a safety term at the BOTTOM of the comparator will not
   work — in the discriminating pair the exposure is lost to `targetEffHp`, the PRIMARY
   key. So this turns a greedy attacker into a cautious one and will move every benchmark
   number in the repo. `src/sim/CLAUDE.md` calls `compareCandidate` load-bearing; treat it
   that way — own measurement, own robustness sweep, own ADR.
2. **Give casters a second life instead.** The other reading of the same finding: at
   `docs/07` §3's TTK band every caster dies to one blow, so *any* forward step is fatal
   and no amount of AI caution creates a safe tile. A field where a squishy survives one
   hit might unblock movement without touching the comparator. **Price both before
   committing** — that is ADR-0020's explicit instruction, not a suggestion.
3. **Provoke / threat.** Unchanged from the last handoff. Retires `bld-aggro-tank`'s
   exclusion; read its **re-measured** tag first (it clears 6/6 now that Counter fires — it
   is blocked from being *distinct*, not from being measured).
4. **The eighth identity.** Jobs are deprioritised (user decision), and **no remaining
   EXCLUDED entry can supply a new signature prefix.** Say that out loud before scoping
   anything as "gets us to 8".

---

## Traps waiting for you

1. **Do not re-derive the movement fold.** It was built, measured, and deliberately
   reverted. ADR-0020 has the numbers and the trace. Building it again to "see for
   yourself" costs an hour and lands on the same wall.
2. **A mobility, reach or range grant is not automatically a buff here.** The probe cannot
   use extra reachable tiles safely. Check that before scoping any content that grants one.
3. **An aggregate A/B can read "identical" while 13 % of the rows moved.** From the
   reaction slice: stripping the effects gave byte-identical `pass` / `N` / dominance while
   13 of 96 gauntlet runs had changed. Diff at the resolution the change acts on.
4. **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice.** Identical
   gauntlet rows; they differ only in raw HP (255 vs 242) and trait order.
5. **`punch-art.` now has TWO carriers.** Anything assuming "one credited build per
   identity" is wrong — the gate's per-identity sweep is keyed on the prefix for this reason.
6. **`bld-cutpurse` still sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).** Any content change
   that effectively lowers HP costs the seventh identity.
7. **Hamedo draws the hit roll it then discards.** Deliberate (ADR-0019 decision 5) — it
   keeps "the hit roll is unconditional" an invariant. Do not optimise it away; it moves
   every downstream roll.
8. **The browser tests are NOT in `npm run check`.** Run `npm run test:visual` too.

---

## What changed that you would not guess

- **A reaction's reach is the reactor's own basic-attack range**, asked of
  `inAbilityRange`, not re-derived. A ranged physical blow draws no answer from a melee unit.
- **There is no reaction chain, structurally.** The counter-swing resolves inline in
  `tryReaction` and never routes back through `resolveAttack`. One test exists for exactly
  the refactor that would break it.
- **Charges are not a reaction site, and the reason is a schema fact**:
  `ChargeEffectSchema.shape.kind` is the literal `"magic"`, and no reaction wakes on magic.
  A test asserts that literal, so adding a physical charge kind goes red.
- **`winsAllInBand` has two entries** (`bld-counter-wall`, `bld-faithzero-monk`). Surfaced,
  not failed — but a list that should not keep growing (`docs/02` B5).
- **Schema is v11** (`UnitState.reaction`). The frozen golden was regenerated by two
  mechanical edits and then matched the engine byte for byte — that *is* the classification.
- **The prep dropdowns tag inert equips** with "no effect yet", reading the three DEFERRED
  manifests. The viewer's "not modeled" list is prose in two places (`main.ts`'s hint and
  `docs/10` §4) and nothing type-checks it — grep both when a capability lands.

## Standing constraints that outlive any one slice

- **Jobs are deprioritised** (user decision). The road to ≥8 runs through **new signature
  prefixes**, and the EXCLUDED manifest can no longer supply one.
- **The frozen golden is a tripwire, not a maintenance item.** Never regenerate it to make
  a test pass — classify the diff, and expect only representation fields to move.
- **`order: "after"`** (act-then-move) exists in the schema and driver, covered headlessly,
  deliberately unreachable from the UI.
- **The MP contingency is unchanged and still live.** `white-magic.holy` (56 MP off a 24
  budget) and `summon.*` ride unenforced MP; enforcing it would drop the count.
- **`bld-spellblade` is still masked** and buys the count nothing (its prefix collapses
  onto the wizard's).
- **`battle-skill` is still excluded by user decision** (2026-08-16), pending a multi-job
  skill rework. Its breaks inflict nothing, so they need stat-modifying statuses.
- **`compareCandidate` is the most load-bearing function in the repo.** Every benchmark
  number, every ADR's measurement and the gate's verdict all key on it. Changing it is
  never a small slice.

## Environment facts that cost real time to learn

- **Scratch probes belong outside the tree.** `coverage/` is gitignored; a `vite-node`
  script importing `src/sim/*` is the fastest way to measure the gate. Six now exist there
  (gate summary, stripped-effects A/B over all 96 runs, single-candidate detail, a
  single-run turn-log trace, an exposure ladder, a build-level debug). The **trace is what
  produced ADR-0020's diagnosis** — the summary table alone said only "N fell to 5".
- **`buildGauntletEncounter(source, candidateId, oppositionBuildIds)`** — the opposition
  argument is `OPPOSITIONS[i].buildIds`, not the `Opposition` object. Passing the object
  fails with a confusing "cannot seat 20 units" grid error.
- **Never round-trip `data/base-pack.json` through a JSON parser to edit it.** Re-serialising
  reformats the whole file: a two-line change came back as **1181 lines**. Do a surgical
  text replace and check `git diff --stat` says what you expect.
- **Playwright browsers: the sandbox and a Windows box differ.** Chromium at
  `/opt/pw-browsers` is the **Linux sandbox only**; elsewhere `npx playwright install
  chromium` fixes a missing-executable error that reads like a code failure.
- **A bare JSON import breaks ONLY the browser job** — `e2e/play.spec.ts` goes through
  Node's ESM loader, which requires `with { type: "json" }`; Vite does not.
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
