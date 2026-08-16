/**
 * Build-diversity gate — the SUBSTITUTION GAUNTLET (docs/06 AC-E2, docs/08 AC-R3,
 * ADR-0014, N = 6 as of 2026-08-12). This is the HONEST INTERIM FLOOR, not the full
 * anti-convergence proof.
 *
 * ⚠ N MOVED 6 → 1 → 5 → 6 in three steps on 2026-08-12. The move+act fold (ADR-0015)
 * dropped it to 1; the TTK re-tune (docs/07 §3 / AC-P6) recovered it to 5; wiring the
 * SUPPORT SLOT (ADR-0017) restored the sixth identity. Each step's finding contradicted
 * the previous step's stated cause — the fold was blamed for a latent time-to-kill
 * violation, and the wizard's "weak spell" was actually an equipped support ability that
 * did nothing. See {@link DIVERSITY_TARGET_N} for the measurements.
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
 * one-shot (a cast must not KO a Faith-50 tank body — now 315 HP vs ~107 a cast, three
 * casts), so the melee race stays honest.
 *
 * WHAT THE MAGIC AXIS ACTUALLY MEASURES — READ THIS BEFORE READING `losingMatchups`.
 * On the shipped roster the magic axis is NOT an isolated candidate-Faith test, and a
 * `losingMatchups: ["magic"]` entry does NOT mean "weak to magic personally". Every
 * candidate is fielded with the SAME two Faith-50 filler allies, victory is
 * team-elimination, and the greedy probe focuses the highest-MAGNITUDE target — so the
 * casters kill the Faith-50 allies (~107/cast) long before any low-Faith body (~10/cast),
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
 * when both fight as black-mages they COLLAPSE to one identity. The honest observed
 * count is 6 viable prefixes — `aim.`, `black-magic.`, `geomancy.`, `punch-art.`,
 * `summon.` and `white-magic.`. `black-magic.` is carried by `bld-arcane-artillery`
 * (5/6 phys maps, signature landed on all five) since its Magic Attack Up went live
 * (ADR-0017). Its prefix-mate `bld-spellblade` is still MASKED — a knight's MA makes
 * borrowed black magic lose to its own PA × WP swing, so the greedy probe never picks
 * it — and contributes nothing to the count either way. It stays MEASURABLE, not
 * EXCLUDED: nothing structurally blocks it, so demoting it would hide a content debt
 * behind a capability tag (ADR-0014). The mask is pinned POSITIVELY in `ttk.test.ts` so
 * it cannot be forgotten or silently fixed.
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
 * distinct-identity count keys on the prefix, so they contribute one identity, and
 * since ADR-0017 that identity is carried by arcane-artillery alone.
 *
 * `bld-reraise-cleric` is measured as its OFFENSIVE `white-magic.` identity (it casts
 * `white-magic.holy` on the phys reference axis, never heals there), so its archetype is
 * `white-mage`, NOT "reraise-cleric" — its reaction/sustain identity (Reraise, cure) is
 * still unmodeled, but its offensive white-magic was always measurable and was
 * mis-excluded before this slice.
 */
export const MEASURABLE: Readonly<Record<string, MeasurableEntry>> = {
  "bld-spellblade": { archetypeId: "spellblade", signaturePrefix: "black-magic." },
  "bld-arcane-artillery": { archetypeId: "arcane-artillery", signaturePrefix: "black-magic." },
  "bld-terrain-geo": { archetypeId: "geomancer", signaturePrefix: "geomancy." },
  "bld-longshot": { archetypeId: "longshot", signaturePrefix: "aim." },
  "bld-faithzero-monk": { archetypeId: "anti-mage", signaturePrefix: "punch-art." },
  "bld-reraise-cleric": { archetypeId: "white-mage", signaturePrefix: "white-magic." },
  "bld-glass-summoner": { archetypeId: "summoner", signaturePrefix: "summon." },
};

/**
 * The EXCLUDED manifest: build id → the named capability that would unblock its
 * measurement (ADR-0014). A build here is not silently dropped — its identity is a
 * REACTION, a threat mechanic, support-aware AI, or a boss target none of which the
 * greedy 1-ply probe can exercise yet. N rises as each capability lands.
 */
export const EXCLUDED: Readonly<Record<string, string>> = {
  // bld-glass-summoner MOVED → MEASURABLE (2026-08-05, this slice). The named blocker was
  // "structural survivability: short-range (~h4/v2) glass caster advances into melee to
  // reach cast range, then focus-fired mid-charge". The DELIVERED lever is the one the tag
  // named — a longer-range offensive summon that LANDS BEFORE CONTACT: the four offensive
  // summons (shiva/ifrit/ramuh/bahamut) went h4→h6 (v2 unchanged), the empirically-minimal
  // range that opens `summon.` from the backline. Result: 4/6 phys maps with `summon.`
  // landed, losingMatchups still ["magic"] (anti-convergence guardrail intact). Heal summons
  // (golem/moogle) were NOT touched. See DIVERSITY_TARGET_N.
  "bld-aggro-tank": "provoke/threat mechanic (the probe ignores threat)",
  "bld-counter-wall": "reaction-as-live modeling (Counter is a passive reaction)",
  "bld-battle-cleric":
    "signature-prefix collapse (cure→white-magic. shares reraise-cleric; punch-art.→shares faithzero-monk) + reference axis has no sustained ally damage; heal-triage makes cure land when allies are hurt but adds no DISTINCT prefix",
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
    // (`bld-glass-bruiser`, 98 raw HP → ~117 effective after knight growth) + two
    // STURDY bruisers (`bld-filler-bruiser`, 263 raw HP → ~315 effective). The fragile
    // ~117-HP target gives a WEAK single-target caster (geomancy) a securable kill
    // (keeping geomancy VIABLE), while the two ~315-HP bruisers keep the fight
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
    // (`bld-filler-bruiser`, ~315 effHp) whose body the candidate melee must grind
    // through first, buying the casters casting turns. Damage scales by TARGET Faith
    // (`magicDamage`): a Faith-50 body takes the full cast (~107), a Faith-5 body takes
    // ~10. This is a SECOND, DISTINCT threat axis (not raw physical HP) that makes
    // opportunity cost non-uniform — NOT an isolated candidate-Faith test: with shared
    // Faith-50 fillers + team-elimination + magnitude-focus targeting, it rewards
    // tempo/range as much as personal Faith (see the module docstring; the isolated
    // Faith cliff is the straddle TEST's job).
    // KIT CONSTRAINTS (calibrated): (1) NO charged/`black-magic.*` spells — a charge
    // whiffs/spawn-wipes on the small clustered maps (the ADR's rocket-tag failure);
    // (2) NO AoE (`geomancy.sandstorm`) — a box on a clustered spawn is a spawn-swamp;
    // (3) NO one-shot — a single cast must not KO a Faith-50 tank body (≥2 casts), so
    // the melee race stays honest and the caster's damage is a race, not a wipe.
    // RE-CALIBRATED 2026-08-12 (the TTK re-tune): against the old 72-HP bodies the Coven
    // had gone TOOTHLESS at 315 HP — nearly every candidate cleared the magic axis and
    // `losingMatchups` emptied out, i.e. the second threat axis stopped discriminating.
    // The geomancy `power` fix (authored on the physical scale, but `magicDamage` quarters
    // it at Faith 50/50) restores it: ~107 a cast, three casts to drop a tank.
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
 * ⚠ RE-BASELINED THREE TIMES ON 2026-08-12: N 6 → 1 (the move+act fold) → 5 (the TTK
 * re-tune) → 6 (the SUPPORT SLOT going live, ADR-0017).
 *
 * STEP 3 (N 5 → 6) — THE SUPPORT SLOT, and the diagnosis that found it. The missing
 * sixth prefix was `black-magic.`, and the recorded reason was arithmetic: a 144-HP
 * caster whose 81-damage spell needs four casts to drop a 315-HP tank that kills it in
 * two. TRACING an actual losing run said otherwise. The wizard declares 17 charges
 * across the six reference maps: 8 land, 4 whiff, and **5 are cancelled by its own
 * death mid-charge**. The discriminating comparison is `bld-glass-summoner` — SQUISHIER
 * (134 HP) and three times SLOWER to cast (10 ticks vs 3), yet viable, losing only 2
 * charges to cancellation, because range 6 keeps it out of reach where range 5 does not.
 *
 * The cause underneath was not tuning at all: `build.ts` projected ACTION abilities
 * only, so the reaction/support/movement slots were validated at equip time and then
 * ignored. `bld-arcane-artillery` equips `black-magic.magic-attack-up` and had never
 * received it. Nine of fourteen shipped builds carried a dead support slot. Wiring it
 * (ADR-0017) delivers the build as authored: MA 13 → 17, `fire-2` 130 → 170, and the
 * wizard reaches 5/6 phys maps with `black-magic.` landed on ALL FIVE.
 *
 * ROBUSTNESS — why 6 is trusted (the ADR-0016 protocol). Perturbing every build's
 * `raw.hp` by a common factor, the PRE-fix baseline reads N = 6, 6, **5**, 5, 5, 6 at
 * ×0.90 … ×1.15: the wizard was not stably sub-viable, it was straddling a
 * discontinuity, which is exactly why the arithmetic diagnosis and the sim disagreed.
 * WITH the support layer the wizard holds 5/6 flat across ×0.90 … ×1.10 and N stays 6.
 * The `ma` multiplier is on that plateau, not tuned to it: at ×1.20 the fix collapses
 * again at +10 % HP; ×1.33 is FFT's own Magic Attack UP figure `[UNCERTAIN — verify vs
 * BMG]` and holds flat.
 *
 * REJECTED ALTERNATIVES, recorded so nobody re-runs them (docs/plans/slice-black-magic-
 * carrier.md has the tables): raising the wizard's HP works at the shipped scale but
 * puts it in `noLosingMatchup` above +10 % HP — the convergence failure docs/02 B5
 * exists to prevent. Raising `black-magic` RANGE lifts the count to 6 through
 * `bld-spellblade`, which lands its signature on exactly ONE of its four clears and
 * fights as a knight on the other three — that is this gate's deliberate `≥ 1 signature`
 * interim-floor insensitivity being exploited, not a fixed build. And the charge-speed
 * sweep FLIPS between ability speed 34 and 40, both of which mature in 3 ticks: that
 * flip is the scheduler's `higher ct first` tie-break (ct 102 loses to a unit at 104;
 * ct 120 wins), NOT a mechanism. Do not calibrate a charge constant near it.
 *
 * ── the earlier re-baselines ──
 *
 * STEP 1 (N 6 → 1). ADR-0015's follow-up taught the balance probe to fold move+act into
 * one −100 turn. Six of seven candidates fell to 2–3 in-band maps against
 * `VIABLE_MIN_MAPS` = 4, leaving one viable identity (`black-magic.`, arcane-artillery
 * 4/6). Losing candidates were WIPED in 25–48 ticks.
 *
 * STEP 2 (N 1 → 5) — THE TTK RE-TUNE, and the diagnosis that made it. Tracing a losing
 * run showed the fold's tempo was NOT the operative cause: **every hit was a one-shot
 * KO.** A 72-HP knight died to a single 90-damage basic attack; three units died on the
 * first tick anyone acted. `docs/07` §3 already specified the intended pacing — "a
 * squishy unit dies in ~1–2 committed actions; a tank in ~3–4" — and the shipped data
 * missed it by 3–4×, unnoticed because no test asserted the spec. At TTK = 1, range,
 * positioning, tempo and signature abilities are ALL invisible: whoever acts first wins,
 * so no ranged/caster tuning could have been measured, let alone worked.
 *
 * The fix is content, symmetric, and applied to BOTH sides — it does not weaken the
 * opposition: `raw.hp` re-authored across every build so derived `maxHp` lands in its
 * docs/07 band (now enforced by `ttk.test.ts` / AC-P6). Measured after:
 *
 *   faithzero-monk  6/6 phys (punch-art.)   terrain-geo     6/6 (geomancy.)
 *   longshot        5/6 (aim.)              glass-summoner  5/6 (summon.)
 *   reraise-cleric  4/6 (white-magic.)      arcane-artillery 1/6   spellblade 1/6
 *
 * A SECOND, DEPENDENT FIX, forced by the first: ability magnitudes were authored against
 * 72-HP bodies too, and `magicDamage` applies Faith on BOTH ends — so at the shared
 * Faith 50/50 every magic ability is QUARTERED while physical ones are not. Geomancy's
 * `power` had been set on the physical scale, leaving a geomancer's spell (45) at HALF
 * its own punch (80): the probe therefore picked the punch, and `terrain-geo` won its
 * maps as a knight. That is the masking bug class in `src/sim/CLAUDE.md`, and it was
 * INVISIBLE at TTK = 1 (both actions one-shot, so magnitude never decided anything).
 * Geomancy power ×~2.7 (water-ball 18 → 48) puts a geomancer's signature at ~1.5× its
 * own basic — the LOW end of the other five showcase builds' signature/basic ratios
 * (1.5 … 2.0), chosen at the low end deliberately so the number is not tuned to the
 * gate. Result: `terrain-geo`'s signature now lands on 6/6 of its in-band maps (was
 * 4/6), and the Coven's magic axis — whose casters use the same skillset and had gone
 * toothless against 315-HP bodies — is a real threat again (`losingMatchups` is
 * non-empty for three builds; before the geomancy fix it was empty for four).
 *
 * ROBUSTNESS (this is why 5 is trusted, not a lucky point): perturbing every build's
 * `raw.hp` by a common factor across ±15% keeps N at 5–6 (it drops to 3 only at −15%).
 * The earlier chaotic HP sweep — N jumping 5, 2, 4, 3 between adjacent scales — was an
 * artefact of straddling the TTK = 1 boundary, and it disappears once the band is met.
 *
 * A TESTED-AND-MOSTLY-REJECTED HYPOTHESIS from step 1, recorded so nobody re-runs it:
 * because ADR-0013 defers facing-on-move, the fold makes a permanent rear arc free where
 * it used to cost a turn of tempo. Removing the free flank lifted N only 1 → 2. Free
 * flanking contributes; raw lethality was the driver — which the TTK diagnosis confirms.
 * ALSO TESTED AND REJECTED (2026-08-12): seating the candidate BEHIND its two fillers
 * instead of line-abreast. Enemies do block traversal, so the screen is mechanically
 * real, but two bodies cannot hold a lane on these maps and the candidate contributes
 * less from further back — N went 1 → 0. Do not re-run it.
 *
 * N = 6 IS THE HONEST OBSERVED COUNT, not a target and not a floor chosen to pass. `≥ 8`
 * (full AC-E2) remains the release bar. Every prefix the shipped roster can express is
 * now counted — ZERO SLACK: all six must stay viable, so any regression fails the gate.
 * `bld-spellblade` is still MASKED and still owed a chassis; fixing it buys the count
 * NOTHING (its `black-magic.` prefix collapses onto arcane-artillery's), so the last
 * identities toward ≥ 8 must come from the EXCLUDED unblocks or from new jobs.
 *
 * ── The pre-fold rationale, kept because it explains what each identity NEEDS ──
 *
 * The interim distinct-identity target (ADR-0014). Previously set to the honest observed
 * count of 6 distinct signature prefixes viable on the frozen gauntlet —
 * `aim.`, `black-magic.` (spellblade; arcane-artillery COLLAPSES onto the same prefix
 * and is sub-viable here anyway), `geomancy.`, `punch-art.`, `summon.` (glass-summoner's
 * offensive summons on the phys reference axis), and `white-magic.` (reraise-cleric's
 * OFFENSIVE white-magic via `holy` on the phys reference axis). `≥ 8` (full AC-E2) stays
 * the release bar, marked BLOCKED; N rises as the EXCLUDED capabilities land.
 *
 * `summon.` IS A REAL NEW PREFIX (2026-08-05, this slice) — NOT a collapse onto an
 * existing identity (no other build signatures on `summon.`), so unblocking the summoner
 * genuinely raises the distinct count 5→6. The blocker was structural survivability (the
 * short-range ~h4/v2 caster walked into melee and was focus-fired mid-charge, 1/6 maps);
 * the delivered lever is a longer-range offensive summon (h4→h6, v2 unchanged) that lands
 * before contact → 4/6 phys maps with `summon.` landed. Its anti-convergence guardrail
 * holds: `losingMatchups: ["magic"]` (a Faith-50 glass caster still folds to the Coven),
 * so it pays real opportunity cost and is NOT in `noLosingMatchup` — a summoner that also
 * cleared the magic axis would be the FAILURE STATE, and the calibrated minimal range
 * avoids it.
 *
 * ⚠ THE `white-magic.` IDENTITY IS CONTINGENT ON MP BEING UNENFORCED (ADR-0014
 * amendment 2026-08-03, reviewer HIGH). It rides ENTIRELY on `white-magic.holy` (the
 * cleric never heals on the phys reference axis — its allies take no sustained damage
 * before the fight ends). But `holy` costs 56 MP and the cleric has a 24-MP budget; the
 * sim does not consume or check MP anywhere yet, so holy casts freely. When MP enforcement
 * lands (a plausible EXCLUDED-capability slice — it is a core FFT cost), holy becomes
 * unaffordable, `cure` does NOT backfill on the phys axis (nothing to heal there, so
 * heal-triage cannot carry the count), and this identity REGRESSES → N drops 6→5 and the
 * gate FAILS until a durable `white-magic.` carrier or an MP fix lands. So unlike the other
 * EXCLUDED capabilities (which RAISE N as they land), MP enforcement LOWERS it. NOTE the
 * summoner's `summon.` also has an unenforced-MP contingency (each summon costs 14–30 MP
 * off a 24 budget), so MP enforcement could bite it too — re-verify BOTH on any MP change.
 * ZERO SLACK: exactly 6 prefixes exist, so all 6 must stay viable — healthy
 * calibrate-to-detect for a DETERMINISTIC gate (TEST 2/TEST 5 prove it can fail), but it
 * means the MP landing flips the whole gate, not just one identity. Re-verify on any MP,
 * roster, or content change.
 */
export const DIVERSITY_TARGET_N = 6;

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
  /** Statuses the candidate newly applied — a control build's whole contribution. */
  candidateStatuses: number;
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
          statusesInflicted: 0,
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
          candidateStatuses: c.statusesInflicted,
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

/**
 * IN BAND: the candidate WON in time AND actually contributed. CONTRIBUTION is damage,
 * healing OR a landed STATUS — the third term is not a widening of the bar but a fix to
 * it: a pure-control identity (the thief's `steal.heart`) deals no damage and heals
 * nobody, so a damage-only proxy scored it 0 and the gate could never have credited a
 * control build however decisive its charms were. The anti-"carried by the fillers"
 * property is unchanged: an inert candidate still lands nothing of any of the three.
 */
export function inBand(run: GauntletRun, band: BandConfig): boolean {
  return (
    run.outcome === "victory" &&
    run.ticks <= band.winCeil &&
    run.candidateDamage + run.candidateHealing + run.candidateStatuses > 0
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
