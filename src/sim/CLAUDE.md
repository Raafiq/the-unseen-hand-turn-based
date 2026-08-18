# `src/sim/` — the pure headless simulation

Rules that apply while **editing sim code**. The root `CLAUDE.md` still governs — read it
for the pillars, the locked decisions, the evidence principle, and the scope-time rules
(an N-bump, a rename) that you need *before* you start changing files. This file holds the
gotchas that only bite once you are in here.

**The invariant above all others:** determinism is P0 (`docs/05` §3, ADR-0004). One seeded
PRNG drives every roll in a declared order; no unseeded randomness, no wall-clock, no
unordered map/set iteration that affects an outcome. `npm run check:rng` greps this folder
for the obvious violations — a clean run is necessary, not sufficient. This core is pure
and headless: **no imports from `src/render`, ever** (ADR-0007).

## Schema and state

- **Zod builds schemas at module-eval, so a runtime import cycle between two schema modules
  throws a `ReferenceError` (TDZ).** When two schemas cross-reference, extract the shared
  enum/leaf into its own dependency-free module (the `element.ts` split) and re-export.
- **The codec uses explicit migrations with no schema `.default()`s.** Adding a *required*
  field therefore fans out to every typed literal (`defaultUnit`, tests, demo). That is the
  migration-per-bump pattern working as intended, not a reason to reach for a default.
- **Only 3 of the 5 chassis slots are wired — check before you blame a build's numbers.**
  `build.ts` applies the equipped **support** (ADR-0017, `support.ts`) at
  `growth → trait → support → clamp`; **reaction and movement are still
  validated-then-ignored**, as support was until it cost two slices of mis-diagnosis. A
  support's stat mods land on the unit, its ability mods (`chargeSpeed`, `abilityRange`) on
  each projected `BattleAbility` — and never on `basic.attack`, which is weapon-derived.
  Effect-less supports must be listed in `DEFERRED_SUPPORT_EFFECTS` with a blocker; a test
  asserts that partitions the pack exactly, so none can ship silently dead again.
- **Build-time units skip Zod until `serialize()`.** `buildBattleUnit` produces a raw
  `UnitState` that is unvalidated until the codec serializes it, so any stat-modifier layer
  (traits now; equipment/status later) that produces an out-of-bounds value only throws at
  save/rewind — not at build. Every modifier layer must end with the pipeline's **final
  clamp** to the schema bounds (order: raw → growth → trait → clamp), proven by a
  serialize round-trip test.
- **Regenerating the frozen golden** (`driver.test.ts`): classify the slice first. For an
  additive/representation-only change the roll-bearing fields (`rngCounter`, `tick`, each
  unit's `hp`/`crystalTimer`, every `turnLog` entry) must be **byte-identical** on both
  sides of the diff — only the new fields move. For an intentional behavior change, exactly
  those fields change and a golden vector explains why. Grep the diff for the roll fields;
  that is the cheap check that catches a stray roll change inspection misses.

## The balance probe and the diversity gate

These are instances of the root's **evidence principle** — the measurement must be able to
come out the other way — specialised to the gate.

- **The candidate ranking must be ONE uniform, transitive total order** (`ai.ts`
  `compareCandidate`). Fold any new dimension (spread, range, …) into the *same* key
  sequence for every candidate kind — a bucket-first key (e.g. cluster-size-first) can be
  intransitive *and* silently override the AC-E3(b) FOCUS rule, letting a wide-but-weak AoE
  out-rank a near-lethal focus. Value an AoE by `(lowest-effHp-hit, then summed magnitude)`.
  The comparator is load-bearing for every slice's benchmark numbers — treat it like
  determinism.
- **A term folded into a SECONDARY key only decides ties on the primary one.** Teaching
  the probe to value inflicted status changed ZERO shipped runs (A/B over the whole
  gauntlet, every ability-usage histogram byte-identical): `magnitude` ranks only among
  acts on the SAME focus target, and the inflicting abilities were already the biggest hit
  there. Predict a new dimension's reach from where it sits in the key sequence — and say
  plainly when a live capability moves nothing.
- **Calibrate gate constants to DETECT, not to pass.** A threshold frozen just off a
  verdict-flip certifies nothing (a dominance cutoff `TOP_EFF` shipped 3 ticks under the
  point that would flag the strongest build, *documented* there, until review cut it).
  Prefer relative/threshold-free verdicts over hand-tuned absolutes. A benchmark must vary
  the **axis it claims to test** — matchup/threat, not just geometry — and **adding the axis
  is not enough**: verify the *shipped aggregate fixture* makes that axis the pivot, since
  shared filler allies + team-elimination victory + magnitude-focus AI can silently measure
  a *sibling* axis (the multi-matchup magic opposition rewarded tempo/range, not the
  candidate's Faith; the Faith cliff only held on a straddle fixture the gate never runs).
  When the fixture doesn't isolate the axis, say what it *actually* measures.
- **A build's identity can be MASKED, and an EXCLUDED blocker tag is a hypothesis.** The
  probe uses only live-formula actions (physical/magic/heal) and picks the highest-magnitude
  in-range one, so a build fights as the *wrong* job whenever a borrowed **secondary
  out-damages its own primary** (a Geomancer cast black-magic and a wizard cast summons
  until review caught it). Keep a showcase build's signature action un-dominated and assert
  it appears in `RunReport.abilityUsage`. Empirically probe *why* a build is excluded before
  scoping a slice to unblock it (`reraise-cleric` was mis-excluded; `battle-cleric` is
  structurally uncountable via prefix-collapse; the summoner's real blocker was
  short-range-caster survivability, not the charge-whiff or focus-fire its tag named).
- **An identity can be propped up by an UNMODELED COST.** `reraise-cleric`'s `white-magic.`
  rides on unenforced MP (`holy` 56 vs the cleric's 24), so MP enforcement will *lower* N
  (5→4). Disclose such contingencies in the ADR and the constant's docstring, and assert the
  *specific* signature action (`holy`, not any `white-magic.*`) so a test cannot pass on the
  unmodeled variant.
- **A viability PROXY must exercise the SAME causal mechanism as the real fix**, else its
  number is an optimistic ceiling, not a prediction. A *tanky* proxy (inflate HP so the probe
  looks elsewhere) predicted body-screening would make the summoner viable on 4/6 maps; the
  shipped *reachability* screen delivered 1/6, because inflated HP changes targeting
  **globally** while a screen blocks **one lane locally**. Probe *each* stacked assumption,
  not just the named one.
- **A GATE'S CONTRIBUTION PROXY ENCODES WHICH IDENTITIES CAN EXIST.** `inBand` counted
  damage + healing, so a build whose whole contribution is CONTROL scored zero on every
  map it decided — the gate could never have credited a control identity however decisive
  it was, and nothing said so. `landed` had the same shape (true only when HP moved).
  Before scoping a slice that adds a NEW KIND of identity, check the metric can represent
  it; adding the build to the manifest is not enough.
- **THE PROBE PRICES THE ACT, NEVER THE TILE — so a mobility buff is a LIABILITY.**
  `compareCandidate` enumerates every reachable tile, scores the best action available
  from each, and carries **no term for how many foes can strike the tile it lands on**.
  Low `move` therefore keeps fragile builds alive *by accident*. Measured (ADR-0020):
  authoring `steal.move-plus-2` as a real +2 Move dropped the variety score **7 → 5** —
  every caster collapsed, melee went flat or worse, and **no build improved anywhere**.
  Before scoping anything that grants reach, mobility or extra reachable tiles, check
  whether the probe can *use* it without walking into a kill zone; and note a safety term
  at the BOTTOM of the key sequence cannot fix it, because the exposure is lost to
  `targetEffHp`, the primary key. `ai.test.ts` pins the ladder and goes red the day this
  stops being true.
- **A GATE ROW CANNOT TELL "LOST" FROM "COULD NOT END".** A mechanic that removes a reason
  to attack a unit can LIVELOCK a fight — charm did it twice (a body blocking a corridor
  nobody would clear; the last defender nobody would attack), each surfacing only as
  `outcome: "timeout"` among the non-clears. Read the turn log of a non-clear before
  attributing it to the build. Corollary: the sites you deliberately do NOT change are
  hypotheses — two of three "charm doesn't affect this" calls (traversal, victory) were
  wrong, and only an integrated run said so.

> **Changing `DIVERSITY_TARGET_N`, or moving a build EXCLUDED↔MEASURABLE, is a scope-time
> decision — see the root `CLAUDE.md`.** It moves the `gauntlet.ts` manifest, an ADR-0014
> amendment, `docs/06` AC-E2 (authoritative, outranks the ADR) and a regenerated
> `npm run state`, all in the same slice.

## Commands

`npm run check` (typecheck + lint + check:rng + test) · `npx vitest run src/sim/<file>.test.ts`
for one file · `npm run state` after anything that changes gate output.
