# Quickstart: prove Briar is a sprite

1. `npm install`, then `bash scripts/quiet.sh npm run check` — green before you start.
2. Unit tests, per step: `bash scripts/quiet.sh npx vitest run src/sim/grid.test.ts src/render/iso.test.ts src/render/motion.test.ts src/render/sprites.test.ts`.
3. Mutations named in the spec (AC-V79…V88): run each once and see the named test go red, then revert.
4. Build, then browser: `npm run build && bash scripts/quiet.sh npx playwright test e2e/sprites.spec.ts` (Playwright does not rebuild on its own).
5. Look at the frames in `coverage/frames/sprites/` at 832x328 and 832x384: Briar as a sprite, everyone else a token, walk and shot mid-motion.
6. `npm run check:rng` stays green. `npm run state` last, after the docs port.
7. Art: `python3 scripts/sprite-sheet.py docs/visual/sprites/raw/ data/campaign/story/sprites/briar-front.png` once the owner hands back poses; the boot check accepts or names the fault.
