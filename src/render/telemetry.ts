/**
 * The playtest log (`docs/plans/slice-m1-synthetic-playtest.md`, Part B).
 *
 * Part A settles what an AGENT can settle: relative difficulty, and a length proxy in
 * decisions. What it cannot settle is anything about a person — whether the chassis reads,
 * where somebody gets stuck, how long a real session actually takes. This records that, so
 * the first human playtest produces data instead of an anecdote.
 *
 * WHAT IT IS FOR. One row matters more than the rest: **where they stopped.** A player who
 * closes the tab at battle 3 tells you more than one who finishes, and it is the single
 * thing an after-the-fact conversation never recovers ("I think I got a few battles in?").
 * Everything else here is context for that row.
 *
 * IT OBSERVES, IT NEVER FEEDS BACK. Nothing in this file is read by the shell, the session
 * or the sim — the only consumer is {@link PlaytestLog}, which a human copies out. That is
 * the whole reason wall-clock is safe here: `docs/05` §3 bans it from anything that can
 * reach `BattleState`, and a recorder with no return path cannot. `game.ts` calls in; this
 * file calls nothing back.
 *
 * WALL-CLOCK GOES THROUGH AN INJECTED CLOCK, not `Date.now()` at the call sites. Two
 * reasons, and the second is the one that matters: the tests can then assert real
 * durations rather than "some number appeared", and the single place time enters this
 * module is one line to audit rather than a dozen.
 *
 * NO PERSONAL DATA, NO NETWORK. Screen names, battle ids, counts and millisecond deltas.
 * It writes to `localStorage` under its own key and nowhere else; the player copies the
 * JSON and pastes it back by hand.
 */

/** Bumped when a stored log's SHAPE changes. A log from an older build is discarded. */
export const LOG_SCHEMA_VERSION = 1;

/** Where the log lives. Deliberately NOT the save's key — erasing a save keeps the log. */
export const LOG_KEY = "tuh.playtest.v1";

/** The screens a player can be on, mirroring the shell's own. */
export type LoggedScreen = "TITLE" | "BRIEFING" | "BATTLE" | "AFTER_BATTLE" | "COMPLETED";

/**
 * A player action worth timing. Coarse on purpose: the question is "did they know what to
 * do next", not which pixel they clicked, and a fine-grained event stream would make the
 * log unreadable in the one place it gets read — pasted into a conversation.
 */
export type LoggedAction =
  | "start"
  | "deploy"
  | "battle-input"
  | "conclude"
  | "next"
  | "retry"
  | "buy"
  | "equip"
  | "change-job"
  | "change-weapon"
  | "change-deployment"
  | "help";

/** One visit to one screen. A screen visited twice produces two of these. */
export interface ScreenVisit {
  screen: LoggedScreen;
  /** ms from the session's start to arriving here. */
  atMs: number;
  /**
   * ms from arriving to the FIRST action taken here, or `null` if they took none.
   *
   * `null` is the interesting value, not a gap: a briefing screen left without a single
   * action is a player who did not realise the prep screen was theirs to use — which is
   * exactly the failure Part A measured the cost of.
   */
  toFirstActionMs: number | null;
  /** ms spent here before moving on, or `null` while this is still the live screen. */
  dwellMs: number | null;
}

/** One attempt at one battle. A retried battle produces one row per attempt. */
export interface BattleAttempt {
  battleId: string;
  /** 1 = first go. */
  attempt: number;
  outcome: string;
  /** Living-unit decisions taken, straight from the battle's own report. */
  turns: number;
  /** Wall-clock the fight took, deploy to conclude. */
  ms: number;
}

/** What the player did to their party, summed over the run. */
export interface EditCounts {
  bought: number;
  equipped: number;
  jobChanged: number;
  weaponChanged: number;
  deploymentChanged: number;
}

/** The artifact a playtester pastes back. */
export interface PlaytestLog {
  logSchemaVersion: number;
  /** ms the session has been open. */
  totalMs: number;
  screens: ScreenVisit[];
  battles: BattleAttempt[];
  edits: EditCounts;
  /** How many times the help panel was opened. Zero is a finding on its own. */
  helpOpened: number;
  /**
   * Where they were when the log was last written — the row worth reading first.
   *
   * Written on EVERY event rather than on an exit hook: a closed tab fires nothing
   * reliable, so "the last thing recorded" has to be the answer by construction.
   */
  stoppedOn: { screen: LoggedScreen; battleId: string | null } | null;
}

/** Injected so tests assert real durations instead of "a number appeared". */
export interface Clock {
  now(): number;
}

/** The default clock: the only place wall-clock enters this module. */
export const systemClock: Clock = { now: () => Date.now() };

export interface RecorderOptions {
  clock?: Clock;
  /**
   * Where the log is kept. Absent ⇒ memory only, and {@link Recorder.persisting} says so.
   *
   * A recorder that silently kept nothing would look identical to one that works, right
   * up until the playtester is asked for their log and has none — the same failure the
   * shell's `saveError` exists to prevent, one layer over.
   */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  key?: string;
  /**
   * Continue a log already in storage instead of starting a fresh one. Default `true`.
   *
   * THE DEFAULT IS LOAD-BEARING. A fresh recorder overwrites on its first write, and the
   * log it would destroy is the most valuable one there is: the session that ended by the
   * tab being closed — which is exactly the "where did they stop" row this file exists
   * for. A playtest that spans a reload is one playtest, so the log spans it too.
   */
  resume?: boolean;
}

/**
 * Records one play session.
 *
 * Every mutator writes the whole log through. That is more writes than strictly needed
 * and it is the point: the log has to be complete at any instant, because the event that
 * ends a session — closing the tab — gives no notice.
 */
export class Recorder {
  private readonly clock: Clock;
  private readonly storage: RecorderOptions["storage"];
  private readonly key: string;
  private readonly startedAt: number;

  private visits: ScreenVisit[] = [];
  private battles: BattleAttempt[] = [];
  private edits: EditCounts = {
    bought: 0,
    equipped: 0,
    jobChanged: 0,
    weaponChanged: 0,
    deploymentChanged: 0,
  };
  private helpOpened = 0;
  private battleStartedAt: number | null = null;
  private attemptsByBattle = new Map<string, number>();
  private stopped: PlaytestLog["stoppedOn"] = null;

  /**
   * A write that FAILED, surfaced rather than swallowed — `localStorage` throws when a
   * quota is full or a browser blocks site data.
   */
  writeError: string | null = null;

  /**
   * Time already spent in earlier sessions of this log, so `totalMs` measures the
   * playtest rather than the tab.
   */
  private readonly priorMs: number;

  constructor(opts: RecorderOptions = {}) {
    this.clock = opts.clock ?? systemClock;
    this.storage = opts.storage;
    this.key = opts.key ?? LOG_KEY;
    this.startedAt = this.clock.now();

    const prior = opts.resume === false ? null : readLog(this.storage, this.key);
    this.priorMs = prior?.totalMs ?? 0;
    if (prior) {
      this.visits = prior.screens.map((v) => ({ ...v }));
      this.battles = prior.battles.map((b) => ({ ...b }));
      this.edits = { ...prior.edits };
      this.helpOpened = prior.helpOpened;
      this.stopped = prior.stoppedOn === null ? null : { ...prior.stoppedOn };
      for (const b of prior.battles) {
        this.attemptsByBattle.set(b.battleId, Math.max(this.attemptsByBattle.get(b.battleId) ?? 0, b.attempt));
      }
      // The screen that was live when the tab closed is CLOSED OFF: its dwell ended at
      // an unknowable moment, and leaving it open would let the next session's first
      // action be timed against a screen visited yesterday.
      const live = this.visits.at(-1);
      if (live && live.dwellMs === null) live.dwellMs = 0;
    }
  }

  /** True when the log is actually being kept somewhere a reload can find it. */
  get persisting(): boolean {
    return this.storage !== undefined && this.writeError === null;
  }

  private get elapsed(): number {
    return this.priorMs + (this.clock.now() - this.startedAt);
  }

  private get current(): ScreenVisit | undefined {
    return this.visits.at(-1);
  }

  /**
   * The player arrived on a screen.
   *
   * A repeat of the screen already showing is IGNORED, because `game.ts` repaints on
   * every click: counting repaints as visits would turn one briefing into thirty, and
   * make "time to first action" meaningless — it would reset on the action itself.
   */
  screen(screen: LoggedScreen, battleId: string | null = null): void {
    const at = this.elapsed;
    const live = this.current;
    if (live && live.screen === screen && live.dwellMs === null) {
      this.stopped = { screen, battleId };
      this.flush();
      return;
    }
    if (live && live.dwellMs === null) live.dwellMs = at - live.atMs;
    this.visits.push({ screen, atMs: at, toFirstActionMs: null, dwellMs: null });
    this.stopped = { screen, battleId };
    this.flush();
  }

  /** The player did something. Timed against the screen they are on. */
  action(kind: LoggedAction): void {
    const live = this.current;
    if (live && live.toFirstActionMs === null) live.toFirstActionMs = this.elapsed - live.atMs;
    switch (kind) {
      case "buy":
        this.edits.bought += 1;
        break;
      case "equip":
        this.edits.equipped += 1;
        break;
      case "change-job":
        this.edits.jobChanged += 1;
        break;
      case "change-weapon":
        this.edits.weaponChanged += 1;
        break;
      case "change-deployment":
        this.edits.deploymentChanged += 1;
        break;
      case "help":
        this.helpOpened += 1;
        break;
      default:
        break;
    }
    this.flush();
  }

  /** A battle began. Starts its wall-clock. */
  battleStarted(): void {
    this.battleStartedAt = this.clock.now();
    this.flush();
  }

  /**
   * A battle finished and was banked.
   *
   * `attempt` is counted HERE rather than taken from the caller: the shell has no attempt
   * counter, and a number the page had to track itself would be a second copy of state
   * that could disagree with the rows beside it.
   */
  battleEnded(battleId: string, outcome: string, turns: number): void {
    const attempt = (this.attemptsByBattle.get(battleId) ?? 0) + 1;
    this.attemptsByBattle.set(battleId, attempt);
    const started = this.battleStartedAt;
    this.battles.push({
      battleId,
      attempt,
      outcome,
      turns,
      ms: started === null ? 0 : this.clock.now() - started,
    });
    this.battleStartedAt = null;
    this.flush();
  }

  /** The log as it stands. Safe to call at any moment. */
  log(): PlaytestLog {
    return {
      logSchemaVersion: LOG_SCHEMA_VERSION,
      totalMs: this.elapsed,
      screens: this.visits.map((v) => ({ ...v })),
      battles: this.battles.map((b) => ({ ...b })),
      edits: { ...this.edits },
      helpOpened: this.helpOpened,
      stoppedOn: this.stopped === null ? null : { ...this.stopped },
    };
  }

  /** The log as the JSON a playtester pastes back. */
  serialize(): string {
    return JSON.stringify(this.log(), null, 2);
  }

  /** Throw the log away — the control the title screen offers beside "erase save". */
  clear(): void {
    this.visits = [];
    this.battles = [];
    this.edits = {
      bought: 0,
      equipped: 0,
      jobChanged: 0,
      weaponChanged: 0,
      deploymentChanged: 0,
    };
    this.helpOpened = 0;
    this.attemptsByBattle.clear();
    this.battleStartedAt = null;
    this.stopped = null;
    try {
      this.storage?.removeItem(this.key);
      this.writeError = null;
    } catch (err) {
      this.writeError = String(err);
    }
  }

  private flush(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, this.serialize());
      this.writeError = null;
    } catch (err) {
      // Captured, never thrown: a full quota must not take the game down mid-battle.
      this.writeError = String(err);
    }
  }
}

/**
 * Read a stored log back, or `null` when there is none or it is unusable.
 *
 * Never throws, for the same reason `readSave` does not: a corrupt log must not make the
 * page unstartable, and it is a research artifact — losing one costs a playtest, not a
 * save. A log from an older schema is discarded rather than migrated, because a partly
 * understood funnel is worse evidence than no funnel.
 */
export function readLog(
  storage: Pick<Storage, "getItem"> | undefined,
  key: string = LOG_KEY,
): PlaytestLog | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const log = parsed as PlaytestLog;
    if (log.logSchemaVersion !== LOG_SCHEMA_VERSION) return null;
    if (!Array.isArray(log.screens) || !Array.isArray(log.battles)) return null;
    return log;
  } catch {
    return null;
  }
}
