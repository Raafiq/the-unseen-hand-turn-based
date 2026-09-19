/**
 * AC-V68 / AC-V69 (ADR-0046): the enemy's turn runs itself, and the pacer cannot change
 * the command log.
 *
 * THE FIXTURE MUST DISCRIMINATE, and the test asserts that it does. A board where every
 * unit is probe-driven gives the SAME log however the steps are triggered — a pacer that
 * double-stepped a late fire would step the next unit through the very same probe, and
 * the A/B would pass. So the PLAYER here follows a different policy from the enemy: the
 * hero always waits (`endTurn()`), the foes act through the probe. A stray probe step
 * landing on the hero's turn puts a probe command where a `wait` belongs, and the logs
 * diverge. `discriminates()` asserts both policies are actually present in the log.
 *
 * MUTATIONS RUN BY HAND against this file (2026-09-19), each red exactly where named:
 *   - `fire()` without the epoch guard (always steps): "delivered twice" and "a
 *     watch-mode Step inside the pause" fail — the log grows past the reference and
 *     `staleFires()` stays 0.
 *   - `fire()` stepping twice: "one trigger, one action" fails on log length; the
 *     player's `wait` is displaced by a probe command at the first double-step.
 *   - `observe()` never cancelling the previous pending task: "watch-mode Step" fails
 *     on the cancelled flag (the log stays right — the id guard holds — but a timer is
 *     left running for a step that already happened).
 */

import { describe, expect, it } from "vitest";
import {
  createBattleState,
  defaultUnit,
  makeFlatTiles,
  serialize,
  type BattleState,
  type UnitState,
} from "../sim/index.js";
import {
  BASE_PAUSE_MS,
  PREFS_KEY,
  Pacer,
  SPEEDS,
  nextSpeed,
  pauseMs,
  readSpeed,
  writeSpeed,
  type Scheduler,
  type Speed,
} from "./pacer.js";
import { Session } from "./session.js";
import { SAVE_KEY, memorySlot } from "./storage.js";

// ─── fixture ─────────────────────────────────────────────────────────────────

/**
 * 6×4, flat. Hero (team 0, the player) speed 12 at (1,1); two foes (team 1) at speeds
 * 11 and 10, both within a move+strike of the hero, so the turn order ALTERNATES and
 * `AI_TURN` is entered many times per battle. Hero HP is high enough that the battle
 * runs long; the loop below is bounded and the bound asserted.
 */
function fixture(): BattleState {
  const width = 6;
  const height = 4;
  const mk = (id: string, team: number, x: number, y: number, speed: number): UnitState =>
    defaultUnit(id, team, {
      pos: { x, y },
      facing: team === 0 ? "E" : "W",
      speed,
      move: 3,
      jump: 1,
      hp: 600,
      maxHp: 600,
      pa: 6,
      weapon: { wp: 6, formula: "paWp", element: "none", accuracy: 100 },
      evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    });
  return createBattleState({
    seed: 7,
    grid: { width, height, tiles: makeFlatTiles(width, height, 0) },
    units: [mk("hero", 0, 1, 1, 12), mk("foeA", 1, 4, 1, 11), mk("foeB", 1, 4, 2, 10)],
  });
}

const newSession = (): Session => new Session({ makeState: fixture, playerTeam: 0 });

/** Bounded, and the bound is asserted where it is used. */
const MAX_TURNS = 60;

/** The reference: the synchronous Step seam `autoplay` and watch mode use. */
function referenceRun(): { log: string; state: string; phase: string; aiSteps: number } {
  const s = newSession();
  let aiSteps = 0;
  for (let i = 0; i < MAX_TURNS && s.phase !== "ENDED"; i += 1) {
    if (s.phase === "AI_TURN") {
      s.step();
      aiSteps += 1;
    } else {
      s.endTurn();
    }
  }
  return { log: JSON.stringify(s.commands()), state: serialize(s.state), phase: s.phase, aiSteps };
}

/** The reference log holds BOTH policies, or it cannot tell a stray step from a right one. */
function discriminates(log: string): void {
  const kinds = (JSON.parse(log) as { kind: string }[]).map((c) => c.kind);
  expect(kinds).toContain("wait");
  expect(kinds.some((k) => k !== "wait"), "the probe never did anything but wait").toBe(true);
}

// ─── the injected scheduler ──────────────────────────────────────────────────

interface Task {
  id: number;
  fn: () => void;
  ms: number;
  cancelled: boolean;
  ran: boolean;
}

/**
 * A queue run by hand, with two misbehaving-scheduler switches. A real `clearTimeout`
 * never fires a cancelled callback and a real timer fires once — but a wedged or late one
 * is exactly what the epoch guard exists for, so the test can turn `deliverCancelled`
 * and `deliverTwice` on and prove the guard catches both rather than trusting the
 * platform to. A LATE fire on its own changes nothing to test: nothing else can move the
 * log during `AI_TURN`, so however late it lands it is still the one live step.
 */
class Queue implements Scheduler {
  tasks: Task[] = [];
  private next = 1;
  constructor(
    private readonly deliverCancelled = false,
    private readonly deliverTwice = false,
  ) {}

  schedule(fn: () => void, ms: number): () => void {
    const task: Task = { id: this.next++, fn, ms, cancelled: false, ran: false };
    this.tasks.push(task);
    return () => {
      task.cancelled = true;
    };
  }

  /** Every task that has not yet run, in the order it would be delivered. */
  due(reverse = false): Task[] {
    const live = this.tasks.filter((t) => !t.ran && (this.deliverCancelled || !t.cancelled));
    return reverse ? live.reverse() : live;
  }

  /** Deliver ONE task and report whether there was one. */
  runOne(reverse = false): boolean {
    const [task] = this.due(reverse);
    if (!task) return false;
    task.ran = true;
    task.fn();
    if (this.deliverTwice) task.fn();
    return true;
  }
}

interface PacedRun {
  log: string;
  state: string;
  phase: string;
  scheduled: number[];
  stale: number;
}

/**
 * Drive the same battle with the PLAYER waiting and the ENEMY advanced only by the
 * pacer's fires. `beforeFire` is the hook a variant uses to move the world between the
 * pause being armed and its callback running.
 */
function pacedRun(
  speed: Speed,
  queue: Queue,
  beforeFire: (s: Session, pacer: Pacer) => void = () => {},
  reverse = false,
): PacedRun {
  const s = newSession();
  const pacer = new Pacer(
    { session: () => s, speed: () => speed, step: (sess) => sess.step() },
    queue,
  );
  const observe = (): void => pacer.observe();
  observe();
  for (let i = 0; i < MAX_TURNS * 4 && s.phase !== "ENDED"; i += 1) {
    if (s.phase === "AI_TURN") {
      beforeFire(s, pacer);
      observe();
      if (!queue.runOne(reverse)) break;
      observe();
    } else {
      s.endTurn();
      observe();
    }
  }
  return {
    log: JSON.stringify(s.commands()),
    state: serialize(s.state),
    phase: s.phase,
    scheduled: queue.tasks.map((t) => t.ms),
    stale: pacer.staleFires(),
  };
}

// ─── AC-V68 ──────────────────────────────────────────────────────────────────

describe("AC-V68: the pacer cannot change the command log", () => {
  const ref = referenceRun();

  it("the fixture discriminates: two policies in the log, many enemy turns", () => {
    discriminates(ref.log);
    expect(ref.aiSteps).toBeGreaterThanOrEqual(10);
    // A DECIDED end — the waiting hero is worn down — so the paced runs below are
    // compared on a whole battle, not on a slice the bound happened to cut.
    expect(ref.phase).toBe("ENDED");
  });

  it.each(SPEEDS)("×%i: paced log and state are byte-identical to the Step seam's", (speed) => {
    const paced = pacedRun(speed, new Queue());
    expect(paced.log).toBe(ref.log);
    expect(paced.state).toBe(ref.state);
    expect(paced.phase).toBe(ref.phase);
    // One trigger, one action: exactly one pause armed per enemy turn, every one at
    // this speed's length. The speed reached the scheduler and nothing else.
    expect(paced.scheduled).toHaveLength(ref.aiSteps);
    expect(new Set(paced.scheduled)).toEqual(new Set([pauseMs(speed)]));
    expect(paced.stale).toBe(0);
  });

  it("delivered twice: a wedged scheduler changes nothing, and the guard was exercised", () => {
    // Every callback fires twice, newest-first. The second copy of each is refused by
    // id; the log is still the reference's, one action per enemy turn.
    const paced = pacedRun(2, new Queue(true, true), () => {}, true);
    expect(paced.log).toBe(ref.log);
    expect(paced.state).toBe(ref.state);
    expect(paced.stale, "no fire was ever stale, so the guard was never tested").toBe(ref.aiSteps);
  });

  it("a watch-mode Step inside the pause: the armed fire is dropped, and a late copy is refused", () => {
    // On every enemy turn the player skips the pause by stepping by hand (the ☰ menu's
    // watch mode) before the pause comes due. The scheduler then delivers the cancelled
    // callback anyway. The step by hand IS the enemy's action — the log must hold
    // exactly one per enemy turn, and the late copy must add nothing.
    let backToBack = 0;
    const queue = new Queue(true);
    const paced = pacedRun(
      3,
      queue,
      (s, pacer) => {
        const before = s.commandCount();
        const armed = queue.tasks.at(-1);
        s.step();
        pacer.observe();
        expect(s.commandCount()).toBe(before + 1);
        // The pause armed for the turn just stepped by hand is CANCELLED, not merely
        // ignored: no timer is left running for a step that already happened. The case
        // that can tell "cancelled" from "forgotten" is a second enemy turn starting
        // right after — counted, and asserted to occur.
        if (s.phase === "AI_TURN") backToBack += 1;
        expect(armed?.cancelled).toBe(true);
      },
    );
    expect(paced.log).toBe(ref.log);
    expect(paced.stale).toBeGreaterThanOrEqual(1);
    expect(backToBack, "no two enemy turns ran back to back").toBeGreaterThanOrEqual(1);
  });

  it("a new battle: a fire armed for the old session is stale on the new one", () => {
    let s: Session | null = newSession();
    const queue = new Queue(true);
    const pacer = new Pacer(
      { session: () => s, speed: () => 1, step: (sess) => sess.step() },
      queue,
    );
    // Reach the first enemy turn.
    for (let i = 0; i < MAX_TURNS && s.phase !== "AI_TURN"; i += 1) s.endTurn();
    expect(s.phase).toBe("AI_TURN");
    pacer.observe();
    expect(pacer.isPending()).toBe(true);
    // Quit, then start over: a different Session object.
    s = null;
    pacer.observe();
    expect(pacer.isPending()).toBe(false);
    s = newSession();
    const before = s.commandCount();
    queue.runOne(); // the old callback, delivered late
    expect(s.commandCount()).toBe(before);
    expect(pacer.staleFires()).toBe(1);
  });

  it("held: AI_TURN sits still, nothing is armed; released: the pause is armed at once", () => {
    const s = newSession();
    const queue = new Queue();
    const pacer = new Pacer(
      { session: () => s, speed: () => 1, step: (sess) => sess.step() },
      queue,
    );
    pacer.hold(true);
    for (let i = 0; i < MAX_TURNS && s.phase !== "AI_TURN"; i += 1) {
      s.endTurn();
      pacer.observe();
    }
    expect(s.phase).toBe("AI_TURN");
    expect(queue.tasks).toHaveLength(0);
    expect(pacer.isPending()).toBe(false);
    pacer.hold(false);
    expect(queue.tasks).toHaveLength(1);
    expect(pacer.isPending()).toBe(true);
  });

  it("rearm on a speed change: same epoch, new pause length, no extra step", () => {
    const s = newSession();
    const queue = new Queue(true);
    let speed: Speed = 1;
    const pacer = new Pacer(
      { session: () => s, speed: () => speed, step: (sess) => sess.step() },
      queue,
    );
    for (let i = 0; i < MAX_TURNS && s.phase !== "AI_TURN"; i += 1) {
      s.endTurn();
      pacer.observe();
    }
    expect(s.phase).toBe("AI_TURN");
    expect(queue.tasks.map((t) => t.ms)).toEqual([pauseMs(1)]);
    speed = 3;
    pacer.rearm();
    expect(queue.tasks.map((t) => t.ms)).toEqual([pauseMs(1), pauseMs(3)]);
    expect(queue.tasks[0]!.cancelled).toBe(true);
    const before = s.commandCount();
    queue.runOne(); // the ×1 callback, delivered anyway — stale, because it was dropped
    expect(s.commandCount()).toBe(before);
    expect(pacer.staleFires()).toBe(1);
    queue.runOne(); // the ×3 one — live
    expect(s.commandCount()).toBe(before + 1);
  });
});

// ─── AC-V69 ──────────────────────────────────────────────────────────────────

describe("AC-V69: the speed toggle is a viewer preference", () => {
  it("×2 and ×3 are exactly half and a third of ×1", () => {
    expect(pauseMs(1)).toBe(BASE_PAUSE_MS);
    expect(pauseMs(2) * 2).toBe(pauseMs(1));
    expect(pauseMs(3) * 3).toBeCloseTo(pauseMs(1), -1);
    expect(pauseMs(3, 900) * 3).toBe(900);
  });

  it("its own key, never the save's", () => {
    expect(PREFS_KEY).not.toBe(SAVE_KEY);
  });

  it("round-trips through a slot; an empty or garbage slot reads ×1", () => {
    const slot = memorySlot();
    expect(readSpeed(slot)).toBe(1);
    writeSpeed(slot, 3);
    expect(readSpeed(slot)).toBe(3);
    slot.write("{not json");
    expect(readSpeed(slot)).toBe(1);
    slot.write(JSON.stringify({ speed: 7 }));
    expect(readSpeed(slot)).toBe(1);
  });

  it("a slot that refuses to store does not take the page down", () => {
    const slot = memorySlot();
    slot.write = () => {
      throw new Error("quota");
    };
    expect(() => writeSpeed(slot, 2)).not.toThrow();
  });

  it("the dial: ×1 → ×2 → ×3 → ×1", () => {
    expect(SPEEDS.map(nextSpeed)).toEqual([2, 3, 1]);
  });
});
