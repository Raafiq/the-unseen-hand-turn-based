# `src/render/` — thin viewer layer

A deliberately thin render layer over the pure, headless sim (ADR-0007). It
**imports from `src/sim` and never the reverse** — the sim has zero render deps,
so it stays deterministic and unit-testable. Swap this layer to change the look
without touching the engine.

Contents:

- `iso.ts` — the isometric renderer: a pure projection `screen = f(x, y, height)`
  drawing the grid (with per-tile height), units (team colour, facing pip, HP
  bar, KO crystal + revive countdown, and a row of **status badges** — buff/debuff
  chips read straight off `UnitState.statuses`), the active unit's move-range
  highlight, in-flight charged-spell target reticles, and the damage / miss /
  whiff popup. The grid's height and facing live in `BattleState`, so any
  renderer can consume them. It also exposes the **inverse**, `pickTile(state,
  canvasX, canvasY, canvasW, canvasH)` → `Position | null`: not an algebraic
  inverse, because height lifts a tile up the screen and lets a tall tile occlude
  the ones behind it, so it hit-tests top faces in **reverse painter's order**
  (the shared `paintOrder()` that `draw()` walks forward) and returns the tile
  drawn on top. Only top faces are pickable — a click on a height skirt selects
  whatever top face is painted there, or `null`. Covered by `iso.test.ts`.
- `demo.ts` — a demo battle plus a **deterministic** step policy (no
  `Math.random`, no wall-clock) so the viewer produces identical frames every
  run and the Playwright screenshots are a stable baseline. It also scripts a
  status showcase through the sim's exported helpers: the Knight opens under
  **Protect** (a buff) and the Mage's cast hexes its target with **Slow** (a
  debuff), so both badge kinds render.
- `main.ts` — bootstrap: canvas + Step/Reset controls + the turn-order timeline
  + turn log (including a "gained <status>" row) + a status line that lists the
  active unit's statuses, and `window.tuh` hooks for the visual tests.
- `prep.ts` — the prep/loadout viewer (customization pillar): the 5-slot chassis
  and the live battle-command projection, independent of the battle above.

Run it: `npm run dev` (Vite dev server) or `npm run preview` (built app). The
entry HTML is `index.html` at the repo root. Visual tests live in `e2e/` and the
Pages deploy publishes this viewer plus a screenshot/video gallery.

What the viewer shows today: the CT clock driving turn order; units maneuvering
within Move/Jump range and **attacking** when they reach an enemy (real hit
rolls, facing, damage from the FFT formulas); **charged spells** that build on
the shared timeline (⚡) and then **land or whiff**; **KO → crystal** with a
revive countdown; **status badges** coloured by buff/debuff (the demo showcases
Protect and Slow); and the **prep/loadout** chassis. Still headless-sim-first:
the deep job/skill-tree menus and full status *inflict-on-hit* resolution arrive
in later slices — the demo applies its showcase statuses via the exported helper
rather than through a resolver.
