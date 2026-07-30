import { describe, it, expect } from "vitest";
import {
  BattleStateSchema,
  SCHEMA_VERSION,
  SchemaVersionError,
  createBattleState,
  deserialize,
  rngFor,
  serialize,
  type BattleState,
} from "./state.js";

function sampleState(): BattleState {
  return createBattleState({
    seed: 0x1234abcd,
    grid: { width: 8, height: 6 },
    units: [
      { id: "u.hero", teamId: 0, ct: 40 },
      { id: "u.enemy", teamId: 1, ct: 0 },
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
    state.chargeQueue.push({ id: "c.1", sourceUnitId: "u.hero", ct: 30 });
    const restored = deserialize(serialize(state));
    expect(restored).toEqual(state);
  });

  it("a fresh state is valid and starts at tick 0 with an unconsumed stream", () => {
    const state = createBattleState({ seed: 1 });
    expect(() => BattleStateSchema.parse(state)).not.toThrow();
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
    // Two reconstructions from the same cursor draw identically.
    expect(a.nextFloat()).toBe(b.nextFloat());
  });
});

describe("BattleState — schema version handling (AC-S6, docs/05 §5)", () => {
  it("rejects a version newer than this build, loudly", () => {
    const state = sampleState();
    const tampered = JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION + 1 });
    expect(() => deserialize(tampered)).toThrow(SchemaVersionError);
  });

  it("rejects a version older than the minimum supported, loudly", () => {
    const state = sampleState();
    const tampered = JSON.stringify({ ...state, schemaVersion: 0 });
    expect(() => deserialize(tampered)).toThrow(SchemaVersionError);
  });

  it("rejects a missing/non-integer schemaVersion", () => {
    const state = sampleState();
    const { schemaVersion: _omit, ...withoutVersion } = state;
    void _omit;
    expect(() => deserialize(JSON.stringify(withoutVersion))).toThrow(SchemaVersionError);
  });

  it("rejects non-object top-level JSON", () => {
    expect(() => deserialize("[]")).toThrow(SchemaVersionError);
    expect(() => deserialize("42")).toThrow(SchemaVersionError);
  });
});

describe("BattleState — validation rejects malformed data", () => {
  it("rejects unknown keys (strict schema)", () => {
    const state = sampleState() as unknown as Record<string, unknown>;
    const bad = JSON.stringify({ ...state, bogus: true });
    expect(() => deserialize(bad)).toThrow();
  });

  it("rejects a negative tick", () => {
    const state = sampleState();
    const bad = JSON.stringify({ ...state, tick: -1 });
    expect(() => deserialize(bad)).toThrow();
  });

  it("serialize validates on the way out", () => {
    const bad = { ...sampleState(), tick: -5 } as BattleState;
    expect(() => serialize(bad)).toThrow();
  });
});
