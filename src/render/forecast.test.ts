/**
 * THE FORECAST-VS-REPLAY ORACLE (docs/10 §4 item 7, ADR-0015 Consequences).
 *
 * `forecast()` prices every FUTURE turn at `ASSUMED_FUTURE_TURN_COST` (−80),
 * because it cannot know what a future actor will choose. ADR-0015 disproves
 * that model — a move+act fold costs −100 — so the viewer's timeline is a guess
 * from some slot onwards. Until this file existed, NOTHING checked a forecast
 * against what the sim actually does, which is why the ADR could only record the
 * problem as a landmine for the next slice.
 *
 * These tests check the forecast against REALITY: they advance the sim by
 * applying real `Command`s through `applyCommand` and compare the realized actor
 * order with the order the forecast predicted BEFORE those commands were issued.
 *
 * THE DISCRIMINATING FIXTURE IS PURPOSE-BUILT, AND IT HAS TO BE. Measured here:
 * on the shipped DEMO state the −80 and −100 cost models produce the SAME first
 * eight actors — a "does the fold break the forecast?" test written against the
 * demo map would pass under both models and prove nothing (CLAUDE.md: an AC test
 * must exercise the discriminating case). {@link speedLadder} is built so the two
 * models genuinely disagree, and `the fold moves the realized order` below is the
 * landmine detector: it FAILS if `forecast` is ever "fixed" by pretending the
 * guess is exact, and it is the test the follow-up `ai.ts`-fold slice must keep
 * green.
 */

import { describe, expect, it } from "vitest";
import {
  CT_COST_MOVE_AND_ACT,
  CT_COST_ONE,
  CT_COST_WAIT,
  advanceToDecision,
  applyCommand,
  createBattleState,
  defaultUnit,
  makeFlatTiles,
  moveRange,
  type BattleState,
  type Command,
} from "../sim/index.js";
import {
  ASSUMED_FUTURE_TURN,
  ASSUMED_FUTURE_TURN_COST,
  CHEAPEST_FUTURE_TURN_COST,
  forecast,
  makeDemoBattle,
  type FutureTurn,
} from "./demo.js";
import { turnCost } from "./preview.js";

/** The three prices a real turn can cost (docs/01 §1, AC-02) as settle opts. */
const FOLD: FutureTurn = { didMove: true, didAct: true }; // −100
const ONE_SUB_PHASE: FutureTurn = { didMove: false, didAct: true }; // −80 (the guess)
const WAIT: FutureTurn = { didMove: false, didAct: false }; // −60

const ids = (state: BattleState, n: number, turn?: FutureTurn): string[] =>
  forecast(state, n, turn).entries.map((a) => a.id);

/**
 * A SPEED LADDER built so the −80 guess and the −100 fold give a DIFFERENT actor
 * order, which the demo map does not (see `the demo state cannot discriminate`).
 *
 * Speeds 20 / 17 / 14 / 11 from CT 0 put the opening turns at ticks 5, 6, 8 and
 * 10. `hasty` (20) is the pivot: after a −80 turn it is back at CT 100 on tick 9,
 * BEFORE `slow` gets there; after a −100 fold it is not back until tick 10, where
 * `slow` arrives at CT 110 and outranks it on the pinned tie-break (higher CT
 * first, ADR-0008). So slot 3 is `hasty` under the guess and `slow` in reality —
 * one command's CT price, one flipped slot.
 *
 * `steady` stands adjacent to `hasty` so the opening command can be a REAL folded
 * move+act (move to (1,1), strike (2,0) from there). Everyone carries 500 HP so
 * nobody is KO'd mid-run: a KO'd unit would tick its crystal at −60 instead, i.e.
 * a SECOND deviation from the assumption, which would blur what this fixture
 * isolates. No unit here has a charged ability, so the timeline's composition is
 * fixed and only its CLOCK is under test.
 */
function speedLadder(): BattleState {
  const u = (id: string, teamId: number, x: number, y: number, speed: number) =>
    defaultUnit(id, teamId, {
      pos: { x, y },
      speed,
      move: 3,
      jump: 1,
      hp: 500,
      maxHp: 500,
    });
  return createBattleState({
    seed: 4242,
    grid: { width: 7, height: 4, tiles: makeFlatTiles(7, 4, 0) },
    units: [
      u("hasty", 0, 1, 0, 20),
      u("swift", 0, 0, 2, 17),
      u("steady", 1, 2, 0, 14),
      u("slow", 1, 5, 2, 11),
    ],
  });
}

/** `hasty` strikes the adjacent `steady` WITHOUT moving — one sub-phase, −80. */
const OPEN_ACT: Command = {
  kind: "act",
  abilityId: "basic.attack",
  target: { unitId: "steady" },
};

/** The same strike, folded with a move to (1,1) — both sub-phases, −100. */
const OPEN_FOLD: Command = {
  ...OPEN_ACT,
  move: { to: { x: 1, y: 1 }, order: "before" },
};

/** A plain single-sub-phase move (−80) — exactly what `ai.ts` emits today. */
function nextMove(state: BattleState, unitId: string): Command {
  const to = moveRange(state.grid, state.units, unitId)[0];
  if (!to) throw new Error(`nextMove: ${unitId} has nowhere to go`);
  return { kind: "move", to };
}

/**
 * DRIVE THE SIM FOR REAL and report who actually acted, in order.
 *
 * `opening` is the first command; every later turn takes a plain −80 move, the
 * single-sub-phase shape `ai.ts` emits today. Each actor is read from
 * `advanceToDecision` — the same "who acts next" primitive the viewer and the
 * headless harness share — and then the command is genuinely applied.
 *
 * GUARD: the queue is asserted empty at every step. `advanceToDecision` resolves
 * matured charges INSIDE the advance, so a charge actor would take a real slot
 * that this order never sees; these fixtures declare none, and the assertion is
 * what makes that a checked property rather than an assumption.
 */
function realizedOrder(initial: BattleState, opening: Command, turns: number): string[] {
  let state = initial;
  const order: string[] = [];
  for (let i = 0; i < turns; i++) {
    const decision = advanceToDecision(state);
    expect(decision.state.chargeQueue).toHaveLength(0);
    expect(decision.unitId).not.toBeNull();
    order.push(decision.unitId!);
    state = applyCommand(state, i === 0 ? opening : nextMove(decision.state, decision.unitId!));
  }
  return order;
}

describe("the forecast's one assumption", () => {
  it("is the −80 one-sub-phase turn, and it is bounded by the cheapest real turn", () => {
    expect(ASSUMED_FUTURE_TURN).toEqual(ONE_SUB_PHASE);
    expect(ASSUMED_FUTURE_TURN_COST).toBe(CT_COST_ONE);
    // The boundary walk is a BOUND, not a fourth guess: no legal turn is cheaper
    // than a Wait, so nothing can come round sooner than that walk says.
    expect(CHEAPEST_FUTURE_TURN_COST).toBe(CT_COST_WAIT);
    expect(CHEAPEST_FUTURE_TURN_COST).toBeLessThanOrEqual(ASSUMED_FUTURE_TURN_COST);
    expect(ASSUMED_FUTURE_TURN_COST).toBeLessThanOrEqual(CT_COST_MOVE_AND_ACT);
  });
});

describe("the honesty boundary (Forecast.assumedFrom)", () => {
  it("MEASUREMENT: the demo state's exact prefix is 3 of 8 slots — not trivially 1", () => {
    const { entries, assumedFrom } = forecast(makeDemoBattle(), 8);
    expect(entries).toHaveLength(8);
    // Mage (13), Archer (11), Knight (9), Brawler (8) — then the Mage again. The
    // Mage is the first unit that can possibly need a SECOND turn, and at the
    // cheapest price it gets there at slot 3, ahead of the Brawler's first.
    expect(entries.slice(0, 3).map((a) => a.id)).toEqual(["mage", "archer", "knight"]);
    expect(assumedFrom).toBe(3);
    // Worth stating because the shipped answer would be different if it were 1:
    // the strip really does carry three factual slots, not just the imminent one.
    expect(assumedFrom).toBeGreaterThan(1);
  });

  it("marks the prefix INVARIANT: −60, −80 and −100 walks agree below it", () => {
    for (const state of [makeDemoBattle(), speedLadder()]) {
      const { assumedFrom } = forecast(state, 8);
      const guess = ids(state, 8, ONE_SUB_PHASE).slice(0, assumedFrom);
      expect(ids(state, 8, WAIT).slice(0, assumedFrom)).toEqual(guess);
      expect(ids(state, 8, FOLD).slice(0, assumedFrom)).toEqual(guess);
    }
  });

  it("is TIGHT on the ladder: the models disagree at exactly assumedFrom", () => {
    const state = speedLadder();
    const { assumedFrom } = forecast(state, 8);
    expect(assumedFrom).toBe(3);
    // The boundary would be worthless if it were merely conservative — a forecast
    // that labelled everything "projected" would also pass the invariance test
    // above. Here slot 3 genuinely moves the moment the cost model changes.
    expect(ids(state, 8, ONE_SUB_PHASE)[3]).toBe("hasty");
    expect(ids(state, 8, FOLD)[3]).toBe("slow");
  });

  it("never claims a slot beyond the entries it has", () => {
    const state = speedLadder();
    for (const n of [1, 2, 3, 4, 8]) {
      const f = forecast(state, n);
      expect(f.assumedFrom).toBeGreaterThanOrEqual(0);
      expect(f.assumedFrom).toBeLessThanOrEqual(f.entries.length);
    }
  });
});

describe("forecast vs replay — the oracle", () => {
  it("the DEMO state cannot discriminate: −80 and −100 give the same eight slots", () => {
    // The measurement that justifies `speedLadder`. If this ever starts failing,
    // the demo roster has changed and the landmine test below could in principle
    // be written against it — but until then, a fold test on this map would pass
    // under both cost models and certify nothing.
    const demo = makeDemoBattle();
    expect(ids(demo, 8, FOLD)).toEqual(ids(demo, 8, ONE_SUB_PHASE));
  });

  it("today's single-sub-phase commands realize the FULL forecast (demo state)", () => {
    // The whole strip, not just the prefix: with every command costing −80 the
    // assumption is exactly right, which is precisely why the landmine is
    // invisible today. Moves are used so no charge is ever declared.
    const demo = makeDemoBattle();
    const predicted = forecast(demo, 6).entries.map((a) => a.id);
    const realized = realizedOrder(demo, nextMove(demo, "mage"), 6);
    expect(realized).toEqual(predicted);
  });

  it("today's single-sub-phase commands realize the full forecast (speed ladder)", () => {
    const state = speedLadder();
    const predicted = forecast(state, 4).entries.map((a) => a.id);
    expect(realizedOrder(state, OPEN_ACT, 4)).toEqual(predicted);
    expect(predicted).toEqual(["hasty", "swift", "steady", "hasty"]);
  });

  it("THE LANDMINE: one folded −100 command moves the realized order off the forecast", () => {
    const state = speedLadder();
    const predicted = forecast(state, 4).entries.map((a) => a.id);
    const realized = realizedOrder(state, OPEN_FOLD, 4);

    // Slot 3 is the divergence, concretely: the forecast promises `hasty` comes
    // round again; in the run where `hasty` actually paid −100 for its move+act,
    // `slow` takes that slot instead.
    expect(predicted[3]).toBe("hasty");
    expect(realized[3]).toBe("slow");
    expect(realized).not.toEqual(predicted);

    // ...and this is NOT a fixture artefact: the same command sequence WITHOUT
    // the move clause (the only difference being −80 vs −100) realizes the
    // forecast exactly. The CT price of one command is the whole cause.
    expect(realizedOrder(state, OPEN_ACT, 4)).toEqual(predicted);
  });

  it("the EXACT PREFIX survives the fold — it holds under BOTH cost models", () => {
    // The property the shipped fix actually guarantees, and the green signal the
    // follow-up `ai.ts`-fold slice needs: whatever a future actor chooses, every
    // slot below `assumedFrom` is realized as forecast.
    const state = speedLadder();
    const { entries, assumedFrom } = forecast(state, 4);
    const predicted = entries.map((a) => a.id).slice(0, assumedFrom);
    for (const opening of [OPEN_ACT, OPEN_FOLD]) {
      expect(realizedOrder(state, opening, 4).slice(0, assumedFrom)).toEqual(predicted);
    }
    expect(predicted).toEqual(["hasty", "swift", "steady"]);
  });

  it("holds mid-battle too, not just from the opening frame", () => {
    // Advance three real turns first, so the boundary is exercised on a state
    // with carried-over CT remainders rather than the pristine all-zero clock.
    // Waits (−60), so nobody relocates and `hasty` still stands next to `steady`
    // when its turn comes round — the openings below stay legal.
    let state = speedLadder();
    for (let i = 0; i < 3; i++) {
      state = applyCommand(state, { kind: "wait" });
    }
    expect(advanceToDecision(state).unitId).toBe("hasty");
    const { entries, assumedFrom } = forecast(state, 6);
    const predicted = entries.map((a) => a.id);
    // Non-vacuous on both sides: three factual slots, five projected ones, and
    // the boundary is tight here too (the −60 walk already moves slot 3).
    expect(assumedFrom).toBe(3);
    expect(predicted.slice(0, 3)).toEqual(["hasty", "slow", "swift"]);
    expect(ids(state, 6, WAIT)[3]).not.toBe(predicted[3]);
    for (const opening of [OPEN_ACT, OPEN_FOLD, { kind: "wait" } as Command]) {
      const realized = realizedOrder(state, opening, 6);
      expect(realized.slice(0, assumedFrom)).toEqual(predicted.slice(0, assumedFrom));
    }
  });
});

describe("the preview's next-slot row is labelled by the same boundary", () => {
  it("reports timelineSlotExact iff the slot sits inside assumedFrom", () => {
    const state = speedLadder();
    const decision = advanceToDecision(state);
    expect(decision.unitId).toBe("hasty");

    for (const opts of [WAIT, ONE_SUB_PHASE, FOLD]) {
      const cost = turnCost(decision.state, "hasty", opts);
      const { entries, assumedFrom } = forecast(
        // Re-derive the slot independently of `turnCost` so this is a check, not
        // a restatement: settle a throwaway clone the same way and look it up.
        applyCostToClone(decision.state, "hasty", opts),
        8,
      );
      const idx = entries.findIndex((a) => a.kind === "unit" && a.id === "hasty");
      expect(cost.timelineSlot).toBe(idx === -1 ? null : idx);
      expect(cost.timelineSlotExact).toBe(idx !== -1 && idx < assumedFrom);
    }
  });

  it("staging the FOLD is what pushes the actor's own slot into projected territory", () => {
    // A concrete both-branches case, so neither `true` nor `false` is vacuous:
    // after a Wait the actor is back inside the exact prefix; after paying −100
    // it lands past the boundary and the row must say "projected".
    const decision = advanceToDecision(speedLadder());
    expect(turnCost(decision.state, "hasty", WAIT).timelineSlotExact).toBe(true);
    expect(turnCost(decision.state, "hasty", FOLD).timelineSlotExact).toBe(false);
  });
});

/** Settle a throwaway clone at `opts` — the same shape `turnCost` prices. */
function applyCostToClone(state: BattleState, unitId: string, opts: FutureTurn): BattleState {
  const clone = structuredClone(state);
  const unit = clone.units.find((u) => u.id === unitId)!;
  unit.ct -= opts.didMove && opts.didAct ? 100 : opts.didMove || opts.didAct ? 80 : 60;
  return clone;
}
