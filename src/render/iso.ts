/**
 * Isometric canvas renderer (render layer only). Turns the sim's LOGICAL grid
 * — tiles with (x, y) + integer height, units with position + facing — into a
 * 2.5D view via a pure projection `screen = f(x, y, height)`. The sim knows
 * nothing about any of this (ADR-0007): swap this file to change the look.
 */

import type { BattleState, Position, UnitState } from "../sim/index.js";
import { UNIT_META } from "./demo.js";
import {
  assertFitsGrid,
  DAYLIGHT,
  terrainAt,
  tileNoise,
  type PropKind,
  type TerrainKind,
  type TerrainMap,
  type TerrainPalette,
} from "./terrain.js";

const TILE_W = 64;
const TILE_H = 32;
const HEIGHT_STEP = 18;

export interface Theme {
  top: string;
  topEdge: string;
  left: string;
  right: string;
  grid: string;
  impassable: string;
  highlight: string;
  highlightEdge: string;
  active: string;
  /** Ring colour for an AI-controlled active unit (distinct from the player's). */
  activeAi: string;
  /** Fill/edge for the STAGED move destination (the ghost's tile). */
  staged: string;
  stagedEdge: string;
  /** Fill/edge for a tile holding a legal act target. */
  target: string;
  targetEdge: string;
  /** Keyboard tile-cursor outline. */
  cursor: string;
  text: string;
  /** Status-badge fill for beneficial statuses (buff). */
  buff: string;
  /** Status-badge fill for harmful statuses (debuff). */
  debuff: string;
}

export const DARK_THEME: Theme = {
  top: "#2b3450",
  topEdge: "#3c4a68",
  left: "#20273c",
  right: "#171d2e",
  grid: "#3a4a68",
  impassable: "#6a2f2f",
  highlight: "#e2a94833",
  highlightEdge: "#e2a948",
  active: "#f4d06a",
  activeAi: "#ff7a3c",
  staged: "#7fd7ff3d",
  stagedEdge: "#7fd7ff",
  target: "#e0556340",
  targetEdge: "#e05563",
  cursor: "#ffffff",
  text: "#e8ecf5",
  buff: "#5cc98d",
  debuff: "#e05563",
};

/**
 * The theme that goes WITH painted terrain ("Daylight field", 2026-08-30).
 *
 * `top`, `left`, `right`, `grid` and `impassable` are deliberately still present and
 * deliberately unused whenever `DrawOptions.terrain` is supplied: the terrain palette
 * owns the ground then, and this theme owns everything drawn OVER it — range panels,
 * rings, chips, text. They are kept rather than removed so the same object still works
 * on a terrainless grid, which is what the engine demo page draws.
 *
 * The panel colours are not `DARK_THEME`'s. Amber move-range over grass is nearly the
 * same hue as the grass; blue is the one channel a green-and-earth field leaves free,
 * which is also why FFT uses it.
 */
export const FIELD_THEME: Theme = {
  top: "#6d9a43",
  topEdge: "#7fae4e",
  left: "#8a6435",
  right: "#654828",
  grid: "rgba(38,28,14,.22)",
  impassable: "#8a5a4a",
  // A RANGE PANEL HAS TWO GROUNDS TO SEPARATE FROM, NOT ONE.
  //
  // Three attempts failed here, each fixing the previous one's ground and colliding
  // with the next. A pale blue at 34% desaturated to grey over green; a deeper blue at
  // the same alpha did too (and shipped, recorded in ADR-0030 as fixed, while the frame
  // still showed concrete slabs on a field); and a saturated `#2d6fd8` at 65% finally
  // read as blue over grass — at rgb(67, 126, 164), which is within four points of the
  // river's own `#3f7ba8`. On the ford, the tiles you may walk to and the water became
  // the same colour.
  //
  // So the panel is deliberately LIGHTER than the ground rather than merely a different
  // hue: over grass it lands near rgb(133, 192, 199) and over the river near
  // rgb(119, 182, 229).
  //
  // MEASURED, AND THINNER THAN "much brighter" SOUNDS. Compositing #8fd0ff at 70% over
  // all 18 shipped surface tones (6 kinds x base/mottle/detail), the panel is the lighter
  // of the pair every time — the direction holds everywhere — but the WCAG ratio is:
  //
  //   sand.base    1.07   <- thinnest; sand is battles 2 and 5
  //   water.detail 1.08   <- the river's own highlight, battles 2 and 4
  //   sand.mottle  1.25 | rock.base 1.51 | dirt.base 1.53 | water.mottle 1.54
  //   grass.base   1.63 | ... | wood.detail 3.34
  //
  // So the mechanism carries grass, dirt, rock and wood, and is nearly invisible on pale
  // sand and on a lit ripple. Do not restate this as "much brighter than any ground on
  // every map" — that was the previous wording and it was wrong on two of eighteen tones.
  // NOTHING ASSERTS ANY OF IT: there is no canvas contrast test (`contrast.spec.ts` reads
  // DOM text only), so these numbers are a hand measurement, not a guard. Re-measure
  // before touching either colour, and read the frames.
  //
  // The cost is deliberate and is what FFT pays too: the texture under a panel is
  // mostly hidden. The panel is information; the ground beneath it is not.
  highlight: "#8fd0ffb3",
  highlightEdge: "#eaf7ff",
  active: "#ffd968",
  activeAi: "#ff8a44",
  staged: "#ffeca047",
  stagedEdge: "#fff0b8",
  target: "#d43b34a6",
  targetEdge: "#ffc0b6",
  cursor: "#ffffff",
  text: "#f4ecd8",
  buff: "#5cc98d",
  debuff: "#e05563",
};

/** Project a tile/height to the canvas point of the top-face centre. */
export function project(x: number, y: number, height: number, origin: Position): Position {
  return {
    x: origin.x + (x - y) * (TILE_W / 2),
    y: origin.y + (x + y) * (TILE_H / 2) - height * HEIGHT_STEP,
  };
}

/**
 * Room above the topmost tile for props, HP bars and status chips.
 *
 * Exported so `iso.test.ts` measures the SHIPPED value rather than a copy — a test
 * holding its own `54` passes with this set to 0, which was measured.
 */
export const HEADROOM = 54;
const VIEW_PAD = 10;
const MIN_ZOOM = 0.5;
/** A small map must not be blown up past the point where the texture detail coarsens. */
const MAX_ZOOM = 2.2;

/** Where the board sits on the canvas, and how big. */
export interface View {
  /** Origin in WORLD units — the space `project` works in, before `scale` is applied. */
  readonly origin: Position;
  readonly scale: number;
}

/**
 * Fit the whole board to the canvas: the camera.
 *
 * WHY A ZOOM EXISTS AT ALL. At scale 1 a campaign map (7x5) drew at under half the
 * canvas's width, which was invisible while the canvas was transparent and became the
 * loudest thing on the screen the moment painted terrain put a sky behind it. The board
 * now fills its frame.
 *
 * **`draw` and `pickTile` MUST share this**, exactly as they already share `paintOrder`.
 * A zoom applied to the painting and not to the inverse silently offsets every click by
 * a factor nobody would think to look for — the same class of bug as a height-ignoring
 * inverse, and much harder to see. The bounding box is computed from the projection's
 * own constants so a change to tile size or height step moves the camera with the art.
 */
export function viewFor(state: BattleState, canvasW: number, canvasH: number): View {
  const { width, height, tiles } = state.grid;

  // The TRUE extent, walked tile by tile. An earlier version bounded the box from
  // `maxH` alone and charged the tallest tile's lift at the top AND its base at the
  // bottom — but one tile cannot be at both corners, so every map with relief was
  // over-estimated by a full height's worth and drawn too small. On the SHIPPED 900x440
  // canvas, battle 4 — the only campaign map with height — came out at 0.97 (below 1:1)
  // while the flat maps sat between 1.17 and 1.59. It is fixed: battle 4 now fits at
  // 1.15 there, and at 1.53 on the 900x600 canvas `iso.test.ts` measures with.
  //
  // The camera does NOT exist for battle 4. It exists because a 7x5 map (battle 1) drew
  // at under half the canvas — see this function's docstring. Battle 4 is where the
  // BOUND failed, which is a different thing; an earlier version of this comment
  // conflated the two.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h = tiles[y * width + x]?.height ?? 0;
      const px = (x - y) * (TILE_W / 2);
      const py = (x + y) * (TILE_H / 2) - h * HEIGHT_STEP;
      if (px - TILE_W / 2 < minX) minX = px - TILE_W / 2;
      if (px + TILE_W / 2 > maxX) maxX = px + TILE_W / 2;
      // Above a tile sit its props, HP bar and status chips.
      if (py - TILE_H / 2 - HEADROOM < minY) minY = py - TILE_H / 2 - HEADROOM;
      // Below it, the wall down to the diorama's base when terrain is painted.
      if (py + TILE_H / 2 + (h + 1) * HEIGHT_STEP > maxY) {
        maxY = py + TILE_H / 2 + (h + 1) * HEIGHT_STEP;
      }
    }
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const fit = Math.min((canvasW - VIEW_PAD * 2) / spanX, (canvasH - VIEW_PAD * 2) / spanY);
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
  return {
    scale,
    origin: {
      x: (canvasW / scale - spanX) / 2 - minX,
      y: (canvasH / scale - spanY) / 2 - minY,
    },
  };
}

/** Origin that centres the whole grid in the canvas, in WORLD units (see {@link viewFor}). */
export function originFor(state: BattleState, canvasW: number, canvasH: number): Position {
  return viewFor(state, canvasW, canvasH).origin;
}

/**
 * Painter's order for a grid: back (low `x + y`) to front, so a tall tile in
 * front paints over the tiles behind it. Cells are generated y-major / x-minor
 * and sorted with a STABLE sort, so ties on `x + y` keep ascending-y order — a
 * pinned tie-break, not an accident of the sort implementation.
 *
 * Shared by {@link draw} (walks it forward) and {@link pickTile} (walks it
 * backward) so the two can never disagree about which tile is on top.
 */
export function paintOrder(width: number, height: number): Position[] {
  const cells: Position[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push({ x, y });
  cells.sort((a, b) => a.x + a.y - (b.x + b.y));
  return cells;
}

/**
 * Is a canvas point inside the top-face diamond centred at `c`? The diamond is
 * TILE_W wide and TILE_H tall, so its interior is the L1 ball of the axis-scaled
 * offset. Edges count as inside (`<= 1`); the reverse-painter walk in
 * {@link pickTile} resolves the resulting shared-edge overlap deterministically.
 */
export function pointInDiamond(px: number, py: number, c: Position): boolean {
  return Math.abs(px - c.x) / (TILE_W / 2) + Math.abs(py - c.y) / (TILE_H / 2) <= 1;
}

/**
 * Inverse of {@link project}: the grid tile a canvas point selects, or `null`
 * for a point on no tile.
 *
 * NOT an algebraic inverse of the (x−y, x+y) isometric transform. `project`
 * lifts a tile UP the screen by `height * HEIGHT_STEP`, so several tiles of
 * different heights can cover the same screen point and the one drawn LAST
 * (largest `x + y`) occludes the rest. A height-ignoring inverse therefore
 * mis-picks wherever the map has relief — on the demo map, the centre of the
 * height-2 plateau (4,3) also falls inside the flat tile (3,2)'s diamond.
 *
 * So we hit-test in REVERSE {@link paintOrder} (front-to-back) and return the
 * first tile whose TOP FACE contains the point: exactly the tile the user sees
 * on top, by construction.
 *
 * Vertical SIDE faces (the height skirt) are deliberately NOT pickable — only
 * top faces select a tile. Clicking a plateau's wall therefore yields whatever
 * top face is painted at that point (often the nearer, lower tile drawn over the
 * wall) or `null` when no top face covers it. Rationale: a top face is the
 * unambiguous "stand here" surface; a wall belongs to two tiles at once.
 */
export function pickTile(
  state: BattleState,
  canvasX: number,
  canvasY: number,
  canvasW: number,
  canvasH: number,
): Position | null {
  const { origin, scale } = viewFor(state, canvasW, canvasH);
  // Canvas pixels → world units. The forward path scales the whole board, so the
  // inverse must divide by exactly the same factor or every click lands off-target.
  const wx = canvasX / scale;
  const wy = canvasY / scale;
  const { width, height, tiles } = state.grid;
  const cells = paintOrder(width, height);
  for (let i = cells.length - 1; i >= 0; i--) {
    const cell = cells[i];
    if (!cell) continue;
    const tile = tiles[cell.y * width + cell.x];
    if (!tile) continue;
    const top = project(cell.x, cell.y, tile.height, origin);
    if (pointInDiamond(wx, wy, top)) return { x: cell.x, y: cell.y };
  }
  return null;
}

function diamond(ctx: CanvasRenderingContext2D, c: Position): void {
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - TILE_H / 2);
  ctx.lineTo(c.x + TILE_W / 2, c.y);
  ctx.lineTo(c.x, c.y + TILE_H / 2);
  ctx.lineTo(c.x - TILE_W / 2, c.y);
  ctx.closePath();
}

export interface DamagePopup {
  pos: Position;
  text: string;
  kind: "damage" | "heal" | "miss";
}

/**
 * Everything the viewer can ask the renderer to show. `draw` stays PURE — a
 * function of `(state, opts)` with no reads of session/DOM/clock — so a frame is
 * fully reproducible from the two arguments.
 */
export interface DrawOptions {
  activeId?: string | undefined;
  /**
   * Who controls the active unit. `"player"` draws the solid gold ring;
   * `"ai"` a distinct DASHED warm ring, so "can I act?" is legible at a glance
   * and never inferred from the timeline alone.
   */
  activeControl?: "player" | "ai" | undefined;
  /** Legal move destinations (from the sim's `moveRange`). */
  range?: readonly Position[];
  /** Tiles holding a legal act target FROM the staged position. */
  targets?: readonly Position[];
  /** The staged move destination: marker + a translucent ghost of the actor. */
  staged?: Position | null | undefined;
  /** Keyboard tile cursor; drawn only when the canvas has focus. */
  cursor?: Position | null | undefined;
  popups?: readonly DamagePopup[];
  theme?: Theme;
  /**
   * Token colour per unit. Supplied by the page, because only the page knows what a
   * colour should MEAN on its board — the demo colours by character, the campaign by
   * team.
   *
   * WHY THIS IS A PARAMETER NOW. It used to read `UNIT_META` directly, a table keyed
   * by the four DEMO unit ids (`knight`, `archer`, `brawler`, `mage`). The campaign's
   * units are `blue-vance`, `red-brigand-1`, … so every lookup missed and every unit
   * on the board — yours and theirs — was painted the same fallback grey. Found by
   * looking at a screenshot; no test reads pixels, so the whole suite was green.
   */
  unitColor?: (u: UnitState) => string;
  /**
   * Painted ground for this battle. ABSENT means the flat-fill look the engine demo
   * still uses; supplying it swaps in textured surfaces, cut side faces and props, and
   * removes the per-tile grid line entirely — a grid drawn on the ground is the single
   * thing that made the old board read as tiles rather than as a place.
   *
   * It is presentation ONLY. The sim's `passable` still decides where a unit may walk,
   * so a painted pond is walkable until terrain becomes a `Tile` field (see
   * `terrain.ts`). Must match the grid's dimensions exactly; a mismatch throws.
   */
  terrain?: TerrainMap | undefined;
  /** Colours for the terrain above. Defaults to `DAYLIGHT`. Ignored without `terrain`. */
  terrainPalette?: TerrainPalette | undefined;
}

export function draw(
  ctx: CanvasRenderingContext2D,
  state: BattleState,
  canvasW: number,
  canvasH: number,
  opts: DrawOptions = {},
): void {
  const theme = opts.theme ?? DARK_THEME;
  const { origin, scale } = viewFor(state, canvasW, canvasH);
  const { width, height, tiles } = state.grid;

  const terrain = opts.terrain;
  const paint = opts.terrainPalette ?? DAYLIGHT;
  if (terrain) assertFitsGrid(terrain, width, height);

  ctx.clearRect(0, 0, canvasW, canvasH);
  // Open sky behind the diorama. Only with terrain: a terrainless grid keeps the
  // transparent canvas the demo page composites over its own background.
  if (terrain) {
    const sky = ctx.createLinearGradient(0, 0, 0, canvasH);
    sky.addColorStop(0, paint.sky[0]);
    sky.addColorStop(1, paint.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }
  // Everything from here is drawn in WORLD units; `pickTile` divides by the same
  // factor. The sky above is deliberately painted BEFORE this, in canvas pixels.
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineJoin = "round";

  const key = (p: Position): string => `${p.x},${p.y}`;
  const rangeSet = new Set((opts.range ?? []).map(key));
  const targetSet = new Set((opts.targets ?? []).map(key));
  const stagedKey = opts.staged ? key(opts.staged) : null;
  const cursorKey = opts.cursor ? key(opts.cursor) : null;
  const ghost = opts.staged && opts.activeId ? state.units.find((u) => u.id === opts.activeId) : undefined;
  const unitAt = new Map<string, UnitState>();
  for (const u of state.units) unitAt.set(`${u.pos.x},${u.pos.y}`, u);

  const standing: { x: number; y: number; top: Position; k: string }[] = [];
  const drawStandingAt = (k: string, top: Position): void => {
    const u = unitAt.get(k);
    if (u) {
      const control = u.id === opts.activeId ? (opts.activeControl ?? "player") : "none";
      drawUnit(ctx, u, top, control, theme, opts.unitColor);
    }
    // The GHOST of the actor standing on its staged tile: same token, faded, no
    // active ring — the actor's real body stays where the sim has it.
    if (stagedKey === k && ghost) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      drawUnit(ctx, ghost, top, "none", theme, opts.unitColor);
      ctx.restore();
    }
  };

  // Painter's order: back (low x+y) to front so height overlaps correctly.
  // `pickTile` walks this SAME list in reverse — keep them sharing `paintOrder`.
  for (const { x, y } of paintOrder(width, height)) {
    const tile = tiles[y * width + x];
    if (!tile) continue;
    const top = project(x, y, tile.height, origin);

    if (terrain) {
      paintTerrainTile(ctx, state, terrain, paint, x, y, top);
    } else if (tile.height > 0) {
      // Height skirt (left + right faces) down to the ground.
      const drop = tile.height * HEIGHT_STEP;
      ctx.fillStyle = theme.left;
      ctx.beginPath();
      ctx.moveTo(top.x - TILE_W / 2, top.y);
      ctx.lineTo(top.x, top.y + TILE_H / 2);
      ctx.lineTo(top.x, top.y + TILE_H / 2 + drop);
      ctx.lineTo(top.x - TILE_W / 2, top.y + drop);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = theme.right;
      ctx.beginPath();
      ctx.moveTo(top.x + TILE_W / 2, top.y);
      ctx.lineTo(top.x, top.y + TILE_H / 2);
      ctx.lineTo(top.x, top.y + TILE_H / 2 + drop);
      ctx.lineTo(top.x + TILE_W / 2, top.y + drop);
      ctx.closePath();
      ctx.fill();
    }

    // Top face. With terrain this already happened inside `paintTerrainTile`, WITHOUT a grid
    // line: a stroke on every tile is what made the old board read as tiles.
    if (!terrain) {
      diamond(ctx, top);
      ctx.fillStyle = tile.passable ? theme.top : theme.impassable;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.grid;
      ctx.stroke();
    }

    const k = `${x},${y}`;

    // Move-range highlight.
    if (rangeSet.has(k)) {
      diamond(ctx, top);
      ctx.fillStyle = theme.highlight;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.highlightEdge;
      ctx.stroke();
    }

    // Legal act target — a distinct warm tint so "I can hit this" never reads as
    // "I can walk here".
    if (targetSet.has(k)) {
      diamond(ctx, top);
      ctx.fillStyle = theme.target;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.targetEdge;
      ctx.stroke();
    }

    // STAGED move destination (pure UI intent — nothing has moved in the sim).
    if (stagedKey === k) {
      diamond(ctx, top);
      ctx.fillStyle = theme.staged;
      ctx.fill();
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.stagedEdge;
      ctx.stroke();
      ctx.restore();
    }

    // Keyboard tile cursor.
    if (cursorKey === k) {
      diamond(ctx, top);
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.cursor;
      ctx.stroke();
      ctx.restore();
    }

    // Anything STANDING on this tile — props, units, the staged ghost.
    //
    // WITH TERRAIN THIS IS DEFERRED TO A SECOND PASS. A tree is taller than a tile, so
    // drawing it here let the very next tile in painter's order paint over its canopy —
    // every tree on the map lost its head, and on a flat map that is every tree.
    //
    // The trade-off of the second pass is the opposite error: nothing standing is ever
    // occluded BY terrain, so a unit behind a tall cliff shows through. THAT IS NO LONGER
    // A HYPOTHETICAL — battle 4 has walls (ADR-0031). It stays invisible there only
    // because every PASSABLE tile on that map is the same height (2), so nothing can
    // stand behind anything. The first map with two standable heights makes it visible,
    // and that map is the one that has to fix this.
    if (terrain) {
      standing.push({ x, y, top, k });
    } else {
      drawStandingAt(k, top);
    }
  }

  for (const s of standing) {
    const prop = terrain ? propAt(terrain, s.x, s.y) : undefined;
    if (prop) drawProp(ctx, prop, paint, s.top, s.x, s.y);
    drawStandingAt(s.k, s.top);
  }

  // Pending charged-spell target reticles (docs/01 §3): a charge resolves against
  // its tile, so mark where each in-flight spell will land.
  for (const c of state.chargeQueue) {
    const t = state.grid.tiles[c.targetTile.y * width + c.targetTile.x];
    if (!t) continue;
    const p = project(c.targetTile.x, c.targetTile.y, t.height, origin);
    ctx.save();
    ctx.strokeStyle = "#ff7a3c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 15, p.y);
    ctx.lineTo(p.x + 15, p.y);
    ctx.moveTo(p.x, p.y - 15);
    ctx.lineTo(p.x, p.y + 15);
    ctx.stroke();
    ctx.restore();
  }

  // Damage / heal / miss popups, drawn last so they sit above everything.
  for (const popup of opts.popups ?? []) {
    const t = state.grid.tiles[popup.pos.y * width + popup.pos.x];
    const p = project(popup.pos.x, popup.pos.y, t?.height ?? 0, origin);
    ctx.font = "700 20px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0b0f1c";
    ctx.fillStyle =
      popup.kind === "damage" ? "#ff5d5d" : popup.kind === "heal" ? theme.buff : "#9aa4bb";
    ctx.strokeText(popup.text, p.x, p.y - 40);
    ctx.fillText(popup.text, p.x, p.y - 40);
    ctx.textAlign = "start";
  }

  ctx.restore(); // pairs with the camera's `save`/`scale` above
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  u: UnitState,
  top: Position,
  active: "none" | "player" | "ai",
  theme: Theme,
  unitColor?: (u: UnitState) => string,
): void {
  // The caller's mapping wins; `UNIT_META` remains the demo page's own answer, and the
  // grey is the last resort for a unit neither one names.
  const color = unitColor?.(u) ?? UNIT_META[u.id]?.color ?? "#9aa4bb";
  const cx = top.x;
  const cy = top.y - 20;

  // KO'd unit → a dim crystal on the tile (docs/01 §11), no token/HP bar.
  if (u.hp <= 0) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx + 8, cy + 2);
    ctx.lineTo(cx, cy + 12);
    ctx.lineTo(cx - 8, cy + 2);
    ctx.closePath();
    ctx.fillStyle = "#5a6b8f";
    ctx.fill();
    ctx.strokeStyle = "#aeb8ff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Crystal countdown (3→0) while the unit can still be revived (docs/01 §11).
    if (u.crystalTimer > 0) {
      ctx.fillStyle = "#dfe6ff";
      ctx.font = "700 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(u.crystalTimer), cx, cy + 6);
      ctx.textAlign = "start";
    }
    ctx.restore();
    return;
  }

  // Active-unit ring. PLAYER = solid gold ("you may act"); AI = dashed warm ring
  // ("watch"). Two different treatments, not two shades of one.
  if (active !== "none") {
    const ring = active === "player" ? theme.active : theme.activeAi;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, top.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = ring + "44";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ring;
    if (active === "ai") ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  }

  // Base shadow.
  ctx.beginPath();
  ctx.ellipse(cx, top.y, 12, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#00000055";
  ctx.fill();

  // Token body.
  ctx.beginPath();
  ctx.moveTo(cx, cy - 16);
  ctx.lineTo(cx + 11, cy);
  ctx.lineTo(cx, cy + 10);
  ctx.lineTo(cx - 11, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#0b0f1c";
  ctx.stroke();

  // Facing pip.
  const dir = { N: [0, -1], E: [1, 0.5], S: [0, 1], W: [-1, 0.5] }[u.facing] as [number, number];
  ctx.beginPath();
  ctx.arc(cx + dir[0] * 9, cy + dir[1] * 8 - 3, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "#0b0f1c";
  ctx.fill();

  // HP bar.
  const w = 22;
  const frac = u.hp / u.maxHp;
  ctx.fillStyle = "#0b0f1c";
  ctx.fillRect(cx - w / 2, cy - 24, w, 4);
  ctx.fillStyle = frac > 0.5 ? "#5cc98d" : frac > 0.25 ? "#e2a948" : "#e2603c";
  ctx.fillRect(cx - w / 2, cy - 24, w * frac, 4);

  // Active-status chips, above the HP bar (buff = green, debuff = red).
  drawStatusBadges(ctx, u, cx, cy, theme);
}

/** One-glyph label per status id; falls back to the id's first letter. */
const STATUS_GLYPH: Record<string, string> = {
  haste: "H", slow: "S", stop: "X", protect: "P", shell: "E",
  sleep: "Z", "dont-act": "D", petrify: "T", silence: "!", charm: "C",
};

function statusGlyph(id: string): string {
  return STATUS_GLYPH[id] ?? (id[0]?.toUpperCase() ?? "?");
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * A compact horizontal row of status chips above the unit's HP bar. Pure function
 * of `UnitState.statuses`: one chip per active status, coloured by buff/debuff,
 * with a single-glyph label. Sits at `cy - 38` so it never overlaps the HP bar
 * (`cy - 24`), the token, the facing pip, the active ring, or the KO crystal.
 */
function drawStatusBadges(
  ctx: CanvasRenderingContext2D,
  u: UnitState,
  cx: number,
  cy: number,
  theme: Theme,
): void {
  const statuses = u.statuses;
  if (statuses.length === 0) return;

  const chipW = 11;
  const chipH = 12;
  const gap = 3;
  const totalW = statuses.length * chipW + (statuses.length - 1) * gap;
  let x = cx - totalW / 2;
  // Clamp off the top edge so a unit on the back row still shows its chips.
  // TODO(status-overflow): the row is unbounded horizontally — with 3+ statuses
  // on one unit the centred chips can overrun neighbouring tokens. When a slice
  // renders that many at once, add a wrap or a "+N" overflow chip. The demo caps
  // at one status/unit, so this is latent, not live.
  const y = Math.max(2, cy - 38);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 9px ui-monospace, monospace";
  for (const st of statuses) {
    roundedRect(ctx, x, y, chipW, chipH, 3);
    ctx.fillStyle = st.kind === "buff" ? theme.buff : theme.debuff;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#0b0f1c";
    ctx.stroke();
    ctx.fillStyle = "#0b0f1c";
    ctx.fillText(statusGlyph(st.id), x + chipW / 2, y + chipH / 2 + 0.5);
    x += chipW + gap;
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Terrain painting ("Daylight field"). Everything below runs ONLY when
// `DrawOptions.terrain` is supplied; the terrainless path above is untouched.
// ─────────────────────────────────────────────────────────────────────────────

function propAt(terrain: TerrainMap, x: number, y: number): PropKind | undefined {
  for (const p of terrain.props) if (p.pos.x === x && p.pos.y === y) return p.kind;
  return undefined;
}

/**
 * One tile's ground: its exposed side faces first, then its textured top.
 *
 * THE SIDE FACES ARE CULLED AGAINST THE NEIGHBOUR, which is the whole difference
 * between ground and tiles. The LEFT face is shared with `(x, y + 1)` and the RIGHT with
 * `(x + 1, y)`; a face is only drawn where this tile stands higher than that neighbour,
 * or where the map ends. Drawing every tile's full skirt — as the flat path does, and as
 * the first draft of this did — puts a wall between two tiles of equal height and the
 * field reads as a stack of blocks.
 *
 * Off the map, the drop runs one step BELOW the ground so the whole diorama has a
 * visible thickness, the way an FFT map sits in the air rather than lying on the page.
 */
function paintTerrainTile(
  ctx: CanvasRenderingContext2D,
  state: BattleState,
  terrain: TerrainMap,
  paint: TerrainPalette,
  x: number,
  y: number,
  top: Position,
): void {
  const { width, height, tiles } = state.grid;
  const kind = terrainAt(terrain, x, y) ?? "grass";
  const surface = paint.surfaces[kind];
  const h = tiles[y * width + x]!.height;
  const heightOf = (cx: number, cy: number): number | null =>
    cx < 0 || cy < 0 || cx >= width || cy >= height ? null : (tiles[cy * width + cx]?.height ?? null);

  const baseDrop = (h + 1) * HEIGHT_STEP;
  const nL = heightOf(x, y + 1);
  const nR = heightOf(x + 1, y);
  const dropL = nL === null ? baseDrop : Math.max(0, (h - nL) * HEIGHT_STEP);
  const dropR = nR === null ? baseDrop : Math.max(0, (h - nR) * HEIGHT_STEP);
  if (dropL > 0) paintWall(ctx, paint, surface, top, dropL, "L");
  if (dropR > 0) paintWall(ctx, paint, surface, top, dropR, "R");

  paintSurface(ctx, paint, surface, kind, top, x, y);

  // Ambient occlusion where a TALLER neighbour stands behind this tile.
  const bX = heightOf(x - 1, y);
  const bY = heightOf(x, y - 1);
  if ((bX !== null && bX > h) || (bY !== null && bY > h)) {
    ctx.save();
    diamond(ctx, top);
    ctx.clip();
    ctx.fillStyle = paint.occlusion;
    if (bX !== null && bX > h) {
      ctx.beginPath();
      ctx.moveTo(top.x - TILE_W / 2, top.y);
      ctx.lineTo(top.x, top.y - TILE_H / 2);
      ctx.lineTo(top.x + 4, top.y - TILE_H / 2 + 8);
      ctx.lineTo(top.x - TILE_W / 2 + 12, top.y + 6);
      ctx.closePath();
      ctx.fill();
    }
    if (bY !== null && bY > h) {
      ctx.beginPath();
      ctx.moveTo(top.x + TILE_W / 2, top.y);
      ctx.lineTo(top.x, top.y - TILE_H / 2);
      ctx.lineTo(top.x - 4, top.y - TILE_H / 2 + 8);
      ctx.lineTo(top.x + TILE_W / 2 - 12, top.y + 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // A lit edge ONLY where there is a real edge. Drawn on every tile it is a grid.
  if (dropL > 0) {
    ctx.beginPath();
    ctx.moveTo(top.x - TILE_W / 2, top.y);
    ctx.lineTo(top.x, top.y + TILE_H / 2);
    ctx.strokeStyle = paint.edgeLight;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (dropR > 0) {
    ctx.beginPath();
    ctx.moveTo(top.x + TILE_W / 2, top.y);
    ctx.lineTo(top.x, top.y + TILE_H / 2);
    ctx.strokeStyle = paint.strata;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

/** The textured top face. Clipped to the diamond, so detail never bleeds onto a neighbour. */
function paintSurface(
  ctx: CanvasRenderingContext2D,
  paint: TerrainPalette,
  surface: { base: string; mottle: string; detail: string },
  kind: TerrainKind,
  top: Position,
  x: number,
  y: number,
): void {
  diamond(ctx, top);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = surface.base;
  ctx.fillRect(top.x - TILE_W / 2, top.y - TILE_H / 2, TILE_W, TILE_H);

  const r = tileNoise(x, y);
  let i: number;

  if (kind === "grass") {
    ctx.fillStyle = surface.mottle;
    for (i = 0; i < 11; i++) {
      ctx.beginPath();
      ctx.ellipse(top.x - 30 + r() * 60, top.y - 13 + r() * 26, 3 + r() * 5, 1.6 + r() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = surface.detail;
    ctx.lineWidth = 1;
    for (i = 0; i < 16; i++) {
      const px = top.x - 28 + r() * 56;
      const py = top.y - 12 + r() * 24;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 1.6, py - 3.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 1.8, py - 3); ctx.stroke();
    }
  } else if (kind === "dirt" || kind === "sand") {
    ctx.fillStyle = surface.mottle;
    for (i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.ellipse(top.x - 28 + r() * 56, top.y - 12 + r() * 24, 4 + r() * 7, 2 + r() * 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = surface.detail;
    for (i = 0; i < 14; i++) ctx.fillRect(top.x - 28 + r() * 56, top.y - 12 + r() * 24, 1.4, 1.2);
  } else if (kind === "rock") {
    // Broken slabs. Seams that ran tile-to-tile made the plateau read as decking.
    ctx.fillStyle = surface.mottle;
    for (i = 0; i < 5; i++) {
      const px = top.x - 22 + r() * 44;
      const py = top.y - 9 + r() * 18;
      const sw = 7 + r() * 9;
      const sh = sw * 0.5;
      ctx.beginPath();
      ctx.moveTo(px - sw, py); ctx.lineTo(px, py - sh); ctx.lineTo(px + sw, py); ctx.lineTo(px, py + sh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = surface.detail;
    ctx.lineWidth = 0.9;
    for (i = 0; i < 4; i++) {
      const px = top.x - 20 + r() * 40;
      const py = top.y - 8 + r() * 16;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 5 + r() * 7, py + 2 + r() * 3); ctx.stroke();
    }
  } else if (kind === "water") {
    // NO FIXED-OFFSET BAND. A full-width `fillRect` at a constant offset from the tile
    // centre repeats identically on every water tile and draws a plain lattice across a
    // river — a grid by another name, which is the one thing this direction exists to
    // remove. It was there, and it took an adversarial review of the shipped frame to
    // see it. Both the tone patches and the crests are now placed by the tile's own
    // noise, so no two tiles agree.
    ctx.fillStyle = surface.mottle;
    for (i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(
        top.x - 30 + r() * 60,
        top.y - 12 + r() * 24,
        7 + r() * 12,
        2 + r() * 3,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.strokeStyle = surface.detail;
    ctx.lineWidth = 1.3;
    const crests = 2 + Math.floor(r() * 2);
    for (i = 0; i < crests; i++) {
      const px = top.x - 26 + r() * 40;
      const py = top.y - 11 + r() * 22;
      const w = 9 + r() * 9;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + w / 2, py - 2.2, px + w, py);
      ctx.stroke();
    }
  } else {
    // wood: planks running one way, with the grain
    ctx.strokeStyle = surface.detail;
    ctx.lineWidth = 1.1;
    for (i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(top.x - TILE_W / 2 + 6, top.y + i * 9);
      ctx.lineTo(top.x + TILE_W / 2 - 6, top.y + i * 9 - 2);
      ctx.stroke();
    }
    ctx.fillStyle = surface.mottle;
    for (i = 0; i < 6; i++) ctx.fillRect(top.x - 24 + r() * 48, top.y - 10 + r() * 20, 2.2, 1.2);
  }
  ctx.restore();
  void paint;
}

/** One exposed side face of a drop: base tone, bedding lines, grit, and a dark foot. */
function paintWall(
  ctx: CanvasRenderingContext2D,
  paint: TerrainPalette,
  surface: { wallLeft: string; wallRight: string },
  top: Position,
  drop: number,
  side: "L" | "R",
): void {
  const half = TILE_W / 2;
  const hh = TILE_H / 2;
  const dir = side === "L" ? -1 : 1;
  const face = (): void => {
    ctx.beginPath();
    ctx.moveTo(top.x + dir * half, top.y);
    ctx.lineTo(top.x, top.y + hh);
    ctx.lineTo(top.x, top.y + hh + drop);
    ctx.lineTo(top.x + dir * half, top.y + drop);
    ctx.closePath();
  };

  face();
  ctx.fillStyle = side === "L" ? surface.wallLeft : surface.wallRight;
  ctx.fill();

  ctx.save();
  face();
  ctx.clip();
  ctx.strokeStyle = paint.strata;
  ctx.lineWidth = 1;
  const bands = Math.max(2, Math.round(drop / 9));
  for (let i = 1; i < bands; i++) {
    const t = i / bands;
    ctx.beginPath();
    ctx.moveTo(top.x + dir * half, top.y + drop * t + 1);
    ctx.lineTo(top.x, top.y + hh + drop * t + 1);
    ctx.stroke();
  }
  const r = tileNoise(Math.round(top.x), Math.round(top.y), side === "L" ? 7 : 13);
  ctx.fillStyle = paint.strata;
  for (let j = 0; j < 14; j++) {
    ctx.fillRect(top.x + dir * r() * half, top.y + hh * r() + drop * r(), 1.5, 1.5);
  }
  const grad = ctx.createLinearGradient(0, top.y, 0, top.y + hh + drop);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, paint.occlusion);
  ctx.fillStyle = grad;
  ctx.fillRect(top.x - half, top.y, TILE_W, hh + drop);
  ctx.restore();
}

/**
 * A prop standing on a tile. Decoration: nothing here is pickable, blocks movement, or
 * appears in `BattleState`.
 *
 * The canopy takes `paint.leaf`, NOT the grass surface's green — a tree painted in the
 * ground's own colour is invisible everywhere except against the sky.
 */
function drawProp(
  ctx: CanvasRenderingContext2D,
  kind: PropKind,
  paint: TerrainPalette,
  top: Position,
  x: number,
  y: number,
): void {
  const r = tileNoise(x, y, 31);
  const cx = top.x;
  const base = top.y + 2;

  ctx.save();
  ctx.fillStyle = paint.shadow;
  ctx.beginPath();
  ctx.ellipse(cx, base, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (kind === "tree") {
    ctx.fillStyle = paint.bark;
    ctx.fillRect(cx - 2.6, base - 22, 5.2, 22);
    const canopy: readonly (readonly [number, number, number])[] = [
      [0, -34, 13], [-9, -27, 9.5], [9, -28, 9], [-3, -42, 9], [6, -38, 8],
    ];
    canopy.forEach(([dx, dy, rad], i) => {
      ctx.beginPath();
      ctx.arc(cx + dx, base + dy, rad, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? paint.leafLit : paint.leaf;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(cx - 4, base - 40, 6.5, Math.PI * 0.75, Math.PI * 1.75);
    ctx.strokeStyle = paint.edgeLight;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  } else if (kind === "pillar") {
    const tall = 30 + r() * 8;
    ctx.beginPath();
    ctx.moveTo(cx - 7, base); ctx.lineTo(cx + 7, base);
    ctx.lineTo(cx + 6, base - tall); ctx.lineTo(cx - 5, base - tall + 4);
    ctx.closePath();
    ctx.fillStyle = paint.stone;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 1, base); ctx.lineTo(cx + 7, base); ctx.lineTo(cx + 6, base - tall);
    ctx.closePath();
    ctx.fillStyle = paint.strata;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 5, base - tall + 4); ctx.lineTo(cx + 6, base - tall);
    ctx.strokeStyle = paint.edgeLight;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  } else {
    const lumps: readonly (readonly [number, number, number])[] = [[0, 11, 7], [-8, 7, 4.5]];
    lumps.forEach(([dx, rw, rh], i) => {
      ctx.beginPath();
      ctx.ellipse(cx + dx, base - rh, rw, rh, 0, Math.PI, 0);
      ctx.lineTo(cx + dx - rw, base);
      ctx.closePath();
      ctx.fillStyle = i ? paint.stone : paint.stoneLit;
      ctx.fill();
    });
    ctx.beginPath();
    ctx.ellipse(cx - 2, base - 7, 8, 5, 0, Math.PI * 1.05, Math.PI * 1.75);
    ctx.strokeStyle = paint.edgeLight;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();
}
