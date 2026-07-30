import { describe, it, expect } from "vitest";
import {
  BattleStateSchema,
  SCHEMA_VERSION,
  SchemaVersionError,
  createBattleState,
  defaultUnit,
  deserialize,
  makeFlatTiles,
  rngFor,
  serialize,
  type BattleState,
  type UnitState,
} from "./state.js";

const unit = (id: string, teamId: number, over: Partial<UnitState> = {}): UnitState =>
  defaultUnit(id, teamId, over);

function sampleState(): BattleState {
  return createBattleState({
    seed: 0x1234abcd,
    grid: { width: 8, height: 6 },
    units: [
      unit("u.hero", 0, { pos: { x: 1, y: 1 }, ct: 40 }),
      unit("u.enemy", 1, { pos: { x: 6, y: 4 }, facing: "N" }),
    ],
  });
}

describe("BattleState — serialization round-trip (AC-S6)", () => {
  it("deserialize(serialize(state)) deep-equals state", () => {
    const state = sampleState();
    const restored = deserialize(serialize(state));
    expect(restored).toEqual(state);
  });

  it("round-trips a state with populated turn log and charge queue", () => {
    const state = sampleState();
    state.tick = 12;
    state.rngCounter = 5;
    state.turnLog.push({ tick: 12, unitId: "u.hero", action: "wait" });
    state.chargeQueue.push({ id: "c.1", sourceUnitId: "u.hero", ct: 30, speed: 25 });
    const restored = deserialize(serialize(state));
    expect(restored).toEqual(state);
  });

  it("auto-fills a flat grid whose tile count matches width*height", () => {
    const state = createBattleState({ seed: 1, grid: { width: 4, height: 3 } });
    expect(state.grid.tiles).toHaveLength(12);
    expect(() => BattleStateSchema.parse(state)).not.toThrow();
  });

  it("a fresh state starts at tick 0 with an unconsumed stream", () => {
    const state = createBattleState({ seed: 1 });
    expect(state.tick).toBe(0);
    expect(state.rngCounter).toBe(0);
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe("BattleState — RNG cursor reconstruction", () => {
  it("rngFor reconstructs the stream at the state's cursor", () => {
    const state = sampleState();
    state.rngCounter = 9;
    const a = rngFor(state);
    const b = rngFor(state);
    expect(a.count).toBe(9);
    expect(a.nextFloat()).toBe(b.nextFloat());
  });
});

describe("BattleState — schema version handling (AC-S6, docs/05 §5)", () => {
  it("rejects a version newer than this build, loudly", () => {
    const tampered = JSON.stringify({ ...sampleState(), schemaVersion: SCHEMA_VERSION + 1 });
    expect(() => deserialize(tampered)).toThrow(SchemaVersionError);
  });

  it("rejects a missing/non-integer schemaVersion", () => {
    const { schemaVersion: _omit, ...withoutVersion } = sampleState();
    void _omit;
    expect(() => deserialize(JSON.stringify(withoutVersion))).toThrow(SchemaVersionError);
  });

  it("rejects non-object top-level JSON", () => {
    expect(() => deserialize("[]")).toThrow(SchemaVersionError);
    expect(() => deserialize("42")).toThrow(SchemaVersionError);
  });

  it("migrates a v1 save forward to the current schema (docs/05 §5)", () => {
    // A hand-authored v1 snapshot: old grid + minimal units, no positions/stats.
    const v1 = JSON.stringify({
      schemaVersion: 1,
      seed: 7,
      tick: 3,
      rngCounter: 2,
      grid: { width: 4, height: 4 },
      units: [
        { id: "u.a", teamId: 0, ct: 10 },
        { id: "u.b", teamId: 1, ct: 20 },
      ],
      chargeQueue: [{ id: "c.old", sourceUnitId: "u.a", ct: 5 }],
      turnLog: [],
    });
    const migrated = deserialize(v1);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.grid.tiles).toHaveLength(16);
    expect(migrated.units[0]).toMatchObject({ id: "u.a", ct: 10, pos: { x: 0, y: 0 } });
    expect(migrated.units[1]?.pos).toEqual({ x: 1, y: 0 });
    expect(migrated.chargeQueue[0]?.speed).toBe(10);
    // Round-trips cleanly once migrated.
    expect(deserialize(serialize(migrated))).toEqual(migrated);
  });

  it("refuses to migrate a v1 save whose units overflow the grid (never corrupt)", () => {
    const v1 = JSON.stringify({
      schemaVersion: 1,
      seed: 1,
      tick: 0,
      rngCounter: 0,
      grid: { width: 2, height: 2 },
      units: [0, 1, 2, 3, 4].map((i) => ({ id: `u.${i}`, teamId: 0, ct: 0 })),
      chargeQueue: [],
      turnLog: [],
    });
    expect(() => deserialize(v1)).toThrow(SchemaVersionError);
  });
});

describe("BattleState — validation rejects malformed data", () => {
  it("rejects unknown keys (strict schema)", () => {
    const bad = JSON.stringify({ ...sampleState(), bogus: true });
    expect(() => deserialize(bad)).toThrow();
  });

  it("rejects a grid whose tile count disagrees with its dimensions", () => {
    const state = sampleState();
    const bad = JSON.stringify({ ...state, grid: { ...state.grid, tiles: makeFlatTiles(2, 2) } });
    expect(() => deserialize(bad)).toThrow();
  });

  it("serialize validates on the way out", () => {
    const bad = { ...sampleState(), tick: -5 } as BattleState;
    expect(() => serialize(bad)).toThrow();
  });

  it("rejects two units sharing a tile (position uniqueness)", () => {
    const state = sampleState();
    const first = state.units[0]!;
    state.units[1] = { ...state.units[1]!, pos: { x: first.pos.x, y: first.pos.y } };
    expect(() => serialize(state)).toThrow();
  });
});
