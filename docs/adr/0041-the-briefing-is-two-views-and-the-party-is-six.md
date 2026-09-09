# ADR-0041 — The briefing is two views, the party is six, and hand-play is suspended until the combat revamp

- **Status:** Accepted (superseded in part by ADR-0042, 2026-09-09 — the member view's
  three tabs)
- **Date:** 2026-09-08
- **Deciders:** the owner, 2026-09-07 and 2026-09-08, in words.
- **Supersedes in part:** ADR-0040's second amendment (option A) **for the briefing screen
  only** — the title screen and the scene player are untouched.
- **Suspends:** ADR-0027's pacing claim (the unprepped party loses the finale) and the two
  tests that carried it, until the combat revamp.
- **Owner docs:** `docs/10` AC-V16, AC-V34, AC-V36, AC-V37, AC-V51…AC-V59; `docs/11` §1, §3.

## Context

> **Amended 2026-09-09, superseded in part by ADR-0042.** Two lines below no longer hold:
> "a three-tab detail leaf on the right" (Context, next paragraph) and "a card row and a
> three-tab detail no longer split 328 px" (Consequences). ADR-0042 replaced the member
> view's three tabs with one dossier sheet and a 1×6 portrait rail. Everything else here —
> two views, the six-member party, the deploy toggle's removal, hand-play suspension —
> stands.

Option A shipped the briefing as one two-pane screen: a portrait-card roster on a left
leaf, ~~a three-tab detail leaf on the right~~ (superseded by ADR-0042). On the owner's
phone in landscape both panes
compete for 328 px of height, and the per-card deploy pip made a roster card carry two
different taps. Three separate things then landed together and each falsified something
written down:

1. The owner ruled the briefing into **two views**, not two panes.
2. The party grew from four to **six**, and every member had to have an approved face.
3. Combat is being revamped, so hand-play of the campaign is **suspended** rather than
   patched — which retires ADR-0027's measured pacing profile.

## Options considered

1. **Keep the two panes and shrink the cards.** Rejected: at six members a 123 px card on
   a 187 px approved frame is already unapproved art; halving the leaf makes it worse.
2. **Keep the deploy toggle and author six placements now.** Rejected: the owner's call is
   that all battles field six, so a per-card toggle is a control with nothing to choose.
3. **Two views, deploy authored by the encounter (chosen).** One thing per screen at the
   owner's fold, and the party view states honestly what the encounter actually fields.

## Decision

**1. `#screen-briefing` is two views.**

*Party select* is six portrait cards in one 6×1 row, a read-only line — "This battle
fields N of 6. Tap a member to manage them." — an "In camp" caption on every card the
encounter does not field, and the wax Deploy plate on the foot rail. Tapping a card opens
*member detail*: Equipment / Skills / Profile full-width, a `member-back` plaque, and a top
rail reading "Battle N of 5 · managing \<name\>".

View state is a module-level `let briefView` in `src/render/game.ts`, written only by
`setBriefView` and applied by `applyBriefView`. It resets to `party` on every transition
into the briefing, in `renderScreens` — not in `applyBriefView`, which every ordinary
repaint calls and which would then yank the caret out of a select mid-edit.

**2. The deploy toggle is gone, and a stale pick cannot survive.**

There is no per-card deploy control. `continueGame` (`src/render/campaign-shell.ts`) clears
`save.deployment` on load, so a subset picked in the old build cannot silently field fewer
than the encounter authors.

**3. The party is six, and every member has an approved portrait.**

`data/campaign/camp-the-first-march.json`: Vance archer (was geomancer), Kest wizard (was
monk, `mastered: ["monk"]` kept — mastery is permanent, `docs/02`), Briar archer, Ottoline
priest, Corin priest (new), Isla wizard (new).

**The jobs were chosen by which portraits exist and which skillsets are alive.** Thief's
skillset is entirely `effect-deferred` (zero live actions); knight's tree is 2 of 9 live
(2026-08-16). Archer, priest and wizard were the only candidates. `PORTRAIT_BY_UNIT` now
names all six; `archer-m`, `priest-m` and `wizard-m` were cut with Pillow at 192×256 from
the README's crop boxes, so **nine of ten** approved portraits are bundled — only `thief-f`
is unwired. The prologue's "Four names…" becomes "Six names…".

**4. All six will deploy — in a NEXT slice, not this one.**

Owner: "work off the assumption that all battles will have 6 deployed; don't worry about
selection yet." This slice the encounters still author **2 / 3 / 4 / 4 / 4** player
placements across battles 1–5. The party view states that honestly rather than pretending
otherwise. Six placements per map plus an enemy retune is the next content slice.

**5. Tests target the owner's phone in landscape only: 832×328 and 832×384.**

832×328 assumes an Android browser bar of ~56 px, **unverified**. 640×300, 851×324 and
1000×780 are no longer asserted for the briefing. The CSS stays fluid, and the
`@media (min-height:401px)` and `(max-width:700px)` branches are untested by decision.

**6. Hand-play of the campaign is suspended, and thirteen tests are parked.**

`isClickTargetable` (`src/render/preview.ts`) rejects any ability carrying `aoe` or `speed`,
so a wizard and a priest have **no tap-castable action at all**. Kest, a wizard, acts first
on battle 1, so the campaign page cannot reach a staged target. Separately, Vance as an
archer lets the naive player clear battle 4, so ADR-0027's profile no longer holds.

Every parked test is `test.fixme` / `it.skip` with a `DEFERRED (ADR-0041):` reason, and
none is weakened. Re-arm by deleting the line, never by loosening an assertion.

| # | File | Test |
|---|---|---|
| 1 | `e2e/stage.spec.ts` (AC-V34) | `/ at 640x300 the HUD never overlaps the canvas at rest` |
| 2 | `e2e/stage.spec.ts` (AC-V34) | `/ at 800x360 the HUD never overlaps the canvas at rest` |
| 3 | `e2e/stage.spec.ts` (AC-V34) | `/ at 851x324 the HUD never overlaps the canvas at rest` |
| 4 | `e2e/stage.spec.ts` (AC-V34) | `/ at 900x390 the HUD never overlaps the canvas at rest` |
| 5 | `e2e/stage.spec.ts` (AC-V34) | `/ at 1000x780 the HUD never overlaps the canvas at rest` |
| 6 | `e2e/stage.spec.ts` (AC-V36) | `/ the tap emits ZERO commands and Confirm emits exactly one` |
| 7 | `e2e/stage.spec.ts` (AC-V36) | `/ End Turn is refused while a target is staged` |
| 8 | `e2e/stage.spec.ts` (AC-V36) | `/ the disabled primary does not read as the thing to press` |
| 9 | `e2e/stage.spec.ts` (AC-V36) | `/ Cancel unstages and emits nothing` |
| 10 | `e2e/stage.spec.ts` (AC-V37) | `/ the drawer closes on a TARGET tap and stays open on an illegal one` |
| 11 | `e2e/stage-capture.spec.ts` | `stage frames: the five interaction states, on the owner's phone` |
| 12 | `src/sim/campaign-run.test.ts` | `the unprepped party wins every battle but the finale — ADR-0027, deliberately` |
| 13 | `src/render/playtest.test.ts` | `separates on WINNING: engaging clears the campaign, ignoring the prep screen does not` |

Rows 1–10 park only the `/` (campaign) variant. **Every `/viewer.html` twin still runs
every assertion**, so AC-V34, AC-V36 and AC-V37 keep a live carrier.

## Consequences

- **The briefing fits one fold.** Each view owns the full width, so a card row and a
  ~~three-tab detail~~ **one-sheet dossier (ADR-0042)** no longer split 328 px between
  them.
- **"Who deploys" is authored, not chosen.** The player has no deployment control at all
  until the six-placement slice lands. `save.deployment` still exists in the schema; it is
  cleared, not removed, so no migration was needed.
- **What we give up, said plainly.** Parking row 11 **deleted seven tracked frames**
  (`docs/visual/stage/851x324-{unit-selected,target-staged,unit-drawer,actions-sheet,
  ai-turn,menu-drawer,settings}.png`); the proof sheet now keeps only the five `rest-*`
  frames. That deletion is correct and must not be undone by restoring the PNGs from git:
  the capture spec's contract is that a missing frame means the state was not reached, and
  a stale frame can never read as current.
- **ADR-0027's difficulty finding is not disproved, it is unmeasured.** The warchief's
  PA 8 → 11 stands in the data. What no longer holds is the *profile* it produced
  (victory ×4 then defeat); with Vance as an archer the naive run clears battle 4 too. Do
  not re-tune from the old numbers — re-measure after the revamp.
- **Nobody has approved a six-card frame.** The card width is 123 px where the approved
  mockup drew 187. Whether a face reads at that size is an open taste call for the art
  director; `e2e/briefing.spec.ts` asserts the mockup's *row invariants* (first card's left
  edge, last card's right edge, row top, equal tracks) rather than four pixel positions,
  which are unsatisfiable at six.
- **Three viewports lost their briefing coverage.** 640×300, 851×324 and 1000×780 are
  fluid-but-unasserted for this screen. A regression at those widths goes green.

## References

- ADR-0040 (the overhaul; its second amendment is superseded here for the briefing only).
- ADR-0039 (portrait identity is a viewer table) — its "six of ten wired" count is now nine.
- ADR-0027 (the campaign demands engagement) — pacing claim suspended above.
- ADR-0029 (`renderStory`'s reveal state) — the deploy toggle it names as an `onChange`
  trigger no longer exists; the party↔member view switch replaces it.
- `docs/10` AC-V16, AC-V34, AC-V36, AC-V37, AC-V51…AC-V59; `docs/11` §1, §3.
- Mockups: `docs/visual/concepts/mockups/party-*.png`, `member-*.png`, source under
  `mockups/src/`.
