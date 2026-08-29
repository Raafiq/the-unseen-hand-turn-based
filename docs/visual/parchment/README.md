# Visual proof — the parchment treatment (ADR-0028)

Four frames from `e2e/playtest-capture.spec.ts`, downscaled to 900px. Every one is a
capture of the **built** site, and `shot()` asserts the screen's `data-testid` is on
screen before the shutter, so a frame cannot be labelled as a state it is not in.

| Frame | What it shows |
|---|---|
| `01-title.jpg` | The title sheet. The playtest box is deliberately **not** a second sheet — it is a dashed aside on the dark table, so it stops competing with New Game. |
| `02-briefing-battle-1.jpg` | Briefing and prep at 0 AP, first battle. The learn ledger is full width; the chassis spans the sheet. |
| `04-battle-1-start.jpg` | The battle screen — the one surface that stayed **dark**. The legend swatches quote the board's own colours, so they have to sit on the board's ground. |
| `08-briefing-battle-5-full-prep.jpg` | The finale briefing after five battles of earnings — the ledger with prices affordable and spent, the red LEARNED stamp, all four members banked. |

## What these frames do NOT show

Contrast. A screenshot is the same evidence whether the ink clears the accessibility bar
or misses it by half — which is exactly how the gold labels shipped at **1.55:1** in the
first draft and looked fine. That claim is carried by `e2e/contrast.spec.ts` and stated as
**AC-V15** in `docs/10`; see ADR-0028 for why axe-core cannot make it here.

They also say nothing about whether the prep screen is understandable. That question is
still open and still needs a person (`docs/NEXT.md`).
