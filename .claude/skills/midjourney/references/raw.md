# Raw — `--raw`

> Source: Midjourney docs, **Raw** (`/hc/en-us/articles/32634113811853`).
> Pasted by the owner **2026-09-01**. Badged "This feature is supported in V8.2".
> `[OFFICIAL]`.

## The rename

**The flag is `--raw`.** The older `--style raw` spelling does not appear in the
V8.2 parameter list.

This repo's `docs/NEXT.md` carried the old spelling in all three probe prompts. It
is the single most common migration mistake.

## What it does

> "In Standard mode, Midjourney automatically adds its own creative touch to your
> images, which can transform simple prompts into a wide range of artistic styles.
>
> When you switch to Raw, you're essentially turning off this 'auto-pilot.' With
> simple prompts, you'll often get more realistic, photo-like images. If you
> provide more stylistically detailed prompts with Raw, you can really dial in and
> control the final look of your images."

Compatible with **version 5.1 and later**.

## Using it

- **Per prompt:** add `--raw` to the end.
- **As a default:** settings icon in the Imagine bar → **Model** section → Raw.
  Applies to all future prompts.
- **Discord:** the settings command, then `🔧 RAW Mode`.

## Why this project uses it

The portraits are soldiers, weathered and scarred. Standard mode's automatic
prettifying pulls a "woman knight" prompt toward glamour, which is the failure the
probe is designed to catch.
