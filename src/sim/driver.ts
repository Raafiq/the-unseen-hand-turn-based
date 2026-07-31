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
import { resolveAttack, resolveAbility, tickCrystal } from "./resolve.js";
import { declareCharge, resolveCharge } from "./charge.js";
import { moveRange, inAbilityRange } from "./grid.js";
import { PositionSchema, type BattleState, type Position } from "./state.js";

/**
 * One active unit's decision. Discriminated by `kind`; the acting unit is chosen
 * by the scheduler (NOT named in the command), so a command applies to whichever
 * living unit's turn comes up next — that is what makes `(seed, commands)` a
 * complete, position-independent replay.
 *
 * `act` is the loadout-derived action (Slice 5): the caller names an `abilityId`
 * that MUST be equipped on the acting unit (`unit.abilities`) — the command
 * carries no combat data of its own; power/element/accuracy/speed all come from
 * the unit's ability projection, so what a unit CAN issue derives entirely from
 * its equipped loadout. `target` is a small union whose SHAPE is the discriminant:
 * a bare `{x,y}` is a TILE (charged/AoE actions resolve against a tile — the
 * occupant may walk off), a `{unitId}` is a locked UNIT (instant single-target).
 */
export const CommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), to: PositionSchema }).strict(),
  z
    .object({
      kind: z.literal("act"),
      abilityId: z.string().min(1),
      target: z.union([PositionSchema, z.object({ unitId: z.string().min(1) }).strict()]),
    })
    .strict(),
  z.object({ kind: z.literal("wait") }).strict(),
]);
export type Command = z.infer<typeof CommandSchema>;

/**
 * The result of advancing the shared timeline to the next DECISION POINT — the
 * moment a living unit is up and a caller (the driver or the benchmark harness)
 * must supply one command. `unitId` names that unit; `terminal` is `"stalemate"`
 * (with `unitId: null`) when the field is fully stalled and no actor can reach a
 * turn (all Stopped) — there is no unit to decide for.
 */
export interface Decision {
  /** State advanced to the decision point (charges/crystal ticks already resolved). */
  state: BattleState;
  /** The living unit whose turn it is, or `null` on a stalemate. */
  unitId: string | null;
  /** `"stalemate"` when the field is fully stalled; otherwise `null`. */
  terminal: "stalemate" | null;
}

/**
 * Advance the shared timeline to the next living-unit turn, AUTO-RESOLVING any
 * charges (via {@link resolveCharge}) and KO crystal ticks (via {@link tickCrystal})
 * that come up first — exactly the loop {@link applyCommand} used to inline. Pure:
 * threads immutable states, never mutates the input. Returns the advanced state
 * plus the unit that must now decide, or a `"stalemate"` terminal when no actor can
 * reach a turn.
 *
 * IDEMPOTENT at a decision point: if `state` already sits at a ready living unit
 * (no charge outranks it), calling this advances zero ticks and re-surfaces the
 * same unit — so the harness can call it to inspect/evaluate, then hand the state
 * to {@link applyCommand} (which re-advances harmlessly to the same unit).
 *
 * This is the SINGLE primitive the interactive driver and the headless harness
 * share, so "who acts next" can never diverge between them.
 */
export function advanceToDecision(input: BattleState): Decision {
  let state = input;
  for (;;) {
    const { state: advanced, active } = advanceToNextTurn(state);
    state = advanced;
    if (!active) {
      // Fully stalled (all Stopped): no actor can reach a turn.
      return { state, unitId: null, terminal: "stalemate" };
    }
    if (active.kind === "charge") {
      state = resolveCharge(state, active.id).state;
      continue;
    }
    const unit = state.units.find((u) => u.id === active.id);
    if (!unit) throw new Error(`advanceToDecision: scheduler surfaced unknown unit ${active.id}`);
    if (unit.hp <= 0) {
      // A KO'd unit's turn ticks the crystal counter (docs/01 §11); no command.
      state = tickCrystal(state, active.id).state;
      continue;
    }
    return { state, unitId: active.id, terminal: null };
  }
}

/**
 * Advance to the next living-unit turn (auto-resolving any charges and crystal
 * ticks that come up first) and apply `command` to that unit, settling its turn.
 * Pure: threads immutable states, never mutates the input. Built on
 * {@link advanceToDecision} so the harness and interactive play can never diverge
 * on which unit is up.
 *
 * @throws if the field is fully stalled (no actor can reach a turn), since there
 *   is no unit to apply the command to.
 */
export function applyCommand(input: BattleState, command: Command): BattleState {
  const parsed = CommandSchema.parse(command);
  const { state, unitId, terminal } = advanceToDecision(input);
  if (terminal !== null || unitId === null) {
    throw new Error("applyCommand: field is stalled; no actor to apply the command to");
  }
  return applyToUnit(state, unitId, parsed);
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
    case "act": {
      const actor = state.units.find((u) => u.id === unitId)!;
      // GATE 1 — the ability must be equipped on the acting unit (loadout-derived,
      // Slice 4). Symmetric with `move` being gated by `moveRange`: an unequipped
      // or unknown ability is rejected, never silently resolved.
      const ability = actor.abilities.find((a) => a.id === command.abilityId);
      if (!ability) {
        throw new Error(`applyCommand: ${unitId} has no equipped ability ${command.abilityId}`);
      }

      // Resolve the target tile (a unit target contributes its CURRENT tile).
      const tgt = command.target;
      let targetUnitId: string | null = null;
      let targetTile: Position;
      if ("unitId" in tgt) {
        const tu = state.units.find((u) => u.id === tgt.unitId);
        if (!tu) {
          throw new Error(`applyCommand: ${command.abilityId} targets unknown unit ${tgt.unitId}`);
        }
        targetUnitId = tu.id;
        targetTile = { x: tu.pos.x, y: tu.pos.y };
      } else {
        targetTile = { x: tgt.x, y: tgt.y };
      }

      // GATE 2 — range (Chebyshev reach + height tolerance; strict LoS deferred,
      // ADR-0010 item 5). Rejecting an out-of-range act keeps replay legality a
      // pure function of (seed, commands).
      if (!inAbilityRange(state.grid, actor.pos, targetTile, ability.range)) {
        throw new Error(
          `applyCommand: ${command.abilityId} target (${targetTile.x},${targetTile.y}) is out of range for ${unitId}`,
        );
      }

      // DISPATCH by charge speed (docs/01 §3).
      if (ability.speed === null) {
        // INSTANT — resolve now. A basic weapon swing (formula "physical") delegates
        // to resolveAttack so its rolls are byte-identical to the pre-Slice-5 path;
        // every other instant reads its magnitude from the ability projection.
        if (!targetUnitId) {
          throw new Error(`applyCommand: instant ability ${command.abilityId} requires a unit target`);
        }
        const after =
          ability.formula === "physical"
            ? resolveAttack(state, unitId, targetUnitId).state
            : resolveAbility(state, unitId, targetUnitId, ability.id).state;
        return settleTurn(after, unitId, { didMove: false, didAct: true });
      }
      // CHARGED — enqueue via declareCharge, sourcing speed + effect from the
      // ability projection (not an inline command payload). declareCharge ends the
      // caster's turn (settles). The matured charge resolves via resolveCharge.
      return declareCharge(state, unitId, {
        targetTile,
        speed: ability.speed,
        effect: {
          kind: "magic",
          power: ability.power,
          element: ability.element,
          accuracy: ability.accuracy,
        },
      });
    }
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
