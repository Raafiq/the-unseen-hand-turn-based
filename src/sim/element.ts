/**
 * Damage element enum — extracted into its own leaf module so BOTH `state.ts`
 * (weapon/charge/unit schemas) and `ability.ts` (ability projection) can import
 * it without forming a load-time cycle. Before v5, `ability.ts` imported
 * `ElementSchema` from `state.ts`; once `state.ts` began embedding
 * `BattleAbilitySchema` (from `ability.ts`) on `UnitStateSchema`, that would
 * have made state → ability → state — and because Zod builds these object
 * schemas at module-eval time, one side's enum binding would be in its
 * temporal dead zone. Pulling `ElementSchema` down here (it depends only on
 * `zod`) breaks the cycle: element ← state, element ← ability, state → ability.
 *
 * `state.ts` re-exports `ElementSchema`/`Element`, so every existing
 * `import { ElementSchema } from "./state.js"` keeps working unchanged.
 */

import { z } from "zod";

/** Damage element (routes elemental modifiers; "none" is the pass-through default). */
export const ElementSchema = z.enum([
  "none", "fire", "ice", "lightning", "water", "earth", "wind", "holy", "dark",
]);
export type Element = z.infer<typeof ElementSchema>;
