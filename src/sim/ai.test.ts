import { describe, it, expect } from "vitest";
import { decideBalanceProbe } from "./ai.js";
import {
  createBattleState,
  defaultUnit,
  legacyActiveStatus,
  type BattleState,
  type UnitState,
} from "./state.js";
import type { BattleAbility } from "./ability.js";

const HEAL_ABILITY: BattleAbility = {
  id: "heal.cure",
  actionKind: "action",
  formula: "heal",
  power: 12,
  element: "none",
  accuracy: 100,
  range: { h: 3, v: 3 },
  inflicts: [],
  speed: null,
  aoe: null,
};

/** A unit that keeps its auto basic attack and also carries `extra` abilities. */
function unitWith(id: string, teamId: number, over: Partial<UnitState>, extra: BattleAbility[] = []): UnitState {
  const u = defaultUnit(id, teamId, over);
  return { ...u, abilities: [...u.abilities, ...extra] };
}

function field(units: UnitState[], seed = 1, w = 6, h = 6): BattleState {
  return createBattleState({ seed, grid: { width: w, height: h }, units });
}

describe("decideBalanceProbe — AC-E3(a): flanks (rear > side > front) on an equal target", () => {
  it("attacks the enemy it can hit from the REAR over an identical front-facing enemy", () => {
    // hero at (2,2). A above facing S → hero strikes A's FRONT. B below facing S →
    // hero strikes B's REAR. Same HP/stats → facing is the only differentiator.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 2, y: 1 }, facing: "S", hp: 200, maxHp: 200 });
    const b = defaultUnit("B", 1, { pos: { x: 2, y: 3 }, facing: "S", hp: 200, maxHp: 200 });
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "B" } });
  });
});

describe("decideBalanceProbe — AC-E3(b): focuses the lower-HP target", () => {
  it("picks the lower-HP foe when class, magnitude, and facing tie", () => {
    // Both foes flank (side) at equal distance; only effHp differs → focus the 30-HP one.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, pa: 10, weapon: { wp: 1, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 1, y: 2 }, facing: "S", hp: 60, maxHp: 60 });
    const b = defaultUnit("B", 1, { pos: { x: 3, y: 2 }, facing: "S", hp: 30, maxHp: 60 });
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "B" } });
  });
});

describe("decideBalanceProbe — AC-E3(b): FOCUS beats big-hit (effHp before magnitude)", () => {
  it("picks the lower-HP foe even when the higher-HP foe is the bigger hit", () => {
    // hero (aries) same-sign with A → Zodiac 'good' ×1.25, so A is the BIGGER hit;
    // but A also has the higher HP. B (taurus) is a neutral, smaller hit but lower
    // HP. AC-E3(b) is a FOCUS rule → the AI must take B (finish it sooner), not A.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 1, y: 2 }, facing: "S", hp: 200, maxHp: 200 }); // good ×1.25 → mag 100
    const b = defaultUnit("B", 1, { pos: { x: 3, y: 2 }, facing: "S", hp: 150, maxHp: 150, zodiac: { sign: "taurus", gender: "neutral" } }); // neutral → mag 80
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "B" } });
  });
});

describe("decideBalanceProbe — class order", () => {
  it("prefers a LETHAL blow over a mere CHIP", () => {
    // A is one-shot killable (LETHAL); B is a fat CHIP target. LETHAL outranks CHIP.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 1, y: 2 }, facing: "N", hp: 40, maxHp: 40 });
    const b = defaultUnit("B", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500 });
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "A" } });
  });

  it("prefers HEAL a wounded ally over CHIPping an unkillable foe", () => {
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, ma: 10, faith: 50 }, [HEAL_ABILITY]);
    const ally = defaultUnit("ally", 0, { pos: { x: 2, y: 1 }, hp: 20, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, hp: 500, maxHp: 500 });
    const cmd = decideBalanceProbe(field([healer, ally, foe]), "healer");
    expect(cmd).toEqual({ kind: "act", abilityId: "heal.cure", target: { unitId: "ally" } });
  });

  it("does NOT heal a full-HP ally (no benefit) — falls through to attacking", () => {
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, pa: 10, ma: 10 }, [HEAL_ABILITY]);
    const ally = defaultUnit("ally", 0, { pos: { x: 2, y: 1 }, hp: 100, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500 });
    const cmd = decideBalanceProbe(field([healer, ally, foe]), "healer");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } });
  });
});

describe("decideBalanceProbe — movement + passivity", () => {
  it("steps toward the prime enemy when nothing is in range", () => {
    const hero = defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, move: 3 });
    const foe = defaultUnit("foe", 1, { pos: { x: 6, y: 0 }, hp: 100, maxHp: 100 });
    const cmd = decideBalanceProbe(field([hero, foe], 1, 7, 1), "hero");
    // move 3 orthogonal toward (6,0) → the reachable tile nearest the foe is (3,0).
    expect(cmd).toEqual({ kind: "move", to: { x: 3, y: 0 } });
  });

  it("waits when disabled (a preventsAction status) even with a target in range", () => {
    const hero = defaultUnit("hero", 0, {
      pos: { x: 2, y: 2 },
      statuses: [legacyActiveStatus("stop")],
    });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, hp: 100, maxHp: 100 });
    expect(decideBalanceProbe(field([hero, foe]), "hero")).toEqual({ kind: "wait" });
  });

  it("waits when boxed in and unable to close the gap", () => {
    // Lone hero, move 0, foe out of range → cannot act, cannot get closer → wait.
    const hero = defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, move: 0 });
    const foe = defaultUnit("foe", 1, { pos: { x: 5, y: 0 }, hp: 100, maxHp: 100 });
    expect(decideBalanceProbe(field([hero, foe], 1, 7, 1), "hero")).toEqual({ kind: "wait" });
  });

  it("does NOT select a charged non-magic ability (driver enqueues charges as magic)", () => {
    // Only offensive/heal option is a CHARGED HEAL — unsafe today (the driver would
    // resolve it as magic DAMAGE on the ally tile). It must be skipped; with no foe
    // present the unit falls through to Wait rather than mis-casting on its ally.
    const chargedHeal: BattleAbility = { ...HEAL_ABILITY, id: "heal.slow-cure", speed: 20 };
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, ma: 10 }, [chargedHeal]);
    const ally = defaultUnit("ally", 0, { pos: { x: 2, y: 1 }, hp: 20, maxHp: 100 });
    expect(decideBalanceProbe(field([healer, ally]), "healer")).toEqual({ kind: "wait" });
  });

  it("DOES select a charged MAGIC ability (the skip is not over-broad)", () => {
    // A charged magic nuke IS safe to select; encoded as a TILE target (charged/AoE).
    const nuke: BattleAbility = { id: "spell.nuke", actionKind: "action", formula: "magic", power: 8, element: "none", accuracy: 100, range: { h: 8, v: 8 }, inflicts: [], speed: 20, aoe: null };
    const caster = unitWith("caster", 0, { pos: { x: 2, y: 2 }, ma: 10, faith: 50 }, [nuke]);
    // Foe at range 3 → out of basic-attack (h1) range, so the nuke is the only option.
    const foe = defaultUnit("foe", 1, { pos: { x: 2, y: 5 }, hp: 100, maxHp: 100, faith: 50 });
    const cmd = decideBalanceProbe(field([caster, foe], 1, 6, 7), "caster");
    expect(cmd).toEqual({ kind: "act", abilityId: "spell.nuke", target: { x: 2, y: 5 } });
  });

  it("is a pure function — same (state, unit) yields the identical command twice", () => {
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, pa: 10 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, hp: 100, maxHp: 100 });
    const s = field([hero, foe]);
    expect(decideBalanceProbe(s, "hero")).toEqual(decideBalanceProbe(s, "hero"));
  });
});
