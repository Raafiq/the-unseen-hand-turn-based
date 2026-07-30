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
 *   - v3 (PR3): units gain combat stats (PA/MA/Brave/Faith), weapon, evasion,
 *     zodiac, and the crystal timer. A 2→3 migration fills neutral defaults.
 *   - v4 (PR4): charged actions gain a `targetTile` and enough `effect` data to
 *     resolve on their matured tick (docs/01 §3, docs/05 §2). A 3→4 migration
 *     fills legacy charges with an inert (power-0) effect at tile (0,0).
 */

import { z } from "zod";
import { SeededRng, type RngState } from "./rng.js";

/** Current on-disk schema version. Bump whenever BattleState shape changes. */
export const SCHEMA_VERSION = 4;

/** Oldest schemaVersion we still know how to migrate forward. */
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;

const IntSchema = z.number().int();

/** Compass facing — load-bearing for evasion (docs/01 §5c/§7). */
export const FacingSchema = z.enum(["N", "E", "S", "W"]);
export type Facing = z.infer<typeof FacingSchema>;

/**
 * Status flags modeled so far: the CT-affecting set (docs/01 §1) plus the
 * damage-reducing Protect/Shell (~2/3, docs/01 §8). The full status system
 * arrives with the resolution pipeline's later slices.
 */
export const StatusFlagSchema = z.enum(["haste", "slow", "stop", "protect", "shell"]);
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

/** 0–100 percentage stat (Brave/Faith). */
const PercentSchema = IntSchema.min(0).max(100);

export const GenderSchema = z.enum(["male", "female", "neutral"]);
export type Gender = z.infer<typeof GenderSchema>;

export const ZodiacSignSchema = z.enum([
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
]);
export type ZodiacSign = z.infer<typeof ZodiacSignSchema>;

/** Damage element (routes elemental modifiers; PR3 keeps "none" the default). */
export const ElementSchema = z.enum([
  "none", "fire", "ice", "lightning", "water", "earth", "wind", "holy", "dark",
]);
export type Element = z.infer<typeof ElementSchema>;

/**
 * Which damage formula a weapon uses (docs/01 §5a), named by the MATH so a
 * weapon can't be mislabeled. Verified vs BMG/FFHacktics (fft-fidelity, PR3):
 *   paWp      PA × WP                    — Sword, Crossbow, Spear/Polearm
 *   braveWp   floor(Br × PA / 100) × WP  — Knight Sword, Katana
 *   bareHands floor(PA × Br / 100) × PA  — unarmed (×1.5 with Martial Arts)
 *   speedWp   floor((PA + Speed)/2) × WP — Bow, KNIFE, Ninja Sword (speed weapons)
 *   wpWp      WP × WP                    — Gun (PA- and Faith-independent)
 */
export const WeaponFormulaSchema = z.enum(["paWp", "braveWp", "bareHands", "speedWp", "wpWp"]);
export type WeaponFormula = z.infer<typeof WeaponFormulaSchema>;

export const WeaponSchema = z
  .object({
    wp: IntSchema.min(0),
    formula: WeaponFormulaSchema,
    element: ElementSchema,
    /** Base accuracy % of a swing before evasion (docs/01 §6). */
    accuracy: PercentSchema,
  })
  .strict();
export type Weapon = z.infer<typeof WeaponSchema>;

/**
 * The four independent evasion sources (docs/01 §5c), each a % miss chance
 * rolled independently. Facing removes sources: side ignores Class; rear keeps
 * only Accessory.
 */
export const EvasionSchema = z
  .object({
    classEv: PercentSchema,
    weaponEv: PercentSchema,
    shieldEv: PercentSchema,
    accessoryEv: PercentSchema,
  })
  .strict();
export type Evasion = z.infer<typeof EvasionSchema>;

export const ZodiacProfileSchema = z
  .object({ sign: ZodiacSignSchema, gender: GenderSchema })
  .strict();
export type ZodiacProfile = z.infer<typeof ZodiacProfileSchema>;

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
    /** Physical / magical attack (docs/01 §4). */
    pa: IntSchema.min(0),
    ma: IntSchema.min(0),
    /** Brave / Faith percentages (docs/01 §4). */
    brave: PercentSchema,
    faith: PercentSchema,
    weapon: WeaponSchema,
    evasion: EvasionSchema,
    zodiac: ZodiacProfileSchema,
    /** Crystal counter after KO (docs/01 §11): 3 → 0, then permadeath. 0 while alive. */
    crystalTimer: IntSchema.min(0),
    statuses: z.array(StatusFlagSchema),
  })
  .strict();
export type UnitState = z.infer<typeof UnitStateSchema>;

/**
 * The effect a matured charge applies (docs/01 §3, docs/05 §2). Carries enough
 * data to resolve WITHOUT re-reading an ability book, so a serialized charge is
 * self-contained for rewind/replay. `kind` is a discriminant: only "magic" is
 * modeled now; Dragoon Jump / Archer Aim / Perform join as their own kinds
 * later (docs/01 §3). Numeric fields (power, accuracy) are ILLUSTRATIVE per
 * docs/01 §3 — not yet verified vs BMG/FFHacktics; behavior (not the magic
 * number) is what the tests pin. fft-fidelity checks the values separately.
 */
export const ChargeEffectSchema = z
  .object({
    kind: z.literal("magic"),
    /** Ability power `q` fed to the magic formula (docs/01 §5b). [UNVERIFIED] */
    power: IntSchema.min(0),
    element: ElementSchema,
    /** Base hit % before facing/faith/zodiac (docs/01 §6). [UNVERIFIED] */
    accuracy: PercentSchema,
  })
  .strict();
export type ChargeEffect = z.infer<typeof ChargeEffectSchema>;

/**
 * Charge-queue element — a first-class actor on the shared timeline (docs/05
 * §1). On cast the caster declares a `targetTile` (a tile, NOT a locked unit:
 * if the occupant walks off before maturity the spell whiffs, docs/01 §3) and
 * the charge builds `+speed` per tick, resolving at ct >= 100.
 */
export const ChargedActionStateSchema = z
  .object({
    id: z.string().min(1),
    sourceUnitId: z.string().min(1),
    /** Charge accrued toward resolution at ct >= 100 (docs/05 §1). */
    ct: IntSchema.min(0),
    /** The action's own charge speed, independent of caster Speed (docs/01 §3). */
    speed: IntSchema.min(1),
    /** The tile the charge resolves against (docs/01 §3). */
    targetTile: PositionSchema,
    /** Self-contained effect payload resolved on the matured tick (docs/05 §2). */
    effect: ChargeEffectSchema,
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
  .strict()
  .refine((s) => new Set(s.units.map((u) => u.id)).size === s.units.length, {
    // Unit ids must be unique: the scheduler tie-break and every `find(u.id===…)`
    // lookup depend on it (docs/05 §1a). A duplicate would silently reintroduce
    // array-order dependence and mis-target damage.
    message: "unit ids must be unique",
    path: ["units"],
  })
  .refine((s) => new Set(s.units.map((u) => `${u.pos.x},${u.pos.y}`)).size === s.units.length, {
    message: "two units occupy the same tile (positions must be unique)",
    path: ["units"],
  })
  .refine((s) => new Set(s.chargeQueue.map((c) => c.id)).size === s.chargeQueue.length, {
    // Charge ids must be unique: the scheduler surfaces a charge by id and the
    // driver dequeues it by id on resolution (docs/05 §2). A duplicate would
    // resolve/dequeue the wrong charge and desync replay.
    message: "charge ids must be unique",
    path: ["chargeQueue"],
  });
export type BattleState = z.infer<typeof BattleStateSchema>;

/** Build a `width*height` flat grid of identical tiles (test/viewer helper). */
export function makeFlatTiles(width: number, height: number, tileHeight = 0): Tile[] {
  return Array.from({ length: width * height }, () => ({ height: tileHeight, passable: true }));
}

/**
 * Build a fully-populated UnitState with sensible defaults, overridable per
 * field (test/viewer helper). Centralizes the combat-stat defaults so schema
 * growth touches one place. Combat constants here are placeholders for setup
 * only — real numbers are verified per docs/01 §12.
 */
export function defaultUnit(id: string, teamId: number, over: Partial<UnitState> = {}): UnitState {
  return {
    id,
    teamId,
    pos: { x: 0, y: 0 },
    facing: "S",
    ct: 0,
    speed: 5,
    move: 3,
    jump: 3,
    hp: 100,
    maxHp: 100,
    pa: 10,
    ma: 10,
    brave: 70,
    faith: 50,
    weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 },
    evasion: { classEv: 10, weaponEv: 0, shieldEv: 0, accessoryEv: 0 },
    zodiac: { sign: "aries", gender: "neutral" },
    crystalTimer: 0,
    statuses: [],
    ...over,
  };
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
  const oldUnits = s["units"] as Array<{ id: string; teamId: number; ct: number }>;
  // Fail loudly rather than stack units on the same tile (docs/05 §5: a
  // migration must never corrupt). Positions must stay unique.
  if (oldUnits.length > width * height) {
    throw new SchemaVersionError(
      `cannot migrate v1 save: ${oldUnits.length} units do not fit on a ${width}x${height} grid without overlap`,
    );
  }
  const units = oldUnits.map((u, i) => ({
    id: u.id,
    teamId: u.teamId,
    pos: { x: i % width, y: Math.floor(i / width) },
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
 * v2 → v3: units gain combat stats (PA/MA/Brave/Faith), a weapon, evasion
 * sources, a zodiac profile, and the crystal timer. v2 saves had none of these,
 * so fill neutral defaults (matching {@link defaultUnit}). Real saves are born
 * at the current version.
 */
const migrate2to3: Migration = (s) => {
  const units = (s["units"] as Array<Record<string, unknown>>).map((u) => ({
    ...u,
    pa: 10,
    ma: 10,
    brave: 70,
    faith: 50,
    weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 },
    evasion: { classEv: 10, weaponEv: 0, shieldEv: 0, accessoryEv: 0 },
    zodiac: { sign: "aries", gender: "neutral" },
    // A v2 unit already at 0 HP is freshly KO'd, not crystallized — start its counter.
    crystalTimer: (u["hp"] as number) <= 0 ? 3 : 0,
  }));
  return { ...s, schemaVersion: 3, units };
};

/**
 * v3 → v4: charged actions gain a `targetTile` and an `effect` payload. v3
 * charges carried neither, so target tile (0,0) and an INERT power-0 magic
 * effect — a legacy charge whose effect data predates the field resolves
 * harmlessly rather than corrupting. Real charges are born at the current
 * version via {@link declareCharge}.
 */
const migrate3to4: Migration = (s) => {
  const chargeQueue = (s["chargeQueue"] as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    targetTile: { x: 0, y: 0 },
    effect: { kind: "magic", power: 0, element: "none", accuracy: 100 },
  }));
  return { ...s, schemaVersion: 4, chargeQueue };
};

/**
 * Migration registry: `MIGRATIONS[v]` upgrades a state from version `v` to
 * `v + 1`. Each schema bump registers its migration here.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: migrate1to2,
  2: migrate2to3,
  3: migrate3to4,
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
