/**
 * AoE resolution slice — discriminating tests (CLAUDE.md test convention: each
 * asserts against the plausible WRONG behavior, never a degenerate/tie case).
 *
 * The load-bearing invariant: an AoE act consumes ONE seeded hit roll per affected
 * unit, drawn in a DECLARED TOTAL ORDER = affected units sorted by `id` ASCENDING
 * (never Map/Set/array-position order — see the id-order test), and an `aoe:null`
 * ability resolves byte-identically to the single-target path (the no-op invariant
 * that keeps every pre-AoE suite green).
 *
 * Targeting policy is TARGETED: area damage hits the caster's FOES only, area heal
 * hits the caster's ALLIES (incl. self) only — proved by the targeted-policy tests.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { resolveAbilityAoe } from "./resolve.js";
import { resolveCharge } from "./charge.js";
import { replay, type Command } from "./driver.js";
import { decideBalanceProbe } from "./ai.js";
import { unitsInAoeBox } from "./grid.js";
import { SeededRng } from "./rng.js";
import { runFromState } from "./harness.js";
import { buildBattleUnit } from "./build.js";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { deserializeRecord, type UnitRecord } from "./roster.js";
import {
  createBattleState,
  defaultUnit,
  deserialize,
  legacyActiveStatus,
  makeFlatTiles,
  serialize,
  type BattleState,
  type ChargedActionState,
  type Tile,
  type UnitState,
} from "./state.js";
import type { BattleAbility } from "./ability.js";

/** Zero evasion so accuracy 100 is a guaranteed hit — isolates the AoE mechanic from evade rolls. */
const EV0 = { classEv: 0, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 };

function withAbility(u: UnitState, ab: BattleAbility): UnitState {
  return { ...u, abilities: [...u.abilities, ab] };
}

/** An INSTANT magic AoE ability (h:1,v:1 box, 100% acc), overridable. */
function magicAoe(over: Partial<BattleAbility> = {}): BattleAbility {
  return {
    id: "geo.blast",
    actionKind: "action",
    formula: "magic",
    power: 8,
    element: "none",
    accuracy: 100,
    range: { h: 6, v: 6 },
    inflicts: [],
    speed: null,
    aoe: { h: 1, v: 1 },
    ...over,
  };
}

// ─── 1. NO-OP INVARIANT ──────────────────────────────────────────────────────

describe("no-op invariant — an aoe:null ability resolves byte-identically to single-target", () => {
  it("a single-target magic act hits ONLY its unit target (no spread) and replays byte-equal", () => {
    // Caster + two ADJACENT foes. A NULL-aoe single-target magic ability aimed at
    // foe-a must leave foe-b (right next to it) untouched — a spread bug would hit
    // both. Both foes Stopped so the log is a pure function of (seed, commands).
    const caster = withAbility(
      defaultUnit("caster", 0, { pos: { x: 0, y: 0 }, evasion: EV0, faith: 100, hp: 300, maxHp: 300 }),
      magicAoe({ id: "bolt", aoe: null }), // single-target
    );
    const foeA = defaultUnit("foe-a", 1, { pos: { x: 2, y: 0 }, statuses: [legacyActiveStatus("stop")], evasion: EV0, faith: 100, hp: 300, maxHp: 300 });
    const foeB = defaultUnit("foe-b", 1, { pos: { x: 3, y: 0 }, statuses: [legacyActiveStatus("stop")], evasion: EV0, faith: 100, hp: 300, maxHp: 300 });
    const state = createBattleState({ seed: 9, grid: { width: 6, height: 3 }, units: [caster, foeA, foeB] });

    const log: Command[] = [{ kind: "act", abilityId: "bolt", target: { unitId: "foe-a" } }];
    const after = replay(state, log);

    const a = after.units.find((u) => u.id === "foe-a")!;
    const b = after.units.find((u) => u.id === "foe-b")!;
    expect(a.hp).toBeLessThan(300); // the single target was hit
    expect(b.hp).toBe(300); // the adjacent foe is UNTOUCHED — no spread
    expect(after.rngCounter).toBe(1); // exactly ONE draw, same cursor as the pre-AoE path

    // Replay-equality: a second fold of the same (seed, commands) is byte-identical.
    expect(serialize(replay(state, log))).toBe(serialize(after));
  });
});

// ─── 2. AoE-HITS-N + EXACT BOX ───────────────────────────────────────────────

describe("instant AoE — damages every foe in the box, and EXACTLY the box", () => {
  it("hits all foes inside h/v, leaves a foe just outside h or v untouched", () => {
    // A raised tile at (2,3) tests the vertical (v) bound; (5,3) tests horizontal (h).
    const tiles: Tile[] = makeFlatTiles(8, 8);
    tiles[3 * 8 + 2] = { height: 5, passable: true }; // (2,3) raised well above aoe.v
    const attacker = withAbility(
      defaultUnit("att", 0, { pos: { x: 0, y: 0 }, evasion: EV0, faith: 100 }),
      magicAoe({ aoe: { h: 1, v: 1 } }),
    );
    // Aim tile is (3,3). In-box: (3,3),(4,3). Out: (5,3) [Chebyshev 2 > h] and
    // (2,3) [height delta 5 > v]. A single-target model would hit only (3,3).
    const inA = defaultUnit("foe-in-a", 1, { pos: { x: 3, y: 3 }, evasion: EV0, faith: 100, hp: 300, maxHp: 300 });
    const inB = defaultUnit("foe-in-b", 1, { pos: { x: 4, y: 3 }, evasion: EV0, faith: 100, hp: 300, maxHp: 300 });
    const outH = defaultUnit("foe-out-h", 1, { pos: { x: 5, y: 3 }, evasion: EV0, faith: 100, hp: 300, maxHp: 300 });
    const outV = defaultUnit("foe-out-v", 1, { pos: { x: 2, y: 3 }, evasion: EV0, faith: 100, hp: 300, maxHp: 300 });
    const state = createBattleState({ seed: 1, grid: { width: 8, height: 8, tiles }, units: [attacker, inA, inB, outH, outV] });

    const { outcome, state: after } = resolveAbilityAoe(state, "att", { x: 3, y: 3 }, "geo.blast");

    expect(outcome.perTarget.map((p) => p.targetId)).toEqual(["foe-in-a", "foe-in-b"]); // id-sorted, box-exact
    expect(outcome.hits).toBe(2);
    expect(after.units.find((u) => u.id === "foe-in-a")!.hp).toBeLessThan(300);
    expect(after.units.find((u) => u.id === "foe-in-b")!.hp).toBeLessThan(300);
    expect(after.units.find((u) => u.id === "foe-out-h")!.hp).toBe(300); // outside h
    expect(after.units.find((u) => u.id === "foe-out-v")!.hp).toBe(300); // outside v
    expect(after.rngCounter).toBe(2); // one draw per affected foe
  });
});

// ─── 3. TARGETED POLICY (no friendly fire) ───────────────────────────────────

describe("targeted policy — area damage spares allies, area heal spares foes", () => {
  it("an ally standing inside a damage box is NOT hit", () => {
    const attacker = withAbility(
      defaultUnit("att", 0, { pos: { x: 0, y: 0 }, evasion: EV0, faith: 100 }),
      magicAoe(),
    );
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 3 }, evasion: EV0, faith: 100, hp: 300, maxHp: 300 });
    const ally = defaultUnit("ally", 0, { pos: { x: 4, y: 3 }, evasion: EV0, faith: 100, hp: 300, maxHp: 300 });
    const state = createBattleState({ seed: 1, grid: { width: 8, height: 8 }, units: [attacker, foe, ally] });

    const { outcome, state: after } = resolveAbilityAoe(state, "att", { x: 3, y: 3 }, "geo.blast");

    expect(outcome.perTarget.map((p) => p.targetId)).toEqual(["foe"]); // ally excluded
    expect(after.units.find((u) => u.id === "foe")!.hp).toBeLessThan(300);
    expect(after.units.find((u) => u.id === "ally")!.hp).toBe(300); // ally UNHARMED
  });

  it("a foe standing inside a heal box is NOT healed", () => {
    const healer = withAbility(
      defaultUnit("healer", 0, { pos: { x: 0, y: 0 }, evasion: EV0, faith: 100 }),
      magicAoe({ id: "cure", formula: "heal" }),
    );
    const ally = defaultUnit("ally", 0, { pos: { x: 3, y: 3 }, evasion: EV0, faith: 100, hp: 100, maxHp: 300 }); // wounded
    const foe = defaultUnit("foe", 1, { pos: { x: 4, y: 3 }, evasion: EV0, faith: 100, hp: 100, maxHp: 300 }); // wounded foe in box
    const state = createBattleState({ seed: 1, grid: { width: 8, height: 8 }, units: [healer, ally, foe] });

    const { outcome, state: after } = resolveAbilityAoe(state, "healer", { x: 3, y: 3 }, "cure");

    expect(outcome.perTarget.map((p) => p.targetId)).toEqual(["ally"]); // foe excluded
    expect(after.units.find((u) => u.id === "ally")!.hp).toBeGreaterThan(100); // ally healed
    expect(after.units.find((u) => u.id === "foe")!.hp).toBe(100); // foe NOT healed
  });
});

// ─── 4. DETERMINISM: id-order roll draw + replay equality ─────────────────────

/** A matured area charge on the caster's tile queue (magic damage). */
function areaCharge(over: Partial<ChargedActionState["effect"]> = {}): ChargedActionState {
  return {
    id: "chg",
    sourceUnitId: "caster",
    ct: 100,
    speed: 20,
    targetTile: { x: 4, y: 2 },
    effect: { kind: "magic", power: 8, element: "none", accuracy: 100, aoe: { h: 1, v: 1 }, ...over },
    interrupted: false,
  };
}

describe("determinism — per-target hit rolls are drawn in DECLARED id-ascending order", () => {
  it("the lower-id foe consumes the FIRST draw regardless of units-array order", () => {
    // seed 1 at cursor 0: draw1 = 62 (MISS at acc 50), draw2 = 0 (HIT). So id-order
    // predicts foe-a (lower id) MISSES and foe-z (higher id) HITS. The two foes are
    // placed in the units array in REVERSE id order — an array-position impl would
    // give foe-z the first draw and flip both outcomes, so this discriminates.
    const rng = new SeededRng(1, 0);
    const d1 = rng.nextInt(100);
    const d2 = rng.nextInt(100);
    expect(d1 < 50).not.toBe(d2 < 50); // guard: the draws MUST diverge or the test proves nothing
    const aHitExpected = d1 < 50; // false
    const zHitExpected = d2 < 50; // true

    const caster = defaultUnit("caster", 0, { pos: { x: 0, y: 2 }, ma: 10, faith: 100 });
    const foeZ = defaultUnit("foe-z", 1, { pos: { x: 4, y: 2 }, evasion: EV0, faith: 100, hp: 300, maxHp: 300 });
    const foeA = defaultUnit("foe-a", 1, { pos: { x: 5, y: 2 }, evasion: EV0, faith: 100, hp: 300, maxHp: 300 });
    // units array: caster, foe-z, foe-a — deliberately NOT id-sorted.
    const state: BattleState = {
      ...createBattleState({ seed: 1, grid: { width: 8, height: 8 }, units: [caster, foeZ, foeA] }),
      chargeQueue: [areaCharge({ accuracy: 50 })],
    };

    const { outcome } = resolveCharge(state, "chg");
    expect(outcome.perTarget!.map((p) => p.targetId)).toEqual(["foe-a", "foe-z"]); // id order
    const a = outcome.perTarget!.find((p) => p.targetId === "foe-a")!;
    const z = outcome.perTarget!.find((p) => p.targetId === "foe-z")!;
    expect(a.hit).toBe(aHitExpected); // lower id got draw1 (miss)
    expect(z.hit).toBe(zHitExpected); // higher id got draw2 (hit)
  });

  it("an area-charge run is byte-identical on replay", () => {
    const caster = withAbility(
      defaultUnit("caster", 0, { pos: { x: 0, y: 2 }, ma: 10, faith: 100, hp: 400, maxHp: 400 }),
      magicAoe({ id: "quake", speed: 20, aoe: { h: 1, v: 1 } }), // charged AoE (speed != null)
    );
    const f1 = defaultUnit("foe-1", 1, { pos: { x: 4, y: 2 }, statuses: [legacyActiveStatus("stop")], evasion: EV0, faith: 100, hp: 500, maxHp: 500 });
    const f2 = defaultUnit("foe-2", 1, { pos: { x: 4, y: 3 }, statuses: [legacyActiveStatus("stop")], evasion: EV0, faith: 100, hp: 500, maxHp: 500 });
    const state = createBattleState({ seed: 3, grid: { width: 8, height: 8 }, units: [caster, f1, f2] });

    const log: Command[] = [
      { kind: "act", abilityId: "quake", target: { x: 4, y: 2 } },
      { kind: "wait" },
      { kind: "wait" },
      { kind: "wait" },
    ];
    const a = replay(state, log);
    const b = replay(state, log);
    expect(serialize(a)).toBe(serialize(b));
    // Both foes were caught by the matured area charge.
    expect(a.turnLog.some((e) => /charge \S+ aoe 2 hit/.test(e.action))).toBe(true);
  });
});

// ─── 5. MIGRATION v7 → v8 ────────────────────────────────────────────────────

describe("migration — a v7 save (no aoe) round-trips to aoe:null and stays valid", () => {
  it("stamps aoe:null onto every ability and every charge effect", () => {
    const v8 = createBattleState({ seed: 1, grid: { width: 3, height: 3 }, units: [defaultUnit("u", 0)] });
    const withCharge: BattleState = {
      ...v8,
      chargeQueue: [
        {
          id: "c1",
          sourceUnitId: "u",
          ct: 0,
          speed: 10,
          targetTile: { x: 0, y: 0 },
          effect: { kind: "magic", power: 8, element: "none", accuracy: 100, aoe: null },
          interrupted: false,
        },
      ],
    };
    // Downgrade to a v7-shaped blob: drop every aoe field, set the version back.
    const raw = JSON.parse(serialize(withCharge)) as {
      schemaVersion: number;
      units: Array<{ abilities: Array<Record<string, unknown>> }>;
      chargeQueue: Array<{ effect: Record<string, unknown> }>;
    };
    raw.schemaVersion = 7;
    for (const u of raw.units) for (const a of u.abilities) delete a["aoe"];
    for (const c of raw.chargeQueue) delete c.effect["aoe"];

    const migrated = deserialize(JSON.stringify(raw));
    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.units[0]!.abilities.every((a) => a.aoe === null)).toBe(true);
    expect(migrated.chargeQueue[0]!.effect.aoe).toBe(null);
  });
});

// ─── 6. AI valuation — AoE follows the FOCUS rule, not raw cluster size ───────

describe("AI valuation — an AoE act focuses the lowest-HP foe (AC-E3(b)), not the bigger cluster", () => {
  // magicAoe power 8 → ~40 dmg here, so every foe below stays alive (CHIP class, the
  // one where the focus vs spread policy is decided). These tests pin the chosen
  // policy (effHp ASC, then summed magnitude DESC) against the two plausible WRONG
  // rules: a spread-first / magnitude-first rule would pick the bigger/higher-total
  // cluster instead.
  it("prefers a 2-foe cluster containing a WOUNDED foe over a strictly-larger healthy cluster", () => {
    const actor = withAbility(
      defaultUnit("actor", 0, { pos: { x: 3, y: 3 }, evasion: EV0, faith: 100 }),
      magicAoe({ range: { h: 6, v: 6 }, aoe: { h: 1, v: 1 } }),
    );
    // Aim-left box (centred on the wounded foe) catches 2 foes, min effHp 200.
    const left = [
      defaultUnit("wound", 1, { pos: { x: 1, y: 1 }, hp: 200, maxHp: 300, evasion: EV0, faith: 100 }),
      defaultUnit("wpair", 1, { pos: { x: 2, y: 1 }, hp: 300, maxHp: 300, evasion: EV0, faith: 100 }),
    ];
    // Aim-right box catches 3 HEALTHY foes (min effHp 300) — bigger cluster AND bigger
    // total, so spread-first/magnitude-first would pick HERE. Focus-first must not.
    const right = [
      defaultUnit("big-a", 1, { pos: { x: 5, y: 5 }, hp: 300, maxHp: 300, evasion: EV0, faith: 100 }),
      defaultUnit("big-b", 1, { pos: { x: 6, y: 5 }, hp: 300, maxHp: 300, evasion: EV0, faith: 100 }),
      defaultUnit("big-c", 1, { pos: { x: 5, y: 6 }, hp: 300, maxHp: 300, evasion: EV0, faith: 100 }),
    ];
    const state = createBattleState({ seed: 1, grid: { width: 8, height: 8 }, units: [actor, ...left, ...right] });

    const cmd = decideBalanceProbe(state, "actor");
    expect(cmd.kind).toBe("act");
    if (cmd.kind !== "act" || "unitId" in cmd.target) throw new Error("expected a tile-targeted area act");
    const caught = unitsInAoeBox(state.grid, state.units, cmd.target, { h: 1, v: 1 }).filter((u) => u.teamId === 1);
    // Focus rule: the box must include the wounded foe (min effHp 200), NOT the 3-cluster.
    expect(caught.map((u) => u.id)).toContain("wound");
    expect(caught).toHaveLength(2);
  });

  it("among aims that reach the SAME lowest-HP foe, picks the one that also hits a neighbor (bigger total)", () => {
    const actor = withAbility(
      defaultUnit("actor", 0, { pos: { x: 3, y: 3 }, evasion: EV0, faith: 100 }),
      magicAoe({ range: { h: 6, v: 6 }, aoe: { h: 1, v: 1 } }),
    );
    // Two equally-wounded foes (hp 200): one ISOLATED, one with a healthy neighbour.
    // Both aims tie on min effHp (200); the magnitude tie-break must pick the PAIR
    // (summed 2× damage) — a pure-focus rule that ignores total would tie and could
    // fall through to the id/facing tiebreak and pick the lone foe.
    const lone = defaultUnit("lone", 1, { pos: { x: 0, y: 0 }, hp: 200, maxHp: 300, evasion: EV0, faith: 100 });
    const pairLo = defaultUnit("pairlo", 1, { pos: { x: 6, y: 6 }, hp: 200, maxHp: 300, evasion: EV0, faith: 100 });
    const pairHi = defaultUnit("pairhi", 1, { pos: { x: 7, y: 6 }, hp: 300, maxHp: 300, evasion: EV0, faith: 100 });
    const state = createBattleState({ seed: 1, grid: { width: 8, height: 8 }, units: [actor, lone, pairLo, pairHi] });

    const cmd = decideBalanceProbe(state, "actor");
    expect(cmd.kind).toBe("act");
    if (cmd.kind !== "act" || "unitId" in cmd.target) throw new Error("expected a tile-targeted area act");
    const caught = unitsInAoeBox(state.grid, state.units, cmd.target, { h: 1, v: 1 }).filter((u) => u.teamId === 1);
    expect(caught.map((u) => u.id).sort()).toEqual(["pairhi", "pairlo"]);
  });
});

// ─── 7. BENCHMARK: a real summon AoE damages >1 unit in a turn ────────────────

function loadRegistry(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  return loadContentPack(JSON.parse(readFileSync(path, "utf8")) as unknown);
}
function loadRecords(): Record<string, UnitRecord> {
  const dir = fileURLToPath(new URL("../../data/builds", import.meta.url));
  const records: Record<string, UnitRecord> = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const rec = deserializeRecord(readFileSync(`${dir}/${file}`, "utf8"));
    records[rec.id] = rec;
  }
  return records;
}

describe("benchmark — the shipped Summoner build lands an AoE on >1 unit via the harness", () => {
  it("summon.* resolves as an area charge hitting ≥2 foes in one resolution", () => {
    const registry = loadRegistry();
    const records = loadRecords();
    // The real shipped bld-glass-summoner + the real balance-probe AI + the real
    // harness — only the arena is controlled (two Stopped foes clustered so a summon
    // can mature and land). In the shipped suite summons are cancelled mid-flight
    // (battles end first), so a controlled arena is the honest way to prove the
    // AoE RESOLUTION fires end-to-end with real content.
    const summoner = buildBattleUnit(records["bld-glass-summoner"]!, registry, {
      teamId: 0,
      pos: { x: 0, y: 2 },
      facing: "E",
      hp: 400,
      maxHp: 400,
    });
    const foeA = defaultUnit("foe-a", 1, { pos: { x: 4, y: 2 }, statuses: [legacyActiveStatus("stop")], hp: 500, maxHp: 500, faith: 100 });
    const foeB = defaultUnit("foe-b", 1, { pos: { x: 4, y: 3 }, statuses: [legacyActiveStatus("stop")], hp: 500, maxHp: 500, faith: 100 });
    const state = createBattleState({ seed: 5, grid: { width: 8, height: 8, tiles: makeFlatTiles(8, 8) }, units: [summoner, foeA, foeB] });

    const res = runFromState(state, {
      victory: { kind: "eliminateTeams", teams: [1] },
      defeat: { kind: "eliminateTeams", teams: [0] },
      maxTurns: 40,
      maxTicks: 2000,
    });

    // A summon was actually issued, and at least one area charge landed on ≥2 units.
    expect(Object.keys(res.report.abilityUsage).some((id) => id.startsWith("summon."))).toBe(true);
    const multiHit = res.state.turnLog.filter((e) => {
      const m = e.action.match(/charge \S+ aoe (\d+) hit/);
      return m && Number(m[1]) >= 2;
    });
    expect(multiHit.length).toBeGreaterThan(0);
  });
});
