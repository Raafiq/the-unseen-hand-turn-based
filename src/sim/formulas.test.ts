import { describe, it, expect } from "vitest";
import {
  applyProtect,
  applyShell,
  applyZodiac,
  hitChance,
  magicDamage,
  weaponBaseDamage,
  zodiacCompatibility,
} from "./formulas.js";
import { defaultUnit, type Evasion, type UnitState, type WeaponFormula } from "./state.js";

function attacker(formula: WeaponFormula, over: Partial<UnitState> & { wp?: number }): UnitState {
  const { wp, ...rest } = over;
  const u = defaultUnit("atk", 0, rest);
  u.weapon = { wp: wp ?? 10, formula, element: "none", accuracy: 100 };
  return u;
}

// Golden test-vectors — verified by fft-fidelity vs BMG/FFHacktics (docs/01 §12).
// Every intermediate floor is baked into the expected integer.
describe("weaponBaseDamage — golden vectors (AC-05)", () => {
  it("#1 paWp: PA 10 × WP 12 = 120", () => {
    expect(weaponBaseDamage(attacker("paWp", { pa: 10, wp: 12 }))).toBe(120);
  });
  it("#2 braveWp: floor(70×10/100)=7 × 21 = 147 (the doc's worked example)", () => {
    expect(weaponBaseDamage(attacker("braveWp", { brave: 70, pa: 10, wp: 21 }))).toBe(147);
  });
  it("#3 braveWp where the floor bites: floor(75×11/100)=8 × 21 = 168", () => {
    expect(weaponBaseDamage(attacker("braveWp", { brave: 75, pa: 11, wp: 21 }))).toBe(168);
  });
  it("#4 bareHands: floor(12×70/100)=8 × 12 = 96", () => {
    expect(weaponBaseDamage(attacker("bareHands", { pa: 12, brave: 70 }))).toBe(96);
  });
  it("#5 bareHands + Martial Arts ×1.5: floor(96×3/2) = 144", () => {
    expect(weaponBaseDamage(attacker("bareHands", { pa: 12, brave: 70 }), { martialArts: true })).toBe(144);
  });
  it("#6 speedWp (bow): floor((8+7)/2)=7 × 10 = 70", () => {
    expect(weaponBaseDamage(attacker("speedWp", { pa: 8, speed: 7, wp: 10 }))).toBe(70);
  });
  it("#7 speedWp (knife — the corrected classification): floor((6+12)/2)=9 × 8 = 72", () => {
    expect(weaponBaseDamage(attacker("speedWp", { pa: 6, speed: 12, wp: 8 }))).toBe(72);
  });
  it("#8 wpWp (gun): WP 6 × 6 = 36, PA-independent", () => {
    expect(weaponBaseDamage(attacker("wpWp", { pa: 99, wp: 6 }))).toBe(36);
  });
});

describe("magicDamage — golden vector (AC-05)", () => {
  it("#9 two-step Faith floor: 10×14=140 → floor(140×80/100)=112 → floor(112×70/100)=78", () => {
    expect(magicDamage(10, 14, 80, 70)).toBe(78);
  });
  it("Innocent (Faith 0) → 0", () => {
    expect(magicDamage(10, 14, 0, 70)).toBe(0);
    expect(magicDamage(10, 14, 80, 0)).toBe(0);
  });
});

describe("Zodiac & Protect/Shell — golden vectors (AC-07, order per docs/05 §2)", () => {
  it("#10 Zodiac Good on 120 = floor(120×5/4) = 150", () => {
    expect(applyZodiac(120, "good")).toBe(150);
  });
  it("#11 Zodiac Best on 78 = floor(78×3/2) = 117", () => {
    expect(applyZodiac(78, "best")).toBe(117);
  });
  it("Zodiac tiers", () => {
    expect(applyZodiac(100, "neutral")).toBe(100);
    expect(applyZodiac(100, "bad")).toBe(75);
    expect(applyZodiac(101, "worst")).toBe(50); // floor(101/2)
  });
  it("#12 Protect ~2/3 on 120 = 80", () => {
    expect(applyProtect(120)).toBe(80);
  });
  it("#13 Shell ~2/3 on 78 = 52", () => {
    expect(applyShell(78)).toBe(52);
  });
  it("#14 order — Zodiac before Protect (docs/05 §2): 120 →good 150 →protect 100", () => {
    expect(applyProtect(applyZodiac(120, "good"))).toBe(100);
  });
});

describe("hitChance — evasion by facing (AC-06)", () => {
  const ev: Evasion = { classEv: 10, weaponEv: 0, shieldEv: 0, accessoryEv: 0 };

  it("front applies Class evasion: 100 acc, 10 classEv → 90%", () => {
    expect(hitChance(100, ev, "front")).toBe(90);
  });
  it("side drops Class evasion → 100%", () => {
    expect(hitChance(100, ev, "side")).toBe(100);
  });
  it("rear keeps only Accessory evasion", () => {
    const withAcc: Evasion = { classEv: 40, weaponEv: 30, shieldEv: 20, accessoryEv: 15 };
    expect(hitChance(100, withAcc, "rear")).toBe(85); // only 15% accessory applies
  });
  it("front stacks Class + Shield multiplicatively: 100×90×80/... = 72%", () => {
    const cs: Evasion = { classEv: 10, weaponEv: 0, shieldEv: 20, accessoryEv: 0 };
    expect(hitChance(100, cs, "front")).toBe(72);
  });
  it("Concentrate ignores evasion → returns base accuracy", () => {
    expect(hitChance(100, ev, "front", { ignoreEvasion: true })).toBe(100);
  });
  it("clamps accuracy into 0–100", () => {
    expect(hitChance(120, ev, "side")).toBe(100);
    expect(hitChance(-5, ev, "front")).toBe(0);
  });
});

describe("zodiacCompatibility (verified subset)", () => {
  it("same sign → Good", () => {
    expect(zodiacCompatibility({ sign: "leo", gender: "male" }, { sign: "leo", gender: "female" })).toBe("good");
  });
  it("opposite signs → Best (opposite gender) / Worst (same gender)", () => {
    expect(zodiacCompatibility({ sign: "aries", gender: "male" }, { sign: "libra", gender: "female" })).toBe("best");
    expect(zodiacCompatibility({ sign: "aries", gender: "male" }, { sign: "libra", gender: "male" })).toBe("worst");
  });
  it("neutral gender has no Best/Worst on opposite signs", () => {
    expect(zodiacCompatibility({ sign: "aries", gender: "neutral" }, { sign: "libra", gender: "male" })).toBe("neutral");
  });
  it("intermediate offsets are Neutral pending full-wheel verification", () => {
    expect(zodiacCompatibility({ sign: "aries", gender: "male" }, { sign: "cancer", gender: "male" })).toBe("neutral");
  });
});
