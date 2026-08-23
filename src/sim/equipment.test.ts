import { describe, it, expect } from "vitest";
import pack from "../../data/base-pack.json" with { type: "json" };
import campaignJson from "../../data/campaign/camp-the-first-march.json" with { type: "json" };
import { buildBattleUnit } from "./build.js";
import {
  applyBattleResult,
  grantEquipment,
  parseCampaign,
  startCampaign,
  type CampaignSave,
} from "./campaign.js";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { weaponBaseDamage } from "./formulas.js";
import { defaultUnitRecord } from "./roster.js";

/**
 * The equipment layer (docs/11 M0 item 5, ADR-0021).
 *
 * Two claims carry this slice and neither is provable by "the schema parsed":
 * gear is **horizontal** (no power ladder), and gear power is **authored, not
 * farmable**. Both are asserted here against the shipped catalog and the shipped
 * campaign, because both are properties of the CONTENT, not of the code that reads it.
 */

const registry: ContentRegistry = loadContentPack(pack);
const def = parseCampaign(campaignJson);

/** The reference body the ADR's measurements use: a front-line unit. */
function knightBody() {
  return defaultUnitRecord("ref", "knight", {
    raw: { pa: 8, ma: 8, speed: 8, hp: 255, mp: 24 },
    brave: 70,
    faith: 50,
  });
}

/** A low-PA body — the shape a PA-scaling weapon serves badly. */
function casterBody() {
  return defaultUnitRecord("ref", "wizard", {
    raw: { pa: 8, ma: 8, speed: 8, hp: 192, mp: 24 },
    brave: 70,
    faith: 50,
  });
}

const WEAPONS = [...registry.equipmentById.values()].filter((e) => e.slot === "weapon");

describe("equipment is HORIZONTAL — there is no weapon-power ladder (ADR-0021)", () => {
  it("no weapon out-damages the placeholder on the reference body", () => {
    // THE discriminating assertion for "horizontal". A ladder — the thing ADR-0021
    // measured as pushing builds out of the docs/07 §3 time-to-kill band — would show
    // up here as a weapon beating the baseline, and every other check in this file
    // would still pass. Equal is allowed; better is not.
    const baseline = weaponBaseDamage(buildBattleUnit(knightBody(), registry));
    for (const item of WEAPONS) {
      const dmg = weaponBaseDamage(buildBattleUnit({ ...knightBody(), weapon: item.id }, registry));
      expect(dmg, `${item.name} out-damages the placeholder (${dmg} > ${baseline})`).toBeLessThanOrEqual(
        baseline,
      );
    }
  });

  it("DISCRIMINATING: which weapon is BEST depends on the body", () => {
    // Horizontal means the ranking REORDERS across bodies. If one weapon simply won
    // everywhere, the check above could still pass (nothing beats the baseline) while
    // the catalog was a ladder with the top rung removed — every unit would want the
    // same weapon and the choice would be fake.
    const best = (rec: ReturnType<typeof knightBody>): string => {
      let top = { id: "", dmg: -1 };
      for (const item of WEAPONS) {
        const dmg = weaponBaseDamage(buildBattleUnit({ ...rec, weapon: item.id }, registry));
        if (dmg > top.dmg) top = { id: item.id, dmg };
      }
      return top.id;
    };
    expect(best(knightBody())).not.toBe(best(casterBody()));
  });

  it("every weapon differs from the baseline on SOME axis — none is a reskin", () => {
    // A weapon identical to the placeholder in damage, element, evasion, Brave and
    // Faith is an option that costs a slot and changes nothing. `docs/02` B5: a choice
    // that gives up nothing and gains nothing is not a choice.
    const base = buildBattleUnit(knightBody(), registry);
    for (const item of WEAPONS) {
      const u = buildBattleUnit({ ...knightBody(), weapon: item.id }, registry);
      const differs =
        weaponBaseDamage(u) !== weaponBaseDamage(base) ||
        u.weapon.element !== base.weapon.element ||
        u.weapon.accuracy !== base.weapon.accuracy ||
        u.evasion.weaponEv !== base.evasion.weaponEv ||
        u.brave !== base.brave ||
        u.faith !== base.faith;
      expect(differs, `${item.name} is indistinguishable from the placeholder`).toBe(true);
    }
  });
});

describe("gear reaches the BUILT unit — the slot is not validated-then-discarded", () => {
  it.each([
    ["wpn-rapier", (u: ReturnType<typeof buildBattleUnit>) => u.evasion.weaponEv],
    ["wpn-oathblade", (u: ReturnType<typeof buildBattleUnit>) => u.brave],
    ["wpn-heretics-edge", (u: ReturnType<typeof buildBattleUnit>) => u.faith],
    ["wpn-flamebrand", (u: ReturnType<typeof buildBattleUnit>) => u.weapon.element],
  ])("%s changes the built unit", (id, read) => {
    // The A/B on the BUILT object, per CLAUDE.md: a slot that type-checks its input,
    // rejects bad ids and enforces ownership looks identical to one whose effect is
    // wired — until you construct the same record with and without it and compare.
    const bare = buildBattleUnit(knightBody(), registry);
    const armed = buildBattleUnit({ ...knightBody(), weapon: id as string }, registry);
    expect(read(armed)).not.toEqual(read(bare));
  });

  it("Brave and Faith shifts stay inside 0–100", () => {
    // Brave/Faith never pass through the docs/05 §4 stat pipeline, so there is no
    // later clamp to catch an out-of-range value before serialize does.
    const low = buildBattleUnit({ ...knightBody(), faith: 5, weapon: "wpn-heretics-edge" }, registry);
    const high = buildBattleUnit({ ...knightBody(), brave: 97, weapon: "wpn-oathblade" }, registry);
    expect(low.faith).toBeGreaterThanOrEqual(0);
    expect(high.brave).toBeLessThanOrEqual(100);
  });

  it("an unknown equipment id throws instead of silently arming the placeholder", () => {
    expect(() => buildBattleUnit({ ...knightBody(), weapon: "wpn-nope" }, registry)).toThrow();
  });
});

describe("gear power is AUTHORED, not farmable (ADR-0021 decision 2)", () => {
  it("every id the campaign grants exists in the pack", () => {
    // Both directions of the coverage rule: a grant naming a missing item would ship a
    // battle that hands out nothing, and read as a working drip.
    for (const battle of def.battles) {
      for (const id of battle.grants ?? []) {
        expect(() => registry.equipment(id), `${battle.id} grants unknown "${id}"`).not.toThrow();
      }
    }
  });

  it("DISCRIMINATING: replaying a battle grants NOTHING new", () => {
    // The anti-grind invariant, stated as an experiment rather than a comment. If
    // `grantEquipment` appended blindly, a player could lose-and-retry — or any future
    // replay — to accumulate gear, and ADR-0021's whole argument is that gear on a
    // farmable drip is exactly as ruinous as farmable levels.
    const save = startCampaign(def);
    const once = grantEquipment(save, ["wpn-rapier"]);
    const twice = grantEquipment(once, ["wpn-rapier"]);
    expect(twice.inventory).toEqual(once.inventory);
    expect(twice).toBe(once); // unchanged identity: nothing was rewritten either
  });

  it("a full playthrough hands out each item exactly once", () => {
    // The end-to-end version: walk the real campaign's transitions and assert the
    // inventory is a SET matching what the def authors — no duplicates, nothing
    // missing, nothing extra. A per-call check cannot see a drip that pays twice
    // across two different battles authoring the same id.
    let save: CampaignSave = startCampaign(def);
    while (save.status === "in-progress") {
      const rewards = Object.fromEntries(
        save.party.map((r) => [r.id, { participated: true, meaningfulActions: 1 }]),
      );
      save = applyBattleResult(def, save, { outcome: "victory", rewards });
    }
    const authored = def.battles.flatMap((b) => b.grants ?? []);
    expect(new Set(save.inventory)).toEqual(new Set(authored));
    expect(save.inventory.length).toBe(new Set(authored).size);
  });

  it("battle one's grant is in hand BEFORE battle one is fought", () => {
    // A drip that only paid out on ADVANCING would leave the first fight — the one a
    // new player meets — as the single battle with no gear available in it.
    const save = startCampaign(def);
    expect(save.inventory.length).toBeGreaterThan(0);
    expect(new Set(save.inventory)).toEqual(new Set(def.battles[0]!.grants ?? []));
  });
});
