<!-- written-against: 4635b44f871221b1a5fbf2c8052c334d008fe3e9 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive.

---

## DONE — the synthetic playtest (landed 2026-08-24)

**Green-lit by the user, 2026-08-23. Full scope: `docs/plans/slice-m1-synthetic-playtest.md`.**
Start there; this section is the why and the shape, the plan file is the work.

**In one line.** Build a deterministic agent playtest that settles *difficulty and length*,
and instrument the page so the first human playtest produces data instead of an anecdote.
**It does not settle legibility — nothing but a person can.**

### Why it is this and not "wait for a playtest"

The previous handoff said the next thing this project needs is a playtest, not a slice.
That is true for **one** of the two open M0 bets, not both — and treating the whole
question as blocked cost us the half that is measurable:

| Open bet | Agent-settleable? | Why |
|---|---|---|
| Session length + difficulty | **Largely yes** | Agent playthrough performance tracks human difficulty *ratings* even when raw skill differs; agent-driven QA is established for coverage and bug-finding. |
| Legibility (does a newcomer understand the chassis) | **No** | Expert inspection yields hypotheses, not evidence. Reported cognitive-walkthrough false-positive rates span 5–82%. |

We already spent a slice on the second (`docs/plans/learnability-walkthrough-2026-08-23.md`)
and got four real fixes. Nothing is left there that is not a person.

### The shape

- **Part A — `src/render/playtest.ts`** (moved from `src/sim` 2026-08-24; the shell it
  drives is render-layer)**.** A `Persona` is a deterministic policy over the
  decisions a *player* makes **between fights**: who deploys, what to buy, which job and
  slots, which owned weapon. **Not tactics** — `ai.ts` owns those and keeps owning them.
  Three personas (`naive` / `default` / `optimizer`), driven through the real
  `CampaignShell` over a memory slot, swept over seeds.
- **Part B — `src/render/telemetry.ts`.** A per-session funnel (time to first action,
  per-battle outcome and retries, what was bought/equipped, **where they stopped**) in
  `localStorage`, plus a "copy playtest log" button. No backend, no network, no PII.

### The two assertions that make Part A evidence rather than a number

1. **The three personas must be shown to SEPARATE.** If `naive` and `optimizer` clear the
   campaign identically, the meta systems do not matter — and that is the headline
   finding, not a broken harness.
2. **A persona's choices must reach the BUILT UNIT.** Run with the purchases applied and
   withheld; assert the reports differ. A policy that computes a plan and never applies it
   reads exactly like one that works — the dead-support-slot shape.

### Order, and the gate in the middle

`A1` personas → `A2` runner + seed sweep → `A3` the two assertions → **`A4` report the
numbers to the user before starting Part B** → `B1` recorder → `B2` copy-log control +
a reload test → retrospective, this file re-stamped, `npm run state` last.

**A4 is a real gate, not a formality.** If the personas do not separate, instrumenting a
funnel through systems that do not matter is the wrong next move.

### What the slice may NOT claim when it lands

Write this into the PR body, not just the code: it establishes **relative** difficulty and
a length proxy. It does **not** establish legibility, absolute difficulty ("60% of humans
would win this"), or fun. Do not cite a green suite as if it had.

### Landmines specific to this slice

1. **The probe plays the PLAYER's units too.** Persona differences reach the outcome only
   through the **build**, never through tactics. A player who would have positioned more
   carefully cannot be modelled. This bounds what Part A can ever say — state it in the
   report, do not let a reader infer otherwise.
2. **A flat result is a FINDING.** If difficulty does not rise across the five battles,
   that is the answer. Do not tune the harness until it produces a curve — that is
   calibrating to the metric.
3. **Determinism does NOT cover this file for free** (corrected 2026-08-24). The harness
   lives at **`src/render/playtest.ts`**, not `src/sim` — `CampaignShell` and `PrepModel`
   are render-layer, and sim must not import render. `check:rng` scans `src/sim` only, so
   add a second scan of the file itself (see the plan's Determinism section).
   Persona choices must be pure functions of save state or draw from the seeded PRNG.
   `src/render/telemetry.ts` may use wall-clock (the `iso.ts` animation precedent) but
   **nothing derived from it may enter `BattleState`**, and telemetry must stay read-only
   over the session — it observes, it never feeds back.
4. **Session length is a PROXY.** Decision count → minutes needs a seconds-per-decision
   constant. Mark it MVP-provisional like every other number in ADR-0025/0026, and let
   Part B's wall-clock replace it later.

---

## LANDED 2026-08-24 — the playtest harness, and what it found

`src/render/playtest.ts` + `scripts/playtest.mts` (A1–A4 of the slice below). Three
deterministic player policies driven through the real shell over a seed sweep.

**It found the campaign was winnable with zero engagement** — a party that never opened the
prep screen cleared all five battles at every seed with 966 AP unspent and every chassis
slot empty. Fixed by **ADR-0027**: `foe-warchief`'s Physical Attack 8 → 11, one field, one
record, the finale only. Measured at 16 seeds afterwards:

| player policy | clears |
|---|---|
| never opens the prep screen | 2/16 |
| buys the cheapest node anywhere in the pack | 8/16 |
| buys into the member's **own job tree** | 16/16 |

**The headline is the third row, not the first.** Spending at home wins; scattering AP
across whatever is cheapest loses.

**The panel now warns about it before the click** (same ADR): `LearnRow.reach` says where an
ability would land for this unit, and a row that needs the one Secondary slot renders a
**needs Secondary** tag. Plus a "Where to spend AP" help topic, a rewritten learn-list hint
(the old one read as an invitation to do the losing thing), and a correction to "Losing a
battle", which implied a retry was a fresh chance — it is not, the retry is bit-identical.

**What is still open: whether a newcomer READS it.** Only a person can settle that. What is
asserted is that the warning is produced by the shipped content, names the right rows, and
agrees with the real command projection.

`docs/11` AC-M1 was amended to name the player it assumes: an ending is reachable **by a
player who uses the prep screen**. The zero-engagement path deliberately no longer finishes,
and `campaign-run.test.ts` (which has no prep concept) now asserts exactly that profile.

**Part B landed the same day.** `src/render/telemetry.ts` records a per-session funnel in
`localStorage` — screen dwell, time to first action, per-battle outcome/attempt/turns, what
was bought and equipped, and **where they stopped** — with a "Copy playtest log" control on
the title and ending screens. No backend, no network, no personal data.

**The slice is complete. What it was built FOR has not happened: nobody has played this.**
The funnel is worth exactly one real playtester and nothing until then.

---

## Where things stand

**M0 IS BUILT — all seven items (`docs/11` §3).** 752 tests / 39 files, 23 Playwright
specs. Variety score (distinct viable build identities) still **7** against a release bar
of **8**, carried into M1 by user decision.

**What "built" does and does not mean.** Every M0 ITEM is shipped and tested. M0's
definition of done is "a stranger plays 30–45 minutes without being told anything and
reaches a real ending" — and **that is untested. No stranger has played this.** The slice
above takes the measurable half of that; the other half still needs a person.

**Equipment landed 2026-08-22 (ADR-0026)**, the last item:

- `UnitRecord.weapon` — an ID, not an inlined weapon (`rosterSchemaVersion` 3, migration
  writes `null` = the old placeholder, so migrated saves fight identically).
- 8 horizontal weapons in `data/base-pack.json`. **No weapon out-damages the baseline**;
  they trade formula, element, accuracy, evasion, Brave/Faith.
- `CampaignBattle.grants` → a **set-valued** `CampaignSave.inventory`. Replaying a battle
  grants nothing new — the anti-grind invariant, asserted and mutation-verified.

**The balance numbers across ADR-0025 and ADR-0026 are MVP-PROVISIONAL** (user,
2026-08-22): node costs, prereq chains and weapon stats exist to make M0 work, not because
they are right. The RULES under them are not provisional — `docs/11` AC-M5 (every slot
reachable) and AC-M7 (gear is horizontal and authored).

**Vance starts as a GEOMANCER** (user decision, 2026-08-23), not a Knight. His tree went
2-of-9 live to 7-of-9; he keeps `mastered: ["knight"]` so the Bulwark trait still applies.
`battle-skill` stays excluded — that decision is untouched, the party simply no longer
depends on it. Ottoline is the weakest at 5/9 and was **left alone** deliberately: her
four dead nodes are deferred capstones behind a real Cure → Cura → Holy progression.

**The three `CLAUDE.md` files were compressed 2026-08-23** (root 6,005 → 3,815 words; the
two subtree files restructured). Every rule survives; the war stories were cut to one
identifying clause each. If a rule now reads too terse to act on, the full incident is in
the git history of that file — do not re-expand it in place.

---

## THE NEXT SLICE — a person plays it

**Everything the harness can settle is settled. The next thing this project needs is not
a slice: it is one human being playing the game for forty minutes.**

Two open bets, and only one of them is still measurable by anything here:

| Bet | Status |
|---|---|
| Difficulty and length | **Measured** (ADR-0027). A player who ignores the prep screen loses the finale 14 times in 16; one who spends on their own job's tree clears every seed. |
| Legibility — does a newcomer understand any of it | **Untouched, and no agent can touch it.** |

What to do with the next playtester, in order:

1. Send them to `/game.html` cold. Say nothing. Do not explain the prep screen.
2. Let them finish or quit — **quitting is the result**, not a failed session.
3. Ask them to click **Copy playtest log** on the title or ending screen and paste it back.
4. Read `stoppedOn` first, then `screens[].toFirstActionMs` for any screen that is `null`.

**The three things most likely to go wrong, all unfixed:**

1. **A lost finale cannot be recovered.** A loss banks no AP and the retry is bit-identical,
   so the only way to win is to have played the earlier battles differently — and nothing
   in the game says so. This is the single most likely thing to end a playtest badly.
2. **Nothing teaches "spend on your own job".** The panel now marks another job's actions
   `needs Secondary` and the help panel has a topic, but whether anyone reads either is
   exactly the question.
3. **Nobody has ever seen the deployed page render.** The sandbox cannot load
   `*.github.io`; only the deployment API's success is confirmed.

**Not green-lit:** more balance tuning off agent numbers. ADR-0027 moved one field on
measured evidence and stopped there deliberately. The next tuning decision should follow a
person, not another sweep.

---

## Other candidates, if the slice above is finished or rejected

1. **M1: the variety score, 7 → 8** (`docs/06` AC-E2). The untried lever is **gear**: all
   15 reference builds still carry `weapon: null`, so equipment is a diversity axis the
   gate has never used. Expect a plateau, not a peak.
2. **M1: the AP grant shape** (ADR-0012) — a healer who only heals banks nothing.
3. Cheap filler: make `game.html` the landing page (still a rewrite of twelve browser
   specs' navigation).

---

## Traps waiting for you

1. **A STALE `dist` FAILS A BROWSER TEST THAT IS ACTUALLY FINE.** `npx playwright test`
   does NOT rebuild; `npm run test:visual` does. Rebuild before believing a browser
   failure.
2. **GEAR IS A DIVERSITY AXIS THE GATE DOES NOT USE.** `data/builds/*` all carry
   `weapon: null`, so the 7 is measured with every build on the same placeholder weapon.
   "The gate did not move" is a statement about COVERAGE here, not quality.
3. **`wp` ON A HORIZONTAL WEAPON IS A CALIBRATION CONSTANT, NOT A TIER.** The five weapon
   formulas scale differently, so equal damage needs DIFFERENT `wp` values. Oathblade
   shipped at `wp: 12` in draft — a strict upgrade — and was caught by measuring, not by
   reading. **Re-run the reference-body comparison after any weapon edit.**
4. **THE ONBOARDING BET IS UNTESTED AND ONLY A PERSON CAN SETTLE IT.** `docs/11` AC-M6
   asserts the help panel's *claims* are deliverable — it says nothing about whether the
   game is legible without it. Do not cite the green suite as if it settled the question.
5. **A GATE THAT CANNOT SEE A CHANGE GOING GREEN IS NOT EVIDENCE.** Repricing skill trees
   moved nothing in the diversity gate, and that is *structural*: shipped builds in
   `data/builds` author `learned` explicitly, so progression costs never reach a built
   unit. Expect the same blindness for any future progression-economy change.
6. **`ReactionEffectSchema` IS `{kind}` WITH NO MAGNITUDE, AND THAT CONSTRAINS CONTENT.**
   Any cheap `counter` is byte-identical to the 240-AP capstone `counter` and strictly
   dominates it. Same shape for `MovementEffectSchema` (`{move}` only). **Before authoring
   a passive, check whether its effect schema can express "weaker".**
7. **A TEST THAT NAMES THE BUG IT CATCHES IS A CLAIM ABOUT CODE YOU HAVE NOT RUN.** Run
   the mutation. Caught twice now.
8. **PROSE IN THE FUTURE TENSE ROTS SILENTLY, AND NOTHING GOES RED.** Found this session:
   `ASSUMED_FUTURE_TURN_COST`'s docstring said the −80 guess "is currently harmless only
   because `ai.ts` still emits single sub-phases" and named the move+act fold as a *future*
   slice's problem. The fold landed months ago. Nothing failed — correctly, because the
   code was fine — so the comment kept reading as pending work. **When you land the thing
   a comment predicted, grep for the prediction.**
9. **`EXPECTED_TREE_SIZES` in `content-pack.test.ts` pins every job's node count.** Adding
   a tree node fails there by design. Move it in the same slice.
10. **`AP_TIERS` is 60/120/240.** A node priced anywhere else fails the pack integrity test.
11. **The help panel is NOT on the story seam, deliberately.** It is UI chrome; swapping
   the story pack must never delete the manual. Do not "consolidate" the two.
12. **The `?` lives in `game.html` only.** `play.spec.ts` asserts `index.html`'s tab order
   exactly; `campaign.spec.ts` does not. Adding a control to the viewer page breaks it.
13. Everything the previous handoff listed still holds: **a screen the state machine skips
   has content nobody can reach**; **a sim docstring that delegates a rule to "the caller"
   is an obligation nobody is told about**; **the prep panel is mounted ONCE and
   re-pointed** (`setRecords` no-ops deliberately — panel state lives in `PrepModel`, not
   the DOM); **`onChange` → `updateParty` → `renderBriefingText()`, not `refresh()`**;
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

---

## Measured facts (re-derive rather than trust, but these were probed)

> **These costs are MVP-PROVISIONAL** (user, 2026-08-22). They were set to make the
> chassis reachable inside a 5-battle campaign, not because 120/180 is the right price.
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

### Still-live engine facts

- **AC-E6 is REACHABILITY, not balance.** All five *benchmark* encounters end in defeat for
  team 0 as authored; that is why the campaign is purpose-built content.
- **A mobility, reach or range grant is not automatically a buff** (ADR-0020).
- **An aggregate A/B can read "identical" while a third of the rows moved.**
- **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice**; `punch-art.`
  has TWO carriers; `bld-cutpurse` sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).
- **Hamedo draws the hit roll it then discards** (ADR-0019 decision 5) — deliberate.
- **The MP contingency is live:** `white-magic.holy` and `summon.*` ride unenforced MP.
- **`battle-skill` is still excluded by user decision** (2026-08-16). Vance's Knight
  *actions* are all still inert; he has no live Knight action in the whole campaign. The
  Geomancer switch made that stop mattering — it did not fix it.
- **`compareCandidate` is the most load-bearing function in the repo.**
- **The forecast's −80 future-turn guess is now wrong for every AI turn** (they fold at
  −100), and that is fine: the exact/projected boundary is derived at the cheapest turn
  (−60) and does not depend on the guess. Whether −80 is still the best *projection* is
  open **tuning**, not correctness — a player who only moves or only acts still realises
  −80. `forecast.test.ts` asserts the boundary under both cost models.
- **The frozen golden is a tripwire, not a maintenance item.**

---

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

---

## Pages — RESOLVED 2026-08-12 (first successful deploy on run #23)

`pages.yml` was always correct; runs #1–#22 failed on two sequential *settings*, both
derived from the repository default branch. Two preflights now guard the `build` job, the
second because the first is not sufficient. **An agent can confirm the deployment API
reported success but cannot confirm the page renders** — `*.github.io` is blocked. Nobody
in this sandbox has seen the shipped shell render.
