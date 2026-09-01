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
| Pages | Getting Started, Parameter List, Raw, Style Reference, Aspect Ratio, No, Style Creator, Personalization, Moodboards |

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
| `references/project-prompts.md` | **this project's** probe prompts and portrait template |

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
