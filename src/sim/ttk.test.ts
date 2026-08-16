/**
 * TIME-TO-KILL BAND (docs/07 §3, AC-P6) — the shipped build data must sit inside the
 * pacing spec's TTK band: "a squishy unit dies in ~1–2 committed actions; a tank in
 * ~3–4".
 *
 * WHY THIS FILE EXISTS. Before 2026-08-12 every shipped build died to ONE basic attack
 * (a 72-HP knight vs a 90-damage swing), squishy and tank alike. Fights lasted 2–4 turns
 * and were decided by turn order alone, which made range, positioning and signature
 * abilities invisible — and made the build-diversity gate unmeasurable (N had collapsed
 * to 1). Nothing in the suite caught it, because no test asserted the pacing spec. This
 * one does.
 *
 * THE REFERENCE COMMITTED ACTION is DERIVED, never hard-coded: the damage the sturdy
 * filler bruiser's own basic attack deals to a peer, at the default (shared) zodiac every
 * shipped build carries. Deriving it means the band moves with the combat constants
 * instead of silently going stale when `docs/01` changes — a hard-coded 90 would keep
 * passing after a formula change that invalidated it.
 *
 * DISCRIMINATING (CLAUDE.md, the evidence principle): the final case replays the
 * PRE-SLICE raw HP values through the same band check and asserts they FAIL it. Without
 * that, a future edit that widened the bands (or broke the derivation so every build read
 * as in-band) would leave this file green while proving nothing.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { deserializeRecord, type UnitRecord } from "./roster.js";
import { buildBattleUnit } from "./build.js";
import { attackDamage, abilityDamage } from "./resolve.js";

function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  return loadContentPack(JSON.parse(readFileSync(path, "utf8")) as unknown);
}
function loadShippedBuilds(): Record<string, UnitRecord> {
  const dir = fileURLToPath(new URL("../../data/builds", import.meta.url));
  const records: Record<string, UnitRecord> = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const rec = deserializeRecord(readFileSync(`${dir}/${file}`, "utf8"));
    records[rec.id] = rec;
  }
  return records;
}

const registry = loadShippedPack();
const records = loadShippedBuilds();

/**
 * The TTK classes. `squishy` and `tank` are docs/07 §3 verbatim; `mid` is the declared
 * interpolation for builds that are neither (skirmishers and hybrids), and `boss` is the
 * warlord chassis — a deliberate outlier the pacing spec does not cover, pinned here so
 * it cannot drift silently either.
 */
const BANDS = {
  squishy: { min: 1, max: 2 },
  mid: { min: 2, max: 3 },
  tank: { min: 3, max: 4 },
  boss: { min: 6, max: 9 },
} as const;

/** Every shipped build's declared TTK class. A new build MUST be added here (asserted). */
const BUILD_CLASS: Readonly<Record<string, keyof typeof BANDS>> = {
  "bld-filler-bruiser": "tank",
  "bld-aggro-tank": "tank",
  "bld-counter-wall": "tank",
  "bld-faithzero-monk": "tank",
  "bld-battle-cleric": "tank",
  "bld-spellblade": "mid",
  "bld-longshot": "mid",
  "bld-cutpurse": "mid",
  "bld-terrain-geo": "mid",
  "bld-glass-bruiser": "squishy",
  "bld-arcane-artillery": "squishy",
  "bld-glass-summoner": "squishy",
  "bld-hedge-caster": "squishy",
  "bld-reraise-cleric": "squishy",
  "bld-warlord": "boss",
};

/** Derived reference: what one committed physical action actually deals in this engine. */
function referenceActionDamage(): number {
  const attacker = buildBattleUnit(records["bld-filler-bruiser"]!, registry);
  const defender = buildBattleUnit(records["bld-filler-bruiser"]!, registry);
  return attackDamage(attacker, defender);
}

/** Committed actions needed to drop `record` under the reference action. */
function actionsToKill(record: UnitRecord, reference: number): number {
  return Math.ceil(buildBattleUnit(record, registry).maxHp / reference);
}

describe("AC-P6: the shipped build data sits inside the docs/07 TTK band", () => {
  const reference = referenceActionDamage();

  it("the reference committed action is a real, non-trivial swing", () => {
    // Guards the guard: if the derivation ever returned 0 (or something absurd), every
    // build would read as needing Infinity/1 actions and the band checks below would go
    // green or red for reasons that have nothing to do with the content.
    expect(reference).toBeGreaterThan(0);
    expect(reference).toBeLessThan(buildBattleUnit(records["bld-filler-bruiser"]!, registry).maxHp);
  });

  it("classifies every shipped build — no build silently escapes the band check", () => {
    expect(Object.keys(BUILD_CLASS).sort()).toEqual(Object.keys(records).sort());
  });

  for (const [buildId, cls] of Object.entries(BUILD_CLASS)) {
    it(`${buildId} dies in ${BANDS[cls].min}–${BANDS[cls].max} committed actions (${cls})`, () => {
      const actions = actionsToKill(records[buildId]!, reference);
      expect(actions, `${buildId} (${cls})`).toBeGreaterThanOrEqual(BANDS[cls].min);
      expect(actions, `${buildId} (${cls})`).toBeLessThanOrEqual(BANDS[cls].max);
    });
  }

  it("DISCRIMINATING: the PRE-SLICE HP values fail this same check", () => {
    // The raw.hp every build shipped with before 2026-08-12. Replayed through the exact
    // band check above, so this case can only pass if the check genuinely bites.
    const PRE_SLICE_RAW_HP: Readonly<Record<string, number>> = {
      "bld-aggro-tank": 60,
      "bld-arcane-artillery": 60,
      "bld-battle-cleric": 60,
      "bld-counter-wall": 60,
      "bld-faithzero-monk": 60,
      "bld-filler-bruiser": 60,
      "bld-glass-bruiser": 36,
      "bld-glass-summoner": 60,
      "bld-hedge-caster": 40,
      "bld-longshot": 60,
      "bld-reraise-cleric": 60,
      "bld-spellblade": 60,
      "bld-terrain-geo": 60,
      "bld-warlord": 110,
    };
    const oldRecord = (id: string): UnitRecord => ({
      ...records[id]!,
      raw: { ...records[id]!.raw, hp: PRE_SLICE_RAW_HP[id]! },
    });
    // The reference action is unchanged by the HP edit (it is PA × WP), so the old data is
    // measured against the SAME reference — the only thing that moves is HP.
    expect(attackDamage(buildBattleUnit(oldRecord("bld-filler-bruiser"), registry), buildBattleUnit(oldRecord("bld-filler-bruiser"), registry))).toBe(reference);

    const violations = Object.entries(BUILD_CLASS).filter(([id, cls]) => {
      const actions = actionsToKill(oldRecord(id), reference);
      return actions < BANDS[cls].min || actions > BANDS[cls].max;
    });
    // Every tank, mid and the boss died in ONE action; only the squishies were in band.
    expect(violations.map(([id]) => id).sort()).toEqual([
      "bld-aggro-tank",
      "bld-battle-cleric",
      "bld-counter-wall",
      "bld-faithzero-monk",
      "bld-filler-bruiser",
      "bld-longshot",
      "bld-spellblade",
      "bld-terrain-geo",
      "bld-warlord",
    ]);
    // Every violating NON-boss build died in exactly ONE action — tanks and skirmishers
    // alike, which is the specific defect this slice fixed. The boss took two.
    for (const [id, cls] of violations) {
      expect(actionsToKill(oldRecord(id), reference), `${id} pre-slice`).toBe(cls === "boss" ? 2 : 1);
    }
  });
});

describe("AC-P6 corollary: a showcase build's signature out-damages its own basic attack", () => {
  // The house rule in src/sim/CLAUDE.md ("keep a showcase build's signature action
  // un-dominated"). It was UNENFORCEABLE while every action one-shot every target — the
  // greedy probe's magnitude ranking could not distinguish them. Now that fights last
  // 3–4 actions, a signature that deals LESS than the build's own basic attack is simply
  // never chosen, and the build fights as the wrong job (the masking bug class).
  const cases: readonly [buildId: string, abilityId: string][] = [
    ["bld-terrain-geo", "geomancy.water-ball"],
    ["bld-longshot", "aim.aimed-shot"],
    ["bld-faithzero-monk", "punch-art.wave-fist"],
    ["bld-arcane-artillery", "black-magic.fire"],
    ["bld-reraise-cleric", "white-magic.holy"],
    ["bld-glass-summoner", "summon.shiva"],
    ["bld-hedge-caster", "geomancy.static-shock"],
  ];

  for (const [buildId, abilityId] of cases) {
    it(`${buildId}: ${abilityId} beats its own basic attack`, () => {
      const caster = buildBattleUnit(records[buildId]!, registry);
      const target = buildBattleUnit(records["bld-filler-bruiser"]!, registry);
      // Pulled off the BUILT unit, so this also asserts the build actually carries the
      // ability it claims as its signature.
      const ability = caster.abilities.find((a) => a.id === abilityId);
      expect(ability, `${buildId} does not carry ${abilityId}`).toBeDefined();
      const signature = abilityDamage(caster, target, ability!);
      const basic = attackDamage(caster, target);
      expect(signature, `${abilityId} vs own basic`).toBeGreaterThan(basic);
    });
  }

  it("KNOWN VIOLATION: bld-spellblade's borrowed black-magic is dominated by its knight swing", () => {
    // NOT relaxed into the list above — asserted POSITIVELY so the defect cannot be
    // forgotten and cannot be silently fixed without this test noticing. A knight's MA
    // (6) is too low for borrowed magic to compete with its own PA × WP swing, so
    // `bld-spellblade` fights as a knight and its declared `black-magic.` signature never
    // lands. Fixing it needs a build/chassis change, not a magnitude tweak, and buys the
    // diversity count NOTHING (its prefix collapses onto bld-arcane-artillery's). Flip
    // this to the list above when a spellblade chassis lands.
    const caster = buildBattleUnit(records["bld-spellblade"]!, registry);
    const target = buildBattleUnit(records["bld-filler-bruiser"]!, registry);
    const fire = caster.abilities.find((a) => a.id === "black-magic.fire");
    expect(fire, "bld-spellblade does not carry black-magic.fire").toBeDefined();
    const borrowed = abilityDamage(caster, target, fire!);
    expect(borrowed).toBeLessThan(attackDamage(caster, target));
  });
});
