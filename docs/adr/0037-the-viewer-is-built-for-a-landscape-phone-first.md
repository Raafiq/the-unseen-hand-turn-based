# ADR-0037 — The viewer is built for a landscape phone first

- **Status:** Superseded by ADR-0043 (2026-09-09)
- **Superseded by:** [ADR-0043](0043-the-combat-screen-is-battlefield-first.md) — the
  battlefield-first rule and the failure below are kept; the fixed 360-unit stage and the
  letterboxed desktop are replaced. The geometry table here is superseded arithmetic, not a
  spec. **The code still implements this ADR until the combat revamp lands.**
- **Date:** 2026-09-05
- **Deciders:** the owner, 2026-09-05, from a real-device screenshot and a research brief.
- **Supersedes:** **ADR-0033 decision 2** (the stat plate sits bottom-left over the canvas).
  ADR-0033's other four calls — the stat set, absent MP and Level, the focus seam, the
  opacity rule — are **kept unchanged**.
- **Extends:** ADR-0034 (landscape only), ADR-0028 (the parchment table stays),
  ADR-0032 (the board moves), ADR-0007 (the render layer owns the look).
- **Acceptance Criteria:** `docs/10` §8 and **AC-V33 … AC-V42**. `docs/10` outranks this
  file wherever the two disagree.

## Context

**The owner opened the game on a real phone and the stat plate covered the board.**
Measured off that screenshot: the plate covers about **half the board's width and three
quarters of its height**. The board itself sits in the middle of the page with wide empty
parchment either side. Two units are visible. The game is unplayable.

ADR-0034 shipped a rotate gate and an orientation lock in the same week. Both work. They
solve *orientation*, and the screenshot was taken in landscape — so the remaining fault is
**layout**, and it is not a breakpoint away.

Three things in the record made this inevitable.

| Cause | Where |
|---|---|
| The viewer was designed at one desktop size | `playwright.config.ts` 1000×780, `iso.ts` board canvas 900×440 |
| Panels are sized in fixed pixels beside the board, not in a layout that reflows | `index.html`, `viewer.html` |
| ADR-0033 put the acting unit's plate **on** the board | ADR-0033 decision 2, "the least durable thing here" — its own words |

ADR-0034 already assumed the fix: AC-V31 asks for the board, the plate and the controls
all on screen at 844×390, **with the plate over the board**. That criterion can be green
on the screen above. It was the wrong shape of promise.

### What the research says

`art-director`'s brief (research, 2026-09-05) settles three points.

1. **A landscape phone is wider than 16:9, not taller.** The screenshot is roughly
   **851 × 324 CSS px** of usable area — about **2.6:1**. A fixed 16:9 stage would
   pillarbox away a third of the width on the exact device that produced the complaint.
2. **The ports that worked hid detail behind a tap.** Subset Games said every window in
   Into the Breach was revisited for touch, and that they gave up showing everything at
   once in favour of collapsible panels. XCOM puts the ability list behind the unit icon.
3. **The negative example is our own genre.** FFT: War of the Lions on mobile kept the PSP
   menus, and fifteen years on the criticism is still "too many button presses,
   confirmation windows and virtual buttons". Porting the desktop chrome is the failure
   mode, not the safe option.

Confidence: the layout claims about those games are search-snippet grade, not fetched
pages. The 851×324 figure is derived from one screenshot and an assumed device pixel
ratio of 2.75. Neither is verified on hardware.

### The owner's words

> "Our principle is wrong" — not a rule on top of the old one. The viewer is rebuilt
> phone-landscape first, with mobile game UI parts, and the stage height is limited to a
> phone's landscape height **even on desktop**.

## Decision

### 1. One logical stage: 360 units tall, fluid width, uniformly scaled

```
stageH = 360                                    // logical units, always
stageW = clamp(640, round(360 * vw / vh), 900)  // 1.78:1 … 2.5:1
scale  = min(vw / stageW, vh / stageH)          // uniform; centre; letterbox the remainder
```

- **Fix the scarce axis.** Phone landscape logical heights cluster at 375–393 CSS px and
  browser chrome eats 50–75 of that. 360 is reachable at `svh` on current phones.
- **Let the plentiful axis breathe.** Width follows the viewport's aspect, clamped so the
  HUD neither crowds at 1.78:1 nor drifts apart past 2.5:1.
- **Scale is uniform.** No stretch, no per-axis fit. Anything left over is letterbox.
- **Desktop gets the same stage**, letterboxed, centred on ADR-0028's parchment table.
  ADR-0028's palette, fonts and contrast rule are untouched.

`vw` and `vh` are the **stage host's measured box**, an element sized `100svw × 100svh`.
Small viewport units, deliberately. Everything is measured from `getBoundingClientRect()`,
never from the CSS variable — a variable computed correctly and applied to nothing reads as
working from the variable's side.

Derived, in CSS px, and these are the numbers `docs/10` AC-V33 asserts. Tolerance is
**1 CSS px**, and "none" means under 1 px:

| Viewport | Aspect | `stageW` | `scale` | Letterbox, total |
|---|---|---|---|---|
| 640×300 | 2.13 | 768 | 0.8333 | 0 |
| 800×360 | 2.22 | 800 | 1.0 | 0 |
| **851×324** — the owner's phone | 2.63 | **900** — clamped | **0.9** | **41 px horizontal** (20.5 per side) |
| 900×390 | 2.31 | 831 | 1.0830 | 0.11 px vertical — under tolerance |
| 1000×780 | 1.28 | **640** — clamped | 1.5625 | 217.5 px vertical (108.75 per side = **69.6 stage units**) |

**851×324 is the only viewport that reaches the 900 clamp**, which is why the owner's own
phone is in the test set. Drop the clamp and `stageW` becomes 946, the stage fills the
width, and the 41 px pillarbox disappears — that row is the only one that goes red. Assert
the **pillarbox**, not the scale: 0.9 against 0.8996 is four hundredths of a percent and
would tie under any sane tolerance.

**A note the brief does not make, and it changes what desktop looks like.** The brief says
desktop "gets the same 900×360 stage". The formula does not agree: width follows aspect,
so a 4:3 desktop window gets the **narrowest** 640-unit stage, not the widest. 900 is
reached only past 2.5:1. The formula is what a test can check, so the formula wins and the
table above is the spec.

**Board budget at 360 tall:** 60 top bar + 84 bottom bar leaves **216** units of height for
the board. At the board's 900:440 ratio (2.045:1) that is **442 units wide**, which fits
inside the narrowest 640-unit stage less the actor tab, with room over.

> **Said precisely, because the loose version is wrong.** `viewFor` fits the *content* to
> the canvas's **900×440 backing store**. It does not fit the board to an arbitrary CSS
> width. The CSS box scales that fixed store. So the reason the budget works is the
> arithmetic above — 216 × 2.045 = 442 — not "the auto-fit camera handles any width".
> AC-V19 still pins the camera and the click to one fit function, untouched by this ADR.

### 2. At rest, nothing covers the board

This is the rule the screenshot broke, and it is the reason for the zone map.

- The **actor tab** and both bars are **laid out beside and around** the canvas, never over
  it. The canvas box is the space that is left.
- The **preview sheet**, the **drawers**, the **action sheet** and the **toast** are
  overlays. Each exists only in response to something the player just did.
- "At rest" means: nothing selected, or a unit selected with no target staged. Those are
  the two states `docs/10` AC-V34 measures.

> **The brief's zone map draws the actor tab inside the board rectangle.** Read literally
> that contradicts its own headline rule. Resolved here in favour of the rule: the tab is a
> layout column, not an overlay.

### 3. The zones

| Zone | Contents | Behaviour |
|---|---|---|
| Top-left | ☰ menu | opens a **left drawer**: save, quit, turn log, legend |
| Top-centre | turn-order chip strip | always on, one row; tap expands it |
| Top-right | `?` help, ⚙ settings | two icon buttons |
| Centre | the board canvas | auto-fit; uncovered at rest |
| Left, mid | **actor tab** — name and HP only | tap opens a left drawer holding ADR-0033's full stat set; closes when a target is selected |
| Right | **preview sheet** | absent until a target is staged; carries `docs/10` §4's set **plus Confirm** (ADR-0038); overlays **at most 35%** of the canvas width |
| Bottom | action bar: **Cancel** left, **Actions ▲** centre, **phase-aware primary button** right | always on; Actions opens a bottom sheet listing each learned ability with its **name and range** |
| Bottom-centre float | toast | the reason an illegal tap was refused; render-only, **untimed** |

ADR-0033's plate becomes the **left tab plus its drawer**. Every number it printed is kept;
only where it lives changes.

**The primary button is phase-aware, and without it the enemy's turn has no control.** In a
player phase it is **End Turn** with its Clock price. In `AI_TURN` it reads **"Enemy turn
▸"** and performs **Step** — explicit, never a timer, because a wall-clock advance makes
command count a function of elapsed time (`docs/10` §3). This was a blocker found in review;
the first draft of this ADR simply had no enemy-turn affordance.

**The sheet is bounded at 35% of the canvas width** so a visible target can be re-staged with one
tap. A target underneath it needs Cancel first. **Tapping a unit that is not a legal target**
opens the unit drawer read-only for that unit — ADR-0033's parked cursor-follow inspect,
arriving as a tap through the `focusUnitId` seam that ADR kept alive.

**Two things sit OUTSIDE the stage element**: the **rotate gate** (ADR-0034) and the help
disc. The stage is a transformed ancestor, and `position: fixed` inside one resolves against
that ancestor rather than the viewport — a full-screen gate placed inside the stage would be
scaled and clipped by the thing it is meant to cover.

**The Actions sheet prints range, not cost, and that is a fact about the schema.**
`BattleAbilitySchema` has no per-ability cost: `apCost` is progression-only and is dropped
from the battle projection by design (ADR-0010/0011). The price of acting is the turn's flat
Clock price, printed once in the sheet header.

### 4. Touch is the primary input, and every target is thumb-sized

- **Minimum 44 × 44 CSS px** for every interactive control, at every supported viewport.
  The narrowest, 640×300, is where this binds; iOS asks 44 pt, Android 48 dp. At that
  viewport the scale is 0.833, so a control needs **≥ 53 stage units** to clear 44 CSS px.
  **Board tiles are exempt — see Limits.**
- `viewport-fit=cover` on both pages, then pad with `env(safe-area-inset-*)`. Neither page
  carries `viewport-fit` today. In landscape a notch takes roughly 44–59 px off one side.
- **`svh` for the stage height.** `dvh` re-lays-out on every toolbar change; `index.html`
  and `viewer.html` both use `dvh` today.
- `touch-action: manipulation` on controls, `touch-action: none` on the canvas,
  `user-select: none` on chrome. **Never `user-scalable=no`.**

### 5. The settings drawer prints the viewport, in the game

Owner direction: they cannot read their own viewport size, so the game must show it.
Settings displays four things: `visualViewport` width and height, the **stage host's
measured box**, the derived `stageW` and applied `scale`, and the **current tile size in CSS
px**. This is the instrument that turns the 360 figure from a guess into a measurement the
next slice can check against a real device.

The host box and `visualViewport` are printed **separately** because they can disagree, and
that disagreement is the bug an on-device readout exists to catch. The tile size is there
because tiles are exempt from the 44 px floor and nothing else can tell the owner how small
they actually are.

### 6. Supported viewports are the test set

**640×300, 800×360, 851×324, 900×390, 1000×780.** Every geometry criterion in `docs/10` is
asserted at all five. A fluid width has to be proved at both ends or it is proved nowhere,
and **851×324 — the owner's own phone — is the only one that reaches the 900 clamp.**

### 7. Scope: the battle screen only

**The stage rule applies screen by screen, and this slice moves one screen.** Title, prep,
briefing and the scene player keep their current layout, outside the stage. The research
brief sketches how each maps onto the stage; that sketch is a proposal, not a spec.

**Follow-up slice, named so it cannot be forgotten: "the remaining screens on the stage",**
with its own ACs at **AC-V43 onward**. Without this paragraph, "the viewer is built for a
landscape phone" reads as a claim about five screens when it is evidence about one.

## Consequences

**Easier.** One stage, one scale, one place every screen is laid out. The board, the stat
set and the resolution preview are all reachable on a phone without a scroll. Desktop and
phone stop being two layouts that drift.

**What we give up.**

- **ADR-0033's placement is gone.** The plate reads as a tab and a drawer, and the full
  stat set now costs a tap. That is the Into the Breach trade taken deliberately.
- **The desktop board gets smaller.** A 780-tall window used to give the board its full
  height; it now letterboxes to 360 units. The owner asked for exactly this.
- **The battle screen and the other four now differ**, until the follow-up slice lands.
  That is a deliberate, named intermediate state, not a drift — see decision 7.
- **The campaign's fixed help disc is hidden on the battle screen**, in favour of the
  stage's own `?` button. Two help affordances on one screen is one too many, and the disc
  is the one that would land on the board. It is untouched on every other screen.
- **The ☰ drawer's entries differ per page, and the campaign has no Save BUTTON.** The shell
  autosaves on every transition, so the drawer carries a **note** saying so. A Save control
  would validate nothing and do nothing while looking like it worked — the dead-slot shape
  this repo has already shipped once (ADR-0017). `docs/10` AC-V40 lists both pages.
- **AC-V31 is retired**, not weakened. Its promise — board, plate and controls visible at
  844×390 — is subsumed by AC-V33 and AC-V34, which measure **five** viewports instead of
  one and forbid the overlap AC-V31 permitted.

**Invariants this creates.**

- **The board is uncovered at rest.** Any new overlay must be tied to a player action, or
  it belongs in the layout.
- **One scale.** Nothing may size itself against the raw viewport instead of the stage, or
  the letterbox stops meaning anything.
- **44 px is a floor, checked at the smallest viewport**, not at the comfortable one.

## Limits — recorded honestly

- **360 rests on one screenshot.** One device, one browser, one chrome height, and a device
  pixel ratio that was assumed rather than read. The settings readout in decision 5 exists
  to replace that guess with a measurement.
- **Real-device behaviour is still unverified**, exactly as ADR-0034 recorded. Chromium
  emulation cannot reproduce safe-area insets, so `env(safe-area-inset-*)` is asserted as
  **present in the stylesheet** and nothing more (`docs/10` AC-V41). A test cannot say the
  notch is cleared on hardware.
- **Board tiles miss the 44 px floor and there is no fix in this slice.** A tile measures
  roughly **30 × 15 CSS px at 640×300** — the figure is the reviewer's measurement and
  varies with a map's tile count, which is why the settings readout prints the live value.
  Tile size is the camera's business, not CSS's, so it cannot change until pinch zoom
  lands. **Mis-taps on the board are a real, uncovered defect until then**, and `docs/10`
  AC-V35 records tiles as explicitly NOT asserted rather than quietly enumerating around
  them.
- **Camera pan, pinch and double-tap-to-refit are DEFERRED to a later slice.** The zone map
  shows them; this decision does not ship them. **The warning is the important part:**
  `pickTile` must invert the same pan and zoom the painter applies (`docs/10` **AC-V19**).
  A camera change that touches only the painter offsets every tap by a constant and fails
  silently, which is the same hazard AC-V10 covers for height.
- **Nothing here says the layout is legible or pleasant.** The canvas is still unmeasured
  (ADR-0030, ADR-0032), and no stranger has played this on a phone.
- **The research is snippet-grade.** Apple's HIG returned no body through the proxy, and
  every HUD claim about Into the Breach and FFT WotL is assembled from search snippets. The
  44 pt figure rests on secondary sources.

## References

- `docs/10` §3 (the gesture model, rewritten by ADR-0038), §8 (the stage and its zones),
  AC-V33 … AC-V42.
- ADR-0033 (the stat set — kept; the placement — superseded), ADR-0034 (landscape only),
  ADR-0028 (parchment), ADR-0032 (the board moves), ADR-0038 (Confirm is a separate tap).
- The research brief and its zone map, `art-director`, 2026-09-05.
- `playwright.config.ts` (the 1000×780 baseline), `src/render/iso.ts` (the 900×440 canvas
  and the auto-fit camera), `index.html`, `viewer.html`.
