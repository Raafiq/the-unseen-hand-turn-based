# The overhaul look — style guide

Thirteen concept renders by the owner, 1672×941. **LOOK ONLY** — every stat, level, MP bar,
job name and character name in them is placeholder and none of it is in scope. The vocabulary:
dark wood table, parchment leaves in an iron-bound board, brass rivets, house ribbons, iron
plaques with light Cinzel-ish capitals, a gold selection glow. This extends ADR-0028's
measured palette; it does not start a second one.

`Combat scene (Move).png` was re-encoded losslessly (RGBA→RGB, alpha was 255 everywhere) to
clear the 3 MiB `check:assets` cap: 4,018,177 → 3,048,430 B, pixels identical. Other twelve untouched.

## (a) Palette

Sampled by `coverage/overhaul/sample-palette.py`. Nothing was chosen by eye — two boxes that
*looked* right were wrong on the first run (the banner at its hem came back near-black; the
NEW GAME glyph box landed on the plaque field). Reducers: `median` for fields, `lum:F` for a
small lit feature in a dark box, `red|blue|warm:F` for a bar whose box cannot avoid its ground. The scene rows add
`dark:F` — the median of the DARKEST F of a box — because a dialogue stroke is thin
italic and a median over any box big enough to hold a letter returns the parchment.

| role | hex | source image | box | reducer | what is in the box |
| --- | --- | --- | --- | --- | --- |
| `wood` | `#150b09` | Title screen | `(980,900,1180,938)` | median | table plank below the codex, unlit |
| `wood-lit` | `#251811` | Title screen | `(300,38,520,58)` | median | the board's top rail, candle side |
| `wood-deep` | `#0b0504` | Title screen | `(1440,895,1660,938)` | median | same plank, far unlit corner |
| `rail` | `#6c4227` | Title screen | `(758,300,786,700)` | median | the bound rail between the leaves |
| `parch-hi` | `#ddb992` | Title screen | `(1000,290,1200,312)` | median | right leaf at its lit centre |
| `parch` | `#d4af86` | Title screen | `(1000,660,1200,690)` | median | right leaf, clear field |
| `parch-lo` | `#c99f75` | Title screen | `(1000,768,1200,790)` | median | **last stop text may sit on** |
| `parch-burn` | `#b6885d` | Title screen | `(1000,822,1200,840)` | median | leaf inside the scorch band |
| `plaque-hi` | `#2b2725` | Title screen | `(960,344,1360,352)` | lum:.10 | sheen inside the plaque's top edge |
| `plaque` | `#1d1e1e` | Title screen | `(960,380,1020,420)` | median | New Game field, left of the N |
| `plaque-lo` | `#1b1a17` | Title screen | `(960,440,1360,450)` | median | the same field at its foot |
| `plaque-lip` | `#282019` | Title screen | `(908,330,916,455)` | median | the plaque's outer bevel |
| `brass` | `#714b31` | Title screen | `(1370,332,1408,368)` | lum:.10 | rivet body |
| `brass-lit` | `#d8a472` | Title screen | `(1370,332,1408,368)` | lum:.02 | that rivet's specular face |
| `label` | `#fdf1dc` | Title screen | `(1030,362,1300,418)` | lum:.05 | the capitals of NEW GAME |
| `ink-display` | `#19130c` | Title screen | `(318,168,322,200)` | median | stem of the T in the title |
| `ink-drawing` | `#5e412a` | Title screen | `(250,640,420,700)` | median | the castle pen drawing, mid-tone |
| `navy` | `#12283d` | Title screen | `(160,235,215,268)` | median | house banner field |
| `lion` | `#ad6f33` | Title screen | `(150,150,215,225)` | lum:.05 | the rampant lion on it |
| `glow` | `#fcc14b` | Prep (Profile) | `(24,290,42,400)` | warm:.15 | selection ring on the chosen card |
| `seal-red` | `#9a0e1a` | Prep (Profile) | `(1470,865,1655,925)` | red:.10 | the Deploy wax seal |
| `ribbon-red` | `#5f1926` | Prep (Profile) | `(410,190,460,270)` | red:.15 | the second house's card ribbon |
| `hp-red` | `#7e2e26` | Combat (Attack) | `(200,700,400,820)` | red:.05 | HP bar on the actor card |
| `mp-blue` | `#405f78` | Combat (Attack) | `(200,700,400,820)` | blue:.05 | MP bar on the actor card |
| `box-parch-hi` | `#c9a684` | Narration scene | `(300,726,700,742)` | median | dialogue box under its top rail |
| `box-parch` | `#ccab8b` | Narration scene | `(600,818,1100,836)` | median | box field between last line and rule |
| `box-parch-lo` | `#bf9976` | Narration scene | `(1440,735,1478,845)` | median | **box field at its darkening right end** |
| `plate-parch` | `#be956f` | Narration scene | `(430,668,520,702)` | median | name plate field, right of the name |
| `iron` | `#1b1512` | Narration scene | `(1490,750,1504,800)` | median | the box's frame band, between rivets |
| `iron-hi` | `#b19a88` | Narration scene | `(600,680,1000,688)` | lum:.10 | sheen along that frame's top edge |
| `iron-lo` | `#221c19` | Narration scene | `(600,878,1000,890)` | median | the frame's bottom band, unlit |
| `rivet` | `#987152` | Narration scene | `(220,856,236,874)` | lum:.15 | the frame's bottom-left rivet body |
| `rivet-lit` | `#eedcbf` | Narration scene | `(220,856,236,874)` | lum:.03 | that rivet's specular face |
| `ink-line` | `#080201` | Narration scene | `(300,778,460,812)` | dark:.03 | the dialogue stroke — near-black, not `--ink` |
| `ink-name` | `#060201` | Narration scene | `(300,664,420,704)` | dark:.03 | the name's stroke on its plate |
| `rule` | `#372519` | Narration scene | `(700,840,1100,846)` | dark:.25 | the hairline across the box's foot |
| `chevron` | `#2f1d12` | Narration scene | `(1396,820,1424,848)` | dark:.14 | the 'more' mark, bottom-right of the box |
| `chevron-lit` | `#cfaf8d` | Narration scene | `(1396,820,1424,848)` | lum:.08 | that mark's brass highlight |
| `house-blue` | `#262b3b` | Narration scene | `(95,676,190,702)` | median | left ribbon field, above the lion |
| `house-blue-lit` | `#373e50` | Narration scene | `(95,676,190,702)` | lum:.10 | that field where the fold catches light |
| `house-charge` | `#b38b64` | Narration scene | `(120,706,200,830)` | lum:.06 | the rampant lion on the blue ribbon |
| `house-red` | `#682822` | Narration scene | `(1524,686,1622,714)` | red:.20 | right ribbon field, above the gryphon |
| `ribbon-rod` | `#b17860` | Narration scene | `(1516,664,1630,678)` | lum:.12 | the brass rod both ribbons hang from |
| `night` | `#433431` | Narration scene | `(490,0,1235,428)` | median | the whole backdrop crop, as one tone |
| `night-sky` | `#323b4f` | Narration scene | `(1100,10,1235,70)` | median | night sky inside that crop |
| `ember` | `#f9934f` | Narration scene | `(560,560,760,650)` | warm:.06 | firelight in the courtyard |

1. **This parchment is darker than the shipped `--surface` `#e9d7a8`, and three of ADR-0028's
   inks stop clearing 4.5:1 on it.** On `parch-lo`: `--ink-soft` 4.07, `--ink-faint` 3.79,
   `--accent-ink` 3.83 — all fail. Only `--ink` (`#2c2114`) holds, at 6.52. Every screen
   ported to this look must re-measure its ink ladder; do not assume it survives.
2. **`navy` is a deep `#12283d`, not the royal blue it reads as** — dark enough that the
   board's state channel (selection and range blue) is untouched by it.
3. **No gold text anywhere.** The concept carries none, so ADR-0028's 1.55:1 trap never
   arises here. `--accent` stays rules-and-borders only.

## (b) Surfaces — CSS recipes

All CSS; the only rasters are the crops in (e). Working versions: `coverage/overhaul/title.html`.

| surface | recipe |
| --- | --- |
| **wood ground** | `radial-gradient(58% 78% at 3% 6%, rgba(255,178,88,.34), rgba(255,140,44,.09) 38%, transparent 68%)` (candle) over a noise tile over `linear-gradient(158deg, wood-lit, wood 46%, wood-deep)`; blend `screen, overlay, normal`. |
| **parchment leaf** | `--stain, --tooth, radial-gradient(126% 96% at 50% 34%, parch-hi, parch 54%, parch-lo 82%, parch-burn)`; blend `multiply, overlay, normal`. Inset scorch `inset 0 0 var(--burn) var(--burn-spread) rgba(74,40,14,.50)` + a 1px `rgba(58,32,12,.55)` rim. A `::before` inset by `burn*.62` carries the double gold rule (`1px solid rgba(138,101,36,.55)` + `inset 0 0 0 3px rgba(138,101,36,.34)`). |
| **iron plaque** | `linear-gradient(180deg, plaque-hi, plaque 40%, plaque-lo)` + a grain tile at `soft-light`; `box-shadow: inset 0 0 0 1px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,226,180,.13), inset 0 -.14rem .4rem rgba(0,0,0,.6), 0 0 0 .18rem plaque-lip, 0 0 0 .3rem rgba(0,0,0,.6), 0 .22rem .5rem rgba(0,0,0,.6)`. |
| **rivet** | `radial-gradient(circle at Xrem Yrem, brass-lit 0 26%, brass 26% 64%, rgba(0,0,0,.8) 64% 84%, transparent 86%)`, four of them, positioned `0 0, 100% 0, 0 100%, 100% 100%`. **Computed from the surface's own corners** — never placed by hand, so they cannot drift at another stage size. |
| **ribbon** | ships as a crop (see (e)), clipped `polygon(3% 0, 97% 0, 97% 86%, 50% 100%, 3% 86%)` for the swallowtail. A CSS-only ribbon would be `navy` field, `lion` charge, gold hem — but nothing in CSS draws a rampant lion. |
| **gold glow** | `0 0 0 .18rem var(--glow), 0 0 1.1rem .1rem rgba(252,193,75,.55)`. This is `:focus-visible` and "selected"; it is scarce and must not become decoration. |

**Deviation, declared:** the mockup softens ADR-0028's `--tooth`/`--grain` with one extra
`feColorMatrix` squeezing the noise into ~[.32,.68]. Full-amplitude per-pixel noise reads as
salt at stage scale rather than the concept's soft mottle, and being incompressible it alone
pushed a lossless 1000×780 capture past 1 MB. Same turbulence, seed and tile.

## (c) Type — three roles, four faces already on disk

| role | face | where |
| --- | --- | --- |
| display line | **EB Garamond 600**, upright | "The Unseen Hand" — the concept's face is an upright bookish serif, not a blackletter |
| italic subtitle & lede | **EB Garamond 400 italic** | "The First March", the lede paragraph |
| plaque capitals | **Cinzel 600**, `letter-spacing:.085em` | NEW GAME, CONTINUE, COPY PLAYTEST LOG |

**Grenze Gotisch is not used on the title screen** — the concept has no blackletter anywhere.
It stays the face for battle and scene headings until the owner says otherwise; that is a call
to make, not a fact. No new fonts. Note the DOM role flip: `.eyebrow` now carries the **display**
line and `h1` the italic subtitle, the reverse of the live page's hierarchy.

## (d) The phone fold, per ADR-0037

- **640×300 (narrowest supported).** Two leaves side by side, spine between. Left leaf:
  ribbon, display line, ruled fleuron divider, subtitle, lede, castle strip pinned to the
  foot. Right leaf: two plaques centred. The log plaque straddles the board's bottom-left
  corner. Text scale `clamp(10px, 4px + .9vh + .6vw, 19px)` → 10px base.
- **851×324 (the owner's phone).** Same structure, 12px base. The lede settles to three
  lines and the castle strip roughly doubles. This is the size the layout is tuned for.
- **1000×780 (desktop).** The stage is taller than 8:5, so the **codex is capped at 8:5 and
  centred** and the surplus becomes table. Without the cap the leaves go portrait and both
  fill with dead parchment. 19px base; the castle keeps its own 610:290 aspect and pins to
  the leaf's foot rather than upscaling into a column.

The castle never exceeds `max-height:54%` of the leaf or its own aspect, and the left leaf's
text gutter is derived from `--banner-w`, so the ribbon can never grow over the title.

## (e) Concept crops that may become assets

Text-free regions only. Candidates sit in `coverage/overhaul/` (scratch) until the owner picks;
nothing is committed under `docs/`. These are photographic, so **WebP q88–90** — 5× smaller than PNG.

| crop | source box in `Title screen.png` | size | PNG | WebP | use |
| --- | --- | --- | --- | --- | --- |
| castle ink drawing | `(132,502,742,792)` | 610×290 | 387 KB | **74 KB** | the left leaf's foot; `mix-blend-mode:multiply` so it tints with the parchment |
| blue lion ribbon | `(110,20,282,342)` | 172×322 | 93 KB | **14 KB** | the house banner, clip-pathed |
| watermark lion | `(1280,118,1592,318)` | 312×200 | 102 KB | **13 KB** | pressed into the right leaf at `opacity:.55, multiply`. A **partial** lion — the full one overlaps the plaques and cannot be cut text-free |
| burning castle | `(490,0,1235,428)` in `Narration scene.png` | 745×428 | 401 KB | **41 KB** | the scene player's painted ground, dimmed. Text-free, and clear of both concept characters — their hair reaches x 468 and x 1247 |

All well under 1 MB. None needs transparency: each is a rectangle shaped by `clip-path` or a
CSS mask, which sidesteps the cutout problem entirely.

## (f) Scene player

Concept `Narration scene.png`. Mockup `coverage/overhaul/scene.html` → `mockups/scene-{640x300,851x324,1000x780,851x324-read}.png`.
Colours by `sample-scene.py`; contrast by `measure-scene.mjs` + `contrast-scene.py`. **The DOM is the
one `src/render/scene.ts` already builds — every change is CSS**: `display:contents` on `#scene-story`
and `.scene-body` makes the figure, the log, the three controls and Continue items of one grid.

| part | recipe |
| --- | --- |
| **iron band** (`.card`) | `linear-gradient(180deg,#3a2e26,iron 26%,iron-lo 82%,#100c0a)` + `--grain` at `soft-light`; four rivets computed from its own corners; `inset 0 1px 0 rgba(230,196,150,.30)` is the concept's lit top edge. |
| **dialogue box** | a `.card::before` grid item spanning the last two columns: `--stain, --tooth, radial-gradient(132% 108% at 34% 30%, parch-hi, parch 48%, parch-lo)`, blend `multiply, overlay, normal`, inset scorch `0 0 .7rem .28rem rgba(74,40,14,.34)`. One sheet under both the lines and the footer. |
| **the rule** | `.scene-lines`'s own background at `center bottom`, `calc(100% - 1.9rem)` wide — the inset is computed from the box, never placed. |
| **name plate** (`.who`) | EB Garamond 400 italic on `plate-parch`, `line-height:1.28` (at 1 the em box overhangs the plate), iron lip + black rim, a house pennant clipped to a swallowtail at its left. |
| **portrait frame** | 3:4, `align-self:end`, `height:calc(100% + 2.15rem)` so the head breaks the top rail; parchment ground, four brass rivets from its own corners, `object-position:50% 16%`. |
| **title plaque** (`h1`) | the title screen's plaque, Cinzel 600 caps in `label`, top-left on the painted ground. The concept has no title; this is borrowed vocabulary, which is why its 14:1 was already known. |

**The ribbon rule is UNDECIDED and this mockup does not decide it.** Which house owns blue and
which red needs a field no character carries. The mockup keys on the one thing that *is* in the
data — `figure[data-state]`: blue while somebody speaks, greyed at `state="none"` (narration).
The concept's second, red ribbon has nothing to drive it.

**Three things the concept has that this cannot.** (1) **No busts** — every portrait on disk is a
192×256 head crop, so the frame keeps the bust's one readable trait, breaking the top rail, and
nothing else; a half-body asset is a new source, not a re-crop, and it would retire the 3:4 frame.
(2) **No plate on the rail** — `.scene-lines` is the scroll container, so an absolutely positioned
plate is clipped by its own overflow, and a `sticky` one keeps naming a speaker through the
narration line below it, the exact mis-attribution `group()` guards. Plates sit in the log.
(3) **No bare chevron** — the concept's "more" mark has no accessible name and no measurable text;
it is the More plaque here.

**The fold.** **640×300**, 10px base: the assembly takes ~57% of the stage and three lines fit.
**851×324**, 12px base, the tuned size: two of the prologue's four lines fit and the rest scrolls,
which is what makes `Show all` matter. **1000×780**, 17px base: the painted ground keeps the whole
viewport — unlike the title's codex it is a picture, not a page — and the assembly caps at `46rem`.

**Two measured rules.** No fade mask over live text — a `mask-image` at the box's top edge put the
name plate it crossed at **2.14:1** while `getComputedStyle` still reported `#2c2114`. And every text
element is `--ink` or `--label`; none of ADR-0028's softer inks appear (§(a) note 1). Worst margin
over the 4.5:1 floor across all four captures: **+1.11**.

**Nothing measures the canvas.** These numbers cover the parchment shell only. No automated
check reads the battle board's legibility, and none of this says the screen is *understandable*
— only that its text clears the bar.
