# Research: Briar Is a Sprite

| Unknown | Decision | Rationale | Alternatives |
|---|---|---|---|
| How the sim knows a path | Add pure `movePath` to `src/sim/grid.ts` sharing `moveRange`'s step rule | The sim owns legality (`src/render/CLAUDE.md`); a render-side path would be the "second opinion" that doc forbids | Recompute in render (rejected: parallel rule); store the path in the command (rejected: schema bump) |
| How sheets load | `import url from "...png"` like `campaign-data.ts` portraits | Vite hashes and serves it; the boot check pattern already exists | `import.meta.glob` (rejected in that file's own header: Vite-only) |
| Where the idle clock lives | `MotionDirector`, sampled by the page | Same rule as `motion.ts`: the clock never enters `draw` or the sim | `setInterval` in `game.ts` (works, but a second clock owner) |
| Shoot vs act | From the resolution event's ability id (+ weapon `range.h` after ADR-0049) | The event is the sim's own record; no render-side ability table | A `shoots: true` flag on ability data (rejected: content change for a cosmetic) |
| Impact delay | Shift impact segments by `impactDelayMs`, cap 300 ms | Keeps `MOTION_MS.impact` = 400 intact; never blocks input | Delay the commit (rejected: breaks "motion never gates a step") |
| Art cleanup tooling | Python + Pillow, as the portraits were cut | Already the recorded method; no npm dep | `pngjs`/`sharp` (not installed; a new dep for a script) |
| FFT sprite size | `[UNCERTAIN]` here; the owner accepted 32x48 | Sandbox cannot reach FFHacktics; not load-bearing for the code | — |
