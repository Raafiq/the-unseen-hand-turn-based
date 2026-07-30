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
 * The grid/unit/charge/log shapes here are the P0 *envelope*; they are
 * intentionally minimal and grow in later slices:
 *   - PR2 (grid + scheduler): real tiles/height/facing on grid, position/stats
 *     on units.
 *   - PR3 (resolution): richer unit/turn-log detail.
 *   - PR4 (charged actions): the charge-queue element shape.
 * Each expansion bumps SCHEMA_VERSION and registers a migration.
 */

import { z } from "zod";
import { SeededRng, type RngState } from "./rng.js";

/** Current on-disk schema version. Bump whenever BattleState shape changes. */
export const SCHEMA_VERSION = 1;

/** Oldest schemaVersion we still know how to migrate forward. */
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;

const IntSchema = z.number().int();

/** Grid envelope — tiles/height/passability land in PR2. */
export const GridStateSchema = z
  .object({
    width: IntSchema.min(1),
    height: IntSchema.min(1),
  })
  .strict();
export type GridState = z.infer<typeof GridStateSchema>;

/** Unit envelope — position/stats/status land in PR2/PR3. */
export const UnitStateSchema = z
  .object({
    id: z.string().min(1),
    teamId: IntSchema.min(0),
    /** Charge Time toward the next active turn (docs/01 §1). */
    ct: IntSchema.min(0),
  })
  .strict();
export type UnitState = z.infer<typeof UnitStateSchema>;

/** Charge-queue element — full shape (target tile, speed, interrupt) in PR4. */
export const ChargedActionStateSchema = z
  .object({
    id: z.string().min(1),
    sourceUnitId: z.string().min(1),
    /** Charge accrued toward resolution at ct >= 100 (docs/05 §1). */
    ct: IntSchema.min(0),
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
    units: z.array(UnitStateSchema),
    chargeQueue: z.array(ChargedActionStateSchema),
    turnLog: z.array(TurnLogEntrySchema),
  })
  .strict();
export type BattleState = z.infer<typeof BattleStateSchema>;

/** Options for {@link createBattleState}; all but seed default to empty. */
export interface CreateBattleStateOptions {
  seed: number;
  grid?: GridState;
  units?: UnitState[];
}

/** Build a fresh, valid BattleState at tick 0 with the RNG stream unconsumed. */
export function createBattleState(opts: CreateBattleStateOptions): BattleState {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed: opts.seed | 0,
    tick: 0,
    rngCounter: 0,
    grid: opts.grid ?? { width: 1, height: 1 },
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
 * Migration registry: `MIGRATIONS[v]` upgrades a state from version `v` to
 * `v + 1`. Empty until the first schema change (added alongside each bump).
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

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
