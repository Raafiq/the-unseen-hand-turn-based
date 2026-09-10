# ADR-0043 — The combat screen is battlefield-first, measured against a minimum landscape viewport

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** the owner, 2026-09-09, in words.
- **Supersedes:** **ADR-0037** in full. ADR-0037 stays readable as the record of the
  real-device failure that created the rule; its Status line now points here.
- **Extends:** ADR-0034 (landscape only), ADR-0028 (parchment), ADR-0032 (the board moves),
  ADR-0033 (the stat set), ADR-0038 (Confirm is a separate tap).
- **Acceptance Criteria:** the minimum-phone criterion below is **reserved as AC-V66** and
  must be authored into `docs/10` in the combat-revamp slice. `docs/10` outranks this file
  wherever the two disagree.
- **Not landed.** This is a decision. The shipped code still implements ADR-0037 — see
  Consequences.

## Context

ADR-0037 was written after a real failure. The owner opened the game on a phone in
landscape and a persistent stats panel covered most of the battlefield; two units were
visible and the game was unplayable. **That problem is still the reason this ADR exists,
and the rule it produced — battlefield-first — is kept.**

What did not survive is two of ADR-0037's mechanisms.

| ADR-0037 mechanism | Why it is replaced |
|---|---|
| A universal stage **360 logical units tall** | 360 was derived from one screenshot and an assumed device pixel ratio. It froze a guess into a global constant. |
| **Desktop renders the same phone stage, letterboxed** | It shrinks the desktop battlefield for no reason but symmetry. The owner does not want black bars as a rule. |

The current stress-test target is a landscape viewport of approximately **832×328**, the
figure already used by the briefing screen (ADR-0041 decision 5). It assumes an Android
browser bar of ~56 px and **nobody has measured it on hardware**. ADR-0037's `851×324` was
the same kind of figure. `docs/INTENT.md` open ask **G** is exactly that measurement.

## Decision

### 1. The combat screen is battlefield-first `[ENHANCEMENT]`

At the minimum supported landscape viewport, **persistent combat UI must not obscure
playable battlefield tiles**. The battlefield stays tactically readable at rest. This is
ADR-0037's core rule, unchanged.

**Dominance has a number (owner, 2026-09-09):** at the 832×328 reference viewport, after
subtracting **all applicable safe-area insets** — top, bottom, left and right — the
**unobscured** playable battlefield occupies **at least 75%** of `usableStage` at rest.
Persistent HUD — the command rail, the turn-order rail — counts against the remaining 25%.
**60% was rejected**: "60% permits too much persistent UI for the battlefield-first goal of
ADR-0037." Measured per AC-V66 row 1.

### 2. A minimum supported viewport replaces the fixed stage height `[ENHANCEMENT]`

360 logical units is **no longer a universal stage height**. Layout is specified against a
**minimum supported / reference viewport**, currently ~**832×328** landscape. The
implementation derives the battlefield viewport from the actual available viewport, after
subtracting safe areas and persistent HUD regions.

### 3. Mobile landscape is the canonical minimum; larger screens get more room `[ENHANCEMENT]`

Tablet and desktop keep the **same spatial architecture and the same interaction model**,
and may gain battlefield area and breathing room. Desktop is **not required** to render a
phone-sized stage inside black bars. Letterboxing needs its own technical reason; symmetry
with the phone is not one.

### 4. Nothing covers the board at rest — said precisely `[ENHANCEMENT]`

- Persistent HUD lives in **reserved regions beside or below** the battlefield allocation.
- **Temporary contextual overlays may cover part of the screen**, but only after an
  explicit user interaction, and they dismiss or collapse when that interaction ends.
- This does **not** ban overlays during active interaction. It bans them at rest.

### 5. Progressive disclosure `[ENHANCEMENT]`

Detailed stats, damage forecasts, skill descriptions, item details and enemy details appear
**on demand**. The resting state shows only what the immediate tactical decision needs.

### 6. The layout equation `[ENHANCEMENT]`

```
usableStage       = viewport − all applicable safe-area insets
battlefieldViewport = usableStage − persistent HUD regions
```

Read in two steps, in this order. **All applicable safe-area insets — top, bottom, left and
right, as reported by the platform — come off first**, producing `usableStage`. Persistent
HUD is then reserved inside that rectangle, and what is left is the battlefield.

**The anti-pattern it replaces:** draw the battlefield full-screen, then place persistent
HUD on top of it. That is what produced the covered board in ADR-0037's screenshot.

**AC-V66 row 1 measures this same equation and states it once** — `usableStage` there is this
`usableStage`, and `unobscuredBattlefieldArea` is the area of this `battlefieldViewport`.

### 7. How the concept art applies `[OPTIONAL]`

`docs/visual/concepts/Combat scene (Attack|Defend|Item|Move|Spells).png` are **visual and
interaction reference**, usable even where their proportions are not implementation-ready.

Large bottom attacker/defender cards and command banners are **not automatically rejected**.
They are adapted into compact mobile equivalents that respect the battlefield-first layout.
This ADR constrains implementation behaviour; it does not fix one visual composition.

## Consequences

### Two shipped, asserted rules are now stale in the docs

ADR-0043 removes rules the code still implements and the suite still asserts. `docs/`
outranks code, so this is a named, owned follow-up — **not a licence to edit tests to
match, and not a licence to leave the ACs standing.**

| Doc | Claim | State |
|---|---|---|
| `docs/10` **AC-V33** — "the stage is 360 tall, uniformly scaled, and nothing overflows" | 360 as a universal stage height | **Stale as of ADR-0043.** Re-author in the combat-revamp slice. |
| `docs/10` **AC-V42** — "desktop is the same stage, letterboxed" | Desktop letterboxes to the phone stage | **Stale in part.** The letterbox clause goes. Its identical-child-set discriminator and its Enter/Esc clauses survive as decision 3's "same spatial architecture and interaction model" and should be rewritten, not deleted. |

**Where the 360 figure actually lives, grepped 2026-09-09, not taken on trust:**

| File | What it holds |
|---|---|
| `src/render/stage.ts` | `STAGE_HEIGHT = 360`, the `clamp(640, …, 900)` width formula, the docstring |
| `src/render/stage.css` | "the stage element is 360 units tall"; `60 + 216 + 84 = 360` |
| `src/render/stage.test.ts` | asserts `stageH === STAGE_HEIGHT` at five viewports, the 900 clamp, the 217.5 px letterbox |
| `e2e/stage.spec.ts` | AC-V33 (`m.stage.h / 360`), the 900-clamp case, AC-V42's letterbox pair, the settings readout regex `\d+ x 360 @ …` |
| `e2e/stage-capture.spec.ts` | `800x360` in its viewport list |

**Two files named in the brief do not belong on that list.** `src/render/iso.test.ts`'s
`360`s are **hue degrees**, not stage units. `e2e/campaign.spec.ts`'s is a **360×780
portrait viewport** for a scene-portrait assertion. Neither asserts the stage height.

### This is a decision, not a landed change

**The code still implements ADR-0037 until the combat revamp lands.** An agent that reads
only this ADR will be wrong about the current build: today the stage is 360 units tall,
desktop letterboxes, and the suite is green on both. Read `src/render/stage.ts` before
assuming otherwise.

### ADR-0037's geometry table is superseded arithmetic

The five-viewport table, the 900 clamp, the 41 px pillarbox and the **216-unit board
budget** are the arithmetic of a rule that no longer holds. They are a record, **not a
spec**. Do not derive a new layout from them.

Both anchor figures remain unverified on real hardware: ADR-0037's **851×324** and this
ADR's **832×328**. `docs/INTENT.md` open ask **G** is that measurement.

### Dependencies in neighbouring ADRs

| ADR | Depends on something removed? | Detail |
|---|---|---|
| **ADR-0038** (Confirm is a separate tap) | **In one sentence only.** Its Context says the board "is roughly 216 stage units tall after ADR-0037's budget". That number is superseded arithmetic. Its decision — staging is pure UI intent, Confirm emits exactly one command, End Turn refuses while staged — is untouched. Not edited here. |
| **ADR-0040** (the overhaul follows the concepts) | **No.** It puts `#screen-title` explicitly outside the ADR-0037 stage and disclaims the stage's zones, letterboxing rules and ACs. Nothing it relies on is removed. |
| **ADR-0041 / ADR-0042** (briefing, dossier) | **No.** They already assert 832×328 and 832×384 and never used the 360 stage. |

### What we give up

- **The one-number check is gone.** "Is the stage 360 tall" was cheap to assert. The
  replacement is a **ratio between two rectangles** (AC-V66 row 1, ≥75%), which is harder to
  write and far easier to write badly — measure the wrong rectangle and it passes either
  way. The measurement is specified below precisely because of that.
- **Desktop and phone may diverge in size again.** Decision 3 constrains architecture and
  interaction, not pixels — so nothing stops the two drifting in feel. AC-V42's
  identical-child-set discriminator is the guard that must survive the rewrite.

## Constraints / Acceptance Criteria

**AC-V66 is reserved by this ADR and is NOT yet in `docs/10`.** The threshold below is
**decided, not pending** — what is outstanding is the AC text in `docs/10` and the test.
Until both land, the combat screen has **no live criterion for the battlefield-first rule
under this ADR** — AC-V34 still measures ADR-0037's version, and its `/` (campaign) cases
are parked under ADR-0041. A decided number that nothing asserts is the shape this repo has
shipped before (`docs/07` §3's time-to-kill band); do not leave it standing.

**AC-V66 (the minimum phone layout is battlefield-first)** `[ENHANCEMENT]`: at
approximately **832×328 landscape**, on the battle screen:

| # | Requirement |
|---|---|
| 1 | **Battlefield dominance: the unobscured playable battlefield occupies at least 75% of `usableStage`** in the resting combat state, where `usableStage` is the viewport less all applicable safe-area insets. |
| 2 | Persistent HUD **hides no playable tile**. Measure intersection, not z-order. |
| 3 | Command controls are **comfortably tappable** (the 44 × 44 CSS px floor, ADR-0037 decision 4, kept). |
| 4 | Core combat text is **legible** — measured on ADR-0028's instrument, not eyeballed. |
| 5 | Entering the targeting states **Attack, Magic, Item and Defend** does not make the battlefield jump or resize unpredictably. |
| 6 | Secondary information is reachable by **progressive disclosure**, not permanently expanded. |

**Notes for whoever writes the test — read before minting the fixture.**

- **Row 2 needs a map whose tiles reach the HUD's edge.** A board that already sits clear of
  every reserved region scores identically whether the rule holds or not.
- **Row 5 needs a state change that would move the board under the anti-pattern.** Compare
  the battlefield box **before and after** each of the four targeting states, and assert it
  is unchanged. Asserting only that the board exists in each state passes against a layout
  that reflows on every tap.
- **Row 1's measurement is specified below.** Read it before writing the ratio; the wrong
  rectangle passes whether the rule holds or not.
- **832×328 is a stress target, not a verified device.** Say so in the test, or the figure
  reads as measured.

### Row 1, measured — the whole criterion is which two rectangles you divide

**The equation, in the owner's words (2026-09-09). This is the only statement of the rule:**

```
usableStage = viewport − all applicable safe-area insets

battlefieldRatio = unobscuredBattlefieldArea / usableStageArea
```

At rest, `battlefieldRatio` must be `>= 0.75`.

**Insets are subtracted FIRST, on all four edges.** Top, bottom, left and right, as reported
by the platform — not bottom-only, and not applied as a single lump at the end. `usableStage`
is the rectangle that survives. **Everything else is measured inside it**, so the insets are
never charged a second time against the numerator.

| Term | How a test gets it |
|---|---|
| `usableStage` | the viewport rect, with each platform-reported safe-area inset removed from its own edge |
| Battlefield allocation | `getBoundingClientRect()` on the named battlefield container box, clipped to `usableStage` |
| Persistent HUD boxes | `getBoundingClientRect()` on each named persistent region that exists at rest — the command rail, the turn-order rail, the actor tab — clipped to `usableStage` |
| `unobscuredBattlefieldArea` | area of the battlefield allocation, minus the area of the **union** of the persistent HUD boxes clipped to that allocation |

**HUD boxes are UNIONED, never summed.** Two persistent rails that overlap each other would
otherwise be double-charged, and a layout could fail a rule it satisfies. A persistent region
lying **outside** the battlefield allocation is charged once, against the remaining 25% — it
is not subtracted from the numerator as well.

**The discriminating case, and the whole reason this text is long: a full-screen board with
HUD painted on top MUST FAIL.** A ratio computed from the **rendered board rectangle**
passes identically whether the rule holds or not — the board is full-screen either way.
Measure the **unobscured** battlefield: the allocation minus what persistent HUD covers,
never the board painted behind it. A test that does not fail this mutant is not a test.

**Temporary contextual panels do not count.** A panel the player opened explicitly may
overlap the battlefield while active and is not required to satisfy 75%, provided it
dismisses or collapses when the interaction ends. The criterion is measured **at rest**.

**The arithmetic, so the number is checkable.** At 832×328 with zero insets
`usableStageArea` is 832 × 328 = **272,896 px²**, and 75% of it is **204,672 px²**. That is
the floor `unobscuredBattlefieldArea` must clear. **Both figures assume zero safe-area
insets**, which is what Chromium emulation gives; real-device figures adapt to the resulting
`usableStage` rectangle, so both move.
**832×328 remains unverified on real hardware** — `docs/INTENT.md` open ask **G**.

**60% was considered and rejected by the owner (2026-09-09), in words:** "60% permits too
much persistent UI for the battlefield-first goal of ADR-0037." Do not relitigate it.

**Unchanged and not relitigated here:** determinism as a P0 invariant (`docs/05` §3,
ADR-0004), the pure headless sim, the tag key, and ADR-0034's landscape-only gate.

## References

- **ADR-0037** — superseded. Read it for the failure that created the rule; not for geometry.
- ADR-0033 (the stat set), ADR-0038 (Confirm is a separate tap), ADR-0034 (landscape only),
  ADR-0028 (parchment and the contrast instrument), ADR-0040/0041/0042 (the overhaul).
- `docs/10` §8, AC-V33, AC-V34, AC-V42 — the first and third are stale as of this ADR.
- `docs/INTENT.md` open ask **G** — the viewport measurement neither figure has.
- `docs/visual/concepts/Combat scene (*).png` — reference, per decision 7.
