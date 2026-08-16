import { describe, it, expect } from "vitest";
import { declareCharge, resolveCharge, type ChargeOutcome } from "./charge.js";
import { advanceToNextTurn, settleTurn } from "./scheduler.js";
import { magicDamage, applyZodiac, applyShell } from "./formulas.js";
import {
  createBattleState,
  defaultUnit,
  legacyActiveStatus,
  makeActiveStatus,
  type BattleState,
  type ChargeEffect,
  type ChargedActionState,
  type UnitState,
} from "./state.js";
import { applyStatusToUnit, statusInterruptsCharge } from "./charge.js";
import { StatusEffectSchema } from "./status.js";

const MAGIC: ChargeEffect = { kind: "magic", power: 10, element: "none", accuracy: 100, aoe: null, inflicts: [] };

interface SceneOpts {
  caster?: Partial<UnitState>;
  target?: Partial<UnitState>;
  charge?: Partial<ChargedActionState>;
  seed?: number;
}

/**
 * Caster at (0,0); target at (2,2) on a 5x5 grid. A charge sits matured at
 * ct 100 aimed at the target's tile. Faith 100 on both + neutral Zodiac makes
 * magicDamage(ma10, q10, 100, 100) = 100 exactly — a clean magnitude to assert.
 */
function scene({ caster = {}, target = {}, charge = {}, seed = 1 }: SceneOpts = {}): BattleState {
  const cst = defaultUnit("caster", 0, { pos: { x: 0, y: 0 }, ma: 10, faith: 100, ...caster });
  const tgt = defaultUnit("target", 1, {
    pos: { x: 2, y: 2 },
    hp: 300,
    maxHp: 300,
    faith: 100,
    zodiac: { sign: "taurus", gender: "neutral" }, // neutral vs aries → ×1
    ...target,
  });
  const state = createBattleState({ seed, grid: { width: 5, height: 5 }, units: [cst, tgt] });
  state.chargeQueue.push({
    id: "chg",
    sourceUnitId: "caster",
    ct: 100,
    speed: 25,
    targetTile: { x: 2, y: 2 },
    effect: MAGIC,
    interrupted: false,
    ...charge,
  });
  return state;
}

const hpOf = (s: BattleState, id: string): number => s.units.find((u) => u.id === id)!.hp;

describe("declareCharge — enqueue only; the CALLER settles (docs/05 §2 DECLARE)", () => {
  it("enqueues a ChargedAction at ct 0 with the target tile and effect, and does NOT settle", () => {
    const cst = defaultUnit("caster", 0, { pos: { x: 0, y: 0 }, ct: 100, speed: 5 });
    const base = createBattleState({ seed: 1, grid: { width: 5, height: 5 }, units: [cst] });

    const after = declareCharge(base, "caster", {
      targetTile: { x: 3, y: 1 },
      speed: 25,
      effect: MAGIC,
    });

    expect(after.chargeQueue).toHaveLength(1);
    const c = after.chargeQueue[0]!;
    expect(c).toMatchObject({ sourceUnitId: "caster", ct: 0, speed: 25, targetTile: { x: 3, y: 1 } });
    expect(c.effect).toEqual(MAGIC);
    // Turn economy is NOT declareCharge's job any more: it cannot know whether the
    // turn also MOVED, and hard-coding cost 80 here mis-priced a move-then-charge
    // turn (the driver folds move+act and settles ONCE — driver.test.ts AC-V5).
    // So ct is untouched by the declare itself...
    expect(after.units[0]?.ct).toBe(100);
    // ...and the caller prices the turn: one action, no move → cost 80 (100 → 20).
    expect(settleTurn(after, "caster", { didMove: false, didAct: true }).units[0]?.ct).toBe(20);
    // ...or, folded with a move, the full move+act cost 100 (100 → 0).
    expect(settleTurn(after, "caster", { didMove: true, didAct: true }).units[0]?.ct).toBe(0);
    expect(after.rngCounter).toBe(0); // declaration consumes no RNG
  });

  it("rejects a down caster and an off-grid target tile", () => {
    const cst = defaultUnit("caster", 0, { pos: { x: 0, y: 0 }, ct: 100, hp: 0, crystalTimer: 3 });
    const s = createBattleState({ seed: 1, grid: { width: 3, height: 3 }, units: [cst] });
    expect(() => declareCharge(s, "caster", { targetTile: { x: 0, y: 0 }, speed: 10, effect: MAGIC })).toThrow();
    const alive = createBattleState({
      seed: 1,
      grid: { width: 3, height: 3 },
      units: [defaultUnit("caster", 0, { ct: 100 })],
    });
    expect(() => declareCharge(alive, "caster", { targetTile: { x: 9, y: 9 }, speed: 10, effect: MAGIC })).toThrow();
  });

  it("does not mutate the input state (purity for rewind/replay)", () => {
    const cst = defaultUnit("caster", 0, { ct: 100 });
    const s = createBattleState({ seed: 1, grid: { width: 3, height: 3 }, units: [cst] });
    const before = JSON.stringify(s);
    declareCharge(s, "caster", { targetTile: { x: 1, y: 1 }, speed: 10, effect: MAGIC });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("resolveCharge — matures against the target tile (AC-04 / AC-S4)", () => {
  it("resolves at charge-CT ≥ 100 vs the target tile, applies magnitude, and DEQUEUES", () => {
    const { state, outcome } = resolveCharge(scene(), "chg");
    expect(outcome.resolution).toBe("hit");
    expect(outcome.targetId).toBe("target");
    expect(outcome.damage).toBe(100);
    expect(hpOf(state, "target")).toBe(200);
    // The matured charge MUST leave the queue, or it starves the scheduler forever.
    expect(state.chargeQueue).toHaveLength(0);
    expect(state.rngCounter).toBe(1); // one hit roll consumed
  });

  it("WHIFFS with no effect and no RNG draw when the target tile is vacant", () => {
    // Aim at an empty tile (target stands elsewhere).
    const { state, outcome } = resolveCharge(scene({ charge: { targetTile: { x: 4, y: 4 } } }), "chg");
    expect(outcome.resolution).toBe("whiff");
    expect(outcome.targetId).toBeNull();
    expect(hpOf(state, "target")).toBe(300);
    expect(state.chargeQueue).toHaveLength(0);
    expect(state.rngCounter).toBe(0); // no target → no roll
  });

  it("WHIFFS when the unit walked off the tile before maturity (tile, not unit, is targeted)", () => {
    // Target moved to (0,1); the charge still points at (2,2).
    const { outcome } = resolveCharge(scene({ target: { pos: { x: 0, y: 1 } } }), "chg");
    expect(outcome.resolution).toBe("whiff");
  });

  it("CANCELS with no effect and no RNG draw when the caster is KO'd", () => {
    const { state, outcome } = resolveCharge(scene({ caster: { hp: 0, crystalTimer: 3 } }), "chg");
    expect(outcome.resolution).toBe("cancelled");
    expect(hpOf(state, "target")).toBe(300);
    expect(state.chargeQueue).toHaveLength(0);
    expect(state.rngCounter).toBe(0);
  });

  it("CANCELS when the caster is Stopped (preventsAction/interruptsCharge status)", () => {
    const { outcome } = resolveCharge(scene({ caster: { statuses: [legacyActiveStatus("stop")] } }), "chg");
    expect(outcome.resolution).toBe("cancelled");
  });

  it("a MISS (hit roll fails) deals no damage but still consumes the roll", () => {
    const { state, outcome } = resolveCharge(
      scene({ charge: { effect: { kind: "magic", power: 10, element: "none", accuracy: 0, aoe: null, inflicts: [] } } }),
      "chg",
    );
    expect(outcome.resolution).toBe("miss");
    expect(hpOf(state, "target")).toBe(300);
    expect(state.chargeQueue).toHaveLength(0);
    expect(state.rngCounter).toBe(1);
  });

  it("is reproducible from the same seed and does not mutate the input", () => {
    const s = scene({ seed: 99 });
    const before = JSON.stringify(s);
    const a = resolveCharge(s, "chg");
    const b = resolveCharge(scene({ seed: 99 }), "chg");
    expect(a.outcome).toEqual<ChargeOutcome>(b.outcome);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("throws on an unknown charge id", () => {
    expect(() => resolveCharge(scene(), "ghost")).toThrow();
  });
});

describe("charge on the shared timeline — surfaced at ct ≥ 100 (AC-04)", () => {
  it("the scheduler advances the charge +speed per tick and hands it its turn at ct ≥ 100", () => {
    // One stopped unit (never accrues) so only the charge advances: 25→50→75→100.
    const stalled = defaultUnit("idle", 0, { statuses: [legacyActiveStatus("stop")], pos: { x: 0, y: 0 } });
    const state = createBattleState({ seed: 1, grid: { width: 5, height: 5 }, units: [stalled] });
    state.chargeQueue.push({
      id: "chg",
      sourceUnitId: "idle",
      ct: 0,
      speed: 25,
      targetTile: { x: 0, y: 0 },
      effect: MAGIC,
      interrupted: false,
    });

    const { active, ticksAdvanced } = advanceToNextTurn(state);
    expect(ticksAdvanced).toBe(4); // 25,50,75,100 — not surfaced before 100
    expect(active).toEqual({ kind: "charge", id: "chg" });
  });
});

describe("two charges maturing the same tick — order + determinism (ADR-0008)", () => {
  /**
   * Two charges both reach ct ≥ 100 on the SAME tick. The charge-vs-charge
   * tie-break is by charge id (lower first), independent of sourceUnitId or
   * queue position (docs/05 §1a, ADR-0008). Here "c.a" and "c.b" have DIFFERENT
   * casters and "c.b" is enqueued FIRST — yet "c.a" must resolve first.
   */
  function twoChargeScene(): BattleState {
    const casterA = defaultUnit("uA", 0, { pos: { x: 0, y: 0 }, ma: 10, faith: 100, statuses: [legacyActiveStatus("stop")] });
    const casterB = defaultUnit("uB", 0, { pos: { x: 4, y: 4 }, ma: 10, faith: 100, statuses: [legacyActiveStatus("stop")] });
    const t1 = defaultUnit("t1", 1, { pos: { x: 1, y: 1 }, hp: 300, maxHp: 300, faith: 100, zodiac: { sign: "taurus", gender: "neutral" } });
    const t2 = defaultUnit("t2", 1, { pos: { x: 2, y: 2 }, hp: 300, maxHp: 300, faith: 100, zodiac: { sign: "taurus", gender: "neutral" } });
    const s = createBattleState({ seed: 5, grid: { width: 5, height: 5 }, units: [casterA, casterB, t1, t2] });
    // NOTE: casters are Stopped only so the scheduler surfaces the charges (units
    // never accrue); the interrupt check keys on the resolving charge's caster —
    // but each charge is resolved directly here, so Stop on the caster is not the
    // subject. To avoid Stop-cancel we clear it right before resolving (below).
    s.chargeQueue.push({ id: "c.b", sourceUnitId: "uB", ct: 90, speed: 25, targetTile: { x: 2, y: 2 }, effect: MAGIC, interrupted: false });
    s.chargeQueue.push({ id: "c.a", sourceUnitId: "uA", ct: 90, speed: 25, targetTile: { x: 1, y: 1 }, effect: MAGIC, interrupted: false });
    return s;
  }

  it("the lower charge id resolves first regardless of queue order or caster", () => {
    const s = twoChargeScene();
    // Both at ct 90, speed 25 → both hit 115 on the same single tick.
    const { active, ticksAdvanced } = advanceToNextTurn(s);
    expect(ticksAdvanced).toBe(1);
    expect(active).toEqual({ kind: "charge", id: "c.a" }); // lower id wins the tie
  });

  it("resolving both in scheduler order is byte-identical across runs", () => {
    const run = (): string[] => {
      const s = twoChargeScene();
      // Un-stop the casters so the interrupt check passes (isolating the tie-break).
      for (const u of s.units) u.statuses = [];
      const order: string[] = [];
      let state = s;
      for (let i = 0; i < 2; i++) {
        const { state: adv, active } = advanceToNextTurn(state);
        state = adv;
        if (active?.kind !== "charge") break;
        order.push(active.id);
        state = resolveCharge(state, active.id).state;
      }
      return order;
    };
    const a = run();
    const b = run();
    expect(a).toEqual(["c.a", "c.b"]); // lower id first, then the other
    expect(a).toEqual(b);
  });
});

describe("magic evasion on the hit roll (AC-07, facing-independent)", () => {
  const EV = (magicEv: number) => ({ classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv });

  it("magicEv 0 preserves the prior behavior: full accuracy, one draw (regression anchor)", () => {
    const { state, outcome } = resolveCharge(scene({ target: { evasion: EV(0) } }), "chg");
    expect(outcome.hitChance).toBe(100); // applyMagicEvasion(100, 0) === 100
    expect(state.rngCounter).toBe(1); // still exactly one hit roll
  });

  it("magicEv > 0 reduces the hit% by the independent-multiplicative model, still one draw", () => {
    // accuracy 100, magicEv 20 → floor(100×80/100) = 80. Facing is irrelevant.
    const { state, outcome } = resolveCharge(scene({ target: { evasion: EV(20) } }), "chg");
    expect(outcome.hitChance).toBe(80);
    expect(state.rngCounter).toBe(1);
  });
});

describe("kind-aware interrupt + latch (ADR-0010 items 1-2, Slice 7)", () => {
  const STOP = makeActiveStatus(
    StatusEffectSchema.parse({
      id: "status.stop", kind: "debuff", ctFactor: 0, durationCT: 20,
      dispellable: true, preventsAction: true, interruptsCharge: true,
    }),
    5,
  );
  const SILENCE = makeActiveStatus(
    StatusEffectSchema.parse({
      id: "status.silence", kind: "debuff", ctFactor: 1, durationCT: 32,
      dispellable: true, interruptsCharge: true, interruptsMagicOnly: true,
    }),
  );

  it("statusInterruptsCharge: Stop interrupts any charge, Silence only magic, Protect never", () => {
    expect(statusInterruptsCharge(STOP, "magic")).toBe(true);
    expect(statusInterruptsCharge(SILENCE, "magic")).toBe(true); // magic charge → interrupts
    expect(statusInterruptsCharge(legacyActiveStatus("protect"), "magic")).toBe(false);
  });

  it("applyStatusToUnit latches interrupted the instant a disabling status lands", () => {
    const after = applyStatusToUnit(scene(), "caster", STOP);
    expect(after.chargeQueue[0]!.interrupted).toBe(true);
    // The status is also present on the unit (self-contained application).
    expect(after.units.find((u) => u.id === "caster")!.statuses.map((s) => s.id)).toEqual(["status.stop"]);
  });

  it("a caster disabled mid-charge that RECOVERS before maturity STILL cancels (the latch)", () => {
    const latched = applyStatusToUnit(scene(), "caster", STOP);
    // Simulate recovery: the disabling status decays away before the charge matures.
    const recovered = structuredClone(latched);
    recovered.units.find((u) => u.id === "caster")!.statuses = [];
    const { state, outcome } = resolveCharge(recovered, "chg");
    expect(outcome.resolution).toBe("cancelled"); // latch fires though the caster is no longer disabled
    expect(state.rngCounter).toBe(0); // cancel consumes no draw (P0 accounting preserved)
  });

  it("Silence latches the caster's magic charge (kind-aware) and it cancels", () => {
    const after = applyStatusToUnit(scene(), "caster", SILENCE);
    expect(after.chargeQueue[0]!.interrupted).toBe(true);
    expect(resolveCharge(after, "chg").outcome.resolution).toBe("cancelled");
  });

  it("a non-disabling status (Protect) neither latches nor cancels the pending charge", () => {
    const after = applyStatusToUnit(scene(), "caster", legacyActiveStatus("protect"));
    expect(after.chargeQueue[0]!.interrupted).toBe(false);
    expect(resolveCharge(after, "chg").outcome.resolution).toBe("hit"); // still lands
  });
});

describe("magnitude golden — separate-floor order (AC-S5, fft-fidelity)", () => {
  it("MA10 Q4 cFaith70 tFaith80, Zodiac Best, target Shelled → 22", () => {
    // Locks the ORDER of the floors the charge pipeline applies (docs/05 §2):
    //   magic:  d0 = 10×4 = 40
    //           floor(40×70/100) = 28
    //           floor(28×80/100) = 22
    //   Zodiac Best: floor(22×3/2) = 33
    //   Shell:       floor(33×2/3) = 22
    // Collapsing any two of these steps drifts the result — this is the guard.
    const magic = magicDamage(10, 4, 70, 80);
    expect(magic).toBe(22);
    const zodiac = applyZodiac(magic, "best");
    expect(zodiac).toBe(33);
    const shelled = applyShell(zodiac);
    expect(shelled).toBe(22);
  });
});
