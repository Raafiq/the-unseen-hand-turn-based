/**
 * Balance-probe AI (docs/06 §AI-as-test-harness, P2 Slice 2). A PURE, greedy,
 * 1-ply policy that turns a decision point into one {@link Command} — the driver
 * behind the headless benchmark. It is NOT meant to be a clever opponent; it is a
 * deterministic, legible baseline that stresses builds so encounters can be
 * measured (docs/06 AC-E1/E3).
 *
 * DETERMINISM (P0, sim-determinism-guard):
 *   - ZERO RNG draws. `decideBalanceProbe` never touches the seed, so the per-turn
 *     roll-consumption order is EXACTLY the resolver's draws — the AI adds nothing
 *     to `rngCounter` (AC-S1/S2 fall out for free; the harness test proves it by
 *     replaying the issued command log and getting a byte-identical state).
 *   - Reads ONLY {@link BattleState} — no wall-clock, no globals, no ambient input.
 *   - Every candidate list is sorted by a DECLARED TOTAL ORDER; no Map/Set
 *     iteration ever decides a choice.
 *
 * REUSE (no drift, OQ5): magnitude ranking calls the resolver's own extracted
 * magnitude functions ({@link attackDamage}/{@link abilityDamage}), so the AI's
 * estimate can never disagree with the damage the pipeline actually deals, and no
 * combat constant is duplicated here.
 *
 * SCOPE (D2): `effHp = hp` — no mitigation-aware (Protect/evasion/element) target
 * selection this slice, so AC-E3(c) ("counter the target's defenses") is only
 * partially met; (a) flank and (b) focus-lowest-HP are met fully. `none`-formula
 * and passive (reaction/support/movement) abilities are never picked — they do
 * nothing in the current resolver, so a DISABLE/BUFF class has no live candidate
 * yet (the class scaffold is kept for when status infliction lands).
 */

import type { BattleState, UnitState } from "./state.js";
import type { BattleAbility } from "./ability.js";
import type { Command } from "./driver.js";
import { inAbilityRange, moveRange, relativeFacing } from "./grid.js";
import { attackDamage, abilityDamage } from "./resolve.js";

/**
 * Lexicographic PRIMARY key — the action class, best first (docs/06). LETHAL (this
 * blow drops the target) outranks a mere CHIP; a HEAL sits between them. DISABLE
 * (status infliction) and BUFF are reserved for when their effects resolve; no
 * candidate is generated for them yet.
 */
const ACTION_CLASS = { LETHAL: 0, DISABLE: 1, HEAL: 2, CHIP: 3, BUFF: 4 } as const;

/** Facing preference (better hit-through): rear > side > front. Lower rank = better. */
const FACING_RANK: Record<"front" | "side" | "rear", number> = { rear: 0, side: 1, front: 2 };

interface Candidate {
  cls: number;
  /** Target effective HP (= `hp`, D2). Sorted ASC — the FOCUS key (AC-E3(b)). */
  targetEffHp: number;
  /** Effective magnitude (damage dealt, or HP actually restored). Sorted DESC. */
  magnitude: number;
  /** Facing rank from the actor's current tile. Sorted ASC (rear best). */
  facingRank: number;
  targetId: string;
  abilityIndex: number;
  ability: BattleAbility;
  target: UnitState;
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * RNG-free estimate of the on-hit magnitude of `ability` from `attacker` to
 * `target`, routed exactly as the driver routes resolution so the ranking equals
 * the real damage:
 *   - instant physical → {@link attackDamage} (resolveAttack: weapon-based),
 *   - everything else (instant magic/heal, or any charged action, which the driver
 *     resolves as magic via resolveCharge) → {@link abilityDamage}.
 * A `heal` returns its raw restorative magnitude; the caller caps it by missing HP.
 */
function estMagnitude(attacker: UnitState, target: UnitState, ability: BattleAbility): number {
  if (ability.formula === "physical" && ability.speed === null) {
    return attackDamage(attacker, target);
  }
  return abilityDamage(attacker, target, ability);
}

/**
 * Enumerate every LEGAL, EFFECTIVE action from the actor's current tile: for each
 * ACTION ability (in `abilities` array order) crossed with its valid targets
 * (foes for damage, allies incl. self for heal) that are IN RANGE and would gain
 * something. Passive and `none`-formula abilities are skipped (they do nothing).
 * Deterministic: iterates the stable `abilities`/`units` arrays only.
 */
function candidatesFor(state: BattleState, actor: UnitState): Candidate[] {
  const cands: Candidate[] = [];
  actor.abilities.forEach((ability, abilityIndex) => {
    if (ability.actionKind !== "action") return; // reaction/support/movement are passive
    if (ability.formula === "none") return; // no magnitude/effect in the current resolver
    // LANDMINE: the driver enqueues EVERY charge as a MAGIC ChargeEffect
    // (driver.ts declareCharge dispatch; charge.ts resolves it via magicDamage),
    // so a charged NON-magic ability would misresolve — worst case a charged HEAL
    // damages the ally on its target tile at maturity. Until the driver routes
    // `effect.kind` by `formula`, only magic-formula charges are safe to select.
    if (ability.speed !== null && ability.formula !== "magic") return;
    const heal = ability.formula === "heal";
    for (const target of state.units) {
      if (target.hp <= 0) continue;
      const sameTeam = target.teamId === actor.teamId;
      if (heal ? !sameTeam : sameTeam) continue; // heal allies (incl. self); damage foes
      if (!inAbilityRange(state.grid, actor.pos, target.pos, ability.range)) continue;

      const raw = estMagnitude(actor, target, ability);
      let magnitude: number;
      let cls: number;
      if (heal) {
        magnitude = Math.min(target.maxHp - target.hp, raw);
        if (magnitude <= 0) continue; // no HP to restore → not worth a turn
        cls = ACTION_CLASS.HEAL;
      } else {
        if (raw <= 0) continue; // a 0-damage swing is not worth a turn
        magnitude = raw;
        cls = raw >= target.hp ? ACTION_CLASS.LETHAL : ACTION_CLASS.CHIP;
      }
      const facing = relativeFacing(target, actor.pos);
      cands.push({
        cls,
        magnitude,
        targetEffHp: target.hp,
        facingRank: FACING_RANK[facing],
        targetId: target.id,
        abilityIndex,
        ability,
        target,
      });
    }
  });
  return cands;
}

/**
 * The declared TOTAL ORDER over candidates (returns < 0 when `a` is preferred):
 * class asc → [class-dependent focus keys] → facing asc (rear best) → unitId asc →
 * ability index asc. The last two keys make every (target, ability) pair unique, so
 * there is always a SINGULAR winner (no Map/Set fallback).
 *
 * The focus keys differ by class because AC-E3(b) is a FOCUS rule, not a big-hit
 * rule:
 *   - CHIP (non-lethal damage): effHp ASC first, then magnitude DESC — FOCUS the
 *     lowest-effective-HP foe (docs/06 §4), even when a Zodiac/Protect asymmetry
 *     makes a higher-HP foe the bigger hit. Focusing kills things sooner.
 *   - LETHAL: magnitude DESC first (unchanged) — every lethal already kills, so
 *     rank by overkill margin then effHp; the class itself is the "actual kill" key.
 *   - HEAL: magnitude DESC first (unchanged) — its magnitude IS "HP restored", so
 *     the biggest effective heal wins.
 * Comparisons only reach the focus keys when `a.cls === b.cls`, so branching on the
 * (shared) class is well-defined.
 */
function compareCandidate(a: Candidate, b: Candidate): number {
  if (a.cls !== b.cls) return a.cls - b.cls;
  if (a.cls === ACTION_CLASS.CHIP) {
    // Non-lethal offensive: focus lowest effHp first, then prefer the bigger chip.
    if (a.targetEffHp !== b.targetEffHp) return a.targetEffHp - b.targetEffHp;
    if (a.magnitude !== b.magnitude) return b.magnitude - a.magnitude;
  } else {
    // LETHAL (kills) and HEAL (HP restored): magnitude-first (unchanged).
    if (a.magnitude !== b.magnitude) return b.magnitude - a.magnitude;
    if (a.targetEffHp !== b.targetEffHp) return a.targetEffHp - b.targetEffHp;
  }
  if (a.facingRank !== b.facingRank) return a.facingRank - b.facingRank;
  if (a.targetId !== b.targetId) return a.targetId < b.targetId ? -1 : 1;
  return a.abilityIndex - b.abilityIndex;
}

/** Encode a chosen candidate as a driver {@link Command} (tile vs unit target). */
function toActCommand(c: Candidate): Command {
  // Charged/AoE actions resolve against a TILE (the occupant may vacate before
  // maturity — the counterplay); instant single-target actions lock the UNIT.
  const target =
    c.ability.speed !== null
      ? { x: c.target.pos.x, y: c.target.pos.y }
      : { unitId: c.target.id };
  return { kind: "act", abilityId: c.ability.id, target };
}

/** The prime enemy to chase when no action is in range: lowest HP → nearest → id asc. */
function primeEnemy(state: BattleState, actor: UnitState): UnitState | null {
  let prime: UnitState | null = null;
  for (const e of state.units) {
    if (e.hp <= 0 || e.teamId === actor.teamId) continue;
    if (prime === null) {
      prime = e;
      continue;
    }
    if (e.hp !== prime.hp) {
      if (e.hp < prime.hp) prime = e;
      continue;
    }
    const de = manhattan(actor.pos, e.pos);
    const dp = manhattan(actor.pos, prime.pos);
    if (de !== dp) {
      if (de < dp) prime = e;
      continue;
    }
    if (e.id < prime.id) prime = e;
  }
  return prime;
}

/**
 * When nothing is in range, step toward the prime enemy: the reachable tile that
 * MINIMIZES Manhattan distance to it, tie-broken by `moveRange`'s (y, x) ordering
 * (first minimal wins). Only moves if it strictly closes the gap — otherwise Wait
 * (avoids pointless CT-churning shuffles when boxed in).
 */
function moveTowardPrime(state: BattleState, actor: UnitState): Command {
  const prime = primeEnemy(state, actor);
  if (!prime) return { kind: "wait" };
  const tiles = moveRange(state.grid, state.units, actor.id); // sorted (y, x)
  const stayD = manhattan(actor.pos, prime.pos);
  let bestTile: { x: number; y: number } | null = null;
  let bestD = stayD;
  for (const t of tiles) {
    const d = manhattan(t, prime.pos);
    if (d < bestD) {
      bestD = d;
      bestTile = t;
    }
  }
  if (!bestTile) return { kind: "wait" };
  return { kind: "move", to: { x: bestTile.x, y: bestTile.y } };
}

/**
 * Decide ONE {@link Command} for the unit whose turn it is (docs/06). Pure, zero
 * RNG. Order: disabled → wait; else the best in-range action (lexicographic order
 * above); else step toward the prime enemy; else wait.
 */
export function decideBalanceProbe(state: BattleState, unitId: string): Command {
  const actor = state.units.find((u) => u.id === unitId);
  if (!actor) throw new Error(`decideBalanceProbe: unknown unit ${unitId}`);

  // Step 0: a disabling status (Stop/Sleep/Don't-Act/Petrify) forbids acting.
  if (actor.statuses.some((st) => st.preventsAction)) return { kind: "wait" };

  const cands = candidatesFor(state, actor);
  if (cands.length > 0) {
    const best = cands.reduce((acc, c) => (compareCandidate(c, acc) < 0 ? c : acc));
    return toActCommand(best);
  }
  return moveTowardPrime(state, actor);
}
