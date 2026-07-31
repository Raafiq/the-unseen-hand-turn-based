/**
 * Mastery-trait effect schemas + projection (docs/02, ADR-0001/ADR-0012) — the
 * permanent-mastery axis of the customization spine. A mastered job grants a
 * TRAIT; equipping that trait (loadout.ts) applies these stat modifiers at
 * battle-start (build.ts). Authored data; PURE shapes + a pure folding helper.
 *
 * DEPENDENCY-FREE at runtime: this module imports nothing from another sim schema
 * module (only the `Evasion` TYPE from state.ts, erased at compile time), so it
 * can never form a Zod module-eval (TDZ) cycle with the schemas that consume it
 * (content.ts, build.ts). See the "Zod gotchas" note in CLAUDE.md.
 *
 * STRUCTURAL SPEED BAN (ADR-0012, AC-P5): {@link TraitEffectSchema} has NO `speed`
 * key — a trait can never touch CT accrual. This is enforced by the schema shape
 * (`.strict()` rejects an authored `speed`), not merely by convention.
 *
 * Determinism: {@link applyTraitEffects} aggregates every effect into ONE floored
 * result per scalar stat, so the outcome is independent of trait ARRAY ORDER
 * (integer flats sum, positive mults multiply; both commutative for the ≤2 traits
 * a loadout can hold). No RNG, no wall-clock, no mutation.
 */

import { z } from "zod";
import type { Evasion } from "./state.js";

const IntSchema = z.number().int();

/**
 * A modifier for one scalar stat: an integer `flat` add and/or a positive `mult`.
 * Both optional; an omitted field is the identity (flat 0 / mult 1). Combined as
 * `floor((base + Σflat) × Πmult)` across all effects — a single floor per stat.
 */
export const ScalarModSchema = z
  .object({
    flat: IntSchema.optional(),
    mult: z.number().positive().optional(),
  })
  .strict();
export type ScalarMod = z.infer<typeof ScalarModSchema>;

/** Flat integer adjustments to the five evasion sources (each a % point). */
export const EvasionModSchema = z
  .object({
    classEv: IntSchema.optional(),
    weaponEv: IntSchema.optional(),
    shieldEv: IntSchema.optional(),
    accessoryEv: IntSchema.optional(),
    magicEv: IntSchema.optional(),
  })
  .strict();
export type EvasionMod = z.infer<typeof EvasionModSchema>;

/** A flat tile adjustment to move range (no `mult` — move is add-only). */
export const MoveModSchema = z.object({ flat: IntSchema }).strict();
export type MoveMod = z.infer<typeof MoveModSchema>;

/**
 * The stat effects a trait applies at battle-start. Every field is optional (an
 * omitted stat is untouched). There is deliberately NO `speed` key (AC-P5): a
 * trait may never alter CT accrual.
 */
export const TraitEffectSchema = z
  .object({
    pa: ScalarModSchema.optional(),
    ma: ScalarModSchema.optional(),
    maxHp: ScalarModSchema.optional(),
    move: MoveModSchema.optional(),
    evasion: EvasionModSchema.optional(),
  })
  .strict();
export type TraitEffect = z.infer<typeof TraitEffectSchema>;

/** A catalog trait: a stable id + its stat effect. */
export const TraitSchema = z
  .object({
    id: z.string().min(1),
    effect: TraitEffectSchema,
  })
  .strict();
export type Trait = z.infer<typeof TraitSchema>;

/** The scalar+evasion base a trait fold reads and returns (build.ts's seam). */
export interface TraitStatBase {
  pa: number;
  ma: number;
  maxHp: number;
  move: number;
  evasion: Evasion;
}

const EVASION_KEYS = [
  "classEv",
  "weaponEv",
  "shieldEv",
  "accessoryEv",
  "magicEv",
] as const;

/**
 * Fold `effects` onto `base`, ORDER-INDEPENDENTLY. Per scalar stat (pa/ma/maxHp)
 * the flats sum and the mults multiply, then a SINGLE floor:
 * `floor((base + Σflat) × Πmult)` (empty ⇒ `floor(base × 1)`). `move` adds the
 * flat sum (no mult). Each evasion source adds its flat sum. Because addition and
 * (pairwise) multiplication are commutative, the same set of effects yields the
 * same result regardless of array order — the determinism guarantee tested in
 * trait.test.ts. This holds cleanly because a loadout carries at most TWO traits
 * (`LoadoutSchema.traits.max(2)`): with >2 `mult`s on one stat, IEEE-754
 * floating-point non-associativity could make a reordered product differ in the
 * last bit and thus flip the floor — the ≤2 cap keeps every product a single
 * pairwise multiply, where order cannot matter. Pure: no mutation of `base` or
 * `effects`.
 */
export function applyTraitEffects(
  base: TraitStatBase,
  effects: readonly TraitEffect[],
): TraitStatBase {
  const scalar = (baseVal: number, pick: (e: TraitEffect) => ScalarMod | undefined): number => {
    let flatSum = 0;
    let multProduct = 1;
    for (const effect of effects) {
      const mod = pick(effect);
      if (mod === undefined) continue;
      if (mod.flat !== undefined) flatSum += mod.flat;
      if (mod.mult !== undefined) multProduct *= mod.mult;
    }
    return Math.floor((baseVal + flatSum) * multProduct);
  };

  let moveFlat = 0;
  for (const effect of effects) moveFlat += effect.move?.flat ?? 0;

  const evasion = {} as Evasion;
  for (const key of EVASION_KEYS) {
    let sum = 0;
    for (const effect of effects) sum += effect.evasion?.[key] ?? 0;
    evasion[key] = base.evasion[key] + sum;
  }

  return {
    pa: scalar(base.pa, (e) => e.pa),
    ma: scalar(base.ma, (e) => e.ma),
    maxHp: scalar(base.maxHp, (e) => e.maxHp),
    move: base.move + moveFlat,
    evasion,
  };
}
