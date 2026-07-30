/**
 * Roster / persistent campaign record (docs/05 §6, AC-J2/J3/J7) — the durable
 * "Unit save record" that outlives any single battle. This is the customization
 * spine's PERSISTENCE layer: learned abilities, mastered jobs, and the global AP
 * pool that funds the AP-driven job/skill trees (ADR-0001, docs/02).
 *
 * SEPARATE CODEC (ADR-0011): this file owns its OWN version line,
 * `ROSTER_SCHEMA_VERSION`, independent of the battle `SCHEMA_VERSION` (state.ts)
 * and the content `CONTENT_SCHEMA_VERSION` (content.ts). A unit-record shape
 * change never forces a battle-save or content-pack migration, and vice versa.
 * It does NOT touch BattleState — a UnitRecord is compiled INTO a battle unit at
 * deploy time by a later slice, never the reverse.
 *
 * PURE + no IO: callers pass/receive plain strings; this never reads a file.
 * Version handling mirrors `state.ts:deserialize` — loud fail on an unsupported
 * version, never a silent/partial load.
 *
 * Scope note: NO loadout/equipment fields yet. The 5-slot ability loadout lands
 * in Slice 3 (the 1→2 migration); equipment lands in Slice 4. `learned` /
 * `mastered` / `ap` here are the progression substrate those slices build on.
 */

import { z } from "zod";

/** Current on-disk unit-record schema version. Bump when UnitRecord shape changes. */
export const ROSTER_SCHEMA_VERSION = 1;

/** Oldest rosterSchemaVersion we still know how to migrate forward. */
export const MIN_SUPPORTED_ROSTER_SCHEMA_VERSION = 1;

const IntSchema = z.number().int();

/** 0–100 percentage stat (Brave/Faith), matching state.ts's internal PercentSchema. */
const PercentSchema = IntSchema.min(0).max(100);

/**
 * Un-multiplied RAW stats (docs/05 §4: "store raw and derived separately; never
 * mutate raw"). Derived combat stats (the growth-multiplied PA/MA/… a battle
 * unit fights with) are computed at deploy time from these + the job growth
 * curves — they are NOT stored here, so a job change can never corrupt raw.
 */
export const RawStatsSchema = z
  .object({
    pa: IntSchema.min(0),
    ma: IntSchema.min(0),
    speed: IntSchema.min(0),
    hp: IntSchema.min(0),
    mp: IntSchema.min(0),
  })
  .strict();
export type RawStats = z.infer<typeof RawStatsSchema>;

/**
 * The persistent unit save record (docs/05 §6). `ap` is a single GLOBAL pool per
 * unit (settled design): AP is spent ON the owning job's tree node (WHERE you
 * spend), but drawn from this one pool — there is no per-job JP wallet.
 * `learned` holds ability ids; `mastered` holds job ids. Both are permanent
 * (AC-J3): once written they are never removed by any function here.
 *
 * `rosterSchemaVersion` is stored INSIDE the record (parallel to the content
 * pack's `contentSchemaVersion`) so a bare record JSON is self-describing.
 */
export const UnitRecordSchema = z
  .object({
    rosterSchemaVersion: IntSchema,
    id: z.string().min(1),
    name: z.string(),
    level: IntSchema.min(1),
    /** The currently-active job id (its tree is where new AP spends land). */
    currentJob: z.string().min(1),
    raw: RawStatsSchema,
    brave: PercentSchema,
    faith: PercentSchema,
    /** Global AP pool (AC-J2): the ONLY currency `learnAbility` spends. */
    ap: IntSchema.min(0),
    /** Ability ids permanently learned (AC-J3: never removed). */
    learned: z.array(z.string().min(1)),
    /** Job ids permanently mastered (AC-J3: latching, never removed). */
    mastered: z.array(z.string().min(1)),
  })
  .strict();
export type UnitRecord = z.infer<typeof UnitRecordSchema>;

/** Thrown when a serialized record's rosterSchemaVersion is missing or unsupported. */
export class RosterSchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosterSchemaVersionError";
  }
}

/** A roster migration transforms a parsed record one schema version forward. */
export type RosterMigration = (record: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration registry: `ROSTER_MIGRATIONS[v]` upgrades a record from version `v`
 * to `v + 1`. Empty at v1 — Slice 3 registers the 1→2 migration here when it
 * adds the loadout field.
 */
export const ROSTER_MIGRATIONS: Readonly<Record<number, RosterMigration>> = {};

/**
 * Build a valid UnitRecord with sensible defaults, overridable per field
 * (test/caller helper; mirrors state.ts:defaultUnit). `over` cannot override the
 * schema version — that is always the current one for a freshly-minted record.
 */
export function defaultUnitRecord(
  id: string,
  currentJob: string,
  over: Partial<Omit<UnitRecord, "rosterSchemaVersion" | "id" | "currentJob">> = {},
): UnitRecord {
  return {
    rosterSchemaVersion: ROSTER_SCHEMA_VERSION,
    id,
    name: over.name ?? id,
    level: over.level ?? 1,
    currentJob,
    raw: over.raw ?? { pa: 5, ma: 5, speed: 5, hp: 40, mp: 10 },
    brave: over.brave ?? 70,
    faith: over.faith ?? 50,
    ap: over.ap ?? 0,
    learned: over.learned ?? [],
    mastered: over.mastered ?? [],
  };
}

/**
 * Serialize a record to a JSON string. Validate-on-the-way-out (mirrors
 * state.ts:serialize) so a malformed record can never be persisted.
 */
export function serializeRecord(record: UnitRecord): string {
  return JSON.stringify(UnitRecordSchema.parse(record));
}

/**
 * Parse + validate + migrate a serialized UnitRecord.
 *
 * Failure is always loud (mirrors state.ts:deserialize): a version newer than
 * this build, older than the oldest supported migration, or a missing/non-integer
 * version throws {@link RosterSchemaVersionError} — never a silent/partial load.
 */
export function deserializeRecord(json: string): UnitRecord {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new RosterSchemaVersionError("serialized UnitRecord must be a JSON object");
  }

  let obj = raw as Record<string, unknown>;
  const version = obj["rosterSchemaVersion"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new RosterSchemaVersionError(
      "serialized UnitRecord is missing an integer rosterSchemaVersion",
    );
  }
  if (version > ROSTER_SCHEMA_VERSION) {
    throw new RosterSchemaVersionError(
      `roster schemaVersion ${version} is newer than this build supports ` +
        `(${ROSTER_SCHEMA_VERSION}); update the game`,
    );
  }
  if (version < MIN_SUPPORTED_ROSTER_SCHEMA_VERSION) {
    throw new RosterSchemaVersionError(
      `roster schemaVersion ${version} is older than the minimum supported ` +
        `(${MIN_SUPPORTED_ROSTER_SCHEMA_VERSION})`,
    );
  }

  for (let v = version; v < ROSTER_SCHEMA_VERSION; v++) {
    const migrate = ROSTER_MIGRATIONS[v];
    if (!migrate) {
      throw new RosterSchemaVersionError(
        `no roster migration registered from schemaVersion ${v} to ${v + 1}`,
      );
    }
    obj = migrate(obj);
  }

  return UnitRecordSchema.parse(obj);
}
