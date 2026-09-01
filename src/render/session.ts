/**
 * The interactive turn state machine (docs/10 §3) — DOM-FREE ON PURPOSE.
 *
 * This is the whole viewer/player contract in one testable object: no canvas, no
 * `document`, no listeners. `main.ts` is a thin adapter that maps pointer/key
 * events onto {@link Session} methods and paints the result, so the state machine
 * can be unit-tested headlessly (see `session.test.ts`).
 *
 * THE CONTROLLING PRINCIPLE (docs/10 §1): input is a COMMAND SOURCE. A human
 * clicking a tile and the balance probe choosing one are the same kind of event —
 * both produce exactly one {@link Command}, both go through `applyCommand`, both
 * land in the same replayable log. That is why this file contains no `settleTurn`
 * call and no bespoke step policy: `advanceToDecision` is the SINGLE "who acts
 * next" primitive, shared with the headless harness, so the two cannot diverge.
 *
 * THE DRAFT IS PURE UI INTENT. Staging a move, hovering a target and cancelling
 * touch NOTHING in the sim: no clone is applied, no roll is drawn, no tick moves.
 * Exactly ONE command is emitted per player turn, at COMMIT. That is what makes
 * cancel free, previews honest (AC-V6) and speculation impossible.
 *
 * THE SIM OWNS LEGALITY (docs/10 §1, AC-V7). Move tiles come from `moveRange`;
 * targets come from `inAbilityRange` + the unit's own `abilities` projection.
 * There is no radius or Manhattan test anywhere in this file. If a click passes
 * the viewer's check and `applyCommand` then throws, that is the viewer/sim fork
 * this design exists to prevent — {@link Session.commit} records it and RETHROWS
 * rather than swallowing it.
 */

import {
  accountEvents,
  advanceToDecisionDetailed,
  applyCommandDetailed,
  assembleReport,
  decideBalanceProbe,
  evalTerminal,
  moveRange,
  seedContributions,
  winningTeamOf,
  type BattleState,
  type AppliedCommand,
  type Command,
  type Outcome,
  type Position,
  type ResolutionEvent,
  type RunConfig,
  type RunReport,
  type UnitContribution,
  type UnitState,
} from "../sim/index.js";
import { PLAYER_TEAM, makeDemoBattle } from "./demo.js";
// TYPE ONLY, and that is the direction rule holding: the beat flows OUT of a commit into
// the page's animation layer and never back in. A value import would let a timing source
// reach the one file in `src/render` that emits commands.
import type { MotionBeat } from "./motion.js";
import {
  computeActPreview,
  targetOptions,
  turnCost,
  type ActPreview,
  type TargetOption,
  type TurnCost,
} from "./preview.js";

/** docs/10 §3's states, verbatim. */
export type Phase = "AWAIT_ACTOR" | "PLAYER_IDLE" | "MOVE_STAGED" | "AI_TURN" | "ENDED";

/**
 * PURE UI INTENT for the current player turn (docs/10 §3). Never applied to the
 * sim until commit, and discarded whole on cancel.
 *
 * `act` is part of the spec'd shape but is only ever populated for the instant
 * of a commit: selecting the target IS the confirm gesture, so there is no state
 * in which a draft sits around holding a chosen-but-uncommitted act. It is
 * exposed (rather than dropped) so `draft()` matches the documented shape.
 */
export interface TurnDraft {
  actorId: string;
  move: { to: Position } | null;
  act: { abilityId: string; target: { unitId: string } } | null;
}

/** A floating number/label the renderer shows over a tile after a commit. */
export interface Popup {
  pos: Position;
  text: string;
  kind: "damage" | "heal" | "miss";
}

/**
 * A {@link Session} may be built over ANY `BattleState`, not just the demo
 * battle — that is what lets `session.test.ts` drive purpose-built fixture grids
 * (an impassable tile inside a naive radius, a plateau step beyond `jump`) for
 * the discriminating legality assertions WITHOUT editing the demo map, whose
 * topology is load-bearing for every screenshot, the AI's paths and
 * `iso.test.ts`.
 */
export interface SessionOptions {
  /**
   * Factory for a fresh battle; defaults to the demo map. `reset()` re-invokes
   * it, and the result is cloned, so a factory that returns a captured object is
   * safe (the session never mutates the caller's state).
   */
  makeState?: () => BattleState;
  /** Which team accepts input (docs/10 §2). Defaults to {@link PLAYER_TEAM}. */
  playerTeam?: number;
  /**
   * The encounter's OBJECTIVES and halting caps. Supply them and the session stops
   * judging by team-wipe and judges by `evalTerminal` instead — the same call, with the
   * same fold around it, that `harness.ts` uses. Omit them (the demo battle carries no
   * conditions) and the wipe heuristic stands.
   *
   * This is not a cosmetic upgrade. A campaign encounter may be won by killing ONE
   * named foe or by surviving N ticks, and a viewer still counting corpses would leave
   * a player standing on a won battlefield with the banner unpainted — and hand the
   * campaign the wrong outcome to bank. `session.test.ts` discriminates on exactly
   * that: its fixture's victory is `defeatUnit`, where a team-wipe read gives the
   * opposite answer.
   */
  rules?: RunConfig;
}

/**
 * Banner prose for a RULED battle, one line per `Outcome`. It says "objective", never
 * "team is down", because an authored victory may be a single named foe or a survival
 * clock — wording it as a wipe would describe a rule the encounter does not use.
 * `"ongoing"` never reaches here (the caller returns first) but is present so the map
 * is total and a new outcome cannot silently render `undefined`.
 */
const OBJECTIVE_BANNER: Record<Outcome, string> = {
  victory: "Victory — the objective is complete",
  defeat: "Defeat — the battle is lost",
  draw: "Draw — both objectives fired on the same beat",
  timeout: "Timeout — the battle ran past its clock",
  stalemate: "Stalemate — no actor can reach a turn",
  ongoing: "The battle is still ongoing",
};

/** Why an interaction was refused — a transient chip, never a thrown error. */
type Reason = string | null;

export class Session {
  private readonly makeState: () => BattleState;
  readonly playerTeam: number;

  state: BattleState;
  phase: Phase = "AWAIT_ACTOR";
  activeUnitId: string | null = null;
  draft: TurnDraft | null = null;
  /** The recorded command log — AC-V9 replays `(state.seed, this.log)`. */
  private log: Command[] = [];
  /** Committed turns (one per command); the status line's "Turns". */
  turnCount = 0;
  /** Illegal-click feedback. Cleared by the next successful interaction. */
  reason: Reason = null;
  /** Set (and rethrown) if `applyCommand` ever rejects a click we allowed. */
  fatal: string | null = null;
  /** Floating damage/heal/miss labels from the most recent commit. */
  popups: Popup[] = [];
  /**
   * What the most recent commit DID, for the viewer's cosmetic catch-up (`motion.ts`).
   *
   * A fresh object per commit, so the page detects a new beat by identity. NOTHING in
   * this class ever reads it back: it is an outbound record, the sim never sees it, and
   * no animation can change how many commands have been applied.
   */
  beat: MotionBeat | null = null;
  /** Hovered/keyboard-focused tile — drives the preview only. */
  hover: Position | null = null;
  /** Keyboard tile cursor (arrow keys); starts on the active unit each turn. */
  cursor: Position | null = null;
  /** Terminal banner text once the battle is decided. */
  outcome: string | null = null;
  /**
   * The sim's verdict once the battle is decided (`null` while it is ongoing). Kept
   * beside {@link outcome} because the banner is PROSE and the campaign needs the
   * machine-readable answer — a UI string is not an `Outcome`.
   */
  verdict: { outcome: Outcome; winningTeam: number | null } | null = null;

  /** The encounter's objectives + caps, or `null` for a conditionless battle. */
  private readonly rules: RunConfig | null;
  /** Per-unit LANDED accounting, folded through the harness's own `accountEvents`. */
  private contributions: Record<string, UnitContribution> = {};
  /** Issued-command histogram, exactly as the harness records it. */
  private abilityUsage: Record<string, number> = {};
  /** chargeId → the abilityId that declared it, so a matured charge is credited. */
  private chargeLabels = new Map<string, string>();

  constructor(opts: SessionOptions = {}) {
    this.makeState = opts.makeState ?? makeDemoBattle;
    this.playerTeam = opts.playerTeam ?? PLAYER_TEAM;
    this.rules = opts.rules ?? null;
    this.state = this.makeState();
    this.reset();
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  reset(): void {
    this.state = structuredClone(this.makeState());
    this.phase = "AWAIT_ACTOR";
    this.activeUnitId = null;
    this.draft = null;
    this.log = [];
    this.turnCount = 0;
    this.reason = null;
    this.fatal = null;
    this.popups = [];
    this.beat = null;
    this.hover = null;
    this.cursor = null;
    this.outcome = null;
    this.verdict = null;
    this.contributions = seedContributions(this.state.units);
    this.abilityUsage = {};
    this.chargeLabels = new Map();
    this.settle();
  }

  /**
   * What the campaign is told happened — the SAME artifact the headless harness
   * produces, assembled from the same `harness.ts` helpers over the same tallies.
   * `null` when the session has no rules (a conditionless demo battle has no outcome
   * to report). While the battle is ongoing the report carries `outcome: "ongoing"`,
   * which `applyBattleResult` refuses loudly — banking an unfinished battle is a
   * caller bug and must not be silently accepted.
   *
   * WHY THIS IS NOT A SECOND ENGINE: `session.test.ts` A/Bs a probe-driven session
   * against `runFromState` over the same encounter and asserts the two reports are
   * byte-identical. A viewer that accounted its own way would pay a player differently
   * from the headless runner for the same battle, and both would look correct alone.
   */
  report(): RunReport | null {
    if (this.rules === null) return null;
    return assembleReport(this.state, {
      outcome: this.verdict?.outcome ?? "ongoing",
      winningTeam: this.verdict?.winningTeam ?? null,
      turns: this.turnCount,
      abilityUsage: { ...this.abilityUsage },
      contributionByUnit: structuredClone(this.contributions),
    });
  }

  /**
   * `AWAIT_ACTOR` → advance the shared timeline to the next DECISION POINT and
   * enter the state that actor's controller implies (docs/10 §3 row 1).
   *
   * The advanced state is KEPT as the viewer's state: `advanceToDecision` is
   * idempotent at a decision point, so the subsequent `applyCommand` re-advances
   * harmlessly to the same unit, and meanwhile the panel/timeline show the board
   * exactly as the actor sees it (CT already ≥ 100).
   */
  private settle(): void {
    this.draft = null;

    // WITHOUT rules only: a battle handed to us already decided must never have its
    // clock advanced. WITH rules the fold is the harness's, verbatim — advance,
    // account, THEN judge — and the pre-check is deliberately skipped, because a
    // charge maturing during the advance can turn a victory into a draw and the
    // campaign has to be told what the headless runner would have been told.
    if (this.rules === null && this.finishIfDecided()) return;

    const decision = advanceToDecisionDetailed(this.state, this.chargeLabels);
    this.state = decision.state;
    // Charges that matured during the advance, credited to their source — the same
    // call `runFromState` makes at the same point in its loop.
    accountEvents(this.contributions, decision.events);

    const stalled = decision.terminal !== null || decision.unitId === null;
    if (this.rules !== null) {
      // Harness order: objectives (and the halting caps) first, a genuine
      // no-progress end second. An objective that fires on a stalled field
      // outranks the stalemate, exactly as `runFromState` has it.
      if (this.finishIfDecided()) return;
      if (stalled) return void this.finishStalled();
    } else {
      if (stalled) return void this.finishStalled();
      // A KO can land DURING the advance — a charge maturing on the last survivor
      // is exactly that case — so re-check HERE. Checking only before the advance
      // would show the banner a full turn late and ask for a command in a battle
      // that is already over.
      if (this.finishIfDecided()) return;
    }

    this.activeUnitId = decision.unitId;
    this.cursor = this.actor() ? { ...this.actor()!.pos } : null;
    this.phase = this.isPlayerControlled(decision.unitId!) ? "PLAYER_IDLE" : "AI_TURN";
  }

  /** A fully-stalled field: nobody can reach a turn and no objective has fired. */
  private finishStalled(): void {
    this.phase = "ENDED";
    this.activeUnitId = null;
    this.verdict = { outcome: "stalemate", winningTeam: winningTeamOf(this.state) };
    this.outcome = "Stalemate — no actor can reach a turn";
  }

  /**
   * Enter `ENDED` with a banner if the battle is decided.
   *
   * WITH rules this is `evalTerminal` — the sim's own verdict against the encounter's
   * authored objectives and caps. WITHOUT them it is the team-wipe read below, which is
   * all a conditionless demo battle can honestly support.
   */
  private finishIfDecided(): boolean {
    const verdict = this.rules
      ? evalTerminal(this.state, this.rules.victory, this.rules.defeat, {
          turns: this.turnCount,
          ticks: this.state.tick,
          maxTurns: this.rules.maxTurns,
          maxTicks: this.rules.maxTicks,
        })
      : this.wipeVerdict();
    if (verdict === null || verdict.outcome === "ongoing") return false;
    this.phase = "ENDED";
    this.activeUnitId = null;
    this.verdict = { outcome: verdict.outcome, winningTeam: verdict.winningTeam };
    this.outcome = this.rules
      ? OBJECTIVE_BANNER[verdict.outcome]
      : // The conditionless read can only ever say who is still standing, so its
        // wording names exactly that and nothing more.
        verdict.outcome === "victory"
        ? "Victory — enemy team is down"
        : "Defeat — your team is down";
    return true;
  }

  /**
   * The team-wipe read, as a verdict. A render-level read of `BattleState` (nobody
   * left to act), NOT a sim verdict: a demo battle carries no victory `Condition`, and
   * inventing one here would be the viewer asserting a rule the sim does not model.
   * `evalTerminal` takes over the moment {@link SessionOptions.rules} are supplied.
   */
  private wipeVerdict(): { outcome: Outcome; winningTeam: number | null } | null {
    const wiped = this.wipedTeam();
    if (wiped === null) return null;
    return wiped === this.playerTeam
      ? { outcome: "defeat", winningTeam: null }
      : { outcome: "victory", winningTeam: this.playerTeam };
  }

  private wipedTeam(): number | null {
    const teams = [...new Set(this.state.units.map((u) => u.teamId))].sort((a, b) => a - b);
    if (teams.length < 2) return null;
    for (const t of teams) {
      if (!this.state.units.some((u) => u.teamId === t && u.hp > 0)) return t;
    }
    return null;
  }

  private isPlayerControlled(unitId: string): boolean {
    const u = this.state.units.find((x) => x.id === unitId);
    return u !== undefined && u.teamId === this.playerTeam;
  }

  // ─── reads the renderer needs ─────────────────────────────────────────────

  actor(): UnitState | undefined {
    return this.activeUnitId === null
      ? undefined
      : this.state.units.find((u) => u.id === this.activeUnitId);
  }

  /** True while input is accepted (docs/10 §3: AI turns are inert). */
  private accepting(): boolean {
    return this.phase === "PLAYER_IDLE" || this.phase === "MOVE_STAGED";
  }

  /** The tile the act would resolve from: the STAGED tile when one is staged. */
  actFrom(): Position | null {
    const a = this.actor();
    if (!a) return null;
    return this.draft?.move ? this.draft.move.to : { ...a.pos };
  }

  stagedTile(): Position | null {
    return this.draft?.move ? { ...this.draft.move.to } : null;
  }

  /** Legal move destinations — straight from `moveRange` (AC-V7). */
  moveTiles(): Position[] {
    const a = this.actor();
    if (!a || !this.accepting()) return [];
    return moveRange(this.state.grid, this.state.units, a.id);
  }

  /** Legal act targets from the staged position — straight from the sim. */
  targets(): TargetOption[] {
    const from = this.actFrom();
    if (!from || !this.accepting() || this.activeUnitId === null) return [];
    return targetOptions(this.state, this.activeUnitId, from);
  }

  targetTiles(): Position[] {
    return this.targets().map((t) => ({ ...t.unit.pos }));
  }

  /** The command log, in order — `replay(seed, commands)` reproduces the run. */
  commands(): Command[] {
    return this.log.map((c) => structuredClone(c));
  }

  // ─── the transparency payload (docs/10 §4) ────────────────────────────────

  /**
   * The full preview for the currently hovered/focused target, or `null` when
   * nothing targetable is under the cursor. PURE — see `preview.ts`'s header.
   */
  preview(): ActPreview | null {
    const from = this.actFrom();
    if (!from || !this.accepting() || this.activeUnitId === null || !this.hover) return null;
    const option = this.targets().find(
      (t) => t.unit.pos.x === this.hover!.x && t.unit.pos.y === this.hover!.y,
    );
    if (!option) return null;
    const moved = this.draft?.move != null;
    return computeActPreview(this.state, this.activeUnitId, from, moved, option);
  }

  /** The CT price of ending the turn right now (no act) — the End Turn label. */
  endTurnCost(): TurnCost | null {
    if (!this.accepting() || this.activeUnitId === null) return null;
    return turnCost(this.state, this.activeUnitId, {
      didMove: this.draft?.move != null,
      didAct: false,
    });
  }

  /**
   * Button label that STATES THE PRICE IT WILL PAY (docs/10 §3), in plain words.
   *
   * It used to read "−60 CT". `docs/10` §3's rule is that the button names its cost, and
   * it still does — but "CT" is engine vocabulary, and a learnability walkthrough found
   * it on the two controls a new player looks at most with nothing to associate it with
   * (finding 4). Naming the CONSEQUENCE — you act again sooner — is the same fact in
   * words a first-time player already has. The exact tick figures stay one hover away.
   */
  endTurnLabel(): string {
    const cost = this.endTurnCost();
    if (!cost) return "End Turn";
    return cost.didMove
      ? "End Turn · moved only · act again sooner"
      : "End Turn · waited · act again soonest";
  }

  // ─── input ────────────────────────────────────────────────────────────────

  onTileHover(p: Position | null): void {
    this.hover = p ? { x: p.x, y: p.y } : null;
  }

  /**
   * Move the keyboard tile cursor. It drives the SAME preview a mouse hover
   * does, so the transparency set is never mouse-only (docs/04 §7). Clamped to
   * the grid; touches neither the draft nor the sim.
   */
  moveCursor(dx: number, dy: number): void {
    const { width, height } = this.state.grid;
    const cur = this.cursor ?? this.actor()?.pos ?? { x: 0, y: 0 };
    const next = {
      x: Math.min(width - 1, Math.max(0, cur.x + dx)),
      y: Math.min(height - 1, Math.max(0, cur.y + dy)),
    };
    this.cursor = next;
    this.onTileHover(next);
  }

  /**
   * THE ONE TILE-DRIVEN MUTATOR. Every picking path — a real `pointerdown`
   * (`onPick(pickTile(...))`), the keyboard Enter (`onPick(cursor)`), and both
   * test seams (`clickTile(x,y)` → `onPick({x,y})`, `clickCanvas` →
   * `onPick(pickTile(...))`) — bottoms out HERE. Nothing else may touch
   * {@link TurnDraft} from a tile pick, which is what makes the seam PROVABLY the
   * same code path as a real pointer event rather than parallel logic (docs/10 §7).
   *
   * `null` (a pick that hit no tile — off-board, or a height skirt no top face
   * covers) is a plain no-op: not an error, not a reason chip.
   *
   * Illegal ⇒ NO-OP plus a reason chip. Never a throw, never a state change,
   * never a consumed command (docs/10 §3).
   */
  onPick(p: Position | null): void {
    if (p === null) return;
    this.cursor = { x: p.x, y: p.y };
    if (!this.accepting()) {
      this.refuse(this.phase === "ENDED" ? "The battle is over" : "Not your turn");
      return;
    }
    const actor = this.actor();
    if (!actor) return;

    // Re-clicking the actor is one of the three CANCEL gestures (docs/10 §3).
    if (p.x === actor.pos.x && p.y === actor.pos.y) {
      this.cancel();
      return;
    }

    // A staged tile clicked again UNSTAGES it (docs/10 §3, MOVE_STAGED row).
    const staged = this.stagedTile();
    if (staged && p.x === staged.x && p.y === staged.y) {
      this.draft = null;
      this.phase = "PLAYER_IDLE";
      this.reason = null;
      return;
    }

    // A DOWNED unit still holds its tile: `moveRange` builds its occupancy map
    // from every unit regardless of `hp` (grid.ts), so the crystal really does
    // block the tile — but falling through to "Out of Move range" would name the
    // wrong rule over a tile that visibly holds a crystal. Say what is true.
    const body = this.state.units.find((u) => u.pos.x === p.x && u.pos.y === p.y);
    if (body && body.hp <= 0) {
      this.refuse("A crystal blocks that tile");
      return;
    }

    // A living unit on the tile ⇒ act if the SIM says it is a legal target.
    const occupant = this.state.units.find((u) => u.pos.x === p.x && u.pos.y === p.y && u.hp > 0);
    if (occupant) {
      const option = this.targets().find((t) => t.unit.id === occupant.id);
      if (!option) {
        this.refuse(
          occupant.teamId === actor.teamId ? "No action for that ally" : "Out of Ability range",
        );
        return;
      }
      this.commitAct(option);
      return;
    }

    // An empty tile ⇒ stage a move if `moveRange` contains it. NOTHING touches
    // the sim: staging is pure intent (AC-V6).
    if (this.moveTiles().some((t) => t.x === p.x && t.y === p.y)) {
      this.draft = { actorId: actor.id, move: { to: { x: p.x, y: p.y } }, act: null };
      this.phase = "MOVE_STAGED";
      this.reason = null;
      return;
    }

    this.refuse("Out of Move range");
  }

  /** Cancel (Esc / right-click / re-click the actor): total and FREE. */
  cancel(): void {
    if (!this.accepting()) return;
    this.draft = null;
    this.phase = "PLAYER_IDLE";
    this.reason = null;
  }

  /**
   * The explicit turn-ender for a turn with no act: `{kind:"move"}` when a move
   * is staged (−80), `{kind:"wait"}` on an empty draft (−60). docs/10 §3.
   */
  endTurn(): void {
    if (!this.accepting()) {
      this.refuse(this.phase === "ENDED" ? "The battle is over" : "Not your turn");
      return;
    }
    const move = this.draft?.move ?? null;
    this.commit(move ? { kind: "move", to: { x: move.to.x, y: move.to.y } } : { kind: "wait" });
  }

  /**
   * WATCH MODE (docs/10 §7, a shipped feature — not a test seam): resolve the
   * CURRENTLY ACTIVE unit through the balance probe, regardless of team, so a
   * fully scripted deterministic run still exists for the Playwright baseline —
   * and so an AI turn advances on an explicit, deterministic beat rather than a
   * wall-clock timer (nothing derived from wall-clock may reach `BattleState`).
   */
  step(): void {
    if (this.phase === "ENDED" || this.activeUnitId === null) {
      this.refuse("The battle is over");
      return;
    }
    this.draft = null;
    this.commit(decideBalanceProbe(this.state, this.activeUnitId));
  }

  // ─── commit ───────────────────────────────────────────────────────────────

  /**
   * Fold the staged move and the chosen target into ONE command (ADR-0015): a
   * staged move becomes `move:{to, order:"before"}` so the act resolves from the
   * DESTINATION tile and the whole turn settles ONCE at −100. `order:"after"`
   * exists in the schema but is deliberately not exposed in the UI this slice —
   * it would force choosing a retreat tile before seeing the outcome (ADR-0015
   * Consequences).
   */
  private commitAct(option: TargetOption): void {
    const actor = this.actor();
    if (!actor) return;
    const move = this.draft?.move ?? null;
    const act = { abilityId: option.ability.id, target: { unitId: option.unit.id } };
    // Populate the draft's `act` for the instant of the commit so the documented
    // TurnDraft shape is real rather than vestigial.
    this.draft = { actorId: actor.id, move, act };
    this.commit(
      move
        ? { kind: "act", ...act, move: { to: { x: move.to.x, y: move.to.y }, order: "before" } }
        : { kind: "act", ...act },
    );
  }

  /**
   * THE only place the sim is touched by player input. Applies exactly one
   * command, records it, then advances to the next decision point.
   */
  private commit(command: Command): void {
    const before = this.state;
    const actorId = this.activeUnitId;
    const chargesBefore = new Map(before.chargeQueue.map((c) => [c.id, { ...c.targetTile }]));

    // The ISSUED-command histogram, recorded BEFORE the command is applied and
    // regardless of whether it lands — same position, same semantics, as the
    // harness's loop. (`contributionByUnit` is the landed-outcome counter; these
    // two deliberately disagree on a miss.)
    if (command.kind === "act") {
      this.abilityUsage[command.abilityId] = (this.abilityUsage[command.abilityId] ?? 0) + 1;
    }

    let applied: AppliedCommand;
    try {
      applied = applyCommandDetailed(before, command);
    } catch (err) {
      // docs/10 §1: a click that passed our check but that the sim rejects is
      // the viewer/sim fork this design exists to prevent. Surface it loudly.
      this.fatal = `viewer/sim fork — the sim rejected a command the viewer allowed: ${String(err)}`;
      throw err;
    }

    // Account the command's own landed outcome, then any reaction it WOKE — each
    // credited to the reactor, never to the actor (ADR-0019). Order matches the
    // order the blows landed, and matches `runFromState` line for line.
    if (applied.event) accountEvents(this.contributions, [applied.event]);
    if (applied.reactionEvents.length > 0) {
      accountEvents(this.contributions, applied.reactionEvents);
    }
    if (applied.declaredChargeId !== null && command.kind === "act") {
      this.chargeLabels.set(applied.declaredChargeId, command.abilityId);
    }

    this.log.push(structuredClone(command));
    this.state = applied.state;
    this.turnCount += 1;
    this.draft = null;
    this.reason = null;
    this.hover = null;

    // Advance to the next decision point; charges may mature during it.
    this.settle();

    this.popups = transitionPopups(before, this.state, {
      actTile: instantActTile(before, actorId, command),
      resolvedChargeTiles: [...chargesBefore.entries()]
        .filter(([id]) => !this.state.chargeQueue.some((c) => c.id === id))
        .map(([, tile]) => tile),
    });

    // The animation record, built from the sim's OWN events plus the same HP diff the
    // popups come from — never re-derived. `applied.event` and `applied.reactionEvents`
    // were already in hand here and were being dropped after accounting; a counter's
    // striker is the REACTOR, and only these can say so.
    this.beat = this.makeBeat(before, [applied.event, ...applied.reactionEvents]);
  }

  /**
   * Fold one commit into a {@link MotionBeat}.
   *
   * Positions are read from the state AFTER the command, because that is where the
   * renderer draws each unit — a folded move+act attacker stands on its destination.
   */
  private makeBeat(before: BattleState, events: readonly (ResolutionEvent | null)[]): MotionBeat {
    const posOf = (id: string): Position | null => {
      const u = this.state.units.find((x) => x.id === id);
      return u ? { ...u.pos } : null;
    };
    const strikers: { unitId: string; pos: Position; landed: boolean }[] = [];
    for (const ev of events) {
      if (!ev) continue;
      const pos = posOf(ev.sourceUnitId);
      if (pos) strikers.push({ unitId: ev.sourceUnitId, pos, landed: ev.landed });
    }
    const wasHp = new Map(before.units.map((u) => [u.id, u.hp]));
    const impacts: { unitId: string; pos: Position; hpBefore: number; hpAfter: number }[] = [];
    for (const u of this.state.units) {
      const was = wasHp.get(u.id);
      if (was === undefined || was === u.hp) continue;
      impacts.push({ unitId: u.id, pos: { ...u.pos }, hpBefore: was, hpAfter: u.hp });
    }
    const next = this.activeUnitId;
    return {
      strikers,
      impacts,
      popupCount: this.popups.length,
      handoff:
        next === null || this.phase === "ENDED"
          ? null
          : { unitId: next, control: this.isPlayerControlled(next) ? "player" : "ai" },
    };
  }

  private refuse(message: string): void {
    this.reason = message;
  }
}

/**
 * The tile an INSTANT act aimed at, for the "MISS" label. `null` for move/wait
 * and for a CHARGE declaration — a charge has not resolved yet, so labelling its
 * target tile a miss would assert an outcome that has not happened.
 */
function instantActTile(
  before: BattleState,
  actorId: string | null,
  command: Command,
): Position | null {
  if (command.kind !== "act" || actorId === null) return null;
  const actor = before.units.find((u) => u.id === actorId);
  const ability = actor?.abilities.find((a) => a.id === command.abilityId);
  if (!ability || ability.speed !== null) return null;
  const target = command.target;
  if ("unitId" in target) {
    const t = before.units.find((u) => u.id === target.unitId);
    return t ? { ...t.pos } : null;
  }
  return { x: target.x, y: target.y };
}

/**
 * Floating labels for a committed transition, derived by DIFFING HP across it —
 * so the popup can only ever report a change the sim actually made (pillar 4).
 * A miss/whiff moves no HP, so it is labelled from the aim tile instead.
 */
function transitionPopups(
  before: BattleState,
  after: BattleState,
  aims: { actTile: Position | null; resolvedChargeTiles: Position[] },
): Popup[] {
  const prev = new Map(before.units.map((u) => [u.id, u.hp]));
  const popups: Popup[] = [];
  for (const u of after.units) {
    const was = prev.get(u.id);
    if (was === undefined || was === u.hp) continue;
    const delta = u.hp - was;
    popups.push({
      pos: { ...u.pos },
      text: delta < 0 ? `−${-delta}` : `+${delta}`,
      kind: delta < 0 ? "damage" : "heal",
    });
  }
  const covered = (p: Position): boolean => popups.some((q) => q.pos.x === p.x && q.pos.y === p.y);
  if (aims.actTile && !covered(aims.actTile)) {
    popups.push({ pos: aims.actTile, text: "MISS", kind: "miss" });
  }
  for (const tile of aims.resolvedChargeTiles) {
    if (!covered(tile)) popups.push({ pos: tile, text: "WHIFF", kind: "miss" });
  }
  return popups;
}
