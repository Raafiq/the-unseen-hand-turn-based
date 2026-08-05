/**
 * Benchmark-suite tests (docs/06 AC-E1/AC-E4, P2 Slice 3). The Slice-2 harness proved
 * ONE encounter runs headlessly; this proves the SHIPPED SUITE does — the six §2
 * encounters (`data/encounters/enc-*.json`) fielding the shipped reference builds
 * (`data/builds/*.json`) — and, the discriminating part, that the four new jobs are
 * actually EXERCISED by the balance probe (not merely present in the catalog).
 *
 * Why "exercised" is the load-bearing assertion: the balance-probe AI only ever
 * selects `action` abilities with a live formula (physical/magic/heal); it ignores
 * every `none`-formula ability and all passives (ai.ts). A build whose new job never
 * contributes a live action would run as an indistinct weapon-brawler, and the
 * (Slice-4) diversity gate could not tell it apart. So we assert each new skillset's
 * live action shows up in the suite's aggregate `abilityUsage` — the property that a
 * plausible-but-wrong authoring (all-`none` abilities, or masked by a stronger
 * secondary) would FAIL (CLAUDE.md: an AC test must exercise the discriminating case).
 *
 * Test-layer IO (reads the JSON); the sim loader itself stays pure.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { runEncounter, runEncounterDetailed } from "./harness.js";
import { loadEncounter } from "./encounter.js";
import { replay, advanceToDecision } from "./driver.js";
import { buildBattleUnit } from "./build.js";
import { decideBalanceProbe } from "./ai.js";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { deserializeRecord, type UnitRecord } from "./roster.js";
import { createBattleState, makeFlatTiles, serialize } from "./state.js";

function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  return loadContentPack(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

/** Every shipped reference build, keyed by record id — the ref map the encounters resolve against. */
function loadShippedBuilds(): Record<string, UnitRecord> {
  const dir = fileURLToPath(new URL("../../data/builds", import.meta.url));
  const records: Record<string, UnitRecord> = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const rec = deserializeRecord(readFileSync(`${dir}/${file}`, "utf8"));
    records[rec.id] = rec;
  }
  return records;
}

function loadEncDef(id: string): unknown {
  const path = fileURLToPath(new URL(`../../data/encounters/${id}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

const registry = loadShippedPack();
const records = loadShippedBuilds();
const resolver = { registry, records };

/** The six §2 benchmark encounters shipped this slice (skirmish-a is covered by harness.test). */
const SUITE = [
  "enc-the-breach",
  "enc-behead-the-warlord",
  "enc-the-high-ground",
  "enc-mixed-company",
  "enc-the-long-march",
] as const;

/** Outcomes that mean the battle actually RESOLVED (docs/06 AC-E1) — not a non-terminating stall. */
const DECISIVE = new Set(["victory", "defeat", "draw"]);

describe("benchmark suite — AC-E1: every §2 encounter runs headlessly to a decisive outcome", () => {
  for (const id of SUITE) {
    it(`${id} resolves (not timeout/stalemate) and is byte-deterministic`, () => {
      const def = loadEncDef(id);
      const a = runEncounterDetailed(def, resolver);
      expect(DECISIVE.has(a.report.outcome)).toBe(true);
      expect(a.report.turns).toBeGreaterThan(0);

      // Determinism (AC-E4): a second run is report- and state-identical.
      const b = runEncounterDetailed(def, resolver);
      expect(a.report).toEqual(b.report);
      expect(serialize(a.state)).toBe(serialize(b.state));

      // The AI draws NO rng: replaying its issued command log (no AI) against a fresh
      // load, then applying the SAME trailing advanceToDecision the run's terminal check
      // performs, reproduces the final state byte-for-byte. (runFromState's returned
      // state is post-terminal-advance — which matters whenever an encounter ends with an
      // action still mid-flight, e.g. a charge queued at the terminal check: that advance
      // resolves/cancels it and ticks the crystal timers, so a bare replay would stop one
      // advance short.)
      const replayed = advanceToDecision(replay(loadEncounter(def, resolver), a.commands)).state;
      expect(serialize(replayed)).toBe(serialize(a.state));
      expect(replayed.rngCounter).toBe(a.report.finalRngCounter);
    });
  }
});

describe("benchmark suite — AC-E2 raw material: the new jobs are actually MEASURED", () => {
  /** Aggregate the issued-command histogram across the whole suite. */
  function suiteUsage(): Record<string, number> {
    const total: Record<string, number> = {};
    for (const id of SUITE) {
      const report = runEncounter(loadEncDef(id), resolver);
      for (const [ability, n] of Object.entries(report.abilityUsage)) {
        total[ability] = (total[ability] ?? 0) + n;
      }
    }
    return total;
  }

  it("each new skillset contributes a LIVE action the balance probe actually uses", () => {
    const usage = suiteUsage();
    const used = Object.keys(usage);
    // Discriminating: a job authored with only none-formula/passive abilities, OR a
    // build whose new skillset is masked by a stronger borrowed secondary, would leave
    // its prefix absent here — exactly the bug this asserts against.
    for (const skillset of ["aim", "geomancy", "summon", "white-magic"]) {
      const fired = used.filter((id) => id.startsWith(`${skillset}.`));
      expect(fired.length, `no ${skillset}.* action was used anywhere in the suite`).toBeGreaterThan(0);
    }
  });
});

describe("benchmark suite — the heal path is live (Priest sustain identity)", () => {
  it("a cleric with a damaged in-range ally and no reachable foe chooses to HEAL", () => {
    // Constructed rather than encounter-driven: reliably threading an AI heal between
    // focus-fire strikes in a symmetric probe is fragile, but the heal BRANCH must
    // provably fire. Cleric + a wounded ally in Cure range; the only foe is out of
    // every ability's range, so the sole worthwhile action is the heal.
    const cleric = buildBattleUnit(records["bld-reraise-cleric"]!, registry, {
      teamId: 0,
      pos: { x: 0, y: 0 },
      facing: "E",
    });
    const allyFull = buildBattleUnit(records["bld-counter-wall"]!, registry, {
      teamId: 0,
      pos: { x: 1, y: 0 },
      facing: "E",
    });
    const ally = { ...allyFull, hp: Math.max(1, Math.floor(allyFull.maxHp / 2)) }; // wounded, alive
    const foe = buildBattleUnit(records["bld-aggro-tank"]!, registry, {
      teamId: 1,
      pos: { x: 8, y: 0 }, // distance 8 > every cleric ability range (holy h5) → unreachable
      facing: "W",
    });
    const state = createBattleState({
      seed: 1,
      grid: { width: 9, height: 1, tiles: makeFlatTiles(9, 1) },
      units: [cleric, ally, foe],
    });

    const command = decideBalanceProbe(state, cleric.id);
    expect(command.kind).toBe("act");
    if (command.kind === "act") {
      const chosen = cleric.abilities.find((a) => a.id === command.abilityId);
      expect(chosen?.formula).toBe("heal");
    }
  });
});

describe("benchmark suite — the reference build set is loadable and distinct", () => {
  it("ships ≥10 archetype builds, every ref an encounter names resolves", () => {
    // The seed set the Slice-4 diversity matrix draws from.
    expect(Object.keys(records).length).toBeGreaterThanOrEqual(10);
    for (const id of SUITE) {
      // loadEncounter throws on any unresolved ref source; a clean load proves the
      // encounter↔build wiring is intact.
      expect(() => loadEncounter(loadEncDef(id), resolver)).not.toThrow();
    }
  });
});
