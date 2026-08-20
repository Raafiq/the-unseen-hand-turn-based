<!-- written-against: 47439083fd12b93d0b116d8d471740ad043ad5d9 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive.

---

## Where things stand

**M0 — the playable slice (`docs/11`), in progress.** 625 tests / 35 files, 12 Playwright
specs. Variety score still 7 (bar 8), carried into M1 by user decision — **not an MVP
blocker, do not "just finish the gate first"**.

**The campaign container and the party save landed 2026-08-20 (ADR-0022).** M0 item 2, plus
the headless half of item 6. What exists now:

- `src/sim/campaign.ts` — a FOURTH codec (own version line, own migrations, loud-fail
  loader) holding `CampaignDef` (party + cast + ordered battles) and `CampaignSave`
  (cursor + party + history), with pure transitions: `startCampaign`, `applyBattleResult`,
  `retryBattle`, `updatePartyMember`, `serializeCampaign`/`deserializeCampaign`.
- `src/sim/campaign-run.ts` — the headless playthrough. `runCampaign` drives the whole
  sequence; `runCampaignBattle` drives one, which is what the viewer will call.
- `data/campaign/` — `camp-the-first-march`: 4 party members, 5 cast records, 5 battles.
- `UnitContribution.landedActions` — a new counter on the harness report; the AP grant
  reads it instead of damage.

**None of it is reachable by a person.** There is no title screen, no save-to-disk, no
between-battle prep, no story text. That is the next slice.

---

## The next slice — the shell (`docs/11` M0 item 1, plus the save's IO)

1. **Title screen + New Game + Continue + quit.** One save slot.
2. **Write the save somewhere.** The codec exists; nothing calls it. `localStorage` for the
   web build is the obvious first target — keep the IO at the `src/render` edge, since
   `campaign.ts` is pure by contract and must stay that way.
3. **Route the battle through the campaign.** `Session` already takes a `makeState`
   factory (`SessionOptions`), so a campaign battle is `loadEncounter(def, {registry,
   records: save.party ∪ def.cast})` handed to that factory. When the battle ends, call
   `runCampaignBattle`'s player-driven equivalent — **which does not exist yet**: the
   headless runner fights the battle itself. You need a `resolveCampaignBattle(def, save,
   report)` that takes an already-finished battle's outcome + contributions and folds it
   in. `applyBattleResult` is that function; the missing piece is deriving the rewards map
   from a viewer-run battle, which today only `campaign-run.ts` does (via the placements).
   **Factor that reward derivation out before duplicating it.**
4. **Then** items 3/4 (prep loop + story stubs), which are cheap once the shell exists.

### Deliberately NOT green-lit

- Equipment (M0 item 5). ADR-0021 scoped it horizontal and ADR-0022 did not touch it. It is
  a `rosterSchemaVersion` bump + migration + regenerated frozen golden + re-measured gate.
- Anything that raises the variety score. Carried to M1.
- Persisting battle HP across the campaign. ADR-0022 rejected it for M0 with a reason
  (it makes every battle's winnability depend on the previous battle's damage roll).

---

## Traps waiting for you

1. **The campaign's party crosses the boundary through ONE line** — `campaign-run.ts`
   fills the encounter resolver's record map from `save.party`, not `def.party`. Swap them
   and every battle silently restarts from scratch while every per-battle test stays green.
   The only thing that catches it is the A/B in `campaign-run.test.ts` ("the battle is
   fought with the SAVE's party"). Mutation-verified: that test, and only that test, goes
   red.
2. **The AP grant reads `landedActions`, and that is load-bearing.** Mutate it to damage
   and the healer test goes red — because the shipped campaign's priest ends three battles
   with `damageDealt === 0`. If you re-tune the campaign so the priest starts swinging,
   that fixture stops discriminating and the test becomes decorative. Check it still holds
   after any content change.
3. **The campaign is winnable UNDER THE PROBE, on both seats.** That is reachability
   evidence, not difficulty evidence. A human plays better in some places and worse in
   others. Measured across 8 consecutive seeds (a plateau, not a knife-edge) with a turn
   ramp of 4 → 9 → 16 → 22 → 28, and **both the ramp and the `completed` outcome are
   asserted** — so re-tuning any battle can fail the ramp test, on purpose.
4. **`ttk.test.ts` now covers TWO rosters** — `data/builds/*` and the campaign's
   `party + cast`. Adding a campaign unit without classifying it fails on purpose.
5. **`npm run state`'s counters enumerate NAMED DIRECTORIES.** `data/campaign/encounters`
   was invisible to the encounter count until it was wired in; the page would have read 6
   while 11 shipped. A derived number is only as complete as the directories behind it.
6. **`docs/11` §3 now carries an AUTHORED status table** (which M0 items are done). Like
   `docs/08` §1a, nothing derives it — sync it in the same slice that changes it, or it
   rots exactly the way §1a did twice.
7. **`gen-state.mts` now fails on an unresolved `{token}` in the page.** Only some prose
   slots are interpolated. Adding a token to one that is not used to publish the literal
   braces, which read as a live derived number. Verified by mutation.
8. **The browser tests are NOT in `npm run check`.** Run `npm run test:visual` too, and
   run it alone (two concurrent runs share a port and fail 7 of 12 in a way that reads
   like a real regression).

Everything in the next section is inherited from earlier slices and still true.

### Still-live engine facts (unchanged by this slice)

- **AC-E6 is REACHABILITY, not balance.** Run as authored, all five *benchmark* encounters
  end in **defeat** for team 0; two lose 200 of 200 seeds. That is why the campaign is
  purpose-built content and does not reuse them.
- **A mobility, reach or range grant is not automatically a buff** — it was a liability
  until the probe could price a tile (ADR-0020).
- **An aggregate A/B can read "identical" while a third of the rows moved.** Diff at the
  resolution the change acts on.
- **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice**; `punch-art.`
  has TWO carriers; `bld-cutpurse` sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).
- **Hamedo draws the hit roll it then discards** (ADR-0019 decision 5) — deliberate.
- **The MP contingency is live:** `white-magic.holy` and `summon.*` ride unenforced MP;
  enforcing it would drop the count.
- **`battle-skill` is still excluded by user decision** (2026-08-16).
- **`compareCandidate` is the most load-bearing function in the repo.** A new key's
  placement must be swept and reported (ADR-0020 sets the standard).
- **The frozen golden is a tripwire, not a maintenance item.**

## Environment facts that cost real time to learn

- **Scratch probes belong outside the tree.** `coverage/` is gitignored; a `vite-node`
  script importing `src/sim/*` is the fastest way to measure. This slice used three (a
  stat/band table, a campaign playthrough dump, a seed sweep) and deleted them.
- **Never round-trip `data/base-pack.json` through a JSON parser to edit it** — it
  reformats the whole file. (Small authored files like `data/campaign/*` are fine.)
- **Perturb the BASELINE as well as the fix**; a plateau you cannot compare to anything is
  not evidence.
- **Playwright browsers: the sandbox and a Windows box differ.** Chromium at
  `/opt/pw-browsers` is the Linux sandbox only.
- **A bare JSON import breaks ONLY the browser job** — `e2e/*.spec.ts` goes through Node's
  ESM loader, which requires `with { type: "json" }`.
- **Use the check-runs API for CI**; the legacy commit-status endpoint reports nothing.
- **The sandbox proxy blocks `/repos/*/pages`, `/environments`, `/deployments` and all
  `*.github.io` egress**, but a runner can reach them with `${{ github.token }}`.
- **GitHub auto-merge is NOT enabled** on this repo — watch the checks and merge.

## Pages — RESOLVED 2026-08-12 (first successful deploy on run #23)

`pages.yml` was always correct; runs #1–#22 failed on two sequential *settings*, both
derived from the repository default branch. Two preflights now guard the `build` job, the
second because the first is not sufficient. **An agent can confirm the deployment API
reported success but cannot confirm the page renders** — `*.github.io` is blocked.
