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

## References

- `docs/06` §4 + AC-E2 (diversity gate) + the two Implementation-status notes (AI limits, AoE/measurement gap)
- `docs/08` AC-R3 (gate in CI from P2) · `docs/00` (diversity success criterion) · `docs/02` B5 (anti-convergence law)
- `docs/plans/slice-4-diversity-gate.md` (the methodology this ADR scopes)
- CLAUDE.md — masked-identity convention; balance-probe total-order convention
