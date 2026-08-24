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
import { ENCOUNTERS, campaign, registry } from "./campaign-data.js";
import { PrepModel } from "./prep.js";
import {
  DEFAULT,
  NAIVE,
  OPTIMIZER,
  PERSONAS,
  persona,
  runPlaytest,
  withSeedOffset,
  type Persona,
  type PlaytestReport,
  type PrepContext,
} from "./playtest.js";
import type { ApReward, CampaignDef, UnitRecord } from "../sim/index.js";
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

// ── A2/A3 — the runner, the seed sweep, and the two assertions ───────────────

/** A campaign whose party cannot survive contact — for testing the LOSING path. */
function doomedCampaign(): CampaignDef {
  const def = structuredClone(campaign);
  for (const r of def.party) r.raw = { ...r.raw, hp: 1, pa: 0, ma: 0 };
  return def;
}

describe("withSeedOffset", () => {
  it("returns the map untouched at offset 0, and shifts every seed otherwise", () => {
    expect(withSeedOffset(ENCOUNTERS, 0)).toBe(ENCOUNTERS);
    const moved = withSeedOffset(ENCOUNTERS, 7);
    for (const [id, def] of Object.entries(ENCOUNTERS)) {
      const before = (def as { seed: number }).seed;
      expect((moved[id] as { seed: number }).seed).toBe(before + 7);
    }
  });

  it("refuses an encounter with no seed rather than passing it through unreseeded", () => {
    // Silently skipping one would make a sweep report several "different seeds" that
    // were the same battle — the failure mode the whole sweep exists to avoid.
    expect(() => withSeedOffset({ bad: { id: "bad" } }, 1)).toThrow(/no numeric seed/);
  });
});

describe("the runner", () => {
  const run = (p: Persona, seedOffset = 0): PlaytestReport =>
    runPlaytest({ persona: p, def: campaign, encounters: ENCOUNTERS, registry, seedOffset });

  it("plays the whole shipped campaign and reports one row per battle", () => {
    // OPTIMIZER, not DEFAULT: since ADR-0027 only a player who deploys and spends by
    // measured contribution clears every seed, and this test is about the RUNNER
    // reporting a full campaign — not about how hard the campaign is.
    const report = run(OPTIMIZER);
    expect(report.ending).toBe("completed");
    expect(report.battles).toHaveLength(campaign.battles.length);
    expect(report.battles.map((b) => b.step)).toEqual([1, 2, 3, 4, 5]);
    expect(report.party.map((m) => m.id)).toEqual(campaign.party.map((r) => r.id));
  });

  it("is deterministic: the same persona at the same seed gives an identical report", () => {
    expect(run(OPTIMIZER)).toEqual(run(OPTIMIZER));
  });

  it("actually reseeds: two offsets give different battles", () => {
    // Without this the sweep would be N copies of one run wearing different labels.
    const a = run(NAIVE, 0);
    const b = run(NAIVE, 21);
    expect(b.battles.map((x) => x.turns)).not.toEqual(a.battles.map((x) => x.turns));
  });
});

describe("A3 — do the personas separate?", () => {
  const sweep = (p: Persona, offsets: number[]): PlaytestReport[] =>
    offsets.map((seedOffset) =>
      runPlaytest({ persona: p, def: campaign, encounters: ENCOUNTERS, registry, seedOffset }),
    );
  const OFFSETS = [0, 1, 2, 3];

  it("separates on how the BATTLES go, not merely on how much was clicked", () => {
    // The distinction is the whole assertion. `decisions` is an INPUT — naive makes none
    // by construction, so "the reports differ" is trivially true and proves nothing about
    // whether the choices mattered. Turn counts are an OUTPUT of the battles themselves,
    // so a difference there is the meta systems reaching the field.
    const turnsOf = (rs: PlaytestReport[]): number[] => rs.flatMap((r) => r.battles.map((b) => b.turns));
    const naive = turnsOf(sweep(NAIVE, OFFSETS));
    const dflt = turnsOf(sweep(DEFAULT, OFFSETS));
    const opt = turnsOf(sweep(OPTIMIZER, OFFSETS));

    expect(dflt).not.toEqual(naive);
    expect(opt).not.toEqual(naive);
    expect(opt).not.toEqual(dflt);
  });

  it("separates on WINNING: engaging clears the campaign, ignoring the prep screen does not", () => {
    // AC-M1's "an ending is reachable" lives HERE since ADR-0027, because this is the only
    // harness that can drive a real player policy. Both halves are asserted together on
    // purpose: "the optimizer wins" alone would still pass on a campaign anyone can win,
    // and "the naive player loses" alone would pass on one nobody can.
    const cleared = (p: Persona): number =>
      sweep(p, OFFSETS).filter((r) => r.ending === "completed").length;

    expect(cleared(OPTIMIZER)).toBe(OFFSETS.length);
    expect(cleared(NAIVE)).toBeLessThanOrEqual(1);
  });

  it("spending at HOME wins where spending cheapest-anywhere does not (ADR-0027)", () => {
    // The design claim ADR-0027 rests on. `optimizer` buys into the member's own job
    // tree; `default` buys the cheapest live node anywhere in the pack. Nothing else
    // about the two policies is doing the work — both fill every slot and both equip a
    // weapon — so the gap between them IS the trap the campaign now punishes.
    const cleared = (p: Persona): number =>
      sweep(p, OFFSETS).filter((r) => r.ending === "completed").length;
    expect(cleared(OPTIMIZER)).toBeGreaterThan(cleared(DEFAULT));
  });

  it("the unprepped party loses the FINALE, not an early battle", () => {
    // Where it stops is the design claim. A campaign that turned unwinnable at battle 3 —
    // before the party has earned enough AP to do anything about it — would satisfy
    // "naive loses" while being punishing rather than demanding.
    for (const report of sweep(NAIVE, OFFSETS)) {
      if (report.ending === "completed") continue;
      expect(report.battles).toHaveLength(campaign.battles.length);
      expect(report.battles.at(-1)?.battleId).toBe(campaign.battles.at(-1)?.id);
      expect(report.battles.slice(0, -1).every((b) => b.outcome === "victory")).toBe(true);
    }
  });

  it("leaves the whole AP economy unspent for a player who never opens the prep screen", () => {
    // The same finding from the economy side, and the number that says how much room
    // there is: naive banks AP all campaign and spends none of it.
    const naive = sweep(NAIVE, [0])[0]!;
    const engaged = sweep(DEFAULT, [0])[0]!;
    expect(naive.apUnspent).toBeGreaterThan(engaged.apUnspent * 2);
    expect(naive.party.every((m) => m.slotsFilled === 0)).toBe(true);
    expect(engaged.party.some((m) => m.slotsFilled > 0)).toBe(true);
  });
});

describe("A3 — do the choices reach the built unit?", () => {
  const run = (p: Persona, withholdPrep: boolean): PlaytestReport =>
    runPlaytest({ persona: p, def: campaign, encounters: ENCOUNTERS, registry, withholdPrep });

  it("the same persona with its prep WITHHELD produces a different run", () => {
    // The A/B on the built object. A policy that computed a plan and never applied it
    // would give two identical reports here and read exactly like one that works.
    const applied = run(OPTIMIZER, false);
    const withheld = run(OPTIMIZER, true);
    expect(withheld.battles.map((b) => b.turns)).not.toEqual(applied.battles.map((b) => b.turns));
    expect(withheld.apUnspent).toBeGreaterThan(applied.apUnspent);
  });

  it("honors the lever: withheld means zero edits reached the save", () => {
    // A lever the runner quietly ignored would give two identical runs and read as a
    // null result, so the lever itself is asserted, not assumed.
    const withheld = run(DEFAULT, true);
    expect(withheld.decisions).toBe(0);
    expect(withheld.battles.every((b) => b.prepDecisions === 0)).toBe(true);
    expect(withheld.party.every((m) => m.slotsFilled === 0 && m.weapon === null)).toBe(true);
  });
});

describe("retrying a lost battle", () => {
  const doomed = (maxAttempts: number): PlaytestReport =>
    runPlaytest({
      persona: NAIVE,
      def: doomedCampaign(),
      encounters: ENCOUNTERS,
      registry,
      maxAttempts,
    });

  it("stalls where the party loses, and a second attempt reproduces the first exactly", () => {
    // The claim in `maxAttempts`' docstring, asserted rather than left as prose: a loss
    // banks no AP and `retryBattle` restores the party, so with a fixed seed attempt two
    // is the same battle. A purpose-built party (1 HP, no offence) is used because no
    // persona loses on the shipped content — which is itself the finding above.
    const once = doomed(1);
    expect(once.ending).toBe("stalled");
    expect(once.battles).toHaveLength(1);
    expect(once.battles[0]?.outcome).not.toBe("victory");

    const twice = doomed(2);
    expect(twice.ending).toBe("stalled");
    expect(twice.battles).toHaveLength(2);
    const [first, second] = twice.battles;
    expect(second?.attempts).toBe(2);
    expect({ ...second, attempts: 1 }).toEqual(first);
  });
});
