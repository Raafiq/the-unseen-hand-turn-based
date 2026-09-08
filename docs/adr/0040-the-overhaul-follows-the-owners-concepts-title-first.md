# ADR-0040 — The design overhaul follows the owner's concept renders, look only, one screen at a time; the title screen ships first

- **Status:** Accepted. Amended 2026-09-07 (scene player); amended again 2026-09-07
  (briefing screen). **The second amendment (option A, the briefing's two panes) is
  superseded in part by ADR-0041, 2026-09-08 — the briefing is now two VIEWS, not two
  panes. Title and scene player are unchanged.**
- **Date:** 2026-09-06
- **Owner docs:** `docs/10` **AC-V44 … AC-V50, AC-V51 …**, `docs/visual/concepts/README.md`
- **Scope:** `#screen-title` (`src/render/overhaul.css`, `index.html`); first amendment
  adds `#screen-scene`; second amendment adds `#screen-briefing`. Battle poses remain
  the one screen not yet ported.

## Context

The owner committed 13 concept renders (`docs/visual/concepts/*.png`) — title, five combat
poses, six prep panes, one narration scene — and ruled them **LOOK ONLY**: every stat,
level, MP bar, secondary job, job tree, inventory, trait and character name in them is
placeholder. None of that content is in scope; only the visual language is
(`docs/visual/concepts/README.md`). The owner also set the order: **title first**
(2026-09-06); the other four screens are not green-lit.

The title screen was the obvious first cut — one screen, three controls, no state
machine of its own to disturb.

## Decision

**1. The title screen is rebuilt in the concept's look**, scoped entirely to
`#screen-title` in a new file, `src/render/overhaul.css`, linked from `index.html` only
(not `viewer.html`). Three WebP crops of the owner's art (`data/campaign/story/art/`) are
bundled through `TITLE_ART` in `campaign-data.ts`.

**2. Controls drop to three**, matching the concept: New Game, Continue, Copy playtest
log. **Erase save and the footer link to the engine viewer are removed from the DOM**,
not merely hidden (`e2e/title.spec.ts` asserts a zero count for both, and the mutation
that re-adds the footer link was run for real and caught).

**3. New Game's overwrite check moves in-page.** A save on the slot now shows a plaque
step — "Overwrite your save?" Yes / Back — instead of `window.confirm`. Back leaves the
save byte-identical; Yes drops it. An unreadable or empty slot starts at once, same as
before. The step is keyboard-complete: focus moves to Yes the moment it opens, Escape
acts as Back (title screen only, while the step is open), and the confirm text carries
`role="alert"`. The save readout moved off `title-slot` and onto the Continue plaque
itself — a second, smaller italic line under "Continue" ("Battle N of 5" / "All 5 won")
when the slot is readable, nothing when it is empty. `title-slot` now surfaces only the
two warnings a player must act on: an unreadable save, or storage that a real write/read
probe (`detectStorage()`) finds unavailable — not the routine "have/don't have a save"
state it carried at first pass.

**4. This extends ADR-0028's parchment, on a darker sheet, and reopens its ink ladder.**
The concept's parchment samples darker than the shipped `--surface`. `--ink` still
clears every leaf stop (worst 4.996:1, on `--parch-burn`). `--ink-soft` (4.07),
`--ink-faint` (3.79) and `--accent-ink` (3.83) all **fail** on `--parch-lo` — three of
ADR-0028's four secondary inks do not survive the move. **Rule, binding on every screen
that follows:** a screen ported to this look re-measures its own ink ladder against its
own gradient stops before shipping; ADR-0028's numbers do not carry over by assumption.

**5. Scoped CSS still leaks.** Page-wide rules in `index.html` — `.eyebrow
{text-transform}`, `button::before{opacity:0}`, `button[disabled]{opacity:.4}` — apply
inside `#screen-title` on any property the scoped rule does not itself set. Two of the
title's three declared deviations from the mockup exist because of this (see
`overhaul.css`'s file banner). Every later screen in this look will meet the same leak;
name the property being overridden explicitly, don't assume a scope selector is a clean
room.

## What this reverses

Nothing in ADR-0028 is wrong; this **extends** it onto a darker sheet and **adds** the
per-screen re-measurement rule above, which ADR-0028 did not need because it shipped one
palette for the whole page. Erase-save and the footer link were never the subject of an
ADR or an AC — there is nothing to strike, only a change to record.

## Alternatives considered

- **Re-skin every screen at once.** Rejected: five screens times the ink-ladder and
  CSS-leak risk above, no reference for four of them beyond a placeholder-laden concept
  render, and a single slice too large to review. Title-first bounds the blast radius to
  one screen and proves the method before repeating it.
- **Keep Erase Save as a button, styled to match.** Rejected — the concept has no such
  button, and the owner's ruling is look-only in service of matching the concept, not
  preserving every existing control regardless of fit. The overwrite step already covers
  the same risk (an accidental New Game losing progress) with one fewer control.

## Consequences

- **The ink-ladder rule is now load-bearing for every future screen in this look.**
  `docs/10` AC-V46 asserts it for the title; the next screen owes its own AC.
- **The CSS-leak landmine is named but not fixed.** No page-wide rule was scoped down in
  this slice; the next screen's author still has to find and override each leak by hand.
- ~~Four screens remain in the old look~~ — **superseded by the two amendments below**:
  the scene player and the briefing screen have since moved. Only battle-screen combat
  poses remain, and outside `docs/10`'s stage criteria (§8f) — this slice does not touch
  that boundary.
- **`#screen-title` is a `position:fixed` full-viewport sheet, not the ADR-0037 stage.**
  It does not gain the stage's zones, letterboxing rules or ACs; AC-V43 stays reserved
  for the actual "remaining screens on the stage" slice, untouched by this one.
- **`#save-error` now paints above the title's fixed layer** (`z-index: 6` over the
  layer's `5`) — a refused write must stay visible over the parchment, not under it.
- **Three review-found evidence fixes, each closing a tie a mutation could pass through:**
  the phone-fold test now compares the codex's own aspect ratio to the viewport's, not a
  fixed tolerance, so a cap that shrinks width and not height no longer reads as
  compliant; the "no page scroll" claim is now an in-viewport bounding-box check on every
  button and the codex, since `overflow:hidden` made the old `scrollHeight` comparison
  pass on content that had actually overflowed; and `groundsAreReal()` compares the
  painted gradient stops to the declared list as **sets**, not "each declared stop is
  present", so an extra, undeclared stop can no longer ship unnoticed alongside the ones
  still measured.

## Amendment 2026-09-07 — the scene player

**The owner picked the scene player second**, built with the existing 3:4 head crops, no
bust art (2026-09-06). `#screen-scene` moves to this look; `scene.ts`'s DOM is unchanged —
every change is CSS plus one new `<img>` per host.

**Assets, both reused from the title's art pipeline, not new decisions:** a 41 KB
`night.webp` backdrop, cropped text- and character-free (box `(490,0,1235,428)`), bundled
through `SCENE_ART`; it upscales ~1.8x at desktop, survivable because the art is bokeh.
And the title's `ribbon.webp` lion, reused as `img.ribbon-charge`, mounted **only** on the
`scene-story` host — a review catch: it had shipped on all four story hosts, stacked on
the briefing portrait.

**The ribbon's colour stays undecided.** It keys on `figure[data-state]`: blue while a
line has a speaker, grey for narration — the one thing the data carries. Which house owns
which colour needs a field no character record has; the concept's red ribbon has no source.

**Two keyboard fixes the title's `?` dialog exposed:** the help button now moves top-right
while `#screen-scene` shows (a DOM-order-dependent sibling rule) instead of sitting over
Continue; the scene's keydown handler now bails on an open `<dialog>`, where before it
advanced the beat behind the modal and blocked Escape from closing it.

**The iron rim under the dialogue box was invisible before this fix.** `.card::before`
(parchment) and `.card::after` (iron) targeted one identical box; insetting the parchment
by `--rv` is what makes the iron paint at all — an A/B now moves ≥2% of the card's pixels.

### Consequences (amendment)

`docs/10` AC-V47…AC-V50 cover the backdrop/ribbon identity, the help-button move and
dialog bail, the log's scroll-to-end, and the visible-rim A/B. ~~Three screens remain in
the old look: prep, briefing, battle poses~~ — **superseded by the amendment below**: the
briefing screen has since moved. Only battle poses remain.

## Amendment 2026-09-07 — the briefing screen (option A)

> **Superseded in part by ADR-0041 (2026-09-08).** The two-pane layout below is gone: the
> briefing is now two VIEWS — party select, then member detail — and the per-card deploy
> toggle no longer exists. What survives is the look (parchment, portrait cards, iron
> plaques, the wax Deploy plate) and the three-tab detail. Read the strikethroughs below
> as history, not as the shipped screen.

~~**The owner picked the briefing screen third**, and ruled **option A**: one two-pane
screen — a portrait-card roster on the left leaf, a three-tab detail leaf (Equipment /
Skills / Profile) on the right — over "prep panel only". The rejected alternative would
have left two looks stitched into one screen: the concept's identity is the two panes
plus the wax Deploy plate together, not the prep controls alone.~~

**The three tabs are a DOM change, not CSS-only like the scene port.** `src/render/prep.ts`
now builds a `mountPrep` closure that tracks which tab is open — state that is never
written to the record, the save or the sim, so switching tabs cannot desync a build from
what the sim will actually field. `game.ts` builds the shared `.ptab` roster cards
(`PORTRAIT_BY_UNIT`, ADR-0039), the same list the deploy roster already used.

**Chrome new to this port:** a top rail (back plaque = Quit to title, `ribbon.webp`
banner, company plaque = battle title + step, tagline ribbon = the pre-battle story beat
with a `castle.webp` end-cap, `?` help as an iron plaque), a Job Customization strip
(primary/secondary job selects, five diamond-pip AP progress), and the wax Deploy plate
breaking the right leaf's bottom-right corner. Two `@media (max-height:400px)` compact
modes carry the phone folds, matching the roster cards crushing to a strip at 640×300.

**Out of scope, named explicitly** (the concept shows these; none is a look change): the
job tree, the inventory vault, the Menu dropdown, HP/MP bars, Lv., biography text, armor
slots. All placeholder in the concept renders, same ruling as the title and scene ports.

**Two landmines, same shape as the scene port's DOM-order dependency:**

- The pre-battle story row's placement depends on `brief-story` being the **first child**
  of `.leaf-left` — reordering the roster markup silently moves the beat.
- The help-button plaque is `#screen-briefing:not([hidden]) ~ button.help-btn`, a sibling
  rule that depends on DOM order in `index.html`, same mechanism as the scene amendment's
  help-button fix.

### Consequences (second amendment)

`docs/10` AC-V51 onward cover portrait identity, the three tabs and their persistence,
the 21-testid control manifest, drift from the mockup, the CSS-leak probe, phone fit, and
the pinned per-tab contrast counts. One screen remains in the old look: battle-screen
combat poses.
