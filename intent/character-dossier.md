# Intent: the Character Details screen is one dossier with a portrait rail
Author: Raafiq. Date: 2026-09-08. Status: accepted (owner, 2026-09-08).

## Problem
"Our next slice will be about the character details." The member detail view (tap a party
card in the briefing) splits one character across three tabs, Equipment / Skills / Profile,
and "it's stretched out": thin rows across the full width, empty parchment between them,
and a Job Customization bar that runs the whole screen like a footer. The owner took
outside advice on the layout; the brief is verbatim at the bottom of this file.

## Proposed outcome
A dedicated, full-screen Character Details screen that "should feel like: select a party
member once, then browse all six characters from the left rail while viewing each
character's complete dossier on the right." Reads as `[ 6-person portrait rail ] [ dossier ]`.

- **Rail.** One 1×6 column of portraits at the far left, about 10-12% of the width. The
  selected member has the existing gold border. Tapping another portrait switches the
  dossier at once. No names in the rail unless they fit cleanly.
- **No tabs.** One dense, readable sheet. Top: larger portrait and identity (name, AP, job),
  then **Stats** (the "Standing" block, renamed). Middle: Wielded Gear, Worn Armor, Skills
  with Active and Passive both visible. Lower: Profile, the lore as a compact parchment
  section.
- **Job Customization** becomes a compact module inside the sheet: Main Job and Secondary
  Job as two medium cards plus the change-jobs action, about 50-65% of the dossier width.
- **Keep** the top navigation and header, the back control there, parchment, dark oak,
  blackened steel, gold accents, serif and handwritten type. **Remove** the tabs, the word
  "Standing", the stretched footer, any extra back button, and Deploy from this screen.

## Affected users and systems
- The player, on the briefing's member detail view. Party select stays the entry.
- `src/render/prep.ts` (header, the three panels, the job strip), `src/render/overhaul.css`,
  `src/render/game.ts` (`briefView`, which member is open).
- `docs/10` §6c and AC-V51…AC-V61; the `e2e/` briefing specs; mockups under
  `docs/visual/concepts/mockups/`; proof frames under `docs/visual/prep-split/`.
- ADR-0041 says member detail is tabbed; this needs an amendment or a new ADR. The concept
  frames draw tabs; this diverges from them by the owner's decision.

## Constraints
- Phone-landscape first, asserted at 832×328 and 832×384 only (ADR-0041). Six rail
  portraits in 328px is about 50px each, above the 44px tap floor (AC-V35, AC-V56).
- Entry is always party select; the `briefView` reset stays in `renderScreens` (AC-V60).
- Only `--ink` is text on parchment; contrast is measured per section (ADR-0028, AC-V58).
- No rule moves into the render layer. The engine has no level, no MP check, no armor
  slots, no biography text. Owner: **leave them out** (2026-09-08). "Level / AP" shows AP.
  Owner: **Worn Armor keeps its heading with one line saying nothing can be equipped yet.**
- Profile lore: none exists. Owner: **write short lore now**, one or two lines per member,
  in the story pack (`data/campaign/story/`, swappable by contract, `docs/11` AC-M4).
  No test may pin the prose (`check:story`).
- Taste change: approved frames first, every note collected, then one engineer pass.

## Open questions
- The rail: does it replace tapping a party card as the way to open a member, or only add
  to it? (Brief: "select a party member once, then browse from the left rail.")
- Frames: which two of the six to render first for approval, and at 832×328 only?

---

## Reference: the owner's brief, verbatim (2026-09-08)

Use the current Character Details screen as the base and update the layout to match the following structure. Preserve the existing parchment / dark-oak / blackened-steel visual language and the current top navigation/header.

Character Details — Layout Update

This is now a dedicated full-screen Character Details screen, separate from Party Management.

1. Add a persistent party portrait rail

Add a single vertical column on the far left containing portraits for all 6 party members.

6 portraits stacked vertically in a 1×6 rail

Compact width, approximately 10–12% of the screen

Selected character receives the existing gold highlight/border

Clicking another portrait immediately switches the Character Details view to that character

Do not add character names inside the rail unless space permits cleanly

The main character header should show the selected character's name/job

The existing top-level back/navigation control remains for returning to the Party Management screen

Do not add an additional "Back to Party" button inside the content area

2. Remove Equipment / Skills / Profile tabs

The dedicated screen now has enough room to show the important character information simultaneously.

Remove the tab navigation entirely.

The page should read as one complete character dossier, rather than several sub-pages.

3. Main dossier structure

Use the remaining space to create a balanced multi-section character sheet.

Suggested hierarchy:

Top

Larger selected-character portrait / identity block

Character name

Level / AP

Current job

Stats

Rename the existing "Standing" section to:

Stats

Use the existing character-stat values there.

Middle

Wielded Gear

Worn Armor

Skills

Skills should expose both:

Active Skills

Passive Skills

Do not hide these behind tabs.

Lower section

Profile

Show the character lore / biography directly on the sheet as a compact readable parchment section

4. Job Customization

Do not keep Job Customization as a stretched full-width footer.

Convert it into a compact module within the dossier.

Include:

Main Job

Secondary Job

Change Jobs action

Use two medium-width job cards/buttons rather than extremely long horizontal bars.

The Job Customization module should occupy approximately 50–65% of the available dossier width, not the entire screen.

It should feel like one section of the character sheet, not a global footer.

5. Overall composition

Target mobile landscape / 16:9 first.

The final structure should broadly read as:

[ 6-person portrait rail ] [ full Character Details dossier ]

Avoid large unused parchment areas. Use the extra width to create a dense but readable RPG character sheet.

Keep:

existing visual style

parchment materials

blackened-steel borders

gold selection accents

serif / handwritten typography

current top navigation/header

Remove:

Equipment / Skills / Profile tabs

"Standing" terminology

stretched Job Customization footer

unnecessary additional back buttons

Deploy controls from this screen

The screen should feel like: select a party member once, then browse all six characters from the left rail while viewing each character's complete dossier on the right.
