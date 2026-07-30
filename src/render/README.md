# `src/render/` — thin viewer layer

A deliberately thin render layer over the pure, headless sim (ADR-0007). It
**imports from `src/sim` and never the reverse** — the sim has zero render deps,
so it stays deterministic and unit-testable. Swap this layer to change the look
without touching the engine.

Contents:

- `iso.ts` — the isometric renderer: a pure projection `screen = f(x, y, height)`
  drawing the grid (with per-tile height), units (team colour, facing pip, HP
  bar), and the active unit's move-range highlight. The grid's height and facing
  live in `BattleState`, so any renderer can consume them.
- `demo.ts` — a demo battle plus a **deterministic** step policy (no
  `Math.random`, no wall-clock) so the viewer produces identical frames every
  run and the Playwright screenshots are a stable baseline.
- `main.ts` — bootstrap: canvas + Step/Reset controls + the turn-order timeline
  + turn log, and `window.tuh` hooks for the visual tests.

Run it: `npm run dev` (Vite dev server) or `npm run preview` (built app). The
entry HTML is `index.html` at the repo root. Visual tests live in `e2e/` and the
Pages deploy publishes this viewer plus a screenshot/video gallery.

Still P0-honest: movement + CT turn order only. Attack resolution, damage, and
the deep job/loadout menus arrive in later slices.
