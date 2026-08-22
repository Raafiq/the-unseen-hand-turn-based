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

**M0 IS BUILT — all seven items (`docs/11` §3).** 716 tests / 38 files, 19 Playwright
specs. Variety score still 7 (bar 8), carried into M1 by user decision.

**What "built" does and does not mean.** Every M0 ITEM is shipped and tested. M0's
definition of done is "a stranger plays 30–45 minutes without being told anything and
reaches a real ending" — and **that is untested. No stranger has played this.** Two bets
are open and neither needs code: onboarding (nothing is taught, only a `?` — ADR-0025)
and session length (nobody has timed a run). **The next thing this project needs is a
playtest, not a slice.**

**Equipment landed 2026-08-22 (ADR-0026)**, the last item:

- `UnitRecord.weapon` — an ID, not an inlined weapon (`rosterSchemaVersion` 3, migration
  writes `null` = the old placeholder, so migrated saves fight identically).
- 8 horizontal weapons in `data/base-pack.json`. **No weapon out-damages the baseline**;
  they trade formula, element, accuracy, evasion, Brave/Faith.
- `CampaignBattle.grants` → a **set-valued** `CampaignSave.inventory`
  (`campaignSchemaVersion` 2). Replaying a battle grants nothing new — that is the
  anti-grind invariant, asserted and mutation-verified.
- A weapon row in the prep panel, offering only what the party owns.

**The balance numbers across ADR-0025 and ADR-0026 are MVP-PROVISIONAL** (user,
2026-08-22): node costs, prereq chains and weapon stats exist to make M0 work, not because
they are right. The RULES under them are not provisional — `docs/11` AC-M5 (every slot
reachable) and AC-M7 (gear is horizontal and authored).

---

## The next slice — there isn't an obvious one, and that is the finding

M0 is done, so the honest options are:

1. **Playtest first (recommended).** Both open bets are experiments, not tasks. A single
   newcomer session settles more than any slice would. **Nothing in the repo can produce
   this evidence** — every automated run drives the balance probe or a deliberate forfeit,
   so "completable" is REACHABILITY, never difficulty or fun.
2. **M1: the variety score, 7 → 8.** The long-standing engine exit criterion (`docs/06`
   AC-E2). The obvious untried lever is now **gear**: the 15 reference builds all still
   fight with the placeholder weapon, so equipment is a diversity axis the gate has never
   used. Re-arming them is a balance pass — expect the count to move in both directions
   before it settles, and expect a plateau, not a peak (CLAUDE.md's non-monotonic rule).
3. **M1: the AP grant shape.** Still unresolved (ADR-0012): a healer who only heals banks
   nothing, and Ottoline ends the campaign two battles behind.
4. **Make `game.html` the landing page.** Still right, still a rewrite of twelve browser
   specs' navigation. Cheap and dull; good filler.

Ask before picking. This is the first point in the project where the roadmap does not name
the answer.

## Traps waiting for you

1. **A STALE `dist` FAILS A BROWSER TEST THAT IS ACTUALLY FINE.** `npx playwright test`
   does NOT rebuild; `npm run test:visual` does. The equipment spec failed once against a
   `dist` built before the feature existed, which looks exactly like a broken feature.
   Rebuild before believing a browser failure.
2. **GEAR IS A DIVERSITY AXIS THE GATE DOES NOT USE.** `data/builds/*` all carry
   `weapon: null`, so the gate's 7 is measured with every build on the same placeholder
   weapon. "The gate did not move" is a statement about COVERAGE here, not quality.
3. **`wp` ON A HORIZONTAL WEAPON IS A CALIBRATION CONSTANT, NOT A TIER.** The five weapon
   formulas scale differently, so equal damage needs DIFFERENT `wp` values. Oathblade
   shipped at `wp: 12` in draft — 84 damage *and* +10 Brave, a strict upgrade — and was
   caught by measuring, not by reading. **Re-run the reference-body comparison after any
   weapon edit.**
4. **THE ONBOARDING BET IS UNTESTED AND THE ONLY EVIDENCE THAT COULD SETTLE IT IS A
   PERSON.** "The mechanics read on their own" is a design bet, not a finding. Nobody who
   did not build this has played it. `docs/11` AC-M6 asserts the help panel's *claims* are
   deliverable — it says nothing about whether the game is legible without it. If a
   playtest happens, that is the evidence; until then do not cite the green suite as if it
   settled the question.
5. **A GATE THAT CANNOT SEE A CHANGE GOING GREEN IS NOT EVIDENCE.** Repricing skill trees
   moved nothing in the diversity gate, and that is *structural*: shipped builds in
   `data/builds` author `learned` explicitly, so progression costs never reach a built
   unit. The evidence for ADR-0025 decision 4 is the reachability probe, not the 703
   passing tests. Expect the same blindness for any future progression-economy change.
6. **`ReactionEffectSchema` IS `{kind}` WITH NO MAGNITUDE, AND THAT CONSTRAINS CONTENT.**
   Any cheap `counter` is byte-identical to the 240-AP capstone `counter` and strictly
   dominates it. This is why no second cheap reaction was added anywhere. Same shape for
   `MovementEffectSchema` (`{move}` only): a +1 move ability priced beside the thief's +2
   just loses. **Before authoring a passive, check whether its effect schema can express
   "weaker".** If it cannot, repricing the existing one is the only honest move.
7. **A TEST THAT NAMES THE BUG IT CATCHES IS A CLAIM ABOUT CODE YOU HAVE NOT RUN.** Caught
   again this slice: the cross-job purchase test's comment said it would fail if the panel
   bought from `currentJob`. It did not — it passed the mutation, because it named the node
   by literal id instead of taking it from `learnRows()`. Run the mutation.
8. **`EXPECTED_TREE_SIZES` in `content-pack.test.ts` pins every job's node count.** Adding
   a tree node fails there by design. Move it in the same slice.
9. **`AP_TIERS` is 60/120/240.** A node priced anywhere else fails the pack integrity test.
10. **The help panel is NOT on the story seam, deliberately.** It is UI chrome; swapping the
   story pack must never delete the manual. Do not "consolidate" the two.
11. **The `?` lives in `game.html` only.** `play.spec.ts` asserts `index.html`'s tab order
   exactly; `campaign.spec.ts` does not. Adding a control to the viewer page will break it.
12. Everything the previous handoff listed still holds: **a screen the state machine skips
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

> **These costs are MVP-PROVISIONAL** (user, 2026-08-22). They were set to make the
> chassis reachable inside a 5-battle campaign, not because 120/180 is the right price.
> Expect to re-tune them when the campaign gets longer or the AP grant is revisited.
> **Do not treat them as settled balance** — but do keep `docs/11` AC-M5 satisfied, which
> is the rule underneath them and is NOT provisional.

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
