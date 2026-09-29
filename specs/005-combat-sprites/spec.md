# Feature Specification: Briar Is a Sprite

**Feature Branch**: `claude/project-thread-bibvrd`
**Created**: 2026-09-29
**Status**: Draft (spec only; nothing built, no art made)
**Source of truth**: `docs/10-viewer-and-interaction.md` will carry AC-V79 … AC-V88 (written below first; ported into the doc when the code is verified, per `CLAUDE.md` "docs are written once, at the end") and ADR-0050 (draft beside this file). The doc governs on any conflict.
**Intent**: `intent/combat-sprites.md` (accepted, owner, 2026-09-29: GPT Image 2, pixel art at FFT size, Briar first, the walk slides, two facings mirrored to four).
**Constitution**: honors Principle V (determinism). Nothing in `src/sim` changes state, reads a clock or draws a roll. One pure path helper is added.

## Overview

Every unit on the board is a flat diamond token drawn in code (`drawUnit`, `src/render/iso.ts`).
After this slice, **one** unit, Briar (`pc-briar`), is drawn from a pixel-art sprite sheet:
she stands, breathes, walks along her path, shoots her bow, and flinches when hit.
Every other unit, friend or foe, keeps the diamond token, drawn byte-for-byte as today.
The art is made in GPT Image 2 by the owner from prompts this slice writes; the code ships
against a placeholder sheet until the real one is approved.

## What today's viewer already gives us

| Thing | Where | Reused as |
|---|---|---|
| Motion is cosmetic catch-up; never blocks input, never in the sim | `src/render/motion.ts` header, ADR-0032 | The sprite clock lives in the same place, sampled by the page |
| Impact beat: recoil, white flash, HP drain, 400 ms; damage numeral 1500 ms | `MOTION_MS` | The hit animation plays inside the same 400 ms |
| Team colour is the one friend/foe signal | `drawUnit`, `teamColor` in `game.ts` | Kept under the sprite as a coloured base |
| Portrait wiring keyed on unit id, with a boot check | `PORTRAIT_BY_UNIT`, `campaign-data.ts` | The same shape for sprites: `SPRITE_BY_UNIT` |
| Reduced motion branch | `prefersReducedMotion`, `iso.ts` | Sprite animation collapses to one frame |
| Enemy turns pace themselves, 800 ms at x1 | `pacer.ts`, ADR-0046 | Untouched. Enemies stay tokens |

## User Scenarios & Testing

### User Story 1 - Briar stands on the board as a person (P1)
On any battle, Briar's tile shows her sprite, feet on the tile's top face, facing the way the sim says she faces. She breathes (idle loop). Her HP bar, active ring and KO crystal are unchanged.

**Acceptance scenarios**
1. **Given** battle 1 loaded, **When** the board is drawn, **Then** Briar's tile draws from the sheet named `briar` and no diamond is drawn on that tile.
2. **Given** Briar facing N, **When** she is drawn, **Then** the back-facing row is used; facing S uses the front row; E and W use the same rows mirrored.
3. **Given** Vance (also an archer), **When** drawn, **Then** he is still a diamond token, pixel-identical to a build without this slice.

### User Story 2 - Briar walks (P1)
When Briar's move is committed, the sim moves her at once. On screen she slides tile by tile along a path the sim's own movement rules allow, 150 ms per tile, walk frames cycling, facing turning with each step.

**Acceptance scenarios**
1. **Given** a path that must go round a high tile, **When** she walks, **Then** the drawn path is the legal one, not a straight line through the tall tile.
2. **Given** a tap during the walk, **When** it lands, **Then** it is answered against the settled state (she is already at the destination in the sim).
3. **Given** reduced motion, **Then** she appears at the destination at once.

### User Story 3 - Briar shoots (P1)
Attack (with the bow) and Aimed Shot play the shoot animation: draw, loose, an arrow travels to the target, and only then does the target's impact beat (recoil, flash, numeral) begin.

**Acceptance scenarios**
1. **Given** Briar shoots a foe 4 tiles away, **When** the commit lands, **Then** the arrow reaches the target within 300 ms and the impact beat starts on arrival, not at t=0.
2. **Given** the shot misses, **Then** the arrow still flies and the miss popup appears on arrival.
3. **Given** reduced motion, **Then** one loose pose frame shows and no arrow flies.

### User Story 4 - Briar is hit (P1)
When Briar takes damage, her hit frames play during the existing 400 ms impact beat, in place of the token's white flash. The recoil offset and HP drain are unchanged.

### User Story 5 - Everyone else is untouched (P1)
A frame of any battle with Briar hidden (KO'd or absent) is byte-identical to today's.

### Edge cases
- Briar KO'd: the crystal draws, the sprite does not. Revived: the sprite returns.
- Briar charmed: the base colour follows `effectiveTeamOf`, as `unitColor` does today.
- The sheet fails to load: the diamond token draws, and the console names the missing file. The game never blocks on art.
- Briar's move is a zero-length move (staged and cancelled): no walk plays.
- Two beats overlap (a counter): the second beat replaces the first, as `MotionDirector` does today.
- Speed x2/x3 (ADR-0046) scales the enemy pause only. Briar's animations keep their lengths.

## The animation set (Briar, slice 1)

| Name | Frames | Loop | ms per frame | Plays when |
|---|---|---|---|---|
| `idle` | 4 | yes | 250 | Always, when nothing else plays |
| `walk` | 4 | yes | 75 (2 frames per tile at 150 ms) | A committed move, along the path |
| `shoot` | 5 | no | 80 (400 ms total) | Attack with a bow, Aimed Shot |
| `act` | 3 | no | 130 | Any other action (item, non-bow skill, Wait's turn-end face) |
| `hit` | 2 | no | 200 | Inside the impact beat |

Two facings drawn: `front` (faces S; mirrored for E) and `back` (faces N; mirrored for W).
Which of E/W mirrors which is fixed by the isometric projection: `project()` puts +x down-right and +y down-left, so **E shows the front row flipped and W shows the back row flipped**. This is an assumption about the art, to be checked on the first rendered frame.

## The sheet

| Property | Value |
|---|---|
| Cell | 64 x 96 px, a 2x asset for a 32 x 48 world-unit figure (the tile is 64 x 32 world units) |
| Layout | One PNG per facing: `briar-front.png`, `briar-back.png`. One row per animation in the table's order, frames left to right, unused cells transparent |
| Anchor | Bottom-centre of the cell sits on the tile's top-face centre (`top` in `drawUnit`); the shadow ellipse stays under it |
| Colour | Indexed or RGBA PNG, transparent background, no anti-aliasing at the outline |
| Size cap | Each file well under 3 MiB (`check:assets`); expected under 100 KiB |
| Where | `data/campaign/story/sprites/` beside the portraits, with `placeholder-front.png` / `placeholder-back.png` in git so tests run without approved art |
| Manifest | `data/campaign/story/sprites/briar.json`: `{ "cell": [64, 96], "animations": { "idle": { "frames": 4, "ms": 250 }, ... } }`, validated at boot like the portrait check |
| Drawing | `ctx.imageSmoothingEnabled = false` around every sprite `drawImage`; drawn at the camera's tile scale (about 1.19 at 832x328), so slight non-integer scaling is accepted this slice |
| Team colour | The shadow ellipse gains a 2 px ring in the team colour. The active ring, HP bar and crystal are as today. The facing pip is not drawn for a sprite unit |

## Art production (the owner runs the prompts)

1. `docs/visual/sprites/README.md` records the style lock, the prompts, the settings and the delivered sizes, in the shape of `docs/visual/portraits/reference/README.md`.
2. Prompts follow the `gpt-image-2-prompting` skill. The reference image is Briar's shipped portrait (`archer-f.png`, `PORTRAIT_BY_UNIT["pc-briar"]`) so hair, colours and gear match. FFT's sprite proportions (about 2.5 heads tall, big head, small feet) are the style reference. Exact FFT frame sizes are `[UNCERTAIN]` here; the owner's accepted size is 32 x 48.
3. GPT Image 2 will not return a clean sheet. Expect: generate one pose per prompt, then a cleanup pass (crop to the cell, palette snap, alpha) with a script in `scripts/` that the engineer writes. The owner approves the cleaned frames before they are wired (taste rule).
4. Order: idle front, idle back, walk front, walk back, shoot front, shoot back, hit, act. The code ships against the placeholder first; the art lands file by file.

## Requirements (AC-V79 … AC-V88, to be ported into `docs/10`)

- **AC-V79 (Briar draws from the sheet, by identity):** `SPRITE_BY_UNIT["pc-briar"]` SHALL be `"briar"`, and `drawUnit` for a unit with a sprite entry SHALL call `drawImage` with an image whose `src` ends in `briar-front.png` or `briar-back.png`, and SHALL NOT paint the diamond path. *Fixture:* battle 1 roster; a canvas spy records `drawImage` sources and `fill` calls on the token path. *Discriminator:* `naturalWidth` alone cannot tell Briar's sheet from Vance's future one; the `src` name is asserted. *Mutation:* map `pc-briar` to `placeholder`; the identity assertion MUST go red.
- **AC-V80 (everyone else is byte-identical):** For every unit without a `SPRITE_BY_UNIT` entry, a frame of the board SHALL be byte-identical to the frame the previous build draws. *Fixture:* battle 1 with Briar removed from the roster (purpose-built), rendered with and without the sprite module; `getImageData` diff = 0 pixels. *Mutation:* draw the team ring for token units too; the diff MUST be > 0.
- **AC-V81 (facing selects the row and the flip):** Facing S draws `front` unflipped; N draws `back` unflipped; E draws `front` flipped; W draws `back` flipped. *Fixture:* one unit, four battles differing only in `facing`; the spy records the source and the sign of the `scale` transform. *Discriminator:* a renderer that ignores facing passes S and fails the other three. *Mutation:* swap the E/W rows; two cases MUST go red.
- **AC-V82 (the walk follows a legal path):** `movePath(grid, units, unitId, to)` in `src/sim/grid.ts` SHALL return a sequence of adjacent tiles from the unit's tile to `to` in which every step obeys `moveRange`'s rules (height delta within `jump`, enemies block, allies passable), and SHALL be pure: no state change, no RNG, deterministic for equal inputs. *Fixture:* a purpose-built 3x3 grid with a height-9 centre tile, unit at (0,1), `to` at (2,1), `jump` 2. The straight path is illegal; the helper MUST route via (0,0)/(1,0)/(2,0) or the mirror row, and the choice MUST be the same on every call (assert twice). *Mutation:* return the straight line; the height check MUST go red. `check:rng` stays green.
- **AC-V83 (the walk is cosmetic and 150 ms per tile):** After a move commit the sim state SHALL already hold the destination, and `sampleBeat` at t = 150 x k ms SHALL place the sprite on the k-th path tile. *Fixture:* a 4-tile path; sample at 0, 150, 300, 450, 600 ms. *Discriminator:* a walk that moves the sim state late fails the "destination at t=0" read of `Session.state`. *Mutation:* set the per-tile time to 100 ms; the t=450 sample MUST go red.
- **AC-V84 (the impact waits for the arrow):** For a bow Attack or Aimed Shot the beat SHALL carry `impactDelayMs` equal to the arrow's flight time (60 ms per tile of Chebyshev distance, capped at 300), and the impact reaction (recoil, flash, numeral) SHALL begin at that offset. For a melee blow the delay SHALL be 0. *Fixture:* one commit with the Long Bow at distance 4 (`impactDelayMs` 240) and one with a sword at distance 1 (0); `sampleBeat` at t=100 shows no recoil for the bow case and full recoil for the sword case. *Mutation:* fix the delay at 0; the bow case MUST go red.
- **AC-V85 (the hit frames replace the flash):** During the impact beat a sprite unit SHALL draw its `hit` row and SHALL NOT paint the white flash; a token unit SHALL still flash. *Fixture:* Briar and Vance both struck in one purpose-built AoE; the spy records which unit got a white fill. *Mutation:* drop the sprite branch; Briar's white fill MUST appear.
- **AC-V86 (reduced motion collapses to one frame):** With `prefersReducedMotion()` true, `idle` SHALL show frame 0 only, the walk SHALL place the sprite at the destination at t=0, `shoot` SHALL show its last frame, and no arrow SHALL be drawn. *Fixture:* the same beats with the flag stubbed. *Mutation:* ignore the flag in the walk; the t=0 position MUST go red.
- **AC-V87 (the manifest is validated at boot, and a missing sheet falls back):** A manifest whose `frames` disagree with the sheet's width SHALL fail the boot check with the file named. A sheet that fails to load SHALL leave the diamond token drawn. *Fixture:* a manifest claiming 6 idle frames against a 4-frame placeholder; a `src` pointing at a missing file. *Mutation:* skip the width check; the first case MUST go green wrongly, so the test asserts a throw.
- **AC-V88 (nothing in the sim reads a clock):** `check:rng` SHALL stay green over `src/sim` and the three render files it scans, and `sampleBeat` SHALL remain pure (two calls, equal inputs, equal output including sprite frame index). *Mutation:* read `performance.now()` inside `spriteFrame()`; the purity test MUST go red.

### Functional requirements
- **FR-001**: `SPRITE_BY_UNIT` maps unit id to sheet name; only `pc-briar` is mapped this slice.
- **FR-002**: `drawUnit` takes an optional sprite lookup; absent, it draws exactly as today.
- **FR-003**: The sprite frame index is a pure function of `(animation, t)` computed by `sampleBeat` and handed to `draw` in `MotionState`.
- **FR-004**: `movePath` lives in `src/sim/grid.ts`, is pure, and is the only sim change. No schema bump.
- **FR-005**: The placeholder sheets and `briar.json` are in git; approved art replaces the placeholder files under the same names.

## Out of scope (this slice)
Other party members, every enemy, a cast animation, a KO fall (the crystal stays), eight facings, jump arcs, sound, the ×2/×3 toggle scaling animations, sprite hit-testing (taps still use tiles).

## Risks
- **GPT Image 2 is not a sprite tool.** Frame-to-frame consistency is the open risk. If cleanup cannot make four idle frames agree, fall back to two frames (idle, idle-blink) and say so.
- **Non-integer scale shimmers.** At 1.19x, pixel art will show uneven pixels. If the first frame looks wrong, the fix is snapping the sprite scale to 1x or 2x independent of the tile scale; that is a follow-up, not this slice.
- **Facing mirror assumption** (E = front flipped) is unverified until the first rendered frame.
