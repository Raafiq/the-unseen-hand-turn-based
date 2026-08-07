# Status badges — viewer visual proof

Committed frames + video for the "render status effects as buff/debuff badges"
slice (PR #18). Regenerated deterministically by `npm run test:visual` /
`npm run gallery`; these are the same frames the visual-tests CI job uploads and
that deploy to the GitHub Pages gallery (`/visual/`) on merge.

## Protect (buff) — green `P` on the Knight (opening frame)

![Protect buff badge on the Knight](01-protect-buff.png)

## Protect + Slow — green `P` on the Knight, red `S` on the Archer (turn 5)

Both badges sit above the HP bars, clear of the charge reticle and the
move-range highlight.

![Protect and Slow badges](02-protect-and-slow.png)

## Combat frame

![Combat](03-combat.png)

## Video (stepped run)

[`run.webm`](run.webm) — GitHub shows an inline player on the blob page.
