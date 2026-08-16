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

import { relativeFacing, unitsInAoeBox } from "./grid.js";
import {
  applyProtect,
  applyShell,
  applyZodiac,
  hitChance,
  magicDamage,
  weaponBaseDamage,
  zodiacCompatibility,
  type Facing,
} from "./formulas.js";
import { CT_COST_WAIT } from "./scheduler.js";
import { isBasicAttack, rngFor, type BattleState, type Position, type UnitState } from "./state.js";
import { statusInterruptsCharge, type ActiveStatus } from "./active-status.js";
import type { BattleAbility } from "./ability.js";

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
 * Apply an ability's on-hit statuses to a target that the blow LANDED on
 * (docs/05 §2 step d). The templates are already resolved and self-contained
 * ({@link BattleAbility.inflicts}, projected at build time), so this reads no
 * registry and stays replay-safe.
 *
 * THREE DELIBERATE RULES, each with a reason:
 *   1. NO RNG DRAW. Infliction is unconditional on a hit — there is no separate
 *      status roll. That keeps the declared roll order (docs/05 §3) exactly as it
 *      was, so wiring this path shifts no cursor and no existing golden. A real
 *      per-status chance is a fidelity change with its own roll slot; when it
 *      lands it must be declared there, not smuggled in here.
 *   2. NOT ON A CORPSE. Called after the HP write, and skipped for a target at 0
 *      HP — a KO'd unit is counting down to crystallization (docs/01 §11) and
 *      stacking Slow on it would be state the UI cannot honestly show.
 *   3. NO STACKING of the same id. Re-applying REFRESHES the existing record
 *      rather than pushing a duplicate, so two Slows cannot halve CT twice or
 *      leave a second copy behind when the first expires.
 *
 * Mutates `state` in place — callers already hold a clone.
 */
export function applyInflicts(
  state: BattleState,
  target: UnitState,
  inflicts: readonly ActiveStatus[],
): void {
  if (inflicts.length === 0 || target.hp <= 0) return;
  for (const template of inflicts) {
    const existing = target.statuses.find((st) => st.id === template.id);
    if (existing) {
      // Refresh in place: keep the array position (deterministic iteration order)
      // and take the longer remaining lifetime, so a re-hit never shortens a status.
      existing.remainingCT = Math.max(existing.remainingCT, template.remainingCT);
      continue;
    }
    target.statuses.push({ ...template });
    // LATCH THE INTERRUPT (ADR-0010 item 2), mirroring `charge.ts`'s
    // `applyStatusToUnit`: a caster disabled mid-charge stays cancelled at maturity
    // even if the status decays first. Duplicated deliberately rather than calling
    // that helper — it clones the whole state per status, which inside an AoE loop
    // would be quadratic and would also discard the HP writes made above.
    for (const c of state.chargeQueue) {
      if (c.sourceUnitId === target.id && statusInterruptsCharge(template, c.effect.kind)) {
        c.interrupted = true;
      }
    }
  }
}

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
    // MAGNITUDE — floor order per docs/05 §2 (extracted, RNG-free: {@link attackDamage}).
    damage = attackDamage(attacker, target, opts);

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

/**
 * Resolve an INSTANT (non-charged) ability that is NOT the plain weapon swing —
 * a power-based action read from the attacker's own `abilities` projection. Per
 * ADR-0011 this takes {@link BattleState} + ids only and looks the ability up on
 * the unit; it never reads the content registry, so `replay` stays registry-free
 * and deterministic.
 *
 * Same declared roll order and cursor position as {@link resolveAttack}: exactly
 * ONE hit draw, then a floored magnitude. The basic weapon attack does NOT come
 * here — the driver routes `formula:"physical"` instants to {@link resolveAttack}
 * so their rolls stay byte-identical with the pre-Slice-5 engine. This path
 * covers magic / heal / none (and a power-based physical fallback) instants.
 *
 * P1: the magnitude formulas here are [UNVERIFIED] illustrative (docs/01 §12) —
 * behavior (one draw, floored per step, deterministic), not the constant, is what
 * the tests pin. Element weak/half/absorb/null land in a later fidelity slice.
 */
export function resolveAbility(
  input: BattleState,
  attackerId: string,
  targetId: string,
  abilityId: string,
): ResolveResult {
  const state = structuredClone(input);
  const attacker = state.units.find((u) => u.id === attackerId);
  const target = state.units.find((u) => u.id === targetId);
  if (!attacker) throw new Error(`resolveAbility: unknown attacker ${attackerId}`);
  if (!target) throw new Error(`resolveAbility: unknown target ${targetId}`);
  const ability = attacker.abilities.find((a) => a.id === abilityId);
  if (!ability) throw new Error(`resolveAbility: ${attackerId} has no ability ${abilityId}`);
  // Guard against acting on a downed unit — the caller pre-validates legal
  // targets. Consuming an RNG draw for an illegal action would desync replay.
  if (target.hp <= 0) throw new Error(`resolveAbility: target ${targetId} is already down`);

  const rng = rngFor(state);
  const facing = relativeFacing(target, attacker.pos);
  const chance = hitChance(ability.accuracy, target.evasion, facing);

  // ROLL 1 — hit (same cursor position as resolveAttack). Always consumed.
  const hit = rng.chance(chance);

  const heal = ability.formula === "heal";
  let damage = 0;
  let ko = false;
  if (hit) {
    // MAGNITUDE — floor order mirrors resolve.ts / charge.ts: formula → Zodiac →
    // Protect/Shell → clamp ≥ 0 (extracted, RNG-free: {@link abilityDamage}).
    damage = abilityDamage(attacker, target, ability);

    if (heal) {
      target.hp = Math.min(target.maxHp, target.hp + damage);
    } else {
      const newHp = Math.max(0, target.hp - damage);
      const wasAlive = target.hp > 0;
      target.hp = newHp;
      if (newHp === 0 && wasAlive) {
        target.crystalTimer = CRYSTAL_TIMER_START;
        ko = true;
      }
    }
    // ON-HIT STATUS (docs/05 §2 step d). Applied AFTER the HP write, so a lethal
    // blow does not also stack a status on a corpse (see {@link applyInflicts}).
    applyInflicts(state, target, ability.inflicts);
  }

  state.rngCounter = rng.count;
  state.turnLog.push({
    tick: state.tick,
    unitId: attackerId,
    action: !hit
      ? `miss ${targetId}`
      : heal
        ? `heal ${targetId} +${damage}`
        : ko
          ? `KO ${targetId}`
          : `hit ${targetId} −${damage}`,
  });

  return { state, outcome: { attackerId, targetId, facing, hitChance: chance, hit, damage, ko } };
}

/** One affected unit's result inside an area act (id-sorted in {@link AoeOutcome.perTarget}). */
export interface AoeTargetOutcome {
  targetId: string;
  facing: Facing;
  hitChance: number;
  hit: boolean;
  /** Damage dealt (or HP restored, for a heal); 0 on a miss. */
  amount: number;
  ko: boolean;
}

export interface AoeOutcome {
  attackerId: string;
  abilityId: string;
  targetTile: Position;
  /** True for a restorative (heal) ability — `amount` is HP restored, not damage. */
  heal: boolean;
  /** Per-target results in the DECLARED id-ascending order the rolls were drawn. */
  perTarget: AoeTargetOutcome[];
  /** Units the roll landed on. */
  hits: number;
  /** Units dropped to 0 HP (0 for a heal). */
  kos: number;
  /** Σ damage dealt / HP restored over all targets. */
  total: number;
}

export interface AoeResolveResult {
  state: BattleState;
  outcome: AoeOutcome;
}

/**
 * Resolve an INSTANT AREA ability against every appropriate unit in its `aoe` box
 * around `targetTile` — the multi-target generalization of {@link resolveAbility}
 * (docs/05 §2, §6). TARGETED policy (no friendly fire this slice): a DAMAGE
 * ability hits the caster's FOES; a HEAL hits the caster's ALLIES incl. self.
 *
 * DETERMINISM (sim-determinism-guard): the affected units are enumerated in the
 * box's DECLARED TOTAL ORDER — sorted by `id` ASCENDING ({@link unitsInAoeBox}),
 * never `units` array / Map / Set order — and each consumes exactly ONE hit roll,
 * in that order, followed by its own magnitude (recomputed per target, since
 * facing/Faith/Zodiac/Protect/Shell differ per unit). So the Nth draw is a pure
 * function of state. An EMPTY box consumes NO draw. Pure: clones + returns state.
 *
 * Per-target resolution MIRRORS the single-target dispatch exactly so the AI's
 * estimate ({@link estMagnitude}) never drifts from the pipeline: every target
 * takes the ability-accuracy hit + {@link abilityDamage}, as {@link resolveAbility}
 * does. There is no weapon-based branch here because the ONE weapon-derived
 * ability — the basic swing — is single-target by construction (`basicAttackFrom`
 * hard-codes `aoe: null`), so it can never reach this function. An `aoe`-carrying
 * ability is authored content and always reads its own `power`.
 */
export function resolveAbilityAoe(
  input: BattleState,
  attackerId: string,
  targetTile: Position,
  abilityId: string,
): AoeResolveResult {
  const state = structuredClone(input);
  const attacker = state.units.find((u) => u.id === attackerId);
  if (!attacker) throw new Error(`resolveAbilityAoe: unknown attacker ${attackerId}`);
  const ability = attacker.abilities.find((a) => a.id === abilityId);
  if (!ability) throw new Error(`resolveAbilityAoe: ${attackerId} has no ability ${abilityId}`);
  if (ability.aoe === null) throw new Error(`resolveAbilityAoe: ${abilityId} is not an area ability`);

  const heal = ability.formula === "heal";
  // Defensive: the basic swing is single-target by construction, so it must never
  // arrive here. Loud-fail rather than silently resolving a weapon-derived ability
  // off a `power` it does not own.
  if (isBasicAttack(ability)) {
    throw new Error(`resolveAbilityAoe: ${abilityId} is the weapon-derived basic swing, never an area ability`);
  }
  const base = { attackerId, abilityId, targetTile: { x: targetTile.x, y: targetTile.y }, heal };

  // TARGETED enumeration (id-ascending). Damage → foes; heal → allies incl. self.
  const affected = unitsInAoeBox(state.grid, state.units, targetTile, ability.aoe).filter((u) =>
    heal ? u.teamId === attacker.teamId : u.teamId !== attacker.teamId,
  );
  if (affected.length === 0) {
    state.turnLog.push({
      tick: state.tick,
      unitId: attackerId,
      action: `aoe ${abilityId} 0 hit / 0 ${heal ? "healed" : "ko"}`,
    });
    return { state, outcome: { ...base, perTarget: [], hits: 0, kos: 0, total: 0 } };
  }

  const rng = rngFor(state);
  const perTarget: AoeTargetOutcome[] = [];
  let total = 0;
  for (const ref of affected) {
    // Re-find on the live (mutating) clone so an earlier KO in the box is seen.
    const target = state.units.find((u) => u.id === ref.id)!;
    const facing = relativeFacing(target, attacker.pos);
    const chance = hitChance(ability.accuracy, target.evasion, facing);
    const hit = rng.chance(chance); // ONE draw per target, id order.
    let amount = 0;
    let ko = false;
    if (hit) {
      amount = abilityDamage(attacker, target, ability);
      if (heal) {
        target.hp = Math.min(target.maxHp, target.hp + amount);
      } else {
        const newHp = Math.max(0, target.hp - amount);
        const wasAlive = target.hp > 0;
        target.hp = newHp;
        if (newHp === 0 && wasAlive) {
          target.crystalTimer = CRYSTAL_TIMER_START;
          ko = true;
        }
      }
      // ON-HIT STATUS, per target that the box LANDED on — id-ascending, same order
      // as the hit rolls, and consuming no draw of its own (docs/05 §2 step d).
      applyInflicts(state, target, ability.inflicts);
      total += amount;
    }
    perTarget.push({ targetId: target.id, facing, hitChance: chance, hit, amount, ko });
  }

  state.rngCounter = rng.count;
  const hits = perTarget.filter((p) => p.hit).length;
  const kos = perTarget.filter((p) => p.ko).length;
  state.turnLog.push({
    tick: state.tick,
    unitId: attackerId,
    action: `aoe ${abilityId} ${hits} hit / ${kos} ${heal ? "healed" : "ko"}`,
  });
  return { state, outcome: { ...base, perTarget, hits, kos, total } };
}

/**
 * Deterministic ON-HIT damage of a BASIC weapon swing — {@link resolveAttack}'s
 * exact magnitude block, extracted RNG-free (floor order: weapon base → Zodiac →
 * Protect → clamp ≥ 0, docs/05 §2). Shared so the balance-probe AI can rank a
 * candidate WITHOUT re-deriving the combat constants (they live in formulas.ts)
 * and can never drift from what the resolver actually deals.
 */
export function attackDamage(attacker: UnitState, target: UnitState, opts: AttackOptions = {}): number {
  let dmg = weaponBaseDamage(attacker, { martialArts: opts.martialArts ?? false });
  // Element: "none" is a pass-through; weak/half/absorb/null land in a later slice.
  const tier = zodiacCompatibility(attacker.zodiac, target.zodiac);
  dmg = applyZodiac(dmg, tier);
  if (target.statuses.some((st) => st.id === "protect")) dmg = applyProtect(dmg);
  return dmg < 0 ? 0 : dmg;
}

/**
 * Deterministic ON-HIT magnitude of an INSTANT ability — {@link resolveAbility}'s
 * exact magnitude block, extracted RNG-free. Damage formulas (physical/magic) run
 * formula → Zodiac → Protect/Shell → clamp ≥ 0; a `heal` returns its raw restorative
 * magnitude (no reducers), a `none` returns 0. Shared with the AI for the same
 * no-drift reason as {@link attackDamage}. NOTE: a positive number is returned for a
 * heal too — the caller keys on `ability.formula` to know whether it is damage or
 * healing.
 */
export function abilityDamage(attacker: UnitState, target: UnitState, ability: BattleAbility): number {
  const heal = ability.formula === "heal";
  let mag = abilityMagnitude(attacker, target, ability);
  if (!heal) {
    const tier = zodiacCompatibility(attacker.zodiac, target.zodiac);
    mag = applyZodiac(mag, tier);
    if (ability.formula === "physical" && target.statuses.some((st) => st.id === "protect")) mag = applyProtect(mag);
    if (ability.formula === "magic" && target.statuses.some((st) => st.id === "shell")) mag = applyShell(mag);
  }
  return mag < 0 ? 0 : mag;
}

/** Instant-ability magnitude by formula (P1, [UNVERIFIED] — see {@link resolveAbility}). */
function abilityMagnitude(attacker: UnitState, target: UnitState, ability: BattleAbility): number {
  switch (ability.formula) {
    case "physical":
      return attacker.pa * ability.power;
    case "magic":
    case "heal":
      return magicDamage(attacker.ma, ability.power, attacker.faith, target.faith);
    case "none":
      return 0;
  }
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
