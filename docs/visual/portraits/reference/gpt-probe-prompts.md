# GPT Image 2 portrait probe - prompts and settings

This file is the reproducibility record for two probe runs on OpenAI GPT Image 2 (model `gpt-image-2`), both on 2026-09-05.
Run v1 produced `knight-f-gpt.png` and `knight-m-gpt.png`; run v2 produced `knight-f-gpt2.png` and `priest-f-gpt2.png`.
~~All four are in this directory, each 1145x1374 RGB (a 5:6 ratio).~~
**Files moved, 2026-09-05 (later the same day):** the owner deleted the two v1 files and renamed the two v2 files to `knight-f.png` and `priest-f.png`, over the Midjourney singles of the same name.
The v1 outputs exist nowhere in the repo now; their measurements survive in the Verdict below and in ADR-0034.
`archer-f.png` in this file means the **Midjourney** archer, the lock at the time; that file is now `HEAD:docs/visual/portraits/reference/archer-f.png`, and the working-tree `archer-f.png` is a GPT v3 output.
The style lock changed on 2026-09-05 to `style-ref-1..4.png`; see `README.md` in this directory.
The probe exists to compare GPT Image 2 against the Midjourney knights (`knight-f.png`, `knight-m.png` at HEAD) on the same brief.

## Verdict - 2026-09-05

GPT Image 2 v2 closed most of the style gap to the locked archer: foreground line energy 27.6 and 27.5 against the archer's 27.2, and blue-cloth distance 18, the same as the approved Midjourney priest.
Skin is a shade darker and more saturated than the archer (32-34 from it, against an in-set Midjourney variance of 27); a v3 prompt pass owes "paler, less saturated tan, like the reference".
GPT hit the asked background `#e9d7a8` within 5-11 units; that hex is the campaign page's parchment surface, and it is the Midjourney set that is off it.
One v2 regression: the knight's collar lost its vertical quilting.
The full table is in ADR-0034; the owner decided to switch on 2026-09-05 (ADR-0034, Ask 5).

The two prompts were authored on 2026-09-05 by the `art-director` agent.
They are translations of the Midjourney `knight-female` and `knight-male` blocks in `.claude/skills/midjourney/references/portrait-prompts.md`.
Both were run with `archer-f.png` attached as Image 1, the style reference; the owner confirmed this on 2026-09-05.
The owner's words on the run: "i used the same prompt u provided".

The prompts below are recorded byte-for-byte as handed to the owner.
They contain em dashes; those are part of the record and are deliberately left in.

## Settings - owner's answers, 2026-09-05

| Setting | Value |
| --- | --- |
| Tool | ChatGPT app (not the API). Owner's words: "ChatGPT app" |
| Reasoning / quality | Owner's words: "high thinking". That is the ChatGPT app's thinking level; the app does not expose the image quality tier, so no tier is recorded |
| `archer-f.png` attached as Image 1 | Yes, confirmed by owner. Owner's words: "yes" |
| Output size | 1145x1374 as delivered by the app; the owner did not choose a size setting |
| Model | `gpt-image-2` |
| Date | 2026-09-05 |

The settings above are the owner's own answers, given 2026-09-05, not inferred.
A re-run in the ChatGPT app with the same prompt, the archer attached and "high thinking" is the closest reproduction available; the app's image quality tier is not selectable there.

## Prompt: knight-female

```text
Use Image 1 (an approved portrait of a young female archer in this game's art style) as style reference.

Scene: No environment. A single flat field of pale sand-tan, hex #e9d7a8, filling the whole frame edge to edge behind the figure. No horizon, no floor, no props, no cast shadow on the backdrop.

Subject: A woman in her late twenties, a female mercenary knight, shown head and collar only. Bare-headed, no helmet and no coif. Short dark hair cut blunt to the jaw, the whole face uncovered and evenly lit. A thin pale scar crosses one cheek. Mouth closed and level, eyelids slightly lowered, brows relaxed, looking steadily at the viewer. Head turned three-quarters to the left, eyes toward the viewer.

Important details: A plain riveted steel gorget with a fine gold edge line, over a deep woad-blue padded gambeson collar; the padding quilted in wide vertical channels. Skin and cloth in flat washes; a delicate dry ink line of varying weight on contours and folds only, breaking where it turns away — no hatching, no grain, no texture inside the washes. Muted desaturated palette of ochre, tan skin, dull steel grey and dusty blue. Flat even frontal light, no shadow side, no rim light. Head occupies roughly two thirds of the frame height with clear space above the crown; cropped just below the collarbone. Medium: Japanese tactics-RPG character illustration, ink and thin watercolour on paper, in the manner of Akihiko Yoshida's Final Fantasy Tactics portraits.

Use case: Character portrait for a tactics RPG, displayed at 96x116 pixels and re-cropped to 28 pixels wide in a turn-order list, so the head-and-shoulder silhouette must stay readable when very small.

Constraints: Keep the medium, ink-line quality, texture and palette identical to the style reference; do not copy its subject, face, age, hair or costume. The background must stay one flat untextured colour. No scenery, no landscape, no interior, no gradient or vignette in the background. No rim light, no glow, no lens flare. No glamour styling, no lipstick, no eye makeup, no jewellery beyond the named gold edge line. No beard, no stubble. No chibi or child proportions. No photorealism, no photograph, no 3D render, no cel-shaded videogame render. No border, no frame, no text, no watermark, no signature.
```

## Prompt: knight-male

```text
Use Image 1 (an approved portrait of a young female archer in this game's art style) as style reference.

Scene: No environment. A single flat field of pale sand-tan, hex #e9d7a8, filling the whole frame edge to edge behind the figure. No horizon, no floor, no props, no cast shadow on the backdrop.

Subject: A man in his twenties, a male mercenary knight, shown head and collar only. Bare-headed, no helmet and no coif. Dark hair cropped close to the skull, the whole face uncovered and evenly lit, clean-shaven with no beard and no stubble. A thin scar along one cheekbone. Mouth closed and level, eyelids slightly lowered, brows relaxed, looking steadily at the viewer. Head turned three-quarters to the left, eyes toward the viewer.

Important details: A squared riveted steel gorget with hard corners, worn over a high mail standing collar of fine riveted rings and a dull woad-blue padded gambeson; the shoulder line broad and hard-edged. Skin, mail and cloth in flat washes; a delicate dry ink line of varying weight on contours and folds only, breaking where it turns away — no hatching, no grain, no texture inside the washes. Muted desaturated palette of ochre, tan skin, dull steel grey and dusty blue. Flat even frontal light, no shadow side, no rim light. Head occupies roughly two thirds of the frame height with clear space above the crown; cropped just below the collarbone, with the gorget and mail collar reading as a wide hard-cornered block under a small head.

Use case: Character portrait for a tactics RPG, displayed at 96x116 pixels and re-cropped to 28 pixels wide in a turn-order list, so the head-and-shoulder silhouette must stay readable when very small.

Constraints: Keep the medium, ink-line quality, texture and palette identical to the style reference; do not copy its subject, face, gender, age, hair or costume. The subject is male. The background must stay one flat untextured colour. No scenery, no landscape, no interior, no gradient or vignette in the background. No rim light, no glow, no lens flare. No glamour styling, no lipstick, no eye makeup, no jewellery. No beard, no stubble, no moustache. No chibi or child proportions. No photorealism, no photograph, no 3D render, no cel-shaded videogame render. No border, no frame, no text, no watermark, no signature.
```

## Follow-up probe v2 - run 2026-09-05 (authored 2026-09-05)

v2 exists because v1 followed the prompt but lost the archer's scratchy line and warm blotchy skin; v2 rewrites the style language.
The owner ran both v2 prompts on 2026-09-05 and delivered the outputs at 12:34-12:35 local time.
The owner's words on the run: "we went with option 1".
Option 1 was: run both v2 prompts in the ChatGPT app, "high thinking", `archer-f.png` attached as Image 1, the same as v1.
The verdict is in the Verdict section at the top of this file and in ADR-0034.

### Settings - v2, 2026-09-05

| Setting | Value |
| --- | --- |
| Tool | ChatGPT app (not the API) [assumed, owner did not report a change] |
| Reasoning / quality | "high thinking"; the app does not expose the image quality tier, so no tier is recorded [assumed, owner did not report a change] |
| `archer-f.png` attached as Image 1 | Yes [assumed, owner did not report a change] |
| Output size | 1145x1374 as delivered by the app; the owner did not choose a size setting. Measured from the files, not assumed |
| Model | `gpt-image-2` [assumed, owner did not report a change] |
| Date | 2026-09-05 |

Every row tagged "[assumed]" mirrors the v1 settings because the owner chose "option 1", which named those settings, and reported nothing different.
No row in this block is the owner's own answer to a direct question about v2; the v1 block above is.

### Outputs - v2

| Prompt | Output file | Delivered dimensions |
| --- | --- | --- |
| `knight-female v2` | ~~`knight-f-gpt2.png`~~ renamed by the owner to `knight-f.png`, 2026-09-05 | 1145x1374 RGB, 2,352,823 bytes |
| `priest-female v2` | ~~`priest-f-gpt2.png`~~ renamed by the owner to `priest-f.png`, 2026-09-05 | 1145x1374 RGB, 2,338,350 bytes |

The byte sizes above are how the renamed files were identified as the v2 outputs: both match to the byte.
The v1 outputs (`knight-f-gpt.png`, `knight-m-gpt.png`) were deleted by the owner the same day and have no output table; their sizes were never recorded.

## Prompt: knight-female v2

```text
Image 1 is an approved portrait from this game and the target for line, texture and colour: draw this one with the same hand, pen and paints. Do not copy its subject, face, hair, costume or freckles.

Scene: One flat field of pale sand-tan, hex #e9d7a8, edge to edge. No horizon, floor, props or cast shadow.

Subject: A woman in her late twenties, a mercenary knight, head and collar only. Bare-headed, no helmet, no coif. Short dark hair cut blunt to the jaw, whole face uncovered, a thin pale scar across one cheek. Mouth closed, eyelids slightly lowered, steady gaze. Head turned three-quarters to the left, eyes toward the viewer.

Important details: A plain riveted steel gorget with a fine gold edge line over a padded gambeson collar quilted in wide vertical channels. Dry pen line: broken, scratchy, varying in weight, short overlapping strokes rather than one clean contour, with fine hatching only in the shadows (under the jaw, eye sockets, under the collar) and short strokes inside the hair following its direction. Skin: warm, blotchy watercolour wash, visible pooling, a rosy flush on cheek and nose tip. The gambeson is dusty, greyed woad blue, mottled, never navy. Palette: ochre, warm tan, dull steel grey, dusty woad. Flat frontal light. Head about two thirds of frame height, space above the crown, cropped below the collarbone.

Use case: Tactics-RPG portrait shown at 96x116 pixels, so the silhouette must read when tiny.

Constraints: Hatching only in shadows and hair; skin and cloth carry wash texture, not pen texture; background flat and untextured. No clean uniform outline, no airbrushed skin, no gradient, no rim light, no makeup, no jewellery beyond the gold edge line, no chibi, no photorealism, no 3D or cel render, no border, text or watermark.
```

## Prompt: priest-female v2

```text
Image 1 is an approved portrait from this game and the target for line, texture and colour: draw this one with the same hand, pen and paints. Do not copy its subject, face, hair, costume or freckles.

Scene: One flat field of pale sand-tan, hex #e9d7a8, edge to edge. No horizon, floor, props or cast shadow.

Subject: A woman in her thirties, a battle priest, head and collar only. A cream-white linen veil pinned back off her face so the whole face is visible, its underside lined in dusty woad blue. Warm auburn hair coiled and pinned at the nape. Soft rounded cheekbones, a slender neck, a simple brass circlet. Calm steady gaze. Head turned three-quarters to the left, eyes toward the viewer.

Important details: A high cream-white robe collar with a dull red-brown stole over the shoulders. Dry pen line: broken, scratchy, varying in weight, short overlapping strokes rather than one clean contour, with fine hatching only in the shadows (under the jaw, inside the veil's folds, under the collar) and short strokes inside the hair following its coil. Skin: warm, blotchy watercolour wash, visible pooling, a rosy flush on cheek and nose tip. The veil lining is dusty, greyed woad blue, mottled, never navy. Palette: cream, ochre, warm tan, brick red-brown, dusty woad. Flat frontal light. Head about two thirds of frame height, the veil a smooth dome ending at the nape, space above the crown, cropped below the collarbone.

Use case: Tactics-RPG portrait shown at 96x116 pixels, so the silhouette must read when tiny.

Constraints: Hatching only in shadows and hair; skin and cloth carry wash texture, not pen texture; background flat and untextured. No clean uniform outline, no airbrushed skin, no gradient, no rim light, no makeup, no jewellery beyond the circlet, no man, no chibi, no photorealism, no 3D or cel render, no border, text or watermark.
```
