# ADR-0032 — The board moves, and the motion never blocks

- **Status:** Accepted — **amended 2026-09-01** (see the Amendment at the end). Option B's
  motion stands; the damage numeral's placement is reversed.
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

> **[PARTLY SUPERSEDED — 2026-09-01. See the Amendment.]** The overlap is not a defect.
> The missing expiry is.

~~**Option A was never a neutral status quo — it leaves a live defect on screen.** The damage
numeral is drawn at the tile top minus 40px in 20px bold; the unit's HP bar sits in the band
from minus 44 to minus 40. The numeral lands on the bar.~~ It is cleared only when the next
command commits (`session.ts` reassigns `popups` in `transitionPopups`), so a target's health
is unreadable from the blow until the next action. Nothing expires it. **That last part
stands. The amendment fixes it with a duration instead of a displacement.**

Cost across a campaign was measured, not guessed: under the balance probe the five battles
run **82 turns** and land **54 blows**. Those figures assume motion blocks. It does not, so
they are an **upper bound**.

## Options considered

| | What moves | Campaign cost | Why not |
|---|---|---|---|
| A (control) | nothing | 0 s | ~~leaves the numeral-over-HP-bar defect standing~~ **[reason superseded 2026-09-01]** leaves the numeral standing with nothing to expire it. Row A stays rejected: nothing on the board acknowledges a blow |
| **B — chosen** | target recoils + flashes, HP drains behind a pale tail, attacker leans, ring sweeps in, name plate | ~58 s | — |
| C | the numeral only | ~17 s | ~~fixes the hidden HP bar and~~ **[2026-09-01: nothing needed fixing about the overlap]** adds no feedback; nothing on the board acknowledges the blow |
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
  would not. **[REFRAMED 2026-09-01 — see the Amendment.]** It stays true, by a different
  mechanism: the numeral now **expires** rather than moving out of the bar's way.
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
- ~~**`~700 ms` and `~58 s` are numbers in prose that no test asserts.**~~ **[CORRECTED
  2026-09-01 — `~700 ms` is now partly asserted; see the Amendment's last section.]** `~58 s`
  is still unasserted. Until the AC pass these numbers are **explicitly aspirational**. If the
  second pass cannot assert the hold duration, it says so rather than leaving the number
  reading as a spec.
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

## Amendment (2026-09-01) — the numeral goes back on the head, and the HP bar was our constraint

**The owner reversed the numeral's placement after watching real Final Fantasy Tactics
footage.** The numeral returns to the struck unit's head, overlap allowed. `HEADROOM` goes
back to 54 and every board gets its area back. Option B's motion — recoil, flash, drain,
lean, ring sweep, name plate — is unchanged, and so is every property in the Decision above.

**Two option sets collide, so name them.** This is **placement option A** from the
popup-placement harness: numeral on the head, no avoidance. It is **not** row A of the
options table above, which is the do-nothing control and stays rejected.

### What the footage shows

| Observation | In the clip | Ours before this amendment |
|---|---|---|
| Where the numeral sits | on the struck unit's head, overlapping its own sprite, the unit behind it and terrain props | raised to `p.y - 66` to clear the bar |
| Avoidance behaviour | **none** — overlap is normal, not a defect | `HEADROOM` 54 → 72 reserved space to prevent it |
| HP bar over a unit | **none.** Health is read from a panel | a bar per unit at `p.y - 44` |
| How long the numeral stays | roughly **1.5–2 s**, rising as it fades | 400 ms (`MOTION_MS.impact`) |

**Provenance — read this before citing that table.** The clip is the **2025 *Ivalice
Chronicles* remaster**. `CLAUDE.md` fixes PSX FFT (1997) as the numeric spine, tags WotL
deltas `[WotL]`, and names the remaster **not** the baseline. The remaster reuses the
original sprites, but its HUD is new work.

- These rows are **[REMASTER-SOURCED]** evidence about **presentation**. They are not
  `[VERIFIED]` PSX baseline claims. Do not cite them for a combat number or a rule.
- **No `[UNCERTAIN]` tag in this ADR is upgraded on their strength.** "Why not D, on the
  mechanism" — FFT shows no phase banner — stands exactly as written and stays
  `[UNCERTAIN]`. A 2025 HUD cannot settle a 1997 turn-announcement claim.

### The decision, restated

1. The numeral is **anchored in world units** above the head, but **sized and clamped in
   screen pixels**, so a future camera zoom cannot resize or clip it.
2. **Overlap is allowed** — own sprite, the unit behind, props. No avoidance, no
   displacement, no collision test.
3. **`HEADROOM` 72 → 54.** Every board returns to its pre-slice size.
4. **The turn plate moves to screen space on the same rule.** It sits higher than the
   numeral (`PLATE_BASE_Y` 74 vs `POPUP_BASE_Y` 66) and clips first, so leaving it in world
   units would hold the headroom up by itself and the numeral's move would buy nothing.
5. **Numeral duration 400 ms → ~1500 ms**, still rising as it fades.

**One thing the implementation added, 2026-09-01, and it is a decision rather than a
detail: the numeral is painted OVER the plate.** When the unit that was just struck is
also the unit up next, the two labels land on one head — and the plate's box is opaque, so
with the numeral underneath it the damage number was simply erased for the plate's whole
700 ms. Found by opening a frame with the suite green. This is ORDERING, not avoidance:
neither label moves, and the number wins because the reference draws the number over
everything. **What it does not fix:** the plate is then largely hidden behind the number
for that case. Nobody has decided whether that is acceptable; it is an appearance call and
it is open.

### What this supersedes

| Claim, and where | Status now |
|---|---|
| Context: the numeral landing on the HP bar is a live defect | **Superseded.** Overlap is normal in the source presentation, and there is no bar over a unit there. The bar is **our** invention, so the collision was a constraint we invented. |
| Options table, row A: "leaves the numeral-over-HP-bar defect standing" | **Reason superseded.** Row A is still rejected — nothing acknowledges a blow. |
| Options table, row C: "fixes the hidden HP bar" | **Superseded.** Nothing needed fixing about the overlap. |
| Consequence: "the HP bar becomes readable during a battle" | **Reframed.** Readability now comes from **expiry** after ~1500 ms, not from avoidance. |
| The shipped fix: numeral to `p.y - 66`, `HEADROOM` 54 → 72, boards ~5–7% smaller | **Reversed.** It solved a problem we did not have, and it charged the board for it. |

### The reasoning that survives, and is the durable part

**A reservation cannot size a thing whose size the reservation decides.** The numeral's font
is written in canvas pixels (`700 20px`) but drawn under the camera transform, so it renders
at `20 × scale`. `viewFor` reserved room for it in **world** units above the top tile. That
reservation shrinks `scale` — and `scale` is what decides how big the numeral comes out. The
quantity being reserved for changes because of the reservation.

That circularity is why the fix cost board area, and why raising `HEADROOM` again would cost
more each time without ever converging.

**A screen-space clamp breaks the loop.** Size and place the numeral after `scale` is
applied. The camera then reserves only **world** tenants — props, HP bar, status chips — and
board size stops depending on a label's font. This argument is independent of the footage: it
would hold even if the avoidance rule had been kept.

### Why an owner-supplied clip was the thing that settled it

**The fidelity route could verify almost nothing, and that is a standing constraint worth
having written down.** Both sources `CLAUDE.md` names are blocked by this sandbox's egress
policy. Measured 2026-09-01:

| Host | Result |
|---|---|
| `ffhacktics.com` | the proxy refuses `CONNECT` — the request never reaches the site |
| `finalfantasy.fandom.com` | same |

So no primary source confirmed anything, which is why the option-D mechanism claim above is
still `[UNCERTAIN]`. Expect this on every future FFT-fidelity question here: WebSearch
cross-corroboration or an owner-supplied reference, never the primary wikis.

### Numbers in this amendment that no test asserts

- ~~**`~1500 ms` and `HEADROOM` 54 are explicitly aspirational** until the AC pass.~~
  **[CORRECTED 2026-09-01, when the implementation landed — both are now asserted, and
  leaving this bullet standing would have been a coverage gap that had already been
  closed.]** `motion.test.ts` pins the numeral's window to the **literal** 1400–2000 ms
  band ("the numeral holds ~1500 ms…"), deliberately not relative to `MOTION_MS.popup`,
  which would stay green at 400. `iso.test.ts` pins `HEADROOM` from both sides: a floor
  against the tallest **world** tenant, and per-map camera-scale floors sitting between
  the 72 and 54 readings on all five shipped maps. **No Acceptance Criteria are written
  here** — ACs still land in a later pass against what is asserted.
- **"1.5–2 s" is read off frames, not instrumented.** It is a target band, not a measurement
  of the source game.
- **Still unasserted, and named rather than left implied:** whether any of this is
  *legible* — the canvas is unmeasured (see the Consequences above), so every legibility
  claim about the numeral is a human reading of a frame.
- **Correction to the Consequences bullet above:** `~700 ms` is **no longer unasserted**.
  `motion.test.ts` — ~~"DISCRIMINATING: the plate waits for the numeral to leave, and holds
  ~700 ms"~~ [2026-09-06: that title no longer exists; the test now reads "the plate follows
  the blow by a beat"] — pins the ordering and the fade shape. But it asserts **relative to**
  `MOTION_MS.plate`, so the literal 700 is still free to move without anything going red.
  `~58 s` remains unasserted.

### References added by this amendment

- `src/render/iso.ts` — `HEADROOM`, `POPUP_BASE_Y`, `PLATE_BASE_Y`, `viewFor`, the camera's
  `ctx.scale(scale, scale)`.
- `src/render/motion.ts` — `MOTION_MS`; `src/render/motion.test.ts` — the plate timing.
- `visual-artifacts/popup-placement/` — the placement harness the option letters come from.
