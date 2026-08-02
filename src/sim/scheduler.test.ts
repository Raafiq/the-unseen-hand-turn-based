import { describe, it, expect } from "vitest";
import {
  advanceToNextTurn,
  ctRateOfUnit,
  settleTurn,
  type ActiveActor,
} from "./scheduler.js";
import {
  createBattleState,
  defaultUnit,
  legacyActiveStatus,
  PERMANENT_STATUS_CT,
  type BattleState,
  type UnitState,
} from "./state.js";

const unit = (id: string, teamId: number, over: Partial<UnitState> = {}): UnitState =>
  defaultUnit(id, teamId, { speed: 10, ...over });

function stateWith(units: UnitState[]): BattleState {
  // Place units on distinct tiles (positions must be unique); the scheduler
  // ignores position, so this only keeps the fixtures realistic.
  const placed = units.map((u, i) => ({ ...u, pos: { x: i % 4, y: Math.floor(i / 4) } }));
  return createBattleState({ seed: 1, grid: { width: 4, height: 4 }, units: placed });
}

/** Run `turns` active turns, each acting-only (cost 80), returning the id order. */
function runTurns(initial: BattleState, turns: number): string[] {
  let state = initial;
  const order: string[] = [];
  for (let i = 0; i < turns; i++) {
    const { state: advanced, active } = advanceToNextTurn(state);
    if (!active) break;
    order.push(active.id);
    state =
      active.kind === "unit"
        ? settleTurn(advanced, active.id, { didMove: false, didAct: true })
        : advanced;
  }
  return order;
}

describe("scheduler — CT accrual rate (AC-03, docs/01 §1)", () => {
  it("floors Speed × Haste/Slow (ctFactor), and Stop freezes accrual", () => {
    expect(ctRateOfUnit(unit("u", 0, { speed: 10 }))).toBe(10);
    expect(ctRateOfUnit(unit("u", 0, { speed: 10, statuses: [legacyActiveStatus("haste")] }))).toBe(15);
    expect(ctRateOfUnit(unit("u", 0, { speed: 10, statuses: [legacyActiveStatus("slow")] }))).toBe(5);
    expect(ctRateOfUnit(unit("u", 0, { speed: 7, statuses: [legacyActiveStatus("slow")] }))).toBe(3); // floor(3.5)
    expect(ctRateOfUnit(unit("u", 0, { speed: 10, statuses: [legacyActiveStatus("stop")] }))).toBe(0);
  });

  it("multiple ctFactors multiply, and Stop's 0 dominates the product", () => {
    // Haste and Slow are mutually exclusive in FFT; if a state carries both, the
    // product model gives 1.5×0.5 = 0.75 → floor(10×0.75) = 7 (a defensive
    // can't-happen case, not a balance rule). Stop's 0 zeroes any product.
    expect(ctRateOfUnit(unit("u", 0, { speed: 10, statuses: [legacyActiveStatus("haste"), legacyActiveStatus("slow")] }))).toBe(7);
    expect(
      ctRateOfUnit(unit("u", 0, { speed: 10, statuses: [legacyActiveStatus("haste"), legacyActiveStatus("slow"), legacyActiveStatus("stop")] })),
    ).toBe(0);
  });
});

describe("scheduler — turn order (AC-01)", () => {
  it("is deterministic and reproducible for a fixed set of speeds", () => {
    const mk = (): BattleState => stateWith([unit("slow", 0, { speed: 10 }), unit("fast", 1, { speed: 20 })]);
    const a = runTurns(mk(), 30);
    const b = runTurns(mk(), 30);
    expect(a).toEqual(b);
    const fast = a.filter((id) => id === "fast").length;
    const slow = a.filter((id) => id === "slow").length;
    expect(fast).toBeGreaterThan(slow); // 20-speed acts more often than 10-speed
  });

  it("does not mutate the input state (purity for rewind/replay)", () => {
    const s = stateWith([unit("a", 0, { speed: 27 })]);
    const before = JSON.stringify(s);
    advanceToNextTurn(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("scheduler — CT settlement (AC-02, docs/01 §1)", () => {
  it("acting at CT 108 carries 8 to the next turn", () => {
    const { state, active, ticksAdvanced } = advanceToNextTurn(stateWith([unit("a", 0, { speed: 27 })]));
    expect(ticksAdvanced).toBe(4); // 27,54,81,108
    expect(active).toEqual<ActiveActor>({ kind: "unit", id: "a" });
    const settled = settleTurn(state, "a", { didMove: true, didAct: true });
    expect(settled.units[0]?.ct).toBe(8); // 108 - 100
  });

  it("subtracts 100 / 80 / 60 for move+act / one / wait", () => {
    const base = stateWith([unit("a", 0, { ct: 100 })]);
    expect(settleTurn(base, "a", { didMove: true, didAct: true }).units[0]?.ct).toBe(0);
    expect(settleTurn(base, "a", { didMove: true, didAct: false }).units[0]?.ct).toBe(20);
    expect(settleTurn(base, "a", { didMove: false, didAct: false }).units[0]?.ct).toBe(40);
  });

  it("throws on an unknown unit", () => {
    expect(() => settleTurn(stateWith([unit("a", 0)]), "ghost", { didMove: false, didAct: false })).toThrow();
  });
});

describe("scheduler — Haste ratio (AC-03)", () => {
  it("a hasted unit takes roughly 3 turns for every 2 of a base-speed twin", () => {
    const s = stateWith([
      unit("hasted", 0, { speed: 10, statuses: [legacyActiveStatus("haste")] }),
      unit("base", 1, { speed: 10 }),
    ]);
    const order = runTurns(s, 500);
    const hasted = order.filter((id) => id === "hasted").length;
    const base = order.filter((id) => id === "base").length;
    const ratio = hasted / base;
    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(1.6);
  });
});

describe("scheduler — Stop and stalemate", () => {
  it("a stopped unit never accrues CT and never acts", () => {
    const s = stateWith([unit("stopped", 0, { statuses: [legacyActiveStatus("stop")] }), unit("mover", 1)]);
    const order = runTurns(s, 20);
    expect(order).not.toContain("stopped");
    expect(order.every((id) => id === "mover")).toBe(true);
  });

  it("a field where nothing can accrue reports a stalemate (active null)", () => {
    const { active } = advanceToNextTurn(stateWith([unit("stopped", 0, { statuses: [legacyActiveStatus("stop")] })]));
    expect(active).toBeNull();
  });
});

describe("scheduler — status decay (Slice 7, deterministic, no RNG)", () => {
  it("a FINITE status decays each tick and expires; a PERMANENT one persists", () => {
    // "a" carries a PERMANENT protect (ctFactor 1, never decays) plus a FINITE
    // haste (remainingCT 2). It reaches its turn many ticks later, by which point
    // the haste has long since decayed away but protect remains.
    const finiteHaste = legacyActiveStatus("haste", 2);
    const permProtect = legacyActiveStatus("protect"); // permanent by default
    const { state, active } = advanceToNextTurn(
      stateWith([unit("a", 0, { speed: 10, statuses: [permProtect, finiteHaste] })]),
    );
    expect(active).toEqual<ActiveActor>({ kind: "unit", id: "a" });
    const a = state.units.find((u) => u.id === "a")!;
    expect(a.statuses.map((st) => st.id)).toEqual(["protect"]); // haste expired, protect kept
    expect(a.statuses[0]!.remainingCT).toBe(PERMANENT_STATUS_CT); // permanent, undecayed
  });

  it("a FINITE Stop expires, so a lone Stopped unit is NOT a permanent stalemate", () => {
    // remainingCT 3: Stop decays 3→0 over the first 3 ticks (rate 0 while it lasts),
    // then the unit accrues at speed 10 and eventually takes its turn — proving
    // decay can un-Stop a unit (and that hasDecayingStatus keeps the clock running).
    const { active, state } = advanceToNextTurn(
      stateWith([unit("a", 0, { speed: 10, statuses: [legacyActiveStatus("stop", 3)] })]),
    );
    expect(active).toEqual<ActiveActor>({ kind: "unit", id: "a" });
    expect(state.units.find((u) => u.id === "a")!.statuses).toEqual([]); // Stop wore off
  });
});

describe("scheduler — pinned tie-break (AC-S3, docs/05 §1a)", () => {
  it("higher CT wins regardless of deploy index", () => {
    // a reaches 100, b reaches 105 on the same tick → b wins despite higher index.
    const { active } = advanceToNextTurn(
      stateWith([unit("a", 0, { ct: 90 }), unit("b", 1, { ct: 95 })]),
    );
    expect(active).toEqual<ActiveActor>({ kind: "unit", id: "b" });
  });

  it("on equal CT, the lower unitId wins regardless of array order", () => {
    // "u.z" is at array index 0 but "u.a" is the lower id → "u.a" must win.
    // Keying on id (not index) is what makes this hold; see docs/05 §1a, ADR-0008.
    const { active } = advanceToNextTurn(
      stateWith([unit("u.z", 0, { ct: 95 }), unit("u.a", 1, { ct: 95 })]),
    );
    expect(active).toEqual<ActiveActor>({ kind: "unit", id: "u.a" });
  });

  it("on equal CT, a charged action resolves before a unit", () => {
    const s = stateWith([unit("caster", 0, { ct: 95 })]);
    s.chargeQueue.push({
      id: "spell",
      sourceUnitId: "caster",
      ct: 95,
      speed: 10,
      targetTile: { x: 0, y: 0 },
      effect: { kind: "magic", power: 0, element: "none", accuracy: 100, aoe: null },
      interrupted: false,
    });
    const { active } = advanceToNextTurn(s);
    expect(active).toEqual<ActiveActor>({ kind: "charge", id: "spell" });
  });
});
