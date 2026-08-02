/**
 * Build-diversity gate — the SUBSTITUTION GAUNTLET (docs/06 AC-E2, docs/08 AC-R3,
 * ADR-0014, N = 4). This is the HONEST INTERIM FLOOR, not the full anti-convergence
 * proof.
 *
 * WHAT THIS GATE PROVES (and only this):
 *   (a) ≥ N distinct measurable build identities each LAND their signature action and
 *       stay VIABLE (win in band on ≥ viableMin of the 6 maps) against the REFERENCE
 *       (phys) opposition — the diversity COUNT keys on that axis ONLY; AND
 *   (b) a gross-over-tuning check — no build STRICTLY OUTCLASSES the whole measurable
 *       field (fastest-or-tied on EVERY cell while clearing all of {maps × oppositions}).
 *
 * MULTI-MATCHUP OPPOSITION (the current slice): the gauntlet now fields each candidate
 * against MORE THAN ONE threat profile — `phys` (a mixed-DEFENCE bruiser team, the
 * REFERENCE) and `magic` (THE COVEN: glassy single-target geomancers casting instant
 * Faith-scaling magic). Threat, not just geometry, now varies. Consequences:
 *   - A build can LOSE to a threat it is weak to (docs/02 B5 opportunity cost): its
 *     {@link BuildGateStat.losingMatchups} names the oppositions it is NOT viable
 *     against, so the matchup MATRIX is non-uniform (e.g. spellblade/terrain-geo clear
 *     phys but fold to the Coven's magic, while longshot clears both axes).
 *   - {@link DiversityReport.noLosingMatchup} is now a REAL anti-convergence signal —
 *     a MEASURABLE build viable (≥ viableMin) against EVERY opposition, i.e. one that
 *     pays no opportunity cost across the threat axes. It is SURFACED, not failed
 *     (clearing everything without OUTCLASSING the field is not over-tuning). It is
 *     DISTINCT from {@link DiversityReport.winsAllInBand} (in band on every single
 *     {map × opposition} cell — the stricter sweep the dominance ban keys on).
 *   - DOMINANCE tightened: it now ranges over the full {maps × oppositions} cell set —
 *     a build must clear BOTH axes on every map AND be fastest-or-tied everywhere, so
 *     the ban is strictly harder to trip and stays a gross-over-tune detector.
 * The COVEN'S KIT is deliberately constrained (see {@link OPPOSITIONS}): single-target
 * INSTANT geomancy only — NO charged/`black-magic.*` (charge-whiff / spawn-wipe on the
 * small clustered maps), NO AoE (a box on a clustered spawn is a spawn-swamp), and NO
 * one-shot (a cast must not KO a 72-HP Faith-50 body), so the melee race stays honest.
 *
 * WHAT THE MAGIC AXIS ACTUALLY MEASURES — READ THIS BEFORE READING `losingMatchups`.
 * On the shipped roster the magic axis is NOT an isolated candidate-Faith test, and a
 * `losingMatchups: ["magic"]` entry does NOT mean "weak to magic personally". Every
 * candidate is fielded with the SAME two Faith-50 filler allies, victory is
 * team-elimination, and the greedy probe focuses the highest-MAGNITUDE target — so the
 * casters kill the Faith-50 allies (~32/cast) long before any low-Faith body (~3/cast),
 * and the axis rewards TEMPO/RANGE (burst the glass casters before your allies fall) as
 * much as personal Faith. That is why `bld-faithzero-monk` — the ANTI-MAGE build — still
 * shows `losingMatchups: ["magic"]` (its personal magic resistance cannot save its
 * Faith-50 allies, and the 1-ply probe cannot protect them: the support-aware-AI
 * limitation, ADR-0014's family) while ranged `bld-longshot` (Faith 50) does not fold.
 * The magic axis's job here is to be a SECOND, DISTINCT threat that makes opportunity
 * cost non-uniform — not to credit the anti-mage's resistance. The isolated Faith cliff
 * (magic damage ∝ target Faith) is proved by the must-fail straddle TEST (a lone Faith-5
 * vs its Faith-50 twin, on a candidate-targeting fixture), NOT the aggregate roster gate.
 * WHAT IT STILL DOES NOT PROVE: the count keys on the phys REFERENCE only, so N is not
 * raised by magic viability; and only TWO threat axes exist.
 *
 * METHOD (ADR-0014 / docs/plans/slice-4-diversity-gate.md): hold everything constant
 * except ONE candidate. Field `{candidate + 2 fixed filler bruisers}` (team 0) against
 * EACH opposition (team 1) across the 6 shipped maps — reusing each map's grid + seed +
 * halting caps, substituting only the placements and NORMALISING the objective to
 * team-elimination (a unit-specific objective like behead-the-warlord's cannot survive
 * placement substitution). A clear is then ATTRIBUTABLE to the candidate.
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
 * gerrymander): a build is dominant only if it clears EVERY {map × opposition} cell
 * AND no other measurable build clears ANY cell faster than it (fastest-or-tied
 * everywhere, across both threat axes). See {@link computeDiversityReport}.
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

/** One threat-profile the whole candidate field is measured against. */
export interface Opposition {
  /** Stable id — a run's {@link GauntletRun.oppositionId} and the report's cell axis. */
  id: string;
  /** The 3-unit team fielded (team 1) on every map, byte-identical across runs. */
  buildIds: readonly string[];
  /** Coarse threat class — reporting/rationale only. */
  kind: "phys" | "magic";
  note: string;
}

/**
 * The MULTI-MATCHUP opposition manifest (P2 multi-matchup slice, ADR-0014). Each
 * candidate is fielded against EVERY opposition here, on every map — so the gauntlet
 * now varies THREAT (phys vs magic), not just GEOMETRY. The count still keys on the
 * REFERENCE (`phys`) opposition ({@link REFERENCE_OPPOSITION_ID}); the extra
 * oppositions turn `winsAllInBand` into a real no-losing-matchup signal and expose
 * opportunity cost (docs/02 B5) — a build can now LOSE to a threat it is weak to.
 */
export const OPPOSITIONS: readonly Opposition[] = [
  {
    id: "phys",
    // [BASELINE] the original FIXED 3-unit MIXED-DEFENCE team: one FRAGILE bruiser
    // (`bld-glass-bruiser`, 36 raw HP → ~43 effective after knight growth) + two
    // STURDY bruisers (`bld-filler-bruiser`, 60 raw HP → ~72 effective). The fragile
    // ~43-HP target gives a WEAK single-target caster (geomancy) a securable kill
    // (keeping geomancy VIABLE), while the two ~72-HP bruisers keep the fight
    // non-trivial. Plain physical bruisers on purpose — this axis varies DEFENCE (HP),
    // not threat. RECALIBRATE if docs/01 constants or the maps change.
    buildIds: ["bld-glass-bruiser", "bld-filler-bruiser", "bld-filler-bruiser"],
    kind: "phys",
    note: "REFERENCE opposition [BASELINE] — the diversity count keys on this axis (mixed-defence physical).",
  },
  {
    id: "magic",
    // THE COVEN — a MAGIC threat: 2× `bld-hedge-caster` (glassy geomancers casting
    // single-target instant magic — water-ball/static-shock/pitfall) + 1 warden
    // (`bld-filler-bruiser`, ~72 effHp) whose body the candidate melee must grind
    // through first, buying the casters casting turns. Damage scales by TARGET Faith
    // (`magicDamage`): a Faith-50 body takes the full cast (~32), a Faith-5 body takes
    // ~3. This is a SECOND, DISTINCT threat axis (not raw physical HP) that makes
    // opportunity cost non-uniform — NOT an isolated candidate-Faith test: with shared
    // Faith-50 fillers + team-elimination + magnitude-focus targeting, it rewards
    // tempo/range as much as personal Faith (see the module docstring; the isolated
    // Faith cliff is the straddle TEST's job).
    // KIT CONSTRAINTS (calibrated): (1) NO charged/`black-magic.*` spells — a charge
    // whiffs/spawn-wipes on the small clustered maps (the ADR's rocket-tag failure);
    // (2) NO AoE (`geomancy.sandstorm`) — a box on a clustered spawn is a spawn-swamp;
    // (3) NO one-shot — a single cast must not KO a 72-HP Faith-50 body (≥2 casts), so
    // the melee race stays honest and the caster's damage is a race, not a wipe.
    buildIds: ["bld-hedge-caster", "bld-hedge-caster", "bld-filler-bruiser"],
    kind: "magic",
    note: "The Coven — a MAGIC threat that exercises the anti-mage identity (damage scales by target Faith).",
  },
];

/**
 * The REFERENCE opposition id (ADR-0014): the diversity COUNT keys on this axis ONLY.
 * A build is *supposed* to lose to some threat, so requiring viability against every
 * opposition would collapse the count — keying on the reference keeps N stable and
 * moves the multi-matchup signal into `losingMatchups` / `winsAllInBand` instead.
 */
export const REFERENCE_OPPOSITION_ID = "phys";

/** Back-compat: the REFERENCE opposition's build ids (the original fixed team). */
export const OPPOSITION_BUILD_IDS: readonly string[] =
  OPPOSITIONS.find((o) => o.id === REFERENCE_OPPOSITION_ID)!.buildIds;

// ─────────────────────────────────────────────────────────────────────────────
// Band + gate thresholds — CALIBRATED-THEN-FROZEN (ADR-0014). Only WIN_CEIL is a
// tick threshold (a coarse victory-vs-grind separator); the DOMINANCE verdict is
// threshold-free/relative (no tick cut-off to gerrymander). RECALIBRATE WIN_CEIL when
// docs/01 combat constants OR the gauntlet maps/opposition change.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A run is IN BAND only if it WON by this tick. [UNCERTAIN] — CALIBRATED-THEN-FROZEN
 * from the CURRENT frozen distribution, now over BOTH threat axes (phys + magic; the
 * multi-matchup slice). Observed victory-tick distribution across all
 * {candidate × map × opposition} cells: every legitimate victory still clears by
 * ≤ 95 ticks (the slowest legit win remains terrain-geo on the-long-march vs the PHYS
 * opposition at 95; the MAGIC matchup adds NO slower win — its victories top out
 * ~63t). The grind/stall tail only ever TIMES OUT (≥ 570 ticks: a pure-caster
 * charge-whiff loop, or a stalled magic matchup — up to 1110t — never a victory).
 * 300 sits in that wide [95, 570] gap: comfortably above the slowest real win, far
 * below the grind/maxTicks (3000) tail — a coarse victory-vs-grind separator with
 * ample slack whose only job is to reject a would-be grind VICTORY near maxTicks.
 * RECALIBRATE when docs/01 constants, the maps, or the OPPOSITIONS change.
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
  oppositionId: string = REFERENCE_OPPOSITION_ID,
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
    id: `gauntlet:${oppositionId}:${source.id}:${candidateId}`,
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
  /** Which {@link OPPOSITIONS} entry this run was fought against (the threat axis). */
  oppositionId: string;
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
  /**
   * The threat axes to run each candidate against (default: all {@link OPPOSITIONS}).
   * The loop is candidate × map × opposition.
   */
  oppositions?: readonly Opposition[];
  /**
   * SINGLE-opposition override (a raw build-id list) — a convenience for tests that
   * want one custom opposition. When set it REPLACES `oppositions` with a single
   * REFERENCE (`phys`) opposition of those ids, so the diversity count still sees it.
   */
  opposition?: readonly string[];
  fillerId?: string;
  /** Filler allies fielded WITH the candidate (default {@link FILLER_COUNT}). */
  fillerCount?: number;
  /** Per-candidate signature prefix; defaults to {@link MEASURABLE}'s entry. */
  signatureOf?: (buildId: string) => string;
  archetypeOf?: (buildId: string) => string;
}

/**
 * Run the full gauntlet: every candidate × every map × every opposition → one
 * deterministic, headless run, tagged with the candidate's landed contribution and
 * the opposition it faced. Pure over the injected data.
 */
export function runGauntlet(params: RunGauntletParams): GauntletRun[] {
  const candidateIds = params.candidateIds ?? Object.keys(MEASURABLE);
  const oppositions: readonly Opposition[] = params.opposition
    ? [{ id: REFERENCE_OPPOSITION_ID, buildIds: params.opposition, kind: "phys", note: "test override" }]
    : params.oppositions ?? OPPOSITIONS;
  const fillerId = params.fillerId ?? FILLER_BUILD_ID;
  const fillerCount = params.fillerCount ?? FILLER_COUNT;
  const signatureOf = params.signatureOf ?? ((id) => MEASURABLE[id]?.signaturePrefix ?? "");
  const archetypeOf = params.archetypeOf ?? ((id) => MEASURABLE[id]?.archetypeId ?? id);

  const runs: GauntletRun[] = [];
  for (const buildId of candidateIds) {
    const prefix = signatureOf(buildId);
    for (const map of params.maps) {
      for (const opposition of oppositions) {
        const enc = buildGauntletEncounter(map.encounter, buildId, opposition.buildIds, fillerId, fillerCount, opposition.id);
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
          oppositionId: opposition.id,
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

/** Per-build gate accounting over its map × opposition runs. */
export interface BuildGateStat {
  buildId: string;
  archetypeId: string;
  signaturePrefix: string;
  /** In-band maps against the REFERENCE (phys) opposition — the axis the COUNT keys on. */
  inBandMaps: string[];
  /** Reference-opposition in-band maps on which the SIGNATURE also landed. */
  signatureBandMaps: string[];
  /**
   * A distinct measurable identity: VIABLE against the REFERENCE opposition (in band on
   * ≥ viableMin of its maps) AND its signature LANDED on ≥ 1 (NOT all) of those in-band
   * clears. Keyed on the REFERENCE axis, NOT every opposition — a build is supposed to
   * lose to some threat (see the module docstring), so requiring viability everywhere
   * would collapse the count. The ≥ 1 is a deliberate INTERIM-FLOOR insensitivity: it
   * excludes a fully-masked brawler (signatureBandMaps empty) and an inert carried
   * candidate (inBandMaps empty — contributed nothing), but it does NOT require the
   * build to fight as its archetype on EVERY clear.
   */
  measurableIdentity: boolean;
  /**
   * Clears EVERY cell ({map × opposition}) in band — no losing matchup ANYWHERE. Under
   * multi-matchup opposition this is a real convergence signal (a build that beats
   * both threat axes on every map), not the geometry-only artefact it was under a
   * single opposition.
   */
  winsAll: boolean;
  /**
   * The opposition ids this build is NOT viable against — in band on < `viableMin`
   * maps of that opposition. Non-empty ⇒ a real losing matchup / opportunity cost
   * (docs/02 B5): the build has something to lose to. Id-sorted.
   */
  losingMatchups: string[];
  /**
   * RELATIVE hard-dominance (a gate FAIL): this build clears EVERY cell ({maps ×
   * oppositions}) AND, on every cell, no OTHER measurable build clears it faster
   * (fastest-or-tied everywhere) — it strictly outclasses the measurable field across
   * BOTH threat axes. Threshold-free (no calibrated tick cut); strictly harder to trip
   * than the single-opposition version, so it stays a gross-over-tune detector.
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
   * WINS-EVERY-CELL REPORT: builds in band on EVERY single {map × opposition} cell.
   * This is the STRICT sweep the dominance ban keys on (a dominant build must first
   * clear every cell), NOT the anti-convergence signal — a build can have no losing
   * matchup (viable ≥ viableMin on every opposition) yet miss a cell or two and be
   * absent here (e.g. longshot: phys 6/6, magic 4/6). SURFACED, not failed. Id-sorted.
   */
  winsAllInBand: string[];
  /**
   * NO-LOSING-MATCHUP: the MEASURABLE builds whose per-build {@link
   * BuildGateStat.losingMatchups} is EMPTY — viable (in band on ≥ viableMin maps) against
   * EVERY opposition, i.e. an identity that pays no opportunity cost across the threat
   * axes (docs/02 B5). This is the real anti-convergence signal, DISTINCT from (and
   * looser than) {@link winsAllInBand}'s every-cell sweep. SURFACED for design review,
   * NOT a fail — a well-rounded build is a design conversation, not a gate failure; only
   * strict RELATIVE dominance fails the gate. Id-sorted.
   */
  noLosingMatchup: string[];
  /** distinctMeasurableArchetypes(reference) ≥ targetN AND no hard-dominant build. */
  pass: boolean;
}

/**
 * Fold gauntlet runs into the gate verdict. `distinctMeasurableArchetypes` counts
 * DISTINCT signature prefixes among builds that QUALIFY (in band with the signature
 * landed on ≥ 1 clear) on ≥ `viableMin` maps of the REFERENCE (`referenceOppositionId`,
 * default `phys`) opposition ONLY — so the shared-`black-magic.` builds collapse to one
 * identity, a masked/inert candidate contributes none, and a build LOSING a non-
 * reference matchup (the whole point of multi-matchup opposition) does not drop the
 * count. Per-build `losingMatchups` records the oppositions it is NOT viable against.
 *
 * DOMINANCE is THRESHOLD-FREE and RELATIVE (no tick cut-off to gerrymander) and now
 * ranges over the full {maps × oppositions} CELL set: a build is hard-dominant iff it
 * clears EVERY cell AND, on every cell, NO OTHER measurable build clears it faster
 * (fastest-or-tied everywhere) — i.e. it strictly outclasses the measurable field on
 * BOTH threat axes. On the honest roster no build clears every cell (each measurable
 * build folds to the Coven's magic on some map), so `winsAllInBand` — and therefore
 * `dominantBuilds` — is empty; a gross-over-tuned build (e.g. doubled Speed) that
 * sweeps every cell faster than the whole field trips it. Clearing every cell WITHOUT
 * outclassing the field is only surfaced (`winsAllInBand` / `noLosingMatchup`), never
 * failed.
 *
 * Deterministic: builds are folded in run order; `distinctSignatures`, `dominantBuilds`,
 * `winsAllInBand`, `noLosingMatchup` and each `losingMatchups` are id/prefix-sorted.
 */
export function computeDiversityReport(
  runs: readonly GauntletRun[],
  band: BandConfig = DEFAULT_BAND,
  referenceOppositionId: string = REFERENCE_OPPOSITION_ID,
): DiversityReport {
  const byBuild = new Map<string, GauntletRun[]>();
  for (const r of runs) {
    const list = byBuild.get(r.buildId);
    if (list) list.push(r);
    else byBuild.set(r.buildId, [r]);
  }
  const mapIds = new Set(runs.map((r) => r.mapId));
  const oppositionIds = [...new Set(runs.map((r) => r.oppositionId))].sort();
  // A CELL is one (map × opposition) combination present in the run set. `winsAll`
  // and dominance range over every cell, so multi-matchup opposition tightens both.
  const cellKey = (mapId: string, oppId: string): string => `${mapId} ${oppId}`;
  const allCells = new Set(runs.map((r) => cellKey(r.mapId, r.oppositionId)));

  // Per-build in-band clear TICKS by cell (undefined ⇒ did not clear that cell in band).
  const inBandCellTicks = new Map<string, Map<string, number>>();

  const stats: BuildGateStat[] = [];
  for (const [buildId, buildRuns] of byBuild) {
    const inBandRuns = buildRuns.filter((r) => inBand(r, band));
    // The COUNT keys on the REFERENCE opposition ONLY (ADR-0014): a build is supposed
    // to lose to some threat, so measurability is judged on the reference axis, not
    // every opposition (that would collapse the count).
    const refInBand = inBandRuns.filter((r) => r.oppositionId === referenceOppositionId);
    const inBandMaps = refInBand.map((r) => r.mapId);
    const signatureBandMaps = refInBand.filter((r) => r.candidateSignatureLanded > 0).map((r) => r.mapId);

    inBandCellTicks.set(buildId, new Map(inBandRuns.map((r) => [cellKey(r.mapId, r.oppositionId), r.ticks])));
    const inBandCells = new Set(inBandRuns.map((r) => cellKey(r.mapId, r.oppositionId)));

    // Losing matchups: an opposition on which the build is in band on < viableMin maps.
    const losingMatchups = oppositionIds
      .filter((oppId) => inBandRuns.filter((r) => r.oppositionId === oppId).length < band.viableMin)
      .sort();

    stats.push({
      buildId,
      archetypeId: buildRuns[0]?.archetypeId ?? buildId,
      signaturePrefix: buildRuns[0]?.signaturePrefix ?? "",
      inBandMaps,
      signatureBandMaps,
      measurableIdentity: inBandMaps.length >= band.viableMin && signatureBandMaps.length > 0,
      winsAll: allCells.size > 0 && [...allCells].every((c) => inBandCells.has(c)),
      losingMatchups,
      dominant: false, // filled below (needs the whole measurable field)
    });
  }

  // RELATIVE hard-dominance: a build that clears EVERY cell AND is fastest-or-tied vs
  // every OTHER measurable build on every cell. Needs ≥ 1 other measurable competitor
  // (a lone build cannot "outclass the field"). Ranges over {maps × oppositions}.
  const measurable = stats.filter((s) => s.measurableIdentity);
  for (const b of stats) {
    if (!b.winsAll) continue;
    const others = measurable.filter((o) => o.buildId !== b.buildId);
    if (others.length === 0) continue;
    const bTicks = inBandCellTicks.get(b.buildId)!;
    let beatenSomewhere = false;
    for (const cell of allCells) {
      const bt = bTicks.get(cell)!; // winsAll ⇒ present for every cell
      for (const o of others) {
        const ot = inBandCellTicks.get(o.buildId)!.get(cell);
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
  // The honest anti-convergence signal: a MEASURABLE identity with NO losing matchup
  // (viable on ≥ viableMin maps of every opposition — per-build `losingMatchups` empty).
  // DISTINCT from `winsAllInBand`'s stricter every-cell sweep (longshot has an empty
  // `losingMatchups` but does not sweep every cell, so it belongs here, not there).
  const noLosingMatchup = measurable
    .filter((b) => b.losingMatchups.length === 0)
    .map((b) => b.buildId)
    .sort();

  return {
    mapCount: mapIds.size,
    band,
    perBuild: stats,
    distinctSignatures,
    distinctMeasurableArchetypes: distinctSignatures.length,
    dominantBuilds,
    winsAllInBand,
    noLosingMatchup,
    pass: distinctSignatures.length >= band.targetN && dominantBuilds.length === 0,
  };
}
