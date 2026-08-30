/**
 * Terrain — what the ground of a battle is MADE of, and the props standing on it.
 *
 * **This layer is paint, not rules** (user decision, 2026-08-30). Nothing here reaches
 * `BattleState`: the sim's tile is still `{height, passable}` and knows nothing about
 * grass or water. A unit walks across a painted pond exactly as it walks across painted
 * grass, because passability is the sim's answer and the sim was not asked. That is a
 * deliberate, temporary lie the renderer tells, and the day water blocks movement it
 * becomes a `Tile` field with a schema bump — not a second opinion held here.
 *
 * WHY A SEPARATE MODULE FROM `iso.ts`. This one is pure data: kinds, a parse with real
 * validation, and a palette. It imports no canvas, so `terrain.test.ts` can prove a
 * malformed map is rejected without a DOM. `iso.ts` imports this; never the reverse.
 */

import type { Position } from "../sim/index.js";

/** What a tile's top surface is. One letter each in an authored map (see {@link parseTerrain}). */
export const TERRAIN_KINDS = ["grass", "dirt", "rock", "water", "sand", "wood"] as const;
export type TerrainKind = (typeof TERRAIN_KINDS)[number];

/** Authoring letter → kind. The letters are the map file's alphabet. */
export const TERRAIN_LETTERS: Readonly<Record<string, TerrainKind>> = Object.freeze({
  g: "grass",
  d: "dirt",
  r: "rock",
  w: "water",
  s: "sand",
  p: "wood",
});

/** Something standing ON a tile. Decoration only — props block nothing. */
export const PROP_KINDS = ["tree", "boulder", "pillar"] as const;
export type PropKind = (typeof PROP_KINDS)[number];

export interface TerrainProp {
  readonly pos: Position;
  readonly kind: PropKind;
}

/**
 * A battle's painted ground. `kinds` is row-major and indexed `y * width + x`, matching
 * `GridState.tiles` exactly so the two can be walked together.
 */
export interface TerrainMap {
  readonly width: number;
  readonly height: number;
  readonly kinds: readonly TerrainKind[];
  readonly props: readonly TerrainProp[];
}

/**
 * Build a terrain map from authored rows, one string per grid row, one letter per tile.
 *
 * Throws on anything malformed rather than filling a default. A terrain map that
 * silently pads to the grid's size would paint a battle half-right and look deliberate;
 * the whole reason to parse is to make a typo loud. The dimensions are checked against
 * the grid separately, by {@link assertFitsGrid}, because this function does not see one.
 */
export function parseTerrain(rows: readonly string[], props: readonly TerrainProp[] = []): TerrainMap {
  if (rows.length === 0) throw new Error("terrain: no rows");
  const width = rows[0]!.length;
  if (width === 0) throw new Error("terrain: row 0 is empty");

  const kinds: TerrainKind[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`terrain: row ${y} has ${row.length} tiles, row 0 has ${width}`);
    }
    for (let x = 0; x < row.length; x++) {
      const letter = row[x]!;
      const kind = TERRAIN_LETTERS[letter];
      if (kind === undefined) {
        throw new Error(`terrain: unknown letter "${letter}" at (${x}, ${y})`);
      }
      kinds.push(kind);
    }
  });

  const seen = new Set<string>();
  for (const prop of props) {
    const { x, y } = prop.pos;
    if (x < 0 || y < 0 || x >= width || y >= rows.length) {
      throw new Error(`terrain: prop "${prop.kind}" at (${x}, ${y}) is off the map`);
    }
    const key = `${x},${y}`;
    if (seen.has(key)) throw new Error(`terrain: two props on tile (${x}, ${y})`);
    seen.add(key);
  }

  return Object.freeze({
    width,
    height: rows.length,
    kinds: Object.freeze(kinds),
    props: Object.freeze(props.map((p) => Object.freeze({ ...p }))),
  });
}

/**
 * The terrain map must cover the grid EXACTLY.
 *
 * A short map would leave tiles unpainted and a long one would paint tiles that do not
 * exist — both of which read, on screen, as a rendering bug rather than as authoring
 * drift. Called at the draw boundary so a mismatched pair fails at the first frame
 * instead of the first tile that happens to be missing.
 */
export function assertFitsGrid(terrain: TerrainMap, gridW: number, gridH: number): void {
  if (terrain.width !== gridW || terrain.height !== gridH) {
    throw new Error(
      `terrain: map is ${terrain.width}x${terrain.height}, grid is ${gridW}x${gridH}`,
    );
  }
}

/** The kind at a tile, or `undefined` off the map. */
export function terrainAt(terrain: TerrainMap, x: number, y: number): TerrainKind | undefined {
  if (x < 0 || y < 0 || x >= terrain.width || y >= terrain.height) return undefined;
  return terrain.kinds[y * terrain.width + x];
}

/** One surface's colours: the top face, and the two side faces of a drop below it. */
export interface SurfacePaint {
  /** Base fill of the top face. */
  readonly base: string;
  /** Second tone scattered over the base — what stops a field reading as one flat colour. */
  readonly mottle: string;
  /** The finest detail: blades, grit, seams, crests. */
  readonly detail: string;
  /** The left (lit) side face of a drop. */
  readonly wallLeft: string;
  /** The right (shaded) side face. */
  readonly wallRight: string;
}

export interface TerrainPalette {
  readonly sky: readonly [string, string];
  readonly surfaces: Readonly<Record<TerrainKind, SurfacePaint>>;
  /** Foliage and trunk, which must NOT be the ground's own greens — see below. */
  readonly leaf: string;
  readonly leafLit: string;
  readonly bark: string;
  /** Stone for boulders and pillars. */
  readonly stone: string;
  readonly stoneLit: string;
  /** The lit top edge of a real drop. Never drawn where the ground is continuous. */
  readonly edgeLight: string;
  /** Ambient occlusion at the foot of a wall and against a taller neighbour. */
  readonly occlusion: string;
  /** Horizontal bedding lines down a cut face. */
  readonly strata: string;
  /** Cast shadow under a prop or a unit. */
  readonly shadow: string;
}

/**
 * "Daylight field" (owner decision, 2026-08-30) — the direction chosen from three
 * rendered options. Warm midday light from the upper left, muted saturation, open sky.
 *
 * TWO COLOURS HERE ARE LOAD-BEARING AND WERE WRONG FIRST. `leaf` is NOT the grass green:
 * a canopy painted in the ground's own colour disappeared the moment a tree stood over
 * grass rather than against sky, which is most of the map. And a unit's own fill must
 * separate from every surface below — see `iso.ts`'s caller-supplied `unitColor`.
 */
export const DAYLIGHT: TerrainPalette = Object.freeze({
  sky: Object.freeze(["#b9d4e2", "#e7eddf"]) as unknown as readonly [string, string],
  surfaces: Object.freeze({
    grass: Object.freeze({
      base: "#6d9a43", mottle: "#5c8737", detail: "#4a7530",
      wallLeft: "#8a6435", wallRight: "#654828",
    }),
    dirt: Object.freeze({
      base: "#b08d5c", mottle: "#9d7a4c", detail: "#8a6742",
      wallLeft: "#8a6435", wallRight: "#654828",
    }),
    rock: Object.freeze({
      base: "#9a958a", mottle: "#877f73", detail: "#6f6a61",
      wallLeft: "#87817a", wallRight: "#615c56",
    }),
    water: Object.freeze({
      base: "#3f7ba8", mottle: "#5b9bc4", detail: "#8fc6e2",
      wallLeft: "#5a4a35", wallRight: "#3f3527",
    }),
    sand: Object.freeze({
      base: "#d3bb85", mottle: "#c1a66c", detail: "#a68d58",
      wallLeft: "#a98d5c", wallRight: "#806543",
    }),
    wood: Object.freeze({
      base: "#9a7448", mottle: "#825f39", detail: "#63472a",
      wallLeft: "#7d5c36", wallRight: "#5c4225",
    }),
  }),
  leaf: "#3f6b2c",
  leafLit: "#548b38",
  bark: "#6b4a2a",
  stone: "#a9a49a",
  stoneLit: "#c6c1b6",
  edgeLight: "rgba(255,248,225,.42)",
  occlusion: "rgba(38,28,14,.30)",
  strata: "rgba(0,0,0,.16)",
  shadow: "rgba(30,40,20,.30)",
});

/**
 * A tiny deterministic scatter, seeded by tile coordinates.
 *
 * The root rule bans unseeded randomness from `src/sim`; this is the render layer, but
 * the reason applies here too for a different purpose — a frame must be reproducible or
 * the screenshot specs flicker and `iso.test.ts` cannot assert what reached the canvas.
 * Same tile, same blades of grass, every frame, forever.
 */
export function tileNoise(x: number, y: number, salt = 0): () => number {
  let s = ((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791) ^ 0x9e3779b9) >>> 0;
  if (s === 0) s = 0x1234567;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
