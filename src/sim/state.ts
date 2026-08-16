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
 *   - v5 (Slice 4): units gain an `abilities` projection (the castable actions
 *     compiled from the persistent record at build time, build.ts). ADDITIVE
 *     ONLY — no resolver reads it yet, so no roll order or result changes. A 4→5
 *     migration adds a single `basic.attack` derived from the unit's `weapon`.
 *   - v6 (Slice 6): evasion gains `magicEv` — a SEPARATE magic-evasion stat
 *     (docs/01 §5c/§6), facing-independent, consumed only by the magic-hit path
 *     (formulas.ts `applyMagicEvasion` / `magicHitChance`). A 5→6 migration adds
 *     `magicEv: 0` to every unit's evasion. Additive: at magicEv 0 the magic hit%
 *     is unchanged, so no roll or result shifts for existing saves.
 *   - v7 (Slice 7): the flat `statuses: StatusFlag[]` enum becomes an array of
 *     self-contained {@link ActiveStatus} records (ADR-0011: status BEHAVIOR = code,
 *     TUNING = data; a running/replayed battle never reads the content catalog).
 *     Each record carries its resolved `ctFactor` (read by the scheduler), a
 *     finite `remainingCT` (deterministic decay), and the behavior discriminants
 *     (`preventsAction`/`interruptsCharge`/`interruptsMagicOnly`) the interrupt
 *     check reads. Charges gain `interrupted` (the latch: a caster disabled
 *     mid-charge stays interrupted even if it recovers before maturity). The 6→7
 *     migration maps the P0 five flags via {@link legacyActiveStatus} with a
 *     PERMANENT (non-decaying) `remainingCT`, so a migrated save preserves P0's
 *     never-expiring behavior byte-for-byte, and stamps every charge `interrupted:
 *     false`. Not additive (the shape changes), but behavior-preserving.
 *   - v8 (AoE slice): abilities and charge effects gain an `aoe` box (nullable;
 *     `null` = single-target, mirroring `speed`). A matured charge / instant act
 *     with a non-null `aoe` resolves against every appropriate unit in the box
 *     (charge.ts / resolve.ts). The 7→8 migration stamps `aoe: null` onto every
 *     serialized unit's `abilities[]` AND every `chargeQueue[].effect` — so a
 *     migrated save keeps the exact single-target behavior (additive, no roll or
 *     result shift). Real records are born at the current version.
 *   - v9 (inflict slice): a projected ability's `inflicts` changes from status IDS
 *     to RESOLVED {@link ActiveStatus} templates, and the resolvers finally APPLY
 *     them on a landed hit (docs/05 §2 step d — specified since P0, never wired,
 *     because a registry-free resolver cannot turn an id into behaviour). The 8→9
 *     migration empties `inflicts`: no version up to v8 read the field, so dropping
 *     it reproduces a migrated save's behaviour exactly, and re-resolving ids is
 *     impossible without the catalog a migration may not read. Infliction consumes
 *     NO rng draw, so the roll order (docs/05 §3) is unchanged.
 */

import { z } from "zod";
import { SeededRng, type RngState } from "./rng.js";
import { ElementSchema } from "./element.js";
import { BattleAbilitySchema, RangeBoxSchema, type BattleAbility } from "./ability.js";
import { ActiveStatusSchema, legacyActiveStatus, type StatusFlag } from "./active-status.js";

// Re-export the element enum from its leaf module so existing
// `import { ElementSchema } from "./state.js"` call sites keep working (the enum
// was moved to break a state↔ability load-time cycle; see element.ts).
export { ElementSchema, type Element } from "./element.js";

// Re-export the resolved-status leaf for the same reason: it moved to
// `active-status.ts` to break a state↔ability load-time cycle (see that module), and
// every existing `import { ... } from "./state.js"` call site keeps working.
export {
  StatusFlagSchema,
  type StatusFlag,
  PERMANENT_STATUS_CT,
  ActiveStatusSchema,
  type ActiveStatus,
  legacyActiveStatus,
  makeActiveStatus,
} from "./active-status.js";

/** Current on-disk schema version. Bump whenever BattleState shape changes. */
export const SCHEMA_VERSION = 9;

/** Oldest schemaVersion we still know how to migrate forward. */
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;

const IntSchema = z.number().int();

/** Compass facing — load-bearing for evasion (docs/01 §5c/§7). */
export const FacingSchema = z.enum(["N", "E", "S", "W"]);
export type Facing = z.infer<typeof FacingSchema>;

// The resolved-status leaf (StatusFlag, PERMANENT_STATUS_CT, ActiveStatus,
// legacyActiveStatus, makeActiveStatus) MOVED to `active-status.ts` when the on-hit
// inflict path landed: `ability.ts` now needs ActiveStatusSchema, and this module
// already imports `ability.ts`, so keeping it here would form a Zod module-eval cycle
// (TDZ ReferenceError). Re-exported below so every existing importer is unaffected.

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
 * Evasion sources (docs/01 §5c/§6). The four PHYSICAL sources — Class, Weapon,
 * Shield, Accessory — are each a % miss chance rolled independently, and facing
 * removes some (side ignores Class; rear keeps only Accessory; see `hitChance`).
 *
 * `magicEv` (added at schemaVersion 6) is the SEPARATE magic-evasion stat: it is
 * FACING-INDEPENDENT (no front/side/rear) and applies ONLY to magic hit%, never
 * to a physical swing (`magicHitChance` / `applyMagicEvasion` in formulas.ts).
 * The physical `hitChance` never reads it.
 */
export const EvasionSchema = z
  .object({
    classEv: PercentSchema,
    weaponEv: PercentSchema,
    shieldEv: PercentSchema,
    accessoryEv: PercentSchema,
    magicEv: PercentSchema,
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
    /** Self-contained active statuses (docs/05 §6); the sim never reads the catalog. */
    statuses: z.array(ActiveStatusSchema),
    /**
     * The unit's castable-action projection, compiled from its persistent record
     * at build time (build.ts, ADR-0011) and self-contained for replay. Added at
     * schemaVersion 5 (Slice 4). PROJECTION-ONLY THIS SLICE: no resolver reads it
     * yet (the combat pipeline still fights off the inline `weapon`); Slice 5
     * wires it in. `weapon` and `abilities[basic.attack]` therefore lead a DUAL
     * LIFE for now — the basic attack is DERIVED FROM `weapon` (see
     * {@link basicAttackFrom}) so they can't disagree — and `weapon` becomes
     * removable once the resolvers read `abilities` (cleanup owed then).
     */
    abilities: z.array(BattleAbilitySchema),
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
    /**
     * Area of effect (docs/05 §6): `null` ⇒ single-target (the occupant of the
     * matured charge's tile); a box ⇒ every FOE within Chebyshev `h`/vertical `v`
     * of the tile is resolved in id order (charge.ts). Mirrors
     * {@link BattleAbilitySchema}'s `aoe`; charges are magic-damage only, so an
     * area charge never friendly-fires.
     */
    aoe: RangeBoxSchema.nullable(),
    /**
     * On-hit statuses, carried through the charge as RESOLVED templates for the same
     * self-containment reason as {@link BattleAbilitySchema}'s `inflicts`: the charge
     * outlives the turn that declared it, and the resolver that matures it may not
     * read the content registry (ADR-0010/ADR-0011).
     *
     * Sourced from the ability at declare time. Without this field a charged
     * ability's statuses would be silently dropped the moment it was cast — the
     * "validated then discarded" shape this slice exists to remove, and it would have
     * been invisible today because no SHIPPED charged ability inflicts anything.
     */
    inflicts: z.array(ActiveStatusSchema),
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
    /**
     * The interrupt LATCH (ADR-0010 item 2). Set true the instant a disabling
     * status is applied to the caster (charge.ts `applyStatusToUnit`), so a caster
     * disabled mid-charge stays cancelled even if the status decays before the
     * charge matures. `false` on a fresh charge; the maturity interrupt check ORs
     * it with the caster's live disable state.
     */
    interrupted: z.boolean(),
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
    // NOTE: this treats crystallized/dead units as still occupying their tile.
    // Once tile-freeing-on-death or crystal pickup lands (docs/01 §11), a
    // fully-crystallized unit MUST be removed from `units` (or given a sentinel
    // off-grid position) before another unit can stand there — otherwise this
    // refine would reject a legal post-KO state. Revisit when that feature ships.
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
 * The id of the weapon-derived basic swing. Owned by {@link basicAttackFrom}, the
 * only producer of that ability, and exported so every consumer keys on ONE
 * constant instead of a repeated string literal.
 *
 * IT IS THE ROUTING DISCRIMINANT (docs/05 §2). The basic swing is the one action
 * whose magnitude comes from the WEAPON — `weaponBaseDamage` reads
 * `weapon.formula` (paWp / braveWp / bareHands / speedWp / wpWp) and the Martial
 * Arts multiplier, none of which a {@link BattleAbility} carries. Every OTHER
 * action reads its own authored `power`. Before this constant existed the split
 * was made on `formula === "physical"`, which swept up every authored physical
 * SKILL as well — so their `power` was projected, validated, and then discarded
 * by the resolver. See {@link isBasicAttack}.
 */
export const BASIC_ATTACK_ID = "basic.attack";

/**
 * True for the weapon-derived basic swing (see {@link BASIC_ATTACK_ID}) — the one
 * ability that resolves off `weapon` rather than off its own `power`.
 *
 * THE FOUR CALL SITES MUST AGREE: the driver's single-target dispatch, the AoE
 * resolver, the balance probe's `estMagnitude`, and the viewer's forecast. If they
 * diverge the AI ranks (or the player previews) a number the pipeline will not
 * deal — which is why the predicate lives here, next to its producer, rather than
 * being re-derived at each site.
 */
export function isBasicAttack(ability: BattleAbility): boolean {
  return ability.id === BASIC_ATTACK_ID;
}

/**
 * Derive a unit's basic-attack {@link BattleAbility} from its inline `weapon`.
 * The SINGLE source of a basic attack so a freshly-built unit ({@link defaultUnit}
 * / build.ts) and a migrated v4 unit (migrate4to5) always produce a byte-identical
 * `basic.attack`, and so it can never disagree with the `weapon` it is drawn from.
 * `power`/`element`/`accuracy` mirror the weapon; a basic swing is instant
 * (`speed: null`), melee (`range {h:1,v:1}`), single-target (`aoe: null` — which is
 * what lets the AoE resolver skip the weapon-based branch entirely), and inflicts
 * nothing.
 */
export function basicAttackFrom(weapon: Weapon): BattleAbility {
  return {
    id: BASIC_ATTACK_ID,
    actionKind: "action",
    formula: "physical",
    power: weapon.wp,
    element: weapon.element,
    accuracy: weapon.accuracy,
    range: { h: 1, v: 1 },
    inflicts: [],
    speed: null,
    aoe: null,
  };
}

/**
 * Build a fully-populated UnitState with sensible defaults, overridable per
 * field (test/viewer helper). Centralizes the combat-stat defaults so schema
 * growth touches one place. Combat constants here are placeholders for setup
 * only — real numbers are verified per docs/01 §12.
 */
export function defaultUnit(id: string, teamId: number, over: Partial<UnitState> = {}): UnitState {
  // Hoisted so the default `abilities` basic-attack is derived from the SAME
  // weapon a caller may override — a fresh unit's `weapon` and `basic.attack`
  // can never drift. An explicit `over.abilities` still wins (spread last).
  const weapon: Weapon = over.weapon ?? { wp: 8, formula: "paWp", element: "none", accuracy: 100 };
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
    weapon,
    evasion: { classEv: 10, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    zodiac: { sign: "aries", gender: "neutral" },
    crystalTimer: 0,
    statuses: [],
    abilities: [basicAttackFrom(weapon)],
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
 * v4 → v5: units gain an `abilities` projection. A v4 unit had none, so seed it
 * with the single basic attack derived from its existing inline `weapon` (via
 * {@link basicAttackFrom}) — byte-identical to what a freshly-built v5 unit with
 * the same weapon carries. Purely additive: nothing reads `abilities` in combat
 * yet, so no roll or result changes. Real units are born at the current version
 * via {@link defaultUnit} / build.ts.
 */
const migrate4to5: Migration = (s) => {
  const units = (s["units"] as Array<Record<string, unknown>>).map((u) => ({
    ...u,
    abilities: [basicAttackFrom(u["weapon"] as Weapon)],
  }));
  return { ...s, schemaVersion: 5, units };
};

/**
 * v5 → v6: every unit's `evasion` gains `magicEv` (the separate magic-evasion
 * stat, docs/01 §5c/§6). A v5 unit had no magic-evasion concept, so seed it with
 * 0 — i.e. no magic evasion, which leaves the magic hit% unchanged
 * (`applyMagicEvasion(hit, 0) === hit`). Purely additive: no roll or result
 * shifts for a migrated save. Real units are born at the current version via
 * {@link defaultUnit} / build.ts.
 */
const migrate5to6: Migration = (s) => {
  const units = (s["units"] as Array<Record<string, unknown>>).map((u) => ({
    ...u,
    evasion: { ...(u["evasion"] as Record<string, unknown>), magicEv: 0 },
  }));
  return { ...s, schemaVersion: 6, units };
};

/**
 * v6 → v7: the flat `statuses: StatusFlag[]` enum becomes an array of
 * self-contained {@link ActiveStatus} records, and each charge gains the
 * `interrupted` latch (false). A v6 status was a bare name with P0's never-expiring
 * semantics, so map it via {@link legacyActiveStatus} with a PERMANENT
 * `remainingCT` — a migrated save preserves the exact P0 behavior (Stop stays
 * Stopped forever, Haste never wears off). Behavior-preserving, not additive (the
 * shape changed). Real units are born at the current version.
 */
const migrate6to7: Migration = (s) => {
  const units = (s["units"] as Array<Record<string, unknown>>).map((u) => ({
    ...u,
    statuses: (u["statuses"] as StatusFlag[]).map((flag) => legacyActiveStatus(flag)),
  }));
  const chargeQueue = (s["chargeQueue"] as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    interrupted: false,
  }));
  return { ...s, schemaVersion: 7, units, chargeQueue };
};

/**
 * v7 → v8: abilities and charge effects gain a nullable `aoe` box. A v7 record
 * had no area concept, so stamp `aoe: null` (single-target) onto every unit's
 * `abilities[]` entry AND every `chargeQueue[].effect` — byte-for-byte the same
 * single-target resolution a v7 save had (additive; no roll or result shifts).
 * Real records are born at the current version via {@link basicAttackFrom} /
 * build.ts and declareCharge.
 */
const migrate7to8: Migration = (s) => {
  const units = (s["units"] as Array<Record<string, unknown>>).map((u) => ({
    ...u,
    abilities: (u["abilities"] as Array<Record<string, unknown>>).map((a) => ({
      ...a,
      aoe: null,
    })),
  }));
  const chargeQueue = (s["chargeQueue"] as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    effect: { ...(c["effect"] as Record<string, unknown>), aoe: null },
  }));
  return { ...s, schemaVersion: 8, units, chargeQueue };
};

/**
 * v8 → v9: a projected ability's `inflicts` changes from status IDS to RESOLVED
 * {@link ActiveStatus} templates, so a registry-free resolver can actually apply
 * them (the on-hit inflict path, docs/05 §2 step d).
 *
 * THE MIGRATION DROPS THEM, and that is behaviour-preserving rather than lossy: in
 * every version up to v8 **no resolver read `inflicts` at all**, so a v8 save's
 * status ids had exactly zero effect on play. Re-resolving them here is also
 * impossible by construction — the ids can only be turned into behaviour by reading
 * the content catalog, and a migration is as registry-free as a resolver
 * (ADR-0011). Emitting `[]` therefore reproduces a migrated save's old behaviour
 * EXACTLY; inventing templates would not.
 *
 * A save made after this slice is born at v9 with real templates via build.ts.
 */
const migrate8to9: Migration = (s) => {
  const units = (s["units"] as Array<Record<string, unknown>>).map((u) => ({
    ...u,
    abilities: (u["abilities"] as Array<Record<string, unknown>>).map((a) => ({
      ...a,
      inflicts: [],
    })),
  }));
  // Charge effects gain the field too (it did not exist at v8), so an in-flight
  // charge from an old save matures with no status — which is what it would have
  // done anyway, since nothing applied inflicts before v9.
  const chargeQueue = (s["chargeQueue"] as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    effect: { ...(c["effect"] as Record<string, unknown>), inflicts: [] },
  }));
  return { ...s, schemaVersion: 9, units, chargeQueue };
};

/**
 * Migration registry: `MIGRATIONS[v]` upgrades a state from version `v` to
 * `v + 1`. Each schema bump registers its migration here.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: migrate1to2,
  2: migrate2to3,
  3: migrate3to4,
  4: migrate4to5,
  5: migrate5to6,
  6: migrate6to7,
  7: migrate7to8,
  8: migrate8to9,
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
