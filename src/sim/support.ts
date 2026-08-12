/**
 * SUPPORT-slot effect schemas + projection (docs/02 §2, the 5-slot ability
 * chassis) — the third axis of the customization spine to gain real effects,
 * after mastery traits (`trait.ts`) and the ability chassis itself.
 *
 * WHY THIS EXISTS. Until this slice `build.ts` projected ACTION abilities only:
 * the reaction, support and movement slots were validated at equip time by
 * `loadout.ts` and then ignored. Nine of fourteen shipped builds equipped a
 * support ability that did nothing — including `bld-arcane-artillery`, whose whole
 * caster identity rides on Magic Attack Up. The five-slot chassis is a LOCKED
 * decision (CLAUDE.md); three of its five slots being decorative made every build
 * that leaned on one measure as under-tuned content. See ADR-0017.
 *
 * DEPENDENCY-FREE at runtime except `trait.ts` (itself dependency-free), so this
 * module can never form a Zod module-eval (TDZ) cycle with the schemas that
 * consume it. The live import chain is state → ability → support → trait → ∅.
 * See the "Zod gotchas" note in `src/sim/CLAUDE.md`.
 *
 * THE SPEED BAN IS PRESERVED (ADR-0012, AC-P5). {@link SupportEffectSchema} has NO
 * `speed` key: no support may alter a UNIT's CT accrual, exactly as no trait may.
 * {@link SupportEffect.chargeSpeed} is a DIFFERENT quantity — the accrual rate of a
 * CHARGED ACTION on the shared timeline, which `docs/01` §3 states is "(largely)
 * independent of caster Speed", and which is precisely why Short Charge exists as
 * a support in FFT. The two are separated by the schema shape (`.strict()` rejects
 * an authored `speed`), not by convention.
 *
 * ONE SUPPORT AT A TIME. `LoadoutSchema` has a single `support` slot, so unlike the
 * ≤2-trait fold there is never more than one effect in play — order-independence is
 * structural here, not an argument about commutativity.
 */

import { z } from "zod";
import { ScalarModSchema, MoveModSchema, type ScalarMod } from "./trait.js";

/**
 * The effects an EQUIPPED support ability applies at battle-start. Every field is
 * optional (an omitted key leaves its target untouched — the absent-not-zero rule).
 * Two families, applied at two different points in `build.ts`:
 *
 *   - STAT mods (`pa`/`ma`/`maxHp`) fold onto the derived unit stats, in the
 *     pipeline position growth → trait → **support** → final clamp.
 *   - ABILITY mods (`chargeSpeed`/`abilityRange`) fold onto each projected
 *     {@link BattleAbility}, so they travel with the serialized battle and a replay
 *     never re-reads the registry (the ADR-0010/ADR-0011 self-containment rule).
 *
 * Deliberately NO `speed` key — see the module docstring (AC-P5).
 */
export const SupportEffectSchema = z
  .object({
    pa: ScalarModSchema.optional(),
    ma: ScalarModSchema.optional(),
    maxHp: ScalarModSchema.optional(),
    /**
     * Scales a CHARGED action's own accrual rate (docs/01 §3): higher = the charge
     * matures in fewer ticks. Applied only to abilities that ALREADY charge — an
     * instant ability (`speed === null`) stays instant rather than becoming a
     * charge, so "no charge" and "a very fast charge" never collapse together.
     */
    chargeSpeed: ScalarModSchema.optional(),
    /** Flat tiles added to each projected ability's HORIZONTAL range (`range.h`). */
    abilityRange: MoveModSchema.optional(),
  })
  .strict();
export type SupportEffect = z.infer<typeof SupportEffectSchema>;

/** The scalar base the support stat-fold reads and returns (build.ts's seam). */
export interface SupportStatBase {
  pa: number;
  ma: number;
  maxHp: number;
}

/**
 * Fold one support `effect` onto `base`: per stat, `floor((base + flat) × mult)`,
 * with an omitted `flat`/`mult` acting as the identity (0 / 1). `undefined` (no
 * support equipped) returns `base` UNCHANGED — the no-op that keeps every
 * support-less build byte-identical to before this layer existed.
 *
 * Pure: no mutation of `base` or `effect`, no RNG, no clock.
 */
export function applySupportEffect(
  base: SupportStatBase,
  effect: SupportEffect | undefined,
): SupportStatBase {
  if (effect === undefined) return base;
  const scalar = (value: number, mod: ScalarMod | undefined): number =>
    mod === undefined ? value : Math.floor((value + (mod.flat ?? 0)) * (mod.mult ?? 1));
  return {
    pa: scalar(base.pa, effect.pa),
    ma: scalar(base.ma, effect.ma),
    maxHp: scalar(base.maxHp, effect.maxHp),
  };
}

/**
 * Apply the ABILITY-side mods to one projected ability's charge speed and range.
 * Returns the inputs unchanged when no support is equipped or the support carries
 * no ability mods.
 *
 * `speed === null` (instant) is returned as `null` untouched: `chargeSpeed` scales
 * an existing charge, it never CREATES one. A scaled speed is floored and clamped
 * to ≥ 1 (`BattleAbilitySchema` requires a positive int), and a range shifted by a
 * negative flat is clamped to ≥ 0 — both so the projection is schema-valid at BUILD
 * time rather than only failing at serialize/rewind (the build-time clamp rule in
 * `src/sim/CLAUDE.md`).
 */
export function applySupportToAbility(
  speed: number | null,
  rangeH: number,
  effect: SupportEffect | undefined,
): { speed: number | null; rangeH: number } {
  if (effect === undefined) return { speed, rangeH };
  const chargeMod = effect.chargeSpeed;
  const nextSpeed =
    speed === null || chargeMod === undefined
      ? speed
      : Math.max(1, Math.floor((speed + (chargeMod.flat ?? 0)) * (chargeMod.mult ?? 1)));
  const rangeFlat = effect.abilityRange?.flat ?? 0;
  return { speed: nextSpeed, rangeH: Math.max(0, rangeH + rangeFlat) };
}

/**
 * Support abilities that are authored but INTENTIONALLY have no effect yet, each
 * mapped to the NAMED capability that would unblock it. Mirrors the diversity
 * gate's `EXCLUDED` manifest (ADR-0014): a support is never silently inert — it is
 * either effect-bearing or listed here with a reason. `support.test.ts` asserts
 * this partitions the shipped pack's support abilities EXACTLY, so authoring a new
 * support without an effect fails the suite rather than shipping quietly dead.
 */
export const DEFERRED_SUPPORT_EFFECTS: Readonly<Record<string, string>> = {
  "battle-skill.equip-heavy-armor":
    "equipment is not modeled (docs/05 §4 defers the equipment modifier layer), so there is no armor slot to widen",
  "steal.secret-hunt":
    "poach/loot tables are post-battle economy (docs/07), outside the battle-state modifier layers entirely",
  "aim.concentrate":
    "ignore-evasion is a RESOLVE-layer flag on the hit roll, not a build-time stat/ability modifier — needs a UnitState capability field",
  "summon.arcane-focus":
    "per-SKILLSET damage scaling; BattleAbility carries no skillset (dropped in the combat projection), so this needs a projection change, not an effect",
};
