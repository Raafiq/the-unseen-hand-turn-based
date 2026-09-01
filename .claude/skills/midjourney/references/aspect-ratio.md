# Aspect Ratio — `--ar` / `--aspect`

> Source: Midjourney docs, **Aspect Ratio** (`/hc/en-us/articles/31894244298125`).
> Pasted by the owner **2026-09-01**. Badged "This feature is supported in V8.2".
> `[OFFICIAL]`.

Midjourney images start as squares. `--ar W:H` changes the shape.

- Bigger **first** number → wide (landscape).
- Bigger **second** number → tall (portrait).
- Default is **1:1**.

## Rules

- **No decimals.** Use `139:100`, not `1.39:1`.
- Any whole-number pair works. To match an existing image, use its dimensions:
  `--ar 1920:1080` is simplified to `--ar 16:9`; `8.5x11 inches` becomes
  `--ar 85:110`.
- Older versions may not support all ratios.
- Extremely wide or tall ratios are experimental and unpredictable.
- Some ratios shift slightly when upscaling.

## ⚠️ Aspect ratio is not image size

> "Aspect ratio isn't the same as image dimensions. The final size of your
> Midjourney images will also depend on the version and upscaler you're using."

**For this project:** `--ar 5:6` guarantees the *shape* the portrait frame needs
(`placeholder.svg` is 96×116). It does not guarantee a 96×116 file. We rescale on
our side.

## Setting it as a default

Settings icon in the Imagine bar → aspect ratio. Applies to all future prompts, so
it does not have to be typed on every one.
