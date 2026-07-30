# ADR-0012: P1 AP economy baseline + starting-job set

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Product Owner + human (P1 kickoff), systems-designer proposal

## Context

P1 must ship AP-driven learning and 3–4 base jobs as data (`docs/08` P1, AC-R2).
Content-author needs firm targets to price skill-tree nodes against, and
combat-engineer needs a fixed earn model to implement `awardAp`. `docs/07` gives
placeholder bands (AP/battle ~80–150, node cost ~60–300, ~10–16 battles to master,
free respec) but not committed numbers. The grind-budget contract (AC-P1) requires
that a critical-path-only player keeps ≥1 competitive build online per act without
farming, and AC-J7 forbids any degenerate AP loop. These numbers are a **tunable
baseline**, recorded so they aren't re-argued mid-build — not a fidelity claim
(AP replaces FFT's JP drip per ADR-0001/`docs/02` §B0, so it needs playtest tuning,
not BMG verification).

## Options considered

**Starting-job set (4):**
1. **Knight · Monk · Black Mage · Thief.** Four distinct command donors; covers all
   four non-primary chassis slots including real Movement (Thief Move+2); delivers
   the flagship Knight + Black Magic build; three non-redundant physical identities.
   Chosen.
2. Knight · Monk · Black Mage · White Mage — adds a cleric/Paladin fantasy but drops
   Movement to passives-only, weakening the positioning demo. Runner-up.
3. Lean 3 (drop Thief) — saves authoring budget, loses the Movement slot demo.

**AP economy:**
1. **100 AP/battle; nodes 60/120/240; 8-node trees.** Anchored to `docs/07` bands;
   first cross-build ≈ 9 battles, mastery ≈ 10–12. Chosen.
2. Front-loaded early AP (starter kit + higher Act-1 grant) — faster "aha" but a
   looser early economy; not needed once slices demonstrate recombination.
3. Defer numbers — leaves content-author with no pricing target. Rejected.

## Decision

- **Starting jobs:** Knight, Monk, Black Mage (Wizard), Thief.
- **AP earn:** ~**100 AP per critical-path battle**, awarded as a flat completion
  grant + a per-battle **capped** meaningful-action bonus (the cap is the
  anti-degenerate mechanism, AC-J7); **all deployed units earn** (`docs/02` §B4).
- **Node costs:** utility **60** · mid **120** · capstone **240** AP.
- **Tree shape:** **~8 nodes** per job, one early fork into an offense branch and a
  utility branch (`docs/02` §B2 "branch points force identity"); the two capstones
  share a slot category so equipping forces the branch choice even after free respec.
  **Mastery = complete the whole tree** (~1020–1200 AP ≈ 10–12 battles) → one
  permanent portable trait.
- **All values are tunable placeholders**, validated by the grind-budget sim harness
  (AC-P1/AC-P2), not fixed balance.

## Consequences

- **Content-author and combat-engineer build to fixed targets**; trees can be priced
  and the earn model implemented without waiting on playtest.
- **Grind-budget contract holds:** a competitive build (~840–960 AP) is reachable
  within an act of ~9 critical-path battles; mastery is a deliberately >1-act arc
  (masteries land Act 2, `docs/07` §4). Optional battles fund a *second* build, never
  obligation.
- **What we give up:** committing numbers now risks re-tuning later — accepted,
  because they are explicitly tunable and the harness will flag violations. Mastery
  masteries could converge on "obvious" +PA/+HP trait pairs; that is exactly what the
  **P2 build-diversity CI metric** exists to catch (flagged, not a P1 blocker).
- **Fidelity boundary:** these AP numbers are NOT sent to fft-fidelity. What *is*
  verified before hard-coding: job growth C-values and ability→job placement (routed
  separately). Mastery traits stay +Move/+PA/+MA/+HP for P1 — no +Speed (soft-cap
  hazard, AC-P5).

## References

- `docs/07` (economy bands, AC-P1/P2), `docs/02` §B0/B2/B4/B7 (AP, trees, respec),
  `docs/03` (build-fantasy archetypes), `docs/08` §1–2 (P1 scope + cut-lines).
- ADR-0001 (spine), ADR-0002 (free respec). Companion: ADR-0011 (P1 architecture).
