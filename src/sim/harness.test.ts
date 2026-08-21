/**
 * Benchmark-harness tests (docs/06 AC-E1, P2 Slice 2). Reads the shipped content
 * pack + the shipped skirmish encounter (test-layer IO; the sim stays pure) and
 * drives a full headless run.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { runEncounter, runEncounterDetailed, runFromState } from "./harness.js";
import { loadEncounter } from "./encounter.js";
import { replay, advanceToDecision } from "./driver.js";
import { loadContentPack, type ContentRegistry } from "./content.js";
import type { Condition } from "./condition.js";
import { defaultUnitRecord, type UnitRecord } from "./roster.js";
import {
  createBattleState,
  defaultUnit,
  legacyActiveStatus,
  serialize,
  type BattleState,
} from "./state.js";

function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return loadContentPack(raw);
}
const registry = loadShippedPack();

function skirmishDef(): unknown {
  const path = fileURLToPath(new URL("../../data/encounters/skirmish-a.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The ref records the shipped skirmish fixture names. */
const records: Record<string, UnitRecord> = {
  "knight-a": defaultUnitRecord("knight-a", "knight"),
  "knight-b": defaultUnitRecord("knight-b", "knight"),
  "monk-a": defaultUnitRecord("monk-a", "monk"),
  "monk-b": defaultUnitRecord("monk-b", "monk"),
};
const resolver = { registry, records };

describe("runEncounter — AC-E1: a named benchmark runs headlessly to a terminal outcome", () => {
  it("resolves the skirmish to a decisive objective (not a timeout) and logs usage", () => {
    const report = runEncounter(skirmishDef(), resolver);
    expect(["victory", "defeat", "draw"]).toContain(report.outcome);
    expect(report.outcome).not.toBe("ongoing");
    expect(report.turns).toBeGreaterThan(0);
    expect(report.turns).toBeLessThan(300); // ended by objective, not the turn cap
    // Both teams did SOMETHING with their basic attack (the only equipped action).
    expect(report.abilityUsage["basic.attack"]).toBeGreaterThan(0);
    // A decisive result leaves exactly one team standing, matching winningTeam.
    if (report.outcome !== "draw") {
      const alive = report.teams.filter((t) => t.survivors > 0);
      expect(alive).toHaveLength(1);
      expect(report.winningTeam).toBe(alive[0]!.teamId);
    }
    expect(report.teams.map((t) => t.teamId)).toEqual([0, 1]);
  });
});

describe("runEncounter — AC-E4/AC-S1: determinism", () => {
  it("the same (encounter, seed) yields an identical RunReport AND serialize-equal state", () => {
    const a = runEncounterDetailed(skirmishDef(), resolver);
    const b = runEncounterDetailed(skirmishDef(), resolver);
    expect(a.report).toEqual(b.report);
    expect(serialize(a.state)).toBe(serialize(b.state));
  });

  it("the AI consumes NO rng — replaying its issued log reproduces the state byte-for-byte", () => {
    const result = runEncounterDetailed(skirmishDef(), resolver);
    // Fresh load + the exact command log the AI issued, replayed WITHOUT the AI.
    // If the AI had drawn from the seed, its draws would have shifted every later
    // resolver roll and this would diverge. Equality proves it drew nothing.
    const fresh = loadEncounter(skirmishDef(), resolver);
    const bare = replay(fresh, result.commands);
    // THE claim, asserted where it is sharpest: the roll counter after the last command
    // already matches, before any reconstruction step can paper over a difference.
    expect(bare.rngCounter).toBe(result.report.finalRngCounter);
    // `replay` stops after the LAST command; `runFromState` leaves its terminal state one
    // `advanceToDecision` FURTHER on — the post-command advance during which it detected
    // the win condition, which still ticks crystal timers and matures charges (see the
    // `replay` docstring, and benchmark-suite.test.ts which reconstructs the same way).
    // This trailing advance was previously OMITTED here and the test passed anyway,
    // because on the pre-fold command sequence it happened to be a no-op — a fixture
    // accident, not a property. Teaching `ai.ts` the move+act fold shortened the battle
    // so that it is no longer a no-op, which exposed it. Reconstruct explicitly: this
    // compares MORE state than before, not less.
    const replayed = advanceToDecision(bare).state;
    expect(serialize(replayed)).toBe(serialize(result.state));
    expect(replayed.tick).toBe(result.report.finalTick);
  });
});

describe("contributionByUnit.landedActions — LANDED, not attempted", () => {
  const victory: Condition = { kind: "eliminateTeams", teams: [1] };
  const defeat: Condition = { kind: "eliminateTeams", teams: [0] };

  /** Two adjacent units; the defender's physical evasion is the dial. */
  function duel(defenderEv: number): BattleState {
    const a = defaultUnit("a", 0, { pos: { x: 0, y: 0 }, hp: 400, maxHp: 400 });
    const b = defaultUnit("b", 1, {
      pos: { x: 1, y: 0 },
      hp: 400,
      maxHp: 400,
      evasion: { classEv: defenderEv, weaponEv: defenderEv, shieldEv: defenderEv, accessoryEv: defenderEv, magicEv: defenderEv },
    });
    return createBattleState({ seed: 7, grid: { width: 2, height: 1 }, units: [a, b] });
  }

  // The campaign's AP grant reads this counter (campaign-run.ts), so "a unit that
  // swung and whiffed all battle" must score ZERO — otherwise the grant is a
  // participation trophy wearing the name of a contribution metric. A/B on the same
  // fixture with the one dial moved, so nothing else can explain the difference.
  it("a unit that swings and always misses scores 0; the same unit connecting scores > 0", () => {
    const missing = runFromState(duel(100), { victory, defeat, maxTurns: 8, maxTicks: 100000 });
    // Guard the guard: the attacker must actually have ATTACKED. A fixture where the AI
    // declined to swing would score 0 for the wrong reason and prove nothing.
    expect(missing.report.abilityUsage["basic.attack"]).toBeGreaterThan(0);
    expect(missing.report.contributionByUnit["a"]!.landedActions).toBe(0);
    expect(missing.report.contributionByUnit["a"]!.damageDealt).toBe(0);

    const landing = runFromState(duel(0), { victory, defeat, maxTurns: 8, maxTicks: 100000 });
    expect(landing.report.contributionByUnit["a"]!.landedActions).toBeGreaterThan(0);
  });
});

describe("runFromState — halting guarantees", () => {
  const victory: Condition = { kind: "eliminateTeams", teams: [1] };
  const defeat: Condition = { kind: "eliminateTeams", teams: [0] };

  it("a non-terminating field (two units that can never engage) ends as `timeout`", () => {
    // move 0, far apart, out of range → both Wait forever → the caps force a halt.
    const a = defaultUnit("a", 0, { pos: { x: 0, y: 0 }, move: 0, hp: 100, maxHp: 100 });
    const b = defaultUnit("b", 1, { pos: { x: 6, y: 0 }, move: 0, hp: 100, maxHp: 100 });
    const state = createBattleState({ seed: 1, grid: { width: 7, height: 1 }, units: [a, b] });
    const result = runFromState(state, { victory, defeat, maxTurns: 12, maxTicks: 100000 });
    expect(result.report.outcome).toBe("timeout");
    expect(result.report.turns).toBe(12);
    // Both survived the stall.
    expect(result.report.teams.every((t) => t.survivors === 1)).toBe(true);
  });

  it("a fully-Stopped field ends as `stalemate` (no actor can reach a turn)", () => {
    const a = defaultUnit("a", 0, { pos: { x: 0, y: 0 }, statuses: [legacyActiveStatus("stop")] });
    const b = defaultUnit("b", 1, { pos: { x: 2, y: 2 }, statuses: [legacyActiveStatus("stop")] });
    const state: BattleState = createBattleState({
      seed: 1,
      grid: { width: 3, height: 3 },
      units: [a, b],
    });
    const result = runFromState(state, { victory, defeat, maxTurns: 100, maxTicks: 1000 });
    expect(result.report.outcome).toBe("stalemate");
    expect(result.report.turns).toBe(0); // nobody ever acted
  });

  it("an objective already met at load ends immediately (turn zero)", () => {
    // team 1 starts eliminated → victory before any command.
    const a = defaultUnit("a", 0, { pos: { x: 0, y: 0 }, hp: 100, maxHp: 100 });
    const dead = defaultUnit("d", 1, { pos: { x: 1, y: 0 }, hp: 0, maxHp: 100 });
    const state = createBattleState({ seed: 1, grid: { width: 3, height: 1 }, units: [a, dead] });
    const result = runFromState(state, { victory, defeat, maxTurns: 100, maxTicks: 1000 });
    expect(result.report.outcome).toBe("victory");
    expect(result.report.winningTeam).toBe(0);
    expect(result.report.turns).toBe(0);
  });
});
