# Slice — the synthetic playtest

**Status:** scoped, not started. **Written:** 2026-08-23.

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

**New:** `src/sim/playtest.ts`, `src/sim/playtest.test.ts`, `scripts/playtest.mts`.

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
`Math.random`, no wall-clock** — `npm run check:rng` covers `src/sim`, and this file is
squarely in it. A persona that broke determinism would make every number here
unreproducible.

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
| A1 | `Persona` type + the three policies, pure and seeded |
| A2 | The runner over `CampaignShell`, seed sweep, `PlaytestReport` |
| A3 | The two assertions above (personas separate; choices reach the unit) |
| A4 | `scripts/playtest.mts` → a readable table; numbers reported to the user |
| B1 | `telemetry.ts` recorder, read-only over the session |
| B2 | The "copy playtest log" control + a test that the log survives a reload |
| — | Retrospective, `docs/NEXT.md` re-stamp, `npm run state` last |
