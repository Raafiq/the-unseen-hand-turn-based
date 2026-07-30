/**
 * Demo battle + a DETERMINISTIC step policy for the viewer.
 *
 * Render-layer glue, not sim code — but kept fully deterministic (no Math.random,
 * no wall-clock) so the viewer produces identical frames every run and the
 * Playwright screenshots are stable.
 *
 * Shows: the CT clock driving turn order; units maneuvering within Move/Jump
 * range and attacking (real damage / KO / crystals, PR3); and the Mage casting a
 * CHARGED spell at a target tile that builds on the shared timeline and then
 * lands — or WHIFFS if the target walks off the tile before it matures (PR4).
 */

import {
  advanceToNextTurn,
  createBattleState,
  declareCharge,
  defaultUnit,
  makeFlatTiles,
  moveRange,
  resolveAttack,
  resolveCharge,
  settleTurn,
  tickCrystal,
  type ActiveActor,
  type AttackOutcome,
  type BattleAbility,
  type BattleState,
  type ChargeOutcome,
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
      evasion: { classEv: 10, weaponEv: 0, shieldEv: 15, accessoryEv: 0, magicEv: 0 },
    }),
    unit("archer", 0, {
      pos: { x: 1, y: 5 }, facing: "E", speed: 11, move: 4, hp: 90, maxHp: 90,
      pa: 9, brave: 68, zodiac: { sign: "taurus", gender: "female" },
      weapon: { wp: 10, formula: "speedWp", element: "none", accuracy: 100 },
      evasion: { classEv: 15, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    }),
    unit("brawler", 1, {
      pos: { x: 7, y: 1 }, facing: "W", speed: 8, move: 3, jump: 3, hp: 120, maxHp: 120,
      pa: 13, brave: 75, zodiac: { sign: "gemini", gender: "male" },
      weapon: { wp: 0, formula: "bareHands", element: "none", accuracy: 100 },
      evasion: { classEv: 25, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    }),
    unit("mage", 1, {
      pos: { x: 7, y: 5 }, facing: "N", speed: 13, move: 3, jump: 1, hp: 80, maxHp: 80,
      pa: 7, ma: 12, brave: 60, faith: 65, zodiac: { sign: "cancer", gender: "female" },
      weapon: { wp: 6, formula: "paWp", element: "none", accuracy: 100 },
      evasion: { classEv: 8, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    }),
  ];

  // The Mage's charged spell is a LOADOUT-DERIVED ability (Slice 5): it lives in
  // the mage's `abilities` projection alongside its auto basic attack, and
  // stepDemo sources the cast's speed/effect from it — not an inline constant.
  const mage = units.find((u) => u.id === "mage")!;
  mage.abilities = [...mage.abilities, MAGE_SPELL_ABILITY];

  return createBattleState({ seed: 20260730, grid: { width, height, tiles }, units });
}

/** The Mage's charged spell: a slow nuke (low speed → dodgeable, docs/01 §3). */
const MAGE_CAST_RANGE = 6;
const MAGE_SPELL_ID = "spell.fire";
const MAGE_SPELL_ABILITY: BattleAbility = {
  id: MAGE_SPELL_ID,
  actionKind: "action",
  formula: "magic",
  power: 22,
  element: "fire",
  accuracy: 100,
  range: { h: MAGE_CAST_RANGE, v: 3 },
  inflicts: [],
  speed: 12,
};

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
  /** Move-range available to the active unit this turn (for the highlight). */
  activeRange: Position[];
  moved: boolean;
  /** A melee attack made this turn, if any (for the damage popup). */
  attack: AttackOutcome | null;
  /** A charged spell that RESOLVED this step, if any (land / whiff / cancel). */
  charge: ChargeOutcome | null;
}

const adjacent = (a: Position, b: Position): boolean => manhattan(a, b) === 1;

/**
 * Advance one active turn (deterministic policy):
 *   - a matured CHARGE resolves against its target tile (land / whiff / cancel);
 *   - a KO'd unit's turn ticks its crystal counter;
 *   - the Mage casts a charged spell at the nearest enemy's tile when in range;
 *   - everyone else closes and melees when adjacent.
 */
export function stepDemo(input: BattleState): StepResult {
  const { state: adv, active } = advanceToNextTurn(input);
  const idle = (state: BattleState): StepResult => ({
    state, active, activeRange: [], moved: false, attack: null, charge: null,
  });
  if (!active) return idle(adv);

  // A matured charge resolves against its target tile (docs/01 §3).
  if (active.kind === "charge") {
    const res = resolveCharge(adv, active.id);
    return { ...idle(res.state), charge: res.outcome };
  }

  let state = adv;
  const actorId = active.id;
  const me = (): UnitState => state.units.find((u) => u.id === actorId)!;

  // A KO'd unit's turn ticks its crystal counter instead of acting (docs/01 §11).
  if (me().hp <= 0) return idle(tickCrystal(state, actorId).state);

  const enemies = (): UnitState[] => state.units.filter((u) => u.teamId !== me().teamId && u.hp > 0);
  const range = moveRange(state.grid, state.units, actorId);
  const foes = enemies();
  if (foes.length === 0) {
    const settled = settleTurn(state, actorId, { didMove: false, didAct: false });
    settled.turnLog.push({ tick: settled.tick, unitId: actorId, action: "wait" });
    return { ...idle(settled), activeRange: range };
  }

  const target = [...foes].sort(
    (a, b) => manhattan(me().pos, a.pos) - manhattan(me().pos, b.pos) || (a.id < b.id ? -1 : 1),
  )[0]!;

  // The Mage casts a charged spell at the target's CURRENT tile when in range and
  // not already charging. It builds on the timeline; by the time it matures the
  // target may have walked off → whiff. (declareCharge ends the caster's turn.)
  const mageBusy = state.chargeQueue.some((c) => c.sourceUnitId === "mage");
  if (actorId === "mage" && !mageBusy && manhattan(me().pos, target.pos) <= MAGE_CAST_RANGE) {
    // Source the cast from the mage's equipped spell ability (Slice 5): its
    // speed/element/power/accuracy come from the loadout projection, not a payload.
    const spell = me().abilities.find((a) => a.id === MAGE_SPELL_ID)!;
    me().facing = faceToward(me().pos, target.pos);
    const next = declareCharge(state, "mage", {
      targetTile: { x: target.pos.x, y: target.pos.y },
      speed: spell.speed ?? 1,
      effect: { kind: "magic", power: spell.power, element: spell.element, accuracy: spell.accuracy },
    });
    return { state: next, active, activeRange: range, moved: false, attack: null, charge: null };
  }

  // Otherwise close the distance (Mage repositions to get in range; others melee).
  let moved = false;
  if (!adjacent(me().pos, target.pos)) {
    const here = manhattan(me().pos, target.pos);
    const best = [...range].sort(
      (p, q) => manhattan(p, target.pos) - manhattan(q, target.pos) || p.y - q.y || p.x - q.x,
    )[0];
    if (best && manhattan(best, target.pos) < here) {
      me().facing = faceToward(me().pos, best);
      me().pos = best;
      moved = true;
    }
  }

  let attack: AttackOutcome | null = null;
  if (actorId !== "mage") {
    const adjFoe = enemies().find((e) => adjacent(me().pos, e.pos));
    if (adjFoe) {
      me().facing = faceToward(me().pos, adjFoe.pos);
      const res = resolveAttack(state, actorId, adjFoe.id);
      state = res.state;
      attack = res.outcome;
    } else if (!moved) {
      me().facing = faceToward(me().pos, target.pos);
    }
  } else if (!moved) {
    me().facing = faceToward(me().pos, target.pos);
  }

  const settled = settleTurn(state, actorId, { didMove: moved, didAct: attack !== null });
  if (attack === null) {
    settled.turnLog.push({ tick: settled.tick, unitId: actorId, action: moved ? "move" : "wait" });
  }
  return { state: settled, active, activeRange: range, moved, attack, charge: null };
}

/** Forecast the next `n` actors without mutating state (turn-order timeline). */
export function forecast(input: BattleState, n = 8): ActiveActor[] {
  let state = input;
  const out: ActiveActor[] = [];
  for (let i = 0; i < n; i++) {
    const { state: adv, active } = advanceToNextTurn(state);
    if (!active) break;
    out.push(active);
    if (active.kind === "unit") {
      state = settleTurn(adv, active.id, { didMove: false, didAct: true });
    } else {
      // Preview only: drop the matured charge so the forecast advances past it
      // (the real resolution happens in stepDemo, not here).
      const i = adv.chargeQueue.findIndex((c) => c.id === active.id);
      if (i !== -1) adv.chargeQueue.splice(i, 1);
      state = adv;
    }
  }
  return out;
}
