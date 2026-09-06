---
name: gpt-image-2-prompting
description: Turn a rough image idea into an optimally structured prompt for OpenAI's GPT Image 2 (gpt-image-2), or rewrite an existing prompt to fix a bad result. Use this whenever the user mentions GPT Image, gpt-image-2, "image prompt", DALL-E successor, wants to generate or edit an image with OpenAI's image model, asks to "structure my idea into a prompt", shares a generated image and asks why it looks wrong, or pastes an image prompt and asks to improve it — even if they don't name the model. Also use for edit prompts (change X, keep Y) and multi-reference prompts (Image 1 / Image 2 / Image 3).
---

# GPT Image 2 Prompting

GPT Image 2 reasons about a prompt before drawing. It rewards concrete visual facts in a fixed order and punishes vague adjectives and stacked, conflicting descriptors. Your job: take the user's idea and emit one prompt in the template below, nothing more.

Read `references/model-guide.md` when you need specs (aspect ratios, resolution, reference limits), the anti-slop word swaps, or photorealism controls. It is short; read it on first use.

## Workflow

1. **Classify the request** — one of:
   - `generate`: new image from an idea
   - `edit`: change an existing image (user has an output they want altered)
   - `multi-reference`: compose from 2–4 input images (character, style, pose, background)
   - `diagnose`: user shows a result and asks what went wrong
2. **Fill gaps before writing.** If the idea is missing the setting, the medium/style, or the intended use, ask one question with 2–4 options. Don't ask about things you can reasonably default (aspect ratio, lighting).
3. **Write the prompt** using the matching template below.
4. **Run the checklist**, then output the prompt in a code block with at most three lines of notes.

## Template: generate

Order is wide → narrow. The model parses intent in this sequence; keep it.

```
Scene: [environment, time of day, background elements]
Subject: [who/what is the focus, pose, expression, action — one clause per character]
Important details: [materials, clothing, textures, lighting, camera angle, lens, composition, mood, art medium]
Use case: [editorial photo / product shot / poster / UI screen / infographic / concept frame / character sheet]
Constraints: [what must NOT appear / what must be preserved]
```

Rules that matter most:
- **Visual facts, not vibes.** Replace "beautiful lighting" with "golden-hour side light, soft shadows". See the swap table in the reference file.
- **Name the medium explicitly** to steer away from photorealism: "gouache illustration", "risograph print", "ink and watercolor". Name a camera + lens + film stock to steer toward it.
- **One texture descriptor per surface class.** Stacking "dense crosshatching" + "paper grain" + "dry ink" makes the model texture every surface into noise. Pick one, and say where it applies ("hatching only in shadows, flat washes elsewhere").
- **Literal text goes in "quotes" or ALL CAPS**, with font style, size, and placement.
- **Short prompts (< 2 sentences)** can be a single paragraph. Use the 5-part template with line breaks for anything more.
- Max 7,000 characters, but shorter usually wins. Don't overload one prompt; iterate.

## Template: edit

Edits are commands, not descriptions. Terse. State change and keep explicitly.

```
Use Image 1 ([brief description]) as composition reference.

Change: [exactly what to alter]
Keep: [face, pose, outfit, palette, background, composition — whatever must survive]

Constraints: [no X, no Y]
```

- No "please", no "transform this beautiful image". Write "Remove background. Keep subject unchanged."
- Quality drops across chained edits; suggest upscaling between edits if the user plans several.

## Template: multi-reference

Up to 4 input images. Declare each by index and role, then the action.

```
Use Image 1 ([description]) as character reference.
Use Image 2 ([description]) as style reference.
Use Image 3 ([description]) as background reference.

Scene: ...
Subject: ...
Important details: ...
Use case: ...
Constraints: Keep each character's face, hair, and outfit identical to its reference. [other constraints]
```

Reference roles: character, style, pose, composition, background. One role per image unless the user says otherwise.

## Diagnose mode

When the user shows a result and asks what's wrong, name the prompt term(s) that caused it, propose the swap, then give the edit prompt. Common causes:

| Symptom | Likely cause | Fix |
|---|---|---|
| Grainy / mesh texture everywhere | Stacked texture words | One texture term, scoped to shadows; add "no uniform grain" |
| Looks like a photo when it shouldn't | No medium named | Name medium; add "no photorealism" |
| Characters merged or swapped | References not indexed | Index every image with a role |
| Text garbled | Text not quoted | Quote it, specify font and placement |
| Composition ignored | Subject before scene | Reorder to scene → subject → details |
| Flat, generic look | Adjective-only prompt | Swap adjectives for camera, light, material facts |

## Checklist before output

- Sections in order: Scene → Subject → Important details → Use case → Constraints
- Every adjective like "stunning / epic / cinematic / high quality" replaced with a visual fact
- Medium or camera named
- One texture descriptor per surface, scoped
- Any literal text quoted with font + placement
- Constraints list both exclusions and preserves
- References indexed with roles (if any)
- Edit prompts are imperative and terse

## Output shape

Give the prompt in a code block. Follow with at most three short lines: what you changed and why, or one iteration tip (draft at 1K/low quality, finalize at 2K/high). Don't explain the template.

## Example

**Input:** "A tired knight lying on a battlefield, his daughter poking him with a stick, ink style"

**Output:**
```
Scene: Scorched battlefield at dusk, broken weapons and spent arrows in the dirt, burnt monster carcasses in the background.

Subject: An armored knight lies flat on his back, arms splayed, eyes half-closed, chest heaving. A young girl in a witch hat crouches beside him, poking his ribs with a short stick, face blank and unbothered.

Important details: Soot smudges and scratches on his plate armor; mud on her hem. Low camera angle near ground level, knight in foreground. Clean ink outlines with flat watercolor washes; sparse crosshatching only in deep shadows; muted ochre, umber, and dusty navy palette; smooth paper with a faint parchment tint.

Use case: Tactical-RPG concept frame.

Constraints: No photorealism, no cel shading, no text, no borders, no uniform grain or surface noise.
```
