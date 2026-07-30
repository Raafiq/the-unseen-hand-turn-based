/**
 * Roster codec tests (AC-J2/J3 substrate): the persistent UnitRecord round-trips
 * through its own version-gated codec and fails loudly on a bad version / unknown
 * key — the same loud-fail contract state.ts and content.ts hold.
 */

import { describe, it, expect } from "vitest";
import {
  ROSTER_SCHEMA_VERSION,
  RosterSchemaVersionError,
  UnitRecordSchema,
  defaultUnitRecord,
  serializeRecord,
  deserializeRecord,
  type UnitRecord,
} from "./roster.js";
import { emptyLoadout } from "./loadout.js";

describe("roster codec — round-trip + defaults", () => {
  it("defaultUnitRecord produces a schema-valid record at the current version", () => {
    const rec = defaultUnitRecord("hero", "knight");
    expect(() => UnitRecordSchema.parse(rec)).not.toThrow();
    expect(rec.rosterSchemaVersion).toBe(ROSTER_SCHEMA_VERSION);
    expect(rec.id).toBe("hero");
    expect(rec.currentJob).toBe("knight");
    expect(rec.ap).toBe(0);
    expect(rec.learned).toEqual([]);
    expect(rec.mastered).toEqual([]);
  });

  it("serialize → deserialize is an exact round-trip", () => {
    const rec = defaultUnitRecord("hero", "wizard", {
      name: "Ramza",
      level: 12,
      ap: 340,
      brave: 65,
      faith: 48,
      raw: { pa: 7, ma: 11, speed: 6, hp: 88, mp: 42 },
      learned: ["black-magic.fire", "black-magic.ice"],
      mastered: ["knight"],
    });
    const back = deserializeRecord(serializeRecord(rec));
    expect(back).toEqual(rec);
  });

  it("overrides cannot forge a non-current schema version", () => {
    // defaultUnitRecord omits rosterSchemaVersion from its override type, so a
    // freshly minted record is always current.
    const rec = defaultUnitRecord("x", "thief");
    expect(rec.rosterSchemaVersion).toBe(ROSTER_SCHEMA_VERSION);
  });
});

describe("roster codec — loud version + shape guards", () => {
  it("rejects a too-new rosterSchemaVersion", () => {
    const rec = defaultUnitRecord("hero", "knight");
    const tooNew = JSON.stringify({ ...rec, rosterSchemaVersion: ROSTER_SCHEMA_VERSION + 1 });
    expect(() => deserializeRecord(tooNew)).toThrow(RosterSchemaVersionError);
    expect(() => deserializeRecord(tooNew)).toThrow(/newer than this build/);
  });

  it("rejects a missing version", () => {
    const rec = defaultUnitRecord("hero", "knight") as Partial<UnitRecord>;
    delete rec.rosterSchemaVersion;
    expect(() => deserializeRecord(JSON.stringify(rec))).toThrow(RosterSchemaVersionError);
  });

  it("rejects a non-integer version", () => {
    const rec = defaultUnitRecord("hero", "knight");
    const bad = JSON.stringify({ ...rec, rosterSchemaVersion: 1.5 });
    expect(() => deserializeRecord(bad)).toThrow(RosterSchemaVersionError);
  });

  it("rejects a non-object payload", () => {
    expect(() => deserializeRecord("null")).toThrow(RosterSchemaVersionError);
    expect(() => deserializeRecord("[]")).toThrow(RosterSchemaVersionError);
  });

  it("rejects an unknown key (.strict)", () => {
    const rec = defaultUnitRecord("hero", "knight");
    const bad = JSON.stringify({ ...rec, unexpectedField: true });
    expect(() => deserializeRecord(bad)).toThrow();
  });

  it("serialize validates on the way out (bad raw stat is rejected)", () => {
    const bad = { ...defaultUnitRecord("hero", "knight"), ap: -1 } as UnitRecord;
    expect(() => serializeRecord(bad)).toThrow();
  });
});

describe("roster codec — v1→v2 loadout migration (Slice 3)", () => {
  /** A hand-authored v1 record: pre-loadout shape, no `loadout` field. */
  function v1Record(): Record<string, unknown> {
    return {
      rosterSchemaVersion: 1,
      id: "old-save",
      name: "Old Save",
      level: 7,
      currentJob: "knight",
      raw: { pa: 6, ma: 5, speed: 6, hp: 55, mp: 12 },
      brave: 70,
      faith: 50,
      ap: 180,
      learned: ["battle-skill.weapon-break"],
      mastered: [],
    };
  }

  it("migrates a v1 record forward to v2 with an empty loadout", () => {
    const migrated = deserializeRecord(JSON.stringify(v1Record()));
    expect(migrated.rosterSchemaVersion).toBe(2);
    expect(migrated.loadout).toEqual(emptyLoadout());
    // Non-loadout fields are carried through untouched.
    expect(migrated.ap).toBe(180);
    expect(migrated.learned).toEqual(["battle-skill.weapon-break"]);
  });

  it("a v2 record with a populated loadout round-trips exactly", () => {
    const rec = defaultUnitRecord("hero", "knight", {
      learned: ["black-magic.fire"],
      loadout: {
        secondary: "wizard",
        reaction: null,
        support: null,
        movement: null,
        traits: ["bulwark"],
      },
    });
    expect(rec.rosterSchemaVersion).toBe(ROSTER_SCHEMA_VERSION);
    expect(deserializeRecord(serializeRecord(rec))).toEqual(rec);
  });
});
