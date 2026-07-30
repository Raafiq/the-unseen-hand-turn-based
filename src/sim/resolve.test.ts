import { describe, it, expect } from "vitest";
import { resolveAttack, tickCrystal } from "./resolve.js";
import { ctRateOfUnit } from "./scheduler.js";
import { createBattleState, defaultUnit, type BattleState, type UnitState } from "./state.js";

interface DuelOpts {
  attacker?: Partial<UnitState>;
  target?: Partial<UnitState>;
  seed?: number;
}

/** Attacker at (0,0); target at (1,0) facing West → a FRONT attack by default. */
function duel({ attacker = {}, target = {}, seed = 1 }: DuelOpts = {}): BattleState {
  const atk = defaultUnit("atk", 0, {
    pos: { x: 0, y: 0 },
    pa: 10,
    brave: 70,
    zodiac: { sign: "aries", gender: "male" },
    weapon: { wp: 12, formula: "paWp", element: "none", accuracy: 100 },
    ...attacker,
  });
  const tgt = defaultUnit("tgt", 1, {
    pos: { x: 1, y: 0 },
    facing: "W",
    hp: 300,
    maxHp: 300,
    zodiac: { sign: "taurus", gender: "male" }, // neutral vs aries → ×1
    evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0 },
    ...target,
  });
  return createBattleState({ seed, grid: { width: 4, height: 4 }, units: [atk, tgt] });
}

const hpOf = (s: BattleState, id: string): number => s.units.find((u) => u.id === id)!.hp;

describe("resolveAttack — damage (AC-05) + determinism (AC-S1)", () => {
  it("applies the full magnitude pipeline: PA10×WP12 = 120, neutral Zodiac", () => {
    const { state, outcome } = resolveAttack(duel(), "atk", "tgt");
    expect(outcome.hit).toBe(true);
    expect(outcome.damage).toBe(120);
    expect(hpOf(state, "tgt")).toBe(180);
  });

  it("is reproducible from the same seed and advances the RNG cursor by one", () => {
    const a = resolveAttack(duel({ seed: 42 }), "atk", "tgt");
    const b = resolveAttack(duel({ seed: 42 }), "atk", "tgt");
    expect(a.outcome).toEqual(b.outcome);
    expect(a.state.rngCounter).toBe(1);
  });

  it("does not mutate the input state (purity for rewind/replay)", () => {
    const state = duel();
    const before = JSON.stringify(state);
    resolveAttack(state, "atk", "tgt");
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("resolveAttack — Zodiac & Protect enter in order (AC-07)", () => {
  it("same-sign Zodiac (Good ×1.25): 120 → 150", () => {
    const { outcome } = resolveAttack(duel({ target: { zodiac: { sign: "aries", gender: "male" } } }), "atk", "tgt");
    expect(outcome.damage).toBe(150);
  });

  it("Protect reduces to ~2/3 after Zodiac: neutral 120 → protect 80", () => {
    const { outcome } = resolveAttack(
      duel({ target: { statuses: ["protect"], zodiac: { sign: "taurus", gender: "male" } } }),
      "atk",
      "tgt",
    );
    expect(outcome.damage).toBe(80);
  });
});

describe("resolveAttack — hit / miss (AC-06)", () => {
  it("a 0-accuracy swing always misses, deals no damage, but still consumes the roll", () => {
    const { state, outcome } = resolveAttack(
      duel({ attacker: { weapon: { wp: 12, formula: "paWp", element: "none", accuracy: 0 } } }),
      "atk",
      "tgt",
    );
    expect(outcome.hit).toBe(false);
    expect(outcome.damage).toBe(0);
    expect(hpOf(state, "tgt")).toBe(300);
    expect(state.rngCounter).toBe(1); // hit roll is always consumed
  });

  it("reports the facing it struck from (front here)", () => {
    const { outcome } = resolveAttack(duel(), "atk", "tgt");
    expect(outcome.facing).toBe("front");
  });

  it("a rear attack reports rear (target faces away)", () => {
    // Target faces East; attacker to its West strikes the rear.
    const { outcome } = resolveAttack(duel({ target: { facing: "E" } }), "atk", "tgt");
    expect(outcome.facing).toBe("rear");
  });
});

describe("resolveAttack — illegal targets (AC-S1 replay safety)", () => {
  it("refuses to attack itself or an already-downed target (would desync replay)", () => {
    expect(() => resolveAttack(duel(), "atk", "atk")).toThrow();
    const koState = resolveAttack(duel({ target: { hp: 100, maxHp: 100 } }), "atk", "tgt").state;
    expect(() => resolveAttack(koState, "atk", "tgt")).toThrow(/already down/);
  });
});

describe("resolveAttack + tickCrystal — KO & crystal countdown (AC-09)", () => {
  it("lethal damage drops HP to 0 and starts the crystal counter; the unit still accrues CT", () => {
    const { state, outcome } = resolveAttack(duel({ target: { hp: 100, maxHp: 100 } }), "atk", "tgt");
    expect(outcome.ko).toBe(true);
    const tgt = state.units.find((u) => u.id === "tgt")!;
    expect(tgt.hp).toBe(0);
    expect(tgt.crystalTimer).toBe(3);
    // Faithful model (docs/01 §11): a KO'd unit keeps accruing CT so its turn
    // comes up to tick the counter — it is NOT frozen at KO.
    expect(ctRateOfUnit(tgt)).toBeGreaterThan(0);
  });

  it("ticks the counter 3→0 across the unit's turns, then crystallizes and freezes", () => {
    let state = resolveAttack(duel({ target: { hp: 100, maxHp: 100 } }), "atk", "tgt").state;
    const tgt = (): (typeof state.units)[number] => state.units.find((u) => u.id === "tgt")!;

    let r = tickCrystal(state, "tgt");
    state = r.state;
    expect(tgt().crystalTimer).toBe(2);
    expect(r.crystallized).toBe(false);

    r = tickCrystal(state, "tgt");
    state = r.state;
    expect(tgt().crystalTimer).toBe(1);

    r = tickCrystal(state, "tgt");
    state = r.state;
    expect(tgt().crystalTimer).toBe(0);
    expect(r.crystallized).toBe(true);
    // Now permanently dead → out of the scheduler.
    expect(ctRateOfUnit(tgt())).toBe(0);
  });

  it("tickCrystal refuses a living unit", () => {
    expect(() => tickCrystal(duel(), "atk")).toThrow();
  });
});
