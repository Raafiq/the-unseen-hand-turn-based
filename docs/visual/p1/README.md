# P1 visual evidence

Curated screenshots + a run video captured from the Playwright visual tests, kept
here as static PR-review evidence. The live `visual-artifacts/` directory is
gitignored (regenerated in CI, deployed to GitHub Pages under `/visual/`); these
are the committed stills so a reviewer sees the customization pillar without
downloading a CI artifact.

Regenerate with `npm run test:visual` (then `npm run gallery`).

## Battle viewer
- `01-initial.png` — deploy
- `02-closing-in.png` — approach
- `03-combat.png` — charged spell + HP
- `04-aftermath.png` — resolution
- `run.webm` — CT scheduler running deterministically

## Prep / loadout viewer (the customization "aha")
- `05-prep-chassis.png` — the Knight's 5-slot chassis, no Secondary equipped
  (commands: Attack, Weapon Break, Armor Break)
- `06-prep-black-magic.png` — after equipping Black Magic as Secondary
  (Fire / Fire 2 / Ice / Bolt / Bolt 2 / Ice 2 join the command list)
