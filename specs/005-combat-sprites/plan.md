# Implementation Plan: Briar Is a Sprite

**Branch**: `claude/project-thread-bibvrd` | **Date**: 2026-09-29 | **Spec**: `specs/005-combat-sprites/spec.md`
**Input**: the spec above (AC-V79 … AC-V88), `intent/combat-sprites.md` (accepted), the draft ADR-0050.

## Summary

Draw one unit, Briar, from a pixel-art sprite sheet instead of the diamond token; animate idle,
walk, shoot, act and hit as cosmetic catch-up in the existing motion layer. Everything else stays
byte-identical. The only sim change is a pure `movePath` helper. The art is made by the owner in
GPT Image 2 from prompts this slice writes; the code ships against a placeholder sheet first.

## Technical Context

| | |
|---|---|
| Language | TypeScript (strict, `exactOptionalPropertyTypes`), Vite, no new runtime deps |
| Renderer | 2D canvas, `src/render/iso.ts` (`draw`, `drawUnit`), motion in `src/render/motion.ts` |
| Assets | PNG sheets imported as URLs, like the portraits in `campaign-data.ts` (`import x from "...png"`) |
| Testing | vitest with the `recordingCtx()` canvas spy (`iso.test.ts`), Playwright at 832x328 and 832x384 |
| Target | Phone landscape, Chromium emulation; camera tile scale about 1.19 |
| Performance | The board repaints on a request-animation-frame loop only while a beat runs today. Idle adds a 4 fps loop while a sprite unit is on the board. Budget: one `drawImage` per sprite per frame |
| Art tooling | Pillow (Python) for crop, palette snap and sheet assembly, as the portraits were cut. `pip install pillow` once; not in git |
| Depends on | The weapon-range slice (ADR-0049) for a bow's basic Attack to count as a shot. Until it merges, only `aim.*` skills shoot |

## Constitution Check

| Principle | Verdict |
|---|---|
| V. Determinism | PASS. `movePath` is pure; the sprite clock is read by the page, never by the sim; `check:rng` still covers `session.ts` and `pacer.ts`; `sampleBeat` stays pure (AC-V88) |
| IV. Readable UX | PASS. Team colour stays under the sprite; HP bar, ring and crystal unchanged; reduced motion honoured (AC-V86) |
| I–III, VI | Untouched. No rule, job, ability or progression changes |
| Non-goals | No balance change; no engine command; no schema bump |

Re-checked after design: still PASS. The one new sim function returns a path from state it does not mutate.

## Project Structure

```text
specs/005-combat-sprites/
├── spec.md, ADR-0050-draft.md      # done
├── plan.md                         # this file
├── research.md                     # Phase 0: the six unknowns, resolved
├── data-model.md                   # Phase 1: manifest, beat and motion-state shapes
├── quickstart.md                   # Phase 1: how to prove it works
└── tasks.md                        # Phase 2 (/speckit-tasks), not written yet

src/sim/grid.ts                     # + movePath (pure)
src/render/sprites.ts               # NEW: SPRITE_BY_UNIT, manifest load, image cache, boot check
src/render/iso.ts                   # drawUnit sprite branch; MotionState.sprites / projectile / unitPos
src/render/motion.ts                # MotionBeat.walk / act / impactDelayMs; sampleBeat frame maths; idle clock
src/render/session.ts               # makeBeat fills walk / act / impactDelayMs (from state + events only)
src/render/game.ts                  # wires SPRITE_BY_UNIT into draw; keeps the frame loop alive for idle
data/campaign/story/sprites/        # NEW: briar.json, placeholder-front.png, placeholder-back.png, later briar-*.png
scripts/sprite-sheet.py             # NEW: cells -> sheet (Pillow)
docs/visual/sprites/README.md       # NEW: style lock, prompts, run record
e2e/sprites.spec.ts                 # NEW: identity, byte-identical others, reduced motion, proof frames
docs/10, docs/adr/0050, README/CLAUDE counts, state/index.html   # last, after code is verified
```

## Design, in the order it builds

### Step 1. Sheets, manifest and lookup (`sprites.ts`, data) — AC-V79, V87
- `SPRITE_BY_UNIT = { "pc-briar": "briar" }`, frozen, same shape as `PORTRAIT_BY_UNIT`.
- `briar.json` manifest: `cell [64,96]`, `animations` with `frames` and `ms` per row, row order fixed by the spec's table.
- Boot check (like the portrait check): every sheet's width ≥ `max(frames) * cell.w`, height = rows × cell.h. Throws with the file name.
- Image cache: `HTMLImageElement` per sheet, loaded once; `ready(name)` false until `onload`. Not ready → token draws (fallback).
- Placeholder sheets: a 4-frame grey figure drawn by the script, so tests and the build need no approved art.

### Step 2. Drawing (`iso.ts`) — AC-V79, V80, V81, V85
- `DrawOptions.sprite?: (u: UnitState) => SpriteDraw | undefined`. Absent → today's path, untouched (A/B in the test).
- `drawUnit` sprite branch: shadow ellipse + 2 px team-colour ring; `imageSmoothingEnabled = false`; pick row by animation, column by frame; flip for E and W by `ctx.scale(-1, 1)` about the anchor; no diamond, no facing pip, no white flash. HP bar, ring and crystal reuse the existing code.
- Anchor: cell bottom-centre at `top` (the tile's top-face centre). Height offset is already in `project()`.

### Step 3. A legal path (`grid.ts`) — AC-V82
- Extract `moveRange`'s neighbour rule (`stepAllowed(grid, occupantTeam, unitTeam, jump, from, to)`) so both functions share it. No behaviour change to `moveRange` (its tests stay green, byte-identical output asserted on battle 1).
- `movePath(grid, units, unitId, to): Position[] | null`: breadth-first search with a parent map, neighbours in the fixed order N, E, S, W. Same inputs → same path. `null` when unreachable.

### Step 4. Walk, idle, frames (`motion.ts`, `session.ts`, `game.ts`) — AC-V83, V86, V88
- `MotionBeat` gains `walk?: { unitId; path: Position[] }`. `makeBeat` sets it when the acting unit's `pos` differs between `before` and `after`, computing the path on `before`.
- `sampleBeat` emits `unitPos[unitId]` (world position, fractional, along the path at 150 ms per tile) and `sprites[unitId] = { anim, frame, facing }`; facing while walking is the step direction.
- Idle: a second clock in `MotionDirector` (`idleFrame(t)` = `floor(t / 250) % 4`), and `running()` stays true while a sprite unit is alive and motion is not reduced. `game.ts` repaints only when the sampled frame index changes.
- Reduced motion: frame 0, `unitPos` = destination at t=0, no projectile.

### Step 5. Shoot and the arrow (`motion.ts`, `session.ts`, `iso.ts`) — AC-V84
- `MotionBeat` gains `act?: { unitId; kind: "shoot" | "act" }` and `impactDelayMs`.
- `makeBeat` decides `shoot` from the resolution event's ability: `aim.*` skills now; `basic.attack` with a weapon whose `range.h > 1` once ADR-0049 lands. It reads the event and the state only.
- `impactDelayMs = min(300, 60 × Chebyshev distance)` for a shot, else 0. `sampleBeat` shifts every impact segment by it; the projectile is a 6 px arrow drawn from striker to target over that time.
- `beatDuration` grows by the delay so the loop does not stop early.

### Step 6. Proof (`e2e/sprites.spec.ts`)
- Identity: the loaded sheet `src` ends with `briar-front.png`.
- Byte-identical others: battle 1 minus Briar (purpose-built) with and without the sprite lookup, `getImageData` diff = 0.
- Reduced motion under `emulateMedia({ reducedMotion: "reduce" })`.
- Frames for the proof sheet, waited past the entry plaque, at both viewports.

### Step 7. Art (owner + art-director) — parallel with steps 1–6
- `docs/visual/sprites/README.md` and the prompt file per the `gpt-image-2-prompting` skill, reference image = Briar's portrait.
- `scripts/sprite-sheet.py`: crop each delivered pose to 64x96, snap to a shared palette, set alpha, assemble rows.
- The owner approves the cleaned frames before they replace the placeholder (taste rule).

### Step 8. Record (last)
- Port AC-V79…V88 into `docs/10`; move ADR-0050 into `docs/adr/` and index it; add `sprites` to `scripts/state-content.ts`'s counters; regenerate `state/index.html`; fix the three test-count claims. `docs/INTENT.md` is owned by the ranged thread until it merges; this slice edits it only after.

## Risks and the fallback for each

| Risk | Fallback |
|---|---|
| GPT Image 2 frames disagree with each other | 2-frame idle (idle, blink); walk from 2 frames mirrored; say so in the README |
| Shimmer at 1.19x | Snap sprite scale to 1x or 2x in a follow-up; not this slice |
| E/W mirror rule is wrong | AC-V81 fixture flips; fix the table in `sprites.ts`, one line |
| Idle loop costs battery | Frame-index gating: repaint only when the index changes (4 repaints/s) |
| Weapon-range slice not merged | Only `aim.*` shoots; `basic.attack` follows when `range` exists on the weapon |

## Complexity Tracking
No constitution violations to justify.
