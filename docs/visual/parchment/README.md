# Visual proof — the parchment treatment (ADR-0028)

Four frames from `e2e/playtest-capture.spec.ts`, downscaled to 900px. **Two of them are stale** — the briefing split into two views on 2026-09-08 (ADR-0041) and the party grew to six; nobody re-shot the downscaled copies, and the rows below say which. Fresh captures land in `visual-artifacts/playtest/` on `npm run test:visual`. Every one is a
capture of the **built** site, and `shot()` asserts the screen's `data-testid` is on
screen before the shutter, so a frame cannot be labelled as a state it is not in.

| Frame | What it shows |
|---|---|
| `01-title.jpg` | The title sheet. The playtest box is deliberately **not** a second sheet — it is a dashed aside on the dark table, so it stops competing with New Game. |
| `02-briefing-battle-1.jpg` | Briefing and prep at 0 AP, first battle. The learn ledger is full width; the chassis spans the sheet. **STALE since ADR-0041 (2026-09-08):** the briefing is now two views. The live capture writes `02c-briefing-party-select` and `02d-briefing-member-equipment` / `02e-…-skills`; this downscaled frame was not re-shot. |
| `04-battle-1-start.jpg` | The battle screen — the one surface that stayed **dark**. The legend swatches quote the board's own colours, so they have to sit on the board's ground. |
| `08-briefing-battle-5-full-prep.jpg` | The finale briefing after five battles of earnings — the ledger with prices affordable and spent, the red LEARNED stamp, all four members banked. **STALE since ADR-0041 (2026-09-08):** the party is six, and the live capture split this into `08-briefing-battle-5-party` (party select) and `08b-briefing-battle-5-full-prep` (member detail). This downscaled frame is the pre-split four-member one. |

## What these frames do NOT show

Contrast. A screenshot is the same evidence whether the ink clears the accessibility bar
or misses it by half — which is exactly how the gold labels shipped at **1.55:1** in the
first draft and looked fine. That claim is carried by `e2e/contrast.spec.ts` and stated as
**AC-V15** in `docs/10`; see ADR-0028 for why axe-core cannot make it here.

They also say nothing about whether the prep screen is understandable. That question is
still open and still needs a person (`docs/NEXT.md`).
