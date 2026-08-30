# ADR-0031 — The span is real: one map where the water blocks

- **Status:** Accepted
- **Date:** 2026-08-30
- **Extends:** ADR-0030 (the ground is painted, not tiled).

## Context

ADR-0030 painted all five battles and recorded the cost: the maps are flat, so *The Broken
Span* read as a wooden platform rather than a bridge over anything. The owner's response
was direct — *"broken span needs height"* — with the clarifying note that **a bridge is
just walkable tiles across water**, which is exactly right and is what made this cheap.

Three variants were rendered from the running game and put in front of the owner:

| | What it showed | Owner's read |
|---|---|---|
| **A** | Deck over water, no gap | Rejected. The move-range panels reach onto the river — you can walk on water. |
| **B** | Deck over water with a real hole | **Chosen.** |
| **C** | Same, stepped | Rejected as no different: **every unit has Jump 3**, so a 1–3 step climb is free. |

C is worth recording because it looked like a design lever and is not one. With a uniform
Jump of 3, a climb only gates anyone at a delta of 4 or more — which does not gate, it
severs. A height-based route choice needs Jump to vary first.

## Decision

**Battle 4 gets real relief, a real river, and a real gap. Nothing else changes.**

- The deck sits two steps above the river; the river tiles are `passable: false`.
- The collapsed middle is two blocked tiles, leaving the centre row as a **one-tile
  chokepoint** both sides must funnel through.
- The west abutment runs one row further than the east, because a party member starts at
  (0, 5). A unit standing in the river is the defect the new start-tile check exists to
  catch, and it was caught during authoring rather than after.

### No schema change, and that is the point

The encounter format already carries per-tile `{height, passable}` — this is **data only**.
No `Tile` field, no `contentSchemaVersion` bump, no save migration, and the surfaces stay
paint. ADR-0030 anticipated a schema bump for exactly this and it turned out to be
unnecessary: "water blocks" is authored per tile today, and the sim's `passable` remains
the only answer to *may I stand there*.

### Terrain rules elsewhere are still parked

The owner's scope was **just battle 4**. Battles 1, 2, 3 and 5 keep the exact difficulty
they were tuned for, and the six balance test battles stay flat so the build-variety score
remains comparable to every past measurement (owner decision, 2026-08-30).

## The new invariant, and why it is one-directional

**A tile the sim blocks is never painted as walkable ground.** Asserted for every battle.
The failure it prevents is an *invisible wall*: a player clicks solid-looking ground,
nothing happens, and there is nothing on screen to explain why.

**The converse is deliberately not asserted.** Battle 2 is a ford: its river is paint, the
sim was never told about it, and units wade anywhere. Requiring painted water to block
would either break that map or force a difficulty change nobody asked for. When water
blocks everywhere this becomes an equality — and battle 2 then needs a real crossing.

Both halves of the check are mutation-verified: painting a blocked tile as grass fails it,
and so does removing every blocked tile, which would otherwise leave the loop vacuous and
green.

## Consequences

**Battle 4 is a different fight and nobody knows how much harder.** A chokepoint rewards
holding the line and punishes spread-out parties. The balance probe still wins it — that is
reachability, not difficulty, and the distinction has bitten this repo before.

**The other four maps now look less finished by comparison.** The span has a river and a
drop; the ford has a river that is a rumour. That asymmetry is a deliberate consequence of
scoping to one map, not an oversight.

**Jump is uniform at 3 across the party**, so no map can currently ask "who can climb
this". If height is ever to be a route choice rather than scenery, Jump has to vary by job
first — which is a job-system decision, not a terrain one.

## Not asserted

Whether the chokepoint is *fun*, whether battle 4 is now too hard, and whether a player
reads the gap as impassable before trying to walk into it. All three need a person.
