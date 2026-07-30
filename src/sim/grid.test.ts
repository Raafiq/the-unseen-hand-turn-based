import { describe, it, expect } from "vitest";
import { inBounds, moveRange, relativeFacing, tileAt, tileIndex } from "./grid.js";
import { defaultUnit, makeFlatTiles, type GridState, type UnitState } from "./state.js";

function grid(width: number, height: number): GridState {
  return { width, height, tiles: makeFlatTiles(width, height) };
}

const unit = (id: string, teamId: number, x: number, y: number, over: Partial<UnitState> = {}): UnitState =>
  defaultUnit(id, teamId, { pos: { x, y }, ...over });

const has = (tiles: { x: number; y: number }[], x: number, y: number): boolean =>
  tiles.some((t) => t.x === x && t.y === y);

describe("grid — tile access", () => {
  it("inBounds and tileAt agree on the edges", () => {
    const g = grid(3, 2);
    expect(inBounds(g, 0, 0)).toBe(true);
    expect(inBounds(g, 2, 1)).toBe(true);
    expect(inBounds(g, 3, 0)).toBe(false);
    expect(inBounds(g, -1, 0)).toBe(false);
    expect(tileAt(g, 3, 0)).toBeUndefined();
    expect(tileAt(g, 1, 1)).toEqual({ height: 0, passable: true });
    expect(tileIndex(g, 1, 1)).toBe(4);
  });
});

describe("grid — moveRange (docs/01 §7)", () => {
  it("returns the orthogonal diamond on flat open ground", () => {
    const g = grid(5, 5);
    const u = unit("u", 0, 2, 2, { move: 2, jump: 5 });
    const r = moveRange(g, [u], "u");
    // Manhattan distance 1 or 2 from centre = 12 tiles; start excluded.
    expect(r).toHaveLength(12);
    expect(has(r, 2, 0)).toBe(true); // distance 2 straight
    expect(has(r, 3, 3)).toBe(true); // distance 2 diagonal (two steps)
    expect(has(r, 2, 2)).toBe(false); // start excluded
    expect(has(r, 0, 2)).toBe(true);
  });

  it("is returned sorted by (y, x) for deterministic output", () => {
    const g = grid(5, 5);
    const u = unit("u", 0, 2, 2, { move: 2, jump: 5 });
    const r = moveRange(g, [u], "u");
    const sorted = [...r].sort((a, b) => a.y - b.y || a.x - b.x);
    expect(r).toEqual(sorted);
  });

  it("cannot step onto impassable tiles or through the gap they create", () => {
    const g = grid(5, 5);
    g.tiles[tileIndex(g, 3, 2)] = { height: 0, passable: false };
    const u = unit("u", 0, 2, 2, { move: 2, jump: 5 });
    const r = moveRange(g, [u], "u");
    expect(has(r, 3, 2)).toBe(false); // impassable
    expect(has(r, 4, 2)).toBe(false); // only reachable by passing through (3,2)
  });

  it("respects Jump tolerance on height deltas", () => {
    const g = grid(5, 5);
    g.tiles[tileIndex(g, 3, 2)] = { height: 2, passable: true };
    const u = unit("u", 0, 2, 2, { move: 2, jump: 1 });
    const r = moveRange(g, [u], "u");
    expect(has(r, 3, 2)).toBe(false); // height delta 2 > jump 1
    expect(has(r, 4, 2)).toBe(false); // blocked behind the cliff
  });

  it("enemies block traversal; allies can be passed through but not ended on", () => {
    const g = grid(5, 5);
    const mover = unit("m", 0, 2, 2, { move: 2, jump: 5 });

    const enemy = unit("e", 1, 3, 2);
    const withEnemy = moveRange(g, [mover, enemy], "m");
    expect(has(withEnemy, 3, 2)).toBe(false); // occupied
    expect(has(withEnemy, 4, 2)).toBe(false); // enemy blocks the path through

    const ally = unit("a", 0, 3, 2);
    const withAlly = moveRange(g, [mover, ally], "m");
    expect(has(withAlly, 3, 2)).toBe(false); // cannot end on the ally's tile
    expect(has(withAlly, 4, 2)).toBe(true); // but can pass through it
  });
});

describe("grid — relativeFacing (docs/01 §5c)", () => {
  const target = unit("t", 1, 2, 2, { facing: "S" });

  it("classifies front / rear / side / diagonal against a south-facing target", () => {
    expect(relativeFacing(target, { x: 2, y: 3 })).toBe("front"); // attacker to the south
    expect(relativeFacing(target, { x: 2, y: 1 })).toBe("rear"); // attacker to the north
    expect(relativeFacing(target, { x: 1, y: 2 })).toBe("side");
    expect(relativeFacing(target, { x: 3, y: 2 })).toBe("side");
    expect(relativeFacing(target, { x: 3, y: 3 })).toBe("side"); // pure diagonal = flank
  });
});
