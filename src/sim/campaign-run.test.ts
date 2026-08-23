/**
 * Campaign playthrough tests (docs/11 AC-M1/AC-M2/AC-M3) — the shipped campaign, driven
 * end to end with the balance probe on both seats.
 *
 * AC-M1's discriminator is that "a campaign that can start but cannot reach an ending
 * passes any per-battle test", so the assertions here are over the WHOLE sequence, and
 * they name the specific ending (`completed`) rather than a set of acceptable ones. The
 * lesson those two choices come from is `benchmark-suite.test.ts`: asserting an outcome
 * SET (`{victory, defeat, draw}`) read as "the battle works" while every shipped
 * encounter was in fact losing.
 *
 * Test-layer IO (reads the JSON); the sim loader itself stays pure.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { buildBattleUnit } from "./build.js";
import {
  currentBattle,
  deserializeCampaign,
  parseCampaign,
  retryBattle,
  serializeCampaign,
  startCampaign,
  setDeployment,
  updatePartyMember,
  type CampaignDef,
} from "./campaign.js";
import { runCampaign, runCampaignBattle, loadCampaignBattle, deployableSlots, type EncounterMap } from "./campaign-run.js";
import { loadContentPack, type ContentRegistry } from "./content.js";

function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  return loadContentPack(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

function loadShippedCampaign(): CampaignDef {
  const path = fileURLToPath(new URL("../../data/campaign/camp-the-first-march.json", import.meta.url));
  return parseCampaign(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

function loadCampaignEncounters(): EncounterMap {
  const dir = fileURLToPath(new URL("../../data/campaign/encounters", import.meta.url));
  const map: Record<string, unknown> = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    map[file.replace(/\.json$/, "")] = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
  }
  return map;
}

const registry = loadShippedPack();
const def = loadShippedCampaign();
const encounters = loadCampaignEncounters();
const resolver = { registry };

describe("AC-M1: the M0 campaign is finishable, headlessly, start to ending", () => {
  const run = runCampaign(def, encounters, resolver);

  it("reaches `completed` — the specific ending, not merely 'an ending'", () => {
    expect(run.save.status).toBe("completed");
    expect(run.save.battleIndex).toBe(def.battles.length);
    expect(currentBattle(def, run.save)).toBeNull();
  });

  it("fights every authored battle exactly once, and wins each", () => {
    // `runCampaign` never retries, so one entry per battle IS the claim that no battle
    // was lost — and naming the ids catches a def whose sequence silently changed.
    expect(run.battles.map((b) => b.battleId)).toEqual(def.battles.map((b) => b.id));
    expect(run.battles.map((b) => b.report.outcome)).toEqual(def.battles.map(() => "victory"));
  });

  it("every battle resolves by its OBJECTIVE, never by the halting caps", () => {
    // A `timeout` is a loss (campaign.ts) so the run above would already have failed —
    // but this says WHY the sequence is sound: each fight actually ends.
    for (const b of run.battles) {
      expect(b.report.turns, b.battleId).toBeGreaterThan(0);
      expect(b.report.outcome, b.battleId).not.toBe("timeout");
      expect(b.report.outcome, b.battleId).not.toBe("stalemate");
    }
  });

  it("the difficulty ramps — each battle is longer than the one before it", () => {
    // The M0 point of a 5-battle sequence is a RAMP, not five copies of one fight. A
    // sequence that flattened (or inverted) would still complete, so nothing else here
    // would notice.
    const turns = run.battles.map((b) => b.report.turns);
    for (let i = 1; i < turns.length; i++) {
      expect(turns[i], `battle ${i + 1} vs ${i}`).toBeGreaterThan(turns[i - 1]!);
    }
  });

  it("is deterministic — a second playthrough is save- and report-identical", () => {
    const again = runCampaign(def, encounters, resolver);
    expect(serializeCampaign(again.save)).toBe(serializeCampaign(run.save));
    expect(again.battles.map((b) => b.report)).toEqual(run.battles.map((b) => b.report));
  });
});

describe("AC-M2: progress survives every battle boundary and a save/load cycle", () => {
  it("banked AP accumulates across the sequence and lands in the save", () => {
    const run = runCampaign(def, encounters, resolver);
    for (const member of run.save.party) {
      expect(member.ap, member.id).toBeGreaterThan(0);
    }
    // Every party member's AP must exceed a single battle's grant, or "carried across"
    // would be indistinguishable from "granted once at the end".
    const deployedEveryBattle = run.save.party.find((m) => m.id === "pc-vance")!;
    expect(deployedEveryBattle.ap).toBeGreaterThan(run.battles.length);
  });

  it("the final save round-trips byte-identically", () => {
    const run = runCampaign(def, encounters, resolver);
    const json = serializeCampaign(run.save);
    expect(serializeCampaign(deserializeCampaign(json))).toBe(json);
  });

  it("an interrupted campaign RESUMES from its save to the same ending", () => {
    // AC-M2's real claim: the save is sufficient. Play two battles, write it out, read
    // it back, and finish — the result must be identical to never having stopped.
    const partial = runCampaign(def, encounters, resolver, { maxBattles: 2 });
    expect(partial.save.status).toBe("in-progress");
    expect(partial.save.battleIndex).toBe(2);

    const reloaded = deserializeCampaign(serializeCampaign(partial.save));
    const resumed = runCampaign(def, encounters, resolver, { startFrom: reloaded });

    const straight = runCampaign(def, encounters, resolver);
    expect(serializeCampaign(resumed.save)).toBe(serializeCampaign(straight.save));
    expect(resumed.battles.map((b) => b.battleId)).toEqual(["b3", "b4", "b5"]);
  });

  it("DISCRIMINATING: the battle is fought with the SAVE's party, not the def's", () => {
    // The whole persistence mechanism is that the runner injects the SAVE's records as
    // the encounter's `ref` sources. Feed it the def's party instead and every battle
    // silently restarts from scratch while every assertion above stays green — so the
    // check that can come out the other way is an A/B on the BUILT battle: grant a
    // party member an ability through the save, and watch it appear in what was cast.
    const base = startCampaign(def);
    const kest = base.party.find((r) => r.id === "pc-kest")!;
    const granted = updatePartyMember(base, {
      ...kest,
      learned: [...kest.learned, "punch-art.earth-slash"],
    });

    const without = runCampaignBattle(def, base, encounters, resolver).battle.report.abilityUsage;
    const with_ = runCampaignBattle(def, granted, encounters, resolver).battle.report.abilityUsage;

    expect(without["punch-art.earth-slash"]).toBeUndefined();
    expect(with_["punch-art.earth-slash"]).toBeGreaterThan(0);
  });
});

describe("AC-M3: losing is a state, and retrying restores the pre-battle party", () => {
  // Forced with a one-turn cap rather than by weakening the content: the loss branch
  // must be provable without making a shipped battle unwinnable.
  const before = runCampaign(def, encounters, resolver, { maxBattles: 2 }).save;

  it("a lost battle reaches gameOver without advancing or spending anything", () => {
    const lost = runCampaignBattle(def, before, encounters, resolver, { maxTurns: 1 }).save;
    expect(lost.status).toBe("gameOver");
    expect(lost.battleIndex).toBe(before.battleIndex);
    expect(lost.party).toEqual(before.party);
  });

  it("retry replays the SAME battle from the SAME party and can then be won", () => {
    const lost = runCampaignBattle(def, before, encounters, resolver, { maxTurns: 1 }).save;
    const retry = retryBattle(lost);
    expect(retry.party).toEqual(before.party);
    expect(currentBattle(def, retry)?.id).toBe(currentBattle(def, before)?.id);

    const won = runCampaignBattle(def, retry, encounters, resolver).battle;
    expect(won.report.outcome).toBe("victory");
    // The retried battle is byte-identical to the same battle played first time — the
    // encounter's own seed drives it, so a retry is a genuine second attempt at the SAME
    // fight, not a re-roll.
    const firstTry = runCampaignBattle(def, before, encounters, resolver).battle;
    expect(won.report).toEqual(firstTry.report);
  });
});

describe("the party between battles — HP restored, nobody lost", () => {
  const run = runCampaign(def, encounters, resolver);

  it("the campaign actually KILLS party members, so the no-permadeath rule is exercised", () => {
    // Without this the two assertions below are vacuous: a campaign nobody ever died in
    // proves nothing about how the dead are handled.
    const lost = run.battles.some((b) => (b.report.teams.find((t) => t.teamId === def.playerTeam)?.survivors ?? 0) < 4);
    expect(lost).toBe(true);
  });

  it("every member survives to the ending and redeploys at full HP", () => {
    expect(run.save.party.map((r) => r.id)).toEqual(def.party.map((r) => r.id));
    for (const member of run.save.party) {
      const unit = buildBattleUnit(member, registry);
      expect(unit.hp, member.id).toBe(unit.maxHp);
      // Raw HP is untouched by a campaign — attrition would mean it was persisted.
      const started = def.party.find((r) => r.id === member.id)!;
      expect(member.raw, member.id).toEqual(started.raw);
    }
  });
});

describe("the AP grant is not a damage proxy", () => {
  it("a healer that dealt ZERO damage still earns AP for the battle", () => {
    // A damage-derived grant would hand the party's only healer nothing, every battle,
    // while the campaign kept reading as if progression worked. The reward reads LANDED
    // ACTIONS, so the discriminating fixture is a unit with damageDealt === 0.
    const run = runCampaign(def, encounters, resolver);
    const healerBattles = run.battles.filter((b) => {
      const c = Object.entries(b.report.contributionByUnit).find(([id]) => id === "blue-ottoline")?.[1];
      return c !== undefined && c.damageDealt === 0 && c.healingDone > 0;
    });
    expect(healerBattles.length, "no battle where the healer only healed").toBeGreaterThan(0);
    for (const b of healerBattles) {
      expect(b.rewards["pc-ottoline"]!.participated).toBe(true);
      expect(b.rewards["pc-ottoline"]!.meaningfulActions, b.battleId).toBeGreaterThan(0);
    }
  });
});

describe("the player chooses WHO deploys, never how many (playtest, 2026-08-22)", () => {
  it("DISCRIMINATING: a chosen roster reaches the BATTLE STATE, not just the save", () => {
    // Both the played shell and the headless runner call `loadCampaignBattle`, so an
    // A/B between them would prove only that they agree — CLAUDE.md's rule. This
    // reaches THROUGH the shared helper to an observable end: the units standing on
    // the board are the ones chosen, and the ones not chosen are absent.
    const save = startCampaign(def);
    const loadedDefault = loadCampaignBattle(def, save, encounters, resolver);
    const slots = deployableSlots(loadedDefault.encounter, def.playerTeam);
    expect(slots.length).toBe(2); // battle one really is a two-slot fight

    // NOT unit ids: `loadEncounter` names a battle unit after its SLOT (`blue-kest`),
    // not after the record standing in it — deliberately, so `deriveRewards` can map
    // back through the placements. Asserting ids would have compared two identical
    // lists and passed whether or not the swap did anything. The COMMAND LIST is the
    // observable: a Monk brings Wave Fist, a Priest brings Cure.
    const onField = (s: typeof loadedDefault) =>
      s.state.units
        .filter((u) => u.teamId === def.playerTeam)
        .flatMap((u) => u.abilities.map((a) => a.id))
        .sort();
    // Battle one authors Vance + Kest; swap Kest for Ottoline, who never deploys early.
    const swapped = setDeployment(save, ["pc-vance", "pc-ottoline"]);
    const loadedSwapped = loadCampaignBattle(def, swapped, encounters, resolver);

    // The COUNT is unchanged — the ramp is the encounter's, not the player's.
    expect(
      loadedSwapped.state.units.filter((u) => u.teamId === def.playerTeam).length,
    ).toBe(slots.length);
    expect(onField(loadedDefault)).toContain("punch-art.wave-fist"); // Kest deployed
    expect(onField(loadedSwapped)).toContain("white-magic.cure"); // Ottoline did
    expect(onField(loadedSwapped)).not.toEqual(onField(loadedDefault));

    // And the SLOT keeps its authored name-mapping target, which is what the board
    // labels read: the placement now points at Ottoline, so the field says Ottoline.
    const refs = loadedSwapped.encounter.placements
      .filter((p) => p.teamId === def.playerTeam)
      .map((p) => (p.unit.kind === "ref" ? p.unit.recordId : ""));
    expect(refs).toEqual(["pc-vance", "pc-ottoline"]);
  });

  it("the substituted member keeps the slot's POSITION and earns its AP", () => {
    // Substituting the record rather than the placement is what keeps `deriveRewards`
    // working: it maps battle-unit ids back through the same placements. If a swap had
    // moved the placement instead, the newcomer would fight from nowhere and be paid
    // nothing.
    const save = setDeployment(startCampaign(def), ["pc-ottoline", "pc-briar"]);
    const authored = loadCampaignBattle(def, startCampaign(def), encounters, resolver);
    const swapped = loadCampaignBattle(def, save, encounters, resolver);
    const posOf = (s: typeof authored) =>
      s.state.units.filter((u) => u.teamId === def.playerTeam).map((u) => `${u.pos.x},${u.pos.y}`);
    expect(posOf(swapped)).toEqual(posOf(authored));

    const step = runCampaignBattle(def, save, encounters, resolver);
    const paid = Object.entries(step.battle.report.contributionByUnit).length;
    expect(paid).toBeGreaterThan(0);
    // Ottoline deployed, so she can now bank AP in battle one — which she never could.
    expect(step.save.party.find((r) => r.id === "pc-ottoline")!.ap).toBeGreaterThan(0);
  });

  it("refuses a roster that is the wrong size, rather than truncating it", () => {
    const save = startCampaign(def);
    const three = setDeployment(save, ["pc-vance", "pc-kest", "pc-briar"]);
    expect(() => loadCampaignBattle(def, three, encounters, resolver)).toThrow(/2 slots/);
  });

  it("refuses a duplicate and a non-member at the save layer", () => {
    const save = startCampaign(def);
    expect(() => setDeployment(save, ["pc-vance", "pc-vance"])).toThrow(/twice/);
    expect(() => setDeployment(save, ["pc-vance", "foe-brigand"])).toThrow(/not in the party/);
  });

  it("an empty choice means the ENCOUNTER's roster, not an empty field", () => {
    // The default is authored, never guessed here — and `[]` is what every migrated v2
    // save carries, so this is also the assertion that they still play identically.
    const save = startCampaign(def);
    expect(save.deployment).toEqual([]);
    const loaded = loadCampaignBattle(def, save, encounters, resolver);
    expect(loaded.state.units.filter((u) => u.teamId === def.playerTeam).length).toBe(2);
  });

  it("advancing a battle CLEARS the choice", () => {
    // Battle three has two more slots than battle one; a roster carried forward would
    // be the wrong size and throw at the next load.
    const save = setDeployment(startCampaign(def), ["pc-vance", "pc-ottoline"]);
    const after = runCampaignBattle(def, save, encounters, resolver).save;
    expect(after.deployment).toEqual([]);
  });
});

describe("every starting party member can actually build (playtest, 2026-08-23)", () => {
  it("DISCRIMINATING: each member starts with a LIVE command, not just a command", () => {
    // Vance shipped as a Knight, whose whole tree is `battle-skill` — excluded by user
    // decision (2026-08-16) — with `learned: []`. He therefore had `basic.attack` and
    // nothing else, all campaign long, while the other three each started with a real
    // ability. Counting commands would not catch that: he HAD one. The check has to be
    // that the command RESOLVES something.
    for (const rec of def.party) {
      const u = buildBattleUnit(rec, registry);
      const live = u.abilities.filter(
        (a) => a.id !== "basic.attack" && a.formula !== "none",
      );
      expect(live.length, `${rec.name} starts with no live ability of their own`).toBeGreaterThan(0);
    }
  });

  it("DISCRIMINATING: no member's own job tree is mostly dead", () => {
    // The deeper failure, and the one that made Vance's seat unplayable: he could bank
    // 208 AP and have nothing worth buying. A "has a live ability" check passes on a
    // member whose ENTIRE remaining tree is inert, so the tree is measured too.
    //
    // The bar is HALF, set from the measured spread rather than from a round number I
    // liked: Geomancer 7/9, Monk 7/8, Archer 7/9, Priest **5/9** — Ottoline is the
    // weakest and is left as-is, because five live nodes is a real progression (Cure →
    // Cura → Holy, plus a support) and her four dead ones are all deferred capstones.
    // Vance's Knight tree scored **2 of 9**, which is what this catches.
    //
    // Guessing 2/3 here would have been calibrating to the number I wanted rather than
    // to the content: it failed on Ottoline, who is fine.
    for (const rec of def.party) {
      const tree = registry.job(rec.currentJob).tree;
      const live = tree.filter((n) => {
        const a = registry.ability(n.ability);
        if (a.type === "action") return a.formula !== undefined && a.formula !== "none";
        return (
          a.supportEffect !== undefined ||
          a.reactionEffect !== undefined ||
          a.movementEffect !== undefined
        );
      });
      expect(
        live.length / tree.length,
        `${rec.name}'s ${rec.currentJob} tree is ${live.length}/${tree.length} live`,
      ).toBeGreaterThan(0.5);
    }
  });

  it("the party's four jobs are all different, so the roster shows four ways to play", () => {
    const jobs = def.party.map((r) => r.currentJob);
    expect(new Set(jobs).size).toBe(jobs.length);
  });
});
