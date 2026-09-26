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
The Attack button stays one basic swing and goes straight to targeting. When no foe is in reach, it shows the same short reason a dimmed skill shows (owner, 2026-09-24).

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

## Decided by the owner (2026-09-24)
- A unit with exactly one skill: Skill goes straight to targeting, as today. The list opens only for two or more.
- A skill with no legal target is dimmed and shows a short reason (for example "Out of range", "No ally hurt").
- The same applies to Attack: it lists nothing, but when no foe is in reach it shows the short reason. Weapon attacks (an archer's shot) are not green-lit; they need an engine change (`intent/bow-attack.md`).
- After Attack or a skill is picked, the board colours that action's full reach around the unit — from where it stands, or from the staged move tile once a move is staged — so the player can see where to move to get in range. Not the union over every reachable tile.

## Open questions
- None.

## Approved design (owner, 2026-09-24, frames `coverage/frames/skill-picker/*-pass1-*`)
List B (horizontal parchment chips above the ribbon), reach colour A (filled pink), reason B (the target plate). The owner's implementation notes:
- Chips: ≥44 px tall, readable names, horizontal scroll when they do not fit (never shrink). Selected, available and unavailable are clearly distinct. Only the active unit's real skills. Shown only while choosing; gone on pick or cancel; never a permanent height cost.
- Reach: pink for action reach only; blue move range unchanged; terrain and tile edges still visible; the selected target distinct from the rest of the reach; targetability never shown by colour alone. Reach follows the action's real targeting rules, not a geometric radius.
- Reason: in the existing lower-right target plate, only reasons the rules can produce (e.g. out of range, no foe in reach). Stays while the invalid action or target is selected; updates or clears on change. No pop-ups.
- Flow: Skill → pick skill (shows reach) → pick target → existing target info and Counter/Blocked warnings → Confirm, or Cancel back one step. An unavailable skill can be selected to see its reach and reason, but cannot execute.
- Switching Attack/Skill clears the old reach and targets at once. One action's overlays at a time. No new permanent HUD regions.
- Verify the whole flow at 832×328: nothing needlessly covers the active unit or the target, text readable, 44 px targets, select/cancel/switch leave no stale overlay.
- Decided (owner, 2026-09-24, after review): the chips are the approved floating parchment chips with the board visible around them, not a full-width band. On pick they close and the target plate names the picked skill (e.g. "AIMED SHOT · Reach 5 · Pick a target"). No chip stays lit.
