import { describe, it, expect } from "vitest";
import pack from "../../data/base-pack.json" with { type: "json" };
import {
  DEFERRED_ACTIONS,
  DEFERRED_MOVEMENT_EFFECTS,
  DEFERRED_REACTION_EFFECTS,
  DEFERRED_SUPPORT_EFFECTS,
  loadContentPack,
  type Ability,
  type ContentRegistry,
} from "../sim/index.js";
import { abilitySummary } from "./ability-text.js";

/**
 * The derived ability description (playtest, 2026-08-22 — "there is no description for
 * the skills, how would a player know what it does").
 *
 * Two properties carry it. It must be DERIVED, so a re-tune cannot falsify it — the
 * reason this is not 67 authored strings. And no ability may be **silent and
 * unexplained**: a row with no description and no "no effect yet" tag tells a player
 * nothing at all about something they are about to pay 60 AP for.
 */

const registry: ContentRegistry = loadContentPack(pack);
const ALL = [...registry.abilityById.values()];

/** Every ability the game already labels as doing nothing. */
const LABELLED_INERT = new Set([
  ...Object.keys(DEFERRED_ACTIONS),
  ...Object.keys(DEFERRED_SUPPORT_EFFECTS),
  ...Object.keys(DEFERRED_REACTION_EFFECTS),
  ...Object.keys(DEFERRED_MOVEMENT_EFFECTS),
]);

describe("no ability is both silent and unexplained", () => {
  it("DISCRIMINATING: every ability without a description is one the UI tags 'no effect yet'", () => {
    // THE invariant. Without it, `abilitySummary` returning `null` for something the
    // game presents as a live purchase would be a blank row — strictly worse than the
    // name-and-price it replaced, because it looks like the description loaded and was
    // empty. The partition is exact in one direction on purpose: a live ability may
    // never be silent.
    const silent = ALL.filter((a) => abilitySummary(a) === null).map((a) => a.id);
    const silentAndUnlabelled = silent.filter((id) => !LABELLED_INERT.has(id));
    expect(silentAndUnlabelled).toEqual([]);
    // …and the set is non-empty, so the assertion above is not vacuously true.
    expect(silent.length).toBeGreaterThan(0);
  });

  it("every LIVE ability has a description", () => {
    const live = ALL.filter((a) => !LABELLED_INERT.has(a.id));
    const missing = live.filter((a) => abilitySummary(a) === null).map((a) => a.id);
    expect(missing).toEqual([]);
    expect(live.length).toBeGreaterThan(30); // the pack really is mostly live
  });
});

describe("the description is DERIVED, not written down", () => {
  const withPower = (over: Partial<Ability>): Ability =>
    ({
      id: "test.blast",
      type: "action",
      skillset: "black-magic",
      apCost: 60,
      formula: "magic",
      power: 20,
      element: "fire",
      range: { h: 4, v: 1 },
      ...over,
    }) as Ability;

  it("DISCRIMINATING: re-tuning the numbers changes the text", () => {
    // This is what buys the whole design. An authored `description` field would read
    // identically after a re-cost — and this repo re-costs constantly — so the text
    // must move when the data moves, or it is just a second copy that rots.
    const before = abilitySummary(withPower({}));
    const stronger = abilitySummary(withPower({ power: 40 }));
    const longer = abilitySummary(withPower({ range: { h: 8, v: 1 } }));
    expect(stronger).not.toBe(before);
    expect(longer).not.toBe(before);
    expect(stronger).toContain("power 40");
    expect(longer).toContain("range 8");
  });

  it("names a buff as APPLIED, never inflicted", () => {
    // `white-magic.protect` goes through the status path. "Inflicts protect" would tell
    // a player the opposite of the truth, and the ability alone cannot tell buff from
    // debuff — the kind lives on the status — so the wording must be true for both.
    // Lower-cased before matching: the summary capitalises its first word, and this
    // test is about the VERB, not about sentence case.
    const protect = abilitySummary(registry.ability("white-magic.protect"))?.toLowerCase();
    expect(protect).toContain("applies protect");
    expect(protect).not.toContain("inflicts");
  });

  it("an action that resolves nothing gets no description, not a useless one", () => {
    // Weapon Break has a real range and no effect. "Range 1" as its entire description
    // reads like a complete answer to "what does this do?" and is not one.
    expect(abilitySummary(registry.ability("battle-skill.weapon-break"))).toBeNull();
  });

  it("reads the passive slots out of their own effect fields", () => {
    expect(abilitySummary(registry.ability("battle-skill.hp-boost"))).toContain("max HP ×1.2");
    expect(abilitySummary(registry.ability("steal.move-plus-2"))).toContain("move +2");
    expect(abilitySummary(registry.ability("punch-art.counter"))).toContain("strikes back");
    expect(abilitySummary(registry.ability("punch-art.hamedo"))).toContain("attacks first");
  });

  it("says a spell charges, and what it costs", () => {
    const fire = abilitySummary(registry.ability("black-magic.fire"))?.toLowerCase();
    expect(fire).toContain("fire magic damage");
    expect(fire).toContain("6 mp");
    expect(fire).toContain("charges before it lands");
  });
});
