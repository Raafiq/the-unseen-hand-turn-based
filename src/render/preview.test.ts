/**
 * `isClickTargetable` (docs/10 §1) — the seam that decides which of a unit's
 * projected abilities the viewer will let a human tap-cast.
 *
 * DISCRIMINATING FIXTURE: a caster whose ONLY non-basic ability is BOTH charged
 * (`speed !== null`) AND area (`aoe !== null`) — exactly the shape every shipped
 * `black-magic.*` / `white-magic.cure` / `.cura` ability has (`preview.ts`'s own
 * docstring). The old filter (`speed === null && aoe === null`) throws this
 * ability away entirely, so a naive viewer offers the caster NOTHING against a
 * foe in range — the caster reduces to a plain melee swing at best, or (for a
 * unit whose kit is *only* this spell, as Wizard/Priest openers are) no legal
 * target at all. The fixed filter must offer the spell BY IDENTITY.
 */
import { describe, expect, it } from "vitest";
import {
  createBattleState,
  defaultUnit,
  makeFlatTiles,
  type BattleAbility,
  type Tile,
  type UnitState,
} from "../sim/index.js";
import { computeActPreview, targetOptions } from "./preview.js";

const CASTER = "caster";
const FOE = "foe";

/** A charged, AoE damage spell — the exact shape `black-magic.fire` ships as. */
const CHARGED_AOE_SPELL: BattleAbility = {
  id: "black-magic.fire",
  actionKind: "action",
  formula: "magic",
  power: 18,
  element: "fire",
  accuracy: 90,
  range: { h: 4, v: 3 },
  inflicts: [],
  speed: 8, // charged — the OLD filter's `speed === null` clause rejects this alone
  aoe: { h: 1, v: 1 }, // area — the OLD filter's `aoe === null` clause also rejects it
};

function fixture(): ReturnType<typeof createBattleState> {
  const width = 5;
  const height = 5;
  const tiles: Tile[] = makeFlatTiles(width, height, 0);
  const caster: UnitState = defaultUnit(CASTER, 0, {
    pos: { x: 1, y: 1 },
    facing: "E",
    // The caster's ONLY offensive option is the charged AoE spell — no
    // `basic.attack` fallback would rescue a naive filter here.
    abilities: [CHARGED_AOE_SPELL],
  });
  const foe: UnitState = defaultUnit(FOE, 1, { pos: { x: 2, y: 1 }, facing: "W" });
  return createBattleState({ seed: 1, grid: { width, height, tiles }, units: [caster, foe] });
}

describe("isClickTargetable — the Wizard/Priest seam (combat revamp)", () => {
  it(
    "DISCRIMINATING: offers a charged AoE spell against an in-range foe, BY ABILITY IDENTITY — " +
      "MUTATION: restore `ability.speed === null && ability.aoe === null` to isClickTargetable's " +
      "return in preview.ts and this goes red (targetOptions() comes back empty for `foe`, " +
      "reproducing the untappable Wizard/Priest).",
    () => {
      const state = fixture();
      const options = targetOptions(state, CASTER, { x: 1, y: 1 });
      const onFoe = options.find((o) => o.unit.id === FOE);
      expect(onFoe, "the caster's only spell was never offered against the foe").toBeDefined();
      // IDENTITY, not just presence: a count or a truthy option would pass even if the
      // wrong ability (or none) were attached — assert the exact ability id offered.
      expect(onFoe!.ability.id).toBe("black-magic.fire");
    },
  );

  it(
    "the offered spell's preview is exact and finite for the tapped unit, not a splash guess — " +
      "ASSERT: computeActPreview returns real hitChance/magnitude numbers for the SAME ability id, " +
      "never NaN/undefined, honouring AC-V6 preview purity (no resolver import here).",
    () => {
      const state = fixture();
      const options = targetOptions(state, CASTER, { x: 1, y: 1 });
      const option = options.find((o) => o.unit.id === FOE)!;
      const preview = computeActPreview(state, CASTER, { x: 1, y: 1 }, false, option);
      expect(preview).not.toBeNull();
      expect(preview!.abilityId).toBe("black-magic.fire");
      expect(Number.isFinite(preview!.hitChance)).toBe(true);
      expect(Number.isFinite(preview!.magnitude)).toBe(true);
      expect(preview!.magnitude).toBeGreaterThan(0);
    },
  );

  it(
    "a charged-only, non-area ability is ALSO offered — the `speed` half of the old clause alone " +
      "no longer blocks it (mutation: reinstate `ability.speed === null` only and this goes red)",
    () => {
      const chargedSingle: BattleAbility = { ...CHARGED_AOE_SPELL, id: "black-magic.bolt", aoe: null };
      const width = 5;
      const height = 5;
      const tiles: Tile[] = makeFlatTiles(width, height, 0);
      const caster: UnitState = defaultUnit(CASTER, 0, {
        pos: { x: 1, y: 1 },
        abilities: [chargedSingle],
      });
      const foe: UnitState = defaultUnit(FOE, 1, { pos: { x: 2, y: 1 } });
      const state = createBattleState({
        seed: 1,
        grid: { width, height, tiles },
        units: [caster, foe],
      });
      const onFoe = targetOptions(state, CASTER, { x: 1, y: 1 }).find((o) => o.unit.id === FOE);
      expect(onFoe?.ability.id).toBe("black-magic.bolt");
    },
  );
});
