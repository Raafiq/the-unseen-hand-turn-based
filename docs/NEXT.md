<!-- written-against: 03231cd -->

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

**P2 — customization depth, in progress.** 432 tests / 25 files, 10 Playwright specs, CI
green. **Pages deployed successfully for the first time on 2026-08-12** (run #23); runs
#1–#22 all failed — see the incident note below. The README had claimed it was green the
whole time, which is why nobody noticed. **P2's open exit criterion is the diversity gate,
now at N=1 (re-baselined 2026-08-12, down from 6) against a release bar of ≥8** — the
move+act fold landed and the content has not caught up; see the next slice below and
`docs/08` §1a for the per-phase checklist. The viewer's transparency previews
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

**Diversity gate: N=1** (was 6), release bar ≥8. `pass=true`, `dominantBuilds=[]`. The gate
still passes and still DETECTS — degrading the one surviving identity fails it — but it is
measuring a field the content re-tune has yet to restore.

---

## The next slice — RE-TUNE THE GAUNTLET CONTENT (not yet green-lit; confirm)

### Why: the fold landed and the gate fell 6 → 1

`ai.ts` learned ADR-0015's move+act fold (the slice green-lit 2026-08-12) and it did what
the ADR said it would — moved every gate number — in the direction nobody predicted.
Measured, per build, in-band maps out of 6:

```
arcane-artillery 4 (MEASURABLE, black-magic.)   terrain-geo    3
faithzero-monk   3                              glass-summoner 3
longshot         2                              reraise-cleric 2
spellblade       0
```

The fold roughly doubles effective offense for **both** sides; the encounters, oppositions
and builds were all tuned against the superseded −80-only model, so six of seven slid just
under `VIABLE_MIN_MAPS` = 4. **N was re-baselined to 1** (user chose this over re-tuning in
the same slice or holding the probe on the old model). N=1 is a placeholder; `≥ 8` is still
the release bar.

**The re-tune is the next slice: adjust oppositions / encounter geometry / build stats so
the identities clear the band again under the corrected model.**

### What the next session must NOT re-derive

- **It is not masking.** `signatureBandMaps === inBandMaps` for every build — each identity
  still lands its signature wherever its build survives. Test-asserted directly, because
  masking and sub-viability look identical in the headline number and need opposite fixes.
- **Free flanking is not the main cause.** ADR-0013 defers facing-on-move, so the fold makes
  a permanent rear arc free. Tested: re-ranking the comparator to put tempo above arc
  recovers only 1 → 2. Raw lethality dominates. Do not re-run this experiment.
- **`skirmish-a` is now a defeat for all seven candidates** and losses resolve in 25–48
  ticks. That map is the sharpest signal for whether a re-tune is working.

### Landmines the re-tune inherits

1. **`geomancy.*` fires ZERO times across the as-authored suite** (it still lands in the
   substitution gauntlet). `benchmark-suite.test.ts` pins it to **exactly zero**, so
   restoring geomancy **fails that test on purpose** — move the skillset back into the
   required list rather than deleting the assertion.
2. **The opportunity-cost check is self-re-arming.** With one measurable build,
   non-uniformity is inexpressible; the strict assertion returns automatically the moment a
   second identity appears. Expect it to start biting mid-re-tune — that is correct.
3. **Detection tests are pointed at `arcane-artillery`**, the only identity whose loss can
   move the verdict. When more identities return, re-point/restore per-identity detection
   tests (the two deleted ones are described in `gauntlet.test.ts`).
4. **The viewer e2e specs ride on the demo battle and this is the THIRD time a sim change
   has invalidated them.** `e2e/play.spec.ts` clicks hard-coded tiles that depend on how
   the AI plays `makeDemoBattle`; the fold moved the Brawler from (6,3) to (5,0) and every
   coordinate went stale, including two captions that then described things the frames no
   longer showed. `npm run check` does **not** catch this — Playwright is a separate CI job,
   so run `npm run test:visual` too. **Worth doing properly:** `docs/10`'s state machine is
   DOM-free and constructible over an arbitrary `BattleState`, so these specs could use a
   purpose-built board instead of shipped demo content. Also note the preview pair now reads
   SIDE 100% vs REAR 100% — the Mage has no directional evasion, so the hit-% half of that
   discriminator is gone and only the arc name moves.
5. **Do not calibrate the gate to pass.** `src/sim/CLAUDE.md`: gate constants are calibrated
   to DETECT. Re-tune the content, not `VIABLE_MIN_MAPS` / `WIN_CEIL_TICKS`.

### Also NOT green-lit

AoE splash rendering · wiring `Encounter.teams[].controller` to the viewer · weapon range ·
MP enforcement (would cut N further) · anything in P3.

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

## RESOLVED — the repository default branch is `main`

`git remote show origin` reports `HEAD branch: main` (re-verified 2026-08-12). This was the
root cause under BOTH Pages failures above: GitHub derived the `github-pages` environment's
deployment-branch policy and the Pages source branch from the default branch, which was
still `claude/fft-combat-design-e32fm1`, a day-one branch 93 commits behind. With the
default corrected, new clones, `origin/HEAD` and default PR bases all resolve to `main`.

Two leftovers, both cosmetic: run `git remote set-head origin -a` in any clone made before
the switch, and ~17 stale `claude/*` branches could be pruned.

**A process note worth keeping.** This section previously read "STILL OPEN" and was repeated
to the user several times AFTER the switch had already happened, because the claim was
carried forward from one early-session measurement instead of being re-derived. That is the
exact trap this file's own trust rule describes — a handoff reads as authoritative whether
or not it still is. Re-run the one-line check before repeating a settings claim; it costs
nothing.

**What an agent still cannot do here:** repo/environment settings need
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
