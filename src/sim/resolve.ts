/**
 * Action resolution pipeline (docs/05 §2). PR3 implements the immediate
 * physical-attack path; charged actions, reactions, and status infliction land
 * in later slices.
 *
 * Determinism (docs/05 §3a): randomness is drawn from the battle's single
 * seeded stream, reconstructed from the state cursor, in a DECLARED order. Per
 * (attacker, defender) blow that order is:
 *   1. HIT ROLL       (one draw vs the post-evasion hit%) — ALWAYS drawn
 *   2. REACTION ROLL  (one draw vs the DEFENDER's Brave%) — drawn ONLY when the
 *                     defender's equipped reaction can actually trigger on this
 *                     blow ({@link tryReaction}). A unit equips at most one
 *                     reaction, so this is at most one draw.
 *   3. COUNTER SWING  (one hit draw) — only when 2 fired and the reaction strikes
 *                     back.
 *   4. CRIT           (deferred — no draw consumed yet; ~5% random XA-boost)
 * A unit with NO reaction, or one whose trigger condition does not hold, consumes
 * exactly the draws it consumed before ADR-0019 — which is why every frozen golden
 * moves by the new `reaction` field alone.
 * On resolve, the advanced RNG cursor is written back to `rngCounter`.
 *
 * Magnitude floor order (docs/05 §2): base weapon damage → element → Zodiac →
 * Protect → clamp ≥ 0.
 */

import { inAbilityRange, relativeFacing, unitsInAoeBox } from "./grid.js";
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
import {
  BASIC_ATTACK_ID,
  effectiveTeamOf,
  isBasicAttack,
  rngFor,
  type BattleState,
  type Position,
  type UnitState,
} from "./state.js";
import { statusInterruptsCharge, type ActiveStatus } from "./active-status.js";
import type { ReactionKind } from "./reaction.js";
import type { BattleAbility } from "./ability.js";
import type { SeededRng } from "./rng.js";

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
  /** Damage dealt (0 on a miss, and 0 when a `preemptive` reaction cancelled it). */
  damage: number;
  /** True only on the attack that drops the target to 0 HP. */
  ko: boolean;
  /**
   * Reactions the DEFENDER's equipped reaction slot fired against this blow
   * (ADR-0019) — empty for the overwhelmingly common no-reaction case. The driver
   * turns each into its own accounting event; see {@link ReactionOutcome}.
   */
  reactions: ReactionOutcome[];
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
 * `sourceTeamId` is the INFLICTER's EFFECTIVE team (a charmed inflicter charms for its
 * captor), stamped onto a `controlsTarget` status so {@link effectiveTeamOf} knows who
 * the victim now fights for. Every shipped caller has a live inflicter — a charge whose
 * caster is gone is CANCELLED before it can inflict — so `null` is reserved for a future
 * source-less effect (a trap, a terrain hazard): the status lands but controls nobody,
 * because a charm with no owner is an allegiance the state cannot name.
 *
 * Mutates `state` in place — callers already hold a clone.
 */
export function applyInflicts(
  state: BattleState,
  target: UnitState,
  inflicts: readonly ActiveStatus[],
  sourceTeamId: number | null,
): void {
  if (inflicts.length === 0 || target.hp <= 0) return;
  for (const template of inflicts) {
    const existing = target.statuses.find((st) => st.id === template.id);
    if (existing) {
      // Refresh in place: keep the array position (deterministic iteration order)
      // and take the longer remaining lifetime, so a re-hit never shortens a status.
      existing.remainingCT = Math.max(existing.remainingCT, template.remainingCT);
      // A refresh keeps the ORIGINAL controller: re-charming an already-charmed unit
      // extends the leash, it does not hand it to a second inflicter mid-status.
      continue;
    }
    target.statuses.push({
      ...template,
      controlledByTeamId: template.controlsTarget ? sourceTeamId : null,
    });
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
 * One reaction that actually FIRED, as the resolvers report it (ADR-0019). Only
 * fired reactions appear — a reaction whose trigger condition did not hold consumes
 * no draw and produces nothing, and one whose Brave roll failed consumes its draw and
 * produces nothing.
 *
 * THE DRIVER TURNS EACH OF THESE INTO ITS OWN `ResolutionEvent`, credited to
 * `reactorId`. That is not bookkeeping polish: counter damage lands on the ATTACKER,
 * which is the acting unit's own id, and `hpDiffEvent` deliberately never credits a
 * unit for its own HP loss — so without this the counter would fire correctly, change
 * the fight, and still score ZERO on every measurement the project has (the
 * "contribution proxy encodes which identities can exist" rule in `src/sim/CLAUDE.md`).
 */
export interface ReactionOutcome {
  /** The DEFENDER whose equipped reaction fired. */
  reactorId: string;
  /** The equipped reaction ability's id — the label the reactor is credited under. */
  abilityId: string;
  kind: ReactionKind;
  /** The attacker whose blow woke it, and the target of the counter-swing. */
  againstId: string;
  /** Did the counter-swing connect? */
  hit: boolean;
  /** HP actually removed from `againstId` (0 on a miss; never counts overkill). */
  damage: number;
  /** Did the counter-swing drop `againstId` to 0 HP? */
  ko: boolean;
  /** `preemptive` only: the incoming blow was cancelled outright. */
  nullified: boolean;
}

/**
 * The REACTION STAGE (docs/05 §2 steps b and e, ADR-0019). Called once per
 * (attacker, defender) blow at each of the two stages; the defender's equipped
 * reaction kind decides which stage it answers on, so at most one call can fire.
 *
 *   - `stage: "pre"`  — the {@link ReactionKind} `preemptive` (Hamedo) stage, run
 *                       BEFORE the incoming blow is applied. When it fires, the
 *                       caller must discard the blow entirely: no damage, no KO, no
 *                       status.
 *   - `stage: "post"` — the `counter` stage, run AFTER the blow has been applied.
 *
 * TRIGGER CONDITIONS, all required (each is a discriminating negative with its own
 * test):
 *   - the blow is PHYSICAL — a magic/heal/utility blow wakes nothing, which is why
 *     charged actions (magic-only by `ChargeEffectSchema`) are not a reaction site;
 *   - `post` only: the blow actually REMOVED HP, and the defender is still standing
 *     (a corpse does not counter — it is counting down to crystallization);
 *   - the attacker is alive and stands inside the DEFENDER's own basic-attack range,
 *     asked of `inAbilityRange` rather than re-derived here;
 *   - the defender is not the attacker.
 *
 * NO REACTION CHAIN, STRUCTURALLY. The counter-swing is resolved INLINE here and
 * never routed back through {@link resolveAttack}, so there is no path on which a
 * counter can wake another counter — the invariant is a property of the call graph,
 * not a flag someone must remember to pass.
 *
 * RNG: exactly ONE draw (the Brave% trigger) when the conditions hold, plus ONE more
 * (the swing's hit roll) when it fires. Zero draws otherwise. Mutates `state` in place
 * — every caller already holds a clone — and advances the SHARED `rng` cursor the
 * caller writes back.
 */
export function tryReaction(
  state: BattleState,
  rng: SeededRng,
  attackerId: string,
  defenderId: string,
  stage: "pre" | "post",
  blow: { physical: boolean; removedHp: number },
): ReactionOutcome | null {
  if (attackerId === defenderId) return null;
  if (!blow.physical) return null;
  const defender = state.units.find((u) => u.id === defenderId);
  const attacker = state.units.find((u) => u.id === attackerId);
  if (!defender || !attacker) return null;
  const reaction = defender.reaction;
  if (reaction === null) return null;
  const wants: ReactionKind = stage === "pre" ? "preemptive" : "counter";
  if (reaction.kind !== wants) return null;
  if (defender.hp <= 0 || attacker.hp <= 0) return null;
  if (stage === "post" && blow.removedHp <= 0) return null;
  // Reach = the reactor's OWN basic attack (docs/01 §9). A unit always carries one
  // (`basicAttackFrom`), but a hand-built fixture might not — no basic swing means
  // nothing to answer with, so nothing fires and no draw is taken.
  const swing = defender.abilities.find((a) => a.id === BASIC_ATTACK_ID);
  if (!swing) return null;
  if (!inAbilityRange(state.grid, defender.pos, attacker.pos, swing.range)) return null;

  // ROLL — the Brave% trigger (docs/01 §4). Drawn only now, once every condition
  // above holds, so a reaction that could never have fired shifts no cursor.
  if (!rng.chance(defender.brave)) return null;

  // THE COUNTER-SWING: the reactor's basic weapon attack, back at the attacker.
  // Resolved inline (see "no reaction chain" above) but with the SAME facing /
  // hit-chance / magnitude pipeline `resolveAttack` uses, so a counter can never
  // deal a number a normal swing from that unit would not.
  const facing = relativeFacing(attacker, defender.pos);
  const chance = hitChance(defender.weapon.accuracy, attacker.evasion, facing);
  const hit = rng.chance(chance);
  let damage = 0;
  let ko = false;
  if (hit) {
    const before = attacker.hp;
    const newHp = Math.max(0, before - attackDamage(defender, attacker));
    attacker.hp = newHp;
    // EXACT HP removed, not the raw magnitude: overkill is not a contribution, the
    // same rule `hpDiffEvent` holds itself to.
    damage = before - newHp;
    if (newHp === 0 && before > 0) {
      attacker.crystalTimer = CRYSTAL_TIMER_START;
      ko = true;
    }
  }

  state.turnLog.push({
    tick: state.tick,
    unitId: defenderId,
    action: `${reaction.kind} ${reaction.abilityId} → ${attackerId}${
      !hit ? " miss" : ko ? " KO" : ` −${damage}`
    }`,
  });

  return {
    reactorId: defenderId,
    abilityId: reaction.abilityId,
    kind: reaction.kind,
    againstId: attackerId,
    hit,
    damage,
    ko,
    nullified: stage === "pre",
  };
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

  // REACTION PRE-CHECK (docs/05 §2 step b): a `preemptive` reaction strikes first and
  // CANCELS this blow. Run before the magnitude/apply block so the cancellation is
  // structural — there is no damage to un-apply. The hit roll above is still drawn:
  // "the hit roll is unconditional" stays an invariant rather than a special case,
  // and the discarded result is unobservable in the outcome.
  const reactions: ReactionOutcome[] = [];
  const pre = tryReaction(state, rng, attackerId, targetId, "pre", { physical: true, removedHp: 0 });
  if (pre) reactions.push(pre);

  let damage = 0;
  let ko = false;
  let removedHp = 0;
  if (hit && !pre) {
    // MAGNITUDE — floor order per docs/05 §2 (extracted, RNG-free: {@link attackDamage}).
    damage = attackDamage(attacker, target, opts);

    // APPLY — clamp HP ≥ 0; on lethal, start the crystal counter (docs/01 §11).
    const newHp = Math.max(0, target.hp - damage);
    const wasAlive = target.hp > 0;
    removedHp = target.hp - newHp;
    target.hp = newHp;
    if (newHp === 0 && wasAlive) {
      target.crystalTimer = CRYSTAL_TIMER_START;
      ko = true;
    }
  }

  // The attacker's own log line goes in BEFORE the post-reaction's, so the turn log
  // reads in the order the blows actually landed (a `pre` reaction's line is already
  // above this one — Hamedo does strike first).
  state.turnLog.push({
    tick: state.tick,
    unitId: attackerId,
    action: pre
      ? `blocked by ${targetId}`
      : !hit
        ? `miss ${targetId}`
        : ko
          ? `KO ${targetId}`
          : `hit ${targetId} −${damage}`,
  });

  // REACTION POST (docs/05 §2 step e): a `counter` answers a blow that removed HP
  // from a defender still standing — `removedHp` is HP actually taken, not the raw
  // magnitude, so overkill is not what wakes it.
  const post = tryReaction(state, rng, attackerId, targetId, "post", { physical: true, removedHp });
  if (post) reactions.push(post);

  state.rngCounter = rng.count;

  return {
    state,
    outcome: { attackerId, targetId, facing, hitChance: chance, hit, damage, ko, reactions },
  };
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
  // Only a PHYSICAL-formula ability wakes a reaction (docs/01 §9): magic, heals and
  // pure-utility acts (`formula: "none"`, e.g. `steal.heart`) wake nothing.
  const physical = ability.formula === "physical";
  const reactions: ReactionOutcome[] = [];
  const pre = tryReaction(state, rng, attackerId, targetId, "pre", { physical, removedHp: 0 });
  if (pre) reactions.push(pre);

  let damage = 0;
  let ko = false;
  let removedHp = 0;
  if (hit && !pre) {
    // MAGNITUDE — floor order mirrors resolve.ts / charge.ts: formula → Zodiac →
    // Protect/Shell → clamp ≥ 0 (extracted, RNG-free: {@link abilityDamage}).
    damage = abilityDamage(attacker, target, ability);

    if (heal) {
      target.hp = Math.min(target.maxHp, target.hp + damage);
    } else {
      const newHp = Math.max(0, target.hp - damage);
      const wasAlive = target.hp > 0;
      removedHp = target.hp - newHp;
      target.hp = newHp;
      if (newHp === 0 && wasAlive) {
        target.crystalTimer = CRYSTAL_TIMER_START;
        ko = true;
      }
    }
    // ON-HIT STATUS (docs/05 §2 step d). Applied AFTER the HP write, so a lethal
    // blow does not also stack a status on a corpse (see {@link applyInflicts}).
    applyInflicts(state, target, ability.inflicts, effectiveTeamOf(attacker));
  }

  state.turnLog.push({
    tick: state.tick,
    unitId: attackerId,
    action: pre
      ? `blocked by ${targetId}`
      : !hit
        ? `miss ${targetId}`
        : heal
          ? `heal ${targetId} +${damage}`
          : ko
            ? `KO ${targetId}`
            : `hit ${targetId} −${damage}`,
  });

  const post = tryReaction(state, rng, attackerId, targetId, "post", { physical, removedHp });
  if (post) reactions.push(post);

  state.rngCounter = rng.count;

  return {
    state,
    outcome: { attackerId, targetId, facing, hitChance: chance, hit, damage, ko, reactions },
  };
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
  /** Reactions fired by the units this area blow struck (id-ascending, ADR-0019). */
  reactions: ReactionOutcome[];
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
  const attackerTeam = effectiveTeamOf(attacker);
  const affected = unitsInAoeBox(state.grid, state.units, targetTile, ability.aoe).filter((u) =>
    heal ? effectiveTeamOf(u) === attackerTeam : effectiveTeamOf(u) !== attackerTeam,
  );
  if (affected.length === 0) {
    state.turnLog.push({
      tick: state.tick,
      unitId: attackerId,
      action: `aoe ${abilityId} 0 hit / 0 ${heal ? "healed" : "ko"}`,
    });
    return { state, outcome: { ...base, perTarget: [], reactions: [], hits: 0, kos: 0, total: 0 } };
  }

  const rng = rngFor(state);
  const perTarget: AoeTargetOutcome[] = [];
  // Only a PHYSICAL area ability wakes reactions (`aim.volley` is the one shipped
  // case); magic and heal areas wake nothing.
  const physical = ability.formula === "physical";
  const reactions: ReactionOutcome[] = [];
  let total = 0;
  for (const ref of affected) {
    // Re-find on the live (mutating) clone so an earlier KO in the box is seen.
    const target = state.units.find((u) => u.id === ref.id)!;
    const facing = relativeFacing(target, attacker.pos);
    const chance = hitChance(ability.accuracy, target.evasion, facing);
    const hit = rng.chance(chance); // ONE draw per target, id order.
    // REACTION PRE-CHECK for THIS target. Per-target and in the same id-ascending
    // order as the hit rolls, so the draw sequence stays a pure function of state.
    // A `preemptive` defender cancels the box's blow ON ITSELF only — the rest of the
    // area still resolves, which is what "the reactor struck first" means locally.
    const pre = tryReaction(state, rng, attackerId, target.id, "pre", { physical, removedHp: 0 });
    if (pre) reactions.push(pre);
    let amount = 0;
    let ko = false;
    let removedHp = 0;
    if (hit && !pre) {
      amount = abilityDamage(attacker, target, ability);
      if (heal) {
        target.hp = Math.min(target.maxHp, target.hp + amount);
      } else {
        const newHp = Math.max(0, target.hp - amount);
        const wasAlive = target.hp > 0;
        removedHp = target.hp - newHp;
        target.hp = newHp;
        if (newHp === 0 && wasAlive) {
          target.crystalTimer = CRYSTAL_TIMER_START;
          ko = true;
        }
      }
      // ON-HIT STATUS, per target that the box LANDED on — id-ascending, same order
      // as the hit rolls, and consuming no draw of its own (docs/05 §2 step d).
      applyInflicts(state, target, ability.inflicts, effectiveTeamOf(attacker));
      total += amount;
    }
    const post = tryReaction(state, rng, attackerId, target.id, "post", { physical, removedHp });
    if (post) reactions.push(post);
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
  return { state, outcome: { ...base, perTarget, reactions, hits, kos, total } };
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
