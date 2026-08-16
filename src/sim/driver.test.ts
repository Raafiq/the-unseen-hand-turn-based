import { describe, it, expect } from "vitest";
import { advanceToDecision, applyCommand, replay, replaySteps, type Command } from "./driver.js";
import { abilityDamage, attackDamage, resolveAttack } from "./resolve.js";
import { declareCharge } from "./charge.js";
import { hitChance } from "./formulas.js";
import {
  createBattleState,
  defaultUnit,
  legacyActiveStatus,
  serialize,
  deserialize,
  type BattleState,
  type ChargeEffect,
  type UnitState,
} from "./state.js";
import type { BattleAbility } from "./ability.js";

const MAGIC: ChargeEffect = { kind: "magic", power: 8, element: "none", accuracy: 100, aoe: null, inflicts: [] };

/**
 * Slice 5: issuable actions are the unit's `act` commands, and every combat datum
 * (speed/power/element/accuracy/range) comes from the unit's `abilities`
 * projection — not the command. These helpers give a test unit a charged SPELL
 * ability so an `act` charge can be issued; the basic attack is already auto-added
 * by {@link defaultUnit}.
 */
const SPELL_ID = "spell.nuke";
function spellAbility(effect: ChargeEffect = MAGIC, speed = 20, range = { h: 8, v: 8 }): BattleAbility {
  return {
    id: SPELL_ID,
    actionKind: "action",
    formula: "magic",
    power: effect.power,
    element: effect.element,
    accuracy: effect.accuracy,
    range,
    inflicts: [],
    speed,
    aoe: effect.aoe,
  };
}
/** A unit that also carries the charged SPELL ability (keeps its auto basic attack). */
function spellUnit(id: string, teamId: number, over: Partial<UnitState>, spell = spellAbility()): UnitState {
  const u = defaultUnit(id, teamId, over);
  return { ...u, abilities: [...u.abilities, spell] };
}
const ATTACK = (targetId: string): Command => ({ kind: "act", abilityId: "basic.attack", target: { unitId: targetId } });
const CAST = (x: number, y: number): Command => ({ kind: "act", abilityId: SPELL_ID, target: { x, y } });

/**
 * Two active units (a, b) FLANKING a STOPPED, high-HP "dummy" that never takes a
 * turn — so every command is consumed by a or b, and `basic.attack dummy` / a
 * charge aimed at the dummy's tile are always legal (dummy is never the actor,
 * never dies). a and b sit orthogonally adjacent to the dummy so the melee
 * `basic.attack` (range h:1) is in range from EITHER, and both carry the charged
 * spell. Deterministic by construction: no command's legality depends on WHICH of
 * a/b the scheduler picks.
 */
function harness(seed = 7): BattleState {
  const a = spellUnit("a", 0, { pos: { x: 2, y: 1 }, speed: 10, hp: 500, maxHp: 500 });
  const b = spellUnit("b", 0, { pos: { x: 2, y: 3 }, speed: 13, hp: 500, maxHp: 500 });
  const dummy = defaultUnit("dummy", 1, {
    pos: { x: 2, y: 2 },
    speed: 5,
    statuses: [legacyActiveStatus("stop")],
    hp: 9999,
    maxHp: 9999,
  });
  return createBattleState({ seed, grid: { width: 5, height: 5 }, units: [a, b, dummy] });
}

const LOG: Command[] = [
  { kind: "wait" },
  ATTACK("dummy"),
  CAST(2, 2),
  ATTACK("dummy"),
  { kind: "wait" },
  ATTACK("dummy"),
  CAST(2, 2),
  { kind: "wait" },
  ATTACK("dummy"),
  { kind: "wait" },
  ATTACK("dummy"),
  { kind: "wait" },
];

describe("replay equality — byte-identical at every step (AC-S1)", () => {
  it("two runs of the same (seed, command log) produce byte-identical state at every step", () => {
    const a = replaySteps(harness(), LOG);
    const b = replaySteps(harness(), LOG);
    expect(a).toHaveLength(LOG.length);
    for (let i = 0; i < a.length; i++) {
      expect(serialize(a[i]!)).toBe(serialize(b[i]!));
    }
  });

  it("replay(initial, log) equals the live fold (same function, deterministic)", () => {
    const live = replaySteps(harness(), LOG);
    const replayed = replay(harness(), LOG);
    expect(serialize(replayed)).toBe(serialize(live[live.length - 1]!));
  });

  it("does not mutate the initial state (the log, not the state, is the substrate)", () => {
    const initial = harness();
    const before = JSON.stringify(initial);
    replay(initial, LOG);
    expect(JSON.stringify(initial)).toBe(before);
  });
});

describe("driver auto-resolves charges on the shared timeline (AC-04 wiring)", () => {
  it("a declared charge matures and is resolved by the driver with no command of its own", () => {
    // Caster "c" acts; target "t" is stopped (stays on its tile, never acts).
    const c = spellUnit(
      "c",
      0,
      { pos: { x: 0, y: 0 }, speed: 10 },
      spellAbility({ kind: "magic", power: 10, element: "none", accuracy: 100, aoe: null, inflicts: [] }, 20),
    );
    const t = defaultUnit("t", 1, { pos: { x: 1, y: 0 }, statuses: [legacyActiveStatus("stop")], hp: 300, maxHp: 300, faith: 100 });
    const state = createBattleState({ seed: 3, grid: { width: 5, height: 5 }, units: [c, t] });

    const log: Command[] = [CAST(1, 0), { kind: "wait" }, { kind: "wait" }, { kind: "wait" }];
    const final = replay(state, log);

    expect(final.chargeQueue).toHaveLength(0); // the charge matured and was dequeued
    expect(final.units.find((u) => u.id === "t")!.hp).toBeLessThan(300); // it landed
    expect(final.turnLog.some((e) => /charge \S+ (hit|KO) t/.test(e.action))).toBe(true);
  });
});

describe("rewind then replay (AC-S7)", () => {
  it("resuming from a mid-battle snapshot + the remaining commands == never rewinding", () => {
    const steps = replaySteps(harness(), LOG);
    const finalLive = steps[steps.length - 1]!;

    // "Rewind" to the state after K commands, then replay the rest onto it.
    const K = 5;
    const snapshot = steps[K - 1]!;
    const resumed = replay(snapshot, LOG.slice(K));

    expect(serialize(resumed)).toBe(serialize(finalLive));
  });

  it("rewinding to different points all converge on the same final state", () => {
    const steps = replaySteps(harness(), LOG);
    const finalLive = serialize(steps[steps.length - 1]!);
    for (const k of [1, 3, 7, 10]) {
      const resumed = replay(steps[k - 1]!, LOG.slice(k));
      expect(serialize(resumed)).toBe(finalLive);
    }
  });
});

/**
 * A fully-scripted, single-active-actor battle: "hero" is the only unit that
 * ever takes a turn (the two enemies are Stopped), so every command's legality
 * is fixed and the run is a pure function of (seed, LOG). Exercises a move, two
 * attacks (one lethal → a KO), and two charges that land on the dummy.
 */
function goldenBattle(): BattleState {
  // The hero carries the charged spell it casts as a loadout-derived ability
  // (Slice 5) — the projection supplies the same speed(20)/power(8)/element/
  // accuracy the pre-Slice-5 inline `castCharge` payload did.
  const hero = spellUnit(
    "hero",
    0,
    {
      pos: { x: 0, y: 0 },
      speed: 10,
      pa: 10,
      ma: 10,
      faith: 100,
      hp: 200,
      maxHp: 200,
      evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
      weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 },
      zodiac: { sign: "aries", gender: "male" },
    },
    spellAbility({ kind: "magic", power: 8, element: "none", accuracy: 100, aoe: null, inflicts: [] }, 20),
  );
  const dummy = defaultUnit("dummy", 1, {
    pos: { x: 2, y: 2 },
    statuses: [legacyActiveStatus("stop")],
    hp: 9999,
    maxHp: 9999,
    faith: 100,
    evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    zodiac: { sign: "taurus", gender: "neutral" },
  });
  const victim = defaultUnit("victim", 1, {
    pos: { x: 1, y: 0 },
    statuses: [legacyActiveStatus("stop")],
    hp: 60,
    maxHp: 60,
    faith: 100,
    evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    zodiac: { sign: "taurus", gender: "neutral" },
  });
  return createBattleState({ seed: 424242, grid: { width: 5, height: 5 }, units: [hero, dummy, victim] });
}

const GOLDEN_LOG: Command[] = [
  { kind: "move", to: { x: 1, y: 1 } },
  ATTACK("dummy"),
  CAST(2, 2),
  ATTACK("victim"), // lethal: 80 dmg vs 60 hp → KO
  { kind: "wait" },
  ATTACK("dummy"),
  CAST(2, 2),
  { kind: "wait" },
  { kind: "wait" },
  { kind: "wait" },
];

describe("FROZEN-GOLDEN replay oracle (AC-S1 correctness, not just purity)", () => {
  // The committed literal below was generated from the current (verified-correct)
  // engine output. It is the regression oracle a deterministic-but-WRONG change
  // (e.g. a flipped floor order or a shifted roll cursor) would otherwise slip
  // past — those changes stay reproducible but no longer match this value.
  // INTENTIONAL behavior changes require REGENERATING this golden (re-run and
  // paste the new serialize() output), and should be justified in review.
  // Regenerated at the AoE slice: an ADDITIVE / representation-only bump. The ONLY
  // diffs vs the Slice-7 golden are schemaVersion 7→8 and a `"aoe":null` field
  // appended to every ability projection (single-target, unchanged behavior). Every
  // ROLL-BEARING field is byte-identical: rngCounter stays 5, tick 76, every hp
  // (hero 200, dummy 9679, victim 0/crystal 3), and all 8 turnLog entries are
  // UNCHANGED — this run uses only single-target basic.attack + a null-aoe charge,
  // so the AoE code path is never entered (the no-op invariant, proved here and by
  // the dedicated aoe-noop test below).
  const GOLDEN =
    '{"schemaVersion":9,"seed":424242,"tick":76,"rngCounter":5,"grid":{"width":5,"height":5,"tiles":[{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true},{"height":0,"passable":true}]},"units":[{"id":"hero","teamId":0,"pos":{"x":1,"y":1},"facing":"S","ct":40,"speed":10,"move":3,"jump":3,"hp":200,"maxHp":200,"pa":10,"ma":10,"brave":70,"faith":100,"weapon":{"wp":8,"formula":"paWp","element":"none","accuracy":100},"evasion":{"classEv":0,"weaponEv":0,"shieldEv":0,"accessoryEv":0,"magicEv":0},"zodiac":{"sign":"aries","gender":"male"},"crystalTimer":0,"statuses":[],"abilities":[{"id":"basic.attack","actionKind":"action","formula":"physical","power":8,"element":"none","accuracy":100,"range":{"h":1,"v":1},"inflicts":[],"speed":null,"aoe":null},{"id":"spell.nuke","actionKind":"action","formula":"magic","power":8,"element":"none","accuracy":100,"range":{"h":8,"v":8},"inflicts":[],"speed":20,"aoe":null}]},{"id":"dummy","teamId":1,"pos":{"x":2,"y":2},"facing":"S","ct":0,"speed":5,"move":3,"jump":3,"hp":9679,"maxHp":9999,"pa":10,"ma":10,"brave":70,"faith":100,"weapon":{"wp":8,"formula":"paWp","element":"none","accuracy":100},"evasion":{"classEv":0,"weaponEv":0,"shieldEv":0,"accessoryEv":0,"magicEv":0},"zodiac":{"sign":"taurus","gender":"neutral"},"crystalTimer":0,"statuses":[{"id":"stop","kind":"debuff","ctFactor":0,"remainingCT":1000000000,"preventsAction":true,"interruptsCharge":true,"interruptsMagicOnly":false}],"abilities":[{"id":"basic.attack","actionKind":"action","formula":"physical","power":8,"element":"none","accuracy":100,"range":{"h":1,"v":1},"inflicts":[],"speed":null,"aoe":null}]},{"id":"victim","teamId":1,"pos":{"x":1,"y":0},"facing":"S","ct":0,"speed":5,"move":3,"jump":3,"hp":0,"maxHp":60,"pa":10,"ma":10,"brave":70,"faith":100,"weapon":{"wp":8,"formula":"paWp","element":"none","accuracy":100},"evasion":{"classEv":0,"weaponEv":0,"shieldEv":0,"accessoryEv":0,"magicEv":0},"zodiac":{"sign":"taurus","gender":"neutral"},"crystalTimer":3,"statuses":[{"id":"stop","kind":"debuff","ctFactor":0,"remainingCT":1000000000,"preventsAction":true,"interruptsCharge":true,"interruptsMagicOnly":false}],"abilities":[{"id":"basic.attack","actionKind":"action","formula":"physical","power":8,"element":"none","accuracy":100,"range":{"h":1,"v":1},"inflicts":[],"speed":null,"aoe":null}]}],"chargeQueue":[],"turnLog":[{"tick":10,"unitId":"hero","action":"move 1,1"},{"tick":18,"unitId":"hero","action":"hit dummy −80"},{"tick":26,"unitId":"hero","action":"charge chg.hero.26.0"},{"tick":31,"unitId":"hero","action":"charge chg.hero.26.0 hit dummy −80"},{"tick":34,"unitId":"hero","action":"KO victim"},{"tick":48,"unitId":"hero","action":"hit dummy −80"},{"tick":56,"unitId":"hero","action":"charge chg.hero.56.0"},{"tick":61,"unitId":"hero","action":"charge chg.hero.56.0 hit dummy −80"}]}';

  it("serialize(replay(seed, LOG)) equals the committed golden state", () => {
    const actual = serialize(replay(goldenBattle(), GOLDEN_LOG));
    expect(actual).toBe(GOLDEN);
  });

  // AC-V1 (move+act fold is INERT on the unfolded path). GOLDEN_LOG is entirely
  // single-sub-phase (move-only / act-only / wait), so the fold slice MUST replay
  // it to the byte-identical literal above — this golden is the fold's TRIPWIRE,
  // not a maintenance item. If it ever drifts, the shared path changed and the
  // cause must be fixed, NOT the literal regenerated. The structural assertion
  // below keeps that guarantee honest: a future edit that quietly adds a `move`
  // clause to GOLDEN_LOG would make the byte-equality above vacuous.
  it("AC-V1: GOLDEN_LOG carries NO fold, so the golden proves the unfolded path is untouched", () => {
    expect(GOLDEN_LOG.some((c) => c.kind === "act")).toBe(true); // it does exercise `act`
    expect(GOLDEN_LOG.every((c) => c.kind !== "act" || c.move === undefined)).toBe(true);
    expect(serialize(replay(goldenBattle(), GOLDEN_LOG))).toBe(GOLDEN);
  });

  it("the golden run really contains a KO (representative battle)", () => {
    const final = replay(goldenBattle(), GOLDEN_LOG);
    expect(final.units.find((u) => u.id === "victim")!.hp).toBe(0);
    expect(final.turnLog.some((e) => e.action.includes("KO victim"))).toBe(true);
  });
});

/**
 * A REAL unit dies here (finite HP, NOT the invincible Stopped dummy), so its
 * KO'd turns run through the crystal-countdown branch of applyCommand. Both
 * units share Speed 10 and start at ct 0: on the tick both reach ct 100, the
 * lower id ("hero") acts first and lands the lethal blow on command[0], while
 * "victim" keeps its ct-100 turn — which the driver then auto-spends ticking the
 * crystal counter (no command consumed), keeping the run scripted. Equal speeds
 * matter: a far-faster hero would overshoot ct and permanently out-rank the
 * KO'd unit, so its crystal turns would never surface within the command budget.
 */
function koBattle(): BattleState {
  const hero = defaultUnit("hero", 0, {
    pos: { x: 0, y: 0 },
    speed: 10,
    pa: 10,
    hp: 500,
    maxHp: 500,
    evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 },
  });
  const victim = defaultUnit("victim", 1, {
    pos: { x: 1, y: 0 },
    speed: 10,
    hp: 60,
    maxHp: 60,
    evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
  });
  return createBattleState({ seed: 11, grid: { width: 5, height: 5 }, units: [hero, victim] });
}

const KO_LOG: Command[] = [
  ATTACK("victim"), // KO on hero's first turn
  ...Array.from({ length: 10 }, () => ({ kind: "wait" }) as Command),
];

describe("rewind across a KO (crystal-countdown branch in replay, AC-S7)", () => {
  it("the KO'd unit's crystal counter actually ticks during the run", () => {
    const final = replay(koBattle(), KO_LOG);
    const victim = final.units.find((u) => u.id === "victim")!;
    expect(victim.hp).toBe(0);
    expect(victim.crystalTimer).toBeLessThan(3); // its would-be turns ticked the counter
    expect(final.turnLog.some((e) => e.action.startsWith("crystal") || e.action === "crystallizes")).toBe(true);
  });

  it("rewinding K past the KO and replaying the tail == the continuous run", () => {
    const steps = replaySteps(koBattle(), KO_LOG);
    const finalLive = serialize(steps[steps.length - 1]!);
    const K = 5; // well past the KO at command 1
    const resumed = replay(steps[K - 1]!, KO_LOG.slice(K));
    expect(serialize(resumed)).toBe(finalLive);
  });
});

describe("rewind across the REAL save codec (serialize→deserialize→replay, AC-S7)", () => {
  it("resuming from deserialize(serialize(snapshot)) + the tail == the continuous run", () => {
    const steps = replaySteps(harness(), LOG);
    const finalLive = serialize(steps[steps.length - 1]!);
    const K = 6;
    // Round-trip the snapshot through the actual save codec before resuming.
    const restored = deserialize(serialize(steps[K - 1]!));
    const resumed = replay(restored, LOG.slice(K));
    expect(serialize(resumed)).toBe(finalLive);
  });
});

describe("integrated cancel & whiff through a full replay (AC-S4)", () => {
  it("a charge whose target tile is vacated by a later command WHIFFS", () => {
    // Single actor: casts on its OWN tile, then moves off it before maturity.
    const c = spellUnit(
      "c",
      0,
      { pos: { x: 0, y: 0 }, speed: 10, move: 3, ct: 100 },
      spellAbility({ kind: "magic", power: 10, element: "none", accuracy: 100, aoe: null, inflicts: [] }, 3),
    );
    const state = createBattleState({ seed: 2, grid: { width: 5, height: 5 }, units: [c] });
    const log: Command[] = [
      CAST(0, 0),
      { kind: "move", to: { x: 1, y: 0 } },
      ...Array.from({ length: 8 }, () => ({ kind: "wait" }) as Command),
    ];
    const final = replay(state, log);
    expect(final.chargeQueue).toHaveLength(0);
    expect(final.units[0]?.hp).toBe(c.hp); // the caster was never touched → whiff, not a self-hit
    expect(final.turnLog.some((e) => e.action.includes("whiff"))).toBe(true);
  });

  it("a charge whose caster is KO'd by a faster charge before maturity CANCELS", () => {
    // "aa" (lower id, higher ct) casts a SLOW charge on its own tile; "zz" then
    // casts a FAST charge on aa's tile that KOs aa first → aa's charge cancels.
    const aa = spellUnit(
      "aa",
      0,
      {
        pos: { x: 0, y: 0 },
        speed: 10,
        ct: 90,
        ma: 10,
        faith: 100,
        hp: 60,
        maxHp: 60,
        evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
        zodiac: { sign: "taurus", gender: "neutral" },
      },
      spellAbility({ kind: "magic", power: 8, element: "none", accuracy: 100, aoe: null, inflicts: [] }, 8),
    );
    const zz = spellUnit(
      "zz",
      1,
      {
        // Speed 10 (not far-faster): a huge Speed would overshoot ct and keep
        // out-ranking the maturing slow charge (higher-ct-first), so the charge
        // would never surface to be cancelled within the command budget. ct 80 <
        // aa's 90 makes aa act first (declare the slow charge before zz's KO cast).
        pos: { x: 4, y: 4 },
        speed: 10,
        ct: 80,
        ma: 10,
        faith: 100,
        hp: 500,
        maxHp: 500,
      },
      spellAbility({ kind: "magic", power: 10, element: "none", accuracy: 100, aoe: null, inflicts: [] }, 30),
    );
    const mk = (): BattleState => createBattleState({ seed: 4, grid: { width: 5, height: 5 }, units: [aa, zz] });
    const log: Command[] = [
      CAST(0, 0),
      CAST(0, 0),
      ...Array.from({ length: 20 }, () => ({ kind: "wait" }) as Command),
    ];
    const final = replay(mk(), log);
    expect(final.units.find((u) => u.id === "aa")!.hp).toBe(0); // aa was KO'd by zz's fast charge
    expect(final.turnLog.some((e) => e.action.includes("cancelled"))).toBe(true);
    // Byte-reproducible end to end.
    expect(serialize(final)).toBe(serialize(replay(mk(), log)));
  });
});

describe("advanceToDecision — the shared decision primitive (Slice-2 extraction)", () => {
  it("lands on the next living unit and is IDEMPOTENT at a decision point", () => {
    const s = harness();
    const first = advanceToDecision(s);
    expect(first.terminal).toBeNull();
    expect(first.unitId).not.toBeNull();
    // Re-advancing from a decision point advances zero ticks and re-surfaces the
    // same unit (byte-identical state) — the property the harness relies on.
    const again = advanceToDecision(first.state);
    expect(again.unitId).toBe(first.unitId);
    expect(serialize(again.state)).toBe(serialize(first.state));
  });

  it("reports `stalemate` on a fully-Stopped field (no actor can reach a turn)", () => {
    const s = createBattleState({
      seed: 1,
      grid: { width: 3, height: 3 },
      units: [
        defaultUnit("x", 0, { pos: { x: 0, y: 0 }, statuses: [legacyActiveStatus("stop")] }),
        defaultUnit("y", 1, { pos: { x: 1, y: 1 }, statuses: [legacyActiveStatus("stop")] }),
      ],
    });
    const dec = advanceToDecision(s);
    expect(dec.terminal).toBe("stalemate");
    expect(dec.unitId).toBeNull();
  });

  it("applyCommand lands on the SAME unit advanceToDecision surfaced (no divergence)", () => {
    const s = harness();
    const dec = advanceToDecision(s);
    // The command settles whichever unit is up; applyCommand re-advances to that
    // same unit, so its post-state matches applying to dec.unitId directly.
    const viaApply = applyCommand(s, { kind: "wait" });
    const settled = viaApply.units.find((u) => u.id === dec.unitId)!;
    // The unit that just took a Wait paid CT_COST_WAIT (60); it is the one that
    // was up at the decision point.
    const before = dec.state.units.find((u) => u.id === dec.unitId)!;
    expect(settled.ct).toBe(before.ct - 60);
  });
});

describe("driver — boundary conditions", () => {
  it("replay(initial, []) returns the initial state unchanged", () => {
    const initial = harness();
    expect(serialize(replay(initial, []))).toBe(serialize(initial));
    expect(replaySteps(initial, [])).toEqual([]);
  });

  it("applyCommand on a fully-stalled (all-Stopped) field throws rather than hanging", () => {
    const s = createBattleState({
      seed: 1,
      grid: { width: 3, height: 3 },
      units: [
        defaultUnit("x", 0, { pos: { x: 0, y: 0 }, statuses: [legacyActiveStatus("stop")] }),
        defaultUnit("y", 1, { pos: { x: 1, y: 1 }, statuses: [legacyActiveStatus("stop")] }),
      ],
    });
    expect(() => applyCommand(s, { kind: "wait" })).toThrow(/stalled/);
  });
});

describe("act command — equivalence with the pre-Slice-5 resolvers (safety net)", () => {
  it("a basic.attack act reproduces resolveAttack's draws and damage exactly", () => {
    const mk = (): BattleState => {
      const hero = defaultUnit("hero", 0, {
        pos: { x: 1, y: 1 },
        speed: 10,
        evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
      });
      const foe = defaultUnit("foe", 1, {
        pos: { x: 2, y: 1 },
        statuses: [legacyActiveStatus("stop")],
        hp: 300,
        maxHp: 300,
        evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
      });
      return createBattleState({ seed: 99, grid: { width: 5, height: 5 }, units: [hero, foe] });
    };
    // Direct resolveAttack vs the act path: same seed, same cursor start (0), same
    // single hit draw → identical rngCounter delta and target hp.
    const direct = resolveAttack(mk(), "hero", "foe").state;
    const viaAct = applyCommand(mk(), ATTACK("foe"));
    expect(viaAct.rngCounter).toBe(direct.rngCounter);
    expect(viaAct.units.find((u) => u.id === "foe")!.hp).toBe(direct.units.find((u) => u.id === "foe")!.hp);
  });

  it("a charged-ability act enqueues the same charge payload the old castCharge did", () => {
    const eff: ChargeEffect = { kind: "magic", power: 10, element: "none", accuracy: 100, aoe: null, inflicts: [] };
    const dummyTarget = (): UnitState =>
      defaultUnit("t", 1, { pos: { x: 1, y: 0 }, statuses: [legacyActiveStatus("stop")], hp: 300, maxHp: 300, faith: 100 });
    // Reference: declareCharge with the inline payload the pre-Slice-5 command carried.
    const ref = declareCharge(
      // ct 100 so the direct declareCharge can settle (the act path advances the
      // caster to its turn first; only the payload fields are compared below).
      createBattleState({ seed: 5, grid: { width: 5, height: 5 }, units: [defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, speed: 10, ct: 100 }), dummyTarget()] }),
      "hero",
      { targetTile: { x: 1, y: 0 }, speed: 20, effect: eff },
    );
    // Via act: the hero carries a spell ability with the SAME speed/effect, and the
    // driver sources the charge from that projection instead of a command payload.
    const via = applyCommand(
      createBattleState({ seed: 5, grid: { width: 5, height: 5 }, units: [spellUnit("hero", 0, { pos: { x: 0, y: 0 }, speed: 10 }, spellAbility(eff, 20)), dummyTarget()] }),
      CAST(1, 0),
    );
    expect(via.chargeQueue).toHaveLength(1);
    const refCharge = ref.chargeQueue[0]!;
    const viaCharge = via.chargeQueue[0]!;
    // The ability-derived payload equals the old inline payload (id/ct differ only
    // because the act path matures the caster's turn first — not a payload change).
    expect(viaCharge.speed).toBe(refCharge.speed);
    expect(viaCharge.effect).toEqual(refCharge.effect);
    expect(viaCharge.targetTile).toEqual(refCharge.targetTile);
  });

  it("rejects an act for an ability the unit does not have equipped", () => {
    const hero = defaultUnit("hero", 0, { pos: { x: 1, y: 1 }, speed: 10 });
    const foe = defaultUnit("foe", 1, { pos: { x: 2, y: 1 }, statuses: [legacyActiveStatus("stop")] });
    const s = createBattleState({ seed: 1, grid: { width: 5, height: 5 }, units: [hero, foe] });
    expect(() => applyCommand(s, { kind: "act", abilityId: "nope", target: { unitId: "foe" } })).toThrow(
      /no equipped ability/,
    );
  });

  it("rejects an act whose target is out of the ability's range", () => {
    const hero = defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, speed: 10 });
    const foe = defaultUnit("foe", 1, { pos: { x: 4, y: 4 }, statuses: [legacyActiveStatus("stop")] });
    const s = createBattleState({ seed: 1, grid: { width: 5, height: 5 }, units: [hero, foe] });
    // basic.attack is melee (range h:1); the foe is far off → rejected pre-roll.
    expect(() => applyCommand(s, ATTACK("foe"))).toThrow(/out of range/);
  });
});

describe("act command — an authored physical SKILL reads its own `power` (not the weapon)", () => {
  // THE DEFECT THIS PINS. The driver used to route by `formula === "physical"`, which
  // swept up every authored physical SKILL along with the weapon-derived basic swing —
  // so a skill's `power` was projected, schema-validated, and then discarded, and six
  // shipped abilities dealt a plain weapon swing no matter how they were tuned. Measured
  // before the fix: setting every single-target physical `power` to 1 or to 99 changed
  // 0 of 12 gauntlet runs, against a magic control that changed 12 of 12.
  //
  // These are A/B tests on the BUILT object (CLAUDE.md: a capability that validates its
  // input and then discards it reads as working). Each constructs the same battle twice,
  // differing ONLY in the field under test, and asserts the outputs differ — so every one
  // of them fails if the routing regresses.
  const PHYS_ID = "skill.strike";
  /** An instant, single-target, melee PHYSICAL skill — the exact shape that was inert. */
  function physSkill(power: number): BattleAbility {
    return {
      id: PHYS_ID,
      actionKind: "action",
      formula: "physical",
      power,
      element: "none",
      accuracy: 100,
      range: { h: 1, v: 1 },
      inflicts: [],
      speed: null,
      aoe: null,
    };
  }
  const NO_EV = { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 };
  const STRIKE: Command = { kind: "act", abilityId: PHYS_ID, target: { unitId: "foe" } };

  /** Hero + a stopped, high-HP foe; the hero carries `skill.strike` at `power`. */
  function scene(power: number): BattleState {
    const base = defaultUnit("hero", 0, { pos: { x: 1, y: 1 }, speed: 10, evasion: NO_EV });
    const hero: UnitState = { ...base, abilities: [...base.abilities, physSkill(power)] };
    const foe = defaultUnit("foe", 1, {
      pos: { x: 2, y: 1 },
      statuses: [legacyActiveStatus("stop")],
      hp: 900,
      maxHp: 900,
      evasion: NO_EV,
    });
    return createBattleState({ seed: 99, grid: { width: 5, height: 5 }, units: [hero, foe] });
  }
  const damageAt = (power: number): number => {
    const before = scene(power);
    const after = applyCommand(before, STRIKE);
    return 900 - after.units.find((u) => u.id === "foe")!.hp;
  };

  it("A/B: two powers on the SAME skill deal different damage, and it scales with power", () => {
    const low = damageAt(4);
    const high = damageAt(16);
    expect(low).toBeGreaterThan(0); // it lands at all (a miss would tie them at 0)
    expect(high).toBeGreaterThan(low); // …and the ONLY difference is `power`
    // Not merely "different": four times the power deals four times the damage, so the
    // field is genuinely the multiplier and not, say, a tie broken by rounding.
    expect(high).toBe(low * 4);
  });

  it("a physical skill is NOT pinned to the weapon swing (the pre-fix behaviour)", () => {
    // The discriminating case: `basic.attack` power == weapon.wp == 8, so a skill at
    // power 8 COINCIDES with the weapon swing and proves nothing. Use powers either side.
    const weaponSwing = damageAt(8); // == what every physical skill used to deal
    expect(damageAt(4)).toBeLessThan(weaponSwing);
    expect(damageAt(16)).toBeGreaterThan(weaponSwing);
  });

  it("the basic swing STILL routes to the weapon — proven on a non-paWp weapon", () => {
    // The other half of the split, and it needs a weapon whose formula makes
    // `weaponBaseDamage` DISAGREE with `pa × power`. On the default `paWp` weapon the two
    // agree by construction, so a paWp fixture could not tell the branches apart.
    // `bareHands` = floor(pa × brave / 100) × pa, which at pa 8 / brave 70 is 5 × 8 = 40,
    // while `basic.attack.power` is still weapon.wp (8) → pa × wp would be 64.
    const weapon = { wp: 8, formula: "bareHands" as const, element: "none" as const, accuracy: 100 };
    const hero = defaultUnit("hero", 0, { pos: { x: 1, y: 1 }, speed: 10, pa: 8, brave: 70, weapon, evasion: NO_EV });
    const foe = defaultUnit("foe", 1, {
      pos: { x: 2, y: 1 },
      statuses: [legacyActiveStatus("stop")],
      hp: 900,
      maxHp: 900,
      evasion: NO_EV,
    });
    const s = createBattleState({ seed: 99, grid: { width: 5, height: 5 }, units: [hero, foe] });
    const dealt = 900 - applyCommand(s, ATTACK("foe")).units.find((u) => u.id === "foe")!.hp;
    // Derived, not hard-coded, so the assertion survives a Zodiac/Protect constant change
    // and still says the same thing: the swing took the WEAPON path.
    const basic = hero.abilities.find((a) => a.id === "basic.attack")!;
    expect(dealt).toBe(attackDamage(hero, foe));
    expect(dealt).not.toBe(abilityDamage(hero, foe, basic));
    // The fixture is only meaningful if the two routes genuinely disagree on it — assert
    // that, so nobody later "simplifies" it back to the default paWp weapon where they
    // coincide and the test silently stops discriminating.
    expect(attackDamage(hero, foe)).not.toBe(abilityDamage(hero, foe, basic));
  });
});

describe("driver — move command + settlement", () => {
  it("applies a legal move, settles, and stays byte-reproducible", () => {
    // A lone unit: the scheduler always surfaces it, so `to` legality is fixed.
    const solo = defaultUnit("solo", 0, { pos: { x: 0, y: 0 }, speed: 10, move: 3 });
    const mk = (): BattleState => createBattleState({ seed: 1, grid: { width: 5, height: 5 }, units: [solo] });
    const log: Command[] = [
      { kind: "move", to: { x: 1, y: 0 } },
      { kind: "wait" },
      { kind: "move", to: { x: 1, y: 1 } },
    ];
    const final = replay(mk(), log);
    expect(final.units[0]?.pos).toEqual({ x: 1, y: 1 });
    expect(serialize(final)).toBe(serialize(replay(mk(), log)));
  });

  it("rejects an illegal move (out of range) rather than silently desyncing replay", () => {
    const solo = defaultUnit("solo", 0, { pos: { x: 0, y: 0 }, speed: 10, move: 2 });
    const s = createBattleState({ seed: 1, grid: { width: 8, height: 8 }, units: [solo] });
    expect(() => applyCommand(s, { kind: "move", to: { x: 7, y: 7 } })).toThrow();
  });
});

/**
 * MOVE + ACT FOLD (docs/01 §1–§2, AC-02) — one Active Turn may use Move and Act
 * each at most once, in either order, and pays −100. Before this slice every
 * command settled a single sub-phase, so `CT_COST_MOVE_AND_ACT` was unreachable
 * and a move-then-attack turn was mis-priced.
 *
 * Every test below is built on a DISCRIMINATING fixture: one where honoring the
 * rule gives a different answer than the plausible wrong implementation (settling
 * −80, resolving the act before the move, always moving first, or charge.ts's
 * hard-coded `didMove:false`). A tie/degenerate fixture would pass either way.
 */
describe("move+act fold — one command, one turn (docs/01 §2, AC-02)", () => {
  /** Actor at ct 108, a Stopped punching-bag 2 tiles away (out of melee reach). */
  function foldBattle(seed = 1): BattleState {
    const a = defaultUnit("a", 0, {
      pos: { x: 1, y: 1 },
      ct: 108,
      speed: 10,
      move: 3,
      evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    });
    const dummy = defaultUnit("dummy", 1, {
      pos: { x: 3, y: 3 },
      statuses: [legacyActiveStatus("stop")], // never takes a turn → every command is a's
      hp: 9999,
      maxHp: 9999,
      evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    });
    return createBattleState({ seed, grid: { width: 5, height: 5 }, units: [a, dummy] });
  }
  const ctOf = (s: BattleState, id: string): number => s.units.find((u) => u.id === id)!.ct;
  const posOf = (s: BattleState, id: string): { x: number; y: number } =>
    s.units.find((u) => u.id === id)!.pos;
  const hpOf = (s: BattleState, id: string): number => s.units.find((u) => u.id === id)!.hp;

  /** Step to (2,2) — 2 steps from (1,1) — which puts `dummy` (3,3) in melee reach. */
  const FOLDED: Command = {
    kind: "act",
    abilityId: "basic.attack",
    target: { unitId: "dummy" },
    move: { to: { x: 2, y: 2 }, order: "before" },
  };

  it("AC-V2: ONE combined command settles at −100 (ct 108 → 8); move-only is −80 (→ 28)", () => {
    // DISCRIMINATOR is (ct, command count), not "the attack happened": a two-command
    // move-then-attack ALSO ends up attacking, but pays 80+80 across TWO turns.
    const steps = replaySteps(foldBattle(), [FOLDED]);
    expect(steps).toHaveLength(1); // exactly ONE command consumed
    const folded = steps[0]!;
    expect(ctOf(folded, "a")).toBe(8); // 108 − 100 (move AND act)
    expect(posOf(folded, "a")).toEqual({ x: 2, y: 2 });
    expect(hpOf(folded, "dummy")).toBeLessThan(9999);
    // The SAME actor doing only the move pays 80: 108 → 28.
    const moveOnly = applyCommand(foldBattle(), { kind: "move", to: { x: 2, y: 2 } });
    expect(ctOf(moveOnly, "a")).toBe(28);
    // ...and the act alone is not even legal from the origin (reach 2 > 1), which is
    // why the fold — not two cheap turns — is what this command buys.
    expect(() =>
      applyCommand(foldBattle(), { kind: "act", abilityId: "basic.attack", target: { unitId: "dummy" } }),
    ).toThrow(/out of range/);
    // Settling twice (80+80) would leave −52 and throw; settling once at 80 would
    // leave 28. Pin the exact single-settle price.
    expect(ctOf(folded, "a")).not.toBe(28);
  });

  it("AC-V3: the act resolves from the POST-move tile (rear arc), not the origin", () => {
    // Target faces N. The actor starts in its FRONT arc and OUT of reach; the
    // destination is REAR-adjacent. The target has REAL directional evasion
    // (classEv 50), so front ≠ rear — a zero-evasion target is the tie trap this
    // rule exists to catch, since then both arcs hit identically.
    const targetEv = { classEv: 50, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 };
    const mk = (actorPos: { x: number; y: number }, move: number): BattleState => {
      const a = defaultUnit("a", 0, { pos: actorPos, ct: 108, speed: 10, move });
      const t = defaultUnit("t", 1, {
        pos: { x: 2, y: 2 },
        facing: "N",
        statuses: [legacyActiveStatus("stop")],
        hp: 500,
        maxHp: 500,
        evasion: targetEv,
      });
      return createBattleState({ seed: 1, grid: { width: 5, height: 5 }, units: [a, t] });
    };

    // FIXTURE NON-DEGENERACY: rear is STRICTLY better than front here.
    const front = hitChance(100, targetEv, "front");
    const rear = hitChance(100, targetEv, "rear");
    expect(front).toBe(50);
    expect(rear).toBe(100);
    expect(rear).toBeGreaterThan(front);

    // (1,0) is in the target's FRONT arc (due N of it) and 2 tiles away — out of
    // melee reach, so the act is only legal AFTER the move. (2,3) is REAR-adjacent,
    // reached in 4 steps around the blocking enemy.
    const folded = applyCommand(mk({ x: 1, y: 0 }, 4), {
      kind: "act",
      abilityId: "basic.attack",
      target: { unitId: "t" },
      move: { to: { x: 2, y: 3 }, order: "before" },
    });
    expect(posOf(folded, "a")).toEqual({ x: 2, y: 3 });
    // Seed 1's first d100 is 62: it FAILS a 50% front roll and PASSES the 100% rear
    // roll. So the same single draw hits from the rear and misses from the front —
    // the arc used is directly observable in the outcome.
    expect(hpOf(folded, "t")).toBeLessThan(500);
    expect(folded.turnLog.some((e) => e.action.startsWith("hit t"))).toBe(true);
    expect(ctOf(folded, "a")).toBe(8); // still one settled turn at −100

    // CONTROL — the same seed, same roll, acting from the FRONT arc (adjacent, no
    // move needed): it MISSES. An implementation that resolved the act before
    // applying the move would produce this outcome (or throw out-of-range).
    const fromFront = applyCommand(mk({ x: 2, y: 1 }, 4), {
      kind: "act",
      abilityId: "basic.attack",
      target: { unitId: "t" },
    });
    expect(hpOf(fromFront, "t")).toBe(500);
    expect(fromFront.turnLog.some((e) => e.action === "miss t")).toBe(true);
  });

  it("AC-V4: order 'after' resolves from the ORIGIN, then retreats (hit-and-run)", () => {
    // In reach FROM THE ORIGIN, out of reach FROM THE DESTINATION — so an
    // implementation that always moves first throws "out of range" here.
    const mk = (): BattleState => {
      const a = defaultUnit("a", 0, {
        pos: { x: 2, y: 1 },
        ct: 108,
        speed: 10,
        move: 3,
        evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
      });
      const t = defaultUnit("t", 1, {
        pos: { x: 2, y: 2 },
        statuses: [legacyActiveStatus("stop")],
        hp: 500,
        maxHp: 500,
        evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
      });
      return createBattleState({ seed: 1, grid: { width: 5, height: 5 }, units: [a, t] });
    };
    const retreat = { to: { x: 2, y: 0 }, order: "after" } as const;

    const after = applyCommand(mk(), {
      kind: "act",
      abilityId: "basic.attack",
      target: { unitId: "t" },
      move: retreat,
    });
    expect(hpOf(after, "t")).toBeLessThan(500); // the act resolved (from the origin)
    expect(posOf(after, "a")).toEqual({ x: 2, y: 0 }); // and the retreat happened
    expect(ctOf(after, "a")).toBe(8); // ONE settle, −100
    // The turnLog order mirrors the sub-phase order: strike, then step away.
    const actions = after.turnLog.filter((e) => e.unitId === "a").map((e) => e.action);
    expect(actions).toEqual([expect.stringMatching(/^hit t/), "move 2,0"]);

    // The SAME move+target with order "before" is illegal — (2,0) is 2 tiles from
    // the target. This is what an always-move-first implementation would do.
    expect(() =>
      applyCommand(mk(), {
        kind: "act",
        abilityId: "basic.attack",
        target: { unitId: "t" },
        move: { to: { x: 2, y: 0 }, order: "before" },
      }),
    ).toThrow(/out of range/);
  });

  it("AC-V5: a move + CHARGED act is priced −100; a charged act + move-'after' is rejected", () => {
    const mk = (): BattleState => {
      const c = spellUnit("c", 0, { pos: { x: 1, y: 1 }, ct: 108, speed: 10, move: 3 });
      const dummy = defaultUnit("dummy", 1, {
        pos: { x: 3, y: 3 },
        statuses: [legacyActiveStatus("stop")],
        hp: 9999,
        maxHp: 9999,
      });
      return createBattleState({ seed: 1, grid: { width: 5, height: 5 }, units: [c, dummy] });
    };

    // DISCRIMINATOR: charge.ts used to settle the caster itself with a hard-coded
    // `didMove:false` ("no move phase here"), which would leave ct 28 here.
    const folded = applyCommand(mk(), {
      kind: "act",
      abilityId: SPELL_ID,
      target: { x: 3, y: 3 },
      move: { to: { x: 2, y: 2 }, order: "before" },
    });
    expect(folded.chargeQueue).toHaveLength(1);
    expect(folded.chargeQueue[0]!.sourceUnitId).toBe("c");
    expect(posOf(folded, "c")).toEqual({ x: 2, y: 2 });
    expect(ctOf(folded, "c")).toBe(8); // 108 − 100, NOT 28
    expect(ctOf(folded, "c")).not.toBe(28);

    // Unchanged where there was no move: a bare cast is still one action, −80.
    const bare = applyCommand(mk(), { kind: "act", abilityId: SPELL_ID, target: { x: 3, y: 3 } });
    expect(bare.chargeQueue).toHaveLength(1);
    expect(ctOf(bare, "c")).toBe(28); // 108 − 80

    // docs/01 §2/§3: a charged spell locks the SUBSEQUENT move sub-phase — the
    // cast ends the turn, so no move can follow it. (Moving BEFORE the cast is
    // legal, and is exercised by the −100 assertion above.)
    expect(() =>
      applyCommand(mk(), {
        kind: "act",
        abilityId: SPELL_ID,
        target: { x: 3, y: 3 },
        move: { to: { x: 2, y: 2 }, order: "after" },
      }),
    ).toThrow(/locks the SUBSEQUENT move sub-phase/);
  });

  it("AC-V9: a command log containing COMBINED commands replays byte-for-byte", () => {
    const log: Command[] = [
      FOLDED, // move-before + attack
      { kind: "wait" },
      {
        kind: "act",
        abilityId: "basic.attack",
        target: { unitId: "dummy" },
        move: { to: { x: 3, y: 2 }, order: "after" }, // hit, then reposition
      },
      { kind: "wait" },
      { kind: "act", abilityId: "basic.attack", target: { unitId: "dummy" } }, // unfolded, still fine
      { kind: "wait" },
    ];
    expect(log.some((c) => c.kind === "act" && c.move !== undefined)).toBe(true);

    const first = replaySteps(foldBattle(), log);
    const second = replaySteps(foldBattle(), log);
    expect(first).toHaveLength(log.length);
    for (let i = 0; i < first.length; i++) {
      expect(serialize(first[i]!)).toBe(serialize(second[i]!));
    }
    expect(serialize(replay(foldBattle(), log))).toBe(serialize(first[first.length - 1]!));
    // Rewind mid-log and replay the tail — the fold does not break the substrate.
    const K = 3;
    expect(serialize(replay(first[K - 1]!, log.slice(K)))).toBe(serialize(first[first.length - 1]!));
  });

  it("the fold never relaxes legality: an unreachable destination still throws", () => {
    expect(() =>
      applyCommand(foldBattle(), {
        kind: "act",
        abilityId: "basic.attack",
        target: { unitId: "dummy" },
        move: { to: { x: 4, y: 4 }, order: "before" }, // occupied-adjacent but 6 steps away (move 3)
      }),
    ).toThrow(/illegal move/);
    // A malformed fold (missing `order`) is rejected by the schema, not defaulted.
    expect(() =>
      applyCommand(foldBattle(), {
        kind: "act",
        abilityId: "basic.attack",
        target: { unitId: "dummy" },
        move: { to: { x: 2, y: 2 } },
      } as unknown as Command),
    ).toThrow();
  });
});
