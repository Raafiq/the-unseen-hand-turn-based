<!-- written-against: 0b6cc99edc040d5e12db75f1f934dd5e8a753747 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive.

---

## Where things stand

**P2 — customization depth, in progress.** 560 tests / 31 files, 12 Playwright specs.
**Variety score is 7**, release bar 8. `pass=true`, no dominant build.

The last slice (ADR-0019) woke the **reaction** chassis slot. Counter and Hamedo now fire
at Brave%, and a fired reaction is credited to the **reactor** rather than vanishing into
the attacker's HP diff.

| what | was | now |
|---|---|---|
| the reaction slot | validated at equip time, then discarded | live — 7 of 15 builds stopped wearing a dead slot |
| a counter's damage | lands on the attacker, which the diff never credits ⇒ **scores zero** | its own event, credited to the reactor |
| `bld-counter-wall` | EXCLUDED ("reaction-as-live modeling") | MEASURABLE, 6/6, signature landed |
| the variety score | 7 | **still 7** — `punch-art.` collapses onto the monk |
| the movement slot | silently inert | inert **on the record**, with an A/B asserting it |

---

## The next slice — NOT YET CHOSEN. The candidates, by leverage

Nothing is green-lit. Pick with the human.

1. **Wake the movement slot.** The last dead slot. It is a one-line fold onto `move`
   (and `jump`), so the *code* is small — the whole slice is the **measurement**. Eight of
   fifteen builds equip `steal.move-plus-2`, so switching it on hands more than half the
   roster +2 Move at once. `DEFERRED_MOVEMENT_EFFECTS` in `build.ts` already names every
   ability and splits SCOPE from BLOCKED; `build.test.ts`'s A/B is the test that must go
   red when this lands.
2. **Provoke / threat.** Retires `bld-aggro-tank`'s exclusion. Read its **re-measured**
   tag first: it is no longer blocked from being *measured* (it clears 6/6 now that
   Counter fires) but from being **distinct** — its gauntlet rows are byte-identical to
   `bld-counter-wall`'s.
3. **The eighth identity.** Jobs are deprioritised (user decision), and **no remaining
   EXCLUDED entry can supply a new signature prefix.** The road to 8 needs new content or
   a new mechanic that creates one. Say this out loud before scoping anything as "gets us
   to 8".

### If you pick anything that touches the resolvers or a slot

Read **ADR-0019** first. Two rules it sets: a reaction draw is taken **only** when the
equipped reaction can actually fire (so a reaction-less unit's roll sequence is untouched),
and **any effect that moves HP on behalf of someone other than the acting unit accounts for
itself** rather than riding `hpDiffEvent`.

---

## Traps waiting for you

1. **An aggregate A/B can read "identical" while 13 % of the rows moved.** Stripping the
   reaction effects and comparing `pass` / `N` / `dominantBuilds` / in-band tallies gave a
   byte-identical answer — which looks exactly like the dead slot the slice was fixing.
   Per-row it was **13 of 96 runs**. Diff at the resolution the change acts on.
2. **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice.** Identical
   gauntlet rows; they differ only in raw HP (255 vs 242) and trait order, and neither has
   ever mattered in a shipped run. Do not treat them as two data points.
3. **`punch-art.` now has TWO carriers.** Anything that assumes "one credited build per
   identity" is wrong — the gate's per-identity sweep had to be re-keyed on the prefix
   because of it, and the collapse is now asserted in both directions.
4. **`bld-cutpurse` still sits EXACTLY at `VIABLE_MIN_MAPS` (4/6)**, unchanged by this
   slice. Any content change that effectively lowers HP still costs the seventh identity.
5. **Hamedo draws the hit roll it then discards.** Deliberate (ADR-0019 decision 5): it
   keeps "the hit roll is unconditional" an invariant instead of a special case. Do not
   "optimise" it away — it moves every downstream roll.
6. **The browser tests are NOT in `npm run check`.** Run `npm run test:visual` too.

---

## What changed that you would not guess

- **A reaction's reach is the reactor's own basic-attack range**, asked of
  `inAbilityRange`, not re-derived. So a ranged physical blow draws no answer from a melee
  unit — a real tactical lever, and the discriminating negative in the tests.
- **There is no reaction chain, structurally.** The counter-swing resolves inline in
  `tryReaction` and is never routed back through `resolveAttack`. A refactor that
  "simplifies" it into a recursive call breaks the invariant; one test exists for exactly
  that.
- **Charges are not a reaction site, and the reason is a schema fact**, not an omission:
  `ChargeEffectSchema.shape.kind` is the literal `"magic"`, and no reaction wakes on magic.
  A test asserts that literal, so adding a physical charge kind goes red.
- **`winsAllInBand` now has two entries** (`bld-counter-wall`, `bld-faithzero-monk`). Two
  builds sweep every cell without outclassing the field. Surfaced, not failed — but it is a
  list that should not keep growing (`docs/02` B5).
- **Schema v10 → v11** (`UnitState.reaction`). The frozen golden was regenerated by two
  mechanical edits — bump the version, append `"reaction":null` per unit — and then matched
  the engine byte for byte. That *is* the classification; a re-paste would not have been.
- **The viewer's "not modeled" list was stale**, naming `status-on-hit` two slices after
  the resolvers began applying it. It is prose in two places (`main.ts`'s hint and
  `docs/10` §4) and nothing type-checks it. Grep the word out of both when a capability
  lands.
- **The prep dropdowns now tag inert equips** with "no effect yet", reading the three
  DEFERRED manifests. Before, offering a live and a dead ability identically re-created the
  dead-slot illusion at the UI layer.

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

## Environment facts that cost real time to learn

- **Scratch probes belong outside the tree.** `coverage/` is gitignored; a `vite-node`
  script importing `src/sim/*` is the fastest way to measure the gate. This slice used
  four — gate summary, a stripped-effects A/B over all 96 runs, a single-candidate detail
  table, and a build-level debug — and the **summary one was actively misleading** (trap 1).
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
