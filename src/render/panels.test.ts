/**
 * THE MINI STAT CARD (docs/10 §4) — the pure model and the pure renderer.
 *
 * `panels.ts` had no test at all until this file. It is DOM-free by construction
 * (`state → string`), so everything here runs in the plain Node environment vitest
 * is configured for, exactly as `PrepModel` and `SceneModel` do.
 *
 * WHAT EACH TEST IS FOR is written on it, and every one of those comments names a
 * mutation that was actually applied and watched go red — CLAUDE.md's rule that a
 * discriminator you only reasoned about is not a verified one.
 */

import { describe, expect, it } from "vitest";
import {
  UnitStateSchema,
  createBattleState,
  defaultUnit,
  makeFlatTiles,
  type BattleState,
} from "../sim/index.js";
import { registry } from "./campaign-data.js";
import { forecast } from "./demo.js";
import {
  statCard,
  statCardHtml,
  timelineHtml,
  unitCardHtml,
  type LookUp,
  type UnitLook,
} from "./panels.js";
import { JOB_LABEL } from "./prep.js";

/** A `LookUp` over a plain table — the shape both shipped pages hand `panels.ts`. */
const looks =
  (table: Record<string, UnitLook>): LookUp =>
  (id) =>
    table[id];

/**
 * A SPEED LADDER whose FORECAST LEAD IS NOT `units[0]`.
 *
 * The discriminating property is the whole point: `plodder` is stored first (deploy
 * order, the scheduler's tie-break key) while `bolter` is the unit that actually acts
 * next. On any fixture where those coincide — the shipped demo battle is a measured
 * repeat offender for exactly this kind of tie — a card wired to `units[0]` and a card
 * wired to the forecast produce the same HTML and the test certifies nothing.
 *
 * HP is 148/216 so current and max are DIFFERENT and neither is a round percentage;
 * Brave/Faith differ from each other and from CT, so a renderer that printed one field
 * in another's slot cannot pass.
 */
function ladder(): BattleState {
  const u = (id: string, teamId: number, x: number, speed: number, over: Partial<ReturnType<typeof defaultUnit>>) =>
    defaultUnit(id, teamId, { pos: { x, y: 0 }, speed, ...over });
  return createBattleState({
    seed: 99,
    grid: { width: 6, height: 2, tiles: makeFlatTiles(6, 2, 0) },
    units: [
      u("plodder", 0, 0, 6, { ct: 10, hp: 40, maxHp: 90, brave: 55, faith: 35 }),
      u("bolter", 0, 2, 20, { ct: 90, hp: 148, maxHp: 216, brave: 70, faith: 50 }),
      u("foe", 1, 4, 8, { ct: 20, hp: 100, maxHp: 100, brave: 60, faith: 45 }),
    ],
  });
}

/** A FULLY POPULATED look — job and portrait both present, so the exact-key-set test
 *  below is measuring the widest card the type allows rather than a stripped one. */
const LADDER_LOOK = looks({
  plodder: { label: "Plodder", color: "#4f8cff", job: "Knight", portrait: { url: "/art/placeholder.svg", key: "placeholder" } },
  bolter: { label: "Bolter", color: "#4f8cff", job: "Geomancer", portrait: { url: "/art/placeholder.svg", key: "placeholder" } },
  foe: { label: "Foe", color: "#e2603c", job: "Thief", portrait: { url: "/art/placeholder.svg", key: "placeholder" } },
});

/**
 * The card only. `unitCardHtml` renders nothing else today, but the assertion that it
 * actually produced a card stays: an empty string would otherwise satisfy every
 * `not.toContain` below, which is most of this file.
 */
const cardOf = (html: string): string => {
  const at = html.indexOf('<div class="unit-card"');
  expect(at, "unitCardHtml rendered no unit card at all").toBeGreaterThan(-1);
  return html.slice(at);
};

const lead = (state: BattleState) => forecast(state, 1).entries[0];

describe("the mini stat card describes the unit acting NEXT", () => {
  it("DISCRIMINATING: it follows the forecast lead, not state.units[0]", () => {
    const state = ladder();
    const first = lead(state);

    // NON-DEGENERACY GUARD. Without this the fixture could silently drift into a tie
    // and every assertion below would pass under both wirings.
    expect(state.units[0]!.id).not.toBe(first!.id);
    expect(first).toEqual({ kind: "unit", id: "bolter" });

    // MUTATION RUN: `statCard(state, look, { kind: "unit", id: state.units[0]!.id })` in
    // `unitCardHtml`, and separately `state.units[0]` inside `describe`. Both turn this
    // red — the card describes Plodder.
    const html = cardOf(unitCardHtml(state, LADDER_LOOK));
    expect(html).toContain("Bolter");
    expect(html).not.toContain("Plodder");
    expect(statCard(state, LADDER_LOOK, first)?.id).toBe("bolter");
  });

  it("HP prints the CURRENT and the MAX number, not just a bar", () => {
    // A bar alone is a percentage. MUTATION RUN: replaced the `148 / 216` text with
    // `${pct}%` — red here, and green on every other test in this file, which is
    // exactly why this assertion is separate.
    const state = ladder();
    const card = statCard(state, LADDER_LOOK, lead(state))!;
    expect(card.hp).toEqual({ cur: 148, max: 216 });
    expect(Number.isInteger(card.hp.cur) && Number.isInteger(card.hp.max)).toBe(true);
    expect(statCardHtml(card)).toContain("148 / 216");
  });

  it("carries CT, Brave and Faith as the sim reports them", () => {
    const state = ladder();
    const card = statCard(state, LADDER_LOOK, lead(state))!;
    // Three distinct numbers, so a renderer printing one in another's slot fails.
    expect([card.ct, card.brave, card.faith]).toEqual([90, 70, 50]);
    const html = statCardHtml(card);
    expect(html).toContain("Clock <b>90</b>");
    expect(html).toContain("Brave <b>70</b>");
    expect(html).toContain("Faith <b>50</b>");
  });
});

describe("MP and Level are ABSENT, not zero (pillar 4, ADR-0021)", () => {
  it("the card has an EXACT key set and the markup names neither", () => {
    // BOTH HALVES ARE NEEDED and neither substitutes for the other: the key set cannot
    // see a hard-coded `Lv 1` in a template string, and the regex cannot see a field
    // renamed into existence. MUTATION RUN: added a literal `Lv 1` to the name row —
    // the key set stayed green and the regex went red, as designed.
    const state = ladder();
    const card = statCard(state, LADDER_LOOK, lead(state))!;
    expect(Object.keys(card).sort()).toEqual([
      "brave",
      "color",
      "ct",
      "faith",
      "hp",
      "id",
      "job",
      "label",
      "portrait",
    ]);
    expect(cardOf(unitCardHtml(state, LADDER_LOOK))).not.toMatch(/\bMP\b|\bLv\b|\bLevel\b/i);
  });

  it("and it does not say CT either — the engine's word for the turn clock", () => {
    // NOT a duplicate of the key-set test above: that one is about UNMODELLED values,
    // this one is about JARGON for a value the card does show. `e2e/campaign.spec.ts`'s
    // learnability spec is the authority and it is what caught this card's first draft
    // saying "CT 90"; this is the faster echo, so the next edit fails in 20ms rather
    // than after a full browser run.
    const state = ladder();
    const html = cardOf(unitCardHtml(state, LADDER_LOOK));
    expect(html).not.toMatch(/\bCT\b/);
    expect(html).toContain("Clock <b>90</b>");
  });

  it("TRIPWIRE: the sim still models no MP, so hiding it is still honest", () => {
    // The test above rots green the day MP ships: the card would keep its key set and
    // the markup would keep saying nothing, while the omission had turned into a lie.
    // This is the check that fails instead. Level is NOT duplicated here — AC-J10
    // already guards `UnitRecord.level`, and a second copy of that guard would rot
    // separately.
    expect(
      Object.keys(UnitStateSchema.shape),
      "UnitState now models MP. The stat card hides it, which was honest only while " +
        "the sim modelled nothing — see src/render/CLAUDE.md, 'when a deferred " +
        "capability SHIPS, the absent row becomes a lie — go un-hide it'.",
    ).not.toContain("mp");
  });
});

describe("optional presentation is genuinely optional", () => {
  it("A/B: no job in the look means NO job on the card, not an em dash", () => {
    // The A/B is on the BUILT OBJECT, from the same state through two `LookUp`s: a card
    // that validated `job` and then defaulted it would look identical from one side.
    // MUTATION RUN: `job: meta?.job ?? "—"` — the `"job" in` assertion went red.
    const state = ladder();
    const first = lead(state);
    const withJob = statCard(state, looks({ bolter: { label: "Bolter", color: "#4f8cff", job: "Geomancer" } }), first)!;
    const without = statCard(state, looks({ bolter: { label: "Bolter", color: "#4f8cff" } }), first)!;

    expect(withJob.job).toBe("Geomancer");
    expect("job" in without).toBe(false);
    expect(statCardHtml(withJob)).toContain("Geomancer");
    expect(statCardHtml(without)).not.toContain("uc-job");
    // Everything else is byte-identical, so the difference above is the job and only it.
    expect({ ...withJob, job: undefined }).toEqual({ ...without, job: undefined });
  });

  it("the portrait has THREE states and the caption tracks the KEY, not the URL", () => {
    // TWO STATES WOULD CERTIFY NOTHING. "absent vs placeholder" passes under a caption
    // that is simply always on; "placeholder vs real art" passes under one that is
    // always off. All three in one fixture pin it.
    // MUTATIONS RUN: (a) caption emitted unconditionally — the real-art case went red;
    // (b) caption condition changed to `url === undefined` (never true) — the
    // placeholder case went red. Neither mutation could be caught by the other case.
    const state = ladder();
    const first = lead(state);
    const card = (portrait?: UnitLook["portrait"]): string =>
      statCardHtml(
        statCard(
          state,
          looks({ bolter: { label: "Bolter", color: "#4f8cff", ...(portrait ? { portrait } : {}) } }),
          first,
        ),
      );

    const none = card();
    expect(none).not.toContain("<img");
    expect(none).not.toContain("Portrait pending");

    const pending = card({ url: "/art/placeholder.svg", key: "placeholder" });
    expect(pending).toContain("<img");
    expect(pending).toContain("Portrait pending");

    const real = card({ url: "/art/geomancer-f.png", key: "geomancer-f" });
    expect(real).toContain("<img");
    expect(real).not.toContain("Portrait pending");

    expect(statCard(state, looks({ bolter: { label: "B", color: "#000" } }), first)!.portrait).toBeUndefined();
  });
});

describe("edge cases the rail actually reaches", () => {
  it("a CHARGE lead resolves back to its caster and says it is casting", () => {
    // The lead slot can be a charge, which is not a unit and has no HP. It must resolve
    // through `chargeQueue.sourceUnitId`. `bystander` is stored FIRST so a card wired to
    // `state.units[0]` names the wrong unit rather than coincidentally the right one.
    // MUTATION RUN: charge branch replaced with `state.units[0]` — red, card id
    // "bystander".
    const state = createBattleState({
      seed: 7,
      grid: { width: 4, height: 4, tiles: makeFlatTiles(4, 4, 0) },
      units: [
        defaultUnit("bystander", 0, { pos: { x: 0, y: 0 }, ct: 0, speed: 1 }),
        defaultUnit("caster", 0, { pos: { x: 2, y: 2 }, ct: 95, speed: 10, hp: 33, maxHp: 77 }),
      ],
    });
    state.chargeQueue.push({
      id: "spell",
      sourceUnitId: "caster",
      ct: 95,
      speed: 10,
      targetTile: { x: 3, y: 3 },
      effect: { kind: "magic", power: 0, element: "none", accuracy: 100, aoe: null, inflicts: [] },
      interrupted: false,
    });
    const first = lead(state);
    expect(first).toEqual({ kind: "charge", id: "spell" });
    expect(state.units[0]!.id).toBe("bystander");

    const look = looks({ caster: { label: "Caster", color: "#4f8cff" }, bystander: { label: "Bystander", color: "#4f8cff" } });
    const card = statCard(state, look, first)!;
    expect(card.id).toBe("caster");
    expect(card.casting).toBe(true);
    expect(card.hp).toEqual({ cur: 33, max: 77 });
    expect(cardOf(unitCardHtml(state, look))).toContain("Caster");
  });

  it("an EMPTY timeline still reserves the card's space", () => {
    // A collapsing element shifts everything under it — the scene player's jumping text
    // column, already shipped once. MUTATION RUN: `return ""` for the null card — red on
    // both the marker and the text assertion.
    const state = createBattleState({
      seed: 3,
      grid: { width: 2, height: 2, tiles: makeFlatTiles(2, 2, 0) },
      units: [],
    });
    expect(forecast(state, 8).entries).toEqual([]);

    const empty = statCardHtml(null);
    expect(empty).toContain('data-state="none"');
    // Non-empty MARKUP is not enough: an element with no text has no height either.
    expect(empty.replace(/<[^>]*>/g, "").trim().length).toBeGreaterThan(0);
    expect(cardOf(unitCardHtml(state, () => undefined))).toContain('data-state="none"');
  });
});

describe("player-facing text is escaped", () => {
  it("a label or job containing markup lands as text, not as HTML", () => {
    // Names come from campaign data and job labels from `prep.ts`, so neither is
    // attacker-controlled today — but both are interpolated into a template literal and
    // a stray `<` would rewrite the card. MUTATION RUN: dropped `esc` from the label —
    // red. NOTE `chip()` above is still unescaped; that is pre-existing, out of this
    // slice's scope, and reported rather than silently fixed.
    const state = ladder();
    const html = statCardHtml(
      statCard(state, looks({ bolter: { label: "<b>Bolt</b>", color: "#4f8cff", job: "<i>Geo</i>" } }), lead(state)),
    );
    expect(html).not.toContain("<b>Bolt");
    expect(html).not.toContain("<i>Geo");
    expect(html).toContain("&lt;b&gt;Bolt&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;Geo&lt;/i&gt;");
  });
});

describe("every shipped job has a display label", () => {
  it("JOB_LABEL's KEY SET matches the content registry's jobs, both directions", () => {
    // KEY SETS, NOT VALUES. `jobLabel` falls through `prettify`, which turns "geomancer"
    // into "Geomancer" all by itself — so a value comparison passes with the entry
    // deleted and cannot see a miss at all. MUTATION RUN: deleted `geomancer:` from
    // JOB_LABEL — red on the key set (and, checked, still green on a value compare).
    // Both directions in one equality: a stale key for a job the pack dropped is a
    // label wired to nothing and reads as covered.
    expect(Object.keys(JOB_LABEL).sort()).toEqual([...registry.jobById.keys()].sort());
  });
});

describe("the card is its OWN surface, not part of the turn rail", () => {
  it("timelineHtml emits chips and no card; unitCardHtml emits a card and no chips", () => {
    // The card is an absolutely-positioned OVERLAY on the canvas and the chips are board
    // chrome underneath it, so they are written into two different hosts. If the rail
    // still carried a copy, the page would paint the same unit twice — once under the
    // board and once on it — and every assertion in this file would still pass.
    // MUTATION RUN: appended `statCardHtml(...)` back onto `timelineHtml`'s return —
    // red on the first assertion.
    const state = ladder();
    const rail = timelineHtml(state, LADDER_LOOK);
    expect(rail).not.toContain("unit-card");
    expect(rail).toContain("Next up");

    const card = unitCardHtml(state, LADDER_LOOK);
    expect(card).toContain('data-testid="unit-card"');
    expect(card).not.toContain("tl-label");
  });
});

describe("the focus seam: which unit the card describes", () => {
  it("A/B: the same state renders a DIFFERENT unit with and without a focus id", () => {
    // The A/B is the whole test. A `focusUnitId` that were type-checked, validated and
    // then ignored would leave both sides byte-identical — the dead-slot shape — and a
    // one-sided assertion ("passing 'foe' is accepted") could not tell the two apart.
    // THE SHIPPED PAGE PASSES NO ID (the card follows the actor, owner's call), so this
    // file is the ONLY thing keeping the parameter honest until an inspect control lands.
    // The fixture is discriminating because the forecast lead is `bolter` while the
    // focus names `foe`: a card wired to either one alone names a different unit.
    // MUTATION RUN: dropped the `focusUnitId` branch from `statCard` — red, both cards
    // said "Bolter".
    const state = ladder();
    expect(lead(state)).toEqual({ kind: "unit", id: "bolter" });

    const actor = unitCardHtml(state, LADDER_LOOK);
    const focused = unitCardHtml(state, LADDER_LOOK, "foe");
    expect(actor).toContain("Bolter");
    expect(actor).not.toContain("Foe");
    expect(focused).toContain("Foe");
    expect(focused).not.toContain("Bolter");
    // And it is the WHOLE card that moved, not just the name: HP is read off the focused
    // unit too, so a renderer that swapped the caption and kept the lead's numbers fails.
    expect(focused).toContain("100 / 100");
    expect(actor).toContain("148 / 216");
  });

  it("a focus id that names nothing falls back to the lead rather than blanking", () => {
    // A selection can go stale — the unit it named dies, or the id is simply not in this
    // battle. Falling through to the lead is the difference between a card that flickers
    // empty mid-battle and one that does not.
    // MUTATION RUN: removed the `state.units.some(...)` membership check — red, the card
    // rendered `data-state="none"`.
    const state = ladder();
    const gone = unitCardHtml(state, LADDER_LOOK, "nobody-by-that-name");
    expect(gone).toBe(unitCardHtml(state, LADDER_LOOK));
    expect(gone).toContain("Bolter");
  });

  it("a focused unit is never captioned as CASTING, even when the lead is a charge", () => {
    // The `casting` flag belongs to the charge QUEUE SLOT, not to a unit. Carrying it
    // onto a focused unit would assert a spell the sim never said that unit was casting.
    // MUTATION RUN: passed `casting` through the focus branch — red on `not.toContain`.
    const state = createBattleState({
      seed: 7,
      grid: { width: 4, height: 4, tiles: makeFlatTiles(4, 4, 0) },
      units: [
        defaultUnit("bystander", 0, { pos: { x: 0, y: 0 }, ct: 0, speed: 1 }),
        defaultUnit("caster", 0, { pos: { x: 2, y: 2 }, ct: 95, speed: 10, hp: 33, maxHp: 77 }),
      ],
    });
    state.chargeQueue.push({
      id: "spell",
      sourceUnitId: "caster",
      ct: 95,
      speed: 10,
      targetTile: { x: 3, y: 3 },
      effect: { kind: "magic", power: 0, element: "none", accuracy: 100, aoe: null, inflicts: [] },
      interrupted: false,
    });
    const look = looks({
      caster: { label: "Caster", color: "#4f8cff" },
      bystander: { label: "Bystander", color: "#4f8cff" },
    });
    // Unfocused, the charge lead DOES say casting — so the assertion below is a real
    // difference and not a property the fixture never had.
    expect(unitCardHtml(state, look)).toContain("casting");
    const focused = unitCardHtml(state, look, "bystander");
    expect(focused).toContain("Bystander");
    expect(focused).not.toContain("casting");
  });
});
