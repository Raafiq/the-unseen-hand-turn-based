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
  Owner (2026-09-08): **the rail adds to the card tap, it does not replace it.**
- Only `--ink` is text on parchment; contrast is measured per section (ADR-0028, AC-V58).
- No rule moves into the render layer. The engine has no level, no MP check, no armor
  slots, no biography text. Owner: **leave them out** (2026-09-08). "Level / AP" shows AP.
  Owner: **Worn Armor keeps its heading with one line saying nothing can be equipped yet.**
- Profile lore: none exists. Owner: **write short lore now**, one or two lines per member,
  in the story pack (`data/campaign/story/`, swappable by contract, `docs/11` AC-M4).
  No test may pin the prose (`check:story`).
- Taste change: approved frames first, every note collected, then one engineer pass.
- Owner's notes on the first frames arrived as a second brief (verbatim below): proportions
  (rail 9-10%, dossier columns 43/57), a stronger identity block (25-30% of the height),
  Profile 20-25% of the height with polished sample prose and no placeholder labels, Job
  Customization 55-60% wide and side-by-side, 75-85% of the parchment occupied, no "MAX"
  or helper notes.
- Owner (2026-09-08): **keep "Reaction"**; the brief's "Counter" is not a rename.
- Fourth notes on the pass-3 frames (verbatim below), surgical: "Change Jobs" on the same
  header line as "Job Customization", right-aligned, the floating button gone; Profile
  12-15% taller at the same width; nothing else moves.
- Fifth notes on the pass-4 frames (verbatim below), two asks: (a) the Change Jobs button on
  the exact same line as the "Job Customization" title, far-right edge of the module header,
  cards immediately beneath, still reads as floating in pass 4; (b) a spacing pass: larger
  gaps between major sections, medium between subsections, small inside a section; a little
  more internal padding in Stats cells, Gear and Skill rows, Profile and the job cards;
  80-85% density; nothing else changes.
- Sixth notes on the pass-5 frames (verbatim below): +6-8px between major sections, +2-3px
  between Gear and Skills rows, +2px padding in stat cells, rows and job cards, more room
  under the Job Customization header; "visually obvious, not microscopic". At 832×328 both
  columns are full to the pixel after pass 5. Owner's answer (verbatim below): optimise for
  832×328, no scroll, no added height; redistribute — trim the identity block, tighten Stats
  cells, keep Profile compact, tighten the job cards and header — and spend it on the three
  gaps Worn Armor → Active Skills, Active → Passive, Profile → Job Customization.
- Seventh notes on the pass-6 frames (verbatim below): right column only. Gear stays on
  top; below it one shared Skills section with Active Skills left and Passive Skills right,
  side by side. Same slots and labels, no added height, nothing else changes.
- Owner (2026-09-08): **the two-column Active / Passive Skills layout is approved.**
- Eighth notes on the pass-7 frames (verbatim below): right column vertical placement only.
  Skills moves up to sit directly under Worn Armor with a normal major-section gap; no
  stretching Gear or Skills to fill; open parchment below Skills is fine; the top of Skills
  lines up roughly with the Stats → Profile transition on the left.
- Ninth notes on the pass-8 frames (verbatim below): rebalance the lower half. Left column
  = character information: Identity, Stats, Profile; Job Customization leaves the left and
  Profile grows downward into its space. Right column = configuration: Gear, Skills, then
  Job Customization beneath Skills at the right column's width, Main and Secondary side by
  side, CHANGE JOBS right-aligned on its header row. Same screen height, no scroll.
- Owner (2026-09-08): **the pass-9 layout is approved.** Tenth notes (verbatim below) are a
  polish pass only: tighten the identity block around its content (no new content), CHANGE
  JOBS cleanly on the Job Customization header baseline, stronger contrast between the
  Active / Passive sub-headings and the slot labels by type or divider only, small baseline
  and padding clean-ups. No size, order or spacing changes; still 832×328, no scroll.
- Eleventh notes on the pass-10 frames (verbatim below), micro-polish: the empty Worn Armor
  state becomes a full-width disabled slot row aligned like Main Hand, heading kept; the job
  label and AP baselines made to relate; pixel alignment of dividers, headings, control
  edges and baselines across Gear, Armor, Skills and Job Customization. Nothing else.
- Owner's answer on the Worn Armor row (2026-09-08, verbatim below): full-width Main Hand
  style row under its heading; spend the 6px slack, take the Skills → Job Customization gap
  down to about 5-6px (not 3), find the rest inside the Gear block; job cards unchanged.
- Owner (2026-09-09): **the pass-12 fit and vertical allocation are approved.** Twelfth notes
  (verbatim below), visual polish only: Worn Armor empty row loses the "ARMOR" cap and the
  placeholder look — an armor-slot icon then "No armor equipped"; the two job cards get a
  little less weight so they read as slots, CHANGE JOBS stays the stronger action; nothing
  is added under Active Skills, the uneven row count is intentional.
- Owner (2026-09-09): **"Approve" — pass 13 is the build target.** Frames:
  `docs/visual/concepts/mockups/dossier-pass13-832x{328,384}.png`, source `mockups/src/dossier.html`
  + `dossier.overrides.css` + the `lock` and `cuirass` glyphs in `mockups/src/icons.js`.
- Owner (2026-09-09): **traits keep a control on the dossier** — one line at the foot of the
  Profile block, "Traits: [ ] <name>", the existing checkbox; lore drops to three lines.
- Build finding (2026-09-09): the approved frames had no home for the Learn list (spending
  AP on abilities, the old Skills tab's right half). Owner: **design a visible Learn control**
  — a LEARN plate on the Skills heading, like CHANGE JOBS, opening the learn list as an
  overlay sheet; the dossier at rest stays as approved. Until it lands the list sits behind
  a tap on the AP readout (engineer's stopgap). Owner (2026-09-09): **pass-14 frames approved**
  (`dossier-pass14-832x{328,384}.png`, `dossier-pass14-learn-832x{328,384}.png`); **LEARN is the
  only door** — the AP readout goes back to plain text.
- Review (2026-09-09): 2 blockers (the learn overlay outlived Back and re-entry; a 240-char
  lore pushed the traits line off the sheet), 3 shoulds, 2 nits — all fixed in one engineer
  pass. Owner: the old "In battle" command list and the equipped-passive descriptions are
  **deferred to the combat revamp**, not re-homed now.
- Third notes on the pass-2 frames (verbatim below): a substantially larger portrait, no
  crosshair or blank parchment in the identity card, Stats larger and airier than Profile,
  Profile a little shorter, "Change Jobs" in the Job Customization heading aligned right,
  taller Gear and Skills rows. Hierarchy: character, then Stats / Gear / Skills, then Job
  Customization, then Profile, then the rail.

## Open questions
- The second brief lists Off Hand, Head, Chest and Accessory rows "where applicable". The
  engine has one hand and no armor, so the mockup shows Main Hand only and the Worn Armor
  heading with its one line (owner's earlier call). Confirm that reading.

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

## Reference: the owner's second brief, verbatim (2026-09-08, notes on the first frames)

Use the current Character Details screen as the base.

**Do not redesign the visual language or interaction model.**
This pass is specifically to correct **proportion, hierarchy, spacing, and information density**.

The existing structure is already directionally correct:
- left 1×6 party portrait rail
- full character dossier
- no Equipment / Skills / Profile tabs
- all major character information visible at once

Now refine it according to the following exact layout rules.

## Overall screen proportions

Target **16:9 mobile landscape** first.

Divide the usable content width approximately as follows:

- **Party portrait rail:** 9–10%
- **Main dossier:** 90–91%

The portrait rail must remain compact and clearly secondary to the dossier.

Inside the main dossier, use a **two-column content structure**:

- **Left dossier column:** approximately 43%
- **Right dossier column:** approximately 57%

Do not create large empty parchment areas between sections.

## 1. Party portrait rail

Keep the six party portraits stacked vertically in a single column.

Refine it as follows:

- make the rail slightly narrower than the current version
- keep all 6 portraits visible without scrolling at this target resolution
- reduce the portrait height slightly if required
- preserve the gold border / glow around the selected character
- inactive portraits should remain readable but visually subdued
- do not add full character names inside the rail

The rail is only for **fast character switching**.

The existing top-level Back control remains for returning to Party Management.

Do not add another back button inside the dossier.

## 2. Selected character identity block

The current character identity is too visually weak.

Create a stronger **identity block at the top-left of the dossier**.

This block should occupy approximately:

- **25–30% of the dossier height**
- most of the upper-left dossier column

Include:

- a noticeably larger selected-character portrait
- character name as the dominant text
- AP / level
- current job
- optional small class icon / crest if already supported by the visual language

The selected character must immediately read as the subject of the screen.

Do not let this become another tiny roster portrait.

## 3. Stats

Place **Stats directly beneath or alongside the identity block** within the upper-left area.

Rename all remaining "Standing" language to:

**Stats**

Use a clean compact grid.

Keep the existing values such as:

- HP
- Attack
- PA
- MA
- Move
- Evade
- Brave
- Faith

Use two or four compact columns depending on available width.

Do not stretch individual stat rows unnecessarily.

The Stats section should feel like a deliberate character-sheet block, not a loose table floating in empty parchment.

## 4. Right column — Gear

Use the upper portion of the right dossier column for Gear.

Create two clearly separated subsections:

### Wielded Gear
- Main Hand
- Off Hand where applicable

### Worn Armor
- Head Armor
- Chest Armor
- Accessory where applicable

Each equipment slot should retain the existing clickable row treatment.

Add enough vertical spacing to make the two subsections distinct.

Do not compress all equipment into one dense stack.

## 5. Right column — Skills

Place Skills immediately below Gear.

Skills should occupy a substantial portion of the right column rather than being squeezed into the bottom.

Divide Skills clearly into:

### Active Skills
- Primary
- Secondary

### Passive Skills
- Counter
- Support
- Movement

Keep each slot clearly interactive.

Use consistent row heights and spacing.

Do not use tabs.

Do not hide either Active or Passive Skills.

The right column should feel like a clean sequence:

**Gear → Skills**

with strong section separation.

## 6. Profile

Place the Profile section in the lower-left dossier area.

It should sit beneath the identity / Stats region.

Use a compact parchment text block containing character biography / lore.

The Profile block should be approximately:

- **full width of the left dossier column**
- around **20–25% of the dossier height**

Do not use placeholder labels such as:

- PLACEHOLDER TEXT
- LOREM
- temporary system notes

Use polished sample character biography text if actual content is unavailable.

The Profile section should remain readable but secondary to character identity and gameplay information.

## 7. Job Customization

The current Job Customization treatment is still too close to a footer.

Move it fully into the **lower-left / lower-center dossier composition** and treat it as a contained character-sheet module.

Target width:

- approximately **55–60% of the full dossier width**
- never full-screen width

Include:

- Main Job card
- Secondary Job card
- Change Jobs action

Arrange Main and Secondary Job cards side-by-side.

Keep the Change Jobs action visually associated with the module, preferably aligned to its upper-right or right edge.

Do not use two enormous horizontal bars.

Do not let the module touch both sides of the screen like a footer.

It should visually read as:

**one contained Job Customization panel**

## 8. Eliminate dead space

The current screen contains too much unused parchment around the upper-left / center.

Correct this deliberately.

Use the available space for:

- enlarged identity
- Stats
- Profile
- improved section spacing

Do not solve empty space by simply enlarging margins.

The page should be **information-dense but calm**.

Aim for roughly **75–85% meaningful occupancy** of the available parchment content area.

## 9. Typography and labels

Preserve the current serif / handwritten medieval UI typography.

Clean up all temporary or noisy labels.

Remove or replace:

- PLACEHOLDER TEXT
- MAX
- debug-like annotations
- unnecessary tiny helper notes
- redundant labels

Keep section headings simple:

- Stats
- Wielded Gear
- Worn Armor
- Skills
- Active Skills
- Passive Skills
- Profile
- Job Customization

Do not introduce new terminology unnecessarily.

## 10. Visual hierarchy

The order of visual importance should be:

1. **Selected character**
2. **Stats / Gear / Skills**
3. **Job Customization**
4. **Profile**
5. **Party portrait rail**

The portrait rail must never visually overpower the selected character.

The selected character's name and portrait should be the strongest focal point after the top application header.

## 11. Preserve

Keep unchanged:

- The Toll Road top header
- current dark oak frame
- parchment surface
- blackened-steel controls
- gold selection accent
- heraldic details
- existing medieval tactile styling
- left-side portrait switching behavior

Do not reintroduce:

- Equipment / Skills / Profile tabs
- Deploy controls
- a second Back button
- a stretched Job Customization footer
- the term "Standing"

## Final composition target

The screen should read approximately as:

**LEFT RAIL**
6 compact party portraits

**MAIN DOSSIER**

**Left column**
- Large selected-character identity
- Stats
- Profile
- compact Job Customization module extending partially toward center

**Right column**
- Wielded Gear
- Worn Armor
- Active Skills
- Passive Skills

The result should feel like a **complete tactical-RPG character dossier**, not a settings page and not a collection of stretched form rows.

The selected character must have strong visual presence, all useful information should be visible without tabs, and there should be no large unused parchment zones.

## Reference: the owner's third notes, verbatim (2026-09-08, on the pass-2 frames)

Keep the current layout and styling. Do not redesign the page.
Make one final hierarchy and spacing pass:

* Enlarge Briar's selected-character portrait substantially in the upper-left identity section.
* Remove the large unused area and decorative crosshair from the right side of the identity card. Resize/recompose the identity block around actual character information rather than leaving blank parchment.
* Give Stats more visual importance: slightly larger stat cells/values and more vertical breathing room. Stats should be more prominent than Profile.
* Reduce Profile height slightly to make room for the stronger identity/Stats area.
* Keep Job Customization in its current compact location, but integrate the "Change Jobs" control into the Job Customization header, aligned right, instead of floating between the heading and job cards.
* Preserve the narrow 1×6 portrait rail and current right-side Gear / Skills structure.
* Slightly increase row height/padding in Gear and Skills so they feel like intentional RPG controls rather than spreadsheet rows.

The final hierarchy should be unmistakable:
Selected Character → Stats / Gear / Skills → Job Customization → Profile → Party Rail.
Do not add tabs, extra navigation, footer bars, or new sections.

## Reference: the owner's fourth notes, verbatim (2026-09-08, on the pass-3 frames)

Use the current screen exactly as the base. Do not alter any other section.
Make ONLY these two changes:

1. Move the "CHANGE JOBS" button into the same horizontal header row as "Job Customization".
   * "Job Customization" stays left-aligned.
   * "CHANGE JOBS" becomes a small right-aligned action on that exact same header line.
   * Remove the current floating Change Jobs button above the Main/Secondary job cards.
   * Keep the two job cards directly beneath the header.
2. Increase the Profile panel height by approximately 12–15%.
   * Preserve the same width.
   * Allow the biography text more vertical breathing room.
   * Slightly reduce the vertical gap between Profile and Job Customization if needed.
   * Do not reduce the Stats area.

Everything else is locked and must remain unchanged:

* portrait rail
* selected-character identity block
* Stats
* Gear
* Skills
* column widths
* header
* overall styling

This is a surgical correction only. Do not rebalance, redesign, or reinterpret any other part of the screen.

## Reference: the owner's fifth notes, verbatim (2026-09-08, on the pass-4 frames)

Keep the current screen completely unchanged except for the Job Customization header.
Move the CHANGE JOBS button so it sits on the exact same horizontal line as the Job Customization section title.
Layout:
Job Customization [ CHANGE JOBS ]
The button must be aligned to the far-right edge of the Job Customization module header.
Then place the Main Job and Secondary Job cards immediately below that header row.
Remove the current floating CHANGE JOBS button from above the cards.
Do not change:

* Profile height
* Stats
* portrait rail
* identity block
* Gear
* Skills
* job card sizes
* column proportions
* any other spacing or styling

This is the only change required.

(Then, in the same message:)

Keep the current composition and proportions. Do not redesign any section.
Make a final spacing and breathing-room pass across the dossier.
Increase vertical separation between major sections, especially:

* Stats → Profile
* Profile → Job Customization
* Worn Armor → Active Skills
* Active Skills → Passive Skills

Add slightly more internal vertical padding to:

* Stats cells
* Gear rows
* Skill rows
* Profile panel
* Main / Secondary Job cards

Preserve compact spacing between rows that belong to the same section, but create clearer spacing between different sections.
Use a consistent spacing hierarchy:

* small gap inside a section
* medium gap between subsections
* larger gap between major modules

Do not increase spacing so much that large empty parchment areas return.
Target a slightly calmer layout, approximately 80–85% visual density rather than the current tightly packed appearance.
Keep all column widths, portrait sizes, section order, and current overall structure unchanged.

## Reference: the owner's sixth notes, verbatim (2026-09-08, on the pass-5 frames)

Keep the current layout, proportions, section sizes, and content exactly as they are.
Make only a stronger spacing pass.
Increase vertical spacing between major sections by approximately 6–8 px:

* Stats → Profile
* Profile → Job Customization
* Worn Armor → Active Skills
* Active Skills → Passive Skills

Increase vertical spacing between rows within Gear and Skills by approximately 2–3 px.
Add approximately 2 px more vertical padding inside:

* stat cells
* equipment rows
* skill rows
* job cards

For Job Customization:

* keep "CHANGE JOBS" on the same header line
* add a little more space below the header before the Main / Secondary job cards
* do not let the button visually touch the cards

Do not enlarge any module dramatically.
Do not reintroduce large empty parchment areas.
Do not change portrait sizes, column widths, content order, or typography.
The goal is a clearly readable vertical rhythm:
section header → comfortable gap → content → larger gap → next section
Make the change visually obvious, not microscopic.

## Reference: the owner's answer on the 328 trade, verbatim (2026-09-08)

Optimize specifically for 832×328 mobile landscape. The current sheet already fills the available vertical space, so do not increase total content height.
Improve visual separation by redistributing existing vertical space:
- slightly reduce the height/padding of the selected-character identity block
- slightly tighten Stats cell height
- keep Profile compact
- slightly tighten the Job Customization cards/header
Use the reclaimed pixels to create clearer separation specifically between:
- Worn Armor and Active Skills
- Active Skills and Passive Skills
- Profile and Job Customization
Do not add blanket vertical spacing between every row.
Keep rows within the same Gear or Skills subsection compact.
Preserve all existing content and keep everything visible without scrolling at 832×328.
Favor horizontal organization over additional vertical expansion.
The goal is not "more spacing everywhere"; it is better spacing hierarchy within the exact same screen height.

## Reference: the owner's seventh notes, verbatim (2026-09-08, on the pass-6 frames)

Keep the entire current screen unchanged except for the right dossier column.
The current right side feels too elongated because Gear, Active Skills, and Passive Skills are stacked as one long vertical list.
Recompose the right column into a more balanced character-sheet layout:

* Keep Wielded Gear and Worn Armor at the top.
* Below Gear, create one shared Skills section.
* Inside Skills, arrange:
   * Active Skills on the left
   * Passive Skills on the right
* Keep all existing skill slots and labels.
* Do not increase total screen height.
* Do not change the left side, portrait rail, Stats, Profile, or Job Customization.

The goal is to reduce the "long form" feeling on the right while using the existing horizontal space more effectively.

## Reference: the owner's eighth notes, verbatim (2026-09-08, on the pass-7 frames)

Keep the current two-column Active Skills / Passive Skills layout. This is approved.
Do not return to the previous vertically stacked Skills layout.
Refine only the vertical placement of the right column:

* Move the Skills section upward so it sits directly beneath Worn Armor with a normal major-section gap.
* Remove the large empty band currently separating Worn Armor from Skills.
* Keep Active Skills on the left and Passive Skills on the right.
* Do not stretch Gear or Skills vertically to fill the whole column.
* It is acceptable for some open parchment to remain below the Skills area.
* Align the beginning of Skills approximately with the transition between Stats and Profile on the left so the two sides feel compositionally related.
* Preserve the current left side completely.

The goal is a right column that reads as one coherent sequence:
Gear → Skills
rather than Gear → empty gap → Skills.

## Reference: the owner's ninth notes, verbatim (2026-09-08, on the pass-8 frames)

Use the current screen as the base. Preserve the current visual styling and all major proportions.
The current two-column Active Skills / Passive Skills layout is approved and must remain.
The remaining problem is overall vertical balance: the left side extends almost to the bottom of the dossier while the right side ends much earlier, leaving an excessively large unused lower-right parchment area.
Recompose only the lower half of the dossier.
Left column
Keep:

* Character Identity
* Stats
* Profile

Remove Job Customization from beneath Profile.
Expand the Profile section downward into the space previously occupied by Job Customization. Give the biography more comfortable reading space, but do not change the overall screen height.
Right column
Keep:

* Wielded Gear
* Worn Armor
* current horizontal Skills layout:
   * Active Skills on left
   * Passive Skills on right

Add Job Customization directly beneath Skills.
Job Customization should:

* use the available right-column width
* contain Main Job and Secondary Job side-by-side
* place CHANGE JOBS as a small right-aligned action on the same header row as "Job Customization"
* feel like a contained dossier module, not a footer

Desired conceptual structure
Left = character information

* Identity
* Stats
* Profile

Right = character configuration

* Gear
* Skills
* Job Customization

This should eliminate the large unused lower-right quadrant and create two visually balanced columns without adding vertical scrolling or increasing the total content height.
Preserve everything else exactly:

* 1×6 portrait rail
* selected portrait treatment
* identity proportions
* Stats layout
* Gear controls
* Active / Passive Skills split
* top navigation
* parchment / steel / gold styling

Do not stretch sections merely to fill space. Rebalance the existing modules instead.

## Reference: the owner's tenth notes, verbatim (2026-09-08, polish on the approved pass-9 layout)

Use the current version as the base. Do not make any structural changes. The overall layout is approved.
Make only a final polish pass:

* Keep the left 1×6 portrait rail unchanged.
* Keep the current two-column dossier structure unchanged.
* Keep the current horizontal Active Skills | Passive Skills layout.
* Keep Job Customization in the lower-right configuration column.
* Keep the current Profile placement and overall section order.

Refine only these details:

1. Selected-character identity block
   * Reduce the sense of unused space around the AP / metadata area.
   * Recompose the existing information more tightly inside the current block.
   * Do not add new content just to fill space.
   * Keep Briar's portrait and name at their current visual prominence.
2. Job Customization
   * Keep the two job cards at their current size and position.
   * Align CHANGE JOBS more cleanly with the Job Customization header baseline.
   * It should read as a deliberate right-aligned header action, not a floating control.
3. Skills typography
   * Slightly strengthen the visual distinction between the ACTIVE SKILLS / PASSIVE SKILLS subheadings and the individual skill-slot labels.
   * Do this through typography, divider treatment, or subtle weight changes only.
   * Do not increase the section height.
4. Alignment and spacing
   * Clean up any small baseline, padding, and divider inconsistencies.
   * Preserve the current 832×328 fit with no scrolling.
   * Do not increase overall vertical spacing or create new empty areas.
5. Preserve everything else
   * top Toll Road header
   * portrait rail width
   * identity block size
   * Stats layout
   * Profile size
   * Gear layout
   * skill-card sizes
   * Job Customization card sizes
   * parchment / dark oak / blackened steel / gold visual styling
   * no tabs
   * no Deploy button
   * no extra navigation

This is a final polish pass only. Do not reinterpret, rebalance, or redesign the composition.

## Reference: the owner's eleventh notes, verbatim (2026-09-08, on the pass-10 frames)

Use the current version exactly as the base. The layout is approved. Do not restructure, rebalance, resize, or move any major section.
Make only these final micro-polish corrections:
1. Fix Worn Armor
- The current "Nothing to equip yet." field is too short and awkwardly positioned on the right.
- Make the empty Worn Armor state use the same full available row width and alignment as the Main Hand row above it.
- It should read as an intentional disabled/empty equipment slot rather than a small floating text field.
- Preserve the "Worn Armor" section heading.
2. Character metadata alignment
- Keep Briar's portrait, name, Archer label, and 0 AP exactly at their current scale.
- Clean up their baseline/alignment slightly so the job label and AP feel intentionally related rather than positioned independently.
- Do not add more information.
3. Final consistency check
- Ensure divider starts, section headings, control edges, and text baselines align consistently between:
  - Wielded Gear
  - Worn Armor
  - Active Skills
  - Passive Skills
  - Job Customization
- Make only pixel-level alignment corrections.
Preserve everything else exactly:
- portrait rail
- identity block dimensions
- Stats
- Profile
- horizontal Active/Passive Skills
- Job Customization placement
- Change Jobs placement
- all card dimensions
- 832×328 fit
- existing visual style
Do not make any additional design changes. This is a final cleanup pass only.

## Reference: the owner's answer on the Worn Armor row, verbatim (2026-09-08)

Use the available 6px slack, but do not reduce the Skills-to-Job Customization gap all the way to 3px. Keep that major-section gap at approximately 5–6px. Reclaim the remaining pixels by slightly tightening spacing within the Gear block. Worn Armor should still receive the full-width Main Hand-style row, and the Job cards should remain unchanged.

## Reference: the owner's twelfth notes, verbatim (2026-09-09, on the pass-12 frames)

Keep the current layout, dimensions, and spacing exactly as-is. The 832×328 fit and current vertical allocation are approved.
Make only these visual-polish changes:

* Preserve the new full-width Worn Armor row, but simplify its empty state. Remove the redundant `ARMOR` text and placeholder-like presentation. Use a proper armor-slot icon followed by "No armor equipped" or equivalent finished UI copy.
* Keep both Job Customization cards at their current dimensions and position, but slightly reduce their visual weight/contrast so they read as configuration slots rather than primary buttons. Preserve `CHANGE JOBS` as the stronger action.
* Do not add anything beneath Active Skills to compensate for Passive Skills having one additional row. The unequal row count is intentional.

Do not modify spacing, section heights, column widths, portrait rail, identity block, Stats, Profile, Gear geometry, Skills geometry, or Job Customization placement.
Final polish only. No layout changes.
