/**
 * Charged (slow) actions on the shared timeline (docs/01 §3, docs/05 §1/§2).
 *
 * A charge is a first-class actor: on DECLARE the caster names a target TILE and
 * an effect, the charge is enqueued and the caster's turn ends. The EXISTING
 * scheduler (scheduler.ts) accrues the charge `+speed` per tick and surfaces it
 * once its ct >= 100; the driver (driver.ts) then calls {@link resolveCharge}.
 *
 * Determinism (sim-determinism-guard, docs/05 §3a): resolution draws from the
 * battle's single seeded stream, reconstructed from the state cursor, in a
 * DECLARED order:
 *   1. INTERRUPT CHECK   — no draw. Cancel if the caster is KO'd, is carrying a
 *                          disabling status (`preventsAction`/`interruptsCharge`;
 *                          Silence's `interruptsMagicOnly` fires only when
 *                          `effect.kind === "magic"`), OR the charge's `interrupted`
 *                          latch is set (the caster was disabled mid-charge and may
 *                          since have recovered — ADR-0010 item 2).
 *   2. TARGET RESOLUTION — no draw (empty tile → whiff)
 *   3. HIT ROLL          — one draw vs the magic hit% (accuracy then magic-evade,
 *                          facing-independent — docs/01 §6; only if a target present)
 *   4. MAGNITUDE         — no draw (magic formula → element → Zodiac → Shell)
 * On resolve the advanced RNG cursor is written back to `rngCounter`. A cancel
 * or a whiff consumes NO draw (no target to roll against) — keeping the cursor
 * position a function of what actually happened, so replay stays byte-exact.
 *
 * AREA CHARGES (`effect.aoe !== null`): after the interrupt check the resolver
 * enumerates the caster's FOES in the box around the target tile
 * ({@link unitsInAoeBox}, filtered to the enemy team — charges are magic damage,
 * so a friendly is never caught), and resolves each ONE AT A TIME in the DECLARED
 * TOTAL ORDER of the box (units sorted by `id` ASCENDING). Each target consumes
 * exactly ONE hit roll (step 3) then its own magnitude (step 4, recomputed
 * per target — Faith/Zodiac/Shell differ per unit). So the Nth draw is a pure
 * function of state, never of `units` array / Map / Set order. An EMPTY box is a
 * whiff (no draw). A `null` aoe takes the single-target path above UNCHANGED
 * (one draw, same cursor) — the no-op invariant that keeps replay byte-exact.
 *
 * Magnitude floor order (docs/05 §2): magic formula → element → Zodiac → Shell
 * → clamp >= 0. Mirrors resolve.ts's physical path with the magic formula.
 */

import { magicDamage, applyZodiac, applyShell, applyMagicEvasion, zodiacCompatibility } from "./formulas.js";
import { applyInflicts, CRYSTAL_TIMER_START } from "./resolve.js";
import { statusInterruptsCharge } from "./active-status.js";
import { inBounds, unitsInAoeBox } from "./grid.js";
import {
  rngFor,
  type ActiveStatus,
  type BattleState,
  type ChargeEffect,
  type Position,
} from "./state.js";

// MOVED to `active-status.ts` so `resolve.ts`'s on-hit inflict path can latch the
// same interrupt without importing this module (charge.ts already imports resolve.ts,
// so the reverse edge would be a cycle). Re-exported under its original name.
export { statusInterruptsCharge } from "./active-status.js";

/**
 * Apply an {@link ActiveStatus} to a unit AND latch the interrupt (ADR-0010 item
 * 2). If the status disables the unit ({@link statusInterruptsCharge}), every
 * pending charge that unit owns is flagged `interrupted` NOW — so a caster
 * disabled mid-charge stays cancelled at maturity even if the status decays first.
 * Kind-aware: Silence latches only the caster's magic charges. Pure: clones the
 * input, returns a new state. Consumes no RNG (status application is not random).
 *
 * SCOPE: this is the load-bearing status-application PLUMBING + latch. Full
 * inflict RESOLUTION (a resolver auto-applying `ability.inflicts` on hit) is
 * deferred — `BattleAbility.inflicts` carries status IDS only, not the resolved
 * behavior a self-contained {@link ActiveStatus} needs, and resolvers are
 * registry-free (ADR-0011). Wiring it needs the ActiveStatus template embedded at
 * build time (or a code-side legacy map); tracked, not silently done here.
 */
export function applyStatusToUnit(
  input: BattleState,
  unitId: string,
  status: ActiveStatus,
): BattleState {
  const state = structuredClone(input);
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`applyStatusToUnit: unknown unit ${unitId}`);
  unit.statuses.push({ ...status });
  for (const c of state.chargeQueue) {
    if (c.sourceUnitId === unitId && statusInterruptsCharge(status, c.effect.kind)) {
      c.interrupted = true;
    }
  }
  return state;
}

/** How a matured charge ended — the resolution outcome. */
export type ChargeResolution =
  | "cancelled" // caster KO'd or disabled at maturity (no effect, no draw)
  | "whiff" // target tile vacated (no effect, no draw)
  | "miss" // a unit was present but the hit roll failed (one draw)
  | "hit"; // damage applied (one draw)

/** One affected unit's result inside an AREA charge (id-sorted in {@link ChargeOutcome.perTarget}). */
export interface ChargeTargetHit {
  targetId: string;
  /** Magic hit chance used against this unit. */
  hitChance: number;
  hit: boolean;
  /** Damage dealt to this unit (0 on a miss). */
  damage: number;
  /** True only if this unit was dropped to 0 HP. */
  ko: boolean;
}

export interface ChargeOutcome {
  chargeId: string;
  sourceUnitId: string;
  targetTile: Position;
  resolution: ChargeResolution;
  /**
   * The unit resolved against for a SINGLE-TARGET charge; `null` for an area
   * charge (see {@link perTarget}) or when cancelled/whiffed.
   */
  targetId: string | null;
  /** Post-facing/effect hit chance used (0 when cancelled/whiffed or area). */
  hitChance: number;
  /** Damage dealt — the single target's, or the SUM over an area's targets. */
  damage: number;
  /** True if ANY resolved unit was dropped to 0 HP. */
  ko: boolean;
  /**
   * Per-target breakdown for an AREA charge (`effect.aoe !== null`), in the
   * declared id-ascending order the hit rolls were drawn. Absent for a
   * single-target charge, so the single-target outcome shape is unchanged.
   */
  perTarget?: ChargeTargetHit[];
}

export interface ChargeResolveResult {
  state: BattleState;
  outcome: ChargeOutcome;
}

export interface DeclareChargeInput {
  /** The tile the charge will resolve against (docs/01 §3). */
  targetTile: Position;
  /** The charge's own accrual speed, independent of caster Speed (docs/01 §3). */
  speed: number;
  /** The self-contained effect payload resolved on the matured tick. */
  effect: ChargeEffect;
}

/**
 * Declare a charged action (docs/05 §2 DECLARE): enqueue a ChargedAction with a
 * deterministic id. Pure: clones the input, returns a new state. Consumes no RNG
 * (declaration is not a random event).
 *
 * TURN ECONOMY IS THE CALLER'S (driver.ts) — this function does NOT settle.
 * It used to end the caster's turn itself at a hard-coded cost 80 ("no move
 * phase here"), which silently mis-priced a MOVE-then-CHARGE turn at −80 instead
 * of the −100 docs/01 §1 mandates. Settling belongs to whoever owns the turn, so
 * that ONE command settles exactly ONCE with the actual `didMove`/`didAct` it
 * performed; a helper deciding a CT cost from an assumption it cannot see is the
 * bug class itself. Callers must follow a declare with a single
 * `settleTurn` (the driver's `act` case does; docs/01 §2 still forbids
 * pairing a charged act with a move-AFTER, so a charged turn is either −80 or,
 * with a move-before, −100).
 *
 * The charge id is derived deterministically from caster + tick (with a numeric
 * disambiguator scanning the queue), never a counter or timestamp — so replay
 * reproduces the same id and the schema's charge-id-uniqueness refine holds.
 */
export function declareCharge(
  input: BattleState,
  casterId: string,
  { targetTile, speed, effect }: DeclareChargeInput,
): BattleState {
  const state = structuredClone(input);
  const caster = state.units.find((u) => u.id === casterId);
  if (!caster) throw new Error(`declareCharge: unknown caster ${casterId}`);
  // A downed unit cannot begin a charge; the caller must pre-validate legal
  // actors (a KO'd unit's turn ticks the crystal instead — docs/01 §11).
  if (caster.hp <= 0) throw new Error(`declareCharge: caster ${casterId} is down`);
  if (!inBounds(state.grid, targetTile.x, targetTile.y)) {
    throw new Error(`declareCharge: target tile (${targetTile.x},${targetTile.y}) is off-grid`);
  }

  const id = nextChargeId(state, casterId);
  state.chargeQueue.push({
    id,
    sourceUnitId: casterId,
    ct: 0,
    speed,
    targetTile: { x: targetTile.x, y: targetTile.y },
    effect: { ...effect },
    interrupted: false, // fresh charge; the latch is set only if the caster is later disabled
  });
  state.turnLog.push({ tick: state.tick, unitId: casterId, action: `charge ${id}` });

  // NO settle here — the caller ends the turn with the real (didMove, didAct).
  return state;
}

/** Deterministic, collision-free charge id from caster + tick. */
function nextChargeId(state: BattleState, casterId: string): string {
  const taken = new Set(state.chargeQueue.map((c) => c.id));
  let n = 0;
  let id = `chg.${casterId}.${state.tick}.${n}`;
  while (taken.has(id)) {
    n += 1;
    id = `chg.${casterId}.${state.tick}.${n}`;
  }
  return id;
}

/**
 * Resolve a matured charge (docs/05 §2 RESOLVE), then DEQUEUE it. Pure: clones
 * the input and returns a new state. The dequeue is mandatory — the scheduler
 * leaves a matured charge in the queue at ct >= 100, and a charge left there
 * wins every tie-break forever and starves all units (contract noted in
 * scheduler.ts).
 *
 * Roll order is documented at the top of this file. Cancel and whiff consume no
 * RNG draw.
 */
export function resolveCharge(input: BattleState, chargeId: string): ChargeResolveResult {
  const state = structuredClone(input);
  const idx = state.chargeQueue.findIndex((c) => c.id === chargeId);
  if (idx === -1) throw new Error(`resolveCharge: unknown charge ${chargeId}`);
  const charge = state.chargeQueue[idx]!;
  const { sourceUnitId, targetTile, effect } = charge;

  const dequeue = (): void => {
    state.chargeQueue.splice(idx, 1);
  };
  const base: Omit<ChargeOutcome, "resolution" | "targetId" | "hitChance" | "damage" | "ko"> = {
    chargeId,
    sourceUnitId,
    targetTile,
  };

  // 1. INTERRUPT CHECK — cancel if the caster is KO'd (HP <= 0), is carrying a
  //    disabling status right now ({@link statusInterruptsCharge}: Stop/Sleep/
  //    Don't-Act/Petrify always, Silence for a magic charge), OR the `interrupted`
  //    latch fired earlier (caster was disabled mid-charge and may have recovered
  //    since — ADR-0010 item 2). A missing caster counts as cancelled. No draw.
  const caster = state.units.find((u) => u.id === sourceUnitId);
  const disabled =
    !caster ||
    caster.hp <= 0 ||
    charge.interrupted ||
    caster.statuses.some((st) => statusInterruptsCharge(st, effect.kind));
  if (disabled) {
    dequeue();
    state.turnLog.push({ tick: state.tick, unitId: sourceUnitId, action: `charge ${chargeId} cancelled` });
    return {
      state,
      outcome: { ...base, resolution: "cancelled", targetId: null, hitChance: 0, damage: 0, ko: false },
    };
  }

  // 1a. AREA BRANCH — an area charge resolves every FOE in the box around the
  //     target tile, one at a time, in the box's DECLARED id-ascending order
  //     (unitsInAoeBox). Each target draws ONE magic hit roll then its own
  //     magnitude (recomputed per unit: Faith/Zodiac/Shell differ). Charges are
  //     magic damage, so only enemies are ever caught — no friendly fire. Empty
  //     box → whiff, no draw. A `null` aoe falls through to the single-target
  //     path below, byte-identical (the no-op invariant).
  if (effect.aoe !== null) {
    const foes = unitsInAoeBox(state.grid, state.units, targetTile, effect.aoe).filter(
      (u) => u.teamId !== caster.teamId,
    );
    if (foes.length === 0) {
      dequeue();
      state.turnLog.push({ tick: state.tick, unitId: sourceUnitId, action: `charge ${chargeId} aoe whiff` });
      return {
        state,
        outcome: { ...base, resolution: "whiff", targetId: null, hitChance: 0, damage: 0, ko: false, perTarget: [] },
      };
    }

    const rng = rngFor(state);
    const perTarget: ChargeTargetHit[] = [];
    let anyHit = false;
    let anyKo = false;
    let totalDamage = 0;
    for (const foeRef of foes) {
      // Re-find on the live (mutating) clone so a KO earlier in the box is seen.
      const foe = state.units.find((u) => u.id === foeRef.id)!;
      const chance = applyMagicEvasion(effect.accuracy, foe.evasion.magicEv);
      const hitOne = rng.chance(chance); // ONE draw per target, id order.
      let dmg = 0;
      let koOne = false;
      if (hitOne) {
        anyHit = true;
        // MAGNITUDE — same floor order as the single-target path, per target.
        let m = magicDamage(caster.ma, effect.power, caster.faith, foe.faith);
        m = applyZodiac(m, zodiacCompatibility(caster.zodiac, foe.zodiac));
        if (foe.statuses.some((st) => st.id === "shell")) m = applyShell(m);
        if (m < 0) m = 0;
        dmg = m;
        totalDamage += dmg;
        const newHp = Math.max(0, foe.hp - dmg);
        const wasAlive = foe.hp > 0;
        foe.hp = newHp;
        if (newHp === 0 && wasAlive) {
          foe.crystalTimer = CRYSTAL_TIMER_START;
          koOne = true;
          anyKo = true;
        }
        // ON-HIT STATUS at maturity, per landed target (docs/05 §2 step d). The
        // templates rode along on the charge effect, so nothing is re-read here.
        applyInflicts(state, foe, effect.inflicts);
      }
      perTarget.push({ targetId: foe.id, hitChance: chance, hit: hitOne, damage: dmg, ko: koOne });
    }

    state.rngCounter = rng.count;
    dequeue();
    const hits = perTarget.filter((p) => p.hit).length;
    const kos = perTarget.filter((p) => p.ko).length;
    state.turnLog.push({
      tick: state.tick,
      unitId: sourceUnitId,
      action: `charge ${chargeId} aoe ${hits} hit / ${kos} ko`,
    });
    return {
      state,
      outcome: {
        ...base,
        resolution: anyHit ? "hit" : "miss",
        targetId: null,
        hitChance: 0,
        damage: totalDamage,
        ko: anyKo,
        perTarget,
      },
    };
  }

  // 2. TARGET RESOLUTION — units currently on the target tile. Positions are
  //    unique (schema refine), so at most one LIVING unit is there; a KO'd unit
  //    on the tile is not a valid target. Empty tile → whiff, no draw.
  const target = state.units.find(
    (u) => u.hp > 0 && u.pos.x === targetTile.x && u.pos.y === targetTile.y,
  );
  if (!target) {
    dequeue();
    state.turnLog.push({ tick: state.tick, unitId: sourceUnitId, action: `charge ${chargeId} whiff` });
    return {
      state,
      outcome: { ...base, resolution: "whiff", targetId: null, hitChance: 0, damage: 0, ko: false },
    };
  }

  // 3. HIT ROLL — one draw vs the MAGIC hit%. Magic uses ONLY magic-evasion,
  //    facing-independent (docs/01 §6): the base `effect.accuracy` is reduced by
  //    the target's magicEv via the independent-multiplicative model. For our
  //    DAMAGE magic, base = 100 with Faith carried in the MAGNITUDE (magicDamage
  //    below), so caster×target Faith does NOT gate the hit here — the hit is
  //    `applyMagicEvasion(accuracy, magicEv)`. (STATUS magic, when it lands in a
  //    later slice, routes its base = MA+K through `magicHitChance` so Faith and
  //    Zodiac DO gate landing.) One draw, same cursor position as before.
  const rng = rngFor(state);
  const chance = applyMagicEvasion(effect.accuracy, target.evasion.magicEv);
  const hit = rng.chance(chance);

  let damage = 0;
  let ko = false;
  if (hit) {
    // 4. MAGNITUDE — magic formula → element → Zodiac → Shell → clamp (docs/05 §2).
    let dmg = magicDamage(caster.ma, effect.power, caster.faith, target.faith);
    // Element "none" is a pass-through; weak/half/absorb/null land in a later slice.
    const tier = zodiacCompatibility(caster.zodiac, target.zodiac);
    dmg = applyZodiac(dmg, tier);
    if (target.statuses.some((st) => st.id === "shell")) dmg = applyShell(dmg);
    if (dmg < 0) dmg = 0;
    damage = dmg;

    const newHp = Math.max(0, target.hp - damage);
    const wasAlive = target.hp > 0;
    target.hp = newHp;
    if (newHp === 0 && wasAlive) {
      target.crystalTimer = CRYSTAL_TIMER_START;
      ko = true;
    }
    // ON-HIT STATUS at maturity (docs/05 §2 step d), from the templates the charge
    // carried since it was declared.
    applyInflicts(state, target, effect.inflicts);
  }

  state.rngCounter = rng.count;
  dequeue();
  state.turnLog.push({
    tick: state.tick,
    unitId: sourceUnitId,
    action: !hit ? `charge ${chargeId} miss ${target.id}` : ko ? `charge ${chargeId} KO ${target.id}` : `charge ${chargeId} hit ${target.id} −${damage}`,
  });

  return {
    state,
    outcome: {
      ...base,
      resolution: hit ? "hit" : "miss",
      targetId: target.id,
      hitChance: chance,
      damage,
      ko,
    },
  };
}
