/**
 * A1 — the three personas (`docs/plans/slice-m1-synthetic-playtest.md`).
 *
 * These tests are about the POLICIES, not about the campaign: the runner and the
 * campaign-level "the personas separate" assertion are A2 and A3. What is owed here is
 * that each policy does what its name claims, that the control really is a control, and
 * that the two engaged policies do not quietly collapse into each other.
 *
 * Every fixture below is DISCRIMINATING on purpose, and says so at the point it matters:
 * a deployment test whose best contributor happens to sit first in save order would pass
 * against a policy that ignored contribution entirely.
 */

import { describe, expect, it } from "vitest";
import { registry } from "./campaign-data.js";
import { PrepModel } from "./prep.js";
import { DEFAULT, NAIVE, OPTIMIZER, PERSONAS, persona, type PrepContext } from "./playtest.js";
import type { ApReward, UnitRecord } from "../sim/index.js";
import campaignJson from "../../data/campaign/camp-the-first-march.json" with { type: "json" };

/** The shipped starting party, as authored — 0 AP, one ability each, empty chassis. */
const PARTY = (campaignJson as { party: UnitRecord[] }).party;

const byId = (id: string): UnitRecord => {
  const r = PARTY.find((p) => p.id === id);
  if (!r) throw new Error(`fixture: no party member "${id}"`);
  return structuredClone(r);
};

/** Every weapon the campaign hands out, so the equip policies have something to choose. */
const ALL_WEAPONS = [
  "wpn-arming-sword",
  "wpn-cestus",
  "wpn-rapier",
  "wpn-ritual-staff",
  "wpn-flamebrand",
  "wpn-warhammer",
  "wpn-heretics-edge",
  "wpn-oathblade",
];

function model(record: UnitRecord, inventory: readonly string[] = ALL_WEAPONS): PrepModel {
  return new PrepModel({ registry, records: [record], inventory });
}

function ctx(over: Partial<PrepContext> = {}): PrepContext {
  return {
    battleIndex: 0,
    slots: 2,
    party: PARTY,
    inventory: ALL_WEAPONS,
    registry,
    lastRewards: null,
    ...over,
  };
}

/** Give a unit enough AP that the buying policies are not silently AP-blocked. */
const funded = (id: string, ap: number): UnitRecord => ({ ...byId(id), ap });

describe("the persona roster", () => {
  it("exposes exactly the three the slice compares, and refuses an unknown id", () => {
    expect(PERSONAS.map((p) => p.id)).toEqual(["naive", "default", "optimizer"]);
    expect(persona("optimizer")).toBe(OPTIMIZER);
    expect(() => persona("min-maxer" as never)).toThrow(/no persona/);
  });
});

describe("naive — the control", () => {
  it("changes NOTHING, on a record the other policies do change", () => {
    // The discriminating half. "prepare() left the record alone" is trivially true of a
    // record nothing could be done to — a broke unit with an empty inventory. So the
    // same input is run through `default` in the same test, and must come out different.
    const before = funded("pc-kest", 400);

    const naive = model(structuredClone(before));
    NAIVE.prepare(naive, ctx());
    expect(naive.record()).toEqual(before);

    const engaged = model(structuredClone(before));
    DEFAULT.prepare(engaged, ctx());
    expect(engaged.record()).not.toEqual(before);
  });

  it("deploys the first N in save order", () => {
    expect(NAIVE.chooseDeployment(ctx({ slots: 3 }))).toEqual([
      "pc-vance",
      "pc-kest",
      "pc-briar",
    ]);
  });
});

describe("default — engaged, no plan", () => {
  it("spends AP, fills chassis slots, and equips a weapon", () => {
    const before = funded("pc-kest", 400);
    const prep = model(structuredClone(before));
    DEFAULT.prepare(prep, ctx());
    const after = prep.record();

    expect(after.ap).toBeLessThan(before.ap);
    expect(after.learned.length).toBeGreaterThan(before.learned.length);
    expect(after.weapon).not.toBe(before.weapon);
    // At least one chassis slot went from empty to filled — the slot being WIRED is the
    // dead-support-slot shape, and a policy that bought abilities and equipped none
    // would pass every assertion above.
    const filled = (r: UnitRecord): number =>
      [r.loadout.secondary, r.loadout.reaction, r.loadout.support, r.loadout.movement].filter(
        (v) => v !== null,
      ).length;
    expect(filled(after)).toBeGreaterThan(filled(before));
  });

  it("never buys a node the game itself marks as doing nothing", () => {
    const prep = model(funded("pc-kest", 4000));
    // The fixture must actually CONTAIN a deferred node in reach, or this asserts nothing.
    const deferredIds = new Set<string>();
    for (const job of prep.jobIds()) {
      prep.setBrowseJob(job);
      for (const row of prep.learnRows()) {
        if (row.deferred !== null) deferredIds.add(row.ability);
      }
    }
    expect(deferredIds.size).toBeGreaterThan(0);

    DEFAULT.prepare(prep, ctx());
    const bought = prep.record().learned;
    expect(bought.filter((id) => deferredIds.has(id))).toEqual([]);
    // And it did buy SOMETHING, so "bought no deferred nodes" is not just "bought nothing".
    expect(bought.length).toBeGreaterThan(1);
  });

  it("is deterministic: the same input twice gives the same record", () => {
    const run = (): UnitRecord => {
      const prep = model(funded("pc-briar", 400));
      DEFAULT.prepare(prep, ctx());
      return prep.record();
    };
    expect(run()).toEqual(run());
  });
});

describe("optimizer — reading the numbers", () => {
  it("deploys by measured contribution, not save order", () => {
    // DISCRIMINATING FIXTURE: the two best contributors are the LAST two in save order,
    // so a policy that ignored `lastRewards` and returned the first N would fail here.
    const rewards: Record<string, ApReward> = {
      "pc-vance": { participated: true, meaningfulActions: 1 },
      "pc-kest": { participated: true, meaningfulActions: 0 },
      "pc-briar": { participated: true, meaningfulActions: 9 },
      "pc-ottoline": { participated: true, meaningfulActions: 4 },
    };
    expect(PARTY.slice(0, 2).map((r) => r.id)).toEqual(["pc-vance", "pc-kest"]);

    expect(OPTIMIZER.chooseDeployment(ctx({ slots: 2, lastRewards: rewards }))).toEqual([
      "pc-briar",
      "pc-ottoline",
    ]);
  });

  it("falls back to save order before the first battle, and when nobody contributed", () => {
    expect(OPTIMIZER.chooseDeployment(ctx({ slots: 2 }))).toEqual(["pc-vance", "pc-kest"]);
    const none: Record<string, ApReward> = {};
    expect(OPTIMIZER.chooseDeployment(ctx({ slots: 2, lastRewards: none }))).toEqual([
      "pc-vance",
      "pc-kest",
    ]);
  });

  it("equips a caster for Faith where default equips for swing", () => {
    // The one lever separating the two policies on gear. Ottoline is the shipped priest;
    // her commands resolve through `magicDamage`, which reads Faith on both sides.
    const ottoline = funded("pc-ottoline", 0);

    const a = model(structuredClone(ottoline));
    DEFAULT.prepare(a, ctx());
    const b = model(structuredClone(ottoline));
    OPTIMIZER.prepare(b, ctx());

    // Assert the fixture SEPARATES before reading the result: if the highest-Faith
    // weapon were also the highest-swing one, the two policies would agree and this
    // test would certify nothing.
    const faithOf = (id: string): number => registry.equipment(id).faith ?? 0;
    expect(faithOf(b.record().weapon ?? "")).toBeGreaterThan(faithOf(a.record().weapon ?? ""));
    expect(b.record().weapon).not.toBe(a.record().weapon);
  });

  it("pays MORE to buy into its own job rather than the cheapest node anywhere", () => {
    // DISCRIMINATING FIXTURE, and the whole point of the test: at 120 AP the monk's own
    // tree offers nothing under 120, while `black-magic.fire` sits there at 60. A policy
    // that just bought the cheapest live node — which is what `default` does — would take
    // Fire. So the two policies are forced apart on the same input, and the assertion
    // cannot be satisfied by accident.
    const kest = funded("pc-kest", 120);
    const home = registry.job(kest.currentJob).primarySkillset;

    const cheap = model(structuredClone(kest));
    DEFAULT.prepare(cheap, ctx());
    const cheapGained = cheap.record().learned.filter((id) => !kest.learned.includes(id));
    expect(cheapGained.every((id) => registry.ability(id).skillset !== home)).toBe(true);

    const prep = model(structuredClone(kest));
    OPTIMIZER.prepare(prep, ctx());
    const gained = prep.record().learned.filter((id) => !kest.learned.includes(id));
    expect(gained.length).toBeGreaterThan(0);
    expect(gained.some((id) => registry.ability(id).skillset === home)).toBe(true);
  });

  it("is deterministic: the same input twice gives the same record", () => {
    const run = (): UnitRecord => {
      const prep = model(funded("pc-ottoline", 400));
      OPTIMIZER.prepare(prep, ctx());
      return prep.record();
    };
    expect(run()).toEqual(run());
  });
});
