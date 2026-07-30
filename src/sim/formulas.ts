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

/**
 * Exact integer division for NON-NEGATIVE integers (no float creep). BigInt
 * division truncates toward zero, which equals floor only for non-negative
 * operands — all current callers are non-negative. The deferred `absorb`
 * element yields negative "damage" (healing); it must not route through this
 * without handling the sign (trunc vs floor differ by 1 for negatives).
 */
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

/**
 * Protect / Shell reduce physical / magical damage (docs/01 §8), floored.
 * [UNCERTAIN] the ~2/3 factor is from docs/01 §8's "~⅔" and is NOT independently
 * confirmed (some sources cite ×3/4); re-verify vs BMG/FFHacktics before balance
 * relies on it. Kept as separate functions so a future split (if Protect and
 * Shell differ) has a home.
 */
export function applyProtect(value: number): number {
  return floorDiv(value * 2, 3);
}
export function applyShell(value: number): number {
  return floorDiv(value * 2, 3);
}

/**
 * Magic evasion (docs/01 §6) — the SEPARATE, facing-independent magic-evade
 * stat. Magic uses ONLY this: no class/weapon/shield physical evade, no
 * front/side/rear. Modeled as an independent-multiplicative miss chance (mirrors
 * the physical §5c path in {@link hitChance}):
 *   finalHit = floor(hit × (100 − magicEv) / 100)
 *
 * [UNCERTAIN] the exact model. The ALTERNATIVE is subtractive
 * (`finalHit = hit − magicEv`); the two agree exactly at magicEv 0 and diverge
 * as magicEv grows (hit 45, magicEv 20 → 36 here vs 25 subtractive). Re-verify
 * vs BMG/FFHacktics before balance leans on magic evasion; formulas.test.ts V2
 * pins THIS (multiplicative) op.
 */
export function applyMagicEvasion(hit: number, magicEv: number): number {
  const h = clampPercent(hit);
  const ev = clampPercent(magicEv);
  return floorDiv(h * (100 - ev), 100);
}

/**
 * Apply Zodiac compatibility to a HIT / status-infliction chance (docs/01
 * §5d/§6). This is the add/subtract-of-a-floored-fraction integer op — distinct
 * from the damage ×rational op in {@link applyZodiac}:
 *   Good:  v + floor(v/4)     Bad:   v − floor(v/4)
 *   Best:  v + floor(v/2)     Worst: v − floor(v/2)     Neutral: v
 *
 * [UNCERTAIN] the exact rounding op. The compat MAGNITUDES (1.25/0.75/1.5/0.5)
 * are P0-verified (fft-fidelity), but this integer form can differ ±1 from the
 * naive float ×multiplier. No clamp here — {@link magicHitChance} caps at 100
 * before evasion.
 */
export function applyZodiacToHit(value: number, compat: ZodiacTier): number {
  switch (compat) {
    case "good":
      return value + floorDiv(value, 4);
    case "bad":
      return value - floorDiv(value, 4);
    case "best":
      return value + floorDiv(value, 2);
    case "worst":
      return value - floorDiv(value, 2);
    case "neutral":
      return value;
  }
}

/**
 * Magic / status hit% (docs/01 §6). Pure integer math, floored in the declared
 * order — NO RNG (the resolution pipeline owns the draw):
 *   S1       = floor(base × casterFaith / 100)     # caster Faith
 *   S2       = floor(S1   × targetFaith / 100)     # target Faith (both floors kept)
 *   S3       = applyZodiacToHit(S2, compat)        # Zodiac on hit
 *   S4       = min(S3, 100)                         # cap BEFORE evasion
 *   finalHit = clamp(applyMagicEvasion(S4, magicEv), 0, 100)
 *
 * `base` is PER-ABILITY: damage/heal spells pass base = 100 (Faith drives the
 * MAGNITUDE, not the hit — see {@link magicDamage} / charge.ts), so their hit
 * reduces to `applyMagicEvasion(100, magicEv)`. Status spells pass base = MA + K
 * (K per-ability, [UNCERTAIN], data-table later) so Faith/Zodiac DO gate landing.
 *
 * NOTE — Punch Art / ki (Monk) is Faith-INDEPENDENT (PA/Brave, physical path):
 * it must NEVER route through this function.
 */
export function magicHitChance(
  base: number,
  casterFaith: number,
  targetFaith: number,
  compat: ZodiacTier,
  magicEv: number,
): number {
  const s1 = floorDiv(base * clampPercent(casterFaith), 100);
  const s2 = floorDiv(s1 * clampPercent(targetFaith), 100);
  const s3 = applyZodiacToHit(s2, compat);
  const s4 = s3 > 100 ? 100 : s3;
  return clampPercent(applyMagicEvasion(s4, magicEv));
}

export type Facing = "front" | "side" | "rear";

/**
 * Final hit % after evasion (docs/01 §5c/§6). The four evasion sources are
 * independent multiplicative miss chances; facing removes sources:
 *   front → all four; side → drop Class; rear → keep only Accessory.
 * `ignoreEvasion` (Concentrate) skips evasion entirely. Result clamped 0–100.
 *
 * Design note: we compute ONE combined hit% and the pipeline takes a SINGLE
 * seeded draw against it (resolve.ts) — probability-equivalent to FFT's separate
 * per-source rolls and matching the displayed hit%. This fixes the per-swing
 * draw count at 1; revisit if per-source reaction triggers (Weapon Guard) ever
 * need to know which specific source evaded.
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
 * resolved by gender — opposite gender = Best, same gender = Worst.
 *
 * [UNCERTAIN] Same-sign = Good is a common-knowledge assumption, NOT pinned by
 * docs/01 §5d; and the full Good/Bad wheel for intermediate offsets was not
 * verifiable this pass (primary sources egress-blocked). So same-sign returns
 * Good provisionally and intermediate offsets return Neutral rather than assert
 * unverified values. Complete the wheel from the BMG chart before relying on
 * off-axis Zodiac in balance.
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
