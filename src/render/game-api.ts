/**
 * The `window.tuhGame` seam's TYPE, shared by `game.ts` and the Playwright specs
 * (`tsconfig.json` includes `e2e`, so the seam is typechecked on both sides) — exactly
 * the arrangement `viewer-api.ts` uses for the engine viewer's `window.tuh`.
 *
 * It routes through the SAME shell methods the buttons call. There is no parallel path
 * for tests: `newGame()` here is `CampaignShell.newGame()`, the one a click reaches.
 */

import type { Screen } from "./campaign-shell.js";
import type { PlaytestLog } from "./telemetry.js";
import type { CampaignSave, LoadoutSlot, UnitRecord } from "../sim/index.js";

export interface GameApi {
  screen: () => Screen;
  /** The live save, or `null` before a game is started. */
  save: () => CampaignSave | null;
  canContinue: () => boolean;
  newGame: () => void;
  continueGame: () => void;
  eraseSave: () => void;
  deploy: () => void;
  /** Advance the live battle one turn through the balance probe (watch mode). */
  step: () => void;
  /** Play the live battle to its end. Deterministic — no timers, no wall-clock. */
  autoplay: () => void;
  battleOver: () => boolean;
  conclude: () => void;
  next: () => void;
  retry: () => void;
  quitToTitle: () => void;
  /** The raw string in the save slot, so a test can assert persistence, not just UI. */
  storedSave: () => string | null;
  /**
   * The between-battle prep panel (docs/11 M0 item 3), or `null` before it is mounted
   * (it needs a party, so there is none on the title screen).
   *
   * These are the SAME `PrepHandle` methods the panel's own controls call, so a test
   * driving them exercises the write-back path a player's click takes — including the
   * `onChange` that pushes the edit into the save.
   */
  prep: () => PrepSeam | null;
  /**
   * The playtest log (`docs/plans/slice-m1-synthetic-playtest.md` step B1) as stored —
   * a READ, exposed so a browser spec can assert the recorder survived a real reload.
   * Everything in it was produced by the paths a player's clicks take; there is no
   * recording path that only tests reach.
   */
  playtestLog: () => PlaytestLog;
  /** Throw the log away. The campaign save is untouched — they are separate keys. */
  clearPlaytestLog: () => void;
  /**
   * MOTION IS COSMETIC, AND THESE TWO CONTROL ITS CLOCK — nothing else.
   *
   * They exist because a screenshot taken straight after a state change lands on an
   * arbitrary animation frame, and a spec that "fixed" that with a sleep would be
   * timing-dependent on a loaded box. `settleMotion` jumps the current animation to its
   * finished frame; `freezeMotion(ms)` pins it at a CHOSEN instant (`null` restores the
   * live clock), which is how a gallery frame captioned "a damage popup is on screen"
   * stays true of the image it names. Neither touches the sim, emits a command, or is
   * reachable from any code path a player's click takes.
   */
  settleMotion: () => void;
  freezeMotion: (elapsedMs: number | null) => void;
}

/** The prep methods the page exposes; a subset of `PrepHandle`, by value where it can be. */
export interface PrepSeam {
  record: () => UnitRecord;
  records: () => UnitRecord[];
  select: (recordId: string) => void;
  commands: () => string[];
  setSlot: (slot: LoadoutSlot, value: string | null) => void;
  setJob: (jobId: string) => void;
  learn: (jobId: string, nodeId: string) => void;
}

declare global {
  interface Window {
    tuhGame: GameApi;
  }
}
