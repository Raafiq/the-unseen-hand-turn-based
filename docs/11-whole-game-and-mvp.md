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
| ~~**A shell**~~ | **Built** (ADR-0023): `game.html` — title, New Game, Continue, quit, one save slot. |
| ~~**A campaign container**~~ | **Built** (ADR-0022): `src/sim/campaign.ts` sequences the battles and carries the party. |
| ~~**Persistence**~~ | **Built** (ADR-0023): `src/render/storage.ts` writes one `localStorage` slot. |
| **Story delivery** | No text before/after a battle. The story repo does not exist. |
| **Equipment** | ADR-0021 scoped it (horizontal gear). `build.ts` still uses one placeholder weapon. |
| **Economy** | No gil, no shops, no rewards loop. |
| **Failure handling** | No game-over, no retry, no consequence for losing. |
| **Onboarding** | `docs/08` §3 designs it; nothing implements it. |
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

> **STATUS 2026-08-21 — the shell has landed (ADR-0023).** The campaign is now playable
> by a person, end to end, at **`/game.html`**: title screen → New Game / Continue →
> briefing → the real battle → win or lose → next or retry → ending. One save slot in
> `localStorage`. `/` stays the engine viewer and links to it. What is done and what is
> not:
>
> | M0 item | State |
> |---|---|
> | 1. Shell | **done** — `game.html` + `src/render/campaign-shell.ts`; title, New Game, Continue, quit, one slot |
> | 2. Campaign container | **done** — headless (ADR-0022) and played (ADR-0023) |
> | 3. Between-battle loop | seam only — `updatePartyMember` is where prep writes; the briefing screen is where it mounts; no UI |
> | 4. Story stubs | **not started** |
> | 5. Equipment | **not started** |
> | 6. Failure handling | **done** — a loss reaches a game-over screen the player can act on, and retry restores the party exactly |
> | 7. Onboarding | **not started** |
>
> Persistence is now real: `src/render/storage.ts` is the only IO in the project, and
> `src/sim/campaign.ts` stays pure by contract. An unreadable slot (corrupt, another
> campaign, a version this build cannot migrate) is a message on the title screen with
> New Game still working — never a crash.

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

> **AC status 2026-08-21.** **AC-M1, AC-M2 and AC-M3 are met on both halves** — headless
> (`campaign.test.ts`, `campaign-run.test.ts`) and played, through the shell the browser
> drives (`campaign-shell.test.ts`, `e2e/campaign.spec.ts`). AC-M4 is not started.
>
> Two things those tests deliberately do NOT claim. First, the player seat in every
> automated run is the balance probe (watch mode) or a deliberate forfeit — so
> "completable" is evidence of **reachability**, not of difficulty. Second, the shell's
> `Session` is judged by `evalTerminal` against each encounter's own objectives; the
> conditionless demo battle on `/` still uses the team-wipe read, because that is all a
> battle with no `Condition` can honestly support (ADR-0023 decision 2).

- **AC-M1 (the slice is finishable):** A single playthrough of the M0 campaign SHALL be
  driveable from title screen to ending, and that path SHALL be asserted headlessly the way
  `docs/06` AC-E6 asserts a single encounter. *Discriminator:* a campaign that can start but
  cannot reach an ending passes any per-battle test.
- **AC-M2 (progress survives):** Party state SHALL persist across every battle boundary and
  across a save/load cycle, byte-identically. *Discriminator:* assert the round-trip, not
  that a save file was written — a save that writes and reloads wrong looks identical to one
  that works.
- **AC-M3 (losing is a state, not a crash):** A lost battle SHALL reach a game-over the
  player can act on, and retrying SHALL restore the pre-battle party exactly.
- **AC-M4 (the story seam is real):** Battle text SHALL be loaded from data satisfying the
  `docs/08` §4 contract, with **no** narrative content compiled into the engine.
  *Discriminator:* an A/B — swapping the story data changes what the player reads, with no
  code change.
