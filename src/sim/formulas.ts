/**
 * Combat formulas (docs/01 §5–§6). Pure integer math, floored at each bracket
 * in the documented order (docs/05 §2) — replicate every truncation or damage
 * drifts. No randomness here; the resolution pipeline (resolve.ts) owns the
 * rolls and their order.
 *
 * Constants verified against AeroStar's BMG / FFHacktics via the `fft-fidelity`
 * pass (PR3). Items still uncertain there are flagged; do not add unverified
 * numbers without a golden vector (docs/01 §12, CLAUDE.md).
 */

import type { Evasion, UnitState, ZodiacProfile } from "./state.js";

/** Exact integer floor division for non-negative integers (no float creep). */
function floorDiv(num: number, den: number): number {
  return Number(BigInt(num) / BigInt(den));
}

/**
 * Base weapon damage before element/Zodiac/Protect (docs/01 §5a). Each formula
 * floors exactly where FFT does. `martialArts` applies the ×1.5 (floored) that
 * Monks/the Martial Arts support grant to bare-handed attacks.
 */
export function weaponBaseDamage(u: UnitState, opts: { martialArts?: boolean } = {}): number {
  const { pa, brave, speed } = u;
  const wp = u.weapon.wp;
  switch (u.weapon.formula) {
    case "paWp":
      return pa * wp;
    case "braveWp":
      return floorDiv(brave * pa, 100) * wp;
    case "bareHands": {
      const base = floorDiv(pa * brave, 100) * pa;
      return opts.martialArts ? floorDiv(base * 3, 2) : base;
    }
    case "speedWp":
      return floorDiv(pa + speed, 2) * wp;
    case "wpWp":
      return wp * wp;
  }
}

/**
 * Magic damage/healing magnitude (docs/01 §5b). Faith enters on BOTH ends,
 * each a floored `/100` step — kept as two sequential floors (NOT collapsed),
 * because the game floors between them (fft-fidelity: FFHacktics Faith Calc).
 */
export function magicDamage(ma: number, q: number, casterFaith: number, targetFaith: number): number {
  const d0 = ma * q;
  const d1 = floorDiv(d0 * casterFaith, 100);
  return floorDiv(d1 * targetFaith, 100);
}

export type ZodiacTier = "best" | "good" | "neutral" | "bad" | "worst";

/** Apply the Zodiac multiplier (docs/01 §5d), floored. Exact rational factors. */
export function applyZodiac(value: number, tier: ZodiacTier): number {
  switch (tier) {
    case "best":
      return floorDiv(value * 3, 2); // ×1.50
    case "good":
      return floorDiv(value * 5, 4); // ×1.25
    case "neutral":
      return value;
    case "bad":
      return floorDiv(value * 3, 4); // ×0.75
    case "worst":
      return floorDiv(value, 2); // ×0.50
  }
}

/** Protect / Shell reduce physical / magical damage to ~2/3 (docs/01 §8), floored. */
export function applyProtect(value: number): number {
  return floorDiv(value * 2, 3);
}
export function applyShell(value: number): number {
  return floorDiv(value * 2, 3);
}

export type Facing = "front" | "side" | "rear";

/**
 * Final hit % after evasion (docs/01 §5c/§6). The four evasion sources are
 * independent multiplicative miss chances; facing removes sources:
 *   front → all four; side → drop Class; rear → keep only Accessory.
 * `ignoreEvasion` (Concentrate) skips evasion entirely. Result clamped 0–100.
 */
export function hitChance(
  accuracy: number,
  ev: Evasion,
  facing: Facing,
  opts: { ignoreEvasion?: boolean } = {},
): number {
  const a = clampPercent(accuracy);
  if (opts.ignoreEvasion) return a;

  const { classEv, weaponEv, shieldEv, accessoryEv } = ev;
  let num: number;
  let den: number;
  if (facing === "front") {
    num = a * (100 - classEv) * (100 - shieldEv) * (100 - accessoryEv) * (100 - weaponEv);
    den = 100_000_000;
  } else if (facing === "side") {
    num = a * (100 - shieldEv) * (100 - accessoryEv) * (100 - weaponEv);
    den = 1_000_000;
  } else {
    num = a * (100 - accessoryEv);
    den = 100;
  }
  return clampPercent(floorDiv(num, den));
}

function clampPercent(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

/**
 * Zodiac compatibility tier between two units (docs/01 §5d).
 *
 * VERIFIED (fft-fidelity): Best/Worst occur only between OPPOSITE signs,
 * resolved by gender — opposite gender = Best, same gender = Worst. Same sign
 * reads as Good.
 *
 * [UNCERTAIN] The full Good/Bad wheel for intermediate offsets was NOT
 * verifiable this pass (primary sources egress-blocked), so intermediate
 * offsets return Neutral rather than assert an unverified value. Complete the
 * wheel from the BMG chart before relying on off-axis Zodiac in balance.
 */
export function zodiacCompatibility(a: ZodiacProfile, b: ZodiacProfile): ZodiacTier {
  const offset = ((SIGN_INDEX[a.sign] - SIGN_INDEX[b.sign]) % 12 + 12) % 12;
  if (offset === 0) return "good"; // same sign
  if (offset === 6) {
    // opposite signs → Best/Worst by gender (neutral gender has no Best/Worst)
    if (a.gender === "neutral" || b.gender === "neutral") return "neutral";
    return a.gender === b.gender ? "worst" : "best";
  }
  return "neutral"; // [UNCERTAIN] intermediate wheel pending verification
}

const SIGN_INDEX: Record<ZodiacProfile["sign"], number> = {
  aries: 0, taurus: 1, gemini: 2, cancer: 3, leo: 4, virgo: 5,
  libra: 6, scorpio: 7, sagittarius: 8, capricorn: 9, aquarius: 10, pisces: 11,
};
