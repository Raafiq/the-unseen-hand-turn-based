# ADR-0014: Diversity gate ships as a phased `≥N`-with-manifest target, not a flat `≥8`

- **Status:** Accepted
- **Date:** 2026-08-02
- **Deciders:** Maintainer (approved the "ship honest gate now" scope) + systems-designer (raised the measurability gap) + Product Owner

## Context

`docs/06` **AC-E2** reads: "On the benchmark suite, **≥ 8** `docs/03` archetypes SHALL clear within the
efficiency band and no single build SHALL clear all encounters at top efficiency." `docs/08` **AC-R3**
requires the diversity gate to run in CI **from P2**. Slice 3 shipped 11 reference builds as "the seed
set the Slice-4 diversity matrix draws from."

Scoping Slice 4 surfaced a hard finding: **the "≥ 8" clause cannot be met honestly with today's greedy
1-ply balance probe.** Only ~**5** of the 11 builds have a *distinct, probe-measurable identity*
(`spellblade`, `terrain-geo`, `longshot`, `faithzero-monk`, `arcane-artillery`). The other five field
as the *same* PA-8 brawler or depend on capabilities that do not exist:

- **Summoner** — charged AoE never lands (the caster is focus-fired before the summon matures; `docs/06` note).
- **Aggro-tank (#15)** — no provoke/threat mechanic exists; the probe ignores threat.
- **Counter-wall (#1) / Reraise-cleric** — their identity is a *reaction* (passive), invisible to the probe.
- **Both clerics (sustain, #13)** — AI-limited: the probe heals only when no foe is reachable.

A gate that counts *build wins* would report "8 cleared" while five are the same brawler wearing
different names — the exact **masked-identity** failure CLAUDE.md warns about (green-by-omission).

## Options considered

1. **Ship a flat `≥8` gate now** by counting build wins. Rejected — it lies: five masked brawlers
   inflate the count, and CI would be green while diversity is unproven.
2. **Hold AC-E2 formally unmet** until the enabling features (support-aware AI, provoke, reaction-as-live
   modeling) land, shipping no gate at P2. Rejected — violates AC-R3 ("gate runs in CI from P2") and
   leaves balance unenforced across several large slices.
3. **Build the enabling engine work first**, then ship the gate at a real `≥8`. Rejected as the *first*
   step — each enabler (chiefly the support-aware AI) is its own large slice; blocking all balance
   enforcement on them defers the pillar's safety net indefinitely.
4. **Ship an honest `≥N` gate now with a published exclusion manifest**, and treat `≥8` as a phased
   release target unblocked as capabilities land. **Chosen.**

## Decision

**Option 4.** AC-E2 is amended to a **phased target**:

- **Interim gate (now, CI-enforced):** the benchmark asserts `distinctMeasurableArchetypes ≥ N`
  **plus** a **relative, threshold-free dominance ban** (a build fails only if it clears all six gauntlet
  maps AND no other measurable build clears any map faster — it strictly outclasses the field). A build
  counts under its archetype only if its **signature action landed** (a new per-unit contribution metric),
  so masked brawlers do not inflate the count.
- **A committed `MEASURABLE` allow-list and an `EXCLUDED` manifest**, each excluded build tagged with the
  capability that unblocks it (support-aware AI → +summoner, +2 clerics; provoke/threat → +aggro-tank;
  reaction-as-live → +counter/reraise).
- **`≥ 8` (full AC-E2) is marked BLOCKED**, and `N` rises as each named capability lands. The `8`
  remains the honest release bar — it is not redefined away.

### Calibration outcome (confirmed at implementation, amends the `[UNCERTAIN]` above)

- **`N = 4`, not 5.** The count keys on the landed **signature prefix**, and `bld-spellblade` and
  `bld-arcane-artillery` both signature on `black-magic.` — so the *maximum* distinct-identity count the
  five-build allow-list can produce is 4, not 5 (5 was never reachable). Calibration also found
  `arcane-artillery` sub-viable (a pure caster charge-whiff-loops to timeout on the small maps), so
  `black-magic.` is carried by `spellblade`. The four measurable identities are `aim.`, `black-magic.`,
  `geomancy.`, `punch-art.`. Because there are exactly four possible prefixes, `≥ N` has **zero slack**
  today — it is really "all four measurable identities must stay viable," and `N` **cannot rise without a
  new signature prefix** (a new job/skillset), independent of the EXCLUDED capabilities.
- **Scope honesty — what the interim gate does NOT prove.** The gauntlet fields each candidate against a
  **single fixed bruiser opposition** across six maps that vary **geometry, not threat** — so it cannot
  test **opportunity cost / matchup** (docs/02 B5): a build has nothing to *lose* to, and e.g.
  `faithzero-monk`'s anti-mage identity is credited on plain melee because nothing casts magic. The
  interim gate therefore proves (a) ≥4 distinct identities land their signature and stay viable, and
  (b) a **gross-over-tuning** speed check — **not** the full anti-convergence property. Builds that clear
  all six with no losing matchup are **surfaced** (`winsAllInBand`), not failed — that becomes a real
  signal only under **multi-matchup opposition**, the named next step that makes the anti-convergence half
  meaningful. Do not read a green gate as "diversity proven."

## Consequences

- **Makes easy:** a real, enforceable diversity + anti-convergence gate ships at P2 (honors AC-R3), and
  the measurability gap becomes a *tracked backlog of named blockers* instead of a silent hole.
- **What we give up:** the gate does not prove the full `≥8` pillar target yet — it proves `≥4` distinct
  identities and no gross dominance. Six builds remain unmeasured until their enabling features land, and
  raising `N` is gated on that work (support-aware AI is the single biggest unlock: +3). It also does not
  yet prove real opportunity-cost/anti-convergence — that waits on multi-matchup opposition (see the
  calibration-outcome note). Anti-convergence is *surfaced* (`winsAllInBand`) but not enforced today.
- **Honesty guardrail:** the gate MUST count *distinct exercised identities* via landed signature
  actions, never build wins — otherwise it regresses to the masked-brawler lie this ADR exists to
  prevent. The `EXCLUDED` manifest MUST name a blocking capability per entry; a build may not be silently
  dropped.
- **Follow-up:** each capability slice (support-aware AI, provoke, reaction modeling) SHOULD, on landing,
  move its builds EXCLUDED→MEASURABLE, raise `N`, and amend this ADR. When `N` reaches 8, AC-E2 is met and
  this phasing retires.

## Amendment (2026-08-02): multi-matchup opposition landed

The "named next step" flagged in the calibration-outcome note above — **multi-matchup opposition** — is now
implemented (`src/sim/gauntlet.ts`). It **advances** this ADR's phasing; it does not reverse any decision here.

- **What shipped.** The single fixed opposition became an **`OPPOSITIONS` manifest** of distinct *threat*
  profiles: `phys` (the original mixed-defence bruiser team, now the **REFERENCE**) + `magic` (the **Coven**:
  two glassy geomancers casting single-target **instant** Faith-scaling magic + one warden). `runGauntlet`
  loops **candidate × map × opposition**; the report gains per-build `losingMatchups` and a report-level
  `noLosingMatchup`, and both `winsAllInBand` and the relative dominance ban now range over the full
  `{maps × oppositions}` cell set.
- **The diversity COUNT still keys on the REFERENCE (`phys`) opposition ONLY.** This is load-bearing and
  deliberate: a build is *supposed* to lose to some threat (docs/02 B5), so requiring viability against
  every opposition would make diversity and anti-convergence fight each other and collapse the count. `N`
  stays 4, keyed on the reference; the "`N` rises only with a new signature prefix or an EXCLUDED capability"
  rule and the `≥8` release bar are **untouched**. A *magic* regression therefore cannot fail `pass` — it is
  surfaced, not enforced (below).
- **What the magic axis actually measures — honesty correction.** It is **not** an isolated candidate-Faith
  test, and a `losingMatchups: ["magic"]` entry does **not** mean "personally weak to magic". Every candidate
  is fielded with the same **Faith-50** filler allies, victory is **team-elimination**, and the greedy probe
  focuses the highest-**magnitude** target — so the casters kill the Faith-50 allies (~32/cast) long before
  any low-Faith body (~3/cast), and the axis rewards **tempo/range** (burst the glass casters before your
  allies fall) as much as personal Faith. Consequently `bld-faithzero-monk` — the **anti-mage** build — still
  shows `losingMatchups: ["magic"]` (its personal resistance cannot save its Faith-50 allies, and the 1-ply
  probe cannot protect them — the **support-aware-AI limitation**, this ADR's family), while ranged
  `bld-longshot` (Faith 50) clears both axes. The magic axis's job is to be a **second, distinct threat that
  makes opportunity cost non-uniform**, not to credit the anti-mage's resistance. The **isolated Faith cliff**
  (magic damage ∝ target Faith) is proved by a must-fail **straddle test** (a lone Faith-5 vs its Faith-50
  twin, on a candidate-targeting fixture), not the aggregate roster gate. Fully isolating the anti-mage
  identity in the *aggregate* gate needs support-aware AI (protect/position allies) — tracked with the other
  EXCLUDED capabilities.
- **Anti-convergence: surfaced, not enforced.** With only two threat axes, a build with *no* losing matchup
  usually means "we haven't built the threat that punishes it yet" — the same phased-capability logic this
  ADR codifies — so auto-failing it would be the "gerrymander the gate into unpassability" trap CLAUDE.md
  names, and would false-fail a legitimately well-rounded build (e.g. `bld-longshot`, surfaced in
  `noLosingMatchup`). The **sole hard fail stays relative dominance** (now over `{maps × oppositions}`,
  strictly harder to trip). Revisit *enforcing* only once ≥3 distinct threat axes exist AND a specific
  `noLosingMatchup` build is confirmed a genuine design problem rather than a coverage gap.
- **CI teeth added.** Two discriminating tests give the magic axis real failure modes even though it does not
  gate `pass`: the Faith straddle (must straddle — a uniform wipe/spare fails it) and a non-uniform-matrix
  assertion (≥1 measurable build folds to magic AND not all do).
- **Outcome (honest roster):** `distinctMeasurableArchetypes = 4`, `dominantBuilds = []`, `winsAllInBand = []`,
  `noLosingMatchup = ["bld-longshot"]`, `pass = true`. `losingMatchups`: spellblade/terrain-geo/faithzero-monk
  each `["magic"]`, longshot `[]` — a non-uniform matrix (real opportunity cost is now visible).

## Amendment (2026-08-03): support-aware AI slice — `N` raised 4 → 5 (`white-magic.` joins)

The **support-aware AI** slice was scoped. Its investigation reversed the slice's own premise ("teach
the probe to value support → +3 builds → N≈7"), and the honest finding is codified here as an amendment
to this ADR's phasing. It does not reverse any decision above.

- **What actually shipped.** (1) A **heal-triage** refinement to the balance-probe comparator
  (`ai.ts` `compareCandidate`): the `HEAL` class now sorts `targetEffHp` ASC → `magnitude` DESC (was
  magnitude-first), so the probe heals the **lowest-effective-HP ally** — AC-E3(b)'s focus rule mirrored
  onto allies — instead of the biggest-overheal target. It stays one uniform transitive total order
  (the `CHIP`/`HEAL` focus branch is reached only within a shared class; the class order is unchanged, so
  `LETHAL` still outranks `HEAL` — no panic-heal-over-kill), draws zero RNG, and is snapshot-neutral (no
  existing MEASURABLE build or opposition unit heals). (2) **`bld-reraise-cleric` moves EXCLUDED →
  MEASURABLE** as `archetypeId: "white-mage"`, `signaturePrefix: "white-magic."`, and
  `DIVERSITY_TARGET_N` rises **4 → 5**.
- **Why the premise did not survive contact.** Of the three builds the slice targeted:
  - **`bld-reraise-cleric` was MIS-EXCLUDED, not unblocked by support AI.** It fights as its **primary**
    job (priest / white-magic), casting `white-magic.holy` (offensive magic) 2–3×/map on the phys
    reference axis and winning 6/6 in band — its offensive white-magic identity was **always** measurable;
    only its (unmodeled) reaction/sustain identity was blocked, which is not what the count keys on. It
    needed a **manifest relabel**, not an AI change. **Honesty:** it is credited as `white-mage`
    (offensive white-magic), **NOT** "reraise-cleric" — the Reraise/sustain fantasy remains a tracked
    EXCLUDED sub-note (blocker: reaction-as-live). `white-magic.` is a genuinely new 5th prefix.
  - **`bld-battle-cleric` is structurally uncountable (prefix collapse).** Its only white-magic action is
    `cure` → `white-magic.` (shares reraise-cleric) and its punch-art → `punch-art.` (shares
    faithzero-monk); no AI sophistication can give it a *distinct* prefix. Heal-triage makes its `cure`
    LAND when allies are hurt (honesty improved) but adds **zero** to the distinct count. Stays EXCLUDED
    with the refined tag.
  - **`bld-glass-summoner` stays EXCLUDED (two-part blocker, neither is support-AI).** Its counting-axis
    blocker is a **charge-whiff loop** on the open phys maps (the aim tile empties before the charged AoE
    matures → timeout) — a predictive/cluster-aware **charge-targeting** problem, not support. Its magic
    death is focus-fire, which "protect-the-enabler" would touch but only on the **non-counting** axis.
- **⚠ N=5 IS NOT A DURABLE FLOOR — it is CONTINGENT on MP being UNENFORCED (reviewer HIGH; disclosed,
  not hidden).** `white-magic.holy` costs **56 MP**; the cleric's budget is **24 MP**; the sim does not
  consume or check MP anywhere, so holy casts freely. When **MP enforcement** lands (a plausible
  EXCLUDED-capability slice — a core FFT cost), holy becomes unaffordable, and `cure` does **not** backfill
  on the phys axis (allies take no sustained damage there, so heal-triage cannot carry the count) → the
  `white-magic.` identity REGRESSES → N drops 5 → 4 and the gate FAILS until a durable `white-magic.`
  carrier or an MP fix lands. So, uniquely among the phased capabilities, **MP enforcement LOWERS N** rather
  than raising it. **Zero slack:** exactly 5 prefixes exist, so all 5 must stay viable — a healthy
  calibrate-to-detect state for a deterministic gate (TEST 2 / TEST 5 prove it can fail), but the MP
  landing flips the whole gate, not one identity. This is recorded so the regression is *expected and
  understood*, not a surprise — the "credit an identity a missing model props up" trap, surfaced.
- **CI teeth.** Two new discriminating AI tests (heal-triage picks the dying ally over the bigger heal via
  Faith-scaled magnitude; `LETHAL` still beats `HEAL`) + a tightened gauntlet TEST 3 (reraise-cleric must
  land `white-magic.holy` **specifically** and heal 0 on the phys axis — so it cannot pass on the unmodeled
  sustain/`cure` identity) + TEST 5 (removing reraise-cleric flips `distinctMeasurableArchetypes` 5 → 4 →
  `pass=false`).
- **Outcome (honest roster):** `distinctMeasurableArchetypes = 5`, `distinctSignatures =
  ["aim.","black-magic.","geomancy.","punch-art.","white-magic."]`, `dominantBuilds = []`,
  `winsAllInBand = []`, `noLosingMatchup = ["bld-longshot"]` (reraise-cleric folds to magic, so it is NOT
  a no-losing-matchup build), `pass = true`.
- **Follow-ups still tracked toward `≥ 8`:** support-aware **positioning/escort** (protect-the-enabler —
  helps summoner on the magic axis, unlocks the Escort archetype), **predictive charge-targeting** (the
  summoner's counting-axis blocker), **reaction-as-live** (counter-wall, and reraise-cleric's *sustain*
  identity), **provoke/threat** (aggro-tank), and a **`surviveTurns` condition** (Defend/survive-N). The
  `≥ 8` release bar is untouched.

## Amendment (2026-08-03): `survive` condition landed — an archetype ENABLER, does NOT raise `N`

The **`surviveTurns` condition** flagged as a tracked follow-up in the support-aware-AI amendment above is now implemented (`src/sim/condition.ts`), as `survive {teamId, ticks}`. It **enables** the Defend / survive-N archetype; it does **not** change the gate count.

- **What shipped.** A third additive arm on the `Condition` discriminated union: a team wins by keeping ≥1 unit alive until the CT clock (`state.tick`) reaches `ticks`. Keyed on **`ticks` (the CT clock), NOT the global `turns` decision counter** — `turns` perversely decelerates the survive timer as units die and is not on `BattleState`; `ticks` is roster-independent, on-state (so `evalCondition` stays `(state, cond)`), and is the honest duration unit. The `alive` survivor clause makes a survive VICTORY and its `eliminateTeams{[teamId]}` DEFEAT exact logical complements (no spurious draw); winner attribution credits the objective's **beneficiary** in either slot (the symmetric `survive`-as-DEFEAT is the baseline **defeat-within-N-ticks** objective). Additive: **no `ENCOUNTER_SCHEMA_VERSION` bump, no `BattleState` change, no frozen-golden regen, no `ai.ts`/gauntlet change.**
- **Tag: `[ENHANCEMENT]`, not `[BASELINE]`.** fft-fidelity could not confirm a canonical vanilla PSX FFT win-BY-survival map — that framing is FFTA/FFTA2 (not our version baseline). The turn/CT-bounded objective *category* is baseline (protect-until / defeat-within-N); the survive *victory* is an enhancement layered on it.
- **`N` is UNCHANGED (still 5).** This slice adds the *condition* only — no survive-objective encounter or build is wired into the gauntlet, so the diversity count and the live `npm run state` gate output are byte-identical. Defend becomes a **measured** archetype (and its sustain identity countable) only when a later slice adds a survive encounter/build to the gate — tracked, still toward `≥ 8`.
- **Remaining follow-ups toward `≥ 8` (unchanged):** predictive charge-targeting (summoner), support-aware positioning/escort, reaction-as-live (counter-wall, reraise-cleric's sustain), provoke/threat (aggro-tank), and now a **Defend benchmark encounter** that exercises the landed `survive` condition.

## Amendment (2026-08-03): summoner blocker RE-DIAGNOSED — "charge-whiff" DISPROVEN; body-screening shipped but INSUFFICIENT (N stays 5)

The `bld-glass-summoner` EXCLUDED tag read: *"charged-AoE tile-targeting / charge-whiff loop on open maps … needs predictive/cluster-aware charge targeting."* Scoping the summoner slice, I **empirically disproved that tag — twice** — and the honest finding is recorded here. **`N` stays 5; the summoner stays EXCLUDED with a corrected tag.** This is the CLAUDE.md rule working exactly as written: *an EXCLUDED blocker tag is a HYPOTHESIS — empirically probe WHY before scoping.*

- **Hypothesis 1 (the tag: charge-whiff) — FALSE.** A headless probe ran the summoner as a candidate across all 6 phys-reference maps and counted charge resolutions from the turnLog: the summon **whiffs ZERO times** on every map. The "aim tile empties before maturity" premise is empirically false — so **predictive/cluster-aware charge-targeting would have moved nothing** (the slice we almost built).
- **The REAL failure mode (measured).** The glass summoner (~40 effHp, the lowest on the field) has a **short cast range** (`summon.*` range h4/v2), so on the larger maps it has nothing in range early and **advances into the bruisers** (`moveTowardPrime`) to reach cast range; it then declares adjacent to the enemy and is **focus-fired and KO'd mid-charge → the charge is CANCELLED by caster death → 0 contribution → its 2 fillers grind to timeout** vs 3 bruisers. Only the small choke-map (`enc-the-breach`) holds → **1/6 in-band with `summon.` landed**. When it survives, the summon lands fine (187 dmg) — survivability is the ONLY blocker.
- **Hypothesis 2 (masked by summon selection) — also FALSE.** The greedy probe picks `bahamut` (power 46, speed 10 → matures in ~10 ticks), the slowest summon. A probe restricting the summoner to a **fast** summon (`shiva`/`ifrit`/`ramuh`, speed 20 → ~5 ticks) was **still 1/6** — the summoner is already surrounded by the time it declares, so even a 5-tick charge dies before maturity. Summon selection is not the lever.
- **Fix attempted and SHIPPED (but insufficient): support-aware body-screening.** `src/sim/ai.ts` gains `tryScreen` (Tier A): a sturdy ally with no in-range action interposes on the enemy's reachable path to a **mid-charge** ally (protectee gate = `state.chargeQueue.some(c => c.sourceUnitId === ally)`), blocking the lane via `moveRange`'s occupancy semantics. It is a **movement fallback only** — `compareCandidate`/the action path are 100% untouched; a screener with any in-range action still acts. **Tier B** (pre-emptive screening — protectee widened to "owns a charged ability") was measured and **reverted**: byte-identical (still 1/6). The block is **structural, not positioning-lag** — reachability-screening cannot wall a corner-seated glass caster with **2 fillers vs 3 bruisers** on a multi-lane map (the geometry-bound limit the design predicted). **Result: summoner still 1/6 → N NOT raised.**
- **Why we shipped the positioning anyway.** It **regresses nothing** — the live `npm run state` gate run is **byte-identical**, no MEASURABLE build changed, black-mage clears unchanged, `WIN_CEIL_TICKS=300` re-derived and unchanged (the mid-charge gate means the instant-cast **Coven never triggers screening → the whole magic axis is untouched**). It ships as **latent capability for the Escort archetype** (docs/06 §2), which needs exactly this protect-the-enabler harness behavior. It does not raise `N` today.
- **Corrected EXCLUDED tag (in `gauntlet.ts`).** Charge-whiff → **structural survivability**: *"glass caster (short range) advances into melee to reach cast range, then is focus-fired mid-charge → charge cancelled; reachability-screening (shipped) can't wall it with 2 fillers vs 3 bruisers on multi-lane maps. Needs a survivability lever OUTSIDE the 1-ply AI — a tankier chassis / a faster-maturing or longer-range summon that lands before contact — or multi-body wall coordination / self-preservation movement (the latter reopens magic-axis recalibration). NOT predictive charge-targeting (0 whiffs measured)."*
- **The real lever for the summoner (tracked, not a clean small slice):** a **survivability change outside the 1-ply AI** — a tankier summoner chassis, a faster/longer-range summon that resolves before contact (content/build authoring, watch anti-convergence), OR multi-body wall coordination / bounded self-preservation movement (a bigger AI change that reopens the magic-axis recalibration this slice deliberately avoided).

## Amendment (2026-08-05): summoner UNBLOCKED via a range ENHANCEMENT — `N` raised 5 → 6 (`summon.` joins)

The "longer-range summon that resolves before contact" lever named in the re-diagnosis above is now **implemented and MEASURED**. `bld-glass-summoner` moves EXCLUDED → MEASURABLE as `archetypeId: "summoner"`, `signaturePrefix: "summon."`, and `DIVERSITY_TARGET_N` rises **5 → 6**. `summon.` is a genuinely new 6th prefix (no other build signatures on it — not a prefix-collapse). This **advances** the ADR's phasing; it reverses no decision here.

- **What shipped.** The four OFFENSIVE summons (`summon.shiva`/`ifrit`/`ramuh`/`bahamut`) had their cast range widened `{h:4,v:2} → {h:6,v:2}` in `data/base-pack.json`. The heal summons (`golem`/`moogle`) were left untouched. **Contained blast radius (gauntlet):** only `bld-glass-summoner` learns `summon.*`, so **within the gauntlet substitution runs** the 5 pre-existing measurable builds and both oppositions are **byte-identical** — the sole delta there is the summoner now counting. No `ai.ts`/`compareCandidate` change, no schema bump, no frozen-golden regen (range is plain data). **Not fully contained, however:** `summon.*` range is a global ability property, and `bld-glass-summoner` is an as-authored occupant of three §2 benchmark encounters (`enc-the-breach`, `enc-mixed-company`, `enc-behead-the-warlord`), so their play DOES shift at h6 (e.g. `enc-mixed-company` now resolves at 33t with no summon mid-flight, where before a charge was still queued at the terminal check). `benchmark-suite.test.ts` asserts only self-consistency + replay-equality (no committed golden hash), so it stays green through the shift; the change is harmless today (no story repo, no frozen golden over these encounters) but is on record here. A stale comment in `benchmark-suite.test.ts` naming the old mid-flight-charge premise was generalized in this slice.
- **Why RANGE, empirically (calibrate-to-DETECT, not to pass).** A headless probe swept candidate ranges in increasing magnitude. `h5` (both `v2` and `v3`) → only **2/6** phys maps land `summon.` (the ~40-effHp caster is still contacted before it can open); `h6` → **4/6**. The minimal value satisfying the gate (`≥4/6` with `summon.` landed AND a retained `magic` loss) is **`{h:6,v:2}`** — `v` was not moved. The `h5→h6` cliff **confirms the re-diagnosed blocker was correct** (reachability/structural survivability, not charge-whiff): opening from the backline is the operative mechanism, exactly as the corrected EXCLUDED tag predicted. It also answers `fft-fidelity`'s caution — range extension *addresses* reachability, it does not *mask* survivability (a shorter range that still forces the melee-advance stays sub-viable).
- **Tag: `[ENHANCEMENT]`, NOT `[BASELINE]`.** `fft-fidelity` verified (`[VERIFIED — medium]`, cross-corroborated; the primary tables — AeroStar BMG / FFHacktics / GameFAQs — are egress-blocked HTTP 403 here per CLAUDE.md) that **canonical PSX FFT summon range is 4**, uniform across Shiva/Ifrit/Ramuh/Bahamut. Our content already matched canon at `h4`, so `h4→h6` is an **intentional +2 buff**, not a baseline correction. Rationale: it compensates a **glass + slow-charge** caster for an exposure window that instant/tanky peers do not pay — and it **restores** the archetype's own stated counterplay (docs/03 #7: "slow charge dodgeable via tile-targeting, Silence cancels the charge, gap-close and kill, low MP economy"). Power-with-counterplay holds: a gap-closer still one-shots the ~40-effHp caster; Silence still cancels; the slow 2×2 tile-target is still dodgeable.
- **Anti-convergence guardrail — held and asserted.** At `h6` the summoner **retains `losingMatchups: ["magic"]`** (a Faith-50 glass caster still folds to the Coven's instant casters) and is **NOT** in `noLosingMatchup`; `dominantBuilds = []` and `winsAllInBand = []` (its slow charge means it is never the strictly-fastest clearer on any cell). It pays real opportunity cost (docs/02 B5) — survivability, tempo, MP, a deployment slot on a fragile specialist. A range generous enough to also clear the magic axis would be the FAILURE STATE (a no-opportunity-cost sweep); the minimal-range calibration deliberately avoids it.
- **⚠ `summon.` ALSO rides UNENFORCED MP (disclosed, not hidden) — now TWO of six prefixes are MP-contingent.** Summons cost 14–30 MP against the summoner's 24 budget (`bahamut`'s 30 already exceeds it), and the sim does not consume/check MP anywhere yet. Like `white-magic.holy`, **MP enforcement could regress `summon.`** — so MP enforcement remains uniquely the one capability that LOWERS `N` (potentially by more than one now), not raises it. Recorded so the N=6 floor's contingency is *expected and understood*. Re-verify on any MP, roster, or content change.
- **CI teeth (all discriminating).** Three new/updated tests: (1) the summoner lands `summon.` **specifically** (a `summon.*` cast, not its `black-magic.fire` secondary) on ≥4/6 phys maps; (2) removing the summoner from the candidate set drops `distinctMeasurableArchetypes` 6→5 → `pass=false` (target 6); (3) the summoner's `losingMatchups` includes `"magic"` and it is absent from `noLosingMatchup` (anti-convergence). `WIN_CEIL_TICKS = 300` re-confirmed unchanged (the summoner's slowest legit in-band win is 43t ≪ 300).
- **Out of scope, FLAGGED not fixed (fft-fidelity, this slice):** pre-existing content nits worth a later pass — `summon.bahamut` AoE (`aoe.h:2`) may under-model canon (Bahamut's radius is likely larger than the basics, ~3); `summon.ramuh` uses `aoe.v:2` while Shiva/Ifrit use `aoe.v:1` (inconsistent vertical among the basics); summon MP values are rescaled from canon (Shiva 14 vs 24, Bahamut 30 vs 60) with no `[ENHANCEMENT]`/design note. None affects this slice's count; do not let a future "fidelity correction" silently revert them toward canon without a decision.
- **Outcome (honest roster):** `distinctMeasurableArchetypes = 6`, `distinctSignatures = ["aim.","black-magic.","geomancy.","punch-art.","summon.","white-magic."]`, `dominantBuilds = []`, `winsAllInBand = []`, `noLosingMatchup = ["bld-longshot"]` (the summoner folds to magic, so it is NOT a no-losing-matchup build), `pass = true`.
- **Follow-ups still tracked toward `≥ 8` (unchanged):** a third threat axis (moves anti-convergence surfaced→enforced), provoke/threat (aggro-tank), reaction-as-live (counter-wall + reraise-cleric's sustain), a Defend benchmark encounter (exercises the landed `survive` condition), and new signature prefixes via new jobs — **the job roster is now deprioritized** (Product Owner direction, 2026-08-05) in favor of other game systems, so the last two identities toward the `8` bar are not expected from new jobs in the near term. The `≥ 8` release bar is untouched.

## References

- `docs/06` §4 + AC-E2 (diversity gate) + the two Implementation-status notes (AI limits, AoE/measurement gap)
- `docs/08` AC-R3 (gate in CI from P2) · `docs/00` (diversity success criterion) · `docs/02` B5 (anti-convergence law)
- `docs/plans/slice-4-diversity-gate.md` (the methodology this ADR scopes)
- CLAUDE.md — masked-identity convention; balance-probe total-order convention
