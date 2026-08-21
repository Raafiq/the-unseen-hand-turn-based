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
  updatePartyMember,
  type CampaignDef,
} from "./campaign.js";
import { runCampaign, runCampaignBattle, type EncounterMap } from "./campaign-run.js";
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
