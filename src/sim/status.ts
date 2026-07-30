/**
 * Status-effect catalog (docs/05 §6). Per ADR-0011: status BEHAVIOR = code,
 * status TUNING = data. This module is the tunable CATALOG only — durations, CT
 * factor, dispellability, and behavior discriminant flags. The *reading* of a
 * status (its CT factor in the scheduler, its interrupt rule in charge
 * resolution) stays in code and is NOT implemented here; at inflict time the
 * resolved behavior is copied onto a self-contained per-unit status so a
 * running/replayed battle never needs this catalog.
 *
 * PURE DATA: no scheduler/charge logic in this file.
 */

import { z } from "zod";

const IntSchema = z.number().int();

/** Buff = beneficial, Debuff = harmful. Drives UI grouping + some AI heuristics. */
export const StatusKindSchema = z.enum(["buff", "debuff"]);
export type StatusKind = z.infer<typeof StatusKindSchema>;

/**
 * Status catalog record (docs/05 §6). `ctFactor` multiplies the affected unit's
 * CT accrual — 1.0 means no change, >1 = faster (Haste), <1 = slower (Slow), 0 =
 * Stop; the scheduler reads it (docs/05 §1b), this only stores it. `durationCT`
 * is the lifetime in CT units (0 = instantaneous/permanent-until-cured semantics
 * handled by the resolver). The optional behavior flags are discriminants the
 * sim reads; omitted ⇒ false, honoring `exactOptionalPropertyTypes`.
 */
export const StatusEffectSchema = z
  .object({
    id: z.string().min(1),
    kind: StatusKindSchema,
    /** CT-accrual multiplier; 1.0 = neutral (docs/05 §1b). */
    ctFactor: z.number(),
    durationCT: IntSchema.min(0),
    dispellable: z.boolean(),
    /** Unit cannot declare actions while afflicted (Stop/Sleep/Don't-Act). */
    preventsAction: z.boolean().optional(),
    /** Afflicting mid-charge cancels the charge (docs/05 §2 interrupt check). */
    interruptsCharge: z.boolean().optional(),
    /** Interrupt applies to magic charges only (e.g. Silence). */
    interruptsMagicOnly: z.boolean().optional(),
  })
  .strict();
export type StatusEffect = z.infer<typeof StatusEffectSchema>;
