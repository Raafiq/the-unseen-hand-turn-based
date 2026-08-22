<!-- written-against: e389e464d49baf6a0d13d321f3c6aa30dda727be -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive.

---

## Where things stand

**M0 — the playable slice (`docs/11`), in progress.** 688 tests / 36 files, 17 Playwright
specs. Variety score still 7 (bar 8), carried into M1 by user decision — **not an MVP
blocker, do not "just finish the gate first"**.

**The prep loop and the story seam landed 2026-08-22 (ADR-0024).** A player now makes
decisions between battles and reads text around them. `/game.html`: title → New Game /
Continue → briefing (**scene text + prepare the party**) → the real battle → win or lose
(**different text for each**) → next or retry → ending. What exists now:

- `src/sim/story.ts` — the `docs/08` §4 story contract: a Zod schema, a parse, two
  lookups, **its own version line**, and not one authored word. Prose lives in
  `data/campaign/story/camp-the-first-march.story.json`.
- `CampaignShell.sceneTitle()` / `preBeat()` / `outcomeBeat()` — three lookups into an
  OPTIONAL pack. `CampaignShell.updateParty()` — the prep write-back, refused mid-battle.
- `prep.ts` split into a **DOM-free `PrepModel`** (records, selection, every rule-bearing
  edit) and `mountPrep`. `mountPrepDemo` keeps `/`'s fixed showcase unchanged.
- The panel gained a party picker, a job selector and an **AP-priced learn list** whose
  blocked rows carry `canLearn`'s own reason.
- `UnitRecordSchema` now **rejects `secondary === currentJob`** at every codec boundary.

**M0 items 1, 2, 3, 4 and 6 are done. 5 (equipment) and 7 (onboarding) are not.**

---

## The next slice — onboarding, the first hour (`docs/11` M0 item 7)

The cheaper of the two remaining items, and the one that decides whether a stranger can
play this at all. `docs/08` §3 designs the ramp; nothing implements it.

1. **Battle 1 teaches move, attack and turn order, and nothing else.** It is content plus
   a hint line — there is now a briefing screen with a story block to put it on, and
   `data/campaign/story/` is the obvious home for the copy. Check `camp-b1` actually
   restricts what it teaches before writing the text against it.
2. **Battle 3 introduces the loadout.** Convenient: the AP economy first affords a
   purchase at exactly battle 3 (Vance and Kest hold 96 AP; a tier-one node costs 60).
   That is measured, not assumed — see the probe numbers below.
3. **Decide whether a hint is story data or a separate channel.** A hint is not narrative
   and does not belong to the story repo. Leaning: a distinct `hints` field or file, so
   swapping the story pack cannot silently delete the tutorial. Do not just tack prose
   onto a `pre` beat.

### Deliberately NOT green-lit

- **Making `game.html` the landing page** (and moving the viewer to `viewer.html`). Still
  the right end state, still written down in ADR-0023's rejected alternatives, still a
  rewrite of twelve browser specs' navigation. After onboarding, not before.
- Equipment (M0 item 5). Unchanged: a `rosterSchemaVersion` bump + migration + regenerated
  frozen golden + re-measured gate. The more expensive item; do onboarding first.
- Anything that raises the variety score. Carried to M1.
- Reworking the AP grant. See the observation below — it is an M1 question.

---

## Traps waiting for you

1. **A SCREEN THE STATE MACHINE SKIPS HAS CONTENT NOBODY CAN REACH.** Winning the LAST
   battle goes straight to `COMPLETED` and never passes through `AFTER_BATTLE` — so the
   final victory beat would have been the one scene in the pack a player could never read.
   The ending screen renders it for exactly that reason. **When you add anything to a
   screen in this shell, enumerate the TRANSITIONS, not the states**: `concludeBattle`
   branches on status, `continueGame` lands on three different screens, and a loss on the
   last battle still goes to `AFTER_BATTLE`. Asserted in `campaign-shell.test.ts`'s
   "the FINAL victory's text is reachable on the ending screen", mutation-verified.
2. **A SIM DOCSTRING THAT DELEGATES A RULE TO "THE CALLER" IS AN OBLIGATION NOBODY IS
   TOLD ABOUT.** `changeJob` says "the caller/UI picks from unlocked jobs" and validates
   nothing, which made `secondary === currentJob` reachable through the back door — an
   illegal record that throws nowhere and reads as a content bug. Fixed at two levels (the
   UI clears it, `UnitRecordSchema` now rejects it). **When you meet another such
   docstring, the caller owes a test, and ask first whether a schema can see both fields.**
3. **The prep panel is mounted ONCE and re-pointed.** `renderPrep()` calls
   `setRecords(party)`, which **no-ops when nothing changed** — deliberately, because a
   blind re-render destroys the focus of the control the player is using. If you add state
   to the panel that must survive a repaint, it has to live in `PrepModel`, not in the DOM.
4. **`onChange` → `updateParty` → `renderBriefingText()`, not `refresh()`.** The panel has
   already redrawn itself by then; calling the full repaint would re-enter `renderPrep`.
   It terminates (setRecords no-ops), but do not rely on that by accident.
5. **The story pack's coverage is checked at BOOT, both directions.** A new battle needs a
   story entry or `campaign-data.ts` throws on module load — which is deliberate, and
   which means a half-authored pack breaks `npm run dev` rather than shipping a blank
   screen. Add a stub entry as you add the battle.
6. **`data/campaign/story/` is a content directory NO `npm run state` counter can see.**
   Nothing on the dashboard currently claims a story count, so nothing reads wrong today —
   but if you add one, wire the directory in. The real guard is the boot check in trap 5.
7. **Story text is rendered with `textContent`, never `innerHTML`** (`renderStory` in
   `game.ts`). The whole point of the seam is that a different repo supplies the strings.
8. Everything the previous handoff listed still holds: **an A/B between two callers of the
   same helper cannot see a bug in the helper** (now codified in `CLAUDE.md`); **the
   shell's `rules` CAPS are unasserted**; **`Session` has TWO verdict readings and only
   one is right for an encounter**; **never grow a second accounting fold in
   `src/render`**; **`campaign-data.ts` imports the five encounter files BY NAME**; **an
   anchor added to `index.html` changes the tab order** (`play.spec.ts` asserts it
   exactly; `campaign.spec.ts` does not, which is why the briefing could gain a dozen
   controls freely); **the AP grant reads `landedActions`**; **the campaign is winnable
   UNDER THE PROBE, which is reachability evidence, not difficulty evidence**;
   **`ttk.test.ts` covers two rosters**; **`docs/11` §3 and `docs/08` §1a carry AUTHORED
   status tables nothing derives**; **`gen-state.mts` fails on an unresolved `{token}`**;
   **the browser tests are NOT in `npm run check` — run `npm run test:visual` separately.**

## What the prep loop exposed (measured, not guessed)

Under the balance probe on both seats, banked AP after each battle:

| after | Vance | Kest | Briar | Ottoline |
|---|---|---|---|---|
| b1 | 48 | 48 | **0** | **0** |
| b2 | 96 | 96 | 56 | 0 |
| b3 | 152 | 152 | 112 | 56 |
| b5 | 280 | 272 | 256 | 184 |

Two facts fall out. **The first affordable purchase is at battle 3** (a tier-one node
costs 60), which is exactly where `docs/08` §3 wanted the loadout introduced — convenient,
and now load-bearing for onboarding. And **a member who never lands an action banks
nothing**: Ottoline is two battles behind by the end. That is ADR-0012's grant shape
working as specified (`participated` + capped `meaningfulActions`), not a bug — but
whether a healer who heals should count as participating is a real M1 question. It is
*not* an M0 blocker and it is not green-lit here.

### Still-live engine facts (unchanged by this slice)

- **AC-E6 is REACHABILITY, not balance.** All five *benchmark* encounters end in defeat for
  team 0 as authored; that is why the campaign is purpose-built content.
- **A mobility, reach or range grant is not automatically a buff** (ADR-0020).
- **An aggregate A/B can read "identical" while a third of the rows moved.**
- **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice**; `punch-art.`
  has TWO carriers; `bld-cutpurse` sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).
- **Hamedo draws the hit roll it then discards** (ADR-0019 decision 5) — deliberate.
- **The MP contingency is live:** `white-magic.holy` and `summon.*` ride unenforced MP.
- **`battle-skill` is still excluded by user decision** (2026-08-16) — and the prep loop
  made that visible for the first time: Vance's whole Knight tree is eight buyable nodes
  whose abilities all do nothing. The learn rows now carry the same "no effect yet" tag
  the command list does (ADR-0024 decision 12), so the panel is honest — but a **starting
  party member whose entire native tree is inert** is a content problem the label only
  discloses. Either give the Knight a live skillset or start Vance somewhere else; do not
  let the tag stand in for the fix.
- **`compareCandidate` is the most load-bearing function in the repo.**
- **The frozen golden is a tripwire, not a maintenance item.**

## Environment facts that cost real time to learn

- **Scratch probes belong outside the tree — but INSIDE the repo.** `vite-node` resolves
  imports against the Vite root, so a script in `/tmp` cannot import `src/`. Put it in
  `coverage/` (gitignored) and delete it after.
- **Never round-trip `data/base-pack.json` through a JSON parser to edit it** — it
  reformats the whole file. (Small authored files like `data/campaign/*` are fine.)
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
