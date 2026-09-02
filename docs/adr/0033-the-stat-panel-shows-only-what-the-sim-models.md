# ADR-0033 — The stat panel shows only what the sim models

- **Status:** Accepted
- **Date:** 2026-09-01
- **Deciders:** the owner, on four calls taken 2026-09-01. Placement was chosen from three
  rendered options.
- **Extends:** ADR-0021 (level is not power), ADR-0010 (deferred effects), ADR-0032 (the
  board moves). Constrained by `docs/10` §4 and by `docs/00` pillar 4.
- **Acceptance Criterion:** `docs/10` **AC-V22**, written against what the tests actually
  assert. `docs/10` outranks this file wherever the two disagree.

## Context

The battle board shipped with no card naming the unit whose turn it is. The player read
the acting unit off a coloured ring and a chip in the turn rail. Final Fantasy Tactics
puts a plate in a bottom corner instead: face, name, job, HP, and the turn clock.

Building that plate forces four questions, and three of them are honesty questions rather
than layout ones. The reference panel carries **MP** and **Level**. This engine models
neither. The panel is DOM sitting on top of a live canvas, so it can eat clicks and it can
be measured against the wrong ground. And "which unit does it describe" is a question the
shipped answer does not close.

## Options considered

1. **Copy the reference panel row for row** — MP and Level included, printed as `0` or
   `Lv 1`. Familiar, and immediately false. Pillar 4 forbids asserting a modeled value the
   engine cannot back up.
2. **Copy it and grey the two dead rows out.** Still a claim: a greyed `MP 0` says the
   engine has an MP pool that happens to be empty. It has no pool.
3. **Show only what the sim models** — name, job, HP current/max, Clock, Brave, Faith —
   and let MP and Level be genuinely absent from the type, not blank. Diverges from the
   reference. Costs a row the player may expect.

For "which unit":

1. **Follow the pointer.** Built and rendered. Inspecting an enemy is a real want, but the
   card then flickers with every mouse move and stops answering "whose turn is it".
2. **Follow the acting unit.** One stable answer, always the one the player must act on.
3. **Both, behind a control.** No control is designed yet.

## Decision

**Four calls, all the owner's, all 2026-09-01.**

**1. MP and Level are absent, not zero.** `UnitState` (`src/sim/state.ts`) has no MP field
at all. `UnitRecord.level` exists in `src/sim/roster.ts`, is defaulted to 1 at
construction, and is then never raised and never read — the decision recorded in
**ADR-0021** and guarded by **AC-J10** (`docs/02` §6). Printing either would be the
"Crit 0%" failure under a different name. `StatCard` has no `mp` and no `level` key, so
`exactOptionalPropertyTypes` makes adding one a deliberate act.

**AC-J10 is named here on purpose.** If ADR-0021 is ever reversed and Level starts
granting stats, AC-J10 goes red — and this decision comes straight back onto the table,
because the reason for hiding the row will have expired. That is the intended coupling.

**2. Placement is bottom-left, over the canvas.** Chosen from three rendered options. This
is a taste call and the least durable thing here.

**3. The card follows the acting unit. Cursor-follow is parked, not cancelled.** The owner
wants a future control that inspects any unit. Its landing site is `unitCardHtml`'s
optional `focusUnitId` parameter: pass nothing and the card describes the forecast lead,
pass a unit id and it describes that unit. **No shipped page passes an id**, so
`panels.test.ts` is the only thing keeping the parameter honest. Deleting it costs that
feature its seam.

**4. Every unit's portrait key is `placeholder` this slice.** No portrait art exists. One
bundled asset keeps `campaign-data.ts`'s boot coverage check and the `["placeholder"]`
tripwire in `campaign-shell.test.ts` intact and honest. The card captions "Portrait
pending" off the **asset key**, never the URL, so the caption disappears by itself for
each unit that gets real art. The real job x gender table lands with the art.

**5. The plate is opaque, and that is load-bearing.** `e2e/contrast.spec.ts` cannot sample
a canvas — a canvas has no background colour, only pixels. A translucent plate would be
composited onto its DOM parent, `.card.board`, and scored against a dark sheet while the
player reads it over grass, sky or water. That is a green run and an unreadable card. The
plate is therefore a flat opaque fill, and a spec asserts the opacity directly rather than
banking the measurement it enables.

## Consequences

**Easier.** The acting unit's HP, job and Clock are on screen at all times, next to the
board rather than beside it. The card is one pure `state → string` renderer shared by the
campaign and the engine viewer, so what is shown and what is deliberately absent cannot
diverge between the two pages.

**What we give up.**

- The panel does not match the reference. A player who knows FFT will look for MP and
  Level and not find them. Accepted: an absent row is recoverable, a false one is not.
- The engine viewer has no job and no portrait to supply, so its card renders with both
  rows genuinely missing. That is deliberate — it is the live case proving the two
  optional rows are optional.
- Bottom-left costs board area in that corner. The card declines pointer events, so it
  costs pixels rather than clicks.
- Cursor-follow was built and thrown away. Its seam is kept, tested and unused.

**Invariants this creates.**

- **The day MP ships, the hidden row becomes a lie.** `panels.test.ts` holds a tripwire on
  `UnitStateSchema`'s key set that fails when `mp` appears. `src/render/CLAUDE.md`'s rule
  — when a deferred capability ships, go un-hide the row — applies to this card.
- **The plate stays opaque.** Making it translucent silently invalidates every contrast
  measurement on the battle screen.
- **The card declines pointer events.** It sits between the pointer and live tiles.
  Without `pointer-events: none` the board stops responding in one corner with no error,
  no red test and nothing on screen to see.
- **"CT" is banned from this surface.** `e2e/campaign.spec.ts`'s learnability spec forbids
  the string in this region as engine jargon, and it caught this card's first draft saying
  it. The card prints **"Clock"**, the word `previewHtml` already uses. This is not a taste
  call and it is not this ADR's to reverse.

## Evidence

Each row is a claim and the test that can come out the other way. Every `panels.test.ts`
entry carries a mutation that was applied and watched go red; the mutations are named in
the test file.

| Claim | Backed by |
|---|---|
| The card describes the unit acting **next**, not `state.units[0]` | `panels.test.ts`, on a speed ladder where those two units differ, with a non-degeneracy guard asserting they differ |
| MP and Level appear nowhere | `panels.test.ts` — an exact key-set equality on `StatCard` **and** a regex over the markup. Neither substitutes for the other |
| Hiding MP is still honest | `panels.test.ts` tripwire on `UnitStateSchema`'s keys |
| Hiding Level is still honest | `docs/02` AC-J10, not duplicated here |
| The card says "Clock", never "CT" | `e2e/campaign.spec.ts` (authority) plus a fast echo in `panels.test.ts` |
| Job and portrait are genuinely optional | A/B on the built object from one state through two lookups, asserting everything else is byte-identical |
| The pending caption tracks the **key** | Three portrait states in one fixture — absent, placeholder, real art. Two states would pass under an always-on or always-off caption |
| The plate is opaque and of the declared colour | `e2e/contrast.spec.ts`, asserting a computed `rgb(...)` with no alpha channel and no background image |
| The card does not eat clicks under it | `e2e/overlay.spec.ts` — the browser's own hit test, then a real click that moves the viewer's tile cursor. Mutation-verified by deleting `pointer-events: none` on both pages |
| The focus seam is wired, not just type-checked | `panels.test.ts` A/B: the same state renders a different unit, with different HP, with and without a focus id |

## Numbers and claims in this ADR that no test asserts

Said here rather than left implied.

- **"Bottom-left" is not asserted.** `e2e/overlay.spec.ts` asserts the card sits inside
  the canvas rectangle, and the campaign half checks only the vertical bounds. Moving the
  plate to another corner inside the board would not go red.
- **The opacity assertion covers the campaign page only.** `viewer.html`'s plate paints
  `var(--surface-2)`; nothing checks that it resolves opaque.
- **Nothing reads a pixel off the finished board**, so no test can say the plate is
  legible *over* what the canvas actually painted under it. It says the plate is opaque
  and that the text clears WCAG AA against the plate. That is a weaker claim, and it is
  the claim being made.
- **The card's colours were never designed.** They are inherited from `.card.board`, so
  the plate reads as board chrome rather than as a window. Open, routed to
  `art-director` in `docs/NEXT.md`.

## References

- `docs/10` §4 (the transparency list) and §6 **AC-V22**.
- `docs/00` pillar 4; `src/render/CLAUDE.md`, "unmodeled things are ABSENT, never shown as
  zero" and "when a deferred capability ships, go un-hide the row".
- ADR-0021 (progression is authored, not farmed) and `docs/02` AC-J10.
- ADR-0010 (deferred effects), ADR-0028 (the contrast instrument), ADR-0032 (the board
  moves).
- Code: `src/render/panels.ts`, `src/render/campaign-shell.ts`
  (`deployedRecords` / `unitJobs`), `src/render/game.ts`, `src/render/main.ts`,
  `index.html`, `viewer.html`.
- Tests: `src/render/panels.test.ts`, `e2e/overlay.spec.ts`, `e2e/contrast.spec.ts`.
