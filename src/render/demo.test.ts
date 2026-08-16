/**
 * The DEMO ROSTER is content, and content drifts. `ttk.test.ts` holds the shipped
 * *builds* to the `docs/07` §3 time-to-kill band (AC-P6); nothing held the viewer's
 * hand-authored demo units to anything, and they spent the whole life of the viewer
 * far outside it — a "tank" dying in 2 committed actions where the band says 3–4, and
 * a squishy dying in 1. Fights were decided by turn order before range, positioning or
 * any ability could matter, which is exactly the failure ADR-0016 diagnosed for the
 * shipped builds and re-tuned away. The demo was never brought along.
 *
 * This file is the missing half. Same method as `ttk.test.ts` deliberately — one
 * derived reference action, `ceil(maxHp / reference)` per unit, checked against its
 * declared class — so the two cannot disagree about what "in band" means.
 */

import { describe, expect, it } from "vitest";
import { makeDemoBattle } from "./demo.js";
import { abilityDamage, attackDamage, isBasicAttack, type UnitState } from "../sim/index.js";

/** `docs/07` §3 verbatim, matching `src/sim/ttk.test.ts`'s table. */
const BANDS = {
  squishy: { min: 1, max: 2 },
  mid: { min: 2, max: 3 },
  tank: { min: 3, max: 4 },
} as const;

/** Every demo unit's declared class. A new demo unit MUST be added here (asserted). */
const UNIT_CLASS: Readonly<Record<string, keyof typeof BANDS>> = {
  knight: "tank",
  brawler: "tank",
  archer: "mid", // ranged skirmisher, same class `ttk.test.ts` gives bld-longshot
  mage: "squishy",
};

const state = makeDemoBattle();
const unit = (id: string): UnitState => state.units.find((u) => u.id === id)!;

/**
 * The reference committed action: the two bruisers trading blows. Derived from the
 * roster rather than written down, so re-tuning a weapon moves the band with it
 * instead of silently invalidating every number below.
 */
const reference = attackDamage(unit("knight"), unit("brawler"));

/** Committed actions to drop `hp` under the reference action. */
const actionsToKill = (hp: number): number => Math.ceil(hp / reference);

describe("the demo roster sits inside the docs/07 §3 time-to-kill band", () => {
  it("the reference action is a real, non-trivial swing", () => {
    // Guards the guard: a 0 reference would make every unit read as needing Infinity
    // actions and the band checks below would pass or fail for reasons unrelated to
    // the content they claim to measure.
    expect(reference).toBeGreaterThan(10);
    expect(reference).toBeLessThan(unit("brawler").maxHp);
  });

  it("classifies every demo unit — none silently escapes the band check", () => {
    expect(Object.keys(UNIT_CLASS).sort()).toEqual(state.units.map((u) => u.id).sort());
  });

  for (const [id, cls] of Object.entries(UNIT_CLASS)) {
    it(`${id} dies in ${BANDS[cls].min}–${BANDS[cls].max} committed actions (${cls})`, () => {
      const n = actionsToKill(unit(id).maxHp);
      expect(n, `${id} (${cls})`).toBeGreaterThanOrEqual(BANDS[cls].min);
      expect(n, `${id} (${cls})`).toBeLessThanOrEqual(BANDS[cls].max);
    });
  }

  it("NON-VACUITY: the PRE-SLICE roster fails this very check", () => {
    // Without this the band could be widened (or the derivation broken so everything
    // reads as in band) and the file would stay green while proving nothing. These are
    // the HP values the demo shipped with from the viewer's first commit until
    // 2026-08-16, run through the SAME reference and the SAME bands.
    const PRE_SLICE_HP: Readonly<Record<string, number>> = {
      knight: 130,
      archer: 90,
      brawler: 120,
      mage: 80,
    };
    const violations = Object.entries(PRE_SLICE_HP).filter(([id, hp]) => {
      const n = actionsToKill(hp);
      const band = BANDS[UNIT_CLASS[id]!];
      return n < band.min || n > band.max;
    });
    // Three of the four were out of band; only the Mage (squishy, 1 action) was inside.
    expect(violations.map(([id]) => id).sort()).toEqual(["archer", "brawler", "knight"]);
    // And each of those three died in ONE or TWO actions — the specific defect fixed.
    for (const [id, hp] of violations) {
      expect(actionsToKill(hp), `${id} pre-slice`).toBeLessThanOrEqual(2);
    }
  });
});

describe("the demo roster shows what the viewer claims to show", () => {
  it("the Archer can strike beyond melee — the bow is a real projected ability", () => {
    const archer = unit("archer");
    const bow = archer.abilities.find((a) => a.id === "aim.aimed-shot");
    expect(bow, "the Archer no longer carries its bow skill").toBeDefined();
    // The DISCRIMINATING part: the swing it already had reaches 1 tile, so a test that
    // only checked "has more than one ability" would pass for any melee filler.
    const basic = archer.abilities.find(isBasicAttack)!;
    expect(basic.range.h).toBe(1);
    expect(bow!.range.h).toBeGreaterThan(basic.range.h);
  });

  it("the bow does NOT dominate the swing up close — both are live choices", () => {
    // Anti-convergence in miniature (docs/02 B5): the Archer's speedWp swing out-damages
    // its own shot at melee, so closing is a real option rather than a strictly worse
    // one. If this ever inverts, `targetOptions` (first in-range ability wins) would
    // still pick the swing while the better action sat unreachable — a masking bug.
    const archer = unit("archer");
    const target = unit("brawler");
    const bow = archer.abilities.find((a) => a.id === "aim.aimed-shot")!;
    expect(attackDamage(archer, target)).toBeGreaterThan(abilityDamage(archer, target, bow));
  });

  it("the Knight is honestly empty-handed — battle-skill donates no live action", () => {
    // Not an oversight, and asserted so it cannot become one: every `battle-skill.*` is
    // `formula: "none"`, so there is no skill to give the Knight that would do anything.
    // When the break/debuff rework lands, this test goes red and the Knight gets its kit.
    const knight = unit("knight");
    expect(knight.abilities.map((a) => a.id)).toEqual(["basic.attack"]);
  });
});
