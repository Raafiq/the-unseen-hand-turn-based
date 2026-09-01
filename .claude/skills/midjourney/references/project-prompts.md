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
