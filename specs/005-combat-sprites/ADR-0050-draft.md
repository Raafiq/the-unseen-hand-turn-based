# ADR-0050 — Battle units are per-character pixel sprites; Briar first

- **Status:** Draft (not yet in `docs/adr/`; number claimed 2026-09-29, 0049 is the weapon-range ADR)
- **Date:** 2026-09-29
- **Extends:** ADR-0032 (motion is cosmetic catch-up), ADR-0035 (portraits from GPT Image 2), ADR-0046 (enemy turns pace themselves). Reverses the owner's 2026-09-12 deferral of battle sprite art.

## Context
Units are diamond tokens. The owner wants sprites and animation, "as a motivation" (2026-09-29).
The party is heading toward six fixed characters with their own story, so art keyed on job would be thrown away.

## Decision
1. **Sprites are per character, keyed on unit id** (`SPRITE_BY_UNIT`), never per job. `[ENHANCEMENT]`
2. **Pixel art at FFT size**, about 32 x 48 world units, shipped as 2x sheets, drawn without smoothing. `[BASELINE]`
3. **Made in GPT Image 2** from the character's portrait, cleaned by script, approved by the owner before wiring. `[ENHANCEMENT]`
4. **Two facings drawn, mirrored to four.** `[BASELINE]` (FFT draws two and mirrors)
5. **The walk slides along a legal path**, 150 ms per tile, as cosmetic catch-up. The sim moves the unit at once; one pure helper `movePath` is added to `src/sim/grid.ts`. `[ENHANCEMENT]`
6. **A bow shot delays the impact beat** by the arrow's flight, capped at 300 ms. Still never blocks input. `[ENHANCEMENT]`
7. **Briar first; everyone else stays a token** until their own sheet is approved.

## Options rejected
- Painted portraits scaled down: blurs at 76 x 38 px per tile, hard to animate.
- Hand-drawn in a pixel tool: full control, too slow per frame for a motivation slice.
- One facing: cheapest, but a unit walking away with its face to the camera reads wrong.

## Consequences
- A second sprite clock in the page; `sampleBeat` grows a frame index. Nothing in the sim reads it.
- `data/campaign/story/sprites/` is a new content directory: wire it into `npm run state`'s counters.
- The facing-pip goes away for sprite units; the team ring under the sprite takes over friend/foe.
- The first rendered frame decides the E/W mirror rule and whether 1.19x scaling is acceptable.
