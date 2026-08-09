<!-- written-against: 226d186 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls more than 10 commits behind HEAD. If the hook
> says it is stale, treat every claim below as a hypothesis and re-derive before acting —
> a handoff reads as authoritative whether or not it still is, which is exactly the trap
> the evidence principle in `CLAUDE.md` exists to close.
>
> **Update this file as part of the retrospective before every PR**, while the context is
> hot. Re-stamp `written-against` to the branch's head commit.

---

## Where things stand

**P3 — playable.** 428 tests / 25 files, 10 Playwright specs, CI + Pages green.

Two PRs merged in the last session:

- **#19** — the viewer became playable (click a tile to move, an enemy to attack), and the
  turn became a real FFT turn. **ADR-0015** folded move+act into one command, so the −100
  CT turn from `docs/01` AC-02 is reachable for the first time. `stepDemo` is retired; the
  viewer runs on `advanceToDecision` + `applyCommand`, the same primitives as the headless
  harness. `docs/10-viewer-and-interaction.md` is the authoritative viewer spec
  (AC-V1 … AC-V11).
- **#20** — `CLAUDE.md` audit: fixed a false "pre-code" status header, consolidated six
  bullets under one *evidence principle*, and split edit-time rules into
  `src/sim/CLAUDE.md` + `src/render/CLAUDE.md`.

**Diversity gate: N=6**, release bar ≥8. `pass=true`, `dominantBuilds=[]`, anti-convergence
holds and is test-asserted.

---

## The recommended next slice — NOT green-lit; confirm with the user first

### Teach `ai.ts` the move+act fold

This is the follow-up **ADR-0015 explicitly names**. The balance probe still emits one
sub-phase per turn, which is why the fold was containable — and why the benchmark still
under-measures every *closer* archetype. Measured before the fold shipped:

```
COMMAND TALLY {"move": 25, "act": 28, "wait": 0}   ← across the five enc-* encounters
```

47% of benchmark turns are pure repositioning that FFT would have combined with an attack.
Under that model no closer can execute flank-then-strike, so `docs/03` #2 Dual-Wield
Deleter, #3 Solo Duelist, #8 Spellblade, #10 Sky-Drop Dragoon, #11 Teleport Assassin and
#12 Terrain Geomancer are all suppressed in the gate.

**This slice WILL move the gate's numbers. That is the point, not a side effect.** Per
`CLAUDE.md`, all records move in the SAME slice: the `gauntlet.ts` manifest, an ADR-0014
amendment, `docs/06` AC-E2 (authoritative — outranks the ADR), and a regenerated
`npm run state`. Do not assume which direction N moves; measure it.

### Two landmines this slice detonates — both documented, neither fixed

1. **`forecast()` assumes every future actor pays −80** (`ASSUMED_FUTURE_TURN_COST`) — the
   exact model ADR-0015 disproves. `src/render/forecast.test.ts` is a forecast-vs-replay
   oracle that **will go red** when the AI starts paying −100. That is by design: fix the
   forecast or drop the timeline row. **Do not silence the test.** Note
   `Forecast.assumedFrom` is computed at the *cheapest* legal turn (−60), so it is a lower
   bound and never overclaims.
2. **The gauntlet's tempo numbers reflect the −80-only world.** Re-measure; do not port old
   expectations forward.

### Smaller alternatives, if the user prefers a lighter slice

- **AoE splash rendering** (render-only; the sim already resolves AoE).
- **Wire `Encounter.teams[].controller` through to the viewer.** Today the player team is a
  `PLAYER_TEAM = 0` constant in `demo.ts` with a TODO, because `BattleState` carries no
  controller field. Wiring it means threading the encounter through or a schema bump.
- **Weapon range.** The Archer is melee in the viewer, so the slice that motivated the fold
  still cannot show the range/tempo asymmetry. This is a fidelity change — golden vectors
  attached.

---

## Standing constraints that outlive any one slice

- **MP is unenforced for two of six gate prefixes** (`white-magic.holy` 56 vs 24;
  `summon.*` 14–30 vs 24). Enforcing MP would drop **N 6→4**. Do not ship MP enforcement
  without durable carriers first. Disclosed in ADR-0014 and the `DIVERSITY_TARGET_N`
  docstring.
- **Jobs are deprioritised** (user decision). Remaining EXCLUDED builds: `aggro-tank`
  (provoke/threat), `counter-wall` (reaction-as-live), `battle-cleric` (prefix-collapse —
  structurally uncountable), `warlord` (boss). The last two identities toward ≥8 come from
  those unblocks.
- **The frozen golden in `driver.test.ts` is a tripwire, not a maintenance item.** If it
  moves, a change that claimed to be additive was not. Never regenerate it to make a test
  pass.
- **`order: "after"`** (act-then-move) exists in the command schema and driver, covered
  headlessly, but is deliberately unreachable from the UI — exposing it would force the
  player to pick a retreat tile before seeing whether the attack hit.

## Environment facts that cost real time to learn

- **Playwright works.** Chromium is pre-installed at `/opt/pw-browsers`. Never run
  `playwright install`. A subagent reporting it cannot run Playwright is stating a
  hypothesis — subagents do not inherit the main session's environment knowledge.
- **Use the check-runs API for CI.** The legacy commit-status endpoint reports
  `pending / total_count: 0` because nothing posts there; that is not a failure.
- **GitHub auto-merge is NOT enabled** on this repo, so "enable auto-merge" fails — watch
  the checks and merge.
- `claude.com` is egress-blocked; `github.com` is reachable.
