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
import { loadContentPack, type ContentPack, type ContentRegistry } from "./content.js";
import { defaultUnitRecord } from "./roster.js";
import { emptyLoadout, setLoadoutSlot, setLoadoutTraits } from "./loadout.js";
import { buildBattleUnit, buildBattleState, DEFERRED_MOVEMENT_EFFECTS } from "./build.js";
import { deserialize, serialize } from "./state.js";

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

describe("ADR-0021 — progression is authored: level and AP are not power", () => {
  /**
   * AC-J10 / AC-J11. READ THE CAVEAT BEFORE TRUSTING THE GREEN TICK: both of these
   * PASS TODAY, before any work — `deriveStats` reads neither `level` nor `ap`. They
   * are REGRESSION GUARDS, not evidence that ADR-0021's design is right, and the only
   * thing that proves they discriminate is the mutation named in each docstring
   * (verified by hand when they were written; re-run it if you doubt them).
   *
   * They exist because the shipped behaviour was an ACCIDENT until ADR-0021 — `level`
   * has been on `UnitRecord` since rosterSchemaVersion 2 and nothing ever read it, so
   * there was nothing to stop a future slice quietly wiring growth to it and
   * reintroducing the overlevel bulldoze the ADR rules out.
   */
  const LEVELS = [1, 10, 40, 99] as const;

  it("AC-J10: the same record built at any two levels is byte-identical", () => {
    // Mutation that must turn this red: multiply any stat by a level term in
    // `deriveStats` (e.g. `raw.pa * job.growth.pa * (1 + record.level / 20)`).
    let base = defaultUnitRecord("climber", "knight", {
      raw: { pa: 8, ma: 8, speed: 8, hp: 255, mp: 24 },
      mastered: ["knight", "monk"],
    });
    base = setLoadoutTraits(base, ["bulwark", "inner-focus"], registry);
    const built = LEVELS.map((level) => buildBattleUnit({ ...base, level }, registry));

    // The fixture must be one where a level term COULD show up: non-zero raw stats in
    // every slot, or "identical" is trivially true and the test certifies nothing.
    expect(built[0]!.pa).toBeGreaterThan(0);
    expect(built[0]!.maxHp).toBeGreaterThan(1);
    for (const unit of built.slice(1)) expect(unit).toEqual(built[0]);
  });

  it("AC-J11: the same record built with any AP total is byte-identical", () => {
    // AP is the one quantity on the record a player CAN farm, so it is the concrete
    // subject of "no power source scales with a repeatable quantity". AP must buy
    // abilities (which change the unit through the loadout) and nothing else.
    // Mutation that must turn this red: add `record.ap` to any derived stat.
    const base = defaultUnitRecord("earner", "monk", {
      raw: { pa: 8, ma: 8, speed: 8, hp: 208, mp: 24 },
    });
    const poor = buildBattleUnit({ ...base, ap: 0 }, registry);
    const rich = buildBattleUnit({ ...base, ap: 100_000 }, registry);
    expect(rich).toEqual(poor);
  });

  it("the guard is not vacuous: the SAME builder does move for a real power source", () => {
    // The other half of the evidence. Without this, all the assertions above would
    // also pass against a `buildBattleUnit` that ignored its inputs entirely and
    // returned a constant — the degenerate way to satisfy "nothing changes it".
    const base = defaultUnitRecord("mover", "knight", {
      raw: { pa: 8, ma: 8, speed: 8, hp: 255, mp: 24 },
      mastered: ["knight"],
    });
    const plain = buildBattleUnit(base, registry);
    const trained = buildBattleUnit(setLoadoutTraits(base, ["bulwark"], registry), registry);
    expect(trained).not.toEqual(plain);
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

describe("buildBattleUnit — mastery-trait stat effects (docs/02, AC-P5)", () => {
  const DEFAULT_EVASION = { classEv: 10, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 };

  it("no-trait build is a no-op vs the same record without a trait (byte-identical)", () => {
    const rec = defaultUnitRecord("plain", "knight", {
      raw: { pa: 10, ma: 10, speed: 5, hp: 50, mp: 10 },
    });
    const unit = buildBattleUnit(rec, registry);
    // Empty traits ⇒ derived stats + defaultUnit's move/evasion, unchanged.
    expect(unit.pa).toBe(12); // floor(10 * 1.2)
    expect(unit.ma).toBe(8); // floor(10 * 0.8)
    expect(unit.maxHp).toBe(60); // floor(50 * 1.2)
    expect(unit.move).toBe(3);
    expect(unit.evasion).toEqual(DEFAULT_EVASION);
  });

  it("bulwark (Knight): classEv +10 and maxHp ×1.05", () => {
    // Knight growth hp 1.2: raw.hp 50 → base maxHp 60; ×1.05 → floor(63) = 63.
    let rec = defaultUnitRecord("kn", "knight", {
      raw: { pa: 10, ma: 10, speed: 5, hp: 50, mp: 10 },
      mastered: ["knight"],
    });
    rec = setLoadoutTraits(rec, ["bulwark"], registry);
    const unit = buildBattleUnit(rec, registry);
    expect(unit.maxHp).toBe(63);
    expect(unit.hp).toBe(63); // hp starts at full (trait-adjusted) maxHp
    expect(unit.evasion.classEv).toBe(20); // 10 default + 10
    expect(unit.evasion.weaponEv).toBe(0); // untouched
    expect(unit.pa).toBe(12); // pa untouched by bulwark
  });

  it("inner-focus (Monk): maxHp ×1.12 (earned via mastered monk, worn on a knight)", () => {
    // currentJob knight (hp 1.2): raw.hp 50 → 60; inner-focus ×1.12 → floor(67.2) = 67.
    let rec = defaultUnitRecord("mk", "knight", {
      raw: { pa: 10, ma: 10, speed: 5, hp: 50, mp: 10 },
      mastered: ["monk"],
    });
    rec = setLoadoutTraits(rec, ["inner-focus"], registry);
    const unit = buildBattleUnit(rec, registry);
    expect(unit.maxHp).toBe(67);
    expect(unit.evasion).toEqual(DEFAULT_EVASION); // no evasion effect
  });

  it("arcane-attunement (Wizard): ma ×1.12", () => {
    // Wizard growth ma 1.5: raw.ma 10 → base ma 15; ×1.12 → floor(16.8) = 16.
    let rec = defaultUnitRecord("wz", "wizard", {
      raw: { pa: 10, ma: 10, speed: 5, hp: 50, mp: 10 },
      mastered: ["wizard"],
    });
    rec = setLoadoutTraits(rec, ["arcane-attunement"], registry);
    const unit = buildBattleUnit(rec, registry);
    expect(unit.ma).toBe(16);
  });

  it("lightfoot (Thief): move +1", () => {
    let rec = defaultUnitRecord("th", "thief", {
      raw: { pa: 10, ma: 10, speed: 5, hp: 50, mp: 10 },
      mastered: ["thief"],
    });
    rec = setLoadoutTraits(rec, ["lightfoot"], registry);
    const unit = buildBattleUnit(rec, registry);
    expect(unit.move).toBe(4); // default 3 + 1
  });

  it("two traits aggregate: bulwark + inner-focus stack both maxHp mults and classEv", () => {
    // Knight hp 1.2: raw.hp 50 → 60; floor(60 * 1.05 * 1.12) = floor(70.56) = 70.
    let rec = defaultUnitRecord("hy", "knight", {
      raw: { pa: 10, ma: 10, speed: 5, hp: 50, mp: 10 },
      mastered: ["knight", "monk"],
    });
    rec = setLoadoutTraits(rec, ["bulwark", "inner-focus"], registry);
    const unit = buildBattleUnit(rec, registry);
    expect(unit.maxHp).toBe(70);
    expect(unit.evasion.classEv).toBe(20); // only bulwark adds classEv
  });

  it("trait order in the loadout does not change the built unit", () => {
    const base = defaultUnitRecord("ord", "knight", {
      raw: { pa: 10, ma: 10, speed: 5, hp: 50, mp: 10 },
      mastered: ["knight", "monk"],
    });
    const forward = buildBattleUnit(setLoadoutTraits(base, ["bulwark", "inner-focus"], registry), registry);
    const reversed = buildBattleUnit(setLoadoutTraits(base, ["inner-focus", "bulwark"], registry), registry);
    expect(forward).toEqual(reversed);
  });

  it("an explicit `over` stat still wins over the trait-adjusted value", () => {
    let rec = defaultUnitRecord("ov", "thief", {
      raw: { pa: 10, ma: 10, speed: 5, hp: 50, mp: 10 },
      mastered: ["thief"],
    });
    rec = setLoadoutTraits(rec, ["lightfoot"], registry);
    const unit = buildBattleUnit(rec, registry, { move: 9 });
    expect(unit.move).toBe(9); // caller override beats the +1 trait
  });
});

describe("buildBattleUnit — final clamp to UnitStateSchema bounds (FIX 1, docs/05 §4)", () => {
  /**
   * A pack whose traits can push a folded stat OUT of the schema bounds — a
   * negative flat below the min, or an evasion add above 100. `ScalarMod.flat` /
   * `MoveMod.flat` are unbounded ints, so these are representable. Growth is all
   * 1.0 so the base stat equals the raw stat (easy arithmetic). The traits are set
   * on the loadout DIRECTLY (bypassing the setLoadoutTraits earned-check) to prove
   * the build-time clamp, not the setter, is what keeps the unit schema-valid.
   */
  function boundsPack(): ContentPack {
    return {
      contentSchemaVersion: 2,
      statuses: [],
      traits: [
        { id: "frail-curse", effect: { maxHp: { flat: -1000 } } },
        { id: "wall", effect: { evasion: { classEv: 200 } } },
        { id: "hobble", effect: { move: { flat: -10 } } },
        { id: "enfeeble", effect: { pa: { flat: -100 }, ma: { flat: -100 } } },
      ],
      abilities: [{ id: "b.strike", type: "action", skillset: "b-skill", apCost: 10 }],
      jobs: [
        {
          id: "bjob",
          primarySkillset: "b-skill",
          genderLock: null,
          growth: { pa: 1, ma: 1, speed: 1, hp: 1, mp: 1 },
          masteryBonus: { trait: "frail-curse" },
          tree: [{ node: "n1", ability: "b.strike", apCost: 10, requires: [] }],
        },
      ],
    };
  }
  const boundsReg = loadContentPack(boundsPack());

  const withTraits = (traits: string[]) =>
    defaultUnitRecord("bnd", "bjob", {
      raw: { pa: 10, ma: 10, speed: 5, hp: 40, mp: 10 },
      loadout: { ...emptyLoadout(), traits },
    });

  it("clamps a below-1 maxHp (negative flat) up to 1, and sets hp to the clamped maxHp", () => {
    // base maxHp 40; frail-curse flat -1000 → -960; clamped to the schema min of 1.
    const unit = buildBattleUnit(withTraits(["frail-curse"]), boundsReg);
    expect(unit.maxHp).toBe(1);
    expect(unit.hp).toBe(1); // hp starts at the CLAMPED maxHp, never below it
  });

  it("clamps an evasion source above 100 down to the PercentSchema max", () => {
    // default classEv 10 + wall's +200 = 210 → clamped to 100; others untouched.
    const unit = buildBattleUnit(withTraits(["wall"]), boundsReg);
    expect(unit.evasion.classEv).toBe(100);
    expect(unit.evasion.weaponEv).toBe(0);
  });

  it("clamps negative move / pa / ma up to their schema minimums (0)", () => {
    const moved = buildBattleUnit(withTraits(["hobble"]), boundsReg);
    expect(moved.move).toBe(0); // default 3 - 10 = -7 → 0
    const enfeebled = buildBattleUnit(withTraits(["enfeeble"]), boundsReg);
    expect(enfeebled.pa).toBe(0); // 10 - 100 = -90 → 0
    expect(enfeebled.ma).toBe(0);
  });

  it("a trait-built out-of-bounds unit is schema-valid: serialize() round-trips it", () => {
    // The regression: buildBattleUnit never `.parse`s its output, so without the
    // clamp this unit only throws at serialize()/rewind. It must now round-trip.
    const state = buildBattleState([{ record: withTraits(["frail-curse", "wall"]) }], 1, boundsReg);
    const json = serialize(state); // parses on the way out — would throw if invalid
    const back = deserialize(json);
    expect(back).toEqual(state);
    expect(back.units[0]?.maxHp).toBe(1);
    expect(back.units[0]?.evasion.classEv).toBe(100);
  });

  it("no-trait build is unchanged by the clamp: legal derived stats round-trip byte-identical", () => {
    const rec = withTraits([]); // same record, empty traits
    const unit = buildBattleUnit(rec, boundsReg);
    // Every stat is already in-bounds, so the clamp is a pure no-op.
    expect(unit.pa).toBe(10);
    expect(unit.ma).toBe(10);
    expect(unit.maxHp).toBe(40);
    expect(unit.hp).toBe(40);
    expect(unit.move).toBe(3);
    expect(unit.evasion).toEqual({ classEv: 10, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 });
    const state = buildBattleState([{ record: rec }], 1, boundsReg);
    expect(deserialize(serialize(state))).toEqual(state);
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

// ── the MOVEMENT slot (ADR-0020) ────────────────────────────────────────────

describe("the movement slot is LIVE, and the abilities that are not say why", () => {
  // A TEST THAT COVERS A SUBSET READS AS COVERING THE SET (CLAUDE.md). This block used
  // to assert the whole slot was inert; ADR-0020 woke `steal.move-plus-2` together with
  // the probe's exposure term, so it now asserts the split — one live, three blocked —
  // and would fail if either half rotted.
  const rawPack = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../data/base-pack.json", import.meta.url)), "utf8"),
  ) as { abilities: Array<Record<string, unknown>> };
  const movements = rawPack.abilities.filter((a) => a["type"] === "movement");

  it("has movement abilities to check (guards the guard)", () => {
    expect(movements.length).toBeGreaterThan(0);
  });

  it("every authored movement ability either carries an effect or names its blocker", () => {
    const unrecorded = movements
      .filter((a) => a["movementEffect"] === undefined)
      .map((a) => a["id"] as string)
      .filter((id) => DEFERRED_MOVEMENT_EFFECTS[id] === undefined);
    expect(unrecorded, "authored movement ability with no effect and no blocker").toEqual([]);
  });

  it("every DEFERRED entry names a real, still-effect-less ability and a non-empty blocker", () => {
    // Keeps the manifest from rotting the OTHER way — a stale entry for an ability that
    // has since gained an effect. This is the direction that would have gone red the day
    // `move-plus-2` was authored, and it is why the manifest is trustworthy.
    for (const [id, blocker] of Object.entries(DEFERRED_MOVEMENT_EFFECTS)) {
      const authored = movements.find((a) => a["id"] === id);
      expect(authored, `DEFERRED names unknown movement ability "${id}"`).toBeDefined();
      expect(authored!["movementEffect"], `"${id}" has an effect but is still DEFERRED`).toBeUndefined();
      expect(blocker.length, id).toBeGreaterThan(20);
    }
  });

  it("equipping Move+2 moves the derived Move stat — the A/B, not the assumption", () => {
    // The dead-slot A/B (AC-J9). Equip-time validation looks identical whether or not the
    // effect exists; only building the SAME record twice, with the slot filled and empty,
    // can come out the other way. This is the exact assertion whose INVERSE this file
    // carried until ADR-0020.
    const registry = loadShippedPack();
    const base = defaultUnitRecord("mover", "thief", {
      learned: ["steal.move-plus-2"],
      loadout: emptyLoadout(),
    });
    const equipped = setLoadoutSlot(base, "movement", "steal.move-plus-2", registry);
    const off = buildBattleUnit(base, registry);
    const on = buildBattleUnit(equipped, registry);
    expect(on.move).toBe(off.move + 2);
    // …and NOTHING else moved: the movement layer touches `move` alone, which is what
    // makes its position next to the support layer order-independent.
    expect({ ...on, move: off.move }).toEqual(off);
  });

  it("a DEFERRED movement ability still changes nothing", () => {
    // The other half of the split. Without this, "the slot works" would be satisfied by
    // an implementation that applied a default to every movement ability.
    const registry = loadShippedPack();
    const base = defaultUnitRecord("scout", "archer", {
      learned: ["aim.scout"],
      loadout: emptyLoadout(),
    });
    const equipped = setLoadoutSlot(base, "movement", "aim.scout", registry);
    expect(equipped.loadout.movement).toBe("aim.scout"); // it really is equipped
    expect(buildBattleUnit(equipped, registry)).toEqual(buildBattleUnit(base, registry));
  });
});
