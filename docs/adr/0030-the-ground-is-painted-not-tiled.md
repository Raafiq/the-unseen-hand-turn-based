# ADR-0030 — The ground is painted, not tiled

- **Status:** Accepted
- **Date:** 2026-08-30
- **Supersedes:** nothing. Extends ADR-0007 (render layer owns the look) and ADR-0028
  (the parchment shell).

## Context

Every screen but the battle was parchment and iron-gall ink. The battle was cold blue
slate — `DARK_THEME`, a placeholder from the first week that nothing had replaced — and
next to the briefing sheet it read as a different product.

The first proposal offered three re-colourings of the existing board. The owner rejected
all three: *"this is not what i had in mind. could you refer to final fantasy tactics
series for maps? i was thinking actual grounds instead of this blocky generic."*

That reading was correct and identified the actual fault, which was not the palette.
**Final Fantasy Tactics never draws a grid on the ground.** A map is a small hand-built
diorama — grass, a track worn into it, cut rock, water, trees — and tile edges appear only
as translucent panels when a unit is selected. A per-tile stroke is what makes a board
read as tiles rather than as a place, and all three of the first options kept it.

## Decision

**The battle map paints real ground.** Chosen from three rendered options built on the
shipping projection: **"Daylight field"** — warm midday light from the upper left, muted
saturation, open sky behind, the parchment interface framing it. That two-worlds split is
what FFT itself does: a lush map inside an ornate window.

Four calls were put to the owner and answered:

| Question | Decision |
|---|---|
| Do surfaces affect the rules? | **Paint only, for now.** No `BattleState` change. |
| Who authors a battle's ground? | **A hand-authored terrain grid per battle.** |
| How much ships first? | **One battle**, judged in the real game before the rest. |
| Is drawn-in-code the destination? | **Yes** — invest in the textures; no artist needed. |

### What that means concretely

- `src/render/terrain.ts` holds the model: six surfaces (`grass dirt rock water sand
  wood`), three props (`tree boulder pillar`), a parser with real validation, and the
  `DAYLIGHT` palette. It imports no canvas, so its rules are testable without a DOM.
- `iso.ts` gains one optional `DrawOptions.terrain`. **Absent, nothing changes** — the
  engine demo page still draws the flat look. Present, it paints textured surfaces, culls
  side faces against the neighbour's height, draws props, and strokes no grid.
- A **camera** (`viewFor`) fits the board to the canvas. This was forced rather than
  chosen: at scale 1 a 7×5 map filled under half the frame, which was invisible while the
  canvas was transparent and became the loudest thing on screen the moment a sky went
  behind it.

## Why terrain is paint and not a rule

The sim's tile is `{height, passable}`. Adding a surface kind to it would be a schema bump,
a save migration, and a change to what the balance test battles measure — for a slice whose
whole purpose is to find out whether the look is right. So the renderer paints a pond that
a unit walks straight through.

**That is a lie the renderer tells, and it is written down in three places** (`terrain.ts`,
`campaign-data.ts`, AC-V18) rather than left for someone to discover. The day water blocks
movement it becomes a `Tile` field with a migration — never a second opinion held in the
render layer, which would put two answers to "may I stand there" in the codebase with only
one of them authoritative.

## Amendment, 2026-08-30 — all five battles painted

Battle 1 shipped alone, the owner judged it against before/after frames from the running
game, and said go. The other four are now authored: **the ford** (a river with a sand
crossing where the road meets it), **the hollow watch** (a flagstone floor with four broken
pillars), **the broken span** (a plank deck between rock ledges, its middle collapsed to
rubble), and **the warchief's camp** (ground trampled to dirt and sand around a plank
floor with banner posts).

The coverage check is now **bidirectional**: every battle must be painted, and every map
must belong to a battle. The first direction is a forcing function — a sixth battle cannot
ship drawing the flat look by omission. A second guard keeps props off the tiles units
start on; props block nothing, so that is purely cosmetic, and cosmetic is the point.

**What the flat maps cost, concretely.** ~~"The Broken Span" reads as a wooden platform,
not as a span over anything, because there is nothing to span. Height would fix it and
height is a rules change.~~ **Superseded by ADR-0031 the same day**: the span got real
height and real blocked water, and it turned out **not** to be a rules change — the
encounter format already carried per-tile `{height, passable}`. The ford is unchanged: its
river is crossable everywhere, because the sim was never told there is a river.

## Consequences

**~~The campaign maps are flat.~~ FOUR of five are.** ~~All five are featureless
rectangles~~ — **corrected by ADR-0031**, which gave `camp-b4-the-broken-span` height 2
and 45 blocked tiles. Battles 1, 2, 3 and 5 remain featureless rectangles: no height, no
blocked tiles, so every cliff and plateau in the mockups is still absent from four of the
five, and painted ground alone cannot supply them. Giving one of those relief changes what
its fight is, so it stays a separate decision — though ADR-0031 established it needs no
schema change to do.

**Nothing standing is occluded by terrain.** Props and units are drawn in a second pass
over the finished ground, because drawing a tree inside the painter's walk let the next
tile paint over its canopy — on a flat map, every prop on the board. The opposite error is
now possible: a unit behind a tall cliff would show through. ~~Harmless while the shipped
maps are flat~~ — **the premise expired with ADR-0031.** Battle 4 has walls now; it stays
harmless there only because every *passable* tile on it is the same height, so nothing
stands behind anything. The first map with two standable heights makes this visible.

**The camera is now on the click path.** `draw` and `pickTile` share `viewFor` exactly as
they already share `paintOrder`. A zoom applied to the painting but not the inverse offsets
every click by a constant factor — the same class of bug as AC-V10's height-ignoring
inverse and considerably harder to see, which is why AC-V19 asserts the unscaled point
lands on a *different* tile.

**The unit token is unchanged and undecided.** Units are still flat kite shapes with a
facing pip. Three treatments were drawn (kite, heraldic shield, standing figure) and the
owner has not chosen; changing it silently under cover of a terrain slice would have made
that choice for them.

## Evidence

- Three discriminating tests, each **mutation-verified** against a build that typechecks:
  restoring the grid stroke, interleaving props back into the tile walk, and accepting the
  terrain map then ignoring it. All three go red.
- `terrain.test.ts` covers the parser's failure modes, the dimension check in both
  directions, and the per-tile noise — including that transposed tiles `(3,4)` and `(4,3)`
  differ, which a hash folding x and y by addition would tie, striping every map.
- The frames were **opened**, not merely captured. Three defects were found that way and
  fixed: tree canopies painted in the ground's own green and therefore invisible over
  grass; the board floating in a mostly empty sky; and pale-blue range panels desaturating
  to grey concrete over green.
  > **Two of those three were only half fixed, and an adversarial review caught it
  > (2026-08-30).** The canopy fix changed the hex and asserted `!==`, shipping a `leafLit`
  > at contrast **1.03** against the grass mottle — the same colour to an eye, on two of
  > the five canopy blobs. And the camera's bound over-estimated any map with relief, so
  > battle 4 — the one map the camera exists for — drew below 1:1 in a half-empty sky.
  > **The third was wrong too.** The range panels were re-toned to a deeper blue and
  > recorded as resolved; the shipped frame still showed grey concrete slabs on a field,
  > because *any* translucent blue over green composites toward teal and only opacity
  > moves it. Fixing that then collided with the ford: a saturated panel that finally
  > read as blue over grass landed within four points of the river's own colour, so the
  > tiles you may walk to and the water became the same thing. The panel is now
  > deliberately **brighter** than every ground rather than a different hue.
  >
  > **And the water was drawing a grid.** `paintSurface`'s water branch put a full-width
  > band at a fixed offset from each tile's centre, which repeated identically on every
  > water tile and drew a plain lattice across a river — the exact thing AC-V18 exists to
  > remove, passing AC-V18 because it used no `stroke()`. Now placed by the tile's own
  > noise.
  >
  > All three defects were called fixed in this ADR while still shipping. **A defect
  > called fixed is a claim, and it needs a measurement or a frame, not a recollection.**

## Not asserted

Nothing here measures whether the map is *good*, or whether a player reads it faster than
the old board. No contrast measurement covers the canvas — `contrast.spec.ts` measures DOM
text, and the battlefield is pixels. And no human has seen it.
