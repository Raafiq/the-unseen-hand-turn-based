/**
 * Campaign container + persistence tests (docs/11 AC-M2/AC-M3) — the PURE state
 * transitions and the save codec. The playthrough that actually fights the battles is
 * `campaign-run.test.ts`; splitting them keeps these assertions independent of the AI,
 * the content pack and the shipped encounter tuning.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_MIGRATIONS,
  CAMPAIGN_SCHEMA_VERSION,
  CampaignSchemaVersionError,
  applyBattleResult,
  currentBattle,
  deserializeCampaign,
  parseCampaign,
  retryBattle,
  serializeCampaign,
  startCampaign,
  updatePartyMember,
  type CampaignDef,
  type CampaignSave,
} from "./campaign.js";
import { BASE_AP_GRANT } from "./progression.js";
import { defaultUnitRecord, type UnitRecord } from "./roster.js";
import type { Outcome } from "./condition.js";

function shippedCampaignDef(): unknown {
  const path = fileURLToPath(new URL("../../data/campaign/camp-the-first-march.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

/** A minimal two-battle campaign — no content pack, no encounter data needed. */
function fixtureDef(over: Partial<CampaignDef> = {}): CampaignDef {
  const party: UnitRecord[] = [
    defaultUnitRecord("u-a", "knight"),
    defaultUnitRecord("u-b", "priest"),
  ];
  return {
    campaignSchemaVersion: CAMPAIGN_SCHEMA_VERSION,
    id: "camp-fixture",
    title: "Fixture",
    playerTeam: 0,
    party,
    cast: [defaultUnitRecord("foe-a", "knight")],
    battles: [
      { id: "b1", encounterId: "enc-1" },
      { id: "b2", encounterId: "enc-2" },
    ],
    ...over,
  } as CampaignDef;
}

const WIN = { outcome: "victory" as Outcome, rewards: {} };

describe("CampaignDef — the authored shape", () => {
  it("parses the shipped campaign", () => {
    const def = parseCampaign(shippedCampaignDef());
    expect(def.id).toBe("camp-the-first-march");
    expect(def.battles.length).toBeGreaterThanOrEqual(5);
    expect(def.party.length).toBeGreaterThan(0);
  });

  it("rejects a def whose campaignSchemaVersion is missing or unsupported", () => {
    const def = fixtureDef() as unknown as Record<string, unknown>;
    expect(() => parseCampaign({ ...def, campaignSchemaVersion: undefined })).toThrow(
      CampaignSchemaVersionError,
    );
    expect(() => parseCampaign({ ...def, campaignSchemaVersion: CAMPAIGN_SCHEMA_VERSION + 1 })).toThrow(
      CampaignSchemaVersionError,
    );
    expect(() => parseCampaign("not an object")).toThrow(CampaignSchemaVersionError);
  });

  it("rejects duplicate battle ids and duplicate record ids across party+cast", () => {
    const dupBattles = fixtureDef({
      battles: [
        { id: "b1", encounterId: "enc-1" },
        { id: "b1", encounterId: "enc-2" },
      ],
    });
    expect(() => parseCampaign(dupBattles)).toThrow();

    // A cast member reusing a party id would SHADOW the party record in the resolver
    // map and deploy the wrong unit — a content bug that reads as a balance problem.
    const dupRecords = fixtureDef({ cast: [defaultUnitRecord("u-a", "knight")] });
    expect(() => parseCampaign(dupRecords)).toThrow();
  });
});

describe("startCampaign / currentBattle", () => {
  it("a new game starts on battle 0, in progress, with the def's party", () => {
    const def = fixtureDef();
    const save = startCampaign(def);
    expect(save.battleIndex).toBe(0);
    expect(save.status).toBe("in-progress");
    expect(save.party).toEqual(def.party);
    expect(save.history).toEqual([]);
    expect(currentBattle(def, save)?.id).toBe("b1");
  });

  it("the save's party is a COPY — editing the def afterwards cannot reach a live save", () => {
    // A shared reference here would mean two campaigns from one def share progress.
    const def = fixtureDef();
    const save = startCampaign(def);
    def.party[0]!.ap = 9999;
    expect(save.party[0]!.ap).toBe(0);
  });
});

describe("applyBattleResult — AC-M1's step and AC-M3's loss branch", () => {
  it("a victory banks AP and advances; the last victory completes the campaign", () => {
    const def = fixtureDef();
    let save = startCampaign(def);
    save = applyBattleResult(def, save, {
      outcome: "victory",
      rewards: { "u-a": { participated: true, meaningfulActions: 0 } },
    });
    expect(save.status).toBe("in-progress");
    expect(save.battleIndex).toBe(1);
    expect(save.party.find((r) => r.id === "u-a")!.ap).toBe(BASE_AP_GRANT);
    // No entry ⇒ did not deploy ⇒ no grant. Absence and non-participation agree.
    expect(save.party.find((r) => r.id === "u-b")!.ap).toBe(0);
    expect(save.history).toEqual([{ battleId: "b1", outcome: "victory" }]);

    save = applyBattleResult(def, save, WIN);
    expect(save.status).toBe("completed");
    expect(save.battleIndex).toBe(2);
    expect(currentBattle(def, save)).toBeNull();
  });

  // The DISCRIMINATING part of AC-M3: every non-victory outcome is a loss, not just
  // `defeat`. A timeout or a stalemate that quietly advanced the campaign would look
  // identical from a per-battle test — the player would be marched past a battle they
  // did not win.
  for (const outcome of ["defeat", "draw", "stalemate", "timeout"] as const) {
    it(`a ${outcome} sets gameOver, leaves the index alone, and does not touch the party`, () => {
      const def = fixtureDef();
      const before = startCampaign(def);
      const after = applyBattleResult(def, before, {
        outcome,
        // Rewards are supplied and must be IGNORED — a loss banks nothing.
        rewards: { "u-a": { participated: true, meaningfulActions: 10 } },
      });
      expect(after.status).toBe("gameOver");
      expect(after.battleIndex).toBe(before.battleIndex);
      expect(after.party).toEqual(before.party);
      expect(after.history).toEqual([{ battleId: "b1", outcome }]);
    });
  }

  it("refuses to resolve a battle for a campaign that is not in progress", () => {
    const def = fixtureDef();
    const lost = applyBattleResult(def, startCampaign(def), { outcome: "defeat", rewards: {} });
    expect(() => applyBattleResult(def, lost, WIN)).toThrow(CampaignSchemaVersionError);
    expect(() => applyBattleResult(def, startCampaign(def), { outcome: "ongoing", rewards: {} })).toThrow(
      CampaignSchemaVersionError,
    );
  });
});

describe("retryBattle — AC-M3: retrying restores the pre-battle party exactly", () => {
  it("returns to the same battle with the same party, keeping the loss in history", () => {
    const def = fixtureDef();
    const before = startCampaign(def);
    const lost = applyBattleResult(def, before, { outcome: "defeat", rewards: {} });
    const retry = retryBattle(lost);

    expect(retry.status).toBe("in-progress");
    expect(retry.battleIndex).toBe(before.battleIndex);
    // Field-by-field, not by reference: a retry that handed back a DIFFERENT party
    // object with the same shape is fine; one that handed back different DATA is not.
    expect(retry.party).toEqual(before.party);
    // The attempt is not erased — a save that retried nine times must not read like one
    // that walked the battle.
    expect(retry.history).toEqual([{ battleId: "b1", outcome: "defeat" }]);
  });

  it("refuses to retry a campaign that is not in gameOver", () => {
    const def = fixtureDef();
    expect(() => retryBattle(startCampaign(def))).toThrow(CampaignSchemaVersionError);
  });
});

describe("updatePartyMember — the between-battle prep seam", () => {
  it("replaces one member and leaves the rest untouched", () => {
    const def = fixtureDef();
    const save = startCampaign(def);
    const edited: UnitRecord = { ...save.party[0]!, ap: 120, learned: ["white-magic.cure"] };
    const next = updatePartyMember(save, edited);
    expect(next.party[0]!.ap).toBe(120);
    expect(next.party[0]!.learned).toEqual(["white-magic.cure"]);
    expect(next.party[1]).toEqual(save.party[1]);
    expect(save.party[0]!.ap).toBe(0); // the input save is never mutated
  });

  it("throws on an id the party does not contain — a typo must not silently no-op", () => {
    const save = startCampaign(fixtureDef());
    expect(() => updatePartyMember(save, defaultUnitRecord("nobody", "knight"))).toThrow(
      CampaignSchemaVersionError,
    );
  });
});

describe("the campaign save codec — AC-M2", () => {
  it("round-trips byte-identically", () => {
    const def = fixtureDef();
    const save = applyBattleResult(def, startCampaign(def), {
      outcome: "victory",
      rewards: { "u-a": { participated: true, meaningfulActions: 3 } },
    });
    const json = serializeCampaign(save);
    const back = deserializeCampaign(json);
    expect(back).toEqual(save);
    // The stronger claim: re-serializing the reloaded save yields the SAME BYTES, so a
    // codec that dropped or re-ordered a field cannot hide behind a deep-equal.
    expect(serializeCampaign(back)).toBe(json);
  });

  it("fails LOUD on a missing, newer, or older-than-supported version", () => {
    const save = startCampaign(fixtureDef());
    const obj = JSON.parse(serializeCampaign(save)) as Record<string, unknown>;

    expect(() => deserializeCampaign(JSON.stringify({ ...obj, campaignSchemaVersion: undefined }))).toThrow(
      CampaignSchemaVersionError,
    );
    expect(() =>
      deserializeCampaign(JSON.stringify({ ...obj, campaignSchemaVersion: CAMPAIGN_SCHEMA_VERSION + 1 })),
    ).toThrow(CampaignSchemaVersionError);
    expect(() => deserializeCampaign(JSON.stringify({ ...obj, campaignSchemaVersion: 0 }))).toThrow(
      CampaignSchemaVersionError,
    );
    expect(() => deserializeCampaign(JSON.stringify([save]))).toThrow(CampaignSchemaVersionError);
  });

  it("refuses a partial load — a save missing a required field throws, never half-loads", () => {
    const save = startCampaign(fixtureDef());
    const obj = JSON.parse(serializeCampaign(save)) as Record<string, unknown>;
    delete obj["party"];
    // A persistence layer that half-loads looks exactly like one that works, right up
    // until the player notices their party is gone.
    expect(() => deserializeCampaign(JSON.stringify(obj))).toThrow();
  });

  it("DISCRIMINATING: a v3 save migrates to NO scenes seen, and keeps everything else", () => {
    // The pair that matters. Half one: a v3 save loads at all — without the migration
    // it is refused outright, so every existing player's campaign is gone.
    const current = startCampaign(fixtureDef());
    const v3 = JSON.parse(serializeCampaign(current)) as Record<string, unknown>;
    v3["campaignSchemaVersion"] = 3;
    delete v3["scenesSeen"];
    const migrated = deserializeCampaign(JSON.stringify(v3));
    expect(migrated.campaignSchemaVersion).toBe(CAMPAIGN_SCHEMA_VERSION);

    // Half two: EMPTY, not back-filled. A v3 save was played by a build with no scenes
    // at all, so every scene is genuinely unseen. A migration that marked the scenes
    // "up to battleIndex" as read would also load cleanly and would silently rob the
    // player of the prologue — passing half one on its own.
    expect(migrated.scenesSeen).toEqual([]);

    // And the migration changed NOTHING else. Without this, a migration that rebuilt the
    // save from defaults would satisfy both halves above while discarding the party.
    const withoutNewFields = (s: CampaignSave): Record<string, unknown> => {
      const copy = { ...s } as Record<string, unknown>;
      delete copy["scenesSeen"];
      delete copy["campaignSchemaVersion"];
      return copy;
    };
    expect(withoutNewFields(migrated)).toEqual(withoutNewFields(current));
  });

  it("has a migration registered for every version below the current one", () => {
    // The migration-per-bump pattern (roster.ts / state.ts): the day this file bumps to
    // v2 without registering 1→2, every existing save becomes unloadable. Asserted here
    // rather than discovered then.
    for (let v = 1; v < CAMPAIGN_SCHEMA_VERSION; v++) {
      expect(CAMPAIGN_MIGRATIONS[v], `no migration from v${v} to v${v + 1}`).toBeDefined();
    }
  });
});

describe("the save is the ONLY progress store", () => {
  it("carries no battle HP — which IS the between-battle heal and the no-permadeath cut", () => {
    // docs/11 M0 restores HP between battles and explicitly cuts permadeath. Both are
    // implemented by the ABSENCE of a current-HP field, so assert the absence: a later
    // slice that persisted HP here would silently reinstate attrition across the
    // campaign, and every per-battle test would stay green.
    const save: CampaignSave = startCampaign(fixtureDef());
    const stored = JSON.parse(serializeCampaign(save)) as { party: Record<string, unknown>[] };
    for (const member of stored.party) {
      expect(Object.keys(member)).not.toContain("hp");
      expect(Object.keys(member)).not.toContain("currentHp");
    }
  });
});
