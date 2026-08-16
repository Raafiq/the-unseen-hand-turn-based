/**
 * Ability catalog schemas (docs/05 §6) — the first data-driven content layer
 * (AC-R2). Two shapes live here:
 *
 *   - {@link AbilitySchema}: the FULL authored record (progression + combat
 *     fields), as it appears in a content pack.
 *   - {@link BattleAbilitySchema}: the trimmed COMBAT PROJECTION embedded on a
 *     battle unit at build-time. Progression-only fields (apCost, skillset) are
 *     dropped; what remains is self-contained so a serialized battle resolves
 *     without re-reading the ability book — mirroring the `ChargeEffect`
 *     self-containment precedent (ADR-0010/ADR-0011). This keeps `replay`
 *     registry-free and therefore deterministic.
 *
 * PURE DATA: this module defines shapes only. Behavior (how the pipeline reads a
 * formula/power/element) stays in the resolver code, per ADR-0011.
 */

import { z } from "zod";
import { ElementSchema } from "./element.js";
import { SupportEffectSchema } from "./support.js";
import { ActiveStatusSchema } from "./active-status.js";

const IntSchema = z.number().int();
/** 0–100 accuracy percentage (matches state.ts's internal PercentSchema). */
const PercentSchema = IntSchema.min(0).max(100);

/** The 5-slot chassis axes (docs/02): action + the reaction/support/movement slots. */
export const AbilityTypeSchema = z.enum(["action", "reaction", "support", "movement"]);
export type AbilityType = z.infer<typeof AbilityTypeSchema>;

/**
 * Which magnitude formula an action feeds (behavior lives in the resolver):
 *   physical — weapon/PA-driven damage        magic — MA/power-driven damage
 *   heal     — restorative magnitude          none  — no magnitude (pure status/utility)
 */
export const AbilityFormulaSchema = z.enum(["physical", "magic", "heal", "none"]);
export type AbilityFormula = z.infer<typeof AbilityFormulaSchema>;

/** A range/AoE box in tiles: horizontal reach + vertical tolerance (docs/01 §7, docs/05 §6). */
export const RangeBoxSchema = z
  .object({ h: IntSchema.min(0), v: IntSchema.min(0) })
  .strict();
export type RangeBox = z.infer<typeof RangeBoxSchema>;

/**
 * Full authored ability record (docs/05 §6). `id`, `type`, `skillset`, `apCost`
 * are the progression spine every ability carries. The rest are combat fields
 * that only some ability types use — omitted (not null) when unused, honoring
 * `exactOptionalPropertyTypes`. `speed` omitted ⇒ instant (no charge).
 */
export const AbilitySchema = z
  .object({
    id: z.string().min(1),
    type: AbilityTypeSchema,
    skillset: z.string().min(1),
    apCost: IntSchema.min(0),
    /** MP cost; omit for MP-free abilities. */
    mp: IntSchema.min(0).optional(),
    /** Charge speed (docs/01 §3); omit ⇒ resolves instantly this turn. */
    speed: IntSchema.min(1).optional(),
    range: RangeBoxSchema.optional(),
    aoe: RangeBoxSchema.optional(),
    element: ElementSchema.optional(),
    power: IntSchema.min(0).optional(),
    formula: AbilityFormulaSchema.optional(),
    /** Hit-formula tag (e.g. "MA+X"); resolved by the pipeline, not here. */
    hitBase: z.string().min(1).optional(),
    /** Status ids inflicted on hit; each must exist in the pack's statuses. */
    inflicts: z.array(z.string().min(1)).optional(),
    /**
     * [AC-J6 hook] Ability ids this ability may not be co-equipped with in another
     * chassis slot (mutual-exclusion, enforced at equip time by loadout.ts). ADDITIVE
     * + OPTIONAL: absent = no exclusions, so existing packs (base-pack has none) stay
     * valid against CONTENT_SCHEMA_VERSION=1 with NO migration — an unspecified
     * optional field can never invalidate prior data, so the content version does not
     * bump. It is a PREP-TIME concern only and is deliberately NOT on
     * BattleAbilitySchema (the combat projection never reads it).
     */
    excludes: z.array(z.string().min(1)).optional(),
    /**
     * What an EQUIPPED `type: "support"` ability does (docs/02 §2, ADR-0017).
     * ADDITIVE + OPTIONAL, exactly like `excludes` above: an unspecified optional
     * field can never invalidate prior data, so CONTENT_SCHEMA_VERSION does NOT
     * bump — a pre-slice pack loads unchanged and its supports stay inert, which
     * is the behaviour it already had.
     *
     * Absent on a support ⇒ deliberately still inert; every such id must appear in
     * {@link DEFERRED_SUPPORT_EFFECTS} with its blocker (asserted). Absent on a
     * non-support type ⇒ meaningless and rejected by the pack's integrity pass,
     * so a stray effect on an action can never silently do nothing.
     */
    supportEffect: SupportEffectSchema.optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type Ability = z.infer<typeof AbilitySchema>;

/**
 * Trimmed combat projection embedded on a battle unit (build-time output). Holds
 * everything a resolver needs and nothing progression-only. `speed` is nullable:
 * `null` = instant, a positive int = the action's own charge speed. Self-contained
 * for the same reason `ChargeEffect` is (ADR-0010/ADR-0011): a serialized/replayed
 * battle never re-reads the content registry. Not yet wired into UnitState — that
 * happens in a later slice.
 */
export const BattleAbilitySchema = z
  .object({
    id: z.string().min(1),
    /** Derived from the authored `type`. */
    actionKind: AbilityTypeSchema,
    formula: AbilityFormulaSchema,
    power: IntSchema.min(0),
    element: ElementSchema,
    accuracy: PercentSchema,
    range: RangeBoxSchema,
    /**
     * Statuses this ability applies to a target it LANDS on, as RESOLVED,
     * self-contained {@link ActiveStatus} templates — not the authored ids.
     *
     * The resolution happens once, at build time (`build.ts` reads the pack's status
     * catalog), for the ADR-0010/ADR-0011 reason the rest of this projection exists:
     * a resolver must never read the content registry, or `replay` stops being a pure
     * function of `(seed, commands)`. Carrying ids here was exactly why the inflict
     * path stayed deferred from P0 — the resolver had a list of names it could not
     * turn into behaviour (see the SCOPE note on `charge.ts`'s `applyStatusToUnit`).
     *
     * Each template is copied onto the target at inflict time, so its `remainingCT`
     * counts down from the catalog `durationCT` independently per victim.
     */
    inflicts: z.array(ActiveStatusSchema),
    /** null ⇒ instant; positive int ⇒ charged action speed (docs/01 §3). */
    speed: IntSchema.min(1).nullable(),
    /**
     * Area of effect (docs/01 §7, docs/05 §6): `null` ⇒ single-target (the
     * occupant of the aim tile only), a box ⇒ every appropriate unit within
     * Chebyshev `h`/vertical `v` of the aim tile is resolved. Mirrors the `speed`
     * nullable pattern. Resolution is TARGETED: an area damages the caster's foes
     * / heals the caster's allies only (no friendly fire this slice).
     */
    aoe: RangeBoxSchema.nullable(),
  })
  .strict();
export type BattleAbility = z.infer<typeof BattleAbilitySchema>;
