# Style Creator

> Source: Midjourney docs, **Style Creator** (`/hc/en-us/articles/41308374558221`).
> Pasted by the owner **2026-09-01**. Badged "This feature is supported in V8.2".
> `[OFFICIAL]`.

Builds **custom `--sref` style codes**. Exclusive to midjourney.com — not Discord.

> "Create your style by choosing from the grid of images presented to you, and the
> Style Creator uses the styles you pick (and the ones you don't!) to create a new
> and unique style code you can use over and over again."

## ⚠️ It does not build a code from YOUR image

It builds one from **sample style grids it shows you**. If you already have a
winning image, this is not the tool — use the image directly as a style reference
(`style-reference.md`).

## Three costs, all official

1. **"Preview images generated in the Style Creator use your GPU time."** Every
   refinement round costs money.
2. **"Images generated in the Style Creator use Midjourney version 7."** Not V8.2.
   A prompt with V7-incompatible parameters may error unless you strip them.
3. **"Sessions cannot be reopened after closing."**

## Codes stack, they do not merge

> "If you enter the Style Creator with a prompt that already contains a style
> reference code, the Style Creator will add your newly generated style code **in
> addition to** the existing one. These codes don't merge — they both stay active.
> ...
> To match the look you see inside the Style Creator, make sure to use **both style
> codes together** in your future prompts."

Reopening the Style Creator from an image you made stacks yet another code.

## Workflow

1. **Pick a prompt.** Style Creator page from the left nav, or hover an existing
   prompt on the Create page and click the Style Creator button. You can also seed
   it with a style description or an existing style code.
2. **Pick from sample styles.** Judge the *style*, not the content — the samples
   may not match your prompt. It learns from what you skip as well as what you pick.
3. **Refine.** It periodically regenerates your prompt into preview images using a
   custom `--sref`. Each set is one round.
4. **End the session** with X or End Session. Preview images and codes are saved to
   your Create page.
5. **Use it.** On the Create page, click a code to drop it into the Imagine bar.

## Round count

> "Most styles stabilize after 5–10 rounds. Rounds 10–15 bring more detail. Past
> round 15, changes are small and subtle."

Early rounds look random. That is normal.

## Tips

- **The prompt does not steer the Style Creator** — it only renders the previews.
  Use a simple prompt for the clearest read of what the style does.
- Add `--draft` to cut GPU cost and speed up previews.
- Turn on hotkeys for faster selecting.
- Skipping does not affect style development — keep scrolling for new samples.
