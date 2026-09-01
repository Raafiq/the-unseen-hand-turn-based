# Style Reference — `--sref`, `--sw`, `--sv`

> Source: Midjourney docs, **Style Reference** (`/hc/en-us/articles/32180011136653`).
> Pasted by the owner **2026-09-01**. Badged "This feature is supported in V8.2".
> `[OFFICIAL]`.

**This is the load-bearing feature for any set of images that must look like one
thing.**

> "A Style Reference is a way to capture the visual vibe of an existing image and
> apply it to your new Midjourney creations. It doesn't copy objects or people,
> just the overall style — like colors, medium, textures, or lighting — helping you
> achieve a consistent visual theme."

Compatible with **version 6 and later**.

## ⚠️ You cannot make a style code from your own image

> "You cannot create a style code based on an uploaded image."

Verbatim, from the official page. Any plan that says "generate an image, then hand
back its `--sref` code" is describing something Midjourney does not do. This exact
error was written into this repo's `docs/NEXT.md`.

`--sref random` is **not** the workaround. It applies a **random style from
Midjourney's library** and then prints the code it happened to use — a way to
*discover* a style, not to *extract* one.

**To reuse your own image's look, use the image itself as the reference.**

## Using an image as the reference

**Web.** Click the image icon in the Imagine bar → upload or pick from your library
→ **drag it into the Style Reference slot**. Click the **lock icon** to pin it
across many prompts.

The Imagine bar has four image-reference slots. Do not confuse them:

| Slot | Does |
|---|---|
| Animate | makes a video from the image |
| Edit Model Reference | attach-to-prompt editing |
| **Style Reference** | **the one you want** |
| Image Prompt | influences content and composition, not just style |

**Discord.** `--sref <image-url>` at the end of the prompt. Multiple images:
separate URLs with a space. The image must already be online; a local file can be
hosted on Discord first.

File must end in `.png`, `.gif`, `.webp`, `.jpg` or `.jpeg`.

## Using a style code

Numeric codes from Midjourney's internal style library: `--sref <code>`.

- **Explore page → Styles tab.** Sort by random or by popular, or fuzzy-search
  ("photographic", "anime"). Click a code to see example images, then **Try Style**,
  **Copy** the `--sref` code, or **Search** similar. **Like** a code to save it to
  the Likes tab.
- `--sref random` applies a random code and converts to the actual code on submit.
- Rerun / reroll / variations **keep** the same style code.
- With permutations, repeat, or V8.1 Draft mode, `--sref random` gives each image a
  **different** code.
- Codes can be **mixed** — use more than one — and combined with images.
- To build your own code, see `style-creator.md`.

## Style Weight — `--sw`

- Range **0–1000**, default **`--sw 100`**.
- Controls how strongly the reference influences the new image.
- **Not compatible with Moodboards.**
- In V7, style weight has more effect on style *codes* than on *images*.

## Style Reference Version — `--sv`

- The Style Reference feature changed between V6 and V7, so **older codes may not
  reproduce the same style**.
- `--sv 4` uses the old V7 behaviour. Or switch to V6.
- **Not compatible with Moodboards.**

## Best practice — and it changes your prompt

> - "**Keep text prompts simple** — Avoid adding style words that might conflict
>   with your reference image's look."
> - "**Add style words selectively** — If achieving a specific style is difficult,
>   include descriptive words that match your reference image."
> - "**Focus on content, not instructions** — Use your text prompt to describe what
>   you want to see, not how Midjourney should modify the reference image."

Official bad prompts:

```
the look of this image but a dog
copy this style and make a bunny
```

Official good prompts:

```
detailed portrait of a dog
ballpoint pen sketch of a bunny
```

**Consequence for a probe-then-produce workflow:** the probe prompt is heavy on
style words because it has no reference yet. Once a reference is locked, **strip
that style clause** from the production prompts. Leaving it in is the most likely
way to get a set that does not match.

## Other

- A text prompt is still required alongside a style reference.
- Combines with Edit Model references and Image Prompts.
- Discord only: per-reference weights, `--sref URL1::2 URL2::1 URL3::1`.
