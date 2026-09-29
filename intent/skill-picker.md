# Intent: the player picks the skill
Author: the owner. Date: 2026-09-19. Status: **shipped (ADR-0048, PR #75, 2026-09-29)**.

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
- The same applies to Attack: it lists nothing, but when no foe is in reach it shows the short reason. Weapon attacks (an archer's shot) are not green-lit; they need an engine change (`intent/weapon-range.md`).
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

## Owner correction (2026-09-29, reference `coverage/frames/skill-picker/owner-ref-skill-row.webp`)
The shipped strip (a framed parchment box, tall two-line cards, third card clipped at `max-width: 280px`) drifted from the approved design. Replace it with one compact horizontal row of chips, anchored around the SKILL button, 3–5 px above the ribbon. No enclosing box. Chips 44–48 px tall, thin dark ink/iron edge, light depth, compact padding, name on one line as primary text, "Reach N" smaller and quieter. Three ordinary skills fit at 832×328; no chip or word is ever clipped. Scrolling only when a unit has more skills than fit, and then show a small edge of the next whole chip as a cue. States: default parchment, selected with a restrained gold outline, unavailable muted and clearly inert. Picker closes on pick; Cancel uses the ribbon. No icons for now. Do not change the unit plate, command buttons, rail, target plate, tile colours, board size or camera.

## Owner correction 2 (2026-09-29, reference `coverage/frames/skill-picker/owner-ref-vertical-menu.webp`) — SUPERSEDES the horizontal row above
Reject the horizontal chip row. After comparison with FFT/WotL, use a compact VERTICAL scrolling ability menu, like FFT's nested battle menus.
- SKILL opens a narrow parchment-and-iron menu upward from/near the SKILL button. One skill per row, one column, never spread horizontally. No cards, chips, pills, tabs or carousel.
- Rows ≥44 px. About 3–4 rows visible at 832×328; more skills scroll vertically inside the SAME fixed-size window (never grows toward the screen edge), with a restrained up/down continuation indicator when more exist.
- Rows show the name only — no "Reach N" under each name. Selection uses the game's existing gold pointer/highlight (a `›` pointer and a gold row tint), not a whole-row button.
- The existing bottom-right target/info plate shows the HIGHLIGHTED skill: name + "Reach N". A muted (unusable) skill stays in the list; when highlighted, the plate says why, e.g. "Holy / No foe in reach · Reach 5".
- Tap flow (owner, 2026-09-29): the menu opens with the first skill highlighted and the plate showing it. Tapping a row highlights it (pointer moves, plate updates). Tapping the highlighted row again picks it: the menu closes and the reach paints. A muted skill can be highlighted to read its reason but cannot be picked.
- The menu may overlap a narrow part of the board while open. It disappears on pick or cancel. Cancel uses the ribbon.
- No icons for now (owner, 2026-09-29). No description line — abilities carry no description text in `data/base-pack.json`.
- Do not change the battlefield, command ribbon, unit plate, turn rail or targeting.

## Final refinement (owner, 2026-09-29, reference `coverage/frames/skill-picker/owner-ref-vertical-3rows.webp`)
Keep the vertical menu. Show exactly 3 rows (46 px each) at 832×328 in the smallest fixed window that holds them; more skills scroll vertically. Keep the gold pointer, highlighted row and muted rows; details stay in the bottom-right plate. Thinner, lighter dark/iron frame — a compact FFT battle command window, not a modal. ▲/▼ only when more exists above/below. Never a partial row (scroll snaps to whole rows). Never a state that looks like a duplicated or wrapped entry. Nothing else in the HUD changes.

## Last two fixes (owner, 2026-09-29) — the 3-row window is approved; no other visual change
1. The highlighted skill is always visible. Keyboard/controller: moving past the top or bottom visible row scrolls exactly one whole row. Touch: tapping a visible row highlights it. After a touch-drag or wheel scroll settles, the highlight moves to a visible row (preferred). No stable state may show a plate for a skill that is not visibly highlighted.
2. Frame separation: keep the 2 px border; add a subtle warm/brass outer keyline or a faint 1–2 px shadow. No glow, no modern drop shadow, no thick outline, no bigger footprint.
Unchanged: 3 rows, 46 px, menu position and width, typography, gold selected row, ▲/▼, plate placement, ribbon, battlefield.
