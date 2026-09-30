import { describe, it, expect } from "vitest";
import { decideBalanceProbe } from "./ai.js";
import { advanceToDecision, applyCommand, replay, type Command } from "./driver.js";
import {
  BattleStateSchema,
  PERMANENT_STATUS_CT,
  SCHEMA_VERSION,
  SchemaVersionError,
  basicAttackFrom,
  createBattleState,
  defaultUnit,
  deserialize,
  legacyActiveStatus,
  makeFlatTiles,
  MIGRATIONS,
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
    state.chargeQueue.push({
      id: "c.1",
      sourceUnitId: "u.hero",
      ct: 30,
      speed: 25,
      targetTile: { x: 1, y: 1 },
      effect: { kind: "magic", power: 18, element: "fire", accuracy: 100, aoe: null, inflicts: [] },
      interrupted: false,
    });
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

  it("migrates a v4 save to v5 by adding a basic.attack derived from each weapon (Slice 4)", () => {
    // Hand-author a v4 state by stripping the additive `abilities` field off a
    // current-version state and stamping schemaVersion 4 — a faithful v4 payload.
    const current = sampleState();
    const raw = JSON.parse(serialize(current)) as {
      schemaVersion: number;
      units: Array<Record<string, unknown>>;
    };
    raw.schemaVersion = 4;
    for (const u of raw.units) {
      delete u["abilities"];
      delete (u["weapon"] as Record<string, unknown>)["range"]; // a v4 weapon has no range
    }
    const v4 = JSON.stringify(raw);

    const migrated = deserialize(v4);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // Every unit gained exactly one basic.attack, derived from its own weapon.
    for (const u of migrated.units) {
      expect(u.abilities).toEqual([basicAttackFrom(u.weapon)]);
      expect(u.abilities[0]?.id).toBe("basic.attack");
      expect(u.abilities[0]?.power).toBe(u.weapon.wp); // mirrors the weapon
    }
    // Round-trips cleanly once migrated (real save codec).
    expect(deserialize(serialize(migrated))).toEqual(migrated);
  });

  it("migrates a v5 save to v6 by adding magicEv: 0 to each unit's evasion (Slice 6)", () => {
    // Hand-author a v5 state by stripping the additive `magicEv` off every
    // evasion and stamping schemaVersion 5 — a faithful v5 payload.
    const current = sampleState();
    const raw = JSON.parse(serialize(current)) as {
      schemaVersion: number;
      units: Array<{ evasion: Record<string, unknown>; weapon: Record<string, unknown> }>;
    };
    raw.schemaVersion = 5;
    for (const u of raw.units) {
      delete u.evasion["magicEv"];
      delete u.weapon["range"]; // a v5 weapon has no range
    }
    const v5 = JSON.stringify(raw);

    const migrated = deserialize(v5);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // Every unit gained magicEv: 0; the four physical sources are untouched.
    for (let i = 0; i < migrated.units.length; i++) {
      expect(migrated.units[i]!.evasion.magicEv).toBe(0);
      expect(migrated.units[i]!.evasion.classEv).toBe(current.units[i]!.evasion.classEv);
    }
    // Round-trips cleanly once migrated (real save codec).
    expect(deserialize(serialize(migrated))).toEqual(migrated);
  });

  it("migrates a v6 save to v7: flat status flags become ActiveStatus records; charges gain interrupted:false (Slice 7)", () => {
    // Build a current (v7) state with a stopped unit and a pending charge, then
    // hand-author its v6 predecessor: statuses back to flat names, charge without
    // the interrupted latch, schemaVersion 6.
    const current = createBattleState({
      seed: 9,
      grid: { width: 4, height: 4 },
      units: [
        defaultUnit("u.stopped", 1, { pos: { x: 0, y: 0 }, statuses: [legacyActiveStatus("stop")] }),
        defaultUnit("u.free", 0, { pos: { x: 1, y: 0 } }),
      ],
    });
    current.chargeQueue.push({
      id: "c.1", sourceUnitId: "u.free", ct: 0, speed: 10,
      targetTile: { x: 0, y: 0 }, effect: { kind: "magic", power: 8, element: "none", accuracy: 100, aoe: null, inflicts: [] },
      interrupted: false,
    });
    const raw = JSON.parse(serialize(current)) as {
      schemaVersion: number;
      units: Array<{ statuses: unknown; weapon: Record<string, unknown> }>;
      chargeQueue: Array<Record<string, unknown>>;
    };
    raw.schemaVersion = 6;
    for (const u of raw.units) delete u.weapon["range"]; // a v6 weapon has no range
    raw.units[0]!.statuses = ["stop"]; // v6 statuses were flat StatusFlag[] names
    raw.units[1]!.statuses = [];
    for (const c of raw.chargeQueue) delete c["interrupted"];
    const v6 = JSON.stringify(raw);

    const migrated = deserialize(v6);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    const stopped = migrated.units.find((u) => u.id === "u.stopped")!;
    expect(stopped.statuses).toEqual([legacyActiveStatus("stop")]);
    expect(stopped.statuses[0]!.remainingCT).toBe(PERMANENT_STATUS_CT); // preserves P0 non-expiry
    expect(migrated.units.find((u) => u.id === "u.free")!.statuses).toEqual([]);
    expect(migrated.chargeQueue[0]!.interrupted).toBe(false);
    // Round-trips cleanly once migrated (real save codec).
    expect(deserialize(serialize(migrated))).toEqual(migrated);
  });

  it("migrates a v11 save to v12: EVERY unit's weapon gains range {1,1}, nothing else moves (AC-013, ADR-0049)", () => {
    // THREE units, three DIFFERENT weapons (formula, wp, element, accuracy all distinct),
    // so a migration that stamps units[0] only, or copies one unit's weapon onto all,
    // or overwrites formula/wp while stamping, is visible rather than a coincidence.
    const weapons = [
      { wp: 8, formula: "paWp", element: "none", accuracy: 100, range: { h: 1, v: 1 } },
      { wp: 11, formula: "braveWp", element: "fire", accuracy: 90, range: { h: 1, v: 1 } },
      { wp: 4, formula: "speedWp", element: "ice", accuracy: 75, range: { h: 1, v: 1 } },
    ] as const;
    // The hand-built v12 state: what the migrated v11 save must deep-equal.
    const expected = createBattleState({
      seed: 4242,
      grid: { width: 4, height: 3 },
      units: [
        unit("u.sword", 0, { pos: { x: 0, y: 0 }, hp: 300, maxHp: 300, weapon: { ...weapons[0] } }),
        unit("u.blade", 0, { pos: { x: 0, y: 1 }, hp: 300, maxHp: 300, weapon: { ...weapons[1] } }),
        unit("u.bow", 1, { pos: { x: 1, y: 0 }, hp: 300, maxHp: 300, weapon: { ...weapons[2] } }),
      ],
    });
    // The v11 predecessor: same state, schemaVersion 11, no `weapon.range` anywhere.
    // (`basic.attack` already carries range {1,1} in v11, so it is left as it is.)
    const raw = JSON.parse(serialize(expected)) as {
      schemaVersion: number;
      units: Array<{ weapon: Record<string, unknown>; abilities: Array<{ range: unknown }> }>;
    };
    raw.schemaVersion = 11;
    for (const u of raw.units) delete u.weapon["range"];
    const v11 = JSON.stringify(raw);
    // The fixture is what it claims: three distinct weapons, none with a range, all v11.
    expect(new Set(raw.units.map((u) => JSON.stringify(u.weapon))).size).toBe(3);
    expect(raw.units.every((u) => !("range" in u.weapon))).toBe(true);

    // The migration is registered, and the current version is at least the one it produces.
    expect(MIGRATIONS[11]).toBeTypeOf("function");
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(12);

    const migrated = deserialize(v11);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // Per unit, by IDENTITY: each keeps ITS OWN weapon fields and gains exactly {1,1}.
    for (let i = 0; i < 3; i++) {
      const u = migrated.units[i]!;
      expect(u.id).toBe(expected.units[i]!.id);
      expect(u.weapon).toEqual({ ...weapons[i], range: { h: 1, v: 1 } });
      expect(u.abilities[0]!.id).toBe("basic.attack");
      expect(u.abilities[0]!.range).toEqual({ h: 1, v: 1 });
    }
    // …and the whole migrated state deep-equals the hand-built v12 one.
    expect(migrated).toEqual(expected);

    // Same command log, same outcome, before and after the bump. The log is generated
    // LIVE from the hand-built state (AI-driven, so every unit takes turns), then replayed
    // from the migrated save; the two must agree byte for byte, rngCounter included.
    const log: Command[] = [];
    let live = expected;
    for (let i = 0; i < 12; i++) {
      const d = advanceToDecision(live);
      if (d.unitId === null) break;
      const cmd = decideBalanceProbe(d.state, d.unitId);
      log.push(cmd);
      live = applyCommand(live, cmd);
    }
    expect(log.length).toBe(12);
    expect(new Set(live.turnLog.map((e) => e.unitId)).size).toBe(3); // all three units acted
    expect(live.rngCounter).toBeGreaterThan(0); // rolls were actually drawn
    const afterBump = replay(migrated, log);
    expect(serialize(afterBump)).toBe(serialize(live));
    expect(afterBump.rngCounter).toBe(live.rngCounter);
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

  it("rejects duplicate unit ids (the tie-break and lookups depend on uniqueness)", () => {
    const state = sampleState();
    state.units[1] = { ...state.units[1]!, id: state.units[0]!.id };
    expect(() => serialize(state)).toThrow();
  });
});
