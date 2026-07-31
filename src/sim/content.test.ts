import { describe, it, expect } from "vitest";
import { AbilitySchema } from "./ability.js";
import { JobSchema } from "./job.js";
import { StatusEffectSchema } from "./status.js";
import {
  CONTENT_SCHEMA_VERSION,
  ContentIntegrityError,
  ContentSchemaVersionError,
  loadContentPack,
  type ContentPack,
} from "./content.js";

/**
 * Minimal inline fixture: 1 job / 2 abilities / 1 status. Small on purpose — the
 * loader is exercised, not the real job data (content-author authors that next).
 */
function validPack(): ContentPack {
  return {
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    traits: [{ id: "magic-attack-up", effect: {} }],
    statuses: [
      {
        id: "poison",
        kind: "debuff",
        ctFactor: 1,
        durationCT: 320,
        dispellable: true,
      },
    ],
    abilities: [
      {
        id: "black.fire",
        type: "action",
        skillset: "black-magic",
        apCost: 180,
        mp: 6,
        speed: 25,
        range: { h: 4, v: 2 },
        aoe: { h: 1, v: 2 },
        element: "fire",
        power: 18,
        formula: "magic",
        hitBase: "MA+X",
        inflicts: ["poison"],
        tags: ["ranged"],
      },
      {
        id: "black.bolt",
        type: "action",
        skillset: "black-magic",
        apCost: 200,
      },
    ],
    jobs: [
      {
        id: "black-mage",
        primarySkillset: "black-magic",
        genderLock: null,
        growth: { pa: 0.9, ma: 1.2, speed: 1.0, hp: 0.85, mp: 1.3 },
        tree: [
          { node: "n1", ability: "black.fire", apCost: 180, requires: [] },
          { node: "n2", ability: "black.bolt", apCost: 200, requires: ["n1"] },
        ],
        masteryBonus: { trait: "magic-attack-up" },
      },
    ],
  };
}

describe("loadContentPack — valid pack + registry lookups (AC-R2)", () => {
  it("loads a valid pack and indexes every id", () => {
    const reg = loadContentPack(validPack());
    expect(reg.job("black-mage").primarySkillset).toBe("black-magic");
    expect(reg.ability("black.fire").element).toBe("fire");
    expect(reg.status("poison").kind).toBe("debuff");
    expect(reg.trait("magic-attack-up").effect).toEqual({});
    expect(reg.jobById.size).toBe(1);
    expect(reg.abilityById.size).toBe(2);
    expect(reg.statusById.size).toBe(1);
    expect(reg.traitById.size).toBe(1);
  });

  it("accepts an ability whose skillset is a baseline (not a job) skillset", () => {
    const pack = validPack();
    pack.abilities.push({ id: "item.potion", type: "action", skillset: "item", apCost: 0 });
    expect(() => loadContentPack(pack)).not.toThrow();
  });

  it("accepts a hybrid job with a well-formed `requires` tuple", () => {
    const pack = validPack();
    pack.jobs[0]!.requires = ["knight", "black-mage"];
    expect(() => loadContentPack(pack)).not.toThrow();
  });

  it("lookups throw ContentIntegrityError on a missing id", () => {
    const reg = loadContentPack(validPack());
    expect(() => reg.ability("nope")).toThrow(ContentIntegrityError);
    expect(() => reg.job("nope")).toThrow(ContentIntegrityError);
    expect(() => reg.status("nope")).toThrow(ContentIntegrityError);
    expect(() => reg.trait("nope")).toThrow(ContentIntegrityError);
  });
});

describe("Trait catalog — integrity + v1→v2 migration (AC-P5)", () => {
  it("rejects a job masteryBonus referencing a trait with no catalog entry", () => {
    const pack = validPack();
    pack.jobs[0]!.masteryBonus = { trait: "ghost-trait" };
    expect(() => loadContentPack(pack)).toThrow(ContentIntegrityError);
    expect(() => loadContentPack(pack)).toThrow(/unknown trait/);
  });

  it("rejects a duplicate trait id", () => {
    const pack = validPack();
    pack.traits.push({ id: "magic-attack-up", effect: {} });
    expect(() => loadContentPack(pack)).toThrow(/duplicate trait/);
  });

  it("validates a real (non-empty) trait effect and rejects a `speed` key (AC-P5)", () => {
    const pack = validPack();
    pack.traits[0]!.effect = { maxHp: { mult: 1.1 }, evasion: { classEv: 10 } };
    const reg = loadContentPack(pack);
    expect(reg.trait("magic-attack-up").effect.maxHp?.mult).toBe(1.1);
    // A `speed` key is structurally impossible — .strict() rejects it.
    const bad = validPack();
    (bad.traits[0]!.effect as Record<string, unknown>).speed = { flat: 1 };
    expect(() => loadContentPack(bad)).toThrow();
  });

  it("migrates a v1 pack (no `traits` key) into inert, zero-effect traits", () => {
    // A legacy v1 pack: jobs reference trait ids only via masteryBonus; no catalog.
    const v1 = validPack() as Record<string, unknown>;
    v1["contentSchemaVersion"] = 1;
    delete v1["traits"];
    const reg = loadContentPack(v1);
    // The distinct masteryBonus.trait ("magic-attack-up") is synthesized inert.
    expect(reg.trait("magic-attack-up").effect).toEqual({});
    expect(reg.traitById.size).toBe(1);
    expect(reg.job("black-mage").masteryBonus.trait).toBe("magic-attack-up");
  });

  it("v1 migration de-dupes trait ids across jobs (one entry per distinct id)", () => {
    const v1 = validPack() as Record<string, unknown>;
    v1["contentSchemaVersion"] = 1;
    delete v1["traits"];
    const jobs = v1["jobs"] as Array<Record<string, unknown>>;
    // A second job sharing the SAME mastery trait id.
    jobs.push({
      id: "sage",
      primarySkillset: "black-magic",
      genderLock: null,
      growth: { pa: 0.9, ma: 1.2, speed: 1.0, hp: 0.85, mp: 1.3 },
      tree: [],
      masteryBonus: { trait: "magic-attack-up" },
    });
    const reg = loadContentPack(v1);
    expect(reg.traitById.size).toBe(1); // one distinct trait, not two
  });
});

describe("Zod schemas reject malformed records — .strict() (AC-R2)", () => {
  it("AbilitySchema rejects an unknown key", () => {
    expect(() =>
      AbilitySchema.parse({
        id: "x",
        type: "action",
        skillset: "s",
        apCost: 0,
        bogus: true,
      }),
    ).toThrow();
  });

  it("AbilitySchema rejects a non-integer / negative apCost and speed < 1", () => {
    expect(() => AbilitySchema.parse({ id: "x", type: "action", skillset: "s", apCost: -1 })).toThrow();
    expect(() =>
      AbilitySchema.parse({ id: "x", type: "action", skillset: "s", apCost: 1.5 }),
    ).toThrow();
    expect(() =>
      AbilitySchema.parse({ id: "x", type: "action", skillset: "s", apCost: 0, speed: 0 }),
    ).toThrow();
  });

  it("AbilitySchema rejects an unknown ability type / formula", () => {
    expect(() => AbilitySchema.parse({ id: "x", type: "spell", skillset: "s", apCost: 0 })).toThrow();
    expect(() =>
      AbilitySchema.parse({ id: "x", type: "action", skillset: "s", apCost: 0, formula: "nuke" }),
    ).toThrow();
  });

  it("JobSchema rejects an unknown key and a non-positive growth value", () => {
    const base = {
      id: "j",
      primarySkillset: "s",
      genderLock: null,
      growth: { pa: 1, ma: 1, speed: 1, hp: 1, mp: 1 },
      tree: [],
      masteryBonus: { trait: "t" },
    };
    expect(() => JobSchema.parse({ ...base, bogus: 1 })).toThrow();
    expect(() =>
      JobSchema.parse({ ...base, growth: { pa: 0, ma: 1, speed: 1, hp: 1, mp: 1 } }),
    ).toThrow();
  });

  it("JobSchema rejects a malformed `requires` (wrong arity)", () => {
    const base = {
      id: "j",
      primarySkillset: "s",
      genderLock: null,
      growth: { pa: 1, ma: 1, speed: 1, hp: 1, mp: 1 },
      tree: [],
      masteryBonus: { trait: "t" },
    };
    expect(() => JobSchema.parse({ ...base, requires: ["only-one"] })).toThrow();
  });

  it("StatusEffectSchema rejects an unknown key and a bad kind", () => {
    const base = { id: "s", kind: "buff", ctFactor: 1, durationCT: 0, dispellable: true };
    expect(() => StatusEffectSchema.parse({ ...base, bogus: 1 })).toThrow();
    expect(() => StatusEffectSchema.parse({ ...base, kind: "curse" })).toThrow();
  });
});

describe("Referential integrity failures each throw loudly (AC-R2)", () => {
  it("rejects a tree node referencing a missing ability", () => {
    const pack = validPack();
    pack.jobs[0]!.tree[0]!.ability = "black.missing";
    expect(() => loadContentPack(pack)).toThrow(ContentIntegrityError);
  });

  it("rejects an ability whose skillset is neither a job primary nor baseline", () => {
    const pack = validPack();
    pack.abilities[0]!.skillset = "unknown-set";
    expect(() => loadContentPack(pack)).toThrow(/unknown skillset/);
  });

  it("rejects an ability inflicting a missing status", () => {
    const pack = validPack();
    pack.abilities[0]!.inflicts = ["sleep"];
    expect(() => loadContentPack(pack)).toThrow(/unknown status/);
  });

  it("rejects a tree node.requires that dangles", () => {
    const pack = validPack();
    pack.jobs[0]!.tree[1]!.requires = ["n-missing"];
    expect(() => loadContentPack(pack)).toThrow(/unknown node/);
  });

  it("rejects a duplicate ability id", () => {
    const pack = validPack();
    pack.abilities.push({ id: "black.fire", type: "action", skillset: "black-magic", apCost: 1 });
    expect(() => loadContentPack(pack)).toThrow(/duplicate ability/);
  });

  it("rejects a duplicate job id", () => {
    const pack = validPack();
    pack.jobs.push({ ...pack.jobs[0]! });
    expect(() => loadContentPack(pack)).toThrow(/duplicate job/);
  });

  it("rejects a duplicate status id", () => {
    const pack = validPack();
    pack.statuses.push({ ...pack.statuses[0]! });
    expect(() => loadContentPack(pack)).toThrow(/duplicate status/);
  });

  it("rejects a duplicate skill-tree node id within one job", () => {
    const pack = validPack();
    pack.jobs[0]!.tree[1]!.node = "n1";
    expect(() => loadContentPack(pack)).toThrow(/duplicate skill-tree node/);
  });
});

describe("Version handling — loud fail (AC-R2)", () => {
  it("throws on a newer contentSchemaVersion", () => {
    const pack = { ...validPack(), contentSchemaVersion: CONTENT_SCHEMA_VERSION + 1 };
    expect(() => loadContentPack(pack)).toThrow(ContentSchemaVersionError);
  });

  it("throws on a missing / non-integer contentSchemaVersion", () => {
    expect(() => loadContentPack({ ...validPack(), contentSchemaVersion: 1.5 })).toThrow(
      ContentSchemaVersionError,
    );
    const { contentSchemaVersion: _omit, ...noVersion } = validPack();
    void _omit;
    expect(() => loadContentPack(noVersion)).toThrow(ContentSchemaVersionError);
  });

  it("throws when raw is not a JSON object", () => {
    expect(() => loadContentPack(null)).toThrow(ContentSchemaVersionError);
    expect(() => loadContentPack([])).toThrow(ContentSchemaVersionError);
  });
});

describe("Purity + immutability (AC-R2)", () => {
  it("does not mutate the caller's input", () => {
    const pack = validPack();
    const snapshot = JSON.parse(JSON.stringify(pack)) as ContentPack;
    loadContentPack(pack);
    expect(pack).toEqual(snapshot);
  });

  it("registry index Maps are frozen — mutation throws", () => {
    const reg = loadContentPack(validPack());
    expect(() => (reg.abilityById as Map<string, unknown>).set("x", {})).toThrow();
    expect(() => (reg.jobById as Map<string, unknown>).delete("black-mage")).toThrow();
    expect(() => (reg.statusById as Map<string, unknown>).clear()).toThrow();
    expect(Object.isFrozen(reg.abilityById)).toBe(true);
  });

  it("produces registries independent across calls (no shared mutable state)", () => {
    const a = loadContentPack(validPack());
    const b = loadContentPack(validPack());
    expect(a.abilityById).not.toBe(b.abilityById);
    expect(a.ability("black.fire")).toEqual(b.ability("black.fire"));
  });
});
