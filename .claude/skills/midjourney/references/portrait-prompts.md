# The 16 portrait prompts — 8 jobs x 2 genders

> **Authored 2026-09-01 by `art-director`.** Every constraint below is earned, not
> preferred: the style decision (Final Fantasy Tactics / Akihiko Yoshida), the young
> 20s-30s cast, the "headgear must never shadow the face" rule, the word-list that
> reads male, the `--no` word-chopping trap and "do not fight the crop" all come from
> the eight probe runs recorded in `project-prompts.md` and from owner decisions taken
> **2026-09-01**. Job ids match `JOB_LABEL` in `src/render/prep.ts` and become the asset
> keys, so the label on each block is the filename you want.
>
> **THE STYLE TAIL IS NOT TO BE EDITED.** It is copied byte-for-byte from
> `project-prompts.md` into all sixteen blocks. It carries the medium, the palette, the
> framing and the background colour, and it is the only thing keeping sixteen paid runs
> looking like one game. Do not improve it, re-wrap it or trim it. **One deliberate
> exception, see "The male tail" below.**
>
> Run these with the **archer style reference locked** in the Style Reference slot, and
> with Raw + 5:6 set as defaults (the flags are still written out, so the blocks work
> standalone). Run **knight-male and knight-female first**, judge them at 28 pixels wide,
> and only then buy the remaining twelve — `archer-female` and `priest-female` are
> already in the set (see the block below).

## The male tail — one word deleted, and why

The locked tail ends `--no ... chibi, man, beard, stubble, ...`. On the eight **male**
portraits `--no man` asks the model not to draw the subject. The eight male blocks below
therefore delete exactly the word `man,` from the `--no` list and change nothing else;
`beard` and `stubble` stay, which keeps the cast clean-shaven and young. This is the only
difference between the male and female tails, and it is deliberate.

**Untested:** no male portrait has ever been run in this style. The style reference is a
young female archer, and the reference does not carry subject or proportion — so the male
blocks lead with gender twice and name it a third time in the costume clause. If a male
run still comes back female, the next thing to try is adding the single word `woman` to
that prompt's `--no`, not re-wording the subject.

---

> **The four `*-female` prompts below for knight, wizard, archer and priest are the
> EXACT text the owner ran ~~and approved~~ on 2026-09-01**, recovered from the session
> transcript. They replaced reconstructions. They are not stylistically uniform with
> the twelve authored blocks — that is deliberate: they are the record of what was
> actually run, and rewriting them would discard the evidence. **The text claim still
> holds and the blocks stay byte-locked. The ART claim does not: two of the four are
> not in the set.**
>
> **Only two of the four carry approved art in the locked style — owner, 2026-09-02.**
>
> | Prompt | Run with the archer locked in Style Reference? | Its art |
> |---|---|---|
> | `archer-female` | it **is** the style reference | **approved, in the set** |
> | `priest-female` | yes | **approved, in the set** |
> | `knight-female` | **no — run before the lock** | **not in the set. Re-run it.** |
> | `wizard-female` | **no — run before the lock** | **not in the set. Re-run it.** |
>
> ~~All four produced approved art.~~ Do **not** commit `knight-female` or
> `wizard-female` output into `docs/visual/portraits/reference/` and do not treat
> either image as signed off. What an unlocked run costs is measured, not guessed:
> `project-prompts.md` ("The style reference IS needed") records the priest, run
> without a reference, coming back as European devotional painting — unmistakably a
> different illustrator from the archer — and snapping back into the set only once the
> archer was locked. Re-run both prompts unchanged, with the archer locked.
>
> Note `knight-female` and `wizard-female` carry `soft rounded cheekbones`, which the
> probe record warns reads young. It was accepted anyway under the young-cast decision.

## knight

### `knight-female`

```
extreme close-up head portrait of a woman, a female mercenary knight in her
thirties, bare-headed with no helmet, her face weathered and lined with a scar
across one cheek, soft cheekbones and a narrow tired gaze, short dark hair, a
plain riveted gorget with fine gold trim, deep woad-blue padded gambeson collar,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight, thin
watercolour wash inside the line, lightly simplified features with restrained shading,
muted desaturated ochre and dusty blue palette, three-quarter turn to the left with eyes
toward the viewer, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

### `knight-male`

```
head and collar portrait of a man, a male mercenary knight in his twenties, bare-headed with no helmet, dark hair cropped close to the skull, a squared riveted steel gorget over a high mail standing collar and a dull woad-blue padded gambeson, a weathered face with a thin scar along one cheekbone and a level gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

---

## monk

### `monk-female`

```
head and collar portrait of a woman, a female bare-fisted monk in her twenties, her dark hair shaved close at the sides and drawn into one short topknot standing upright on the crown, her whole face visible and lit, a sleeveless coarse undyed linen jacket with a wide open collar and an ochre cord knotted at the throat, a grown woman's face with a calm steady gaze and a slender neck,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

### `monk-male`

```
head and collar portrait of a man, a male bare-fisted monk in his twenties, his head shaved smooth and completely bare with no headwear of any kind, a sleeveless coarse undyed linen jacket with a wide open collar, an ochre cord knotted at the throat with a single plain wooden bead, a lean weathered face and a level gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

---

## wizard

### `wizard-female`

```
extreme close-up head portrait of a woman, a female battle wizard in her thirties,
bare-headed with her deep indigo hood lowered around her shoulders, long silver-grey
hair falling loose past her jaw, soft rounded cheekbones, a slender neck, full lips,
a high plain linen collar, a single thin scar on one cheek, calm steady gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight, thin
watercolour wash inside the line, lightly simplified features with restrained shading,
muted desaturated ochre and dusty blue palette, three-quarter turn to the left with eyes
toward the viewer, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

### `wizard-male`

```
head and collar portrait of a man, a male battle wizard in his twenties, a tall soft pointed cap of dusty blue felt slumped backwards well off his brow with its point falling behind one shoulder so his whole face is visible and lit, short dark hair, a heavy ochre robe with a deep folded collar and a small dull brass clasp, a lean face and a level gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

---

## thief

### `thief-female`

```
head and collar portrait of a woman, a female thief in her twenties, bare-headed, dark hair cut in a ragged short crop with one long forelock swept clear of her eyes, a bulky umber neckerchief bunched down around her throat, a worn leather harness strap crossing one shoulder with dull steel buckles, a grown woman's face with a calm steady gaze and a slender neck,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

### `thief-male`

```
head and collar portrait of a man, a male thief in his twenties, a faded umber bandana tied smooth over the crown of his head with two short knotted tails trailing at the back, tied high above his bare brow so his whole face is visible and lit, a worn leather harness strap crossing one shoulder with dull steel buckles, a lean weathered face and a level gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

---

## priest

### `priest-female`

```
extreme close-up head portrait of a woman, a female battle priest in her thirties,
bare-headed with a cream-white linen veil pinned back off her face so her whole
face is visible and lit, warm auburn hair coiled and pinned at the nape, soft
rounded cheekbones, a slender neck, a simple brass circlet, a high cream-white
robe collar with a dull red-brown stole, calm steady gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight, thin
watercolour wash inside the line, lightly simplified features with restrained shading,
muted desaturated ochre and dusty blue palette, three-quarter turn to the left with eyes
toward the viewer, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

### `priest-male`

```
head and collar portrait of a man, a male priest in his twenties, a low flat-topped square cloth cap of pale grey set squarely on the back of his head with his brow bare and his whole face visible and lit, dark hair combed back, a high pale grey robe collar and a narrow ochre stole over both shoulders, a lean calm face and a level gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

---

## archer

### `archer-female`

```
extreme close-up head portrait of a woman, a female archer in her twenties, a worn
leather headband, dark hair braided back, a quiver strap crossing one shoulder, a
russet-brown leather jerkin collar, freckles across the nose, narrow watchful eyes,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight, thin
watercolour wash inside the line, lightly simplified features with restrained shading,
muted desaturated ochre and dusty blue palette, three-quarter turn to the left with eyes
toward the viewer, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

### `archer-male`

```
head and collar portrait of a man, a male archer in his twenties, his dark hair gathered into a short high ponytail at the back of his head with a single grey fletched feather tucked behind one ear, his brow bare and his whole face visible and lit, a hardened leather shoulder guard and a quiver strap crossing his chest, a lean weathered face and a level gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

---

## geomancer

### `geomancer-female`

```
head and collar portrait of a woman, a female geomancer in her twenties, a wide flat woven straw hat tipped right back off her head and hanging behind her by its cord so her whole face is visible and lit, dark hair tied at the nape, a moss-green hide mantle with rough woven grass trim at the collar, a grown woman's face with a calm steady gaze and a slender neck,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

### `geomancer-male`

```
head and collar portrait of a man, a male geomancer in his twenties, shoulder-length dark hair held back off his face by a twisted cord of braided grass with no hat at all and his whole face visible and lit, a heavy shaggy fur mantle with a high ragged collar of hide, dried grass and small clay beads, a lean weathered face and a level gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

---

## summoner

### `summoner-female`

```
head and collar portrait of a woman, a female summoner in her twenties, her pale hair drawn up into two round coiled buns high on the crown under a thin flat bone circlet, her whole face visible and lit, a layered ivory and dusty blue robe with a high folded collar and a beaded cord, a grown woman's face with a calm steady gaze and a slender neck,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

### `summoner-male`

```
head and collar portrait of a man, a male summoner in his twenties, a slender pale bone circlet with two thin curved horns rising high above his brow, worn back off his forehead so his whole face is visible and lit, short dark hair, a layered ivory and dusty blue robe with a high folded collar and a beaded cord, a lean calm face and a level gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

---

## The silhouette table

The portrait is re-cropped to **28 pixels wide** in the turn-order rail, where the face
is gone and only the outline survives. Sixteen outlines, and the one cue that separates
each from the other fifteen.

| Asset key | Headgear / hair shape | Distinct at 28 px by |
|---|---|---|
| `knight-female` | short blunt bob to the jaw, bare head | **compact** — widest at the jaw, nothing above the crown |
| `knight-male` | cropped skull over a squared gorget and high mail collar | **collar** — small head on a wide, hard-cornered shoulder block |
| `monk-female` | shaved sides, one upright topknot | **spike** — a single narrow vertical stub on the crown |
| `monk-male` | shaved smooth, no headwear | **egg** — the narrowest, smoothest outline in the set |
| `wizard-female` | long loose unbound pale hair | **mass** — the widest soft outline, broken and wispy at its edge |
| `wizard-male` | tall pointed felt cap slumped backwards | **cone** — a long diagonal spur running down behind one shoulder |
| `thief-female` | ragged short crop, bunched neckerchief | **throat** — narrow head sitting on a thick round neck roll |
| `thief-male` | bandana over the crown, two knot tails at the back | **skullcap** — smooth domed crown with two short flicks behind |
| `priest-female` | pinned hair under a short flat veil | **dome** — smooth unbroken curve stopping at the nape, no shoulder spread |
| `priest-male` | low flat-topped square cap set back | **flat top** — the only horizontal straight edge above a head |
| `archer-female` | brow band, one long braid forward over the shoulder | **braid** — a rope dropping past the shoulder on one side only |
| `archer-male` | short high ponytail, feather behind the ear | **quill** — a thin spike at ear height, tail swept back and up |
| `geomancer-female` | wide straw hat tipped back, hanging by its cord | **disc** — a broad flat plate behind the head, far wider than the head |
| `geomancer-male` | loose shoulder-length hair, shaggy fur mantle | **ragged** — the only furred, irregular outline; everything else is clean |
| `summoner-female` | twin coiled buns under a flat circlet | **two bumps** — a pair of thick round lobes on the crown |
| `summoner-male` | horned bone circlet, short hair | **horns** — two thin curved spikes, tall and clearly separated from the head |

## What I could not resolve

- **`summoner-female` vs `summoner-male`** is the closest pair. Both put two things on
  the crown. They differ in thickness and height — round lobes sitting on the head versus
  thin horns rising off it — which is a real difference at 28 px but a small one, and the
  two are never on screen for the same unit. **Judge these two side by side at 28 px on
  the first run.** If they blur, the cheap fix is to move `summoner-female` to a single
  tall coiled bun and keep the horns male-only.
- **`knight-male` vs `geomancer-male`** both read as a small head on a heavy shoulder
  mass. The separation is the outline's edge quality — hard-cornered steel versus ragged
  fur — which survives 28 px only if the ink line holds at that size. That is the same
  unproven assumption as everything else here.
- **`monk-male` vs `knight-female`** are both bare, compact heads. The bob is wider at
  the jaw and the shaved head is narrower at the crown; at 28 px this is a silhouette
  width difference of two or three pixels. Acceptable because the sexes differ, but it is
  the third-closest pair, not a comfortable one.
- **Nothing has been measured.** No portrait in this style has been cropped to 28 px and
  looked at. The whole table is a prediction.
