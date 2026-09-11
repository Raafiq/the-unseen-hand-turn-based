/**
 * THE BATTLE STAGE (ADR-0043) — the battle screen's geometry, and the arithmetic
 * behind it.
 *
 * ADR-0037's model is GONE from this file: a 360-logical-unit virtual stage,
 * uniformly scaled and letterboxed as a WHOLE, scaled every persistent HUD region
 * up and down with the viewport — which is exactly the "black-bar architecture"
 * ADR-0043 forbids, and the reason a wider/taller viewport could never give the
 * battlefield MORE room without also inflating the chrome around it.
 *
 * THE NEW MODEL. The stage's zones (the turn-order rail, the bottom band, the
 * board) are laid out by ordinary CSS Grid in REAL CSS PIXELS (`stage.css`), sized
 * against the ~832×328 reference viewport and held roughly constant in px as the
 * viewport grows — so extra space on a bigger screen goes to the battlefield, per
 * ADR-0043 decision 3, not to a scaled-up rail or band. `stageGeometry` in the old
 * sense — "the one scale factor" — no longer exists; there is nothing left to
 * derive it FROM.
 *
 * WHAT SURVIVES: only the board's own canvas still needs a scale, because its
 * BACKING STORE is a fixed 900×440 (`CANVAS_W`/`CANVAS_H`, `hud.ts`) while the box
 * CSS gives it is whatever is left after the rail and band are reserved — usually
 * a DIFFERENT aspect ratio. {@link fitBox} is the same "uniform min(), never a
 * per-axis stretch" rule `viewFor` uses for the board's own content, applied one
 * level up: a non-uniform stretch here would distort the painted scene and, worse,
 * silently break `pickTile`'s inverse the same way a stretched backing store would
 * (`src/render/CLAUDE.md`). {@link mountBoardFit} is the thin DOM part that keeps
 * a canvas element's CSS box exactly equal to that fit, so `canvas.getBoundingClientRect()`
 * — what every click handler measures — is never a lie about what is actually drawn.
 *
 * PURE ARITHMETIC FIRST, DOM SECOND, same discipline as before: {@link fitBox} is
 * a total function of three numbers and is unit-tested directly (`stage.test.ts`);
 * {@link mountBoardFit} is the part that writes it onto an element.
 *
 * NOTHING HERE TOUCHES THE SIM. No `BattleState`, no command, no clock: the stage
 * is presentation, and a resize must never be able to move a battle.
 */

/** A measured box, in CSS px. */
export interface StageBox {
  width: number;
  height: number;
}

/**
 * `object-fit: contain`, computed by hand rather than left to CSS: `canvas` is a
 * replaced element whose `getBoundingClientRect()` reports its LAYOUT box, not the
 * fitted content box, so `object-fit` on a canvas would make every click handler
 * measure a box bigger than what is actually drawn — silently, the exact class of
 * bug `src/render/CLAUDE.md` warns about for a stretched backing store. Sizing the
 * element itself, in JS, keeps the measured box and the drawn box the same box.
 *
 * Never upscales past 1:1 of the CONTENT's own size is not a rule here — the board
 * canvas is deliberately scaled UP to fill its allocation (that is the entire
 * point of `viewFor`'s camera existing one layer down); this fit only decides how
 * big the 900×440 backing store's CSS box gets, uniformly, before that camera ever
 * runs.
 */
export function fitBox(container: StageBox, contentW: number, contentH: number): StageBox {
  const cw = Math.max(1, container.width);
  const ch = Math.max(1, container.height);
  const scale = Math.min(cw / contentW, ch / contentH);
  return { width: contentW * scale, height: contentH * scale };
}

/** A live board-fit: recomputed on resize and on every `visualViewport` change. */
export interface BoardFitController {
  /** The box currently applied to the target element, in CSS px. */
  box(): StageBox;
  /** Re-measure the container and re-apply. Safe to call as often as you like. */
  refresh(): void;
  /** Detach every listener. */
  dispose(): void;
}

/**
 * Bind `target`'s CSS width/height to `container`'s measured box, fitted (never
 * stretched) to the `contentW`×`contentH` aspect, and re-fit on every resize.
 *
 * BOTH `resize` AND `visualViewport` ARE LISTENED TO — see the old stage.ts's
 * docstring for why they are not the same event; that reasoning is unchanged by
 * ADR-0043, it just now applies to one element instead of the whole HUD.
 */
export function mountBoardFit(
  container: HTMLElement,
  target: HTMLElement,
  contentW: number,
  contentH: number,
  onChange?: (box: StageBox) => void,
): BoardFitController {
  let current = fitBox(container.getBoundingClientRect(), contentW, contentH);

  const apply = (): void => {
    target.style.width = `${current.width}px`;
    target.style.height = `${current.height}px`;
  };

  const refresh = (): void => {
    current = fitBox(container.getBoundingClientRect(), contentW, contentH);
    apply();
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
    box: () => current,
    refresh,
    dispose: () => {
      win?.removeEventListener("resize", refresh);
      win?.removeEventListener("orientationchange", refresh);
      vv?.removeEventListener("resize", refresh);
      vv?.removeEventListener("scroll", refresh);
    },
  };
}
