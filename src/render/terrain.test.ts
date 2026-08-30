import { describe, expect, it } from "vitest";

import {
  assertFitsGrid,
  DAYLIGHT,
  parseTerrain,
  terrainAt,
  tileNoise,
  TERRAIN_KINDS,
  type TerrainProp,
} from "./terrain.js";

const ROWS = ["ggd", "dwr", "sgp"] as const;

describe("parseTerrain", () => {
  it("reads rows left-to-right, top-to-bottom, row-major like the grid", () => {
    const t = parseTerrain([...ROWS]);
    expect(t.width).toBe(3);
    expect(t.height).toBe(3);
    // The discriminating read: an asymmetric map. A symmetric one scores the same
    // whether the parser is row-major or column-major.
    expect(terrainAt(t, 2, 0)).toBe("dirt");
    expect(terrainAt(t, 0, 2)).toBe("sand");
    expect(terrainAt(t, 1, 1)).toBe("water");
  });

  it("is undefined off the map rather than wrapping to the other edge", () => {
    const t = parseTerrain([...ROWS]);
    expect(terrainAt(t, 3, 0)).toBeUndefined();
    expect(terrainAt(t, -1, 0)).toBeUndefined();
    expect(terrainAt(t, 0, 3)).toBeUndefined();
  });

  it("rejects a ragged map instead of padding it", () => {
    expect(() => parseTerrain(["ggg", "gg"])).toThrow(/row 1 has 2 tiles/);
  });

  it("rejects an unknown letter, naming where it is", () => {
    expect(() => parseTerrain(["gg", "gX"])).toThrow(/unknown letter "X" at \(1, 1\)/);
  });

  it("rejects an empty map", () => {
    expect(() => parseTerrain([])).toThrow(/no rows/);
    expect(() => parseTerrain([""])).toThrow(/row 0 is empty/);
  });

  it("rejects a prop off the map", () => {
    const off: TerrainProp = { pos: { x: 3, y: 0 }, kind: "tree" };
    expect(() => parseTerrain([...ROWS], [off])).toThrow(/off the map/);
  });

  it("rejects two props on one tile", () => {
    const props: TerrainProp[] = [
      { pos: { x: 1, y: 1 }, kind: "tree" },
      { pos: { x: 1, y: 1 }, kind: "boulder" },
    ];
    expect(() => parseTerrain([...ROWS], props)).toThrow(/two props on tile/);
  });

  it("accepts every letter the alphabet claims to support", () => {
    // Enumerates the ACTUAL kind list rather than a hand-copied subset: a new kind
    // added to `TERRAIN_KINDS` with no letter fails here instead of shipping unusable.
    const covered = new Set(parseTerrain(["gdrwsp"]).kinds);
    expect([...covered].sort()).toEqual([...TERRAIN_KINDS].sort());
  });
});

describe("assertFitsGrid", () => {
  it("passes on an exact match", () => {
    expect(() => assertFitsGrid(parseTerrain([...ROWS]), 3, 3)).not.toThrow();
  });

  it("fails BOTH ways round, not just when the map is short", () => {
    // A one-directional check would let an over-long map through, which paints tiles
    // that do not exist and reads on screen as a renderer bug.
    const t = parseTerrain([...ROWS]);
    expect(() => assertFitsGrid(t, 4, 3)).toThrow(/3x3, grid is 4x3/);
    expect(() => assertFitsGrid(t, 2, 3)).toThrow(/3x3, grid is 2x3/);
    expect(() => assertFitsGrid(t, 3, 2)).toThrow(/3x3, grid is 3x2/);
  });
});

describe("tileNoise", () => {
  it("gives the same sequence for the same tile, every call", () => {
    const a = tileNoise(3, 4);
    const b = tileNoise(3, 4);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("gives DIFFERENT sequences to different tiles, including transposed ones", () => {
    // (3,4) vs (4,3) is the discriminating pair: a hash that folded x and y together
    // by addition or multiplication would tie here and every map would be striped.
    const first = tileNoise(3, 4)();
    expect(tileNoise(4, 3)()).not.toBe(first);
    expect(tileNoise(3, 5)()).not.toBe(first);
  });

  it("stays inside [0, 1)", () => {
    const r = tileNoise(0, 0);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("does not degenerate at the origin", () => {
    // x = y = 0 zeroes a naive xor-hash, and an xorshift seeded with 0 returns 0
    // forever — a whole corner of every map with identical, motionless texture.
    const r = tileNoise(0, 0);
    const seen = new Set([r(), r(), r(), r()]);
    expect(seen.size).toBe(4);
  });
});

describe("DAYLIGHT palette", () => {
  it("paints every terrain kind", () => {
    for (const kind of TERRAIN_KINDS) {
      expect(DAYLIGHT.surfaces[kind]).toBeDefined();
    }
  });

  it("does not paint foliage in the ground's own green", () => {
    // Earned: a canopy drawn in the grass colour vanished the moment a tree stood on
    // grass rather than against the sky, which is most of any map.
    expect(DAYLIGHT.leaf).not.toBe(DAYLIGHT.surfaces.grass.base);
    expect(DAYLIGHT.leaf).not.toBe(DAYLIGHT.surfaces.grass.mottle);
    expect(DAYLIGHT.leafLit).not.toBe(DAYLIGHT.surfaces.grass.base);
  });
});
