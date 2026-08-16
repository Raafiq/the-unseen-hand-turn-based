import { describe, it, expect } from "vitest";
import { decideBalanceProbe } from "./ai.js";
import { inAbilityRange, moveRange, relativeFacing } from "./grid.js";
import { applyCommand } from "./driver.js";
import { abilityDamage } from "./resolve.js";
import type { ActiveStatus } from "./active-status.js";
import {
  createBattleState,
  defaultUnit,
  legacyActiveStatus,
  serialize,
  type BattleState,
  type ChargedActionState,
  type UnitState,
} from "./state.js";
import type { BattleAbility } from "./ability.js";

/** A minimal MAGIC charge owned by `sourceUnitId` — the mid-charge marker tryScreen reads. */
function midCharge(sourceUnitId: string, targetTile = { x: 0, y: 0 }): ChargedActionState {
  return {
    id: `c.${sourceUnitId}`,
    sourceUnitId,
    ct: 40,
    speed: 20,
    targetTile,
    effect: { kind: "magic", power: 20, element: "none", accuracy: 100, aoe: null, inflicts: [] },
    interrupted: false,
  };
}

/** field(), but with a charge queue seeded (for screening fixtures). */
function fieldWithCharge(
  units: UnitState[],
  charges: ChargedActionState[],
  seed = 1,
  w = 6,
  h = 6,
): BattleState {
  const s = createBattleState({ seed, grid: { width: w, height: h }, units });
  s.chargeQueue.push(...charges);
  return s;
}

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

/**
 * A screener with NO action ability at all.
 *
 * The SCREENING tests exercise the MOVEMENT FALLBACK, reached only when the actor has no
 * action available. Since ADR-0015's fold reached `ai.ts`, "no action available" can no
 * longer be arranged by DISTANCE: the AI enumerates acts from every reachable tile, and
 * `inAbilityRange` is CHEBYSHEV, so an armed screener keeps finding a diagonal it can walk
 * to and strike from — at move 3 the T1 screener stepped to (1,1) and killed `prime` at
 * (0,0), measuring the action path while claiming to measure the screen keys. Several of
 * these boards cannot be fixed by moving the threat away either, because the same tile
 * that screens is within reach of it.
 *
 * Removing the kit makes the premise STRUCTURAL instead of arithmetic, so these fixtures
 * cannot be silently invalidated again by a future change to reach, movement or folding.
 * T2/T2-chip deliberately do NOT use this — they must carry an attack, since their whole
 * claim is that having an action outranks screening.
 */
function screener(id: string, teamId: number, over: Partial<UnitState>): UnitState {
  return { ...defaultUnit(id, teamId, over), abilities: [] };
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

/*
 * WHY THE ACTION-SELECTION FIXTURES BELOW PIN `move: 0`.
 *
 * These tests isolate ONE key of `compareCandidate` each (class, effHp focus, magnitude,
 * heal triage). Since ADR-0015's fold reached `ai.ts`, the AI also enumerates acts from
 * every REACHABLE tile, so on a mobile actor "facing ties" and "only effHp differs" stop
 * being true — it can walk to a rear arc and the arc key decides before the key under
 * test ever runs. The fixture would then pass or fail for a reason it does not name.
 *
 * `move: 0` removes movement as a confound so each test proves exactly its own claim.
 * It does NOT weaken coverage: the fold has its own purpose-built describe block at the
 * bottom of this file, and that block asserts target selection is preserved when the
 * actor CAN move — the integrated property these unit tests deliberately no longer mix in.
 */
describe("decideBalanceProbe — AC-E3(b): focuses the lower-HP target", () => {
  it("picks the lower-HP foe when class, magnitude, and facing tie", () => {
    // Both foes flank (side) at equal distance; only effHp differs → focus the 30-HP one.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, move: 0, pa: 10, weapon: { wp: 1, formula: "paWp", element: "none", accuracy: 100 } });
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
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, move: 0, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 1, y: 2 }, facing: "S", hp: 200, maxHp: 200 }); // good ×1.25 → mag 100
    const b = defaultUnit("B", 1, { pos: { x: 3, y: 2 }, facing: "S", hp: 150, maxHp: 150, zodiac: { sign: "taurus", gender: "neutral" } }); // neutral → mag 80
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "B" } });
  });
});

describe("decideBalanceProbe — class order", () => {
  it("prefers a LETHAL blow over a mere CHIP", () => {
    // A is one-shot killable (LETHAL); B is a fat CHIP target. LETHAL outranks CHIP.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, move: 0, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 1, y: 2 }, facing: "N", hp: 40, maxHp: 40 });
    const b = defaultUnit("B", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500 });
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "A" } });
  });

  it("prefers HEAL a wounded ally over CHIPping an unkillable foe", () => {
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, move: 0, ma: 10, faith: 50 }, [HEAL_ABILITY]);
    const ally = defaultUnit("ally", 0, { pos: { x: 2, y: 1 }, hp: 20, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, hp: 500, maxHp: 500 });
    const cmd = decideBalanceProbe(field([healer, ally, foe]), "healer");
    expect(cmd).toEqual({ kind: "act", abilityId: "heal.cure", target: { unitId: "ally" } });
  });

  it("does NOT heal a full-HP ally (no benefit) — falls through to attacking", () => {
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, move: 0, pa: 10, ma: 10 }, [HEAL_ABILITY]);
    const ally = defaultUnit("ally", 0, { pos: { x: 2, y: 1 }, hp: 100, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500 });
    const cmd = decideBalanceProbe(field([healer, ally, foe]), "healer");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } });
  });
});

describe("decideBalanceProbe — HEAL is a TRIAGE (focus) rule, not biggest-heal", () => {
  it("T1: heals the LOWEST-effHp ally over the BIGGER heal (triage ≠ big-heal)", () => {
    // The discriminating case where effHp and magnitude POINT DIFFERENT WAYS (an equal-
    // magnitude fixture is degenerate — the OLD comparator's SECOND key was already effHp
    // ASC, so both rules would agree). Raw heal = magicDamage(ma, q, casterFaith,
    // TARGET-faith), so it scales by the ALLY's Faith — we use that to make the DYING
    // ally's heal SMALLER than the less-hurt ally's:
    //   healer ma10 faith100, HEAL_ABILITY power12  → raw = floor(120·targetFaith/100)
    //   ally-b: hp 10 (dying), faith 10 → raw 12, missing 62 → magnitude 12,  effHp 10
    //   ally-a: hp 40 (hurt),  faith 50 → raw 60, missing 32 → magnitude 32,  effHp 40
    // Both in cure range; no foe interferes. magnitude and effHp DISAGREE, so the order
    // of the two keys IS the test:
    //   NEW (triage, effHp first):     effHp 10 < 40 → heal ally-b.  ✔ (save the dying one)
    //   OLD (big-heal, magnitude first): mag 32 > 12 → heal ally-a.  ✗ (overheals; discriminating)
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, move: 0, ma: 10, faith: 100 }, [HEAL_ABILITY]);
    const allyA = defaultUnit("ally-a", 0, { pos: { x: 2, y: 3 }, hp: 40, maxHp: 72, faith: 50 });
    const allyB = defaultUnit("ally-b", 0, { pos: { x: 2, y: 1 }, hp: 10, maxHp: 72, faith: 10 });
    const cmd = decideBalanceProbe(field([healer, allyA, allyB]), "healer");
    expect(cmd).toEqual({ kind: "act", abilityId: "heal.cure", target: { unitId: "ally-b" } });
  });

  it("T2: takes a LETHAL over healing a wounded ally (class order LETHAL 0 < HEAL 2 preserved)", () => {
    // A wounded ally in cure range (HEAL candidate exists) AND a foe the actor one-shots
    // (LETHAL exists). Heal-triage must NOT be read as promoting HEAL above LETHAL — the
    // class order is unchanged, so the securable kill wins. Discriminating: if triage had
    // leaked into a cross-class key, the AI would panic-heal instead of killing.
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, move: 0, pa: 10, ma: 10, faith: 50, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } }, [HEAL_ABILITY]);
    const ally = defaultUnit("ally", 0, { pos: { x: 2, y: 1 }, hp: 20, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 30, maxHp: 30 });
    const cmd = decideBalanceProbe(field([healer, ally, foe]), "healer");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } });
  });
});

describe("decideBalanceProbe — CONTROL is valued in the same currency as damage (ADR-0018)", () => {
  /**
   * A `none`-formula action whose only effect is `inflicts` — the shape of
   * `steal.heart`, `battle-skill`'s breaks, and every future disable. `over` swaps the
   * status template so the SAME fixture can be run with a LIVE and an INERT status: that
   * pair is the discriminating evidence, since a valuation that merely checked
   * `inflicts.length > 0` would pick this act in BOTH runs.
   */
  const controlAct = (st: ActiveStatus): BattleAbility => ({
    id: "steal.heart",
    actionKind: "action",
    formula: "none",
    power: 0,
    element: "none",
    accuracy: 100,
    range: { h: 1, v: 1 },
    inflicts: [st],
    speed: null,
    aoe: null,
  });
  /** Stop as the shipped pack authors it: 20 CT, ctFactor 0, preventsAction. LIVE. */
  const STOP: ActiveStatus = {
    id: "status.stop",
    kind: "debuff",
    ctFactor: 0,
    remainingCT: 20,
    preventsAction: true,
    interruptsCharge: true,
    interruptsMagicOnly: false,
    controlsTarget: false,
    controlledByTeamId: null,
  };
  /** Charm as the shipped pack authors it TODAY: ctFactor 1, acts freely. INERT. */
  const CHARM_INERT: ActiveStatus = {
    id: "status.charm",
    kind: "debuff",
    ctFactor: 1,
    remainingCT: 32,
    preventsAction: false,
    interruptsCharge: false,
    interruptsMagicOnly: false,
    controlsTarget: false,
    controlledByTeamId: null,
  };
  /** A weak-swing actor, so the choice is decided by the status, not by a big weapon. */
  const feeble = { wp: 1, formula: "paWp" as const, element: "none" as const, accuracy: 100 };

  it("C1: picks a 0-damage disable over its own attack — but NOT when the status is inert", () => {
    // Same fixture twice; ONLY the status template differs. LIVE Stop denies the foe
    // 20 ticks × speed 10 / 100 = 2 turns of its 80-damage swing (160 HP-equivalent),
    // which beats the actor's feeble 10-damage poke. The INERT twin (ctFactor 1, no
    // preventsAction — literally the shipped `status.charm`) denies NOTHING, so it must
    // score 0 and lose to the poke. A length-only check passes both; only a valuation
    // that reads the status BEHAVIOUR can come out the other way.
    const scene = (st: ActiveStatus): BattleState => {
      const hero = unitWith("hero", 0, { pos: { x: 2, y: 2 }, move: 0, pa: 10, weapon: feeble }, [controlAct(st)]);
      const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500, speed: 10 });
      return field([hero, foe]);
    };
    expect(decideBalanceProbe(scene(STOP), "hero")).toEqual({
      kind: "act",
      abilityId: "steal.heart",
      target: { unitId: "foe" },
    });
    expect(decideBalanceProbe(scene(CHARM_INERT), "hero")).toEqual({
      kind: "act",
      abilityId: "basic.attack",
      target: { unitId: "foe" },
    });
  });

  it("C2: re-applying a status the foe ALREADY carries is worth 0 (no disable loop)", () => {
    // The marginal rule: `applyInflicts` refreshes to the LONGER lifetime, so re-Stopping
    // a foe that already has 20 CT of Stop buys nothing. Without it the probe would spend
    // every turn re-casting the same disable and never deal damage. Discriminating: the
    // fixture is C1's LIVE case, which the probe DOES take when the foe is clean.
    const hero = unitWith("hero", 0, { pos: { x: 2, y: 2 }, move: 0, pa: 10, weapon: feeble }, [controlAct(STOP)]);
    const foe = defaultUnit("foe", 1, {
      pos: { x: 3, y: 2 },
      facing: "N",
      hp: 500,
      maxHp: 500,
      speed: 10,
      statuses: [{ ...STOP }],
    });
    expect(decideBalanceProbe(field([hero, foe]), "hero")).toEqual({
      kind: "act",
      abilityId: "basic.attack",
      target: { unitId: "foe" },
    });
  });

  it("C3: control does NOT jump the FOCUS key — a disable on a healthy foe loses to a chip on a dying one", () => {
    // The reason there is no DISABLE action class. A class ABOVE chip would make the
    // disable win outright here; folding it into `magnitude` keeps AC-E3(b) primary, so
    // the 12-HP foe (out of the disable's melee reach) is still what the probe hits.
    // Discriminating BOTH ways: the disable is worth 160 HP-equivalent, far MORE than the
    // 10-damage poke it is beaten by — so only the key ORDER can explain the choice.
    // A RANGED poke reaches both foes; the melee disable reaches only the healthy one.
    const poke: BattleAbility = {
      id: "aim.aimed-shot",
      actionKind: "action",
      formula: "physical",
      power: 2,
      element: "none",
      accuracy: 100,
      range: { h: 4, v: 3 },
      inflicts: [],
      speed: null,
      aoe: null,
    };
    const hero = unitWith("hero", 0, { pos: { x: 2, y: 2 }, move: 0, pa: 10, ma: 10, weapon: feeble }, [
      controlAct(STOP),
      poke,
    ]);
    const healthy = defaultUnit("healthy", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500, speed: 10 });
    const dying = defaultUnit("dying", 1, { pos: { x: 2, y: 4 }, facing: "N", hp: 30, maxHp: 500, speed: 10 });
    const state = field([hero, healthy, dying]);
    const heroU = state.units[0]!;
    // Fixture guards — all three make the choice real: the disable canNOT reach `dying`
    // (so control and focus point at DIFFERENT units), the poke CAN, and the poke does
    // NOT one-shot it (a LETHAL would decide by class, not by the focus key under test).
    expect(inAbilityRange(state.grid, heroU.pos, dying.pos, controlAct(STOP).range)).toBe(false);
    expect(inAbilityRange(state.grid, heroU.pos, dying.pos, poke.range)).toBe(true);
    const chip = abilityDamage(heroU, dying, poke);
    expect(chip).toBeGreaterThan(0);
    expect(chip).toBeLessThan(dying.hp);
    const cmd = decideBalanceProbe(state, "hero");
    expect(cmd.kind).toBe("act");
    if (cmd.kind !== "act") throw new Error("unreachable");
    expect(cmd.abilityId).toBe("aim.aimed-shot");
    expect(cmd.target).toEqual({ unitId: "dying" });
  });

  it("C4: a LETHAL blow is priced on DAMAGE alone — the status never lands on a corpse", () => {
    // `applyInflicts` skips a target already at 0 HP, so crediting a killing blow with its
    // status would be a magnitude the resolver never delivers. Two lethal candidates on
    // the same foe: the bigger swing (50) must win over the smaller one (25) that would
    // ALSO Stop — a Stop worth 160 HP-equivalent, so if the corpse rule were missing the
    // weaker blow would win by 185 to 50.
    const stopBlow: BattleAbility = {
      id: "aim.head-shot",
      actionKind: "action",
      formula: "physical",
      power: 25,
      element: "none",
      accuracy: 100,
      range: { h: 1, v: 1 },
      inflicts: [STOP],
      speed: null,
      aoe: null,
    };
    const bigBlow: BattleAbility = { ...stopBlow, id: "aim.aimed-shot", power: 50, inflicts: [] };
    const hero = unitWith("hero", 0, { pos: { x: 2, y: 2 }, move: 0, pa: 10, ma: 10, weapon: feeble }, [stopBlow, bigBlow]);
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 20, maxHp: 500, speed: 10 });
    const state = field([hero, foe]);
    // Fixture guard: BOTH blows really are lethal here (else this measures the class key).
    const heroU = state.units[0]!;
    const foeU = state.units[1]!;
    expect(abilityDamage(heroU, foeU, stopBlow)).toBeGreaterThanOrEqual(foeU.hp);
    expect(abilityDamage(heroU, foeU, bigBlow)).toBeGreaterThan(abilityDamage(heroU, foeU, stopBlow));
    expect(decideBalanceProbe(state, "hero")).toEqual({
      kind: "act",
      abilityId: "aim.aimed-shot",
      target: { unitId: "foe" },
    });
  });

  it("C5: the same disable is worth MORE on a FASTER foe (turns denied, not a flat bonus)", () => {
    // The mechanism, isolated: two foes identical but for Speed, both in reach, equal HP
    // (so the focus key ties and magnitude decides). Turn-economy pricing prefers the
    // faster foe — a flat per-status bonus would tie and fall through to the id
    // tie-break, picking "fast" only by accident of the alphabet, so the ids are chosen
    // to make the WRONG rule pick the OTHER unit.
    const hero = unitWith("hero", 0, { pos: { x: 2, y: 2 }, move: 0, pa: 10, weapon: feeble }, [controlAct(STOP)]);
    const fast = defaultUnit("z-fast", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500, speed: 12 });
    const slow = defaultUnit("a-slow", 1, { pos: { x: 1, y: 2 }, facing: "N", hp: 500, maxHp: 500, speed: 4 });
    const cmd = decideBalanceProbe(field([hero, fast, slow]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "steal.heart", target: { unitId: "z-fast" } });
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
    const caster = unitWith("caster", 0, { pos: { x: 2, y: 2 }, move: 0, ma: 10, faith: 50 }, [nuke]);
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

describe("decideBalanceProbe — support-aware SCREENING (protect-the-enabler, movement fallback)", () => {
  it("T1: interposes on the on-path adjacent-to-P tile, NOT the moveTowardPrime tile", () => {
    // S has NO in-range action → movement fallback. A mid-charge ally P at (5,3) is
    // threatened by E at (1,3) (its far/west side). A SEPARATE lower-HP prime enemy sits
    // at the NW corner (0,0) in a DIFFERENT direction, so moveTowardPrime would pull S
    // toward (0,0) — but screening must instead body-block the E→P path at (4,3) (on-path,
    // adjacent to P). The two rules DISAGREE by construction: the assertion (4,3) can only
    // come from the interpose keys, never from chasing the prime.
    const s = screener("S", 0, { pos: { x: 4, y: 1 }, move: 3, hp: 100, maxHp: 100 });
    const p = defaultUnit("P", 0, { pos: { x: 5, y: 3 }, hp: 40, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 1, y: 3 }, hp: 100, maxHp: 100 });
    const prime = defaultUnit("prime", 1, { pos: { x: 0, y: 0 }, hp: 10, maxHp: 100 });
    const cmd = decideBalanceProbe(fieldWithCharge([s, p, e, prime], [midCharge("P")], 1, 7, 6), "S");
    expect(cmd).toEqual({ kind: "move", to: { x: 4, y: 3 } });
  });

  // T2/T2-chip assert ACTING BEATS SCREENING, which is a claim about which BRANCH runs —
  // so they must keep a mobile S (a `move: 0` screener could not screen either way, making
  // the test vacuous). Since ADR-0015's fold, the winning act may legitimately carry a
  // `move` clause (S flanks to the foe's rear before striking), so these match on the
  // act's IDENTITY rather than on exact equality. Still fully discriminating: screening
  // returns `{ kind: "move" }`, which fails a `kind: "act"` match outright.
  it("T2: an in-range action ALWAYS beats screening (LETHAL kill, never a screen)", () => {
    // S can one-shot an adjacent foe (LETHAL) AND has a mid-charge fragile ally. The
    // action return is strictly above screening → S kills, never screens.
    const s = defaultUnit("S", 0, { pos: { x: 2, y: 2 }, pa: 10, hp: 100, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 5, maxHp: 5 });
    const p = defaultUnit("P", 0, { pos: { x: 0, y: 5 }, hp: 40, maxHp: 72 });
    const cmd = decideBalanceProbe(fieldWithCharge([s, foe, p], [midCharge("P")]), "S");
    expect(cmd).toMatchObject({ kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } });
  });

  it("T2 (chip variant): even a non-lethal CHIP beats screening", () => {
    // Same board, but the foe is unkillable this turn (CHIP, not LETHAL). A CHIP is still
    // an in-range action → it outranks screening; S attacks rather than interposing.
    const s = defaultUnit("S", 0, { pos: { x: 2, y: 2 }, pa: 10, hp: 100, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500 });
    const p = defaultUnit("P", 0, { pos: { x: 0, y: 5 }, hp: 40, maxHp: 72 });
    const cmd = decideBalanceProbe(fieldWithCharge([s, foe, p], [midCharge("P")]), "S");
    expect(cmd).toMatchObject({ kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } });
  });

  it("T3: screens the MID-CHARGE ally, not a nearer/lower-effHp non-charging ally", () => {
    // Two fragile allies: `ally-near` (hp 20, NOT charging, nearer S at (2,0)) and
    // `ally-charge` (hp 40, MID-CHARGE, farther at (6,2)). A wrong "nearest/lowest-effHp
    // fragile" rule would screen ally-near and interpose near (2,0) (→ (3,0)); the correct
    // MID-CHARGE rule interposes on the E→ally-charge path at (5,2). The keys DISAGREE.
    const s = screener("S", 0, { pos: { x: 4, y: 0 }, move: 4, hp: 100, maxHp: 100 });
    const allyCharge = defaultUnit("ally-charge", 0, { pos: { x: 6, y: 2 }, hp: 40, maxHp: 72 });
    const allyNear = defaultUnit("ally-near", 0, { pos: { x: 2, y: 0 }, hp: 20, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 3, y: 2 }, hp: 100, maxHp: 100 });
    const cmd = decideBalanceProbe(
      fieldWithCharge([s, allyCharge, allyNear, e], [midCharge("ally-charge")], 1, 8, 5),
      "S",
    );
    expect(cmd).toEqual({ kind: "move", to: { x: 5, y: 2 } });
  });

  it("HOLD: already on the optimal on-path tile → WAITS (does not abandon the screen)", () => {
    // THE discriminator for the oscillation fix. S already stands on the on-path tile
    // adjacent to the mid-charge P (4,3) — the optimal screen. A SEPARATE lower-HP prime
    // sits at the NW corner. Correct → WAIT (hold the post). The pre-fix bug returned null
    // here → moveTowardPrime walks S off (4,3) toward the prime → a MOVE (then it re-screens
    // next turn and oscillates). Assert wait, NOT a move: right ≠ plausible-wrong.
    const s = screener("S", 0, { pos: { x: 4, y: 3 }, move: 3, hp: 100, maxHp: 100 });
    const p = defaultUnit("P", 0, { pos: { x: 5, y: 3 }, hp: 40, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 1, y: 3 }, hp: 100, maxHp: 100 });
    const prime = defaultUnit("prime", 1, { pos: { x: 0, y: 0 }, hp: 10, maxHp: 100 });
    const cmd = decideBalanceProbe(fieldWithCharge([s, p, e, prime], [midCharge("P")], 1, 7, 6), "S");
    expect(cmd).toEqual({ kind: "wait" });
  });

  it("screener-hp guard: a body squishier than the charger does NOT screen (→ moveTowardPrime)", () => {
    // The geometry is a valid screen (S could interpose at (4,3)), but S (hp 30) is
    // SQUISHIER than the mid-charge P (hp 40) → the guard declines. Discriminating: a
    // no-guard bug would interpose at (4,3); the guard falls through to moveTowardPrime.
    // Proven by equality with the SAME board minus the charge (no protectee → same path).
    const s = screener("S", 0, { pos: { x: 4, y: 1 }, move: 3, hp: 30, maxHp: 100 });
    const p = defaultUnit("P", 0, { pos: { x: 5, y: 3 }, hp: 40, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 1, y: 3 }, hp: 100, maxHp: 100 });
    const prime = defaultUnit("prime", 1, { pos: { x: 0, y: 0 }, hp: 10, maxHp: 100 });
    const board = [s, p, e, prime];
    const guarded = decideBalanceProbe(fieldWithCharge(board, [midCharge("P")], 1, 7, 6), "S");
    const noCharge = decideBalanceProbe(field(board, 1, 7, 6), "S"); // empty queue → no protectee
    expect(guarded).not.toEqual({ kind: "move", to: { x: 4, y: 3 } }); // NOT the interpose
    expect(guarded).toEqual(noCharge); // identical to the no-screen moveTowardPrime path
  });

  it("no reachable on-path tile → moveTowardPrime fall-through (identical to no-screen)", () => {
    // S (move 1, boxed in the corner) can reach no on-path tile of the E→P line → tryScreen
    // returns null → moveTowardPrime. Discriminating: byte-identical to the same board with
    // no charge (screening cannot have engaged), and a MOVE toward the prime, not a wait.
    const s = screener("S", 0, { pos: { x: 0, y: 0 }, move: 1, hp: 100, maxHp: 100 });
    const p = defaultUnit("P", 0, { pos: { x: 5, y: 3 }, hp: 40, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 1, y: 3 }, hp: 100, maxHp: 100 });
    const prime = defaultUnit("prime", 1, { pos: { x: 2, y: 0 }, hp: 10, maxHp: 100 });
    const board = [s, p, e, prime];
    const withCharge = decideBalanceProbe(fieldWithCharge(board, [midCharge("P")], 1, 7, 6), "S");
    const noCharge = decideBalanceProbe(field(board, 1, 7, 6), "S");
    expect(withCharge).toEqual({ kind: "move", to: { x: 1, y: 0 } }); // steps toward the prime
    expect(withCharge).toEqual(noCharge); // screen did not engage
  });

  it("blast-radius (a): no mid-charge ally → byte-identical to the moveTowardPrime path", () => {
    // With NO ally mid-charge, tryScreen returns null and the command is exactly the
    // pre-screening moveTowardPrime output. An ENEMY-owned charge is not an ally
    // mid-charge, so it changes nothing.
    const hero = defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, move: 3 });
    const foe = defaultUnit("foe", 1, { pos: { x: 6, y: 0 }, hp: 100, maxHp: 100 });
    const expected = { kind: "move", to: { x: 3, y: 0 } };
    expect(decideBalanceProbe(field([hero, foe], 1, 7, 1), "hero")).toEqual(expected);
    const withEnemyCharge = fieldWithCharge([hero, foe], [midCharge("foe")], 1, 7, 1);
    expect(decideBalanceProbe(withEnemyCharge, "hero")).toEqual(expected);
  });

  it("blast-radius (b): an instant-caster ally (no charge) never triggers screening", () => {
    // Identical board; the ONLY difference is whether the ally owns a charge. A Coven-
    // shaped INSTANT caster produces no chargeQueue entry, so screening never fires
    // (S falls through to moveTowardPrime). Add the charge → screening fires → (5,2).
    const s = screener("S", 0, { pos: { x: 4, y: 0 }, move: 4, hp: 100, maxHp: 100 });
    const ally = defaultUnit("P", 0, { pos: { x: 6, y: 2 }, hp: 40, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 3, y: 2 }, hp: 100, maxHp: 100 });
    const interpose = { kind: "move", to: { x: 5, y: 2 } };
    const charging = fieldWithCharge([s, ally, e], [midCharge("P")], 1, 8, 5);
    const instant = field([s, ally, e], 1, 8, 5);
    expect(decideBalanceProbe(charging, "S")).toEqual(interpose); // mid-charge → screens
    expect(decideBalanceProbe(instant, "S")).not.toEqual(interpose); // instant → no screen
  });

  it("determinism: the screening decision is pure and draws ZERO rng", () => {
    const mkBoard = (): UnitState[] => [
      screener("S", 0, { pos: { x: 4, y: 1 }, move: 3, hp: 100, maxHp: 100 }),
      defaultUnit("P", 0, { pos: { x: 5, y: 3 }, hp: 40, maxHp: 72 }),
      defaultUnit("E", 1, { pos: { x: 1, y: 3 }, hp: 100, maxHp: 100 }),
    ];
    const s1 = fieldWithCharge(mkBoard(), [midCharge("P")], 1, 7, 6);
    const s2 = fieldWithCharge(mkBoard(), [midCharge("P")], 1, 7, 6);
    expect(serialize(s1)).toBe(serialize(s2)); // identical serialized inputs
    expect(decideBalanceProbe(s1, "S")).toEqual(decideBalanceProbe(s2, "S"));
    expect(decideBalanceProbe(s1, "S")).toEqual({ kind: "move", to: { x: 4, y: 3 } }); // it screened
    // A pure decide never mutates state / consumes the seed.
    const snap = serialize(s1);
    decideBalanceProbe(s1, "S");
    expect(serialize(s1)).toBe(snap);
    expect(s1.rngCounter).toBe(0);
  });
});

/*
 * THE MOVE+ACT FOLD (ADR-0015 reaching `ai.ts`; docs/01 §2, AC-02).
 *
 * The probe now enumerates acts from the actor's tile AND from every reachable tile,
 * emitting one folded `act` + `move{order:"before"}` command that settles ONCE at −100.
 * These fixtures are PURPOSE-BUILT rather than borrowed from the demo/gauntlet content,
 * and each asserts that its board genuinely SEPARATES the behaviour it claims to test —
 * a fixture where staying and moving coincide would pass under both models and certify
 * nothing.
 */
describe("decideBalanceProbe — the move+act fold (ADR-0015)", () => {
  it("reaches an otherwise-unreachable foe: one folded act, NOT a bare move", () => {
    // hero (0,0) move 3, basic attack range h1. Foe at (4,0) is Chebyshev 4 away — out of
    // range from the start tile, so the PRE-FOLD probe emitted `{kind:"move", to:(3,0)}`
    // and spent the whole turn walking. (3,0) is exactly 3 steps and Chebyshev 1 from the
    // foe, so the fold converts that same walk into a walk-and-strike.
    const hero = defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, move: 3, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const foe = defaultUnit("foe", 1, { pos: { x: 4, y: 0 }, hp: 100, maxHp: 100 });
    const state = field([hero, foe], 1, 6, 3);
    // The board separates the two models: unreachable from the start tile...
    expect(inAbilityRange(state.grid, { x: 0, y: 0 }, { x: 4, y: 0 }, { h: 1, v: 1 })).toBe(false);
    // ...reachable from a tile the actor can walk to.
    expect(inAbilityRange(state.grid, { x: 3, y: 0 }, { x: 4, y: 0 }, { h: 1, v: 1 })).toBe(true);
    const cmd = decideBalanceProbe(state, "hero");
    expect(cmd).toEqual({
      kind: "act",
      abilityId: "basic.attack",
      target: { unitId: "foe" },
      move: { to: { x: 3, y: 0 }, order: "before" },
    });
  });

  it("flank-then-strike: walks into the REAR arc rather than swinging from the FRONT", () => {
    // The signature closer turn every docs/03 archetype needed and none could execute
    // pre-fold. The foe faces S and the hero stands directly in its FRONT arc, already in
    // range — so a probe that only ever acts from where it stands would swing at the front.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, move: 4, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const foe = defaultUnit("foe", 1, { pos: { x: 2, y: 1 }, facing: "S", hp: 200, maxHp: 200 });
    const state = field([hero, foe]);
    // The board SEPARATES the models: standing still is a FRONT hit (the worst arc), so a
    // move must be what buys the better arc — this is not a tie the old order also wins.
    expect(relativeFacing(foe, { x: 2, y: 2 })).toBe("front");
    const cmd = decideBalanceProbe(state, "hero");
    expect(cmd.kind).toBe("act");
    if (cmd.kind !== "act") throw new Error("unreachable");
    expect(cmd.target).toEqual({ unitId: "foe" });
    expect(cmd.move).toBeDefined();
    expect(cmd.move?.order).toBe("before");
    // Whatever tile it chose, it must be one the act resolves from at the REAR arc, and
    // it must actually be reachable — assert the outcome, not a hard-coded coordinate.
    const to = cmd.move!.to;
    expect(relativeFacing(foe, to)).toBe("rear");
    expect(moveRange(state.grid, state.units, "hero")).toContainEqual(to);
  });

  it("tempo: does NOT move when moving buys nothing (a folded turn costs 20 more CT)", () => {
    // Foe faces N; the hero already stands in its REAR arc and in range. Another rear-arc
    // tile is ALSO reachable and in range, so the AI genuinely HAS the option to move and
    // land the identical blow — it must decline, because −100 for the same hit is strictly
    // worse than −80.
    //
    // The actor carries ONLY a range-2 ability. With a range-1 basic attack the sole
    // rear-arc tile in reach is the one it already occupies, so "it did not move" would be
    // forced rather than chosen — the fixture would pass under any tempo rule at all and
    // certify nothing. That is exactly what the `alt.length` assertion below caught when
    // this test was first written against a range-1 weapon.
    const REACH: BattleAbility = { id: "spell.bolt", actionKind: "action", formula: "magic", power: 8, element: "none", accuracy: 100, range: { h: 2, v: 2 }, inflicts: [], speed: null, aoe: null };
    const hero: UnitState = { ...defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, move: 4, ma: 10, faith: 50 }), abilities: [REACH] };
    const foe = defaultUnit("foe", 1, { pos: { x: 2, y: 1 }, facing: "N", hp: 200, maxHp: 200, faith: 50 });
    const state = field([hero, foe]);
    // THE fixture's discriminating property, asserted so nobody can "simplify" it away:
    // staying is already the BEST arc, and an equally-good arc is reachable elsewhere.
    expect(relativeFacing(foe, { x: 2, y: 2 })).toBe("rear");
    const alt = moveRange(state.grid, state.units, "hero").filter(
      (t) => relativeFacing(foe, t) === "rear" && inAbilityRange(state.grid, t, foe.pos, REACH.range),
    );
    expect(alt.length).toBeGreaterThan(0); // the choice is real, not vacuous
    const cmd = decideBalanceProbe(state, "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "spell.bolt", target: { unitId: "foe" } });
  });

  it("target selection survives the fold: still focuses the lower-HP foe when it can move", () => {
    // The integrated property the `move: 0`-pinned fixtures above deliberately exclude.
    // Both foes are identical but for HP and both are reachable, so AC-E3(b)'s focus key
    // must still decide — the fold must not have let arc/tile noise outrank it.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, move: 3, pa: 10, weapon: { wp: 1, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 0, y: 2 }, facing: "S", hp: 60, maxHp: 60 });
    const b = defaultUnit("B", 1, { pos: { x: 4, y: 2 }, facing: "S", hp: 30, maxHp: 60 });
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd.kind).toBe("act");
    if (cmd.kind !== "act") throw new Error("unreachable");
    expect(cmd.target).toEqual({ unitId: "B" }); // the 30-HP foe, not the 60-HP one
  });

  it("the folded command the AI emits is LEGAL: the driver accepts it and settles at −100", () => {
    // Closes the loop AI → driver. A command the probe can emit but the driver rejects
    // would be a benchmark that cannot replay (AC-S1). ct 100 → act+move settles to 0.
    const hero = defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, move: 3, ct: 100, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const foe = defaultUnit("foe", 1, { pos: { x: 4, y: 0 }, ct: 0, hp: 100, maxHp: 100 });
    const state = field([hero, foe], 1, 6, 3);
    const cmd = decideBalanceProbe(state, "hero");
    expect(cmd.kind).toBe("act");
    if (cmd.kind !== "act") throw new Error("unreachable");
    expect(cmd.move).toBeDefined();
    const after = applyCommand(state, cmd);
    const moved = after.units.find((u) => u.id === "hero")!;
    expect(moved.pos).toEqual({ x: 3, y: 0 }); // the move half happened
    expect(moved.ct).toBe(0); // 100 − 100: ONE settle at the both-sub-phases price
  });
});
