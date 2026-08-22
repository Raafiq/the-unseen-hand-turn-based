<!-- written-against: 37e308e3fa451d095d9fb2e32386c785b38b3f37 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive.

---

## Where things stand

**M0 — the playable slice (`docs/11`). Six of seven items done; only EQUIPMENT is left.**
703 tests / 37 files, 18 Playwright specs. Variety score still 7 (bar 8), carried into M1
by user decision — **not an MVP blocker, do not "just finish the gate first"**.

**Onboarding landed 2026-08-22 (ADR-0025) — but NOT as `docs/08` §3 designs it.** The user
decided: **no teaching on rails.** No staged unlocks, no gated prep controls, no scripted
first build, no tutorial battle. Instead a `?` button on `game.html` opens a help panel,
and the mechanics are expected to read on their own.

Scoping that slice measured the campaign first, and the measurement is the real story:

- **Battle 3's only affordable purchase was inert** (`battle-skill.weapon-break`). The
  previous handoff had proposed putting the guided first purchase exactly there.
- **The guided first build had nothing to equip.** Cheapest LIVE option per slot, against a
  campaign that pays out ~280 AP to its best earner: secondary 60, movement 120,
  **support 300**, **reaction 540**. Two of four slots cost more than the whole game.
- **The panel only listed the current job's tree**, which hid the 60-AP path to a Secondary
  command. `canLearn` never required being in the job — `docs/02` AC-J2 backs cross-job
  buying, and AP is one pool. That was a UI restriction with no doc behind it.

What shipped:

- `src/render/help.ts` + `help.test.ts` — help topics as DATA, with `HelpTopic.slot`
  asserting each claimed slot is live **and** affordable in one campaign.
- `PrepModel.browseJob()` / `setBrowseJob()` — the learn list browses any tree. Browsing is
  model state, resets on select / setRecords / setJob.
- Four new tier-one supports (knight, priest, archer, geomancer) and four shortened
  prerequisite chains. Cheapest live: support 120, reaction 180, movement 120.
- `docs/11` AC-M5 + AC-M6; `docs/08` §3 marked DEFERRED.

---

## The next slice — equipment (`docs/11` M0 item 5), the last M0 item

ADR-0021 scoped it: **horizontal gear**, ~8 items on an authored drip, no shop, no gil.
`build.ts` still uses one placeholder weapon.

Known shape, unchanged from two handoffs ago: a `rosterSchemaVersion` bump + a migration +
a regenerated frozen golden + a re-measured gate. It is the **expensive** M0 item — the
only one that moves a persisted schema.

Read ADR-0021 before scoping it, and re-derive its numbers rather than trusting them.

### Deliberately NOT green-lit

- **`docs/08` §3's teaching ramp.** Explicitly deferred by user decision, recorded in
  ADR-0025 decision 1. **Do not build it back in** because a doc still describes it —
  `docs/08` §3 now carries a STATUS block saying so.
- **Making `game.html` the landing page** (and moving the viewer to `viewer.html`). Still
  the right end state, still in ADR-0023's rejected alternatives, still a rewrite of twelve
  browser specs' navigation.
- Anything that raises the variety score. Carried to M1.
- Reworking the AP grant. Still an M1 question (ADR-0012's `participated` + capped
  `meaningfulActions`; a healer who only heals banks nothing).

---

## Traps waiting for you

1. **THE ONBOARDING BET IS UNTESTED AND THE ONLY EVIDENCE THAT COULD SETTLE IT IS A
   PERSON.** "The mechanics read on their own" is a design bet, not a finding. Nobody who
   did not build this has played it. `docs/11` AC-M6 asserts the help panel's *claims* are
   deliverable — it says nothing about whether the game is legible without it. If a
   playtest happens, that is the evidence; until then do not cite the green suite as if it
   settled the question.
2. **A GATE THAT CANNOT SEE A CHANGE GOING GREEN IS NOT EVIDENCE.** Repricing skill trees
   moved nothing in the diversity gate, and that is *structural*: shipped builds in
   `data/builds` author `learned` explicitly, so progression costs never reach a built
   unit. The evidence for ADR-0025 decision 4 is the reachability probe, not the 703
   passing tests. Expect the same blindness for any future progression-economy change.
3. **`ReactionEffectSchema` IS `{kind}` WITH NO MAGNITUDE, AND THAT CONSTRAINS CONTENT.**
   Any cheap `counter` is byte-identical to the 240-AP capstone `counter` and strictly
   dominates it. This is why no second cheap reaction was added anywhere. Same shape for
   `MovementEffectSchema` (`{move}` only): a +1 move ability priced beside the thief's +2
   just loses. **Before authoring a passive, check whether its effect schema can express
   "weaker".** If it cannot, repricing the existing one is the only honest move.
4. **A TEST THAT NAMES THE BUG IT CATCHES IS A CLAIM ABOUT CODE YOU HAVE NOT RUN.** Caught
   again this slice: the cross-job purchase test's comment said it would fail if the panel
   bought from `currentJob`. It did not — it passed the mutation, because it named the node
   by literal id instead of taking it from `learnRows()`. Run the mutation.
5. **`EXPECTED_TREE_SIZES` in `content-pack.test.ts` pins every job's node count.** Adding
   a tree node fails there by design. Move it in the same slice.
6. **`AP_TIERS` is 60/120/240.** A node priced anywhere else fails the pack integrity test.
7. **The help panel is NOT on the story seam, deliberately.** It is UI chrome; swapping the
   story pack must never delete the manual. Do not "consolidate" the two.
8. **The `?` lives in `game.html` only.** `play.spec.ts` asserts `index.html`'s tab order
   exactly; `campaign.spec.ts` does not. Adding a control to the viewer page will break it.
9. Everything the previous handoff listed still holds: **a screen the state machine skips
   has content nobody can reach** (`concludeBattle` branches on status; the FINAL victory
   never passes through `AFTER_BATTLE`); **a sim docstring that delegates a rule to "the
   caller" is an obligation nobody is told about**; **the prep panel is mounted ONCE and
   re-pointed** (`setRecords` no-ops deliberately — panel state must live in `PrepModel`,
   not the DOM); **`onChange` → `updateParty` → `renderBriefingText()`, not `refresh()`**;
   **the story pack's coverage is checked at BOOT, both directions**; **story text is
   rendered with `textContent`, never `innerHTML`**; **an A/B between two callers of the
   same helper cannot see a bug in the helper**; **the shell's `rules` CAPS are
   unasserted**; **`Session` has TWO verdict readings and only one is right for an
   encounter**; **never grow a second accounting fold in `src/render`**;
   **`campaign-data.ts` imports the five encounter files BY NAME**; **the AP grant reads
   `landedActions`**; **the campaign is winnable UNDER THE PROBE, which is reachability
   evidence, not difficulty evidence**; **`docs/11` §3 and `docs/08` §1a carry AUTHORED
   status tables nothing derives**; **`gen-state.mts` fails on an unresolved `{token}`**;
   **the browser tests are NOT in `npm run check` — run `npm run test:visual` separately.**

## Measured facts (re-derive rather than trust, but these were probed)

Cheapest LIVE option per chassis slot, walking prerequisites, after ADR-0025:

| Slot | Ability | Total AP |
|---|---|---|
| secondary | any job's first action | 60 |
| support | `battle-skill.hp-boost` | 120 |
| movement | `steal.move-plus-2` | 120 |
| reaction | `punch-art.counter` | 180 |

Campaign AP budget: **~280** for the best-earning member, **~184** for the worst
(Ottoline, who banks nothing from a battle she lands no action in). Every 240-AP capstone
stays out of reach in one playthrough — intended, and asserted.

### Still-live engine facts (unchanged by this slice)

- **AC-E6 is REACHABILITY, not balance.** All five *benchmark* encounters end in defeat for
  team 0 as authored; that is why the campaign is purpose-built content.
- **A mobility, reach or range grant is not automatically a buff** (ADR-0020).
- **An aggregate A/B can read "identical" while a third of the rows moved.**
- **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice**; `punch-art.`
  has TWO carriers; `bld-cutpurse` sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).
- **Hamedo draws the hit roll it then discards** (ADR-0019 decision 5) — deliberate.
- **The MP contingency is live:** `white-magic.holy` and `summon.*` ride unenforced MP.
- **`battle-skill` is still excluded by user decision** (2026-08-16). ADR-0025 softened the
  symptom without touching the decision: Vance's Knight *actions* are all still inert, but
  `battle-skill.hp-boost` gives him one live thing to buy. **He still has no live action
  in the whole campaign** — that remains a content problem the label only discloses.
- **`compareCandidate` is the most load-bearing function in the repo.**
- **The frozen golden is a tripwire, not a maintenance item.**

## Environment facts that cost real time to learn

- **Scratch probes belong outside the tree — but INSIDE the repo.** `vite-node` resolves
  imports against the Vite root, so a script in `/tmp` cannot import `src/`. Put it in
  `coverage/` (gitignored) and delete it after.
- **Never round-trip `data/base-pack.json` through a JSON parser to edit it** — it
  reformats the whole file. Line-level string edits only. (Small authored files like
  `data/campaign/*` are fine.)
- **Perturb the BASELINE as well as the fix.**
- **Playwright browsers: the sandbox and a Windows box differ.** Chromium at
  `/opt/pw-browsers` is the Linux sandbox only.
- **A bare JSON import breaks ONLY the browser job** — `e2e/*.spec.ts` goes through Node's
  ESM loader, which requires `with { type: "json" }`.
- **`vite.config.ts` now has two entries.** A page missing from `rollupOptions.input` works
  under `npm run dev` and does not exist in `dist` — i.e. it is not shipped.
- **Use the check-runs API for CI**; the legacy commit-status endpoint reports nothing.
- **The sandbox proxy blocks `/repos/*/pages`, `/environments`, `/deployments` and all
  `*.github.io` egress**, but a runner can reach them with `${{ github.token }}`.
- **GitHub auto-merge is NOT enabled** on this repo — watch the checks and merge.

## Pages — RESOLVED 2026-08-12 (first successful deploy on run #23)

`pages.yml` was always correct; runs #1–#22 failed on two sequential *settings*, both
derived from the repository default branch. Two preflights now guard the `build` job, the
second because the first is not sufficient. **An agent can confirm the deployment API
reported success but cannot confirm the page renders** — `*.github.io` is blocked. Nobody
in this sandbox has seen the shipped shell render.
