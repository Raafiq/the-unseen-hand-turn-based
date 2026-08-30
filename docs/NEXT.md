<!-- written-against: 155dd7b -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive.

---

## THE NEXT SLICE — visual identity, while the playtest waits

**Owner decision, 2026-08-30.** Three things moved:

1. **The human playtest is DELAYED, not dropped.** It is still the top open question and
   still the only thing that can answer it. It is now a **standing reminder** — see the
   section below — not the gate on the next slice.
2. **Look and feel comes before combat.** The next slices are **visual**. Do not open a
   balance, ability, encounter or scheduler slice unless the owner asks.
3. **The variety score (7 → 8) is OFF the priority list.** Not weakened, not relitigated:
   `DIVERSITY_TARGET_N` stays 7, `docs/06` AC-E2's release bar stays ≥ 8, the gate still
   fails CI on a drop. It is simply not what to work on. Leave `docs/06`, `docs/08` §1a
   and `docs/11` §3 exactly as they read.

### The visual work, in order

**Before writing any stylesheet or renderer, get a reference or put rendered options in
front of the owner.** Proven twice now. The parchment slice was rebuilt from a description
twice before one image settled it. And the FIRST battle-map pitch — three re-colourings of
the existing board — was rejected outright with the actual diagnosis: *"actual grounds
instead of this blocky generic"*. **Final Fantasy Tactics draws no grid on the ground**;
that one fact was the whole fault, and no amount of palette work would have found it.

| # | Slice | State | The catch |
|---|---|---|---|
| 1 | **Painted ground on the battle map** — textured grass, worn dirt, cut rock, water, props, no grid. | **LANDED 2026-08-30** (ADR-0030, AC-V18/V19), all five battles. | See the traps below. The engine demo page still draws the flat look, and that is what keeps AC-V18's A/B possible — do not paint it. |
| 2 | **Paint the other four battles.** | **LANDED 2026-08-30** — all five painted. | Coverage is now bidirectional: a sixth battle cannot ship unpainted, and a map keyed to a renamed battle fails. Props are kept off unit start tiles by a guard. |
| 3 | **Unit presentation.** Still flat kite tokens with a facing pip. | **DEFERRED by the owner, 2026-08-30** | Deliberately bundled with **portrait art**: the owner will decide the token when they hand over the portrait reference images. Three treatments are drawn (kite / heraldic shield / standing figure). Do not pick one under cover of another slice, and do not ask again before the references arrive. |
| 4 | **Motion and feedback** — hit reactions, turn transitions. | popups exist, nothing else | Any timing source stays out of `src/sim`. The scene player's untimed reveal is load-bearing (AC-V16) — do not add motion there without rewriting those assertions. |

**Two rules bind every one of these.**

- **The suite cannot see the screen.** Three defects in the slice just landed were found
  only by opening a PNG, with the whole suite green. **Open `visual-artifacts/playtest/`
  after any change to a screen** — the trap named "THE SUITE STILL CANNOT SEE THE SCREEN".
- **Contrast is measured, not eyeballed** — but only for DOM text. `contrast.spec.ts`
  cannot see the canvas at all, so nothing measures the battle map's legibility. The traps
  named "`--accent` IS RULES AND BORDERS ONLY", "THE SHEET'S PADDING AND THE SCORCH ARE
  COUPLED", "THE CONTRAST FLOOR IS NOW 100" and "AN ANALYZER THAT DECLINES TO CHECK STILL
  SAYS PASS" each cover a way a *sheet* change goes quietly wrong.

---

## LANDED 2026-08-30 — the ground is painted (ADR-0030)

The battle map paints real terrain: textured surfaces, side faces cut only where the
ground drops, props, open sky, and **no grid line on the ground**. Direction chosen from
three rendered options ("Daylight field"); four scoping questions answered by the owner.

| Piece | Where |
|---|---|
| Kinds, parser, `DAYLIGHT` palette, per-tile noise | `src/render/terrain.ts` (no canvas — testable without a DOM) |
| Painting, prop drawing, the camera | `src/render/iso.ts` — `DrawOptions.terrain`, `FIELD_THEME`, `viewFor` |
| Battle 1's authored ground | `TERRAIN` in `src/render/campaign-data.ts` |
| The wiring | `renderBattle()` in `game.ts` — terrain and theme move together |

**Owner decisions this slice, all four explicit:** terrain is **paint only** (no
`BattleState` change); authored as **a grid per battle**; **one battle first**; and the
drawn-in-code look is **the destination**, not a placeholder for art.

### Traps this slice bought

0. **THE CAMPAIGN MAPS ARE FLAT — ALL FIVE.** No height anywhere, no blocked tiles.
   Every cliff and plateau in the mockups is absent from the real game and painted ground
   cannot supply them. Giving a map relief changes evasion and reach, so it is a **rules
   change**, not a visual one. **Owner decision, 2026-08-30: parked until terrain rules are
   taken up**, at which point relief and "water you cannot cross" are one slice, not two.
0. **TERRAIN IS A LIE THE RENDERER TELLS.** A painted pond is walkable, because `passable`
   is the sim's answer and the sim was not asked. Written down in `terrain.ts`,
   `campaign-data.ts` and AC-V18 — keep all three in step. The day water blocks movement it
   becomes a `Tile` field with a schema bump, **never** a second opinion in `src/render`.
0. **`viewFor` IS ON THE CLICK PATH.** `draw` and `pickTile` share the camera the way they
   already share `paintOrder`. A zoom applied to the painting and not the inverse offsets
   every click by a constant factor — it does not fail, it just misses. `originFor` now
   returns a **world** origin; a screen point is `project(...) * scale`. `e2e/play.spec.ts`
   and `iso.test.ts` both convert, and AC-V19's discriminator is that the *unscaled* point
   lands on a different tile.
0. **NOTHING STANDING IS OCCLUDED BY TERRAIN.** Props and units draw in a second pass over
   the finished ground, because drawing a tree inside the painter's walk let the next tile
   paint over its canopy — on a flat map, every prop. The opposite error is now live: a
   unit behind a tall cliff would show through. Harmless while the maps are flat.
0. **FOLIAGE MUST NOT BE THE GROUND'S OWN GREEN.** A canopy in the grass colour is
   invisible everywhere except against the sky, which is the edge of the map.
   `terrain.test.ts` asserts `DAYLIGHT.leaf !== surfaces.grass.base`.
0. **A LIGHT RANGE PANEL DESATURATES TO GREY OVER GRASS.** `FIELD_THEME.highlight` is a
   deep blue at moderate alpha for that reason; the first pale-blue attempt read as
   concrete slabs laid on the field. Blue is the one channel a green-and-earth field
   leaves free, which is also why FFT uses it.
0. **THE UNIT TOKEN IS UNDECIDED.** Still the flat kite. Do not change it inside another
   slice — three options were drawn and the owner has not picked. Bundled with the portrait
   references (see the table above).
0. **A MAP CAN ONLY LOOK LIKE WHAT THE GRID ALLOWS.** "The Broken Span" reads as a wooden
   platform, not a span over anything, because there is nothing to span; the ford's river
   is crossable everywhere because the sim was never told there is a river. Both are the
   flat-map limit, not authoring. Do not try to paint around it.
0. **`visual-artifacts/playtest/map-battle-{1..5}.png` ARE THE ONLY VIEW OF THE MAPS.**
   `playtest-capture.spec.ts` shoots the canvas alone for each battle. Nothing in the suite
   can see a canvas, so after any change to `iso.ts`, `terrain.ts` or a `TERRAIN` entry,
   open all five.
0. **`git checkout` CANNOT RESTORE AN UNTRACKED FILE, AND A MUTATION VERDICT FROM A FAILED
   BUILD IS NOT A VERDICT.** Both still bite. Every mutation this slice was gated on
   `npm run typecheck` passing, and `iso.ts` was copied aside rather than checked out —
   a `git checkout` there would have reverted the entire slice, not the mutation.

---

## STANDING REMINDER — one person still has to play it

**Deferred by the owner on 2026-08-30, expected to be a while. Do not delete this section
and do not let a prettier screen read as an answer to it.** A better-looking game is not a
more legible one; that is the same claim the parchment slice had to make about itself.

Nothing in the repo can settle whether a newcomer understands this game. Every automated
run drives the balance probe or a deliberate forfeit, so "completable" means *reachable* —
never difficulty, pacing or fun.

**When a human is available:** give them a link to the site root and say nothing else. When
they finish or give up, ask them to press **Copy playtest log** on the title or ending
screen and paste it back.

**Read `stoppedAt` first.** Then `timeToFirstActionMs` for `BRIEFING` — a large number
there is the 5-slot ability chassis being illegible, which is the open bet. Then
`prepChanges`: an empty object means they never touched the progression systems, which the
campaign is now tuned to punish (ADR-0027). `SCENE` rows and `*-story-more` /
`*-story-all` actions show **whether they read the scenes or skipped them** — a curiosity,
not a finding, until more than one person has played.

`summarize()` in `src/render/telemetry.ts` folds a pasted log into those numbers.

**Still blocked on that session, and on nothing else:** difficulty, pacing, session length,
and whether the chassis teaches itself. Do not tune any of them from agent play.

| Question | Settled? | By what |
|---|---|---|
| Is the campaign reachable start to finish | yes | `campaign-shell.test.ts`, `e2e/campaign.spec.ts` |
| Does engaging with the prep screen matter | yes | player-policy sweep: never-prep 2/16 seeds, spend-at-home 16/16 |
| Do story scenes render, advance and persist | yes | AC-V16, AC-V17 — and the frames were opened, not just green |
| Does a newcomer UNDERSTAND the 5-slot chassis | **no** | nothing can. Expert inspection gives hypotheses |
| Is 30–45 minutes right, is it too hard, is it fun | **no** | agent skill is not human skill. The numbers are RELATIVE only |

---

## LANDED 2026-08-29 — story v2 and the scene player

Seven commits, ADR-0029. Story text is now read a line at a time beside a portrait frame,
and three scenes belong to no battle at all.

| Piece | Where |
|---|---|
| Schema v2 — per-line speakers, a `characters` registry, standalone scenes | `src/sim/story.ts` |
| Save v3 → v4 — `scenesSeen` | `src/sim/campaign.ts` |
| The player — a pure `SceneModel` plus `mountScene` | `src/render/scene.ts` |
| The `SCENE` screen and `arrive()` | `src/render/campaign-shell.ts`, `game.ts` |
| Prologue, one interlude, epilogue | `data/campaign/story/*.story.json` |
| The portrait seam and its placeholder | `campaign-data.ts`, `data/campaign/story/portraits/` |

**Presentation was chosen from rendered mockups, not from a description** — three options
in front of the owner before a stylesheet was written. B (a textbox over the sheet) now;
C (a full cinematic screen) deferred until portrait art exists, and the schema is
identical across both, so that switch is a rewrite of `mountScene`'s DOM and nothing else.

---

## Traps waiting for you

0. **A MUTATION VERDICT FROM A FAILED BUILD IS NOT A VERDICT.** The decisive mutation of
   this slice — deleting the scene player's re-entrancy guard — reported **SURVIVED**. It
   had not survived: the mutant failed `tsc`, `npm run build` failed, `dist` kept the
   previous good bundle, and Playwright measured the OLD page. Rewritten to be type-valid,
   it is caught immediately. **Gate every mutation harness on a successful build**, and be
   suspicious of a mutant that changes behaviour but leaves a variable unread.
0. **`git checkout` CANNOT RESTORE AN UNTRACKED FILE, AND FAILS QUIETLY ENOUGH TO MISS.**
   The first mutation run on `scene.ts` (new, unstaged) restored nothing, so four
   mutations stacked and all four verdicts were meaningless. Copy the file aside instead.
0. **THE SUITE STILL CANNOT SEE THE SCREEN.** Two real defects shipped past 851 green
   tests and 43 green browser specs and were found only by opening a PNG: the placeholder
   printed "Portrait pending" **twice** (once in the SVG, once in the caption), and the
   whole text column **jumped left** when a scene reached a narration line, because hiding
   the figure collapsed the grid column. **Open `visual-artifacts/playtest/` after any
   change to a screen.**
0. **REVEAL STATE MUST NOT MOVE INTO THE DOM.** `renderStory` is re-entered from
   `refresh()` — the prep panel's `onChange` and every deploy toggle — on the briefing,
   where a scene is being read. `setBeat(key, …)` no-ops on an unchanged key and that is
   the only thing standing between a party edit and a reset cursor.
0. **`--accent` IS RULES AND BORDERS ONLY.** Gold leaf as *text* on parchment measures
   1.55:1. New gold text takes `--accent-ink`.
0. **THE SHEET'S PADDING AND THE SCORCH ARE COUPLED.** `--burn + --burn-spread +
   --burn-jitter` is the depth the burn reaches; `.card`/`.panel` padding must clear it.
   The scene screen reuses `.card` deliberately — **do not mint a new sheet class**, or
   `contrast.spec.ts`'s `sheetOf()` falls through to the table stops and measures against
   the wrong ground.
0. **THE CONTRAST FLOOR IS NOW 100, MEASURED.** The briefing paints 113 text-bearing
   elements; the old floor of 40 had a 73-node margin, i.e. it could not have noticed most
   of the screen failing to render. If you add or remove a screen's chrome, **re-measure**
   rather than nudging the number.
0. **AN ANALYZER THAT DECLINES TO CHECK STILL SAYS PASS.** axe-core files an
   unflattenable background as `incomplete`, not as a violation. `a11y.spec.ts` asserts
   `results.passes.length` and disables `color-contrast` rather than banking its green.
   It earned its keep this slice: it caught an `aria-controls` pointing at an id that did
   not exist, on the first browser run.
0. **PUBLISHING ANY BRANCH BUT THE SESSION'S DESIGNATED ONE IS BLOCKED.**
   `.claude/hooks/guard-designated-branch.sh` compares the target against the branch
   recorded at SessionStart.
0. **A CAPTURED FRAME'S FILENAME IS AN ASSERTION.** `shot()` takes the `data-testid` the
   frame must show. The two prologue frames go further: `02a` asserts the More control is
   still present, `02b` asserts it is gone — without that pair a half-revealed beat sits
   under a caption saying "read".
0. **`telemetry.ts` MUST KEEP ITS TYPE-ONLY IMPORTS.** Unchanged this slice, and the
   reason no new `TelemetryEvent` kind was added for scenes. `logNote()` DID widen, because
   how much of a scene a player reads is a new category of collected thing and that
   sentence is the only place the page says what it keeps.
1. **A STALE `dist` FAILS A BROWSER TEST THAT IS ACTUALLY FINE.** `npx playwright test`
   does NOT rebuild; `npm run test:visual` does. A **failed** `npm run build` leaves the
   previous `dist` standing — see trap 0.
2. **GEAR IS A DIVERSITY AXIS THE GATE DOES NOT USE.** `data/builds/*` all carry
   `weapon: null`, so the variety score of 7 is measured with every build on the same
   placeholder weapon.
3. **`wp` ON A HORIZONTAL WEAPON IS A CALIBRATION CONSTANT, NOT A TIER.**
4. **THE ONBOARDING BET IS UNTESTED AND ONLY A PERSON CAN SETTLE IT.**
5. **A GATE THAT CANNOT SEE A CHANGE GOING GREEN IS NOT EVIDENCE.** Shipped builds author
   `learned` explicitly, so progression-economy changes never reach a built unit.
6. **`ReactionEffectSchema` IS `{kind}` WITH NO MAGNITUDE.** Before authoring a passive,
   check whether its effect schema can express "weaker".
7. **A TEST THAT NAMES THE BUG IT CATCHES IS A CLAIM ABOUT CODE YOU HAVE NOT RUN.**
8. **PROSE IN THE FUTURE TENSE ROTS SILENTLY.** When you land the thing a comment
   predicted, grep for the prediction.
9. **`EXPECTED_TREE_SIZES` in `content-pack.test.ts` pins every job's node count.**
10. **`AP_TIERS` is 60/120/240.** Relevant to a test that wants to click a buy button:
    **nobody can afford anything before battle 3.** The best-earning member holds 56 AP
    after battle one, so a spec needing a real record edit early should equip a weapon.
11. **The help panel is NOT on the story seam, deliberately.**
12. **`play.spec.ts` ASSERTS THE VIEWER'S TAB ORDER EXACTLY.** `campaign.spec.ts` asserts
    no tab order, but it DOES assert the exact screen sequence
    `["TITLE","SCENE","BRIEFING","BATTLE","AFTER_BATTLE"]` — adding a screen moves that
    array rather than relaxing it.
13. **The def and the save share ONE version constant.** Bumping `CAMPAIGN_SCHEMA_VERSION`
    for a save-only field still forces `data/campaign/*.json` to bump. And **typecheck
    stays silent**: `startCampaign` builds the save through `.parse()`, which takes
    `unknown`, so only the runtime tests catch a missing required field.
14. Everything the previous handoff listed still holds: **a screen the state machine skips
    has content nobody can reach**; **the prep panel is mounted ONCE and re-pointed**;
    **the story pack's coverage is checked at BOOT, both directions**; **story text is
    rendered with `textContent`, never `innerHTML`**; **`campaign-data.ts` imports the
    five encounter files BY NAME**; **the AP grant reads `landedActions`**; **the campaign
    is winnable UNDER THE PROBE, which is reachability evidence, not difficulty
    evidence**; **`docs/11` §3 and `docs/08` §1a carry AUTHORED status tables nothing
    derives**; **the browser tests are NOT in `npm run check` — run `npm run test:visual`
    separately.**

---

## Parked — not the next slice, and not because they are wrong

**The visual slices above come first (owner, 2026-08-30).** Nothing here is cancelled;
none of it is scheduled.

| Item | Why parked |
|---|---|
| **The story repo itself** (`docs/08` §4) — the pack moves out, this repo consumes it as a versioned package. The contract is rich enough now: per-line speakers, a cast, standalone scenes. | Still the natural follow-on to the scene player, and the owner has said the writing comes next. It is a content move, not a look-and-feel one, so it sits behind the visual slices. |
| **Variety score 7 → 8** (`docs/06` AC-E2). The untried lever is **gear** — every build in `data/builds/*` carries `weapon: null`. | **Explicitly removed from the priority list by the owner, 2026-08-30.** The criterion is untouched: `DIVERSITY_TARGET_N` stays 7, the release bar stays ≥ 8, CI still fails on a drop. Do not weaken it, do not "clean it up", and do not treat this row as permission to reopen it. |
| **The AP grant shape** (ADR-0012) — a healer who only heals banks nothing. | Combat/progression work. Same reason: after the visuals. |
| **MP enforcement** (`docs/08` §1a). | Blocked on durable carriers, unchanged. |

---

## Measured facts (re-derive rather than trust, but these were probed)

> **The balance numbers across ADR-0025 and ADR-0026 are MVP-PROVISIONAL** (user,
> 2026-08-22). Node costs, prereq chains and weapon stats exist to make M0 work, not
> because they are right. The RULES under them are not provisional.

Cheapest LIVE option per chassis slot, walking prerequisites, after ADR-0025:

| Slot | Ability | Total AP |
|---|---|---|
| secondary | any job's first action | 60 |
| support | `battle-skill.hp-boost` | 120 |
| movement | `steal.move-plus-2` | 120 |
| reaction | `punch-art.counter` | 180 |

Campaign AP budget: **~280** for the best-earning member, **~184** for the worst.

### Still-live engine facts

- **AC-E6 is REACHABILITY, not balance.**
- **A mobility, reach or range grant is not automatically a buff** (ADR-0020).
- **An aggregate A/B can read "identical" while a third of the rows moved.**
- **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice**;
  `punch-art.` has TWO carriers; `bld-cutpurse` sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).
- **The MP contingency is live:** `white-magic.holy` and `summon.*` ride unenforced MP.
- **`battle-skill` is still excluded by user decision** (2026-08-16).
- **`compareCandidate` is the most load-bearing function in the repo.**
- **The frozen golden is a tripwire, not a maintenance item.**

---

## Environment facts that cost real time to learn

- **`@axe-core/playwright` was declared but not installed** in a fresh container. If
  `npm run typecheck` fails on it, run `npm install` — it is not a code error.
- **Scratch probes belong outside the tree but INSIDE the repo** (`coverage/`, gitignored):
  `vite-node` resolves imports against the Vite root.
- **Never round-trip `data/base-pack.json` through a JSON parser** — it reformats the whole
  file. The small authored files under `data/campaign/` are fine.
- **Vite inlines an asset under 4 KB as a `data:` URI.** The portrait placeholder is 1.2 KB,
  so a spec pinning a hashed filename would flake the day real art crosses the limit.
  Assert the shape loosely and lean on `naturalWidth`.
- **`src/vite-env.d.ts` exists because `tsconfig.json` sets `"types": ["node"]`**, so
  `vite/client`'s ambient declarations are not in scope and a bare `.svg` import fails
  typecheck.
- **A bare JSON import breaks ONLY the browser job** — `e2e/*.spec.ts` goes through Node's
  ESM loader, which requires `with { type: "json" }`.
- **`vite.config.ts` has three entries.** A page missing from `rollupOptions.input` works
  under `npm run dev` and does not exist in `dist`.
- **After a merge the remote branch is DELETED**, so `--force-with-lease` fails with
  "stale info". `git remote prune origin`, then push normally.
- **Use the check-runs API for CI**; the legacy commit-status endpoint reports nothing.
- **The sandbox proxy blocks `/repos/*/pages`, `/environments`, `/deployments` and all
  `*.github.io` egress**, but a runner can reach them with `${{ github.token }}`.
- **GitHub auto-merge is NOT enabled** on this repo — watch the checks and merge.

---

## Pages — RESOLVED 2026-08-12 (first successful deploy on run #23)

`pages.yml` was always correct; runs #1–#22 failed on two sequential *settings*, both
derived from the repository default branch. Two preflights now guard the `build` job.
**An agent can confirm the deployment API reported success but cannot confirm the page
renders** — `*.github.io` is blocked. Nobody in this sandbox has seen the shipped shell
render.
