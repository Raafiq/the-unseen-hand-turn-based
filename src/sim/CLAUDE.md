# `src/sim/` — the pure headless simulation

Rules for **editing sim code**. The root `CLAUDE.md` still governs — read it for the pillars, the locked decisions, the evidence principle and the scope-time rules (an N-bump, a rename) you need *before* changing files. This file holds what only bites once you are in here.

**The invariant above all others:** determinism is P0 (`docs/05` §3, ADR-0004). One seeded PRNG drives every roll in a declared order — no unseeded randomness, no wall-clock, no unordered map/set iteration that affects an outcome. `npm run check:rng` greps this folder for the obvious violations; a clean run is necessary, not sufficient. **No imports from `src/render`, ever** (ADR-0007).

## Schema and state

- **Zod builds schemas at module-eval, so an import cycle between two schema modules throws a `ReferenceError` (TDZ).** When two schemas cross-reference, extract the shared enum/leaf into its own dependency-free module (the `element.ts` split) and re-export.
- **Explicit migrations, no schema `.default()`s.** Adding a *required* field fans out to every typed literal (`defaultUnit`, tests, demo). That is the migration-per-bump pattern working, not a reason to reach for a default.
- **ALL FIVE chassis slots are wired — and this line used to say three, which is the more dangerous error.** Support (ADR-0017), reaction (ADR-0019), movement (ADR-0020) and weapon (ADR-0026) all reach the built unit; the `build.ts` line-checks are `applySupportEffect`, `equippedReaction`, `applyMovementEffect`, `equippedWeapon`. The stale version told agents *not* to suspect reaction or movement — **re-read this against `build.ts` before trusting it.**
- **A support's stat mods land on the unit; its ability mods (`chargeSpeed`, `abilityRange`) land on each projected `BattleAbility`** — never on `basic.attack`, which is weapon-derived. Effect-less supports go in `DEFERRED_SUPPORT_EFFECTS` with a blocker; a test partitions the pack exactly, so none can ship silently dead again.
- **Build-time units skip Zod until `serialize()`.** An out-of-bounds stat modifier only throws at save/rewind, not at build. Every modifier layer must end with the pipeline's **final clamp** to schema bounds (raw → growth → trait → clamp), proven by a serialize round-trip test.
- **Regenerating the frozen golden** (`driver.test.ts`): classify the slice first. Additive or representation-only → the roll-bearing fields (`rngCounter`, `tick`, each unit's `hp`/`crystalTimer`, every `turnLog` entry) must be **byte-identical**, only new fields move. Intentional behavior change → exactly those fields change and a golden vector explains why. Grep the diff for the roll fields; that is the cheap check inspection misses.

## The balance probe and the diversity gate

The root's **evidence principle** — a measurement must be able to come out the other way — specialised to the gate.

**The comparator**

- **The candidate ranking must be ONE uniform, transitive total order** (`ai.ts` `compareCandidate`). Fold any new dimension into the *same* key sequence for every candidate kind. A bucket-first key (e.g. cluster-size-first) can be intransitive *and* silently override the AC-E3(b) focus rule, letting a wide-but-weak AoE out-rank a near-lethal focus. Value an AoE by `(lowest-effHp-hit, then summed magnitude)`. Treat this like determinism: it is load-bearing for every slice's benchmark numbers.
- **A term folded into a SECONDARY key only decides ties on the primary one.** Valuing inflicted status changed zero shipped runs — `magnitude` ranks only among acts on the *same* focus target, where the inflicting abilities were already the biggest hit. Predict a new dimension's reach from where it sits in the key sequence, and say plainly when a live capability moves nothing.
- **When you add a comparator key, sweep its PLACEMENT and report what each position scored.** Scoring only the act available from a tile made `move` a *liability*: Move +2 alone dropped the variety score **7 → 5** (ADR-0020). `exposureOf` (foes whose move + weapon reach covers a tile) is the fix, calibrated across six placements; the shipped one sits **below** the focus keys, so it decides only *which tile* an already-chosen act comes from. "Nearest tile" and "stay put unless you cannot act" were measured and failed. A key that works at one position and not another is telling you what it actually overrides.

**Calibration and proxies**

- **Calibrate gate constants to DETECT, not to pass.** A threshold frozen just off a verdict-flip certifies nothing — the dominance cutoff `TOP_EFF` shipped 3 ticks under the point that would flag the strongest build, *documented* there, until review cut it. Prefer relative or threshold-free verdicts over hand-tuned absolutes.
- **A benchmark must vary the axis it claims to test — and adding the axis is not enough.** Verify the *shipped* fixture makes that axis the pivot: shared filler allies + team-elimination victory + magnitude-focus AI silently measured a *sibling* axis (magic opposition rewarded tempo and range, not the candidate's Faith). When the fixture doesn't isolate the axis, say what it *actually* measures.
- **A viability PROXY must exercise the same causal mechanism as the real fix**, or its number is an optimistic ceiling. A *tanky* proxy (inflate HP so the probe looks elsewhere) predicted body-screening would make the summoner viable on 4/6 maps; the shipped *reachability* screen delivered 1/6 — inflated HP changes targeting **globally**, a screen blocks **one lane locally**. Probe each stacked assumption, not just the named one.
- **A gate's CONTRIBUTION proxy encodes which identities can exist.** `inBand` counted damage + healing, so a build whose whole contribution is CONTROL scored zero on every map it decided — the gate could never have credited it, and nothing said so (`landed` has the same shape). Before scoping a slice that adds a **new kind** of identity, check the metric can represent it; adding the build to the manifest is not enough.

**Reading a result**

- **A build's identity can be MASKED.** The probe uses only live-formula actions and picks the highest-magnitude in-range one, so a build fights as the *wrong* job whenever a borrowed **secondary out-damages its own primary** — a Geomancer cast black-magic and a wizard cast summons until review caught it. Keep a showcase build's signature action un-dominated and assert it appears in `RunReport.abilityUsage`.
- **An EXCLUDED blocker tag is a hypothesis.** Probe empirically *why* a build is excluded before scoping a slice to unblock it: `reraise-cleric` was mis-excluded, `battle-cleric` is structurally uncountable via prefix-collapse, and the summoner's real blocker was short-range-caster survivability, not the charge-whiff its tag named.
- **An identity can be propped up by an UNMODELED COST.** `reraise-cleric` rides on unenforced MP (`holy` 56 vs the cleric's 24), so MP enforcement will *lower* the variety score (5→4). Disclose such contingencies in the ADR and the constant's docstring, and assert the **specific** signature action (`holy`, not any `white-magic.*`) so a test cannot pass on the unmodeled variant.
- **A gate row cannot tell "LOST" from "COULD NOT END".** A mechanic that removes a reason to attack a unit can livelock a fight — charm did it twice, each surfacing only as `outcome: "timeout"`. Read the turn log of a non-clear before blaming the build. Corollary: **the sites you deliberately do NOT change are hypotheses** — two of three "charm doesn't affect this" calls were wrong, and only an integrated run said so.

> **Changing `DIVERSITY_TARGET_N`, or moving a build EXCLUDED↔MEASURABLE, is a scope-time decision — see the root `CLAUDE.md`.** It moves the `gauntlet.ts` manifest, an ADR-0014 amendment, `docs/06` AC-E2 (authoritative, outranks the ADR), `docs/08` §1a, `docs/11` §3 and a regenerated `npm run state`, all in the same slice.

## Commands

`npm run check` (everything CI runs) · `npx vitest run src/sim/<file>.test.ts` for one file · `npm run state` after anything that changes gate output.
