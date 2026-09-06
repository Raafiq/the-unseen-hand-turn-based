/**
 * THE LOGICAL STAGE (ADR-0037, docs/10 §8a) — the battle screen's one coordinate
 * system, and the arithmetic behind it.
 *
 * A landscape phone is WIDER than 16:9, not taller: the owner's device measures about
 * 851 x 324 CSS px. Height is the scarce axis, so height is what is fixed at 360
 * logical units; width follows the host's aspect, clamped to 640…900; the whole stage
 * is then scaled UNIFORMLY and centred, and whatever is left over is letterbox.
 *
 * ```
 * stageH = 360
 * stageW = clamp(640, round(360 * vw / vh), 900)
 * scale  = min(vw / stageW, vh / stageH)
 * ```
 *
 * `vw`/`vh` are the STAGE HOST's measured box — an element sized `100svw x 100svh`,
 * small viewport units deliberately, so a browser toolbar sliding away does not
 * re-lay-out the stage mid-turn. Everything downstream measures
 * `getBoundingClientRect()`, never a CSS custom property: a variable computed
 * correctly and applied to nothing reads as working from the variable's side
 * (docs/10 AC-V33).
 *
 * PURE ARITHMETIC FIRST, DOM SECOND. {@link stageGeometry} is a total function of two
 * numbers and is unit-tested at all five supported viewports (`stage.test.ts`);
 * {@link mountStage} is the thin part that writes it onto an element.
 *
 * NOTHING HERE TOUCHES THE SIM. No `BattleState`, no command, no clock: the stage is
 * presentation, and a resize must never be able to move a battle.
 */

/** Logical height of the stage, always. docs/10 §8a. */
export const STAGE_HEIGHT = 360;
/** Narrowest stage — reached at 1.78:1 and below (a 4:3 desktop window). */
export const STAGE_WIDTH_MIN = 640;
/** Widest stage — reached past 2.5:1, which on the test set is only 851x324. */
export const STAGE_WIDTH_MAX = 900;

/** A measured box, in CSS px. */
export interface StageBox {
  width: number;
  height: number;
}

/** Where the stage sits inside its host, and how big it is drawn. */
export interface StageGeometry {
  /** Logical width, in stage units. */
  stageW: number;
  /** Logical height, in stage units — always {@link STAGE_HEIGHT}. */
  stageH: number;
  /** Uniform scale applied on BOTH axes. */
  scale: number;
  /** Total horizontal letterbox (pillarbox), in CSS px, both sides together. */
  letterboxX: number;
  /** Total vertical letterbox, in CSS px, both sides together. */
  letterboxY: number;
}

/**
 * The width clamp, alone, so a test can name it.
 *
 * THE CLAMP IS INVISIBLE AT FOUR OF THE FIVE SUPPORTED VIEWPORTS. Only 851x324 —
 * the owner's own phone — reaches it: `round(360 * 851 / 324)` is 946, clamped to
 * 900, which is what produces that row's 41 px pillarbox. Drop the clamp and the
 * stage fills the width and only that row goes red (docs/10 AC-V33 discriminator c).
 */
export function stageWidthFor(box: StageBox): number {
  const vw = Math.max(1, box.width);
  const vh = Math.max(1, box.height);
  const fluid = Math.round((STAGE_HEIGHT * vw) / vh);
  return Math.min(STAGE_WIDTH_MAX, Math.max(STAGE_WIDTH_MIN, fluid));
}

/**
 * The whole derivation. `scale` is `min(...)` on purpose: a per-axis fit would stretch
 * the board off its 900:440 backing store, and `pickTile` inverts through the same
 * projection `draw` paints with — a stretched canvas does not fail, it silently misses
 * every tap by a constant factor (`src/render/CLAUDE.md`, AC-V19).
 */
export function stageGeometry(box: StageBox): StageGeometry {
  const vw = Math.max(1, box.width);
  const vh = Math.max(1, box.height);
  const stageW = stageWidthFor(box);
  const scale = Math.min(vw / stageW, vh / STAGE_HEIGHT);
  return {
    stageW,
    stageH: STAGE_HEIGHT,
    scale,
    letterboxX: vw - stageW * scale,
    letterboxY: vh - STAGE_HEIGHT * scale,
  };
}

/**
 * Write a geometry onto the stage element.
 *
 * `translate(-50%, -50%) scale(k)` about a 50%/50% transform origin, with the element
 * pinned at the host's centre point: the scaled box comes out centred, and its
 * `getBoundingClientRect()` is exactly `stageW * scale` by `stageH * scale`. That is
 * what makes the measured scale and the measured letterbox the same two numbers this
 * module computed — the instrument and the thing measured cannot drift apart.
 */
export function applyStage(stage: HTMLElement, g: StageGeometry): void {
  stage.style.width = `${g.stageW}px`;
  stage.style.height = `${g.stageH}px`;
  stage.style.transform = `translate(-50%, -50%) scale(${g.scale})`;
}

/** A live stage: recomputed on resize and on every `visualViewport` change. */
export interface StageController {
  /** The geometry currently applied. */
  geometry(): StageGeometry;
  /** Re-measure the host and re-apply. Safe to call as often as you like. */
  refresh(): void;
  /** Detach every listener. */
  dispose(): void;
}

/**
 * Bind a stage element to its host.
 *
 * BOTH `resize` AND `visualViewport` ARE LISTENED TO, and they are not the same event.
 * On a phone the visual viewport shrinks when a keyboard or a URL bar appears without
 * a window `resize` firing at all; on desktop the reverse. The settings readout
 * (docs/10 AC-V40) prints both boxes separately for exactly this reason — they can
 * disagree, and that disagreement is the bug an on-device readout exists to catch.
 *
 * `onChange` fires after every re-apply so the page can repaint anything sized in CSS
 * px rather than stage units (the canvas's tile readout is the only one today).
 */
export function mountStage(
  host: HTMLElement,
  stage: HTMLElement,
  onChange?: (g: StageGeometry) => void,
): StageController {
  let current = stageGeometry(host.getBoundingClientRect());

  const refresh = (): void => {
    current = stageGeometry(host.getBoundingClientRect());
    applyStage(stage, current);
    onChange?.(current);
  };

  refresh();

  const win = typeof window === "undefined" ? null : window;
  const vv = win?.visualViewport ?? null;
  win?.addEventListener("resize", refresh);
  win?.addEventListener("orientationchange", refresh);
  vv?.addEventListener("resize", refresh);
  vv?.addEventListener("scroll", refresh);

  return {
    geometry: () => current,
    refresh,
    dispose: () => {
      win?.removeEventListener("resize", refresh);
      win?.removeEventListener("orientationchange", refresh);
      vv?.removeEventListener("resize", refresh);
      vv?.removeEventListener("scroll", refresh);
    },
  };
}
