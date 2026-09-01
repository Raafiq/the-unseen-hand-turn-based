<!-- written-against: da57993 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive. **A "nothing covers X" you read here
> is a hypothesis too** — grep for the test before repeating it. This file has carried a
> false one before.

---

## OPEN — WAITING ON THE OWNER

**Read this before telling the owner "nothing is pending".** Three asks are outstanding.

Each one carries the material needed to answer it. The session that opened them asked
twice with nothing attached, and that is what made them useless. **A deliverable the
owner must act on is relayed, never summarised** — do not shorten anything below.

### Ask 1 — run the Midjourney style probe

Midjourney runs on the owner's subscription. No agent here can call it, so the prompts are
the only thing we can hand over. **Paste all three verbatim.**

The subject is a female knight on purpose. It stresses metal, cloth, hair and skin at
once, and it tests the failure most likely to wreck half the set: the model reading
"woman" as glamour rather than as a soldier.

```
1. [CEL - closest to the reference]
head and collar portrait of a woman mercenary knight, short dark hair under an open steel
coif, plain riveted gorget, dull woad-blue padded gambeson collar, weathered and scarred,
anime cel illustration, clean thin warm-brown ink line, three flat shading tones, no
gradient on the skin, three-quarter turn to the left with eyes toward the viewer, head
fills two thirds of the frame, cropped at the collarbone, flat even light, muted earth
palette of tan skin and dull steel, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, rim light, glow, lens flare, glamour, lipstick,
jewellery, text, watermark

2. [GOUACHE - sits closer to the parchment shell]
head and collar portrait of a woman mercenary knight, short dark hair under an open steel
coif, plain riveted gorget, dull woad-blue padded gambeson collar, weathered and scarred,
opaque gouache on toned paper, visible brush facets, soft edges, no ink outline,
three-quarter turn to the left with eyes toward the viewer, head fills two thirds of the
frame, cropped at the collarbone, flat even light, muted earth palette of tan skin and
dull steel, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, rim light, glow, lens flare, glamour, lipstick,
jewellery, text, watermark

3. [INK AND WASH - hardest line, strongest at 28px]
head and collar portrait of a woman mercenary knight, short dark hair under an open steel
coif, plain riveted gorget, dull woad-blue padded gambeson collar, weathered and scarred,
ink and watercolour, hard confident ink line of varying weight, colour washed inside the
line and breaking at the edges, dry-brush texture, paper grain, three-quarter turn to the
left with eyes toward the viewer, head fills two thirds of the frame, cropped at the
collarbone, flat even light, muted earth palette of tan skin and dull steel, flat pale
sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, rim light, glow, lens flare, glamour, lipstick,
jewellery, text, watermark
```

Five notes go with the prompts:

- **Judge the winner at 28 px, not at full size.** The turn-order strip re-crops the same
  art that small, where only the headgear silhouette survives.
- **What comes back is the winning IMAGE, used as the style reference.** ~~The winner's
  style reference code (`--sref`).~~ **That was wrong** — Midjourney's own docs say
  verbatim: "You cannot create a style code based on an uploaded image." Upscale the
  winner, upload it, drag it into the Style Reference slot and click the lock icon. Then
  every one of the 16 prompts wears it. Without a fixed reference the set will not look
  like one game.
- **Strip the style clause from the 16 production prompts.** The probe prompts are
  deliberately heavy on style words ("anime cel illustration, three flat shading tones").
  Official best practice is the opposite once a reference is locked: style words in the
  prompt fight the reference.
- **The flags are now VERIFIED against V8.2**, from ten official pages the owner pasted in
  on 2026-09-01. ~~UNVERIFIED against v8.1.~~ Two were wrong and are corrected above:
  `--style raw` is now **`--raw`**, and **`armour below the shoulders` was deleted from
  the `--no` list** — `--no` is judged word by word, so on a female subject that reads as
  "no armour" + "no shoulders", the exact moderation trap the docs warn about.
  `--ar 5:6` and the commas inside `--no` are both fine.
- **`docs.midjourney.com` is EGRESS-BLOCKED in the sandbox** (403 at the proxy, whole
  domain). The local copy of the docs lives in **`.claude/skills/midjourney/`** — read it
  rather than web-searching, which is what produced both errors above.

### Ask 2 — the turn plate is mostly hidden behind the damage number

**"Turn plate" = the small parchment label carrying the acting unit's name, shown over
their head when their turn starts.**

When the struck unit is also next to act, both labels land on one head and the numeral now
paints over the plate. That ordering was deliberate — the plate's opaque box used to erase
the damage number for its whole ~700 ms window, which was worse. It is still an appearance
call and it is unresolved.

**Render the alternatives before asking again.** A multiple-choice question about how
something looks is unanswerable in prose (`CLAUDE.md`, said by the owner three times).

Lower stakes and also open: a clamped back-row plate's pointer no longer touches its unit.

To see the current behaviour: run `npm run test:visual`, then open
`visual-artifacts/playtest/05c-turn-plate.png`. That directory is gitignored and empty
until you run the capture. `docs/visual/motion/run.mp4` **is** committed but predates the
reversal — it shows option B's placement, not what ships.

### Ask 3 — portraits: where does the team colour go?

**Downstream of ask 1. It cannot be answered yet.** A rendered comparison needs at least
one real portrait to exist, and none does. Do not present this as answerable now.

| Route | Count | Risk |
|---|---|---|
| Red/blue on the **clothing** | 8 jobs x 2 genders x 2 colourways = **32 portraits** | a recolour can drift the face |
| Red/blue on the **panel chrome and backdrop**, the way Final Fantasy Tactics does it | **16 portraits** | none — the art itself is untouched |

---

## THE NEXT SLICE — portraits, then the mini stat window

**Blocked on ask 1: no portrait art exists.** Everything else about the slice is settled.

**Owner order, unchanged since 2026-08-30.**

1. **The human playtest is DELAYED, not dropped.** Still the top open question and still
   the only thing that can answer it. It is a **standing reminder** — see the section
   below — not the gate on the next slice.
2. **Look and feel comes before combat.** Do not open a balance, ability, encounter or
   scheduler slice unless the owner asks.
3. **The variety score (7 → 8) is OFF the priority list.** Not weakened, not relitigated:
   `DIVERSITY_TARGET_N` stays 7, `docs/06` AC-E2's release bar stays ≥ 8, the gate still
   fails CI on a drop. Leave `docs/06`, `docs/08` §1a and `docs/11` §3 exactly as they
   read.

### What the mini stat window is

The **expanded bottom row of the turn-order rail**, not a separate widget. It carries a
portrait, HP, MP, CT, Bravery/Faith and a job + level row, modelled on the reference
panel.

Portraits come first because the panel's layout depends on the crop. The panel can be
built against the shipped `placeholder.svg` (96×116, aspect 5:6). **Keep that aspect** —
the reference panel uses it.

### Explicitly NOT green-lit (owner, 2026-09-01)

Both were proposed this session and declined. Recorded so nobody re-proposes them as new.

| Proposal | Status |
|---|---|
| A SessionStart warning for remote branches missing from the local clone | **declined** |
| Any further retrospective edits | **declined** |

### The visual work, in order

**Before writing any stylesheet or renderer, get a reference or put rendered options in
front of the owner.** Proven twice now. The parchment slice was rebuilt from a description
twice before one image settled it. And the FIRST battle-map pitch — three re-colourings of
the existing board — was rejected outright with the actual diagnosis: *"actual grounds
instead of this blocky generic"*. **Final Fantasy Tactics draws no grid on the ground**;
that one fact was the whole fault, and no amount of palette work would have found it.

| # | Slice | State | The catch |
|---|---|---|---|
| 1 | **Painted ground on the battle map** — textured grass, worn dirt, cut rock, water, props, no grid. | **LANDED 2026-08-30** (ADR-0030, AC-V18/V19), all five battles. | See the traps below. The engine demo page still draws the flat look, and that is what keeps AC-V18's A/B possible — do not paint it. |
| 2 | **Paint the other four battles.** | **LANDED 2026-08-30** — all five painted. | Coverage is now bidirectional: a sixth battle cannot ship unpainted, and a map keyed to a renamed battle fails. Props are kept off unit start tiles by a guard. |
| 3 | **Unit presentation.** Still flat kite tokens with a facing pip. | **DEFERRED by the owner, 2026-08-30** | Deliberately bundled with **portrait art**: the owner will decide the token when they hand over the portrait reference images. Three treatments are drawn (kite / heraldic shield / standing figure). Do not pick one under cover of another slice, and do not ask again before the references arrive. |
| 4 | **Motion and feedback** — hit reactions, turn transitions. | **LANDED 2026-09-01** (ADR-0032 + its amendment). Hit reaction, turn plate, damage numeral on the struck unit's head for 1.5 s, board size restored. | This layer owns the **first frame loop and the first clock on the drawing path** in `src/render`. See its traps below. **`docs/10` has no acceptance criterion for any of it — AC-V21 is free.** |
| 6 | **Portraits, then the mini stat window.** The next slice. | **not started — blocked on ask 1 above** | 8 jobs x 2 genders. Enemies are human only and reuse the set. No portrait art exists; build the panel against `placeholder.svg` (96×116, aspect 5:6 — keep it). Portraits first: the panel's layout depends on the crop. |
| 5 | **Terrain rules on the other four maps.** | **PARKED by the owner** — battle 4 only, 2026-08-30 | Battles 1, 2, 3 and 5 keep the difficulty they were tuned for, and the six balance test battles are **not touched at all**, so the variety score stays comparable. (They are *not* flat, and never were: `enc-the-high-ground` has heights 0–3 and `enc-the-breach` 4 blocked tiles, both since the P2 benchmark slice. What keeps the score comparable is that nothing changed.) Do not widen this without asking. |

**Two rules bind every one of these.**

- **The suite cannot see the screen.** Three defects in the slice just landed were found
  only by opening a PNG, with the whole suite green. **Open `visual-artifacts/playtest/`
  after any change to a screen** — the trap named "THE SUITE STILL CANNOT SEE THE SCREEN".
- **Contrast is measured, not eyeballed** — but only for DOM text. `contrast.spec.ts`
  cannot see the canvas at all, so nothing measures the battle map's legibility. The traps
  named "`--accent` IS RULES AND BORDERS ONLY", "THE SHEET'S PADDING AND THE SCORCH ARE
  COUPLED", "THE CONTRAST FLOOR IS NOW 100" and "AN ANALYZER THAT DECLINES TO CHECK STILL
  SAYS PASS" each cover a way a *sheet* change goes quietly wrong.

### Open test gaps — available to pick up, NOT scheduled

**None of these is a shipping bug.** Each is a test that cannot come out the other way, so
it certifies nothing. They are written down because nothing else records them. **The
owner's order above stands** — these are not a slice and none of them is green-lit.

**All three re-checked against the tree on 2026-09-01 and all three still hold.** A was
re-measured, because the motion slice changed `HEADROOM` 72 → 54 and so changed the camera
scale the gap is described in terms of: at 900×600 the scale is now **1.7188** and the
unscaled point still returns `null`; at the shipped 900×440 it is **1.2805** and the same
point still returns `{x: 1, y: 2}`. The wording below is unchanged and still accurate.

| # | Gap | Where | Why it proves nothing |
|---|---|---|---|
| **A** | The camera/click A/B passes on an off-board point | `src/render/iso.test.ts`, `"DISCRIMINATING: the click inverse honours the zoom"` | The miss half is `expect(pickTile(world.x, world.y, …)).not.toEqual({x: 4, y: 3})`, and `null` satisfies it. At the test's 900×600 canvas the unscaled point **is** `null` — off the grid — so the assertion cannot tell "the inverse honours the zoom" from "the point left the board". The shipped pages are 900×440, where the same point lands on (1, 2). **Fix:** pick a point that resolves to a genuinely different tile, and assert that tile. See the trap "`viewFor` IS ON THE CLICK PATH". |
| **B** | Side-face culling has no test at all | `paintTerrainTile` in `src/render/iso.ts` | A cliff face is cut only where the ground drops: the LEFT face against the neighbour at `(x, y+1)`, the RIGHT against `(x+1, y)`, each skipped when the drop is ≤ 0. Nothing asserts it, so a renderer that drew every side face unconditionally — or never drew one — stays green. `iso.test.ts`'s recording 2D context already records `wallLeft`/`wallRight` fill strings, so it can see this. **Use a purpose-built fixture**: `camp-b4-the-broken-span` is the only shipped map with relief (heights 0 and 2, 45 blocked tiles). |
| **C** | Nothing reads a pixel off the finished picture | every canvas test | Canvas tests assert what the code **asked** to draw — recorded `fillStyle` writes and their order. The range panel's legibility is asserted (`"the range panel separates from every ground it can sit on"`), but against `compositeOver`, a source-over blend **re-implemented inside the test**: it models the composite rather than reading it. So the model and the canvas can disagree — over the mottle and detail scatter, over antialiasing, over the panel's own edge stroke — with nothing going red. Only `base` tones and bare ground are covered; the panel over a prop, a unit token or a status chip is unmeasured. `contrast.spec.ts` measures DOM text and cannot see a canvas at all. |

**What C is NOT.** Two claims that would have belonged here are already covered, and
recording them again would be wrong:

- `e2e/campaign.spec.ts` **does** sample a real canvas pixel — one corner, asserting the
  daylight sky is opaque and blue-dominant. That proves the page-to-terrain wire, not
  legibility anywhere on the board.
- The panel's thin WCAG margins over sand and water **are** now judged, by CIEDE2000
  separation floors rather than a luminance ratio, with the historical failures kept as
  non-degeneracy cases (`9cc4890`).

**A carries a doc consequence.** `docs/10`'s AC-V19 was **weakened** to "not the same
tile" to match what the test asserts. If A is fixed, tighten that wording back in the same
slice. `docs/10` is deliberately untouched here.

---

## LANDED 2026-09-01 — the board moves (ADR-0032 and its amendment)

Four commits: `3282c72`, `dc2b84c`, `57af9b6`, `eac065e`. On a commit the struck unit
recoils, flashes and drains HP behind a pale tail while the attacker leans in. The damage
numeral sits on the struck unit's head for 1.5 s. The next actor's ring sweeps in and a
turn plate names them for ~700 ms.

| Piece | Where |
|---|---|
| The beat a commit produces, the timeline, `MOTION_MS`, `MotionDirector` | `src/render/motion.ts` |
| Both labels drawn after the camera transform, clamped into the viewport | `src/render/iso.ts` |
| Reduced motion, as a `matchMedia` branch to the settled frame | `motion.ts`, `game.ts` |

**The placement was reversed the same day.** The art director's option B moved the numeral
off the head to dodge the plate. The owner watched real footage, found overlap is normal in
the source, and chose option A: numeral on the head, overlap allowed, no avoidance logic
anywhere. `HEADROOM` 72 → 54 gave every board its area back — **+5.0% to +6.9% camera
scale** across the five shipped maps at 900×440.

### THE GAP: `docs/10` has no acceptance criterion for any of this. AC-V21 is free.

This is the reverse of the usual failure. The **tests** are strong; the **spec** is
missing. `docs/` outranks the code, so today a slice could retune the whole motion layer
and no doc would go red.

What is already asserted — **verified 2026-09-01, do not repeat any of this as a coverage
gap**:

| Claim | Asserted? | Where |
|---|---|---|
| The numeral holds 1400–2000 ms, as a **literal** band | yes | `motion.test.ts`, "the numeral holds ~1500 ms" |
| The blow was not stretched with the numeral | yes | `motion.test.ts` |
| The plate starts after the blow and holds its whole window | yes, but **relative to `MOTION_MS.plate`** — the literal 700 can still move | `motion.test.ts` |
| Both labels clamp into the viewport, on all five maps | yes | `iso.test.ts` |
| `HEADROOM` from both sides — a world floor and per-map scale floors between the 72 and 54 readings | yes | `iso.test.ts` |
| Reduced motion draws the settled board and starts no loop | yes, unit **and** browser | `motion.test.ts`, `campaign.spec.ts` |
| The ~58 s per-battle motion ceiling | **no** | — |
| Whether any of it is **legible** | **no** | nothing reads a canvas pixel (gap C above) |

**Route:** write AC-V21 against what is asserted, then either give the last two rows an AC
plus a test (`qe-tester`) or mark them explicitly aspirational. Prose stating a number no
test checks is worse than no number.

### Traps this slice bought

0. **THIS LAYER OWNS THE FIRST CLOCK ON THE DRAWING PATH.** Motion never blocks input or a
   step. `accepting()` is unchanged, there is no new phase, and `autoplay()` and
   `playtest.ts` still loop `step()` synchronously. A commit landing mid-animation
   **replaces** the beat in flight rather than queueing behind it. Every timing source
   stays out of `src/sim` **and** out of `session.ts`, which produces the command log.
0. **`draw()` STAYS PURE.** Animation phase arrives through `DrawOptions`. The render layer
   animates `applied.event` / `applied.reactionEvents` — the sim's own record — rather than
   re-deriving what happened.
0. **REDUCED MOTION IS A `matchMedia` BRANCH, NOT A CSS QUERY.** A CSS query cannot reach a
   canvas. `scene.ts` is untouched and AC-V16's untimed reveal still holds — do not add
   motion there without rewriting those assertions.
0. **A LABEL SIZED IN CANVAS PIXELS CANNOT BE RESERVED FOR IN WORLD UNITS.** The
   reservation changes the scale that decides the label's own size. Both labels now draw
   after the camera transform is popped: world **anchor**, canvas-pixel **size**, clamped
   into the viewport. That circularity is why a clamp works where reserved headroom does
   not, and it is why `HEADROOM` could drop to 54.
0. **A POPUP DIES WITH ITS BEAT, NOT ON ITS OWN CLOCK.** `Session.commit` replaces `popups`
   and the beat together. An independent fade would mean this layer holding a copy of a
   label the session has already retired.
0. **THE NUMERAL PAINTS OVER THE PLATE, AND ONLY A FRAME SHOWED IT.** Every assertion was
   green while the plate's opaque box erased the damage number for its whole window. Still
   an open appearance question — **ask 2 above**.
0. **`docs/visual/motion/run.mp4` SHOWS THE SUPERSEDED PLACEMENT.** Committed at `7dbfb2e`,
   before the reversal at `eac065e`. Do not link it as the current look.
0. **ADR-0032's AMENDMENT QUOTES A TEST TITLE THAT NO LONGER EXISTS.** It names the plate
   test "the plate waits for the numeral to leave"; the test was retargeted the same day
   and now reads "the plate follows the blow by a beat, and holds ~700 ms". Harmless today,
   a dangling reference tomorrow.

---

## LANDED 2026-09-01 — the record was audited, and the count guard reached CI

| What | Where |
|---|---|
| Claims the code contradicted, corrected across eight doc files. Superseded claims struck through, not deleted. | `91f9739` |
| `check:counts` was in `npm run check` from the day it was written and in the workflow never. It now runs in CI, straight after the test step. | `86f8319` |
| `CLAUDE.md` stopped calling `npm run check` "everything CI runs" — CI also regenerates `state/index.html` and fails on drift. | `86f8319` |

**Three gaps were found and deliberately NOT fixed**, because each is a code or test
change, not prose. Each confirmed against the tree on 2026-09-01. **Route them to the
owning engineer or `qe-tester`.**

| Gap | Evidence |
|---|---|
| Six `src/sim` files cite a **`docs/02 §2` that does not exist** | `ability.ts`, `movement.ts`, `reaction.ts`, `reaction.test.ts`, `support.ts`, `support.test.ts`. The section is **`§A2`**. `docs/05` and `docs/06` were corrected in `91f9739`; the code comments were not. |
| **AC-E3(c) has no test** — "select damage/status types that counter the target's defenses" | `ai.ts` sets `effHp = hp` with no mitigation term. Recorded in `docs/06` under AC-E3. Closing it needs a fixture where the countering choice and the raw-magnitude choice **disagree** — without that disagreement it passes under both policies. |
| **`benchmark-suite.test.ts` covers 5 of 8 skillsets with no exclusion list** | Line 207 loops `aim`, `black-magic`, `geomancy`, `summon`, `white-magic`. `data/base-pack.json` holds eight: **`battle-skill`, `punch-art` and `steal` are neither checked nor named.** A test over a subset reads as covering the set — this is the defect that let two skillsets ship inert. |

---

## LANDED 2026-08-30 — the ground is painted (ADR-0030)

The battle map paints real terrain: textured surfaces, side faces cut only where the
ground drops, props, open sky, and **no grid line on the ground**. Direction chosen from
three rendered options ("Daylight field"); four scoping questions answered by the owner.

| Piece | Where |
|---|---|
| Kinds, parser, `DAYLIGHT` palette, per-tile noise | `src/render/terrain.ts` (no canvas — testable without a DOM) |
| Painting, prop drawing, the camera | `src/render/iso.ts` — `DrawOptions.terrain`, `FIELD_THEME`, `viewFor` |
| All five battles' authored ground | `TERRAIN` in `src/render/campaign-data.ts` |
| The wiring | `renderBattle()` in `game.ts` — terrain and theme move together |

**Owner decisions this slice, all four explicit:** terrain is **paint only** (no
`BattleState` change); authored as **a grid per battle**; **one battle first**; and the
drawn-in-code look is **the destination**, not a placeholder for art.

### Traps this slice bought

0. **FOUR OF THE FIVE CAMPAIGN MAPS ARE FLAT.** Battles 1, 2, 3 and 5 have no height and
   no blocked tiles, and painted ground cannot supply them. **Battle 4 is the exception**
   since ADR-0031: height 2 and 45 blocked tiles, authored in its encounter file.
   ~~Giving a map relief is a rules change, not a visual one.~~ **Both halves of that were
   wrong and ADR-0031 disproved them the same day.** Relief and blocked water need **no
   schema change** — the encounter format already carries per-tile `{height, passable}`, so
   it is authored data. It does change what a fight *is*, which is why battles 1, 2, 3 and 5
   are **parked by owner decision, 2026-08-30**: they keep the difficulty they were tuned
   for until someone asks.
0. **WHETHER THE PAINT AND THE RULE AGREE IS NOW PER MAP.** On battle 4 the river and the
   gap really block, so the paint is honest. On the other four the water is decorative and
   units wade through it — battle 2's ford is the live example. ~~"The sim was not asked"~~
   is no longer true as a blanket statement; it is true of four maps out of five. Written
   down in `terrain.ts`, `campaign-data.ts` and AC-V18 — keep all three in step; two of the
   three went stale after ADR-0031 and had to be corrected. What stays forbidden is a
   **second opinion in `src/render`**: this layer never answers "may I stand there".
0. **`viewFor` IS ON THE CLICK PATH.** `draw` and `pickTile` share the camera the way they
   already share `paintOrder`. A zoom applied to the painting and not the inverse offsets
   every click by a constant factor — it does not fail, it just misses. `originFor` now
   returns a **world** origin; a screen point is `project(...) * scale`. `e2e/play.spec.ts`
   and `iso.test.ts` both convert. AC-V19's discriminator is that the *unscaled* point does
   **not** resolve to the same tile — at `iso.test.ts`'s 900×600 canvas it returns `null`,
   not another tile, and the shipped pages are **900×440**. Never read a scale off a test
   here as what a player sees.
0. **NOTHING STANDING IS OCCLUDED BY TERRAIN.** Props and units draw in a second pass over
   the finished ground, because drawing a tree inside the painter's walk let the next tile
   paint over its canopy — on a flat map, every prop. The opposite error is live: a unit
   behind a tall cliff shows through. ~~Harmless while the maps are flat.~~ **Battle 4 has
   walls now.** It stays invisible only because every *passable* tile on battle 4 is the
   same height, so nothing can stand behind anything. The first map with two standable
   heights owes the fix.
0. **FOLIAGE MUST NOT BE THE GROUND'S OWN GREEN.** A canopy in the grass colour is
   invisible everywhere except against the sky, which is the edge of the map.
   ~~`terrain.test.ts` asserts `leaf !== grass.base`.~~ **String inequality was the bug**, not
   the check: a shipped `leafLit` of `#548b38` against a grass mottle of `#5c8737` is
   contrast **1.03** and passed `!==` fine. `terrain.test.ts` now asserts a **WCAG contrast
   ratio floor of 1.6** for both canopy tones against all three grass tones.
0. **A RANGE PANEL HAS TWO GROUNDS TO SEPARATE FROM, NOT ONE.** `FIELD_THEME.highlight` is
   `#8fd0ffb3` — a **light blue at 70% alpha**. ~~A deep blue at moderate alpha.~~ That was
   an earlier *failed* attempt: it desaturated to grey over grass exactly as the first pale
   blue did, and a saturated `#2d6fd8` then landed within four points of the river. Only
   **opacity** moves a translucent colour off its ground, so the panel is lighter than the
   ground rather than a different hue. **Do not "restore" a darker blue.** The margin is
   thin in two places — WCAG 1.07 over `sand.base`, 1.08 over `water.detail`, against
   1.5–3.3 elsewhere. ~~And nothing asserts any of it.~~ **Asserted since `9cc4890`** — by
   **CIEDE2000 separation**, not by a WCAG ratio, because luminance is the wrong metric for
   two colours on opposite sides of the wheel: sand and the composited panel share a
   luminance and are 29.8 apart perceptually. Two floors, own-ground and cross-ground,
   because three earlier panel colours each fixed one ground and collided with the next.
   Still true: `contrast.spec.ts` cannot see a canvas, and the test composites with its own
   blend model rather than reading a pixel (open gap C). The measured table is in `iso.ts`'s
   `FIELD_THEME` comment.
0. **THE UNIT TOKEN IS UNDECIDED.** Still the flat kite. Do not change it inside another
   slice — three options were drawn and the owner has not picked. Bundled with the portrait
   references (see the table above).
0. **A MAP CAN ONLY LOOK LIKE WHAT THE GRID ALLOWS.** ~~"The Broken Span" reads as a wooden
   platform, not a span over anything~~ — **fixed by ADR-0031**, which gave it real height
   and real blocked water. The ford still stands as the example: its river is crossable
   everywhere because the sim was never told there is a river. That is the flat-map limit,
   not authoring. Do not try to paint around it — author the tiles instead, which costs no
   schema change.
0. **`visual-artifacts/playtest/map-battle-{1..5}.png` ARE THE ONLY VIEW OF THE MAPS.**
   `playtest-capture.spec.ts` shoots the canvas alone for each battle. Nothing in the suite
   can see a canvas, so after any change to `iso.ts`, `terrain.ts` or a `TERRAIN` entry,
   open all five.
0. **`git checkout` CANNOT RESTORE AN UNTRACKED FILE, AND A MUTATION VERDICT FROM A FAILED
   BUILD IS NOT A VERDICT.** Both still bite. Every mutation this slice was gated on
   `npm run typecheck` passing, and `iso.ts` was copied aside rather than checked out —
   a `git checkout` there would have reverted the entire slice, not the mutation.

---

## LANDED 2026-08-30 — the span is real (ADR-0031)

Battle 4 now has a deck two steps above a river, the river blocks, and the collapsed middle
is a real hole leaving a **one-tile chokepoint** on the centre row. Chosen from three
variants rendered out of the running game.

**It needed no schema change.** The encounter format already carries per-tile
`{height, passable}`, so this is authored data: no `Tile` field, no version bump, no save
migration. ADR-0030 expected a schema bump here and was wrong.

### Traps this slice bought

0. **JUMP IS UNIFORM AT 3 ACROSS THE WHOLE PARTY.** A climb of 1–3 is free for everyone and
   a climb of 4+ severs the map, so **height cannot currently gate a route**. The "stepped
   span" variant looked like a design lever and is not one. If height is ever to be a route
   choice, Jump has to vary by job first — a job-system decision, not a terrain one.
0. **A BLOCKED TILE MUST BE PAINTED `water`** (AC-V20) — an **allow-list of one**, not a
   deny-list. The failure is an invisible wall: a click on solid-looking ground that does
   nothing, with nothing on screen to explain it. The first version listed the surfaces that
   read as walkable and so exempted **`rock`**, which is walkable ground on battles 3 and 4;
   painting battle 4's gap as rock passed it and produced the exact defect. Asserted for
   every battle. Any new surface is walkable-looking by default — add it deliberately.
   **The converse is NOT asserted on purpose** —
   battle 2's ford river is paint and units wade anywhere. The day water blocks everywhere,
   that check becomes an equality and battle 2 needs a real crossing.
0. **A UNIT CAN BE AUTHORED INTO THE RIVER.** Placements live in the encounter, paint lives
   in `campaign-data.ts` — two files, no compiler between them. Battle 4's west abutment
   runs one row further than the east *only* because a party member starts at (0, 5).
   Guarded, and the guard was earned during authoring.
0. **A NON-DEGENERACY HALF IS LOAD-BEARING HERE.** "Every blocked tile is painted as
   blocked" is vacuously true on a flat map, which is what four of five battles still are.
   The check asserts at least one blocked tile exists, and that half is mutation-verified
   separately.
0. **`tiles` GOES INSIDE `grid`, NOT AT THE ROOT** of an encounter file. Rejected by Zod at
   parse — but the first attempt to render variants this way produced three screenshots of
   the OLD map that looked entirely plausible. **Both halves of that are now mechanical**
   (retro, 2026-08-30): the build-freshness check moved from `fresh-build.spec.ts` into
   Playwright's `globalSetup`, so a single-file run like
   `npx playwright test one.spec.ts` can no longer step around it, and
   `playtest-capture.spec.ts` **clears** `visual-artifacts/playtest/` before it starts, so
   a run that dies leaves a missing frame rather than yesterday's. The browser-spec count
   dropped 43 → 42 when the guard stopped being a spec; that was the fix, not a regression.
   **It went back to 43** — the adversarial-review slice (`c1507dc`) added the
   page-to-terrain canvas assertion in `campaign.spec.ts` — **and then to 44**, when the
   motion slice (`dc2b84c`) added the reduced-motion spec. Current counts: **928 unit
   tests, 44 browser specs in 8 files.**

---

## LANDED 2026-08-30 — an adversarial review, and what it cost

The `reviewer` agent was run against the branch — **the first time this project's agent
roster was used at all**. It found eight things. Three were blockers, and all three were
tests this repo would have called discriminating.

| What it found | How it hid |
|---|---|
| The page-to-terrain wire had **no test**. One property name (`encounterId` → `battleId`, both real) reverted all five battles to the old dark board | typecheck, lint and 880 unit tests green |
| The blocked-tile check listed the surfaces that read as *walkable* and so exempted `rock` — which **is** walkable ground in two shipped maps | 42/42 green; painting the gap as rock gave the exact invisible wall the check exists to prevent |
| "Foliage isn't the ground's green" was string inequality. Shipped `leafLit` was **contrast 1.03** against the grass mottle | 16/16 green |
| The camera's bound charged the tallest tile's lift at the top AND its base at the bottom | battle 4 — the only campaign map with relief — drew below 1:1. (The camera exists because **battle 1**, a 7×5 map, filled under half the frame; battle 4 is where the *bound* failed. Two different things, conflated in the first write-up.) |

### Traps this bought

0. **NEVER ANCHOR A CHECK ON THE THING IT IS CHECKING** — again, and it slipped past the
   first fix. The new camera test imported the shipped `HEADROOM`, so setting it to 0
   moved the code and the expectation together and stayed green. The floor is now an
   independent constant read off what is actually drawn above a tile.
0. **A TRANSLUCENT PANEL HAS TWO GROUNDS TO SEPARATE FROM, NOT ONE.** Three attempts,
   each fixing the previous one's ground and colliding with the next: pale blue went grey
   over grass; a deeper blue at the same alpha did too; a saturated blue finally read over
   grass and landed within four points of the **river**. Only opacity moves a translucent
   colour off its ground, and the panel is now brighter than every surface rather than a
   different hue.
0. **"NO GRID" IS ABOUT WHAT IS SEEN, NOT ABOUT `stroke()`.** The water branch put a
   full-width band at a fixed offset from each tile centre; it repeated identically on
   every tile and drew a plain lattice across a river, while passing the no-stroke check
   exactly. Place every texture by the tile's own noise.
0. **A DEFECT CALLED FIXED IN AN ADR IS A CLAIM.** ADR-0030's Evidence section listed
   three defects found by opening frames and fixed. **All three were still shipping** —
   half-fixed by a hex change, an over-estimating bound, and a re-tone that did not survive
   compositing. The ADR now says so.
0. **THE REVIEWER AGENT EARNED ITS KEEP ON FIRST USE.** Nothing in the suite, and nobody
   in the main session, found any of this. Run it on anything non-trivial before the PR.

---

## STANDING REMINDER — one person still has to play it

**Deferred by the owner on 2026-08-30, expected to be a while. Do not delete this section
and do not let a prettier screen read as an answer to it.** A better-looking game is not a
more legible one; that is the same claim the parchment slice had to make about itself.

Nothing in the repo can settle whether a newcomer understands this game. Every automated
run drives the balance probe or a deliberate forfeit, so "completable" means *reachable* —
never difficulty, pacing or fun.

**When a human is available:** give them a link to the site root and say nothing else. When
they finish or give up, ask them to press **Copy playtest log** on the title or ending
screen and paste it back.

**Read `stoppedAt` first.** Then `timeToFirstActionMs` for `BRIEFING` — a large number
there is the 5-slot ability chassis being illegible, which is the open bet. Then
`prepChanges`: an empty object means they never touched the progression systems, which the
campaign is now tuned to punish (ADR-0027). `SCENE` rows and `*-story-more` /
`*-story-all` actions show **whether they read the scenes or skipped them** — a curiosity,
not a finding, until more than one person has played.

`summarize()` in `src/render/telemetry.ts` folds a pasted log into those numbers.

**Still blocked on that session, and on nothing else:** difficulty, pacing, session length,
and whether the chassis teaches itself. Do not tune any of them from agent play.

| Question | Settled? | By what |
|---|---|---|
| Is the campaign reachable start to finish | yes | `campaign-shell.test.ts`, `e2e/campaign.spec.ts` |
| Does engaging with the prep screen matter | yes | player-policy sweep: never-prep 2/16 seeds, spend-at-home 16/16 |
| Do story scenes render, advance and persist | yes | AC-V16, AC-V17 — and the frames were opened, not just green |
| Does a newcomer UNDERSTAND the 5-slot chassis | **no** | nothing can. Expert inspection gives hypotheses |
| Is 30–45 minutes right, is it too hard, is it fun | **no** | agent skill is not human skill. The numbers are RELATIVE only |

---

## LANDED 2026-08-29 — story v2 and the scene player

Seven commits, ADR-0029. Story text is now read a line at a time beside a portrait frame,
and three scenes belong to no battle at all.

| Piece | Where |
|---|---|
| Schema v2 — per-line speakers, a `characters` registry, standalone scenes | `src/sim/story.ts` |
| Save v3 → v4 — `scenesSeen` | `src/sim/campaign.ts` |
| The player — a pure `SceneModel` plus `mountScene` | `src/render/scene.ts` |
| The `SCENE` screen and `arrive()` | `src/render/campaign-shell.ts`, `game.ts` |
| Prologue, one interlude, epilogue | `data/campaign/story/*.story.json` |
| The portrait seam and its placeholder | `campaign-data.ts`, `data/campaign/story/portraits/` |

**Presentation was chosen from rendered mockups, not from a description** — three options
in front of the owner before a stylesheet was written. B (a textbox over the sheet) now;
C (a full cinematic screen) deferred until portrait art exists, and the schema is
identical across both, so that switch is a rewrite of `mountScene`'s DOM and nothing else.

---

## Traps waiting for you

0. **A MUTATION VERDICT FROM A FAILED BUILD IS NOT A VERDICT.** The decisive mutation of
   this slice — deleting the scene player's re-entrancy guard — reported **SURVIVED**. It
   had not survived: the mutant failed `tsc`, `npm run build` failed, `dist` kept the
   previous good bundle, and Playwright measured the OLD page. Rewritten to be type-valid,
   it is caught immediately. **Gate every mutation harness on a successful build**, and be
   suspicious of a mutant that changes behaviour but leaves a variable unread.
0. **`git checkout` CANNOT RESTORE AN UNTRACKED FILE, AND FAILS QUIETLY ENOUGH TO MISS.**
   The first mutation run on `scene.ts` (new, unstaged) restored nothing, so four
   mutations stacked and all four verdicts were meaningless. Copy the file aside instead.
0. **THE SUITE STILL CANNOT SEE THE SCREEN.** Two real defects shipped past 851 green
   tests and 43 green browser specs and were found only by opening a PNG: the placeholder
   printed "Portrait pending" **twice** (once in the SVG, once in the caption), and the
   whole text column **jumped left** when a scene reached a narration line, because hiding
   the figure collapsed the grid column. **Open `visual-artifacts/playtest/` after any
   change to a screen.**
0. **REVEAL STATE MUST NOT MOVE INTO THE DOM.** `renderStory` is re-entered from
   `refresh()` — the prep panel's `onChange` and every deploy toggle — on the briefing,
   where a scene is being read. `setBeat(key, …)` no-ops on an unchanged key and that is
   the only thing standing between a party edit and a reset cursor.
0. **`--accent` IS RULES AND BORDERS ONLY.** Gold leaf as *text* on parchment measures
   1.55:1. New gold text takes `--accent-ink`.
0. **THE SHEET'S PADDING AND THE SCORCH ARE COUPLED.** `--burn + --burn-spread +
   --burn-jitter` is the depth the burn reaches; `.card`/`.panel` padding must clear it.
   The scene screen reuses `.card` deliberately — **do not mint a new sheet class**, or
   `contrast.spec.ts`'s `sheetOf()` falls through to the table stops and measures against
   the wrong ground.
0. **THE CONTRAST FLOOR IS NOW 100, MEASURED.** The briefing paints 113 text-bearing
   elements; the old floor of 40 had a 73-node margin, i.e. it could not have noticed most
   of the screen failing to render. If you add or remove a screen's chrome, **re-measure**
   rather than nudging the number.
0. **AN ANALYZER THAT DECLINES TO CHECK STILL SAYS PASS.** axe-core files an
   unflattenable background as `incomplete`, not as a violation. `a11y.spec.ts` asserts
   `results.passes.length` and disables `color-contrast` rather than banking its green.
   It earned its keep this slice: it caught an `aria-controls` pointing at an id that did
   not exist, on the first browser run.
0. **PUBLISHING ANY BRANCH BUT THE SESSION'S DESIGNATED ONE IS BLOCKED.**
   `.claude/hooks/guard-designated-branch.sh` compares the target against the branch
   recorded at SessionStart.
0. **A CAPTURED FRAME'S FILENAME IS AN ASSERTION.** `shot()` takes the `data-testid` the
   frame must show. The two prologue frames go further: `02a` asserts the More control is
   still present, `02b` asserts it is gone — without that pair a half-revealed beat sits
   under a caption saying "read".
0. **`telemetry.ts` MUST KEEP ITS TYPE-ONLY IMPORTS.** Unchanged this slice, and the
   reason no new `TelemetryEvent` kind was added for scenes. `logNote()` DID widen, because
   how much of a scene a player reads is a new category of collected thing and that
   sentence is the only place the page says what it keeps.
1. **A STALE `dist` FAILS A BROWSER TEST THAT IS ACTUALLY FINE.** `npx playwright test`
   does NOT rebuild; `npm run test:visual` does. A **failed** `npm run build` leaves the
   previous `dist` standing — see trap 0.
2. **GEAR IS A DIVERSITY AXIS THE GATE DOES NOT USE.** `data/builds/*` all carry
   `weapon: null`, so the variety score of 7 is measured with every build on the same
   placeholder weapon.
3. **`wp` ON A HORIZONTAL WEAPON IS A CALIBRATION CONSTANT, NOT A TIER.**
4. **THE ONBOARDING BET IS UNTESTED AND ONLY A PERSON CAN SETTLE IT.**
5. **A GATE THAT CANNOT SEE A CHANGE GOING GREEN IS NOT EVIDENCE.** Shipped builds author
   `learned` explicitly, so progression-economy changes never reach a built unit.
6. **`ReactionEffectSchema` IS `{kind}` WITH NO MAGNITUDE.** Before authoring a passive,
   check whether its effect schema can express "weaker".
7. **A TEST THAT NAMES THE BUG IT CATCHES IS A CLAIM ABOUT CODE YOU HAVE NOT RUN.**
8. **PROSE IN THE FUTURE TENSE ROTS SILENTLY.** When you land the thing a comment
   predicted, grep for the prediction.
9. **`EXPECTED_TREE_SIZES` in `content-pack.test.ts` pins every job's node count.**
10. **`AP_TIERS` is 60/120/240.** Relevant to a test that wants to click a buy button:
    **nobody can afford anything before battle 3.** The best-earning member holds 56 AP
    after battle one, so a spec needing a real record edit early should equip a weapon.
11. **The help panel is NOT on the story seam, deliberately.**
12. **`play.spec.ts` ASSERTS THE VIEWER'S TAB ORDER EXACTLY.** `campaign.spec.ts` asserts
    no tab order, but it DOES assert the exact screen sequence
    `["TITLE","SCENE","BRIEFING","BATTLE","AFTER_BATTLE"]` — adding a screen moves that
    array rather than relaxing it.
13. **The def and the save share ONE version constant.** Bumping `CAMPAIGN_SCHEMA_VERSION`
    for a save-only field still forces `data/campaign/*.json` to bump. And **typecheck
    stays silent**: `startCampaign` builds the save through `.parse()`, which takes
    `unknown`, so only the runtime tests catch a missing required field.
14. Everything the previous handoff listed still holds: **a screen the state machine skips
    has content nobody can reach**; **the prep panel is mounted ONCE and re-pointed**;
    **the story pack's coverage is checked at BOOT, both directions**; **story text is
    rendered with `textContent`, never `innerHTML`**; **`campaign-data.ts` imports the
    five encounter files BY NAME**; **the AP grant reads `landedActions`**; **the campaign
    is winnable UNDER THE PROBE, which is reachability evidence, not difficulty
    evidence**; **`docs/11` §3 and `docs/08` §1a carry AUTHORED status tables nothing
    derives**; **the browser tests are NOT in `npm run check` — run `npm run test:visual`
    separately.**

---

## Parked — not the next slice, and not because they are wrong

**The visual slices above come first (owner, 2026-08-30).** Nothing here is cancelled;
none of it is scheduled.

| Item | Why parked |
|---|---|
| **The story repo itself** (`docs/08` §4) — the pack moves out, this repo consumes it as a versioned package. The contract is rich enough now: per-line speakers, a cast, standalone scenes. | Still the natural follow-on to the scene player, and the owner has said the writing comes next. It is a content move, not a look-and-feel one, so it sits behind the visual slices. |
| **Variety score 7 → 8** (`docs/06` AC-E2). The untried lever is **gear** — every build in `data/builds/*` carries `weapon: null`. | **Explicitly removed from the priority list by the owner, 2026-08-30.** The criterion is untouched: `DIVERSITY_TARGET_N` stays 7, the release bar stays ≥ 8, CI still fails on a drop. Do not weaken it, do not "clean it up", and do not treat this row as permission to reopen it. |
| **The AP grant shape** (ADR-0012) — a healer who only heals banks nothing. | Combat/progression work. Same reason: after the visuals. |
| **MP enforcement** (`docs/08` §1a). | Blocked on durable carriers, unchanged. |

---

## Measured facts (re-derive rather than trust, but these were probed)

> **The balance numbers across ADR-0025 and ADR-0026 are MVP-PROVISIONAL** (user,
> 2026-08-22). Node costs, prereq chains and weapon stats exist to make M0 work, not
> because they are right. The RULES under them are not provisional.

Cheapest LIVE option per chassis slot, walking prerequisites, after ADR-0025:

| Slot | Ability | Total AP |
|---|---|---|
| secondary | any job's first action | 60 |
| support | `battle-skill.hp-boost` | 120 |
| movement | `steal.move-plus-2` | 120 |
| reaction | `punch-art.counter` | 180 |

Campaign AP budget: **~280** for the best-earning member, **~184** for the worst.

### Still-live engine facts

- **AC-E6 is REACHABILITY, not balance.**
- **A mobility, reach or range grant is not automatically a buff** (ADR-0020).
- **An aggregate A/B can read "identical" while a third of the rows moved.**
- **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice**;
  `punch-art.` has TWO carriers; `bld-cutpurse` sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).
- **The MP contingency is live:** `white-magic.holy` and `summon.*` ride unenforced MP.
- **`battle-skill` is still excluded by user decision** (2026-08-16).
- **`compareCandidate` is the most load-bearing function in the repo.**
- **The frozen golden is a tripwire, not a maintenance item.**

---

## Environment facts that cost real time to learn

- **`@axe-core/playwright` was declared but not installed** in a fresh container. If
  `npm run typecheck` fails on it, run `npm install` — it is not a code error.
- **Scratch probes belong outside the tree but INSIDE the repo** (`coverage/`, gitignored):
  `vite-node` resolves imports against the Vite root.
- **Never round-trip `data/base-pack.json` through a JSON parser** — it reformats the whole
  file. The small authored files under `data/campaign/` are fine.
- **Vite inlines an asset under 4 KB as a `data:` URI.** The portrait placeholder is
  **1025 bytes**, so a spec pinning a hashed filename would flake the day real art crosses
  the limit — which the portrait slice will do. Assert the shape loosely and lean on
  `naturalWidth`.
- **`src/vite-env.d.ts` exists because `tsconfig.json` sets `"types": ["node"]`**, so
  `vite/client`'s ambient declarations are not in scope and a bare `.svg` import fails
  typecheck.
- **A bare JSON import breaks ONLY the browser job** — `e2e/*.spec.ts` goes through Node's
  ESM loader, which requires `with { type: "json" }`.
- **`vite.config.ts` has three entries.** A page missing from `rollupOptions.input` works
  under `npm run dev` and does not exist in `dist`.
- **A PUSHED BRANCH WITH NO PULL REQUEST CAN READ AS LOST.** This branch was pushed
  without one, and a later session's container had never fetched it — **13 commits looked
  gone.** `git fetch origin` and check `origin/<branch>` before concluding anything is
  missing. A SessionStart warning for this was proposed and **declined** (see above).
- **After a merge the remote branch is DELETED**, so `--force-with-lease` fails with
  "stale info". `git remote prune origin`, then push normally.
- **Use the check-runs API for CI**; the legacy commit-status endpoint reports nothing.
- **The sandbox proxy blocks `/repos/*/pages`, `/environments`, `/deployments` and all
  `*.github.io` egress**, but a runner can reach them with `${{ github.token }}`.
- **GitHub auto-merge is NOT enabled** on this repo — watch the checks and merge.

---

## Pages — RESOLVED 2026-08-12 (first successful deploy on run #23)

`pages.yml` was always correct; runs #1–#22 failed on two sequential *settings*, both
derived from the repository default branch. Two preflights now guard the `build` job.
**An agent can confirm the deployment API reported success but cannot confirm the page
renders** — `*.github.io` is blocked. Nobody in this sandbox has seen the shipped shell
render.
