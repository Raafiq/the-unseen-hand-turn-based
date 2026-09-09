# ADR-0042 — The member view is one dossier, not three tabs

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** the owner, 2026-09-08 and 2026-09-09, in words (fourteen approved passes,
  `intent/character-dossier.md`).
- **Supersedes in part:** ADR-0041 §1 — member detail is no longer "Equipment / Skills /
  Profile" behind three tabs. The party-select view, the six-member roster, the deploy
  toggle removal and hand-play suspension are untouched.
- **Owner docs:** `docs/10` §6c and AC-V51…AC-V62; `intent/character-dossier.md`.

## Context

ADR-0041 shipped member detail as three tabs — Equipment, Skills, Profile — full-width,
stacked below a Job Customization footer. The owner's brief called it "stretched out":
thin rows across the full width, empty parchment between them, a footer that ran the
whole screen. Outside advice proposed a single dossier with a portrait rail instead of
tab-switching. Fourteen frame passes (`intent/character-dossier.md`) converged on a
layout, then a build finding — the approved frames had no home for the AP-spending Learn
list — added a fifteenth: a LEARN overlay.

## Options considered

1. **Keep three tabs, tighten the spacing.** Rejected: the owner's complaint was the
   split itself (three panes competing for one screen), not row height.
2. **One dossier, no rail — a single "next/prev" control.** Rejected by the owner's own
   brief, which named a rail explicitly ("browse all six characters from the left rail").
3. **One dossier with a 1×6 rail, chosen (pass 14).** Left column: Identity / Stats /
   Profile. Right column: Wielded Gear / Worn Armor / Skills (Active + Passive side by
   side) / Job Customization. A LEARN plate on the Skills heading opens the AP-spending
   list as a `role="dialog"` overlay over the right column only.

## Decision

**1. Member detail is one sheet, no tabs.** `role="tab"` and `.tabs` are gone from
`#screen-briefing`. Every control the three tabs used to hide — Stats, Reaction, Traits,
Weapon, Job — is visible on one sheet at once.

**2. A 1×6 portrait rail (`dossier-rail`) sits left of the sheet**, in the campaign's own
roster order. Tapping a rail cell swaps the dossier in place; it adds to the party-card
tap, it does not replace it (owner, 2026-09-08) — Back still returns to party select, and
the card that opens a member and the rail cell that switches one agree on who is open.

**3. The old "Standing" block is renamed Stats.** Same eight keys (HP, Attack, PA, MA,
Move, Evade, Brave, Faith), same order.

**4. Worn Armor is a stated absence, not a hidden one.** One disabled row, "No armor
equipped", a cuirass glyph, no `<select>` and no chevron — the engine models no armor
slot, and a control here would promise a choice the sim cannot honor.

**5. Profile carries the member's `lore`** (three lines, story pack, `data/campaign/story/`,
swappable by contract) and a `Traits: [ ] <name>` line — the existing checkbox, kept on
the owner's word (2026-09-09) rather than dropped.

**6. Skills splits into two visible sub-columns, Active (Primary, Secondary) and Passive
(Reaction, Support, Movement), side by side under one heading.**

**7. Job Customization moves into the right column**, Main and Secondary as two cards,
CHANGE JOBS right-aligned on the section's own header line — no floating button, no
full-width footer.

**8. Learning an ability is a LEARN overlay, not a tab.** A LEARN plate on the Skills
heading opens a `role="dialog"` (not `aria-modal`: it covers the right column only, and
the rail, Identity, Stats and the traits checkbox stay live underneath) holding the open
member's job tree, ability rows, AP prices, LEARNED stamps and a purchase receipt. It
closes on CLOSE, Escape, a rail tap, `member-back`, or re-entering the briefing — the
overlay must not survive a member switch or a battle, or one member's tree could stand
open over another's sheet and spend the wrong AP.

## What this costs

- **The "In battle" command list and the equipped-passive descriptions are deferred to
  the combat revamp** (owner, 2026-09-09), not re-homed into the dossier now. Nothing on
  this sheet currently tells a player what a reaction or support ability *does* in a
  fight.
- **Thirteen art passes** before approval, plus a fifteenth (the Learn overlay) found
  only after the engineer built pass 14 and discovered the approved frames had no door
  to AP spending. The overlay was not in any approved mockup; it was designed against the
  owner's brief after the gap was found.
- **`docs/10` AC-V52 (three tabs) is deleted outright**, not amended — every clause it
  made (default tab, `aria-selected`, tab survives navigation) is false under this
  decision. AC-V53, AC-V56 and AC-V58 are amended for the new control set and node counts.

## What this supersedes in ADR-0041

ADR-0041 line 15 ("a three-tab detail leaf on the right") and line 113 ("a card row and a
three-tab detail no longer split 328 px") both describe the tabbed layout this ADR
replaces. **Superseded in part by ADR-0042** — see the amendment appended to ADR-0041.
ADR-0041's history is not rewritten; its three-tab decision stood and was correct for its
own moment.

## References

- ADR-0041 (superseded in part, above).
- `intent/character-dossier.md` — the full pass history, owner notes verbatim.
- `docs/10` §6c, AC-V51…AC-V62.
- `docs/visual/concepts/mockups/dossier-pass14-832x{328,384}.png`,
  `dossier-pass14-learn-832x{328,384}.png` — approved frames.
- `docs/visual/prep-split/member-dossier{,-learn}-832x{328,384}.png` — running-game proof.
