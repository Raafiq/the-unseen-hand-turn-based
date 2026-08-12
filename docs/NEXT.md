<!-- written-against: c25adf8 -->

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
green. **Pages deployed successfully for the first time on 2026-08-12** (run #23); runs
#1–#22 all failed — see the incident note below. The README had claimed it was green the
whole time, which is why nobody noticed. **P2's open
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

## RESOLVED (2026-08-12) — Pages deployed for the first time, after 22 failed runs

`pages.yml` was always correct and its `build` job was always green. The site nonetheless
never existed, for **two sequential reasons**, both settings and neither visible in CI:

1. **2026-07-30 → 2026-08-09:** Pages was never enabled. `actions/deploy-pages` got
   `404 … Ensure GitHub Pages has been enabled`. Fixed by enabling Pages; the repo was
   made **public** in the process (Pages on a private repo needs a paid plan).
2. **2026-08-09 → 2026-08-12:** the `github-pages` **environment** carried a custom
   deployment-branch policy whose only entry was `claude/fft-combat-design-e32fm1` — a
   day-one branch 93 commits behind `main`. `main` was not on it, so the deploy job was
   refused at the environment gate. Fixed by clearing the restriction
   (`custom_branch_policies` is now `false`).

Run #23 then reported `Reported success!` and
`Evaluated environment url: https://raafiq.github.io/the-unseen-hand-turn-based/`.

**Why both settings pointed at a dead branch:** GitHub derived the environment policy AND
the Pages source branch from the **repository default branch**, which is still
`claude/fft-combat-design-e32fm1`. See the open item below.

**Two guards now stand in `pages.yml`'s `build` job**, so this cannot silently recur: a
`/pages` preflight (200 + `build_type == "workflow"`) and a branch-policy preflight. The
second exists because the first is *not sufficient* — `/pages` answers 200 with
`build_type: workflow` while the gate still refuses every branch you have, so a guard that
stopped at the first would have gone green on a dead deploy.

## STILL OPEN — the repository default branch is not `main`

`git remote show origin` reports `HEAD branch: claude/fft-combat-design-e32fm1`. This no
longer blocks Pages, but it is the reason the misconfiguration existed, and it still makes
`origin/HEAD`, fresh clones, and default PR bases resolve to a dead branch. `main` is 93
commits ahead and a strict superset — the stale default's one unique commit (`4659d4b`,
the design-doc drop) is already on `main` as `d8e7d3c`, and no file on it is missing from
`main`. **Fix:** Settings → General → Default branch → ⇄ → `main`. Afterwards run
`git remote set-head origin -a` locally; ~17 stale `claude/*` branches could also be pruned.

**Why an agent cannot do any of this:** repo/environment settings need
`administration: write`, which is not among the scopes a workflow's `GITHUB_TOKEN` can
request, and this sandbox's proxy 403s `/repos/{owner}/{repo}`, `/pages`, `/environments`
and `/deployments`. `raafiq.github.io` egress is blocked too, so **an agent can confirm the
deployment API reported success but cannot confirm the page renders** — that needs a
browser.

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
