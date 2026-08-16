/**
 * CHARM BEHAVIOUR — the afflicted unit fights for the inflicter (docs/01 §8, docs/05 §6).
 *
 * `status.charm` shipped in the catalog from P0 and `steal.heart` authored it, but until
 * this slice it was an INERT MARKER: nothing read allegiance from a status, so a charmed
 * unit kept attacking the side that charmed it. The tests below are the A/B that can come
 * out the other way — the SAME battle with and without the stamped status — because a
 * status the state merely CARRIES looks identical to one the sim honours.
 *
 * The three deliberate NON-effects (victory, traversal, scheduling) are asserted too:
 * an omission nobody can see is indistinguishable from a bug.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decideBalanceProbe } from "./ai.js";
import { advanceToDecision as advance, applyCommand, applyCommandDetailed, type Command } from "./driver.js";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { evalCondition } from "./condition.js";
import {
  createBattleState,
  defaultUnit,
  effectiveTeamOf,
  legacyActiveStatus,
  makeActiveStatus,
  deserialize,
  serialize,
  SCHEMA_VERSION,
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

/** The shipped Charm TEMPLATE (unstamped: `controlledByTeamId` is null until inflicted). */
const CHARM_TEMPLATE: ActiveStatus = makeActiveStatus(registry.status("status.charm"));
/** Charm as it looks once TEAM 0 has landed it — what `applyInflicts` stamps. */
const CHARMED_BY_0: ActiveStatus = { ...CHARM_TEMPLATE, controlledByTeamId: 0 };

describe("effectiveTeamOf — the single allegiance seam", () => {
  it("returns the CAPTOR's team only when the status both controls AND names one", () => {
    const u = (statuses: ActiveStatus[]): UnitState => defaultUnit("u", 1, { statuses });
    expect(effectiveTeamOf(u([]))).toBe(1); // no status → own team
    expect(effectiveTeamOf(u([CHARMED_BY_0]))).toBe(0); // charmed by team 0 → fights for 0
    // The two halves of the condition, each on its own. An UNSTAMPED template (the
    // shape build.ts projects onto an ability) must NOT flip allegiance, or every unit
    // carrying a charm-inflicting ability would be born a traitor…
    expect(effectiveTeamOf(u([CHARM_TEMPLATE]))).toBe(1);
    // …and a non-controlling status must not flip it however it is stamped.
    expect(effectiveTeamOf(u([{ ...legacyActiveStatus("slow"), controlledByTeamId: 0 }]))).toBe(1);
  });

  it("the shipped catalog is what makes charm control — and only charm", () => {
    // Ties the code to the DATA: `controlsTarget` is a catalog flag (ADR-0011), so this
    // asserts the pack actually sets it on charm and on nothing else. A code-only test
    // would pass even if the flag had never been authored.
    const controlling = [...registry.statusById.values()].filter((s) => s.controlsTarget === true);
    expect(controlling.map((s) => s.id)).toEqual(["status.charm"]);
  });
});

// ── the end-to-end A/B: does a charmed unit change sides? ────────────────────

/** Charmer (team 0) + its ally, vs two team-1 units. `charm` stamps the near foe. */
function scene(charm: boolean, firstMover = "thrall"): BattleState {
  // `applyCommand` applies to whoever the SCHEDULER surfaces next, so the unit under
  // test is seeded at full CT; every unit shares one Speed, making the seed decisive.
  const ct = (id: string): number => (id === firstMover ? 100 : 0);
  const hero = defaultUnit("hero", 0, { pos: { x: 0, y: 1 }, ct: ct("hero"), hp: 300, maxHp: 300, evasion: NO_EV });
  const ally = defaultUnit("ally", 0, { pos: { x: 0, y: 0 }, ct: ct("ally"), hp: 300, maxHp: 300, evasion: NO_EV });
  // The thrall stands BETWEEN them: `hero` and `victim` are equidistant, so distance
  // cannot decide its target — only allegiance can.
  const thrall = defaultUnit("thrall", 1, {
    pos: { x: 1, y: 1 },
    ct: ct("thrall"),
    hp: 300,
    maxHp: 300,
    evasion: NO_EV,
    statuses: charm ? [{ ...CHARMED_BY_0 }] : [],
  });
  const victim = defaultUnit("victim", 1, { pos: { x: 2, y: 1 }, ct: ct("victim"), hp: 300, maxHp: 300, evasion: NO_EV });
  return createBattleState({ seed: 7, grid: { width: 4, height: 3 }, units: [hero, ally, thrall, victim] });
}

describe("a charmed unit fights for its captor", () => {
  it("the probe turns the thrall on its OWN team — and does not without the charm", () => {
    // Identical boards; the ONLY difference is the stamped status. Both foes are one
    // tile away from the thrall, so this cannot be distance, HP or facing.
    const targetOf = (charm: boolean): unknown => {
      const cmd = decideBalanceProbe(scene(charm), "thrall");
      expect(cmd.kind).toBe("act");
      return cmd.kind === "act" ? cmd.target : null;
    };
    // (The probe may fold a flanking move into the same command — only WHO it swings at
    // is under test here. The free thrall picks between two team-0 bodies on the id
    // tie-break, so the assertion is the SIDE, which is the claim.)
    expect(targetOf(true)).toEqual({ unitId: "victim" }); // its own nominal teammate
    expect(targetOf(false)).toEqual({ unitId: "ally" }); // team 0, as any free enemy would
  });

  it("the blow RESOLVES: HP leaves its nominal teammate, credited to the thrall", () => {
    // Attribution is the load-bearing half. `hpDiffEvent` THROWS when a source lowers a
    // SAME-TEAM unit's HP (the friendly-fire tripwire), so charm would have crashed the
    // harness on the very first thrall turn had allegiance not been threaded into it.
    const before = scene(true);
    const cmd: Command = { kind: "act", abilityId: "basic.attack", target: { unitId: "victim" } };
    const { state: after, event } = applyCommandDetailed(before, cmd);
    const victim = after.units.find((u) => u.id === "victim")!;
    expect(victim.hp).toBeLessThan(300);
    expect(event?.sourceUnitId).toBe("thrall");
    expect(event?.damageDealt).toBe(300 - victim.hp); // credited as damage, not swallowed
    expect(event?.landed).toBe(true);
  });

  it("an AoE cast by the charmer SPARES the thrall and catches its old team", () => {
    // The other allegiance readers: the AoE friend/foe filters in resolve.ts / charge.ts.
    const blast: BattleAbility = {
      id: "black-magic.fire",
      actionKind: "action",
      formula: "magic",
      power: 20,
      element: "none",
      accuracy: 100,
      range: { h: 4, v: 4 },
      inflicts: [],
      speed: null,
      aoe: { h: 2, v: 2 },
    };
    const s = scene(true, "hero");
    const hero = s.units.find((u) => u.id === "hero")!;
    hero.abilities = [...hero.abilities, blast];
    // Box centred on the thrall's tile: it catches thrall AND victim by geometry, so
    // only the friend/foe filter can spare one of them.
    const after = applyCommand(s, { kind: "act", abilityId: "black-magic.fire", target: { x: 1, y: 1 } });
    expect(after.units.find((u) => u.id === "thrall")!.hp).toBe(300); // spared: an ally now
    expect(after.units.find((u) => u.id === "victim")!.hp).toBeLessThan(300);
  });
});

describe("charm and the objective", () => {
  it("charming the LAST defender ends the battle — the fix for a measured livelock", () => {
    // The first implementation counted a charmed body for its NOMINAL team, so a battle
    // could not end while it lived: nobody attacks an ally, and the charmer re-charms the
    // moment control lapses. Measured on the corridor map as a 580-tick TIMEOUT with 18
    // charms landed and one enemy standing. Victory now counts the team a unit FIGHTS
    // FOR (condition.ts), so control is a real win condition.
    const s = scene(true);
    s.units.find((u) => u.id === "victim")!.hp = 0; // team 1 is the charmed thrall alone
    expect(evalCondition(s, { kind: "eliminateTeams", teams: [1] })).toBe(true);
  });

  it("…and the SAME board without the charm does NOT end — the discriminating half", () => {
    // Identical to the case above but for the stamped status: a living, free enemy means
    // team 1 is not eliminated. Without this, a broken `eliminateTeams` that always
    // returned true would pass the test above.
    const s = scene(false);
    s.units.find((u) => u.id === "victim")!.hp = 0;
    expect(evalCondition(s, { kind: "eliminateTeams", teams: [1] })).toBe(false);
  });

  it("the rule is SYMMETRIC: a charmer whose last unit is charmed LOSES", () => {
    // Charm is a win condition for whoever lands it, not a team-0 privilege. Team 0's
    // hero and ally are the only units fighting for it; charm the ally to team 1 and
    // fell the hero, and team 0 is eliminated even though a team-0 body still stands.
    const s = scene(false);
    const ally = s.units.find((u) => u.id === "ally")!;
    ally.statuses = [{ ...CHARM_TEMPLATE, controlledByTeamId: 1 }];
    s.units.find((u) => u.id === "hero")!.hp = 0;
    expect(evalCondition(s, { kind: "eliminateTeams", teams: [0] })).toBe(true);
  });
});

describe("what charm deliberately does NOT change", () => {
  it("SCHEDULING is untouched: the thrall's turn comes up exactly as before", () => {
    // Allegiance is not a CT concept. Same seed, same speeds → the same actor order,
    // charmed or not, so a charm can never be a hidden tempo change.
    const order = (charm: boolean): string[] => {
      let s = scene(charm);
      const seen: string[] = [];
      for (let i = 0; i < 6; i++) {
        const dec = advance(s);
        seen.push(dec.unitId ?? "-");
        s = applyCommand(dec.state, { kind: "wait" });
      }
      return seen;
    };
    expect(order(true)).toEqual(order(false));
  });
});

describe("the v9 → v10 migration", () => {
  it("a v9 save loads with charm OFF — a migrated battle plays identically", () => {
    // Behaviour-preserving by construction: no v9 status could control anything, so the
    // migration must stamp `false`/`null`, never guess. Walks the real codec.
    const s = scene(false);
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw["schemaVersion"] = 9;
    for (const u of raw["units"] as Array<Record<string, unknown>>) {
      for (const st of u["statuses"] as Array<Record<string, unknown>>) {
        delete st["controlsTarget"];
        delete st["controlledByTeamId"];
      }
      for (const a of u["abilities"] as Array<Record<string, unknown>>) {
        for (const st of (a["inflicts"] ?? []) as Array<Record<string, unknown>>) {
          delete st["controlsTarget"];
          delete st["controlledByTeamId"];
        }
      }
    }
    const migrated = deserialize(JSON.stringify(raw));
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    for (const u of migrated.units) {
      expect(effectiveTeamOf(u)).toBe(u.teamId);
      for (const st of u.statuses) expect(st.controlsTarget).toBe(false);
    }
    expect(serialize(migrated)).toBe(serialize(s));
  });
});
