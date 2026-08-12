/**
 * Content registry / loader (docs/05 §6, AC-R2) — the first data-driven content
 * layer. A content pack (jobs + abilities + statuses) is authored as external
 * data; this module validates it, enforces referential integrity, and indexes it
 * into a frozen, loud-failing registry.
 *
 * PURE + no IO: the caller passes already-parsed JSON (`unknown`); this never
 * reads a file. It has its OWN schema-version line (`CONTENT_SCHEMA_VERSION`),
 * independent of the battle `SCHEMA_VERSION` and the roster version (ADR-0011):
 * a content-only edit never forces a battle-save migration. Version handling
 * mirrors `state.ts:deserialize` — loud fail on an unsupported version, never a
 * silent/partial load.
 *
 * Determinism note: lookups fail loudly on a missing id (throw, never
 * undefined-then-assert), and all integrity iteration walks the authored arrays
 * (stable order), never Map/Set iteration — so the loader is order-independent.
 */

import { z } from "zod";
import { AbilitySchema, type Ability } from "./ability.js";
import { JobSchema, type Job } from "./job.js";
import { StatusEffectSchema, type StatusEffect } from "./status.js";
import { TraitSchema, type Trait } from "./trait.js";

/** Current content-pack schema version. Bump when any catalog shape changes. */
export const CONTENT_SCHEMA_VERSION = 2;

/** Oldest content schemaVersion we still know how to migrate forward. */
export const MIN_SUPPORTED_CONTENT_SCHEMA_VERSION = 1;

/**
 * Skillsets that abilities may reference without belonging to any job's
 * `primarySkillset` — the universally-available commands (Attack/Wait basics)
 * and the cross-job Item skill. Kept small on purpose; content-author extends
 * it only for genuinely job-independent skillsets.
 */
export const BASELINE_SKILLSETS: readonly string[] = ["basic", "item"];

/** A content migration transforms a parsed pack one schema version forward. */
export type ContentMigration = (pack: Record<string, unknown>) => Record<string, unknown>;

/**
 * v1 → v2: the mastery-trait catalog landed (traits gained stat effects). A v1
 * pack has no `traits` array — its traits were bare identifier strings referenced
 * only by `job.masteryBonus.trait`. Synthesize a ZERO-EFFECT entry (`{id, effect:
 * {}}`) for every DISTINCT trait id found across the jobs, preserving the legacy
 * behavior (inert traits) exactly. Pure: walks the authored `jobs` array in stable
 * order, never mutating the input.
 */
function migrateContentV1toV2(pack: Record<string, unknown>): Record<string, unknown> {
  const jobs = Array.isArray(pack["jobs"]) ? (pack["jobs"] as unknown[]) : [];
  const seen = new Set<string>();
  const traits: Array<{ id: string; effect: Record<string, never> }> = [];
  for (const job of jobs) {
    if (typeof job !== "object" || job === null) continue;
    const mastery = (job as Record<string, unknown>)["masteryBonus"];
    if (typeof mastery !== "object" || mastery === null) continue;
    const traitId = (mastery as Record<string, unknown>)["trait"];
    if (typeof traitId === "string" && !seen.has(traitId)) {
      seen.add(traitId);
      traits.push({ id: traitId, effect: {} });
    }
  }
  return { ...pack, traits, contentSchemaVersion: 2 };
}

/**
 * Migration registry: `CONTENT_MIGRATIONS[v]` upgrades a pack from version `v`
 * to `v + 1`. Each content-schema bump registers here.
 */
export const CONTENT_MIGRATIONS: Readonly<Record<number, ContentMigration>> = {
  1: migrateContentV1toV2,
};

/** Thrown when a content pack's schemaVersion is missing or unsupported. */
export class ContentSchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentSchemaVersionError";
  }
}

/** Thrown when a valid-shaped pack fails referential integrity (dangling ref / dup id). */
export class ContentIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentIntegrityError";
  }
}

/** A validated content pack (shape only — integrity is checked by the loader). */
export const ContentPackSchema = z
  .object({
    contentSchemaVersion: z.number().int(),
    jobs: z.array(JobSchema),
    abilities: z.array(AbilitySchema),
    statuses: z.array(StatusEffectSchema),
    traits: z.array(TraitSchema),
  })
  .strict();
export type ContentPack = z.infer<typeof ContentPackSchema>;

/**
 * Immutable, indexed view over a loaded pack. The `*ById` maps are frozen; the
 * lookup helpers throw {@link ContentIntegrityError} on a missing id rather than
 * returning `undefined` (respecting `noUncheckedIndexedAccess` at every call site).
 */
export interface ContentRegistry {
  readonly jobById: ReadonlyMap<string, Job>;
  readonly abilityById: ReadonlyMap<string, Ability>;
  readonly statusById: ReadonlyMap<string, StatusEffect>;
  readonly traitById: ReadonlyMap<string, Trait>;
  job(id: string): Job;
  ability(id: string): Ability;
  status(id: string): StatusEffect;
  trait(id: string): Trait;
}

/** Index `items` by `id`, rejecting duplicates with a clear error. */
function indexById<T extends { id: string }>(items: readonly T[], kind: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) {
      throw new ContentIntegrityError(`duplicate ${kind} id: "${item.id}"`);
    }
    map.set(item.id, item);
  }
  return map;
}

/** Make a Map runtime-immutable: shadow its mutators to throw, then freeze it. */
function freezeMap<K, V>(map: Map<K, V>): ReadonlyMap<K, V> {
  const block = (): never => {
    throw new TypeError("content registry Map is immutable");
  };
  map.set = block;
  map.delete = block;
  map.clear = block;
  return Object.freeze(map);
}

/** Build a loud-failing lookup over a frozen index. */
function makeLookup<T>(map: ReadonlyMap<string, T>, kind: string): (id: string) => T {
  return (id: string): T => {
    const found = map.get(id);
    if (found === undefined) {
      throw new ContentIntegrityError(`unknown ${kind} id: "${id}"`);
    }
    return found;
  };
}

/** Enforce every cross-reference in a shape-valid pack (docs/05 §6 integrity). */
function checkReferentialIntegrity(
  pack: ContentPack,
  abilityById: ReadonlyMap<string, Ability>,
  statusById: ReadonlyMap<string, StatusEffect>,
  traitById: ReadonlyMap<string, Trait>,
): void {
  // Known skillsets = baseline allowlist + every job's primary skillset.
  const knownSkillsets = new Set<string>(BASELINE_SKILLSETS);
  for (const job of pack.jobs) knownSkillsets.add(job.primarySkillset);

  for (const ability of pack.abilities) {
    if (!knownSkillsets.has(ability.skillset)) {
      throw new ContentIntegrityError(
        `ability "${ability.id}" references unknown skillset "${ability.skillset}" ` +
          `(not any job's primarySkillset nor a baseline skillset)`,
      );
    }
    for (const statusId of ability.inflicts ?? []) {
      if (!statusById.has(statusId)) {
        throw new ContentIntegrityError(
          `ability "${ability.id}" inflicts unknown status id "${statusId}"`,
        );
      }
    }
    // A supportEffect is read ONLY from the equipped SUPPORT slot (build.ts), so
    // authoring one on any other ability type would silently do nothing — exactly
    // the dead-slot class of defect this field exists to end (ADR-0017). Fail loud.
    if (ability.supportEffect !== undefined && ability.type !== "support") {
      throw new ContentIntegrityError(
        `ability "${ability.id}" declares a supportEffect but has type "${ability.type}" ` +
          `(only a "support" ability's effect is ever applied)`,
      );
    }
  }

  for (const job of pack.jobs) {
    if (!traitById.has(job.masteryBonus.trait)) {
      throw new ContentIntegrityError(
        `job "${job.id}" masteryBonus references unknown trait id "${job.masteryBonus.trait}"`,
      );
    }
  }

  for (const job of pack.jobs) {
    const nodeIds = new Set<string>();
    for (const node of job.tree) {
      if (nodeIds.has(node.node)) {
        throw new ContentIntegrityError(
          `job "${job.id}" has duplicate skill-tree node id "${node.node}"`,
        );
      }
      nodeIds.add(node.node);
    }
    for (const node of job.tree) {
      if (!abilityById.has(node.ability)) {
        throw new ContentIntegrityError(
          `job "${job.id}" tree node "${node.node}" references unknown ability id "${node.ability}"`,
        );
      }
      for (const req of node.requires) {
        if (!nodeIds.has(req)) {
          throw new ContentIntegrityError(
            `job "${job.id}" tree node "${node.node}" requires unknown node id "${req}"`,
          );
        }
      }
    }
  }
}

/**
 * Validate + index a content pack into a {@link ContentRegistry}.
 *
 * Steps: version gate (loud fail, mirrors `deserialize`) → forward migrations →
 * Zod shape validation (`.strict()` rejects unknown keys) → duplicate-id
 * indexing → referential-integrity checks → freeze. Throws
 * {@link ContentSchemaVersionError} for version problems and
 * {@link ContentIntegrityError} for structural ones — never returns a partial
 * registry. PURE: no IO, no globals, no nondeterminism.
 */
export function loadContentPack(raw: unknown): ContentRegistry {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ContentSchemaVersionError("content pack must be a JSON object");
  }

  let obj = raw as Record<string, unknown>;
  const version = obj["contentSchemaVersion"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new ContentSchemaVersionError(
      "content pack is missing an integer contentSchemaVersion",
    );
  }
  if (version > CONTENT_SCHEMA_VERSION) {
    throw new ContentSchemaVersionError(
      `content schemaVersion ${version} is newer than this build supports ` +
        `(${CONTENT_SCHEMA_VERSION}); update the game`,
    );
  }
  if (version < MIN_SUPPORTED_CONTENT_SCHEMA_VERSION) {
    throw new ContentSchemaVersionError(
      `content schemaVersion ${version} is older than the minimum supported ` +
        `(${MIN_SUPPORTED_CONTENT_SCHEMA_VERSION})`,
    );
  }
  for (let v = version; v < CONTENT_SCHEMA_VERSION; v++) {
    const migrate = CONTENT_MIGRATIONS[v];
    if (!migrate) {
      throw new ContentSchemaVersionError(
        `no content migration registered from schemaVersion ${v} to ${v + 1}`,
      );
    }
    obj = migrate(obj);
  }

  const pack = ContentPackSchema.parse(obj);

  const jobById = indexById(pack.jobs, "job");
  const abilityById = indexById(pack.abilities, "ability");
  const statusById = indexById(pack.statuses, "status");
  const traitById = indexById(pack.traits, "trait");

  checkReferentialIntegrity(pack, abilityById, statusById, traitById);

  const frozenJobs = freezeMap(jobById);
  const frozenAbilities = freezeMap(abilityById);
  const frozenStatuses = freezeMap(statusById);
  const frozenTraits = freezeMap(traitById);

  return Object.freeze({
    jobById: frozenJobs,
    abilityById: frozenAbilities,
    statusById: frozenStatuses,
    traitById: frozenTraits,
    job: makeLookup(frozenJobs, "job"),
    ability: makeLookup(frozenAbilities, "ability"),
    status: makeLookup(frozenStatuses, "status"),
    trait: makeLookup(frozenTraits, "trait"),
  });
}
