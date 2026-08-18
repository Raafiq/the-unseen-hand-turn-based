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
 * ACTION ECONOMY (docs/01 §2): an Active Turn may use Move and Act each at most
 * once, IN EITHER ORDER. A `move`/`wait` command is the single-sub-phase turn; an
 * `act` command carries an OPTIONAL `move` clause ({@link Command}) that folds
 * both sub-phases into ONE command. Whatever the shape, one command settles the
 * turn EXACTLY ONCE — at −100 (move+act), −80 (one) or −60 (neither), docs/01
 * AC-02. Before the fold no command could reach the −100 case at all, so
 * `CT_COST_MOVE_AND_ACT` was unreachable dead code and a move-then-act turn cost
 * the same as either half: a fidelity regression against our own baseline.
 */

import { z } from "zod";
import { advanceToNextTurn, settleTurn } from "./scheduler.js";
import {
  resolveAttack,
  resolveAbility,
  resolveAbilityAoe,
  tickCrystal,
  type ReactionOutcome,
} from "./resolve.js";
import { declareCharge, resolveCharge } from "./charge.js";
import { moveRange, inAbilityRange } from "./grid.js";
import { effectiveTeamOf, isBasicAttack, PositionSchema, type BattleState, type Position } from "./state.js";

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
 *
 * An `act` may OPTIONALLY carry a `move` clause — the docs/01 §2 fold of both
 * sub-phases into one turn. `order` says which sub-phase runs first and is
 * REQUIRED inside the clause (never defaulted: which half runs first changes the
 * tile the act resolves from, so it is a decision, not a convenience). OMITTING
 * `move` leaves the act path byte-identical to the pre-fold engine — same gates,
 * same rolls, same roll-consumption order, same −80 settle.
 */
const MoveClauseSchema = z
  .object({
    /** Destination tile; validated against `moveRange` exactly as a `move` command is. */
    to: PositionSchema,
    /**
     * `"before"` — move, THEN act from the DESTINATION tile (range + facing are
     * read post-move: the classic close-and-strike / flank).
     * `"after"`  — act from the ORIGIN tile, THEN move (hit-and-retreat).
     */
    order: z.enum(["before", "after"]),
  })
  .strict();

export const CommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), to: PositionSchema }).strict(),
  z
    .object({
      kind: z.literal("act"),
      abilityId: z.string().min(1),
      target: z.union([PositionSchema, z.object({ unitId: z.string().min(1) }).strict()]),
      move: MoveClauseSchema.optional(),
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
 * A LANDED-outcome accounting record for one resolved action (docs/06 diversity
 * gate). Emitted by the instrumented driver ({@link applyCommandDetailed} for an
 * instant act, {@link advanceToDecisionDetailed} for a matured charge) and folded
 * into `RunReport.contributionByUnit` by the harness. This is PURE accounting over
 * the already-seeded resolution outcomes — it introduces NO new randomness and no
 * new state; it only reads what the resolvers already computed.
 *
 * `landed` is the honesty linchpin: it is true ONLY when the action CONNECTED with
 * ≥ 1 target — a hit / heal that moved HP, OR a status it actually applied. A miss, an
 * empty-box whiff, or a cancelled charge is `landed:false` and contributes 0 — so the
 * diversity gate keys on what a build actually DID, never on the commands it merely
 * issued.
 */
export interface ResolutionEvent {
  /** The unit CREDITED with the action (the caster — the charge source for a charge). */
  sourceUnitId: string;
  /** The issuing ability id; `""` for a matured charge with no recorded label. */
  abilityId: string;
  /** Landed damage dealt to foes (0 on a heal / miss / whiff / cancel). */
  damageDealt: number;
  /** Landed HP restored to allies (0 on damage / miss). */
  healingDone: number;
  /** Foes/units this action dropped to 0 HP. */
  kos: number;
  /**
   * Statuses this action newly applied to OTHER units (a refresh of one the target
   * already had is not counted — it adds no state). A control action deals no damage,
   * so without this a landed Charm/Stop would be indistinguishable from a whiff.
   */
  statusesInflicted: number;
  /**
   * Did the action connect with ≥ 1 target? (drives signature-landed counting). TRUE
   * for a 0-damage action that landed a STATUS — the discriminating case: judging
   * "landed" by HP movement alone made every pure-control build score 0 contribution
   * and 0 signature-landed, i.e. the diversity gate could never have credited one.
   */
  landed: boolean;
}

/**
 * The result of {@link applyCommandDetailed}: the settled state, the LANDED
 * accounting {@link ResolutionEvent} for the command (or `null` for move / wait /
 * a charge DECLARE, which lands nothing yet), and — when the command declared a
 * charge — the deterministic id of that charge, so the caller can remember the
 * abilityId to credit the charge's eventual maturity to.
 */
export interface AppliedCommand {
  state: BattleState;
  event: ResolutionEvent | null;
  /**
   * One event per reaction the command's blow WOKE (ADR-0019), each credited to the
   * REACTOR — never to the acting unit. Separate from `event` because a counter is a
   * different unit's contribution that happened inside this unit's turn, and folding
   * it into `event` would credit the attacker with the damage it just took.
   *
   * Empty on every command that woke none, which is all of them until a build equips
   * a live reaction. See {@link reactionEvents}.
   */
  reactionEvents: ResolutionEvent[];
  declaredChargeId: string | null;
}

/**
 * Turn the reactions a blow woke into LANDED accounting events, credited to each
 * REACTOR under its reaction ability's id.
 *
 * WHY THESE CANNOT COME FROM {@link hpDiffEvent}. A counter's damage lands on the
 * ATTACKER — which is the diff's own `sourceUnitId` — and the diff deliberately never
 * credits a unit for its own HP loss. So a live counter would change the fight and
 * still score ZERO everywhere the project measures contribution: the gate's `inBand`,
 * `signatureActionsLanded`, the whole diversity count. Building the event from the
 * resolver's own {@link ReactionOutcome} is what makes a counter countable, and it is
 * exact for the same reason the diff is: `damage` is HP actually removed, never
 * overkill.
 */
function reactionEvents(reactions: readonly ReactionOutcome[]): ResolutionEvent[] {
  return reactions.map((r) => ({
    sourceUnitId: r.reactorId,
    abilityId: r.abilityId,
    damageDealt: r.damage,
    healingDone: 0,
    kos: r.ko ? 1 : 0,
    statusesInflicted: 0,
    // A reaction that fired but MISSED landed nothing — same honesty rule as a missed
    // attack. Nullifying an incoming blow is not itself a landed contribution either:
    // it removes damage, it does not deal any.
    landed: r.damage > 0,
  }));
}

/**
 * Compute a LANDED {@link ResolutionEvent} by diffing per-unit HP across a single
 * resolution (`before` → `after`), crediting it to `sourceUnitId`. This is EXACT
 * HP-removed / HP-restored accounting — overkill beyond a unit's HP is NOT counted
 * (a killing blow contributes only the HP it actually removed), and a miss / whiff /
 * cancel (no HP change) yields `landed:false` and zero. Pure and order-independent
 * (the sums and the KO count do not depend on `units` array order). `abilityId`
 * labels the source action for signature counting.
 *
 * ATTRIBUTION ASSUMPTION: damage is attributed by TEAM — HP LOSS on a FOE of the
 * source is the source's damage; HP GAIN on an ALLY (incl. self) is the source's
 * healing. HP loss on a same-team unit OTHER than the source THROWS: that is the
 * mis-attribution tripwire for a future friendly-fire path — make the new mechanic
 * surface here and account itself, don't credit it to the caster.
 *
 * THE REACTION PATH DID EXACTLY THAT (ADR-0019). A counter's damage lands on the
 * SOURCE itself, which this diff leaves uncredited by design (self HP loss is not
 * "damage dealt"), so it never trips the tripwire and never mis-credits — but it also
 * means the diff CANNOT see a counter at all. Reactions therefore account themselves,
 * in {@link reactionEvents}, credited to the reactor. Self HP loss from a future
 * recoil stays deliberately uncounted here.
 *
 * EDGE: healing a full-HP ally moves no HP → the action is `landed:false` and
 * contributes 0 (an "overheal" is not a landed contribution). Likewise a 0-magnitude
 * hit removes no HP → not landed.
 */
function hpDiffEvent(
  before: BattleState,
  after: BattleState,
  sourceUnitId: string,
  abilityId: string,
): ResolutionEvent {
  const beforeById = new Map(before.units.map((u) => [u.id, u]));
  const src = beforeById.get(sourceUnitId);
  // EFFECTIVE team on BOTH sides (state.ts `effectiveTeamOf`): a CHARMED unit attacks
  // its own nominal teammates, and reading raw `teamId` here would trip the
  // friendly-fire tripwire below on a mechanic that is now modeled — while crediting
  // the charmer's side with nothing.
  const srcTeam = src === undefined ? undefined : effectiveTeamOf(src);
  let damageDealt = 0;
  let healingDone = 0;
  let kos = 0;
  let statusesInflicted = 0;
  for (const u of after.units) {
    const prev = beforeById.get(u.id);
    if (prev === undefined) continue;
    // NEW statuses on someone else — the LANDED signal for a 0-damage control action.
    // Counted by id against the pre-action set, so a REFRESH (same id, longer timer)
    // adds nothing: re-Stopping a Stopped foe is not a second landed action.
    if (u.id !== sourceUnitId && u.statuses.length > 0) {
      const had = new Set(prev.statuses.map((st) => st.id));
      for (const st of u.statuses) if (!had.has(st.id)) statusesInflicted += 1;
    }
    const delta = u.hp - prev.hp;
    if (delta === 0) continue;
    // Allegiance as it stood when the action was DECLARED (`prev`), not after it: an
    // action that both charms and damages would otherwise look like friendly fire the
    // instant its own charm flipped the target.
    const sameTeam = srcTeam !== undefined && effectiveTeamOf(prev) === srcTeam;
    const isSelf = u.id === sourceUnitId;
    if (delta < 0) {
      if (sameTeam && !isSelf) {
        // Only a future friendly-fire / reaction path can lower an ally's HP during
        // the source's action — surface it instead of mis-crediting the source.
        throw new Error(
          `hpDiffEvent: ${sourceUnitId}'s action lowered same-team ${u.id}'s HP ` +
            `(friendly-fire/reaction not modeled — attribution would be wrong)`,
        );
      }
      if (!isSelf) {
        damageDealt += -delta; // HP removed from a foe
        if (prev.hp > 0 && u.hp <= 0) kos += 1;
      }
      // self HP loss (future recoil): not "damage dealt", left uncredited by design.
    } else {
      // HP gain: healing of an ally (incl. self). A foe gaining HP is not this
      // source's doing (no such action today); it is ignored, not credited.
      if (sameTeam) healingDone += delta;
    }
  }
  return {
    sourceUnitId,
    abilityId,
    damageDealt,
    healingDone,
    kos,
    statusesInflicted,
    landed: damageDealt > 0 || healingDone > 0 || statusesInflicted > 0,
  };
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
 * As {@link advanceToDecision}, but ALSO emits a {@link ResolutionEvent} for every
 * charge that matures during the advance — the landed-outcome accounting the
 * benchmark harness folds into `contributionByUnit`. State evolution is
 * byte-identical to {@link advanceToDecision} (same primitives, same order); the
 * events are pure side information. `chargeLabels` maps a charge id to the ability
 * that declared it (the caller records this when a charge is declared), so a
 * matured charge is credited to its ORIGINAL ability for signature counting.
 */
export function advanceToDecisionDetailed(
  input: BattleState,
  chargeLabels: ReadonlyMap<string, string>,
): Decision & { events: ResolutionEvent[] } {
  let state = input;
  const events: ResolutionEvent[] = [];
  for (;;) {
    const { state: advanced, active } = advanceToNextTurn(state);
    state = advanced;
    if (!active) {
      return { state, unitId: null, terminal: "stalemate", events };
    }
    if (active.kind === "charge") {
      const { state: after, outcome } = resolveCharge(state, active.id);
      // HP-diff accounting, credited to the charge's SOURCE unit and labelled with
      // the ability that declared it. A cancel / whiff / miss changes no HP ⇒ 0.
      events.push(hpDiffEvent(state, after, outcome.sourceUnitId, chargeLabels.get(active.id) ?? ""));
      state = after;
      continue;
    }
    const unit = state.units.find((u) => u.id === active.id);
    if (!unit) throw new Error(`advanceToDecisionDetailed: scheduler surfaced unknown unit ${active.id}`);
    if (unit.hp <= 0) {
      state = tickCrystal(state, active.id).state;
      continue;
    }
    return { state, unitId: active.id, terminal: null, events };
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
  return applyCommandDetailed(input, command).state;
}

/**
 * As {@link applyCommand}, but returns the LANDED accounting {@link ResolutionEvent}
 * for the command (or `null` for move / wait / a charge DECLARE) plus the
 * `declaredChargeId` when the command begins a charge — the instrumentation the
 * benchmark harness folds into `contributionByUnit`. The state result is identical
 * to {@link applyCommand}. NOTE: any charge that matures during the internal
 * advance-to-decision is NOT accounted here — the harness advances (and accounts
 * charges) via {@link advanceToDecisionDetailed} first, so this call is already AT a
 * decision point and its advance is a no-op.
 */
export function applyCommandDetailed(input: BattleState, command: Command): AppliedCommand {
  const parsed = CommandSchema.parse(command);
  const { state, unitId, terminal } = advanceToDecision(input);
  if (terminal !== null || unitId === null) {
    throw new Error("applyCommand: field is stalled; no actor to apply the command to");
  }
  return applyToUnit(state, unitId, parsed);
}

/**
 * Apply the MOVE sub-phase: validate `to` against the unit's `moveRange` and
 * relocate it, logging the step. Does NOT settle — the caller owns the turn (a
 * standalone `move` command settles −80; a folded move+act settles −100 ONCE).
 * Pure: clones, returns a new state. Consumes no RNG (movement is not random).
 *
 * This is the SAME gate for a standalone move and for a folded one, so the fold
 * can never silently relax legality: an unreachable destination throws here
 * either way.
 */
function applyMoveSubPhase(state: BattleState, unitId: string, to: Position): BattleState {
  const legal = moveRange(state.grid, state.units, unitId);
  if (!legal.some((p) => p.x === to.x && p.y === to.y)) {
    throw new Error(`applyCommand: illegal move for ${unitId} to (${to.x},${to.y})`);
  }
  const next = structuredClone(state);
  const unit = next.units.find((u) => u.id === unitId)!;
  unit.pos = { x: to.x, y: to.y };
  next.turnLog.push({ tick: next.tick, unitId, action: `move ${to.x},${to.y}` });
  return next;
}

/**
 * Apply one command to the (living) unit whose turn it is, settle EXACTLY ONCE,
 * and return the settled state alongside the LANDED {@link ResolutionEvent} (a
 * pure read of the resolver's outcome) and any `declaredChargeId`.
 *
 * The `act` case is the docs/01 §2 action-economy fold. With NO `move` clause it
 * is the pre-fold path unchanged (same gates in the same order, same single roll,
 * same −80 settle). With one:
 *   - `"before"` → move, then EVERY downstream read (range gate, facing/arc, AoE
 *     box, charge declaration) uses the DESTINATION tile;
 *   - `"after"`  → the act resolves from the ORIGIN tile, then the move is applied
 *     to the POST-act board (so a body the act just dropped still blocks, exactly
 *     as it would for a separate move command issued afterwards).
 * Either way there is ONE {@link settleTurn} at the bottom, priced −100.
 */
function applyToUnit(state: BattleState, unitId: string, command: Command): AppliedCommand {
  switch (command.kind) {
    case "move":
      return {
        state: settleTurn(applyMoveSubPhase(state, unitId, command.to), unitId, {
          didMove: true,
          didAct: false,
        }),
        event: null,
        reactionEvents: [],
        declaredChargeId: null,
      };
    case "act": {
      const fold = command.move;
      const didMove = fold !== undefined;

      // GATE 1 — the ability must be equipped on the acting unit (loadout-derived,
      // Slice 4). Symmetric with `move` being gated by `moveRange`: an unequipped
      // or unknown ability is rejected, never silently resolved. Read from the
      // PRE-move state: a unit's loadout cannot change by walking, so this gate is
      // identical either side of the move and stays first for both shapes.
      const ability = state.units.find((u) => u.id === unitId)!.abilities.find(
        (a) => a.id === command.abilityId,
      );
      if (!ability) {
        throw new Error(`applyCommand: ${unitId} has no equipped ability ${command.abilityId}`);
      }
      // GATE 1b — a CHARGED ability LOCKS the other sub-phase (docs/01 §2/§3): the
      // cast ends the turn the instant it is declared, so there is no "after" half
      // left to move in. A move-BEFORE is legal (walk up, then begin the cast).
      if (ability.speed !== null && fold !== undefined && fold.order === "after") {
        throw new Error(
          `applyCommand: charged ability ${command.abilityId} locks the SUBSEQUENT move ` +
            `sub-phase; a move cannot follow the cast. Moving BEFORE it is legal — ` +
            `use order "before"`,
        );
      }

      // MOVE-BEFORE — relocate first; the act then resolves FROM THE DESTINATION.
      const from = fold !== undefined && fold.order === "before"
        ? applyMoveSubPhase(state, unitId, fold.to)
        : state;
      const actor = from.units.find((u) => u.id === unitId)!;

      // Resolve the target tile (a unit target contributes its CURRENT tile).
      const tgt = command.target;
      let targetUnitId: string | null = null;
      let targetTile: Position;
      if ("unitId" in tgt) {
        const tu = from.units.find((u) => u.id === tgt.unitId);
        if (!tu) {
          throw new Error(`applyCommand: ${command.abilityId} targets unknown unit ${tgt.unitId}`);
        }
        targetUnitId = tu.id;
        targetTile = { x: tu.pos.x, y: tu.pos.y };
      } else {
        targetTile = { x: tgt.x, y: tgt.y };
      }

      // GATE 2 — range (Chebyshev reach + height tolerance; strict LoS deferred,
      // ADR-0010 item 5). Measured from `actor.pos` — the DESTINATION for a
      // move-before fold, the ORIGIN otherwise. Rejecting an out-of-range act keeps
      // replay legality a pure function of (seed, commands); the fold never relaxes
      // it, it only changes WHICH tile the reach is measured from.
      if (!inAbilityRange(from.grid, actor.pos, targetTile, ability.range)) {
        throw new Error(
          `applyCommand: ${command.abilityId} target (${targetTile.x},${targetTile.y}) is out of range for ${unitId}`,
        );
      }

      // DISPATCH by charge speed (docs/01 §3). The landed event is computed by
      // diffing HP across the resolution ({@link hpDiffEvent}), so every instant path
      // accounts identically and exactly (no overkill, miss ⇒ 0).
      let after: BattleState;
      let event: ResolutionEvent | null = null;
      let reactions: ReactionOutcome[] = [];
      let declaredChargeId: string | null = null;
      if (ability.speed === null) {
        // INSTANT — resolve now.
        if (ability.aoe !== null) {
          // AREA — resolve every appropriate unit in the box around the aim TILE
          // (foes for damage, allies incl. self for heal — TARGETED, no friendly
          // fire). A tile target is legal for an area act, so the unit-target
          // requirement below is relaxed here.
          const aoe = resolveAbilityAoe(from, unitId, targetTile, ability.id);
          after = aoe.state;
          reactions = aoe.outcome.reactions;
        } else {
          // SINGLE-TARGET — ONLY the weapon-derived basic swing delegates to
          // resolveAttack (its magnitude comes from `weapon`, not from a projected
          // `power`); every other instant, physical included, reads its magnitude
          // from the ability projection. The discriminant is {@link isBasicAttack},
          // NOT `formula === "physical"`: that older test swept up every authored
          // physical skill, so `power` was projected and then discarded and six
          // shipped abilities dealt a plain weapon swing regardless of tuning.
          // Both branches draw exactly ONE hit roll, so the RNG cursor is unmoved
          // by the routing itself — only the magnitude changes.
          if (!targetUnitId) {
            throw new Error(`applyCommand: instant ability ${command.abilityId} requires a unit target`);
          }
          const single = isBasicAttack(ability)
            ? resolveAttack(from, unitId, targetUnitId)
            : resolveAbility(from, unitId, targetUnitId, ability.id);
          after = single.state;
          reactions = single.outcome.reactions;
        }
        event = hpDiffEvent(from, after, unitId, ability.id);
      } else {
        // CHARGED — enqueue via declareCharge, sourcing speed + effect from the
        // ability projection (not an inline command payload). declareCharge no
        // longer settles (it cannot know whether this turn also moved); the single
        // settle below prices the turn. The matured charge resolves via
        // resolveCharge — its landed outcome is accounted THEN
        // (advanceToDecisionDetailed), credited to this ability via declaredChargeId.
        const beforeIds = new Set(from.chargeQueue.map((c) => c.id));
        after = declareCharge(from, unitId, {
          targetTile,
          speed: ability.speed,
          effect: {
            kind: "magic",
            power: ability.power,
            element: ability.element,
            accuracy: ability.accuracy,
            aoe: ability.aoe,
            // Carried through the charge, not re-read at maturity: the charge outlives
            // this turn and its resolver is registry-free (ADR-0010/ADR-0011). Omitting
            // this would drop a charged ability's statuses at cast time, invisibly —
            // no SHIPPED charged ability inflicts anything today, so nothing would
            // have failed.
            inflicts: ability.inflicts,
          },
        });
        const declared = after.chargeQueue.find((c) => !beforeIds.has(c.id));
        declaredChargeId = declared ? declared.id : null;
      }

      // MOVE-AFTER — hit and retreat. Validated against the POST-act board.
      if (fold !== undefined && fold.order === "after") {
        after = applyMoveSubPhase(after, unitId, fold.to);
      }

      // THE single settle for this command: −100 when both sub-phases were used,
      // −80 for the act alone (docs/01 §1, AC-02).
      return {
        state: settleTurn(after, unitId, { didMove, didAct: true }),
        event,
        reactionEvents: reactionEvents(reactions),
        declaredChargeId,
      };
    }
    case "wait":
      return {
        state: settleTurn(state, unitId, { didMove: false, didAct: false }),
        event: null,
        reactionEvents: [],
        declaredChargeId: null,
      };
  }
}

/**
 * Fold a command log over the initial state — the canonical replay (AC-S1).
 *
 * Reproduces the state right after the LAST command's `applyCommand`. Note that a
 * harness loop (harness.ts) leaves its terminal state one `advanceToDecision` FURTHER
 * on — the post-command clock advance during which it detected the win/lose condition.
 * That trailing advance can still mutate state (mature/cancel a pending charge, tick
 * crystal timers), so to reconstruct a `runFromState` final state exactly, apply one
 * `advanceToDecision` after this replay (see benchmark-suite.test.ts).
 */
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
