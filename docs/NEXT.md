<!-- written-against: 8037b13fb86a40b59d180c48d071135b5b924401 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive.

---

## Where things stand

**P2 — customization depth, in progress.** 580 tests / 32 files, 12 Playwright specs.
**Variety score is 7**, release bar 8. `pass=true`, no dominant build.

**Two coverage gaps closed 2026-08-18 (AC-E6, AC-V13).** "Does a battle finish?" was
never asserted anywhere. It does — but the viewer's Victory/Defeat banner had no test at
all, and the benchmark suite only checked that an encounter *ended* (a defeat and a
timeout both satisfy that). Both are covered now, and the measurement that came out of it
is in the traps below: **as authored, the balance probe loses all five shipped encounters
from team 0**, two of them across 200 seeds.

**Progression is now DECIDED (ADR-0021), and it changes what may be built next.** The
question "where do levels and EXP come in?" had no answer: `docs/02` B0's currency table
never listed character Level, so it was neither cut nor reconciled, while B4 and AC-J7
both forbade rewarding "de-leveling" — meaningless unless levels drive growth. Decided:
**level grants zero stats**, **all power moves on an authored schedule the player cannot
accelerate by repetition**, and **equipment is horizontal — no weapon-power ladder**. The
EXP band is written down, DEFERRED, and explicitly aspirational. Read the ADR before
scoping an equipment layer; the second clause is the load-bearing one, not the first.

**All five chassis slots are live.** The customization spine's first axis is complete:
support (ADR-0017), reaction (ADR-0019), movement (ADR-0020). All three were the same
defect — a slot that validates its input and then discards it reads as working.

The last one was not a slot problem. Authoring Move +2 alone dropped the variety score
**7 → 5** and failed the gate. The balance probe priced the *act* it could take from a
tile and never the tile's *exposure*, so low Move had been keeping fragile builds alive by
accident. It shipped together with `exposureOf` in `ai.ts` (AC-E3(d)), never before it.

---

## The next slice — M0, the playable slice (`docs/11`)

**CHOSEN 2026-08-19 (user).** The work moves off the engine backlog and onto making the
game finishable. `docs/11` is the whole-game roadmap; M0 is its MVP: a stranger plays 30–45
minutes and reaches a real ending.

**The variety score (7, bar 8) is explicitly NOT an M0 blocker** — user decision, recorded in
`docs/11` and `docs/08` §1a. `DIVERSITY_TARGET_N` stays 7 and the gate still fails CI on a
drop; only its due date moved, to M1. Do not "just finish the gate first".

M0's seven pieces, in dependency order — the first two are the real work, the rest lean on
what exists:

1. **Campaign container** — sequence 5–6 battles, carry the party across them. Nothing in
   the repo does this today; battles are standalone.
2. **Persistence** — a save file. The substrate is there (`(seed, commands)` replays a
   battle byte-for-byte) but nothing writes, names, or reloads a campaign.
3. **Shell** — title, New Game, Continue, quit. One slot.
4. **Between-battle prep** — route the existing prep screen into the loop.
5. **Story stubs** — battle text as DATA, per the `docs/08` §4 contract. Placeholder prose.
6. **Equipment, minimal** — ADR-0021's horizontal gear, ~8 items, awarded not bought.
   Read ADR-0021 first: a weapon-power ladder is measured to break the TTK band.
7. **Losing + hour-one onboarding.**

AC-M1..M4 are in `docs/11`. Start with 1 and 2 — everything else is cheap once a campaign
can hold state.

### The engine backlog it displaces (still live, now M1)



1. **AI depth beyond "count the threats".** `exposureOf` is one number: how many living
   foes could strike a tile. That is enough to stop the probe suiciding and it improved
   anti-convergence, but it cannot hold a chokepoint, screen a wounded ally, or knowingly
   trade a risky tile for a decisive one. **Watch for stalemates:** two cautious armies can
   decline to engage, and `outcome: "timeout"` reads in a gate row exactly like a loss.
   (Zero timeouts today — that is the number to re-check first.)
2. **Give `bld-spellblade` a chassis.** It is **no longer masked** (ADR-0020) — it casts
   now, and lands `black-magic.` on every map it is in band for. It is honestly sub-viable:
   **3 of 6** reference maps against a floor of 4. A content gap, not an AI one, and much
   smaller than the mask was. It buys the count nothing (its prefix collapses onto
   `bld-arcane-artillery`'s) but it is the clearest under-tuned build left.
3. **Provoke / threat.** Retires `bld-aggro-tank`'s exclusion. Read its **re-measured** tag
   first: it clears 6/6 now that Counter fires — it is blocked from being *distinct*, not
   from being measured.
4. **The eighth identity.** Jobs are deprioritised (user decision), and **no remaining
   EXCLUDED entry can supply a new signature prefix.** Say that out loud before scoping
   anything as "gets us to 8".

### Before you touch `compareCandidate`

It is the most load-bearing function in the repo — every benchmark number and the gate's
verdict key on it. ADR-0020 sets the standard: **sweep a new key's PLACEMENT and report
what each position scored.** Six were measured there; two worked; the one shipped is the
least invasive of them.

---

## Traps waiting for you

1. **A mobility, reach or range grant is not automatically a buff.** It was a *liability*
   until the probe could price a tile. Anything that grants reachable tiles needs the same
   before/after measurement, not an assumption.
2. **An aggregate A/B can read "identical" while a third of the rows moved.** The exposure
   term changed **36 of 108** gauntlet runs on unchanged content while `pass`, `N`,
   `dominantBuilds` and every in-band tally stayed the same. Twice in three slices now.
3. **The spellblade mask is GONE, and the magnitude fact that caused it is NOT.**
   `ttk.test.ts` still asserts borrowed black magic (37) loses to its knight swing (90) —
   that is true and unfixed. The mask lifted because a cautious probe cannot *reach* melee,
   not because the numbers changed. Do not "fix" the magnitude expecting the mask back.
4. **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice** — identical
   gauntlet rows, differing only in raw HP (255 vs 242) and trait order.
5. **`punch-art.` has TWO carriers.** Anything assuming "one credited build per identity"
   is wrong; the gate's per-identity sweep is keyed on the prefix for this reason.
6. **`bld-cutpurse` still sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).**
7. **Hamedo draws the hit roll it then discards** (ADR-0019 decision 5). Deliberate — do
   not optimise it away; it moves every downstream roll.
8. **The browser tests are NOT in `npm run check`.** Run `npm run test:visual` too.
9. **AC-E6 is REACHABILITY, not balance, and the difference matters.** It runs each
   encounter with the opposition passive and requires `victory`. All five pass. Run **as
   authored**, all five end in **defeat** for team 0 — `enc-mixed-company` and
   `enc-behead-the-warlord` lose **200 of 200 seeds**, and in the latter the warlord never
   drops below **86% HP** because nothing in the greedy probe prefers the objective
   target. That is recorded in `docs/06` AC-E6 and deliberately **not** asserted (it would
   freeze a tuning state). Whether it is a content problem or an AI one is open — do not
   assume the first answer.
10. **A WP ladder is NOT a safe way to move stats onto gear — measured, twice.** Holding
    `raw.hp` fixed and raising only the weapon tier, shipped builds outside their
    `docs/07` TTK band go **0/15 → 1/15 → 6/15** at WP 8 → 12 → 16 (at WP 16 every tank
    dies in 2 hits). And it is not uniform: `bareHands` has **no WP term at all**, so a
    monk gains nothing — and 2 of the 7 counted identities are `punch-art.` carriers —
    while `wpWp` is quadratic where `paWp` is linear. Any equipment slice must re-measure
    both before touching a number.
11. **AC-J10 and AC-J11 pass before any work.** `level` and `ap` were already unread, so
    both went green the moment they were written. They are REGRESSION GUARDS and say so;
    the mutations are what prove them (scale `pa` by level → J10 red; add `ap` to `maxHp`
    → J11 red; both run). Do not read their green tick as evidence ADR-0021 is right.
12. **A killing CLICK does not discriminate the "banner a turn late" bug.** The wipe check
    before the advance already sees it. Only a KO landing *during* the advance — a charge
    maturing on the last survivor — reaches the second check. Measured by mutation, not
    reasoned: the first draft of that test claimed the wrong discriminator and was green
    against the mutant.

---

## What changed that you would not guess

- **`exposureOf` is a generous upper bound on purpose** — Chebyshev against `move + weapon
  reach`, no pathing, no occupancy, no height. It is a comparison key, not a displayed
  number, and precision would not change the order.
- **It sits BELOW the focus keys.** AC-E3(b) ("finish the lowest-effective-HP target") is
  untouched; exposure only decides *which tile* the chosen act is made from. Placing it
  above the focus keys also passes the gate but overrides a documented AC.
- **"The AI doesn't have to move" was measured and is WRONG as a rule.** Forcing it to
  stand still scored the same N=5 *and* tripped the dominance ban. The problem was never
  that it moves — it is that it could not tell a safe tile from a dangerous one.
- **Anti-convergence improved as a side effect:** `winsAllInBand` 2 → 1, timeouts 1 → 0.
- **A reaction's reach is the reactor's own basic-attack range**, asked of
  `inAbilityRange`. There is no reaction chain, structurally: the counter-swing resolves
  inline in `tryReaction` and never routes back through `resolveAttack`.
- **Charges are not a reaction site, and the reason is a schema fact**:
  `ChargeEffectSchema.shape.kind` is the literal `"magic"`; a test asserts that literal.
- **The prep dropdowns tag inert equips** with "no effect yet", reading the three DEFERRED
  manifests. The viewer's "not modeled" list is prose in two places (`main.ts`'s hint and
  `docs/10` §4) and nothing type-checks it — grep both when a capability lands.

## Standing constraints that outlive any one slice

- **Jobs are deprioritised** (user decision). The road to ≥8 runs through **new signature
  prefixes**, and the EXCLUDED manifest can no longer supply one.
- **ADR-0021 constrains every future power source.** No stat may scale with a quantity a
  player can farm. An equipment layer is now scoped as HORIZONTAL (formula, range,
  element, resistance, Brave/Faith shifts) — reversing that needs a new ADR, not a slice
  decision. Note the equipment layer itself is a `rosterSchemaVersion` bump + migration +
  a regenerated frozen golden + a re-measured gate: not a small slice.
- **The frozen golden is a tripwire, not a maintenance item.** Never regenerate it to make
  a test pass — classify the diff, and expect only representation fields to move.
- **`order: "after"`** (act-then-move) exists in the schema and driver, covered headlessly,
  deliberately unreachable from the UI.
- **The MP contingency is unchanged and still live.** `white-magic.holy` (56 MP off a 24
  budget) and `summon.*` ride unenforced MP; enforcing it would drop the count.
- **`bld-spellblade` is still masked** and buys the count nothing (its prefix collapses
  onto the wizard's).
- **`battle-skill` is still excluded by user decision** (2026-08-16), pending a multi-job
  skill rework. Its breaks inflict nothing, so they need stat-modifying statuses.
- **`compareCandidate` is the most load-bearing function in the repo.** Every benchmark
  number, every ADR's measurement and the gate's verdict key on it. Changing it is never a
  small slice, and a new key's placement must be swept and reported.

## Environment facts that cost real time to learn

- **Perturb the BASELINE as well as the fix.** ADR-0020's HP sweep only means something
  because the *pre-slice* baseline was swept too and drops at the same step (×0.90). A
  plateau you cannot compare to anything is not evidence.
- **Scratch probes belong outside the tree.** `coverage/` is gitignored; a `vite-node`
  script importing `src/sim/*` is the fastest way to measure the gate. This slice used
  four — gate summary, a stripped-effects A/B over all 96 runs, a single-candidate detail
  table, and a build-level debug — and the **summary one was actively misleading** (trap 1).
- **Never round-trip `data/base-pack.json` through a JSON parser to edit it.** Re-serialising
  reformats the whole file: a two-line change came back as **1181 lines**. Do a surgical
  text replace and check `git diff --stat` says what you expect.
- **Two `npm run test:visual` runs cannot overlap.** They share a preview port and the `visual-artifacts/` tree, so a second concurrent run failed **7 of 12** specs — and the failures read exactly like a real regression (refused clicks, a missing fatal chip, the proof sheet). Run it alone; a red visual suite right after you started one in the background is that, not your change.
- **Playwright browsers: the sandbox and a Windows box differ.** Chromium at
  `/opt/pw-browsers` is the **Linux sandbox only**; elsewhere `npx playwright install
  chromium` fixes a missing-executable error that reads like a code failure.
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
