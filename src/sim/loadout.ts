/**
 * The 5-slot ability chassis + free respec (docs/02, AC-J1/J4) — the equip-time
 * customization axis of the spine. A {@link Loadout} is stored ON the persistent
 * {@link UnitRecord} (roster.ts); these functions read/write it PURELY.
 *
 * The five equip axes (docs/02 §chassis):
 *   - Primary   — the current job's whole command. DERIVED from `currentJob`
 *                 ({@link primaryCommand}); NEVER stored or settable, so it can
 *                 never drift from the active job.
 *   - Secondary — ANY OTHER learned job's whole command, stored as a JOB id (not a
 *                 single ability). Equipping "black-magic" grants every learned
 *                 black-magic action ({@link equippedSecondaryAbilities}).
 *   - Reaction / Support / Movement — exactly ONE learned ability id each, whose
 *                 authored `type` matches the slot.
 *   - Traits    — up to TWO earned mastery-trait strings.
 *
 * AC-J4 (free respec): every mutator here returns a NEW record touching ONLY the
 * loadout — never `ap`, never `learned`/`mastered`. There is no resource cost and
 * no inverse to undo (swapping back to the prior value is a full round-trip). This
 * is the "permanent progress, free experiments" contract (CLAUDE.md locked
 * decision): loadout swaps are always free and always reversible.
 *
 * IMPORT DIRECTION (no runtime cycle): roster.ts imports {@link LoadoutSchema} /
 * {@link emptyLoadout} from here at RUNTIME (the record schema embeds the loadout
 * schema). This module imports `UnitRecord`, `ContentRegistry`, and `Ability` ONLY
 * as TYPES (`import type`, erased at compile time), so the runtime dependency is
 * one-way roster → loadout with no cycle.
 *
 * PURE + headless: no RNG, no wall-clock, no IO, no mutation.
 */

import { z } from "zod";
import type { Ability } from "./ability.js";
import type { ContentRegistry } from "./content.js";
import type { UnitRecord } from "./roster.js";

/**
 * The settable equip slots. Primary is deliberately ABSENT — it is derived from
 * `currentJob`, not stored — and traits are handled by their own mutator
 * ({@link setLoadoutTraits}), not this enum.
 */
export const LoadoutSlotSchema = z.enum(["secondary", "reaction", "support", "movement"]);
export type LoadoutSlot = z.infer<typeof LoadoutSlotSchema>;

/**
 * The stored 5-slot chassis (minus the derived Primary). `null` = an empty slot.
 * `secondary` holds a JOB id (a whole command); `reaction`/`support`/`movement`
 * each hold a single ABILITY id. `traits` holds up to TWO earned trait strings
 * (`.max(2)` is the cardinality guard from AC-J1).
 */
export const LoadoutSchema = z
  .object({
    /** Job id whose whole command is equipped as the secondary, or null. */
    secondary: z.string().min(1).nullable(),
    /** Reaction ability id, or null. */
    reaction: z.string().min(1).nullable(),
    /** Support ability id, or null. */
    support: z.string().min(1).nullable(),
    /** Movement ability id, or null. */
    movement: z.string().min(1).nullable(),
    /** Up to two earned mastery-trait strings. */
    traits: z.array(z.string().min(1)).max(2),
  })
  .strict();
export type Loadout = z.infer<typeof LoadoutSchema>;

/** An all-empty loadout (the default for a fresh/migrated record). */
export function emptyLoadout(): Loadout {
  return { secondary: null, reaction: null, support: null, movement: null, traits: [] };
}

/**
 * The DERIVED Primary command: the current job's whole `primarySkillset`. There is
 * no setter — the Primary is always exactly the active job's command, so it can
 * never be equipped stale (AC-J1).
 */
export function primaryCommand(record: UnitRecord, registry: ContentRegistry): string {
  return registry.job(record.currentJob).primarySkillset;
}

/** The three single-ability slots, used for the mutual-exclusion scan. */
const ABILITY_SLOTS = ["reaction", "support", "movement"] as const;

/**
 * Reject if equipping `abilityId` into `slot` would violate a mutual-exclusion
 * (AC-J6 hook): either the incoming ability's `excludes` names an already-equipped
 * ability in another single-ability slot, or an equipped ability's `excludes`
 * names the incoming one. Content need not populate `excludes` yet — it is an
 * optional field (ability.ts), so with today's `data/base-pack.json` (no
 * `excludes`) this check never fires. The relationship is treated as symmetric:
 * declaring it on EITHER ability is enough to block co-equipping.
 */
function assertNoExclusionConflict(
  record: UnitRecord,
  slot: LoadoutSlot,
  abilityId: string,
  incoming: Ability,
  registry: ContentRegistry,
): void {
  for (const other of ABILITY_SLOTS) {
    if (other === slot) continue;
    const equippedId = record.loadout[other];
    if (equippedId === null) continue;
    const equipped = registry.ability(equippedId);
    if (incoming.excludes?.includes(equippedId) || equipped.excludes?.includes(abilityId)) {
      throw new Error(
        `cannot equip ability "${abilityId}" in the ${slot} slot: it is mutually ` +
          `exclusive with the equipped "${equippedId}" (${other} slot)`,
      );
    }
  }
}

/**
 * Set one equip slot to `value` (an id) or `null` (un-equip), returning a NEW
 * record whose ONLY change is `loadout[slot]` (AC-J4: `ap`/`learned`/`mastered`
 * are untouched, and the swap is fully reversible). Validation per slot:
 *
 *   - secondary: `value` is a job id that (a) exists, (b) is NOT `currentJob`
 *     (the current job IS the Primary), and (c) the unit has learned ≥1 ACTION
 *     ability in that job's `primarySkillset`.
 *   - reaction/support/movement: `value` is a learned ability id whose authored
 *     `type` equals the slot, and which passes the excludes check.
 *
 * `null` always clears a slot. Throws a clear Error on any violation.
 */
export function setLoadoutSlot(
  record: UnitRecord,
  slot: LoadoutSlot,
  value: string | null,
  registry: ContentRegistry,
): UnitRecord {
  if (value !== null) {
    if (slot === "secondary") {
      if (value === record.currentJob) {
        throw new Error(
          `cannot equip current job "${value}" as a secondary command (it is the Primary)`,
        );
      }
      // Throws a clear "unknown job id" error if the id is not a real job.
      const job = registry.job(value);
      const hasLearnedAction = record.learned.some((abId) => {
        const ability = registry.ability(abId);
        return ability.type === "action" && ability.skillset === job.primarySkillset;
      });
      if (!hasLearnedAction) {
        throw new Error(
          `cannot equip job "${value}" as secondary: no learned action ability in its ` +
            `command "${job.primarySkillset}"`,
        );
      }
    } else {
      // reaction / support / movement: the slot name IS the required ability type.
      const ability = registry.ability(value); // throws on unknown id
      if (ability.type !== slot) {
        throw new Error(
          `cannot equip ability "${value}" (type "${ability.type}") in the ${slot} slot`,
        );
      }
      if (!record.learned.includes(value)) {
        throw new Error(`cannot equip unlearned ability "${value}" in the ${slot} slot`);
      }
      assertNoExclusionConflict(record, slot, value, ability, registry);
    }
  }

  return { ...record, loadout: { ...record.loadout, [slot]: value } };
}

/**
 * Replace the equipped traits, returning a NEW record touching only
 * `loadout.traits` (AC-J4: free + reversible). Validates `traits.length <= 2` and
 * that every trait is EARNED — equal to `masteryBonus.trait` of some job in
 * `record.mastered`. Throws a clear Error otherwise.
 */
export function setLoadoutTraits(
  record: UnitRecord,
  traits: string[],
  registry: ContentRegistry,
): UnitRecord {
  if (traits.length > 2) {
    throw new Error(`cannot equip ${traits.length} traits: at most 2 are allowed`);
  }
  const earned = new Set(record.mastered.map((jobId) => registry.job(jobId).masteryBonus.trait));
  for (const trait of traits) {
    if (!earned.has(trait)) {
      throw new Error(`cannot equip trait "${trait}": no mastered job grants it`);
    }
  }
  return { ...record, loadout: { ...record.loadout, traits: [...traits] } };
}

/**
 * The learned ACTION abilities reachable through the equipped secondary command
 * (skillset === the secondary job's `primarySkillset`). Returns `[]` when no
 * secondary is equipped. Consumed by the later combat-wiring slice to expand the
 * secondary command into castable actions.
 */
export function equippedSecondaryAbilities(
  record: UnitRecord,
  registry: ContentRegistry,
): Ability[] {
  const secondary = record.loadout.secondary;
  if (secondary === null) return [];
  const skillset = registry.job(secondary).primarySkillset;
  const abilities: Ability[] = [];
  for (const abId of record.learned) {
    const ability = registry.ability(abId);
    if (ability.type === "action" && ability.skillset === skillset) {
      abilities.push(ability);
    }
  }
  return abilities;
}
