# Personalization and Moodboards — `--p`

> Sources: Midjourney docs, **Personalization** (`/hc/en-us/articles/32433330574221`)
> and **Moodboards** (`/hc/en-us/articles/39193335040013`).
> Pasted by the owner **2026-09-01**. Both badged "supported in V8.2". `[OFFICIAL]`.

Two flavours of the same `--p` parameter.

| | What it learns from |
|---|---|
| **Personalization profile** | images **you like or select**, over time |
| **Moodboard** | a **specific set of images** you curate |

## ⚠️ Moodboards vs Style References

> "Moodboards help you express and communicate your vision across a **wider
> aesthetic range**, especially compared to Style References, which are **more
> specific**."

**A set that must look like one thing wants "more specific".** For tight
consistency across many images, `--sref` beats a moodboard.

## Personalization profiles

Compatible with **version 6 and later**.

**You must unlock a Global Profile first** — Personalize page → click the profile
thumbnail → pick images you like from a grid until the progress bar fills. Using
`--p` before unlocking gives an error.

- The **Global V7 Profile works in V8.1 and V8.2**. There is **no Global V8
  Profile** yet. V8 profiles are not compatible with V7.
- Additional profiles are based on your **default version setting** at creation.
- Liking images on the Explore page influences your Global Profile.
- Ranking images on the Tasks page applies to the Global Profile.
- Global Profiles cannot be deleted.

## Moodboards

Moodboards page from the main nav → **New Moodboard**. Add images by upload, URL,
or from your Midjourney gallery. Multiple moodboards, each its own style.

**Incompatible with `--sw` (Style Weight) and `--sv` (Style Reference Version).**

## Using `--p`

- `--p` alone applies your **default** selections.
- `--p <ID>` uses a specific profile or moodboard — copy the ID with the "use" icon
  from the Personalize or Moodboards page. It converts to `--p <code>` on submit.
- The **P button** beside the Imagine bar toggles Personalization and picks
  defaults (you can select several, mixing profiles and moodboards).
- Discord: `--p`, or the `🙋 Personalization` settings button. Older codes via
  `/list_personalize_codes`.

## Codes are versioned snapshots

Both profiles and moodboards **generate a new code each time they change**. Copy
the ID for the latest; find older codes in your previous prompts. **Deleting a
profile or moodboard does not kill codes already made from it** — those keep
working.

## Strength

`--stylize` (0–1000, default 100) controls how much Personalization or moodboard
style is applied. Lower limits it, higher increases it.
