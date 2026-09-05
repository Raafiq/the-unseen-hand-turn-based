---
name: midjourney
description: >-
  Write, correct or run Midjourney image prompts for this project's art — the 16
  job portraits, any future character or scene art, and the style lock that keeps
  a set looking like one game. Use whenever a task mentions Midjourney, an art or
  image prompt, a portrait, --sref / style reference, style codes, moodboards, or
  "generate an image". It holds a LOCAL COPY of the official documentation,
  because docs.midjourney.com is blocked by this sandbox's egress proxy and no
  agent here can read it. Reach for this before writing any prompt: two flags
  that "everyone knows" are already wrong in this repo's own handoff notes.
---

# Midjourney

**You cannot reach the official docs from here.** `docs.midjourney.com`,
`www.midjourney.com` and `updates.midjourney.com` all fail the proxy CONNECT with
**403** — an organisation egress policy, not a transient error. `curl` fails the
same way `WebFetch` does. The proxy README says report a blocked host rather than
route around it.

**So `references/` is the only source of truth available here.** Web search results
about Midjourney are frequently stale or wrong — two of them misled a session in
this repo on 2026-09-01. Prefer `references/` over anything a search returns, and
mark anything not in `references/` as `[UNVERIFIED]`.

## Provenance

| | |
|---|---|
| Captured | **2026-09-01** |
| Model version at capture | **V8.2** |
| Captured by | the repo owner, pasting page HTML into a session |
| Pages | Getting Started, Parameter List, Raw, Style Reference, Aspect Ratio, No, Style Creator, Personalization, Moodboards, Variety/Chaos, Stylize |

**A version bump silently invalidates a parameter list.** If the owner reports a
version past V8.2, treat every `[OFFICIAL]` mark here as `[UNVERIFIED]` until the
pages are pasted again.

## The two errors this skill exists to prevent

Both were live in `docs/NEXT.md` and both would have cost the owner real money.

1. **`--style raw` is now `--raw`.** The old spelling is not in the V8.2 parameter
   list at all.
2. **You cannot create a style code from your own image.** Official, verbatim.
   A plan that says "run the probe and hand back the winner's `--sref` code"
   describes something Midjourney does not do. `--sref random` gives you a
   *random library* style, not your image's style.

## Two kinds of source, and you need both

| Question | Where the answer is |
|---|---|
| What does this flag do? What is its syntax? | **`references/` only.** Never a blog. |
| Why does the model ignore me, or default to a stereotype? | **community practice** — the official pages do not cover it |

The official docs are authoritative on the API and **silent on the model's biases**. It
took eight runs here to learn that a coif makes a knight read male three times running,
and that `large expressive eyes` turns an adult into a fourteen-year-old. Neither is in
any doc, and re-reading the reference would never have found them.

**Two levers found by searching practitioner write-ups, not by reading the docs:**

- **Word position.** Midjourney weights the **start** of a prompt more heavily. Gender,
  and anything the model resists, belongs in the first clause.
- **Prompt weights (`::`).** `woman::3` raises a concept's importance, and negative
  weights are allowed. The official No page says `--no` is worth only **-0.5**, so
  `man::-1` would push twice as hard.
  ⚠️ **UNVERIFIED.** The Multi-Prompts & Weights page
  (`/hc/en-us/articles/32658968492557`) is not captured. **Ask the owner for it before
  writing any `::` syntax** — guessing at syntax is exactly what put `--style raw` into
  `docs/NEXT.md`.

## Reference files

Read the one you need. Do not read them all.

| File | Answers |
|---|---|
| `references/parameters.md` | every flag, and the three formatting rules |
| `references/style-reference.md` | `--sref`, `--sw`, `--sv`, style codes, Style Explorer, best practice |
| `references/raw.md` | `--raw` |
| `references/aspect-ratio.md` | `--ar`, and why it is not image size |
| `references/no.md` | `--no`, and its word-by-word moderation trap |
| `references/style-creator.md` | building your own `--sref` codes, and its three costs |
| `references/personalization.md` | `--p`, Global Profile, moodboards |
| `references/getting-started.md` | the web app, the Imagine bar, the settings panel |
| `references/chaos.md` | `--chaos` / Variety |
| `references/stylize.md` | `--stylize`, and when to move it off 100 |
| `references/project-prompts.md` | **this project's** probe prompts and portrait template |

## ⚠️ If the page you need is not here, ASK THE OWNER FOR IT

**Do not fill the gap with a web search, and do not reason from training data.**
Both are how `--style raw` and "hand back the winner's style code" got into this
repo — each was confidently wrong, and each would have cost a paid 16-image run.

Only the owner can reach `docs.midjourney.com`. Ask like this:

> I need the **<page name>** page to answer this. It is at
> `docs.midjourney.com/hc/en-us/articles/<id>-<Slug>`. Paste it as plain text or
> raw HTML — the parameter tables are what matter, the marketing copy is not.

Then **add it to `references/`** with the same header block (source page, capture
date, model version) so the next session does not have to ask again.

Name the exact page. "Send me the docs" wastes a round trip; the side menu below
has every article and its URL.

### Pages NOT captured yet

Version · Quality · Upscalers · Variations · Remix · Seeds · Repeat ·
Permutations · Multi-Prompts & Weights · Image Prompts · Edit Model · Editor ·
Describe · Text Generation · Tile · Weird · Zoom Out · Pan · Draft &
Conversational Modes · GPU Speed · Stealth · Image Size & Resolution ·
Prompt Basics · Art of Prompting · Modifying Your Creations · Creating on Web ·
Legacy Features · every Discord page · every policy page

**`Version` is the most likely one to need**, because the whole capture is pinned
to V8.2 and nothing here can tell you when that changes.

## How to lock a style across a set

This is the whole problem for a 16-portrait set. Ranked, with the ruled-out options
recorded so nobody re-proposes them.

| Route | Verdict |
|---|---|
| **The winning image as the reference** (`--sref <url>`, or drag into the web Style Reference slot and click the lock icon) | **Use this.** Nothing else needed. |
| A library style code from the Explore page | Fine, but you are picking a code rather than an image |
| **Style Creator** | Builds a real code — from *sample grids*, not your image. Its previews **cost GPU time**, render at **V7 not V8.2**, its session **cannot be reopened**, and codes **stack rather than merge**. |
| **Moodboards** (`--p`) | Officially *less* specific than a style reference. Blocks `--sw` and `--sv`. Needs a Global Profile unlocked. |
| **`--oref`** (Omni Reference) | Pins a *face*, not a style. Replaced by the Edit Model in V8.X. |

## Prompt shape changes once a style is locked

**[OFFICIAL] best practice:** "Keep text prompts simple — avoid adding style words
that might conflict with your reference image's look."

| | Probe prompt (no reference yet) | Production prompt (reference locked) |
|---|---|---|
| Style clause | **keep** — it is what is being tested | **delete** — it fights the reference |
| Subject and costume | keep | keep |
| Framing clause | keep | keep |

Writing the style clause into all sixteen production prompts is the most likely way
to get sixteen portraits that do not match.

## Traps

- **Flags go at the very end.** Space before the dashes. No trailing punctuation.
- **Every `--no` word is judged on its own.** `--no modern clothing` reads as
  "no modern" AND "no clothing". On a human subject that can trip moderation. Put
  what you *do* want in the prompt instead.
- **Commas inside `--no` are fine** — `--no fruit, apple, pear` is the official
  example. The "no punctuation" rule is about a trailing comma on a flag.
- **Aspect ratio is not pixel size.** Final dimensions depend on version and
  upscaler.
- **Judge portrait art at 28 pixels wide.** The turn-order rail re-crops it that
  small. Full-size quality does not predict it.
- **Set defaults once in the settings panel** (Raw, aspect ratio) rather than
  typing the same flags on nineteen prompts.
- **If Midjourney rejects a flag, get the exact error from the owner.** Guessing is
  what put `--style raw` into `docs/NEXT.md`.

## What only the owner can do

Midjourney runs on the owner's subscription. **No agent here can call it.** So the
deliverable is always **the exact prompt text, pasted in full** — never a summary,
never "run the probe prompts". A session once asked three times without ever
pasting them.

## Handing prompts to the owner (moved here from the root `CLAUDE.md`, 2026-09-05)

  - **AN ASK YOU CANNOT RENDER MUST SHIP THE MATERIAL THAT PRODUCES THE ANSWER.**
    Some artifacts cannot be made here at all — Midjourney runs on the owner's
    subscription, so only they can generate a portrait. That does not license asking
    in prose. A session asked the owner to "run the probe prompts" across three
    replies and **never pasted the prompts**, which a specialist had already written
    in full; the owner had to ask again, and the next session dug them out of a
    reverted commit. Hand over the exact thing that lets the owner act — pasted
    inline or written to a file, verbatim. **A deliverable the user must act on is
    relayed, never summarised.** **And the mirror: once the owner ACTS on it, record
    the exact input verbatim, in the same turn.** Eight Midjourney probe runs produced
    four approved images, and the four prompts behind them were written only into chat.
    A specialist later found they existed nowhere in the repo and **reconstructed them
    from prose notes** — text the owner would have paid to run. They survived only in the
    transcript. **A result you cannot reproduce is not an asset.** The prompt, the seed,
    the settings: verbatim, into a file, immediately. **And record the SETTINGS, not only
    the prompt — the same rule, one level up.** Two of those four (knight-female,
    wizard-female) turned out on 2026-09-02 to predate the style-reference lock and are
    **not** in the set; only the archer and the priest are. The prompts were recovered
    intact and still could not tell anyone that, because which reference was loaded is a
    setting and nobody wrote it down. Six sites then read "four approved images" as
    "four usable portraits". Record what the run was configured with.
