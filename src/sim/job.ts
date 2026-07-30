/**
 * Job catalog schemas (docs/05 §6) — the AP-driven job/skill-tree axis of the
 * customization spine (ADR-0001, docs/02). Authored data; PURE shapes only.
 *
 * The per-stat growth multipliers here are the tunable C-values fft-fidelity is
 * verifying (docs/01 §12). This module fixes only their SHAPE — no numeric
 * values are hard-coded in the schema (they live in authored packs + golden
 * vectors, never inline in code, per CLAUDE.md).
 */

import { z } from "zod";
import { GenderSchema } from "./state.js";

const IntSchema = z.number().int();

/**
 * One node in a job's AP skill tree (docs/05 §6). `node` is the tree-local id;
 * `ability` is the ability id it unlocks; `requires` lists prerequisite node ids
 * within the SAME tree (referential integrity is enforced by the loader).
 */
export const SkillTreeNodeSchema = z
  .object({
    node: z.string().min(1),
    ability: z.string().min(1),
    apCost: IntSchema.min(0),
    requires: z.array(z.string().min(1)),
  })
  .strict();
export type SkillTreeNode = z.infer<typeof SkillTreeNodeSchema>;

/**
 * Per-stat growth multipliers (docs/05 §4 stat-derivation, docs/01 §12). Values
 * are the tunable growth C-values — schema fixes only that each is a positive
 * number; the actual tuning is authored data verified by fft-fidelity.
 */
export const StatGrowthSchema = z
  .object({
    pa: z.number().positive(),
    ma: z.number().positive(),
    speed: z.number().positive(),
    hp: z.number().positive(),
    mp: z.number().positive(),
  })
  .strict();
export type StatGrowth = z.infer<typeof StatGrowthSchema>;

/** The permanent trait granted on mastering a job (docs/02, ADR-0001). */
export const MasteryBonusSchema = z.object({ trait: z.string().min(1) }).strict();
export type MasteryBonus = z.infer<typeof MasteryBonusSchema>;

/**
 * Job record (docs/05 §6). `genderLock` is nullable: `null` = no lock, a
 * {@link GenderSchema} value = restricted to that gender. `requires` is RESERVED
 * for P3 hybrid/fusion jobs (the two parent job ids); base jobs omit it. Its
 * shape is validated when present but hybrids are not otherwise modeled yet.
 */
export const JobSchema = z
  .object({
    id: z.string().min(1),
    primarySkillset: z.string().min(1),
    genderLock: GenderSchema.nullable(),
    growth: StatGrowthSchema,
    tree: z.array(SkillTreeNodeSchema),
    masteryBonus: MasteryBonusSchema,
    /** [DEFERRED P3] hybrid parents [jobA, jobB]; omit for base jobs. */
    requires: z.tuple([z.string().min(1), z.string().min(1)]).optional(),
  })
  .strict();
export type Job = z.infer<typeof JobSchema>;
