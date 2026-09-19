# Intent: the win / lose screen
Author: the owner. Date: 2026-09-19. Status: accepted (owner, 2026-09-19).

## Problem
A battle ends with one text line in the ribbon ("Battle over") and a Continue button.
There is no moment that says you won or lost. The board just stops.
ADR-0043 reserved an overlay state for this; nothing is built.

## Proposed outcome
When a battle is decided, a full-screen overlay says Victory or Defeat in the concept look.
It shows what the party earned (AP, any weapon drop) and what comes next.
One tap leaves it: Victory goes on to the scene or prep; Defeat offers Retry.
The overlay is the only thing the player can touch until they tap it.

## Affected users and systems
- The player, at the end of all five battles.
- `src/render/hud.ts` (the ENDED ribbon path), `src/render/campaign-shell.ts` (`outcomeBeat`, the after-battle path), `src/render/stage.css`.
- `docs/10` §3 state table and a new AC letter; ADR-0043 §4 already allows it.
- Browser specs that read `OBJECTIVE_BANNER` text to prove a battle ended.

## Constraints
- Same concept look as the title, scene player and briefing (ADR-0040, ADR-0041).
- Text contrast is measured, not eyeballed (ADR-0028).
- The outcome is the sim's verdict; the overlay never re-derives it.
- Asserted at 832×328 and 832×384 only.
- Frames approved by the owner before the engineer starts (taste rule).

## Decided by the owner (2026-09-19)
- The overlay shows the verdict plus what the party earned (AP, a weapon drop).

## Open questions
- Does Defeat offer Retry from the briefing, or only "back to title"?
- Draw, timeout and stalemate: shown as Defeat, or with their own line?
