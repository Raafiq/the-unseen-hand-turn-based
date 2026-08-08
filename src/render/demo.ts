/**
 * The demo battle + its presentation metadata + a pure turn-order forecast.
 *
 * Render-layer glue, not sim code. There is deliberately NO step policy here any
 * more: `stepDemo` was a SECOND turn-settling implementation (it called
 * `settleTurn` directly, outside the driver) and therefore a fork of the
 * `(seed, ordered commands)` substrate. Per ADR-0015 the viewer now advances with
 * `advanceToDecision` and commits with `applyCommand` — see `session.ts`.
 *
 * Also gone with it: the scripted Slow hex. It was render-layer FICTION — the UI
 * asserting a status the sim never inflicts (inflict-on-hit is deferred,
 * ADR-0010) — which docs/00 pillar 4 forbids. The Knight's opening **Protect**
 * survives because it is applied at battle construction through the sim's own
 * exported helper, so it is a real status the resolvers actually read.
 */

import {
  advanceToNextTurn,
  applyStatusToUnit,
  createBattleState,
  defaultUnit,
  legacyActiveStatus,
  makeFlatTiles,
  settleTurn,
  type ActiveActor,
  type BattleAbility,
  type BattleState,
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

/**
 * The PLAYER-controlled team of the demo battle.
 *
 * TODO(controller): read this from the encounter instead. `EncounterSchema`
 * already carries it per team as `Encounter.teams[].controller`
 * (`"ai" | "player"`, see `src/sim/encounter.ts`), but the demo builds a
 * `BattleState` DIRECTLY via `createBattleState` rather than through
 * `loadEncounter`, and `BattleState` itself carries no controller field — so the
 * value is genuinely not reachable here. When the viewer loads a real encounter,
 * derive this from `teams.find(t => t.controller === "player").teamId` and delete
 * the constant (docs/10 §2).
 */
export const PLAYER_TEAM = 0;

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
  // the mage's `abilities` projection alongside its auto basic attack, so the
  // driver sources the cast's speed/effect from the loadout, not an inline
  // constant — and the balance-probe AI can select it like any other action.
  const mage = units.find((u) => u.id === "mage")!;
  mage.abilities = [...mage.abilities, MAGE_SPELL_ABILITY];

  const state = createBattleState({ seed: 20260730, grid: { width, height, tiles }, units });

  // Showcase a BUFF from the opening frame: the Knight is a defender who steps in
  // already under Protect (docs/01 §6 — reduces incoming physical damage). Applied
  // through the sim's exported helper (never a hand-built status object) and kept
  // PERMANENT so the badge is visible in the initial screenshot and never decays.
  // It is a REAL status: `attackDamage` reads it, so the previewed and the dealt
  // number both include the reduction.
  return applyStatusToUnit(state, "knight", legacyActiveStatus("protect"));
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
  aoe: null,
};

/**
 * Forecast the next `n` actors without mutating state (turn-order timeline).
 *
 * PURE PREVIEW: `advanceToNextTurn` and `settleTurn` both clone their input, so
 * the caller's state is never touched, and neither consumes the seeded RNG — the
 * forecast can be recomputed on every hover without moving `rngCounter` or the
 * real `tick` (docs/10 AC-P6).
 */
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
      // (the real resolution happens in the driver, not here).
      const i = adv.chargeQueue.findIndex((c) => c.id === active.id);
      if (i !== -1) adv.chargeQueue.splice(i, 1);
      state = adv;
    }
  }
  return out;
}
