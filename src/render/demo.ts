/**
 * Demo battle + a DETERMINISTIC step policy for the viewer.
 *
 * This is render-layer glue, not sim code — but it is kept fully deterministic
 * (no Math.random, no wall-clock) on purpose, so the viewer produces identical
 * frames every run and the Playwright screenshots are stable.
 *
 * What it shows honestly for PR2: the CT clock driving turn order, and units
 * maneuvering across the grid within their Move/Jump range. There is no damage
 * yet — attack resolution and formulas land in PR3.
 */

import {
  advanceToNextTurn,
  createBattleState,
  makeFlatTiles,
  moveRange,
  settleTurn,
  type ActiveActor,
  type BattleState,
  type Facing,
  type Position,
  type UnitState,
} from "../sim/index.js";

export interface DemoUnitMeta {
  label: string;
  color: string;
  role: string;
}

/** Presentation metadata by unit id (render-only; not part of BattleState). */
export const UNIT_META: Record<string, DemoUnitMeta> = {
  knight: { label: "Knight", color: "#4f8cff", role: "Team A · Spd 9" },
  archer: { label: "Archer", color: "#2fb6c8", role: "Team A · Spd 11" },
  brawler: { label: "Brawler", color: "#e2603c", role: "Team B · Spd 8" },
  mage: { label: "Mage", color: "#c86ee0", role: "Team B · Spd 13" },
};

function unit(id: string, teamId: number, over: Partial<UnitState>): UnitState {
  return {
    id,
    teamId,
    pos: { x: 0, y: 0 },
    facing: "S",
    ct: 0,
    speed: 10,
    move: 3,
    jump: 2,
    hp: 100,
    maxHp: 100,
    statuses: [],
    ...over,
  };
}

/** A small map with a central plateau, a ramp, and one impassable rock. */
export function makeDemoBattle(): BattleState {
  const width = 9;
  const height = 7;
  const tiles = makeFlatTiles(width, height, 0);
  const set = (x: number, y: number, h: number, passable = true): void => {
    tiles[y * width + x] = { height: h, passable };
  };
  // Central plateau (height 2) with a skirt of height-1 tiles (a climbable ramp).
  set(4, 3, 2);
  set(3, 3, 1);
  set(5, 3, 1);
  set(4, 2, 1);
  set(4, 4, 1);
  // An impassable rock the pathing must route around.
  set(6, 2, 0, false);

  const units: UnitState[] = [
    unit("knight", 0, { pos: { x: 1, y: 1 }, facing: "S", speed: 9, move: 4, jump: 2 }),
    unit("archer", 0, { pos: { x: 1, y: 5 }, facing: "E", speed: 11, move: 4, jump: 2 }),
    unit("brawler", 1, { pos: { x: 7, y: 1 }, facing: "W", speed: 8, move: 3, jump: 3 }),
    unit("mage", 1, { pos: { x: 7, y: 5 }, facing: "N", speed: 13, move: 3, jump: 1 }),
  ];

  return createBattleState({ seed: 20260730, grid: { width, height, tiles }, units });
}

const manhattan = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function faceToward(from: Position, to: Position): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "E" : "W";
  return dy >= 0 ? "S" : "N";
}

export interface StepResult {
  state: BattleState;
  active: ActiveActor | null;
  /** The move-range that was available to the active unit this turn (for the highlight). */
  activeRange: Position[];
  moved: boolean;
}

/**
 * Advance one active turn. The active unit steps toward the nearest enemy
 * (deterministic tie-breaks), staying within its Move/Jump range, then settles.
 */
export function stepDemo(input: BattleState): StepResult {
  const { state: adv, active } = advanceToNextTurn(input);
  if (!active || active.kind !== "unit") {
    return { state: adv, active, activeRange: [], moved: false };
  }

  const actor = adv.units.find((u) => u.id === active.id);
  if (!actor) return { state: adv, active, activeRange: [], moved: false };

  const range = moveRange(adv.grid, adv.units, actor.id);
  const enemies = adv.units.filter((u) => u.teamId !== actor.teamId && u.hp > 0);

  let moved = false;
  if (enemies.length > 0) {
    const target = [...enemies].sort(
      (a, b) => manhattan(actor.pos, a.pos) - manhattan(actor.pos, b.pos) || (a.id < b.id ? -1 : 1),
    )[0]!;
    const here = manhattan(actor.pos, target.pos);
    const best = [...range].sort(
      (p, q) => manhattan(p, target.pos) - manhattan(q, target.pos) || p.y - q.y || p.x - q.x,
    )[0];
    if (best && manhattan(best, target.pos) < here) {
      actor.facing = faceToward(actor.pos, best);
      actor.pos = best;
      moved = true;
    } else {
      actor.facing = faceToward(actor.pos, target.pos);
    }
  }

  const settled = settleTurn(adv, actor.id, { didMove: moved, didAct: false });
  settled.turnLog.push({ tick: settled.tick, unitId: actor.id, action: moved ? "move" : "wait" });
  return { state: settled, active, activeRange: range, moved };
}

/** Forecast the next `n` actors without mutating state (turn-order timeline). */
export function forecast(input: BattleState, n = 8): ActiveActor[] {
  let state = input;
  const out: ActiveActor[] = [];
  for (let i = 0; i < n; i++) {
    const { state: adv, active } = advanceToNextTurn(state);
    if (!active) break;
    out.push(active);
    state =
      active.kind === "unit"
        ? settleTurn(adv, active.id, { didMove: false, didAct: true })
        : adv;
  }
  return out;
}
