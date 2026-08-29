<!-- written-against: c6c3bcc37445f51b91114dd75882c680a2f0b9b3-->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive.

---

## THE NEXT SLICE — a person plays it

> **Unchanged by the 2026-08-29 restyle, and worth saying plainly: a prettier screen is
> not onboarding evidence.** The parchment slice measured that the text is *legible*.
> Whether the five-slot chassis is *understandable* is the same open question it was
> before, and the same green suite would show either way.

**Nothing in this repo can settle what is now the top open question, and no code change
should be started before it.** The synthetic playtest finished 2026-08-25. It did the
half an agent can do. The other half is a human being, once.

### What is now known, and by what

| Question | Settled? | By what |
|---|---|---|
| Is the campaign reachable start to finish | yes | `campaign-shell.test.ts`, `e2e/campaign.spec.ts` |
| Does engaging with the prep screen matter | yes | player-policy sweep: never-prep 2/16 seeds, spend-at-home 16/16 |
| Does a newcomer UNDERSTAND the 5-slot chassis | **no** | nothing can. Expert inspection gives hypotheses; reported false-positive rates for it span 5–82% |
| Is 30–45 minutes right, is it too hard, is it fun | **no** | agent skill is not human skill. The numbers are RELATIVE only |

### What to actually do

Give one person who has never seen this a link to the site root and say nothing else.
When they finish or give up, ask them to press **Copy playtest log** on the title or
ending screen and paste it back. That log is `docs/plans/slice-m1-synthetic-playtest.md`
step B2, and it exists precisely so this conversation produces data.

**Read `stoppedAt` first.** Then `timeToFirstActionMs` for `BRIEFING` — a large number
there is the chassis being illegible, which is the open bet. Then `prepChanges`: an empty
object means they never touched the progression systems at all, which the campaign is now
tuned to punish (ADR-0027).

`summarize()` in `src/render/telemetry.ts` folds a pasted log into those numbers. It is
exported and tested; nothing on the page calls it yet, which is fine — it is for whoever
reads the log.

### Do not, before that happens

- Do not tune difficulty. The only difficulty evidence is relative, and one real session
  can invalidate a slice's worth of guessing.
- Do not add telemetry rows on speculation. The funnel is untested against a real human;
  what is missing will be obvious after one paste and is guesswork before it.
- Do not treat the green suite as onboarding evidence. `docs/11` AC-M6 asserts the help
  panel's CLAIMS are deliverable. It says nothing about whether the game reads on its own.

---

## LANDED 2026-08-29 — the campaign is on parchment, and contrast is measured

`index.html` only. Aged parchment sheets on a dark table: golden-tan wash, fine grain,
staining held to the margins, a scorched rim and a double gold rule inside it. Three
faces — Grenze Gotisch for names, Cinzel small-caps for labels, EB Garamond for prose —
**self-hosted**, five woff2 subsets, 104 KB in `public/fonts/`. Primary actions are a
wax-seal red. **The battle board stays dark**; its two side panels are parchment.
`viewer.html` keeps its instrument look. Full rationale in **ADR-0028**.

**The load-bearing half is the instrument, not the look.** Two new browser specs:

| Spec | Carries | Does NOT carry |
|---|---|---|
| `e2e/a11y.spec.ts` | axe-core over five screens: names, ARIA, labels, focus | contrast — the rule is **explicitly disabled** |
| `e2e/contrast.spec.ts` | WCAG AA against both extreme stops of every sheet's gradient | anything about whether a screen is understandable |

**Why axe cannot carry contrast here, and why that matters more than the palette.** On
the briefing screen axe evaluated **2 nodes, returned 106 as "incomplete", and reported
zero violations** — a pass indistinguishable from the one an unreadable page gives. It
declines to judge a background it cannot flatten, and every parchment surface is a
gradient under two noise layers. `a11y.spec.ts` now calls `.disableRules(["color-contrast"])`
and says why in a comment; `contrast.spec.ts` computes the ratios itself. This is
**AC-V15** in `docs/10` (authoritative).

**It found three real defects in its first run, two of them pre-existing:**

| Defect | Was |
|---|---|
| Gold small-caps labels on tan — my own new design | **1.55:1**. My design note had called them "near the accessibility floor" |
| `viewer.html`'s faintest ink, 45 nodes, shipped since P1 | 3.87:1 → `--ink-faint` #6d7791 → #8b98b0 |
| The help panel's scrolling region, since ADR-0025 | unreachable by keyboard → `tabindex="0"` |

**Every ink token is now downstream of a measurement**, not of how it looked. Gold as
*text* became `--accent-ink: #5f4210`; `--accent` is rules and borders only. Six mutations
were run and all were caught, including one that reverts the palette and one that stales
the declared grounds.

**The trap this sets:** the scorch is sized in **pixels** (`--burn`, `--burn-spread`,
`--burn-jitter`) precisely so "no text sits on burnt ground" is checkable. **Changing a
sheet's padding without changing the burn breaks the design's contrast argument** — the
test asserts padding clears the band, and the mobile breakpoint scales both together.

Frames: `docs/visual/parchment/`. What they do not show is in that folder's README.

---

## LANDED 2026-08-25 — the game is the landing page

`/` is now the campaign. The engine viewer moved to `/viewer.html`, and `/game.html` is a
redirect stub kept alive because that path was public (`README.md` linked it). Three
routes, all three declared in `vite.config.ts` — **a page missing from `rollupOptions.input`
works under `npm run dev` and does not exist in `dist`.**

New **AC-V14** in `docs/10` and `e2e/routes.spec.ts`. The load-bearing part is not "both
pages load": two rollup entries pointed at one file would serve identical HTML at both
paths and pass that. The test asserts the two install **different seams**
(`window.tuhGame` vs `window.tuh`), and checks the redirect in two halves — the fetched
document is not blank and carries a link (all a reader with scripting off gets), and
following it lands on the title screen. Four mutations run, all caught.

The viewer's exact tab-order assertion survived — its first stop is still the "Play the
campaign" link, only the `href` moved. **Verified, not assumed.**

Dated plan files under `docs/plans/` still name the old paths. Those are records of what
was true when written and were deliberately left alone.

---

## LANDED 2026-08-25 — the playtest log (slice Part B)

`src/render/telemetry.ts` + the wiring in `game.ts` + a "Copy playtest log" control on the
title and ending screens. A per-session funnel in `localStorage` under `tuh.playtest.v1`:
screens with dwell and time-to-first-action, every named action, per-battle
outcome/attempt/turns read off the banked `RunReport`, between-battle record edits, and
where the player stopped. No backend, no network, no personal data; times are milliseconds
since the log started, never absolute.

**Two things carry the claims, and both are the reason to trust the file:**

1. **`telemetry.ts` holds NO VALUE IMPORTS.** Every import is `import type`, erased at
   build, so after compilation there is nothing in the game it is *able* to call. That
   makes "read-only over the session" a fact about the build, not a docstring promise, and
   it is why wall-clock provably cannot reach `BattleState`. `telemetry.test.ts` asserts
   it — and mutation-tests its own regex first.
2. **The wiring is proved by an A/B in the browser.** One visit to the game page that does
   nothing, against one that plays a battle, asserting rows present only in the second. A
   perfect unreferenced module reads exactly like a working one.

Eleven mutations were run across the two commits and all were caught. One is worth
carrying forward as a lesson and is already in the root `CLAUDE.md`'s spirit: **the first
version of the "last screen gets no dwell" mutation stayed GREEN**, because the fixture
ended on that screen with nothing after it — 0 under the right rule and the wrong one
alike. The fixture now ends 9 seconds *after* arriving there.

---

## LANDED 2026-08-24 — the playtest harness, and what it found

`src/render/playtest.ts` + `scripts/playtest.mts` (A1–A4). Three deterministic player
policies driven through the real shell over a seed sweep.

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

**The panel warns about it before the click** (same ADR): `LearnRow.reach` says where an
ability would land for this unit, and a row that needs the one Secondary slot renders a
**needs Secondary** tag. Plus a "Where to spend AP" help topic, a rewritten learn-list
hint, and a correction to "Losing a battle", which implied a retry was a fresh chance — it
is not, the retry is bit-identical.

`docs/11` AC-M1 was amended to name the player it assumes: an ending is reachable **by a
player who uses the prep screen**. The zero-engagement path deliberately no longer
finishes, and `campaign-run.test.ts` (which has no prep concept) now asserts exactly that
profile.

---

## Where things stand

**M0 IS BUILT — all seven items (`docs/11` §3).** 809 tests / 41 files, 39 Playwright
specs. Variety score (distinct viable build identities) still **7** against a release bar
of **8**, carried into M1 by user decision.

**What "built" does and does not mean.** Every M0 ITEM is shipped and tested. M0's
definition of done is "a stranger plays 30–45 minutes without being told anything and
reaches a real ending" — and **that is untested. No stranger has played this.** The
measurable half is now taken (see the two LANDED sections). The instrument for the other
half is shipped and waiting; what it needs is a person.

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

## Other candidates — AFTER the playtest, or if the user rejects waiting for one

1. **M1: the variety score, 7 → 8** (`docs/06` AC-E2). The untried lever is **gear**: all
   15 reference builds still carry `weapon: null`, so equipment is a diversity axis the
   gate has never used. Expect a plateau, not a peak.
2. **M1: the AP grant shape** (ADR-0012) — a healer who only heals banks nothing.

---

## Traps waiting for you

0. **AN ANALYZER THAT DECLINES TO CHECK STILL SAYS PASS.** axe-core files an
   unflattenable background as `incomplete`, not as a violation, so it reported zero
   problems while measuring 2 of 108 nodes. Before trusting any scanner, **assert how
   many things it looked at**. `a11y.spec.ts` does (`results.passes.length`), and it
   disables the one rule it cannot honour rather than banking that rule's green.
0. **THE SHEET'S PADDING AND THE SCORCH ARE COUPLED.** `--burn + --burn-spread +
   --burn-jitter` is the depth the burn reaches; `.card`/`.panel` padding must clear it,
   and `contrast.spec.ts` asserts that. Shrink the padding for a layout tweak and you
   put text on ground whose colour nothing modelled.
0. **`--accent` IS RULES AND BORDERS ONLY.** Gold leaf as *text* on parchment measures
   1.55:1. New gold text takes `--accent-ink`.
0. **PUBLISHING ANY BRANCH BUT THE SESSION'S DESIGNATED ONE IS NOW BLOCKED.**
   `.claude/hooks/guard-designated-branch.sh` compares the target against the branch
   recorded at SessionStart. If it fires, you have invented a branch name — use the
   recorded one, including for follow-up after its PR merged (same name, reset from
   `main`). Deletions pass; a missing record fails open. Fixtures live beside it in
   `guard-designated-branch.test.sh` — **run them after any edit**, and note that the
   two that matter are heredoc-shaped, because every single-line fixture passed while
   the real command failed.
0. **A CAPTURED FRAME'S FILENAME IS AN ASSERTION, AND IS NOW CHECKED.** `shot()` in
   `e2e/playtest-capture.spec.ts` takes the `data-testid` the frame must show and asserts
   it before the screenshot. That guard exists because the set shipped a `09-ending.png`
   showing "Battle lost" for as long as ADR-0027 had been making an unprepped party lose
   the finale, with nothing red. When you add a frame, name the state it must be in.
0. **`telemetry.ts` MUST KEEP ITS TYPE-ONLY IMPORTS.** That single property is the whole
   "the playtest log cannot touch the game" guarantee — after erasure there is nothing in
   it that is *able* to call the shell, the session or the sim. Adding one value import,
   even a helper from `storage.ts`, turns `telemetry.test.ts` red, and that red is the
   file telling you the claim just stopped being true. Feed the recorder scalars and
   copies; never hand it a live object it could keep.
1. **A STALE `dist` FAILS A BROWSER TEST THAT IS ACTUALLY FINE — AND NOW SAYS SO.**
   `npx playwright test` does NOT rebuild; `npm run test:visual` does. The variant that
   cost this session real time is worse, because it does not look like a build problem:
   a **failed** `npm run build` leaves the previous `dist` standing, so the suite measures
   the OLD page and reports numbers that are plausible and wrong.
   `e2e/fresh-build.spec.ts` now fails loudly when `dist` is older than any watched source.
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
12. **`play.spec.ts` ASSERTS THE VIEWER'S TAB ORDER EXACTLY**, and its first stop is the
   "Play the campaign" link. `campaign.spec.ts` asserts no tab order. Adding a focusable
   control to `viewer.html` before the board breaks it; adding one to the game page does
   not. The `?` help button lives on the game page only.
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
- **After a merge the remote branch is DELETED, so `--force-with-lease` fails with
  "stale info" on the next slice.** The local remote-tracking ref still points at the
  merged tip while the branch is gone. `git remote prune origin`, then push normally —
  there is nothing to force. Do **not** reach for a bare `--force`.
- **Google Fonts is reachable through the proxy; self-hosting a face is cheap.** Fetch
  `https://fonts.googleapis.com/css2?family=...` with a **browser User-Agent** (the
  default UA gets a TTF-era stylesheet with no woff2), then take the `@font-face` block
  whose `unicode-range` contains `U+0000-00FF` — that is the latin subset. Five faces
  came to 104 KB. They live in `public/fonts/`, referenced **relatively** (`./fonts/…`)
  so they survive the Pages base path.
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
