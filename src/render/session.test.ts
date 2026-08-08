/**
 * The docs/10 turn state machine, tested HEADLESSLY (no DOM, no canvas) — which
 * is the whole reason `session.ts` is DOM-free.
 *
 * FIXTURES ARE PURPOSE-BUILT, NOT THE DEMO MAP. Every case below is written so
 * the PLAUSIBLE WRONG BEHAVIOUR gives a DIFFERENT answer (CLAUDE.md: an AC test
 * must exercise the discriminating case). That is impossible on the demo map for
 * the legality ACs: its max orthogonal height delta is 1 and the lowest `jump` on
 * the field is 1, so NO tile there is excluded by jump, and the impassable rock at
 * (6,2) is outside every unit's opening move range — a legality test on that map
 * would pass against a naive Manhattan/radius viewer too. So the fixtures below
 * put an impassable tile and an over-`jump` step INSIDE the naive radius, and
 * `naiveReachable` (the wrong implementation) is asserted against explicitly.
 * The demo map itself is deliberately left untouched.
 */

import { describe, expect, it } from "vitest";
import {
  advanceToDecision,
  applyCommand,
  createBattleState,
  decideBalanceProbe,
  defaultUnit,
  makeFlatTiles,
  replay,
  serialize,
  type BattleState,
  type Position,
  type Tile,
  type UnitState,
} from "../sim/index.js";
import { Session } from "./session.js";

/**
 * 8×5 board, flat except:
 *   - (1,1) a HEIGHT-3 plateau — 3 tiles from the hero, i.e. inside a naive
 *     radius, but every approach step is a delta of 3 against `jump: 1`;
 *   - (2,3) an IMPASSABLE rock — 1 tile from the hero, deep inside any radius.
 * Hero (team 0, the player) at (3,2) with speed 12 → its turn comes up at CT 108,
 * so the settle assertions read 8 (move+act) vs 28 (move only) exactly as
 * docs/10 AC-P2 specifies. Foe (team 1) at (4,2) faces W with 30 class evasion,
 * so FRONT and SIDE hit chances differ (70 vs 100) — the arc tie-trap is avoided.
 * Foe speed 11 (just under the hero's 12) so the turn genuinely ALTERNATES —
 * otherwise the `AI_TURN` phase would never be reachable and its tests would be
 * degenerate.
 *
 * NOTE on reading CT: after a commit the session has already advanced to the NEXT
 * decision point, which accrues CT again — so a post-commit `unit.ct` does NOT
 * show the settle. The settle is read from `replay(fixture(), commands)`, which
 * lands EXACTLY after the last command (see `driver.ts`'s `replay` docstring).
 */
const HERO_START: Position = { x: 3, y: 2 };
const FOE_TILE: Position = { x: 4, y: 2 };
const FLANK_TILE: Position = { x: 4, y: 1 }; // side arc, 2 steps away, in reach of the foe
const PLATEAU: Position = { x: 1, y: 1 }; // beyond jump
const ROCK: Position = { x: 2, y: 3 }; // impassable

function fixture(): BattleState {
  const width = 8;
  const height = 5;
  const tiles: Tile[] = makeFlatTiles(width, height, 0);
  tiles[PLATEAU.y * width + PLATEAU.x] = { height: 3, passable: true };
  tiles[ROCK.y * width + ROCK.x] = { height: 0, passable: false };

  const hero: UnitState = defaultUnit("hero", 0, {
    pos: { ...HERO_START },
    facing: "E",
    speed: 12,
    move: 3,
    jump: 1,
    // Both sides are deliberately BEEFY: the AC-P9 session plays six turns, and a
    // KO mid-run would end the battle early and silently shorten the command log.
    hp: 400,
    maxHp: 400,
    pa: 10,
    weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 },
    evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
  });
  const foe: UnitState = defaultUnit("foe", 1, {
    pos: { ...FOE_TILE },
    facing: "W",
    speed: 11,
    move: 3,
    jump: 1,
    hp: 400,
    maxHp: 400,
    pa: 6,
    evasion: { classEv: 30, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
  });
  return createBattleState({ seed: 4242, grid: { width, height, tiles }, units: [hero, foe] });
}

const newSession = (): Session => new Session({ makeState: fixture, playerTeam: 0 });

/** The WRONG legality check the viewer must NOT use — present as the foil. */
function naiveReachable(from: Position, to: Position, move: number): boolean {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y) <= move;
}

const unit = (s: BattleState, id: string): UnitState => s.units.find((u) => u.id === id)!;

/**
 * The state EXACTLY after the session's last command settled — i.e. before the
 * session advanced on to the next decision point. This is the only honest place
 * to read an end-of-turn CT: the advance re-accrues CT for everyone.
 */
const settledState = (s: Session): BattleState => replay(fixture(), s.commands());

describe("Session — the turn state machine (docs/10 §3)", () => {
  it("opens on the player's turn with the actor's real move range", () => {
    const s = newSession();
    expect(s.phase).toBe("PLAYER_IDLE");
    expect(s.activeUnitId).toBe("hero");
    expect(unit(s.state, "hero").ct).toBe(108);
    expect(s.moveTiles().length).toBeGreaterThan(0);
  });

  it("staging a move enters MOVE_STAGED and touches NOTHING in the sim", () => {
    const s = newSession();
    const posBefore = { ...unit(s.state, "hero").pos };
    s.onPick(FLANK_TILE);
    expect(s.phase).toBe("MOVE_STAGED");
    expect(s.draft).toEqual({ actorId: "hero", move: { to: FLANK_TILE }, act: null });
    expect(s.commands()).toHaveLength(0);
    expect(unit(s.state, "hero").pos).toEqual(posBefore); // the body has NOT moved
  });

  it("re-clicking the staged tile unstages; re-clicking the actor cancels", () => {
    const s = newSession();
    s.onPick(FLANK_TILE);
    s.onPick(FLANK_TILE);
    expect(s.phase).toBe("PLAYER_IDLE");
    expect(s.draft).toBeNull();

    s.onPick(FLANK_TILE);
    s.onPick(HERO_START); // the actor's own tile
    expect(s.phase).toBe("PLAYER_IDLE");
    expect(s.draft).toBeNull();
    expect(s.commands()).toHaveLength(0);
  });

  it("End Turn's label states the price it will pay", () => {
    const s = newSession();
    expect(s.endTurnLabel()).toBe("End Turn · Wait · −60 CT");
    s.onPick(FLANK_TILE);
    expect(s.endTurnLabel()).toBe("End Turn · Move only · −80 CT");
  });
});

describe("AC-P7 — the SIM owns legality (a naive radius passes, this must not)", () => {
  it("an impassable tile inside the naive radius is a no-op with a reason", () => {
    const s = newSession();
    // The foil agrees the rock is reachable; the sim does not.
    expect(naiveReachable(HERO_START, ROCK, 3)).toBe(true);
    expect(s.moveTiles().some((t) => t.x === ROCK.x && t.y === ROCK.y)).toBe(false);

    s.onPick(ROCK);
    expect(s.phase).toBe("PLAYER_IDLE"); // no state change
    expect(s.draft).toBeNull();
    expect(s.commands()).toHaveLength(0);
    expect(s.reason).toBe("Out of Move range");
  });

  it("a height-3 step beyond jump 1, inside the naive radius, is a no-op", () => {
    const s = newSession();
    expect(naiveReachable(HERO_START, PLATEAU, 3)).toBe(true);
    expect(s.moveTiles().some((t) => t.x === PLATEAU.x && t.y === PLATEAU.y)).toBe(false);

    s.onPick(PLATEAU);
    expect(s.phase).toBe("PLAYER_IDLE");
    expect(s.draft).toBeNull();
    expect(s.commands()).toHaveLength(0);
    expect(s.reason).toBe("Out of Move range");
  });

  it("an out-of-ability-range enemy click is refused, not thrown", () => {
    // Move the foe out of reach; clicking it must chip, not throw or commit.
    const far = (): BattleState => {
      const st = fixture();
      unit(st, "foe").pos = { x: 7, y: 4 };
      return st;
    };
    const s = new Session({ makeState: far, playerTeam: 0 });
    expect(() => s.onPick({ x: 7, y: 4 })).not.toThrow();
    expect(s.reason).toBe("Out of Ability range");
    expect(s.commands()).toHaveLength(0);
  });

  it("a null pick (off-board / a height skirt) is a silent no-op", () => {
    const s = newSession();
    s.onPick(null);
    expect(s.reason).toBeNull();
    expect(s.phase).toBe("PLAYER_IDLE");
  });
});

describe("AC-P6 — preview purity: hovering/staging/cancelling move NOTHING", () => {
  it("leaves rngCounter and tick byte-equal across a long interaction burst", () => {
    const s = newSession();
    const rng0 = s.state.rngCounter;
    const tick0 = s.state.tick;
    const snapshot = serialize(s.state);

    for (let i = 0; i < 6; i++) {
      s.onTileHover(FOE_TILE);
      expect(s.preview()).not.toBeNull(); // the preview really is being computed
      s.onPick(FLANK_TILE); // stage
      s.onTileHover(FOE_TILE);
      expect(s.preview()).not.toBeNull();
      s.endTurnCost();
      s.moveTiles();
      s.targets();
      s.cancel();
      s.onTileHover(null);
    }

    expect(s.state.rngCounter).toBe(rng0);
    expect(s.state.tick).toBe(tick0);
    expect(serialize(s.state)).toBe(snapshot);
    expect(s.commands()).toHaveLength(0);

    // DISCRIMINATOR: a committed command DOES move both — so the invariance
    // above is not vacuous (a preview-by-resolving bumps rngCounter per hover;
    // a speculative applyCommand advances tick).
    s.onTileHover(FOE_TILE);
    s.onPick(FOE_TILE);
    expect(s.state.rngCounter).toBeGreaterThan(rng0);
    expect(s.state.tick).toBeGreaterThan(tick0);
  });

  it("recomputes the act preview from the STAGED tile, not the origin", () => {
    const s = newSession();
    s.onTileHover(FOE_TILE);
    const fromOrigin = s.preview()!;
    expect(fromOrigin.moved).toBe(false);
    expect(fromOrigin.facing).toBe("front");
    expect(fromOrigin.turn.cost).toBe(80);
    expect(fromOrigin.turn.ctAfter).toBe(28);

    s.onPick(FLANK_TILE); // stage the flank
    s.onTileHover(FOE_TILE);
    const fromStaged = s.preview()!;
    expect(fromStaged.moved).toBe(true);
    expect(fromStaged.from).toEqual(FLANK_TILE);
    expect(fromStaged.facing).toBe("side");
    // The whole point of the fold: the flank strictly improves the hit chance…
    expect(fromStaged.hitChance).toBeGreaterThan(fromOrigin.hitChance);
    // …and it costs the full turn (docs/01 AC-02: −100, not −80).
    expect(fromStaged.turn.cost).toBe(100);
    expect(fromStaged.turn.ctAfter).toBe(8);
  });

  it("omits every DEFERRED row rather than printing a modeled zero", () => {
    const s = newSession();
    s.onTileHover(FOE_TILE);
    const keys = Object.keys(s.preview()!);
    for (const banned of ["crit", "critical", "reaction", "reactions", "inflicts", "status", "element", "elemental", "aoe", "los"]) {
      expect(keys).not.toContain(banned);
    }
    // …while the honest minimum set IS present (docs/10 §4).
    for (const required of ["hitChance", "facing", "magnitude", "targetHpBefore", "targetHpAfter", "lethal", "turn", "targetStatuses"]) {
      expect(keys).toContain(required);
    }
  });
});

describe("AC-P2 / ADR-0015 — one player turn emits exactly ONE command", () => {
  it("move-then-strike folds into a single act command priced at −100", () => {
    const s = newSession();
    s.onPick(FLANK_TILE);
    s.onPick(FOE_TILE);

    const cmds = s.commands();
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toEqual({
      kind: "act",
      abilityId: "basic.attack",
      target: { unitId: "foe" },
      move: { to: FLANK_TILE, order: "before" },
    });
    const settled = settledState(s);
    expect(unit(settled, "hero").pos).toEqual(FLANK_TILE); // resolved post-move
    expect(unit(settled, "hero").ct).toBe(8); // 108 − 100 (the fold's full price)
    expect(s.turnCount).toBe(1);
  });

  it("End Turn with a staged move emits ONE move command priced at −80", () => {
    const s = newSession();
    s.onPick(FLANK_TILE);
    s.endTurn();
    expect(s.commands()).toEqual([{ kind: "move", to: FLANK_TILE }]);
    expect(unit(settledState(s), "hero").ct).toBe(28); // 108 − 80
  });

  it("End Turn on an empty draft emits ONE wait command priced at −60", () => {
    const s = newSession();
    s.endTurn();
    expect(s.commands()).toEqual([{ kind: "wait" }]);
    expect(unit(settledState(s), "hero").ct).toBe(48); // 108 − 60
  });

  it("a bare enemy click (no staged move) is act-only at −80", () => {
    const s = newSession();
    s.onPick(FOE_TILE);
    expect(s.commands()).toEqual([
      { kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } },
    ]);
    expect(unit(settledState(s), "hero").ct).toBe(28); // 108 − 80
  });
});

describe("AC-P8 — the viewer and the headless harness cannot diverge", () => {
  it("an AI turn resolved in the viewer serializes identically to the harness's", () => {
    const s = newSession();
    s.endTurn(); // hand the turn over; the foe is next
    expect(s.phase).toBe("AI_TURN");

    const before = structuredClone(s.state);
    const activeId = s.activeUnitId!;
    s.step();

    const headless = advanceToDecision(
      applyCommand(before, decideBalanceProbe(before, activeId)),
    ).state;
    expect(serialize(s.state)).toBe(serialize(headless));
  });

  it("input is inert during an AI turn", () => {
    const s = newSession();
    s.endTurn();
    expect(s.phase).toBe("AI_TURN");
    const snapshot = serialize(s.state);
    s.onPick(FLANK_TILE);
    s.onPick(FOE_TILE);
    s.endTurn();
    expect(s.reason).toBe("Not your turn");
    expect(s.draft).toBeNull();
    expect(serialize(s.state)).toBe(snapshot);
    expect(s.commands()).toHaveLength(1); // still just the opening wait
  });
});

describe("AC-P9 — a played session is replayable", () => {
  /**
   * A mixed session: a CANCELLED draft, a COMBINED move+act, AI turns and a
   * bare wait. Driven by PHASE rather than by an assumed turn order — the CT
   * clock decides who is next, and hard-coding that would make the test brittle
   * (and would silently skip a turn if the order shifted, hiding a missing
   * command).
   */
  function playSession(): Session {
    const s = newSession();
    expect(s.phase).toBe("PLAYER_IDLE");
    s.onPick(FLANK_TILE); // stage…
    s.cancel(); // …and cancel: this must leave NO trace in the log
    s.onPick(FLANK_TILE); // stage again
    s.onTileHover(FOE_TILE);
    s.onPick(FOE_TILE); // COMBINED move+act — one command

    for (let i = 0; i < 5; i++) {
      if (s.phase === "AI_TURN") s.step();
      else if (s.phase === "PLAYER_IDLE") s.endTurn();
      else break;
    }
    return s;
  }

  it("replaying (seed, commands) reproduces the live final state byte-for-byte", () => {
    const s = playSession();
    const cmds = s.commands();
    // 6 committed turns, and the CANCELLED draft consumed none of them.
    expect(cmds).toHaveLength(6);
    expect(cmds.filter((c) => c.kind === "act" && c.move !== undefined)).toHaveLength(1);

    // `replay` lands right after the last command; the session has additionally
    // advanced to its next decision point, so mirror that one advance.
    const rebuilt = advanceToDecision(replay(fixture(), cmds)).state;
    expect(serialize(rebuilt)).toBe(serialize(s.state));
  });

  it("rewind-to-K then replay the tail matches the full replay", () => {
    const s = playSession();
    const cmds = s.commands();
    const k = 2;
    const atK = replay(fixture(), cmds.slice(0, k));
    const tail = replay(atK, cmds.slice(k));
    expect(serialize(tail)).toBe(serialize(replay(fixture(), cmds)));
  });
});

describe("Session — watch mode and reset", () => {
  it("Step resolves the active unit regardless of team (the scripted path)", () => {
    const s = newSession();
    expect(s.phase).toBe("PLAYER_IDLE");
    s.step(); // drives the PLAYER's unit through the probe
    expect(s.commands()).toHaveLength(1);
    expect(s.turnCount).toBe(1);
  });

  it("Step discards a staged draft rather than folding it in", () => {
    const s = newSession();
    s.onPick(FLANK_TILE);
    s.step();
    expect(s.draft).toBeNull();
    expect(s.commands()[0]).toEqual(decideBalanceProbe(fixture(), "hero"));
  });

  it("reset rebuilds from the seed and clears the log", () => {
    const s = newSession();
    s.onPick(FOE_TILE);
    expect(s.commands()).toHaveLength(1);
    s.reset();
    expect(s.commands()).toHaveLength(0);
    expect(s.turnCount).toBe(0);
    expect(s.phase).toBe("PLAYER_IDLE");
    expect(unit(s.state, "hero").pos).toEqual(HERO_START);
  });
});
