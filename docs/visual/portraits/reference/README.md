# Portrait reference art — policy and manifest

**Read `scripts/check-assets.mjs` for the rule this enforces.** Three kinds of file, three homes:

| Kind | Example | Home |
| --- | --- | --- |
| **Shipped** — the game imports it | a ~15 KB WebP crop | `data/campaign/story/portraits/`, in git |
| **Source** — the Midjourney master | a ~9 MB 2×2 grid | the owner's drive or a GitHub Release — **never git** |
| **Evidence** — a proof frame a PR links | a single upscale, a motion clip | `docs/visual/`, kept small |

Git stores every version of a binary blob whole (PNGs and video do not delta), so a grid
committed once is that many megabytes in the pack forever, even after one small crop is all
the game loads. `check:assets` fails the build on any tracked media file over **3 MiB**, and
`.gitignore` stops `git add -A` re-adding a grid. A source that is not in git is still
reproducible because its prompt and settings are recorded below.

## Why the source can leave git safely

Midjourney is stochastic, so a re-run is never byte-identical — but the **look** is
reproducible from the prompt **plus the locked style reference plus the settings**. All
three are recorded here. That is the standing rule (`CLAUDE.md`, "a result you cannot
reproduce is not an asset"): losing the prompt is unrecoverable; losing the grid is not,
once the chosen crop is committed.

## What is in this directory

These five single upscales are **interim** — one anchor image per job, all under the size
cap — kept only until the shipped WebP crops land under `data/campaign/story/portraits/`.
The 2×2 grids they came from are **not** committed.

| File | What it is | Style reference locked | Prompt |
| --- | --- | --- | --- |
| `archer-f.png` | the **locked style reference** — the anchor every other portrait is generated against. Keep this one even after crops ship. | (is the reference) | `portrait-prompts.md` › `archer-female` |
| `knight-f.png` | pre-reframe single; superseded by the generated-with-headroom probe (on the owner's drive) | `archer-f.png` | `portrait-prompts.md` PROVEN VARIANTS (age), then reframe |
| `knight-m.png` | pre-reframe single; superseded by the generated-with-headroom probe | `archer-f.png` | `portrait-prompts.md` › `knight-male`, then reframe |
| `priest-f.png` | pre-reframe single; age + reframe re-run pending | `archer-f.png` | `portrait-prompts.md` › `priest-female` |
| `wizard-f.png` | pre-reframe single; hood-up + reframe re-run pending | `archer-f.png` | `portrait-prompts.md` › `wizard-female` |

**Settings for every run:** `--ar 3:4 --raw`, four images per run, the archer locked in the
Style Reference slot. The full prompt text lives in
`.claude/skills/midjourney/references/portrait-prompts.md` (the sixteen blocks) and
`reframe-prompts.md`. **Framing is generated, not outpainted** — outpainting was measured
worse (seams, low headroom yield) and dropped; see `docs/NEXT.md`.

## Adding a portrait

1. Generate 4-up in Midjourney at `--ar 3:4` with the archer locked. Keep the grid on your drive.
2. Crop the chosen quadrant to the shipped size, save as WebP under `data/campaign/story/portraits/<job>-<gender>.webp`.
3. Add a row here: the asset key, which prompt produced it, the style reference, the date.
4. Do **not** commit the grid. `check:assets` will refuse it.
