import { describe, it, expect } from "vitest";
import {
  ConditionSchema,
  evalCondition,
  evalTerminal,
  winningTeamOf,
  type Condition,
} from "./condition.js";
import { createBattleState, defaultUnit, type BattleState } from "./state.js";

function field(
  overrides: Array<{ id: string; teamId: number; hp: number }>,
  tick = 0,
): BattleState {
  const units = overrides.map((o, i) =>
    defaultUnit(o.id, o.teamId, { pos: { x: i, y: 0 }, hp: o.hp, maxHp: 100 }),
  );
  const state = createBattleState({ seed: 1, grid: { width: overrides.length, height: 1 }, units });
  // createBattleState fixes tick:0; `survive` reads state.tick, so set it explicitly.
  state.tick = tick;
  return state;
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

  it("accepts a well-formed survive and rejects missing/zero ticks", () => {
    expect(ConditionSchema.parse({ kind: "survive", teamId: 0, ticks: 5 })).toEqual({
      kind: "survive",
      teamId: 0,
      ticks: 5,
    });
    expect(() => ConditionSchema.parse({ kind: "survive", teamId: 0 })).toThrow(); // no ticks
    expect(() => ConditionSchema.parse({ kind: "survive", teamId: 0, ticks: 0 })).toThrow(); // ticks < 1
  });
});

describe("evalCondition — survive (state.tick clock + survivor clause)", () => {
  const N = 100;
  const cond: Condition = { kind: "survive", teamId: 0, ticks: N };

  it("T1: fires at tick >= ticks (>=), not the tick before", () => {
    // team 0 alive throughout; only the clock moves across the threshold.
    expect(evalCondition(field([{ id: "a", teamId: 0, hp: 10 }], N - 1), cond)).toBe(false);
    expect(evalCondition(field([{ id: "a", teamId: 0, hp: 10 }], N), cond)).toBe(true);
  });

  it("survivor clause: threshold reached but team 0 wiped ⇒ false", () => {
    expect(evalCondition(field([{ id: "a", teamId: 0, hp: 0 }], N), cond)).toBe(false);
  });

  it("teamId-specific: another team's survivor does not satisfy survive{0}", () => {
    const s = field([{ id: "a", teamId: 0, hp: 0 }, { id: "b", teamId: 1, hp: 10 }], N);
    expect(evalCondition(s, cond)).toBe(false);
  });
});

describe("evalTerminal — survive victory/defeat pairing", () => {
  const N = 100;
  const victory: Condition = { kind: "survive", teamId: 0, ticks: N };
  const defeat: Condition = { kind: "eliminateTeams", teams: [0] };

  it("T2: wipe-at-threshold is a DEFEAT, not a draw (survivor clause blocks won)", () => {
    // tick=N, team 0 all OUT, team 1 alive. survive is false (no survivor), so only
    // `lost` fires. Without the survivor clause both would fire ⇒ bogus draw.
    const s = field([{ id: "a", teamId: 0, hp: 0 }, { id: "b", teamId: 1, hp: 10 }], N);
    expect(evalTerminal(s, victory, defeat, CAP).outcome).toBe("defeat");
  });

  it("T4: survive victory with BOTH teams alive attributes winningTeam=0 (beneficiary)", () => {
    // winningTeamOf sees two live teams ⇒ null; the survive branch must use teamId.
    const s = field([{ id: "a", teamId: 0, hp: 10 }, { id: "b", teamId: 1, hp: 10 }], N);
    expect(evalTerminal(s, victory, defeat, CAP)).toEqual({ outcome: "victory", winningTeam: 0 });
  });

  it("T3: survive-as-DEFEAT (defeat-within-N) attributes winningTeam to the outlasting enemy", () => {
    // "You lose if enemy team 1 survives to tick N" — victory = wipe team 1, defeat =
    // survive{1}. Both teams alive at N ⇒ defeat fires; the beneficiary is team 1 (the
    // enemy that outlasted). winningTeamOf sees two live teams ⇒ null, so this pins the
    // defeat-branch beneficiary fix (the symmetric mirror of T4). Discriminating FIELD
    // is winningTeam: pre-fix would report null.
    const withinN: Condition = { kind: "eliminateTeams", teams: [1] };
    const enemyOutlasts: Condition = { kind: "survive", teamId: 1, ticks: N };
    const s = field([{ id: "a", teamId: 0, hp: 10 }, { id: "b", teamId: 1, hp: 10 }], N);
    expect(evalTerminal(s, withinN, enemyOutlasts, CAP)).toEqual({ outcome: "defeat", winningTeam: 1 });
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
