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
  defaultUnit,
  makeFlatTiles,
  moveRange,
  resolveAttack,
  settleTurn,
  type ActiveActor,
  type AttackOutcome,
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

const unit = (id: string, teamId: number, over: Partial<UnitState>): UnitState =>
  defaultUnit(id, teamId, { jump: 2, ...over });

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
    unit("knight", 0, {
      pos: { x: 1, y: 1 }, facing: "S", speed: 9, move: 4, hp: 130, maxHp: 130,
      pa: 11, brave: 72, zodiac: { sign: "aries", gender: "male" },
      weapon: { wp: 15, formula: "braveWp", element: "none", accuracy: 100 },
      evasion: { classEv: 10, weaponEv: 0, shieldEv: 15, accessoryEv: 0 },
    }),
    unit("archer", 0, {
      pos: { x: 1, y: 5 }, facing: "E", speed: 11, move: 4, hp: 90, maxHp: 90,
      pa: 9, brave: 68, zodiac: { sign: "taurus", gender: "female" },
      weapon: { wp: 10, formula: "speedWp", element: "none", accuracy: 100 },
      evasion: { classEv: 15, weaponEv: 0, shieldEv: 0, accessoryEv: 0 },
    }),
    unit("brawler", 1, {
      pos: { x: 7, y: 1 }, facing: "W", speed: 8, move: 3, jump: 3, hp: 120, maxHp: 120,
      pa: 13, brave: 75, zodiac: { sign: "gemini", gender: "male" },
      weapon: { wp: 0, formula: "bareHands", element: "none", accuracy: 100 },
      evasion: { classEv: 25, weaponEv: 0, shieldEv: 0, accessoryEv: 0 },
    }),
    unit("mage", 1, {
      pos: { x: 7, y: 5 }, facing: "N", speed: 13, move: 3, jump: 1, hp: 80, maxHp: 80,
      pa: 7, ma: 12, brave: 60, zodiac: { sign: "cancer", gender: "female" },
      weapon: { wp: 6, formula: "paWp", element: "none", accuracy: 100 },
      evasion: { classEv: 8, weaponEv: 0, shieldEv: 0, accessoryEv: 0 },
    }),
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
  /** The attack the active unit made this turn, if any (for the damage popup). */
  attack: AttackOutcome | null;
}

const adjacent = (a: Position, b: Position): boolean => manhattan(a, b) === 1;

/**
 * Advance one active turn (deterministic policy): the active unit closes on the
 * nearest living enemy within its Move/Jump range, and if it ends up adjacent,
 * attacks — a move+act turn resolved through the real damage pipeline.
 */
export function stepDemo(input: BattleState): StepResult {
  const { state: adv, active } = advanceToNextTurn(input);
  if (!active || active.kind !== "unit") {
    return { state: adv, active, activeRange: [], moved: false, attack: null };
  }

  let state = adv;
  const actorId = active.id;
  const actor = () => state.units.find((u) => u.id === actorId)!;
  const enemies = () => state.units.filter((u) => u.teamId !== actor().teamId && u.hp > 0);

  const range = moveRange(state.grid, state.units, actorId);
  const foes = enemies();
  let moved = false;
  let attack: AttackOutcome | null = null;

  if (foes.length > 0) {
    const target = [...foes].sort(
      (a, b) => manhattan(actor().pos, a.pos) - manhattan(actor().pos, b.pos) || (a.id < b.id ? -1 : 1),
    )[0]!;

    // Move to close the distance if not already adjacent.
    if (!adjacent(actor().pos, target.pos)) {
      const here = manhattan(actor().pos, target.pos);
      const best = [...range].sort(
        (p, q) => manhattan(p, target.pos) - manhattan(q, target.pos) || p.y - q.y || p.x - q.x,
      )[0];
      if (best && manhattan(best, target.pos) < here) {
        const m = actor();
        m.facing = faceToward(m.pos, best);
        m.pos = best;
        moved = true;
      }
    }

    // Attack if a living enemy is now adjacent.
    const adjFoe = enemies().find((e) => adjacent(actor().pos, e.pos));
    if (adjFoe) {
      actor().facing = faceToward(actor().pos, adjFoe.pos);
      const res = resolveAttack(state, actorId, adjFoe.id);
      state = res.state;
      attack = res.outcome;
    } else if (!moved) {
      actor().facing = faceToward(actor().pos, target.pos);
    }
  }

  const settled = settleTurn(state, actorId, { didMove: moved, didAct: attack !== null });
  if (attack === null) {
    settled.turnLog.push({ tick: settled.tick, unitId: actorId, action: moved ? "move" : "wait" });
  }
  return { state: settled, active, activeRange: range, moved, attack };
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
