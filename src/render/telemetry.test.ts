import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LOG_VERSION,
  Recorder,
  diffRecord,
  summarize,
  type PlaytestLog,
  type RecordChange,
} from "./telemetry.js";
import { memorySlot, type SaveSlot } from "./storage.js";
import { UnitRecordSchema, type UnitRecord } from "../sim/index.js";

/** A clock the test drives by hand — the whole point of `RecorderOptions.now`. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

const readLog = (slot: SaveSlot): PlaytestLog => JSON.parse(slot.read() ?? "null") as PlaytestLog;

function record(over: Partial<UnitRecord> = {}): UnitRecord {
  return UnitRecordSchema.parse({
    rosterSchemaVersion: 3,
    id: "u1",
    name: "Vance",
    level: 1,
    currentJob: "knight",
    raw: { hp: 40, mp: 10, pa: 6, ma: 4, speed: 7 },
    brave: 70,
    faith: 70,
    ap: 200,
    learned: ["knight.a"],
    mastered: [],
    loadout: { secondary: null, reaction: null, support: null, movement: null, traits: [] },
    weapon: null,
    ...over,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The structural property the whole "read-only over the session" claim rests on.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when `source` contains an import that survives compilation — a value import, a
 * re-export, or a dynamic `import()`. `import type` is erased, so it cannot be used to
 * call anything.
 *
 * Anchored at line start so the phrase "import type" inside a docstring cannot satisfy
 * it and a value import inside one cannot trip it.
 */
function hasValueImport(source: string): boolean {
  const lines = source.split("\n");
  return lines.some(
    (line) =>
      (/^import\s/.test(line) && !/^import\s+type\s/.test(line)) ||
      /^export\s+[^;]*\sfrom\s/.test(line) ||
      /\bimport\s*\(/.test(line),
  );
}

describe("the type-only-import guard itself", () => {
  // A guard nobody mutation-tested is a claim about code that was never run
  // (CLAUDE.md). Each of these is a way this file could stop being inert.
  it("rejects a value import, a re-export and a dynamic import", () => {
    expect(hasValueImport(`import { writeSave } from "./storage.js";`)).toBe(true);
    expect(hasValueImport(`export { SAVE_KEY } from "./storage.js";`)).toBe(true);
    expect(hasValueImport(`  const m = await import("./storage.js");`)).toBe(true);
  });

  it("accepts type-only imports, and is not fooled by prose", () => {
    expect(hasValueImport(`import type { SaveSlot } from "./storage.js";`)).toBe(false);
    expect(hasValueImport(` * Every import in this file is \`import type\`.`)).toBe(false);
    expect(hasValueImport(` * import { writeSave } from "./storage.js" would break it.`)).toBe(
      false,
    );
  });
});

describe("telemetry.ts cannot touch the game", () => {
  it("has no import that survives compilation", () => {
    const src = readFileSync(fileURLToPath(new URL("./telemetry.ts", import.meta.url)), "utf8");
    // This is what makes "the recorder is read-only over the session" a fact about the
    // build rather than a promise in a docstring: after erasure there is nothing here
    // it is possible to call. Adding one value import to telemetry.ts turns this red.
    expect(hasValueImport(src)).toBe(false);
  });

  it("copies what it is handed, so a caller's later edit cannot rewrite the log", () => {
    const slot = memorySlot();
    const rec = new Recorder({ slot });
    const chosen = ["a", "b"];
    rec.deploy(chosen);
    chosen[0] = "MUTATED";
    const ev = rec.snapshot().events.at(-1);
    expect(ev).toMatchObject({ kind: "deploy", chosen: ["a", "b"] });
  });

  it("hands out a snapshot the caller cannot edit back into the log", () => {
    const rec = new Recorder({ slot: memorySlot() });
    rec.screen("TITLE");
    const snap = rec.snapshot();
    snap.events.length = 0;
    snap.dropped = 99;
    expect(rec.snapshot().events).toHaveLength(1);
    expect(rec.snapshot().dropped).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Recording
// ─────────────────────────────────────────────────────────────────────────────

describe("Recorder", () => {
  it("records a screen once, however many repaints land on it", () => {
    // `refresh()` runs on EVERY repaint; a recorder that logged each one would bury
    // the funnel and make time-to-first-action meaningless.
    const clock = fakeClock();
    const rec = new Recorder({ slot: memorySlot(), now: clock.now });
    rec.screen("TITLE");
    rec.screen("TITLE");
    rec.screen("BRIEFING");
    rec.screen("TITLE");
    expect(rec.snapshot().events.map((e) => e.kind === "screen" && e.screen)).toEqual([
      "TITLE",
      "BRIEFING",
      "TITLE",
    ]);
  });

  it("times events from the log's start, never from the wall clock", () => {
    const clock = fakeClock();
    const rec = new Recorder({ slot: memorySlot(), now: clock.now });
    rec.screen("TITLE");
    clock.advance(2_500);
    rec.action("TITLE", "btn-new-game");
    const [first, second] = rec.snapshot().events;
    // 0 and 2500 — not 1_000_000 and 1_002_500. An absolute stamp would say WHEN
    // somebody played and buys nothing a duration does not.
    expect(first?.at).toBe(0);
    expect(second?.at).toBe(2_500);
  });

  it("persists every event, so nothing is lost if the tab closes mid-session", () => {
    const slot = memorySlot();
    const rec = new Recorder({ slot });
    rec.screen("TITLE");
    rec.action("TITLE", "btn-new-game");
    expect(readLog(slot).events).toHaveLength(2);
    expect(readLog(slot).version).toBe(LOG_VERSION);
  });

  it("counts a refused write instead of throwing it", () => {
    // The mirror of `writeSave`, which THROWS: a recorder that took the page down
    // would cost the player the run in exchange for measuring it.
    const slot: SaveSlot = {
      read: () => null,
      write: () => {
        throw new Error("quota exceeded");
      },
      clear: () => undefined,
    };
    const rec = new Recorder({ slot });
    expect(() => {
      rec.screen("TITLE");
      rec.action("TITLE", "btn-new-game");
    }).not.toThrow();
    const log = rec.snapshot();
    expect(log.events).toHaveLength(2);
    expect(log.writeFailures).toBe(2);
    expect(summarize(log).incomplete).toBe(true);
  });

  it("drops the OLDEST events at the cap, and says how many", () => {
    // Oldest-first on purpose: "where they stopped" lives at the END and is the most
    // valuable row. A cap that dropped the newest would destroy exactly that.
    const rec = new Recorder({ slot: memorySlot(), maxEvents: 3 });
    rec.screen("TITLE");
    rec.screen("BRIEFING");
    rec.screen("BATTLE");
    rec.screen("AFTER_BATTLE");
    rec.screen("COMPLETED");
    const log = rec.snapshot();
    expect(log.events.map((e) => e.kind === "screen" && e.screen)).toEqual([
      "BATTLE",
      "AFTER_BATTLE",
      "COMPLETED",
    ]);
    expect(log.dropped).toBe(2);
    expect(summarize(log).stoppedAt?.screen).toBe("COMPLETED");
    expect(summarize(log).incomplete).toBe(true);
  });

  it("clears the log without touching anything else in storage", () => {
    const slot = memorySlot();
    const rec = new Recorder({ slot });
    rec.screen("TITLE");
    rec.clear();
    expect(rec.snapshot().events).toHaveLength(0);
    expect(slot.read()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reload — the headless half of the claim `e2e` proves against a real browser.
// ─────────────────────────────────────────────────────────────────────────────

describe("resuming after a reload", () => {
  it("keeps the earlier events and continues their timeline", () => {
    const slot = memorySlot();
    const clock = fakeClock();
    const first = new Recorder({ slot, now: clock.now });
    first.screen("TITLE");
    clock.advance(5_000);
    first.action("TITLE", "btn-new-game");

    // The tab is closed for an hour and reopened. A recorder that restarted its clock
    // would fold the second session on top of the first and report both as instant.
    clock.advance(3_600_000);
    const second = new Recorder({ slot, now: clock.now });
    clock.advance(1_000);
    second.screen("BRIEFING");

    const events = second.snapshot().events;
    expect(events.map((e) => e.kind)).toEqual(["screen", "action", "resume", "screen"]);
    expect(events[0]?.at).toBe(0);
    expect(events[1]?.at).toBe(5_000);
    // The reload gap reads as ZERO — the clock cannot measure a closed tab, and the
    // `resume` row is what stops a reader believing the two halves were contiguous.
    expect(events[2]?.at).toBe(5_000);
    expect(events[3]?.at).toBe(6_000);
    expect(summarize(second.snapshot()).resumes).toBe(1);
  });

  it("re-records the screen after a reload, because the resumed log has no live one", () => {
    const slot = memorySlot();
    const first = new Recorder({ slot });
    first.screen("BRIEFING");
    const second = new Recorder({ slot });
    second.screen("BRIEFING");
    // Not deduped against the PREVIOUS session: the player really did arrive here
    // again, and suppressing it would leave the resumed half with no current screen
    // and no dwell at all.
    expect(second.snapshot().events.filter((e) => e.kind === "screen")).toHaveLength(2);
  });

  it("replaces a log it cannot read rather than repairing it", () => {
    for (const bad of ["not json at all", "null", '{"version":999,"events":[]}', '{"events":3}']) {
      const slot = memorySlot(bad);
      const rec = new Recorder({ slot });
      rec.screen("TITLE");
      const log = rec.snapshot();
      // A log is a measurement, not the player's progress: half of one costs more in
      // wrong conclusions than starting over costs in lost rows. And no `resume` row,
      // because nothing was carried forward.
      expect(log.events.map((e) => e.kind)).toEqual(["screen"]);
      expect(log.events[0]?.at).toBe(0);
    }
  });

  it("does not claim a resume when the stored log was empty", () => {
    const slot = memorySlot(JSON.stringify({ version: LOG_VERSION, events: [], dropped: 0 }));
    const rec = new Recorder({ slot });
    rec.screen("TITLE");
    expect(rec.snapshot().events.map((e) => e.kind)).toEqual(["screen"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// diffRecord — what actually reached the save
// ─────────────────────────────────────────────────────────────────────────────

describe("diffRecord", () => {
  const fields = (cs: RecordChange[]): string[] => cs.map((c) => c.field);

  it("reports nothing when the record did not move", () => {
    // The lever that makes every row below meaningful: an unchanged pair must be
    // silent, or "the player engaged" is asserted by the act of repainting.
    expect(diffRecord(record(), record())).toEqual([]);
  });

  it("names the job, the weapon, each chassis slot and each new ability", () => {
    const before = record();
    const after = record({
      currentJob: "geomancer",
      weapon: "oathblade",
      learned: ["knight.a", "knight.b"],
      loadout: {
        secondary: "knight",
        reaction: "punch-art.counter",
        support: "battle-skill.hp-boost",
        movement: "steal.move-plus-2",
        traits: ["bulwark"],
      },
    });
    expect(fields(diffRecord(before, after))).toEqual([
      "job",
      "weapon",
      "secondary",
      "support",
      "movement",
      "reaction",
      "traits",
      "learned",
    ]);
    expect(diffRecord(before, after).at(-1)).toEqual({
      field: "learned",
      from: null,
      to: "knight.b",
    });
  });

  it("reads a slot being EMPTIED as a change, not as nothing", () => {
    // `null` is a value here. A diff that skipped falsy sides would make un-equipping
    // invisible — and un-equipping is the interesting half of a respec.
    const before = record({
      loadout: {
        secondary: null,
        reaction: null,
        support: "battle-skill.hp-boost",
        movement: null,
        traits: [],
      },
    });
    const after = record();
    expect(diffRecord(before, after)).toEqual([
      { field: "support", from: "battle-skill.hp-boost", to: null },
    ]);
  });

  it("ignores a pure reordering of traits", () => {
    const before = record({
      loadout: { secondary: null, reaction: null, support: null, movement: null, traits: ["a", "b"] },
    });
    const after = record({
      loadout: { secondary: null, reaction: null, support: null, movement: null, traits: ["b", "a"] },
    });
    expect(diffRecord(before, after)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarize
// ─────────────────────────────────────────────────────────────────────────────

describe("summarize", () => {
  /** A session: title → briefing (two edits) → battle → after → briefing again. */
  function session(): PlaytestLog {
    const clock = fakeClock();
    const rec = new Recorder({ slot: memorySlot(), now: clock.now });
    rec.screen("TITLE");
    clock.advance(4_000);
    rec.action("TITLE", "btn-new-game");
    clock.advance(100);
    rec.screen("BRIEFING", 1);
    clock.advance(30_000);
    rec.action("BRIEFING", "btn-deploy");
    clock.advance(200);
    rec.prep("u1", [
      { field: "learned", from: null, to: "knight.b" },
      { field: "support", from: null, to: "knight.b" },
    ]);
    rec.deploy(["u1", "u2"]);
    clock.advance(100);
    rec.screen("BATTLE", 1);
    clock.advance(60_000);
    rec.action("BATTLE", "pick");
    clock.advance(5_000);
    rec.battle({
      battleId: "b1",
      step: 1,
      attempt: 1,
      outcome: "victory",
      turns: 12,
      ticks: 340,
    });
    rec.screen("AFTER_BATTLE");
    // The log ENDS on an event 9s after arriving here, so the last screen's dwell is a
    // number an implementation could plausibly credit. That is the point: a fixture
    // whose final screen has nothing after it gives 0 under the right rule AND the
    // wrong one, and would certify nothing (measured — the mutation stayed green).
    clock.advance(9_000);
    rec.action("AFTER_BATTLE", "btn-next");
    return rec.snapshot();
  }

  it("reports where the player stopped, and which battle they were on", () => {
    // The single most valuable row in the log, and the one an after-the-fact
    // conversation never recovers.
    expect(summarize(session()).stoppedAt).toEqual({ screen: "AFTER_BATTLE", battleStep: 1 });
  });

  it("carries the battle step past screens that do not report one", () => {
    // AFTER_BATTLE deliberately carries no step — `briefing()` has already moved on by
    // then, so reporting it would label the wrong fight.
    const log = session();
    const after = log.events.filter((e) => e.kind === "screen").at(-1);
    expect(after).toEqual({ kind: "screen", at: expect.any(Number), screen: "AFTER_BATTLE" });
  });

  it("measures time to the first action on each screen", () => {
    const by = new Map(summarize(session()).screens.map((s) => [s.screen, s]));
    expect(by.get("TITLE")?.timeToFirstActionMs).toBe(4_000);
    expect(by.get("BRIEFING")?.timeToFirstActionMs).toBe(30_000);
    expect(by.get("BATTLE")?.timeToFirstActionMs).toBe(60_000);
    expect(by.get("AFTER_BATTLE")?.timeToFirstActionMs).toBe(9_000);
  });

  it("reports null when a screen was never acted on", () => {
    // Itself the finding, on a screen meant to be used. Absent, not zero — a 0 here
    // would read as "they acted instantly", the opposite of what happened.
    const rec = new Recorder({ slot: memorySlot(), now: fakeClock().now });
    rec.screen("TITLE");
    rec.screen("BRIEFING", 1);
    const s = summarize(rec.snapshot());
    expect(s.screens.every((x) => x.timeToFirstActionMs === null)).toBe(true);
  });

  it("keeps the FIRST visit's time to first action, not the fastest", () => {
    // The question is how long a newcomer took, not how quickly they got on the
    // fifth go — a later, faster visit overwriting it would flatter the onboarding.
    const clock = fakeClock();
    const rec = new Recorder({ slot: memorySlot(), now: clock.now });
    rec.screen("BRIEFING", 1);
    clock.advance(20_000);
    rec.action("BRIEFING", "btn-deploy");
    rec.screen("BATTLE", 1);
    rec.screen("BRIEFING", 2);
    clock.advance(500);
    rec.action("BRIEFING", "btn-deploy");
    const brief = summarize(rec.snapshot()).screens.find((x) => x.screen === "BRIEFING");
    expect(brief?.timeToFirstActionMs).toBe(20_000);
    expect(brief?.visits).toBe(2);
    expect(brief?.actions).toBe(2);
  });

  it("credits dwell to every screen EXCEPT the one the log ends on", () => {
    // The discriminator against the obvious wrong implementation: crediting
    // "now minus arrival" to the last screen invents time the log never observed, and
    // would make the same log summarize differently depending on when it was read.
    const by = new Map(summarize(session()).screens.map((s) => [s.screen, s]));
    expect(by.get("TITLE")?.dwellMs).toBe(4_100);
    expect(by.get("BRIEFING")?.dwellMs).toBe(30_300);
    expect(by.get("BATTLE")?.dwellMs).toBe(65_000);
    // Zero even though 9s of events followed the arrival: the log ends here, and there
    // is no event saying how long the player then sat on this screen.
    expect(by.get("AFTER_BATTLE")?.dwellMs).toBe(0);
  });

  it("counts the between-battle edits by field, and the battles as banked", () => {
    const s = summarize(session());
    expect(s.prepChanges).toEqual({ learned: 1, support: 1 });
    expect(s.deployments).toBe(1);
    expect(s.battles).toHaveLength(1);
    expect(s.battles[0]).toMatchObject({ outcome: "victory", turns: 12, attempt: 1 });
  });

  it("says nothing rather than guessing on an empty log", () => {
    const s = summarize({ version: LOG_VERSION, events: [], dropped: 0, writeFailures: 0 });
    expect(s.stoppedAt).toBeNull();
    expect(s.elapsedMs).toBe(0);
    expect(s.incomplete).toBe(false);
  });
});
