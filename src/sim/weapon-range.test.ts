/**
 * WEAPON REACH (ADR-0049, docs/01 AC-011 / AC-012, specs/005-weapon-range plan rows 011+012).
 *
 * A basic attack's reach is the weapon's `range`: every weapon but the Long Bow keeps
 * `{h:1,v:1}`, the bow reaches `{h:4,v:3}`. The reach is asked of the REAL path — the
 * unit's derived `basic.attack` (built by `buildBattleUnit` -> `basicAttackFrom`, from the
 * shipped pack's equipment) fed to `inAbilityRange`, the very gate the driver
 * (`driver.ts` act validation), the AI and the reaction gate call. No range is
 * hand-copied into a fixture: the test builds a unit and reads what it derived.
 *
 * FIXTURE LAYOUT follows the plan, which overrides the AC text (the ACs put a diagonal
 * foe on a 1-row grid, which has no such tile): 6x2 for the sword diagonal, 1x7 for the
 * bow's distances, 1x3 for height, and a separate 4x4 for the (3,3) diagonal.
 *
 * DISCRIMINATION: each in/out pair straddles exactly one boundary of the shipped range,
 * so each of the five bow mutants (h:3, h:5, v:4, v:2, min-range 2) and the sword's
 * `h:2` mutant flips exactly one named case. The bow and the sword are also asserted to
 * DISAGREE at the same tile (x=2), so a unit that got the wrong weapon's range cannot
 * pass both files' worth of cases.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { buildBattleUnit } from "./build.js";
import { parseCampaign, startCampaign } from "./campaign.js";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { inAbilityRange } from "./grid.js";
import { BASIC_ATTACK_ID, createBattleState, defaultUnit } from "./state.js";
import type { BattleState, Position, Tile, UnitState } from "./state.js";
import type { UnitRecord } from "./roster.js";

const packJson: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../data/base-pack.json", import.meta.url)), "utf8"),
);
const registry: ContentRegistry = loadContentPack(packJson);
const campaign = parseCampaign(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../data/campaign/camp-the-first-march.json", import.meta.url)),
      "utf8",
    ),
  ) as unknown,
);

const BOW = "wpn-long-bow";
const SWORD = "wpn-arming-sword";

function briarRecord(): UnitRecord {
  const rec = campaign.party.find((r) => r.id === "pc-briar");
  if (!rec) throw new Error("pc-briar missing from the shipped campaign party");
  return rec;
}

/** Briar's real record with one weapon swapped in — built by the real build path. */
function wielder(weaponId: string, pos: Position): UnitState {
  return buildBattleUnit({ ...briarRecord(), weapon: weaponId }, registry, { pos, teamId: 0 });
}

function basicAttackOf(unit: UnitState) {
  const a = unit.abilities.find((x) => x.id === BASIC_ATTACK_ID);
  if (!a) throw new Error(`${unit.id} has no ${BASIC_ATTACK_ID}`);
  return a;
}

function grid(width: number, height: number, heights: (x: number, y: number) => number = () => 0): BattleState {
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) tiles.push({ height: heights(x, y), passable: true });
  }
  return createBattleState({ seed: 1, grid: { width, height, tiles } });
}

/** Whether `attacker` may Attack a foe standing at `foe`, by the unit's own derived basic attack. */
function canAttack(state: BattleState, attacker: UnitState, foe: Position): boolean {
  const target = defaultUnit("foe", 1, { pos: foe });
  return inAbilityRange(state.grid, attacker.pos, target.pos, basicAttackOf(attacker).range);
}

describe("AC-011: a melee weapon keeps reach 1", () => {
  const state = grid(6, 2);
  const sword = wielder(SWORD, { x: 0, y: 0 });

  it("sword reaches x=1", () => {
    expect(canAttack(state, sword, { x: 1, y: 0 })).toBe(true);
  });
  it("sword does NOT reach x=2", () => {
    expect(canAttack(state, sword, { x: 2, y: 0 })).toBe(false);
  });
  it("sword reaches the diagonal (1,1) (Chebyshev)", () => {
    expect(canAttack(state, sword, { x: 1, y: 1 })).toBe(true);
  });
  it("fixture separates the models: the bow reaches x=2 where the sword cannot", () => {
    const bow = wielder(BOW, { x: 0, y: 0 });
    expect(canAttack(state, bow, { x: 2, y: 0 })).toBe(true);
    expect(canAttack(state, sword, { x: 2, y: 0 })).toBe(false);
  });

  it("every shipped weapon is the Long Bow at {4,3} or exactly {1,1}, and the sweep covers them all", () => {
    const raw = (packJson as { equipment?: Array<{ id: string; slot: string }> }).equipment ?? [];
    const packWeaponIds = raw.filter((e) => e.slot === "weapon").map((e) => e.id);
    const swept = [...registry.equipmentById.values()].filter((e) => e.slot === "weapon");

    // The proxy set (registry weapons) is the same size as the quantity asserted about
    // (the pack file's weapon items), so a new weapon cannot slip past the sweep.
    expect(swept.length).toBe(packWeaponIds.length);
    expect(new Set(swept.map((e) => e.id))).toEqual(new Set(packWeaponIds));
    expect(swept.length).toBeGreaterThanOrEqual(9); // the bow + the 8 melee weapons at ship time

    for (const item of swept) {
      if (!item.weapon) throw new Error(`weapon-slot item ${item.id} carries no weapon block`);
      if (item.id === BOW) {
        expect(item.weapon.range, item.id).toEqual({ h: 4, v: 3 });
      } else {
        expect(item.weapon.range, item.id).toEqual({ h: 1, v: 1 });
      }
      // And the unit holding it derives a basic attack of exactly that reach.
      const holder = wielder(item.id, { x: 0, y: 0 });
      expect(basicAttackOf(holder).range, item.id).toEqual(item.weapon.range);
    }
    expect(swept.some((e) => e.id === BOW)).toBe(true);
  });
});

describe("the shipped Long Bow item, in full", () => {
  it("wpn-long-bow carries exactly the authored weapon block and no weapon evasion", () => {
    const item = registry.equipment(BOW);
    expect(item.weapon).toEqual({ wp: 4, formula: "speedWp", element: "none", accuracy: 100, range: { h: 4, v: 3 } });
    expect(item.weaponEv).toBe(0);
  });

  it("a built unit's basic attack range is a COPY of the weapon's range, not the same object", () => {
    const archer = wielder(BOW, { x: 0, y: 0 });
    const range = basicAttackOf(archer).range;
    expect(range).toEqual(archer.weapon.range);
    expect(range).not.toBe(archer.weapon.range);
  });
});

describe("AC-012: the bow reaches exactly 1..4 within v 3", () => {
  const bowAt = (pos: Position): UnitState => wielder(BOW, pos);

  it("1x7 row: foes at x=1 and x=4 are in reach (no minimum range)", () => {
    const state = grid(7, 1);
    const archer = bowAt({ x: 0, y: 0 });
    expect(canAttack(state, archer, { x: 1, y: 0 })).toBe(true);
    expect(canAttack(state, archer, { x: 4, y: 0 })).toBe(true);
  });
  it("1x7 row: every distance 1..4 is in and 5 is out", () => {
    const state = grid(7, 1);
    const archer = bowAt({ x: 0, y: 0 });
    expect([1, 2, 3, 4, 5, 6].map((x) => canAttack(state, archer, { x, y: 0 }))).toEqual([
      true, true, true, true, false, false,
    ]);
  });
  it("1x7 row: a foe at x=5 is out", () => {
    const state = grid(7, 1);
    expect(canAttack(state, bowAt({ x: 0, y: 0 }), { x: 5, y: 0 })).toBe(false);
  });

  it("1x3 row: a foe at x=2 on height 3 is in", () => {
    const state = grid(3, 1, (x) => (x === 2 ? 3 : 0));
    expect(canAttack(state, bowAt({ x: 0, y: 0 }), { x: 2, y: 0 })).toBe(true);
  });
  it("1x3 row: a foe at x=2 on height 4 is out", () => {
    const state = grid(3, 1, (x) => (x === 2 ? 4 : 0));
    expect(canAttack(state, bowAt({ x: 0, y: 0 }), { x: 2, y: 0 })).toBe(false);
  });

  it("4x4 grid: a foe at (3,3) is in (Chebyshev, not Manhattan)", () => {
    const state = grid(4, 4);
    // Manhattan distance is 6, Chebyshev 3: only the Chebyshev reading passes.
    expect(canAttack(state, bowAt({ x: 0, y: 0 }), { x: 3, y: 3 })).toBe(true);
  });

  it("the sword cannot reach the bow's in-case at x=4 (the two weapons disagree)", () => {
    const state = grid(7, 1);
    expect(canAttack(state, wielder(SWORD, { x: 0, y: 0 }), { x: 4, y: 0 })).toBe(false);
  });
});

describe("AC-012: the shipped campaign really arms Briar with the bow", () => {
  it("pc-briar's record names the Long Bow (identity, not just some ranged weapon)", () => {
    const rec = briarRecord();
    expect(rec.weapon).toBe(BOW);
    // Resolve through the registry the way build.ts does, and read the item's id.
    expect(registry.equipment(rec.weapon as string).id).toBe(BOW);
  });

  it("exactly one party record wields the bow, and it is pc-briar", () => {
    const bearers = campaign.party.filter((r) => r.weapon === BOW).map((r) => r.id);
    expect(bearers).toEqual(["pc-briar"]);
  });

  it("built from the camp record as-is: Attack reaches {4,3}, Aimed Shot stays {5,3}", () => {
    const briar = buildBattleUnit(briarRecord(), registry, { pos: { x: 0, y: 0 } });
    expect(basicAttackOf(briar).range).toEqual({ h: 4, v: 3 });
    const aimed = briar.abilities.find((a) => a.id === "aim.aimed-shot");
    if (!aimed) throw new Error("Briar has no aim.aimed-shot");
    expect(aimed.range).toEqual({ h: 5, v: 3 });
    // Aimed Shot still out-reaches Attack at distance 5.
    const state = grid(7, 1);
    expect(inAbilityRange(state.grid, briar.pos, { x: 5, y: 0 }, aimed.range)).toBe(true);
    expect(canAttack(state, briar, { x: 5, y: 0 })).toBe(false);
  });

  it("the campaign's starting inventory holds the bow (so the prep dropdown offers it)", () => {
    expect(startCampaign(campaign).inventory).toContain(BOW);
  });
});
