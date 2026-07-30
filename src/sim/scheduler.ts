/**
 * CT clock-tick scheduler (docs/05 §1). Units AND charged actions share ONE
 * timeline — charges are first-class actors, never a side system.
 *
 * Determinism (sim-determinism-guard, ADR-0004):
 *   - Pure integer math; no RNG is consumed here (turn order is not random).
 *   - The tie-break is an explicit total-order comparator, NOT reliance on
 *     sort/insertion order (docs/05 §1a — this order is a fidelity commitment).
 *   - Functions clone their input and return a new state; callers' states are
 *     never mutated, keeping rewind/replay honest.
 */

import type { BattleState, ChargedActionState, UnitState } from "./state.js";

/** Haste/Slow CT multipliers (docs/01 §1). Applied then floored. */
export const HASTE_FACTOR = 1.5;
export const SLOW_FACTOR = 0.5;

/** CT threshold that grants an active turn. */
export const TURN_THRESHOLD = 100;

/** End-of-turn CT costs (docs/01 §1, docs/05 §1c). Remainder carries. */
export const CT_COST_MOVE_AND_ACT = 100;
export const CT_COST_ONE = 80;
export const CT_COST_WAIT = 60;

/** Safety bound so a fully-stalled field can't spin forever. */
const MAX_TICKS_PER_TURN = 100_000;

/**
 * A unit's CT accrual per tick: floor(Speed × haste/slow), or 0 while Stopped.
 * Stop dominates. Haste and Slow are mutually exclusive in FFT (one dispels the
 * other); if a state somehow carries both, they cancel to neutral rather than
 * silently favoring either.
 */
export function ctRateOfUnit(u: UnitState): number {
  if (u.hp <= 0) return 0; // KO'd units don't take turns (docs/01 §11)
  if (u.statuses.includes("stop")) return 0;
  const hasted = u.statuses.includes("haste");
  const slowed = u.statuses.includes("slow");
  const factor = hasted && slowed ? 1 : hasted ? HASTE_FACTOR : slowed ? SLOW_FACTOR : 1;
  return Math.floor(u.speed * factor);
}

/** A charged action accrues at its own speed, independent of caster Speed (docs/01 §3). */
export function ctRateOfCharge(c: ChargedActionState): number {
  return c.speed;
}

export type ActiveActor = { kind: "unit"; id: string } | { kind: "charge"; id: string };

interface SchedActor {
  kind: "unit" | "charge";
  id: string;
  rate: number;
  ref: { ct: number };
}

function buildActors(state: BattleState): SchedActor[] {
  const actors: SchedActor[] = [];
  // Enumeration order is irrelevant: the comparator is a total order on
  // (ct, kind, id), so ties never fall back to insertion/iteration order.
  for (const c of state.chargeQueue) {
    actors.push({ kind: "charge", id: c.id, rate: ctRateOfCharge(c), ref: c });
  }
  for (const u of state.units) {
    actors.push({ kind: "unit", id: u.id, rate: ctRateOfUnit(u), ref: u });
  }
  return actors;
}

/**
 * The PINNED tie-break (docs/05 §1a, ADR-0008), as a total order. Returns < 0
 * when `a` should resolve before `b`:
 *   1. higher `ct` first,
 *   2. then a ChargedAction before a Unit,
 *   3. then lower id — a locale-independent lexicographic compare of the
 *      actor id (unitId asc per the spec; charge-vs-charge uses the same rule).
 *      Keying on the id (not array position) means a mis-ordered `units` array
 *      can never change the outcome.
 */
export function tieBreak(a: SchedActor, b: SchedActor): number {
  if (a.ref.ct !== b.ref.ct) return b.ref.ct - a.ref.ct;
  const ka = a.kind === "charge" ? 0 : 1;
  const kb = b.kind === "charge" ? 0 : 1;
  if (ka !== kb) return ka - kb;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export interface NextTurn {
  /** New state advanced to the moment an actor reaches the turn threshold. */
  state: BattleState;
  /** The actor that gets the turn, or null if the field is fully stalled (all Stopped). */
  active: ActiveActor | null;
  /** How many ticks were advanced to get here. */
  ticksAdvanced: number;
}

/**
 * Advance the clock until an actor reaches CT ≥ 100, then return that actor
 * (resolved by the pinned tie-break) and the advanced state. Does not spend CT
 * — the caller resolves the action and then calls {@link settleTurn}.
 *
 * CONTRACT: a returned charged action is left in the queue at ct ≥ 100. The
 * caller MUST dequeue it on resolution (PR4); otherwise it stays perpetually
 * ready and wins every tie-break, starving all units. `MAX_TICKS_PER_TURN`
 * cannot catch that (no ticks advance) — it is a caller obligation.
 */
export function advanceToNextTurn(input: BattleState): NextTurn {
  const state = structuredClone(input);
  const actors = buildActors(state);
  if (actors.length === 0) return { state, active: null, ticksAdvanced: 0 };

  let ticks = 0;
  const readyActors = (): SchedActor[] => actors.filter((a) => a.ref.ct >= TURN_THRESHOLD);

  while (readyActors().length === 0) {
    if (!actors.some((a) => a.rate > 0)) {
      return { state, active: null, ticksAdvanced: ticks }; // stalemate: nothing accrues
    }
    for (const a of actors) a.ref.ct += a.rate;
    state.tick += 1;
    ticks += 1;
    if (ticks > MAX_TICKS_PER_TURN) {
      throw new Error("scheduler exceeded per-turn tick bound (non-advancing field?)");
    }
  }

  const winner = readyActors().reduce((best, cur) => (tieBreak(cur, best) < 0 ? cur : best));
  return { state, active: { kind: winner.kind, id: winner.id }, ticksAdvanced: ticks };
}

/**
 * Spend end-of-turn CT for a unit (docs/01 §1, docs/05 §1c): 100 for move+act,
 * 80 for one, 60 for a Wait; the remainder carries over.
 *
 * A unit only takes a turn at ct ≥ 100 and the max cost is 100, so the result
 * is always ≥ 0 in correct use. Rather than trust that, we assert `ct ≥ cost`
 * and throw loudly on violation — a negative CT is a caller bug (settling the
 * wrong unit, or one that never reached the threshold), and surfacing it here
 * beats a confusing serialization error two steps later.
 */
export function settleTurn(
  input: BattleState,
  unitId: string,
  opts: { didMove: boolean; didAct: boolean },
): BattleState {
  const state = structuredClone(input);
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`settleTurn: unknown unit ${unitId}`);

  const cost =
    opts.didMove && opts.didAct
      ? CT_COST_MOVE_AND_ACT
      : opts.didMove || opts.didAct
        ? CT_COST_ONE
        : CT_COST_WAIT;

  if (unit.ct < cost) {
    throw new Error(
      `settleTurn: unit ${unitId} has ct ${unit.ct} < cost ${cost}; only a unit that took its turn (ct >= ${TURN_THRESHOLD}) should be settled`,
    );
  }
  unit.ct -= cost;
  return state;
}
