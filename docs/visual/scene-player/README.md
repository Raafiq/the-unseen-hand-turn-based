# Scene player — what these frames show, and what they do not

Captured by `e2e/playtest-capture.spec.ts`, whose `shot()` asserts the screen's testid is
visible before the shutter. Two of these carry a stronger caption guard than that: `02a`
asserts the **More** control is still on screen, `02b` asserts it is **gone**. Without
that pair a half-revealed beat would sit under a caption saying "read".

| Frame | Shows |
| --- | --- |
| `02a-prologue-first-line.png` | The prologue on arrival: one line revealed, the name plate, the portrait frame, `LINE 1 OF 4`. |
| `02b-prologue-read.png` | The same scene read out. Three plates, four lines, controls retired, readout cleared. |
| `09-epilogue.png` | The epilogue, which stands in front of the ending screen rather than after it. |

## What they do NOT show

- **No portrait art exists.** The frame holds a ruled placeholder and a `Portrait pending`
  caption. Every portrait on screen is that same file.
- **Nothing here is evidence about onboarding.** These frames show that a scene renders
  and advances. Whether the game reads to a first-time player is still unmeasured, and
  `docs/NEXT.md` still holds that as the open question.
- **The gutter in `02b` is empty on purpose.** The last line is narration, which has no
  speaker and therefore no portrait; the column keeps its width so the text does not jump
  mid-read. An earlier build hid it outright and the whole block shifted left — found by
  opening this frame, not by any assertion.
