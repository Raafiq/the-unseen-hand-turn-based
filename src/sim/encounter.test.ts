import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  EncounterSchema,
  parseEncounter,
  loadEncounter,
  EncounterSchemaVersionError,
} from "./encounter.js";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { defaultUnitRecord } from "./roster.js";

function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return loadContentPack(raw);
}
const registry = loadShippedPack();

/** A minimal 1v1 def with the two placements authored OUT of team order. */
function twoPlacementDef(): unknown {
  return {
    encounterSchemaVersion: 1,
    id: "t",
    seed: 1,
    grid: { width: 4, height: 2 },
    teams: [
      { teamId: 0, controller: "ai" },
      { teamId: 1, controller: "ai" },
    ],
    placements: [
      // team 1 authored FIRST — deploy order must still put team 0 first.
      { slotId: "red", teamId: 1, pos: { x: 3, y: 0 }, facing: "W", unit: { kind: "ref", recordId: "foe" } },
      { slotId: "blue", teamId: 0, pos: { x: 0, y: 0 }, facing: "E", unit: { kind: "inline", record: defaultUnitRecord("hero-rec", "knight") } },
    ],
    victory: { kind: "eliminateTeams", teams: [1] },
    defeat: { kind: "eliminateTeams", teams: [0] },
    maxTurns: 100,
    maxTicks: 1000,
  };
}

describe("EncounterSchema — shape + integrity", () => {
  it("accepts a well-formed def and rejects duplicate slotIds", () => {
    expect(() => parseEncounter(twoPlacementDef())).not.toThrow();
    const dup = twoPlacementDef() as { placements: Array<{ slotId: string }> };
    dup.placements[1]!.slotId = "red"; // collide
    expect(() => parseEncounter(dup)).toThrow(/slotId/);
  });

  it("rejects an unknown UnitSource kind and an unknown Condition kind", () => {
    const bad = twoPlacementDef() as { placements: Array<{ unit: unknown }> };
    bad.placements[0]!.unit = { kind: "nope", recordId: "x" };
    expect(() => parseEncounter(bad)).toThrow();
  });

  it("rejects a victory condition referencing a team with no placement (typo)", () => {
    const bad = twoPlacementDef() as { victory: unknown };
    bad.victory = { kind: "eliminateTeams", teams: [5] }; // no team 5 deployed
    expect(() => parseEncounter(bad)).toThrow(/victory condition references/);
  });

  it("rejects a defeat condition referencing an unknown unit slotId (typo)", () => {
    const bad = twoPlacementDef() as { defeat: unknown };
    bad.defeat = { kind: "defeatUnit", unitId: "ghost" }; // no such slotId
    expect(() => parseEncounter(bad)).toThrow(/defeat condition references/);
  });

  it("rejects a placement position outside the grid bounds", () => {
    const bad = twoPlacementDef() as { placements: Array<{ pos: { x: number; y: number } }> };
    bad.placements[0]!.pos = { x: 10, y: 0 }; // grid is 4 wide
    expect(() => parseEncounter(bad)).toThrow(/outside the grid bounds/);
  });

  it("rejects two placements sharing a tile", () => {
    const bad = twoPlacementDef() as { placements: Array<{ pos: { x: number; y: number } }> };
    bad.placements[0]!.pos = { x: 0, y: 0 };
    bad.placements[1]!.pos = { x: 0, y: 0 }; // collide with the other placement
    expect(() => parseEncounter(bad)).toThrow(/positions must be unique/);
  });
});

describe("parseEncounter — version gate (loud fail, migration-per-bump)", () => {
  it("rejects a version newer than this build supports", () => {
    const future = { ...(twoPlacementDef() as object), encounterSchemaVersion: 2 };
    expect(() => parseEncounter(future)).toThrow(EncounterSchemaVersionError);
  });

  it("rejects a missing/non-integer version", () => {
    const noVersion = twoPlacementDef() as Record<string, unknown>;
    delete noVersion["encounterSchemaVersion"];
    expect(() => parseEncounter(noVersion)).toThrow(EncounterSchemaVersionError);
  });
});

describe("loadEncounter — resolution + deploy-order id assignment", () => {
  it("resolves inline + ref sources and stamps id(=slotId)/team/pos/facing in deploy order", () => {
    const state = loadEncounter(twoPlacementDef(), {
      registry,
      records: { foe: defaultUnitRecord("foe-rec", "monk") },
    });
    // Deploy order = team 0 then team 1, regardless of authored placement order.
    expect(state.units.map((u) => u.id)).toEqual(["blue", "red"]);
    const blue = state.units.find((u) => u.id === "blue")!;
    const red = state.units.find((u) => u.id === "red")!;
    expect(blue.teamId).toBe(0);
    expect(blue.pos).toEqual({ x: 0, y: 0 });
    expect(blue.facing).toBe("E");
    expect(red.teamId).toBe(1);
    expect(red.pos).toEqual({ x: 3, y: 0 });
    expect(red.facing).toBe("W");
    expect(state.seed).toBe(1);
    expect(state.grid).toMatchObject({ width: 4, height: 2 });
  });

  it("is deterministic — two loads of the same def are serialize-equal", () => {
    const opts = { registry, records: { foe: defaultUnitRecord("foe-rec", "monk") } };
    const a = loadEncounter(twoPlacementDef(), opts);
    const b = loadEncounter(twoPlacementDef(), opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("resolves a `slot` source from the build assignment (build-under-test seam)", () => {
    const def = {
      ...(twoPlacementDef() as { placements: unknown[] }),
      placements: [
        { slotId: "seat", teamId: 0, pos: { x: 0, y: 0 }, facing: "E", unit: { kind: "slot", slotId: "seat" } },
        { slotId: "red", teamId: 1, pos: { x: 3, y: 0 }, facing: "W", unit: { kind: "inline", record: defaultUnitRecord("f", "knight") } },
      ],
    };
    const state = loadEncounter(def, { registry }, { seat: defaultUnitRecord("under-test", "wizard") });
    const seat = state.units.find((u) => u.id === "seat")!;
    // Wizard growth (ma 1.5) proves the assigned record actually built this unit.
    expect(seat.ma).toBeGreaterThan(seat.pa);
  });

  it("throws a clear error when a ref/slot source is unresolved", () => {
    expect(() => loadEncounter(twoPlacementDef(), { registry })).toThrow(/ref source "foe"/);
  });
});

describe("EncounterSchema direct parse (typed round-trip)", () => {
  it("EncounterSchema.parse accepts the shipped skirmish fixture", () => {
    const path = fileURLToPath(new URL("../../data/encounters/skirmish-a.json", import.meta.url));
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    expect(() => EncounterSchema.parse(raw)).not.toThrow();
  });
});
