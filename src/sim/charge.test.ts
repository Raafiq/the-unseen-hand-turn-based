import { describe, it, expect } from "vitest";
import { declareCharge, resolveCharge, type ChargeOutcome } from "./charge.js";
import { advanceToNextTurn } from "./scheduler.js";
import {
  createBattleState,
  defaultUnit,
  type BattleState,
  type ChargeEffect,
  type ChargedActionState,
  type UnitState,
} from "./state.js";

const MAGIC: ChargeEffect = { kind: "magic", power: 10, element: "none", accuracy: 100 };

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
    ...charge,
  });
  return state;
}

const hpOf = (s: BattleState, id: string): number => s.units.find((u) => u.id === id)!.hp;

describe("declareCharge — enqueue + end turn (docs/05 §2 DECLARE)", () => {
  it("enqueues a ChargedAction at ct 0 with the target tile and effect, and settles the caster", () => {
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
    // Cast ends the turn as one action (cost 80): 100 → 20.
    expect(after.units[0]?.ct).toBe(20);
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

  it("CANCELS when the caster is Stopped (interrupt-status set; Sleep/Don't-Act hook later)", () => {
    const { outcome } = resolveCharge(scene({ caster: { statuses: ["stop"] } }), "chg");
    expect(outcome.resolution).toBe("cancelled");
  });

  it("a MISS (hit roll fails) deals no damage but still consumes the roll", () => {
    const { state, outcome } = resolveCharge(
      scene({ charge: { effect: { kind: "magic", power: 10, element: "none", accuracy: 0 } } }),
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
    const stalled = defaultUnit("idle", 0, { statuses: ["stop"], pos: { x: 0, y: 0 } });
    const state = createBattleState({ seed: 1, grid: { width: 5, height: 5 }, units: [stalled] });
    state.chargeQueue.push({
      id: "chg",
      sourceUnitId: "idle",
      ct: 0,
      speed: 25,
      targetTile: { x: 0, y: 0 },
      effect: MAGIC,
    });

    const { active, ticksAdvanced } = advanceToNextTurn(state);
    expect(ticksAdvanced).toBe(4); // 25,50,75,100 — not surfaced before 100
    expect(active).toEqual({ kind: "charge", id: "chg" });
  });
});
