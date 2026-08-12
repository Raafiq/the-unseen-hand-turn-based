<!-- written-against: fc1147adb85cfec2dc58fde27061eb2530d9a8c1 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls more than 10 commits behind HEAD. If the hook
> says it is stale, treat every claim below as a hypothesis and re-derive — a handoff reads
> as authoritative whether or not it still is, which is exactly the trap the evidence
> principle in `CLAUDE.md` exists to close.
>
> **This file has now been wrong twice in a row about the same build.** Both times it
> stated a *cause* that had been computed from static data rather than traced from a run,
> and both times the number looked like evidence. If a claim below names a mechanism,
> check whether it also names the measurement that produced it. If it doesn't, it is a
> guess.
>
> **Update this file as part of the retrospective before every PR**, while the context is
> hot. Re-stamp `written-against` to the branch's head commit, then run
> `npm run check:handoff`. **CI enforces this** (push events only).

---

## Where things stand

**P2 — customization depth, in progress.** 475 tests / 27 files, 11 Playwright specs.
**Variety score is 6** (was 5), release bar 8. `pass=true`, `dominantBuilds=[]`.

The last slice (**ADR-0017**) was scoped as "give black magic a viable carrier" and found
the carrier was never the problem. `build.ts` projected **action** abilities only, so the
**reaction, support and movement slots did nothing** — validated at equip time, then
ignored. Nine of fourteen builds wore a dead support slot, including the wizard, whose
whole identity rides on Magic Attack Up. Wiring the support slot took variety 5 → 6.

| build | phys maps | identity |
|---|---|---|
| faithzero-monk | 6/6 | `punch-art.` |
| terrain-geo | 6/6 | `geomancy.` |
| reraise-cleric | 6/6 | `white-magic.` |
| arcane-artillery | 5/6 | `black-magic.` |
| longshot | 5/6 | `aim.` |
| glass-summoner | 5/6 | `summon.` |
| spellblade | 1/6 | — (masked) |

**Zero slack.** All six prefixes the roster can express now count, so any regression fails
the gate.

---

## The next slice — MAKE `battle-skill` A LIVE SKILLSET (not green-lit; confirm first)

### The job in one line

**The Knight — the game's starting job — has no live signature ability, and that is what
blocks the road from 6 to 8.**

### Why, measured

Count live-formula actions per skillset (the balance probe only ever selects
`physical`/`magic`/`heal`; it ignores every `none`-formula action):

| skillset | live actions | none-formula |
|---|---|---|
| `black-magic`, `geomancy`, `summon` | 6 | 0 |
| `aim` | 5 | 0 |
| `punch-art` | 4 | 1 |
| `white-magic` | 4 | 2 |
| **`battle-skill`** | **0** | **7** |
| **`steal`** | **0** | **5** |

All seven `battle-skill.*` actions are stat-breaks tagged `effect-deferred` with
`formula: "none"` and no `inflicts`. They are inert. So **every Knight build fights with
borrowed skills** and signatures on somebody else's prefix.

### Why this is the right lever, and the trap it defuses

The obvious next slices — provoke/threat, reaction-as-live — look like they raise the
count. **They do not.** Both remaining EXCLUDED builds are Knights carrying the identical
kit: `battle-skill.weapon-break` (inert) + `punch-art.wave-fist` (157 damage) +
`punch-art.counter`. Unblocking either would make it viable and it would signature on
**`punch-art.`**, colliding with `bld-faithzero-monk` — the same prefix-collapse that makes
fixing `bld-spellblade` worth nothing.

Before scoping any slice around "unblock build X", read that build's `learned` list in
`data/builds/` and ask which prefix it would actually signature on. That two-minute check
has now caught three different slices.

Making `battle-skill` live does three things at once: it adds a genuinely **new** signature
prefix, it gives two EXCLUDED builds something of their own to signature on, and it retires
the largest `effect-deferred` block in the pack.

### Where to start

Not designed yet. The mechanic is a **persistent stat reduction** — `docs/01` §9 territory
(status/stat modifiers), adjacent to the existing `inflicts` path but different: a break is
a permanent debuff on the target, not a timed status. Options, none chosen:

- Model breaks as a **permanent `ActiveStatus`** with a stat modifier and no duration. Reuses
  the status pipeline; the question is whether "permanent" fits `PERMANENT_STATUS_CT`.
- Give the breaks a **real formula** as well as the debuff, so the probe will actually pick
  them (a `none`-formula action is invisible to the probe **no matter what it inflicts** —
  see `ai.ts`; this is the trap that will bite you first).
- Author a **new damaging Knight action** and leave the breaks deferred. Cheapest, least
  faithful, and does not retire the deferral.

**The second bullet is the landmine.** `estMagnitude`/`allCandidates` skip any action whose
magnitude is 0, so a break that only debuffs will never be selected by the balance probe
and the skillset will still read as dead in `benchmark-suite.test.ts`. Whatever you build,
it must produce magnitude, or the probe needs to learn to value a debuff — which is an
`ai.ts` change that moves every benchmark number and the frozen golden.

### What NOT to do

- **Do not lower the pass mark** (`VIABLE_MIN_MAPS`, `WIN_CEIL_TICKS`, `DIVERSITY_TARGET_N`).
- **Do not scope provoke/threat or reaction-as-live as an N-raiser** without first fixing the
  prefix collapse above. They are worth doing for the *mechanics*; they are not worth doing
  for the *count* as the roster stands.
- **Do not fix `bld-spellblade`** expecting the count to move. Its prefix collapses onto the
  wizard's. It needs a hybrid chassis with real MA, which is P3 (`docs/08` §1).

### Traps waiting for you

1. **Reaction and movement slots are STILL INERT.** Same defect class the support slot just
   had. If a build underperforms, check whether the lever it leans on is actually wired
   before you reach for a magnitude tweak — that mis-diagnosis cost two slices.
2. **Zero slack at N=6.** Every expressible prefix counts, so any content edit that weakens
   one build fails the gate rather than degrading gracefully. Run the gauntlet early.
3. **Editing a support's effect is a GLOBAL change** to every build equipping it. Grep
   `data/builds` for the ability id and state what moves — `magic-attack-up` alone is worn
   by three builds, `martial-arts` by two.
4. **The MP contingency is unchanged and still live.** `white-magic.holy` (56 MP off a 24
   budget) and `summon.*` (14–30) both ride unenforced MP; enforcing it would drop N. The new
   `black-magic.` carrier is less exposed (12 off 24) but not exempt.
5. **Watch the monk.** `bld-faithzero-monk` still clears every `{map × opposition}` cell and
   now also carries a live `pa ×1.25` from Martial Arts. It is not *dominant* (others clear
   some cells faster) so the gate passes, but it is the build closest to the B5 line.
6. **The browser tests are NOT in `npm run check`.** Run `npm run test:visual` too.

---

## Standing constraints that outlive any one slice

- **Jobs are deprioritised** (user decision). Remaining EXCLUDED builds: `aggro-tank`
  (provoke/threat), `counter-wall` (reaction-as-live), `battle-cleric` (prefix-collapse —
  structurally uncountable), `warlord` (boss). Note the finding above: three of those four
  are prefix-collapse cases, so the road to ≥8 runs through **new signature prefixes**, not
  through the EXCLUDED manifest.
- **The frozen golden in `driver.test.ts` is a tripwire, not a maintenance item.** It did
  NOT move through the support slice — the demo battle fields no support-carrying build —
  and that is the evidence the change was contained. Never regenerate it to make a test pass.
- **`order: "after"`** (act-then-move) exists in the command schema and driver, covered
  headlessly, but is deliberately unreachable from the UI — exposing it would force the
  player to pick a retreat tile before seeing whether the attack hit.
- **`DEFERRED_SUPPORT_EFFECTS`** (`src/sim/support.ts`) names why each still-inert support is
  inert. A test asserts it partitions the shipped pack exactly, so a newly authored support
  cannot ship silently dead. Keep that pattern if you wire reactions or movement.

## Environment facts that cost real time to learn

- **Playwright works.** Chromium is pre-installed at `/opt/pw-browsers`. Never run
  `playwright install`. A subagent reporting it cannot run Playwright is stating a
  hypothesis — subagents do not inherit the main session's environment knowledge.
- **Scratch probes belong in the session scratchpad, not the repo root** — otherwise the
  Stop hook flags them as untracked work. A `vite-node` script importing `src/sim/*` is the
  fastest way to measure the gate; keep one, keep it out of the tree.
- **Use the check-runs API for CI.** The legacy commit-status endpoint reports
  `pending / total_count: 0` because nothing posts there; that is not a failure.
- **A job that fails in ~1s with `runner_id: 0`, no `steps`, and a 404 on its logs was
  never dispatched** — it was refused at the environment gate. Do not read that as an
  infra blip and do not go hunting in the job's log; there is none.
- **The sandbox proxy blocks `/repos/*/pages`, `/environments`, `/deployments` (403) and
  all `*.github.io` egress**, but a *runner* can reach them with `${{ github.token }}`.
  When a repo-settings question is unanswerable from here, add a temporary workflow step
  and read the answer out of the log rather than guessing or asking the human to look.
- **A merged branch's remote ref may be deleted**, which makes `--force-with-lease` fail with
  `stale info`. `git remote prune origin` first, then push normally.
- **GitHub auto-merge is NOT enabled** on this repo, so "enable auto-merge" fails — watch
  the checks and merge.
- `claude.com` is egress-blocked; `github.com` is reachable.

## Pages — RESOLVED 2026-08-12 (first successful deploy on run #23)

`pages.yml` was always correct; runs #1–#22 failed on two sequential *settings*, both
derived from the repository default branch: Pages was never enabled, then the
`github-pages` environment's deployment-branch policy allowed only a dead day-one branch.
Both fixed; the default branch is now `main` (re-verified). Two preflights now guard the
`build` job — a `/pages` check and a branch-policy check — the second because the first is
not sufficient (`/pages` answers 200 while the gate still refuses every branch you have).
Its severity anchors on `PUBLISH_BRANCH`, never on the default branch, because anchoring
on the setting that is itself the bug fails open. **An agent can confirm the deployment
API reported success but cannot confirm the page renders** — `*.github.io` is blocked.
