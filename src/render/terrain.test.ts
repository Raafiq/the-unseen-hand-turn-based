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

/** WCAG relative luminance of a `#rrggbb` string. */
function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const parts = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = parts.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** WCAG contrast ratio between two opaque colours. 1 = identical. */
function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

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

  it("does not degenerate for ANY tile, including the seed the guard exists for", () => {
    // The `s === 0` guard in `tileNoise` cannot be reached through `(0, 0)` — the salt
    // constant keeps that seed non-zero — so a test that only probes the origin passes
    // with the guard deleted, which was measured. Sweep instead: an xorshift seeded
    // with 0 returns 0 forever, so ANY tile that hashed to 0 would be a corner of the
    // map with identical, motionless texture.
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const r = tileNoise(x, y);
        const seen = new Set([r(), r(), r(), r()]);
        expect(seen.size, `(${x}, ${y}) degenerated`).toBe(4);
      }
    }
    // And the guard itself, exercised directly through the salt that reaches it.
    const salted = tileNoise(0, 0, 0);
    expect(new Set([salted(), salted(), salted()]).size).toBe(3);
  });
});

describe("DAYLIGHT palette", () => {
  it("gives every terrain kind three DISTINCT tones", () => {
    // `Record<TerrainKind, SurfacePaint>` already makes "is it defined" true at compile
    // time, so asserting that proved nothing. What the type cannot say is that a
    // surface's three tones actually differ — a kind whose mottle equals its base paints
    // a flat slab and reads exactly like the board this whole direction replaced.
    for (const kind of TERRAIN_KINDS) {
      const s = DAYLIGHT.surfaces[kind];
      expect(new Set([s.base, s.mottle, s.detail]).size, kind).toBe(3);
      expect(new Set([s.wallLeft, s.wallRight]).size, kind).toBe(2);
    }
  });

  it("DISCRIMINATING: foliage separates from the ground by LUMINANCE, not by string", () => {
    // Earned twice. A canopy drawn in the grass colour vanished the moment a tree stood
    // on grass rather than against the sky, which is most of any map. The first fix
    // asserted `leaf !== grass.base` — and shipped `leafLit: #548b38` against a grass
    // mottle of `#5c8737`, a contrast ratio of **1.03**: the same colour to an eye, and
    // two of the five canopy blobs are painted in it. `!==` on two hex strings cannot
    // see that, so it reported a defect fixed that was still half-present.
    //
    // The floor is asserted against `base` and `mottle`, the two tones that cover a
    // grass tile. `detail` is EXCLUDED BY NAME: it is one-pixel blade strokes, not a
    // field, so a canopy is never read against it.
    const MIN_RATIO = 1.6;
    for (const canopy of [DAYLIGHT.leaf, DAYLIGHT.leafLit]) {
      for (const ground of [DAYLIGHT.surfaces.grass.base, DAYLIGHT.surfaces.grass.mottle]) {
        expect(contrastRatio(canopy, ground), `${canopy} on ${ground}`).toBeGreaterThan(
          MIN_RATIO,
        );
      }
    }
    // Non-degeneracy: the helper must be able to report a FAILING pair, or the loop
    // above is a formality. Two identical colours are ratio 1.
    expect(contrastRatio("#5c8737", "#5c8737")).toBeCloseTo(1, 5);
    expect(contrastRatio("#548b38", "#5c8737")).toBeLessThan(MIN_RATIO);
  });
});
