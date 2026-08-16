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
  attackDamage,
  applyCommand,
  createBattleState,
  decideBalanceProbe,
  defaultUnit,
  makeFlatTiles,
  replay,
  serialize,
  tileAt,
  type BattleState,
  type Command,
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
 * docs/10 AC-V2 specifies. Foe (team 1) at (4,2) faces W with 30 class evasion,
 * so FRONT and SIDE hit chances differ (70 vs 100) — the arc tie-trap is avoided.
 * Foe speed 11 (just under the hero's 12) so the turn genuinely ALTERNATES —
 * otherwise the `AI_TURN` phase would never be reachable and its tests would be
 * degenerate.
 *
 * A SECOND foe stands at (4,0), and it is load-bearing twice over:
 *   - it is the AC-V7 **occupied** exclusion ground: Manhattan-3 from the hero, so
 *     the naive foil calls it reachable, on a tile that is `passable` and at the
 *     hero's own height — i.e. excluded for neither of the other two reasons;
 *   - it makes AC-V9's cancel proof NON-VACUOUS (docs/10 §7 clause 3). With a
 *     single foe the target set was identical whether or not a move was staged
 *     (that foe was adjacent to both tiles), so "the valid-target set differed
 *     from the idle set" was unrealizable. Now staging {@link CANCEL_TILE} swaps
 *     the targetable foe from `foe` to `foe2` — a viewer that ignored staging
 *     entirely gives a different answer.
 * Its speed is 10 (< the hero's 12) so the hero still opens the battle at CT 108.
 *
 * NOTE on reading CT: after a commit the session has already advanced to the NEXT
 * decision point, which accrues CT again — so a post-commit `unit.ct` does NOT
 * show the settle. The settle is read from `replay(fixture(), commands)`, which
 * lands EXACTLY after the last command (see `driver.ts`'s `replay` docstring).
 */
const HERO_START: Position = { x: 3, y: 2 };
const FOE_TILE: Position = { x: 4, y: 2 };
const FOE2_TILE: Position = { x: 4, y: 0 }; // OCCUPIED, inside the naive radius
const FLANK_TILE: Position = { x: 4, y: 1 }; // side arc, 2 steps away, in reach of the foe
const PLATEAU: Position = { x: 1, y: 1 }; // beyond jump
const ROCK: Position = { x: 2, y: 3 }; // impassable
/**
 * The AC-V9 cancel destination (docs/10 §7 clause 2): reachable from the hero's
 * start, adjacent to `foe2` and to NOTHING else the session ever commits — the
 * played log below never names it, and the test asserts that rather than assuming
 * it. Staging it also changes the targetable set ([foe] → [foe2]), which is what
 * makes the cancel proof non-vacuous.
 */
const CANCEL_TILE: Position = { x: 3, y: 0 };
/** In the hero's `moveRange`, OUTSIDE the foe's — the M4 fork construction. */
const FAR_WEST: Position = { x: 0, y: 2 };

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
    // Every side is deliberately BEEFY: the AC-V9 session plays six turns, and a
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
  const foe2: UnitState = defaultUnit("foe2", 1, {
    pos: { ...FOE2_TILE },
    facing: "S",
    speed: 10,
    move: 3,
    jump: 1,
    hp: 400,
    maxHp: 400,
    pa: 6,
    evasion: { classEv: 30, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
  });
  return createBattleState({
    seed: 4242,
    grid: { width, height, tiles },
    units: [hero, foe, foe2],
  });
}

const newSession = (): Session => new Session({ makeState: fixture, playerTeam: 0 });

/** The WRONG legality check the viewer must NOT use — present as the foil. */
function naiveReachable(from: Position, to: Position, move: number): boolean {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y) <= move;
}

const unit = (s: BattleState, id: string): UnitState => s.units.find((u) => u.id === id)!;
const tile = (s: BattleState, p: Position): Tile => tileAt(s.grid, p.x, p.y)!;
const at = (list: readonly Position[], p: Position): boolean =>
  list.some((q) => q.x === p.x && q.y === p.y);

/**
 * Does any position ANYWHERE inside a command name this tile? Walks the command
 * structurally rather than string-matching, so it catches `to`, a tile `target`
 * and a folded `move.to` regardless of key order — docs/10 §7 clause 2 requires
 * that no command name the cancelled destination, not merely that the log length
 * is unchanged.
 */
function mentionsTile(value: unknown, p: Position): boolean {
  if (value === null || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  if (rec.x === p.x && rec.y === p.y) return true;
  return Object.values(rec).some((v) => mentionsTile(v, p));
}

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

describe("AC-V7 — the SIM owns legality (a naive radius passes, this must not)", () => {
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
    // THE JUMP GROUND, NOT THE IMPASSABLE ONE (docs/10 §6). Without this the test
    // would pass on a plateau that happened to be impassable, i.e. it would only
    // be re-testing the case above. The tile is walkable; the HEIGHT DELTA (3
    // against `jump: 1`) is the sole reason the sim excludes it.
    expect(tile(s.state, PLATEAU).passable).toBe(true);
    expect(tile(s.state, PLATEAU).height - tile(s.state, HERO_START).height).toBe(3);
    expect(unit(s.state, "hero").jump).toBe(1);
    expect(at(s.moveTiles(), PLATEAU)).toBe(false);

    s.onPick(PLATEAU);
    expect(s.phase).toBe("PLAYER_IDLE");
    expect(s.draft).toBeNull();
    expect(s.commands()).toHaveLength(0);
    expect(s.reason).toBe("Out of Move range");
  });

  it("an OCCUPIED tile inside the naive radius is a no-op (the third ground)", () => {
    const s = newSession();
    // The foil says reachable: Manhattan 3 from (3,2) against `move: 3`.
    expect(naiveReachable(HERO_START, FOE2_TILE, 3)).toBe(true);
    // NOT excluded for either of the other two reasons — it is passable and flat
    // with the hero's own tile, so OCCUPANCY is the only thing left (grid.ts:
    // "you may not end on any occupied tile").
    expect(tile(s.state, FOE2_TILE).passable).toBe(true);
    expect(tile(s.state, FOE2_TILE).height).toBe(tile(s.state, HERO_START).height);
    expect(unit(s.state, "foe2").pos).toEqual(FOE2_TILE);
    expect(at(s.moveTiles(), FOE2_TILE)).toBe(false);

    s.onPick(FOE2_TILE);
    expect(s.phase).toBe("PLAYER_IDLE"); // no state change
    expect(s.draft).toBeNull();
    expect(s.commands()).toHaveLength(0);
    // And the chip names the REAL reason: the tile holds a unit the hero cannot
    // reach with `basic.attack` (range {h:1,v:1}), not an unreachable tile.
    expect(s.reason).toBe("Out of Ability range");
  });

  it("a KO'd unit's tile is refused as a CRYSTAL, not as 'out of Move range'", () => {
    // `moveRange` counts a corpse as an occupant (grid.ts builds `occupantTeam`
    // from every unit regardless of hp), so the tile really is excluded — but
    // chipping "Out of Move range" over a tile that visibly holds a crystal
    // describes the wrong rule to the player.
    const downed = (): BattleState => {
      const st = fixture();
      const f2 = unit(st, "foe2");
      f2.hp = 0;
      f2.crystalTimer = 3;
      return st;
    };
    const s = new Session({ makeState: downed, playerTeam: 0 });
    expect(at(s.moveTiles(), FOE2_TILE)).toBe(false); // still blocked by the body
    s.onPick(FOE2_TILE);
    expect(s.reason).toBe("A crystal blocks that tile");
    expect(s.phase).toBe("PLAYER_IDLE");
    expect(s.commands()).toHaveLength(0);
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

describe("AC-V6 — preview purity: hovering/staging/cancelling move NOTHING", () => {
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
    for (const banned of ["crit", "critical", "reaction", "reactions", "status", "element", "elemental", "aoe", "los"]) {
      expect(keys).not.toContain(banned);
    }
    // …while the honest minimum set IS present (docs/10 §4).
    //
    // `inflicts` MOVED from the banned list to this one when the on-hit inflict path
    // landed. The rule is not "hide these keys" but "never assert a modeled effect the
    // engine cannot back up": while status-on-hit was unmodeled, showing it lied; now
    // that resolvers apply it, HIDING it lies — the player would commit a Stop-inflicting
    // shot seeing only its damage. Same rule, opposite verdict, because the engine moved.
    for (const required of ["hitChance", "facing", "magnitude", "targetHpBefore", "targetHpAfter", "lethal", "turn", "targetStatuses", "inflicts"]) {
      expect(keys).toContain(required);
    }
  });
});

describe("AC-V4 — the previewed magnitude IS the magnitude dealt (no viewer-side drift)", () => {
  // `preview.ts` MIRRORS the driver's magnitude routing by hand rather than resolving
  // (resolving would consume the seeded stream — AC-V6). A hand-written mirror can drift,
  // and it silently did: both it and the driver keyed on `formula === "physical"`, which
  // routed every authored physical SKILL to the plain weapon swing and made its `power`
  // inert. Nothing tied the previewed number to the dealt number, so the drift was
  // invisible from this side.
  //
  // THE FIXTURE IS DISCRIMINATING BY CONSTRUCTION: `basic.attack.power` is `weapon.wp`,
  // so a skill at power 8 would COINCIDE with the weapon swing and prove nothing. This
  // one uses power 16 on a wp-8 weapon, i.e. the two routes disagree by 2×, and it
  // asserts that disagreement so nobody can later "simplify" it into a tie.
  const SKILL_ID = "skill.strike";
  const SKILL_POWER = 16;

  function skillFixture(): BattleState {
    const width = 8;
    const height = 5;
    const tiles: Tile[] = makeFlatTiles(width, height, 0);
    const base = defaultUnit("hero", 0, {
      pos: { ...HERO_START },
      facing: "E",
      speed: 12,
      move: 3,
      jump: 1,
      hp: 400,
      maxHp: 400,
      pa: 10,
      weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 },
      evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    });
    // The skill is FIRST in the projection, so `targetOptions` picks it over the basic
    // swing (it takes the first matching ability in array order).
    const hero: UnitState = {
      ...base,
      abilities: [
        {
          id: SKILL_ID,
          actionKind: "action",
          formula: "physical",
          power: SKILL_POWER,
          element: "none",
          accuracy: 100,
          range: { h: 1, v: 1 },
          inflicts: [],
          speed: null,
          aoe: null,
        },
        ...base.abilities,
      ],
    };
    // Zero evasion + 100 accuracy ⇒ the swing ALWAYS lands, so a miss can never make the
    // dealt damage 0 and turn this into a flaky test.
    const foe = defaultUnit("foe", 1, {
      pos: { ...FOE_TILE },
      facing: "W",
      speed: 11,
      move: 3,
      jump: 1,
      hp: 400,
      maxHp: 400,
      pa: 6,
      evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    });
    return createBattleState({ seed: 4242, grid: { width, height, tiles }, units: [hero, foe] });
  }

  it("previews a physical SKILL at its own power, and deals exactly that", () => {
    const s = new Session({ makeState: skillFixture, playerTeam: 0 });
    s.onTileHover(FOE_TILE);
    const p = s.preview()!;
    expect(p.hitChance).toBe(100); // the fixture guarantees the hit, so magnitude is dealt

    const before = unit(s.state, "foe").hp;
    s.onPick(FOE_TILE); // commit the act through the ONE tile-driven mutator
    const dealt = before - unit(s.state, "foe").hp;

    expect(dealt).toBeGreaterThan(0);
    expect(p.magnitude).toBe(dealt); // the honesty invariant
    expect(p.targetHpAfter).toBe(before - dealt);
  });

  it("previews the status it will inflict, and the sim then inflicts exactly that", () => {
    // The honesty invariant for the NEW row, same shape as the magnitude one above:
    // it is not enough for the preview to list a status, it must list the status the
    // resolver actually applies. A hand-maintained mirror can drift; this cannot.
    const SLOW_ID = "status.slow";
    const withStatus = (): BattleState => {
      const s = skillFixture();
      const hero = s.units.find((u) => u.id === "hero")!;
      hero.abilities[0]!.inflicts = [
        {
          id: SLOW_ID,
          kind: "debuff",
          ctFactor: 0.5,
          remainingCT: 32,
          preventsAction: false,
          interruptsCharge: false,
          interruptsMagicOnly: false,
          controlsTarget: false,
          controlledByTeamId: null,
        },
      ];
      return s;
    };
    const s = new Session({ makeState: withStatus, playerTeam: 0 });
    s.onTileHover(FOE_TILE);
    const previewed = s.preview()!.inflicts.map((i) => i.id);
    expect(previewed).toEqual([SLOW_ID]); // the panel promises it…

    s.onPick(FOE_TILE); // …and the commit delivers exactly it
    expect(unit(s.state, "foe").statuses.map((st) => st.id)).toEqual(previewed);

    // Non-vacuity: the SAME fixture without the inflict previews an empty list and
    // leaves the target clean, so the assertions above are about the status and not
    // about a target that was always going to end up in that state.
    const plain = new Session({ makeState: skillFixture, playerTeam: 0 });
    plain.onTileHover(FOE_TILE);
    expect(plain.preview()!.inflicts).toEqual([]);
    plain.onPick(FOE_TILE);
    expect(unit(plain.state, "foe").statuses).toEqual([]);
  });

  it("the fixture genuinely separates the two routes (else the test above is a tie)", () => {
    // pa 10 × wp 8 = 80 for the weapon route, pa 10 × power 16 = 160 for the ability
    // route, before the shared Zodiac step — so the previewed number could only match the
    // dealt number by both taking the SAME route. Asserted, not assumed.
    const s = new Session({ makeState: skillFixture, playerTeam: 0 });
    s.onTileHover(FOE_TILE);
    const skillMagnitude = s.preview()!.magnitude;
    const hero = unit(s.state, "hero");
    const weaponSwing = attackDamage(hero, unit(s.state, "foe"));
    expect(skillMagnitude).not.toBe(weaponSwing);
    expect(hero.abilities[0]!.id).toBe(SKILL_ID); // …and it really is the skill being previewed
  });
});

describe("AC-V2 / ADR-0015 — one player turn emits exactly ONE command", () => {
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

describe("AC-V8 — the viewer and the headless harness cannot diverge", () => {
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

describe("AC-V9 — a played session is replayable", () => {
  /**
   * A mixed session: a CANCELLED draft, a COMBINED move+act, AI turns and a
   * bare wait. Driven by PHASE rather than by an assumed turn order — the CT
   * clock decides who is next, and hard-coding that would make the test brittle
   * (and would silently skip a turn if the order shifted, hiding a missing
   * command).
   *
   * THE CANCEL PROOF LIVES HERE, all three docs/10 §7 clauses in one place:
   *   1. STATE IDENTITY — `serialize()` before staging === after cancel. Catches
   *      speculative-apply-and-rollback: `tick`, `rngCounter` and `turnLog` are
   *      all inside that string.
   *   2. LOG IDENTITY — unchanged length here, plus the final test's assertion
   *      that NO command anywhere names {@link CANCEL_TILE}. That is why the
   *      cancelled tile is (3,0) and not the flank tile: the session commits the
   *      flank tile two lines later, so cancelling it could never satisfy clause 2.
   *   3. NON-VACUITY — the draft really held the staged destination AND the
   *      targetable set really changed ([foe] → [foe2]). A viewer that ignored
   *      staging altogether passes 1 and 2 but fails this.
   */
  function playSession(): Session {
    const s = newSession();
    expect(s.phase).toBe("PLAYER_IDLE");

    // ── clause 1 (before) + clause 3 (the idle baseline).
    const beforeStaging = serialize(s.state);
    const idleTargets = s.targets().map((t) => t.unit.id);
    expect(idleTargets).toEqual(["foe"]);

    s.onPick(CANCEL_TILE); // stage a tile the session NEVER commits…
    expect(s.phase).toBe("MOVE_STAGED");
    // ── clause 3: the draft is real, and staging genuinely moved the target set.
    expect(s.draft).toEqual({ actorId: "hero", move: { to: CANCEL_TILE }, act: null });
    const stagedTargets = s.targets().map((t) => t.unit.id);
    expect(stagedTargets).toEqual(["foe2"]);
    expect(stagedTargets).not.toEqual(idleTargets);

    s.cancel(); // …and cancel: this must leave NO trace anywhere
    // ── clause 1 (after): byte-identical, in THIS test and not only in AC-V6's.
    expect(serialize(s.state)).toBe(beforeStaging);
    // ── clause 2 (length half; the "names it" half is asserted on the full log).
    expect(s.commands()).toHaveLength(0);
    expect(s.draft).toBeNull();
    expect(s.phase).toBe("PLAYER_IDLE");

    s.onPick(FLANK_TILE); // now play for real
    s.onTileHover(FOE_TILE);
    s.onPick(FOE_TILE); // COMBINED move+act — one command

    for (let i = 0; i < 5; i++) {
      if (s.phase === "AI_TURN") s.step();
      else if (s.phase === "PLAYER_IDLE") s.endTurn();
      else break;
    }
    return s;
  }

  it("the cancelled destination is named by NO command in the finished log", () => {
    const cmds: Command[] = playSession().commands();
    expect(cmds.length).toBeGreaterThan(0);
    // docs/10 §7 clause 2. Non-degenerate: the SAME walker does find the tile the
    // session did commit, so this is a real search and not a matcher that always
    // returns false.
    expect(cmds.some((c) => mentionsTile(c, CANCEL_TILE))).toBe(false);
    expect(cmds.some((c) => mentionsTile(c, FLANK_TILE))).toBe(true);
  });

  it("replaying (seed, commands) reproduces the live final state byte-for-byte", () => {
    const s = playSession();
    const cmds = s.commands();
    // 6 committed turns, and the CANCELLED draft consumed none of them.
    expect(cmds).toHaveLength(6);
    // TWO folded commands since 2026-08-12, not one: the PLAYER's staged move+attack plus
    // one the AI now issues itself, because `ai.ts` learned ADR-0015's fold. The player
    // half is unchanged — what grew is the log's AI half — and the byte-for-byte replay
    // assertion below is what actually carries AC-V9.
    expect(cmds.filter((c) => c.kind === "act" && c.move !== undefined)).toHaveLength(2);

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

describe("docs/10 §3 — target selection is NOT mouse-only", () => {
  it("arrow keys walk the cursor onto an enemy and Enter commits the act", () => {
    const s = newSession();
    // The cursor starts on the actor, so the keyboard player is never lost.
    expect(s.cursor).toEqual(HERO_START);

    s.moveCursor(1, 0); // → (4,2): the foe
    expect(s.cursor).toEqual(FOE_TILE);
    // The cursor drives the SAME transparency payload a mouse hover does — the
    // point of docs/10 §3's accessibility line is that nothing is mouse-gated.
    const p = s.preview();
    expect(p).not.toBeNull();
    expect(p!.targetId).toBe("foe");
    expect(p!.hitChance).toBeGreaterThan(0);

    // Enter → `onPick(cursor)`, the same single mutator a pointerdown ends in.
    s.onPick(s.cursor);
    expect(s.commands()).toEqual([
      { kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } },
    ]);
  });

  it("arrow keys can stage a move and then strike — the whole fold, keyboard-only", () => {
    const s = newSession();
    s.moveCursor(1, 0); // (4,2) — pass OVER the foe without picking it
    s.moveCursor(0, -1); // (4,1) — the flank tile
    expect(s.cursor).toEqual(FLANK_TILE);
    s.onPick(s.cursor); // Enter: stage
    expect(s.phase).toBe("MOVE_STAGED");

    s.moveCursor(0, 1); // back down onto the foe
    expect(s.cursor).toEqual(FOE_TILE);
    s.onPick(s.cursor); // Enter: commit the fold

    expect(s.commands()).toEqual([
      {
        kind: "act",
        abilityId: "basic.attack",
        target: { unitId: "foe" },
        move: { to: FLANK_TILE, order: "before" },
      },
    ]);
    expect(unit(settledState(s), "hero").pos).toEqual(FLANK_TILE);
  });

  it("the cursor clamps to the grid instead of walking off it", () => {
    const s = newSession();
    for (let i = 0; i < 10; i++) s.moveCursor(-1, -1);
    expect(s.cursor).toEqual({ x: 0, y: 0 });
    for (let i = 0; i < 20; i++) s.moveCursor(1, 1);
    expect(s.cursor).toEqual({ x: s.state.grid.width - 1, y: s.state.grid.height - 1 });
    expect(s.commands()).toHaveLength(0); // walking the cursor commits nothing
  });
});

describe("docs/10 §1 — a viewer/sim FORK is surfaced, never swallowed", () => {
  /**
   * CONSTRUCTING A GENUINE FORK. In normal play there is none, by design: the
   * viewer and the driver both call `moveRange` on the same state, so the pick
   * the viewer allows is the pick the driver accepts. To exercise the failure
   * path we make the two disagree about WHO IS ACTING — `applyCommand` re-runs
   * `advanceToDecision` internally, so injecting a higher CT on another unit
   * hands the turn to it while the session still holds the hero's `moveRange` on
   * screen. The hero's legal destination is then applied to a unit that cannot
   * reach it and the driver really throws.
   */
  it("records `fatal` and rethrows when the sim rejects a pick the viewer allowed", () => {
    const s = newSession();
    expect(s.activeUnitId).toBe("hero");
    expect(at(s.moveTiles(), FAR_WEST)).toBe(true); // the viewer WILL allow this
    s.onPick(FAR_WEST);
    expect(s.phase).toBe("MOVE_STAGED");

    // The fork: the sim will now hand the turn to `foe`, four steps from (0,2)
    // with `move: 3`, so the very same destination is illegal for it.
    unit(s.state, "foe").ct = 500;
    expect(naiveReachable(FOE_TILE, FAR_WEST, 3)).toBe(false);

    expect(() => s.endTurn()).toThrow(/illegal move for foe/);

    // Surfaced LOUDLY: recorded for the renderer AND rethrown, and nothing was
    // recorded into the replayable log on the way out.
    expect(s.fatal).toMatch(/viewer\/sim fork/);
    expect(s.fatal).toMatch(/illegal move for foe/);
    expect(s.commands()).toHaveLength(0);
    expect(s.turnCount).toBe(0);
  });

  it("`fatal` is null on every ordinary refusal — the chip is not cried wolf", () => {
    const s = newSession();
    s.onPick(ROCK);
    s.onPick(PLATEAU);
    s.onPick(FOE2_TILE);
    expect(s.reason).not.toBeNull();
    expect(s.fatal).toBeNull();
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
