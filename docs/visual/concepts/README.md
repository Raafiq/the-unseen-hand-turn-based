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
small lit feature in a dark box, `red|blue|warm:F` for a bar whose box cannot avoid its ground.

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

All well under 1 MB. None needs transparency: each is a rectangle shaped by `clip-path` or a
CSS mask, which sidesteps the cutout problem entirely.

**Nothing measures the canvas.** These numbers cover the parchment shell only. No automated
check reads the battle board's legibility, and none of this says the screen is *understandable*
— only that its text clears the bar.
