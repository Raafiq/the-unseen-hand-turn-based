# This project's prompts

> The prompts are **ours**, not Midjourney's. The flags in them are checked against
> the official pages captured **2026-09-01** at **V8.2**.
>
> **Relay these verbatim.** Midjourney runs on the owner's subscription and no agent
> here can call it, so the prompt text IS the deliverable. A session once asked the
> owner three times to "run the probe prompts" without ever pasting them.

## Set these two defaults first

Settings icon in the Imagine bar. Saves typing them on all nineteen runs.

| Setting | Value |
|---|---|
| Model → Raw | **on** |
| Aspect ratio | **5:6** |

Every prompt below still shows `--raw` and `--ar 5:6` so it works standalone.
Drop them if the defaults are set.

---

## Stage 1 — the style probe (3 runs)

**Goal: pick one look, then lock it.** Not to produce final art.

The subject is a female knight deliberately. It stresses metal, cloth, hair and
skin at once, and it tests the failure most likely to wreck half the set: the model
reading "woman" as glamour rather than as a soldier.

### 1. CEL

```
head and collar portrait of a woman mercenary knight, short dark hair under an open steel
coif, plain riveted gorget, dull woad-blue padded gambeson collar, weathered and scarred,
anime cel illustration, clean thin warm-brown ink line, three flat shading tones, no
gradient on the skin, three-quarter turn to the left with eyes toward the viewer, head
fills two thirds of the frame, cropped at the collarbone, flat even light, muted earth
palette of tan skin and dull steel, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, rim light, glow, lens flare, glamour, lipstick, jewellery, text, watermark
```

### 2. GOUACHE — sits closer to the parchment shell

```
head and collar portrait of a woman mercenary knight, short dark hair under an open steel
coif, plain riveted gorget, dull woad-blue padded gambeson collar, weathered and scarred,
opaque gouache on toned paper, visible brush facets, soft edges, no ink outline,
three-quarter turn to the left with eyes toward the viewer, head fills two thirds of the
frame, cropped at the collarbone, flat even light, muted earth palette of tan skin and
dull steel, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, rim light, glow, lens flare, glamour, lipstick, jewellery, text, watermark
```

### 3. INK AND WASH — hardest line, likely strongest at 28px

```
head and collar portrait of a woman mercenary knight, short dark hair under an open steel
coif, plain riveted gorget, dull woad-blue padded gambeson collar, weathered and scarred,
ink and watercolour, hard confident ink line of varying weight, colour washed inside the
line and breaking at the edges, dry-brush texture, paper grain, three-quarter turn to the
left with eyes toward the viewer, head fills two thirds of the frame, cropped at the
collarbone, flat even light, muted earth palette of tan skin and dull steel, flat pale
sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, rim light, glow, lens flare, glamour, lipstick, jewellery, text, watermark
```

### Two corrections already applied to these

Both were wrong in `docs/NEXT.md` before 2026-09-01.

| Was | Now | Why |
|---|---|---|
| `--style raw` | `--raw` | renamed; the old spelling is not in the V8.2 parameter list |
| `--no ... armour below the shoulders, ...` | removed | `--no` is read word by word, so on a woman that becomes "no armour" + "no shoulders" — the moderation trap the official No page describes. The prompts already name the clothing positively, so nothing is lost |

### Judging

**At 28 pixels wide, not full size.** The turn-order rail re-crops this art that
small, where only the headgear silhouette survives. Gorgeous full-size and mud at
28px is the wrong winner.

### Then lock the style

Upscale the winner → upload it → drag into the **Style Reference** slot → click the
**lock icon**. See `style-reference.md`; you cannot extract a code from it, so the
image itself is the reference.

---

## THE STYLE IS DECIDED: Final Fantasy Tactics / Akihiko Yoshida

**Owner decision, 2026-09-01, after eight probe runs across two styles.** Granblue
Fantasy was the runner-up and is not to be reopened without a new decision.

**Why FFT won:** its muted ochre and dusty-blue palette is native to the game's
parchment shell (ADR-0028), where Granblue's saturated jewel tones fight it on
every screen. It also held together across two very different jobs — a hooded
wizard and a headbanded archer read as the same game.

**The one word that unlocked it:** `anime character illustration for a Japanese
tactics RPG`. Two earlier FFT attempts failed in opposite directions without it —
one came back as photorealistic watercolour, the next as European graphic novel.
Naming the medium is not enough; the register has to be named too.

### The style tail — identical on all 16, do not edit

```
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark
```

### Costume rules the probe earned

- **NEVER LET HEADGEAR SHADOW THE FACE.** This is the rule, and it took six runs to
  find. A coif made a knight read male three times running; a forward hood made a
  wizard unreadable in **both** candidate styles. It is **not** that headgear is
  banned — the wizard frames that finally worked still wear the hood. The difference
  is the face is **fully visible and lit**. Say so explicitly:
  `bare-headed with her hood lowered around her shoulders`, or
  `pushed back off her brow so her whole face is visible and lit`.
  This is also the 28-pixel fix: a portrait that is 70% cloth is a blob at rail size.
- **Severe words read male in this style.** `hard set jaw`, `narrow tired eyes`,
  `aloof distant expression` and `in her forties` each pushed masculine. Prefer
  `calm steady gaze`, `soft rounded cheekbones`, `a slender neck`.
- **`--no lipstick` is not reliably honoured.** Two of four wizard frames came back
  with visible lip colour. Reroll or crop; it is not worth a prompt change.
- **Give every job a distinct headgear silhouette.** Hood, headband, bare, cap. At
  28 px the silhouette is all that survives; the face does not.
- **Lead with gender**, then say it a second way in the same clause.

### The style reference IS needed — measured, 2026-09-01

A control run proved it. The priest prompt was run **without** a style reference and
drifted badly: the same style tail produced European devotional painting, soft and
nearly ink-free, unmistakably a different illustrator from the archer. Re-run with an
**archer frame locked in the Style Reference slot**, it snapped back into the set.

**What the reference carries, and what it does not** — this matches the official
Style Reference page and was confirmed here:

| Carried | NOT carried |
|---|---|
| medium, ink line, palette, texture | subject, proportion, **age** |

**Consequence:** the locked archer is a young face and drags every portrait young.
**Owner decision, 2026-09-01: a young cast, 20s-30s, is fine.** Age and personality
variety come later, driven by character profiles rather than by the job. Do not
fight the reference on age.

### Still open

The **28-pixel comparison has not been run.** The FFT line is thin and its contrast
low, and nothing has yet confirmed it survives the turn-order rail's crop. Do this
before committing to sixteen paid runs.

## The probe record — 2026-09-01, eight runs

The probe above is kept as the record. **This section supersedes it.** The owner
chose a **Granblue Fantasy** register, and it took four runs to get a usable frame.
Each failure and its cause:

| Run | Came back | Cause |
|---|---|---|
| 1 | four **men**, crop too wide | gender stated once, in the middle of the prompt |
| 2 | four **children**, androgynous | `large expressive eyes` — it pulls the whole image young |
| 3 | four **men**, adult and correctly weathered | `hard set jaw`, and the coif |
| 4 | **four women** ✅ | the coif was removed |

### The finding that matters

**HEADGEAR MASCULINISES HARDER THAN ANY WORD.** Three runs said "woman" — one of
them three times, leading the prompt — and every one came back male while the
subject wore a steel coif and gorget. Removing the coif fixed it on the first try
with the gender wording unchanged.

**Consequence for the set:** the eight female portraits need bare-headed or light
headwear. Do not spend runs re-wording a helmeted prompt.

### Two more, both cheap

- **Word position matters.** Midjourney weights the start of a prompt more heavily.
  Gender belongs in the first clause.
- **STOP FIGHTING THE CROP.** Every run ignored "cropped at the collarbone" and
  "fills the frame edge to edge". It does not matter — we crop to 96x116 ourselves,
  for free. Framing instructions are not worth a paid run.

### The prompt that worked

```
extreme close-up head portrait of a woman, a female mercenary knight in her
thirties, bare-headed with no helmet, her face weathered and lined with a scar
across one cheek, soft cheekbones and a narrow tired gaze, short dark hair, a
plain riveted gorget with fine gold trim, deep woad-blue padded gambeson collar,
Granblue Fantasy character art, painterly anime illustration in the style of
Hirokazu Koyama, clean thin lineart, soft airbrushed cel shading, luminous skin,
rich saturated jewel-tone palette, three-quarter turn to the left with eyes toward
the viewer, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glamour, lipstick, chibi, man, beard, stubble, helmet, coif, text, watermark
```

### Not yet tried

**Prompt weights (`::`).** A `::` splits a prompt into concepts and a number sets
importance (`woman::3`); negative weights are allowed. The official No page says
`--no` is worth only **-0.5**, so `man::-1` would push twice as hard. The
**Multi-Prompts & Weights** page (`/hc/en-us/articles/32658968492557`) has NOT been
captured — ask the owner for it before writing `::` syntax. Guessing at syntax is
what produced the `--style raw` error.

## Stage 2 — the 16 portraits

**8 jobs × 2 genders.** Jobs from `src/render/prep.ts`: Knight, Monk, Wizard, Thief,
Priest, Archer, Geomancer, Summoner. Enemies are human only and reuse the set.

### The style clause is DELETED here

Official best practice: with a reference locked, style words in the prompt fight it.
The probe's "anime cel illustration, clean thin warm-brown ink line, three flat
shading tones" does **not** carry over.

### Template

```
head and collar portrait of a <SUBJECT>, <COSTUME>, weathered and scarred,
three-quarter turn to the left with eyes toward the viewer, head fills two thirds
of the frame, cropped at the collarbone, flat even light, muted earth palette,
flat pale sand-tan background colour #e9d7a8
--no scenery, rim light, glow, lens flare, glamour, lipstick, jewellery, text, watermark
```

**`<SUBJECT>` and `<COSTUME>` per job are not written yet.** Write them before the
run, not at the Imagine bar, or the set drifts one portrait at a time. Owned by
`content-author`.

### Order

**Knight, both genders, first.** Download both and compare them at 28px before
running the other seven jobs. Two portraits is a cheap test of whether the locked
style survives a subject change. Fourteen is not.

### What comes back to the repo

| Item | Lands in |
|---|---|
| 16 PNGs | `data/campaign/story/portraits/` |
| job × gender → asset key | `PORTRAITS` in `src/render/campaign-data.ts` |
| the style reference used | the portrait ADR, so a 17th portrait can match |

The boot-time portrait check (`campaign-data.ts:115-123`) and the `["placeholder"]`
tripwire (`campaign-shell.test.ts:872-879`) **will go red** on that commit. That is
the tripwire working — it exists to force this review.
