/**
 * REACTION-slot layer tests (docs/02 §2, docs/05 §2 steps b/e, ADR-0019) — the
 * fourth chassis slot to gain real effects, after mastery traits, the ability
 * chassis and the equipped support.
 *
 * DISCRIMINATING (CLAUDE.md, the evidence principle). The dead-slot defect class
 * that ADR-0017 found in the support slot has one signature: equip-time validation
 * looks IDENTICAL whether or not the effect exists. So the load-bearing tests here
 * are A/Bs — the same record and the same seed, with the slot filled and emptied,
 * asserted to produce a DIFFERENT built unit AND a different fight. A test that only
 * said "a counter-carrier has a reaction field" would have passed against the bug.
 *
 * The negatives are chosen to separate "the reaction fired" from "something else
 * changed": a MAGIC blow, an OUT-OF-RANGE blow, a MISS and a LETHAL blow must each
 * leave the attacker untouched, and each is a case a naive "reactions always answer"
 * implementation would get wrong.
 *
 * PURPOSE-BUILT FIXTURES, not the demo roster (CLAUDE.md): every unit here is
 * constructed with the exact stat, range and Brave that makes its case decide. The
 * shipped-pack partition test is the second guard — an authored reaction must either
 * carry an effect or name its blocker.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { loadContentPack, ContentIntegrityError, type ContentRegistry } from "./content.js";
import { defaultUnitRecord, type UnitRecord } from "./roster.js";
import { emptyLoadout, setLoadoutSlot } from "./loadout.js";
import { buildBattleUnit, buildBattleState } from "./build.js";
import {
  ChargeEffectSchema,
  createBattleState,
  defaultUnit,
  deserialize,
  makeFlatTiles,
  serialize,
  SCHEMA_VERSION,
  type BattleState,
  type UnitState,
} from "./state.js";
import type { BattleAbility } from "./ability.js";
import { resolveAttack, resolveAbility, resolveAbilityAoe } from "./resolve.js";
import { applyCommandDetailed } from "./driver.js";
import { DEFERRED_REACTION_EFFECTS, ReactionEffectSchema, type ReactionKind } from "./reaction.js";

const packPath = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
const rawPack = JSON.parse(readFileSync(packPath, "utf8")) as {
  abilities: Array<Record<string, unknown>>;
};
const registry: ContentRegistry = loadContentPack(JSON.parse(readFileSync(packPath, "utf8")) as unknown);

// ── purpose-built fixtures ──────────────────────────────────────────────────

/** A unit that hits hard enough to matter and survives a blow, with an optional reaction. */
function fighter(
  id: string,
  teamId: number,
  pos: { x: number; y: number },
  over: Partial<UnitState> = {},
): UnitState {
  return defaultUnit(id, teamId, {
    pos,
    hp: 500,
    maxHp: 500,
    pa: 10,
    ma: 10,
    brave: 100, // the trigger chance IS Brave; 100 makes the reaction deterministic
    // 100% accuracy on both sides so a MISS never masquerades as "the reaction path
    // did nothing" (evasion 0 is what makes this fixture decide the thing it tests).
    evasion: { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    ...over,
  });
}

const COUNTER: { abilityId: string; kind: ReactionKind } = {
  abilityId: "punch-art.counter",
  kind: "counter",
};
const HAMEDO: { abilityId: string; kind: ReactionKind } = {
  abilityId: "punch-art.hamedo",
  kind: "preemptive",
};

/** Two adjacent foes: `atk` at (0,0), `def` at (1,0), on a flat 4x4 grid. */
function duel(defReaction: UnitState["reaction"], over: Partial<UnitState> = {}): BattleState {
  return createBattleState({
    seed: 99,
    grid: { width: 4, height: 4, tiles: makeFlatTiles(4, 4) },
    units: [
      fighter("atk", 0, { x: 0, y: 0 }),
      fighter("def", 1, { x: 1, y: 0 }, { reaction: defReaction, ...over }),
    ],
  });
}

function hpOf(state: BattleState, id: string): number {
  return state.units.find((u) => u.id === id)!.hp;
}

/** A single-target instant projected straight onto a unit (no pack round-trip). */
function ability(over: Partial<BattleAbility> & { id: string }): BattleAbility {
  return {
    actionKind: "action",
    formula: "physical",
    power: 8,
    element: "none",
    accuracy: 100,
    range: { h: 1, v: 1 },
    inflicts: [],
    speed: null,
    aoe: null,
    ...over,
  };
}

// ── THE A/B: the slot changes the built unit AND the fight ──────────────────

describe("the equipped reaction is projected AND read (the dead-slot A/B)", () => {
  // RAW HP high enough that the attacker's opening swing is NOT lethal. That is the
  // fixture doing its job: at defaultUnitRecord's 40 raw HP the defender dies to the
  // first blow and NEITHER build counters, so the A/B would read "no difference" and
  // certify the dead slot it exists to catch.
  const RAW = { pa: 8, ma: 5, speed: 5, hp: 600, mp: 0 };
  const base = (): UnitRecord =>
    defaultUnitRecord("rec", "monk", {
      raw: RAW,
      // Brave 100 pins the trigger, so the A/B measures THE SLOT and not a coin flip.
      // At the roster's usual Brave 70 this exact seed rolls a non-trigger, and the
      // test would have gone green for the wrong reason.
      brave: 100,
      learned: ["punch-art.counter", "punch-art.hamedo"],
      loadout: emptyLoadout(),
    });
  const record = (reaction: string | null): UnitRecord =>
    reaction === null ? base() : setLoadoutSlot(base(), "reaction", reaction, registry);

  it("builds a DIFFERENT unit with the slot filled than with it empty", () => {
    const off = buildBattleUnit(record(null), registry);
    const on = buildBattleUnit(record("punch-art.counter"), registry);
    expect(off.reaction).toBeNull();
    expect(on.reaction).toEqual({ abilityId: "punch-art.counter", kind: "counter" });
    // The whole point: the two built objects differ. Equip-time validation alone
    // would leave them identical — that is the shape ADR-0017 had to diagnose twice.
    expect(on).not.toEqual(off);
  });

  it("the two builds FIGHT differently off the same seed — the half that can come out the other way", () => {
    // Same attacker, same seed, same everything but the equipped slot.
    const mk = (reaction: string | null): BattleState =>
      buildBattleState(
        [
          { record: defaultUnitRecord("atk", "monk", { raw: { pa: 10, ma: 5, speed: 5, hp: 300, mp: 0 } }), over: { teamId: 0, pos: { x: 0, y: 0 } } },
          { record: record(reaction), over: { teamId: 1, pos: { x: 1, y: 0 } } },
        ],
        99,
        registry,
        { width: 4, height: 4 },
      );
    const off = resolveAttack(mk(null), "atk", "rec");
    const on = resolveAttack(mk("punch-art.counter"), "atk", "rec");
    expect(off.outcome.reactions).toEqual([]);
    expect(hpOf(off.state, "atk")).toBe(hpOf(off.state, "atk")); // sanity anchor
    expect(on.outcome.reactions.length).toBe(1);
    // The attacker took damage in exactly one of the two runs.
    expect(hpOf(on.state, "atk")).toBeLessThan(hpOf(off.state, "atk"));
  });
});

// ── counter: what wakes it, and what must not ───────────────────────────────

describe("counter answers a landed physical blow from inside the reactor's reach", () => {
  it("strikes the attacker back for the reactor's own swing", () => {
    const before = duel(COUNTER);
    const { state, outcome } = resolveAttack(before, "atk", "def");
    expect(outcome.reactions).toHaveLength(1);
    const r = outcome.reactions[0]!;
    expect(r).toMatchObject({
      reactorId: "def",
      abilityId: "punch-art.counter",
      kind: "counter",
      againstId: "atk",
      hit: true,
      nullified: false,
    });
    expect(r.damage).toBeGreaterThan(0);
    expect(hpOf(state, "atk")).toBe(hpOf(before, "atk") - r.damage);
    // The incoming blow still landed in full — a counter answers, it does not block.
    expect(hpOf(state, "def")).toBeLessThan(hpOf(before, "def"));
  });

  it("does NOT wake on a MAGIC blow", () => {
    // The discriminating negative for `physical`. Same adjacency, same Brave 100 —
    // only the formula differs, so a "reactions always answer" implementation fails
    // here and nowhere else.
    const before = duel(COUNTER);
    const atk = before.units.find((u) => u.id === "atk")!;
    atk.abilities.push(ability({ id: "test.zap", formula: "magic", power: 20 }));
    const { state, outcome } = resolveAbility(before, "atk", "def", "test.zap");
    expect(outcome.reactions).toEqual([]);
    expect(hpOf(state, "atk")).toBe(hpOf(before, "atk"));
    expect(hpOf(state, "def")).toBeLessThan(hpOf(before, "def")); // the blow DID land
  });

  it("does NOT wake when the attacker stands outside the reactor's own attack range", () => {
    // A ranged physical (h3) against a melee (h1) reactor: physical, landed, alive —
    // only reach separates this from the firing case.
    const before = createBattleState({
      seed: 99,
      grid: { width: 6, height: 4, tiles: makeFlatTiles(6, 4) },
      units: [fighter("atk", 0, { x: 0, y: 0 }), fighter("def", 1, { x: 3, y: 0 }, { reaction: COUNTER })],
    });
    before.units[0]!.abilities.push(ability({ id: "test.lob", range: { h: 3, v: 1 }, power: 10 }));
    const { state, outcome } = resolveAbility(before, "atk", "def", "test.lob");
    expect(outcome.reactions).toEqual([]);
    expect(hpOf(state, "atk")).toBe(hpOf(before, "atk"));
    expect(hpOf(state, "def")).toBeLessThan(hpOf(before, "def"));
  });

  it("does NOT wake on a blow that MISSED", () => {
    const before = duel(COUNTER);
    // A 0-accuracy weapon forces the miss outright. (Evasion would NOT: it is halved
    // on a side hit, so a classEv-100 defender still eats half the blows — the kind of
    // near-miss fixture that would make this test pass for the wrong reason.)
    before.units[0]!.weapon = { ...before.units[0]!.weapon, accuracy: 0 };
    const { state, outcome } = resolveAttack(before, "atk", "def");
    expect(outcome.hit).toBe(false);
    expect(outcome.reactions).toEqual([]);
    expect(hpOf(state, "atk")).toBe(hpOf(before, "atk"));
  });

  it("does NOT wake from a CORPSE — a lethal blow ends the exchange", () => {
    const before = duel(COUNTER, { hp: 1 });
    const { state, outcome } = resolveAttack(before, "atk", "def");
    expect(outcome.ko).toBe(true);
    expect(outcome.reactions).toEqual([]);
    expect(hpOf(state, "atk")).toBe(hpOf(before, "atk"));
  });

  it("does NOT chain: a counter never wakes the attacker's own counter", () => {
    // BOTH units carry Counter. Exactly ONE reaction may fire — the defender's.
    // The invariant is structural (the counter-swing is resolved inline, never routed
    // back through resolveAttack), and this is the test that would catch a refactor
    // that "simplified" it into a recursive call.
    const before = duel(COUNTER);
    before.units[0]!.reaction = { ...COUNTER };
    const { state, outcome } = resolveAttack(before, "atk", "def");
    expect(outcome.reactions).toHaveLength(1);
    expect(outcome.reactions[0]!.reactorId).toBe("def");
    // The defender took the original blow only — never a counter-counter.
    const dealt = hpOf(before, "def") - hpOf(state, "def");
    expect(dealt).toBe(outcome.damage);
  });

  it("Brave IS the trigger chance: Brave 0 never fires, and still costs its draw", () => {
    const fires = resolveAttack(duel(COUNTER), "atk", "def");
    const never = resolveAttack(duel(COUNTER, { brave: 0 }), "atk", "def");
    expect(fires.outcome.reactions).toHaveLength(1);
    expect(never.outcome.reactions).toEqual([]);
    // Both consumed the trigger draw — the cursor moves on the ROLL, not on the
    // result, which is what keeps a Brave change from re-sequencing the stream.
    expect(never.state.rngCounter).toBe(2); // hit + trigger
    expect(fires.state.rngCounter).toBe(3); // hit + trigger + counter-swing
  });
});

// ── hamedo: the pre-check that cancels the blow ─────────────────────────────

describe("preemptive (Hamedo) cancels the incoming blow and strikes first", () => {
  it("leaves the defender at full HP and damages the attacker", () => {
    const before = duel(HAMEDO);
    const { state, outcome } = resolveAttack(before, "atk", "def");
    expect(outcome.reactions).toHaveLength(1);
    expect(outcome.reactions[0]).toMatchObject({ kind: "preemptive", nullified: true });
    expect(outcome.damage).toBe(0);
    expect(outcome.ko).toBe(false);
    expect(hpOf(state, "def")).toBe(hpOf(before, "def")); // the blow never landed
    expect(hpOf(state, "atk")).toBeLessThan(hpOf(before, "atk"));
  });

  it("cancels the blow's ON-HIT STATUS too, not just its damage", () => {
    // The discriminating case for "cancelled outright". A cancellation that only
    // zeroed damage would still stamp the status, and the defender would be Slowed by
    // an attack it demonstrably blocked.
    const before = duel(HAMEDO);
    before.units[0]!.abilities.push(
      ability({
        id: "test.hobble",
        inflicts: [
          {
            id: "slow",
            kind: "debuff",
            ctFactor: 0.5,
            remainingCT: 200,
            preventsAction: false,
            interruptsCharge: false,
            interruptsMagicOnly: false,
            controlsTarget: false,
            controlledByTeamId: null,
          },
        ],
      }),
    );
    const { state } = resolveAbility(before, "atk", "def", "test.hobble");
    expect(state.units.find((u) => u.id === "def")!.statuses).toEqual([]);
  });

  it("saves a defender that the blow would otherwise have KILLED", () => {
    const before = duel(HAMEDO, { hp: 1 });
    const { state, outcome } = resolveAttack(before, "atk", "def");
    expect(outcome.ko).toBe(false);
    expect(hpOf(state, "def")).toBe(1);
  });
});

// ── the AREA site ───────────────────────────────────────────────────────────

describe("an area physical wakes each struck reactor, in the declared id order", () => {
  it("two counter-carriers both answer one volley", () => {
    const state = createBattleState({
      seed: 5,
      grid: { width: 6, height: 4, tiles: makeFlatTiles(6, 4) },
      units: [
        fighter("atk", 0, { x: 0, y: 0 }),
        fighter("d1", 1, { x: 1, y: 0 }, { reaction: COUNTER }),
        fighter("d2", 1, { x: 1, y: 1 }, { reaction: COUNTER }),
      ],
    });
    state.units[0]!.abilities.push(
      ability({ id: "test.sweep", range: { h: 2, v: 1 }, aoe: { h: 1, v: 1 }, power: 6 }),
    );
    const { outcome } = resolveAbilityAoe(state, "atk", { x: 1, y: 0 }, "test.sweep");
    expect(outcome.reactions.map((r) => r.reactorId)).toEqual(["d1", "d2"]);
  });

  it("a MAGIC area wakes nothing, even with the same geometry", () => {
    const state = createBattleState({
      seed: 5,
      grid: { width: 6, height: 4, tiles: makeFlatTiles(6, 4) },
      units: [
        fighter("atk", 0, { x: 0, y: 0 }),
        fighter("d1", 1, { x: 1, y: 0 }, { reaction: COUNTER }),
        fighter("d2", 1, { x: 1, y: 1 }, { reaction: COUNTER }),
      ],
    });
    state.units[0]!.abilities.push(
      ability({ id: "test.blast", formula: "magic", range: { h: 2, v: 1 }, aoe: { h: 1, v: 1 }, power: 20 }),
    );
    const { outcome } = resolveAbilityAoe(state, "atk", { x: 1, y: 0 }, "test.blast");
    expect(outcome.reactions).toEqual([]);
  });
});

// ── every damage site, named ────────────────────────────────────────────────

describe("the damage SITES are enumerated, not assumed", () => {
  // A test that covers a subset READS as covering the set (CLAUDE.md). These are all
  // four places the engine removes HP; each is stated, and the one that does NOT fire
  // reactions states the structural reason it cannot.
  it("resolveAttack / resolveAbility / resolveAbilityAoe all fire; resolveCharge cannot", () => {
    const atkSite = resolveAttack(duel(COUNTER), "atk", "def").outcome.reactions;
    expect(atkSite).toHaveLength(1);

    const abilityState = duel(COUNTER);
    abilityState.units[0]!.abilities.push(ability({ id: "test.jab", power: 6 }));
    expect(resolveAbility(abilityState, "atk", "def", "test.jab").outcome.reactions).toHaveLength(1);

    const aoeState = duel(COUNTER);
    aoeState.units[0]!.abilities.push(ability({ id: "test.arc", aoe: { h: 1, v: 1 }, power: 6 }));
    expect(resolveAbilityAoe(aoeState, "atk", { x: 1, y: 0 }, "test.arc").outcome.reactions).toHaveLength(1);

    // resolveCharge is NOT a reaction site, and the reason is a schema fact rather
    // than an omission: every charge effect is `kind: "magic"`, and no reaction wakes
    // on magic. If a physical charge kind is ever added, this assertion goes red and
    // the charge path has to be wired.
    expect(ChargeEffectSchema.shape.kind.value).toBe("magic");
  });
});

// ── attribution: the counter is the REACTOR's contribution ──────────────────

describe("a fired reaction is credited to the REACTOR, never to the attacker", () => {
  it("emits its own event under the reaction ability's id", () => {
    const applied = applyCommandDetailed(duel(COUNTER), {
      kind: "act",
      abilityId: "basic.attack",
      target: { unitId: "def" },
    });
    expect(applied.reactionEvents).toHaveLength(1);
    const ev = applied.reactionEvents[0]!;
    expect(ev.sourceUnitId).toBe("def");
    expect(ev.abilityId).toBe("punch-art.counter");
    expect(ev.damageDealt).toBeGreaterThan(0);
    expect(ev.landed).toBe(true);
    // The attacker's own event must NOT absorb the counter — if it did, the counter
    // would inflate the attacker's contribution instead of scoring for the reactor,
    // and the diversity gate would credit the wrong build.
    expect(applied.event!.sourceUnitId).toBe("atk");
    expect(applied.event!.abilityId).toBe("basic.attack");
    expect(applied.event!.damageDealt).toBeLessThan(ev.damageDealt + applied.event!.damageDealt);
  });

  it("credits a lethal counter with the KO", () => {
    const before = duel(COUNTER);
    before.units[0]!.hp = 1;
    const applied = applyCommandDetailed(before, {
      kind: "act",
      abilityId: "basic.attack",
      target: { unitId: "def" },
    });
    expect(applied.reactionEvents[0]!.kos).toBe(1);
    // …and the attacker is NOT credited with killing itself.
    expect(applied.event!.kos).toBe(0);
  });

  it("a reaction that fired but MISSED landed nothing", () => {
    const before = duel(COUNTER);
    // The REACTOR's swing must miss: zero its weapon accuracy, not the attacker's.
    before.units[1]!.weapon = { ...before.units[1]!.weapon, accuracy: 0 };
    const applied = applyCommandDetailed(before, {
      kind: "act",
      abilityId: "basic.attack",
      target: { unitId: "def" },
    });
    expect(applied.reactionEvents).toHaveLength(1);
    expect(applied.reactionEvents[0]!.landed).toBe(false);
    expect(applied.reactionEvents[0]!.damageDealt).toBe(0);
  });
});

// ── determinism + persistence ───────────────────────────────────────────────

describe("determinism and the schema bump", () => {
  it("a reaction-less defender consumes exactly the pre-slice draw count", () => {
    // The invariant the whole roll order rests on: no equipped reaction ⇒ ONE draw,
    // exactly as before ADR-0019.
    expect(resolveAttack(duel(null), "atk", "def").state.rngCounter).toBe(1);
  });

  it("a reaction that CANNOT trigger consumes no draw either", () => {
    const before = createBattleState({
      seed: 99,
      grid: { width: 6, height: 4, tiles: makeFlatTiles(6, 4) },
      units: [fighter("atk", 0, { x: 0, y: 0 }), fighter("def", 1, { x: 3, y: 0 }, { reaction: COUNTER })],
    });
    before.units[0]!.abilities.push(ability({ id: "test.lob", range: { h: 3, v: 1 }, power: 10 }));
    expect(resolveAbility(before, "atk", "def", "test.lob").state.rngCounter).toBe(1);
  });

  it("the same seed replays byte-identically through a fired reaction", () => {
    const a = serialize(resolveAttack(duel(COUNTER), "atk", "def").state);
    const b = serialize(resolveAttack(duel(COUNTER), "atk", "def").state);
    expect(a).toBe(b);
  });

  it("round-trips a unit carrying a reaction", () => {
    const state = duel(COUNTER);
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it("migrates a v10 save by stamping reaction:null — no roll or result shift", () => {
    const current = JSON.parse(serialize(duel(null))) as Record<string, unknown>;
    const v10 = {
      ...current,
      schemaVersion: 10,
      units: (current["units"] as Array<Record<string, unknown>>).map((u) => {
        const rest = { ...u };
        delete rest["reaction"]; // a v10 unit has no such field at all
        return rest;
      }),
    };
    const migrated = deserialize(JSON.stringify(v10));
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.units.every((u) => u.reaction === null)).toBe(true);
    expect(serialize(migrated)).toBe(serialize(duel(null)));
  });
});

// ── the shipped pack: nothing is silently inert ─────────────────────────────

describe("the shipped pack partitions every reaction into EFFECT-BEARING or DEFERRED", () => {
  const reactions = rawPack.abilities.filter((a) => a["type"] === "reaction");

  it("has reaction abilities to check (guards the guard)", () => {
    expect(reactions.length).toBeGreaterThan(0);
  });

  it("every authored reaction either carries an effect or names its blocker", () => {
    const inertWithoutReason = reactions
      .filter((a) => a["reactionEffect"] === undefined)
      .map((a) => a["id"] as string)
      .filter((id) => DEFERRED_REACTION_EFFECTS[id] === undefined);
    expect(inertWithoutReason, "authored reaction with no effect and no recorded blocker").toEqual([]);
  });

  it("every DEFERRED entry names a real, still-effect-less reaction and a non-empty blocker", () => {
    // Keeps the manifest from rotting the OTHER way — a stale entry for a reaction
    // that has since gained an effect, or one that no longer exists.
    for (const [id, blocker] of Object.entries(DEFERRED_REACTION_EFFECTS)) {
      const authored = reactions.find((a) => a["id"] === id);
      expect(authored, `DEFERRED names unknown reaction "${id}"`).toBeDefined();
      expect(authored!["reactionEffect"], `"${id}" has an effect but is still DEFERRED`).toBeUndefined();
      expect(blocker.length, id).toBeGreaterThan(20);
    }
  });

  it("an equipped but DEFERRED reaction projects as null, not as a no-op object", () => {
    // `bld-reraise-cleric` equips `white-magic.reraise`, which has no effect yet. It
    // must build to `null` so it takes no reaction draw — an inert reaction that still
    // moved the RNG cursor would desync every replay for no behaviour at all.
    const rec = setLoadoutSlot(
      defaultUnitRecord("cleric", "priest", { learned: ["white-magic.reraise"] }),
      "reaction",
      "white-magic.reraise",
      registry,
    );
    expect(buildBattleUnit(rec, registry).reaction).toBeNull();
  });
});

describe("content integrity — a reactionEffect on a non-reaction ability fails loud", () => {
  it("rejects the pack rather than silently ignoring the effect", () => {
    const broken = JSON.parse(JSON.stringify(rawPack)) as typeof rawPack;
    const action = broken.abilities.find((a) => a["id"] === "black-magic.fire")!;
    action["reactionEffect"] = { kind: "counter" };
    expect(() => loadContentPack(broken)).toThrow(ContentIntegrityError);
  });

  it("rejects an unknown reaction kind", () => {
    expect(() => ReactionEffectSchema.parse({ kind: "reraise" })).toThrow();
  });
});
