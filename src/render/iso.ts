/**
 * Isometric canvas renderer (render layer only). Turns the sim's LOGICAL grid
 * — tiles with (x, y) + integer height, units with position + facing — into a
 * 2.5D view via a pure projection `screen = f(x, y, height)`. The sim knows
 * nothing about any of this (ADR-0007): swap this file to change the look.
 */

import type { BattleState, Position, UnitState } from "../sim/index.js";
import { UNIT_META } from "./demo.js";

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
  text: "#e8ecf5",
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

/** Origin that centres the whole grid in the canvas. */
export function originFor(state: BattleState, canvasW: number, canvasH: number): Position {
  const { width, height } = state.grid;
  const midX = ((width - 1) - (height - 1)) * (TILE_W / 2);
  const spanY = ((width - 1) + (height - 1)) * (TILE_H / 2);
  return { x: canvasW / 2 - midX / 2, y: (canvasH - spanY) / 2 + TILE_H };
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
  hit: boolean;
}

export interface DrawOptions {
  activeId?: string | undefined;
  range?: readonly Position[];
  popup?: DamagePopup | undefined;
  theme?: Theme;
}

export function draw(
  ctx: CanvasRenderingContext2D,
  state: BattleState,
  canvasW: number,
  canvasH: number,
  opts: DrawOptions = {},
): void {
  const theme = opts.theme ?? DARK_THEME;
  const origin = originFor(state, canvasW, canvasH);
  const { width, height, tiles } = state.grid;

  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.lineJoin = "round";

  const rangeSet = new Set((opts.range ?? []).map((p) => `${p.x},${p.y}`));
  const unitAt = new Map<string, UnitState>();
  for (const u of state.units) unitAt.set(`${u.pos.x},${u.pos.y}`, u);

  // Painter's order: back (low x+y) to front so height overlaps correctly.
  const cells: Position[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push({ x, y });
  cells.sort((a, b) => a.x + a.y - (b.x + b.y));

  for (const { x, y } of cells) {
    const tile = tiles[y * width + x];
    if (!tile) continue;
    const top = project(x, y, tile.height, origin);

    // Height skirt (left + right faces) down to the ground.
    if (tile.height > 0) {
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

    // Top face.
    diamond(ctx, top);
    ctx.fillStyle = tile.passable ? theme.top : theme.impassable;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.grid;
    ctx.stroke();

    // Move-range highlight.
    if (rangeSet.has(`${x},${y}`)) {
      diamond(ctx, top);
      ctx.fillStyle = theme.highlight;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.highlightEdge;
      ctx.stroke();
    }

    // Unit on this tile.
    const u = unitAt.get(`${x},${y}`);
    if (u) drawUnit(ctx, u, top, u.id === opts.activeId, theme);
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

  // Damage / miss popup, drawn last so it sits above everything.
  if (opts.popup) {
    const t = state.grid.tiles[opts.popup.pos.y * width + opts.popup.pos.x];
    const p = project(opts.popup.pos.x, opts.popup.pos.y, t?.height ?? 0, origin);
    ctx.font = "700 20px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0b0f1c";
    ctx.fillStyle = opts.popup.hit ? "#ff5d5d" : "#9aa4bb";
    ctx.strokeText(opts.popup.text, p.x, p.y - 40);
    ctx.fillText(opts.popup.text, p.x, p.y - 40);
    ctx.textAlign = "start";
  }
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  u: UnitState,
  top: Position,
  active: boolean,
  theme: Theme,
): void {
  const meta = UNIT_META[u.id];
  const color = meta?.color ?? "#9aa4bb";
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

  if (active) {
    ctx.beginPath();
    ctx.arc(cx, top.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = theme.active + "44";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.active;
    ctx.stroke();
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
