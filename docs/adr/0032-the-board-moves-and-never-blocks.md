# ADR-0032 — The board moves, and the motion never blocks

- **Status:** Accepted
- **Date:** 2026-09-01
- **Deciders:** the owner, from four rendered options by `art-director`.
- **Supersedes:** nothing. Extends ADR-0030 (the painted ground) and ADR-0007 (the render
  layer owns the look). Constrained by `docs/10` §3 and §8.

> **No Acceptance Criteria yet.** The implementation is in flight in parallel. ACs land in
> a second pass, written against what is actually asserted — not against this prose.

## Context

The battle board is still. A hit produces a numeral and nothing else: no recoil, no flash,
no drain on the HP bar, no acknowledgement from the attacker. Turn changes are legible only
from the ring and the timeline.

**Option A was never a neutral status quo — it leaves a live defect on screen.** The damage
numeral is drawn at the tile top minus 40px in 20px bold; the unit's HP bar sits in the band
from minus 44 to minus 40. The numeral lands on the bar. It is cleared only when the next
command commits (`session.ts` reassigns `popups` in `transitionPopups`), so a target's health
is unreadable from the blow until the next action. Nothing expires it.

Cost across a campaign was measured, not guessed: under the balance probe the five battles
run **82 turns** and land **54 blows**. Those figures assume motion blocks. It does not, so
they are an **upper bound**.

## Options considered

| | What moves | Campaign cost | Why not |
|---|---|---|---|
| A (control) | nothing | 0 s | leaves the numeral-over-HP-bar defect standing |
| **B — chosen** | target recoils + flashes, HP drains behind a pale tail, attacker leans, ring sweeps in, name plate | ~58 s | — |
| C | the numeral only | ~17 s | fixes the hidden HP bar and adds no feedback; nothing on the board acknowledges the blow |
| D | screen shake + full-width "YOUR TURN" banner | ~97 s | the banner covers a row of the diorama and one of the player's own units, and re-introduces the slate blue ADR-0030 removed. It is also **Fire Emblem's phase model, not FFT's** |

All four were rendered before the call, per the root rule that an appearance decision is
unanswerable in prose.

## Decision

**Option B, non-blocking, with a ~700 ms name-plate hold.** Five pieces of feedback: target
recoil and flash, an HP drain trailing a pale tail, an attacker lean, a ring that sweeps in,
and a name plate on the unit whose turn it is.

Six properties are part of the decision, not implementation detail:

1. **Non-blocking is the core of it.** State advances immediately on commit. The animation is
   cosmetic catch-up over a result that already happened. Input is never gated, no new phase
   narrows `accepting()`, and `autoplay` keeps looping steps synchronously. The prohibition
   that survives is `docs/10` §3's: **a wall-clock timer must never auto-advance a step**, or
   command count becomes a function of elapsed time. `docs/10` §8 already permits wall-clock
   for pacing so long as nothing derived from it reaches `BattleState`.
2. **`draw()` stays pure.** Animation phase arrives as a `DrawOptions` field; the page samples
   the clock and passes the value in. No clock read inside `draw`. A frame stays reproducible
   from `(state, opts)`.
3. **The render layer animates the events the sim already emits** — `applied.event` and
   `applied.reactionEvents`, today computed and handed to `accountEvents` and otherwise
   discarded. It re-derives no outcome and no path. This is the standing "no second opinion in
   `src/render`" rule applied to motion.
4. **This is the first frame loop in `src/render`, and the first clock on the drawing path.**
   `telemetry.ts` already samples `Date.now` for dwell measurement, but it is write-only and
   touches no frame; nothing on the drawing path has owned a clock before.
5. **Reduced motion is honoured by a `matchMedia` branch** that jumps straight to the settled
   frame. `index.html`'s single `prefers-reduced-motion` query governs CSS transitions on
   buttons and cannot reach a canvas.
6. **`scene.ts` is untouched.** The scene player's reveal stays untimed and AC-V16's
   "nothing to reduce" assertions stand unchanged.

## Why not D, on the mechanism

D's banner is Fire Emblem's phase model. FFT hands turns per unit off the CT clock and shows
no phase banner, so a full-width "YOUR TURN" states a rule this game does not have.

**That mechanism claim is `[UNCERTAIN]`.** It is `art-director`'s expert recollection.
`ffhacktics.com` and `finalfantasy.fandom.com` are 403 through this sandbox's proxy and
confirmed nothing. D was rejected on three independent grounds — occlusion of the diorama and
a player unit, the return of the slate blue, and the cost — each of which stands without the
FFT claim. Do not read this paragraph as verified.

## Consequences

- **The HP bar becomes readable during a battle**, which C would also have delivered and A
  would not.
- **Nothing automated measures the canvas, so no check covers whether any of this is
  legible.** `contrast.spec.ts` measures DOM text; the battlefield is pixels. Whether a
  recoil reads as a recoil, whether the drain tail is visible over five painted grounds, and
  whether the name plate is findable are all unmeasured. That gap is inherited from ADR-0030,
  not created here, and this slice widens what sits inside it.
- **The ~58 s figure is a ceiling nobody has felt.** It assumes blocking motion, which was
  rejected; the real cost to a player is smaller and unmeasured. Nobody has played it.
- **A clock on the drawing path is a new failure surface.** Every browser assertion that
  screenshots the board can now catch a mid-animation frame. The determinism invariant is
  unaffected — state is still a function of `(seed, commands)` — but visual baselines are not.
- **`~700 ms` and `~58 s` are numbers in prose that no test asserts.** Until the AC pass they
  are **explicitly aspirational**. If the second pass cannot assert the hold duration, it says
  so rather than leaving the number reading as a spec.
- **`src/render/CLAUDE.md` says any motion in this layer must grow `index.html`'s
  reduced-motion query and rewrite AC-V16.** That was written about the scene player. Canvas
  motion is a different surface, and the implementation slice should narrow that sentence to
  the scene rather than leave it reading as a prohibition it never was.

## References

- `docs/10` §3 (the phase table and the no-auto-advance rule), §8 (wall-clock is allowed for
  pacing, never into state), AC-V16.
- ADR-0030 (painted ground; the canvas is unmeasured), ADR-0029 (the untimed scene reveal).
- `src/render/iso.ts` (`DrawOptions`, `DamagePopup`, `drawUnit`), `src/render/session.ts`
  (`accepting`, `transitionPopups`, `applied.event` / `applied.reactionEvents`).
