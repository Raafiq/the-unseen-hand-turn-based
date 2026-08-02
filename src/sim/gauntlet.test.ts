/**
 * Build-diversity gate tests (docs/06 AC-E2, docs/08 AC-R3, ADR-0014). The gate
 * ships the honest interim target: `distinctMeasurableArchetypes ≥ N` (N=4, the
 * observed collapse-corrected count) PLUS the anti-convergence dominance ban, over a
 * substitution gauntlet on the 6 shipped maps.
 *
 * The discriminating tests below each FAIL against a real balance problem (CLAUDE.md):
 * an over-tuned dominator trips the ban; degrading a measurable build drops the count;
 * a grind-win is excluded from the band; a masked build (signature never lands) and an
 * inert carried-by-filler candidate are not credited; and the whole report is
 * byte-reproducible. Test-layer IO (reads the JSON); the sim/gate code stays pure.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { deserializeRecord, type UnitRecord } from "./roster.js";
import { parseEncounter, loadEncounter, type EncounterResolver } from "./encounter.js";
import { runEncounterDetailed } from "./harness.js";
import { replay, advanceToDecision } from "./driver.js";
import { serialize } from "./state.js";
import {
  runGauntlet,
  computeDiversityReport,
  buildGauntletEncounter,
  inBand,
  MEASURABLE,
  EXCLUDED,
  OPPOSITION_BUILD_IDS,
  FILLER_BUILD_ID,
  CANDIDATE_SLOT,
  DEFAULT_BAND,
  DIVERSITY_TARGET_N,
  WIN_CEIL_TICKS,
  type GauntletMap,
  type GauntletRun,
} from "./gauntlet.js";

// ── fixtures (test-layer IO) ────────────────────────────────────────────────
function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  return loadContentPack(JSON.parse(readFileSync(path, "utf8")) as unknown);
}
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
const MAP_IDS = [
  "skirmish-a",
  "enc-the-breach",
  "enc-behead-the-warlord",
  "enc-the-high-ground",
  "enc-mixed-company",
  "enc-the-long-march",
] as const;
function loadMaps(): GauntletMap[] {
  return MAP_IDS.map((id) => {
    const path = fileURLToPath(new URL(`../../data/encounters/${id}.json`, import.meta.url));
    return { id, encounter: parseEncounter(JSON.parse(readFileSync(path, "utf8"))) };
  });
}

const registry = loadShippedPack();
const records = loadShippedBuilds();
const resolver: EncounterResolver = { registry, records };
const maps = loadMaps();

/** The frozen gauntlet — computed once (measurable candidates × 6 maps). */
const frozenRuns = runGauntlet({ resolver, maps });

/** A synthetic run row (for band-boundary logic tests). */
function run(over: Partial<GauntletRun> & { buildId: string; mapId: string }): GauntletRun {
  return {
    archetypeId: over.buildId,
    signaturePrefix: `${over.buildId}.`,
    outcome: "victory",
    ticks: 40,
    turns: 12,
    hpFraction: 1,
    candidateDamage: 100,
    candidateHealing: 0,
    candidateSignatureLanded: 3,
    ...over,
  };
}

// ── the frozen gate PASSES (the shipped baseline) ───────────────────────────
describe("diversity gate — AC-E2 interim: the frozen gauntlet passes honestly", () => {
  it(`asserts ≥ N=${DIVERSITY_TARGET_N} distinct measurable identities and no hard-dominance`, () => {
    const rep = computeDiversityReport(frozenRuns);
    expect(rep.pass).toBe(true);
    expect(rep.distinctMeasurableArchetypes).toBeGreaterThanOrEqual(DIVERSITY_TARGET_N);
    expect(rep.distinctSignatures).toEqual(["aim.", "black-magic.", "geomancy.", "punch-art."]);
    // Threshold-free relative dominance: no build is fastest-or-tied on all six.
    expect(rep.dominantBuilds).toEqual([]);
    // Several builds DO clear all six maps against this single opposition — that is
    // EXPECTED (geometry varies, threat does not) and is surfaced, not failed.
    expect(rep.winsAllInBand.length).toBeGreaterThan(0);
    expect(rep.winsAllInBand).toContain("bld-longshot");
  });

  it("credits exactly the builds whose signature landed while viable (arcane is sub-viable → not counted directly)", () => {
    const rep = computeDiversityReport(frozenRuns);
    const measurable = rep.perBuild.filter((b) => b.measurableIdentity).map((b) => b.buildId).sort();
    expect(measurable).toEqual([
      "bld-faithzero-monk",
      "bld-longshot",
      "bld-spellblade",
      "bld-terrain-geo",
    ]);
    // arcane-artillery collapses onto black-magic. AND is sub-viable here (pure-caster
    // charge-whiff-loops to timeout on the small maps) — present, measured, not counted.
    const arcane = rep.perBuild.find((b) => b.buildId === "bld-arcane-artillery")!;
    expect(arcane.measurableIdentity).toBe(false);
    expect(arcane.signaturePrefix).toBe("black-magic.");
  });
});

// ── manifest completeness (no build silently dropped) ───────────────────────
describe("diversity gate — manifest: every shipped build is measured or has a named blocker", () => {
  it("partitions all archetype builds into MEASURABLE ∪ EXCLUDED, each EXCLUDED tagged", () => {
    // The two gauntlet CONTROL fixtures are not archetype builds under test.
    const controls = new Set([FILLER_BUILD_ID, "bld-glass-bruiser"]);
    const archetypeBuilds = Object.keys(records).filter((id) => !controls.has(id));
    for (const id of archetypeBuilds) {
      const inManifest = id in MEASURABLE || id in EXCLUDED;
      expect(inManifest, `${id} is neither MEASURABLE nor EXCLUDED`).toBe(true);
    }
    for (const [id, blocker] of Object.entries(EXCLUDED)) {
      expect(blocker.length, `${id} has an empty blocker`).toBeGreaterThan(0);
    }
    // No build is both measured and excluded.
    for (const id of Object.keys(MEASURABLE)) expect(id in EXCLUDED).toBe(false);
  });
});

// ── the honesty-linchpin metric: contributionByUnit is LANDED accounting ─────
describe("diversity gate — contributionByUnit is the landed-outcome metric (Part 1)", () => {
  it("landed damage is conserved (Σ damageDealt == Σ HP lost) in a heal-free run", () => {
    // longshot + fillers vs the frozen opposition — no unit on either side heals, so
    // every point of HP lost was accounted to some unit's damageDealt.
    const enc = buildGauntletEncounter(maps[1]!.encounter, "bld-longshot"); // the-breach
    const { report, state } = runEncounterDetailed(enc, resolver, undefined, {
      signaturePrefixes: { [CANDIDATE_SLOT]: "aim." },
    });
    const dealt = Object.values(report.contributionByUnit).reduce((s, c) => s + c.damageDealt, 0);
    const healed = Object.values(report.contributionByUnit).reduce((s, c) => s + c.healingDone, 0);
    const hpLost = state.units.reduce((s, u) => s + (u.maxHp - Math.max(0, u.hp)), 0);
    expect(healed).toBe(0);
    expect(dealt).toBe(hpLost);
    // Every unit has an entry; the candidate actually dealt damage and landed aim.*.
    expect(Object.keys(report.contributionByUnit).sort()).toEqual(state.units.map((u) => u.id).sort());
    const cand = report.contributionByUnit[CANDIDATE_SLOT]!;
    expect(cand.damageDealt).toBeGreaterThan(0);
    expect(cand.signatureActionsLanded).toBeGreaterThan(0);
  });

  it("signatureActionsLanded keys on the unit's prefix — a run with no prefix scores 0", () => {
    const enc = buildGauntletEncounter(maps[5]!.encounter, "bld-longshot"); // long-march
    const withPrefix = runEncounterDetailed(enc, resolver, undefined, {
      signaturePrefixes: { [CANDIDATE_SLOT]: "aim." },
    }).report.contributionByUnit[CANDIDATE_SLOT]!;
    const noPrefix = runEncounterDetailed(enc, resolver).report.contributionByUnit[CANDIDATE_SLOT]!;
    expect(withPrefix.signatureActionsLanded).toBeGreaterThan(0);
    expect(noPrefix.signatureActionsLanded).toBe(0);
    // The non-signature accounting is identical regardless of the prefix.
    expect(noPrefix.damageDealt).toBe(withPrefix.damageDealt);
  });
});

// ── byte-reproducibility of a gauntlet encounter (replay-equality) ──────────
describe("diversity gate — a gauntlet encounter is byte-deterministic (replay-equality)", () => {
  it("same (encounter, seed) → serialize-equal state, and the AI draws no rng", () => {
    const enc = buildGauntletEncounter(maps[0]!.encounter, "bld-faithzero-monk");
    const a = runEncounterDetailed(enc, resolver, undefined, { signaturePrefixes: { [CANDIDATE_SLOT]: "punch-art." } });
    const b = runEncounterDetailed(enc, resolver, undefined, { signaturePrefixes: { [CANDIDATE_SLOT]: "punch-art." } });
    expect(a.report).toEqual(b.report);
    expect(serialize(a.state)).toBe(serialize(b.state));
    // Replaying the issued command log (no AI) + the trailing terminal advance
    // reproduces the final state byte-for-byte (reuses the benchmark-suite pattern).
    const replayed = advanceToDecision(replay(loadEncounter(enc, resolver), a.commands)).state;
    expect(serialize(replayed)).toBe(serialize(a.state));
  });
});

// ── TEST 6: determinism of the whole diversity report ───────────────────────
describe("diversity gate — determinism: the report is byte-identical across runs", () => {
  it("two full gauntlet runs produce equal runs AND equal reports", () => {
    const a = runGauntlet({ resolver, maps });
    const b = runGauntlet({ resolver, maps });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(computeDiversityReport(a)).toEqual(computeDiversityReport(b));
  });
});

// ── TEST 1: dominance bites ─────────────────────────────────────────────────
describe("diversity gate — TEST 1: an over-tuned dominator trips the RELATIVE ban and FAILS the gate", () => {
  it("a build that strictly outclasses the whole measurable field is hard-dominant → pass=false", () => {
    // Over-tuned on SPEED + PA so it clears every map faster than the entire honest
    // field (PA alone is travel-floored ~48t; speed buys extra turns → ~10t clears).
    const dominator: UnitRecord = {
      ...records["bld-longshot"]!,
      id: "bld-dominator",
      raw: { ...records["bld-longshot"]!.raw, pa: 40, speed: 40 },
    };
    const res2: EncounterResolver = { registry, records: { ...records, [dominator.id]: dominator } };
    const domRuns = runGauntlet({ resolver: res2, maps, candidateIds: ["bld-dominator"], signatureOf: () => "aim." });

    // ALONE it clears every map but is NOT flagged dominant — the relative rule needs
    // a field to outclass (no other measurable build ⇒ vacuous, never a fail).
    const alone = computeDiversityReport(domRuns).perBuild[0]!;
    expect(alone.winsAll).toBe(true);
    expect(alone.dominant).toBe(false);

    // Against the honest field it clears EVERY map faster than ALL of them → strictly
    // outclasses the field → hard-dominant → the whole gate FAILS. (Discriminating: it
    // is genuinely faster, not tied — dominant under the fastest-or-tied rule.)
    const rep = computeDiversityReport([...frozenRuns, ...domRuns]);
    const domStat = rep.perBuild.find((b) => b.buildId === "bld-dominator")!;
    expect(domStat.dominant).toBe(true);
    expect(rep.dominantBuilds).toEqual(["bld-dominator"]); // only it, not the honest builds
    expect(rep.pass).toBe(false);
  });
});

// ── TEST 2: diversity floor bites ───────────────────────────────────────────
describe("diversity gate — TEST 2: dropping a measurable identity below band FAILS the gate", () => {
  it("keys on the BAND, not victory: a build that WINS all 6 but only past WIN_CEIL is not counted", () => {
    // Four synthetic identities. Ticks are IN band but CROSSED per map (a Latin-ish
    // offset) so no build is fastest-or-tied everywhere → nobody is falsely flagged
    // hard-dominant; the pass/fail turns purely on the count. One (geo) wins every map
    // but SLOWLY (past the ceiling) in the failing variant.
    const prefixes = { aimer: "aim.", monk: "punch-art.", mage: "black-magic.", geo: "geomancy." };
    const crossed = (b: number, m: number): number => 100 + ((b + m) % 3) * 20; // in band, no uniform winner
    const rowsFor = (buildId: keyof typeof prefixes, b: number, tick?: (m: number) => number): GauntletRun[] =>
      MAP_IDS.map((m, mi) =>
        run({ buildId, signaturePrefix: prefixes[buildId], mapId: m, ticks: tick ? tick(mi) : crossed(b, mi) }),
      );
    const fast = [...rowsFor("aimer", 0), ...rowsFor("monk", 1), ...rowsFor("mage", 2)];
    const geoFast = rowsFor("geo", 3);
    const geoSlow = rowsFor("geo", 3, () => WIN_CEIL_TICKS + 200); // still a VICTORY, just past the ceiling
    // Discriminating: geoSlow still WINS every map (outcome victory) — only the tick
    // ceiling separates it. With fast geo the gate passes; with slow geo it fails.
    expect(computeDiversityReport([...fast, ...geoFast]).pass).toBe(true);
    const slow = computeDiversityReport([...fast, ...geoSlow]);
    expect(slow.distinctSignatures).not.toContain("geomancy.");
    expect(slow.distinctMeasurableArchetypes).toBe(3);
    expect(slow.pass).toBe(false);
  });

  it("real engine: degrading terrain-geo (MA→0) drops geomancy → distinct=3 → FAIL", () => {
    const deadGeo: UnitRecord = {
      ...records["bld-terrain-geo"]!,
      raw: { ...records["bld-terrain-geo"]!.raw, ma: 0 },
    };
    const res2: EncounterResolver = { registry, records: { ...records, "bld-terrain-geo": deadGeo } };
    const runs = runGauntlet({ resolver: res2, maps });
    const rep = computeDiversityReport(runs);
    expect(rep.distinctSignatures).not.toContain("geomancy.");
    expect(rep.distinctMeasurableArchetypes).toBeLessThan(DIVERSITY_TARGET_N);
    expect(rep.pass).toBe(false);
  });
});

// ── TEST 3: band excludes grind-wins ────────────────────────────────────────
describe("diversity gate — TEST 3: a grind-win near maxTicks is NOT in band", () => {
  it("inBand rejects a victory past WIN_CEIL and accepts a fast one", () => {
    const grind = run({ buildId: "x", mapId: "m", outcome: "victory", ticks: 2900, candidateDamage: 50 });
    const fast = run({ buildId: "x", mapId: "m", outcome: "victory", ticks: 40, candidateDamage: 50 });
    expect(inBand(grind, DEFAULT_BAND)).toBe(false);
    expect(inBand(fast, DEFAULT_BAND)).toBe(true);
    // A win with zero candidate contribution is also excluded (carried).
    expect(inBand(run({ buildId: "x", mapId: "m", ticks: 40, candidateDamage: 0, candidateHealing: 0 }), DEFAULT_BAND)).toBe(false);
  });
});

// ── TEST 4: masking is not credited ─────────────────────────────────────────
describe("diversity gate — TEST 4: a masked build (signature never lands) is NOT counted", () => {
  it("a build that WINS ≥4 in band but whose declared signature never lands scores 0", () => {
    // longshot fights as itself (aim) and wins, but we DECLARE its signature as
    // black-magic. — a job it never casts (the wrong-job / masked case) → sig never
    // lands → not credited, even though it is fully viable.
    const runs = runGauntlet({ resolver, maps, candidateIds: ["bld-longshot"], signatureOf: () => "black-magic." });
    const stat = computeDiversityReport(runs).perBuild[0]!;
    expect(stat.inBandMaps.length).toBeGreaterThanOrEqual(DEFAULT_BAND.viableMin); // genuinely viable
    expect(stat.signatureBandMaps.length).toBe(0); // but the signature never landed
    expect(stat.measurableIdentity).toBe(false); // → not a measurable identity
  });
});

// ── TEST 5: carried-by-filler is not counted ────────────────────────────────
describe("diversity gate — TEST 5: an inert candidate carried to a win is NOT counted", () => {
  it("a PA-0 candidate whose 2 fillers win the battle contributes 0 → not in band → not counted", () => {
    const inert: UnitRecord = {
      ...records[FILLER_BUILD_ID]!,
      id: "bld-inert",
      raw: { ...records[FILLER_BUILD_ID]!.raw, pa: 0 },
    };
    const res2: EncounterResolver = { registry, records: { ...records, [inert.id]: inert } };
    // Weak 2-unit opposition so the two fillers carry the team to victory.
    const runs = runGauntlet({
      resolver: res2,
      maps,
      candidateIds: ["bld-inert"],
      signatureOf: () => "aim.",
      opposition: ["bld-glass-bruiser", "bld-glass-bruiser"],
    });
    const wins = runs.filter((r) => r.outcome === "victory");
    expect(wins.length).toBeGreaterThanOrEqual(DEFAULT_BAND.viableMin); // the TEAM wins
    expect(wins.every((r) => r.candidateDamage === 0 && r.candidateHealing === 0)).toBe(true); // candidate did nothing
    const stat = computeDiversityReport(runs).perBuild[0]!;
    expect(stat.inBandMaps.length).toBe(0); // contribution 0 ⇒ never in band
    expect(stat.measurableIdentity).toBe(false);
  });
});

// ── opposition/filler sanity (the frozen instrument is what we think it is) ──
describe("diversity gate — the frozen instrument", () => {
  it("fixes a 3-unit mixed-defense opposition and a signature-free filler", () => {
    expect(OPPOSITION_BUILD_IDS.length).toBe(3);
    // The filler shares no candidate signature prefix (it has only basic.attack).
    const fillerAbilities = records[FILLER_BUILD_ID]!.learned;
    for (const { signaturePrefix } of Object.values(MEASURABLE)) {
      expect(fillerAbilities.some((a) => a.startsWith(signaturePrefix))).toBe(false);
    }
  });
});
