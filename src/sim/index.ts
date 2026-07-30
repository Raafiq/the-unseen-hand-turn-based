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
  UnitStateSchema,
  ChargedActionStateSchema,
  TurnLogEntrySchema,
  SchemaVersionError,
  MIGRATIONS,
  createBattleState,
  serialize,
  deserialize,
  rngFor,
  rngStateOf,
  type BattleState,
  type GridState,
  type UnitState,
  type ChargedActionState,
  type TurnLogEntry,
  type CreateBattleStateOptions,
  type Migration,
} from "./state.js";
