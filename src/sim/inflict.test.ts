/**
 * THE ON-HIT INFLICT PATH (docs/05 §2 step d).
 *
 * Specified since P0 and never wired: `BattleAbility.inflicts` carried status IDS,
 * and a resolver may not read the content catalog (ADR-0011), so it had a list of
 * names it could not turn into behaviour. Five shipped abilities across four
 * skillsets were inert because of that one gap, and `data/README.md` claimed one of
 * them ("`steal.heart`: charm *is* wired") was working.
 *
 * Every case below is an A/B on the BUILT object — the same battle twice, differing
 * only in the field under test — because equip-time validation of a status id looks
 * IDENTICAL whether or not anything applies it. That is the exact shape CLAUDE.md
 * names: a capability that validates its input and then discards it reads as working.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyCommand, type Command } from "./driver.js";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { toBattleAbility } from "./build.js";
import { resolveAbilityAoe } from "./resolve.js";
import {
  createBattleState,
  defaultUnit,
  legacyActiveStatus,
  makeActiveStatus,
  type ActiveStatus,
  type BattleState,
  type UnitState,
} from "./state.js";
import type { BattleAbility } from "./ability.js";

function shippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  return loadContentPack(JSON.parse(readFileSync(path, "utf8")) as unknown);
}
const registry = shippedPack();

const NO_EV = { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 };
const SLOW: ActiveStatus = makeActiveStatus(registry.status("status.slow"));

/** An instant melee physical skill, optionally carrying on-hit statuses. */
function skill(inflicts: ActiveStatus[], power = 4, accuracy = 100): BattleAbility {
  return {
    id: "skill.jab",
    actionKind: "action",
    formula: "physical",
    power,
    element: "none",
    accuracy,
    range: { h: 1, v: 1 },
    inflicts,
    speed: null,
    aoe: null,
  };
}

const JAB: Command = { kind: "act", abilityId: "skill.jab", target: { unitId: "foe" } };

/**
 * Hero adjacent to a stopped, high-HP foe. Zero evasion + accuracy 100 so the blow
 * ALWAYS lands — otherwise a miss would look identical to a status that never fires.
 */
function scene(
  inflicts: ActiveStatus[],
  over: Partial<UnitState> = {},
  power = 4,
  accuracy = 100,
): BattleState {
  const base = defaultUnit("hero", 0, { pos: { x: 1, y: 1 }, speed: 10, evasion: NO_EV });
  const hero: UnitState = { ...base, abilities: [...base.abilities, skill(inflicts, power, accuracy)] };
  const foe = defaultUnit("foe", 1, {
    pos: { x: 2, y: 1 },
    statuses: [legacyActiveStatus("stop")],
    hp: 900,
    maxHp: 900,
    evasion: NO_EV,
    ...over,
  });
  return createBattleState({ seed: 99, grid: { width: 5, height: 5 }, units: [hero, foe] });
}
const foeOf = (s: BattleState): UnitState => s.units.find((u) => u.id === "foe")!;

describe("on-hit inflict — the A/B that could come out the other way", () => {
  it("a landed hit APPLIES the ability's status; the same hit without it does not", () => {
    const withStatus = foeOf(applyCommand(scene([SLOW]), JAB));
    const without = foeOf(applyCommand(scene([]), JAB));
    // The ONLY difference between the two battles is `inflicts`.
    expect(withStatus.statuses.map((s) => s.id)).toContain("status.slow");
    expect(without.statuses.map((s) => s.id)).not.toContain("status.slow");
    // …and the blow itself is identical, so the status is the only thing that moved.
    expect(withStatus.hp).toBe(without.hp);
  });

  it("applies the RESOLVED template — behaviour, not just a name", () => {
    const foe = foeOf(applyCommand(scene([SLOW]), JAB));
    const slow = foe.statuses.find((s) => s.id === "status.slow")!;
    // A bare id on the unit would carry none of this, and the scheduler reads
    // `ctFactor` — so this is what makes the status actually slow anything.
    expect(slow.ctFactor).toBe(registry.status("status.slow").ctFactor);
    expect(slow.ctFactor).toBeLessThan(1);
    expect(slow.remainingCT).toBe(registry.status("status.slow").durationCT);
    expect(slow.remainingCT).toBeGreaterThan(0);
  });

  it("consumes NO extra rng draw — the declared roll order is unchanged", () => {
    // The load-bearing determinism claim: wiring this path must not shift the cursor,
    // which is why infliction is unconditional on a hit rather than its own roll.
    const withStatus = applyCommand(scene([SLOW]), JAB);
    const without = applyCommand(scene([]), JAB);
    expect(withStatus.rngCounter).toBe(without.rngCounter);
    expect(withStatus.tick).toBe(without.tick);
  });

  it("does NOT apply on a miss", () => {
    // Same ability at accuracy 0, so the hit roll fails. Without this case, "applied
    // on hit" could really be "applied whenever the command is issued".
    //
    // ACCURACY, NOT EVASION, is the dial: the first attempt here used `classEv: 100`
    // and the blow landed anyway, because the hero stands in the foe's SIDE arc and
    // `hitChance` drops class evasion outside the front arc (docs/01 §5c). Evasion is
    // facing-dependent; accuracy is not, so this fixture cannot be quietly defeated by
    // a unit's facing.
    const after = applyCommand(scene([SLOW], {}, 4, 0), JAB);
    const foe = foeOf(after);
    expect(foe.hp).toBe(900); // the blow missed…
    expect(foe.statuses.map((s) => s.id)).not.toContain("status.slow"); // …so no status
    // Non-vacuity: the SAME fixture at accuracy 100 lands and does inflict, so the
    // assertion above is about the miss and not about a fixture that never fires.
    const landed = foeOf(applyCommand(scene([SLOW], {}, 4, 100), JAB));
    expect(landed.hp).toBeLessThan(900);
    expect(landed.statuses.map((s) => s.id)).toContain("status.slow");
  });

  it("does NOT apply to a target the blow KILLED", () => {
    // A KO'd unit is counting down to crystallization (docs/01 §11); hanging a debuff
    // on it would be state the UI cannot honestly show.
    const after = applyCommand(scene([SLOW], { hp: 5, maxHp: 5 }), JAB);
    const foe = foeOf(after);
    expect(foe.hp).toBe(0);
    expect(foe.crystalTimer).toBeGreaterThan(0);
    expect(foe.statuses.map((s) => s.id)).not.toContain("status.slow");
  });

  it("REFRESHES rather than stacking a second copy of the same status", () => {
    // Two hits, one status. A duplicate would let two Slows compound the CT factor and
    // leave a stale copy behind when the first expires.
    const once = applyCommand(scene([SLOW]), JAB);
    const twice = applyCommand(once, JAB);
    const slows = foeOf(twice).statuses.filter((s) => s.id === "status.slow");
    expect(slows).toHaveLength(1);
    expect(slows[0]!.remainingCT).toBe(SLOW.remainingCT); // refreshed to full
    // Non-vacuity: the second hit really did land, so this is a refresh and not a
    // second command that quietly did nothing.
    expect(foeOf(twice).hp).toBeLessThan(foeOf(once).hp);
  });

  it("an AREA ability inflicts on every unit the box LANDED on", () => {
    const area: BattleAbility = { ...skill([SLOW]), id: "skill.burst", aoe: { h: 1, v: 1 } };
    const base = defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, speed: 10, evasion: NO_EV });
    const hero: UnitState = { ...base, abilities: [...base.abilities, area] };
    const mk = (id: string, x: number, y: number): UnitState =>
      defaultUnit(id, 1, {
        pos: { x, y },
        statuses: [legacyActiveStatus("stop")],
        hp: 900,
        maxHp: 900,
        evasion: NO_EV,
      });
    const s = createBattleState({
      seed: 7,
      grid: { width: 6, height: 6 },
      units: [hero, mk("a", 2, 2), mk("b", 2, 3)],
    });
    const after = resolveAbilityAoe(s, "hero", { x: 2, y: 2 }, "skill.burst").state;
    for (const id of ["a", "b"]) {
      const u = after.units.find((x) => x.id === id)!;
      expect(u.hp, `${id} was hit`).toBeLessThan(900);
      expect(u.statuses.map((st) => st.id), `${id} was slowed`).toContain("status.slow");
    }
  });
});

describe("build-time projection — ids become resolved templates once, at the seam", () => {
  it("the shipped aim.head-shot projects a RESOLVED Stop, not a bare id", () => {
    const projected = toBattleAbility(registry.ability("aim.head-shot"), undefined, (id) =>
      registry.status(id),
    );
    expect(projected.inflicts).toHaveLength(1);
    const stop = projected.inflicts[0]!;
    expect(stop.id).toBe("status.stop");
    // The behaviour discriminants the resolvers and scheduler actually read. A bare
    // id carried none of these, which is precisely why this path stayed deferred.
    expect(stop.preventsAction).toBe(true);
    expect(stop.ctFactor).toBe(0);
    expect(stop.remainingCT).toBeGreaterThan(0);
  });

  it("every shipped ability that authors `inflicts` projects the same number of them", () => {
    // Guards against the projection silently dropping one — the failure mode this
    // whole slice is about. Derived from the pack, so a newly authored inflicting
    // ability is covered without editing this test.
    const authored = [...registry.abilityById.values()].filter((a) => (a.inflicts ?? []).length > 0);
    expect(authored.length).toBeGreaterThan(0); // non-vacuity: the pack really has some
    for (const a of authored) {
      const projected = toBattleAbility(a, undefined, (id) => registry.status(id));
      expect(projected.inflicts.map((s) => s.id), a.id).toEqual(a.inflicts);
    }
  });
});
