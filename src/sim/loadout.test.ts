/**
 * 5-slot ability chassis + free respec tests (AC-J1 / AC-J4, docs/02). Exercises
 * the real shipped content pack (`data/base-pack.json`) for the slot-type / command
 * rules, plus a tiny inline pack for the AC-J6 `excludes` hook (base-pack has none).
 *
 * The test does IO (reads the JSON) — a test-layer concern; the sim stays pure.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { loadContentPack, type ContentPack, type ContentRegistry } from "./content.js";
import { defaultUnitRecord } from "./roster.js";
import {
  LoadoutSchema,
  LoadoutSlotSchema,
  emptyLoadout,
  primaryCommand,
  setLoadoutSlot,
  setLoadoutTraits,
  equippedSecondaryAbilities,
} from "./loadout.js";

function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return loadContentPack(raw);
}

const registry = loadShippedPack();

describe("AC-J1 — chassis cardinality", () => {
  it("a loadout has exactly secondary/reaction/support/movement + traits", () => {
    expect(Object.keys(emptyLoadout()).sort()).toEqual([
      "movement",
      "reaction",
      "secondary",
      "support",
      "traits",
    ]);
  });

  it("Primary is NOT a settable slot (derived, not stored)", () => {
    expect(LoadoutSlotSchema.options).toEqual(["secondary", "reaction", "support", "movement"]);
    expect(LoadoutSlotSchema.options).not.toContain("primary");
    // The only way to read the Primary is to derive it from currentJob.
    const rec = defaultUnitRecord("h", "wizard");
    expect(primaryCommand(rec, registry)).toBe("black-magic");
  });

  it("a 3-trait loadout is rejected by the schema (.max(2))", () => {
    expect(() =>
      LoadoutSchema.parse({ ...emptyLoadout(), traits: ["a", "b", "c"] }),
    ).toThrow();
  });
});

describe("AC-J1 — secondary command rules (a whole learned job command)", () => {
  it("equips another learned job's command as a job id", () => {
    const rec = defaultUnitRecord("h", "knight", { learned: ["black-magic.fire"] });
    const after = setLoadoutSlot(rec, "secondary", "wizard", registry);
    expect(after.loadout.secondary).toBe("wizard");
  });

  it("rejects equipping the CURRENT job as secondary (it is the Primary)", () => {
    const rec = defaultUnitRecord("h", "knight", { learned: ["battle-skill.weapon-break"] });
    expect(() => setLoadoutSlot(rec, "secondary", "knight", registry)).toThrow(/current job/);
  });

  it("rejects a job the unit has learned no action ability from", () => {
    // A learned REACTION in punch-art is not an action — monk secondary must fail.
    const rec = defaultUnitRecord("h", "knight", { learned: ["punch-art.counter"] });
    expect(() => setLoadoutSlot(rec, "secondary", "monk", registry)).toThrow(
      /no learned action/,
    );
    const empty = defaultUnitRecord("h", "knight");
    expect(() => setLoadoutSlot(empty, "secondary", "wizard", registry)).toThrow();
  });

  it("equippedSecondaryAbilities returns only learned ACTIONS in the command", () => {
    const rec = defaultUnitRecord("h", "knight", {
      learned: [
        "black-magic.fire", // action, black-magic  → included
        "black-magic.magic-attack-up", // support, black-magic → excluded (not an action)
        "punch-art.wave-fist", // action, punch-art  → excluded (wrong command)
      ],
    });
    const equipped = setLoadoutSlot(rec, "secondary", "wizard", registry);
    expect(equippedSecondaryAbilities(equipped, registry).map((a) => a.id)).toEqual([
      "black-magic.fire",
    ]);
    // No secondary → empty.
    expect(equippedSecondaryAbilities(rec, registry)).toEqual([]);
  });
});

describe("AC-J1 — single-ability slot-type rules", () => {
  const learned = [
    "punch-art.counter", // reaction
    "black-magic.magic-attack-up", // support
    "steal.move-plus-2", // movement
    "black-magic.fire", // action
  ];

  it("a reaction ability equips in the reaction slot", () => {
    const rec = defaultUnitRecord("h", "knight", { learned });
    expect(setLoadoutSlot(rec, "reaction", "punch-art.counter", registry).loadout.reaction).toBe(
      "punch-art.counter",
    );
  });

  it("rejects an ACTION in the reaction slot (type mismatch)", () => {
    const rec = defaultUnitRecord("h", "knight", { learned });
    expect(() => setLoadoutSlot(rec, "reaction", "black-magic.fire", registry)).toThrow(
      /reaction slot/,
    );
  });

  it("rejects an UNLEARNED reaction", () => {
    const rec = defaultUnitRecord("h", "knight", { learned });
    // hamedo is a reaction but not in `learned`.
    expect(() => setLoadoutSlot(rec, "reaction", "punch-art.hamedo", registry)).toThrow(
      /unlearned/,
    );
  });

  it("applies the same type + learned rules to support and movement", () => {
    const rec = defaultUnitRecord("h", "knight", { learned });
    expect(
      setLoadoutSlot(rec, "support", "black-magic.magic-attack-up", registry).loadout.support,
    ).toBe("black-magic.magic-attack-up");
    expect(
      setLoadoutSlot(rec, "movement", "steal.move-plus-2", registry).loadout.movement,
    ).toBe("steal.move-plus-2");
    // A movement ability in the support slot is a type mismatch.
    expect(() => setLoadoutSlot(rec, "support", "steal.move-plus-2", registry)).toThrow();
    // An unlearned support.
    expect(() => setLoadoutSlot(rec, "support", "punch-art.martial-arts", registry)).toThrow(
      /unlearned/,
    );
  });

  it("null always clears a slot", () => {
    const rec = defaultUnitRecord("h", "knight", { learned });
    const equipped = setLoadoutSlot(rec, "reaction", "punch-art.counter", registry);
    expect(setLoadoutSlot(equipped, "reaction", null, registry).loadout.reaction).toBeNull();
  });
});

describe("AC-J1 — traits (only earned mastery traits equip)", () => {
  it("equips a trait from a mastered job", () => {
    const rec = defaultUnitRecord("h", "knight", { mastered: ["knight"] });
    expect(setLoadoutTraits(rec, ["bulwark"], registry).loadout.traits).toEqual(["bulwark"]);
  });

  it("rejects an unearned trait (job not mastered)", () => {
    const rec = defaultUnitRecord("h", "knight", { mastered: ["knight"] });
    expect(() => setLoadoutTraits(rec, ["lightfoot"], registry)).toThrow(/not earned|no mastered/);
  });

  it("rejects more than two traits", () => {
    const rec = defaultUnitRecord("h", "knight", { mastered: ["knight", "monk"] });
    expect(() => setLoadoutTraits(rec, ["bulwark", "inner-focus", "bulwark"], registry)).toThrow(
      /at most 2/,
    );
  });
});

describe("AC-J4 — free respec (no cost, fully reversible)", () => {
  it("setLoadoutSlot never changes ap / learned / mastered", () => {
    const rec = defaultUnitRecord("h", "knight", {
      ap: 0,
      learned: ["black-magic.fire"],
      mastered: ["knight"],
    });
    const after = setLoadoutSlot(rec, "secondary", "wizard", registry);
    expect(after.ap).toBe(rec.ap);
    expect(after.learned).toEqual(rec.learned);
    expect(after.mastered).toEqual(rec.mastered);
    // Input untouched (immutable update).
    expect(rec.loadout.secondary).toBeNull();
  });

  it("setLoadoutTraits never changes ap", () => {
    const rec = defaultUnitRecord("h", "knight", { ap: 0, mastered: ["knight"] });
    expect(setLoadoutTraits(rec, ["bulwark"], registry).ap).toBe(0);
  });

  it("A→B→A round-trips to an identical record (deep equal)", () => {
    const a = defaultUnitRecord("h", "knight", { ap: 0, learned: ["black-magic.fire"] });
    const b = setLoadoutSlot(a, "secondary", "wizard", registry);
    const backToA = setLoadoutSlot(b, "secondary", null, registry);
    expect(backToA).toEqual(a);
  });

  it("slot switching is unconstrained by any resource (works at 0 AP)", () => {
    const rec = defaultUnitRecord("h", "knight", {
      ap: 0,
      learned: ["punch-art.counter", "black-magic.fire"],
    });
    const withSecondary = setLoadoutSlot(rec, "secondary", "wizard", registry);
    const withReaction = setLoadoutSlot(withSecondary, "reaction", "punch-art.counter", registry);
    expect(withReaction.ap).toBe(0);
    expect(withReaction.loadout.secondary).toBe("wizard");
    expect(withReaction.loadout.reaction).toBe("punch-art.counter");
  });
});

describe("AC-J6 hook — mutual exclusion at equip time", () => {
  /** Tiny pack with an excludes pair across two slots (base-pack has none). */
  function excludesPack(): ContentPack {
    return {
      contentSchemaVersion: 1,
      statuses: [],
      abilities: [
        { id: "x.strike", type: "action", skillset: "x-skill", apCost: 10 },
        { id: "x.guard", type: "reaction", skillset: "x-skill", apCost: 10, excludes: ["x.focus"] },
        { id: "x.focus", type: "support", skillset: "x-skill", apCost: 10 },
      ],
      jobs: [
        {
          id: "xjob",
          primarySkillset: "x-skill",
          genderLock: null,
          growth: { pa: 1, ma: 1, speed: 1, hp: 1, mp: 1 },
          masteryBonus: { trait: "x-trait" },
          tree: [
            { node: "n1", ability: "x.strike", apCost: 10, requires: [] },
            { node: "n2", ability: "x.guard", apCost: 10, requires: [] },
            { node: "n3", ability: "x.focus", apCost: 10, requires: [] },
          ],
        },
      ],
    };
  }

  it("rejects equipping an ability whose excludes names an already-equipped one", () => {
    const reg = loadContentPack(excludesPack());
    const rec = defaultUnitRecord("h", "xjob", { learned: ["x.guard", "x.focus", "x.strike"] });
    const withGuard = setLoadoutSlot(rec, "reaction", "x.guard", reg);
    expect(() => setLoadoutSlot(withGuard, "support", "x.focus", reg)).toThrow(/mutually/);
  });

  it("the exclusion is symmetric (declared on either ability blocks both orders)", () => {
    const reg = loadContentPack(excludesPack());
    const rec = defaultUnitRecord("h", "xjob", { learned: ["x.guard", "x.focus", "x.strike"] });
    // Equip focus first, then guard — guard.excludes still blocks it.
    const withFocus = setLoadoutSlot(rec, "support", "x.focus", reg);
    expect(() => setLoadoutSlot(withFocus, "reaction", "x.guard", reg)).toThrow(/mutually/);
  });
});

describe("realistic build — equip + read back through the record", () => {
  it("equips a secondary command, a reaction, and a trait, and they read back", () => {
    const rec = defaultUnitRecord("ramza", "knight", {
      ap: 0,
      learned: ["battle-skill.weapon-break", "black-magic.fire", "punch-art.counter"],
      mastered: ["knight"],
    });
    let built = setLoadoutSlot(rec, "secondary", "wizard", registry);
    built = setLoadoutSlot(built, "reaction", "punch-art.counter", registry);
    built = setLoadoutTraits(built, ["bulwark"], registry);

    expect(primaryCommand(built, registry)).toBe("battle-skill");
    expect(built.loadout.secondary).toBe("wizard");
    expect(built.loadout.reaction).toBe("punch-art.counter");
    expect(built.loadout.traits).toEqual(["bulwark"]);
    expect(equippedSecondaryAbilities(built, registry).map((a) => a.id)).toEqual([
      "black-magic.fire",
    ]);
  });
});
