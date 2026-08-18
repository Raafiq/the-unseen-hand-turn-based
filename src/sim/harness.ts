/**
 * Benchmark harness (docs/06 AC-E1, P2 Slice 2) — the headless loop that loads a
 * defined battle, drives BOTH teams with the balance-probe AI, and runs to a
 * terminal outcome. This is the instrument behind docs/06's runnable benchmark and
 * the eventual docs/00 build-diversity gate.
 *
 * The loop is a fold over the shared decision primitive:
 *   advanceToDecision → evalTerminal (BEFORE deciding) → decide → applyCommand.
 * Evaluating the terminal condition on the ADVANCED state (before a command is
 * chosen) is what lets a pre-decided battle (a team already eliminated) end at turn
 * zero, and the turn/tick caps GUARANTEE halting even for a non-terminating field.
 *
 * The {@link RunReport} is a HARNESS-OWNED artifact — it is NOT added to BattleState
 * or the turn log (saves stay lean). Telemetry is MINIMAL this slice (D1):
 * ability-usage is read from the commands the AI ISSUES (no resolver-outcome
 * refactor); damage-by-formula / statuses-landed are deferred to the diversity
 * slice. The report shape ships so those are additive later.
 *
 * PURE + deterministic: the AI draws no RNG, so the same (encounter, seed) yields a
 * byte-identical run — proved by replaying the issued command log against a fresh
 * load and getting a `serialize()`-equal final state.
 */

import {
  advanceToDecisionDetailed,
  applyCommandDetailed,
  type Command,
  type ResolutionEvent,
} from "./driver.js";
import { evalTerminal, winningTeamOf, type Condition, type Outcome } from "./condition.js";
import { decideBalanceProbe } from "./ai.js";
import { loadEncounter, parseEncounter, type EncounterResolver, type SlotAssignment } from "./encounter.js";
import type { BattleState } from "./state.js";

/** Per-team end-of-run summary (docs/06: survivors + aggregate HP remaining). */
export interface TeamReport {
  teamId: number;
  /** Units with `hp > 0` at the end. */
  survivors: number;
  /** Σhp / Σmaxhp for the team (0 when the team has no units). Reporting metric. */
  hpFraction: number;
}

/**
 * Per-unit LANDED contribution (docs/06 diversity gate, Slice 4). Unlike
 * {@link RunReport.abilityUsage} (which counts commands the AI ISSUED — a cancelled
 * charge still "counts"), this is accounted from the resolvers' actual outcomes, so
 * a whiff / miss / cancelled charge contributes 0. It is the honesty linchpin the
 * diversity gate keys on — never the issued-command histogram.
 */
export interface UnitContribution {
  /** Σ landed damage this unit dealt to foes. */
  damageDealt: number;
  /** Σ landed HP this unit restored to allies. */
  healingDone: number;
  /** Foes/units this unit dropped to 0 HP. */
  kos: number;
  /**
   * Σ statuses this unit newly applied to others (a refresh is not counted). The only
   * contribution a PURE-CONTROL build makes: without it a thief that charmed its way to
   * a win would be indistinguishable from one carried by its fillers.
   */
  statusesInflicted: number;
  /**
   * Landed actions whose abilityId starts with THIS unit's signature prefix (from
   * {@link RunOptions.signaturePrefixes}). 0 when no prefix is registered for the
   * unit — so a masked build whose signature never lands scores 0 here even if it
   * "won", and the gate does not credit its archetype.
   */
  signatureActionsLanded: number;
}

/**
 * The harness artifact for one run. Captures enough to feed the diversity metric
 * without foreclosing it, plus a determinism anchor (`finalSeed`/`finalRngCounter`/
 * `finalTick`) so two runs can be compared cheaply.
 */
export interface RunReport {
  outcome: Outcome;
  winningTeam: number | null;
  /** Living-unit decisions taken. */
  turns: number;
  /** Battle clock at the end (`state.tick`). */
  ticks: number;
  teams: TeamReport[];
  /** Issued-command histogram: abilityId → times an `act` named it (D1 telemetry). */
  abilityUsage: Record<string, number>;
  /**
   * Per-unit LANDED accounting (Slice 4), keyed by unit id. EVERY unit present at
   * load has an entry (zeros if it never landed anything), so the gate can read a
   * candidate's contribution without a presence check. Deterministic: a pure fold
   * over the seeded resolution outcomes.
   */
  contributionByUnit: Record<string, UnitContribution>;
  finalSeed: number;
  finalRngCounter: number;
  finalTick: number;
}

/** A run's report PLUS the final state and the exact command log the AI issued. */
export interface RunResult {
  report: RunReport;
  state: BattleState;
  /**
   * The commands applied, in order. Replaying them reproduces `state` UP TO the
   * loop's final `advanceToDecision` — the post-command clock advance on which the
   * terminal condition was detected. When that advance still mutates state (a pending
   * charge maturing/cancelling, crystal timers ticking — e.g. a summon in flight when
   * a team is wiped), `replay(commands)` lands one advance short of `state`; apply a
   * single `advanceToDecision` after replaying to reconstruct it exactly.
   */
  commands: Command[];
}

/** The objectives + halting caps a run is judged against. */
export interface RunConfig {
  victory: Condition;
  defeat: Condition;
  maxTurns: number;
  maxTicks: number;
}

export interface RunOptions {
  /**
   * The decision policy. Default: {@link decideBalanceProbe}. Tests inject a scripted
   * decider to prove the loop consumes RNG only through the resolvers (the AI adds
   * none). MUST be pure and RNG-free to preserve determinism.
   */
  decide?: (state: BattleState, unitId: string) => Command;
  /** Override the encounter's caps (tests force a tiny cap to hit `timeout` fast). */
  maxTurns?: number;
  maxTicks?: number;
  /**
   * unitId → the ability-id prefix that is that unit's SIGNATURE skillset. A landed
   * action whose abilityId starts with its unit's prefix increments that unit's
   * `contributionByUnit.signatureActionsLanded`. The gauntlet supplies the
   * candidate's prefix here so the diversity gate can tell a build fighting as its
   * archetype from a masked brawler. Units with no registered prefix score 0.
   */
  signaturePrefixes?: Record<string, string>;
}

/** Per-team survivors + HP fraction over the final state (teams sorted by id asc). */
function teamReports(state: BattleState): TeamReport[] {
  const teamIds = [...new Set(state.units.map((u) => u.teamId))].sort((a, b) => a - b);
  return teamIds.map((teamId) => {
    let survivors = 0;
    let hp = 0;
    let maxHp = 0;
    for (const u of state.units) {
      if (u.teamId !== teamId) continue;
      maxHp += u.maxHp;
      hp += Math.max(0, u.hp);
      if (u.hp > 0) survivors += 1;
    }
    return { teamId, survivors, hpFraction: maxHp > 0 ? hp / maxHp : 0 };
  });
}

/**
 * Run a battle from an already-built {@link BattleState} to a terminal outcome. The
 * core loop, factored out of {@link runEncounter} so it can be driven from any state
 * (a stalemate/stopped field, a mid-battle snapshot) in tests.
 */
export function runFromState(
  initial: BattleState,
  config: RunConfig,
  opts: RunOptions = {},
): RunResult {
  const decide = opts.decide ?? decideBalanceProbe;
  const signaturePrefixes = opts.signaturePrefixes ?? {};
  let state = initial;
  const commands: Command[] = [];
  const abilityUsage: Record<string, number> = {};
  // Per-unit LANDED accounting. Seed an entry for every unit present at load so the
  // report always has a complete, presence-check-free contribution map.
  const contributionByUnit: Record<string, UnitContribution> = {};
  for (const u of initial.units) {
    contributionByUnit[u.id] = { damageDealt: 0, healingDone: 0, kos: 0, statusesInflicted: 0, signatureActionsLanded: 0 };
  }
  // chargeId → the abilityId that declared it, so a matured charge is credited to
  // its original ability for signature counting. Filled as charges are declared.
  const chargeLabels = new Map<string, string>();

  const account = (events: readonly ResolutionEvent[]): void => {
    for (const e of events) {
      const c = (contributionByUnit[e.sourceUnitId] ??= {
        damageDealt: 0,
        healingDone: 0,
        kos: 0,
        statusesInflicted: 0,
        signatureActionsLanded: 0,
      });
      c.damageDealt += e.damageDealt;
      c.healingDone += e.healingDone;
      c.kos += e.kos;
      c.statusesInflicted += e.statusesInflicted;
      const prefix = signaturePrefixes[e.sourceUnitId];
      if (e.landed && prefix !== undefined && prefix !== "" && e.abilityId.startsWith(prefix)) {
        c.signatureActionsLanded += 1;
      }
    }
  };

  let turns = 0;
  let outcome: Outcome = "ongoing";
  let winningTeam: number | null = null;

  for (;;) {
    const dec = advanceToDecisionDetailed(state, chargeLabels);
    state = dec.state;
    // Account charges that matured during the advance (credited to their source).
    account(dec.events);

    // Terminal check BEFORE deciding: an objective (or the cap) can end the battle
    // on the advanced state without spending a command.
    const verdict = evalTerminal(state, config.victory, config.defeat, {
      turns,
      ticks: state.tick,
      maxTurns: config.maxTurns,
      maxTicks: config.maxTicks,
    });
    if (verdict.outcome !== "ongoing") {
      outcome = verdict.outcome;
      winningTeam = verdict.winningTeam;
      break;
    }
    // A fully-stalled field (all Stopped) has no actor to decide for. Objectives
    // were checked first, so a stalemate here is a genuine no-progress end.
    if (dec.terminal === "stalemate" || dec.unitId === null) {
      outcome = "stalemate";
      winningTeam = winningTeamOf(state);
      break;
    }

    const command = decide(state, dec.unitId);
    commands.push(command);
    if (command.kind === "act") {
      abilityUsage[command.abilityId] = (abilityUsage[command.abilityId] ?? 0) + 1;
    }
    // applyCommandDetailed re-advances (harmlessly, 0 ticks, no charges) to this same
    // unit, applies, and surfaces the command's landed outcome for accounting.
    const applied = applyCommandDetailed(state, command);
    state = applied.state;
    if (applied.event) account([applied.event]);
    // Reactions the command WOKE, each credited to the reactor, not to the actor
    // (ADR-0019). Accounted after the actor's own event so the contribution order
    // matches the order the blows landed.
    if (applied.reactionEvents.length > 0) account(applied.reactionEvents);
    if (applied.declaredChargeId !== null && command.kind === "act") {
      chargeLabels.set(applied.declaredChargeId, command.abilityId);
    }
    turns += 1;
  }

  const report: RunReport = {
    outcome,
    winningTeam,
    turns,
    ticks: state.tick,
    teams: teamReports(state),
    abilityUsage,
    contributionByUnit,
    finalSeed: state.seed,
    finalRngCounter: state.rngCounter,
    finalTick: state.tick,
  };
  return { report, state, commands };
}

/**
 * Load an encounter and run it to a terminal outcome — the full benchmark entry
 * point. Returns the {@link RunReport} (the clean public artifact); use
 * {@link runEncounterDetailed} when the final state / command log is also needed.
 */
export function runEncounter(
  def: unknown,
  resolver: EncounterResolver,
  buildAssignment?: SlotAssignment,
  opts: RunOptions = {},
): RunReport {
  return runEncounterDetailed(def, resolver, buildAssignment, opts).report;
}

/** As {@link runEncounter}, but returns the report, final state, and command log. */
export function runEncounterDetailed(
  def: unknown,
  resolver: EncounterResolver,
  buildAssignment?: SlotAssignment,
  opts: RunOptions = {},
): RunResult {
  const enc = parseEncounter(def);
  const initial = loadEncounter(enc, resolver, buildAssignment);
  return runFromState(
    initial,
    {
      victory: enc.victory,
      defeat: enc.defeat,
      maxTurns: opts.maxTurns ?? enc.maxTurns,
      maxTicks: opts.maxTicks ?? enc.maxTicks,
    },
    opts,
  );
}
