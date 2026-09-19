# Intent: the player picks the skill
Author: the owner. Date: 2026-09-19. Status: accepted (owner, 2026-09-19).

## Problem
The Skill button on the battle screen does not let the player choose a skill.
It takes the first skill in the unit's list (`targetOptions`, `src/render/preview.ts`).
A unit that learns a second skill in prep can never use it by hand.
This is the game picking the build's action for the player (`docs/defects.md` §1).

## Proposed outcome
When a unit has more than one skill, pressing Skill shows the list and the player picks one.
The board then paints that skill's range and targets only.
A skill with no legal target is still listed, so the player can see what the build has.
The Attack button stays as it is: one basic swing.

## Affected users and systems
- The player, on every battle: the build's second and later skills become usable by hand.
- `src/render/session.ts` (`setCommandMode`), `src/render/preview.ts` (`targetOptions`), `src/render/hud.ts` (the ribbon).
- `docs/10` §5 and AC-V23…V29 (reserved for this), `docs/defects.md` §1 (retire), `docs/proposals/action-menu.md` (mark what shipped).
- The engine viewer at `/viewer.html` is out of scope.

## Constraints
- The sim owns legality; the viewer only picks which of the sim's own options to show.
- Nothing covers the board at rest (ADR-0043); the list is a temporary overlay that closes on pick or cancel.
- Asserted at 832×328 and 832×384 only.
- No new engine command. `Item` and `Defend` stay unwired.
- No rendering of a chosen frame before the owner approves it (taste rule).

## Decided by the owner (2026-09-19)
- The list is a small sheet just above the command ribbon, over the board's bottom edge.

## Open questions
- When a unit has exactly one skill, does Skill still show a one-row list, or go straight to targeting as today?
- Does a skill with no legal target say why (out of range, no ally hurt), or just stay dim?
