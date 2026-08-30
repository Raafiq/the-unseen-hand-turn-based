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
  parseStoryPack,
  runCampaignBattle,
  serializeCampaign,
  startCampaign,
  storyCoverage,
  portraitAssets,
  portraitCoverage,
  resolveBeat,
  STORY_SCHEMA_VERSION,
  updatePartyMember,
  type CampaignSave,
  type StoryPack,
} from "../sim/index.js";
import { ENCOUNTERS, PORTRAITS, TERRAIN, campaign, registry, story, terrainFor } from "./campaign-data.js";
import { assertFitsGrid } from "./terrain.js";
import { CampaignShell } from "./campaign-shell.js";
import { OPTIMIZER } from "./playtest.js";
import { PrepModel } from "./prep.js";
import { memorySlot, readSave, writeSave, type SaveSlot } from "./storage.js";

/** `null` means "mount with NO story pack at all" — a default parameter cannot say that. */
function shell(slot: SaveSlot = memorySlot(), storyPack: StoryPack | null = story): CampaignShell {
  return new CampaignShell({
    def: campaign,
    encounters: ENCOUNTERS,
    registry,
    slot,
    ...(storyPack === null ? {} : { story: storyPack }),
  });
}

/**
 * Walk past a standalone scene if one is standing here.
 *
 * TOLERANT ON PURPOSE, and the split matters. Scenes are OPTIONAL content — the campaign
 * authors one before b1 and b3 and none before b2 — so a helper that demanded a scene at
 * every landing would be asserting a rule nobody wrote. What it IS strict about is that
 * dismissing one works: if the shell was on SCENE, it must not still be. The claim that
 * the prologue actually exists is carried separately, by AC-V17's own test, where a
 * vanished scene fails loudly rather than being shrugged past here.
 */
function passScene(s: CampaignShell): void {
  if (s.screen !== "SCENE") return;
  s.endScene();
  expect(s.screen).not.toBe("SCENE");
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

  it("every painted battle is a battle the campaign plays — but not every battle is painted", () => {
    // Terrain is authored per battle and only the first is painted so far (ADR-0030), so
    // this is deliberately ONE-directional and the asymmetry is the point. A missing
    // entry is well-formed content: that battle draws the flat look. An entry keyed to an
    // id no battle uses is ground nobody can ever stand on, and reads as done.
    const named = new Set(campaign.battles.map((b) => b.encounterId));
    for (const id of Object.keys(TERRAIN)) {
      expect(named.has(id), `terrain painted for unknown battle "${id}"`).toBe(true);
    }
    // Non-degeneracy: with no painted battle at all the loop above is vacuous and passes.
    expect(Object.keys(TERRAIN).length).toBeGreaterThan(0);
    // And the lookup actually resolves for a painted battle — an accessor that always
    // returned `undefined` would satisfy every assertion above.
    const painted = Object.keys(TERRAIN)[0]!;
    expect(terrainFor(painted)).toBeDefined();
    expect(terrainFor("camp-b-does-not-exist")).toBeUndefined();
  });

  it("a painted battle's terrain covers its grid exactly", () => {
    // The renderer checks this at the first frame, which is too late to be a test: a
    // ragged map would ship and fail in front of a player. Same check, at build time.
    for (const [id, map] of Object.entries(TERRAIN)) {
      const grid = (ENCOUNTERS[id] as { grid: { width: number; height: number } }).grid;
      expect(() => assertFitsGrid(map, grid.width, grid.height), id).not.toThrow();
    }
  });
});

/**
 * Use the prep screen the way a player who reads the numbers would (ADR-0027).
 *
 * AC-M1 asserts an ending is reachable BY A PLAYER WHO PLAYS. Since ADR-0027 the finale
 * is tuned so a party that never spends AP loses it, so a walkthrough that skipped this
 * step would be asserting the zero-engagement path — the one the campaign deliberately
 * no longer grants an ending to.
 */
function prepAsOptimizer(s: CampaignShell): void {
  const save = s.save;
  const deployment = s.deployment();
  if (!save || !deployment) throw new Error("prepAsOptimizer: no battle to prepare for");
  const ctx = {
    battleIndex: save.battleIndex,
    slots: deployment.slots,
    party: save.party,
    inventory: save.inventory,
    registry,
    lastRewards: s.lastBattle?.rewards ?? null,
  };
  s.setDeployment(OPTIMIZER.chooseDeployment(ctx));
  const prep = new PrepModel({
    registry,
    records: s.save!.party,
    inventory: save.inventory,
    onChange: (record) => s.updateParty(record),
  });
  for (const member of save.party) {
    prep.select(member.id);
    OPTIMIZER.prepare(prep, ctx);
  }
}

describe("AC-M1: the campaign is driveable from the title screen to an ending", () => {
  it("New Game → five battles → COMPLETED, through the player's own path", () => {
    const s = shell();
    expect(s.screen).toBe("TITLE");
    expect(s.canContinue()).toBe(false);

    s.newGame();

    passScene(s);
    const played: string[] = [];
    let guard = 0;
    while (s.screen !== "COMPLETED") {
      expect(s.screen).toBe("BRIEFING");
      const brief = s.briefing();
      expect(brief).not.toBeNull();
      played.push(brief!.battleId);
      prepAsOptimizer(s);
      s.deploy();
      expect(s.screen).toBe("BATTLE");
      autoplay(s);
      expect(s.battleOver()).toBe(true);
      s.concludeBattle();
      passScene(s);
      if (s.screen === "AFTER_BATTLE") {
        s.nextBattle();
        passScene(s);
      }
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
    passScene(s);
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
    passScene(s);
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
    passScene(s);
    for (let i = 0; i < 2; i++) {
      const stored = slot.read();
      expect(stored).not.toBeNull();
      // Not "a file was written" — the ROUND TRIP. A save that writes and reloads
      // wrong looks identical to one that works (AC-M2's own discriminator).
      expect(serializeCampaign(deserializeCampaign(stored!))).toBe(serializeCampaign(s.save!));
      s.deploy();
      autoplay(s);
      s.concludeBattle();
      passScene(s);
      if (s.screen === "AFTER_BATTLE") {
        s.nextBattle();
        passScene(s);
      }
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
    passScene(first);
    first.deploy();
    autoplay(first);
    first.concludeBattle();
    first.nextBattle();
    passScene(first);
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
    passScene(s);
    const vance = s.save!.party.find((r) => r.id === "pc-vance")!;
    s.save = updatePartyMember(s.save!, { ...vance, raw: { ...vance.raw, pa: vance.raw.pa + 7 } });
    writeSave(slot, s.save);

    const reopened = shell(slot);
    reopened.continueGame();
    reopened.deploy();
    const deployed = reopened.session!.state.units.find((u) => u.id === "blue-vance")!;
    const fresh = shell(memorySlot());
    fresh.newGame();
    passScene(fresh);
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
    passScene(s);
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
    passScene(s);
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
    passScene(s);
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
    passScene(s);
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
    passScene(s);
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

describe("AC-M4: the story seam is real — the text is DATA, not code", () => {
  it("the shipped pack covers exactly the battles the campaign plays, both directions", () => {
    // The same partition the encounter imports get, for the same reason: a pack short one
    // battle ships a blank screen where a scene should be, and a stale entry for a
    // renamed battle resolves for nothing while reading as coverage.
    expect(storyCoverage(campaign.battles.map((b) => b.id), story)).toEqual({
      missing: [],
      extra: [],
      orphanScenes: [],
    });
  });

  it("the shell reports the pending battle's PRE beat and its authored title", () => {
    // Read out of the PACK rather than written down here. This used to assert the
    // literal "Four of us, one road" — which is prose the story repo owns and which
    // this slice had to change (it named a party size the battle does not field). A
    // test that pins a story literal makes swapping the pack — the entire point of the
    // seam — into a test failure. The claim is that the shell returns what the pack
    // holds for THIS battle, and that it is not returning some other battle's beat.
    const s = shell();
    s.newGame();
    passScene(s);
    const entry = story.entries.find((e) => e.battleId === "b1")!;
    expect(s.sceneTitle()).toBe(entry.title);
    expect(s.preBeat()?.lines).toEqual(entry.pre?.lines);
    // …and it really is battle one's, not whatever happened to be first.
    expect(s.preBeat()?.lines).not.toEqual(
      story.entries.find((e) => e.battleId === "b2")!.pre?.lines,
    );
  });

  it("DISCRIMINATING (AC-M4's A/B): swapping the DATA changes what the player reads", () => {
    // The whole contract in one assertion. Same campaign, same encounters, same code
    // path, same method calls — only the pack differs, and the text follows the pack.
    // A shell with the prose compiled in would return the shipped title for both.
    const swapped = parseStoryPack({
      // The VARIABLE, not a literal: a version bump must not silently turn this A/B into
      // an "old packs are refused" test.
      storySchemaVersion: STORY_SCHEMA_VERSION,
      campaignId: campaign.id,
      characters: [{ id: "narrator", name: "Narrator" }],
      entries: campaign.battles.map((b) => ({
        battleId: b.id,
        title: `Chapter ${b.id.toUpperCase()}`,
        pre: { lines: [{ speaker: "narrator", text: `A different opening for ${b.id}.` }] },
        victory: { lines: [{ text: `A different ending for ${b.id}.` }] },
        defeat: { lines: [{ text: `A different failure for ${b.id}.` }] },
      })),
      scenes: [],
    });

    const shipped = shell();
    shipped.newGame();
    passScene(shipped);
    const alternate = shell(memorySlot(), swapped);
    alternate.newGame();

    // Read out of the pack, never pinned: `check:story` fails a test that names an
    passScene(alternate);
    // authored title, for the same reason it fails one that names a line. The guard
    // window is six words and a title never reaches six, so titles are matched WHOLE —
    // which is how this literal survived here until 2026-08-29.
    const shippedTitle = story.entries.find((e) => e.battleId === "b1")?.title;
    // Non-degeneracy: if the pack authored no title, `sceneTitle()` returns null and the
    // comparison below would be undefined-vs-null — a pass that proves nothing.
    expect(typeof shippedTitle).toBe("string");
    expect(shipped.sceneTitle()).toBe(shippedTitle);
    expect(alternate.sceneTitle()).toBe("Chapter B1");
    // Resolved THROUGH the shell, which is what proves the registry is consulted: a
    // renderer reading the raw id would say "narrator", not "Narrator".
    const alt = alternate.resolve(alternate.preBeat()!);
    expect(alt.map((l) => l.who?.name)).toEqual(["Narrator"]);
    expect(alt.map((l) => l.text)).toEqual(["A different opening for b1."]);
    // And it is the same shell class, not a second implementation.
    expect(alternate.constructor).toBe(shipped.constructor);
  });

  it("no pack at all is a campaign with no text — never a crash or an empty scene", () => {
    const s = shell(memorySlot(), null);
    s.newGame();
    passScene(s);
    expect(s.sceneTitle()).toBeNull();
    expect(s.preBeat()).toBeNull();
    expect(s.outcomeBeat()).toBeNull();
  });

  it("DISCRIMINATING: a WIN and a LOSS on the same battle read different text", () => {
    // A shell that showed one "after" line regardless would pass any single-outcome test.
    // Play the same battle both ways and assert the two beats differ.
    const won = shell();
    won.newGame();
    passScene(won);
    won.deploy();
    autoplay(won);
    won.concludeBattle();

    const lost = shell();
    lost.newGame();
    passScene(lost);
    lost.deploy();
    forfeit(lost);
    lost.concludeBattle();

    expect(won.lastOutcome()).toBe("victory");
    expect(lost.lastOutcome()).not.toBe("victory");
    // Read out of the pack, not written down — see the PRE-beat test above.
    expect(won.outcomeBeat()?.lines).toEqual(
      story.entries.find((e) => e.battleId === "b1")!.victory?.lines,
    );
    expect(lost.outcomeBeat()?.lines).toEqual(
      story.entries.find((e) => e.battleId === "b1")!.defeat?.lines,
    );
    expect(won.outcomeBeat()).not.toEqual(lost.outcomeBeat());
  });

  it("DISCRIMINATING: the FINAL victory's text is reachable on the ending screen", () => {
    // Winning the last battle skips `AFTER_BATTLE` entirely and lands on `COMPLETED`, so
    // this one beat of the pack is the one a player could never read if the ending screen
    // did not show it. Nothing else in the suite visits that transition with a beat.
    const s = shell();
    s.newGame();
    passScene(s);
    for (let i = 0; i < campaign.battles.length; i++) {
      // Prepped, for the same reason AC-M1's walkthrough is (ADR-0027): reaching the
      // ending screen at all now requires a party that used the prep screen.
      prepAsOptimizer(s);
      s.deploy();
      autoplay(s);
      s.concludeBattle();
      passScene(s);
      if (s.screen === "AFTER_BATTLE") {
        s.nextBattle();
        passScene(s);
      }
    }
    expect(s.screen).toBe("COMPLETED");
    expect(s.outcomeBeat()?.lines).toEqual(
      story.entries.find((e) => e.battleId === "b5")!.victory?.lines,
    );
  });
});

describe("docs/11 M0 item 3: the between-battle prep loop writes into the save", () => {
  /** The battle unit id deployed for a party record, via the shell's own name map. */
  function deployedUnitId(s: CampaignShell, recordName: string): string {
    const names = s.unitNames();
    const id = Object.keys(names).find((k) => names[k] === recordName);
    if (!id) throw new Error(`no deployed unit named "${recordName}"`);
    return id;
  }

  it("an edit made through the panel lands in the SAVE and on disk", () => {
    const slot = memorySlot();
    const s = shell(slot);
    s.newGame();

    passScene(s);
    const model = new PrepModel({
      registry,
      records: s.save!.party,
      selectedId: "pc-kest",
      onChange: (r) => s.updateParty(r),
    });
    model.setJob("thief");

    expect(s.save!.party.find((r) => r.id === "pc-kest")!.currentJob).toBe("thief");
    expect(deserializeCampaign(slot.read()!).party.find((r) => r.id === "pc-kest")!.currentJob).toBe(
      "thief",
    );
  });

  it("DISCRIMINATING: AP spent in prep reaches the DEPLOYED unit's command list", () => {
    // Reaching THROUGH the helper to an observable end, as CLAUDE.md requires: comparing
    // this path against the headless runner would prove only that both call
    // `campaignBattleRecords`, not what they call it with. So: bank AP, buy an ability in
    // the panel, deploy, and read the ability off the unit standing on the field.
    const s = shell();
    s.newGame();
    passScene(s);
    const kest = s.save!.party.find((r) => r.id === "pc-kest")!;
    s.updateParty({ ...kest, ap: 200 });

    const model = new PrepModel({
      registry,
      records: s.save!.party,
      selectedId: "pc-kest",
      onChange: (r) => s.updateParty(r),
    });
    model.learn("monk", "chakra");

    s.deploy();
    const unit = s.session!.state.units.find((u) => u.id === deployedUnitId(s, "Kest"))!;
    expect(unit.abilities.map((a) => a.id)).toContain("punch-art.chakra");
  });

  it("and that is not vacuous — the SAME unit without the purchase does not have it", () => {
    // The other half of the A/B. Without this, an ability the unit had all along would
    // make the assertion above pass with the whole prep path disconnected.
    const s = shell();
    s.newGame();
    passScene(s);
    s.deploy();
    const unit = s.session!.state.units.find((u) => u.id === deployedUnitId(s, "Kest"))!;
    expect(unit.abilities.map((a) => a.id)).not.toContain("punch-art.chakra");
  });

  it("the party CANNOT be edited during a battle — the edit would apply to the next one", () => {
    const s = shell();
    s.newGame();
    passScene(s);
    s.deploy();
    expect(() => s.updateParty({ ...s.save!.party[0]!, ap: 999 })).toThrow(/during a battle/);
  });

  it("an edited party survives a retry exactly (AC-M3 still holds through prep)", () => {
    const s = shell();
    s.newGame();
    passScene(s);
    s.updateParty({ ...s.save!.party.find((r) => r.id === "pc-vance")!, ap: 500 });
    s.deploy();
    forfeit(s);
    s.concludeBattle();
    expect(s.save!.status).toBe("gameOver");
    s.retry();
    passScene(s);
    expect(s.save!.party.find((r) => r.id === "pc-vance")!.ap).toBe(500);
  });
});

describe("lastBattle — the live detail of the battle just banked", () => {
  it("carries the report and the AP grants, and is cleared when the run is left", () => {
    const s = shell();
    expect(s.lastBattle).toBeNull();

    s.newGame();

    passScene(s);
    s.deploy();
    autoplay(s);
    s.concludeBattle();

    const banked = s.lastBattle;
    expect(banked).not.toBeNull();
    expect(banked!.battleId).toBe(campaign.battles[0]!.id);
    expect(banked!.report.outcome).toBe(s.lastOutcome());
    // The grants are the ones actually applied, not a recomputation: every member who
    // earned AP shows up in `rewards`, and the party's AP moved by that much.
    const earned = s.save!.party.filter((r) => r.ap > 0).map((r) => r.id);
    expect(earned.length).toBeGreaterThan(0);
    for (const id of earned) expect(banked!.rewards[id]?.participated).toBe(true);

    // A receipt from a run you have left is worse than none — it would describe a
    // battle the player can no longer see, on a screen with no run in progress.
    s.quitToTitle();
    expect(s.lastBattle).toBeNull();
  });
});

describe("AC-V17: a standalone scene is a screen, and it is seen once", () => {
  it("DISCRIMINATING: the prologue stands in front of the first briefing", () => {
    // The STRICT half `passScene` deliberately is not. If the prologue silently stopped
    // being reachable, every walkthrough above would still be green — they shrug past a
    // missing scene because scenes are optional content. This one does not.
    const s = shell();
    s.newGame();
    expect(s.screen).toBe("SCENE");
    expect(s.pendingScene()?.id).toBe("sc-prologue");
    s.endScene();
    expect(s.screen).toBe("BRIEFING");
    expect(s.pendingScene()).toBeNull();
  });

  it("DISCRIMINATING: a scene is not replayed, and erasing the save brings it back", () => {
    // Three parts, all required. Part one: it is recorded, in the STORED save rather
    // than only in memory.
    const slot = memorySlot();
    const s = shell(slot);
    s.newGame();
    s.endScene();
    const stored = readSave(slot, campaign.id);
    expect(stored.kind).toBe("save");
    expect(stored.kind === "save" && stored.save.scenesSeen).toEqual(["sc-prologue"]);

    // Part two: a fresh shell over the same slot does not replay it.
    const resumed = shell(slot);
    expect(resumed.continueGame()).toBe(true);
    expect(resumed.screen).toBe("BRIEFING");

    // Part three, and it is what stops a scene screen that NEVER RENDERS from passing
    // the two above: erase, start again, and the prologue must be back.
    resumed.eraseSave();
    const after = shell(slot);
    after.newGame();
    expect(after.screen).toBe("SCENE");
    expect(after.pendingScene()?.id).toBe("sc-prologue");
  });

  it("a battle with no authored scene goes straight to its briefing", () => {
    // Scenes are optional, and this is the assertion that says so. Without it, an
    // implementation that invented a scene at every anchor would pass everything above.
    const s = shell();
    s.newGame();
    s.endScene();
    prepAsOptimizer(s);
    s.deploy();
    autoplay(s);
    s.concludeBattle();
    s.nextBattle();
    // b2 authors no scene.
    expect(s.screen).toBe("BRIEFING");
    expect(s.pendingScene()).toBeNull();
  });

  it("DISCRIMINATING: the epilogue stands in front of the ENDING, not after it", () => {
    // The final victory skips AFTER_BATTLE entirely and lands on COMPLETED, which is the
    // transition this repo has already shipped unreachable content on once. A scene
    // anchored at campaign-end that `arrive()` never consulted would leave the epilogue
    // unreadable with every other test here green.
    const s = shell();
    s.newGame();
    passScene(s);
    for (let i = 0; i < campaign.battles.length; i++) {
      prepAsOptimizer(s);
      s.deploy();
      autoplay(s);
      s.concludeBattle();
      if (s.screen === "AFTER_BATTLE") {
        s.nextBattle();
        passScene(s);
      }
    }
    expect(s.screen).toBe("SCENE");
    expect(s.pendingScene()?.id).toBe("sc-epilogue");
    s.endScene();
    expect(s.screen).toBe("COMPLETED");
  });

  it("no story pack means no scenes — the campaign still runs end to end", () => {
    const s = shell(memorySlot(), null);
    s.newGame();
    expect(s.screen).toBe("BRIEFING");
    expect(s.pendingScene()).toBeNull();
    s.endScene(); // a no-op, never a crash
    expect(s.screen).toBe("BRIEFING");
  });

  it("a LOSS goes to the retry screen, never behind a scene", () => {
    // A defeat has to be somewhere the player can act (AC-M3). A scene standing in front
    // of the retry screen would bury it.
    const s = shell();
    s.newGame();
    passScene(s);
    s.deploy();
    forfeit(s);
    s.concludeBattle();
    expect(s.screen).toBe("AFTER_BATTLE");
  });
});

describe("AC-M9: the shipped portraits are honest about not existing yet", () => {
  it("TRIPWIRE — the shipped pack still uses the PLACEHOLDER. Delete this when real art lands.", () => {
    // Deliberately fails the day a character names anything else, so the docs, ADR-0029
    // and the "Portrait pending" caption are forced to move with the art instead of
    // being left behind saying something that stopped being true.
    expect(portraitAssets(story)).toEqual(["placeholder"]);
    expect(Object.keys(PORTRAITS)).toEqual(["placeholder"]);
  });

  it("the bundle and the pack agree in BOTH directions", () => {
    expect(portraitCoverage(story, Object.keys(PORTRAITS))).toEqual({ missing: [], extra: [] });
  });

  it("DISCRIMINATING: the pack ships BOTH portrait states, so the A/B is possible at all", () => {
    // A page where every line has a portrait cannot demonstrate that an unauthored one
    // reads as absent — both branches have to exist in shipped content or the browser
    // A/B is measuring one case twice. The prologue is the fixture: characters speak,
    // and it closes on a narration line that has no speaker and therefore no portrait.
    const prologue = story.scenes.find((s) => s.id === "sc-prologue");
    expect(prologue).toBeDefined();
    const lines = resolveBeat(story, prologue!.beat);
    expect(lines.some((l) => l.portrait !== null)).toBe(true);
    expect(lines.some((l) => l.who === null && l.portrait === null)).toBe(true);
  });
});
