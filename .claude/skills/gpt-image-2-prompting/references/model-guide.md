# GPT Image 2 - model guide

Short reference for `SKILL.md`: specs, the anti-slop swaps, photorealism controls, and what this repo measured.
Every fact is tagged. `[VERIFIED]` means a source fetched on 2026-09-05 confirms it, or a file in this repo does. `[UNCERTAIN]` means memory, a search snippet, or inference.

## Sources reached on 2026-09-05

| URL | Result |
| --- | --- |
| `https://platform.openai.com/docs/guides/image-generation` | 301 to `https://developers.openai.com/api/docs/guides/image-generation`, which loaded |
| `https://platform.openai.com/docs/models/gpt-image-2` | 301 to `https://developers.openai.com/api/docs/models/gpt-image-2`, which loaded |
| `https://cookbook.openai.com/examples/generate_images_with_gpt_image` | 308 to `https://developers.openai.com/cookbook/...`, which loaded; it documents `gpt-image-1`, not 2 |
| `https://developers.openai.com/api/docs/pricing` | loaded |
| `https://help.openai.com/en/articles/8932459-creating-images-in-chatgpt` | 403 at the egress proxy |

The loaded pages were read through WebFetch's summariser, not raw HTML. Re-fetch before relying on a number for a paid run.

## 1. Specs

| Item | Value | Confidence |
| --- | --- | --- |
| Model id | `gpt-image-2`; default snapshot `gpt-image-2-2026-04-21` | `[VERIFIED]` model page, 2026-09-05 |
| Endpoints | `v1/images/generations`, `v1/images/edits`, `v1/batch`; inpainting supported | `[VERIFIED]` model page, 2026-09-05 |
| Named sizes | `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`, `3840x2160`, `2160x3840`, `auto` (default) | `[VERIFIED]` image guide, 2026-09-05 |
| Size rules | max edge 3840 px; both edges multiples of 16; long:short at most 3:1; 655,360 to 8,294,400 total pixels | `[VERIFIED]` image guide, 2026-09-05 |
| Quality tiers | `low`, `medium`, `high`, `auto` (default); "Use `quality: "low"` for fast drafts" | `[VERIFIED]` image guide, 2026-09-05 |
| Output formats | PNG default; JPEG and WebP with `output_compression` 0-100; transparent background (preview) on PNG/WebP | `[VERIFIED]` image guide, 2026-09-05 |
| Max prompt length | 7,000 characters per `SKILL.md`; not stated on any page that loaded | `[UNCERTAIN]` |
| Reference-image limit | conflict: `SKILL.md` says up to 4; a web snippet said 16; the cookbook says 10 for `gpt-image-1`; the guide shows a four-image example and states no limit for `gpt-image-2` | `[UNCERTAIN]` - treat 4 as the safe working number |
| Seed / determinism | no seed parameter on any page that loaded; assume none | `[UNCERTAIN]` (absence, not a statement) |
| Pricing | token-priced, not per image: image output $30 per 1M tokens, image input $8 per 1M, text input $5 per 1M; batch is half. The guide has a per-image calculator that did not come through the fetch | `[VERIFIED]` pricing page, 2026-09-05; per-image cost `[UNCERTAIN]` |
| Known weaknesses | "can still struggle with precise text placement"; trouble "placing elements precisely in structured or layout-sensitive compositions" | `[VERIFIED]` image guide, 2026-09-05 |

ChatGPT app versus API:

- The app exposes a "thinking" level, not an image quality tier, and offers no size picker. `[VERIFIED]` by the owner's answers in `docs/visual/portraits/reference/gpt-probe-prompts.md`.
- This repo's four probe outputs are all 1145x1374 (5:6), which matches none of the API sizes above and is not a multiple of 16. `[VERIFIED]` by measuring the PNG headers in `docs/visual/portraits/reference/*-gpt*.png`, 2026-09-05.
- No fetched page compares the app to the API; the two rows above are house observations only.

## 2. Anti-slop word swaps `[UNCERTAIN]`

Prompting craft, not documented model behaviour. The model rewards visual facts; each row turns an adjective into one.

| Vague | Swap for |
| --- | --- |
| beautiful lighting | golden-hour side light, soft shadows |
| cinematic | anamorphic 2.39:1 frame, shallow depth of field, teal-and-amber grade |
| high quality / detailed | name the medium or lens: "ink and watercolour on hot-press paper", "85mm f/1.8" |
| epic | low camera angle, subject fills 80 percent of the frame |
| dramatic | single hard key light from the left, deep shadow side |
| moody | overcast, desaturated, blue-grey cast, no direct sun |
| dreamy | soft focus, haze, pastel palette, backlight bloom |
| gritty | dust in the air, scuffed surfaces, high-contrast grain in shadows only |
| vibrant | saturated primaries, flat even light, white balance neutral |
| stylised | name the style: "flat gouache, no outlines" or "ligne claire" |
| realistic | camera body, lens, film stock, lighting rig (see section 3) |
| professional photo | studio softbox key, white seamless backdrop, 50mm |
| intricate | one texture term, scoped: "hatching only in shadows" |
| atmospheric | volumetric fog, light shafts from a single window |
| retro / vintage | Kodachrome 1970s palette, slight vignette, film grain |

## 3. Photorealism controls `[UNCERTAIN]`

- Toward: name a camera body, lens, film stock and lighting rig ("Canon 5D, 85mm f/1.4, Portra 400, one softbox camera-left").
- Away: name the medium ("ink and watercolour on paper", "gouache", "risograph") in Important details, then add "no photorealism, no 3D render, no cel shading" in Constraints.
- Negatives are prose. GPT Image 2 has no `--no` flag; write exclusions as sentences in the Constraints line.
- One texture descriptor per surface class, scoped to where it applies; stacked texture words turn every surface into noise.

## 4. House knowledge - portrait probe, 2026-09-05

`[VERIFIED]` by the measured table in `docs/NEXT.md` "GPT Image 2 probe - 2026-09-05" and the byte-for-byte prompts in `docs/visual/portraits/reference/gpt-probe-prompts.md`.

- Naming the line concretely worked: "broken, scratchy, varying in weight, short overlapping strokes" plus "hatching only in the shadows and hair" put v2 at foreground line energy 27.6 and 27.5 against the locked archer's 27.2.
- "In the manner of X" plus "keep the medium, ink-line quality, texture and palette identical" (v1) did not: v1 measured 25.4 and lost the scratchy line.
- The opener "Image 1 is an approved portrait from this game and the target for line, texture and colour: draw this one with the same hand, pen and paints. Do not copy its subject, face, hair, costume" beat "Use Image 1 (...) as style reference"; the v2 prompts are the measured form.
- It obeys a background hex closely: 5-11 units off `#e9d7a8`, where the Midjourney set drifted 8.5 to 42.
- It draws a tidy anime eye with a solid iris and highlight dot regardless of line instructions; likely a model ceiling, invisible at 96 px.
- Asking for "wash pooling" and "a rosy flush" pushed skin darker and more saturated (32-34 from the archer, saturation 136-141 against 116).
- "Soft rounded cheekbones" reads as a child; every portrait character is in their twenties by the owner's rule.
- The live 16-prompt set is `docs/visual/portraits/gpt-portrait-prompts.md`; run it as its "How to run" section says.

## 5. Iteration tip

- Draft at `quality: "low"` and 1K, finalise at `high` and the delivery size. `[VERIFIED]` for the low-quality-drafts advice, image guide 2026-09-05; the rest is craft.
- Quality drops across chained edits; upscale between edits or restart from the best draft. `[UNCERTAIN]`
