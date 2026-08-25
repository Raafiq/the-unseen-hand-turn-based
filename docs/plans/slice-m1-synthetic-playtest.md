# Slice — the synthetic playtest

**Status:** Part A (A1–A4) landed 2026-08-24. **B1 landed 2026-08-25 — B2 not started.**
**Written:** 2026-08-23.

**B1** is `src/render/telemetry.ts` plus its wiring in `game.ts`: screens, named actions,
banked battles, and between-battle record edits, all in `localStorage` under
`tuh.playtest.v1`. Two properties carry it. **The module holds no value imports at all**,
so after compilation there is nothing in the game it is *able* to call — "read-only over
the session" is a fact about the build, asserted in `telemetry.test.ts`, not a docstring
promise. And the wiring is proved by an **A/B in the browser** (`e2e/campaign.spec.ts`):
one visit that does nothing against one that plays a battle, asserting named rows that
appear only in the second. A recorder nobody calls is the dead-support-slot shape, and
an aggregate "the log is non-empty" would pass on a page that logged only its own boot.

**Still owed by B2:** the "copy playtest log" control, and a test that the log survives a
real reload (the resume logic is asserted headlessly; the browser half is not).

**A4's gate was reported and acted on.** All three personas cleared the campaign at every
seed, so the funnel in Part B would have instrumented systems that did not decide anything.
The user chose to retune difficulty first — **ADR-0027**.
**Amended 2026-08-24** — four corrections, marked `[AMENDED]` below, all found by reading
the code rather than the docs. The headline one: `CampaignShell` lives in **`src/render`**,
not `src/sim`, so Part A cannot go where this plan first put it.

**One line.** Build a deterministic agent playtest that settles *difficulty and length*,
and instrument the real page so the first human playtest produces data instead of an
anecdote. **It does not settle legibility — nothing but a person can.**

---

## Why this, and why now

`docs/NEXT.md` says the next thing the project needs is a playtest, not a slice. That is
still true for **one** of the two open bets. The two are not equally stuck:

| Open bet | Can an agent settle it? | Why |
|---|---|---|
| **Session length + difficulty** — is a run 30–45 min, is it too hard, is there a wall | **Largely yes** | Agent playthrough performance correlates with human difficulty ratings even when raw skill differs; agent-driven QA is established practice for coverage and bug-finding. |
| **Legibility** — does a newcomer understand the job chassis without being taught | **No** | Expert-inspection methods generate hypotheses, not evidence. Reported cognitive-walkthrough false-positive rates span 5–82%. "Players might find X hard" does not upgrade to "players did". |

We already spent a slice on the second (`docs/plans/learnability-walkthrough-2026-08-23.md`)
and got four real fixes out of it. There is nothing left there that is not a person.

So: take the half that is measurable, and stop treating the whole question as blocked.

---

## Part A — the campaign playtest harness

**New:** `src/render/playtest.ts`, `src/render/playtest.test.ts`, `scripts/playtest.mts`.

**[AMENDED 2026-08-24 — the file moved from `src/sim` to `src/render`.]** `CampaignShell`
and `PrepModel` both live in `src/render`. Both are DOM-free (checked: no `document`, no
`window`, no `HTMLElement` in either), so the harness runs headless either way — but a
file in `src/sim` importing them would be the first sim→render import in the repo and
breaks the locked "sim core is pure and headless" rule. The layering is convention, not
lint-enforced, which is exactly why it is easy to break by accident.

The cost of the move is that **`npm run check:rng` only scans `src/sim`**, so the new file
would sit outside every determinism check. See Determinism below — the fix is one extra
scan, not a weakened rule. The alternative (move `campaign-shell.ts` and `session.ts` into
`src/sim`) is a rename that must land in docs, code and tests together; it is a slice of
its own, not a bolt-on to this one.

### What it is

A **persona** is a deterministic policy over the decisions a *player* makes between
fights — **not** over battle tactics. `ai.ts` (the balance probe) already owns tactics and
must keep owning them; a second tactical AI here would be the "never grow a second
accounting fold" mistake in a new costume.

A persona decides, at each prep screen:

- who deploys (the roster is larger than the deployment slots),
- what to buy with banked AP,
- which job each member sits in, and what fills the five chassis slots,
- which owned weapon each member carries.

### The three personas

| Persona | Deploy | Spend | Equip | Models |
|---|---|---|---|---|
| `naive` | first N in roster order | nothing | never changes the starting weapon | someone who does not realise the prep screen matters |
| `default` | first N | cheapest live option per empty slot | highest raw damage for that body | someone who engages, without a plan |
| `optimizer` | best-contributing N from the last run | toward the member's signature action | per-body best after measuring | someone reading the numbers |

### How it drives the game

Through `CampaignShell` over a memory `SaveSlot` — **the same seam
`campaign-shell.test.ts` already uses**. Not a parallel runner. Battles resolve with
`session.step()`, exactly as the shell's own autoplay helper does today.

**[AMENDED 2026-08-24 — personas drive `PrepModel`, not the sim directly.]** `PrepModel`
(`src/render/prep.ts`) is the DOM-free class the human prep panel drives, and it already
exposes everything a persona needs to decide: `learnRows()` (with `apCost`, `buyable`,
`reason`, `kind`, `deferred`), `weaponOptions()` (with `damage`), `stats()`, `setSlot`,
`setJob`, `setWeapon`, `learn`. A persona that calls `canLearn`/`learnAbility` itself
would be a **second copy of the prep screen's rules**, and the two would drift — and worse,
it would make the harness measure a path no player takes. Driving `PrepModel` makes
"a persona's choices reach the built unit" structurally true instead of separately
asserted. The assertion below stays anyway: structural arguments are not evidence.

**[AMENDED 2026-08-24 — how the seed sweep actually works.]** A battle's seed comes from
its **encounter file** (`data/campaign/encounters/*.json`, currently 20260901–20260905),
not from the save or the shell, so there is no seed parameter to sweep. `ShellOptions.encounters`
is `Readonly<Record<string, unknown>>` — raw defs, parsed inside — so the runner sweeps by
handing the shell a **copy of the encounter map with `seed` overridden per run**. No
production change needed. Do not add a seed argument to the shell for this.

### What it reports

`PlaytestReport`, per persona × seed:

| Metric | The question | What "no finding" looks like |
|---|---|---|
| outcome + retries per battle | is there a difficulty **spike** | a flat profile — every battle clears first try |
| `turns`, `ticks`, ending HP margin | is a fight **decided** or a squeaker | wide margins everywhere |
| decision count | proxy for **session length** | — |
| chassis slots filled, weapons equipped, AP left unspent at the end | does a player ever **touch** the systems | high unspent AP = the economy is inert |
| `abilityUsage` | do the signature abilities actually **appear** | — |

### The assertion that makes it evidence

**The three personas must produce different outcomes.** If `naive` and `optimizer` clear
the campaign identically, the meta systems do not matter — and that is the headline
finding, not a broken harness. So the test asserts the spread is non-zero *and* names it,
per `CLAUDE.md`: a fixture whose job is to separate A from B must be shown to separate
them.

Second assertion, the one that stops this becoming a vanity metric: **a persona's choices
must reach the built unit.** Same A/B-on-the-built-object rule that caught the dead
support slot — construct the same run with the persona's purchases applied and withheld,
and assert the reports differ. A policy that computes a plan and never applies it reads
exactly like one that works.

### Determinism

Persona choices are pure functions of save state, or draw from the seeded PRNG. **No
`Math.random`, no wall-clock.** A persona that broke determinism would make every number
here unreproducible.

**[AMENDED 2026-08-24 — the guard does not cover this file for free.]** `npm run check:rng`
runs `check-rng.sh src/sim` and takes **one** path. With `playtest.ts` in `src/render`, it
is scanned by nothing. Add a second scan of the file itself in the same commit that creates
it:

```
"check:rng": "bash .claude/skills/sim-determinism-guard/scripts/check-rng.sh src/sim && bash .claude/skills/sim-determinism-guard/scripts/check-rng.sh src/render/playtest.ts"
```

Scanning the whole of `src/render` is wrong — `iso.ts` legitimately uses wall-clock for
animation. The narrow scan says exactly what is meant: *this* file is sim-grade.
Consequence to accept: the scan is pinned to a path, so **renaming or splitting
`playtest.ts` silently un-guards it**. Keep the harness in one file, or update the script
in the same slice.

---

## Part B — the playtest log in the browser

**New:** `src/render/telemetry.ts`, a control on the ending and title screens.

Records what a real session generates, so the first human playtest yields a funnel rather
than "it was fine, I think":

- time to first action on each screen, and per-screen dwell,
- per-battle outcome, retries, turns,
- what was bought, equipped, and deployed,
- **where they stopped**, which is the single most valuable row and the one an
  after-the-fact conversation never recovers.

Stored in `localStorage` under its own key. A **"copy playtest log"** button puts JSON on
the clipboard — no backend, no network, no personal data. The playtester clicks once and
pastes it back.

**Constraints.** Wall-clock is legal in `src/render` (the `iso.ts` animation precedent) but
**nothing derived from it may enter `BattleState`**, and telemetry is strictly read-only
over the session — it observes, it never feeds back. `session.ts` is state-bearing and
must stay hand-checkable.

**This is not a substitute for a playtest.** It is what makes the playtest we cannot
automate worth more when it happens.

---

## What this slice explicitly does NOT establish

Stated here so no future session cites the green suite as if it settled the question.

1. **Legibility.** No agent can tell you whether a newcomer understands the five-slot
   chassis. `docs/11` AC-M6 asserts the help panel's *claims are deliverable*; it says
   nothing about whether the game reads on its own (`docs/NEXT.md` trap 4).
2. **Absolute difficulty.** Agent skill is not human skill. The evidence supports reading
   these numbers as **relative** — battle 3 against battle 1, `naive` against `optimizer`
   — never as "60% of humans will win this".
3. **Fun.** Not measurable here, and not claimed.
4. **Real session length.** Decision count is a proxy. Converting it to minutes needs a
   seconds-per-decision constant, which is **MVP-provisional** like every other number in
   ADR-0025/0026 — Part B's wall-clock is what eventually replaces it.

---

## Landmines

1. **The probe plays the player's units too.** Persona differences reach the outcome only
   through the **build**, never through tactics. A player who would have positioned more
   carefully cannot be modelled here. This bounds what Part A can ever say.
2. **A flat result is a finding, not a failure.** If difficulty does not rise across the
   five battles, that is the answer. Do not tune the harness until it produces a curve.
3. **`npm run state` counts named directories.** A new script or content directory is
   invisible until wired in. Regenerate it as the **last** step and commit the result.
4. **Do not round-trip `data/base-pack.json` through a JSON parser** if a persona needs
   pack edits — it reformats the whole file.
5. **Scratch probes go in `coverage/`** (gitignored), not `/tmp` — `vite-node` resolves
   imports against the Vite root.
6. **A stale `dist` fails a browser test that is fine.** Part B touches the page; rebuild
   with `npm run test:visual` before believing a Playwright failure.

---

## Order of work

**Part A first, and report its numbers before starting Part B.** If Part A shows the
personas do not separate, Part B's priority changes — instrumenting a funnel through
systems that do not matter is the wrong next move.

| Step | Deliverable |
|---|---|
| A1 | `Persona` type + the three policies, pure and seeded, driving `PrepModel` |
| A2 | The runner over `CampaignShell`, seed sweep by encounter-def override, `PlaytestReport` |
| A3 | The two assertions above (personas separate; choices reach the unit) |
| A4 | `scripts/playtest.mts` → a readable table; numbers reported to the user |
| B1 | `telemetry.ts` recorder, read-only over the session |
| B2 | The "copy playtest log" control + a test that the log survives a reload |
| — | Retrospective, `docs/NEXT.md` re-stamp, `npm run state` last |
