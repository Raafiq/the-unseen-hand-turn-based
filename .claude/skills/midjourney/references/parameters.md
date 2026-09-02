# Parameters

> Source: Midjourney docs, **Parameter List** (`/hc/en-us/articles/32859204029709`).
> Pasted by the owner **2026-09-01**. Model version at capture: **V8.2**.
> Everything on this page is `[OFFICIAL]`.

Parameters are instructions that change how an image generates.

## Three formatting rules

1. **Parameters go at the end**, after all your prompt text.
2. **Put a space between the prompt text and the dashes.**
3. **No punctuation marks in parameters.**

Wrong, from the official page:

```
vibrant California poppies--ar 2:3      (no space before the dashes)
vibrant California poppies - - ar 2:3   (extra space between the dashes)
vibrant California poppies --ar 2:3,    (punctuation in the parameter)
vibrant California --ar 2:3 poppies     (prompt text after parameters)
```

Rule 3 is about a **trailing** mark on the flag. It does **not** forbid the commas
that separate items inside `--no` — see `no.md`.

## Full list

| Flag | Name | What |
|---|---|---|
| `--ar` / `--aspect` | Aspect Ratio | image shape; default square |
| `--chaos` / `--c` | Chaos | more varied results |
| `--no` | No | things to leave out |
| `--profile` / `--p` | Personalization | custom style profiles and moodboards |
| `--quality` / `--q` | Quality | detail and processing time |
| `--repeat` / `--r` | Repeat | multiple image sets from one prompt |
| `--seed` | Seed | for testing and experimenting |
| `--stealth` | Stealth Mode | keep creations private |
| `--raw` | Raw Mode | turn off Midjourney's automatic styling |
| `--stylize` / `--s` | Stylize | artistic flair, 0–1000, default 100 |
| `--sref` | Style Reference | match another image's look |
| `--sw` | Style Weight | strength of a style reference, 0–1000, default 100 |
| `--sv` | Style Reference Version | which style-reference generation to use |
| `--tile` | Tile | seamless repeating patterns |
| `--version` / `--v` | Version | model version |
| `--niji` | Niji | anime / Eastern aesthetics model |
| `--draft` | Draft | V7 draft images at half the GPU cost |
| `--weird` / `--w` | Weird | quirky, unconventional |
| `--iw` | Image Weight | impact of image prompts |
| `--oref` | Omni Reference | a person's likeness or an object's form — **"replaced by the Edit Model in V8.X"** |
| `--edit` | Edit Model | create/modify with written instructions + up to four reference images |
| `--fast` / `--relax` / `--turbo` | GPU Speed | which GPU pool |
| `--public` | Public Mode | creations public on the website |
| `--hd` / `--sd` | Resolution | V8.1 at 2048px / 1024px |
| `--video` | Video | generate video in Discord |
| `--motion low` / `--motion high` | Motion | video motion setting |
| `--loop` / `--end` | Video looping | looping video, custom end frame |
| `--bs` | Batch Size | videos generated per video prompt |
