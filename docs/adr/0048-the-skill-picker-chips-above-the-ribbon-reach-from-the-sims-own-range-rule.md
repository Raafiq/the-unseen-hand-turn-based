# ADR-0048 — The skill picker: chips above the ribbon, reach from the sim's own range rule

- **Status:** Accepted — the owner, 2026-09-19 ("go") then 2026-09-24 (frame approval,
  `coverage/frames/skill-picker/*-pass1-*`, plus four follow-up decisions recorded below).
- **Date:** 2026-09-24
- **Deciders:** the owner (`intent/skill-picker.md`).
- **Amends:** `docs/10` §3 (Cancel's "most recent step" rule), §5 (the action set),
  §6 (AC-V23…V29, previously reserved for `docs/proposals/action-menu.md`), and retires
  `docs/defects.md` §1 and §2.
- **Acceptance Criteria:** AC-V23…AC-V29, authored into `docs/10` §6 in the same slice as
  the code (`src/render/session.ts`, `hud.ts`, `iso.ts`, `panels.ts`).

## Context

`docs/defects.md` §1: the board picks the player's ability for them. `targetOptions`
(`src/render/preview.ts`) took the first matching ability in `unit.abilities` order, so a
unit that learned a second skill in prep could never have it chosen by a click. The prep
screen's LEARN overlay (ADR-0042) already lets the player buy a second, third skill; the
battle screen gave them no way to use it.

`docs/proposals/action-menu.md` (2026-09-02) proposed a fuller fix — a root Move/Act/Wait
menu, a grouped command list, a green "heal" colour with its own legend, keyboard coverage
and colour-distance floors. It reserved AC-V23…V29 and was never built: the combat-revamp
shell (ADR-0043) landed first and changed the screen it would have modified underneath it.

## Options considered

1. **Build the full action-menu proposal as written.** Correct in shape but large: a new
   menu tree, a green colour that clears 36 dE00 comparisons, a redrawn legend, keyboard
   coverage. Rejected for this slice — the owner asked for the narrower fix
   (`intent/skill-picker.md`), not the whole proposal.
2. **A chip sheet that opens only for 2+ skills, reach from the sim's own range rule, no
   new colour.** Fixes the defect with no new engine command and no new palette work.
   **Chosen.**

## Decision

### 1. The picker `[ENHANCEMENT]`

Pressing **Skill** with two or more learned abilities opens a small sheet of chips —
horizontal, parchment-styled, floating above the command ribbon over the board's bottom
edge — never a full-width band. One chip per real ability in `unit.abilities` order,
`≥44` CSS px tall, reading `Reach N` when legal or the ability's own reason when not. The
player picks one; the sheet closes; the board paints that skill's reach; the target plate
names the picked skill by identity ("AIMED SHOT · Reach 5 · Pick a target"), not just that
some skill was picked.

**A unit with exactly one skill skips the sheet** and auto-picks it, going straight to
targeting as before this slice — unchanged behaviour, just no longer coincidentally also
the only behaviour. **A unit with zero skills shows no chips at all** (`hud.ts`'s
`options.length > 1` guard).

**Attack gets the same reach-plus-reason treatment**, without a sheet — there is only one
Attack. Selecting it with no foe in reach paints its reach and shows the reason in the
target plate rather than silently doing nothing.

### 2. Reach is the sim's own rule, not a redraw `[BASELINE]`

`Session.reach()` calls `inAbilityRange` — the same predicate `PLAYER_IDLE`'s own target
highlighting already used — over the picked ability's `range`, from the actor's tile or,
once a move is staged, the staged tile. No geometric radius, no viewer-side reimplementation.
Painted in a single new token, `FIELD_THEME.reach` (pink), distinct from the existing move
highlight and target colours.

### 3. Unavailable is selectable, never hidden `[BASELINE]`

A skill with no legal target from here is still a real chip: selectable, its reach still
paints, its reason shows in the target plate ("No foe in reach", "No ally in reach", …).
Selecting it and tapping a tile anyway is refused — `onPick` does not stage a target for it,
and Confirm has nothing to commit. In the browser this is the strongest form of "cannot fire
it": Confirm is genuinely `disabled`, not merely refused on click. This mirrors the honesty
rule the target plate already follows for a legal-but-unhit target — an unreachable ability
is shown, not deleted, same as `docs/proposals/action-menu.md` §3 argued.

### 4. Cancel undoes the most recent step `[ENHANCEMENT]`

Review finding, not the original design: **Cancel unwinds the most recently taken step, not
always "the picker's own pick first."** Attack → stage a move → Cancel undoes the move (the
later step) and leaves Attack selected. Skill → open the sheet → pick a chip → Cancel
returns to the open sheet with the pick cleared; a second Cancel returns to root. `docs/10`
§3 is amended with this rule rather than left to read as "Cancel always unwinds the
action-selection level first," which the first draft implied and a review fixture caught
red.

### 5. No new engine command `[BASELINE]`

`CommandSchema` stays `move | act | wait`. The picker is pure viewer-side selection over
the sim's existing `inAbilityRange` and `unit.abilities` projections — `TurnDraft` is
unchanged, the commit shape is unchanged (`act`, `order: "before"` when a move is staged).
`GameApi` gains read-only seams (`commandMode`, `skillOptions`, `selectedSkill`, `reach`,
`actionReason`) and one test-only seam (`grantTestAp`, mirroring `CampaignShell.updateParty`'s
own test usage) — no new command, no new save shape.

### 6. Owner decisions folded in (2026-09-24)

- A unit with exactly one skill goes straight to targeting; the sheet opens only for two
  or more.
- An unavailable skill/Attack is dimmed and shows a short reason; Attack with no foe in
  reach shows the same treatment.
- Reach paints from wherever the unit currently stands, actor's tile or staged tile — never
  the union over every reachable tile.
- Approved design: List B (horizontal parchment chips), reach colour A (filled pink),
  reason B (the existing target plate). Chips are the floating strip with the board visible
  around them, not a full-width band; on pick they close and the plate names the skill.

## Consequences

- **`docs/defects.md` §1 is retired**, this branch — the committed fix is the discriminator
  (`session.test.ts`, "AC-V23"). Its third evidence row (basic Attack is melee whatever the
  weapon) is **not** closed by this slice and is carried forward as `intent/bow-attack.md`.
- **`docs/defects.md` §2 is retired** in the same pass — it was already fixed by ADR-0043's
  `isClickTargetable` change and had gone stale reading live; corrected here rather than
  left for a future agent to re-discover.
- **`docs/proposals/action-menu.md`'s AC-V23…V29 are superseded** by `docs/10`'s own
  AC-V23…V29, which this ADR authors. The proposal's green colour, legend and keyboard/
  colour-distance halves remain open, unbuilt, and are **not** claimed by this slice.
- **`FIELD_THEME.reach` has no colour-distance floor today** — `docs/proposals/
  action-menu.md` AC-V29's own-ground/cross-ground dE00 sweep was never extended to it.
  Named here so it is not assumed covered by the sweep that guards `highlight`/`target`.
- **No balance change.** No combat constant moves; the picker only changes which ability
  a click commits, never what any ability does.

## References

- `intent/skill-picker.md` — the owner's problem statement and both decision passes.
- `docs/defects.md` §1, §2 — the defects this closes.
- `docs/proposals/action-menu.md` — the larger proposal this narrows and partly supersedes.
- `docs/10` §3, §5, §6 (AC-V23…V29) — the amended spec.
- `src/render/session.ts`, `hud.ts`, `iso.ts`, `panels.ts`, `game-api.ts` — the code.
- `src/render/session.test.ts` ("the skill picker" describe block), `panels.test.ts`,
  `iso.test.ts`, `e2e/skill-picker.spec.ts`, `e2e/skill-picker-capture.spec.ts` — the tests.
- `intent/bow-attack.md` — the next slice, carrying forward `docs/defects.md` §1's
  unclosed third row.
