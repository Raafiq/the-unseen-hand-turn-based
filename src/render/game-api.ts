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
   * The playtest log as the page holds it (Part B).
   *
   * Read-only, like everything else about telemetry: there is no setter here and none on
   * the recorder either, because a log the page could be told what to say is not evidence.
   */
  playtestLog: () => PlaytestLog;
  /** The raw string in the LOG slot — the reload assertion, same reason `storedSave` exists. */
  storedLog: () => string | null;
  /**
   * The between-battle prep panel (docs/11 M0 item 3), or `null` before it is mounted
   * (it needs a party, so there is none on the title screen).
   *
   * These are the SAME `PrepHandle` methods the panel's own controls call, so a test
   * driving them exercises the write-back path a player's click takes — including the
   * `onChange` that pushes the edit into the save.
   */
  prep: () => PrepSeam | null;
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
