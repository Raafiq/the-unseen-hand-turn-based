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
 * Extensibility: {@link Condition} is a discriminated union — adding a future
 * objective (escape / survive-N-turns / protect-a-unit; documented below) is a new
 * `case` in {@link evalCondition}, with no schema or engine churn.
 */

import { z } from "zod";
import type { BattleState } from "./state.js";

const IntSchema = z.number().int();

/**
 * A battle objective (docs/06). P2 builds two cases; the rest are DOCUMENTED as
 * future `case`s, not built:
 *   - `eliminateTeams` — every unit of the listed teams is OUT (`hp <= 0`).
 *   - `defeatUnit`     — a specific unit is OUT.
 *   - [FUTURE] `escape {teamId, tiles}`      — a unit of `teamId` stands on an exit tile.
 *   - [FUTURE] `survive {teamId, turns}`     — `teamId` still has a survivor at turn N.
 *   - [FUTURE] `protect {unitId}`            — a guarded unit is still alive at battle end.
 * Each future case is additive: a new union member + a new `evalCondition` branch.
 */
export const ConditionSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("eliminateTeams"), teams: z.array(IntSchema.min(0)).min(1) })
    .strict(),
  z.object({ kind: z.literal("defeatUnit"), unitId: z.string().min(1) }).strict(),
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
 *   - `eliminateTeams`: true once EVERY unit whose `teamId` is in `teams` is OUT
 *     (vacuously true if a listed team has no units — an authored-encounter concern).
 *   - `defeatUnit`: true once the named unit is OUT.
 */
export function evalCondition(state: BattleState, cond: Condition): boolean {
  switch (cond.kind) {
    case "eliminateTeams": {
      const teams = new Set(cond.teams);
      return state.units.every((u) => !teams.has(u.teamId) || u.hp <= 0);
    }
    case "defeatUnit":
      return isOut(state, cond.unitId);
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
    if (team === null) team = u.teamId;
    else if (team !== u.teamId) return null; // two teams alive → no sole winner
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
 * The terminal verdict for a state (pure). Precedence: a met objective decides
 * first (both met ⇒ `draw`), then the turn/tick caps force a `timeout` — which
 * GUARANTEES the harness halts even when neither side can finish (two immortal
 * healers). Returns `outcome: "ongoing"` when the battle should continue.
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
  const winningTeam = winningTeamOf(state);
  if (won && lost) return { outcome: "draw", winningTeam };
  if (won) return { outcome: "victory", winningTeam };
  if (lost) return { outcome: "defeat", winningTeam };
  if (counters.turns >= counters.maxTurns || counters.ticks >= counters.maxTicks) {
    return { outcome: "timeout", winningTeam };
  }
  return { outcome: "ongoing", winningTeam: null };
}
