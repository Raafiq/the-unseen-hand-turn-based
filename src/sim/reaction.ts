/**
 * REACTION-slot effect schemas + the trigger predicate (docs/02 §2, the 5-slot
 * ability chassis) — the fourth axis of the customization spine to gain real
 * effects, after mastery traits (`trait.ts`), the ability chassis itself, and the
 * equipped support (`support.ts`, ADR-0017).
 *
 * WHY THIS EXISTS. Until this slice `build.ts` projected ACTION abilities and the
 * equipped SUPPORT only: the reaction and movement slots were validated at equip
 * time by `loadout.ts` and then ignored. SEVEN of fifteen shipped builds equipped a
 * reaction that did nothing — including `bld-counter-wall`, whose entire identity IS
 * the counter, and which the diversity gate had to EXCLUDE for exactly that reason.
 * That is the same defect the support slot carried for two slices before ADR-0017
 * found it (root CLAUDE.md, "a capability that validates its input and then discards
 * it reads as working"). See ADR-0019.
 *
 * DEPENDENCY-FREE at runtime (Zod only), like `trait.ts`, so this module can never
 * form a Zod module-eval (TDZ) cycle with the schemas that consume it. The live
 * import chain is state → ability → {support, reaction} → ∅. Everything here that
 * needs unit data takes PRIMITIVES, never a `UnitState` — the predicates that need a
 * unit live in `resolve.ts`, on the other side of that boundary.
 *
 * THE TRIGGER CHANCE IS BRAVE, AND IS NOT AUTHORABLE. docs/01 §4: "Brave sets
 * Reaction ability trigger chance (Brave% ≈ activation odds)". Every Brave-based
 * reaction in FFT uses the raw stat, so {@link ReactionEffectSchema} carries no
 * chance field: a per-ability multiplier would be a balance knob the design does not
 * ask for, and inventing one would make the FIRST authored value the de-facto spec.
 */

import { z } from "zod";

/**
 * How an equipped reaction answers an incoming blow. Two kinds, distinguished by
 * WHEN they resolve relative to the blow that woke them (docs/05 §2 steps b/e):
 *
 *   - `counter`    — POST-apply. The blow lands in full; the reactor then strikes
 *                    back once (docs/05 §2 step e, "on-hit/on-damage reactions").
 *   - `preemptive` — PRE-apply (Hamedo). The reactor strikes FIRST and the incoming
 *                    blow is cancelled outright — no damage, no KO, no status
 *                    (docs/05 §2 step b, the reaction pre-check).
 *
 * DELIBERATELY NOT AN OPEN SET. A `reraise`/`revive` kind is NOT here because the
 * engine cannot revive anything (see {@link DEFERRED_REACTION_EFFECTS}); adding the
 * enum member without the mechanism would be the dead-slot defect one level up.
 */
export const ReactionKindSchema = z.enum(["counter", "preemptive"]);
export type ReactionKind = z.infer<typeof ReactionKindSchema>;

/**
 * What an EQUIPPED `type: "reaction"` ability does, as AUTHORED in a content pack.
 * A single discriminant today — see the module docstring for why the trigger chance
 * is not a field. Kept as an object rather than a bare enum so a future kind can
 * carry its own parameters without a content migration.
 */
export const ReactionEffectSchema = z.object({ kind: ReactionKindSchema }).strict();
export type ReactionEffect = z.infer<typeof ReactionEffectSchema>;

/**
 * The equipped reaction as PROJECTED onto a battle unit (`UnitState.reaction`).
 * Self-contained for the ADR-0010/ADR-0011 reason the rest of the projection is: a
 * resolver must never read the content registry, or `replay` stops being a pure
 * function of `(seed, commands)`.
 *
 * `abilityId` is carried (not just the kind) because the driver credits a fired
 * reaction to the REACTOR under this id — which is what makes a landed counter count
 * as a signature action for the diversity gate. Drop it and the capability would work
 * and still measure as nothing.
 */
export const ReactionStateSchema = z
  .object({ abilityId: z.string().min(1), kind: ReactionKindSchema })
  .strict();
export type ReactionState = z.infer<typeof ReactionStateSchema>;

/**
 * Reaction abilities that are authored but INTENTIONALLY have no effect yet, each
 * mapped to the NAMED capability that would unblock it. Mirrors
 * `DEFERRED_SUPPORT_EFFECTS` and the diversity gate's `EXCLUDED` manifest (ADR-0014):
 * a reaction is never silently inert — it is either effect-bearing or listed here
 * with a reason. `reaction.test.ts` asserts this partitions the shipped pack's
 * reaction abilities EXACTLY, in BOTH directions (an un-listed inert reaction fails,
 * and so does a STALE entry for one that has since gained an effect).
 */
export const DEFERRED_REACTION_EFFECTS: Readonly<Record<string, string>> = {
  "white-magic.reraise":
    "reviving a downed unit is unmodeled anywhere in the sim — every resolver refuses a target at 0 HP, `punch-art.revive`/`white-magic.raise` are `heal` formulas that cannot reach one, and the crystal countdown (docs/01 §11) has no reverse",
  "white-magic.retribution":
    "counters a MAGIC blow with a holy strike; the counter-swing is the reactor's own basic attack, which is weapon-derived and always physical — this needs an ability-sourced counter-swing, not a new kind",
  "steal.gilgame-heart":
    "gil-on-being-hit is post-battle economy (docs/07), outside the battle-state modifier layers entirely — the same blocker as `steal.secret-hunt` in DEFERRED_SUPPORT_EFFECTS",
};

/**
 * NO GEOMETRY LIVES HERE. A reaction's reach IS the reactor's own basic-attack range
 * (docs/01 §9: Counter triggers only when the attacker stands inside the counterer's
 * attack range), and that question is already answered by `grid.ts`'s
 * `inAbilityRange` — the same gate the driver uses to reject an out-of-range act.
 * `resolve.ts` calls it directly rather than re-deriving reach here, so a reaction can
 * never disagree with the engine about who is adjacent.
 */
