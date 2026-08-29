# ADR-0028 — The campaign is set on parchment, and its legibility is measured rather than eyeballed

- **Status:** Accepted. The *look* is a taste call made by the owner and is revisable; the **measurement rule** under it is not.
- **Date:** 2026-08-29
- **Owner docs:** `docs/10` **AC-V15** (authoritative), `docs/00` pillar 4 (honesty)
- **Scope:** `index.html` only. `viewer.html` keeps its instrument look and took one contrast fix.

## Context

The campaign page shipped in a blue-black palette with an amber accent, one system sans
face for every role, and rounded cards — the default dark-dashboard look. The owner asked
for a Final Fantasy Tactics register, and after two rejected passes (parchment too pale,
then leather too dark) settled on **aged parchment with scorched edges**, from a
reference image.

The interesting part is not the palette. It is that **"that looks readable" is exactly
the kind of claim this repo forbids**: it would read the same whether the ink cleared the
accessibility bar or missed it by half. So the slice added an instrument first and let it
decide the colours.

It immediately found three defects, two of which predate the restyle:

| Found | Where | Was |
|---|---|---|
| Gold small-caps labels on tan | every heading on the new sheets | **1.55:1** — I had written "near the accessibility floor" in a design note; it was nowhere near it |
| The engine viewer's faintest ink | `viewer.html`, 45 nodes | 3.87:1, shipped since P1 |
| The help panel's scrolling region | `index.html`, since ADR-0025 | unreachable by keyboard |

## Decision

**1. The campaign page is parchment on a dark table.** Sheets (`.card`, `.panel`, the help
dialog) are a golden-tan wash under a fine-grain tooth layer, stained at the margins,
with a scorched rim and a double gold rule set inside it. Three faces carry three roles:
Grenze Gotisch for names, Cinzel small-caps for labels, EB Garamond for prose. The
primary action is a **wax-seal red**, because gold on tan cannot carry a button.

**2. The battle board stays dark.** A lit isometric map inside a light frame fights
itself, and the legend swatches below it quote the board's own colours — they have to sit
on the board's ground to stay honest. The two side panels are parchment.

**3. Fonts are self-hosted**, five woff2 latin subsets totalling 104 KB in
`public/fonts/`. A Google Fonts `<link>` would make first paint depend on a third party;
the page is meant to be playable from a static host with nothing else reachable.

**4. Contrast is asserted by `e2e/contrast.spec.ts`, and axe-core is told not to try.**
This is the load-bearing half.

axe-core refuses to judge contrast when it cannot flatten the background, and every
parchment surface is a gradient under two noise layers. Measured on the briefing screen,
axe evaluated **2 nodes and returned 106 as "incomplete" — while reporting zero
violations**. That green is worth nothing: it is identical to the green an unreadable
page would produce. `a11y.spec.ts` therefore calls `.disableRules(["color-contrast"])`
and says why, so it cannot be mistaken for evidence it does not hold.

`contrast.spec.ts` computes the ratio in the page against **both extreme stops of each
sheet's gradient**, composites any translucent layer between the text and the sheet, and
treats an element that paints its own opaque fill as its own ground with every gradient
stop a candidate. A colour is accepted only if it clears WCAG AA against all of them.

**5. The scorch is measured in pixels, not as a percentage radius** — `--burn` plus
`--burn-spread` plus `--burn-jitter` — so "the burn never darkens ground that text sits
on" is a comparison the test can make instead of an assumption it has to trust. Without
that, every ink colour would have to be re-measured against an unknowable gradient, and
the numbers above showed how badly that goes by eye.

## Consequences

- **The palette is downstream of the measurements.** `--ink-soft`, `--ink-faint`,
  `--warn`, `--accent-ink` and the price seal's ink were all set by solving for the bar
  against the worst ground, not by choosing what looked right. Gold-as-ink became a dark
  bronze (`#5f4210`) — which is also what real gold ink on parchment looks like.
- **`--accent` is now rules and borders only.** Any new gold *text* takes `--accent-ink`.
- **A padding change can break the design.** Sheet padding must clear the burn band;
  the test asserts it, and the mobile breakpoint scales both together.
- **Five mutations were run against `contrast.spec.ts` and all were caught** (faint ink
  reverted, leaf gold used as ink, parchment darkened, the board lightened, a recessed
  wash deepened), plus one against the stale-grounds guard.
- **What this does NOT establish.** Nothing here says the game is understandable. A green
  contrast run on an illegible prep screen is byte-identical to a green run on a clear
  one. `docs/NEXT.md`'s open question — whether a newcomer grasps the five-slot chassis —
  is untouched and still needs a person.

## Alternatives considered

- **Keep axe's `color-contrast` rule enabled.** Rejected: it reports zero violations
  while measuring almost nothing here, which is worse than no check.
- **Flatten the sheet backgrounds so axe can read them.** Rejected: the gradient and the
  scorch are the design. Measuring the design as built is the harder but honest path.
- **Sample rendered pixels instead of modelling the layers.** Rejected as non-discriminating
  in the way that matters: a sample takes one point, and the failure mode is text near the
  dark end of a gradient. Bounding both extremes covers every point at once.
- **Load fonts from Google Fonts.** Rejected — a third-party dependency on first paint for
  104 KB of savings that a static host does not need.
- **Restyle the engine viewer to match.** Deliberately not done. It is a developer
  instrument; only its contrast defect was fixed.
