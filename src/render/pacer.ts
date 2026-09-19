/**
 * THE ENEMY'S TURN RUNS ITSELF (ADR-0044) — and this file owns NO clock.
 *
 * The trigger is the session ENTERING `AI_TURN`. Nothing else starts an enemy action:
 * no button, no tap, no elapsed time. The ×1/×2/×3 speed toggle sets a PAUSE between
 * that event and the one `Session.step()` that shows the action; the pause may be zero.
 *
 * What a clock must never do here (docs/10 §3, docs/05 §3):
 *   - DECIDE a step. One enemy turn starting → at most one `step()`. A pause that comes
 *     due late (a stalled machine, a backgrounded tab) is still one step, never a burst.
 *   - COUNT steps. The pacer does not know how many enemy actions the round holds and
 *     never loops; the next action happens only because the next enemy turn STARTED,
 *     which `observe()` sees after that step's own repaint.
 *   - REACH the sim. Nothing here touches `BattleState`, a seeded roll or a command.
 *
 * THE EPOCH GUARD is what makes a late or duplicated fire harmless: a scheduled step
 * carries the session object, its command count and the active unit at scheduling time,
 * and fires only if all three still hold. Anything that moved the log first — a watch-mode
 * Step, the battle ending, a quit, a new battle — makes the fire STALE, and a stale fire is
 * a no-op that {@link Pacer.staleFires} counts, so a test can assert the guard was
 * actually exercised (AC-V68's discriminator).
 *
 * THE SCHEDULER IS INJECTED, the way `MotionDirector` takes `now`: `game.ts` hands in
 * `setTimeout`, the tests hand in a queue they run by hand, late and out of order. That
 * is why `npm run check:rng` can scan this file alongside `session.ts` — there is nothing
 * in it for the guard to find, by construction.
 */

import type { Session } from "./session.js";
import type { SaveSlot } from "./storage.js";

/** The speed toggle's three settings (ADR-0044 §3). */
export type Speed = 1 | 2 | 3;
export const SPEEDS: readonly Speed[] = [1, 2, 3];

/**
 * PROVISIONAL. The owner's "appropriate pause" (2026-09-12) has no number yet — it is a
 * feel decision taken from rendered options, and the chosen value lands in `docs/10` with
 * AC-V69. Until then this is a placeholder that keeps the mechanism observable, not a
 * rule. Nothing in the sim reads it.
 */
export const BASE_PAUSE_MS = 800;

/** `BASE / speed`, in whole milliseconds. AC-V69 asserts ×2 and ×3 are exact fractions of ×1. */
export function pauseMs(speed: Speed, base: number = BASE_PAUSE_MS): number {
  return Math.round(base / speed);
}

export function isSpeed(v: unknown): v is Speed {
  return v === 1 || v === 2 || v === 3;
}

/** The next setting round the dial: ×1 → ×2 → ×3 → ×1. */
export function nextSpeed(speed: Speed): Speed {
  return speed === 3 ? 1 : ((speed + 1) as Speed);
}

/**
 * Something that runs `fn` after `ms` and hands back a way to cancel it. The page passes
 * `setTimeout`; a test passes a queue. Nothing here samples time itself.
 */
export interface Scheduler {
  schedule(fn: () => void, ms: number): () => void;
}

export interface PacerPorts {
  /** The live battle, or `null` off the battle screen. */
  session: () => Session | null;
  speed: () => Speed;
  /**
   * The ONE way this file advances the sim. The page routes it through its `act()`
   * wrapper so the step is logged, repainted and re-observed like a tap would be.
   */
  step: (session: Session) => void;
}

interface Epoch {
  session: Session;
  count: number;
  unitId: string | null;
}

interface Pending extends Epoch {
  /** Which arming this is. A callback from an arming that was dropped is stale by id. */
  id: number;
  cancel: () => void;
}

export class Pacer {
  private pending: Pending | null = null;
  private held = false;
  private stale = 0;
  private armings = 0;

  constructor(
    private readonly ports: PacerPorts,
    private readonly scheduler: Scheduler,
    private readonly baseMs: number = BASE_PAUSE_MS,
  ) {}

  /**
   * Call after EVERY session mutation (the page calls it from `guard()`). Idempotent:
   * observing the same epoch twice arms nothing new; observing a moved log drops the
   * fire that was armed for the old one.
   */
  observe(): void {
    const session = this.ports.session();
    if (!session || session.phase !== "AI_TURN" || this.held) {
      this.drop();
      return;
    }
    const epoch: Epoch = {
      session,
      count: session.commandCount(),
      unitId: session.activeUnitId,
    };
    if (this.pending && sameEpoch(this.pending, epoch)) return;
    this.drop();
    const id = ++this.armings;
    const cancel = this.scheduler.schedule(
      () => this.fire(epoch, id),
      pauseMs(this.ports.speed(), this.baseMs),
    );
    this.pending = { ...epoch, id, cancel };
  }

  /**
   * The speed changed. A pending pause is re-armed at the new length under the SAME
   * epoch — the step it was going to show is unchanged, only when it shows.
   */
  rearm(): void {
    if (!this.pending) return;
    this.drop();
    this.observe();
  }

  /**
   * THE BROWSER-SPEC SEAM (`GameApi.holdEnemyTurns`). Held, the pacer schedules nothing
   * and `AI_TURN` sits still for a capture, exactly as it did before ADR-0044; watch-mode
   * Step still advances it. Releasing re-observes at once. Not reachable from any
   * control a player has.
   */
  hold(on: boolean): void {
    this.held = on;
    if (on) this.drop();
    else this.observe();
  }

  isHeld(): boolean {
    return this.held;
  }

  /** A pause is armed and has not come due. */
  isPending(): boolean {
    return this.pending !== null;
  }

  /** Fires the epoch guard refused. AC-V68 asserts this is ≥1 wherever it should be. */
  staleFires(): number {
    return this.stale;
  }

  private fire(epoch: Epoch, id: number): void {
    // A callback from an arming that was dropped or already delivered — a duplicate, a
    // wedged timer, a `clearTimeout` that did not take — is stale by id alone, before the
    // world is even looked at. Otherwise this IS the pending arming, and nothing is armed
    // after this line.
    if (this.pending === null || this.pending.id !== id) {
      this.stale += 1;
      return;
    }
    this.pending = null;
    const session = this.ports.session();
    const live =
      !this.held &&
      session !== null &&
      session === epoch.session &&
      session.phase === "AI_TURN" &&
      session.activeUnitId === epoch.unitId &&
      session.commandCount() === epoch.count;
    if (!live) {
      this.stale += 1;
      return;
    }
    this.ports.step(epoch.session);
  }

  private drop(): void {
    if (!this.pending) return;
    this.pending.cancel();
    this.pending = null;
  }
}

function sameEpoch(a: Epoch, b: Epoch): boolean {
  return a.session === b.session && a.count === b.count && a.unitId === b.unitId;
}

// ─── the speed preference ─────────────────────────────────────────────────────

/**
 * ITS OWN KEY, NEVER THE SAVE'S (AC-V69). The speed is "how fast this phone shows me
 * the enemy", not a fact about the run: it survives a new campaign and an erased save,
 * and it appears in no `BattleState` and no `CampaignSave`.
 */
export const PREFS_KEY = "tuh.prefs.v1";

export function readSpeed(slot: SaveSlot): Speed {
  try {
    const raw = slot.read();
    if (raw === null) return 1;
    const parsed: unknown = JSON.parse(raw);
    const speed = (parsed as { speed?: unknown } | null)?.speed;
    return isSpeed(speed) ? speed : 1;
  } catch {
    return 1;
  }
}

/** Best-effort: a browser that refuses storage still gets the speed for this session. */
export function writeSpeed(slot: SaveSlot, speed: Speed): void {
  try {
    slot.write(JSON.stringify({ speed }));
  } catch {
    /* the in-memory value is what the pacer reads; persistence is a convenience */
  }
}
