# Intent: combat sprites and animations
Author: the owner. Date: 2026-09-29. Status: accepted (owner, 2026-09-29): all five questions answered A.

## Problem
"Is it too early to think about the combat sprites and animations? I personally just want to work on it as a motivation."
Every unit on the battle board is a flat diamond token in a team colour (`drawUnit`, `src/render/iso.ts`).
Battle sprite art was deferred on 2026-09-12; the owner un-deferred it on 2026-09-29.
The reason is motivation, not a defect. That is enough.

## Proposed outcome
A party member on the board looks like the person in their portrait, and moves.
First slice: ONE character with idle, walk, attack and hit, plus a bow shot for Briar.
The other five, and the enemies, keep the diamond token until they get their own sprites.

## Affected users and systems
- The player: the board shows people, not tokens.
- `src/render/iso.ts` (`drawUnit`), `src/render/motion.ts` (the cosmetic motion layer), `src/render/campaign-data.ts` (who wears which art).
- New image assets under `data/campaign/story/` or `src/render/`, each under the 3 MiB cap (`check:assets`).
- `docs/10` (viewer spec, new AC-V rows), `docs/visual/` (style record and prompts), a new ADR.
- The "Ranged weapon attacks" slice: Briar's bow shot animates what that slice makes Attack do.
- Future direction: six fixed characters with their own story. Sprites are per character, not per job.

## Constraints
- Sprites are per character (Vance, Kest, Briar, Ottoline, Corin, Isla), never per job.
- Motion stays cosmetic: it never blocks input, never gates a step, never touches the sim (`motion.ts` header, ADR-0032). Determinism is P0.
- Team colour is the one thing that says friend from foe. A sprite must keep that readable.
- Assert only 832x328 and 832x384 (ADR-0041). A tile face is about 76x38 CSS px there.
- Enemy turns pace themselves, 800 ms at x1 (ADR-0046). The toggle scales the pause, not any animation.
- The art must sit with the portrait style lock (ADR-0035, GPT Image 2) and the painted ground (ADR-0030).
- No balance or depth work. No engine change.
- Frames are approved before an engineer starts (taste rule).

## Decided
- Made with GPT Image 2 from the portrait style lock; the owner runs the prompts (owner, 2026-09-29).
- Pixel art at FFT size, about 32x48 at 1x, shipped as a 2x sheet (owner, 2026-09-29).
- Briar goes first (owner, 2026-09-29).
- The walk slides along the path, tile by tile, as cosmetic catch-up. The sim still moves the unit at once (owner, 2026-09-29).
- Two facings drawn (toward the camera, away from it), mirrored to four (owner, 2026-09-29).
- Enemies stay diamond tokens this slice (default picked by Claude; the owner did not object).

## Open questions
- None. The spec comes next.
