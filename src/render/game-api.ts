/**
 * The `window.tuhGame` seam's TYPE, shared by `game.ts` and the Playwright specs
 * (`tsconfig.json` includes `e2e`, so the seam is typechecked on both sides) — exactly
 * the arrangement `viewer-api.ts` uses for the engine viewer's `window.tuh`.
 *
 * It routes through the SAME shell methods the buttons call. There is no parallel path
 * for tests: `newGame()` here is `CampaignShell.newGame()`, the one a click reaches.
 */

import type { Screen } from "./campaign-shell.js";
import type { CampaignSave } from "../sim/index.js";

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
}

declare global {
  interface Window {
    tuhGame: GameApi;
  }
}
