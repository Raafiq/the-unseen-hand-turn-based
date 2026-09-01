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
import { createBattleState, defaultUnit, makeFlatTiles, moveRange, parseEncounter, type BattleState, type Position, type UnitState } from "../sim/index.js";
import { ENCOUNTERS } from "./campaign-data.js";
import { makeDemoBattle } from "./demo.js";
import { DARK_THEME, draw, FIELD_THEME, HEADROOM, originFor, paintOrder, pickTile, pointInDiamond, project, viewFor, type DamagePopup, type DrawOptions, type MotionState } from "./iso.js";
import { POPUP_RISE_PX, settledMotion } from "./motion.js";
import { DAYLIGHT, parseTerrain, TERRAIN_KINDS, type TerrainMap } from "./terrain.js";

/**
 * THIS IS NOT THE SHIPPED CANVAS. `index.html` and `viewer.html` both declare
 * `900x440`; every number measured in this file is measured at `900x600`, which is
 * taller and therefore zooms MORE. Two consequences worth knowing before you read a
 * figure off a test here:
 *
 * - Scales differ. Battle 4 fits at 1.53 here and 1.15 on the real page; the demo board
 *   at 1.72 here and 1.28 there.
 * - AC-V19's unscaled point falls OFF the grid at this height and returns `null`. At
 *   900x440 the same point lands on tile (1, 2). `not.toEqual` is satisfied either way,
 *   which is why AC-V19's wording was weakened to "not the same tile".
 *
 * Deliberate — the ratios and orderings these tests assert are canvas-independent — but
 * do not quote a scale from here as if it were what a player sees.
 */
const CANVAS_W = 900;
const CANVAS_H = 600;

const ZERO: Position = { x: 0, y: 0 };
/** Half-extents of the top-face diamond, read OUT of `project` (never re-declared). */
const HALF_W = project(1, 0, 0, ZERO).x; // (x - y) * TILE_W / 2 with x-y = 1
const HALF_H = project(1, 0, 0, ZERO).y; // (x + y) * TILE_H / 2 with x+y = 1
/** Screen rise per unit of tile height, likewise derived from `project`. */
const HEIGHT_RISE = project(0, 0, 0, ZERO).y - project(0, 0, 1, ZERO).y;

/**
 * The five SHIPPED campaign maps, as battle states with whatever units the test wants.
 *
 * PURPOSE-BUILT FIXTURES ARE THE HOUSE PREFERENCE, and most of this file follows it. Two
 * claims here are about the boards a player actually sees, though — "no label is clipped
 * on any shipped map" and "every board got its area back" — and a hand-rolled 9x7 cannot
 * make either. Battle 1 is a 7x5 that zooms to 1.59 where battle 4 is an 11x7 with relief
 * at 1.15, and the tight one is not the one an author would think to write down.
 *
 * The grid is lifted from the encounter def exactly as `loadEncounter` does it, so a map
 * re-authored in `data/campaign/encounters` moves these tests with it.
 */
function shippedMaps(units: (grid: BattleState["grid"]) => UnitState[] = () => []): {
  id: string;
  state: BattleState;
}[] {
  return Object.entries(ENCOUNTERS).map(([id, def]) => {
    const enc = parseEncounter(def);
    const grid = {
      width: enc.grid.width,
      height: enc.grid.height,
      ...(enc.grid.tiles ? { tiles: enc.grid.tiles } : {}),
    };
    const state = createBattleState({ seed: enc.seed, grid, units: [] });
    const withUnits = units(state.grid);
    return {
      id,
      state: withUnits.length === 0 ? state : createBattleState({ seed: enc.seed, grid, units: withUnits }),
    };
  });
}

/** The tile drawn NEAREST THE TOP EDGE — the worst case for anything drawn above a unit. */
function backMostTile(state: BattleState, canvasW: number, canvasH: number): Position {
  const { origin } = viewFor(state, canvasW, canvasH);
  const { width, height, tiles } = state.grid;
  let best: Position = { x: 0, y: 0 };
  let top = Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = project(x, y, tiles[y * width + x]!.height, origin);
      if (p.y < top) {
        top = p.y;
        best = { x, y };
      }
    }
  }
  return best;
}

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

/**
 * Pick at a point given in WORLD units — the space `project` and `originFor` work in.
 *
 * `pickTile` takes CANVAS pixels, and the camera (`viewFor`) zooms the board to fit its
 * frame, so the two spaces differ by `scale`. Converting here rather than in each test
 * keeps every case below written in the projection's own coordinates, and means a camera
 * change moves these tests with the art instead of breaking them (docs/10 §8).
 */
const pick = (state: BattleState, p: Position): Position | null => {
  const { scale } = viewFor(state, CANVAS_W, CANVAS_H);
  return pickTile(state, p.x * scale, p.y * scale, CANVAS_W, CANVAS_H);
};

/** One `fillRect`, in CANVAS coordinates, with the colour it was filled in. */
interface RecordedRect { x: number; y: number; w: number; h: number; style: string; alpha: number }
/**
 * One `fillText`/`strokeText`, in CANVAS coordinates.
 *
 * `font` is recorded as well as `scale`, and the pair is what makes "this label is sized
 * in canvas pixels" assertable: the size a reader actually sees is the font's px times
 * the transform in force, and a label drawn under the camera has the camera's scale here.
 */
interface RecordedText { text: string; x: number; y: number; scale: number; alpha: number; style: string; font: string }
/** One `arc` that was actually stroked, with its angular sweep. */
interface RecordedArc { x: number; y: number; r: number; sweep: number; style: string }

interface Recording {
  ctx: CanvasRenderingContext2D;
  fills: string[];
  strokes: string[];
  rects: RecordedRect[];
  texts: RecordedText[];
  arcs: RecordedArc[];
}

/**
 * A recording 2D context: every method is a no-op, every `fillStyle` written is
 * kept. Enough for `draw`, and it makes the one thing no other test can see —
 * what actually reached the canvas — assertable.
 *
 * This is the test that was missing. `drawUnit` read `UNIT_META`, a table keyed by
 * the four DEMO unit ids, so every campaign unit (`blue-vance`, `red-brigand-1`)
 * missed the lookup and was painted one fallback grey — friend and foe alike. The
 * whole suite was green because nothing read pixels.
 *
 * IT NOW TRACKS THE TRANSFORM, and that is not decoration. Motion moves things: a
 * recoiled token, a numeral lifted clear of the HP bar and a swept ring are all
 * GEOMETRY, and a colour-presence recorder cannot tell a popup drawn on top of the
 * health bar from one drawn above it — the exact defect this slice fixes. `save`,
 * `restore`, `translate` and `scale` therefore maintain a real stack, and every
 * `fillRect` / `fillText` / stroked `arc` is recorded in CANVAS coordinates.
 */
function recordingCtx(): Recording {
  const fills: string[] = [];
  const strokes: string[] = [];
  const rects: RecordedRect[] = [];
  const texts: RecordedText[] = [];
  const arcs: RecordedArc[] = [];
  const noop = (): void => {};

  let tx = 0;
  let ty = 0;
  let sc = 1;
  let cur = "";
  const stack: { tx: number; ty: number; sc: number; alpha: number }[] = [];
  let pending: { x: number; y: number; r: number; sweep: number } | null = null;
  const X = (x: number): number => tx + x * sc;
  const Y = (y: number): number => ty + y * sc;

  // A gradient is a legal `fillStyle` and is NOT a colour, so it is recorded as
  // nothing rather than as "[object Object]" — an entry that would quietly satisfy a
  // `toContain` on some future string.
  const target = {
    set fillStyle(v: unknown) {
      if (typeof v === "string") { fills.push(v); cur = v; }
    },
    get fillStyle() { return cur; },
    // Recorded at STROKE time, not at assignment: what matters is the colour that was
    // actually drawn with, and `draw` sets `strokeStyle` in places it never strokes.
    strokeStyle: "" as string,
    lineWidth: 0, lineJoin: "", font: "", textAlign: "", textBaseline: "", globalAlpha: 1,
    clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop,
    quadraticCurveTo: noop, arcTo: noop, clip: noop,
    ellipse: noop, rect: noop,
    setLineDash: noop,
    measureText: (t: string) => ({ width: t.length * 6 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    save(): void { stack.push({ tx, ty, sc, alpha: target.globalAlpha }); },
    restore(): void {
      const f = stack.pop();
      if (!f) return;
      tx = f.tx; ty = f.ty; sc = f.sc; target.globalAlpha = f.alpha;
    },
    translate(x: number, y: number): void { tx = X(x); ty = Y(y); },
    // Uniform scale only: `draw` scales x and y by the same camera factor, and a
    // recorder that pretended otherwise would report geometry no frame ever had.
    scale(x: number, y: number): void {
      if (x !== y) throw new Error(`recordingCtx: non-uniform scale ${x}x${y}`);
      sc *= x;
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      rects.push({ x: X(x), y: Y(y), w: w * sc, h: h * sc, style: cur, alpha: target.globalAlpha });
    },
    fillText(t: string, x: number, y: number): void {
      texts.push({ text: t, x: X(x), y: Y(y), scale: sc, alpha: target.globalAlpha, style: cur, font: target.font });
    },
    strokeText(t: string, x: number, y: number): void {
      texts.push({ text: t, x: X(x), y: Y(y), scale: sc, alpha: target.globalAlpha, style: target.strokeStyle, font: target.font });
    },
    arc(x: number, y: number, r: number, a0: number, a1: number): void {
      pending = { x: X(x), y: Y(y), r: r * sc, sweep: Math.abs(a1 - a0) };
    },
    fill: noop,
    stroke(): void {
      strokes.push(target.strokeStyle);
      if (pending) { arcs.push({ ...pending, style: target.strokeStyle }); pending = null; }
    },
  };
  return { ctx: target as unknown as CanvasRenderingContext2D, fills, strokes, rects, texts, arcs };
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

describe("the camera — viewFor", () => {
  it("DISCRIMINATING: the click inverse honours the zoom", () => {
    // A zoom applied to the painting but not to the inverse offsets every click by a
    // factor nobody thinks to look for. The A/B is the unscaled point: it is what a
    // `pickTile` that ignored the camera would be handed, and it must MISS.
    const state = makeDemoBattle();
    const { origin, scale } = viewFor(state, CANVAS_W, CANVAS_H);
    expect(scale).toBeGreaterThan(1.05); // the camera really zooms; not a no-op A/B

    const world = project(4, 3, 2, origin);
    expect(pickTile(state, world.x * scale, world.y * scale, CANVAS_W, CANVAS_H)).toEqual({
      x: 4,
      y: 3,
    });
    expect(pickTile(state, world.x, world.y, CANVAS_W, CANVAS_H)).not.toEqual({ x: 4, y: 3 });
  });

  /**
   * The board's real on-screen extent: tile CORNERS, plus the room a prop or a status
   * chip occupies above a tile and the wall a tile drops below it.
   *
   * Asserting tile CENTRES — which the first version of this did — cannot see an
   * overflow at all: multiplying the fitted scale by 1.25 clipped the demo board on
   * both edges and every centre still landed inside the canvas. It also could not see
   * `HEADROOM` being set to 0, which is half of what the test's own name promises.
   */
  function extentOf(state: BattleState, canvasW: number, canvasH: number) {
    const { origin, scale } = viewFor(state, canvasW, canvasH);
    const { width, height, tiles } = state.grid;
    const half = project(1, 0, 0, ZERO); // { TILE_W/2, TILE_H/2 }, from the projection
    const step = HEIGHT_RISE;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const h = tiles[y * width + x]!.height;
        const p = project(x, y, h, origin);
        left = Math.min(left, (p.x - half.x) * scale);
        right = Math.max(right, (p.x + half.x) * scale);
        top = Math.min(top, (p.y - half.y - HEADROOM) * scale);
        bottom = Math.max(bottom, (p.y + half.y + (h + 1) * step) * scale);
      }
    }
    return { left, right, top, bottom, scale };
  }

  it("DISCRIMINATING: the whole board, its headroom and its base fit inside the canvas", () => {
    for (const state of [makeDemoBattle(), flatBattle()]) {
      const e = extentOf(state, CANVAS_W, CANVAS_H);
      expect(e.left).toBeGreaterThanOrEqual(0);
      expect(e.right).toBeLessThanOrEqual(CANVAS_W);
      expect(e.top).toBeGreaterThanOrEqual(0);
      expect(e.bottom).toBeLessThanOrEqual(CANVAS_H);
    }
  });

  it("HEADROOM clears the tallest WORLD thing drawn above a tile", () => {
    // NEVER ANCHOR A CHECK ON THE THING IT IS CHECKING. The extent helper above reads
    // the shipped `HEADROOM`, so setting it to 0 moved the code AND the expectation
    // together and the fit test stayed green — measured. The floor here is an
    // INDEPENDENT constant, read off what `iso.ts` actually draws above `top.y`:
    // a tree canopy reaches `base - 42 - 9` ≈ 51px, the tallest prop, and it is the
    // tallest thing that does NOT clamp itself.
    //
    // WORLD TENANTS ONLY, since 2026-09-01 (ADR-0032's amendment). The damage numeral
    // and the turn plate are no longer among them — they are drawn outside the camera
    // transform and clamp into the viewport instead of being reserved for, which is what
    // let this constant go back from 72 to 54 and give every board its area back. The
    // status-chip row nominally reaches 58 (`cy - 38`, `cy = top.y - 20`) but has
    // clamped itself off the top edge since long before any of this, so it is not the
    // binding tenant either.
    // If a taller prop or a second chip row lands, this number moves WITH it, on
    // purpose — and it fails first, which is the point.
    const TALLEST_WORLD_THING_ABOVE_A_TILE = 51;
    expect(HEADROOM).toBeGreaterThanOrEqual(TALLEST_WORLD_THING_ABOVE_A_TILE);
  });

  it("DISCRIMINATING: the board got back the area the label reservation had cost it", () => {
    // The other half of the same amendment, and the half a floor on `HEADROOM` cannot
    // see: the point of moving the labels was BOARD SIZE, so the assertion is on the
    // camera's scale, not on the constant that drives it.
    //
    // MEASURED at the SHIPPED 900x440 canvas (this file measures everything else at
    // 900x600 — see the note at the top). Per shipped map, `HEADROOM` 72 → 54:
    //   b1 1.489 → 1.591 · b2 1.338 → 1.419 · b3 1.214 → 1.280
    //   b4 1.099 → 1.154 · b5 1.111 → 1.167          (+5.0% to +6.9%)
    // The floors below sit between the two readings, so this fails the day a label's
    // footprint is charged to the camera again — which is the mutation it catches
    // (`HEADROOM = 72`), and it was run.
    const floors: Record<string, number> = {
      "camp-b1-the-toll-road": 1.54,
      "camp-b2-ambush-at-the-ford": 1.38,
      "camp-b3-the-hollow-watch": 1.25,
      "camp-b4-the-broken-span": 1.13,
      "camp-b5-the-warchiefs-camp": 1.14,
    };
    const maps = shippedMaps();
    // The manifest is checked BOTH ways: a sixth battle with no floor, or a floor for a
    // map that no longer ships, both fail here rather than quietly measuring four maps.
    expect(maps.map((m) => m.id).sort()).toEqual(Object.keys(floors).sort());
    for (const { id, state } of maps) {
      expect(viewFor(state, 900, 440).scale, id).toBeGreaterThan(floors[id]!);
    }
  });

  it("uses the frame it is given rather than leaving it half empty", () => {
    // The camera exists because a small map drew at under half the canvas. A fit that
    // is merely *inside* the frame satisfies the test above at any scale; this is the
    // half that says it actually filled it. Re-measured 2026-08-30 on the demo board:
    // 0.978 of one axis here, 0.955 on the shipped 900x440 canvas. (The old comment said
    // 0.93; that was never the reading.) The floor is well below both, so it fails on a
    // real regression rather than on a pixel of drift.
    const e = extentOf(makeDemoBattle(), CANVAS_W, CANVAS_H);
    const fill = Math.max((e.right - e.left) / CANVAS_W, (e.bottom - e.top) / CANVAS_H);
    expect(fill).toBeGreaterThan(0.85);
  });

  it("a map with RELIEF is not drawn smaller than a flat one of the same footprint", () => {
    // Earned. The bound charged the tallest tile's lift at the top AND its base at the
    // bottom, though one tile cannot be at both corners — so the only shipped map with
    // height came out below 1:1 while every flat map sat near 1.4. The discriminating
    // pair is the same footprint with and without relief: an over-estimating bound
    // gives the raised one a strictly smaller scale.
    const flat = createBattleState({
      seed: 1,
      grid: { width: 9, height: 7, tiles: makeFlatTiles(9, 7, 0) },
      units: [],
    });
    const raised = createBattleState({
      seed: 1,
      grid: {
        width: 9,
        height: 7,
        tiles: makeFlatTiles(9, 7, 0).map((t, i) => (i % 3 === 0 ? { ...t, height: 2 } : t)),
      },
      units: [],
    });
    const flatScale = viewFor(flat, CANVAS_W, CANVAS_H).scale;
    const raisedScale = viewFor(raised, CANVAS_W, CANVAS_H).scale;
    // Relief genuinely costs some vertical room, so this is a proportion, not equality.
    expect(raisedScale).toBeGreaterThan(flatScale * 0.85);
  });

  it("clamps rather than shrinking without limit, and says so", () => {
    // The previous version of this test was called "shrinks rather than overflowing"
    // and its own fixture overflowed by 380px: a 40x40 board clamps at MIN_ZOOM and
    // `scale < 1` is satisfied by the clamp, not by a fit. Assert the clamp, which is
    // what actually happens, and assert that it IS the clamp rather than a fit.
    const big = createBattleState({
      seed: 1,
      grid: { width: 40, height: 40, tiles: makeFlatTiles(40, 40) },
      units: [],
    });
    const scale = viewFor(big, CANVAS_W, CANVAS_H).scale;
    expect(scale).toBeLessThan(1);
    const e = extentOf(big, CANVAS_W, CANVAS_H);
    // At the clamp the board is deliberately WIDER than the canvas — the alternative is
    // a board too small to read. Pinning it here stops a future reader taking the
    // previous test's name at face value.
    expect(e.right - e.left).toBeGreaterThan(CANVAS_W);
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

  // ── painted ground ────────────────────────────────────────────────────────
  //
  // The A/B is on the OUTPUT, not on the input: every assertion below draws the same
  // battle twice, once with terrain and once without, and asserts the two frames differ
  // in the specific way the feature claims. A test that merely passed a terrain map and
  // checked it was accepted would look identical whether `draw` painted it or dropped it.

  const GRASS = DAYLIGHT.surfaces.grass.base;
  const WATER = DAYLIGHT.surfaces.water.base;

  // ── colour maths, for the range-panel floors below ────────────────────────

  /** `#rgb`, `#rrggbb` or `#rrggbbaa` -> [r, g, b, a] with a in 0..1. */
  function rgba(hex: string): [number, number, number, number] {
    const n = hex.replace("#", "");
    const at = (i: number): number => parseInt(n.slice(i, i + 2), 16);
    return [at(0), at(2), at(4), n.length >= 8 ? at(6) / 255 : 1];
  }

  /** Source-over composite of a possibly-translucent `fg` onto an opaque `bg`. */
  function compositeOver(fg: string, bg: string): string {
    const [fr, fg_, fb, a] = rgba(fg);
    const [br, bg_, bb] = rgba(bg);
    const mix = (f: number, b: number): number => Math.round(a * f + (1 - a) * b);
    return `#${[mix(fr, br), mix(fg_, bg_), mix(fb, bb)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  const srgbToLinear = (c: number): number =>
    c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4;

  /** WCAG relative luminance. Used only for the "always lighter" direction check. */
  function luminance(hex: string): number {
    const [r, g, b] = rgba(hex).map(srgbToLinear) as [number, number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** CIE L*a*b* (D65), the space CIEDE2000 is defined in. */
  function toLab(hex: string): [number, number, number] {
    const [r, g, b] = rgba(hex).map(srgbToLinear) as [number, number, number, number];
    const f = (t: number): number =>
      t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
    const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
    const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
    const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  /**
   * CIEDE2000 perceptual colour difference. ~1 is the just-noticeable difference for
   * adjacent patches; >10 is unmistakable. This is the metric a "can I tell these two
   * tiles apart" question needs, where a WCAG ratio answers a different question —
   * see the floor test for why that distinction is the whole point here.
   */
  function deltaE00(c1: string, c2: string): number {
    const rad = Math.PI / 180;
    const [L1, a1, b1] = toLab(c1);
    const [L2, a2, b2] = toLab(c2);
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cbar = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
    const ap1 = (1 + G) * a1;
    const ap2 = (1 + G) * a2;
    const Cp1 = Math.hypot(ap1, b1);
    const Cp2 = Math.hypot(ap2, b2);
    const hue = (a: number, b: number): number => {
      if (a === 0 && b === 0) return 0;
      const d = Math.atan2(b, a) / rad;
      return d < 0 ? d + 360 : d;
    };
    const hp1 = hue(ap1, b1);
    const hp2 = hue(ap2, b2);
    const dL = L2 - L1;
    const dC = Cp2 - Cp1;
    let dh = 0;
    if (Cp1 * Cp2 !== 0) {
      dh = hp2 - hp1;
      if (dh > 180) dh -= 360;
      else if (dh < -180) dh += 360;
    }
    const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * rad) / 2);
    const Lbar = (L1 + L2) / 2;
    const Cpbar = (Cp1 + Cp2) / 2;
    let hbar: number;
    if (Cp1 * Cp2 === 0) hbar = hp1 + hp2;
    else {
      hbar = (hp1 + hp2) / 2;
      if (Math.abs(hp1 - hp2) > 180) hbar += hp1 + hp2 < 360 ? 180 : -180;
    }
    const T =
      1 -
      0.17 * Math.cos((hbar - 30) * rad) +
      0.24 * Math.cos(2 * hbar * rad) +
      0.32 * Math.cos((3 * hbar + 6) * rad) -
      0.2 * Math.cos((4 * hbar - 63) * rad);
    const Sl = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2);
    const Sc = 1 + 0.045 * Cpbar;
    const Sh = 1 + 0.015 * Cpbar * T;
    const Rt =
      -2 *
      Math.sqrt(Cpbar ** 7 / (Cpbar ** 7 + 25 ** 7)) *
      Math.sin(60 * Math.exp(-(((hbar - 275) / 25) ** 2)) * rad);
    return Math.sqrt(
      (dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh),
    );
  }

  function flat3x3(): TerrainMap {
    return parseTerrain(["ggg", "ggg", "ggg"]);
  }

  it("DISCRIMINATING: terrain paints the ground, and its absence does not", () => {
    const withTerrain = recordingCtx();
    draw(withTerrain.ctx, twoTeams(), CANVAS_W, CANVAS_H, { terrain: flat3x3() });
    const without = recordingCtx();
    draw(without.ctx, twoTeams(), CANVAS_W, CANVAS_H, {});

    expect(withTerrain.fills).toContain(GRASS);
    expect(without.fills).not.toContain(GRASS);
    // And the flat fill it REPLACES is gone, so this is a swap rather than an overlay.
    expect(without.fills).toContain(DARK_THEME.top);
    expect(withTerrain.fills).not.toContain(DARK_THEME.top);
  });

  it("DISCRIMINATING: no grid line is stroked on painted ground", () => {
    // The whole point of the direction. FFT draws no grid on the ground; a stroke on
    // every tile is what made this board read as tiles rather than as a place.
    const withTerrain = recordingCtx();
    draw(withTerrain.ctx, twoTeams(), CANVAS_W, CANVAS_H, {
      terrain: flat3x3(),
      theme: FIELD_THEME,
    });
    const without = recordingCtx();
    draw(without.ctx, twoTeams(), CANVAS_W, CANVAS_H, { theme: FIELD_THEME });

    // 9 tiles, one grid stroke each, without terrain — and none with it.
    expect(without.strokes.filter((s) => s === FIELD_THEME.grid)).toHaveLength(9);
    expect(withTerrain.strokes).not.toContain(FIELD_THEME.grid);
  });

  it("paints each authored tile's own surface, not one colour for the map", () => {
    const { ctx, fills } = recordingCtx();
    draw(ctx, twoTeams(), CANVAS_W, CANVAS_H, {
      terrain: parseTerrain(["ggg", "gwg", "ggg"]),
    });
    expect(fills).toContain(GRASS);
    expect(fills).toContain(WATER);
  });

  it("DISCRIMINATING: a prop is painted AFTER every tile, not inside the tile walk", () => {
    // Earned. Drawing a tree inside the painter's walk let the very next tile paint
    // over its canopy — on a flat map that is every tree on the board, and four of the
    // five campaign maps are flat (battle 4 has height since ADR-0031, but every
    // passable tile on it sits at the same height). This asserts the second pass by
    // ORDER: the leaf colour must
    // arrive after the last ground fill. Interleaved, a back-row tree fails it.
    const { ctx, fills } = recordingCtx();
    draw(ctx, twoTeams(), CANVAS_W, CANVAS_H, {
      terrain: parseTerrain(["ggg", "ggg", "ggg"], [{ pos: { x: 0, y: 0 }, kind: "tree" }]),
    });
    const lastGround = fills.lastIndexOf(GRASS);
    const firstLeaf = fills.indexOf(DAYLIGHT.leaf);
    expect(firstLeaf).toBeGreaterThan(-1);
    expect(lastGround).toBeGreaterThan(-1);
    expect(firstLeaf).toBeGreaterThan(lastGround);
  });

  it("DISCRIMINATING: painting terrain changes NO rule — legal moves are identical", () => {
    // AC-V18 states this as a testable claim and nothing asserted it. It is
    // structurally true today (`terrain.ts` imports only a type from the sim), but the
    // repo's own rule is that an unasserted number in a spec is worse than an absent
    // one — a future terrain field that quietly reached `BattleState` would satisfy
    // every other test on this page.
    //
    // Reaches THROUGH the renderer to the sim's own answer: the same state, drawn both
    // ways, must give byte-identical move ranges and serialize identically.
    const state = twoTeams();
    const actor = state.units[0]!;
    const range = () => moveRange(state.grid, state.units, actor.id);
    const before = JSON.stringify(range());
    const stateJson = JSON.stringify(state);

    draw(recordingCtx().ctx, state, CANVAS_W, CANVAS_H, {});
    const plain = JSON.stringify(range());
    draw(recordingCtx().ctx, state, CANVAS_W, CANVAS_H, {
      terrain: parseTerrain(["ggg", "gwg", "ggg"]),
      theme: FIELD_THEME,
    });
    const painted = JSON.stringify(range());

    expect(painted).toBe(plain);
    expect(painted).toBe(before);
    expect(JSON.stringify(state)).toBe(stateJson);
    // Non-degeneracy: a `moveRange` that returned nothing would satisfy every equality
    // above. The painted pond at (1,1) is deliberately INSIDE the range — that is the
    // walkable-water lie ADR-0030 records, asserted rather than assumed.
    const tiles = range();
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles).toContainEqual({ x: 1, y: 1 });
  });

  // ── the move-range panel over painted ground ──────────────────────────────

  it("DISCRIMINATING: the range panel is painted, and painted AFTER the ground", () => {
    // Two claims in one, because the second is what makes every colour number in
    // `FIELD_THEME`'s comment mean anything. If the panel were drawn BEFORE the tile's
    // surface, the ground would composite over the panel instead and the whole measured
    // table would be backwards — while a fill-presence assertion stayed green, because
    // the colour still reached the canvas.
    // THE PANELLED TILE IS THE ONLY SAND ON THE MAP, and that is the whole fixture.
    // A flat all-grass board cannot test the order: every tile fills with the same
    // string, so `panel` sits between a `GRASS` before it and a `GRASS` after it no
    // matter which way round the two passes run. Measured — that version of this test
    // was green against a mutant that repainted the ground on top of the panel. Giving
    // the range tile a unique surface makes `indexOf(SAND)` name THAT tile's ground.
    const SAND = DAYLIGHT.surfaces.sand.base;
    const oneSand = parseTerrain(["ggg", "gsg", "ggg"]);
    const withRange = recordingCtx();
    draw(withRange.ctx, twoTeams(), CANVAS_W, CANVAS_H, {
      terrain: oneSand,
      theme: FIELD_THEME,
      range: [{ x: 1, y: 1 }],
    });
    const without = recordingCtx();
    draw(without.ctx, twoTeams(), CANVAS_W, CANVAS_H, {
      terrain: oneSand,
      theme: FIELD_THEME,
    });

    // A/B on the output: the same board, drawn with and without a range.
    expect(withRange.fills).toContain(FIELD_THEME.highlight);
    expect(without.fills).not.toContain(FIELD_THEME.highlight);
    expect(withRange.strokes).toContain(FIELD_THEME.highlightEdge);
    // The ground under it is painted either way — so the A/B above is the panel
    // appearing, not the tile appearing.
    expect(without.fills).toContain(SAND);

    // Order: that tile's own surface, then the panel over it.
    const ground = withRange.fills.indexOf(SAND);
    const panel = withRange.fills.indexOf(FIELD_THEME.highlight);
    expect(ground).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(ground);
    // Exactly one sand tile, so `indexOf` is unambiguous rather than the first of many.
    expect(withRange.fills.lastIndexOf(SAND)).toBe(ground);
  });

  it("DISCRIMINATING: the range panel separates from every ground it can sit on", () => {
    // WHY THIS IS NOT A WCAG CHECK. `FIELD_THEME.highlight`'s comment tabulates WCAG
    // contrast ratios, and on `sand.base` the ratio is 1.07 — which reads as "the panel
    // is invisible on sand" and is wrong. WCAG contrast is a LUMINANCE-ONLY metric built
    // for text on a background; sand and the composited panel happen to share a
    // luminance while sitting on opposite sides of the colour wheel. Judged
    // perceptually (CIEDE2000) that pair is 29.8 apart — one of the LARGEST separations
    // on the board, and the frames agree. A luminance floor here would fail the
    // shipped, legible colour and pass colours that are genuinely worse.
    //
    // TWO FLOORS, BECAUSE THE CONSTRAINT IS TWO-SIDED. Three previous panel colours each
    // fixed one ground and collided with the next, so one floor cannot express it:
    //   - own-ground: a panelled tile must not look like the SAME tile unpanelled.
    //   - cross:      a panelled tile must not look like a DIFFERENT bare ground.
    // Mutation-verified below; each historical failure trips exactly one of them.
    //
    // `base` only. `mottle` and `detail` are scatter — ellipses and 1.3px crest strokes
    // over the base, not a field — and a tile is read by its base, the same exclusion
    // `terrain.test.ts` makes for the canopy floor. Stated so it cannot be mistaken for
    // an oversight: `water.mottle` is 10.8 and would fail this floor, and that is
    // correct, because nobody compares a ripple to a ripple.
    const MIN_DE = 15;
    const bases = TERRAIN_KINDS.map((k) => [k, DAYLIGHT.surfaces[k].base] as const);
    const panelOn = (ground: string): string =>
      compositeOver(FIELD_THEME.highlight, ground);

    for (const [kind, ground] of bases) {
      expect(deltaE00(panelOn(ground), ground), `panel on ${kind}`).toBeGreaterThan(
        MIN_DE,
      );
      for (const [other, otherGround] of bases) {
        if (other === kind) continue;
        expect(
          deltaE00(panelOn(ground), otherGround),
          `panel on ${kind} vs bare ${other}`,
        ).toBeGreaterThan(MIN_DE);
      }
    }

    // The direction the design rests on: lighter than the ground, on every one of the
    // 18 shipped tones — not just the 6 bases the floors above cover.
    for (const kind of TERRAIN_KINDS) {
      const s = DAYLIGHT.surfaces[kind];
      for (const tone of [s.base, s.mottle, s.detail]) {
        expect(luminance(panelOn(tone)), `panel on ${kind} ${tone}`).toBeGreaterThan(
          luminance(tone),
        );
      }
    }

    // NON-DEGENERACY, from this repo's own history — both colours below SHIPPED, and
    // between them they show why ONE floor cannot hold this.
    //
    // `#8fd0ff` at 34% "desaturated to grey over green": it fails the own-ground floor.
    const tooFaint = compositeOver("#8fd0ff57", DAYLIGHT.surfaces.grass.base); // 0x57 = 34%
    expect(deltaE00(tooFaint, DAYLIGHT.surfaces.grass.base)).toBeLessThan(MIN_DE);
    //
    // `#2d6fd8` at 65% is the interesting one. Over grass it is 44 apart from its own
    // ground — it PASSES the own-ground floor on the tile its author was looking at,
    // which is exactly why it shipped. What it fails is the CROSS floor: panelled grass
    // landed within four points of the bare river, so on the ford the tiles you may
    // walk to and the water were the same colour. Drop the cross floor and this colour
    // comes back.
    const collides = compositeOver("#2d6fd8a6", DAYLIGHT.surfaces.grass.base); // 0xa6 = 65%
    expect(deltaE00(collides, DAYLIGHT.surfaces.grass.base)).toBeGreaterThan(MIN_DE);
    expect(deltaE00(collides, DAYLIGHT.surfaces.water.base)).toBeLessThan(MIN_DE);
    // And the helper can report a PASS as well as a fail, or the floors are a formality.
    expect(deltaE00("#ffffff", "#000000")).toBeGreaterThan(MIN_DE);
    expect(deltaE00("#8fd0ff", "#8fd0ff")).toBeCloseTo(0, 5);
  });

  it("refuses a terrain map that does not cover the grid", () => {
    const { ctx } = recordingCtx();
    expect(() =>
      draw(ctx, twoTeams(), CANVAS_W, CANVAS_H, { terrain: parseTerrain(["gg", "gg"]) }),
    ).toThrow(/2x2, grid is 3x3/);
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

/**
 * MOTION — what actually reached the canvas (docs/10, option B, 2026-09-01).
 *
 * EVERY TEST HERE IS AN A/B ON THE OUTPUT. `draw` gains one optional argument, and the
 * failure mode of an optional argument is that it is type-checked, accepted and then
 * dropped — a slot that validates its input and ignores it looks identical to a working
 * one from the inside. So each assertion draws the SAME state twice, once with `motion`
 * and once without, and states how the two frames differ. A test that only handed a
 * `MotionState` in and checked `draw` did not throw would prove nothing.
 *
 * The geometry assertions are the point of widening the recorder: the live defect this
 * slice fixes is a numeral drawn ON TOP OF the health bar, and no colour-presence check
 * can see where something landed.
 */
describe("motion — the animated frame, A/B against the settled one", () => {
  /** One unit, damaged, on a flat board: exactly one HP bar and one token to find. */
  function oneUnit(hp = 60): BattleState {
    return createBattleState({
      seed: 1,
      grid: { width: 3, height: 3, tiles: makeFlatTiles(3, 3) },
      units: [defaultUnit("blue-vance", 0, { pos: { x: 1, y: 1 }, hp, maxHp: 100 })],
    });
  }

  const POPUP: DamagePopup = { pos: { x: 1, y: 1 }, text: "−37", kind: "damage" };

  /** The HP bar's dark backing — the only `fillRect` `draw` ever paints in `#0b0f1c`. */
  function hpBackings(r: Recording): RecordedRect[] {
    return r.rects.filter((x) => x.style === "#0b0f1c");
  }

  function render(motion?: MotionState, extra: DrawOptions = {}): Recording {
    const rec = recordingCtx();
    draw(rec.ctx, oneUnit(), CANVAS_W, CANVAS_H, {
      activeId: "blue-vance",
      activeControl: "player",
      popups: [POPUP],
      unitColor: () => "#4f8cff",
      ...extra,
      ...(motion ? { motion } : {}),
    });
    return rec;
  }

  it("BASELINE: `motion` absent draws exactly the frame that shipped before it existed", () => {
    // The whole compatibility claim of an optional parameter, and the one the
    // reduced-motion branch rests on: absent means "no change", not "some default".
    const a = render();
    const b = render({});
    expect(JSON.stringify(b.rects)).toBe(JSON.stringify(a.rects));
    expect(JSON.stringify(b.texts)).toBe(JSON.stringify(a.texts));
    expect(JSON.stringify(b.arcs)).toBe(JSON.stringify(a.arcs));
  });

  // ── the live defect: the numeral sat on the health bar ────────────────────

  it("DISCRIMINATING: the numeral is ON THE STRUCK UNIT'S HEAD, above its token", () => {
    // PLACEMENT OPTION A (ADR-0032's amendment, from the owner's reference footage): the
    // number sits over the head of the unit it belongs to. Both halves are asserted,
    // because "somewhere above the board" is not the claim — a numeral centred on the
    // wrong column names the wrong victim.
    const r = render();
    const bar = hpBackings(r)[0];
    const numeral = r.texts.find((t) => t.text === POPUP.text);
    expect(bar).toBeDefined();
    expect(numeral).toBeDefined();
    // Centred on the struck unit's own column…
    expect(Math.abs(numeral!.x - (bar!.x + bar!.w / 2))).toBeLessThan(2);
    // …and above its token, not below it or on the ground in front of it (which is what
    // the rejected placement option B did).
    expect(numeral!.y).toBeLessThan(bar!.y);
  });

  it("DISCRIMINATING: BOTH labels are sized in CANVAS pixels, not scaled by the camera", () => {
    // THE DURABLE PART OF THE ART DIRECTOR'S DIAGNOSIS. The font is written in canvas
    // pixels but used to be drawn under `ctx.scale(scale, scale)`, so it came out at
    // `px × scale` — a third bigger on the smallest map — and `viewFor` reserved room for
    // it in WORLD units. That reservation is what sets `scale`, which is what set the
    // size, which is what the reservation was for: circular, and it cost ~6% of every
    // board before anyone noticed.
    //
    // The A/B is the same popup on two boards the camera treats very differently: a 3x3
    // (zoomed to the 2.2 cap) and the widest shipped 11x7 (~1.53 here). The mutation this
    // catches: draw the label before `ctx.restore()` again — the two recorded scales then
    // differ by that same 1.4x. Run, for the numeral AND for the plate: the plate has to
    // be in here too, because it is the taller label and leaving it in world units would
    // have kept `HEADROOM` up by itself.
    const at = (state: BattleState): { numeral: RecordedText; plate: RecordedText } => {
      const rec = recordingCtx();
      const on = state.units[0]!;
      draw(rec.ctx, state, CANVAS_W, CANVAS_H, {
        popups: [{ ...POPUP, pos: { x: 1, y: 1 } }],
        motion: { plate: { unitId: on.id, text: "Vance", alpha: 1, rise: 0, kind: "player" } },
      });
      return {
        numeral: rec.texts.find((t) => t.text === POPUP.text)!,
        plate: rec.texts.find((t) => t.text === "Vance")!,
      };
    };
    const standing = (): UnitState[] => [
      defaultUnit("blue-vance", 0, { pos: { x: 1, y: 1 }, hp: 60, maxHp: 100 }),
    ];
    const wide = shippedMaps(standing).find((m) => m.state.grid.width === 11)!.state;
    const small = oneUnit();
    // Non-degeneracy first: if the camera treated these two boards alike the whole test
    // would be vacuous, and this is exactly the tie a shipped-content fixture can hand you.
    const zoomWide = viewFor(wide, CANVAS_W, CANVAS_H).scale;
    const zoomSmall = viewFor(small, CANVAS_W, CANVAS_H).scale;
    expect(zoomSmall / zoomWide).toBeGreaterThan(1.3);

    const a = at(wide);
    const b = at(small);
    // Said as the reader sees it: the same number of canvas pixels tall on both boards.
    const px = (t: RecordedText): number => Number(/(\d+(?:\.\d+)?)px/.exec(t.font)![1]) * t.scale;
    expect(px(a.numeral)).toBe(px(b.numeral));
    expect(px(a.plate)).toBe(px(b.plate));
    // …and the ANCHOR still tracks the board, so neither is a label pinned to the canvas.
    expect(a.numeral.y).not.toBe(b.numeral.y);
    expect(a.plate.y).not.toBe(b.plate.y);
  });

  it("DISCRIMINATING: overlap is ALLOWED — the numeral crosses the unit standing behind", () => {
    // THE OWNER'S CALL, and the one property a well-meaning future slice is most likely
    // to "fix": the reference draws the number over its own sprite, over the unit behind
    // it and over terrain props, with no avoidance whatsoever. So the assertion is that
    // the numeral OVERLAPS the furniture of the unit directly behind the struck one —
    // any nudge, offset or collision test breaks it.
    //
    // (0,0) is directly behind (1,1): same screen column, one tile-pair further back.
    const state = createBattleState({
      seed: 1,
      grid: { width: 3, height: 3, tiles: makeFlatTiles(3, 3) },
      units: [
        defaultUnit("blue-vance", 0, { pos: { x: 1, y: 1 }, hp: 60, maxHp: 100 }),
        defaultUnit("red-brigand-1", 1, { pos: { x: 0, y: 0 }, hp: 60, maxHp: 100 }),
      ],
    });
    const rec = recordingCtx();
    draw(rec.ctx, state, CANVAS_W, CANVAS_H, {
      popups: [POPUP],
      unitColor: (u) => (u.teamId === 0 ? "#4f8cff" : "#ff6b6b"),
      motion: { popupScale: 1.3 },
    });
    const numeral = rec.texts.find((t) => t.text === POPUP.text)!;
    // The two HP-bar backings, front-most last (painter's order).
    const bars = hpBackings(rec);
    expect(bars).toHaveLength(2);
    const behind = bars[0]!;
    const struck = bars[1]!;
    // Non-degeneracy: they really are one behind the other in the same column.
    expect(behind.y).toBeLessThan(struck.y);
    expect(Math.abs(behind.x - struck.x)).toBeLessThan(1);
    // A 26px glyph's box around its baseline, in canvas pixels.
    const top = numeral.y - 23 * numeral.scale;
    const bottom = numeral.y + 8 * numeral.scale;
    expect(top).toBeLessThan(behind.y);
    expect(bottom).toBeGreaterThan(behind.y + behind.h);
  });

  it("DISCRIMINATING: the numeral EXPIRES — a settled frame draws it at zero alpha", () => {
    // The second half of the same defect. A finished animation is not the same as no
    // animation: `settledMotion()` keeps saying `popupAlpha: 0` after the clock stops,
    // because the fade is the only thing that removes a popup.
    //
    // The mutation this catches: `draw` reading `opts.popups` and ignoring `popupAlpha`.
    const off = render();
    const settled = render(settledMotion());
    expect(off.texts.find((t) => t.text === POPUP.text)?.alpha).toBe(1);
    expect(settled.texts.find((t) => t.text === POPUP.text)?.alpha).toBe(0);
  });

  it("the numeral RISES and SCALES, and does not drag anything else with it", () => {
    const off = render();
    const mid = render({ popupRise: POPUP_RISE_PX, popupScale: 1.3 });
    const a = off.texts.find((t) => t.text === POPUP.text)!;
    const b = mid.texts.find((t) => t.text === POPUP.text)!;
    expect(b.y).toBeLessThan(a.y); // it travelled UP the screen
    expect(b.scale).toBeGreaterThan(a.scale);
    // The board underneath is untouched — the popup transform is scoped, not global.
    expect(JSON.stringify(mid.rects)).toBe(JSON.stringify(off.rects));
  });

  // ── the blow ──────────────────────────────────────────────────────────────

  it("DISCRIMINATING: a unit offset moves its whole token, and only that unit's", () => {
    const off = render();
    const knocked = render({ unitOffset: { "blue-vance": { dx: 7, dy: 0 } } });
    const a = hpBackings(off)[0]!;
    const b = hpBackings(knocked)[0]!;
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBe(a.y);
    // An offset naming NOBODY on the board changes nothing — the lookup is by id, so a
    // stale id cannot silently move the wrong token.
    const stale = render({ unitOffset: { nobody: { dx: 7, dy: 0 } } });
    expect(JSON.stringify(stale.rects)).toBe(JSON.stringify(off.rects));
  });

  it("DISCRIMINATING: the flash whitens the token and nothing above it", () => {
    const off = render();
    const flashed = render({ unitFlash: { "blue-vance": 0.55 } });
    expect(off.fills).not.toContain("#ffffff");
    expect(flashed.fills).toContain("#ffffff");
    // Drawn INSIDE the silhouette at partial alpha: the HP bar, the numeral and the
    // ring must all still be painted exactly where they were.
    expect(JSON.stringify(flashed.rects)).toBe(JSON.stringify(off.rects));
    expect(JSON.stringify(flashed.texts)).toBe(JSON.stringify(off.texts));
  });

  it("DISCRIMINATING: the drain is a TAIL behind the live bar, never the bar itself", () => {
    // Pillar 4. `hpShown` is a display value; the coloured bar must keep reporting the
    // sim's `u.hp`, so the animation can trail a loss but can never assert one.
    //
    // The mutation this catches: computing `frac` from `hpShown` instead of drawing a
    // second rect behind it — the live bar would then show a health the sim never held.
    const off = render();
    const draining = render({ hpShown: { "blue-vance": 90 } }); // real hp is 60
    expect(off.rects.some((r) => r.style === "#f2c0a8")).toBe(false);
    const tail = draining.rects.find((r) => r.style === "#f2c0a8");
    expect(tail).toBeDefined();

    const live = (r: Recording): RecordedRect =>
      r.rects.filter((x) => x.style === "#5cc98d" || x.style === "#e2a948" || x.style === "#e2603c")[0]!;
    expect(live(draining).w).toBe(live(off).w);
    expect(tail!.w).toBeGreaterThan(live(off).w);
  });

  it("DISCRIMINATING: a drain BELOW the real HP draws no tail at all", () => {
    // The `shownFrac > frac` guard, asserted. A heal moves HP the other way and a stale
    // frame can lag it, and in both cases the honest answer is to draw nothing extra —
    // the coloured bar already holds the sim's number.
    //
    // The mutation this catches: painting the tail unconditionally. On a real canvas the
    // live bar would overpaint it and the frame would look right, which is precisely why
    // the recorder — which sees every `fillRect`, painted over or not — is the thing
    // asserting it.
    const off = render();
    const healing = render({ hpShown: { "blue-vance": 10 } });
    expect(JSON.stringify(healing.rects)).toBe(JSON.stringify(off.rects));
  });

  // ── the handoff ───────────────────────────────────────────────────────────

  it("DISCRIMINATING: the ring SWEEPS, and only around the active unit", () => {
    const full = render();
    const quarter = render({ ringSweep: 0.25 });
    const ringOf = (r: Recording): RecordedArc | undefined =>
      r.arcs.find((a) => a.style === DARK_THEME.active);
    expect(ringOf(full)?.sweep).toBeCloseTo(Math.PI * 2, 5);
    expect(ringOf(quarter)?.sweep).toBeCloseTo(Math.PI / 2, 5);
    // A sweep belongs to the ACTIVE unit alone. On a two-unit board exactly one ring is
    // stroked and it is the swept one — a `drawUnit` that took the sweep unconditionally
    // would put a partial circle under a unit that is not acting, which reads as "your
    // turn" on the wrong token.
    const rec = recordingCtx();
    draw(rec.ctx, twoTeams(), CANVAS_W, CANVAS_H, {
      activeId: "blue-vance",
      activeControl: "player",
      motion: { ringSweep: 0.25 },
    });
    const rings = rec.arcs.filter((a) => a.style === DARK_THEME.active);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.sweep).toBeCloseTo(Math.PI / 2, 5);
  });

  it("DISCRIMINATING: when both land on one head, the NUMERAL is drawn over the plate", () => {
    // FOUND BY OPENING A FRAME, with the whole suite green. The struck unit is sometimes
    // also the unit up next, and then the plate and the numeral share a head. The plate's
    // box is opaque cream, so with the numeral painted first the damage was erased for
    // the plate's entire 700 ms window — the exact class of defect a colour-presence
    // check cannot see, because both labels were present the whole time.
    //
    // Asserted as DRAW ORDER, the only thing that separates them. The mutation this
    // catches: put the popup loop back above the plate block. It was run.
    const r = render({
      plate: { unitId: "blue-vance", text: "Vance", alpha: 1, rise: 0, kind: "player" },
    });
    const plateAt = r.texts.findIndex((t) => t.text === "Vance");
    const numeralAt = r.texts.findIndex((t) => t.text === POPUP.text);
    expect(plateAt).toBeGreaterThanOrEqual(0);
    expect(numeralAt).toBeGreaterThanOrEqual(0);
    expect(numeralAt).toBeGreaterThan(plateAt);
    // Non-degeneracy: they really are on top of each other, so the order decides what a
    // reader sees rather than being a harmless preference.
    const plate = r.texts[plateAt]!;
    const numeral = r.texts[numeralAt]!;
    expect(Math.abs(plate.x - numeral.x)).toBeLessThan(2);
    expect(Math.abs(plate.y - numeral.y)).toBeLessThan(30);
  });

  it("DISCRIMINATING: the turn plate is drawn, names the unit, and sits over that unit", () => {
    // The plate is the taller of the two labels, which is why leaving it under the camera
    // would have held `HEADROOM` up on its own and made the numeral's move worth nothing
    // (its canvas-pixel sizing is asserted in the test above, with the numeral's).
    //
    // WHAT THIS DELIBERATELY DOES NOT ASSERT: that the plate rides above the numeral. The
    // two world anchors do differ by 8 (70 vs 62), but the plate's box is 22px where the
    // numeral's ascender is up to 30, so which of the two reaches higher flips with the
    // zoom and with the numeral's punch scale. Measured: setting both anchors to 62 moves
    // the plate's top edge by 8 × scale and changes no ordering this file can see. An
    // assertion on it would be a coin toss dressed as a rule.
    const off = render();
    const plated = render({
      plate: { unitId: "blue-vance", text: "Vance", alpha: 1, rise: 0, kind: "player" },
    });
    expect(off.fills).not.toContain("#efe2c4");
    expect(plated.fills).toContain("#efe2c4");
    const name = plated.texts.find((t) => t.text === "Vance");
    expect(name).toBeDefined();
    // Over the named unit's own column, and above its token — not over a neighbour.
    const bar = hpBackings(off)[0]!;
    expect(Math.abs(name!.x - (bar.x + bar.w / 2))).toBeLessThan(2);
    expect(name!.y).toBeLessThan(bar.y);
  });

  it("the plate distinguishes a PLAYER handoff from an AI one", () => {
    // Same rule as the ring: two treatments, not two shades of one. A plate that painted
    // both the same would make "can I act?" unanswerable from the plate alone.
    const player = render({
      plate: { unitId: "blue-vance", text: "Vance", alpha: 1, rise: 0, kind: "player" },
    });
    const ai = render({
      plate: { unitId: "blue-vance", text: "Vance", alpha: 1, rise: 0, kind: "ai" },
    });
    expect(player.strokes).toContain("#8a6b1f");
    expect(ai.strokes).toContain("#8a3a1f");
    expect(player.strokes).not.toContain("#8a3a1f");
    expect(ai.strokes).not.toContain("#8a6b1f");
  });

  it("DISCRIMINATING: both labels CLAMP into the frame on the back row of every shipped map", () => {
    // RETARGETED 2026-09-01. This test used to read "the camera reserves room…" and its
    // comment named `HEADROOM` back to 54 as the mutation it catches. That is now the
    // shipped value: the reservation was the thing being reversed, and a guard written
    // against the reversal would have made the reversal read as a regression.
    //
    // The claim it makes instead is the one the amendment actually rests on: nothing is
    // reserved for a label any more, so the label has to CLAMP. Both do, at the numeral's
    // peak rise, on the back-most tile of all five shipped maps, at the SHIPPED 900x440
    // canvas (this file measures everything else at 900x600, which is taller and
    // therefore hides exactly this).
    //
    // The clamp is not decorative here — it engages on every one of the five. Measured:
    // the unclamped numeral wants y = −11 on battle 1 and the plate wants −20.
    //
    // The mutation this catches: drop either `Math.max(...)` in the label block and take
    // the raw anchor. Run, and both halves go red.
    const W = 900;
    const H = 440;
    const maps = shippedMaps();
    expect(maps).toHaveLength(5);
    for (const { id, state: empty } of maps) {
      const back = backMostTile(empty, W, H);
      const state = createBattleState({
        seed: 1,
        grid: empty.grid,
        units: [defaultUnit("blue-vance", 0, { pos: back, hp: 60, maxHp: 100 })],
      });
      const rec = recordingCtx();
      draw(rec.ctx, state, W, H, {
        activeId: "blue-vance",
        activeControl: "player",
        popups: [{ pos: back, text: "−137", kind: "damage" }],
        unitColor: () => "#4f8cff",
        motion: {
          // The worst instant of each: the numeral at full size AND fully risen (they do
          // not co-occur — the punch is over by then — so this is stricter than any real
          // frame), and the plate at the top of its own travel.
          popupScale: 1.3,
          popupRise: POPUP_RISE_PX,
          plate: { unitId: "blue-vance", text: "Vance", alpha: 1, rise: 0, kind: "player" },
        },
      });
      const numeral = rec.texts.find((t) => t.text === "−137")!;
      const name = rec.texts.find((t) => t.text === "Vance")!;
      // A 26px glyph's ascender plus its 3px outline; the plate's own half-height plus
      // its border. Independent numbers, read off the fonts rather than off `iso.ts`.
      expect(numeral.y - 23 * numeral.scale, `${id}: numeral`).toBeGreaterThan(0);
      expect(name.y - 12 * name.scale, `${id}: plate`).toBeGreaterThan(0);
      // Non-degeneracy: this really is the tile nearest the top edge on this map, so the
      // clearance is the worst case rather than a comfortable one in the middle.
      const bar = rec.rects.filter((r) => r.style === "#0b0f1c")[0]!;
      expect(bar.y, `${id}: back row`).toBeLessThan(H / 2);
    }
  });

  it("a plate naming a unit that is not on the board draws nothing", () => {
    const off = render();
    const ghost = render({
      plate: { unitId: "nobody", text: "Nobody", alpha: 1, rise: 0, kind: "player" },
    });
    expect(ghost.fills).not.toContain("#efe2c4");
    expect(JSON.stringify(ghost.texts)).toBe(JSON.stringify(off.texts));
  });
});
