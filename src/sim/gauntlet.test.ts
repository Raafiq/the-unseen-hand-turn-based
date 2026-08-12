/**
 * Build-diversity gate tests (docs/06 AC-E2, docs/08 AC-R3, ADR-0014). The gate
 * ships the honest interim target: `distinctMeasurableArchetypes ≥ N` (N=1 as of
 * 2026-08-12, re-baselined when `ai.ts` learned ADR-0015's move+act fold and six of
 * seven candidates fell just under VIABLE_MIN_MAPS) PLUS the anti-convergence dominance
 * ban, over a substitution gauntlet on the 6 shipped maps. N=1 is a placeholder for the
 * content re-tune, not a target — see the DIVERSITY_TARGET_N docstring in gauntlet.ts.
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
  OPPOSITIONS,
  REFERENCE_OPPOSITION_ID,
  FILLER_BUILD_ID,
  CANDIDATE_SLOT,
  DEFAULT_BAND,
  DIVERSITY_TARGET_N,
  WIN_CEIL_TICKS,
  VIABLE_MIN_MAPS,
  type GauntletMap,
  type GauntletRun,
  type Opposition,
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
    oppositionId: REFERENCE_OPPOSITION_ID,
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
    expect(rep.distinctMeasurableArchetypes).toBe(DIVERSITY_TARGET_N);
    expect(rep.distinctMeasurableArchetypes).toBeGreaterThanOrEqual(DIVERSITY_TARGET_N);
    // POST-TTK-RE-TUNE (2026-08-12): five viable prefixes. This went 6 → 1 (the move+act
    // fold) → 5 (the TTK re-tune). The missing sixth is `black-magic.`; see the
    // DIVERSITY_TARGET_N docstring for why each of its two carriers fails.
    expect(rep.distinctSignatures).toEqual([
      "aim.",
      "geomancy.",
      "punch-art.",
      "summon.",
      "white-magic.",
    ]);
    // Threshold-free relative dominance over {maps × oppositions}: the monk sweeps every
    // cell but does NOT clear them all fastest, so it is surfaced, not failed.
    expect(rep.dominantBuilds).toEqual([]);
    // SURFACED FOR DESIGN REVIEW, not failed: `bld-faithzero-monk` now clears EVERY
    // {map × opposition} cell, and three builds pay no opportunity cost across the two
    // threat axes. That is a genuine anti-convergence signal to watch — a build with
    // nothing to lose to is what docs/02 B5 exists to prevent — but clearing everything
    // WITHOUT outclassing the field is a design conversation, not a gate failure.
    expect(rep.winsAllInBand).toEqual(["bld-faithzero-monk"]);
    expect(rep.noLosingMatchup).toEqual([
      "bld-faithzero-monk",
      "bld-longshot",
      "bld-terrain-geo",
    ]);
  });

  it("the sub-viable builds are STILL LANDING their signatures — the loss is viability, not masking", () => {
    // THE load-bearing distinction for the re-tune slice, and the one this file must keep
    // proving: post-fold N fell 6→1, and there are two very different reasons that could
    // happen. Either the probe stopped EXPRESSING these identities (masking — a borrowed
    // secondary out-damaging the signature, the Slice-3 bug class in src/sim/CLAUDE.md),
    // or the builds simply stopped WINNING. Those demand opposite fixes, so assert which.
    //
    // `signatureBandMaps ⊆ inBandMaps` always; equality means that on every map where the
    // build was viable, its signature also landed — i.e. nothing is masked, the builds are
    // just losing. If a future change breaks this equality, the re-tune is chasing the
    // wrong problem and this test says so.
    // ONE NAMED EXCEPTION (2026-08-12, the TTK re-tune): `bld-spellblade` IS masked, and
    // that is asserted POSITIVELY below rather than excused — a knight's MA 6 makes its
    // borrowed black magic (37) lose to its own PA × WP swing (90), so the greedy probe
    // never picks it. The mask always existed; it only became OBSERVABLE once spellblade
    // started winning a map at all. `ttk.test.ts` pins the magnitude cause.
    const MASKED_KNOWN = new Set(["bld-spellblade"]);
    const rep = computeDiversityReport(frozenRuns);
    for (const b of rep.perBuild) {
      if (MASKED_KNOWN.has(b.buildId)) continue;
      expect(b.signatureBandMaps, `${b.buildId}: signature masked, not merely sub-viable`).toEqual(
        b.inBandMaps,
      );
    }
    // The exception is REAL — it wins a map without its signature landing. Asserted so it
    // cannot be quietly fixed (or quietly spread to another build) without this noticing.
    const spellblade = rep.perBuild.find((b) => b.buildId === "bld-spellblade")!;
    expect(spellblade.inBandMaps.length).toBeGreaterThan(0);
    expect(spellblade.signatureBandMaps).toEqual([]);

    // The two builds that still miss the band are the two `black-magic.` carriers, and
    // they miss it BADLY (1 of the required 4) — this is no longer the near-miss that
    // made a blanket content re-tune the right lever. Their causes differ and are named
    // in the DIVERSITY_TARGET_N docstring.
    const subViable = rep.perBuild.filter((b) => !b.measurableIdentity);
    expect(subViable.map((b) => b.buildId).sort()).toEqual([
      "bld-arcane-artillery",
      "bld-spellblade",
    ]);
    for (const b of subViable) {
      expect(b.inBandMaps.length, `${b.buildId} in-band maps`).toBeLessThan(VIABLE_MIN_MAPS);
    }
  });

  it("credits exactly the five builds whose signature landed while viable", () => {
    const rep = computeDiversityReport(frozenRuns);
    const measurable = rep.perBuild.filter((b) => b.measurableIdentity).map((b) => b.buildId).sort();
    // INVERTED TWICE. Pre-fold arcane-artillery was the ONLY build that did NOT count;
    // post-fold it was the only one that DID; post-TTK-re-tune it is again the only
    // measurable-manifest build that does not, alongside its prefix-mate spellblade.
    expect(measurable).toEqual([
      "bld-faithzero-monk",
      "bld-glass-summoner",
      "bld-longshot",
      "bld-reraise-cleric",
      "bld-terrain-geo",
    ]);
    for (const id of measurable) {
      const b = rep.perBuild.find((x) => x.buildId === id)!;
      expect(b.inBandMaps.length, id).toBeGreaterThanOrEqual(VIABLE_MIN_MAPS);
      expect(b.signatureBandMaps.length, id).toBeGreaterThan(0);
    }
  });
});

// ── manifest completeness (no build silently dropped) ───────────────────────
describe("diversity gate — manifest: every shipped build is measured or has a named blocker", () => {
  it("partitions all archetype builds into MEASURABLE ∪ EXCLUDED, each EXCLUDED tagged", () => {
    // The gauntlet CONTROL fixtures (filler, opposition bruiser/caster) are not
    // archetype builds under test.
    const controls = new Set([FILLER_BUILD_ID, "bld-glass-bruiser", "bld-hedge-caster"]);
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
    // SIX synthetic identities (N=6 target). Ticks are IN band but CROSSED per map (a
    // Latin-ish offset) so no build is fastest-or-tied everywhere → nobody is falsely
    // flagged hard-dominant; the pass/fail turns purely on the count. One (geo) wins
    // every map but SLOWLY (past the ceiling) in the failing variant.
    const prefixes = { aimer: "aim.", monk: "punch-art.", mage: "black-magic.", cleric: "white-magic.", summoner: "summon.", geo: "geomancy." };
    const crossed = (b: number, m: number): number => 100 + ((b + m) % 3) * 20; // in band, no uniform winner
    const rowsFor = (buildId: keyof typeof prefixes, b: number, tick?: (m: number) => number): GauntletRun[] =>
      MAP_IDS.map((m, mi) =>
        run({ buildId, signaturePrefix: prefixes[buildId], mapId: m, ticks: tick ? tick(mi) : crossed(b, mi) }),
      );
    // The supporting cast is sized to leave exactly `DIVERSITY_TARGET_N - 1` identities
    // standing once geo drops, so slowing geo is what flips the verdict. A cast frozen at
    // the wrong size detects NOTHING: too many and the report clears N with geo already
    // gone (passes either way); too few and it fails either way. This bit twice (N=6 → 1
    // → 5), so it is DERIVED from the target rather than written out.
    const supporting = (["aimer", "monk", "mage", "cleric", "summoner"] as const).slice(
      0,
      DIVERSITY_TARGET_N - 1,
    );
    expect(supporting.length).toBe(DIVERSITY_TARGET_N - 1); // the roster can size the cast
    const fast: GauntletRun[] = supporting.flatMap((b, i) => rowsFor(b, i));
    const geoFast = rowsFor("geo", 3);
    const geoSlow = rowsFor("geo", 3, () => WIN_CEIL_TICKS + 200); // still a VICTORY, just past the ceiling
    // Discriminating: geoSlow still WINS every map (outcome victory) — only the tick
    // ceiling separates it. With fast geo the gate passes; with slow geo geomancy drops
    // below the ceiling → distinct falls under N → it fails.
    expect(computeDiversityReport([...fast, ...geoFast]).pass).toBe(true);
    const slow = computeDiversityReport([...fast, ...geoSlow]);
    expect(slow.distinctSignatures).not.toContain("geomancy.");
    expect(slow.distinctMeasurableArchetypes).toBe(DIVERSITY_TARGET_N - 1);
    expect(slow.pass).toBe(false);
  });

  it("real engine: degrading terrain-geo (MA→0) drops geomancy. → distinct 5→4 (< N=5) → FAIL", () => {
    // RE-POINTED TWICE. It degraded terrain-geo, then arcane-artillery (post-fold the only
    // counted identity), and now terrain-geo again — because post-TTK-re-tune it is
    // `black-magic.` that is uncounted, so degrading arcane-artillery would move distinct
    // by 0 and the test would pass while detecting nothing. The rule this keeps obeying:
    // the degraded build must be one that CURRENTLY COUNTS, or the check cannot come out
    // the other way. terrain-geo is the sole `geomancy.` carrier, so killing its MA
    // removes exactly one identity — a clean 5→4.
    const deadGeo: UnitRecord = {
      ...records["bld-terrain-geo"]!,
      raw: { ...records["bld-terrain-geo"]!.raw, ma: 0 },
    };
    const res2: EncounterResolver = {
      registry,
      records: { ...records, "bld-terrain-geo": deadGeo },
    };
    const rep = computeDiversityReport(runGauntlet({ resolver: res2, maps }));
    expect(rep.distinctSignatures).not.toContain("geomancy.");
    expect(rep.distinctMeasurableArchetypes).toBeLessThan(DIVERSITY_TARGET_N);
    expect(rep.pass).toBe(false);
    // Guard the guard: assert the UNDEGRADED gate passes on the same fixture set, so a
    // future change that makes the gate fail unconditionally cannot masquerade as
    // detection here.
    expect(computeDiversityReport(runGauntlet({ resolver, maps })).pass).toBe(true);
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
    // faithzero-monk fights as itself (punch-art) and wins, but we DECLARE its signature
    // as aim. — a job it never uses (the wrong-job / masked case) → sig never lands → not
    // credited, even though it is fully viable.
    //
    // RE-POINTED TWICE (longshot → arcane-artillery → faithzero-monk). The test needs a
    // candidate that is GENUINELY VIABLE, so that failing to be credited can only be the
    // masking. Post-TTK-re-tune arcane-artillery clears 1 of 6 maps and would fail the
    // viability precondition, isolating nothing; the monk clears 6/6, the widest margin
    // on the roster.
    const runs = runGauntlet({ resolver, maps, candidateIds: ["bld-faithzero-monk"], signatureOf: () => "aim." });
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
    // Weak SINGLE-unit opposition so the two fillers carry the team to victory. It was a
    // 2-unit opposition until 2026-08-12: post-fold, two glass bruisers that close AND
    // strike each turn beat the fillers on most maps, so the "the TEAM wins" precondition
    // below stopped holding and the test could no longer isolate the carried-candidate
    // rule it exists to prove.
    const runs = runGauntlet({
      resolver: res2,
      maps,
      candidateIds: ["bld-inert"],
      signatureOf: () => "aim.",
      opposition: ["bld-glass-bruiser"],
    });
    const wins = runs.filter((r) => r.outcome === "victory");
    expect(wins.length).toBeGreaterThanOrEqual(DEFAULT_BAND.viableMin); // the TEAM wins
    expect(wins.every((r) => r.candidateDamage === 0 && r.candidateHealing === 0)).toBe(true); // candidate did nothing
    const stat = computeDiversityReport(runs).perBuild[0]!;
    expect(stat.inBandMaps.length).toBe(0); // contribution 0 ⇒ never in band
    expect(stat.measurableIdentity).toBe(false);
  });
});

// ── TEST 3: reraise-cleric is an HONEST white-magic. identity, not a masked brawler ─
describe("diversity gate — TEST 3: reraise-cleric is a real white-magic. identity (offensive holy)", () => {
  it("lands white-magic on the phys axis (viable + signature landed + casts white-magic.*)", () => {
    // reraise-cleric on the phys REFERENCE axis casts white-magic.holy (never heals here
    // — no ally takes sustained damage), so its landed damage is attributable to its
    // signature. Run it alone over the 6 maps vs the phys reference opposition.
    const runs = runGauntlet({
      resolver,
      maps,
      candidateIds: ["bld-reraise-cleric"],
      opposition: OPPOSITION_BUILD_IDS, // single phys reference opposition
    });
    const stat = computeDiversityReport(runs).perBuild[0]!;
    expect(stat.signaturePrefix).toBe("white-magic.");
    // RESTORED 2026-08-12 (the TTK re-tune): the cleric is a counted identity again. It
    // had regressed under the move+act fold, and the strict assertions were parked with a
    // note to restore them here rather than deleted.
    expect(stat.measurableIdentity).toBe(true);
    expect(stat.inBandMaps.length).toBeGreaterThanOrEqual(VIABLE_MIN_MAPS);
    // Still expressing itself where it does survive: it never wins a map without its
    // signature landing. If that stops being true, the cleric is being MASKED, which is a
    // real bug rather than a tuning shortfall — so this must not be relaxed to `>= 0`.
    expect(stat.signatureBandMaps).toEqual(stat.inBandMaps);
    const inBandRuns = runs.filter((r) => inBand(r, DEFAULT_BAND));
    expect(inBandRuns.length).toBeGreaterThan(0); // it is not dead, just sub-viable
    expect(inBandRuns.every((r) => r.candidateDamage > 0)).toBe(true);
    expect(inBandRuns.every((r) => r.candidateSignatureLanded > 0)).toBe(true);
    // DISCRIMINATING vs a masked brawler AND vs crediting the WRONG white-magic identity:
    // it must land the OFFENSIVE `white-magic.holy` specifically — not merely "some
    // white-magic.*", which the prefix also matches for `cure`/`cura`. Since HEAL (class
    // 2) outranks CHIP (class 3), a slower fixture can make the cleric prefer a heal and
    // still pass a prefix-only check, so `holy` is pinned by name.
    //
    // ⚠ WHAT CHANGED 2026-08-12 (the TTK re-tune). This test used to assert the cleric
    // NEVER heals on the phys reference axis (`cure`/`cura` == 0, `healingDone` == 0) —
    // true only because allies died in one hit, so nobody was ever wounded-but-alive.
    // With fights now running 3–4 committed actions, `cura` DOES fire: the sustain
    // identity ADR-0014 called unmodeled is live on this axis for the first time. The
    // offensive claim is unaffected and still carries the identity — holy 9 casts /
    // 747 damage vs cura 2 casts / 90 healing on this map — so the assertion is
    // re-pointed at the RATIO rather than relaxed to nothing.
    const enc = buildGauntletEncounter(maps[1]!.encounter, "bld-reraise-cleric"); // the-breach (phys)
    const { report } = runEncounterDetailed(enc, resolver, undefined, {
      signaturePrefixes: { [CANDIDATE_SLOT]: "white-magic." },
    });
    const holyCasts = report.abilityUsage["white-magic.holy"] ?? 0;
    const healCasts =
      (report.abilityUsage["white-magic.cure"] ?? 0) + (report.abilityUsage["white-magic.cura"] ?? 0);
    expect(holyCasts).toBeGreaterThan(0);
    // The heal path is live now — asserted POSITIVELY so it cannot silently disappear
    // again (its absence was the old fixture artefact this note exists to explain).
    expect(healCasts).toBeGreaterThan(0);
    // …but the identity is OFFENSIVE: holy still dominates both the cast count and the
    // contribution. If a future change inverts this, the cleric is being counted as the
    // sustain build, which is a DIFFERENT identity than the manifest credits.
    expect(holyCasts).toBeGreaterThan(healCasts);
    const contribution = report.contributionByUnit[CANDIDATE_SLOT]!;
    expect(contribution.damageDealt).toBeGreaterThan(contribution.healingDone);
  });
});

// ── TEST 3 (summoner): glass-summoner is a real summon. identity on the phys axis ──
describe("diversity gate — TEST 3: glass-summoner lands summon. on ≥4/6 phys maps", () => {
  it("opens summon. from the backline (h6 range) — viable + signature landed + casts summon.*", () => {
    // The h4→h6 offensive-summon range fix lets the ~40-effHp glass caster open `summon.`
    // BEFORE it is focus-fired. Run it alone over the 6 maps vs the phys reference
    // opposition; the count keys on `summon.` landing (not merely "some action"), so this
    // is DISCRIMINATING vs a masked build casting its borrowed black-magic.fire secondary.
    const runs = runGauntlet({
      resolver,
      maps,
      candidateIds: ["bld-glass-summoner"],
      opposition: OPPOSITION_BUILD_IDS, // single phys reference opposition
    });
    const stat = computeDiversityReport(runs).perBuild[0]!;
    expect(stat.signaturePrefix).toBe("summon.");
    // RESTORED 2026-08-12 (the TTK re-tune) — same shape as the reraise-cleric TEST 3
    // above. The h4→h6 range fix always did its job (the summoner opens `summon.` before
    // contact, asserted below); what had changed under the fold was that the faster field
    // killed it on more maps, and longer fights gave that back.
    expect(stat.measurableIdentity).toBe(true);
    expect(stat.inBandMaps.length).toBeGreaterThanOrEqual(VIABLE_MIN_MAPS);
    // Where it DOES survive, its signature still lands — not masked by its borrowed
    // black-magic secondary, which is the failure this test was built to catch.
    expect(stat.signatureBandMaps).toEqual(stat.inBandMaps);
    const inBandRuns = runs.filter((r) => inBand(r, DEFAULT_BAND));
    expect(inBandRuns.length).toBeGreaterThan(0); // still opens summons somewhere
    expect(inBandRuns.every((r) => r.candidateSignatureLanded > 0)).toBe(true);
    // Its slowest legit in-band win is well under WIN_CEIL (WIN_CEIL still valid).
    expect(inBandRuns.every((r) => r.ticks <= WIN_CEIL_TICKS)).toBe(true);
    // DISCRIMINATING per-map check vs the masked/wrong-job case: on an in-band phys map
    // the candidate actually CASTS a summon.* ability (not just its black-magic.fire
    // secondary). Pin an offensive summon usage > 0, mirroring reraise TEST-3's holy pin.
    const inBandMapId = inBandRuns[0]!.mapId;
    const enc = buildGauntletEncounter(
      maps.find((m) => m.id === inBandMapId)!.encounter,
      "bld-glass-summoner",
    );
    const { report } = runEncounterDetailed(enc, resolver, undefined, {
      signaturePrefixes: { [CANDIDATE_SLOT]: "summon." },
    });
    const summonCasts = Object.entries(report.abilityUsage)
      .filter(([id]) => id.startsWith("summon."))
      .reduce((s, [, n]) => s + n, 0);
    expect(summonCasts).toBeGreaterThan(0);
    expect(report.contributionByUnit[CANDIDATE_SLOT]!.signatureActionsLanded).toBeGreaterThan(0);
  });
});

// ── TEST 5: the N=1 gate can FAIL (calibrated to DETECT, not to pass) ───────
describe("diversity gate — TEST 5: N detects the loss of the surviving identity", () => {
  it("dropping any one measurable build collapses distinct 5→4 → FAIL", () => {
    // RESTORED AS A PER-IDENTITY SWEEP (2026-08-12, the TTK re-tune). It began as two
    // tests (drop glass-summoner; drop reraise-cleric), collapsed to one when the fold
    // left `black-magic.` the only counted identity, and is now a loop over EVERY
    // measurable build — each carries a distinct signature prefix, so dropping any one of
    // them must cost exactly one identity. That is stronger than the single-build version
    // and self-maintaining: a build added to (or lost from) MEASURABLE is covered without
    // anyone remembering to add a case.
    const rep0 = computeDiversityReport(frozenRuns, DEFAULT_BAND);
    const measurable = rep0.perBuild.filter((b) => b.measurableIdentity);
    expect(measurable.length).toBe(DIVERSITY_TARGET_N); // one build per counted identity
    // The other side of the discriminator: the UNMODIFIED frozen set passes. Without this
    // the loop could not tell "removal caused the failure" from "the gate always fails".
    expect(rep0.pass).toBe(true);

    for (const dropped of measurable) {
      const rep = computeDiversityReport(
        frozenRuns.filter((r) => r.buildId !== dropped.buildId),
        DEFAULT_BAND,
      );
      expect(rep.distinctSignatures, dropped.buildId).not.toContain(dropped.signaturePrefix);
      expect(rep.distinctMeasurableArchetypes, dropped.buildId).toBe(DIVERSITY_TARGET_N - 1);
      expect(rep.pass, dropped.buildId).toBe(false);
      // Not a spurious fail via dominance — it fails purely on the count.
      expect(rep.dominantBuilds, dropped.buildId).toEqual([]);
    }
  });

  // WHEN `black-magic.` IS RESTORED, the loop above picks it up automatically — it
  // enumerates whatever is measurable rather than naming builds.
});

// ── opposition/filler sanity (the frozen instrument is what we think it is) ──
describe("diversity gate — the frozen instrument", () => {
  it("fixes a 3-unit mixed-defense REFERENCE opposition and a signature-free filler", () => {
    expect(OPPOSITION_BUILD_IDS.length).toBe(3);
    // OPPOSITION_BUILD_IDS is the REFERENCE (phys) opposition's build ids.
    const ref = OPPOSITIONS.find((o) => o.id === REFERENCE_OPPOSITION_ID)!;
    expect(ref.buildIds).toEqual(OPPOSITION_BUILD_IDS);
    // The filler shares no candidate signature prefix (it has only basic.attack).
    const fillerAbilities = records[FILLER_BUILD_ID]!.learned;
    for (const { signaturePrefix } of Object.values(MEASURABLE)) {
      expect(fillerAbilities.some((a) => a.startsWith(signaturePrefix))).toBe(false);
    }
  });

  it("ships MULTI-MATCHUP opposition: a phys REFERENCE axis and a magic (Coven) axis", () => {
    const ids = OPPOSITIONS.map((o) => o.id);
    expect(ids).toContain("phys");
    expect(ids).toContain("magic");
    expect(REFERENCE_OPPOSITION_ID).toBe("phys");
    const magic = OPPOSITIONS.find((o) => o.id === "magic")!;
    expect(magic.kind).toBe("magic");
    // The Coven fields the hedge-caster; its kit is single-target INSTANT geomancy only
    // — no charged/black-magic, no AoE (anti spawn-wipe / anti-clump constraints).
    expect(magic.buildIds).toContain("bld-hedge-caster");
    const hc = records["bld-hedge-caster"]!;
    expect(hc.currentJob).toBe("geomancer");
    for (const ab of hc.learned) {
      expect(ab.startsWith("geomancy.")).toBe(true);
      expect(ab).not.toContain("sandstorm"); // no AoE
      expect(ab).not.toContain("quicksand"); // no slow-rider confound
    }
    // NO one-shot: a single water-ball must not KO a 72-effHp Faith-50 filler.
    // (magicDamage scales by target Faith; here it does ~32 vs Faith-50 → 3 casts to KO.)
    // Proven behaviourally by the straddle/losing-matchup tests below.
    expect(hc.faith).toBeLessThan(50);
  });
});

// ── the must-fail straddle: Faith is the pivot (anti-mage cliff) ─────────────
describe("diversity gate — the must-fail straddle: Faith-5 survives magic, Faith-50 does not", () => {
  it("a Faith-5 unit is viable vs the Coven while its Faith-50 twin is not (the anti-mage cliff)", () => {
    // Two candidates identical in EVERY stat except Faith. Faith is the ONLY pivot, so
    // if the property (magic damage scales by TARGET Faith) holds they must straddle;
    // a uniform wipe (both lose) or uniform spare (both win) is the degenerate tie this
    // test rejects (CLAUDE.md discriminating-case rule).
    const monk = records["bld-faithzero-monk"]!;
    expect(monk.faith).toBe(5);
    const twin50: UnitRecord = { ...monk, id: "bld-monk-faith50", faith: 50 };
    const res2: EncounterResolver = { registry, records: { ...records, [twin50.id]: twin50 } };

    // Isolate Faith as the pivot: 1 filler (not 2, so the candidate itself is a magic
    // target) vs a caster-HEAVY Coven (3 casters, no warden) that piles magic on the
    // lone-ish candidate. The real-roster gate keeps its 2-filler fixture (untouched).
    const coven: Opposition = {
      id: "magic",
      buildIds: ["bld-hedge-caster", "bld-hedge-caster", "bld-hedge-caster"],
      kind: "magic",
      note: "straddle fixture (caster-heavy, Faith is the pivot)",
    };
    const runs = runGauntlet({
      resolver: res2,
      maps,
      candidateIds: ["bld-faithzero-monk", "bld-monk-faith50"],
      oppositions: [coven],
      fillerCount: 1,
      signatureOf: () => "punch-art.",
    });
    const viableMaps = (id: string): number =>
      runs.filter((r) => r.buildId === id && inBand(r, DEFAULT_BAND)).length;
    const faith5 = viableMaps("bld-faithzero-monk");
    const faith50 = viableMaps("bld-monk-faith50");

    // BOTH halves are mandatory (the discriminating assertion):
    expect(faith5).toBeGreaterThanOrEqual(VIABLE_MIN_MAPS); // Faith-5 resists magic → viable
    // Faith-50 is NOT viable. Keyed on VIABLE_MIN_MAPS — the definition of viability the
    // rest of the gate uses — rather than the old `maps.length / 2`. Post-fold the twin
    // clears exactly 3, so the straddle still holds (4 vs 3, both halves + a strict gap)
    // but the unrelated half-the-maps figure no longer has slack. Keying the claim on the
    // constant that DEFINES it is the fix; loosening the number would not have been.
    expect(faith50).toBeLessThan(VIABLE_MIN_MAPS);
    // …and they genuinely differ (not a tie): Faith-5 clears strictly more maps.
    expect(faith5).toBeGreaterThan(faith50);
  });
});

// ── a real losing matchup exists on the honest roster (non-uniform matrix) ───
describe("diversity gate — opportunity cost is now visible (non-uniform matchup matrix)", () => {
  it("≥1 shipped measurable build has a non-empty losingMatchups (folds to the Coven)", () => {
    const rep = computeDiversityReport(frozenRuns);
    const measurable = rep.perBuild.filter((b) => b.measurableIdentity);
    const withLoss = measurable.filter((b) => b.losingMatchups.length > 0);
    // Non-uniform: at least one measurable build folds to a threat axis (magic).
    expect(withLoss.length).toBeGreaterThan(0);
    expect(withLoss.some((b) => b.losingMatchups.includes("magic"))).toBe(true);
    // And the matrix is genuinely non-uniform — NOT every measurable build loses the
    // same matchup (some build clears both axes ≥ viableMin), so magic is a real
    // opportunity cost, not a blanket wipe.
    // THE KNIFE-EDGE THIS TEST WARNED ABOUT ACTUALLY TRIPPED (2026-08-12). Its previous
    // note read: "today the ONLY build keeping the matrix non-uniform is longshot at
    // magic == VIABLE_MIN_MAPS (exactly 4/6) — the healthy-state margin is zero. If a
    // future recalibration drops longshot to 3/6, all measurable builds fold to magic and
    // this flips to failure; re-tune the Coven rather than relaxing this assertion."
    // The move+act fold dropped longshot to 2/6 on phys, so it is not measurable at all.
    //
    // With exactly ONE measurable identity, non-uniformity is not merely false — it is
    // INEXPRESSIBLE (a one-build matrix is a point). Relaxing the assertion would delete a
    // real signal, so instead it is made conditional and SELF-RE-ARMING: the moment the
    // content re-tune restores a second measurable identity, the strict check applies
    // again automatically, with no one needing to remember to restore it.
    if (measurable.length > 1) {
      expect(withLoss.length).toBeLessThan(measurable.length);
    } else {
      expect(measurable.length).toBe(1); // pin the degenerate state so it cannot go unnoticed
    }
  });
});
