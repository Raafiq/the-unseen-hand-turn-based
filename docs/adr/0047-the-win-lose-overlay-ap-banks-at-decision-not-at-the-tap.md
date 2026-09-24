# ADR-0047 — The win/lose overlay; AP banks at decision, not at the tap

- **Status:** Accepted — owner, 2026-09-19 (problem + shape), 2026-09-22/23 (Retry on
  Defeat, draw/stalemate/timeout read as Defeat).
- **Date:** 2026-09-23
- **Amends:** `docs/10` §3 (new `ENDED` row), `docs/10` §6 (AC-V70…AC-V78, new),
  `docs/11` AC-M3 (still holds — see Consequences), `src/render/CLAUDE.md`'s "screen
  the state machine skips" trap (a second instance, named below).
- **Acceptance Criteria:** AC-V70 … AC-V78, authored into `docs/10` in this slice.
- **Intent file:** `intent/win-lose-screen.md` (status updated to shipped, pointing here).

## Context

A battle used to end with one ribbon line ("Battle over") and a Continue button. Nothing
said Victory or Defeat. AP was banked when the player tapped Continue — which meant the
overlay this ADR adds could not show a real number without banking early, and banking
early meant a reload between decision and tap needed its own answer.

## Decision

### 1. A full-stage result overlay `[ENHANCEMENT]`

`src/render/result-overlay.ts` (pure data → HTML) plus `hud.ts` (mount, inertness,
focus) render VICTORY or DEFEAT in the concept look (ADR-0040/0041) the instant a
battle reaches `ENDED`. Victory lists all six members by portrait/name/`+N AP`, plus a
weapon-drip line when one was granted. Defeat drops the roster (owner note 2, leaner
card): "The party fell." / "No AP or new gear was awarded." / "Previously earned AP and
equipment are retained." Draw, stalemate and timeout render as Defeat (owner,
2026-09-22/23) — `verdictOf` maps the sim's five-member outcome enum, not a hand-picked
three.

The layer sits on the stage root at **z-index 9**, above every drawer/sheet (z-index 8).
Opening it hides the objective plaque, the ribbon and the ENDED toast, force-closes any
open drawer, and makes the board, rail, ☰ and arrow-key cursor movement inert
(`pickAt`, the keydown handler both check `resultOverlayOpen` first). Focus moves to the
action button on open.

### 2. AP banks when the battle is DECIDED, not when Continue is tapped `[ENHANCEMENT]`

`CampaignShell.result()` calls `bankResult()` (idempotent, guarded by `resultBanked`) on
its first read — the first repaint after `ENDED`, before any tap. `bankResult` calls the
same `resolveCampaignBattle` the headless runner uses; the overlay never re-derives a
verdict or a number, only reads `CampaignBattleRun.rewards` through `apGrantAmount`
(`src/sim/progression.ts`), with `NO_AP_REWARD` standing in for a member who did not
fight. `logBattleOutcome()` (playtest log) fires in the same window, guarded by its own
`outcomeLogged` flag, for the same reason: a reload between decision and tap must not
lose the log row.

This is the reason the overlay is possible at all — a Continue-time bank cannot show a
number that has not been computed yet.

### 3. Continue and Retry route through the scene player `[ENHANCEMENT]`

`advanceAfterResult()` (Continue on a win) and `retry()` (Retry on a loss) both call
`queueOutcomeSceneOrArrive()`: if the pack authors a `victory` or `defeat` beat for the
just-decided battle, it plays through the scene player (`outcomeScene`, checked first by
`activeScene()`) before landing; if not, they land directly. The **final** victory is
excluded — `COMPLETED` already reads `outcomeBeat()` inline, so queuing it here too would
show the same beat twice.

### 4. `AFTER_BATTLE` is demoted to a reload-only landing `[ENHANCEMENT]`

Live play never visits `AFTER_BATTLE` any more: `concludeBattle()` (win) goes through
`arrive()`, and the overlay's own Retry (`retry()`) skips it. The screen still exists,
for exactly one path — reloading mid-`gameOver`, where there is no live session left to
read an overlay off. It renders the defeat beat inline (`renderAfter()`), and `retry()`
reads `this.screen === "AFTER_BATTLE"` **before** it moves, to skip re-queuing a beat
already shown on that landing.

## Alternatives considered

1. **Bank on the Continue/Retry tap, as before.** Cannot show a real AP number on the
   overlay itself — the whole point of the slice. Rejected.
2. **A leaner overlay confined to the board cell, not full-stage.** Rejected on the
   approved frames: unreadable at 832×328, the asserted floor viewport.

## Consequences

- **`docs/11` AC-M3 ("losing is a state, not a crash") still holds — restated, not
  weakened.** A lost battle now reaches the game-over state the player can act on
  **sooner**: the Defeat overlay, at the moment of decision, with Retry live in it. The
  after-battle screen is no longer where a fresh loss is acknowledged; it is only where
  a *reloaded* one is.
- **Accepted, not built:** a reload mid-VICTORY loses that battle's queued victory
  scene — the win itself stays banked (see `game.ts`'s `outcomeLogged`/`pendingBattleStep`
  comments). Not green-lit: a tap to skip the scene, or any overlay animation.
- **A second instance of the "screen the state machine skips" trap
  (`src/render/CLAUDE.md`):** `AFTER_BATTLE` is now itself the skipped screen for live
  play, deliberately, and its defeat-beat rendering exists only to cover the one path
  that still reaches it (a reload).
- **New z-index rule for future viewer work:** any new drawer must sit at z-index ≤8;
  the result layer owns 9 and nothing above it.

## References

- `intent/win-lose-screen.md` — the owner's problem statement and decisions.
- `src/render/result-overlay.ts`, `hud.ts`, `stage.css` (`.tuh-result-layer`).
- `src/render/campaign-shell.ts` — `result()`, `bankResult()`, `advanceAfterResult()`,
  `retry()`, `queueOutcomeSceneOrArrive()`.
- `src/sim/progression.ts` — `apGrantAmount`, `NO_AP_REWARD`.
- `src/render/result-overlay.test.ts`, `e2e/result-overlay.spec.ts`,
  `campaign-shell.test.ts`.
- ADR-0043 §4 (temporary contextual overlays are already permitted at rest).
