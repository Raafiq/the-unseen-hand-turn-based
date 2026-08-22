/**
 * `pickTile` — the inverse of the isometric projection (render layer only).
 *
 * The point of these tests is that the inverse is NOT algebraic: `project`
 * lifts a tile up the screen by `height * HEIGHT_STEP`, so a taller tile in
 * front occludes tiles behind it and several tiles can cover one screen point.
 * Every test below (except the flat round-trip sanity check) is written so that
 * a height-IGNORING inverse gives a DIFFERENT answer — `naivePick` is that
 * wrong implementation, kept here and asserted against so the discriminating
 * property is proven, not assumed.
 */

import { describe, expect, it } from "vitest";
import { createBattleState, defaultUnit, makeFlatTiles, type BattleState, type Position } from "../sim/index.js";
import { makeDemoBattle } from "./demo.js";
import { draw, originFor, paintOrder, pickTile, pointInDiamond, project } from "./iso.js";

const CANVAS_W = 900;
const CANVAS_H = 600;

const ZERO: Position = { x: 0, y: 0 };
/** Half-extents of the top-face diamond, read OUT of `project` (never re-declared). */
const HALF_W = project(1, 0, 0, ZERO).x; // (x - y) * TILE_W / 2 with x-y = 1
const HALF_H = project(1, 0, 0, ZERO).y; // (x + y) * TILE_H / 2 with x+y = 1
/** Screen rise per unit of tile height, likewise derived from `project`. */
const HEIGHT_RISE = project(0, 0, 0, ZERO).y - project(0, 0, 1, ZERO).y;

/** A flat 9x7 grid — same footprint as the demo map, but zero relief. */
function flatBattle(): BattleState {
  const width = 9;
  const height = 7;
  return createBattleState({
    seed: 1,
    grid: { width, height, tiles: makeFlatTiles(width, height, 0) },
    units: [],
  });
}

/**
 * The WRONG inverse: solves the (x−y, x+y) transform for height 0 and rounds.
 * Present only as the foil the real `pickTile` must disagree with.
 */
function naivePick(state: BattleState, px: number, py: number): Position | null {
  const o = originFor(state, CANVAS_W, CANVAS_H);
  const u = (px - o.x) / HALF_W;
  const v = (py - o.y) / HALF_H;
  const x = Math.round((u + v) / 2);
  const y = Math.round((v - u) / 2);
  if (x < 0 || y < 0 || x >= state.grid.width || y >= state.grid.height) return null;
  return { x, y };
}

const pick = (state: BattleState, p: Position): Position | null =>
  pickTile(state, p.x, p.y, CANVAS_W, CANVAS_H);

describe("pickTile — flat round trip", () => {
  it("returns the same tile for every tile's projected centre", () => {
    const state = flatBattle();
    const origin = originFor(state, CANVAS_W, CANVAS_H);
    for (let y = 0; y < state.grid.height; y++) {
      for (let x = 0; x < state.grid.width; x++) {
        const centre = project(x, y, 0, origin);
        expect(pick(state, centre)).toEqual({ x, y });
      }
    }
  });
});

describe("pickTile — height occlusion (the discriminating case)", () => {
  // Demo map geometry (see `makeDemoBattle`): a height-2 plateau at (4,3) with a
  // height-1 skirt around it; everything else is flat.
  //
  // project(4,3,2) = origin + ((4-3)*HALF_W, (4+3)*HALF_H - 2*HEIGHT_RISE)
  //                = origin + (32, 112 - 36) = origin + (32, 76).
  // The FLAT tile (3,2) projects to origin + (32, 80) — only 4px below. Its
  // diamond covers the plateau's centre point (0/32 + 4/16 = 0.25 <= 1), and it
  // is painted EARLIER (x+y = 5 < 7), so the plateau is drawn on top of it.
  // A height-ignoring inverse maps that point to (3,2); the reverse-painter walk
  // must return (4,3).
  const PLATEAU: Position = { x: 4, y: 3 };
  const NAIVE_ANSWER: Position = { x: 3, y: 2 };

  it("picks the tall tile drawn on top, not the flat tile the naive inverse gives", () => {
    const state = makeDemoBattle();
    const origin = originFor(state, CANVAS_W, CANVAS_H);
    const p = project(PLATEAU.x, PLATEAU.y, 2, origin);

    // The overlap is real: the point lies inside BOTH top-face diamonds.
    expect(pointInDiamond(p.x, p.y, project(PLATEAU.x, PLATEAU.y, 2, origin))).toBe(true);
    expect(pointInDiamond(p.x, p.y, project(NAIVE_ANSWER.x, NAIVE_ANSWER.y, 0, origin))).toBe(true);
    // ...and the plateau is the one painted LAST, so it is what the user sees.
    const order = paintOrder(state.grid.width, state.grid.height);
    const idx = (t: Position): number => order.findIndex((c) => c.x === t.x && c.y === t.y);
    expect(idx(PLATEAU)).toBeGreaterThan(idx(NAIVE_ANSWER));

    expect(pick(state, p)).toEqual(PLATEAU);
    expect(pick(state, p)).not.toEqual(NAIVE_ANSWER);
    // A flat/naive implementation would return (3,2) here — this is the assertion
    // that fails against it.
    expect(naivePick(state, p.x, p.y)).toEqual(NAIVE_ANSWER);
  });

  it("still picks the plateau off-centre, where the overlap is deeper", () => {
    const state = makeDemoBattle();
    const origin = originFor(state, CANVAS_W, CANVAS_H);
    const centre = project(PLATEAU.x, PLATEAU.y, 2, origin);
    const p: Position = { x: centre.x, y: centre.y + HALF_H / 2 }; // 8px down, still inside
    expect(pick(state, p)).toEqual(PLATEAU);
    expect(naivePick(state, p.x, p.y)).toEqual(NAIVE_ANSWER);
  });
});

describe("pickTile — painter tie-break", () => {
  it("returns the front-most tile for a point on a shared diamond edge", () => {
    // Midpoint of the edge shared by (3,2) and (4,2) on a FLAT grid: both
    // diamonds contain it (0.5 + 0.5 = 1 exactly). (4,2) is painted later
    // (x+y = 6 > 5), so the reverse walk must return it; a forward walk (or any
    // "first match wins" ordering) would return (3,2).
    const state = flatBattle();
    const origin = originFor(state, CANVAS_W, CANVAS_H);
    const c = project(3, 2, 0, origin);
    const edge: Position = { x: c.x + HALF_W / 2, y: c.y + HALF_H / 2 };
    expect(pointInDiamond(edge.x, edge.y, project(3, 2, 0, origin))).toBe(true);
    expect(pointInDiamond(edge.x, edge.y, project(4, 2, 0, origin))).toBe(true);
    expect(pick(state, edge)).toEqual({ x: 4, y: 2 });
  });
});

describe("pickTile — off grid", () => {
  it("returns null for points outside the whole grid", () => {
    const state = makeDemoBattle();
    const origin = originFor(state, CANVAS_W, CANVAS_H);
    // Far outside the canvas entirely.
    expect(pick(state, { x: -1000, y: -1000 })).toBeNull();
    // Just past the grid's right corner (tile (8,0)), inside the canvas box but
    // outside the isometric rhombus.
    const right = project(8, 0, 0, origin);
    expect(pick(state, { x: right.x + HALF_W * 2, y: right.y })).toBeNull();
    // Above the back corner (tile (0,0)).
    const back = project(0, 0, 0, origin);
    expect(pick(state, { x: back.x, y: back.y - HALF_H * 3 })).toBeNull();
  });
});

describe("pickTile — height skirt (documented behaviour)", () => {
  // CHOSEN BEHAVIOUR: only TOP faces are pickable. A point on a vertical side
  // face selects whatever top face is painted there — usually a nearer, lower
  // tile drawn over the wall — or null when no top face covers it. Clicking a
  // plateau's wall never selects the plateau.
  it("a point on the plateau's left wall picks the nearer tile drawn over it, not the plateau", () => {
    const state = makeDemoBattle();
    const origin = originFor(state, CANVAS_W, CANVAS_H);
    const top = project(4, 3, 2, origin);
    // Midway along the left wall: the face spans y in [top.y+8, top.y+44] at
    // this x, so +30 is comfortably inside the wall quad.
    const onWall: Position = { x: top.x - HALF_W / 2, y: top.y + 30 };
    // The wall is overdrawn by the height-1 skirt tile (4,4) (x+y = 8 > 7),
    // whose top face covers this point.
    expect(pick(state, onWall)).toEqual({ x: 4, y: 4 });
    // The naive inverse would claim the plateau itself.
    expect(naivePick(state, onWall.x, onWall.y)).toEqual({ x: 4, y: 3 });
  });

  it("a point on a wall that no top face covers returns null", () => {
    const state = makeDemoBattle();
    const origin = originFor(state, CANVAS_W, CANVAS_H);
    const top = project(4, 4, 1, origin);
    // Left wall of the height-1 skirt tile (4,4); nothing is painted in front of
    // it there, so no top face contains the point.
    const onWall: Position = { x: top.x - HALF_W / 2, y: top.y + HEIGHT_RISE };
    expect(pick(state, onWall)).toBeNull();
    // The naive inverse would wrongly return (4,4) — this null is height-aware.
    expect(naivePick(state, onWall.x, onWall.y)).toEqual({ x: 4, y: 4 });
  });
});

describe("the board colours units by TEAM, not by a demo-only id table (playtest, 2026-08-22)", () => {
  /**
   * A recording 2D context: every method is a no-op, every `fillStyle` written is
   * kept. Enough for `draw`, and it makes the one thing no other test can see —
   * what colour actually reached the canvas — assertable.
   *
   * This is the test that was missing. `drawUnit` read `UNIT_META`, a table keyed by
   * the four DEMO unit ids, so every campaign unit (`blue-vance`, `red-brigand-1`)
   * missed the lookup and was painted one fallback grey — friend and foe alike. The
   * whole suite was green because nothing read pixels.
   */
  function recordingCtx(): { ctx: CanvasRenderingContext2D; fills: string[] } {
    const fills: string[] = [];
    const noop = (): void => {};
    const target = {
      set fillStyle(v: string) { fills.push(v); },
      get fillStyle() { return ""; },
      strokeStyle: "", lineWidth: 0, lineJoin: "", font: "", textAlign: "", globalAlpha: 1,
      clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop,
      fill: noop, stroke: noop, arc: noop, ellipse: noop, rect: noop, fillRect: noop,
      save: noop, restore: noop, setLineDash: noop, fillText: noop, strokeText: noop,
      translate: noop, scale: noop, measureText: () => ({ width: 0 }),
    };
    return { ctx: target as unknown as CanvasRenderingContext2D, fills };
  }

  function twoTeams(): BattleState {
    return createBattleState({
      seed: 1,
      grid: { width: 3, height: 3, tiles: makeFlatTiles(3, 3) },
      units: [
        defaultUnit("blue-vance", 0, { pos: { x: 0, y: 0 } }),
        defaultUnit("red-brigand-1", 1, { pos: { x: 2, y: 2 } }),
      ],
    });
  }

  it("DISCRIMINATING: two teams get two different token colours", () => {
    const { ctx, fills } = recordingCtx();
    draw(ctx, twoTeams(), CANVAS_W, CANVAS_H, {
      unitColor: (u) => (u.teamId === 0 ? "#4f8cff" : "#e2603c"),
    });
    // Both must actually reach the canvas. Asserting only that `unitColor` was CALLED
    // would pass on the broken version too, if it were called and then discarded.
    expect(fills).toContain("#4f8cff");
    expect(fills).toContain("#e2603c");
  });

  it("without a colour mapping, campaign-shaped ids fall back to ONE grey", () => {
    // Pins the old behaviour as the fallback rather than the default. If this ever
    // stops being true — say `UNIT_META` grows campaign ids — the test above is what
    // still guarantees the board distinguishes teams.
    const { ctx, fills } = recordingCtx();
    draw(ctx, twoTeams(), CANVAS_W, CANVAS_H, {});
    expect(fills).toContain("#9aa4bb");
    expect(fills).not.toContain("#4f8cff");
  });
});
