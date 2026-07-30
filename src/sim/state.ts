/**
 * BattleState — the single, serializable source of truth for a battle
 * (docs/05 §3c). The same serialization backs rewind snapshots AND saves
 * (docs/05 §5): if it round-trips for one, it round-trips for the other.
 *
 * Invariants this file establishes for the whole sim:
 *   - BattleState is PLAIN DATA only — no class instances, Maps, Sets, or
 *     `undefined`-valued keys — so `JSON.parse(JSON.stringify(state))` is a
 *     faithful clone and Zod can validate it (AC-S6).
 *   - Randomness lives as `seed` + `rngCounter`, never a live RNG object; the
 *     stream is reconstructed on demand via `SeededRng.fromState` (see rng.ts).
 *   - Every serialized state carries a `schemaVersion`; loading one runs
 *     forward migrations or fails loudly — never a silent partial load.
 *
 * Schema history:
 *   - v1 (PR1): envelope only — grid {width,height}, units {id,teamId,ct}.
 *   - v2 (PR2): grid gains per-tile height+passability; units gain position,
 *     facing, speed, move, jump, hp, and scheduler statuses; charged actions
 *     gain their own speed. A 1→2 migration fills v1 saves with defaults.
 */

import { z } from "zod";
import { SeededRng, type RngState } from "./rng.js";

/** Current on-disk schema version. Bump whenever BattleState shape changes. */
export const SCHEMA_VERSION = 2;

/** Oldest schemaVersion we still know how to migrate forward. */
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;

const IntSchema = z.number().int();

/** Compass facing — load-bearing for evasion (docs/01 §5c/§7). */
export const FacingSchema = z.enum(["N", "E", "S", "W"]);
export type Facing = z.infer<typeof FacingSchema>;

/** Scheduler-relevant statuses (the CT-affecting subset for PR2, docs/01 §1). */
export const StatusFlagSchema = z.enum(["haste", "slow", "stop"]);
export type StatusFlag = z.infer<typeof StatusFlagSchema>;

/** One grid tile: integer height in half-tile "h" units + passability (docs/01 §7). */
export const TileSchema = z
  .object({ height: IntSchema.min(0), passable: z.boolean() })
  .strict();
export type Tile = z.infer<typeof TileSchema>;

export const PositionSchema = z
  .object({ x: IntSchema.min(0), y: IntSchema.min(0) })
  .strict();
export type Position = z.infer<typeof PositionSchema>;

/** Grid: row-major `tiles`, indexed `y*width + x`. */
export const GridStateSchema = z
  .object({
    width: IntSchema.min(1),
    height: IntSchema.min(1),
    tiles: z.array(TileSchema),
  })
  .strict()
  .refine((g) => g.tiles.length === g.width * g.height, {
    message: "grid.tiles length must equal width*height",
  });
export type GridState = z.infer<typeof GridStateSchema>;

export const UnitStateSchema = z
  .object({
    id: z.string().min(1),
    teamId: IntSchema.min(0),
    pos: PositionSchema,
    facing: FacingSchema,
    /** Charge Time toward the next active turn (docs/01 §1). */
    ct: IntSchema.min(0),
    /** CT accrual rate before Haste/Slow (docs/01 §1). */
    speed: IntSchema.min(1),
    /** Horizontal move range in tiles (docs/01 §7). */
    move: IntSchema.min(0),
    /** Jump tolerance: max climbable height delta per step (docs/01 §7). */
    jump: IntSchema.min(0),
    hp: IntSchema.min(0),
    maxHp: IntSchema.min(1),
    statuses: z.array(StatusFlagSchema),
  })
  .strict();
export type UnitState = z.infer<typeof UnitStateSchema>;

/** Charge-queue element — target tile / interrupt hooks land in PR4. */
export const ChargedActionStateSchema = z
  .object({
    id: z.string().min(1),
    sourceUnitId: z.string().min(1),
    /** Charge accrued toward resolution at ct >= 100 (docs/05 §1). */
    ct: IntSchema.min(0),
    /** The action's own charge speed, independent of caster Speed (docs/01 §3). */
    speed: IntSchema.min(1),
  })
  .strict();
export type ChargedActionState = z.infer<typeof ChargedActionStateSchema>;

/** Turn-log entry — the audit trail; detail grows with the pipeline (PR3). */
export const TurnLogEntrySchema = z
  .object({
    tick: IntSchema.min(0),
    unitId: z.string().min(1),
    action: z.string().min(1),
  })
  .strict();
export type TurnLogEntry = z.infer<typeof TurnLogEntrySchema>;

export const BattleStateSchema = z
  .object({
    schemaVersion: IntSchema,
    /** Battle seed for the single PRNG stream (docs/05 §3a). */
    seed: IntSchema,
    /** Discrete tick clock (docs/05 §1). */
    tick: IntSchema.min(0),
    /** Draws consumed from the PRNG — the roll-order cursor (docs/05 §3a). */
    rngCounter: IntSchema.min(0),
    grid: GridStateSchema,
    /** Stored in deploy order (team-then-slot); index is the tie-break key (docs/05 §1a). */
    units: z.array(UnitStateSchema),
    chargeQueue: z.array(ChargedActionStateSchema),
    turnLog: z.array(TurnLogEntrySchema),
  })
  .strict();
export type BattleState = z.infer<typeof BattleStateSchema>;

/** Build a `width*height` flat grid of identical tiles (test/viewer helper). */
export function makeFlatTiles(width: number, height: number, tileHeight = 0): Tile[] {
  return Array.from({ length: width * height }, () => ({ height: tileHeight, passable: true }));
}

/** Options for {@link createBattleState}; grid tiles auto-fill flat if omitted. */
export interface CreateBattleStateOptions {
  seed: number;
  grid?: { width: number; height: number; tiles?: Tile[] };
  units?: UnitState[];
}

/** Build a fresh, valid BattleState at tick 0 with the RNG stream unconsumed. */
export function createBattleState(opts: CreateBattleStateOptions): BattleState {
  const width = opts.grid?.width ?? 1;
  const height = opts.grid?.height ?? 1;
  const tiles = opts.grid?.tiles ?? makeFlatTiles(width, height);
  return {
    schemaVersion: SCHEMA_VERSION,
    seed: opts.seed | 0,
    tick: 0,
    rngCounter: 0,
    grid: { width, height, tiles },
    units: opts.units ?? [],
    chargeQueue: [],
    turnLog: [],
  };
}

/** The RNG cursor carried by a BattleState (docs/05 §3a/§3c). */
export function rngStateOf(state: BattleState): RngState {
  return { seed: state.seed, count: state.rngCounter };
}

/** Reconstruct the battle's PRNG stream from its serialized cursor. */
export function rngFor(state: BattleState): SeededRng {
  return SeededRng.fromState(rngStateOf(state));
}

/**
 * Serialize to a JSON string. Deterministic given the state (plain-data
 * guarantee above). Used for both saves and rewind snapshots.
 */
export function serialize(state: BattleState): string {
  // Validate on the way out so a malformed state can never be persisted.
  return JSON.stringify(BattleStateSchema.parse(state));
}

/** A migration transforms a parsed state one schema version forward. */
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/**
 * v1 → v2: v1 had no positions/stats, so fill best-effort defaults. Units are
 * laid out left-to-right/top-to-bottom on the existing grid dimensions, the
 * grid is made flat+passable, and charged actions get a default speed. Real
 * saves are born at the current version; this keeps old snapshots loadable.
 */
const migrate1to2: Migration = (s) => {
  const grid = s["grid"] as { width: number; height: number };
  const width = grid.width;
  const height = grid.height;
  const units = (s["units"] as Array<{ id: string; teamId: number; ct: number }>).map((u, i) => ({
    id: u.id,
    teamId: u.teamId,
    pos: { x: i % width, y: Math.floor(i / width) % height },
    facing: "S" as const,
    ct: u.ct,
    speed: 5,
    move: 3,
    jump: 3,
    hp: 100,
    maxHp: 100,
    statuses: [] as StatusFlag[],
  }));
  const chargeQueue = (
    s["chargeQueue"] as Array<{ id: string; sourceUnitId: string; ct: number }>
  ).map((c) => ({ ...c, speed: 10 }));
  return {
    ...s,
    schemaVersion: 2,
    grid: { width, height, tiles: makeFlatTiles(width, height) },
    units,
    chargeQueue,
  };
};

/**
 * Migration registry: `MIGRATIONS[v]` upgrades a state from version `v` to
 * `v + 1`. Each schema bump registers its migration here.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: migrate1to2,
};

export class SchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaVersionError";
  }
}

/**
 * Parse + validate + migrate a serialized BattleState.
 *
 * Failure is always loud (docs/05 §5): a version newer than this build, or
 * older than the oldest supported migration, throws {@link SchemaVersionError}
 * — never a silent or partial load.
 */
export function deserialize(json: string): BattleState {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SchemaVersionError("serialized BattleState must be a JSON object");
  }

  let obj = raw as Record<string, unknown>;
  const version = obj["schemaVersion"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new SchemaVersionError("serialized BattleState is missing an integer schemaVersion");
  }

  if (version > SCHEMA_VERSION) {
    throw new SchemaVersionError(
      `save schemaVersion ${version} is newer than this build supports (${SCHEMA_VERSION}); update the game`,
    );
  }
  if (version < MIN_SUPPORTED_SCHEMA_VERSION) {
    throw new SchemaVersionError(
      `save schemaVersion ${version} is older than the minimum supported (${MIN_SUPPORTED_SCHEMA_VERSION})`,
    );
  }

  for (let v = version; v < SCHEMA_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) {
      throw new SchemaVersionError(`no migration registered from schemaVersion ${v} to ${v + 1}`);
    }
    obj = migrate(obj);
  }

  return BattleStateSchema.parse(obj);
}
