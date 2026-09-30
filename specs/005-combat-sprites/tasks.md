# Tasks: Briar Is a Sprite

**Input**: `specs/005-combat-sprites/` (spec, plan, research, data-model, quickstart). **Branch**: `claude/project-thread-bibvrd`.
**Format**: `[ID] [P] [Story] task — file(s) — proof`. `[P]` = can run beside its neighbours (different files). Stories are US1…US5 from the spec. Every code task names the test rule it lands (AC-V79…V88) and the mutation that must go red.
**Seats** (`CLAUDE.md` roster): `combat-engineer` for `src/sim`, `viewer-engineer` for `src/render` and `e2e`, `art-director` for prompts, `docs-steward` last, one `reviewer` pass. One editing agent in the checkout at a time.

## Phase 1: Setup (placeholder art and the lookup)

- [ ] T001 [US1] Write `scripts/sprite-sheet.py` (Pillow): assemble 64x96 cells into a sheet by the manifest's row order; `--placeholder` draws a grey 32x48 figure with a moving arm, 4/4/5/3/2 frames — `scripts/sprite-sheet.py` — runs, writes two PNGs under 100 KiB
- [ ] T002 [US1] Commit `data/campaign/story/sprites/briar.json`, `placeholder-front.png`, `placeholder-back.png` (from T001) — `check:assets` green
- [ ] T003 [US1] Create `src/render/sprites.ts`: Zod manifest schema, `SPRITE_BY_UNIT = { "pc-briar": "briar" }`, sheet URL imports (placeholder for now), image cache with `ready(name)`, boot check (width ≥ max frames × cell.w, height = 5 × cell.h, throws naming the file) — AC-V87 — `src/render/sprites.test.ts`: manifest claiming 6 idle frames vs a 4-frame sheet throws; a missing `src` leaves `ready()` false. Mutation: skip the width check → red

## Phase 2: Foundational (the sim helper)

- [ ] T004 [P] [US2] Extract `moveRange`'s step rule into `stepAllowed(...)` in `src/sim/grid.ts`; assert `moveRange` output on battle 1 is deep-equal before and after (fixture saved in the test) — `src/sim/grid.test.ts`
- [ ] T005 [US2] Add `movePath(grid, units, unitId, to): Position[] | null` (BFS, parent map, neighbours N,E,S,W) — AC-V82 — `grid.test.ts`: 3x3 grid, height-9 centre, jump 2: path avoids the centre; two calls equal; unreachable → null. Mutation: return the straight line → red. `npm run check:rng` green

## Phase 3: US1 — Briar stands on the board (P1)

- [ ] T006 [US1] `DrawOptions.sprite?: (u) => SpriteDraw | undefined` and the sprite branch in `drawUnit` (`src/render/iso.ts`): team ring on the shadow, `imageSmoothingEnabled=false`, row by animation, column by frame, flip for E/W, no diamond, no facing pip — AC-V79, AC-V81 — `iso.test.ts` with `recordingCtx()` extended to record `drawImage` src and the sign of `scale`: Briar's src ends `briar-front.png`; four facings → (front, +1), (back, +1), (front, −1), (back, −1). Mutations: map `pc-briar` to `placeholder` → red; swap E/W rows → two cases red
- [ ] T007 [US1] Byte-identical others: `iso.test.ts` renders battle 1 minus Briar with and without `opts.sprite`; recorder output deep-equal — AC-V80. Mutation: draw the team ring for token units → red
- [ ] T008 [US1] Wire `SPRITE_BY_UNIT` into `game.ts`'s draw call (`opts.sprite`), idle frame 0 for now; fallback to token when `!ready()` — `src/render/game.ts` — the engine viewer (`main.ts`) stays untouched and draws tokens

**Checkpoint**: `npm run build` and load battle 1: Briar is a grey placeholder figure, everyone else a diamond.

## Phase 4: US2 — Briar walks (P1)

- [ ] T009 [US2] `MotionBeat.walk?` and `makeBeat` filling it when the actor's `pos` changed, path via `movePath` on `before` — `src/render/session.ts` — `session.test.ts`: a move commit yields `walk.path` from origin to destination; a wait yields none
- [ ] T010 [US2] `sampleBeat`: `unitPos[unitId]` along the path at 150 ms/tile, `sprites[unitId] = { anim: "walk", frame, facing: step direction }`; `beatDuration` includes the walk — AC-V83 — `motion.test.ts`: 4-tile path sampled at 0/150/300/450/600. Mutation: 100 ms/tile → t=450 red
- [ ] T011 [US2] `draw` uses `unitPos` when present (project the fractional world position) — `iso.ts` — `iso.test.ts`: a unit with `unitPos` halfway between two tiles draws at the midpoint
- [ ] T012 [US1] Idle clock in `MotionDirector`: `idleFrame(t) = floor(t/250) % frames`; `running()` true while a sprite unit is alive and motion not reduced; `game.ts` repaints only when the sampled frame index changes — `motion.ts`, `game.ts` — `motion.test.ts`: `running()` true with a sprite unit, false with none; frame index cycles 0..3
- [ ] T013 [US1,US2] Reduced motion: idle frame 0, `unitPos` = destination at t=0, no projectile — AC-V86 — `motion.test.ts` with `reduced: () => true`. Mutation: ignore the flag in the walk → red
- [ ] T014 [US1] Purity: `sampleBeat` twice with equal inputs → deep-equal, including sprite frames; `check:rng` green — AC-V88 — Mutation: `performance.now()` inside the frame maths → red

**Checkpoint**: commit a move for Briar in the browser: she slides tile by tile.

## Phase 5: US3 — Briar shoots (P1)

- [ ] T015 [US3] `MotionBeat.act?` (`shoot` | `act`) and `impactDelayMs`; `makeBeat` decides `shoot` from the event's ability id (`aim.*` now; `basic.attack` with weapon `range.h > 1` once ADR-0049 is on main), delay = `min(300, 60 × Chebyshev)` — `session.ts` — `session.test.ts`: Aimed Shot at distance 4 → `shoot`, 240 ms; a melee hit → `act`, 0
- [ ] T016 [US3] `sampleBeat` shifts impact segments by `impactDelayMs`, emits `projectile {from,to,t}`, `sprites[striker] = shoot frames`; `beatDuration` grows by the delay — AC-V84 — `motion.test.ts`: at t=100 the bow case has no recoil, the sword case full recoil. Mutation: delay fixed at 0 → red
- [ ] T017 [US3] Draw the arrow (6 px, striker→target, rotated to the segment) in `draw`'s unit pass — `iso.ts` — `iso.test.ts`: a projectile at t=0.5 draws at the midpoint

## Phase 6: US4 — Briar is hit (P1)

- [ ] T018 [US4] Sprite units draw `hit` frames during the impact and skip the white flash; token units still flash — AC-V85 — `iso.test.ts`: Briar and Vance struck in one purpose-built AoE; only Vance gets a white fill. Mutation: drop the sprite branch → Briar's white fill appears → red

## Phase 7: US5 — Everyone else untouched, in the browser

- [ ] T019 [US5] `e2e/sprites.spec.ts`: (a) identity — the page's loaded image list contains `briar-front.png`; (b) battle 1 with Briar KO'd vs a token-only build: `getImageData` diff = 0 off the canvas buffer; (c) `emulateMedia({reducedMotion:"reduce"})` shows frame 0 only; (d) proof frames at 832x328 and 832x384, waited past `entry-plaque`, into `coverage/frames/sprites/`. Rebuild before running (`npm run build`)
- [ ] T020 [US5] Re-run `test`, fix the three `N tests, M browser specs` claims (`CLAUDE.md`, `README.md`, `docs/INTENT.md` only if the ranged thread has merged; else leave it and say so) — `npm run check:counts` green

## Phase 8: Art (parallel with Phases 1–7; owner-facing)

- [ ] T021 [P] Write `docs/visual/sprites/README.md` (style lock, cell size, row order, run record table) and `docs/visual/sprites/gpt-sprite-prompts.md` per `gpt-image-2-prompting`, reference = `archer-f.png` — `art-director`, one pass, no alternatives
- [ ] T022 [P] Owner runs the prompts in order: idle front, idle back, walk front, walk back, shoot front, shoot back, hit, act; hands back PNGs
- [ ] T023 [US1] Crop, palette-snap and assemble with `scripts/sprite-sheet.py` into `briar-front.png` / `briar-back.png`; record settings and sizes in the README; boot check passes
- [ ] T024 [US1] Owner approves the cleaned frames on a rendered board (taste rule); swap the import in `sprites.ts` from placeholder to `briar-*`; AC-V79's identity assertion now reads `briar-front.png`

## Phase 9: Review and record (last)

- [ ] T025 One `reviewer` pass over the diff and the AC rows; fix findings before T026
- [ ] T026 `docs-steward`: port AC-V79…V88 into `docs/10`; move ADR-0050 into `docs/adr/` and add its row to `docs/adr/README.md`; add `sprites` to `scripts/state-content.ts`'s counters; `intent/combat-sprites.md` status → shipped; `specs/README.md` row for 005
- [ ] T027 `npm run state`; `npm run check` green; frames into the PR body per `pr-delivery`

## Dependencies

```
T001 → T002 → T003 → T006 → T007 → T008 ─┐
T004 → T005 ───────────────────────────┴→ T009 → T010 → T011 → T012 → T013 → T014
                                              └→ T015 → T016 → T017 → T018 → T019 → T020
T021 → T022 → T023 → T024 (any time after T003)
T025 → T026 → T027 (after everything)
```

## Parallel opportunities
- T004/T005 (sim) beside T001–T003 (render/data): different files, two seats.
- T021 at once; T022 is the owner's; T023/T024 whenever art arrives.
- Everything else is sequential in `src/render`: one editing agent at a time.
