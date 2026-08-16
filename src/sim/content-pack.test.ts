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
import { DEFERRED_ACTIONS, DEFERRED_SKILLSETS, loadContentPack, type ContentRegistry } from "./content.js";
import { statusSwingFactor } from "./ai.js";
import { makeActiveStatus } from "./state.js";
import type { Ability } from "./ability.js";

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
  // P2 Slice 3: the four live-formula jobs, each a full 8-node ADR-0012 fork.
  priest: 8,
  archer: 8,
  geomancer: 8,
  summoner: 8,
};

/**
 * The formulas the balance-probe AI can actually select for their MAGNITUDE (`ai.ts`
 * routes `physical`/`magic`/`heal` to a damage or heal number; a passive is never
 * picked at all).
 */
const LIVE_FORMULAS = new Set(["physical", "magic", "heal"]);

/**
 * Is this ACTION worth a turn in the current engine? Two ways to be live, and the
 * second one arrived with the on-hit inflict path: a `none`-formula action is live if
 * it inflicts a status the sim READS. The predicate is the probe's own
 * ({@link statusSwingFactor}), imported rather than restated, so this test and `ai.ts`
 * cannot drift into disagreeing about what "live" means.
 */
function isLiveAction(a: Ability, reg: ContentRegistry): boolean {
  if (a.type !== "action") return false;
  if (a.formula !== undefined && LIVE_FORMULAS.has(a.formula)) return true;
  return (a.inflicts ?? []).some((id) => statusSwingFactor(makeActiveStatus(reg.status(id))) > 0);
}

/** Every shipped job. All eight are checked — see the note on the test below. */
const ALL_JOBS = ["knight", "monk", "wizard", "thief", "priest", "archer", "geomancer", "summoner"];

describe("shipped content pack (AC-R2, data/base-pack.json)", () => {
  it("loads through the real loader with no schema or integrity error", () => {
    expect(() => loadShippedPack()).not.toThrow();
  });

  it("ships the eight jobs (4 P1 + 4 P2), each with a growth block and a mastery trait", () => {
    const reg = loadShippedPack();
    const allJobs = ["knight", "monk", "wizard", "thief", "priest", "archer", "geomancer", "summoner"];
    for (const id of allJobs) {
      const job = reg.job(id); // loud-fails if missing
      expect(job.primarySkillset.length).toBeGreaterThan(0);
      expect(job.masteryBonus.trait.length).toBeGreaterThan(0);
      expect(job.growth.hp).toBeGreaterThan(0);
    }
    expect(reg.jobById.size).toBe(8);
  });

  /**
   * EVERY job's skillset is either LIVE or listed in {@link DEFERRED_SKILLSETS} with a
   * named blocker — checked as an exact partition, so neither half can rot.
   *
   * This used to cover the four P2 jobs only (priest/archer/geomancer/summoner). The
   * four P1 jobs were unchecked, and two of them — Knight's `battle-skill` and Thief's
   * `steal` — are entirely inert: every action is `formula: "none"`, so the probe can
   * never select one and neither job can be measured. That shipped green for the whole
   * life of the repo, because nothing asked.
   */
  it("every job's skillset donates a live-formula action, or is a NAMED deferral", () => {
    const reg = loadShippedPack();
    const abilities = [...reg.abilityById.values()];
    const live: string[] = [];
    const dead: string[] = [];
    for (const job of ALL_JOBS) {
      const skillset = reg.job(job).primarySkillset;
      const liveActions = abilities.filter((a) => a.skillset === skillset && isLiveAction(a, reg));
      (liveActions.length > 0 ? live : dead).push(skillset);
    }
    // NON-VACUITY: most skillsets really are live, so the partition below is a real
    // split and not "everything is deferred".
    expect(live.length).toBeGreaterThan(dead.length);
    // EXACT partition, both directions: a newly-dead skillset is not in the manifest
    // (fails), and a manifest entry for a skillset that has since gained a live action
    // is stale (also fails).
    expect(dead.sort()).toEqual(Object.keys(DEFERRED_SKILLSETS).sort());
    for (const [skillset, blocker] of Object.entries(DEFERRED_SKILLSETS)) {
      expect(blocker.length, `${skillset} needs a real blocker, not a placeholder`).toBeGreaterThan(30);
    }
  });

  /**
   * The ABILITY-level partition. The skillset check above goes quiet as soon as ONE
   * action in a set is live — which `steal` now is (`heart` charms), while four of its
   * five actions still do nothing. A test that covers a subset reads as covering the
   * set (CLAUDE.md), so the honest unit is the ACTION, and the prep panel reads this
   * same manifest to mark a command "no effect yet".
   */
  it("every INERT action is named in DEFERRED_ACTIONS with a blocker — an exact partition", () => {
    const reg = loadShippedPack();
    const inert = [...reg.abilityById.values()]
      .filter((a) => a.type === "action" && !isLiveAction(a, reg))
      .map((a) => a.id)
      .sort();
    // NON-VACUITY, both ways: the pack really does have live actions AND inert ones, so
    // neither side of the partition is trivially empty.
    expect(inert.length).toBeGreaterThan(0);
    expect([...reg.abilityById.values()].filter((a) => isLiveAction(a, reg)).length).toBeGreaterThan(0);
    // STALE entries fail here just as loudly as missing ones — `steal.heart` leaving
    // this list is exactly what the charm slice had to do.
    expect(inert).toEqual(Object.keys(DEFERRED_ACTIONS).sort());
    for (const [id, blocker] of Object.entries(DEFERRED_ACTIONS)) {
      expect(blocker.length, `${id} needs a real blocker, not a placeholder`).toBeGreaterThan(20);
    }
  });

  it("steal.heart is LIVE — the thief's signature is not in the deferred list", () => {
    // Pinned POSITIVELY: the manifest test above would still pass if `heart` were inert
    // AND listed. This says the capability exists, and it is the one the thief build's
    // whole identity rests on.
    const reg = loadShippedPack();
    expect(isLiveAction(reg.ability("steal.heart"), reg)).toBe(true);
    expect(DEFERRED_ACTIONS["steal.heart"]).toBeUndefined();
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

  it("ships eight mastery traits at contentSchemaVersion 2 with real effects", () => {
    const reg = loadShippedPack();
    expect(reg.traitById.size).toBe(8);
    // bulwark: +10 class evasion and a maxHp mult.
    expect(reg.trait("bulwark").effect.evasion?.classEv).toBe(10);
    expect(reg.trait("bulwark").effect.maxHp?.mult).toBe(1.05);
    // inner-focus / arcane-attunement are single-mult stat boosts.
    expect(reg.trait("inner-focus").effect.maxHp?.mult).toBe(1.12);
    expect(reg.trait("arcane-attunement").effect.ma?.mult).toBe(1.12);
    // lightfoot: +1 move.
    expect(reg.trait("lightfoot").effect.move?.flat).toBe(1);
    // P2 traits must NOT be strictly-dominated same-axis clones of the P1 traits —
    // ADR-0012's convergence guard: a mastery choice should be a trade, not an
    // obvious pick. Each new trait either opens a NEW axis or beats its nearest P1
    // rival on one axis while conceding another (so neither dominates).
    // marksman: the only PA trait (new axis).
    expect(reg.trait("marksman").effect.pa?.mult).toBe(1.06);
    // aegis-of-faith: the only MAGIC-evasion trait (new axis) — trades raw maxHp
    // (1.06 < inner-focus 1.12) for a magic ward nothing else grants.
    expect(reg.trait("aegis-of-faith").effect.evasion?.magicEv).toBe(12);
    const magicEvTraits = [...reg.traitById.values()].filter((t) => t.effect.evasion?.magicEv);
    expect(magicEvTraits.map((t) => t.id)).toEqual(["aegis-of-faith"]);
    // stoneskin: beats bulwark on class evasion (12 > 10) but lacks bulwark's maxHp —
    // a pure-dodge trade, not a strict upgrade/downgrade of either.
    expect(reg.trait("stoneskin").effect.evasion?.classEv).toBeGreaterThan(
      reg.trait("bulwark").effect.evasion!.classEv!,
    );
    expect(reg.trait("stoneskin").effect.maxHp).toBeUndefined();
    // spirit-conduit: less MA than arcane-attunement (1.08 < 1.12) but adds maxHp it
    // doesn't — the durable-nuker trade, so neither dominates the other.
    expect(reg.trait("spirit-conduit").effect.ma!.mult!).toBeLessThan(
      reg.trait("arcane-attunement").effect.ma!.mult!,
    );
    expect(reg.trait("spirit-conduit").effect.maxHp?.mult).toBeGreaterThan(1);
    expect(reg.trait("arcane-attunement").effect.maxHp).toBeUndefined();
    // No P2 trait touches speed (AC-P5 structural ban — the schema has no speed key).
    // Every job's mastery trait resolves in the catalog (integrity already passed).
    for (const id of ["knight", "monk", "wizard", "thief", "priest", "archer", "geomancer", "summoner"]) {
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
