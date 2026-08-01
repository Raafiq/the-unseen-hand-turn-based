import { describe, it, expect } from "vitest";
import {
  ConditionSchema,
  evalCondition,
  evalTerminal,
  winningTeamOf,
  type Condition,
} from "./condition.js";
import { createBattleState, defaultUnit, type BattleState } from "./state.js";

function field(overrides: Array<{ id: string; teamId: number; hp: number }>): BattleState {
  const units = overrides.map((o, i) =>
    defaultUnit(o.id, o.teamId, { pos: { x: i, y: 0 }, hp: o.hp, maxHp: 100 }),
  );
  return createBattleState({ seed: 1, grid: { width: overrides.length, height: 1 }, units });
}

const CAP = { turns: 0, ticks: 0, maxTurns: 100, maxTicks: 1000 };

describe("ConditionSchema — shape", () => {
  it("accepts the two built cases and rejects an unknown kind", () => {
    expect(ConditionSchema.parse({ kind: "eliminateTeams", teams: [1] })).toEqual({
      kind: "eliminateTeams",
      teams: [1],
    });
    expect(ConditionSchema.parse({ kind: "defeatUnit", unitId: "boss" })).toEqual({
      kind: "defeatUnit",
      unitId: "boss",
    });
    expect(() => ConditionSchema.parse({ kind: "escape", teamId: 0 })).toThrow();
    expect(() => ConditionSchema.parse({ kind: "eliminateTeams", teams: [] })).toThrow();
  });
});

describe("evalCondition — OUT = hp <= 0 (dead units stay in units)", () => {
  it("eliminateTeams fires only when EVERY listed-team unit is OUT", () => {
    const cond: Condition = { kind: "eliminateTeams", teams: [1] };
    expect(evalCondition(field([{ id: "a", teamId: 1, hp: 10 }]), cond)).toBe(false);
    expect(evalCondition(field([{ id: "a", teamId: 1, hp: 0 }]), cond)).toBe(true);
    // team 0 alive is irrelevant to eliminateTeams([1]).
    const mixed = field([
      { id: "a", teamId: 0, hp: 100 },
      { id: "b", teamId: 1, hp: 0 },
      { id: "c", teamId: 1, hp: 0 },
    ]);
    expect(evalCondition(mixed, cond)).toBe(true);
    const partial = field([
      { id: "b", teamId: 1, hp: 0 },
      { id: "c", teamId: 1, hp: 5 },
    ]);
    expect(evalCondition(partial, cond)).toBe(false);
  });

  it("defeatUnit fires when the named unit is OUT or absent", () => {
    const cond: Condition = { kind: "defeatUnit", unitId: "boss" };
    expect(evalCondition(field([{ id: "boss", teamId: 1, hp: 50 }]), cond)).toBe(false);
    expect(evalCondition(field([{ id: "boss", teamId: 1, hp: 0 }]), cond)).toBe(true);
    expect(evalCondition(field([{ id: "other", teamId: 1, hp: 50 }]), cond)).toBe(true);
  });
});

describe("winningTeamOf — sole surviving team", () => {
  it("returns the unique living team, else null", () => {
    expect(
      winningTeamOf(field([{ id: "a", teamId: 0, hp: 10 }, { id: "b", teamId: 1, hp: 0 }])),
    ).toBe(0);
    expect(
      winningTeamOf(field([{ id: "a", teamId: 0, hp: 10 }, { id: "b", teamId: 1, hp: 10 }])),
    ).toBeNull(); // two teams alive
    expect(
      winningTeamOf(field([{ id: "a", teamId: 0, hp: 0 }, { id: "b", teamId: 1, hp: 0 }])),
    ).toBeNull(); // none alive
  });
});

describe("evalTerminal — precedence + halting", () => {
  const victory: Condition = { kind: "eliminateTeams", teams: [1] };
  const defeat: Condition = { kind: "eliminateTeams", teams: [0] };

  it("ongoing while both teams have survivors and caps not reached", () => {
    const s = field([{ id: "a", teamId: 0, hp: 10 }, { id: "b", teamId: 1, hp: 10 }]);
    expect(evalTerminal(s, victory, defeat, CAP).outcome).toBe("ongoing");
  });

  it("victory when only the victory condition is met, winningTeam = survivor", () => {
    const s = field([{ id: "a", teamId: 0, hp: 10 }, { id: "b", teamId: 1, hp: 0 }]);
    expect(evalTerminal(s, victory, defeat, CAP)).toEqual({ outcome: "victory", winningTeam: 0 });
  });

  it("defeat when only the defeat condition is met", () => {
    const s = field([{ id: "a", teamId: 0, hp: 0 }, { id: "b", teamId: 1, hp: 10 }]);
    expect(evalTerminal(s, victory, defeat, CAP)).toEqual({ outcome: "defeat", winningTeam: 1 });
  });

  it("draw when both conditions are met (mutual elimination)", () => {
    const s = field([{ id: "a", teamId: 0, hp: 0 }, { id: "b", teamId: 1, hp: 0 }]);
    expect(evalTerminal(s, victory, defeat, CAP)).toEqual({ outcome: "draw", winningTeam: null });
  });

  it("timeout forces a halt at the turn cap even with both sides alive", () => {
    const s = field([{ id: "a", teamId: 0, hp: 10 }, { id: "b", teamId: 1, hp: 10 }]);
    expect(
      evalTerminal(s, victory, defeat, { turns: 100, ticks: 0, maxTurns: 100, maxTicks: 1000 })
        .outcome,
    ).toBe("timeout");
    expect(
      evalTerminal(s, victory, defeat, { turns: 0, ticks: 1000, maxTurns: 100, maxTicks: 1000 })
        .outcome,
    ).toBe("timeout");
  });

  it("an objective outranks the timeout cap (verdict, not clock, wins)", () => {
    const s = field([{ id: "a", teamId: 0, hp: 10 }, { id: "b", teamId: 1, hp: 0 }]);
    expect(
      evalTerminal(s, victory, defeat, { turns: 999, ticks: 0, maxTurns: 100, maxTicks: 1000 })
        .outcome,
    ).toBe("victory");
  });
});
