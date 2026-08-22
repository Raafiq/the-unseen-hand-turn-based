# `src/render/` — the thin viewer

Rules that apply while **editing viewer code**. The root `CLAUDE.md` still governs; this
file holds what only matters in here. `README.md` next to this file describes what each
module *is* — this one says what you must not break.

**`docs/10-viewer-and-interaction.md` is the authoritative spec** and outranks both this
file and any ADR that contradicts it (AC-V1 … AC-V11).

## The two directional rules

- **Render imports sim, never the reverse** (ADR-0007). The sim has zero render deps, which
  is what keeps it deterministic and unit-testable.
- **Player input is a command SOURCE, not a parallel engine.** A human clicking a tile and
  the balance-probe AI choosing one produce the same `Command`, through the same
  `applyCommand`, into the same replayable log — that is why player battles inherit rewind,
  save and build-sharing for free. `advanceToDecision` is the single "who acts next"
  primitive shared with the headless harness, so the two cannot diverge. **The sim owns
  legality**: ask `moveRange` / `inAbilityRange` / the equipped `unit.abilities` projection;
  never re-derive reachability with a radius or Manhattan check.

## Determinism still applies here

`npm run check:rng` only scans `src/sim`, but **`session.ts` is state-bearing** — it emits
the command log — so it must be hand-checked. It is currently clean: no wall-clock, no
timers, and AI turns advance on an explicit **Step** rather than a racing timer, precisely
so "how many commands have been applied by now" is never a function of elapsed time.
`main.ts` and `iso.ts` may use wall-clock for animation pacing; nothing derived from it may
enter `BattleState`.

- **Never preview by resolving.** `resolveAttack` consumes the seeded stream. `preview.ts`
  deliberately does not *import* the resolvers or `applyCommand` at all, so the two ways to
  break preview purity are unreachable rather than merely avoided (AC-V6).
- **Never speculatively `applyCommand` and discard** — it advances the clock and can mature
  a charge.
- **Exactly one tile-driven mutator.** `pointerdown`, keyboard Enter, `clickTile` and
  `clickCanvas` all bottom out in `Session.onPick`; `clickCanvas` adds exactly one thing over
  `clickTile` — `pickTile`. That is what makes the test seam provably the path a real click
  takes rather than parallel logic that drifts.

## Two traps the shell sets, both earned

- **A screen the state machine SKIPS has content nobody can reach.** Winning the LAST
  battle goes straight to `COMPLETED` and never passes through `AFTER_BATTLE`, so the
  final victory's story beat was unreadable until the ending screen rendered it too — one
  scene in the pack a player could never see, with every per-battle test green. When you
  add anything to a screen here, enumerate the **transitions**, not the states:
  `concludeBattle` branches on status, `continueGame` lands on three different screens,
  and a loss on the last battle still goes to `AFTER_BATTLE`. Asserted in
  `campaign-shell.test.ts`, mutation-verified.
- **A sim docstring that delegates a rule to "the caller" is an obligation nobody is told
  about.** `changeJob` says "the caller/UI picks from unlocked jobs" and validates
  nothing, which made `secondary === currentJob` reachable through the back door — exactly
  the state `setLoadoutSlot` refuses to create, and one that throws nowhere downstream.
  The caller owes a test. And **ask first whether a schema can see both fields**: a
  refinement on `UnitRecordSchema` tells every codec boundary forever, where a docstring
  told nobody.

## Honesty rules the UI must hold (pillar 4)

- **Unmodeled things are ABSENT, never shown as zero.** Crit, reactions, status-on-hit,
  elemental, AoE spread and LoS are deferred (ADR-0010); printing "Crit 0%" would assert a
  modeled zero the engine cannot back up. `exactOptionalPropertyTypes` is on — keep those
  fields genuinely absent from the type so the compiler enforces it.
- **Never render a state the sim did not produce.** The demo once applied a scripted Slow
  purely in the render layer, asserting a status the sim never inflicts; it was removed.
  Damage popups are derived by *diffing HP* across a transition, so a popup can only report
  a change the sim actually made.
- **The timeline splits at an honesty boundary.** `forecast()` cannot know what a future
  actor will *choose*, so it guesses once (`ASSUMED_FUTURE_TURN_COST` = −80). Slots below
  `Forecast.assumedFrom` are fact; from it on they are projections and must render as such.
  `assumedFrom` is computed at the *cheapest* legal turn (−60) so it is a lower bound and
  never overclaims. **When `ai.ts` learns the move+act fold, this assumption breaks** —
  `forecast.test.ts` is the oracle that will go red rather than let the UI lie quietly.
- **When a deferred capability SHIPS, the absent row becomes a lie — go un-hide it.** The
  rule is "never assert an effect the engine cannot back up", not "these keys stay hidden".
  `preview.ts` correctly omitted `inflicts` while status-on-hit was unmodeled, and
  `session.test.ts` asserted the key was *absent*. The moment the resolvers began applying
  it, that same omission started hiding a Stop from a player about to commit the shot —
  same rule, opposite verdict, because the engine moved. **Any slice that implements a
  deferred effect owes a pass over the banned-key list**, and the new row needs a test
  tying what the panel promises to what the sim actually does (not just that the key
  exists).
- **A battle with RULES is judged by `evalTerminal`; only a conditionless one may count
  corpses.** `Session` ships both reads (ADR-0023). The team-wipe read is not a rule the
  sim models — it is the most a battle with no `Condition` can honestly support, and it
  is *wrong* for any authored encounter, where victory may be one named foe or a survival
  clock. When you touch that branch, the discriminating fixture is a `defeatUnit` victory
  with a second foe still alive: a wipe-counting viewer and `evalTerminal` give opposite
  answers there. A fixture whose victory is "wipe team 1" passes under either and
  certifies nothing.
- **The viewer must never grow its own accounting.** `Session.report()` is assembled from
  `harness.ts`'s exported fold (`seedContributions` / `accountEvents` / `assembleReport`),
  because the campaign's AP grant reads `contributionByUnit[…].landedActions`. A second
  fold here would pay a human differently from the probe for an identical battle, and both
  would look correct alone. The check is the A/B in `session.test.ts`: a probe-driven
  session's report is byte-compared to `runFromState`'s. Keep it that way.
- **`pickTile` is not an algebraic inverse.** Per-tile height shifts a tile's screen position
  and taller tiles occlude those behind, so it walks reverse painter's order. A naive inverse
  picks the wrong tile on any raised terrain.

## Testing

The turn state machine lives in a **DOM-free `session.ts`** constructible over an arbitrary
`BattleState` — that is what lets legality tests build purpose-built grids instead of hoping
the demo map discriminates (it frequently does not; see the root's evidence principle).
Interaction tests drive the grid-coordinate seam, never raw canvas pixels — exactly one
assertion (AC-V10) covers the pointer→tile mapping.

**When you cannot INJECT a fixture, DISCOVER it.** The root `CLAUDE.md` says prefer
purpose-built fixtures over shipped demo content — but `e2e/*.spec.ts` drives the real
page, which mounts `makeDemoBattle()`, so there is nothing to inject and that advice is
unreachable there. Hard-coded tiles in those specs were invalidated by demo drift **four
times**, each fix writing down new coordinates that rotted the same way, and the file's own
comment predicted the next break. Instead ask the board, through the shipped seam, for
something with the property under test — `findArcPair` in `play.spec.ts` walks unoccupied
tiles, stages each (staging is pure, AC-V6; an illegal stage is refused, so `moveRange`
does the filtering) and returns any foe reachable from two tiles in **different facing
arcs with the same ability**. Then assert the discovery succeeded and that the two cases
genuinely differ: a discovered fixture can degenerate too, and the first version of that
helper returned two tiles that selected *different* abilities, which would have blamed the
arc for an ability difference.

**The shell has its own headless suite, and the browser spec must not duplicate it.**
`campaign-shell.test.ts` drives the whole run — title, deploy, fight, bank, retry — over a
memory slot. `e2e/campaign.spec.ts` exists for the half only a browser can prove: that the
page mounts, that the screens swap, and that the save survives a real **reload**. Every
persistence assertion in the headless file passes against an in-memory slot whether or not
the `localStorage` wiring works, so the reload is the load-bearing one.

`npm run test:visual` (build + Playwright). In the **Linux sandbox** Chromium is
pre-installed at `/opt/pw-browsers` — never run `playwright install` there. On a **Windows
host** it may genuinely be missing, or be the wrong build number: every spec then fails
with "Executable doesn't exist", which reads like a code failure and is not. Check the
requested build against `~/AppData/Local/ms-playwright/` before believing it.
