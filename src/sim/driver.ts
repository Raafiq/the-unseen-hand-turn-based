/**
 * Deterministic battle driver + replay harness (docs/05 §3b).
 *
 * The rewind/save/share substrate is **seeded command-replay**: a battle is
 * `(seed, ordered commands)`, and any state is a fold of {@link applyCommand}
 * over the initial state. Because every sim primitive is pure and draws only
 * from the seeded stream, `replay` reproduces a live run BYTE-for-byte
 * (AC-S1/S7). This module is the fold.
 *
 * A Command is one ACTIVE UNIT's decision. The driver advances the shared
 * timeline to the next actor and:
 *   - a matured CHARGE actor → auto-resolves it (no command consumed),
 *   - a KO'd unit's turn → auto-ticks its crystal counter (no command consumed),
 *   - a living unit's turn → applies the next command to it, then settles.
 * So the command log lines up 1:1 with living-unit turns; charges and crystal
 * ticks are engine-driven and never appear in the log.
 *
 * Simplification (deferred): each command is a single sub-phase (move XOR act
 * XOR wait), so a combined move-then-act turn is two model steps away. The
 * replay-equality guarantee does not depend on combined turns; a later slice can
 * fold move+act into one command without changing this contract.
 */

import { z } from "zod";
import { advanceToNextTurn, settleTurn } from "./scheduler.js";
import { resolveAttack, tickCrystal } from "./resolve.js";
import { declareCharge, resolveCharge } from "./charge.js";
import { moveRange } from "./grid.js";
import { PositionSchema, ChargeEffectSchema, type BattleState } from "./state.js";

/**
 * One active unit's decision. Discriminated by `kind`; the acting unit is chosen
 * by the scheduler (NOT named in the command), so a command applies to whichever
 * living unit's turn comes up next — that is what makes `(seed, commands)` a
 * complete, position-independent replay.
 */
export const CommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), to: PositionSchema }).strict(),
  z.object({ kind: z.literal("attack"), targetId: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal("castCharge"),
      targetTile: PositionSchema,
      speed: z.number().int().min(1),
      effect: ChargeEffectSchema,
    })
    .strict(),
  z.object({ kind: z.literal("wait") }).strict(),
]);
export type Command = z.infer<typeof CommandSchema>;

/**
 * Advance to the next living-unit turn (auto-resolving any charges and crystal
 * ticks that come up first) and apply `command` to that unit, settling its turn.
 * Pure: threads immutable states, never mutates the input.
 *
 * @throws if the field is fully stalled (no actor can reach a turn), since there
 *   is no unit to apply the command to.
 */
export function applyCommand(input: BattleState, command: Command): BattleState {
  const parsed = CommandSchema.parse(command);
  let state = input;
  for (;;) {
    const { state: advanced, active } = advanceToNextTurn(state);
    state = advanced;
    if (!active) {
      throw new Error("applyCommand: field is stalled; no actor to apply the command to");
    }
    if (active.kind === "charge") {
      state = resolveCharge(state, active.id).state;
      continue;
    }
    const unit = state.units.find((u) => u.id === active.id);
    if (!unit) throw new Error(`applyCommand: scheduler surfaced unknown unit ${active.id}`);
    if (unit.hp <= 0) {
      // A KO'd unit's turn ticks the crystal counter (docs/01 §11); no command.
      state = tickCrystal(state, active.id).state;
      continue;
    }
    return applyToUnit(state, active.id, parsed);
  }
}

/** Apply one command to the (living) unit whose turn it is, then settle. */
function applyToUnit(state: BattleState, unitId: string, command: Command): BattleState {
  switch (command.kind) {
    case "move": {
      const legal = moveRange(state.grid, state.units, unitId);
      if (!legal.some((p) => p.x === command.to.x && p.y === command.to.y)) {
        throw new Error(
          `applyCommand: illegal move for ${unitId} to (${command.to.x},${command.to.y})`,
        );
      }
      const next = structuredClone(state);
      const unit = next.units.find((u) => u.id === unitId)!;
      unit.pos = { x: command.to.x, y: command.to.y };
      next.turnLog.push({ tick: next.tick, unitId, action: `move ${command.to.x},${command.to.y}` });
      return settleTurn(next, unitId, { didMove: true, didAct: false });
    }
    case "attack": {
      const { state: after } = resolveAttack(state, unitId, command.targetId);
      return settleTurn(after, unitId, { didMove: false, didAct: true });
    }
    case "castCharge":
      // declareCharge enqueues the charge AND ends the caster's turn (settles).
      return declareCharge(state, unitId, {
        targetTile: command.targetTile,
        speed: command.speed,
        effect: command.effect,
      });
    case "wait":
      return settleTurn(state, unitId, { didMove: false, didAct: false });
  }
}

/** Fold a command log over the initial state — the canonical replay (AC-S1). */
export function replay(initialState: BattleState, commands: readonly Command[]): BattleState {
  let state = initialState;
  for (const command of commands) state = applyCommand(state, command);
  return state;
}

/**
 * Like {@link replay}, but returns the state AFTER each command — the per-step
 * trace the replay-equality harness compares tick-by-tick (AC-S1: byte-identical
 * at every step).
 */
export function replaySteps(
  initialState: BattleState,
  commands: readonly Command[],
): BattleState[] {
  const steps: BattleState[] = [];
  let state = initialState;
  for (const command of commands) {
    state = applyCommand(state, command);
    steps.push(state);
  }
  return steps;
}
