/**
 * Grid & positioning (docs/01 §7). Pure functions over the serialized
 * GridState/UnitState — no rendering, no isometric projection here (that is a
 * render-layer concern; the sim stays view-agnostic per ADR-0007).
 *
 * Determinism note (sim-determinism-guard): outputs never depend on Map/Set
 * iteration order. `moveRange` returns tiles sorted by (y, x) so results are
 * stable and comparable.
 */

import type { GridState, Position, Tile, UnitState, Facing } from "./state.js";
import type { RangeBox } from "./ability.js";

/** Orthogonal steps in fixed N, E, S, W order (movement is 4-directional). */
const STEP_DIRS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: -1 }, // N
  { dx: 1, dy: 0 }, // E
  { dx: 0, dy: 1 }, // S
  { dx: -1, dy: 0 }, // W
];

const FACING_VECTOR: Record<Facing, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

const OPPOSITE_FACING: Record<Facing, Facing> = { N: "S", S: "N", E: "W", W: "E" };

export function inBounds(grid: GridState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

export function tileIndex(grid: GridState, x: number, y: number): number {
  return y * grid.width + x;
}

/** The tile at (x, y), or `undefined` if out of bounds. */
export function tileAt(grid: GridState, x: number, y: number): Tile | undefined {
  if (!inBounds(grid, x, y)) return undefined;
  return grid.tiles[tileIndex(grid, x, y)];
}

const posKey = (x: number, y: number): string => `${x},${y}`;

/**
 * Tiles a unit can legally move to (docs/01 §7):
 *   - within `move` orthogonal steps (BFS, unit cost 1 per step),
 *   - each step's height delta within `jump`,
 *   - onto passable tiles only,
 *   - enemies block traversal; allies can be passed through but you may not
 *     **end** on any occupied tile,
 *   - the unit's own start tile is excluded.
 * Returned sorted by (y, x) for deterministic, comparable output.
 */
export function moveRange(grid: GridState, units: readonly UnitState[], unitId: string): Position[] {
  const unit = units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`moveRange: unknown unit ${unitId}`);

  const occupantTeam = new Map<string, number>();
  for (const u of units) occupantTeam.set(posKey(u.pos.x, u.pos.y), u.teamId);

  const startKey = posKey(unit.pos.x, unit.pos.y);
  const dist = new Map<string, number>([[startKey, 0]]);
  const queue: Position[] = [{ x: unit.pos.x, y: unit.pos.y }];

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (!cur) continue;
    const d = dist.get(posKey(cur.x, cur.y)) ?? 0;
    if (d >= unit.move) continue;
    const curTile = tileAt(grid, cur.x, cur.y);
    if (!curTile) continue;

    for (const { dx, dy } of STEP_DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = posKey(nx, ny);
      if (dist.has(nk)) continue;

      const t = tileAt(grid, nx, ny);
      if (!t || !t.passable) continue;
      if (Math.abs(t.height - curTile.height) > unit.jump) continue;

      const occTeam = occupantTeam.get(nk);
      if (occTeam !== undefined && occTeam !== unit.teamId) continue; // enemy blocks traversal

      dist.set(nk, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }

  const reachable: Position[] = [];
  for (const [k, d] of dist) {
    if (d === 0) continue; // exclude start tile
    if (occupantTeam.has(k)) continue; // cannot end on an occupied tile
    const [xs, ys] = k.split(",");
    reachable.push({ x: Number(xs), y: Number(ys) });
  }
  reachable.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return reachable;
}

/**
 * Whether `to` lies within an ability's range box FROM `from` (docs/01 §7,
 * docs/05 §6): Chebyshev horizontal reach ≤ `range.h` AND absolute height delta
 * ≤ `range.v`. This is the deterministic reach gate the driver uses to reject an
 * out-of-range act — symmetric with {@link moveRange} gating a move.
 *
 * P1 SIMPLIFICATION (ADR-0010 item 5, range/LoS still partial): no line-of-sight
 * or blocking yet — reach + height tolerance only. Chebyshev (not Manhattan) is
 * used so a melee `h:1` ability can strike a diagonally-adjacent tile.
 */
export function inAbilityRange(
  grid: GridState,
  from: Position,
  to: Position,
  range: RangeBox,
): boolean {
  const h = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
  if (h > range.h) return false;
  const fromTile = tileAt(grid, from.x, from.y);
  const toTile = tileAt(grid, to.x, to.y);
  if (!fromTile || !toTile) return false;
  return Math.abs(toTile.height - fromTile.height) <= range.v;
}

/**
 * Which face of `target` an attacker standing at `from` strikes (docs/01 §5c):
 *   - `front` — attacker is on the side the target faces,
 *   - `rear`  — attacker is directly behind,
 *   - `side`  — flank, including any diagonal or same-tile degenerate case.
 * Facing determines which evasion sources apply (PR3).
 */
export function relativeFacing(target: UnitState, from: Position): "front" | "side" | "rear" {
  const dx = from.x - target.pos.x;
  const dy = from.y - target.pos.y;
  const compass = attackCompass(dx, dy);
  if (compass === null) return "side";
  if (compass === target.facing) return "front";
  if (compass === OPPOSITE_FACING[target.facing]) return "rear";
  return "side";
}

/** Reduce an offset to a cardinal compass, or null for same-tile / pure diagonal. */
function attackCompass(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === ay) return null; // diagonal → treated as a flank
  if (ax > ay) return dx > 0 ? "E" : "W";
  return dy > 0 ? "S" : "N";
}

export { FACING_VECTOR, OPPOSITE_FACING };
