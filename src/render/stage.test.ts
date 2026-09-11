import { describe, expect, it } from "vitest";
import { fitBox } from "./stage.js";

/**
 * `fitBox` (ADR-0043) — the "object-fit: contain" arithmetic that sizes the board
 * canvas's 900×440 backing store inside whatever CSS box the rail/band layout
 * leaves it. Pre-ADR-0043 `stage.test.ts` asserted a 360-unit virtual stage,
 * uniformly scaled and letterboxed as a WHOLE — that model is gone (`stage.ts`'s
 * own header explains why); what replaces it is one small fit, applied to one
 * element, and this file tests exactly that function, pure.
 */
describe("fitBox — object-fit: contain, computed by hand", () => {
  it("fits a WIDE container (the mockup's 780x272 board) by HEIGHT, pillarboxing the sides", () => {
    // 900:440 is narrower than 780:272 (2.045 vs 2.868), so height is the binding
    // constraint — DISCRIMINATING against "fit by width", which would overflow the
    // container's height instead.
    const box = fitBox({ width: 780, height: 272 }, 900, 440);
    expect(box.height).toBeCloseTo(272, 5);
    expect(box.width).toBeCloseTo((900 * 272) / 440, 5);
    expect(box.width).toBeLessThan(780); // pillarboxed, not stretched to fill
  });

  it("fits a TALL container by WIDTH, letterboxing top and bottom", () => {
    // 900:440 is wider than 300:300, so width is now the binding constraint — the
    // mirror case of the row above; a fit that hard-coded "always fit by height"
    // would pass the row above and fail this one.
    const box = fitBox({ width: 300, height: 300 }, 900, 440);
    expect(box.width).toBeCloseTo(300, 5);
    expect(box.height).toBeCloseTo((440 * 300) / 900, 5);
    expect(box.height).toBeLessThan(300);
  });

  it("UNIFORM: never a per-axis stretch, even when the container's aspect exactly inverts the content's", () => {
    // A non-uniform "stretch to fill" would return exactly `container` here (440x900,
    // filling BOTH axes) — this is the case that tells contain from stretch apart:
    // width is the binding constraint (900:440 fits inside 440:900 by width first),
    // so the box fills 440 wide but must NOT also fill 900 tall.
    const box = fitBox({ width: 440, height: 900 }, 900, 440);
    const scaleX = box.width / 900;
    const scaleY = box.height / 440;
    expect(scaleX).toBeCloseTo(scaleY, 9);
    expect(box.width).toBeCloseTo(440, 5); // width DOES fill — the binding axis
    expect(box.height).toBeLessThan(900); // height must NOT also fill — that would be a stretch
  });

  it("scales UP past 1:1 to fill a container larger than the content — the board is meant to grow", () => {
    const box = fitBox({ width: 1800, height: 880 }, 900, 440);
    expect(box.width).toBeCloseTo(1800, 5);
    expect(box.height).toBeCloseTo(880, 5);
  });

  it("an exact-aspect container is filled exactly, with no fractional slack either way", () => {
    const box = fitBox({ width: 450, height: 220 }, 900, 440);
    expect(box.width).toBeCloseTo(450, 9);
    expect(box.height).toBeCloseTo(220, 9);
  });

  /**
   * MUTATION: change `Math.min` to `Math.max` in `fitBox`. This is the ONLY case
   * that goes red — every case above happens to share a `min`/`max` answer's SIGN
   * on the box that ends up SMALLER, so a `max` mutant would still shrink-to-fit by
   * coincidence on a container that fits neither axis without also growing past the
   * other; this fixture is built so `min` and `max` disagree outright.
   */
  it("DISCRIMINATING: min() vs max() genuinely disagree on a container where either axis alone would overflow the other", () => {
    // Fitting by width (900->500, scale .5556) would need height 244, which OVERFLOWS
    // the 200-tall container; fitting by height (440->200, scale .4545) needs width
    // 409, which fits inside 500. `min(scaleX, scaleY)` must pick the height-bound
    // (smaller) scale; `max` would pick the width-bound one and overflow the box.
    const box = fitBox({ width: 500, height: 200 }, 900, 440);
    expect(box.height).toBeCloseTo(200, 5);
    expect(box.width).toBeCloseTo(409.0909, 3);
    expect(box.width).toBeLessThanOrEqual(500);
  });

  /** A degenerate container (a hidden screen measures 0x0) must not divide by zero. */
  it("a zero-sized container still yields a finite box", () => {
    const box = fitBox({ width: 0, height: 0 }, 900, 440);
    expect(Number.isFinite(box.width)).toBe(true);
    expect(Number.isFinite(box.height)).toBe(true);
  });
});
