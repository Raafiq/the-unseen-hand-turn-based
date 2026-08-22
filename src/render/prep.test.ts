import { describe, it, expect } from "vitest";
import pack from "../../data/base-pack.json" with { type: "json" };
import {
  buildBattleUnit,
  defaultUnitRecord,
  learnAbility,
  loadContentPack,
  setLoadoutSlot,
  type ContentRegistry,
  type UnitRecord,
} from "../sim/index.js";
import { PrepModel, type LearnRow } from "./prep.js";

/**
 * The prep panel's RULES, with no DOM (the `session.ts` precedent). What a browser adds
 * on top is covered by `e2e/prep.spec.ts` and `e2e/campaign.spec.ts`; everything here is
 * about what the model does to a record and what it tells its caller.
 */

const registry: ContentRegistry = loadContentPack(pack);

/** A monk who knows one Punch Art action, so Punch Art is a legal Secondary elsewhere. */
function monkish(id = "u1", ap = 0): UnitRecord {
  const base = defaultUnitRecord(id, "monk", { name: "Kest", ap: ap + 60 });
  return { ...learnAbility(base, "monk", "wave-fist", registry), ap };
}

/**
 * A Knight holding exactly 60 AP with Weapon Break already bought. Chosen because its
 * tree then shows ALL FOUR row states at once — known (`weapon-break`), buyable
 * (`equip-heavy-armor`, 60), unlocked-but-unaffordable (`armor-break`, 120) and
 * prerequisite-locked (`shield-break`) — so one fixture separates every case the panel
 * has to draw differently.
 */
function knightish(id = "u1"): UnitRecord {
  const base = defaultUnitRecord(id, "knight", { name: "Vance", ap: 120 });
  return { ...learnAbility(base, "knight", "weapon-break", registry), ap: 60 };
}

describe("the model reports every edit to its caller", () => {
  it("onChange fires with the EDITED record, and the model keeps it", () => {
    const seen: UnitRecord[] = [];
    const m = new PrepModel({
      registry,
      records: [monkish("u1", 200)],
      onChange: (r) => seen.push(r),
    });

    m.learn("monk", "chakra");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.learned).toContain("punch-art.chakra");
    expect(m.record().learned).toContain("punch-art.chakra");
    expect(m.record().ap).toBe(80); // 200 − 120
  });

  it("DISCRIMINATING: an edit to one member never touches another", () => {
    // A panel that edited "the record" through a shared reference, or wrote back to the
    // wrong index, would look identical on the selected member and corrupt the other.
    const m = new PrepModel({ registry, records: [monkish("u1", 200), monkish("u2", 200)] });
    m.learn("monk", "chakra");

    expect(m.records()[0]!.learned).toContain("punch-art.chakra");
    expect(m.records()[1]!.learned).not.toContain("punch-art.chakra");
    expect(m.records()[1]!.ap).toBe(200);
  });

  it("selecting by id switches which record edits land on; an unknown id throws", () => {
    const m = new PrepModel({ registry, records: [monkish("u1", 200), monkish("u2", 200)] });
    m.select("u2");
    m.learn("monk", "chakra");

    expect(m.records()[0]!.learned).not.toContain("punch-art.chakra");
    expect(m.records()[1]!.learned).toContain("punch-art.chakra");
    expect(() => m.select("nobody")).toThrow(/no record with id/);
  });
});

describe("spending AP", () => {
  it("a row is buyable only when the sim says so, and carries the sim's own reason", () => {
    const m = new PrepModel({ registry, records: [knightish()] });
    const rows = Object.fromEntries(m.learnRows().map((r) => [r.node, r]));

    // Already bought by the fixture: known, and never re-charged (AC-J3).
    expect(rows["weapon-break"]!.known).toBe(true);
    // Affordable AND unlocked.
    expect(rows["equip-heavy-armor"]!.buyable).toBe(true);
    expect(rows["equip-heavy-armor"]!.apCost).toBe(60);
    // Unlocked but unaffordable at 60 AP, and it SAYS which — the two blocked states
    // must not collapse into one "locked", or the panel cannot tell a player whether to
    // save up or to buy something else first.
    expect(rows["armor-break"]!.buyable).toBe(false);
    expect(rows["armor-break"]!.reason).toMatch(/insufficient AP/);
    // Affordable in principle but its prerequisite is not learned.
    expect(rows["shield-break"]!.buyable).toBe(false);
    expect(rows["shield-break"]!.reason).toMatch(/prerequisite/);
  });

  it("DISCRIMINATING: buying a row moves it from buyable to known AND debits AP", () => {
    // The two halves come apart in opposite ways: a panel that appended the ability
    // without charging, and one that charged without granting, both leave a list that
    // looks plausible. Assert the pair.
    const m = new PrepModel({ registry, records: [knightish()] });
    expect(m.learnRows().find((r) => r.node === "equip-heavy-armor")!.buyable).toBe(true);
    m.learn("knight", "equip-heavy-armor");

    const rows = Object.fromEntries(m.learnRows().map((r) => [r.node, r]));
    expect(rows["equip-heavy-armor"]!.known).toBe(true);
    expect(rows["equip-heavy-armor"]!.buyable).toBe(false);
    expect(m.record().ap).toBe(0);
  });

  it("an illegal purchase throws rather than silently no-opping", () => {
    const m = new PrepModel({ registry, records: [monkish("u1", 0)] });
    expect(() => m.learn("monk", "chakra")).toThrow(/insufficient AP/);
    expect(m.record().learned).not.toContain("punch-art.chakra");
  });

  it("completing a tree latches mastery, so the trait becomes equippable", () => {
    // Mastery is what makes the traits row non-empty; a model that bought abilities but
    // never called `checkMastery` would leave a fully-mastered unit with no trait at all
    // and read as a content gap.
    const m = new PrepModel({ registry, records: [monkish("u1", 5000)] });
    expect(m.earnedTraits()).toEqual([]);
    for (const node of [
      "earth-slash",
      "martial-arts",
      "hamedo",
      "chakra",
      "revive",
      "counter",
      "purification",
    ]) {
      m.learn("monk", node);
    }
    expect(m.record().mastered).toContain("monk");
    expect(m.earnedTraits()).toContain("inner-focus");
  });
});

describe("changing job", () => {
  it("keeps AP, learned abilities and mastery — progress belongs to the unit (AC-J3)", () => {
    const m = new PrepModel({ registry, records: [monkish("u1", 200)] });
    m.setJob("knight");
    expect(m.record().currentJob).toBe("knight");
    expect(m.record().ap).toBe(200);
    expect(m.record().learned).toContain("punch-art.wave-fist");
  });

  it("DISCRIMINATING: it CLEARS a secondary that the new job would collide with", () => {
    // `changeJob` validates nothing, so this is the one way to reach
    // `secondary === currentJob` — the state `setLoadoutSlot` refuses to create. Nothing
    // downstream throws on it; the secondary silently duplicates the primary command.
    const knight = defaultUnitRecord("u1", "knight", { name: "Vance", ap: 60 });
    const withPunch = learnAbility(knight, "monk", "wave-fist", registry);
    const equipped = setLoadoutSlot(withPunch, "secondary", "monk", registry);
    expect(equipped.loadout.secondary).toBe("monk");

    const m = new PrepModel({ registry, records: [equipped] });
    m.setJob("monk");
    expect(m.record().currentJob).toBe("monk");
    expect(m.record().loadout.secondary).toBeNull();
  });

  it("a NON-colliding secondary survives the job change untouched", () => {
    // The other half of the pair: a model that just cleared the secondary on every job
    // change would pass the test above and silently throw away a legal loadout.
    const knight = defaultUnitRecord("u1", "knight", { name: "Vance", ap: 60 });
    const withPunch = learnAbility(knight, "monk", "wave-fist", registry);
    const equipped = setLoadoutSlot(withPunch, "secondary", "monk", registry);

    const m = new PrepModel({ registry, records: [equipped] });
    m.setJob("thief");
    expect(m.record().loadout.secondary).toBe("monk");
  });

  it("an unknown job id throws instead of being stored", () => {
    const m = new PrepModel({ registry, records: [monkish()] });
    expect(() => m.setJob("dragoon")).toThrow();
    expect(m.record().currentJob).toBe("monk");
  });
});

describe("what the panel shows is what the unit would fight with", () => {
  it("the command list is the REAL build projection, not a re-derivation", () => {
    const m = new PrepModel({ registry, records: [monkish("u1", 200)] });
    expect(m.commands()).toEqual(
      buildBattleUnit(m.record(), registry).abilities.map((a) => a.id),
    );
  });

  it("DISCRIMINATING: equipping a Secondary GROWS it; clearing shrinks it back", () => {
    const knight = defaultUnitRecord("u1", "knight", { name: "Vance", ap: 120 });
    const withFire = learnAbility(knight, "wizard", "fire", registry);
    const m = new PrepModel({ registry, records: [withFire] });

    const before = m.commands();
    expect(before).not.toContain("black-magic.fire");
    m.setSlot("secondary", "wizard");
    expect(m.commands()).toContain("black-magic.fire");
    m.setSlot("secondary", null);
    expect(m.commands()).toEqual(before);
  });
});

describe("setRecords is a no-op when nothing changed", () => {
  it("reports false for identical input and true for a real change", () => {
    // The page calls this on every repaint. A blind re-render would destroy the focus of
    // the control the player is mid-way through using, so "did anything change" has to be
    // answerable without re-rendering to find out.
    const a = monkish("u1", 200);
    const m = new PrepModel({ registry, records: [a, monkish("u2", 200)] });

    expect(m.setRecords([a, monkish("u2", 200)])).toBe(false);
    expect(m.setRecords([{ ...a, ap: 300 }, monkish("u2", 200)])).toBe(true);
    expect(m.record().ap).toBe(300);
  });

  it("keeps the selected member across a replacement", () => {
    const m = new PrepModel({ registry, records: [monkish("u1"), monkish("u2")] });
    m.select("u2");
    m.setRecords([monkish("u1", 40), monkish("u2", 40)]);
    expect(m.record().id).toBe("u2");
  });
});

describe("a node whose ability does NOTHING says so before you pay for it", () => {
  it("marks a deferred node, and does not mark a live one", () => {
    // AP is spent permanently and never refunded (AC-J3), so an unmarked inert node is
    // the panel charging real currency for nothing. The command list has marked deferred
    // ABILITIES since ADR-0019; a learn list is the more expensive place to get it wrong.
    const knight = new PrepModel({ registry, records: [knightish()] });
    const rows = Object.fromEntries(knight.learnRows().map((r) => [r.node, r]));
    expect(rows["armor-break"]!.deferred).toMatch(/\S/);

    const priest = new PrepModel({
      registry,
      records: [defaultUnitRecord("u2", "priest", { name: "Ottoline", ap: 60 })],
    });
    const cure = priest.learnRows().find((r) => r.node === "cure")!;
    expect(cure.deferred).toBeNull();
  });

  it("DISCRIMINATING: it covers every SLOT TYPE, not just actions", () => {
    // The lookup unions four registries. A per-slot check would silently pass the three
    // types it did not happen to cover — the subset-reads-as-the-set failure at panel
    // scale. One deferred node of each type, from the tree that actually donates it, and
    // the ability's TYPE asserted so the row cannot quietly stop covering that slot.
    const rowsFor = (job: string): Record<string, LearnRow> => {
      const m = new PrepModel({
        registry,
        records: [defaultUnitRecord("u", job, { name: "T", ap: 60 })],
      });
      return Object.fromEntries(m.learnRows().map((r) => [r.node, r]));
    };
    const cases: ReadonlyArray<[string, string, string, string]> = [
      ["knight", "armor-break", "battle-skill.armor-break", "action"],
      ["knight", "equip-heavy-armor", "battle-skill.equip-heavy-armor", "support"],
      ["thief", "gilgame-heart", "steal.gilgame-heart", "reaction"],
      ["archer", "scout", "aim.scout", "movement"],
    ];
    for (const [job, node, abilityId, type] of cases) {
      expect(registry.ability(abilityId).type).toBe(type);
      expect(rowsFor(job)[node]!.deferred).toMatch(/\S/);
    }

    // …and a LIVE node in the same trees is untouched, so this is not "mark everything".
    expect(rowsFor("thief")["steal-heart"]!.deferred).toBeNull();
    expect(rowsFor("archer")["aimed-shot"]!.deferred).toBeNull();
  });
});
