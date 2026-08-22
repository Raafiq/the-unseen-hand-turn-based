/**
 * The game shell (docs/11 M0 item 1, AC-M1/AC-M2/AC-M3) — driven headlessly, title
 * screen to ending, through the SAME object the browser page drives.
 *
 * AC-M1's discriminator is that "a campaign that can start but cannot reach an ending
 * passes any per-battle test". `campaign-run.test.ts` already asserts that for the
 * headless runner; this file asserts it for the path a PERSON takes — New Game, deploy,
 * fight, bank, next — because those are different code and only one of them was covered.
 *
 * Test-layer IO (reads the bundled data through `campaign-data.ts`); the shell itself
 * only ever touches the injected {@link SaveSlot}.
 */

import { describe, expect, it } from "vitest";
import {
  deserializeCampaign,
  runCampaignBattle,
  serializeCampaign,
  startCampaign,
  updatePartyMember,
  type CampaignSave,
} from "../sim/index.js";
import { ENCOUNTERS, campaign, registry } from "./campaign-data.js";
import { CampaignShell } from "./campaign-shell.js";
import { memorySlot, readSave, writeSave, type SaveSlot } from "./storage.js";

function shell(slot: SaveSlot = memorySlot()): CampaignShell {
  return new CampaignShell({ def: campaign, encounters: ENCOUNTERS, registry, slot });
}

/** Play the live battle out with the balance probe on both seats. */
function autoplay(s: CampaignShell): void {
  const session = s.session;
  if (!session) throw new Error("autoplay: no battle in progress");
  let guard = 0;
  while (session.phase !== "ENDED") {
    session.step();
    if (++guard > 600) throw new Error("autoplay: the battle never ended");
  }
}

/** Play the live battle by WAITING every player turn — a genuine player-driven loss. */
function forfeit(s: CampaignShell): void {
  const session = s.session;
  if (!session) throw new Error("forfeit: no battle in progress");
  let guard = 0;
  while (session.phase !== "ENDED") {
    if (session.phase === "PLAYER_IDLE" || session.phase === "MOVE_STAGED") session.endTurn();
    else session.step();
    if (++guard > 600) throw new Error("forfeit: the battle never ended");
  }
}

describe("the bundled campaign data covers exactly the battles the campaign names", () => {
  it("every battle resolves, and every bundled encounter is used", () => {
    // The subset-reads-as-the-set failure, applied to a hand-written import list: a
    // battle whose file was never imported would shorten the campaign silently, and a
    // stale import would sit there looking like content. Assert BOTH directions.
    const named = campaign.battles.map((b) => b.encounterId).sort();
    const bundled = Object.keys(ENCOUNTERS).sort();
    expect(bundled).toEqual(named);
    expect(named.length).toBe(5);
  });
});

describe("AC-M1: the campaign is driveable from the title screen to an ending", () => {
  it("New Game → five battles → COMPLETED, through the player's own path", () => {
    const s = shell();
    expect(s.screen).toBe("TITLE");
    expect(s.canContinue()).toBe(false);

    s.newGame();
    const played: string[] = [];
    let guard = 0;
    while (s.screen !== "COMPLETED") {
      expect(s.screen).toBe("BRIEFING");
      const brief = s.briefing();
      expect(brief).not.toBeNull();
      played.push(brief!.battleId);
      s.deploy();
      expect(s.screen).toBe("BATTLE");
      autoplay(s);
      expect(s.battleOver()).toBe(true);
      s.concludeBattle();
      if (s.screen === "AFTER_BATTLE") s.nextBattle();
      if (++guard > 10) throw new Error("the shell never reached an ending");
    }

    expect(played).toEqual(["b1", "b2", "b3", "b4", "b5"]);
    expect(s.save?.status).toBe("completed");
    expect(s.save?.history.map((h) => h.outcome)).toEqual(Array(5).fill("victory"));
  });

  it("A/B: a battle played through the shell banks what the headless runner banks", () => {
    // THE CHECK THAT KEEPS THE SHELL FROM BECOMING A SECOND CAMPAIGN RUNNER. `step()`
    // is watch mode — `decideBalanceProbe`, the same decider `runCampaignBattle`
    // defaults to — so a battle fought through the viewer and the same battle fought
    // headlessly must produce the SAME save and the SAME report. A shell with its own
    // reward derivation, its own outcome read, or its own record map would diverge
    // here and nowhere else.
    const s = shell();
    s.newGame();
    const before = s.save!;
    s.deploy();
    autoplay(s);
    const played = s.session!.report()!;
    s.concludeBattle();

    const headless = runCampaignBattle(campaign, before, ENCOUNTERS, { registry });

    expect(JSON.stringify(played)).toBe(JSON.stringify(headless.battle.report));
    expect(serializeCampaign(s.save!)).toBe(serializeCampaign(headless.save));
  });

  it("and that A/B is not vacuous — the battle banked real AP for real work", () => {
    const s = shell();
    s.newGame();
    s.deploy();
    autoplay(s);
    s.concludeBattle();
    expect(s.save!.battleIndex).toBe(1);
    expect(s.save!.party.some((p) => p.ap > 0)).toBe(true);
  });
});

describe("AC-M2: progress survives the slot, and survives being closed", () => {
  it("the save on disk round-trips byte-identically at every boundary", () => {
    const slot = memorySlot();
    const s = shell(slot);
    s.newGame();
    for (let i = 0; i < 2; i++) {
      const stored = slot.read();
      expect(stored).not.toBeNull();
      // Not "a file was written" — the ROUND TRIP. A save that writes and reloads
      // wrong looks identical to one that works (AC-M2's own discriminator).
      expect(serializeCampaign(deserializeCampaign(stored!))).toBe(serializeCampaign(s.save!));
      s.deploy();
      autoplay(s);
      s.concludeBattle();
      if (s.screen === "AFTER_BATTLE") s.nextBattle();
    }
  });

  it("DISCRIMINATING: a fresh shell over the same slot resumes with the BANKED party", () => {
    // The trap this exists for: a shell that reloaded the campaign DEF's party instead
    // of the save's would resume at the right battle with the right screen and a party
    // reset to zero AP — every screen correct, all progress gone. Compare against the
    // def explicitly, so "same as a fresh start" cannot pass.
    const slot = memorySlot();
    const first = shell(slot);
    first.newGame();
    first.deploy();
    autoplay(first);
    first.concludeBattle();
    first.nextBattle();
    const banked = first.save!;
    expect(banked.party.some((p) => p.ap > 0)).toBe(true);

    const reopened = shell(slot);
    expect(reopened.screen).toBe("TITLE");
    expect(reopened.canContinue()).toBe(true);
    expect(reopened.continueGame()).toBe(true);
    expect(reopened.screen).toBe("BRIEFING");
    expect(reopened.briefing()?.battleId).toBe("b2");
    expect(serializeCampaign(reopened.save!)).toBe(serializeCampaign(banked));
    expect(serializeCampaign(reopened.save!)).not.toBe(
      serializeCampaign(startCampaign(campaign)),
    );
  });

  it("DISCRIMINATING: DEPLOY builds the battle from the SAVE's party, not the def's", () => {
    // The save-comparison test above proves the SAVE carries progress. It does not prove
    // the BATTLE reads it — and banked AP alone changes no battle stat, so a shell that
    // deployed `def.party` would pass every assertion so far while quietly restarting
    // each fight from scratch. Write a change through `updatePartyMember` (the seam the
    // prep screen will use) and assert it reaches the deployed unit.
    const slot = memorySlot();
    const s = shell(slot);
    s.newGame();
    const vance = s.save!.party.find((r) => r.id === "pc-vance")!;
    s.save = updatePartyMember(s.save!, { ...vance, raw: { ...vance.raw, pa: vance.raw.pa + 7 } });
    writeSave(slot, s.save);

    const reopened = shell(slot);
    reopened.continueGame();
    reopened.deploy();
    const deployed = reopened.session!.state.units.find((u) => u.id === "blue-vance")!;
    const fresh = shell(memorySlot());
    fresh.newGame();
    fresh.deploy();
    const baseline = fresh.session!.state.units.find((u) => u.id === "blue-vance")!;
    // Strictly greater, not an exact figure: `buildBattleUnit` layers job growth and
    // mastery over the raw stat, so pinning the arithmetic here would be asserting the
    // build pipeline's formula in a test about persistence. A shell deploying the def's
    // party gives EQUALITY, which is what this has to rule out.
    expect(deployed.pa).toBeGreaterThan(baseline.pa);
  });

  it("quitting to the title keeps the save; erasing it removes it", () => {
    const slot = memorySlot();
    const s = shell(slot);
    s.newGame();
    s.quitToTitle();
    expect(s.screen).toBe("TITLE");
    expect(s.canContinue()).toBe(true);
    s.eraseSave();
    expect(s.canContinue()).toBe(false);
    expect(slot.read()).toBeNull();
  });
});

describe("AC-M3: losing is a state the player can act on", () => {
  /** Battle 1, thrown by waiting out every player turn. */
  function throwBattleOne(slot: SaveSlot = memorySlot()): CampaignShell {
    const s = shell(slot);
    s.newGame();
    s.deploy();
    forfeit(s);
    s.concludeBattle();
    return s;
  }

  it("a player who never acts LOSES — the forfeit really is a loss, not a stall", () => {
    // If waiting produced a timeout or a stalemate instead of a defeat, every
    // assertion below would still read as "the loss path works" while testing a
    // different branch. Name the outcome.
    const s = throwBattleOne();
    expect(s.lastOutcome()).toBe("defeat");
    expect(s.screen).toBe("AFTER_BATTLE");
    expect(s.save?.status).toBe("gameOver");
  });

  it("retry restores the pre-battle party EXACTLY and replays the same battle", () => {
    const s = throwBattleOne();
    const lost = s.save!;
    s.retry();
    expect(s.screen).toBe("BRIEFING");
    expect(s.briefing()?.battleId).toBe("b1");
    expect(s.briefing()?.retrying).toBe(true);
    // Byte-identical party: a loss never spent anything, so this is exact, not restored.
    expect(JSON.stringify(s.save!.party)).toBe(JSON.stringify(startCampaign(campaign).party));
    expect(s.save!.battleIndex).toBe(lost.battleIndex);
    expect(s.save!.history).toEqual(lost.history); // the loss is not erased

    s.deploy();
    autoplay(s);
    s.concludeBattle();
    expect(s.lastOutcome()).toBe("victory");
    expect(s.save!.battleIndex).toBe(1);
  });

  it("a game abandoned on a LOSS comes back to the retry screen, not a fresh attempt", () => {
    const slot = memorySlot();
    throwBattleOne(slot);
    const reopened = shell(slot);
    reopened.continueGame();
    expect(reopened.screen).toBe("AFTER_BATTLE");
    expect(reopened.lastOutcome()).toBe("defeat");
  });
});

describe("a slot that cannot be read is a message, never a crash", () => {
  it("garbage in the slot leaves the game startable and says why", () => {
    const s = shell(memorySlot("not json at all"));
    expect(s.slotState.kind).toBe("error");
    expect(s.canContinue()).toBe(false);
    expect(s.continueGame()).toBe(false);
    s.newGame(); // still perfectly startable
    expect(s.screen).toBe("BRIEFING");
  });

  it("a save from a DIFFERENT campaign is refused by name", () => {
    const other: CampaignSave = { ...startCampaign(campaign), campaignId: "camp-something-else" };
    const s = shell(memorySlot(serializeCampaign(other)));
    expect(s.slotState).toMatchObject({ kind: "error" });
    expect(s.canContinue()).toBe(false);
  });

  it("a save this build cannot migrate is refused, not partially loaded", () => {
    const future = JSON.stringify({
      ...JSON.parse(serializeCampaign(startCampaign(campaign))),
      campaignSchemaVersion: 99,
    });
    expect(readSave(memorySlot(future), campaign.id).kind).toBe("error");
  });

  it("a refused WRITE is surfaced, and the run in memory continues", () => {
    const refusing: SaveSlot = {
      read: () => null,
      write: () => {
        throw new Error("quota exceeded");
      },
      clear: () => undefined,
    };
    const s = shell(refusing);
    s.newGame();
    expect(s.saveError).not.toBeNull();
    expect(s.screen).toBe("BRIEFING"); // the run is still playable
    s.deploy();
    expect(s.screen).toBe("BATTLE");
  });

  it("writeSave validates on the way out — a malformed save never replaces a good one", () => {
    const slot = memorySlot();
    writeSave(slot, startCampaign(campaign));
    const good = slot.read();
    expect(() =>
      writeSave(slot, { ...startCampaign(campaign), battleIndex: -1 } as CampaignSave),
    ).toThrow();
    expect(slot.read()).toBe(good);
  });
});
