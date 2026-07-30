import { describe, it, expect } from "vitest";
import { applyCommand, replay, replaySteps, type Command } from "./driver.js";
import {
  createBattleState,
  defaultUnit,
  serialize,
  type BattleState,
  type ChargeEffect,
} from "./state.js";

const MAGIC: ChargeEffect = { kind: "magic", power: 8, element: "none", accuracy: 100 };

/**
 * Two active units (a, b) plus a STOPPED, high-HP "dummy" that never takes a
 * turn — so every command is consumed by a or b, and `attack dummy` / a charge
 * aimed at the dummy's tile are always legal (dummy is never the actor, never
 * dies). Deterministic by construction: no command's legality depends on WHICH
 * of a/b the scheduler picks.
 */
function harness(seed = 7): BattleState {
  const a = defaultUnit("a", 0, { pos: { x: 0, y: 0 }, speed: 10, hp: 500, maxHp: 500 });
  const b = defaultUnit("b", 0, { pos: { x: 4, y: 4 }, speed: 13, hp: 500, maxHp: 500 });
  const dummy = defaultUnit("dummy", 1, {
    pos: { x: 2, y: 2 },
    speed: 5,
    statuses: ["stop"],
    hp: 9999,
    maxHp: 9999,
  });
  return createBattleState({ seed, grid: { width: 5, height: 5 }, units: [a, b, dummy] });
}

const LOG: Command[] = [
  { kind: "wait" },
  { kind: "attack", targetId: "dummy" },
  { kind: "castCharge", targetTile: { x: 2, y: 2 }, speed: 20, effect: MAGIC },
  { kind: "attack", targetId: "dummy" },
  { kind: "wait" },
  { kind: "attack", targetId: "dummy" },
  { kind: "castCharge", targetTile: { x: 2, y: 2 }, speed: 20, effect: MAGIC },
  { kind: "wait" },
  { kind: "attack", targetId: "dummy" },
  { kind: "wait" },
  { kind: "attack", targetId: "dummy" },
  { kind: "wait" },
];

describe("replay equality — byte-identical at every step (AC-S1)", () => {
  it("two runs of the same (seed, command log) produce byte-identical state at every step", () => {
    const a = replaySteps(harness(), LOG);
    const b = replaySteps(harness(), LOG);
    expect(a).toHaveLength(LOG.length);
    for (let i = 0; i < a.length; i++) {
      expect(serialize(a[i]!)).toBe(serialize(b[i]!));
    }
  });

  it("replay(initial, log) equals the live fold (same function, deterministic)", () => {
    const live = replaySteps(harness(), LOG);
    const replayed = replay(harness(), LOG);
    expect(serialize(replayed)).toBe(serialize(live[live.length - 1]!));
  });

  it("does not mutate the initial state (the log, not the state, is the substrate)", () => {
    const initial = harness();
    const before = JSON.stringify(initial);
    replay(initial, LOG);
    expect(JSON.stringify(initial)).toBe(before);
  });
});

describe("driver auto-resolves charges on the shared timeline (AC-04 wiring)", () => {
  it("a declared charge matures and is resolved by the driver with no command of its own", () => {
    // Caster "c" acts; target "t" is stopped (stays on its tile, never acts).
    const c = defaultUnit("c", 0, { pos: { x: 0, y: 0 }, speed: 10 });
    const t = defaultUnit("t", 1, { pos: { x: 1, y: 0 }, statuses: ["stop"], hp: 300, maxHp: 300, faith: 100 });
    const state = createBattleState({ seed: 3, grid: { width: 5, height: 5 }, units: [c, t] });

    const log: Command[] = [
      { kind: "castCharge", targetTile: { x: 1, y: 0 }, speed: 20, effect: { kind: "magic", power: 10, element: "none", accuracy: 100 } },
      { kind: "wait" },
      { kind: "wait" },
      { kind: "wait" },
    ];
    const final = replay(state, log);

    expect(final.chargeQueue).toHaveLength(0); // the charge matured and was dequeued
    expect(final.units.find((u) => u.id === "t")!.hp).toBeLessThan(300); // it landed
    expect(final.turnLog.some((e) => /charge \S+ (hit|KO) t/.test(e.action))).toBe(true);
  });
});

describe("rewind then replay (AC-S7)", () => {
  it("resuming from a mid-battle snapshot + the remaining commands == never rewinding", () => {
    const steps = replaySteps(harness(), LOG);
    const finalLive = steps[steps.length - 1]!;

    // "Rewind" to the state after K commands, then replay the rest onto it.
    const K = 5;
    const snapshot = steps[K - 1]!;
    const resumed = replay(snapshot, LOG.slice(K));

    expect(serialize(resumed)).toBe(serialize(finalLive));
  });

  it("rewinding to different points all converge on the same final state", () => {
    const steps = replaySteps(harness(), LOG);
    const finalLive = serialize(steps[steps.length - 1]!);
    for (const k of [1, 3, 7, 10]) {
      const resumed = replay(steps[k - 1]!, LOG.slice(k));
      expect(serialize(resumed)).toBe(finalLive);
    }
  });
});

describe("driver — move command + settlement", () => {
  it("applies a legal move, settles, and stays byte-reproducible", () => {
    // A lone unit: the scheduler always surfaces it, so `to` legality is fixed.
    const solo = defaultUnit("solo", 0, { pos: { x: 0, y: 0 }, speed: 10, move: 3 });
    const mk = (): BattleState => createBattleState({ seed: 1, grid: { width: 5, height: 5 }, units: [solo] });
    const log: Command[] = [
      { kind: "move", to: { x: 1, y: 0 } },
      { kind: "wait" },
      { kind: "move", to: { x: 1, y: 1 } },
    ];
    const final = replay(mk(), log);
    expect(final.units[0]?.pos).toEqual({ x: 1, y: 1 });
    expect(serialize(final)).toBe(serialize(replay(mk(), log)));
  });

  it("rejects an illegal move (out of range) rather than silently desyncing replay", () => {
    const solo = defaultUnit("solo", 0, { pos: { x: 0, y: 0 }, speed: 10, move: 2 });
    const s = createBattleState({ seed: 1, grid: { width: 8, height: 8 }, units: [solo] });
    expect(() => applyCommand(s, { kind: "move", to: { x: 7, y: 7 } })).toThrow();
  });
});
