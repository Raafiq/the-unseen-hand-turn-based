# Portrait reference art - policy and manifest

**Read `scripts/check-assets.mjs` for the rule this enforces.** Three kinds of file, three homes:

| Kind | Example | Home |
| --- | --- | --- |
| **Shipped** - the game imports it | a ~15 KB WebP crop | `data/campaign/story/portraits/`, in git |
| **Source** - the generator's full-size output | a ~9 MB Midjourney grid, a ~3 MB GPT PNG | the owner's drive or a GitHub Release - **never git** unless it is under the cap |
| **Evidence** - a proof frame a PR links | a single upscale, a motion clip | `docs/visual/`, kept small |

Git stores every version of a binary blob whole (PNGs and video do not delta), so a grid committed once is that many megabytes in the pack forever, even after one small crop is all the game loads.
`check:assets` fails the build on any tracked media file over **3 MiB** (3,145,728 bytes), and `.gitignore` stops `git add -A` re-adding a grid.
A source that is not in git is still reproducible because its prompt and settings are recorded.

## Why the source can leave git safely

Both generators are stochastic, so a re-run is never byte-identical.
The **look** is reproducible from the prompt, the locked style reference and the settings, so all three are recorded.
That is the standing rule (`CLAUDE.md`, "a result you cannot reproduce is not an asset"): losing the prompt is unrecoverable; losing the output is not, once the chosen crop is committed.

## Scope, as of 2026-09-06

**Portrait scope is five jobs: knight, archer, thief, wizard, priest.** Ten portraits, two genders each.
Owner's words, 2026-09-05: "we may have too many jobs now. Will reduce in future. So for now we keep to the basic jobs - knight, archer, thief, wizard, priest".
The game still has eight jobs (`JOB_LABEL` in `src/render/prep.ts`); the cut is a signal, not a decision, and the three other jobs keep their placeholder portrait until it lands.
Their v3 files were deleted from this directory on 2026-09-05; nothing for monk, geomancer or summoner is on disk or in git.

**The style lock is the four `style-ref-N.png` files.** They replaced the Midjourney archer on 2026-09-05.
~~Their origin (tool, prompt, settings) is unrecorded until the owner answers.~~
Answered 2026-09-06, owner's words: "it's just some random generation and I chose the ones i like".
No prompt or settings were kept, so the four files cannot be regenerated from text; **the files themselves are the lock**, and they must stay in git.

## What is in this directory

Fourteen PNGs: the four style refs, eight v4 outputs and two v4.1 reruns.
Every image row below is a full-size PNG; **all fourteen are under the cap on disk** (`check:assets` passed 2026-09-06 after the reruns).
~~The index still holds older bytes for four of them.~~ Re-staged: all fourteen staged blobs match the working tree (verified 2026-09-06, `git cat-file -s` against `stat`).
Nothing in this directory is shipped; the game still renders one placeholder for every unit.

**The owner saves a run's output over the plain `<job>-<gender>.png` name.** Never assume a version suffix; the version is recorded here, not in the filename.

Dimensions and bytes below were measured with Pillow on 2026-09-06 00:10 (docs-steward), after the three lossless re-encodes; the two rerun rows were re-measured the same way after 00:35.

### The style lock

| File | What it is | Origin | Size |
| --- | --- | --- | --- |
| `style-ref-1.png` | **style lock**, owner-supplied 2026-09-05 | owner, random generation, prompt not kept | 1086x1448, 3,044,938 bytes |
| `style-ref-2.png` | **style lock**, owner-supplied 2026-09-05 | owner, random generation, prompt not kept | 1086x1448, 2,993,988 bytes |
| `style-ref-3.png` | **style lock**, owner-supplied 2026-09-05 | owner, random generation, prompt not kept | 1086x1448, 3,074,198 bytes. ~~3,146,014 bytes - 286 over the cap~~ Re-encoded losslessly on 2026-09-05 21:37; under the cap, and the staged copy is the same bytes |
| `style-ref-4.png` | **style lock**, owner-supplied 2026-09-05 | owner, random generation, prompt not kept | 1086x1448, 3,053,135 bytes |
| `style-ref-archer-f-midjourney.png` | the **previous** lock, historical: the Midjourney archer that anchored every run until 2026-09-05 | Midjourney, `portrait-prompts.md` › `archer-female`, `--ar 3:4 --raw` | **not on disk at the 2026-09-06 audit.** The bytes are `HEAD:docs/visual/portraits/reference/archer-f.png` (2,206,720 bytes, added in `fadb6f2`); recover with `git show` under this name if it is ever wanted again |

### The GPT Image 2 v4 outputs and two v4.1 reruns - 10 of 10 approved 2026-09-06

**Verdict on v4: 8 approved, 2 sent back** (`archer-f`, `priest-m`).
~~**The two v4.1 reruns landed 2026-09-06 and are not yet judged.**~~ **Both reruns were approved the same day**, so the set stands at ten of ten (Ask A, closed 2026-09-06).
The read is the art-director's, eyeballed against the four refs and agreed by the main session; the owner has not judged.
The per-portrait reasons are in the table below; the set-wide measurements are in `../gpt-portrait-prompts.md`, "Run record - v4"; the sheets are scratch on the owner's machine, not in the repo.

**The paper is off the page hex in all ten** (measured): `#e2c18a` to `#e9c88b`, 31-38 units from `#e9d7a8`, the refs' own paper.
GPT copies the refs' paper over the number in the prompt.
**Decision closed 2026-09-06, owner's words: "Leave paper color as is."** The portraits ship with the paper as delivered; no post-process shift, and the darker card in the scene player is accepted (ADR-0035, amendment of 2026-09-06).

The ten v4 prompts are in `docs/visual/portraits/gpt-portrait-prompts.md`; each row's prompt is the fenced block under the heading it names.
The owner ran all ten on 2026-09-05 evening and said "I finished updating the images".

**Settings - ASSUMED, not confirmed.** ChatGPT app, GPT Image 2, "high thinking", `style-ref-1..4.png` attached as Image 1-4, as that file's "How to run" block asks.
The owner reported no change from that block, and was not asked to confirm each setting; the block says to report any deviation, and none was reported.
Which four refs were actually attached is unconfirmed.
**Both archers were finished with a follow-up edit prompt in the app** (owner, 2026-09-06, verbatim in their rows); no other portrait is recorded as edited.

| File | Version | Prompt | Size | Status |
| --- | --- | --- | --- | --- |
| `knight-f.png` | v4 | `gpt-portrait-prompts.md` › `knight-f` | 1086x1448, 3,117,149 bytes | approved (v4), art-director 2026-09-06, eyeballed |
| `knight-m.png` | v4 | `knight-m` | 1086x1448, 3,140,938 bytes | approved (v4), art-director 2026-09-06, eyeballed; unrequested cheek scar, minor |
| `archer-f.png` | **v4.1 rerun**, 2026-09-06 00:31 | `archer-f`, then the edit "Change: hold an arrow head instead with the sharp point facing up. There should be a slight shine to the arrow head" | 1086x1448, 2,850,222 bytes (the v4 was 2,808,578) | approved (v4.1), art-director 2026-09-06, eyeballed; turn right, arrowhead point-up with shine; jacket edge 31.8, still under the refs' 36-48, accepted by eye. v4 was sent back for a flipped turn and a flat jacket, edge 29 |
| `archer-m.png` | v4, 2026-09-05 23:11 | `archer-m`, then the edit "Change: hold a crossbow instead. Hang a quiver of arrows on his back. Ensure crossbow is proper length" | 1087x1447, 3,040,762 bytes | approved (v4), art-director 2026-09-06, eyeballed; the crossbow is the owner's edit, not a model miss |
| `thief-f.png` | v4 | `thief-f` | 1086x1448, 3,081,186 bytes (delivered 3,164,784; re-encoded losslessly 2026-09-06, pixels verified identical) | approved (v4), art-director 2026-09-06, eyeballed |
| `thief-m.png` | v4 | `thief-m` | 1086x1448, 3,094,667 bytes (delivered 3,179,589; re-encoded losslessly 2026-09-06, pixels verified identical) | approved (v4), art-director 2026-09-06, eyeballed; earlobe notch missing, minor |
| `wizard-f.png` | v4 | `wizard-f` | 1122x1402, 3,092,059 bytes | approved (v4), art-director 2026-09-06, eyeballed; gazes off left, not up, minor |
| `wizard-m.png` | v4 | `wizard-m` | 1086x1448, 2,919,091 bytes | approved (v4), art-director 2026-09-06, eyeballed; nose straight, not hooked, minor |
| `priest-f.png` | v4 | `priest-f` | 1086x1448, 3,063,727 bytes | approved (v4), art-director 2026-09-06, eyeballed; ink 29% is below the refs' 40-74, accepted by eye |
| `priest-m.png` | **v4.1 rerun**, 2026-09-06 00:35, 3:4 | `priest-m` | 1086x1448, 2,960,923 bytes, under the cap as delivered (the v4 was 1024x1536 and 3,249,408 bytes after re-encode, over the cap) | approved (v4.1), art-director 2026-09-06, eyeballed; 3:4, no stubble, robe hatched 40.9; ink 23.6, still under the refs' 40-74, accepted by eye as `priest-f` was. v4 was sent back for ref-4 stubble on the jaw, 26% ink, and the cap |

Four things the table cannot tell you:

- The version is assigned from the save times (21:59 to 23:37 on 2026-09-05 for v4, 00:31 and 00:35 on 2026-09-06 for v4.1) and the owner's words, not from anything in the file.
- Which block produced which file is inferred from the filename; the "How to run" block asks the owner to save under the block heading, and the names match.
- ~~`priest-m.png` is 1024x1536, a 2:3 frame, where the other nine are near 3:4.~~ The v4 was; nothing in the record says why. The v4.1 rerun is 1086x1448.
- ~~**The staged (index) copies of four files are not the working-tree bytes.**~~ Re-staged before 2026-09-06 00:45: every staged blob matches disk. The trap stands: `check:assets` reads the working tree, so check the index with `git cat-file -s :<path>` after any re-encode or rerun.

### History - what left this directory and where it is

| What | Where it is now |
| --- | --- |
| The five Midjourney singles (`archer-f`, `knight-f`, `knight-m`, `priest-f`, `wizard-f`) | In git at HEAD under their plain names, added in `fadb6f2`. The owner staged the GPT v4 files over all five on 2026-09-05, so the next commit replaces them; recoverable from `fadb6f2`. Only the archer was the lock; the knights and wizard predate it. |
| The 2x2 Midjourney grids (`*-4.png`, `*-4-2.png`) | Added in `659ff71` and `1c3b841`, removed in `f7e8375`. Recoverable from those commits; never re-add them (`check:assets`). |
| `archer-f-4.png`, the Editor-outpainted archer | Removed in `f7e8375` with the grids. |
| `knight-f-gpt.png`, `knight-m-gpt.png` (GPT v1) | Deleted by the owner on 2026-09-05. Never tracked. The v1 measurements survive only in ADR-0035. |
| `knight-f-gpt2.png`, `priest-f-gpt2.png` (GPT v2) | Renamed by the owner to `knight-f.png` and `priest-f.png`, then overwritten by the v4 outputs the same day. Never tracked under any name. |
| The v2/v3 GPT outputs for 8 jobs (16 files, plain names) | Overwritten by v4 (the ten in scope) or deleted (`monk`, `geomancer`, `summoner`, six files) on 2026-09-05; not in git. Their sizes (2,338,350 to 2,990,857 bytes) are in this file's git history; their prompts are in `gpt-portrait-prompts.md`'s history and its "Deferred jobs" section. Rejected by the owner: "i'm not keen that they are all posed the same way with roughly the same expressions and features. We should vary it a bit." |

~~**Settings for every run:** `--ar 3:4 --raw`, four images per run, the archer locked in the Style Reference slot.~~
**Superseded 2026-09-05 by [ADR-0035](../../../adr/0035-portraits-are-generated-in-gpt-image-2-not-midjourney.md):** portraits come from GPT Image 2.
The Midjourney prompt text stays in `.claude/skills/midjourney/references/portrait-prompts.md` and `reframe-prompts.md` as the character briefs.
~~**Framing is generated, not outpainted** - outpainting was measured worse (seams, low headroom yield) and dropped.~~
That line and the 2026-09-02 handoff (which called Editor outpainting the recipe) disagreed; neither was adjudicated, and both are moot under ADR-0035.

## Open: team colour

Where the red/blue team colour goes is undecided, and blocked on one real crop wired into `PORTRAITS`.
Two routes: on the **clothing** (5 jobs x 2 genders x 2 colourways = 20 portraits; a recolour can drift the face), or on the **panel chrome and backdrop** as FFT does it (10 portraits; the art is untouched).
Judge it when a real portrait sits beside a real swatch in the plate.

## Adding a portrait

1. Run the block from `docs/visual/portraits/gpt-portrait-prompts.md` in the ChatGPT app with `style-ref-1..4.png` attached as Image 1-4.
2. Record the settings and the delivered size in the table above in the same turn the file lands; there is no seed, so the record is the only reproduction.
3. Crop the chosen output to the shipped size, 96x128, crop B head-to-chest, and save under `data/campaign/story/portraits/<job>-<gender>.<ext>`.
   ~~Save as WebP.~~ The format is an open call (`docs/NEXT.md`, Ask E); PNG, lossless, is recommended. No paper shift: the owner kept the paper as delivered.
4. Keep every tracked file under 3 MiB. `check:assets` refuses the rest.
