# Stylize — `--stylize` / `--s`

> Source: Midjourney docs, **Stylize** (`/hc/en-us/articles/32196176868109`).
> Pasted by the owner **2026-09-01**. Badged "This feature is supported in V8.2".
> `[OFFICIAL]`.

> "Think of stylize as a slider that changes how much artistic creativity is
> applied to your image. With a **low** stylize setting, it's like asking for an
> image that follows your prompt very closely — Midjourney sticks to the facts
> without much extra flair. With a **higher** stylize setting, it's like giving
> Midjourney more freedom to interpret your idea. The image might look more
> artistic and visually interesting, but it could **stray from the exact details of
> your prompt**."

- Default **100**, range **0–1000** on current versions.
- `--s #` at the end of a prompt, or a default in the settings panel.
- Discord presets: `🖌️ Stylize med` is the default; select one and read "Current
  suffix" for its exact value.

## It also drives Personalization and Moodboards

When a Personalization profile or moodboard is active, `--stylize` controls **how
much of that style is applied** — lower limits it, higher increases it.

## For this project

**Leave at 100 for the probe.** Raw is already the literal-ness lever, and a probe
that changes two things at once cannot be read.

**If the probe results come back too "arty" and ignore the explicit style
instructions** (e.g. "three flat shading tones, no gradient on the skin"), lowering
stylize toward ~50 is the correct next lever — and it must then be **locked for all
sixteen production runs**, exactly like the style reference. A production set run at
a different stylize value than the probe will not match what was approved.
