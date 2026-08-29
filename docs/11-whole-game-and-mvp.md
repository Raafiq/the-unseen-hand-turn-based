# 11 — The whole game, and the MVP that comes first

`docs/08` is the **engine** roadmap: combat, jobs, encounters, the viewer. This doc is the
**game** roadmap — everything a person needs in order to sit down and play something,
including the parts no phase in `docs/08` owns.

**The organising rule: a thin playable whole beats a deep vertical.** We build the shortest
path to "a stranger can start it, play it, finish it, and know why they lost", then deepen.

---

## 1. What already exists

Real and tested, not aspirational:

- A deterministic combat simulation with a CT scheduler, five equip slots, AP-driven job
  trees, mastery, and free respec.
- A playable viewer: click to move and attack, full resolution previews, keyboard control.
- Encounters and builds as **data**, six of them shipped, all winnable (AC-E6).
- A prep screen that equips abilities and traits.
- Save/replay **substrate** — `(seed, commands)` reproduces any battle byte-for-byte.

## 2. What is missing, and nothing owns it

| Missing | Notes |
|---|---|
| ~~**A shell**~~ | **Built** (ADR-0023): the site root `index.html` — title, New Game, Continue, quit, one save slot. |
| ~~**A campaign container**~~ | **Built** (ADR-0022): `src/sim/campaign.ts` sequences the battles and carries the party. |
| ~~**Persistence**~~ | **Built** (ADR-0023): `src/render/storage.ts` writes one `localStorage` slot. |
| ~~**Story delivery**~~ | **Seam built** (ADR-0024): `src/sim/story.ts` + `data/campaign/story/`. Placeholder prose ships; the story repo still does not exist. |
| ~~**Equipment**~~ | **Built** (ADR-0026): 8 horizontal weapons, an authored per-battle drip, an inventory on the save. No shop, no gil, weapon slot only. |
| **Economy** | No gil, no shops, no rewards loop. |
| **Failure handling** | No game-over, no retry, no consequence for losing. |
| ~~**Onboarding**~~ | **Built** (ADR-0025), but NOT as `docs/08` §3 designs it: a `?` panel on demand, no tutorial, no staged unlocks. |
| **World map** | Unscoped. May never be needed — chapter select may be enough. |
| **Audio / art / UI polish** | Unscoped. |

## 3. The milestones

### M0 — The playable slice (**the MVP**)

**Definition of done: a stranger downloads it, plays 30–45 minutes without being told
anything, and reaches a real ending — win or lose.**

1. **Shell** — title screen, New Game, Continue, quit. One save slot.
2. **Campaign container** — an authored sequence of **5–6 battles**. The party persists
   between them: HP restored, AP banked, learned abilities kept, the dead handled.
3. **Between-battle loop** — the existing prep screen, reached between battles: spend AP,
   change job, change loadout, then deploy.
4. **Story stubs** — plain text before and after each battle, authored as data in the
   `docs/08` §4 contract shape. Placeholder prose; the point is the seam, not the writing.
5. **Equipment, minimal** — ADR-0021's horizontal gear, ~8 items on an authored drip.
   No shop. No gil.
6. **Failure handling** — lose a battle → game over → retry that battle. Progress persists.
7. **Onboarding, hour one** — battle 1 teaches move, attack, turn order and nothing else.
   Battle 3 introduces the loadout. `docs/08` §3's ramp, minimally.

> **STATUS 2026-08-22 — ALL SEVEN M0 ITEMS ARE BUILT (ADR-0022 … ADR-0026).**
> The MVP's definition of done is "a stranger downloads it, plays 30–45 minutes without
> being told anything, and reaches a real ending". Every ITEM is now shipped and tested.
> **Whether the definition is MET is a different claim, and it is untested: no stranger
> has played this.** The two open bets are onboarding (ADR-0025 — nothing is taught, only
> a `?`) and session length (nobody has timed a playthrough). Both need a playtest, not
> another slice.
>
> **STATUS 2026-08-22 — the between-battle loop and the story seam have landed
> (ADR-0024).** The campaign is playable by a person, end to end, at the **site root** (`/`; the old `/game.html` redirects there):
> title screen → New Game / Continue → briefing (**scene text + prepare the party**) →
> the real battle → win or lose (**with different text for each**) → next or retry →
> ending. One save slot in `localStorage`. `/` stays the engine viewer and links to it.
> What is done and what is not:
>
> | M0 item | State |
> |---|---|
> | 1. Shell | **done** — `index.html` (the site root) + `src/render/campaign-shell.ts`; title, New Game, Continue, quit, one slot |
> | 2. Campaign container | **done** — headless (ADR-0022) and played (ADR-0023) |
> | 3. Between-battle loop | **done** (ADR-0024) — the prep panel is mounted on the briefing over the save's party: spend AP, change job, change loadout, then deploy. Every edit is in the save file before Deploy |
> | 4. Story stubs | **done** (ADR-0024) — `src/sim/story.ts` (schema, no prose) + `data/campaign/story/camp-the-first-march.story.json` (pre / victory / defeat per battle). `mid` hooks are deliberately out — see the ADR |
> | 5. Equipment | **done** (ADR-0026) — `UnitRecord.weapon` (rosterSchemaVersion 3) + an 8-weapon horizontal catalog + `CampaignBattle.grants` paying into a set-valued inventory (campaignSchemaVersion 2). The reference builds stay on the placeholder, so the variety score is unchanged — gear is an axis the gate does not yet use |
> | 6. Failure handling | **done** — a loss reaches a game-over screen the player can act on, and retry restores the party exactly |
> | 7. Onboarding | **done** (ADR-0025) — a `?` panel on the game page, plus the content and panel fixes that made every chassis slot reachable inside one campaign. Deliberately NOT `docs/08` §3's ramp: nothing is gated or taught on rails (user decision, 2026-08-22) |
>
> Persistence is now real: `src/render/storage.ts` is the only IO in the project, and
> `src/sim/campaign.ts` stays pure by contract. An unreadable slot (corrupt, another
> campaign, a version this build cannot migrate) is a message on the title screen with
> New Game still working — never a crash.
>
> **What the prep loop exposed.** Under the balance probe the party banks 48 / 48 / 0 / 0
> AP after battle one, so the first affordable purchase — a 60-AP tier-one node — lands at
> **battle three**, and a member who never lands an action banks nothing. That is
> ADR-0012's grant shape behaving as specified; whether it is the right shape is an M1
> question, not an M0 blocker.

**Explicitly NOT in the MVP** (`docs/08` AC-R5 — log every cut):
permadeath consequences, hybrid jobs, rewind UI, scan, speed toggle, shops, gil, a world
map, recruitment, more than one save slot, audio, and any art beyond the current
placeholder rendering.

> **DECIDED (user, 2026-08-19): the build-diversity gate is carried into M1 and does NOT
> block the MVP.** `docs/08`'s P2 exit criterion (variety score ≥ 8) is a **balance-quality**
> bar, not a playability one. At 7 the game is perfectly playable, and finishing it before M0
> would delay a playable build in exchange for a number no player sees. The criterion is not
> weakened or withdrawn — `DIVERSITY_TARGET_N` stays at 7, the gate still fails CI if the
> count drops, and ≥ 8 remains the release bar. What changed is only **when** it is due.

### M1 — Depth

The `docs/08` P2/P3 backlog, now against a game you can actually play:
variety score to 8, MP enforcement, hybrid/fusion jobs, rewind UI, scan, speed toggle,
AI depth beyond threat-counting, more jobs and encounters.

### M2 — Campaign

The story repo begins and plugs into the `docs/08` §4 contract. Chapter structure, the
full act ramp (`docs/07` §4), gil and shops **if** the economy needs them, recruitment,
unique characters, permadeath with real stakes.

### M3 — Ship

Balance passes against the gate, difficulty options, accessibility, audio, art, build
sharing, New Game+.

## 4. Sequencing note

M0 is deliberately **wide and shallow**. Every item in it is the thinnest version that
works, because the purpose of M0 is to find out what is actually wrong with the game — and
no amount of engine depth answers that. Expect M0 to change M1's priorities.

## Acceptance Criteria (SDD-ready)

> **AC status 2026-08-29 (ADR-0029).** **AC-M8 and AC-M9 are new and met.** The story
> seam is now v2 — per-line speakers, a character registry with portrait art, and
> standalone scenes — and the campaign save carries `scenesSeen` (campaignSchemaVersion
> 4). AC-M4 is unchanged in substance and still met: battle text is still loaded from
> data satisfying `docs/08` §4, and the A/B that proves it now swaps a v2 pack. **What
> did NOT change: AC-M6's onboarding bet.** A scene player is presentation, not
> teaching, and no newcomer has still played this.
>
> **AC status 2026-08-24 (ADR-0027).** AC-M1 now names the player it assumes, and the
> "reachability, not difficulty" caveat below is no longer the whole story: difficulty has
> been **measured**, over three deterministic player policies at sixteen seeds. A player who
> never opens the prep screen loses the finale 14 times in 16; one who buys the cheapest
> option in every slot clears about half; one who deploys and spends by measured
> contribution clears every seed. That is RELATIVE difficulty from agent play — the probe
> plays the player's units too, so a persona reaches the outcome through its build and never
> through better positioning. It is not "87% of humans would lose this", and it is still not
> legibility or fun.
>
> **AC status 2026-08-22.** **AC-M1, AC-M2, AC-M3 and AC-M4 are met on both halves** —
> headless (`campaign.test.ts`, `campaign-run.test.ts`) and played, through the shell the
> browser drives (`campaign-shell.test.ts`, `e2e/campaign.spec.ts`). AC-M4's A/B is
> `campaign-shell.test.ts`'s "swapping the DATA changes what the player reads": the same
> shell class, the same methods, a different pack, different text.
>
> Two things those tests deliberately do NOT claim. First, the player seat in every
> automated run is the balance probe (watch mode) or a deliberate forfeit — so
> "completable" is evidence of **reachability**, not of difficulty. Second, the shell's
> `Session` is judged by `evalTerminal` against each encounter's own objectives; the
> conditionless demo battle on `/` still uses the team-wipe read, because that is all a
> battle with no `Condition` can honestly support (ADR-0023 decision 2).

- **AC-M1 (the slice is finishable *by a player who plays*):** A single playthrough of the
  M0 campaign SHALL be driveable from title screen to ending **by a player who uses the prep
  screen**, and that path SHALL be asserted headlessly the way `docs/06` AC-E6 asserts a
  single encounter. *Discriminator:* a campaign that can start but cannot reach an ending
  passes any per-battle test.
  **Amended 2026-08-24 (ADR-0027) to name the player it assumes.** "Finishable" is a family
  of claims, and the criterion used to be satisfied by its weakest member: the campaign was
  winnable by a party that never spent a point of AP and never filled a chassis slot, which
  made the customization spine `docs/00` is built on optional decoration. **The
  zero-engagement path deliberately no longer reaches the ending** — it loses the finale in
  14 of 16 measured seeds. The headless `runCampaign` in `src/sim` has no prep concept, so
  it IS that path; the "reaches an ending" assertion lives in the playtest harness, which
  can drive a real player policy, and `campaign-run.test.ts` keeps what it is genuinely
  evidence for (every battle resolves by its objective, the sequence ramps, the run is
  deterministic).
- **AC-M2 (progress survives):** Party state SHALL persist across every battle boundary and
  across a save/load cycle, byte-identically. *Discriminator:* assert the round-trip, not
  that a save file was written — a save that writes and reloads wrong looks identical to one
  that works.
- **AC-M3 (losing is a state, not a crash):** A lost battle SHALL reach a game-over the
  player can act on, and retrying SHALL restore the pre-battle party exactly.
- **AC-M4 (the story seam is real):** Battle text SHALL be loaded from data satisfying the
  `docs/08` §4 contract, with **no** narrative content compiled into the engine.
  *Discriminator:* an A/B — swapping the story data changes what the player reads, with no
  code change. **Met** (ADR-0024). The contract's `mid`-battle hook is explicitly deferred
  until an event system exists to fire it; `pre`, `victory` and `defeat` ship.
  **Amended 2026-08-29 (ADR-0029):** the pack is now **v2** — beats carry per-LINE
  speakers rather than one speaker per beat, reference a pack-level `characters` registry,
  and the pack may hold **standalone scenes** anchored before a battle or before the
  ending. The seam's claim is unchanged and the A/B still carries it; it now swaps a v2
  pack, and asserts the name plate is resolved **through the registry** rather than
  printed from the raw id. `mid` is still deferred, and there is deliberately no
  `after-battle` scene anchor either.
- **AC-M5 (the chassis is reachable, not just present):** Every chassis slot the game shows
  a player SHALL have at least one **live** option affordable within a single playthrough's
  AP. *Discriminator:* walk each job tree's prerequisites and compare the cheapest live
  option per slot against the campaign's measured AP budget — a slot is only "reachable" if
  a number says so. Asserting the slot *exists*, or that an ability of that type is
  authored, passes identically when the cheapest one costs twice what the campaign pays
  out — which is what support (300 AP) and reaction (540 AP) did for the life of the repo
  against a ~280 AP budget. **Met** (ADR-0025). Capstones are deliberately excluded: the
  same test pins that the deepest passive stays beyond one campaign, so the bar is one a
  content pack could fail.
- **AC-M6 (help on demand, and only about what works):** The game SHALL offer an
  always-reachable explanation of its mechanics, and that text SHALL NOT describe a
  capability the shipped content cannot deliver. *Discriminator:* the help topics are data,
  and each topic claiming a chassis slot is asserted against AC-M5's reachability check —
  so the prose fails with the content rather than outliving it. A hand-written panel would
  read identically whether or not its claims were true. **Met** (ADR-0025).

- **AC-M7 (gear is horizontal and authored):** Equipment SHALL NOT form a power ladder,
  and the party's gear SHALL arrive on a schedule repetition cannot accelerate.
  *Discriminators, three, because the obvious one is not sufficient:* (a) no catalog weapon
  out-damages the baseline on a reference body; (b) **which weapon is best REORDERS across
  bodies** — without this, a ladder with its top rung removed passes (a) while every unit
  still wants the same weapon; (c) granting the same item twice changes nothing, walked
  across a full playthrough rather than per call. **Met** (ADR-0026), all three
  mutation-verified.

- **AC-M8 (the pack knows who speaks, and carries scenes that belong to no battle):** A
  story pack SHALL attribute each LINE, hold a `characters` registry the lines reference,
  and be able to author scenes anchored before a battle or before the ending. Every
  speaker and expression reference SHALL be resolved when the pack is PARSED, so a pack
  naming someone who does not exist fails to load rather than rendering a fallback.
  *Discriminators:* a beat whose two lines name **different** characters renders two name
  plates — a beat-level speaker cannot produce that, and a fixture where both lines name
  the same character scores identically under v1 and v2; the unresolvable-speaker case is
  a **pair**, the same pack with and without the character present, because an
  implementation resolving at render with a fallback accepts both; and the v1 migration is
  asserted on **both** halves — the rendered grouping *and* the registry size — since each
  alone passes a different wrong migration. **Met** (ADR-0029).

- **AC-M9 (the portrait slot is wired, and an unauthored portrait reads as absent):**
  A character's portrait SHALL reach the screen as a loaded image, and a line with no
  authored portrait SHALL render no image at all — never an empty framed box presented as
  art. *Discriminator — and the reason this AC is worded around the built output:* a
  capability that validates its input and discards it reads exactly like one that works.
  This repo shipped a support slot that type-checked its ability, rejected unlearned ones
  and enforced the chassis rules while `build.ts` ignored it entirely, and nine of fourteen
  builds wore a dead slot for two slices. So the claim is carried by an **A/B on the same
  built page**: a character with art against one without, asserting `naturalWidth > 0`
  rather than "an `<img>` exists" — the latter is satisfied by a broken image, by the asset
  KEY landing in `src`, and by a file that never reached `dist`. **Met** (ADR-0029).
  **Not asserted:** that any real portrait art exists. It does not; every portrait on
  screen is one self-labelling placeholder, and a tripwire test fails the day that changes.


> **NOT an M0 criterion: `docs/08` §3's teaching ramp.** Staged unlocks and the scripted
> "guided first build" are deliberately unbuilt (ADR-0025 decision 1, user decision
> 2026-08-22). The bet is that the mechanics read on their own with a `?` to fall back on.
> That bet is falsifiable and untested: **no newcomer has played this**. A playtest where a
> player cannot form a build without opening `?` is evidence against it, and §3's ramp is
> still on the shelf.
