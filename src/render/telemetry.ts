/**
 * The playtest log (`docs/plans/slice-m1-synthetic-playtest.md`, step B1) — the
 * OBSERVER half of the synthetic playtest.
 *
 * Part A settles what an agent can settle: relative difficulty, and a decision-count
 * proxy for length. It cannot settle legibility, and nothing but a person can. This
 * file is what makes that person's session worth more than an anecdote — it records
 * where the time went, what they touched, and **where they stopped**, which is the one
 * row an after-the-fact conversation never recovers.
 *
 * NO BACKEND, NO NETWORK, NO PERSONAL DATA. The log lives in `localStorage` under its
 * own key and leaves the machine only when the player copies it and pastes it back.
 * Times are milliseconds SINCE THE LOG STARTED, never absolute — an absolute timestamp
 * would say when somebody played and buys nothing a duration does not.
 *
 * ## Two structural properties, both load-bearing
 *
 * **It cannot touch the game.** Every import in this file is `import type`, so after
 * compilation this module holds no reference to the shell, the session, the sim or the
 * storage helpers — there is nothing here it is *possible* to call. That is why
 * "telemetry is read-only over the session" is a fact about the build rather than a
 * promise in a docstring, and `telemetry.test.ts` asserts the property rather than the
 * promise. The recorder is fed scalars and copies by {@link game.ts}; it never receives
 * a live object.
 *
 * **Nothing derived from wall-clock reaches `BattleState`.** Wall-clock is legal in
 * `src/render` (the `iso.ts` animation precedent) and this file is the reason the rule
 * needs restating: it is the first module here whose whole job is measuring elapsed
 * time. The clock is injected ({@link RecorderOptions.now}) so tests are deterministic,
 * and it flows one way only — into the log, never back into the game.
 *
 * ## The opposite failure rule from `storage.ts`
 *
 * `writeSave` THROWS on a refused write, because a save that silently fails to write is
 * the worst outcome there is. Telemetry is the mirror image: a recorder that took the
 * page down, or made a click throw, would cost the player the run in exchange for a
 * measurement of it. So every write failure here is swallowed and counted
 * ({@link PlaytestLog.writeFailures}) — the log itself reports that it is incomplete,
 * which is the honest version of failing quietly.
 */

import type { Loadout, LoadoutSlot, UnitRecord } from "../sim/index.js";
import type { Screen } from "./campaign-shell.js";
import type { SaveSlot } from "./storage.js";

/**
 * The log's storage key. Versioned in the KEY as well as the payload, for the same
 * reason `SAVE_KEY` is: a shape this build cannot read is then simply never read,
 * rather than read and rejected forever.
 *
 * SEPARATE FROM THE SAVE. Erasing the save must not erase the log (a playtester who
 * restarts is exactly the session worth reading), and a corrupt log must never be able
 * to make a campaign unloadable.
 */
export const PLAYTEST_LOG_KEY = "tuh.playtest.v1";

/** The payload's schema version, checked on resume. */
export const LOG_VERSION = 1;

/**
 * Hard cap on retained events. A 45-minute run generates on the order of a thousand;
 * this is roughly twenty sessions' worth, and it exists so a tab left open for a week
 * cannot fill the origin's storage quota and start failing the SAVE's writes too.
 *
 * On overflow the OLDEST events are dropped and counted in {@link PlaytestLog.dropped}.
 * Oldest-first is the deliberate choice: "where they stopped" is the most valuable row
 * and it lives at the END, so dropping from the front loses the funnel's opening while
 * keeping its conclusion. When `dropped > 0` every per-screen dwell in
 * {@link summarize} is a LOWER BOUND, and the summary says so.
 */
export const MAX_EVENTS = 20_000;

/** What the player was doing, in the order they did it. */
export type TelemetryEvent =
  /**
   * A screen was entered. Recorded on CHANGE only — `refresh()` runs constantly.
   *
   * `battleStep` is the 1-based battle the player is on, and is supplied ONLY where it
   * is unambiguous — the briefing and the battle itself. It is deliberately absent on
   * the title and ending screens, and on the after-battle screen, where the shell's
   * pending battle has already moved past the one just fought: carrying it there would
   * label the wrong fight. {@link summarize} holds the last one it saw, so
   * "where they stopped" names the battle they were actually in.
   */
  | { kind: "screen"; at: number; screen: Screen; battleStep?: number }
  /** The player did something. `screen` is where they were BEFORE the mutation. */
  | { kind: "action"; at: number; screen: Screen; action: string }
  /** A battle was banked. `attempt` is 1 on the first go at this battle. */
  | {
      kind: "battle";
      at: number;
      battleId: string;
      step: number;
      attempt: number;
      outcome: string;
      turns: number;
      ticks: number;
    }
  /** One field of one party member changed IN THE SAVE (see {@link diffRecord}). */
  | { kind: "prep"; at: number; recordId: string; change: RecordChange }
  /** Who was sent into the next battle. */
  | { kind: "deploy"; at: number; chosen: string[] }
  /**
   * The page was reloaded and an existing log resumed.
   *
   * Recorded because the clock CANNOT measure a closed tab: `at` continues from the
   * last event rather than restarting, so the gap across a reload reads as zero. A
   * reader who cannot see this event would silently believe the two halves were
   * contiguous.
   */
  | { kind: "resume"; at: number };

/** One field of a {@link UnitRecord} that moved, with both sides. */
export interface RecordChange {
  /** `job`, `weapon`, `traits`, a chassis slot name, or `learned`. */
  field: "job" | "weapon" | "traits" | "learned" | LoadoutSlot;
  from: string | null;
  to: string | null;
}

/** The stored payload. */
export interface PlaytestLog {
  version: number;
  events: TelemetryEvent[];
  /** Events discarded at the {@link MAX_EVENTS} cap. Non-zero = dwells are lower bounds. */
  dropped: number;
  /** Writes the slot refused. Non-zero = this log may be missing its tail entirely. */
  writeFailures: number;
}

export interface RecorderOptions {
  /** Where the log is kept. `game.ts` hands in a `browserSlot` on {@link PLAYTEST_LOG_KEY}. */
  slot: SaveSlot;
  /**
   * The clock, injected so tests are deterministic. Defaults to `Date.now`.
   *
   * Only DIFFERENCES of this are ever stored, so a clock that jumps (an NTP correction,
   * a laptop waking) shifts one interval and nothing else.
   */
  now?: () => number;
  /** Overridable for the cap test, which would otherwise have to emit 20,000 events. */
  maxEvents?: number;
}

/**
 * The empty log — also what a resume falls back to when the slot holds nothing usable.
 *
 * A log that cannot be parsed is REPLACED, not repaired. It is a measurement, not the
 * player's progress: keeping half of one costs more in wrong conclusions than starting
 * over costs in lost rows.
 */
function emptyLog(): PlaytestLog {
  return { version: LOG_VERSION, events: [], dropped: 0, writeFailures: 0 };
}

/**
 * Parse a stored log, or `null` if it is unusable.
 *
 * Deliberately not Zod: this module's whole value rests on holding no value imports
 * (see the header), and the checks a log needs are shallow. The cost is that a
 * hand-mangled event survives; the consequence of that is a wrong row in a report a
 * human reads, never a broken game.
 */
function parseLog(json: string): PlaytestLog | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Partial<PlaytestLog>;
  if (obj.version !== LOG_VERSION) return null;
  if (!Array.isArray(obj.events)) return null;
  return {
    version: LOG_VERSION,
    events: obj.events as TelemetryEvent[],
    dropped: typeof obj.dropped === "number" ? obj.dropped : 0,
    writeFailures: typeof obj.writeFailures === "number" ? obj.writeFailures : 0,
  };
}

/**
 * The recorder.
 *
 * Every method takes SCALARS and copies. It is handed no shell, no session and no
 * record it could hold onto, which is the other half of the "cannot touch the game"
 * property — the type-only imports stop it calling out, and this stops it mutating
 * something passed in.
 */
export class Recorder {
  private readonly slot: SaveSlot;
  private readonly clock: () => number;
  private readonly maxEvents: number;
  private log: PlaytestLog;
  /**
   * Wall-clock at construction, MINUS however far the resumed log had already got.
   * Every `at` is measured from here, so a resumed log continues its own timeline
   * instead of restarting at zero and folding the second session on top of the first.
   */
  private readonly origin: number;
  /** The last screen recorded, so `screen()` can ignore a repaint that changed nothing. */
  private lastScreen: Screen | null = null;

  constructor(opts: RecorderOptions) {
    this.slot = opts.slot;
    this.clock = opts.now ?? Date.now;
    this.maxEvents = opts.maxEvents ?? MAX_EVENTS;

    const stored = this.slot.read();
    const resumed = stored === null || stored === "" ? null : parseLog(stored);
    this.log = resumed ?? emptyLog();
    const carried = resumed?.events.at(-1)?.at ?? 0;
    this.origin = this.clock() - carried;
    if (resumed !== null) {
      // Only when something was actually carried forward. Resuming an empty stored log
      // is indistinguishable from a first run, and a `resume` row there would suggest a
      // gap in the timeline that does not exist.
      if (resumed.events.length > 0) this.push({ kind: "resume", at: this.at() });
      else this.lastScreen = null;
    }
  }

  /** Milliseconds since the log began. Never an absolute time — see the header. */
  private at(): number {
    return this.clock() - this.origin;
  }

  /** Append, enforce the cap, persist. The ONLY write path. */
  private push(event: TelemetryEvent): void {
    this.log.events.push(event);
    if (this.log.events.length > this.maxEvents) {
      const excess = this.log.events.length - this.maxEvents;
      this.log.events.splice(0, excess);
      this.log.dropped += excess;
    }
    this.flush();
  }

  /**
   * Write the log, counting a refusal rather than throwing it — the mirror of
   * `writeSave`. See the header: a recorder that could take the page down would cost
   * the player the run in exchange for measuring it.
   *
   * EVERY EVENT, not a batch. Re-serializing the whole log each time is quadratic in
   * bytes written, which at a session's real volume (order 1,000 events, tens of KB)
   * costs well under a second spread across the run. Batching would trade that for the
   * risk of losing the TAIL — and the tail is where "they stopped" lives, the one row
   * the whole file exists for.
   */
  private flush(): void {
    try {
      this.slot.write(JSON.stringify(this.log));
    } catch {
      this.log.writeFailures += 1;
    }
  }

  // ─── what game.ts calls ───────────────────────────────────────────────────

  /**
   * The player is now on `screen`. Idempotent within a screen: `refresh()` runs on
   * every repaint, and recording each one would bury the funnel in noise and make
   * "time to first action" meaningless.
   */
  screen(screen: Screen, battleStep?: number): void {
    if (screen === this.lastScreen) return;
    this.lastScreen = screen;
    this.push(
      battleStep === undefined
        ? { kind: "screen", at: this.at(), screen }
        : { kind: "screen", at: this.at(), screen, battleStep },
    );
  }

  /**
   * The player did something. `screen` is where they were when they did it — record
   * BEFORE the mutation, or every action is attributed to the screen it led to.
   */
  action(screen: Screen, action: string): void {
    this.push({ kind: "action", at: this.at(), screen, action });
  }

  /** A battle was banked. */
  battle(battle: Omit<Extract<TelemetryEvent, { kind: "battle" }>, "kind" | "at">): void {
    this.push({ kind: "battle", at: this.at(), ...battle });
  }

  /** One member's record changed in the save. Emits one event per moved field. */
  prep(recordId: string, changes: readonly RecordChange[]): void {
    for (const change of changes) {
      this.push({ kind: "prep", at: this.at(), recordId, change });
    }
  }

  /** Who deploys next. Copied on the way in — the caller keeps its array. */
  deploy(chosen: readonly string[]): void {
    this.push({ kind: "deploy", at: this.at(), chosen: [...chosen] });
  }

  // ─── what the seam and the copy control read ──────────────────────────────

  /** The log as stored. A deep-enough copy that a caller cannot edit the live one. */
  snapshot(): PlaytestLog {
    return {
      version: this.log.version,
      events: this.log.events.map((e) => ({ ...e })),
      dropped: this.log.dropped,
      writeFailures: this.log.writeFailures,
    };
  }

  /** The JSON a player copies. Pretty-printed — a human pastes this into a message. */
  serialize(): string {
    return JSON.stringify(this.snapshot(), null, 2);
  }

  /** Throw the log away and start again (the playtester's "that run doesn't count"). */
  clear(): void {
    this.log = emptyLog();
    this.lastScreen = null;
    try {
      this.slot.clear();
    } catch {
      /* a slot that cannot be cleared is already empty as far as the recorder cares */
    }
  }
}

// ─── derivation ──────────────────────────────────────────────────────────────

/**
 * What moved between two versions of one party member.
 *
 * DIFFED, NOT DECLARED. The panel reports "the record changed" and nothing finer, so
 * this reads the two objects — which means it counts only what actually reached the
 * save, the same discipline `playtest.ts`'s `decisions` uses. A policy (or a control)
 * that computed an edit and never applied it scores nothing here, instead of scoring
 * whatever it claimed.
 *
 * `learned` is reported as a COUNT DELTA rather than a list of ids because the panel's
 * one write can only ever add one node, and the id is already the interesting half of
 * the pair — so `from: "3"`, `to: "4"` plus the node in `to` would be redundant. The
 * ids that were added are carried in the change's `to`.
 */
export function diffRecord(before: UnitRecord, after: UnitRecord): RecordChange[] {
  const out: RecordChange[] = [];
  if (before.currentJob !== after.currentJob) {
    out.push({ field: "job", from: before.currentJob, to: after.currentJob });
  }
  if (before.weapon !== after.weapon) {
    out.push({ field: "weapon", from: before.weapon, to: after.weapon });
  }
  for (const slot of ["secondary", "support", "movement", "reaction"] as const) {
    const from = before.loadout[slot];
    const to = after.loadout[slot];
    if (from !== to) out.push({ field: slot, from, to });
  }
  const traits = (l: Loadout): string => [...l.traits].sort().join(",");
  if (traits(before.loadout) !== traits(after.loadout)) {
    out.push({ field: "traits", from: traits(before.loadout), to: traits(after.loadout) });
  }
  const gained = after.learned.filter((id) => !before.learned.includes(id));
  for (const id of gained) out.push({ field: "learned", from: null, to: id });
  return out;
}

/** Per-screen totals. `dwell` is time spent there across every visit. */
export interface ScreenSummary {
  screen: Screen;
  visits: number;
  /** Milliseconds on this screen, summed. The final visit contributes nothing — see below. */
  dwellMs: number;
  actions: number;
  /**
   * Milliseconds from arriving to the FIRST action, on the first visit that had one.
   * `null` when the player never acted on this screen — which is itself the finding
   * on a screen they were supposed to use.
   */
  timeToFirstActionMs: number | null;
}

/** What the log says about one session. */
export interface LogSummary {
  /**
   * Where the player STOPPED — the last screen they reached, and the battle they were
   * on. The single most valuable row in the log.
   *
   * `battleStep` is the most recent one any screen event carried, so it survives the
   * after-battle and ending screens, which carry none. `null` before the first briefing.
   * `stoppedAt` itself is `null` only for a log with no screen events at all — nobody
   * got as far as the title.
   */
  stoppedAt: { screen: Screen; battleStep: number | null } | null;
  /** Milliseconds from the first event to the last. Excludes time with the tab closed. */
  elapsedMs: number;
  screens: ScreenSummary[];
  battles: Extract<TelemetryEvent, { kind: "battle" }>[];
  /** Record edits that reached the save, by field. The between-battle engagement signal. */
  prepChanges: Record<string, number>;
  deployments: number;
  /** Reloads mid-session. Each one is a gap the clock could not measure. */
  resumes: number;
  /**
   * True when the log is known to be incomplete — events dropped at the cap, or writes
   * the browser refused. Every duration above is then a LOWER BOUND.
   */
  incomplete: boolean;
}

/**
 * Fold a log into the numbers a human reads.
 *
 * DERIVED AT READ TIME, not stored. Dwell and time-to-first-action are functions of the
 * event sequence, so computing them here means the recorder cannot disagree with the
 * summary — there is only one place the arithmetic lives.
 *
 * The LAST screen contributes no dwell, deliberately: the log ends when the tab closes,
 * and there is no event saying how long the player sat on the screen they stopped at.
 * Attributing "now minus arrival" to it would invent time, and would make the same log
 * summarize differently depending on when it was read.
 */
export function summarize(log: PlaytestLog): LogSummary {
  const screens = new Map<Screen, ScreenSummary>();
  const prepChanges: Record<string, number> = {};
  const battles: Extract<TelemetryEvent, { kind: "battle" }>[] = [];
  let deployments = 0;
  let resumes = 0;
  let battleStep: number | null = null;
  let current: { screen: Screen; enteredAt: number; acted: boolean } | null = null;

  const bucket = (screen: Screen): ScreenSummary => {
    let s = screens.get(screen);
    if (!s) {
      s = { screen, visits: 0, dwellMs: 0, actions: 0, timeToFirstActionMs: null };
      screens.set(screen, s);
    }
    return s;
  };

  for (const ev of log.events) {
    switch (ev.kind) {
      case "screen": {
        if (current) bucket(current.screen).dwellMs += ev.at - current.enteredAt;
        bucket(ev.screen).visits += 1;
        if (ev.battleStep !== undefined) battleStep = ev.battleStep;
        current = { screen: ev.screen, enteredAt: ev.at, acted: false };
        break;
      }
      case "action": {
        const s = bucket(ev.screen);
        s.actions += 1;
        // First action of THIS visit, and only if no earlier visit already answered —
        // the question is how long a newcomer took, not how fast they got on the fifth go.
        if (current && current.screen === ev.screen && !current.acted) {
          current.acted = true;
          if (s.timeToFirstActionMs === null) s.timeToFirstActionMs = ev.at - current.enteredAt;
        }
        break;
      }
      case "battle":
        battles.push(ev);
        break;
      case "prep":
        prepChanges[ev.change.field] = (prepChanges[ev.change.field] ?? 0) + 1;
        break;
      case "deploy":
        deployments += 1;
        break;
      case "resume":
        resumes += 1;
        break;
    }
  }

  const first = log.events[0];
  const last = log.events.at(-1);
  return {
    stoppedAt: current === null ? null : { screen: current.screen, battleStep },
    elapsedMs: first && last ? last.at - first.at : 0,
    screens: [...screens.values()],
    battles,
    prepChanges,
    deployments,
    resumes,
    incomplete: log.dropped > 0 || log.writeFailures > 0,
  };
}
