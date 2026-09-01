/**
 * The viewer's motion layer — the timeline, the director, and the beat the sim's own
 * events produce.
 *
 * WHAT THESE TESTS HAVE TO BE ABLE TO SAY NO TO. A motion test that passes with the
 * animation stripped proves nothing, and the shape that reads as working while doing
 * nothing is an optional parameter that is validated and discarded. So each claim below
 * is an A/B between two runs that differ in exactly one thing, and the assertion is on
 * the OUTPUT: the same beat sampled at two instants, the same director with and without
 * reduced motion, the same commit landed and missed.
 *
 * The renderer half of the A/B lives in `iso.test.ts` — what a `MotionState` actually
 * puts on the canvas is only assertable there, through the recording context.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createBattleState,
  defaultUnit,
  makeFlatTiles,
  type BattleState,
  type Position,
  type UnitState,
} from "../sim/index.js";
import {
  MOTION_MS,
  MotionDirector,
  beatDuration,
  sampleBeat,
  settledMotion,
  type MotionBeat,
} from "./motion.js";
import { Session } from "./session.js";

const HERO: Position = { x: 1, y: 2 };
const FOE: Position = { x: 2, y: 2 };

/**
 * Hero due east of a foe on a flat 5×5 board, both alive and in reach.
 *
 * `accuracy` is the lever: at 100 the opening blow always lands, at 0 it always misses.
 * That is what makes "the attacker leans in only on a LANDED blow" a real A/B rather than
 * two runs of the same thing — and the miss case is the one that separates reading the
 * sim's `ResolutionEvent.landed` from inferring a hit off an HP diff.
 *
 * The foe's HP is large enough that the opening blow cannot KO it, so the battle does not
 * end on the commit under test and the handoff is genuinely reachable.
 */
function fixture(accuracy: number, foeReaction: UnitState["reaction"] = null): () => BattleState {
  return () => {
    const hero: UnitState = defaultUnit("hero", 0, {
      pos: { ...HERO },
      facing: "E",
      speed: 12,
      hp: 400,
      maxHp: 400,
      pa: 10,
      weapon: { wp: 8, formula: "paWp", element: "none", accuracy },
      evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    });
    const foe: UnitState = defaultUnit("foe", 1, {
      pos: { ...FOE },
      facing: "W",
      speed: 11,
      hp: 400,
      maxHp: 400,
      pa: 6,
      brave: 100, // the trigger chance IS Brave; 100 makes a reaction deterministic
      reaction: foeReaction,
      evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    });
    return createBattleState({
      seed: 4242,
      grid: { width: 5, height: 5, tiles: makeFlatTiles(5, 5, 0) },
      units: [hero, foe],
    });
  };
}

/** Step the session until a commit produces a beat with at least one striker. */
function firstStrike(
  accuracy: number,
  foeReaction: UnitState["reaction"] = null,
): { session: Session; beat: MotionBeat } {
  const session = new Session({ makeState: fixture(accuracy, foeReaction), playerTeam: 0 });
  for (let i = 0; i < 20; i++) {
    session.step();
    if (session.beat && session.beat.strikers.length > 0) {
      return { session, beat: session.beat };
    }
  }
  throw new Error("motion.test: no striking commit in 20 steps");
}

// ─────────────────────────────────────────────────────────────────────────────
describe("the beat a commit produces (from the sim's OWN events)", () => {
  it("names the striker, the impact and the handoff", () => {
    const { session, beat } = firstStrike(100);
    expect(beat.strikers.map((s) => s.unitId)).toContain("hero");
    expect(beat.strikers.every((s) => s.landed)).toBe(true);
    const hit = beat.impacts.find((i) => i.unitId === "foe");
    expect(hit).toBeDefined();
    expect(hit!.hpAfter).toBeLessThan(hit!.hpBefore);
    // The HP the beat reports is the HP the sim actually holds — never a guess.
    expect(hit!.hpAfter).toBe(session.state.units.find((u) => u.id === "foe")!.hp);
    expect(beat.popupCount).toBe(session.popups.length);
    expect(beat.handoff).not.toBeNull();
    expect(beat.handoff!.unitId).toBe(session.activeUnitId);
  });

  it("DISCRIMINATING: a MISS is a striker that did not land, with no impact at all", () => {
    // THE REASON `landed` IS CARRIED OUT OF THE EVENT INSTEAD OF INFERRED. An HP diff
    // cannot tell a miss from a landed pure-status action, and it cannot tell WHO struck
    // when a reaction fires — the reactor is credited by `reactionEvents`, not by the
    // diff. This is the discriminating half: same fixture, accuracy 0.
    const landed = firstStrike(100).beat;
    const missed = firstStrike(0).beat;
    expect(landed.strikers.some((s) => s.landed)).toBe(true);
    expect(missed.strikers.length).toBeGreaterThan(0);
    expect(missed.strikers.every((s) => !s.landed)).toBe(true);
    expect(missed.impacts).toHaveLength(0);
    // A miss still produces a label, so it still has something to expire.
    expect(missed.popupCount).toBeGreaterThan(0);
  });

  it("DISCRIMINATING: a COUNTER puts the REACTOR on the beat, not the unit it hit", () => {
    // THE REASON THE REACTION EVENTS ARE CARRIED AND NOT JUST `applied.event`. A counter's
    // damage lands on the ATTACKER, and the striker is the reactor — the HP diff cannot
    // say that, because from the diff's side the attacker is simply a unit that lost HP.
    //
    // The mutation this catches: building the beat from `[applied.event]` alone. Without
    // this fixture nothing in the repo fields a live reaction, so that path was entirely
    // unasserted (measured — the mutation stayed green).
    const plain = firstStrike(100).beat;
    const countered = firstStrike(100, { abilityId: "punch-art.counter", kind: "counter" }).beat;
    expect(plain.strikers.map((s) => s.unitId)).toEqual(["hero"]);
    expect(countered.strikers.map((s) => s.unitId)).toEqual(["hero", "foe"]);
    expect(countered.strikers[1]!.landed).toBe(true);
    // …and it reaches the FRAME. Both units lost HP, so the impacts are identical with
    // or without the reaction event — the difference is entirely in who is a striker.
    // Drop the reactor and the counter-attacker stops leaning INTO its own blow and only
    // recoils from the one it took, which is the opposite direction.
    expect(countered.impacts.map((i) => i.unitId).sort()).toEqual(["foe", "hero"]);
    const withReactor = sampleBeat(countered, 40, (id) => id);
    const withoutReactor = sampleBeat(
      { ...countered, strikers: countered.strikers.slice(0, 1) },
      40,
      (id) => id,
    );
    // Compared as VECTORS, not per axis: the fold moved the attacker onto a tile screen-
    // directly above its target, so `dx` is exactly 0 here and a per-axis sign test
    // compares +0 with -0 and fails for a reason that has nothing to do with the claim.
    const withV = withReactor.unitOffset!.foe!;
    const withoutV = withoutReactor.unitOffset!.foe!;
    expect(withV.dx * withoutV.dx + withV.dy * withoutV.dy).toBeLessThan(0);
    expect(Math.hypot(withV.dx, withV.dy)).toBeGreaterThan(0);
  });

  it("a reset clears the beat, so no animation outlives the battle it belonged to", () => {
    const { session } = firstStrike(100);
    expect(session.beat).not.toBeNull();
    session.reset();
    expect(session.beat).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("the timeline", () => {
  const beatOf = (over: Partial<MotionBeat> = {}): MotionBeat => ({
    strikers: [{ unitId: "hero", pos: HERO, landed: true }],
    impacts: [{ unitId: "foe", pos: FOE, hpBefore: 400, hpAfter: 300 }],
    popupCount: 1,
    handoff: { unitId: "foe", control: "ai" },
    ...over,
  });

  it("a hit commit runs the impact, then the plate; a quiet one runs the plate alone", () => {
    expect(beatDuration(beatOf())).toBe(MOTION_MS.plateDelay + MOTION_MS.plate);
    // No label to expire, so the plate needs no delay to stay clear of one.
    const quiet = beatOf({ strikers: [], impacts: [], popupCount: 0 });
    expect(beatDuration(quiet)).toBe(MOTION_MS.plate);
    // Nothing at all to show — a commit on a battle that just ended.
    expect(beatDuration(beatOf({ strikers: [], impacts: [], popupCount: 0, handoff: null }))).toBe(0);
  });

  it("DISCRIMINATING: the target recoils AWAY from whoever struck it", () => {
    // Not "an offset exists" — the DIRECTION, which is the only part a hard-coded
    // constant would get wrong. The same blow from the opposite side must push the
    // target the opposite way along the screen's isometric axes.
    const fromWest = sampleBeat(beatOf(), 0, (id) => id);
    const fromEast = sampleBeat(
      beatOf({ strikers: [{ unitId: "hero", pos: { x: 3, y: 2 }, landed: true }] }),
      0,
      (id) => id,
    );
    const a = fromWest.unitOffset?.foe;
    const b = fromEast.unitOffset?.foe;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(Math.sign(a!.dx)).toBe(-Math.sign(b!.dx));
    expect(Math.sign(a!.dy)).toBe(-Math.sign(b!.dy));
  });

  it("DISCRIMINATING: nothing moves when the only striker MISSED, even with HP on the floor", () => {
    // THE FIXTURE HAS TO TIE ON NOTHING BUT `landed`, and the obvious one does not: a
    // miss with an EMPTY impact list is decided by the empty list, so dropping the
    // `landed` filter entirely leaves it green (measured — it did).
    //
    // So this one carries an impact AND a striker that did not land. REALIZABLE, not
    // contrived: the actor's blow misses while a CHARGE maturing during the same advance
    // takes HP off somebody. The charge's damage reaches `impacts` through the HP diff
    // and has no striker of its own, so the only striker on the beat is the one that
    // whiffed. Lean on it and a unit lurches at a victim it never touched.
    const hit = sampleBeat(beatOf(), 40, (id) => id);
    expect(hit.unitOffset?.hero).toBeDefined();
    expect(hit.unitOffset?.foe).toBeDefined();

    const miss = sampleBeat(
      beatOf({ strikers: [{ unitId: "hero", pos: HERO, landed: false }] }),
      40,
      (id) => id,
    );
    expect(miss.unitOffset).toBeUndefined();
    // …and the beat is otherwise identical, so the difference is the flag and nothing
    // else: the drain still runs, because HP did move.
    expect(miss.hpShown?.foe).toBeDefined();
  });

  it("DISCRIMINATING: the drain trails the loss and arrives at the sim's real HP", () => {
    const start = sampleBeat(beatOf(), 0, (id) => id);
    const mid = sampleBeat(beatOf(), 140, (id) => id);
    const end = sampleBeat(beatOf(), 280, (id) => id);
    expect(start.hpShown?.foe).toBeCloseTo(400, 5);
    expect(mid.hpShown!.foe!).toBeLessThan(start.hpShown!.foe!);
    expect(mid.hpShown!.foe!).toBeGreaterThan(300);
    expect(end.hpShown?.foe).toBeCloseTo(300, 5);
  });

  it("DISCRIMINATING: a HEAL gets no recoil, no flash and no drain", () => {
    const healed = sampleBeat(
      beatOf({ impacts: [{ unitId: "foe", pos: FOE, hpBefore: 300, hpAfter: 400 }] }),
      0,
      (id) => id,
    );
    expect(healed.unitOffset?.foe).toBeUndefined();
    expect(healed.unitFlash?.foe).toBeUndefined();
    expect(healed.hpShown?.foe).toBeUndefined();
  });

  it("DISCRIMINATING: the plate waits for the numeral to leave, and holds ~700 ms", () => {
    // The owner's call: option B's motion with option C's longer hold. Both halves are
    // asserted, because a plate that appeared at t = 0 would land on top of a damage
    // numeral that has not started fading, and one that held 440 ms would be the timing
    // that was NOT chosen.
    const nameOf = (id: string): string => `Name:${id}`;
    const beat = beatOf();
    expect(sampleBeat(beat, 0, nameOf).plate).toBeUndefined();
    expect(sampleBeat(beat, MOTION_MS.plateDelay - 1, nameOf).plate).toBeUndefined();
    const up = sampleBeat(beat, MOTION_MS.plateDelay + 90, nameOf);
    expect(up.plate?.alpha).toBeCloseTo(1, 5);
    // Still fully up at 440 ms into its own window — where option B's plate had already
    // finished. Then gone by the end of the 700 ms one.
    expect(sampleBeat(beat, MOTION_MS.plateDelay + 440, nameOf).plate?.alpha).toBeCloseTo(1, 5);
    expect(sampleBeat(beat, MOTION_MS.plateDelay + MOTION_MS.plate, nameOf).plate).toBeUndefined();
  });

  it("DISCRIMINATING: the plate's text comes from the caller's mapping, not from the id", () => {
    // Same shape as `unitColor`: a table baked into the layer would miss every id the
    // other page ships. Two different mappings over one beat must give two different
    // plates — asserting only that `nameOf` was CALLED would pass on a version that
    // called it and then printed the raw id.
    const beat = beatOf();
    const t = MOTION_MS.plateDelay + 200;
    expect(sampleBeat(beat, t, () => "Vance").plate?.text).toBe("Vance");
    expect(sampleBeat(beat, t, () => "Ottoline").plate?.text).toBe("Ottoline");
  });

  it("the ring sweeps in from a quarter turn, never from nothing", () => {
    const beat = beatOf();
    expect(sampleBeat(beat, 0, (id) => id).ringSweep).toBeCloseTo(0.25, 5);
    expect(sampleBeat(beat, 200, (id) => id).ringSweep).toBeCloseTo(1, 5);
  });

  it("a settled frame keeps the numeral expired rather than putting it back", () => {
    // The half of the popup fix that is NOT the anchor. Returning `undefined` when the
    // clock stops would draw the numeral again, at full opacity, until the next commit —
    // which is exactly the behaviour being removed.
    expect(settledMotion().popupAlpha).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("MotionDirector", () => {
  /** A clock the test moves by hand: no timers, no real elapsed time, no flake. */
  function clock(): { now: () => number; at: (ms: number) => void } {
    let t = 1000;
    return { now: () => t, at: (ms) => { t = 1000 + ms; } };
  }

  const beat: MotionBeat = {
    strikers: [{ unitId: "hero", pos: HERO, landed: true }],
    impacts: [{ unitId: "foe", pos: FOE, hpBefore: 400, hpAfter: 300 }],
    popupCount: 1,
    handoff: { unitId: "foe", control: "ai" },
  };

  it("animates while the clock is inside the beat, then STOPS", () => {
    // The frame loop's exit condition. A director that stayed `running()` would leave a
    // `requestAnimationFrame` loop repainting a static board forever.
    const c = clock();
    const d = new MotionDirector({ now: c.now, reduced: () => false });
    expect(d.running()).toBe(false); // nothing committed yet
    expect(d.sample()).toBeUndefined();

    d.start(beat);
    expect(d.running()).toBe(true);
    c.at(beatDuration(beat) - 1);
    expect(d.running()).toBe(true);
    c.at(beatDuration(beat));
    expect(d.running()).toBe(false);
    expect(d.sample()).toEqual(settledMotion());
  });

  it("DISCRIMINATING: two instants of one beat are two different frames", () => {
    // The A/B that a director which accepted a beat and then ignored the clock fails.
    const c = clock();
    const d = new MotionDirector({ now: c.now, reduced: () => false });
    d.start(beat);
    const first = JSON.stringify(d.sample());
    c.at(120);
    expect(JSON.stringify(d.sample())).not.toBe(first);
  });

  it("DISCRIMINATING: reduced motion draws the settled board and starts no loop", () => {
    // Canvas motion is not CSS, so the page's single `prefers-reduced-motion` query
    // cannot reach it. `motion: undefined` is byte-identical to the frame that shipped
    // before this existed (asserted in `iso.test.ts`) — reduced motion removes MOVEMENT,
    // not information, so the damage numeral is deliberately still on screen.
    const c = clock();
    const on = new MotionDirector({ now: c.now, reduced: () => true });
    const off = new MotionDirector({ now: c.now, reduced: () => false });
    on.start(beat);
    off.start(beat);
    expect(on.sample()).toBeUndefined();
    expect(on.running()).toBe(false);
    // The A/B: the same beat at the same instant is a frame for one and nothing for the
    // other. Without this, a director that ignored the preference looks identical.
    expect(off.sample()).toBeDefined();
    expect(off.running()).toBe(true);
  });

  it("a new commit REPLACES the beat in flight rather than queueing behind it", () => {
    // The decision, asserted: an animation is cosmetic catch-up over a result that has
    // already happened, so a second commit discards the first's remaining frames. A queue
    // is the one design that can fall behind the sim.
    const c = clock();
    const d = new MotionDirector({ now: c.now, reduced: () => false });
    d.start(beat);
    c.at(200);
    const midway = JSON.stringify(d.sample());
    d.start(beat); // a second commit, at the same wall-clock instant
    expect(JSON.stringify(d.sample())).not.toBe(midway);
    expect(JSON.stringify(d.sample())).toBe(
      JSON.stringify(sampleBeat(beat, 0, (id) => id)),
    );
  });

  it("settle() jumps to the finished frame; freeze() pins a chosen one", () => {
    // The two capture seams. Both stop `running()`, which is what makes a screenshot
    // taken after them stable rather than racing the next frame.
    const c = clock();
    const d = new MotionDirector({ now: c.now, reduced: () => false });
    d.start(beat);
    d.settle();
    expect(d.running()).toBe(false);
    expect(d.sample()).toEqual(settledMotion());

    d.start(beat);
    d.freeze(0);
    expect(d.running()).toBe(false);
    c.at(9999); // the wall clock runs on; the pinned frame does not move
    expect(JSON.stringify(d.sample())).toBe(JSON.stringify(sampleBeat(beat, 0, (id) => id)));
    d.freeze(null);
    expect(d.sample()).toEqual(settledMotion());
  });

  it("clear() forgets the beat entirely", () => {
    const c = clock();
    const d = new MotionDirector({ now: c.now, reduced: () => false });
    d.start(beat);
    d.clear();
    expect(d.sample()).toBeUndefined();
    expect(d.running()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Determinism. `npm run check:rng` does not scan `src/render`, so this is the
// hand-check made structural.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when `line` is an import that survives compilation. `import type` is erased, so
 * it cannot be used to call anything. Same guard `telemetry.test.ts` uses, and mutation-
 * tested here for the same reason: a guard nobody ran is a claim about untested code.
 */
function valueImportsOf(source: string): string[] {
  return source
    .split("\n")
    .filter(
      (line) =>
        (/^import\s/.test(line) && !/^import\s+type\s/.test(line)) ||
        /^export\s+[^;]*\sfrom\s/.test(line) ||
        /\bimport\s*\(/.test(line),
    );
}

describe("no timing source can reach the command log", () => {
  it("the import guard itself rejects the ways this could break", () => {
    expect(valueImportsOf(`import { MotionDirector } from "./motion.js";`)).toHaveLength(1);
    expect(valueImportsOf(`export { MOTION_MS } from "./motion.js";`)).toHaveLength(1);
    expect(valueImportsOf(`  const m = await import("./motion.js");`)).toHaveLength(1);
    expect(valueImportsOf(`import type { MotionBeat } from "./motion.js";`)).toHaveLength(0);
    expect(valueImportsOf(` * import { MotionDirector } from "./motion.js" would break it.`))
      .toHaveLength(0);
  });

  it("session.ts imports the motion layer for TYPES ONLY", () => {
    // `session.ts` is the one module in `src/render` that emits commands, so it is
    // sim-grade. The beat flows OUT of a commit; after erasure there is nothing from the
    // animation layer that `session.ts` is able to call, so no clock can influence how
    // many commands have been applied. Adding one value import here turns this red.
    const src = readFileSync(fileURLToPath(new URL("./session.ts", import.meta.url)), "utf8");
    const motionImports = valueImportsOf(src).filter((l) => l.includes("motion.js"));
    expect(motionImports).toEqual([]);
    // Non-degeneracy: it really does import it, so the emptiness above is a property of
    // the import KIND and not of an import that is simply absent.
    expect(src).toContain('import type { MotionBeat } from "./motion.js";');
  });

  it("the motion layer cannot reach the session, the shell or a command", () => {
    const src = readFileSync(fileURLToPath(new URL("./motion.ts", import.meta.url)), "utf8");
    const values = valueImportsOf(src);
    // It may read the PROJECTION (the recoil has to travel along the board's own axes)
    // and nothing else. No session, no shell, no `applyCommand`.
    expect(values).toHaveLength(1);
    expect(values[0]).toContain("./iso.js");
  });

  it("DISCRIMINATING: how many commands a session has applied is not a function of time", () => {
    // The claim in plain terms. Two identical sessions, one of them with an animation
    // director driven across a whole beat between every step; the command logs must be
    // byte-identical. A director that could emit or suppress a command would diverge.
    const plain = new Session({ makeState: fixture(100), playerTeam: 0 });
    const animated = new Session({ makeState: fixture(100), playerTeam: 0 });
    let t = 0;
    const d = new MotionDirector({ now: () => t, reduced: () => false });
    for (let i = 0; i < 8; i++) {
      plain.step();
      animated.step();
      if (animated.beat) d.start(animated.beat);
      for (const dt of [0, 40, 200, 600, 1200]) {
        t += dt;
        d.sample();
        d.running();
      }
    }
    expect(JSON.stringify(animated.commands())).toBe(JSON.stringify(plain.commands()));
    expect(animated.turnCount).toBe(plain.turnCount);
    expect(animated.state.tick).toBe(plain.state.tick);
    expect(animated.state.rngCounter).toBe(plain.state.rngCounter);
    // Non-degeneracy: the loop actually ran commands, so the equality is not two zeroes.
    expect(plain.commands().length).toBeGreaterThan(0);
  });
});
