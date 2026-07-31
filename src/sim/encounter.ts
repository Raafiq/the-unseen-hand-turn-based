/**
 * Encounter / battle-definition schema + loader (docs/05 §6, docs/06 P2 Slice 2).
 * An encounter is the narrative-agnostic DATA that seeds a battle: a grid, teams,
 * unit placements, win/lose objectives, and halting caps. This repo loads story
 * battles as data (CLAUDE.md), so nothing here reads a file — the caller passes
 * already-parsed JSON (`unknown`), mirroring `loadContentPack`.
 *
 * SEPARATE CODEC (ADR-0011 precedent): its own version line
 * ({@link ENCOUNTER_SCHEMA_VERSION}), independent of the battle `SCHEMA_VERSION`,
 * roster, and content versions. Version handling mirrors `state.ts:deserialize` —
 * loud fail on an unsupported version, forward migrations per bump, NO Zod
 * `.default()`s (adding a required field fans out to every literal, the codec's
 * migration-per-bump pattern working as intended).
 *
 * PURE + no RNG: `loadEncounter` is a deterministic compile from data to a fresh
 * {@link BattleState}. The one determinism-load-bearing choice is unit-id
 * assignment: unit ids are assigned in DEPLOY ORDER (teamId asc, then placement
 * array order), because unitId is the scheduler tie-break key (scheduler.ts) — a
 * hash-map or insertion-order assignment would leak nondeterminism into turn order.
 */

import { z } from "zod";
import { ConditionSchema, type Condition } from "./condition.js";
import type { ContentRegistry } from "./content.js";
import { buildBattleUnit } from "./build.js";
import { UnitRecordSchema, type UnitRecord } from "./roster.js";
import {
  createBattleState,
  FacingSchema,
  PositionSchema,
  TileSchema,
  type BattleState,
  type UnitState,
} from "./state.js";

/** Current on-disk encounter schema version. Bump when the shape changes. */
export const ENCOUNTER_SCHEMA_VERSION = 1;

/** Oldest encounterSchemaVersion we still know how to migrate forward. */
export const MIN_SUPPORTED_ENCOUNTER_SCHEMA_VERSION = 1;

const IntSchema = z.number().int();

/** Who drives a team's turns: the balance-probe AI, or a (future) human seat. */
export const ControllerSchema = z.enum(["ai", "player"]);
export type Controller = z.infer<typeof ControllerSchema>;

/**
 * Where a placement's unit comes from — the narrative-agnostic seam (docs/00):
 *   - `inline` — the full {@link UnitRecord} is embedded (self-contained fixtures).
 *   - `ref`    — a `recordId` resolved against a caller-supplied record map.
 *   - `slot`   — a `slotId` resolved against a caller-supplied build assignment;
 *                the BUILD-UNDER-TEST injection point for the (deferred) matrix
 *                runner. The shape ships now; the runner is a later slice (D4).
 */
export const UnitSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inline"), record: UnitRecordSchema }).strict(),
  z.object({ kind: z.literal("ref"), recordId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("slot"), slotId: z.string().min(1) }).strict(),
]);
export type UnitSource = z.infer<typeof UnitSourceSchema>;

export const TeamSchema = z
  .object({
    teamId: IntSchema.min(0),
    controller: ControllerSchema,
    /** Named AI policy for this team; omitted ⇒ the default balance probe. */
    aiProfile: z.string().min(1).optional(),
  })
  .strict();
export type Team = z.infer<typeof TeamSchema>;

/**
 * One deployed unit: WHERE it stands (`pos`/`facing`) on WHICH team, and WHAT unit
 * fills it (`unit`). `slotId` is the placement's stable id AND becomes the battle
 * unit's id (so objectives/`RunReport` reference it), so it must be unique per
 * encounter.
 */
export const PlacementSchema = z
  .object({
    slotId: z.string().min(1),
    teamId: IntSchema.min(0),
    pos: PositionSchema,
    facing: FacingSchema,
    unit: UnitSourceSchema,
  })
  .strict();
export type Placement = z.infer<typeof PlacementSchema>;

export const EncounterGridSchema = z
  .object({
    width: IntSchema.min(1),
    height: IntSchema.min(1),
    /** Row-major tiles (`y*width + x`); omitted ⇒ a flat, passable grid. */
    tiles: z.array(TileSchema).optional(),
  })
  .strict();
export type EncounterGrid = z.infer<typeof EncounterGridSchema>;

/**
 * Whether a condition's references RESOLVE against the placements — an
 * `eliminateTeams` team must have a placement, a `defeatUnit` id must match a
 * placement slotId. A typo'd reference would otherwise be vacuously satisfied
 * (`evalCondition` returns true for a team/unit that never existed), silently
 * ending a run at turn zero. Caught HERE, at parse, so it fails loud.
 */
function conditionResolvable(cond: Condition, teamIds: ReadonlySet<number>, slotIds: ReadonlySet<string>): boolean {
  switch (cond.kind) {
    case "eliminateTeams":
      return cond.teams.every((t) => teamIds.has(t));
    case "defeatUnit":
      return slotIds.has(cond.unitId);
  }
}

export const EncounterSchema = z
  .object({
    encounterSchemaVersion: IntSchema,
    id: z.string().min(1),
    /** Battle seed for the single PRNG stream. */
    seed: IntSchema,
    grid: EncounterGridSchema,
    teams: z.array(TeamSchema).min(1),
    placements: z.array(PlacementSchema).min(1),
    victory: ConditionSchema,
    defeat: ConditionSchema,
    /** Halting caps (docs/06): a run that reaches either ends as `timeout`. */
    maxTurns: IntSchema.min(1),
    maxTicks: IntSchema.min(1),
  })
  .strict()
  .refine((e) => new Set(e.placements.map((p) => p.slotId)).size === e.placements.length, {
    message: "placement slotIds must be unique (a slotId becomes the battle unit id)",
    path: ["placements"],
  })
  .refine(
    (e) => new Set(e.placements.map((p) => `${p.pos.x},${p.pos.y}`)).size === e.placements.length,
    {
      // Two units cannot deploy onto the same tile — the BattleState schema's
      // position-uniqueness refine would otherwise only throw at createBattleState,
      // with a less specific message.
      message: "placement positions must be unique (two placements share a tile)",
      path: ["placements"],
    },
  )
  .refine(
    (e) => e.placements.every((p) => p.pos.x < e.grid.width && p.pos.y < e.grid.height),
    {
      // PositionSchema already enforces x,y ≥ 0; guard the upper bound against the
      // inline grid (revisit if a deferred `mapId` grid replaces inline width/height).
      message: "a placement position is outside the grid bounds",
      path: ["placements"],
    },
  )
  .refine(
    (e) => {
      const teamIds = new Set(e.placements.map((p) => p.teamId));
      const slotIds = new Set(e.placements.map((p) => p.slotId));
      return conditionResolvable(e.victory, teamIds, slotIds);
    },
    {
      message: "victory condition references a team or unit with no placement",
      path: ["victory"],
    },
  )
  .refine(
    (e) => {
      const teamIds = new Set(e.placements.map((p) => p.teamId));
      const slotIds = new Set(e.placements.map((p) => p.slotId));
      return conditionResolvable(e.defeat, teamIds, slotIds);
    },
    {
      message: "defeat condition references a team or unit with no placement",
      path: ["defeat"],
    },
  );
export type Encounter = z.infer<typeof EncounterSchema>;

/** Thrown when a serialized encounter's version is missing or unsupported. */
export class EncounterSchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncounterSchemaVersionError";
  }
}

/** An encounter migration transforms a parsed def one schema version forward. */
export type EncounterMigration = (def: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration registry: `ENCOUNTER_MIGRATIONS[v]` upgrades a def from version `v` to
 * `v + 1`. Empty at v1 (no prior versions); each future bump registers here.
 */
export const ENCOUNTER_MIGRATIONS: Readonly<Record<number, EncounterMigration>> = {};

/** Resolves `ref` unit sources: `recordId` → persistent record. */
export type RecordMap = Readonly<Record<string, UnitRecord>>;

/** Resolves `slot` unit sources: `slotId` → the build-under-test record. */
export type SlotAssignment = Readonly<Record<string, UnitRecord>>;

/**
 * The context {@link loadEncounter} needs to compile an encounter. The
 * {@link ContentRegistry} is REQUIRED — every {@link UnitRecord} is compiled into a
 * battle unit via `buildBattleUnit` (job growth, traits), which reads the registry.
 * `records` is only needed when some placement uses a `ref` source.
 */
export interface EncounterResolver {
  registry: ContentRegistry;
  records?: RecordMap;
}

/** Resolve a placement's {@link UnitSource} to a persistent {@link UnitRecord}. */
function resolveSource(
  src: UnitSource,
  resolver: EncounterResolver,
  assignment: SlotAssignment | undefined,
): UnitRecord {
  switch (src.kind) {
    case "inline":
      return src.record;
    case "ref": {
      const rec = resolver.records?.[src.recordId];
      if (!rec) {
        throw new EncounterSchemaVersionError(
          `loadEncounter: no record supplied for ref source "${src.recordId}"`,
        );
      }
      return rec;
    }
    case "slot": {
      const rec = assignment?.[src.slotId];
      if (!rec) {
        throw new EncounterSchemaVersionError(
          `loadEncounter: no build assignment supplied for slot source "${src.slotId}"`,
        );
      }
      return rec;
    }
  }
}

/**
 * Parse + validate + migrate a raw encounter def (mirrors `loadContentPack`). Loud
 * fail on a version newer than this build or older than the minimum supported.
 */
export function parseEncounter(raw: unknown): Encounter {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new EncounterSchemaVersionError("encounter def must be a JSON object");
  }
  let obj = raw as Record<string, unknown>;
  const version = obj["encounterSchemaVersion"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new EncounterSchemaVersionError("encounter def is missing an integer encounterSchemaVersion");
  }
  if (version > ENCOUNTER_SCHEMA_VERSION) {
    throw new EncounterSchemaVersionError(
      `encounter schemaVersion ${version} is newer than this build supports ` +
        `(${ENCOUNTER_SCHEMA_VERSION}); update the game`,
    );
  }
  if (version < MIN_SUPPORTED_ENCOUNTER_SCHEMA_VERSION) {
    throw new EncounterSchemaVersionError(
      `encounter schemaVersion ${version} is older than the minimum supported ` +
        `(${MIN_SUPPORTED_ENCOUNTER_SCHEMA_VERSION})`,
    );
  }
  for (let v = version; v < ENCOUNTER_SCHEMA_VERSION; v++) {
    const migrate = ENCOUNTER_MIGRATIONS[v];
    if (!migrate) {
      throw new EncounterSchemaVersionError(
        `no encounter migration registered from schemaVersion ${v} to ${v + 1}`,
      );
    }
    obj = migrate(obj);
  }
  return EncounterSchema.parse(obj);
}

/**
 * Compile an encounter into a fresh {@link BattleState}. Each placement's unit
 * source is resolved to a {@link UnitRecord}, compiled via `buildBattleUnit`
 * (registry read here, once), and STAMPED with the placement's teamId / pos /
 * facing and its `slotId` as the unit id.
 *
 * DEPLOY-ORDER id assignment (determinism, docs/05 §1a): placements are ordered by
 * `teamId` asc, then their original array index (a STABLE sort), and the units
 * array is built in that order. Using the explicit `slotId` (not `record.id`) as
 * the unit id means two placements can share one source record without an id
 * collision, and the ids/order are a deterministic function of the def — never of
 * Map/Set iteration.
 *
 * @param def raw (unknown, validated) OR an already-parsed {@link Encounter}.
 */
export function loadEncounter(
  def: unknown,
  resolver: EncounterResolver,
  buildAssignment?: SlotAssignment,
): BattleState {
  // Always route through parseEncounter — it validates, version-gates, and migrates.
  // An already-parsed Encounter is just a valid raw def, so this is idempotent and
  // never bypasses the version gate.
  const enc = parseEncounter(def);

  // DEPLOY ORDER: team asc, then original placement index (stable). `index` is the
  // decisive tie-break so the sort is a total order (never falls back to engine sort
  // stability), keeping the unit array a pure function of the def.
  const ordered = enc.placements
    .map((placement, index) => ({ placement, index }))
    .sort((a, b) =>
      a.placement.teamId !== b.placement.teamId
        ? a.placement.teamId - b.placement.teamId
        : a.index - b.index,
    );

  const units: UnitState[] = ordered.map(({ placement }) => {
    const record = resolveSource(placement.unit, resolver, buildAssignment);
    return buildBattleUnit(record, resolver.registry, {
      id: placement.slotId,
      teamId: placement.teamId,
      pos: { x: placement.pos.x, y: placement.pos.y },
      facing: placement.facing,
    });
  });

  return createBattleState({
    seed: enc.seed,
    grid: { width: enc.grid.width, height: enc.grid.height, ...(enc.grid.tiles ? { tiles: enc.grid.tiles } : {}) },
    units,
  });
}
