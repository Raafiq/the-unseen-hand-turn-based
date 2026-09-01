/**
 * The DETERMINISTIC test seam's TYPE (docs/10 §7), declared in one place so
 * `src/render/main.ts` (which implements it) and `e2e/*.spec.ts` (which drives
 * it) can never drift. `tsconfig.json` includes `e2e`, so this module's global
 * `Window` augmentation is in scope for the Playwright specs too — the seam is
 * typechecked on both sides rather than being an `any` blob inside
 * `page.evaluate`.
 *
 * WHY A SEAM AT ALL: docs/10 §7 forbids the interaction suite from clicking raw
 * canvas pixels. Tests drive GRID coordinates through `clickTile`; the
 * pointer→tile mapping gets exactly ONE assertion via `clickCanvas` (AC-V10).
 * Otherwise every camera/iso tweak would break the whole suite for no
 * behavioural reason. Both entry points bottom out in the same `Session.onPick`
 * a real `pointerdown` uses — the seam is not a parallel implementation.
 */

import type { BattleState, Command, Position } from "../sim/index.js";
import type { ActPreview } from "./preview.js";
import type { Phase, TurnDraft } from "./session.js";

export interface ViewerApi {
  /**
   * WATCH MODE (a shipped feature, docs/10 §7): resolve the currently active
   * unit through the balance probe regardless of team, so a deterministic
   * scripted run exists for the Playwright baseline.
   */
  step: () => void;
  reset: () => void;
  getState: () => BattleState;
  /**
   * COMMANDS COMMITTED — not Step clicks. A matured charge or a KO'd unit's
   * crystal tick is absorbed inside `advanceToDecision` and consumes NO command,
   * so it does not increment this. One command === one settled living-unit turn.
   */
  turn: () => number;
  /** Activate a tile by GRID coordinate — the interaction suite's seam. */
  clickTile: (x: number, y: number) => void;
  /** Activate a tile by CANVAS PIXEL — the one AC-V10 pointer→tile assertion. */
  clickCanvas: (px: number, py: number) => void;
  /** Hover a tile by GRID coordinate (drives the preview; never touches the sim). */
  hoverTile: (x: number, y: number) => void;
  /**
   * The tile the last pick RESOLVED TO — how AC-V10 observes the pointer→tile
   * mapping end-to-end: `clickCanvas` at the plateau's projected centre must
   * leave this on the plateau, not on the flat tile a height-ignoring inverse
   * would return. Also the keyboard tile cursor's position.
   */
  cursor: () => Position | null;
  /** The current pure-UI-intent draft, or null. */
  draft: () => TurnDraft | null;
  /** The recorded command log, in order — AC-V9 replays it. */
  commands: () => Command[];
  cancel: () => void;
  endTurn: () => void;
  /** The docs/10 §3 state-machine state. */
  phase: () => Phase;
  /**
   * The docs/10 §4 transparency payload for the hovered target, or null.
   * DEFERRED fields are ABSENT FROM THE TYPE (no crit / reaction /
   * status-on-hit / elemental / AoE / LoS key exists on {@link ActPreview}), so
   * with `exactOptionalPropertyTypes` the compiler itself enforces the honesty
   * rule: you cannot even write `preview().crit` to print a fake zero.
   */
  preview: () => ActPreview | null;
  /** The transient illegal-click reason chip, or null. */
  reason: () => string | null;
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

declare global {
  interface Window {
    tuh: ViewerApi;
  }
}
