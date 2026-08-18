/**
 * MOVEMENT-slot effect schema + fold (docs/02 §2, the 5-slot ability chassis) —
 * the LAST of the five chassis slots to gain real effects, after mastery traits
 * (`trait.ts`), the ability chassis itself, the equipped support (`support.ts`,
 * ADR-0017) and the equipped reaction (`reaction.ts`, ADR-0019).
 *
 * IT WENT LAST BECAUSE IT WAS NOT A SLOT PROBLEM AT ALL. The fold below is one
 * addition onto a derived stat, and it was written and run once before this slice:
 * it dropped the diversity score 7 → 5 and failed the gate. Every caster collapsed
 * and no build improved anywhere. The cause was in `ai.ts` — the balance probe
 * enumerated every reachable tile, priced the ACT available from each, and had no
 * term for how exposed the tile was, so low `move` had been keeping fragile builds
 * alive by accident. Extra Move was pure rope. ADR-0020 has the trace, the three
 * candidate fixes that were measured, and why "just don't move" is not one of them.
 *
 * So this module ships TOGETHER WITH the probe's exposure term, never before it.
 * `ai.test.ts` holds the pairing: with exposure weighed, more Move stops making a
 * fragile actor more exposed.
 *
 * DEPENDENCY-FREE at runtime except `trait.ts` (itself dependency-free), so this
 * module can never form a Zod module-eval (TDZ) cycle with the schemas that consume
 * it. The live import chain is build → movement → trait → ∅.
 *
 * DELIBERATELY NO `speed` KEY (ADR-0012, AC-P5), for the same reason `trait.ts` and
 * `support.ts` have none: no chassis slot may alter a unit's CT accrual. Move is
 * DISTANCE per turn; Speed is TURNS per tick. `.strict()` rejects an authored
 * `speed` rather than trusting convention.
 *
 * DELIBERATELY NO `jump` KEY EITHER, and that absence is load-bearing: nothing in
 * the shipped pack authors one. The only candidate is `geomancy.terrain-stride`,
 * which stays deferred because its ignore-terrain half has no mechanism (impassable
 * is binary in `Tile.passable`). An optional field no content fills is a capability
 * no test can prove — the exact shape this slot spent three slices being. Add `jump`
 * in the slice that authors it.
 */

import { z } from "zod";
import { MoveModSchema } from "./trait.js";

/**
 * The effects an EQUIPPED movement ability applies at battle-start. One field
 * today; optional so an omitted key leaves its target untouched (absent-not-zero).
 */
export const MovementEffectSchema = z.object({ move: MoveModSchema.optional() }).strict();
export type MovementEffect = z.infer<typeof MovementEffectSchema>;

/**
 * Fold one movement `effect` onto a derived `move`: `move + flat`, clamped to ≥ 0 so
 * the projection is schema-valid at BUILD time rather than only failing at
 * serialize/rewind (the build-time clamp rule in `src/sim/CLAUDE.md`).
 *
 * `undefined` (no movement equipped, or one that is still deferred) returns `move`
 * UNCHANGED — the no-op that keeps every movement-less build byte-identical to the
 * pre-layer build, exactly as `applySupportEffect` does for its own slot.
 *
 * Pure: no mutation, no RNG, no clock.
 */
export function applyMovementEffect(move: number, effect: MovementEffect | undefined): number {
  if (effect === undefined) return move;
  return Math.max(0, move + (effect.move?.flat ?? 0));
}
