/**
 * AC-R2 proof: the SHIPPED content pack (`data/base-pack.json`) loads through the
 * real loader — every job/ability/status validates against the Zod schemas and
 * passes referential integrity. This is the "jobs/abilities/statuses are external
 * data, not hard-coded" gate (docs/08 AC-R2): if an authored record drifts from
 * the schema, this fails loudly rather than at runtime.
 *
 * The test does IO (reads the JSON) — that's a test/render-layer concern; the sim
 * loader itself stays pure (it takes already-parsed data).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { loadContentPack, type ContentRegistry } from "./content.js";

function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return loadContentPack(raw);
}

const AP_TIERS = new Set([60, 120, 240]);
const EXPECTED_TREE_SIZES: Readonly<Record<string, number>> = {
  // Knight/Monk/Thief run the full 8-node fork; Wizard is a deliberate 7 —
  // faithful Black Magic caps at 6 spells + Magic Attack UP (content-author note).
  knight: 8,
  monk: 8,
  wizard: 7,
  thief: 8,
};

describe("shipped content pack (AC-R2, data/base-pack.json)", () => {
  it("loads through the real loader with no schema or integrity error", () => {
    expect(() => loadShippedPack()).not.toThrow();
  });

  it("ships the four P1 base jobs, each with a growth block and a mastery trait", () => {
    const reg = loadShippedPack();
    for (const id of ["knight", "monk", "wizard", "thief"]) {
      const job = reg.job(id); // loud-fails if missing
      expect(job.primarySkillset.length).toBeGreaterThan(0);
      expect(job.masteryBonus.trait.length).toBeGreaterThan(0);
      expect(job.growth.hp).toBeGreaterThan(0);
    }
    expect(reg.jobById.size).toBe(4);
  });

  it("prices every skill-tree node at an ADR-0012 AP tier (60/120/240)", () => {
    const reg = loadShippedPack();
    for (const [jobId, size] of Object.entries(EXPECTED_TREE_SIZES)) {
      const job = reg.job(jobId);
      expect(job.tree.length).toBe(size);
      for (const node of job.tree) {
        expect(AP_TIERS.has(node.apCost)).toBe(true);
      }
    }
  });

  it("keeps the cross-job recombination data intact (a Secondary command exists)", () => {
    const reg = loadShippedPack();
    // The flagship build's fuel: Black Magic's Fire is an ACTION in the
    // black-magic skillset, so a non-Wizard can equip it as a Secondary.
    const fire = reg.ability("black-magic.fire");
    expect(fire.type).toBe("action");
    expect(fire.skillset).toBe("black-magic");
    // Each job's primary skillset is distinct → four equippable Secondaries.
    const skillsets = new Set(
      ["knight", "monk", "wizard", "thief"].map((j) => reg.job(j).primarySkillset),
    );
    expect(skillsets.size).toBe(4);
  });

  it("donates every non-primary chassis slot (reaction/support/movement)", () => {
    const reg = loadShippedPack();
    const types = new Set([...reg.abilityById.values()].map((a) => a.type));
    expect(types.has("reaction")).toBe(true);
    expect(types.has("support")).toBe(true);
    expect(types.has("movement")).toBe(true);
    expect(types.has("action")).toBe(true);
  });

  it("ships the four mastery traits at contentSchemaVersion 2 with real effects", () => {
    const reg = loadShippedPack();
    expect(reg.traitById.size).toBe(4);
    // bulwark: +10 class evasion and a maxHp mult.
    expect(reg.trait("bulwark").effect.evasion?.classEv).toBe(10);
    expect(reg.trait("bulwark").effect.maxHp?.mult).toBe(1.05);
    // inner-focus / arcane-attunement are single-mult stat boosts.
    expect(reg.trait("inner-focus").effect.maxHp?.mult).toBe(1.12);
    expect(reg.trait("arcane-attunement").effect.ma?.mult).toBe(1.12);
    // lightfoot: +1 move.
    expect(reg.trait("lightfoot").effect.move?.flat).toBe(1);
    // Every job's mastery trait resolves in the catalog (integrity already passed).
    for (const id of ["knight", "monk", "wizard", "thief"]) {
      expect(() => reg.trait(reg.job(id).masteryBonus.trait)).not.toThrow();
    }
  });

  it("resolves every inflicted status id against the catalog", () => {
    const reg = loadShippedPack();
    for (const ability of reg.abilityById.values()) {
      for (const statusId of ability.inflicts ?? []) {
        expect(() => reg.status(statusId)).not.toThrow();
      }
    }
  });
});
