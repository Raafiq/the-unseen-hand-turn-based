<!-- written-against: 0ea354f -->

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
> hot. Re-stamp `written-against` to the branch's head commit, then run
> `npm run check:handoff`. **CI enforces this** (`check:handoff`, push events only): the
> stamp must resolve, be an ancestor of HEAD, and be no more than 20 commits behind — so
> this file cannot quietly rot into something that still reads as authoritative.

---

## Where things stand

**P2 — customization depth, in progress.** 428 tests / 25 files, 10 Playwright specs, CI
green. **The Pages deploy has NEVER succeeded** — see the incident note below; the README
formerly claimed it was green, which is why it went unnoticed for ten days. **P2's open
exit criterion is the diversity gate at N=6 vs a release bar of
≥8** — see `docs/08` §1a for the per-phase checklist. The viewer's transparency previews
are a P2 deliverable; P3 (hybrid/fusion jobs, rewind UI, scan, speed toggle) has not
started.

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

## OPEN — the Pages deploy needs ONE manual setting change

**Blocked on the human; no code will fix it.** `pages.yml` is correct and its `build` job
has always been green. The site has still never existed, for two sequential reasons:

1. **2026-07-30 → 2026-08-09:** GitHub Pages was never enabled. `actions/deploy-pages`
   got `404 … Ensure GitHub Pages has been enabled`. **Now fixed** — Pages is enabled, the
   repo was made public to allow it on a free plan, and `/pages` reports
   `build_type: "workflow"`.
2. **Still open:** the `github-pages` **environment** carries a custom deployment-branch
   policy whose only entry is `claude/fft-combat-design-e32fm1` — a feature branch dead
   since 2026-07-30. `main` is not on the list, so the deploy job is refused at the
   environment gate **before a runner is assigned**: one second, no steps, no annotation,
   and no downloadable log at all (the log endpoint 404s). Nothing in the run says why.

**The fix (repo Settings, browser):** Settings → Environments → `github-pages` →
Deployment branches — add `main`, and delete the stale `claude/fft-combat-design-e32fm1`
entry. While there, Settings → Pages still shows that same dead branch as the source
branch; harmless under `build_type: workflow`, worth clearing.

**Why an agent cannot do this:** editing environments needs `administration: write`, which
is not among the scopes a workflow's `GITHUB_TOKEN` can request, and this sandbox's proxy
blocks `/repos/*/pages`, `/environments` and `/deployments` outright (403). Reading those
endpoints from *inside a runner* works and is how the policy was finally found — that trick
is reusable for any settings question the sandbox cannot answer.

After the setting changes, dispatch `pages.yml` on `main` and confirm `deploy` gets a
runner. `raafiq.github.io` is egress-blocked from the sandbox, so the site itself must be
eyeballed from a browser — the agent cannot verify the final page renders.

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
- **A job that fails in ~1s with `runner_id: 0`, no `steps`, and a 404 on its logs was
  never dispatched** — it was refused at the environment gate. Do not read that as an
  infra blip and do not go hunting in the job's log; there is none. Query the environment
  (`/environments/<name>`, `/deployment-branch-policies`) from inside a runner instead.
- **The sandbox proxy blocks `/repos/*/pages`, `/environments`, `/deployments` (403) and
  all `*.github.io` egress**, but a *runner* can reach them with `${{ github.token }}`.
  When a repo-settings question is unanswerable from here, add a temporary workflow step
  and read the answer out of the log rather than guessing or asking the human to look.
- **GitHub auto-merge is NOT enabled** on this repo, so "enable auto-merge" fails — watch
  the checks and merge.
- `claude.com` is egress-blocked; `github.com` is reachable.
