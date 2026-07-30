/**
 * Public surface of the pure, headless simulation core (docs/05).
 *
 * Nothing in `src/sim/**` may import from a render/UI/IO layer — the sim must
 * stay unit-testable against the formula vectors and free of nondeterminism
 * (ADR-0004, sim-determinism-guard skill).
 */

export { SeededRng, type RngState } from "./rng.js";
export {
  SCHEMA_VERSION,
  MIN_SUPPORTED_SCHEMA_VERSION,
  BattleStateSchema,
  GridStateSchema,
  TileSchema,
  PositionSchema,
  FacingSchema,
  StatusFlagSchema,
  UnitStateSchema,
  ChargedActionStateSchema,
  TurnLogEntrySchema,
  SchemaVersionError,
  MIGRATIONS,
  createBattleState,
  makeFlatTiles,
  serialize,
  deserialize,
  rngFor,
  rngStateOf,
  type BattleState,
  type GridState,
  type Tile,
  type Position,
  type Facing,
  type StatusFlag,
  type UnitState,
  type ChargedActionState,
  type TurnLogEntry,
  type CreateBattleStateOptions,
  type Migration,
} from "./state.js";
export {
  inBounds,
  tileIndex,
  tileAt,
  moveRange,
  relativeFacing,
  FACING_VECTOR,
  OPPOSITE_FACING,
} from "./grid.js";
export {
  HASTE_FACTOR,
  SLOW_FACTOR,
  TURN_THRESHOLD,
  CT_COST_MOVE_AND_ACT,
  CT_COST_ONE,
  CT_COST_WAIT,
  ctRateOfUnit,
  ctRateOfCharge,
  tieBreak,
  advanceToNextTurn,
  settleTurn,
  type ActiveActor,
  type NextTurn,
} from "./scheduler.js";
