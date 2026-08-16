/**
 * Win / lose / ongoing detection (docs/06 §encounters, P2 Slice 2). A total gap
 * before this slice: dead units STAY in `state.units` (the schema keeps them for
 * the crystal countdown, docs/01 §11), so victory is counted by "is this unit
 * OUT?" — `hp <= 0` — never by removal.
 *
 * PURE + no RNG: a terminal verdict is a deterministic function of the serialized
 * BattleState plus the turn/tick counters the harness keeps. This module never
 * reads a clock, never draws from the seed, and never iterates a Map/Set in a way
 * that affects the result.
 *
 * Extensibility: {@link Condition} is a discriminated union — adding an objective
 * (the built `survive`, or a future escape / protect-a-unit; documented below) is a
 * new `case` in {@link evalCondition}, with no schema or engine churn.
 */

import { z } from "zod";
import { effectiveTeamOf } from "./state.js";
import type { BattleState } from "./state.js";

const IntSchema = z.number().int();

/**
 * A battle objective (docs/06). Three cases are BUILT; the rest are DOCUMENTED as
 * future `case`s, not built:
 *   - `eliminateTeams` — every unit of the listed teams is OUT (`hp <= 0`).
 *   - `defeatUnit`     — a specific unit is OUT.
 *   - `survive {teamId, ticks}` [ENHANCEMENT] — `teamId` still has a survivor once the
 *     battle clock reaches `ticks`. TAG: the turn/CT-bounded objective CATEGORY is
 *     baseline (FFT has protect-until / defeat-within-N), but a pure win-BY-survival
 *     victory is an enhancement — canonical in FFTA/FFTA2, NOT our PSX FFT baseline.
 *     NOTE the field is `ticks` (the CT clock `state.tick`), NOT rounds/turns: under
 *     the CT clock a unit acts roughly every ~(100 / Speed) ticks (docs/01), so with
 *     the default Speed 5 a unit takes a turn about every ~20 ticks — a player-facing
 *     "survive ~5 rounds" is authored as `ticks: 100`. Convert desired rounds → ticks
 *     with the roster's actual Speed; do NOT read `ticks` as rounds. Pair it with
 *     a defeat of `eliminateTeams{[teamId]}`: with the `alive` survivor clause below,
 *     `survive` (victory) and `eliminateTeams{[teamId]}` (defeat) are exact logical
 *     complements at the threshold tick, so `won && lost` is unreachable — no spurious
 *     `draw`. Drop the survivor clause and a wipe-at-threshold becomes both won (tick
 *     reached) and lost (team dead) ⇒ a bogus draw.
 *   - [FUTURE] `escape {teamId, tiles}`      — a unit of `teamId` stands on an exit tile.
 *   - [FUTURE] `protect {unitId}`            — a guarded unit is still alive at battle end.
 * Each future case is additive: a new union member + a new `evalCondition` branch.
 */
export const ConditionSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("eliminateTeams"), teams: z.array(IntSchema.min(0)).min(1) })
    .strict(),
  z.object({ kind: z.literal("defeatUnit"), unitId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("survive"), teamId: IntSchema.min(0), ticks: IntSchema.min(1) }).strict(),
]);
export type Condition = z.infer<typeof ConditionSchema>;

/** A unit is OUT when its HP is at or below zero (KO or crystallized), docs/01 §11. */
function isOut(state: BattleState, unitId: string): boolean {
  const unit = state.units.find((u) => u.id === unitId);
  // A unit absent from the field counts as OUT (removed/never-deployed → defeated).
  return unit === undefined || unit.hp <= 0;
}

/**
 * Evaluate a single {@link Condition} against a state (pure). OUT = `hp <= 0`.
 *
 * A unit counts for the team it currently FIGHTS FOR (state.ts `effectiveTeamOf`), not
 * the one it was deployed on: a CHARMED unit no longer opposes the side controlling it,
 * so charming the last defender ENDS the battle exactly as felling it would. That is a
 * design call, not an accident — the alternative (count the body for its nominal team)
 * was implemented first and produced a LIVELOCK: nobody on the charmer's side will
 * attack an ally, the charmer re-applies control the moment it lapses, and the fight ran
 * to a 580-tick timeout with 18 charms landed. Control is the thief's win condition; a
 * battle nobody can end is not a design, it is a hang. [UNCERTAIN vs FFT: the source
 * game's rule for an all-charmed enemy team is unverified — fft-fidelity, docs/01 §8.]
 *
 * The symmetry is deliberate and costs the charmer too: if MY last unit is charmed, MY
 * team is eliminated.
 *
 *   - `eliminateTeams`: true once EVERY unit whose EFFECTIVE team is in `teams` is OUT
 *     (vacuously true if a listed team has no units — an authored-encounter concern).
 *   - `defeatUnit`: true once the named unit is OUT.
 *   - `survive`: true once the battle clock (`state.tick`) reaches `cond.ticks` AND
 *     `cond.teamId` still has a living unit. The `alive` clause is LOAD-BEARING: it
 *     makes `survive` and `eliminateTeams{[teamId]}` exact complements at the
 *     threshold tick (see ConditionSchema doc) so the intended victory/defeat pairing
 *     can never both fire (no spurious draw). Reads only `state.tick` + `state.units`
 *     (order-independent `.some()`) — zero RNG.
 */
export function evalCondition(state: BattleState, cond: Condition): boolean {
  switch (cond.kind) {
    case "eliminateTeams": {
      const teams = new Set(cond.teams);
      return state.units.every((u) => !teams.has(effectiveTeamOf(u)) || u.hp <= 0);
    }
    case "defeatUnit":
      return isOut(state, cond.unitId);
    case "survive": {
      const alive = state.units.some((u) => effectiveTeamOf(u) === cond.teamId && u.hp > 0);
      return state.tick >= cond.ticks && alive;
    }
  }
}

/** The five terminal outcomes plus `ongoing` (battle continues), docs/06. */
export type Outcome = "victory" | "defeat" | "draw" | "stalemate" | "timeout" | "ongoing";

export interface TerminalVerdict {
  outcome: Outcome;
  /** The sole team still standing, or `null` when ≠ one team survives (draw / both alive). */
  winningTeam: number | null;
}

/** The unique team with a living unit, or `null` when zero or multiple teams survive. */
export function winningTeamOf(state: BattleState): number | null {
  let team: number | null = null;
  for (const u of state.units) {
    if (u.hp <= 0) continue;
    const t = effectiveTeamOf(u);
    if (team === null) team = t;
    else if (team !== t) return null; // two teams alive → no sole winner
  }
  return team;
}

/** The turn/tick budget the harness tracks, and the caps that force a halt. */
export interface TerminalCounters {
  /** Living-unit decisions taken so far. */
  turns: number;
  /** The battle clock (`state.tick`). */
  ticks: number;
  /** Max decisions before a forced `timeout` (halting guarantee). */
  maxTurns: number;
  /** Max ticks before a forced `timeout`. */
  maxTicks: number;
}

/**
 * The team a met objective CREDITS — its beneficiary. A `survive` objective's winner
 * is `teamId` (for a survive VICTORY the loser is still alive, so `winningTeamOf` would
 * see two live teams and mis-report `null`; for a survive DEFEAT — "you lose if the
 * enemy survives N ticks", the defeat-within-N objective, docs/06 — the winner is the
 * enemy that outlasted, also `teamId`). An `eliminateTeams`/`defeatUnit` objective's
 * loser is gone, so the sole survivor `winningTeamOf` finds IS the beneficiary. `won`/
 * `lost` guarantee the survive `teamId` has a live unit, so it always names a real team.
 */
function objectiveBeneficiary(cond: Condition, state: BattleState): number | null {
  return cond.kind === "survive" ? cond.teamId : winningTeamOf(state);
}

/**
 * The terminal verdict for a state (pure). Precedence: a met objective decides
 * first (both met ⇒ `draw`), then the turn/tick caps force a `timeout` — which
 * GUARANTEES the harness halts even when neither side can finish (two immortal
 * healers). Returns `outcome: "ongoing"` when the battle should continue.
 *
 * Winner attribution routes every objective outcome through {@link
 * objectiveBeneficiary} so a `survive` objective in EITHER slot credits the team that
 * actually won (a `draw` keeps `winningTeamOf` — a mutual finish has no sole winner).
 *
 * NOTE — `stalemate` (a fully-Stopped field) is NOT detectable from these inputs;
 * it comes from {@link advanceToDecision}'s `terminal` and is applied by the
 * harness. It is a member of {@link Outcome} so both share one result type.
 */
export function evalTerminal(
  state: BattleState,
  victory: Condition,
  defeat: Condition,
  counters: TerminalCounters,
): TerminalVerdict {
  const won = evalCondition(state, victory);
  const lost = evalCondition(state, defeat);
  if (won && lost) return { outcome: "draw", winningTeam: winningTeamOf(state) };
  if (won) return { outcome: "victory", winningTeam: objectiveBeneficiary(victory, state) };
  if (lost) return { outcome: "defeat", winningTeam: objectiveBeneficiary(defeat, state) };
  if (counters.turns >= counters.maxTurns || counters.ticks >= counters.maxTicks) {
    return { outcome: "timeout", winningTeam: winningTeamOf(state) };
  }
  return { outcome: "ongoing", winningTeam: null };
}
