/**
 * The viewer's motion layer — COSMETIC CATCH-UP OVER A RESULT THAT HAS ALREADY HAPPENED.
 *
 * THE CONTROLLING PRINCIPLE: motion never blocks input and never gates a step. A commit
 * applies its command, the sim settles, the board is already showing the new truth — and
 * only then does this file start walking the eye through what changed. `Session.accepting`
 * is not narrowed, there is no animating phase, and `autoplay()` still loops `step()`
 * synchronously. A player who clicks mid-animation gets the answer they aimed at, because
 * nothing here is consulted on the way in.
 *
 * THREE THINGS THIS FILE IS DELIBERATELY NOT:
 *
 *   - It is NOT in the sim. Determinism is a P0 invariant and `check:rng` does not scan
 *     `src/render`, so this is the hand-check: nothing here is ever read by `session.ts`,
 *     a {@link MotionBeat} flows OUT of a commit and never back in, and no method below
 *     can emit a `Command`. "How many commands have been applied" stays a function of
 *     input order alone, never of elapsed time.
 *   - It is NOT inside `draw`. The clock is sampled HERE, by the page, and the result is
 *     handed to `draw` as one plain `MotionState` value. One `performance.now()` inside
 *     `draw` would make every renderer A/B non-reproducible.
 *   - It does NOT re-derive anything the sim knows. Who struck, and whether the blow
 *     landed, come out of the sim's own `ResolutionEvent`s (`AppliedCommand.event` and
 *     `.reactionEvents`); a counter-attack's striker is the REACTOR, which only the
 *     events can say. Nothing here walks a path, tests a radius or judges legality.
 *
 * OPTION B (owner's call, 2026-09-01): on a hit the target recoils, flashes and drains
 * behind a pale tail while the attacker leans in; on a handoff the acting unit's ring
 * sweeps in and a name plate names them. No screen shake, no full-width banner — those
 * were options the owner did not pick and they are not implemented.
 *
 * AMENDED THE SAME DAY, from reference footage: the damage numeral sits on the struck
 * unit's head and is allowed to overlap anything, and it holds for {@link MOTION_MS}`
 * .popup` = 1500 ms rather than 400. The blow itself (`impact`) was NOT stretched with
 * it. See ADR-0032's amendment and the anchor block in `iso.ts`.
 */

import type { Position } from "../sim/index.js";
import { project, type MotionState } from "./iso.js";

/**
 * What one committed command DID, in the terms an animation needs.
 *
 * Produced by `Session.commit` and read only here. Every field is a fact the sim already
 * established: the events name the strikers, the HP diff names the impacts (the same diff
 * the popups come from), and the handoff is whoever `advanceToDecision` woke next.
 */
export interface MotionBeat {
  /**
   * Units the sim CREDITED with a blow this commit — the acting unit, plus one per
   * reaction its blow woke, each credited to the reactor.
   *
   * `landed` is the sim's own flag, not an HP diff. That distinction is load-bearing
   * twice: a MISS produces a striker that must not lean, and a landed pure-STATUS action
   * moves no HP at all yet did connect.
   */
  strikers: readonly { unitId: string; pos: Position; landed: boolean }[];
  /** HP movement across the commit, per unit, at the position the unit ended on. */
  impacts: readonly { unitId: string; pos: Position; hpBefore: number; hpAfter: number }[];
  /**
   * How many floating labels the commit produced. Only the COUNT: `draw` is handed the
   * popups themselves by the page, and a second copy here would be a second opinion
   * about what the commit did.
   */
  popupCount: number;
  /** Who acts next once the clock has advanced, or `null` on a battle that just ended. */
  handoff: { unitId: string; control: "player" | "ai" } | null;
}

/**
 * The timeline, in milliseconds. Three of these are DECISIONS, not tuning.
 *
 * `popup` is the owner's call from the reference footage, where the number holds for
 * roughly 1.5–2 s and rises as it fades; ours was 400 ms, which is a flicker by
 * comparison. `plate` is the ~700 ms hold (the art director's option C timing over option
 * B's motion). `impact` is deliberately NOT lengthened with the numeral: the recoil, the
 * flash and the HP drain are the blow itself and a 1.5 s recoil would read as slow
 * motion, so the numeral outlives them by design.
 *
 * `plateDelay` no longer means "wait for the numeral to leave" — at 1500 ms it never
 * could, and overlap is allowed now (ADR-0032's amendment). It is a short beat so the
 * blow lands before the next unit is announced.
 */
export const MOTION_MS = {
  /** The impact reaction: recoil, flash, HP drain. */
  impact: 400,
  /** The floating numeral's whole life: punch, rise, hold, fade out. */
  popup: 1500,
  /** How long the numeral spends fading, at the END of its window. */
  popupFade: 450,
  /** How long after impact the handoff plate begins, when the commit produced a label. */
  plateDelay: 300,
  /** The plate's own window: fade in, hold, fade out. */
  plate: 700,
} as const;

/**
 * How far the numeral travels over its window, in CANVAS PIXELS.
 *
 * Pixels because the numeral is drawn outside the camera transform (`iso.ts`'s label
 * block): a world-unit rise would travel a third further on the smallest map than on the
 * largest one, for the same animation.
 */
export const POPUP_RISE_PX = 26;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Progress 0..1 across `[a, b]`, clamped outside it. */
const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
const easeOut = (u: number): number => 1 - (1 - u) * (1 - u);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

const ORIGIN: Position = { x: 0, y: 0 };

/**
 * Unit-length screen direction from `from` to `to`, in WORLD units.
 *
 * Read THROUGH `project`, never re-derived from tile constants: the recoil has to travel
 * along the same isometric axes the board is painted on, and a second copy of the
 * transform would drift the day the projection changes. `null` when the two coincide.
 */
function screenDir(from: Position, to: Position): { dx: number; dy: number } | null {
  const a = project(from.x, from.y, 0, ORIGIN);
  const b = project(to.x, to.y, 0, ORIGIN);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  return { dx: dx / len, dy: dy / len };
}

/**
 * How long this beat's animation runs. 0 when there is nothing to show.
 *
 * THE NUMERAL IS NOW THE LONGEST STRAND — 1500 ms against the plate's 300 + 700 — so on
 * any commit that produced a label this is the numeral's window. That matters for the
 * frame loop's exit condition: it has to outlast the fade, or the last frame drawn would
 * leave a half-faded number on screen until something else repainted.
 */
export function beatDuration(beat: MotionBeat): number {
  const popup = beat.popupCount > 0 ? MOTION_MS.popup : 0;
  const delay = beat.popupCount > 0 ? MOTION_MS.plateDelay : 0;
  const handoff = beat.handoff ? delay + MOTION_MS.plate : 0;
  const impact = beat.impacts.length > 0 ? MOTION_MS.impact : 0;
  return Math.max(popup, handoff, impact);
}

/**
 * The frame a settled beat leaves behind — and the SECOND half of the popup fix.
 *
 * A finished animation is NOT the same as no animation. Popups used to persist until the
 * next commit; the fade is what removes them, so the settled frame has to keep saying
 * `popupAlpha: 0` after the clock stops. Returning `undefined` here would put the numeral
 * straight back on screen forever.
 */
export function settledMotion(): MotionState {
  return { popupAlpha: 0 };
}

/** The frame for a beat at `t` ms after impact. Pure: same inputs, same output. */
export function sampleBeat(
  beat: MotionBeat,
  t: number,
  nameOf: (unitId: string) => string,
): MotionState {
  const out: MotionState = {};

  // ── the numeral ──────────────────────────────────────────────────────────
  // Runs for EVERY commit that produced a label, damage or MISS or WHIFF alike: the
  // rise-and-fade is what makes a popup expire, and a whiff that never leaves the board
  // is the same defect as a damage number that never leaves it.
  if (beat.popupCount > 0) {
    out.popupRise = POPUP_RISE_PX * easeOut(seg(t, 0, MOTION_MS.popup));
    out.popupAlpha = 1 - seg(t, MOTION_MS.popup - MOTION_MS.popupFade, MOTION_MS.popup);
    out.popupScale = lerp(1.3, 1, easeOut(seg(t, 0, 100)));
  }

  // ── the blow ─────────────────────────────────────────────────────────────
  // Impact is at t = 0 and there is deliberately NO wind-up. `draw` is only ever handed
  // the state AFTER the blow, so a wind-up would show the target already at its new HP
  // with nothing on screen yet saying why.
  const offsets: Record<string, { dx: number; dy: number }> = {};
  const flash: Record<string, number> = {};
  const hpShown: Record<string, number> = {};
  const landed = beat.strikers.filter((s) => s.landed);

  for (const im of beat.impacts) {
    if (im.hpAfter >= im.hpBefore) continue; // a heal does not recoil
    hpShown[im.unitId] = lerp(im.hpBefore, im.hpAfter, easeOut(seg(t, 0, 280)));
    // Capped at 0.55 — see `drawUnit`: a fully white token loses its team colour.
    flash[im.unitId] = 0.55 * (1 - seg(t, 0, 140));
    const striker = landed.find((s) => s.unitId !== im.unitId);
    const dir = striker ? screenDir(striker.pos, im.pos) : null;
    if (dir) {
      const knock = 7 * easeOut(seg(t, 0, 90)) * (1 - easeOut(seg(t, 90, 260)));
      offsets[im.unitId] = { dx: dir.dx * knock, dy: dir.dy * knock };
    }
  }

  // The attacker LEANS IN, and only when the sim says the blow landed. A miss leaves the
  // striker planted, which is the whole reason `landed` is carried out of the event
  // instead of inferred from an HP diff that a landed status action also fails.
  for (const s of landed) {
    const target = beat.impacts.find((im) => im.unitId !== s.unitId);
    const dir = target ? screenDir(s.pos, target.pos) : null;
    if (!dir) continue;
    const lean = 5 * easeOut(seg(t, 0, 70)) * (1 - easeOut(seg(t, 70, 200)));
    offsets[s.unitId] = { dx: dir.dx * lean, dy: dir.dy * lean };
  }

  if (Object.keys(offsets).length > 0) out.unitOffset = offsets;
  if (Object.keys(flash).length > 0) out.unitFlash = flash;
  if (Object.keys(hpShown).length > 0) out.hpShown = hpShown;

  // ── the handoff ──────────────────────────────────────────────────────────
  if (beat.handoff) {
    out.ringSweep = 0.25 + 0.75 * easeOut(seg(t, 0, 200));
    const u = t - (beat.popupCount > 0 ? MOTION_MS.plateDelay : 0);
    const alpha = seg(u, 0, 90) * (1 - seg(u, 520, MOTION_MS.plate));
    if (alpha > 0) {
      out.plate = {
        unitId: beat.handoff.unitId,
        text: nameOf(beat.handoff.unitId),
        alpha,
        rise: lerp(-8, 0, easeOut(seg(u, 40, 200))),
        kind: beat.handoff.control,
      };
    }
  }

  return out;
}

/** Does this browser's user ask for reduced motion? `false` wherever `matchMedia` is absent. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface MotionDirectorOptions {
  /**
   * Display name for the turn plate. A PARAMETER for the same reason `unitColor` is one:
   * only the page knows what a unit is called on its own board — the campaign has record
   * names, the engine demo has `UNIT_META`, and a table baked in here would miss every
   * id the other page ships (that exact miss once painted friend and foe the same grey).
   */
  nameOf?: (unitId: string) => string;
  /** Read live, so a preference changed mid-session is honoured on the next commit. */
  reduced?: () => boolean;
  /** The clock. Injected so tests need no real time and no timers. */
  now?: () => number;
}

/**
 * Holds ONE in-flight animation and answers "what should this frame look like".
 *
 * WHAT HAPPENS WHEN THE NEXT COMMIT LANDS MID-ANIMATION: the in-flight beat is
 * DISCARDED, not blended and not queued — {@link start} replaces it outright and the new
 * beat begins at t = 0. That is sound precisely because nothing is carried: every field
 * of `MotionState` is an offset from rest, the board is redrawn from the new state
 * anyway, and the outgoing beat's own popups have already been replaced by the new
 * commit's. Queueing would be the one design that CAN lag behind the sim.
 *
 * THE NUMERAL STAYS ON THE BEAT'S TIMELINE, AND THAT IS A DECISION (2026-09-01). At
 * 1500 ms against a ~2.4 s turn cadence a numeral is now often still alive when the next
 * action lands, so "should it decay on its own clock instead of being cancelled?" is a
 * real question. The answer is NO, because the numeral is not this file's to keep:
 * `Session.commit` reassigns `popups` and builds the beat in the same call, so the label
 * and its animation are replaced together, atomically. Giving the fade an independent
 * clock would mean holding a COPY of a popup the session has already retired — a second
 * opinion in `src/render` about what the last commit did, which is the thing this layer
 * is not allowed to have.
 *
 * The visible consequence, stated rather than hidden: when the next commit produces no
 * label of its own (a plain move), an in-flight numeral is CUT rather than faded. It is
 * cut because newer news has arrived on the same board. Expiry is guaranteed twice
 * over — by the fade inside the window, and by {@link settledMotion} holding
 * `popupAlpha: 0` after the clock stops — so the defect that started this (a numeral
 * that never left) cannot come back through either door.
 */
export class MotionDirector {
  private readonly nameOf: (unitId: string) => string;
  private readonly reduced: () => boolean;
  private readonly now: () => number;

  private beat: MotionBeat | null = null;
  private startedAt = 0;
  private duration = 0;
  private settled = false;
  /** Test seam: a pinned elapsed value, or `null` for the live clock. */
  private frozen: number | null = null;

  constructor(opts: MotionDirectorOptions = {}) {
    this.nameOf = opts.nameOf ?? ((id) => id);
    this.reduced = opts.reduced ?? prefersReducedMotion;
    this.now = opts.now ?? ((): number => performance.now());
  }

  /**
   * Begin animating a freshly committed beat, replacing whatever was in flight.
   *
   * REDUCED MOTION JUMPS STRAIGHT TO THE SETTLED FRAME — which here means no frame at
   * all: the beat is dropped, {@link sample} returns `undefined`, and the board renders
   * byte-for-byte as it did before motion existed. Note what that deliberately does NOT
   * do: it does not expire the damage numeral. The fade is the only thing that removes a
   * popup, so settling it would cost a reduced-motion reader the damage number
   * entirely. Reduced motion removes MOVEMENT, not information — and the numeral is
   * legible for them anyway, because `iso.ts` sizes and clamps it unconditionally.
   *
   * SAID PLAINLY: a reduced-motion reader's numeral does NOT expire on a timer. It stays
   * until the next commit replaces `Session.popups`, exactly as every popup did before
   * the motion slice. That is the price of not taking the information away, and it is a
   * choice rather than an oversight.
   */
  start(beat: MotionBeat): void {
    if (this.reduced()) {
      this.beat = null;
      return;
    }
    this.beat = beat;
    this.startedAt = this.now();
    this.duration = beatDuration(beat);
    this.settled = false;
  }

  /** Forget the current beat entirely (a reset, or leaving the battle screen). */
  clear(): void {
    this.beat = null;
    this.settled = false;
  }

  /** Jump the current beat to its settled frame. One-shot: the next beat animates. */
  settle(): void {
    this.settled = true;
  }

  /**
   * Test seam: pin the animation clock to `ms` after impact, or `null` for the live one.
   *
   * It exists so a browser spec can screenshot a CHOSEN instant instead of racing one —
   * `03-combat.png` is captioned "a damage popup is necessarily on screen" and that
   * caption is only true of a frame taken while the popup is up. This mutates no game
   * state and emits no command; it is a camera control, not a parallel path into the sim.
   */
  freeze(ms: number | null): void {
    this.frozen = ms;
    if (ms !== null) this.settled = false;
  }

  private elapsed(): number {
    if (this.frozen !== null) return this.frozen;
    if (this.settled) return this.duration;
    return this.now() - this.startedAt;
  }

  /** The value to hand `draw`, or `undefined` when nothing has been committed yet. */
  sample(): MotionState | undefined {
    if (!this.beat) return undefined;
    const t = this.elapsed();
    return t >= this.duration ? settledMotion() : sampleBeat(this.beat, t, this.nameOf);
  }

  /**
   * Is there still a frame to come? THE FRAME LOOP'S EXIT CONDITION — false means stop,
   * which is what keeps this from being a loop that runs forever over a static board. A
   * pinned or settled clock is never running.
   */
  running(): boolean {
    if (!this.beat || this.settled || this.frozen !== null) return false;
    return this.elapsed() < this.duration;
  }
}
