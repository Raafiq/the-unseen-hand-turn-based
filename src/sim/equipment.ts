/**
 * Equipment (docs/11 M0 item 5, ADR-0021) — the catalog shape for a piece of gear.
 *
 * HORIZONTAL BY CONSTRUCTION, which is the whole decision (ADR-0021 decision 3).
 * There is no weapon-power ladder: gear differs in FORMULA, ELEMENT, evasion and
 * Brave/Faith, not in a rising `wp` that makes late gear strictly better than early
 * gear. Two measurements forced that and both are in the ADR — a WP ladder pushes
 * builds out of the `docs/07` §3 time-to-kill band (0/15 → 6/15 outside, at WP 8 →
 * 16), and it is not even uniform across archetypes, since `bareHands` has no `wp`
 * term at all while `wpWp` is quadratic in it.
 *
 * WHY `wp` STILL EXISTS ON A HORIZONTAL ITEM. The five weapon formulas scale
 * differently, so identical damage across them needs DIFFERENT `wp` values, not
 * equal ones. `wp` here is a per-formula calibration constant, not a tier — and
 * `equipment.test.ts` holds it to that by asserting the shipped catalog's reference
 * damage stays inside a band rather than climbing. A ladder would pass a test that
 * only checked each item parsed.
 *
 * PURE + no IO + no RNG: a catalog entry, indexed by `content.ts` like every other.
 */

import { z } from "zod";
import { ElementSchema, WeaponFormulaSchema } from "./state.js";

// Local, like every other schema module here: `state.ts` keeps these private, and
// re-exporting a primitive just to share it widens that module's surface for nothing.
const IntSchema = z.number().int();
const PercentSchema = IntSchema.min(0).max(100);

/**
 * Which chassis slot an item occupies. Only `weapon` ships in M0 — shield and
 * accessory are named here because `EvasionSchema` already carries `shieldEv` and
 * `accessoryEv`, so leaving them out of the ENUM would make a later addition look
 * like a schema change when it is authoring. Nothing may be authored into them
 * yet; the loader rejects it, so an unfillable slot cannot ship looking filled.
 */
export const EquipSlotSchema = z.enum(["weapon", "shield", "accessory"]);
export type EquipSlot = z.infer<typeof EquipSlotSchema>;

/** Slots a player can actually fill in this build. */
export const LIVE_EQUIP_SLOTS: readonly EquipSlot[] = ["weapon"];

/**
 * One piece of gear.
 *
 * `brave` / `faith` are SHIFTS (signed, applied to the record's value and clamped
 * by the build), because `docs/03` asks for Faith-dropping gear as counterplay —
 * an absolute value would make two items unstackable in a way the fiction does not
 * support, and would silently overwrite a unit's authored personality stat.
 */
export const EquipmentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slot: EquipSlotSchema,
    /**
     * The basic attack this weapon produces. Required on a `weapon`, forbidden on
     * any other slot — a shield that silently carried a swing would be a second,
     * invisible weapon.
     */
    weapon: z
      .object({
        wp: IntSchema.min(0),
        formula: WeaponFormulaSchema,
        element: ElementSchema,
        accuracy: PercentSchema,
      })
      .strict()
      .optional(),
    /** Physical evasion this item grants, folded onto the built unit's `weaponEv`. */
    weaponEv: PercentSchema.optional(),
    /** Signed Brave shift (docs/03 #10's counterplay axis). */
    brave: IntSchema.optional(),
    /** Signed Faith shift — the Faith-dropping gear `docs/03` #10 asks for. */
    faith: IntSchema.optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine((e) => (e.slot === "weapon") === (e.weapon !== undefined), {
    message: "a weapon item must carry `weapon`, and a non-weapon item must not",
    path: ["weapon"],
  });
export type Equipment = z.infer<typeof EquipmentSchema>;
