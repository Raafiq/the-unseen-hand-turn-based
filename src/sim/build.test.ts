/**
 * Battle-start bridge tests (docs/05 §4, ADR-0011) — the compile from a persistent
 * UnitRecord into a battle-ready UnitState. Exercises the real shipped content pack
 * (`data/base-pack.json`) so the job growth multipliers and skillset wiring are the
 * genuine ones. The test does IO (reads the JSON) — a test-layer concern; build.ts
 * stays pure (the registry is injected).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { defaultUnitRecord } from "./roster.js";
import { setLoadoutSlot } from "./loadout.js";
import { buildBattleUnit, buildBattleState } from "./build.js";

function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return loadContentPack(raw);
}

const registry = loadShippedPack();

describe("buildBattleUnit — stat derivation (docs/05 §4: raw × job growth, floored per step)", () => {
  it("floors raw × the current job's growth multiplier, per stat", () => {
    // wizard growth: pa 0.6, ma 1.5, speed 1.0, hp 0.75, mp 1.2 (base-pack).
    const rec = defaultUnitRecord("mage", "wizard", {
      raw: { pa: 7, ma: 9, speed: 5, hp: 41, mp: 10 },
    });
    const unit = buildBattleUnit(rec, registry);

    expect(unit.pa).toBe(4); // floor(7 * 0.6)  = floor(4.2)
    expect(unit.ma).toBe(13); // floor(9 * 1.5)  = floor(13.5)
    expect(unit.speed).toBe(5); // floor(5 * 1.0)
    expect(unit.maxHp).toBe(30); // floor(41 * 0.75) = floor(30.75)
    expect(unit.hp).toBe(30); // hp starts at full maxHp
  });

  it("clamps derived speed/maxHp to the schema minimum of 1", () => {
    // wizard hp growth 0.75; raw.hp 1 → floor(0.75) = 0, clamped up to 1.
    const rec = defaultUnitRecord("frail", "wizard", {
      raw: { pa: 0, ma: 0, speed: 0, hp: 1, mp: 0 },
    });
    const unit = buildBattleUnit(rec, registry);
    expect(unit.speed).toBeGreaterThanOrEqual(1);
    expect(unit.maxHp).toBeGreaterThanOrEqual(1);
  });

  it("carries brave/faith straight through from the record (not growth-scaled)", () => {
    const rec = defaultUnitRecord("h", "knight", { brave: 63, faith: 41 });
    const unit = buildBattleUnit(rec, registry);
    expect(unit.brave).toBe(63);
    expect(unit.faith).toBe(41);
  });

  it("honors placement overrides (pos/facing/teamId) while deriving stats", () => {
    const rec = defaultUnitRecord("h", "knight");
    const unit = buildBattleUnit(rec, registry, { teamId: 1, pos: { x: 3, y: 2 }, facing: "N" });
    expect(unit.teamId).toBe(1);
    expect(unit.pos).toEqual({ x: 3, y: 2 });
    expect(unit.facing).toBe("N");
  });
});

describe("buildBattleUnit — abilities projection (primary + secondary + basic attack)", () => {
  it("projects basic attack, learned primary actions, and learned secondary actions", () => {
    // Knight (primary = battle-skill) with a learned battle-skill action, plus a
    // Black Magic (wizard) secondary command with two learned actions.
    let rec = defaultUnitRecord("versatile", "knight", {
      learned: [
        "battle-skill.weapon-break", // primary action
        "battle-skill.equip-heavy-armor", // primary skillset but a SUPPORT (passive)
        "black-magic.fire", // secondary action
        "black-magic.ice", // secondary action
      ],
    });
    rec = setLoadoutSlot(rec, "secondary", "wizard", registry);

    const unit = buildBattleUnit(rec, registry);
    const ids = unit.abilities.map((a) => a.id);

    expect(ids).toContain("basic.attack"); // always present
    expect(ids).toContain("battle-skill.weapon-break"); // primary command action
    expect(ids).toContain("black-magic.fire"); // secondary command action
    expect(ids).toContain("black-magic.ice"); // secondary command action
    // Passive (support) is NOT projected as a castable action this slice.
    expect(ids).not.toContain("battle-skill.equip-heavy-armor");
  });

  it("projects a lone basic attack for a bare record (no learned, no secondary)", () => {
    const rec = defaultUnitRecord("rookie", "knight");
    const unit = buildBattleUnit(rec, registry);
    expect(unit.abilities).toHaveLength(1);
    expect(unit.abilities[0]?.id).toBe("basic.attack");
    expect(unit.abilities[0]?.actionKind).toBe("action");
    expect(unit.abilities[0]?.speed).toBeNull(); // basic swing is instant
  });

  it("maps a charged magic action's fields into the battle projection", () => {
    // fire is in the PRIMARY command (wizard's black-magic), so no secondary needed.
    const rec = defaultUnitRecord("caster", "wizard", { learned: ["black-magic.fire"] });
    const unit = buildBattleUnit(rec, registry);
    const fire = unit.abilities.find((a) => a.id === "black-magic.fire");
    expect(fire).toBeDefined();
    expect(fire?.formula).toBe("magic");
    expect(fire?.power).toBe(20); // base-pack fire power
    expect(fire?.element).toBe("fire");
    expect(fire?.speed).toBe(25); // charged (its own charge speed), not instant
  });
});

describe("buildBattleUnit — purity / determinism", () => {
  it("same inputs produce a deep-equal unit twice (no hidden nondeterminism)", () => {
    let rec = defaultUnitRecord("d", "knight", {
      learned: ["battle-skill.weapon-break", "black-magic.fire"],
    });
    rec = setLoadoutSlot(rec, "secondary", "wizard", registry);
    const a = buildBattleUnit(rec, registry, { teamId: 0, pos: { x: 1, y: 1 } });
    const b = buildBattleUnit(rec, registry, { teamId: 0, pos: { x: 1, y: 1 } });
    expect(a).toEqual(b);
  });
});

describe("buildBattleState — deterministic layout + wrap", () => {
  it("builds one unit per record with a deterministic row-major layout", () => {
    const inputs = [
      { record: defaultUnitRecord("a", "knight") },
      { record: defaultUnitRecord("b", "wizard") },
      { record: defaultUnitRecord("c", "thief") },
    ];
    const state = buildBattleState(inputs, 99, registry);
    expect(state.units.map((u) => u.id)).toEqual(["a", "b", "c"]);
    expect(state.units[0]?.pos).toEqual({ x: 0, y: 0 });
    expect(state.units[1]?.pos).toEqual({ x: 1, y: 0 });
    expect(state.units[2]?.pos).toEqual({ x: 2, y: 0 });
    expect(state.tick).toBe(0);
    expect(state.rngCounter).toBe(0);
  });

  it("respects per-input placement overrides and is deterministic", () => {
    const inputs = [
      { record: defaultUnitRecord("a", "knight"), over: { teamId: 0, pos: { x: 0, y: 0 } } },
      { record: defaultUnitRecord("b", "wizard"), over: { teamId: 1, pos: { x: 4, y: 4 } } },
    ];
    const build = (): ReturnType<typeof buildBattleState> =>
      buildBattleState(inputs, 7, registry, { width: 5, height: 5 });
    const s1 = build();
    const s2 = build();
    expect(s1).toEqual(s2);
    expect(s1.units[1]?.teamId).toBe(1);
    expect(s1.units[1]?.pos).toEqual({ x: 4, y: 4 });
  });
});
