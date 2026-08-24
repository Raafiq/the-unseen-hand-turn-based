/**
 * The playtest log (`docs/plans/slice-m1-synthetic-playtest.md`, Part B).
 *
 * What is owed here: the log records what a player did, survives the tab closing, and
 * cannot quietly keep nothing. The browser half — that the page actually calls in, and
 * that the log outlives a real reload — is `e2e/campaign.spec.ts`; every assertion below
 * passes against an in-memory map whether or not the page is wired at all, which is
 * exactly why the reload one lives there and not here.
 */

import { describe, expect, it } from "vitest";
import {
  LOG_KEY,
  LOG_SCHEMA_VERSION,
  Recorder,
  readLog,
  type Clock,
  type PlaytestLog,
} from "./telemetry.js";

/** A clock the test drives, so durations are asserted rather than merely present. */
function fakeClock(): Clock & { advance: (ms: number) => void } {
  let t = 1_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** The two `Storage` methods the recorder uses, over a Map, plus a peek. */
function memoryStorage(initial?: string) {
  const cells = new Map<string, string>();
  if (initial !== undefined) cells.set(LOG_KEY, initial);
  return {
    getItem: (k: string) => cells.get(k) ?? null,
    setItem: (k: string, v: string) => void cells.set(k, v),
    removeItem: (k: string) => void cells.delete(k),
    raw: () => cells.get(LOG_KEY) ?? null,
  };
}

describe("the recorder — what a session looked like", () => {
  it("times each screen from arrival to the FIRST action, and to leaving", () => {
    const clock = fakeClock();
    const rec = new Recorder({ clock });

    rec.screen("TITLE");
    clock.advance(4_000);
    rec.action("start");
    clock.advance(1_000);
    rec.screen("BRIEFING", "b1");
    clock.advance(9_000);
    rec.action("deploy");

    const [title, briefing] = rec.log().screens;
    expect(title?.toFirstActionMs).toBe(4_000);
    expect(title?.dwellMs).toBe(5_000);
    // Still the live screen, so its dwell is genuinely unknown rather than zero.
    expect(briefing?.dwellMs).toBeNull();
    expect(briefing?.toFirstActionMs).toBe(9_000);
  });

  it("records a screen the player left WITHOUT acting as null, not zero", () => {
    // The distinction is the whole point of the row. A briefing left untouched is a
    // player who did not realise the prep screen was theirs; a zero would read as an
    // instant, confident click — the opposite finding.
    const clock = fakeClock();
    const rec = new Recorder({ clock });
    rec.screen("BRIEFING", "b1");
    clock.advance(2_000);
    rec.screen("BATTLE", "b1");

    const [briefing] = rec.log().screens;
    expect(briefing?.toFirstActionMs).toBeNull();
    expect(briefing?.dwellMs).toBe(2_000);
  });

  it("ignores a repeat of the screen it is already on", () => {
    // `game.ts` records from `refresh()`, which runs on EVERY click. Counting repaints
    // as visits would turn one briefing into thirty and reset time-to-first-action onto
    // the action itself — the timing would then always read as instant.
    const clock = fakeClock();
    const rec = new Recorder({ clock });
    rec.screen("BRIEFING", "b1");
    clock.advance(3_000);
    rec.action("buy");
    rec.screen("BRIEFING", "b1");
    rec.screen("BRIEFING", "b1");

    expect(rec.log().screens).toHaveLength(1);
    expect(rec.log().screens[0]?.toFirstActionMs).toBe(3_000);
  });

  it("counts one row per battle ATTEMPT, and times each fight", () => {
    const clock = fakeClock();
    const rec = new Recorder({ clock });
    rec.battleStarted();
    clock.advance(60_000);
    rec.battleEnded("b5", "defeat", 21);
    rec.battleStarted();
    clock.advance(45_000);
    rec.battleEnded("b5", "victory", 19);

    expect(rec.log().battles).toEqual([
      { battleId: "b5", attempt: 1, outcome: "defeat", turns: 21, ms: 60_000 },
      { battleId: "b5", attempt: 2, outcome: "victory", turns: 19, ms: 45_000 },
    ]);
  });

  it("counts edits by kind, so 'engaged with the systems' is a number", () => {
    const rec = new Recorder({ clock: fakeClock() });
    rec.screen("BRIEFING", "b2");
    for (const kind of ["buy", "buy", "equip", "change-job", "change-weapon"] as const) {
      rec.action(kind);
    }
    rec.action("change-deployment");
    rec.action("help");
    rec.action("deploy"); // not an edit — must not be counted as one

    expect(rec.log().edits).toEqual({
      bought: 2,
      equipped: 1,
      jobChanged: 1,
      weaponChanged: 1,
      deploymentChanged: 1,
    });
    expect(rec.log().helpOpened).toBe(1);
  });

  it("keeps `stoppedOn` current on every event — the row a closed tab must not lose", () => {
    // Written continuously rather than on an exit hook, because a closed tab fires
    // nothing reliable. Asserted by never calling anything resembling one.
    const rec = new Recorder({ clock: fakeClock() });
    rec.screen("TITLE");
    expect(rec.log().stoppedOn).toEqual({ screen: "TITLE", battleId: null });
    rec.screen("BRIEFING", "b3");
    expect(rec.log().stoppedOn).toEqual({ screen: "BRIEFING", battleId: "b3" });
  });
});

describe("the recorder — keeping the log", () => {
  it("writes the whole log through on every event, so it is complete at any instant", () => {
    const store = memoryStorage();
    const rec = new Recorder({ clock: fakeClock(), storage: store });
    rec.screen("BRIEFING", "b1");
    rec.action("buy");

    // Read the RAW cell, not the recorder: an in-memory log that never reached storage
    // would satisfy every other assertion in this file.
    const written = JSON.parse(store.raw() ?? "null") as PlaytestLog;
    expect(written.edits.bought).toBe(1);
    expect(written.stoppedOn?.battleId).toBe("b1");
  });

  it("says it is NOT persisting when there is nowhere to write", () => {
    // A recorder that silently kept nothing looks identical to one that works, right up
    // until the playtester is asked for their log and has none.
    const rec = new Recorder({ clock: fakeClock() });
    expect(rec.persisting).toBe(false);
    rec.screen("TITLE");
    expect(() => rec.log()).not.toThrow();
  });

  it("captures a refused write instead of taking the game down mid-battle", () => {
    const rec = new Recorder({
      clock: fakeClock(),
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => undefined,
      },
    });
    expect(() => rec.screen("BATTLE", "b4")).not.toThrow();
    expect(rec.writeError).toMatch(/QuotaExceeded/);
    expect(rec.persisting).toBe(false);
  });

  it("RESUMES a stored log rather than overwriting it", () => {
    // The load-bearing one. A fresh recorder overwrites on its first write, and the log
    // it would destroy is the most valuable there is: the session that ended by the tab
    // closing, which is the whole "where did they stop" question.
    const clock = fakeClock();
    const store = memoryStorage();
    const first = new Recorder({ clock, storage: store });
    first.screen("BRIEFING", "b1");
    first.action("buy");
    first.battleStarted();
    clock.advance(30_000);
    first.battleEnded("b1", "victory", 4);

    clock.advance(1_000);
    const second = new Recorder({ clock, storage: store });
    second.screen("TITLE");
    const log = second.log();

    expect(log.battles).toHaveLength(1);
    expect(log.battles[0]?.battleId).toBe("b1");
    expect(log.edits.bought).toBe(1);
    // Elapsed spans both sessions, so `totalMs` measures the playtest, not the tab.
    expect(log.totalMs).toBeGreaterThanOrEqual(30_000);
  });

  it("continues the ATTEMPT count across a reload", () => {
    // A resumed log that restarted attempt numbering would report two first attempts at
    // the same battle — and "cleared it first try" is a difficulty claim.
    const clock = fakeClock();
    const store = memoryStorage();
    const first = new Recorder({ clock, storage: store });
    first.battleStarted();
    first.battleEnded("b5", "defeat", 20);

    const second = new Recorder({ clock, storage: store });
    second.battleStarted();
    second.battleEnded("b5", "victory", 18);

    expect(second.log().battles.map((b) => b.attempt)).toEqual([1, 2]);
  });

  it("closes off the screen that was live when the tab closed", () => {
    // Otherwise the next session's first action is timed against a screen visited
    // yesterday, and the funnel reports a thoughtful pause that was a night's sleep.
    const clock = fakeClock();
    const store = memoryStorage();
    new Recorder({ clock, storage: store }).screen("BRIEFING", "b2");

    clock.advance(8 * 60 * 60 * 1000);
    const second = new Recorder({ clock, storage: store });
    second.screen("TITLE");
    second.action("start");

    const [briefing, title] = second.log().screens;
    expect(briefing?.dwellMs).toBe(0);
    expect(title?.toFirstActionMs).toBe(0);
  });

  it("starts fresh when told to, and `clear` empties the stored cell", () => {
    const store = memoryStorage();
    const first = new Recorder({ clock: fakeClock(), storage: store });
    first.action("buy");
    expect(store.raw()).not.toBeNull();

    const fresh = new Recorder({ clock: fakeClock(), storage: store, resume: false });
    expect(fresh.log().edits.bought).toBe(0);

    fresh.clear();
    expect(store.raw()).toBeNull();
    expect(fresh.log().battles).toEqual([]);
  });
});

describe("readLog", () => {
  it("reads back what a recorder wrote", () => {
    const store = memoryStorage();
    const rec = new Recorder({ clock: fakeClock(), storage: store });
    rec.screen("COMPLETED", "b5");
    expect(readLog(store)?.stoppedOn).toEqual({ screen: "COMPLETED", battleId: "b5" });
  });

  it("returns null rather than throwing on anything it cannot use", () => {
    // A corrupt log must not make the page unstartable. It is a research artifact:
    // losing one costs a playtest, not a save.
    expect(readLog(undefined)).toBeNull();
    expect(readLog(memoryStorage())).toBeNull();
    expect(readLog(memoryStorage("not json at all"))).toBeNull();
    expect(readLog(memoryStorage("[1,2,3]"))).toBeNull();
    expect(readLog(memoryStorage('{"logSchemaVersion":1}'))).toBeNull();
  });

  it("discards a log from an older schema instead of half-reading it", () => {
    // A partly understood funnel is worse evidence than no funnel — it reads as data.
    const stale = JSON.stringify({
      logSchemaVersion: LOG_SCHEMA_VERSION - 1,
      totalMs: 1,
      screens: [],
      battles: [],
      edits: { bought: 9, equipped: 0, jobChanged: 0, weaponChanged: 0, deploymentChanged: 0 },
      helpOpened: 0,
      stoppedOn: null,
    });
    expect(readLog(memoryStorage(stale))).toBeNull();

    // And a recorder pointed at it does not silently inherit those counts.
    const rec = new Recorder({ clock: fakeClock(), storage: memoryStorage(stale) });
    expect(rec.log().edits.bought).toBe(0);
  });
});
