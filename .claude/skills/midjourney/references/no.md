# No — `--no`

> Source: Midjourney docs, **No** (`/hc/en-us/articles/32173351982093`).
> Pasted by the owner **2026-09-01**. Badged "This feature is supported in V8.2".
> `[OFFICIAL]`.

`--no` is a "no entry" list for things you do not want in the image.

## Commas ARE allowed

> "You can even list multiple elements by separating them with commas."

Official good example:

```
still life gouache painting --no fruit, apple, pear
```

Official bad examples (say it in the prompt instead of using `--no`):

```
still life gouache painting without any fruit
still life gouache painting, please don't add fruit!
```

The Parameter List's "no punctuation" rule is about a **trailing** mark on a flag
(`--ar 2:3,`), not about separating `--no` terms.

## ⚠️ The moderation trap — read before writing any `--no` list

> "Midjourney's moderation system reads every word you add to the `--no` parameter
> **independently**. This means if you prompt `--no modern clothing` it will read
> that as 'no modern' and 'no clothing'! This interpretation can accidentally
> trigger a warning, as it might seem like you're requesting an image of someone
> without clothing. In this case, include the type of clothing you do want in your
> prompt, rather than using `--no`."

**This bit this project.** The portrait probe prompts carried
`--no ... armour below the shoulders, ...` on a prompt whose subject is a woman.
Word by word that is "no armour" + "no shoulders" — the exact shape described. It
was removed; the prompts already name the clothing positively ("plain riveted
gorget, dull woad-blue padded gambeson collar"), so nothing was lost.

**Rule: never put a multi-word phrase in `--no` that reads badly when chopped into
single words.**

## Mechanics

Using `--no` is the same as weighting part of a multi-prompt to `-0.5`.
