# `src/render/` — reserved (empty until P1/P2)

The render/UI layer is intentionally empty at P0. Per ADR-0007 and the roadmap
(`docs/08`), P0 is a **pure, headless sim** — no pixels yet.

When it lands (P1/P2), it is a **thin** layer that:

- imports from `src/sim` (never the reverse — the sim has zero render deps),
- turns the logical grid into an **isometric** view via a pure projection
  function `screen = f(x, y, height)` (the grid stores true per-tile height and
  facing in `BattleState`, so any renderer can consume it), and
- renders the deep job/loadout menus (DOM/React) over the sim state.

Leaning toward **PixiJS** for the isometric grid (revisit at P1). Nothing here
may leak nondeterminism or wall-clock back into the sim.
