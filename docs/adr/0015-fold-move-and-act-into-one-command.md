# ADR-0015: Fold move+act into one Command (the pre-authorized fold)

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Product Owner (main session) + systems-designer (chose the option) + fft-fidelity (verified the baseline)

## Context

`docs/01` §2 states the FFT active turn plainly: *"Move and Act are each used at most
once, **in either order** (a real tactical choice)."* `docs/01` §1 and **AC-02** pin the
end-of-turn CT subtraction at **−100** (moved *and* acted) / **−80** (one) / **−60**
(neither), and `scheduler.ts` implements all three — `settleTurn` takes both a `didMove`
and a `didAct` flag.

But the driver could not express a full turn. Every branch of `applyToUnit` in
`driver.ts` settled immediately:

```ts
case "move":  settleTurn(next,  unitId, { didMove: true,  didAct: false })  // −80
case "act":   settleTurn(after, unitId, { didMove: false, didAct: true  })  // −80
case "wait":  settleTurn(state, unitId, { didMove: false, didAct: false })  // −60
```

So `{didMove:true, didAct:true}` — and therefore `CT_COST_MOVE_AND_ACT` — was
**unreachable from any replay-legal command log**. The driver's own docstring named this
a deferred simplification and pre-authorized the fix: *"a later slice can fold move+act
into one command without changing this contract."*

Three findings turned that deferral into a defect worth fixing now:

1. **It is a fidelity regression against our own baseline doc.** `fft-fidelity` verified
   move-and-act-in-one-turn as `[VERIFIED, high]` from two independent secondary sources
   (QuMarsh's GameFAQs walkthrough: *"he or she may perform one, both, or neither of two
   actions"*; FF Wiki: *"Each unit is allotted one move and one action per turn"*), and
   confirmed the 100/80/60 table exactly. Primary sources (AeroStar, FFHacktics) were
   egress-blocked, so nothing here rises above "two secondary sources agree" — but the
   CT table's *"move **or** act = −80"* row is only meaningful if both-in-one-turn is the
   normal case, which corroborates it structurally.
2. **It collapses the turn's central decision.** With no −100 row, the player chooses
   between −80 and −60. The real FFT tension — swing at −100, reposition at −80, or bank
   tempo at −60 — degenerates to a rounding error, and **Wait becomes near-pointless**.
3. **It is measurably live, not theoretical.** A probe tallying every command the
   benchmark AI issues across the five `enc-*` encounters returned
   `{move: 25, act: 28, wait: 0}` — 47% of all benchmark turns are pure repositioning
   that FFT would have combined with an attack. Every unit runs at −80 instead of −100,
   i.e. ~25% more turns than FFT for anyone taking a full turn.

The command schema is also the **save / rewind / build-share format** (`docs/05` §3b,
ADR-0004), so changing it is a hard-to-reverse decision that warrants a record.

## Options considered

1. **Ship one-sub-phase-per-turn (status quo) and build click-to-act on it.** No sim
   change. Rejected: it ratifies a known-biased model as the *player-facing* rule,
   contradicts `docs/01` §2 verbatim, and leaves a `[BASELINE]` constant unreachable.
   It also fails the opportunity-cost law from the inverse side — the player's strongest
   turn is not purchasable *at any price*, when the docs already specify the price.
2. **Make the turn a sub-phase sequence** — commands accumulate `didMove`/`didAct` and
   settle only on `wait`/exhaustion (fft-fidelity's proposed shape). Conceptually
   cleanest, but it **redefines the command log**: a `move` would no longer end a turn,
   so every existing log, the frozen golden, and every gauntlet number shift together.
   Rejected for this slice as a gate-wide renumbering bought for no player-visible gain
   over option 3.
3. **Extend the `Command` union additively** — `act` gains an optional
   `move: { to, order }`. Existing `move` / `act` / `wait` semantics are untouched, so
   existing logs replay byte-identically.
4. **Let the viewer keep a bespoke step policy** and layer player input on top, never
   touching the driver. Rejected outright: it breaks a P0 invariant. `(seed, ordered
   commands)` is the rewind/save/share substrate (AC-S1/S7); under this option the *only*
   mode a human generates state in produces no command log, and legality forks into two
   implementations (`advanceToDecision` exists precisely so the interactive driver and
   the headless harness can never diverge on who acts next).

## Decision

**Option 3.** `CommandSchema`'s `act` member gains an optional
`move?: { to: Position, order: "before" | "after" }`:

- **Absent `move`** ⇒ the existing code path is unchanged — same rolls, same
  roll-consumption order, same settle. This is what makes the change additive.
- **`order: "before"`** ⇒ move (validated against `moveRange`), then resolve the act
  **from the post-move tile** (`inAbilityRange` checked from the destination), then
  settle **once** at −100.
- **`order: "after"`** ⇒ resolve the act from the origin tile, then move, then settle
  once at −100.
- One command is always exactly one settled turn. Never two settles.

Both orders enter the **schema** now, because the command log is the hard-to-change
artifact; omitting `"after"` would buy a second breaking format bump later for nothing.
Only `"before"` is exposed in the **UI** this slice — see Consequences.

No Zod `.default()` on `order` (CLAUDE.md: the codec uses explicit migrations and no
schema defaults). `order` is required *within* the `move` object when `move` is present.

### Two guardrails that are part of this decision

**The frozen golden is a TRIPWIRE, not a maintenance item.** `GOLDEN_LOG` in
`driver.test.ts` is entirely move-only / act-only / wait commands. Under a genuinely
additive fold it must replay to the **byte-identical committed golden literal**. It is
therefore explicitly *not* regenerated in this slice. If it moves, the fold was not
additive and that is a bug to find — not a diff to classify under the normal
regeneration protocol.

**`ai.ts` is deliberately NOT taught the fold here.** The balance-probe AI keeps
emitting single-sub-phase commands, so the entire diversity gate — the `gauntlet.ts`
manifest, `DIVERSITY_TARGET_N`, ADR-0014, `docs/06` AC-E2 and the generated
`npm run state` page — stays **byte-stable** across this slice.

### Bug fixed as part of the fold

`charge.ts` hard-coded `settleTurn(state, casterId, { didMove: false, didAct: true })`
(commented *"cost 80 — one action, no move phase here"*). A move-then-charge would have
settled at −80 instead of −100.

**Resolution: `declareCharge` no longer settles at all — the driver owns the settle.**
The obvious fix (thread a `didMove` flag into `declareCharge`) was rejected because it
keeps the bug class alive: a second CT-cost decision hidden inside a helper that cannot
see the whole turn. With the settle removed, the driver's `act` case has **exactly one**
`settleTurn` at the bottom covering all four sub-branches (instant single, instant AoE,
charged, folded), so *"one command = one settled turn"* is structurally enforced rather
than maintained by convention. `charge.ts` no longer imports the scheduler and no longer
knows any CT constant. Blast radius was three call sites (driver, `demo.ts`,
`charge.test.ts`); every pre-existing test passes unchanged.

A charged act combined with `order: "after"` is **rejected** — `docs/01` §2: charged
spells lock the other sub-phase.

**Unspecified detail resolved during implementation:** with `order: "after"`, the move is
validated against the **post-act** board — a body the act just dropped still blocks
traversal, exactly as it would for a separate `move` command issued afterwards. Recorded
in the `applyToUnit` docstring.

## Consequences

**Good**

- `docs/01` §2 and AC-02 are honored end-to-end; the −100 branch is reachable and tested.
- The turn regains its three-way tempo decision, and with it the opportunity cost that
  the anti-convergence law depends on.
- Every *closer* archetype in `docs/03` — #2 Dual-Wield Deleter, #3 Solo Duelist,
  #8 Spellblade, #10 Sky-Drop Dragoon, #11 Teleport Assassin, #12 Terrain Geomancer —
  can execute its signature turn (flank-then-strike) for the first time. Under the old
  model not one of them could.
- Existing command logs, saves and the frozen golden all remain valid: additive means
  additive.

**Costs / limits — stated plainly**

- **The follow-up slice inherits a landmine: `forecast()` assumes −80 for everyone.**
  The viewer's turn-order timeline and the preview's "next slot" row are computed by
  settling every *future* actor at `{didMove:false, didAct:true}` — the −80 model this
  ADR disproves. That is harmless *today* precisely because `ai.ts` really does emit
  single sub-phases. The moment the follow-up slice teaches `ai.ts` the fold, every
  displayed timeline slot becomes silently wrong, and **nothing tests forecast accuracy
  against a real replay**. That slice must fix `forecast` or drop the row; it is recorded
  in `docs/10` §4 item 7 so it cannot be missed. Flagged here because a distortion that is
  currently invisible is exactly the kind a later session ships without noticing.
- **The gate's tempo distortion is not fixed by this ADR.** Because `ai.ts` still emits
  single sub-phases, the benchmark continues to under-measure every closer archetype.
  This ADR *stops the distortion from becoming the player-facing rule*; it does not
  remove it from the benchmark. Teaching `ai.ts` the fold is a deliberate follow-up
  slice, and per CLAUDE.md it will move all of the gate's records together
  (manifest + ADR-0014 amendment + `docs/06` AC-E2 + regenerated `npm run state`).
  Do not let it ride along with an unrelated change.
- **`order: "after"` ships in the schema and driver but not in the UI.** Exposing it
  would force the player to choose a retreat tile *before* seeing whether the attack hit
  or KO'd, because the fold resolves the whole turn in one model step — a pillar-4
  honesty regression. Faithful act-then-move needs the outcome surfaced mid-turn; that
  is a later slice. It is covered headlessly so the format is proven and stable.
- **`stepDemo` is retired.** The viewer's bespoke step policy in `demo.ts` was the second
  turn-settling implementation (it called `settleTurn` directly, outside the driver);
  routing the viewer through `applyCommand` removes the fork. This is a determinism
  improvement, but it changes the Playwright screenshot baseline's pixel values.
- **The demo's scripted Slow hex is lost, and that is correct.** `demo.ts` applied Slow
  to the mage's target as render-layer fiction, because the sim's inflict-on-hit
  resolution is deferred (ADR-0010). A viewer routing everything through the sim cannot
  keep it without the UI asserting a status the sim never inflicted — which pillar 4
  forbids. The Knight's opening Protect survives (applied at battle construction).

## Acceptance criteria

Recorded in full in `docs/10-viewer-and-interaction.md` (AC-V1 … AC-V10) — the doc is
authoritative and outranks this ADR if they ever disagree. The load-bearing ones here:

- **AC-V1** — replaying `GOLDEN_LOG` under the extended schema serializes to the existing
  committed golden literal, unregenerated.
- **AC-V2** — an actor at ct 108 issuing one combined move+act settles to **ct 8** having
  consumed **one** command; move-only settles to **ct 28**.
- **AC-V3** — the act resolves from the **post-move** tile (rear-arc fixture with non-zero
  directional evasion, so front ≠ rear and the tie trap is avoided).
- **AC-V5** — move + charged act settles at −100 (the old hard-coded `didMove:false`
  yields ct 28 instead of 8 — that is the discriminator); charged act + `order:"after"`
  is rejected.

## References

- `docs/01-combat-system.md` §1 (CT table), §2 (action economy), AC-02
- `docs/05-simulation-and-state-model.md` §3b (command-replay substrate), AC-S1 / AC-S7
- `docs/10-viewer-and-interaction.md` (AC-V1 … AC-V10)
- ADR-0004 (determinism as a P0 invariant), ADR-0007 (sim/render split),
  ADR-0010 (deferred resolution scope), ADR-0013 (facing-on-move deferred),
  ADR-0014 (diversity-gate phased target — untouched by this slice)
