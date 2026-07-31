/**
 * Mastery-trait projection tests (docs/02, ADR-0012 AC-P5). Exercises the PURE
 * folding helper directly: each stat mod, flat-then-mult flooring, ORDER
 * INDEPENDENCE (the determinism guarantee — same effects, either order, identical
 * result), and the empty-effects identity. The schema's structural speed ban is
 * covered in content.test.ts (a `speed` key fails `.strict()`).
 */

import { describe, it, expect } from "vitest";
import { applyTraitEffects, type TraitEffect, type TraitStatBase } from "./trait.js";

const baseStats = (): TraitStatBase => ({
  pa: 12,
  ma: 10,
  maxHp: 60,
  move: 3,
  evasion: { classEv: 10, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
});

describe("applyTraitEffects — per-stat modifiers", () => {
  it("empty effects are the identity (floor(base × 1), no drift)", () => {
    const base = baseStats();
    expect(applyTraitEffects(base, [])).toEqual(base);
  });

  it("a flat evasion add lands on the named source only", () => {
    const out = applyTraitEffects(baseStats(), [{ evasion: { classEv: 10 } }]);
    expect(out.evasion).toEqual({
      classEv: 20,
      weaponEv: 0,
      shieldEv: 0,
      accessoryEv: 0,
      magicEv: 0,
    });
  });

  it("a maxHp mult floors after applying (×1.05 on 60 → 63)", () => {
    const out = applyTraitEffects(baseStats(), [{ maxHp: { mult: 1.05 } }]);
    expect(out.maxHp).toBe(63); // floor(60 * 1.05) = floor(63) = 63
  });

  it("an ma mult floors after applying (×1.12 on 10 → 11)", () => {
    const out = applyTraitEffects(baseStats(), [{ ma: { mult: 1.12 } }]);
    expect(out.ma).toBe(11); // floor(10 * 1.12) = floor(11.2) = 11
  });

  it("a move flat adds tiles (no mult)", () => {
    const out = applyTraitEffects(baseStats(), [{ move: { flat: 1 } }]);
    expect(out.move).toBe(4);
  });

  it("flat is applied BEFORE the mult, with a single floor: floor((10 + 3) × 1.5) = 19", () => {
    const out = applyTraitEffects(baseStats(), [{ ma: { flat: 3, mult: 1.5 } }]);
    expect(out.ma).toBe(19);
  });
});

describe("applyTraitEffects — order independence (determinism, AC-P5)", () => {
  it("two maxHp mults aggregate identically regardless of array order", () => {
    const a: TraitEffect = { maxHp: { mult: 1.05 }, evasion: { classEv: 10 } };
    const b: TraitEffect = { maxHp: { mult: 1.12 } };
    const forward = applyTraitEffects(baseStats(), [a, b]);
    const reversed = applyTraitEffects(baseStats(), [b, a]);
    expect(forward).toEqual(reversed);
    // floor(60 * 1.05 * 1.12) = floor(70.56) = 70; classEv 10 + 10 = 20.
    expect(forward.maxHp).toBe(70);
    expect(forward.evasion.classEv).toBe(20);
  });

  it("mixed flat + mult across two effects is order-independent", () => {
    const a: TraitEffect = { pa: { flat: 2 }, move: { flat: 1 } };
    const b: TraitEffect = { pa: { mult: 1.25 }, move: { flat: 2 } };
    const forward = applyTraitEffects(baseStats(), [a, b]);
    const reversed = applyTraitEffects(baseStats(), [b, a]);
    expect(forward).toEqual(reversed);
    // pa: floor((12 + 2) * 1.25) = floor(17.5) = 17; move: 3 + 1 + 2 = 6.
    expect(forward.pa).toBe(17);
    expect(forward.move).toBe(6);
  });
});

describe("applyTraitEffects — purity", () => {
  it("does not mutate the base or the effects", () => {
    const base = baseStats();
    const snapshot = JSON.parse(JSON.stringify(base)) as TraitStatBase;
    applyTraitEffects(base, [{ maxHp: { mult: 2 }, evasion: { classEv: 5 } }]);
    expect(base).toEqual(snapshot);
  });
});
