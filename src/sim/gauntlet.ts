/**
 * Build-diversity gate — the SUBSTITUTION GAUNTLET (docs/06 AC-E2, docs/08 AC-R3,
 * ADR-0014, N = 4). This is the HONEST INTERIM FLOOR, not the full anti-convergence
 * proof.
 *
 * WHAT THIS GATE PROVES (and only this):
 *   (a) ≥ N distinct measurable build identities each LAND their signature action and
 *       stay VIABLE (win in band on ≥ viableMin of the 6 maps); AND
 *   (b) a gross-over-tuning check — no build STRICTLY OUTCLASSES the whole measurable
 *       field (fastest-or-tied on every map while clearing all six).
 *
 * WHAT IT DOES NOT YET PROVE — opportunity-cost / anti-convergence (docs/02 B5). The
 * single FIXED bruiser opposition varies GEOMETRY (map to map), not THREAT: nothing
 * on the opposing side casts magic, provokes, or reacts. So a build's threat-specific
 * identity is NEVER exercised here — e.g. `bld-faithzero-monk`'s ANTI-MAGE identity
 * (low Faith → resists magic) is credited on plain melee, because no foe casts. A
 * build clearing ALL SIX maps against this one opposition is therefore EXPECTED and
 * is NOT a dominance fail (it is surfaced as {@link DiversityReport.winsAllInBand} for
 * visibility). Real anti-convergence pressure requires MULTI-MATCHUP opposition
 * (varied threat profiles) — the named next step; only then does "wins every matchup"
 * become a meaningful convergence signal and the dominance verdict tighten.
 *
 * METHOD (ADR-0014 / docs/plans/slice-4-diversity-gate.md): hold everything constant
 * except ONE candidate. Field `{candidate + 2 fixed filler bruisers}` (team 0) against
 * a FIXED 3-unit mixed-DEFENCE opposition (team 1) across the 6 shipped maps — reusing
 * each map's grid + seed + halting caps, substituting only the placements and
 * NORMALISING the objective to team-elimination (a unit-specific objective like
 * behead-the-warlord's cannot survive placement substitution). A clear is then
 * ATTRIBUTABLE to the candidate.
 *
 * HONESTY LINCHPIN: a candidate counts under its archetype only when its SIGNATURE
 * action actually LANDED (`RunReport.contributionByUnit[cand].signatureActionsLanded
 * > 0`), never when its issued-command histogram merely names it — so a masked
 * brawler (its signature dominated by a borrowed secondary, the Slice-3 bug class)
 * and a carried-by-filler inert candidate both score 0 and are NOT credited.
 *
 * DISTINCT identities are keyed by the landed SIGNATURE PREFIX, not the build name:
 * `bld-spellblade` and `bld-arcane-artillery` both signature on `black-magic.`, so
 * when both fight as black-mages they COLLAPSE to one identity (the honest count is
 * 4, not 5 — ADR-0014; see {@link DIVERSITY_TARGET_N}).
 *
 * DOMINANCE is a THRESHOLD-FREE RELATIVE verdict (no calibrated tick cut-off to
 * gerrymander): a build is dominant only if it clears all six maps AND no other
 * measurable build clears ANY map faster than it (fastest-or-tied everywhere). See
 * {@link computeDiversityReport}.
 *
 * DETERMINISM (P0): every run is a seeded, headless `runEncounter`; this module is
 * PURE (no IO, no clock, no RNG) — the test layer injects the parsed content /
 * records / map defs. Same inputs → byte-identical {@link DiversityReport}.
 */

import { runEncounterDetailed } from "./harness.js";
import { parseEncounter, type Encounter, type EncounterResolver } from "./encounter.js";
import type { RunReport } from "./harness.js";

// ─────────────────────────────────────────────────────────────────────────────
// Manifest (ADR-0014): the committed MEASURABLE allow-list + EXCLUDED blockers.
// Every shipped reference build is either measured here or excluded with a NAMED
// blocking capability — none is silently dropped.
// ─────────────────────────────────────────────────────────────────────────────

/** One measurable candidate: its archetype id and the ability prefix that IS its identity. */
export interface MeasurableEntry {
  archetypeId: string;
  /** A landed action whose abilityId starts with this prefix exercises the identity. */
  signaturePrefix: string;
}

/**
 * The MEASURABLE allow-list. NOTE the shared `black-magic.` prefix on spellblade and
 * arcane-artillery: they are separate BUILDS but ONE distinct identity in the count
 * (the collapse ADR-0014 predicts). Both remain listed — both are measured — but the
 * distinct-identity count keys on the prefix, so they contribute one identity.
 */
export const MEASURABLE: Readonly<Record<string, MeasurableEntry>> = {
  "bld-spellblade": { archetypeId: "spellblade", signaturePrefix: "black-magic." },
  "bld-arcane-artillery": { archetypeId: "arcane-artillery", signaturePrefix: "black-magic." },
  "bld-terrain-geo": { archetypeId: "geomancer", signaturePrefix: "geomancy." },
  "bld-longshot": { archetypeId: "longshot", signaturePrefix: "aim." },
  "bld-faithzero-monk": { archetypeId: "anti-mage", signaturePrefix: "punch-art." },
};

/**
 * The EXCLUDED manifest: build id → the named capability that would unblock its
 * measurement (ADR-0014). A build here is not silently dropped — its identity is a
 * REACTION, a threat mechanic, support-aware AI, or a boss target none of which the
 * greedy 1-ply probe can exercise yet. N rises as each capability lands.
 */
export const EXCLUDED: Readonly<Record<string, string>> = {
  "bld-glass-summoner": "charged-AoE survival / support-aware AI (summon is focus-fired before it matures)",
  "bld-aggro-tank": "provoke/threat mechanic (the probe ignores threat)",
  "bld-counter-wall": "reaction-as-live modeling (Counter is a passive reaction)",
  "bld-reraise-cleric": "reaction-as-live modeling + support-aware AI (Reraise is a reaction; heal is AI-limited)",
  "bld-battle-cleric": "support-aware AI (the probe heals only when no foe is reachable)",
  "bld-warlord": "boss chassis, not an archetype (the assassinate target, not a diversity build)",
};

/** The 2 fixed filler allies fielded with EVERY candidate (share no candidate signature). */
export const FILLER_BUILD_ID = "bld-filler-bruiser";
export const FILLER_COUNT = 2;

/**
 * The FIXED 3-unit MIXED-DEFENCE opposition, byte-identical across every run: one
 * FRAGILE bruiser (`bld-glass-bruiser`, 36 raw HP → ~43 effective after knight
 * growth) + two STURDY bruisers (`bld-filler-bruiser`, 60 raw HP → ~72 effective).
 * Held constant so a clearance difference is a candidate difference, never an
 * opposition difference. This mix varies DEFENCE (HP), not THREAT — see the module
 * docstring for the anti-convergence caveat that follows from that.
 *
 * WHY this composition (calibrated): the engine is rocket-tag lethal and the probe
 * is greedy 1-ply, so a UNIFORM soft opposition (3 fillers) lets the initiative-first
 * team sweep every map at the minimum tick, while a UNIFORM firm opposition starves
 * the WEAK single-target casters (geomancy) of a killable target. The
 * fragile-bruiser-plus-two-sturdy mix threads that needle: the fragile ~43-HP target
 * gives a weak caster a securable kill (making geomancy VIABLE), while the two ~72-HP
 * bruisers keep the fight non-trivial. Plain physical bruisers (not casters) on
 * purpose: a caster opposition's charged AoE resolves as an engine step and wipes the
 * fragile candidate team before it closes, swamping the candidate signal. RECALIBRATE
 * if docs/01 constants or the maps change.
 */
export const OPPOSITION_BUILD_IDS: readonly string[] = [
  "bld-glass-bruiser",
  "bld-filler-bruiser",
  "bld-filler-bruiser",
];

// ─────────────────────────────────────────────────────────────────────────────
// Band + gate thresholds — CALIBRATED-THEN-FROZEN (ADR-0014). Only WIN_CEIL is a
// tick threshold (a coarse victory-vs-grind separator); the DOMINANCE verdict is
// threshold-free/relative (no tick cut-off to gerrymander). RECALIBRATE WIN_CEIL when
// docs/01 combat constants OR the gauntlet maps/opposition change.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A run is IN BAND only if it WON by this tick. [UNCERTAIN] — CALIBRATED from the
 * CURRENT frozen distribution (regenerated after the committed AoE/charge engine):
 * every legitimate victory clears by ≤ 95 ticks (the slowest legit win is terrain-geo
 * on the-long-march at 95), and the grind tail — a pure-caster charge-whiff loop —
 * only ever TIMES OUT (≥ 570 ticks, never a victory). 300 sits in that wide gap:
 * comfortably above the slowest real win, far below the grind/maxTicks (3000) tail.
 * Its only job is to reject a would-be grind VICTORY near maxTicks; on the current
 * roster no such victory exists, so this threshold has ample slack. RECALIBRATE when
 * docs/01 constants or the maps change.
 */
export const WIN_CEIL_TICKS = 300;

/** A candidate is a VIABLE identity when it is IN BAND on ≥ this many of the 6 maps. */
export const VIABLE_MIN_MAPS = 4; // docs/plans viability fraction (4/6)

/**
 * The interim distinct-identity target (ADR-0014). Set to the HONEST OBSERVED count:
 * 4 distinct signature prefixes are viable on the frozen gauntlet —
 * `black-magic.` (spellblade; arcane-artillery COLLAPSES onto the same prefix and is
 * sub-viable here anyway), `geomancy.`, `aim.`, `punch-art.`. `≥ 8` (full AC-E2)
 * stays the release bar, marked BLOCKED; N rises as the EXCLUDED capabilities land.
 */
export const DIVERSITY_TARGET_N = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Placement generation (pure, deterministic from the grid).
// ─────────────────────────────────────────────────────────────────────────────

interface Pos {
  x: number;
  y: number;
}

/** Passability of a grid tile (a grid with no `tiles` is fully passable/flat). */
function isPassable(grid: Encounter["grid"], x: number, y: number): boolean {
  if (!grid.tiles) return true;
  return grid.tiles[y * grid.width + x]?.passable ?? false;
}

/**
 * Pick `count` distinct passable tiles hugging one edge (`"left"` = x ascending,
 * `"right"` = x descending), column-major so a team clusters in its edge column(s).
 * `exclude` keeps the two teams off each other's tiles. Deterministic; throws if the
 * grid cannot seat the team (all shipped maps are ≥ 7 wide × ≥ 3 tall → always fits).
 */
function pickEdgeTiles(
  grid: Encounter["grid"],
  count: number,
  side: "left" | "right",
  exclude: ReadonlySet<string>,
): Pos[] {
  const xs =
    side === "left"
      ? Array.from({ length: grid.width }, (_, i) => i)
      : Array.from({ length: grid.width }, (_, i) => grid.width - 1 - i);
  const out: Pos[] = [];
  for (const x of xs) {
    for (let y = 0; y < grid.height && out.length < count; y++) {
      if (!isPassable(grid, x, y)) continue;
      if (exclude.has(`${x},${y}`)) continue;
      out.push({ x, y });
    }
    if (out.length >= count) break;
  }
  if (out.length < count) {
    throw new Error(`gauntlet: grid ${grid.width}x${grid.height} cannot seat ${count} units on the ${side}`);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Encounter construction.
// ─────────────────────────────────────────────────────────────────────────────

/** slotId of the candidate under test (its `contributionByUnit` key). */
export const CANDIDATE_SLOT = "cand";

/**
 * Build the substitution encounter for `candidateId` on a source map: reuse the
 * map's grid + seed + caps, seat `{candidate + fillers}` (team 0, left) vs the fixed
 * opposition (team 1, right), and NORMALISE the objective to team-elimination. All
 * unit sources are `ref` — the caller's resolver supplies the records.
 */
export function buildGauntletEncounter(
  source: Encounter,
  candidateId: string,
  opposition: readonly string[] = OPPOSITION_BUILD_IDS,
  fillerId: string = FILLER_BUILD_ID,
  fillerCount: number = FILLER_COUNT,
): Encounter {
  const team0Count = 1 + fillerCount;
  const left = pickEdgeTiles(source.grid, team0Count, "left", new Set());
  const usedLeft = new Set(left.map((p) => `${p.x},${p.y}`));
  const right = pickEdgeTiles(source.grid, opposition.length, "right", usedLeft);

  const team0: Encounter["placements"] = [
    { slotId: CANDIDATE_SLOT, teamId: 0, pos: left[0]!, facing: "E", unit: { kind: "ref", recordId: candidateId } },
    ...Array.from({ length: fillerCount }, (_, i) => ({
      slotId: `filler-${i + 1}`,
      teamId: 0,
      pos: left[i + 1]!,
      facing: "E" as const,
      unit: { kind: "ref" as const, recordId: fillerId },
    })),
  ];
  const team1: Encounter["placements"] = opposition.map((id, i) => ({
    slotId: `opp-${i + 1}`,
    teamId: 1,
    pos: right[i]!,
    facing: "W",
    unit: { kind: "ref", recordId: id },
  }));

  const def = {
    encounterSchemaVersion: 1,
    id: `gauntlet:${source.id}:${candidateId}`,
    seed: source.seed,
    grid: source.grid,
    teams: [
      { teamId: 0, controller: "ai" as const },
      { teamId: 1, controller: "ai" as const },
    ],
    placements: [...team0, ...team1],
    // NORMALISED objective — a wipe of the opposition (unit-specific objectives do
    // not survive placement substitution). Team 0 victory ⇒ the candidate's team won.
    victory: { kind: "eliminateTeams" as const, teams: [1] },
    defeat: { kind: "eliminateTeams" as const, teams: [0] },
    maxTurns: source.maxTurns,
    maxTicks: source.maxTicks,
  };
  // Re-parse so the constructed def passes every encounter refine (unique tiles, in
  // bounds, resolvable objective) exactly as an on-disk encounter would.
  return parseEncounter(def);
}

// ─────────────────────────────────────────────────────────────────────────────
// Running the gauntlet.
// ─────────────────────────────────────────────────────────────────────────────

/** One (candidate, map) run's summary — the row the calibration table prints. */
export interface GauntletRun {
  buildId: string;
  archetypeId: string;
  signaturePrefix: string;
  mapId: string;
  outcome: RunReport["outcome"];
  ticks: number;
  turns: number;
  /** Team-0 (candidate side) remaining HP fraction — reporting only. */
  hpFraction: number;
  /** The candidate's own landed contribution this run. */
  candidateDamage: number;
  candidateHealing: number;
  candidateSignatureLanded: number;
}

/** A parsed source map + a stable id, injected by the (IO-doing) test layer. */
export interface GauntletMap {
  id: string;
  encounter: Encounter;
}

export interface RunGauntletParams {
  resolver: EncounterResolver;
  maps: readonly GauntletMap[];
  /** Candidate build ids to field (default: the MEASURABLE allow-list). */
  candidateIds?: readonly string[];
  opposition?: readonly string[];
  fillerId?: string;
  /** Per-candidate signature prefix; defaults to {@link MEASURABLE}'s entry. */
  signatureOf?: (buildId: string) => string;
  archetypeOf?: (buildId: string) => string;
}

/**
 * Run the full gauntlet: every candidate × every map → one deterministic, headless
 * run, tagged with the candidate's landed contribution. Pure over the injected data.
 */
export function runGauntlet(params: RunGauntletParams): GauntletRun[] {
  const candidateIds = params.candidateIds ?? Object.keys(MEASURABLE);
  const opposition = params.opposition ?? OPPOSITION_BUILD_IDS;
  const fillerId = params.fillerId ?? FILLER_BUILD_ID;
  const signatureOf = params.signatureOf ?? ((id) => MEASURABLE[id]?.signaturePrefix ?? "");
  const archetypeOf = params.archetypeOf ?? ((id) => MEASURABLE[id]?.archetypeId ?? id);

  const runs: GauntletRun[] = [];
  for (const buildId of candidateIds) {
    const prefix = signatureOf(buildId);
    for (const map of params.maps) {
      const enc = buildGauntletEncounter(map.encounter, buildId, opposition, fillerId);
      const { report } = runEncounterDetailed(enc, params.resolver, undefined, {
        signaturePrefixes: { [CANDIDATE_SLOT]: prefix },
      });
      const c = report.contributionByUnit[CANDIDATE_SLOT] ?? {
        damageDealt: 0,
        healingDone: 0,
        kos: 0,
        signatureActionsLanded: 0,
      };
      const team0 = report.teams.find((t) => t.teamId === 0);
      runs.push({
        buildId,
        archetypeId: archetypeOf(buildId),
        signaturePrefix: prefix,
        mapId: map.id,
        outcome: report.outcome,
        ticks: report.ticks,
        turns: report.turns,
        hpFraction: team0?.hpFraction ?? 0,
        candidateDamage: c.damageDealt,
        candidateHealing: c.healingDone,
        candidateSignatureLanded: c.signatureActionsLanded,
      });
    }
  }
  return runs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Band predicates + diversity report.
// ─────────────────────────────────────────────────────────────────────────────

/** Band config (frozen constants by default; overridable for calibration). */
export interface BandConfig {
  winCeil: number;
  viableMin: number;
  targetN: number;
}

export const DEFAULT_BAND: BandConfig = {
  winCeil: WIN_CEIL_TICKS,
  viableMin: VIABLE_MIN_MAPS,
  targetN: DIVERSITY_TARGET_N,
};

/** IN BAND: the candidate WON in time AND actually contributed (dealt/healed > 0). */
export function inBand(run: GauntletRun, band: BandConfig): boolean {
  return (
    run.outcome === "victory" &&
    run.ticks <= band.winCeil &&
    run.candidateDamage + run.candidateHealing > 0
  );
}

/** Per-build gate accounting over its 6 map runs. */
export interface BuildGateStat {
  buildId: string;
  archetypeId: string;
  signaturePrefix: string;
  inBandMaps: string[];
  /** In-band maps on which the SIGNATURE also landed — the archetype-exercised clears. */
  signatureBandMaps: string[];
  /**
   * A distinct measurable identity: VIABLE (in band on ≥ viableMin maps) AND its
   * signature LANDED on ≥ 1 (NOT all) of those in-band clears. The ≥ 1 is a deliberate
   * INTERIM-FLOOR insensitivity: it excludes a fully-masked brawler (signatureBandMaps
   * empty) and an inert carried candidate (inBandMaps empty — contributed nothing), but
   * it does NOT require the build to fight as its archetype on EVERY clear. Do not
   * mistake it for a stronger "always exercised" guarantee; tightening it to a majority
   * of clears waits on the multi-matchup opposition (module docstring).
   */
  measurableIdentity: boolean;
  /** Clears EVERY map in band (no losing matchup) — the near-dominance signal. */
  winsAll: boolean;
  /**
   * RELATIVE hard-dominance (a gate FAIL): this build clears all six maps AND no OTHER
   * measurable build clears ANY map faster than it (fastest-or-tied everywhere) — it
   * strictly outclasses the measurable field. Threshold-free (no calibrated tick cut).
   */
  dominant: boolean;
}

export interface DiversityReport {
  mapCount: number;
  band: BandConfig;
  perBuild: BuildGateStat[];
  /** Distinct signature prefixes among builds that are a measurable identity. */
  distinctSignatures: string[];
  distinctMeasurableArchetypes: number;
  /** Builds flagged by the RELATIVE hard-dominance rule — a gate FAIL when non-empty. */
  dominantBuilds: string[];
  /**
   * NEAR-DOMINANCE REPORT (NOT a fail): builds that clear all six maps in band (no
   * losing matchup). Against the SINGLE fixed opposition this is EXPECTED (the maps
   * vary geometry, not threat), so it is surfaced for visibility only. It becomes a
   * real anti-convergence signal once MULTI-MATCHUP opposition exists (module docstring).
   */
  winsAllInBand: string[];
  /** distinctMeasurableArchetypes ≥ targetN AND no hard-dominant build. */
  pass: boolean;
}

/**
 * Fold gauntlet runs into the gate verdict. `distinctMeasurableArchetypes` counts
 * DISTINCT signature prefixes among builds that QUALIFY (in band with the signature
 * landed on ≥ 1 clear) on ≥ `viableMin` maps — so the shared-`black-magic.` builds
 * collapse to one identity and a masked/inert candidate contributes none.
 *
 * DOMINANCE is THRESHOLD-FREE and RELATIVE (no tick cut-off to gerrymander): a build
 * is hard-dominant iff it clears ALL maps AND, on every map, NO OTHER measurable build
 * clears it faster (fastest-or-tied everywhere) — i.e. it strictly outclasses the
 * measurable field. On the honest roster no build is fastest-or-tied on all six
 * (spellblade beats longshot on the-breach, longshot beats spellblade on skirmish-a,
 * …) so `dominantBuilds` is empty; a gross-over-tuned build (e.g. doubled Speed) that
 * clears every map faster than the whole field trips it. Clearing all six WITHOUT
 * outclassing the field is only surfaced (`winsAllInBand`), never failed.
 *
 * Deterministic: builds are folded in run order; `distinctSignatures`, `dominantBuilds`
 * and `winsAllInBand` are id/prefix-sorted.
 */
export function computeDiversityReport(runs: readonly GauntletRun[], band: BandConfig = DEFAULT_BAND): DiversityReport {
  const byBuild = new Map<string, GauntletRun[]>();
  for (const r of runs) {
    const list = byBuild.get(r.buildId);
    if (list) list.push(r);
    else byBuild.set(r.buildId, [r]);
  }
  const mapIds = new Set(runs.map((r) => r.mapId));

  // Per-build in-band clear TICKS by map (undefined ⇒ did not clear that map in band).
  const inBandTicks = new Map<string, Map<string, number>>();

  const stats: BuildGateStat[] = [];
  for (const [buildId, buildRuns] of byBuild) {
    const inBandRuns = buildRuns.filter((r) => inBand(r, band));
    const inBandMaps = inBandRuns.map((r) => r.mapId);
    const signatureBandMaps = inBandRuns.filter((r) => r.candidateSignatureLanded > 0).map((r) => r.mapId);
    inBandTicks.set(buildId, new Map(inBandRuns.map((r) => [r.mapId, r.ticks])));
    stats.push({
      buildId,
      archetypeId: buildRuns[0]?.archetypeId ?? buildId,
      signaturePrefix: buildRuns[0]?.signaturePrefix ?? "",
      inBandMaps,
      signatureBandMaps,
      measurableIdentity: inBandMaps.length >= band.viableMin && signatureBandMaps.length > 0,
      winsAll: mapIds.size > 0 && inBandMaps.length === mapIds.size,
      dominant: false, // filled below (needs the whole measurable field)
    });
  }

  // RELATIVE hard-dominance: a build that clears all maps AND is fastest-or-tied vs
  // every OTHER measurable build on every map. Needs ≥ 1 other measurable competitor
  // (a lone build cannot "outclass the field").
  const measurable = stats.filter((s) => s.measurableIdentity);
  for (const b of stats) {
    if (!b.winsAll) continue;
    const others = measurable.filter((o) => o.buildId !== b.buildId);
    if (others.length === 0) continue;
    const bTicks = inBandTicks.get(b.buildId)!;
    let beatenSomewhere = false;
    for (const mapId of mapIds) {
      const bt = bTicks.get(mapId)!; // winsAll ⇒ present for every map
      for (const o of others) {
        const ot = inBandTicks.get(o.buildId)!.get(mapId);
        if (ot !== undefined && ot < bt) {
          beatenSomewhere = true;
          break;
        }
      }
      if (beatenSomewhere) break;
    }
    b.dominant = !beatenSomewhere;
  }

  const distinctSignatures = [...new Set(measurable.map((b) => b.signaturePrefix))].sort();
  const dominantBuilds = stats.filter((b) => b.dominant).map((b) => b.buildId).sort();
  const winsAllInBand = stats.filter((b) => b.winsAll).map((b) => b.buildId).sort();

  return {
    mapCount: mapIds.size,
    band,
    perBuild: stats,
    distinctSignatures,
    distinctMeasurableArchetypes: distinctSignatures.length,
    dominantBuilds,
    winsAllInBand,
    pass: distinctSignatures.length >= band.targetN && dominantBuilds.length === 0,
  };
}
