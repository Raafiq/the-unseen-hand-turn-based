# ADR-0046 — Enemy turns run themselves: the enemy's turn starting is the trigger; a pause sets only when the action is shown

- **Status:** Accepted — the owner, 2026-09-19, in words ("approved, proceed"), after two
  corrections recorded below: no button at all, and the trigger is the enemy's turn starting.
- **Date:** 2026-09-19
- **Deciders:** the owner asked for the outcome (2026-09-12: "make it such that enemy auto
  acts without player having to click a button", paced by a ×1 / ×2 / ×3 speed toggle).
  The mechanism below is the proposal.
- **Amends:** `docs/10` §3 (the "no auto-resolve, deliberately" note and the phase-aware
  button rule), ADR-0032 decision 1's surviving prohibition, root `CLAUDE.md` and
  `src/render/CLAUDE.md`'s "AI turns advance on an explicit Step" sentences. Each is
  rewritten in the same slice, not left to rot (`docs/INTENT.md`, THE NEXT SLICE).
- **Promotes:** the speed toggle from P3 (`docs/08` §1) into this slice.
- **Acceptance Criteria:** **AC-V68 and AC-V69**, authored into `docs/10` in the same
  slice as the code (`src/render/pacer.ts`, `pacer.test.ts`, `e2e/pacer.spec.ts`). (AC-V66 is ADR-0043's; AC-V67 is already
  cited by `src/render/viewer-api.ts`.) `docs/10` outranks this file where they disagree.

## Context

An enemy turn today waits for a tap. `Session.step()` (`src/render/session.ts`) is the
only way an `AI_TURN` advances, and the primary button relabels to "Enemy turn ▸" to call
it. With six on each side that is six interruptions a round, and the owner has said no.

The written rule that forbids the obvious fix appears in four places, all saying the same
thing:

| Site | The rule today |
|---|---|
| `docs/10` §3, note under the phase table | "An AI turn advances only on Step — there is no auto-resolve, deliberately. A wall-clock timer racing with an explicit step would make 'how many commands have been applied by now' a function of elapsed time … A paced auto-advance would need an epoch guard and is not in this slice." |
| `docs/10` §3, the phase-aware button | "a wall-clock timer must never advance it, or command count becomes a function of elapsed time" |
| ADR-0032 decision 1 | "The prohibition that survives is `docs/10` §3's: a wall-clock timer must never auto-advance a step" |
| root `CLAUDE.md`, `src/render/CLAUDE.md` | `session.ts` is clean because "AI turns advance on an explicit Step, so 'how many commands so far' is never a function of elapsed time" |

The rule underneath them does **not** change and never mentioned Step: `docs/05` §3 and
ADR-0004 — one seeded PRNG, no wall-clock in the sim, state is a function of
`(seed, commands)` alone. `docs/10` §8 already permits wall-clock in `src/render/**` for
pacing, provided nothing derived from it reaches `BattleState`. The four sentences above
were a *viewer* discipline chosen to make the sim rule easy to keep: if nothing in the
viewer owns a timer, nothing can race. That discipline is what this ADR replaces with a
narrower one.

What the sentences were guarding against is precise: a timer that runs steps **by elapsed
time** — "it has been 2 s, so run however many steps fit" — makes the log depend on the
machine. A machine that stalls mid-turn, a backgrounded tab, or a faster device would
each produce a different command log from the same seed, and `replay(seed, log)` (AC-V9)
would no longer describe what the player saw.

## Options considered

1. **Keep Step; make it easier to hit.** Honest about the rule, ignores the owner's words.
   Rejected.
2. **A `setTimeout` inside `Session`.** The session gains a clock and the exact race the
   rule names; `check:rng` does not scan `session.ts`, so the regression would be invisible
   to the guard. Rejected.
3. **Resolve the whole enemy round synchronously, then play it back on a timer.** Two
   timelines — the sim's and the playback's — and nothing today to play back: every action
   resolves instantly and ADR-0032's motion is cosmetic catch-up, not a queue. It also makes
   "what is the state now" ambiguous while playback runs. Rejected for this slice; not ruled
   out for a future animation slice.
4. **A pacer outside the Session that triggers exactly one `step()` per enemy decision,
   guarded by an epoch.** The event decides *that* one action follows; the pause decides only *when* it shows, never *whether* or
   *how many*. **Chosen.**

## Decision

### 1. The rule, restated `[ENHANCEMENT]`

**Today:** an AI turn advances only on an explicit Step; a wall-clock timer must never
auto-advance a step.

**Becomes:** an AI turn advances only through `Session.step()`, and **the trigger is the
enemy's turn starting** (owner, 2026-09-19: "rather than timer, it's when the enemy turn
starts"). No tap, no clock and no elapsed time starts an enemy action: the session entering
`AI_TURN` is the one event that does. The speed toggle sets a **pause** between that event
and the action being shown, and the pause may be zero. Three prohibitions carry the weight:

- **One trigger, one action.** Each time an enemy's turn starts, exactly one `step()`
  follows. If the pause runs late — a stalled machine, a backgrounded tab — it is still one
  step; the next enemy's turn starting is the next trigger. Elapsed time never buys extra
  steps.
- **Never count.** Nothing outside the sim knows how many enemy actions remain in the round,
  and nothing loops. The next action happens only because the next enemy turn *started*.
- **Never reach the sim.** The trigger, the speed and the pause touch no `BattleState`, no
  seeded roll, no command payload. `replay(seed, log)` stays the whole story.

The invariant that survives, stated so a test can fail it: **the command log is
byte-identical whether the enemy acted on its turn starting, a test tapped, or `autoplay`
looped — at any speed, with any pause, on any machine, including one that stalls
mid-turn.**

### 2. The mechanism `[ENHANCEMENT]`

A `Pacer` in a new module, `src/render/pacer.ts`, listens for **one event: the session
entering `AI_TURN`**. It is **clock-free by construction**: it receives a scheduler
`{ schedule(fn, ms): cancel }` from `game.ts` and reads no clock of its own — the same
injection `MotionDirector` uses for `now`. `session.ts` stays as it is.

- When an enemy's turn starts, the pacer records an **epoch**: the command log's length and
  the active unit's id. It schedules **one** `step()` after `pause(speed)` ms. With a pause
  of zero the step runs at once, on the same tick the turn started.
- When the scheduled step comes due, it checks the epoch. Still `AI_TURN`, same log length,
  same unit: it calls `session.step()` **once**. Anything else — the battle ended, a rewind
  or quit moved the session — makes it stale, and a stale one is a no-op.
- Every commit or advance that changes the log invalidates the pending step. Nothing has to
  remember to cancel; the epoch does the remembering.
- **The button goes (owner, 2026-09-19: "there is no button that needs pressing").** In
  `AI_TURN` the whole command ribbon is hidden (owner, 2026-09-19: "hide the list of
  action buttons that's only used for players") and one line, "The enemy is acting…",
  takes its slot so the plates keep their place; the enemy's turn starting is the only
  thing that advances an enemy action, and `docs/10` §3's worry that the stage "has no control at all during the
  enemy's turn" is answered by the enemy's turn running itself. `Session.step()` and the
  `GameApi.step` seam stay, for tests and watch mode only. Whether a tap on the board
  *shortens* the pause is a **presentation choice, rendered before it is asked**
  (`docs/INTENT.md`), not settled here; the mechanism is safe either way, because a tap
  would be the same single `step()` and would make the pending fire stale.
- **Watch mode and `autoplay` are untouched.** They loop `step()` synchronously with no
  pacer, which is what keeps them a deterministic baseline for Playwright.

### 3. The speed toggle `[ENHANCEMENT]`

- Three settings, ×1 / ×2 / ×3. `pause(speed) = BASE_MS / speed`.
- `BASE_MS` — the owner's "appropriate pause" (2026-09-12), which may be **zero** — is
  **unset and aspirational** in this ADR.
  It is a feel decision: `art-director` puts two or three values in front of the owner
  running in the real game, and the chosen number lands in `docs/10` with AC-V69. A number
  written here without a frame behind it would be a guess dressed as a rule.
- The setting lives with the **viewer's device preferences** (`storage.ts`, `localStorage`),
  not in the campaign save and never in `BattleState`. It is "how fast this phone shows me
  the enemy", not a fact about the run. Changing it mid-pause re-schedules the pending step with
  the new duration under the same epoch.
- **Honest scope:** today the multiplier scales the AI pause and nothing else, because every
  action resolves instantly. It is built now so it becomes the one dial any future motion
  reads. Nothing about walking, swings or casts is green-lit by this.

### 4. Reduced motion and the speed toggle are independent `[ENHANCEMENT]`

`prefers-reduced-motion` keeps governing ADR-0032's board animation and nothing more. The
pacer ignores `matchMedia`. A pause between enemy actions is reading time, not motion; a
vestibular preference says nothing about how fast a player reads, and collapsing the pause
to zero under it would turn the enemy round into a flash — the opposite of accessible.
The alternative (reduced motion forces ×1) was rejected because it silently takes the
toggle away from the players most likely to have set it deliberately.

### 5. The guard grows `[ENHANCEMENT]`

`npm run check:rng` adds `src/render/session.ts` and `src/render/pacer.ts` to its file
list. Both must stay free of `Date.now`, `performance.now` and timers; the real `setTimeout`
is supplied by `game.ts` / `main.ts` only. The A/B in AC-V68 is the check that can come out
the other way; the grep is the tripwire.

## Constraints / Acceptance Criteria (reserved, to be authored into `docs/10`)

**AC-V68 (the pacer cannot change the log)** `[ENHANCEMENT]`: for one seeded battle, the
command log produced by (a) the synchronous `autoplay` loop SHALL be byte-identical to the
log produced by (b) the pacer under an injected fake scheduler at **each** of ×1, ×2 and
×3, (c) the pacer under a scheduler that fires late and out of order (a stalled machine),
and (d) a run where a Step tap lands inside a pause. *Discriminator:* the fake scheduler
SHALL record at least one fire the epoch guard dropped as stale in (c) and (d), and the
test SHALL assert that count is ≥1 — a fixture in which no fire is ever stale passes an
unguarded pacer too. *Mutation:* a pacer that runs two steps on one late fire, or one that
skips the epoch check, produces a longer log in (c) or (d) and fails.

**AC-V69 (the speed toggle is a viewer preference)** `[ENHANCEMENT]`: the setting SHALL
persist across a reload, SHALL survive a new campaign, SHALL appear nowhere in the
campaign save or `BattleState` (asserted against the schemas, not by inspection), and
`pause(×2)` and `pause(×3)` SHALL be exactly half and one third of `pause(×1)`. The value of
`pause(×1)` is the owner's, from rendered options, and is written here when chosen.

## Consequences

- **Six taps a round become none, and the player's commands leave the band.** The player's turn ends and the
  enemy round plays at the speed they chose. The ☰ menu's watch-mode entry stays as a
  shortcut past the pause — a shipped feature (`docs/10` §7), not a control the turn needs.
- **Four sentences in the record are rewritten in the same slice:** `docs/10` §3 (both
  sites), ADR-0032 decision 1 (an amendment note pointing here, body intact), root
  `CLAUDE.md` line "AI turns advance on an explicit Step", `src/render/CLAUDE.md` line 14.
  `docs/08` §1 loses "speed toggle" from P3.
- **What we give up:** `AI_TURN` is no longer a phase that holds still. A browser spec that
  pauses inside an enemy turn now races a real timer. Every Playwright capture that lands
  in `AI_TURN` must either drive `autoplay` or run with the pacer's scheduler stubbed;
  `e2e/stage-capture.spec.ts` is the first place to look. This is a landmine, and it goes in
  `docs/INTENT.md`'s list.
- **A new clock-owning module in `src/render`** — the second after `motion.ts`. The
  discipline is the same: the clock is injected, sampled by the page, never read inside.
- **Not decided here, on purpose:** the ×1 pause in milliseconds, whether a board tap skips
  the pause, and whether back-to-back enemies get a shorter beat. All three are feel
  decisions and are rendered before they are asked.

## References

- `docs/INTENT.md`, THE NEXT SLICE — the owner's words and the A/B this ADR turns into AC-V68.
- `docs/05` §3, ADR-0004 — the sim rule that does not change.
- `docs/10` §3, §7, §8 — the viewer rule that does, watch mode, and the wall-clock permission.
- ADR-0032 — the first clock in `src/render`, the injection pattern, reduced motion.
- `src/render/session.ts` `step()`, `src/render/game.ts` `autoplay`, `src/render/motion.ts`.
