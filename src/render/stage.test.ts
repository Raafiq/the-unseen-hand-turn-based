import { describe, expect, it } from "vitest";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH_MAX,
  STAGE_WIDTH_MIN,
  stageGeometry,
  stageWidthFor,
} from "./stage.js";

/**
 * The stage arithmetic, at the five supported viewports (docs/10 §8a, AC-V33).
 *
 * WHY THESE FIVE AND NOT ONE. A fluid width has to be proved at both ends or it is
 * proved nowhere, and the three plausible wrong implementations each survive a
 * different subset of them:
 *
 *   (a) a fixed 16:9 stage — caught by 800x360, which must pillarbox by ZERO;
 *   (b) a non-uniform stretch-to-fit — caught by 1000x780, whose letterbox must be
 *       non-zero while both axes carry the SAME scale;
 *   (c) no 900 clamp — caught by 851x324 alone, and by nothing else in the set.
 *
 * The numbers below are `docs/10` §8a's table, not values read off this
 * implementation.
 */

/** docs/10 §8a: within 1 CSS px of the formula, and "none" means under 1 CSS px. */
const TOL = 1;

interface Row {
  name: string;
  vw: number;
  vh: number;
  stageW: number;
  scale: number;
  lbX: number;
  lbY: number;
}

const TABLE: Row[] = [
  { name: "640x300", vw: 640, vh: 300, stageW: 768, scale: 0.8333, lbX: 0, lbY: 0 },
  { name: "800x360", vw: 800, vh: 360, stageW: 800, scale: 1, lbX: 0, lbY: 0 },
  { name: "851x324 (the owner's phone)", vw: 851, vh: 324, stageW: 900, scale: 0.9, lbX: 41, lbY: 0 },
  { name: "900x390", vw: 900, vh: 390, stageW: 831, scale: 1.083, lbX: 0, lbY: 0.11 },
  { name: "1000x780", vw: 1000, vh: 780, stageW: 640, scale: 1.5625, lbX: 0, lbY: 217.5 },
];

describe("the stage geometry", () => {
  for (const row of TABLE) {
    it(`${row.name} derives docs/10 §8a's row`, () => {
      const g = stageGeometry({ width: row.vw, height: row.vh });
      expect(g.stageH).toBe(STAGE_HEIGHT);
      expect(g.stageW).toBe(row.stageW);
      expect(g.scale).toBeCloseTo(row.scale, 3);
      expect(Math.abs(g.letterboxX - row.lbX), `${row.name} pillarbox`).toBeLessThan(TOL);
      expect(Math.abs(g.letterboxY - row.lbY), `${row.name} letterbox`).toBeLessThan(TOL);
    });
  }

  /**
   * THE CLAMP DISCRIMINATOR, and it is why 851x324 is in the set at all.
   *
   * Asserted as a PILLARBOX rather than as a scale: with the clamp the scale is 0.9,
   * without it 0.8996 — four hundredths of a percent apart, a tie under any sane
   * tolerance. The pillarbox moves from 41 px to zero, which nothing can tie on.
   *
   * MUTATION: delete the `Math.min(STAGE_WIDTH_MAX, ...)` in `stageWidthFor`. Only
   * this case and the 851x324 row above go red; the other four stay green.
   */
  it("851x324 is the ONLY supported viewport that reaches the 900 clamp", () => {
    const box = { width: 851, height: 324 };
    const unclamped = Math.round((STAGE_HEIGHT * box.width) / box.height);
    expect(unclamped, "the fluid width must genuinely exceed the clamp here").toBe(946);
    expect(stageWidthFor(box)).toBe(STAGE_WIDTH_MAX);

    // What the unclamped stage would have produced: a full-width, letterbox-free fit.
    const wouldBe = Math.min(box.width / unclamped, box.height / STAGE_HEIGHT);
    expect(box.width - unclamped * wouldBe, "unclamped, the pillarbox vanishes").toBeLessThan(TOL);
    // What the clamp produces instead.
    expect(stageGeometry(box).letterboxX).toBeCloseTo(41, 0);

    // …and no OTHER supported viewport reaches it, so the clamp cannot be proved
    // anywhere else. A test set without 851x324 is a test set that cannot see it.
    for (const row of TABLE) {
      if (row.name.startsWith("851")) continue;
      expect(
        Math.round((STAGE_HEIGHT * row.vw) / row.vh),
        `${row.name} unexpectedly reaches the clamp`,
      ).toBeLessThan(STAGE_WIDTH_MAX);
    }
  });

  /**
   * THE LOW CLAMP, at the other end. 1000x780 is the desktop baseline and it wants a
   * 462-unit stage; 640 is the floor. Desktop is the NARROWEST stage, not the widest —
   * the point ADR-0037 had to correct in its own research brief.
   */
  it("a 4:3 desktop window is clamped UP to the narrowest stage, not down", () => {
    const box = { width: 1000, height: 780 };
    expect(Math.round((STAGE_HEIGHT * box.width) / box.height)).toBe(462);
    expect(stageWidthFor(box)).toBe(STAGE_WIDTH_MIN);
    expect(stageGeometry(box).letterboxY).toBeCloseTo(217.5, 1);
  });

  /**
   * UNIFORM, not per-axis. A stretch-to-fit shows zero letterbox everywhere, which is
   * why this is asserted as "one scale reproduces both axes" rather than as an
   * inequality on the letterbox alone.
   */
  it("the scale is the same on both axes at every supported viewport", () => {
    for (const row of TABLE) {
      const g = stageGeometry({ width: row.vw, height: row.vh });
      const fitX = row.vw / g.stageW;
      const fitY = row.vh / g.stageH;
      expect(g.scale).toBeLessThanOrEqual(fitX + 1e-9);
      expect(g.scale).toBeLessThanOrEqual(fitY + 1e-9);
      expect(Math.min(fitX, fitY)).toBeCloseTo(g.scale, 9);
    }
  });

  /**
   * A FIXED 16:9 STAGE is the obvious wrong answer — "design at a reference
   * resolution" — and this is the case that separates it. At 800x360 the formula
   * gives an 800-unit stage and no pillarbox at all; 16:9 gives 640 and 160 px of it.
   */
  it("800x360 pillarboxes by nothing, which a fixed 16:9 stage cannot do", () => {
    const g = stageGeometry({ width: 800, height: 360 });
    expect(g.letterboxX).toBeLessThan(TOL);
    const sixteenNine = Math.round(STAGE_HEIGHT * (16 / 9));
    expect(sixteenNine).toBe(640);
    expect(800 - sixteenNine * Math.min(800 / sixteenNine, 1)).toBeCloseTo(160, 0);
  });

  /** A degenerate host (a hidden screen measures 0x0) must not divide by zero. */
  it("a zero-sized host still yields a finite geometry", () => {
    const g = stageGeometry({ width: 0, height: 0 });
    expect(Number.isFinite(g.scale)).toBe(true);
    expect(g.stageW).toBe(STAGE_WIDTH_MIN);
    expect(g.stageH).toBe(STAGE_HEIGHT);
  });
});
