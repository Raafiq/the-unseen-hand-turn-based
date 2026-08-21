<!-- written-against: 667feb7d6f44fd5356c1ab3b277297e37098ba4d -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive.

---

## Where things stand

**M0 — the playable slice (`docs/11`), in progress.** 647 tests / 36 files, 15 Playwright
specs. Variety score still 7 (bar 8), carried into M1 by user decision — **not an MVP
blocker, do not "just finish the gate first"**.

**The shell landed 2026-08-21 (ADR-0023). The game is playable end to end by a person.**
`/game.html`: title → New Game / Continue → briefing → the real battle → win or lose →
next or retry → ending, with one save slot in `localStorage`. What exists now:

- `src/render/campaign-shell.ts` — the DOM-free shell state machine (screens, the save,
  retry). Drives the same `Session` the engine viewer does.
- `src/render/storage.ts` — **the only persistent IO in the project.** Reads return a
  discriminated `LoadedSave` and never throw; writes throw and the shell displays it.
- `src/render/panels.ts` — timeline / status / **resolution preview** / turn log as pure
  `state → HTML`, shared by both pages.
- `Session` now optionally takes the encounter's `rules` and judges with `evalTerminal`,
  emitting a real `RunReport` from `harness.ts`'s exported fold.
- `campaign-run.ts` split into `campaignBattleRecords` / `loadCampaignBattle` /
  `deriveRewards` / `resolveCampaignBattle`; `runCampaignBattle` is composed from them.

M0 items 1, 2 and 6 are done. **3 (prep loop), 4 (story stubs), 5 (equipment) and
7 (onboarding) are not.**

---

## The next slice — the between-battle loop and the story seam (`docs/11` M0 items 3 + 4)

A player can now finish the campaign **without making a single decision between battles**.
That is the biggest hole in the MVP, and it is cheap to close:

1. **Mount the prep screen on the briefing screen.** `prep.ts` already equips abilities and
   traits against a `UnitRecord`; it is currently hard-wired to its own demo Knight and
   mounted on `index.html`. Generalise it to take a record + an onChange, and have the
   briefing write back through `updatePartyMember` → persist. `campaign-shell.test.ts`
   already writes through that seam and proves a deployed battle reads it, so the
   discriminator exists before the UI does.
2. **Story stubs as DATA (`docs/08` §4 contract, AC-M4).** Text before and after each
   battle, in its own file, referenced by battle id. **AC-M4's discriminator is an A/B:
   swap the story data and what the player reads changes, with no code change.** Do not put
   prose in `CampaignDef` — ADR-0022 decision 6 and CLAUDE.md both forbid narrative in the
   engine.
3. **Then** onboarding (item 7): battle 1 teaches move/attack/turn order, battle 3
   introduces the loadout. Mostly content + a hint line, once the prep loop exists.

### Deliberately NOT green-lit

- **Making `game.html` the landing page** (and moving the viewer to `viewer.html`). It is
  the right end state and it is written down in ADR-0023's rejected alternatives — but do
  it once the prep loop and story stubs are in, not before. It rewrites the navigation of
  twelve browser specs.
- Equipment (M0 item 5). Unchanged from the last handoff: a `rosterSchemaVersion` bump +
  migration + regenerated frozen golden + re-measured gate.
- Anything that raises the variety score. Carried to M1.
- Persisting battle HP across the campaign. ADR-0022 rejected it for M0 with a reason.

---

## Traps waiting for you

1. **AN A/B BETWEEN TWO CALLERS OF THE SAME HELPER CANNOT SEE A BUG IN THE HELPER.** This
   slice's own near-miss. `campaignBattleRecords` is the single party-carry mechanism, and
   the shell is verified by byte-comparing its save + report against the headless runner's
   — but both call it. Swap `save.party` for `def.party` and the two paths agree
   *perfectly*, on the wrong answer; only the older single-path test in
   `campaign-run.test.ts` went red. Each path also needs one assertion that reaches
   THROUGH the helper to an observable end — here, `campaign-shell.test.ts`'s "DEPLOY
   builds the battle from the SAVE's party" (write a change via `updatePartyMember`,
   deploy, read it off the battle unit). **Mutation-verified both ways.**
2. **The shell's `rules` CAPS are unasserted, and I know it.** `deploy()` hands the session
   the encounter's `victory`/`defeat`/`maxTurns`/`maxTicks`. The objectives are covered
   (`session.test.ts`'s `defeatUnit` fixture, mutation-verified); the **caps are not** —
   replacing them with 999999 leaves every test green, because no shipped campaign battle
   times out. If you author a battle that can time out, add the assertion first.
3. **`Session` has TWO verdict readings, and only one is right for an encounter.** With
   `rules` it is `evalTerminal` in the harness's fold (advance → account → judge, and the
   pre-advance check is deliberately SKIPPED so a charge maturing mid-advance can still
   turn a victory into a draw). Without them it is the team-wipe read, which is all the
   conditionless demo battle on `/` can honestly support. A fixture whose victory is "wipe
   team 1" cannot tell them apart.
4. **Never grow a second accounting fold in `src/render`.** The campaign's AP grant reads
   `contributionByUnit[…].landedActions`. `Session.report()` is assembled from
   `harness.ts`'s exported helpers, and `session.test.ts` byte-compares a probe-driven
   session's report to `runFromState`'s. Mutating either half turns it red.
5. **`campaign-data.ts` imports the five encounter files BY NAME.** A glob would be
   self-maintaining but is Vite-only. The guard is `campaign-shell.test.ts`'s two-direction
   partition: every battle the campaign names resolves, and every bundled encounter is
   named. A new battle needs the import *and* the file.
6. **An anchor added to `index.html` changes the tab order.** `play.spec.ts` asserts the
   order EXACTLY (deliberately — "reachable after ten tabs" must still fail), so the
   campaign link is now named as the first stop rather than skipped.
7. Everything the previous handoff listed still holds: **the AP grant reads
   `landedActions` and the priest fixture is what discriminates it**; **the campaign is
   winnable UNDER THE PROBE, which is reachability evidence, not difficulty evidence**;
   **`ttk.test.ts` covers two rosters**; **`npm run state`'s counters enumerate NAMED
   DIRECTORIES**; **`docs/11` §3 and `docs/08` §1a carry AUTHORED status tables nothing
   derives**; **`gen-state.mts` fails on an unresolved `{token}`**; **the browser tests are
   NOT in `npm run check` — run `npm run test:visual` separately, and alone.**

### Still-live engine facts (unchanged by this slice)

- **AC-E6 is REACHABILITY, not balance.** All five *benchmark* encounters end in defeat for
  team 0 as authored; that is why the campaign is purpose-built content.
- **A mobility, reach or range grant is not automatically a buff** (ADR-0020).
- **An aggregate A/B can read "identical" while a third of the rows moved.**
- **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice**; `punch-art.`
  has TWO carriers; `bld-cutpurse` sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).
- **Hamedo draws the hit roll it then discards** (ADR-0019 decision 5) — deliberate.
- **The MP contingency is live:** `white-magic.holy` and `summon.*` ride unenforced MP.
- **`battle-skill` is still excluded by user decision** (2026-08-16).
- **`compareCandidate` is the most load-bearing function in the repo.**
- **The frozen golden is a tripwire, not a maintenance item.**

## Environment facts that cost real time to learn

- **Scratch probes belong outside the tree.** `coverage/` is gitignored; a `vite-node`
  script importing `src/sim/*` is the fastest way to measure.
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
reported success but cannot confirm the page renders** — `*.github.io` is blocked. That now
covers `/game.html` too: nobody in this sandbox has seen the shipped shell render.
