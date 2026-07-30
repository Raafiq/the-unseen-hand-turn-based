/**
 * Action resolution pipeline (docs/05 §2). PR3 implements the immediate
 * physical-attack path; charged actions, reactions, and status infliction land
 * in later slices.
 *
 * Determinism (docs/05 §3a): randomness is drawn from the battle's single
 * seeded stream, reconstructed from the state cursor, in a DECLARED order. For a
 * basic attack that order is:
 *   1. HIT ROLL   (one draw vs the post-evasion hit%)
 *   2. CRIT       (deferred — no draw consumed yet; ~5% random XA-boost, PR3+)
 * On resolve, the advanced RNG cursor is written back to `rngCounter`.
 *
 * Magnitude floor order (docs/05 §2): base weapon damage → element → Zodiac →
 * Protect → clamp ≥ 0.
 */

import { relativeFacing } from "./grid.js";
import {
  applyProtect,
  applyZodiac,
  hitChance,
  weaponBaseDamage,
  zodiacCompatibility,
  type Facing,
} from "./formulas.js";
import { CT_COST_WAIT } from "./scheduler.js";
import { rngFor, type BattleState } from "./state.js";

export interface AttackOptions {
  /** Concentrate: physical attack ignores evasion (docs/01 §5c). */
  concentrate?: boolean;
  /** Martial Arts ×1.5 on bare hands (docs/01 §5a). */
  martialArts?: boolean;
}

export interface AttackOutcome {
  attackerId: string;
  targetId: string;
  facing: Facing;
  /** Post-evasion hit chance actually used (0–100). */
  hitChance: number;
  hit: boolean;
  /** Damage dealt (0 on a miss). */
  damage: number;
  /** True only on the attack that drops the target to 0 HP. */
  ko: boolean;
}

export interface ResolveResult {
  state: BattleState;
  outcome: AttackOutcome;
}

/** The crystal counter a unit gets on KO (docs/01 §11). */
export const CRYSTAL_TIMER_START = 3;

/**
 * Resolve a basic physical attack from `attackerId` against `targetId`. Pure:
 * clones the input and returns a new state; consumes the seeded RNG in the
 * declared order above.
 */
export function resolveAttack(
  input: BattleState,
  attackerId: string,
  targetId: string,
  opts: AttackOptions = {},
): ResolveResult {
  if (attackerId === targetId) {
    throw new Error("resolveAttack: a unit cannot attack itself");
  }
  const state = structuredClone(input);
  const attacker = state.units.find((u) => u.id === attackerId);
  const target = state.units.find((u) => u.id === targetId);
  if (!attacker) throw new Error(`resolveAttack: unknown attacker ${attackerId}`);
  if (!target) throw new Error(`resolveAttack: unknown target ${targetId}`);
  // Guard against attacking a downed unit — the caller must pre-validate legal
  // targets. Consuming an RNG draw for an illegal action would desync replay.
  if (target.hp <= 0) throw new Error(`resolveAttack: target ${targetId} is already down`);

  const rng = rngFor(state);

  // Facing is taken from where the attacker stands relative to the target.
  const facing = relativeFacing(target, attacker.pos);
  const chance = hitChance(attacker.weapon.accuracy, target.evasion, facing, {
    ignoreEvasion: opts.concentrate ?? false,
  });

  // ROLL 1 — hit. Always consumed so the roll cursor is deterministic.
  const hit = rng.chance(chance);

  let damage = 0;
  let ko = false;
  if (hit) {
    // MAGNITUDE — floor order per docs/05 §2.
    let dmg = weaponBaseDamage(attacker, { martialArts: opts.martialArts ?? false });
    // Element: "none" is a pass-through; weak/half/absorb/null land in a later slice.
    const tier = zodiacCompatibility(attacker.zodiac, target.zodiac);
    dmg = applyZodiac(dmg, tier);
    if (target.statuses.includes("protect")) dmg = applyProtect(dmg);
    if (dmg < 0) dmg = 0;
    damage = dmg;

    // APPLY — clamp HP ≥ 0; on lethal, start the crystal counter (docs/01 §11).
    const newHp = Math.max(0, target.hp - damage);
    const wasAlive = target.hp > 0;
    target.hp = newHp;
    if (newHp === 0 && wasAlive) {
      target.crystalTimer = CRYSTAL_TIMER_START;
      ko = true;
    }
  }

  state.rngCounter = rng.count;
  state.turnLog.push({
    tick: state.tick,
    unitId: attackerId,
    action: !hit ? `miss ${targetId}` : ko ? `KO ${targetId}` : `hit ${targetId} −${damage}`,
  });

  return { state, outcome: { attackerId, targetId, facing, hitChance: chance, hit, damage, ko } };
}

export interface CrystalResult {
  state: BattleState;
  /** True on the tick the counter reaches 0 — the unit is now permanently dead. */
  crystallized: boolean;
}

/**
 * Handle a KO'd unit's turn (docs/01 §11): instead of acting, decrement its
 * crystal counter and spend the turn. At 0 the unit crystallizes (permadeath;
 * from then on it no longer accrues CT — see {@link ctRateOfUnit}). Consumes no
 * RNG. The caller invokes this when the scheduler surfaces a unit with hp ≤ 0.
 */
export function tickCrystal(input: BattleState, unitId: string): CrystalResult {
  const state = structuredClone(input);
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`tickCrystal: unknown unit ${unitId}`);
  if (unit.hp > 0) throw new Error(`tickCrystal: ${unitId} is not KO'd`);

  let crystallized = false;
  if (unit.crystalTimer > 0) {
    unit.crystalTimer -= 1;
    crystallized = unit.crystalTimer === 0;
  }
  // The turn is spent ticking the counter. A KO'd unit only reaches here at
  // ct ≥ 100 (its turn came up); clamp defends the schema's ct ≥ 0 regardless.
  unit.ct = Math.max(0, unit.ct - CT_COST_WAIT);

  state.turnLog.push({
    tick: state.tick,
    unitId,
    action: crystallized ? "crystallizes" : `crystal ${unit.crystalTimer}`,
  });
  return { state, crystallized };
}
