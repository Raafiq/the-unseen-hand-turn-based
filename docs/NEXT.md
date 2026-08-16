<!-- written-against: a11f0aac4fd15f74640d2e01ef228fc52d921821 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls more than 10 commits behind HEAD. If the hook
> says it is stale, treat every claim below as a hypothesis and re-derive.

---

## Where things stand

**P2 — customization depth, in progress.** 520 tests / 30 files, 11 Playwright specs.
**Variety score is 7**, release bar 8. `pass=true`, no dominant build.

The last slice (ADR-0018) added the seventh identity: **a thief that wins by charming**.
`bld-cutpurse`'s signature action deals no damage at all — it charms, and a charmed unit
fights for whoever charmed it.

| what | was | now |
|---|---|---|
| a 0-damage control action | invisible to the probe (`formula: "none"` skipped) | priced in HP-equivalent, folded into `magnitude` |
| `status.charm` | an inert marker on the unit | real allegiance, one seam (`effectiveTeamOf`) |
| "landed" / contribution | HP movement only | a landed STATUS counts too |
| deferral manifest | per SKILLSET | per ABILITY (`DEFERRED_ACTIONS`) |

---

## The next slice — NOT YET CHOSEN. The three candidates, by leverage

Nothing is green-lit. The state page's "what's next" ranks these; pick with the human.

1. **Wake the reaction and movement slots.** Two of the five chassis slots are still
   validated-then-ignored (`build.ts`). The support slot alone moved the count 5 → 6
   (ADR-0017). Reactions also retire a named gate exclusion (`bld-counter-wall`).
2. **Provoke / threat.** Retires `bld-aggro-tank`'s exclusion; the probe has no reason to
   attack a tank today.
3. **The last identity toward 8.** Jobs are deprioritised (user decision), so it has to
   come from an EXCLUDED unblock, not from new content.

### If you pick anything that touches the AI or a status

Read **ADR-0018** first. It states the two rules the next mechanic will meet: control is
priced in the same currency as damage (there is no DISABLE class, deliberately), and
allegiance has exactly one seam.

---

## Traps waiting for you

1. **A new term in the comparator's SECOND key changes almost nothing.** Teaching the
   probe to value status changed **zero** shipped runs — measured by A/B over the whole
   gauntlet, every ability-usage histogram byte-identical. `magnitude` only decides among
   acts on the *same* focus target, and the inflicting abilities were already the biggest
   hit there. Budget for that: a capability can be genuinely live and still move nothing.
2. **Charm can hang a battle, and the gate reports a hang as a loss.** Twice this slice a
   charmed body produced a *timeout*, not a defeat: once blocking a corridor nobody would
   clear (traversal), once as the last defender nobody would attack (victory). Both are
   fixed, but any future mechanic that removes a reason to attack a unit can do it again —
   and `outcome: "timeout"` in a gate row looks exactly like a build that merely lost.
3. **`bld-cutpurse` sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).** That is a plateau, not
   slack: 4/6 flat across speeds 8–11 and raw-HP ×0.95…×1.15. It drops out at ×0.90, so
   any content change that effectively lowers HP costs the seventh identity.
4. **Do not make the thief faster or slower without re-measuring.** At raw Speed 7 it
   clears 6/6 with *no* losing matchup — the B5 convergence failure. Its raw Speed is the
   roster's uniform 8 on purpose.
5. **Infliction is still unconditional on a hit.** No status roll (ADR-0010's deferral).
   Adding one is a fidelity change needing a declared slot in `docs/05` §3's roll order —
   and it would change the whole control calculus, since a 100 % charm is what the victory
   rule had to be designed around.
6. **The browser tests are NOT in `npm run check`.** Run `npm run test:visual` too.

---

## What changed that you would not guess

- **There is no `DISABLE` action class, and that is deliberate.** A scaffold for one had
  sat in `ai.ts` since Slice 2. Using it would have made every landable status out-rank
  every attack unconditionally — the bucket-first key `src/sim/CLAUDE.md` bans.
- **Status value is a MECHANISM, not a constant:** turns denied × the target's own swing
  (`attackDamage`, reused not re-derived), marginal over what it already carries, capped
  at its HP. A status the sim does not read scores 0 — that is the half that can come out
  the other way.
- **Victory counts the team a unit FIGHTS FOR** (`condition.ts`). Charming the last
  defender ends the battle; symmetrically, if your last unit is charmed you lose. This is
  the livelock fix, and it is `[UNCERTAIN]` against FFT.
- **Traversal reads allegiance too** (`grid.ts`), because its rule is "enemies block,
  allies pass" — not "bodies block".
- **Schema v9 → v10** (`controlsTarget`, `controlledByTeamId` on every `ActiveStatus`).
  The frozen golden moved by representation only; the diff was classified field-by-field
  before regeneration.
- **`DEFERRED_SKILLSETS` now holds only `battle-skill`.** `steal` is live (heart charms)
  while four of its five actions are not, so the honest unit became the ABILITY —
  `DEFERRED_ACTIONS`, which the prep panel also reads to mark a command "no effect yet".
- **`battle-skill` is still excluded by user decision** (2026-08-16), pending a multi-job
  skill rework. Its blocker is now precise: its breaks inflict *nothing*, so they need
  stat-modifying statuses — the probe already values a status that exists.

## Standing constraints that outlive any one slice

- **Jobs are deprioritised** (user decision). The road to ≥8 runs through **new signature
  prefixes**, not through the EXCLUDED manifest — three of its four entries are
  prefix-collapse cases.
- **The frozen golden is a tripwire, not a maintenance item.** Never regenerate it to make
  a test pass — classify the diff, and expect only representation fields to move.
- **`order: "after"`** (act-then-move) exists in the schema and driver, covered headlessly,
  deliberately unreachable from the UI.
- **The MP contingency is unchanged and still live.** `white-magic.holy` (56 MP off a 24
  budget) and `summon.*` ride unenforced MP; enforcing it would drop the count.
- **`bld-spellblade` is still masked** and buys the count nothing (its prefix collapses
  onto the wizard's).

## Environment facts that cost real time to learn

- **Scratch probes belong outside the tree.** `coverage/` is gitignored; a `vite-node`
  script importing `src/sim/*` is the fastest way to measure the gate. This slice used
  four (gate summary, per-run detail with turn log, ability-usage A/B, HP/speed sweep) and
  they are what caught both livelocks — the summary table alone said only "3/6".
- **Playwright browsers: the sandbox and this Windows box differ.** Chromium at
  `/opt/pw-browsers` is the **Linux sandbox only**; on this host `npx playwright install
  chromium` is what fixes a missing-executable error that reads like a code failure.
- **A bare JSON import breaks ONLY the browser job** — `e2e/play.spec.ts` goes through
  Node's ESM loader, which requires `with { type: "json" }`; Vite does not.
- **Use the check-runs API for CI.** The legacy commit-status endpoint reports
  `pending / total_count: 0` because nothing posts there.
- **The sandbox proxy blocks `/repos/*/pages`, `/environments`, `/deployments` and all
  `*.github.io` egress**, but a *runner* can reach them with `${{ github.token }}`.
- **GitHub auto-merge is NOT enabled** on this repo — watch the checks and merge.

## Pages — RESOLVED 2026-08-12 (first successful deploy on run #23)

`pages.yml` was always correct; runs #1–#22 failed on two sequential *settings*, both
derived from the repository default branch. Two preflights now guard the `build` job, the
second because the first is not sufficient. **An agent can confirm the deployment API
reported success but cannot confirm the page renders** — `*.github.io` is blocked.
