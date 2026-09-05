<!-- written-against: 6067276 -->

# NEXT - the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the derived facts (branch, merge state, unpushed work).
This file holds only what the next slice needs: what it is, what it waits on, and what will bite.
If the hook says the stamp is stale, treat every claim here as a hypothesis and re-derive it.
Green at the stamp: 947 tests, 49 browser specs (`npm run check`).

---

## OPEN - WAITING ON THE OWNER

Read this before telling the owner "nothing is pending". Two asks are open.

| # | Ask | State | What it unblocks |
|---|---|---|---|
| C | Confirm the v4 settings (ChatGPT app, "high thinking", `style-ref-1..4.png` as Image 1-4), and say why v4 `priest-m` came back 2:3 | open, minor | The run records in `gpt-portrait-prompts.md` stop reading "assumed" |
| E | Shipped crop format: PNG (**recommended**, lossless) or WebP | open, **blocks the slice** | The import, the `vite-env.d.ts` block and the README step |

Ask E, why PNG: at 96x128 a crop is a few tens of KB either way, and a lossless file stays byte-comparable to the reference it was cut from.
Three sites disagree today: `reference/README.md` step 3 (WebP, struck), `scripts/check-assets.mjs` header ("WebP/SVG"), and the spec table below (`<ext>`).
The slice lands all three with the same answer.

---

## THE NEXT SLICE - the portrait wiring, owned by `viewer-engineer`

All ten portraits are approved at the prompt level (art-director, 2026-09-06; the owner has not judged in words).
The art is in `docs/visual/portraits/reference/`; nothing imports it yet.

| Item | Spec |
|---|---|
| Shipped files | Ten crops at `data/campaign/story/portraits/<job>-<gender>.<ext>`, crop B head-to-chest, cut from the full-size reference PNGs |
| Sizes | 96x128 in the scene player, 72x96 in the unit card; `--portrait-ratio: 3 / 4` in `index.html` already covers both |
| Scope | knight, archer, thief, wizard, priest, both genders. Monk, geomancer and summoner keep the placeholder |
| Colour | No colour step. The paper ships as GPT delivered it (owner: "Leave paper color as is", ADR-0034) |
| Table and seam | `PORTRAITS` in `src/render/campaign-data.ts` gains ten keys; `look()` in `src/render/game.ts` resolves job x gender and falls back to `placeholder` for the three deferred jobs |
| Test | A Playwright spec asserting the portrait, not the placeholder, renders for every in-scope job and gender. Discriminator: the `img` source or `naturalWidth` per unit against the placeholder's; a spec that checks one unit reads as covering ten |

### Acceptance

- Every deployed knight, archer, thief, wizard or priest shows its own portrait in the scene player and the unit card.
- A monk, geomancer or summoner still shows the placeholder, and the "portrait pending" caption stays on those only.
- `npm run check` and `npm run test:visual` are green, and `check:assets` passes on the **index**, not only the working tree.
- The README step, the `vite-env.d.ts` block and the imports land in one commit.

### Landmines for this slice

- **Ask E is open.** The format is not decided; do not cut the crops until it is.
- **`look()` hard-codes `"placeholder"`** (`src/render/game.ts`, lines 126-158 at `6067276`). It reads `PORTRAITS["placeholder"]` and stamps `key: "placeholder"` on every unit; nothing in it reads a job or a gender.
- **`src/vite-env.d.ts` declares `*.svg` only.** The first `.png` or `.webp` import fails `npm run typecheck` until a matching block lands in the same commit.
- **`check:assets` weighs the WORKING TREE** (`statSync` over `git ls-files`), not the index. A local green says nothing about what is staged; run `git cat-file -s :<path>` on each PNG before committing.
- **All fourteen reference PNGs are staged at their working-tree bytes** (verified 2026-09-06, `git cat-file -s` against `stat`; an earlier handoff said four were stale). Any re-encode or rerun re-opens that gap.
- **Three tripwires go red by design:** the boot-time `portraitCoverage` check in `campaign-data.ts`, `campaign-shell.test.ts:877-878`'s `["placeholder"]` assertions, and `camp-the-first-march.story.json`'s four `"asset": "placeholder"` entries. Move all three in one commit; the third is a content decision, surface it first.
- **Crop B is head-to-chest.** Heads came out at 25-35% of frame height, not the two fifths the prompt asked; the crop absorbs the gap. On `archer-f` the arrowhead sits below crop B.
- **Nothing asserts composition.** The aspect spec passes a badly centred face; open `visual-artifacts/playtest/` after the crops land.
- **Vite inlines an asset under 4 KB as a `data:` URI.** Assert the `img` source loosely and lean on `naturalWidth`.

---

## NOT GREEN-LIT

One line each. The detail lives where the pointer says; do not re-derive it here.

| Item | State | Where the detail lives |
|---|---|---|
| The action menu | Owner-deferred 2026-09-02; the slice after this one. Claims AC-V23..V29, needs an ADR, and its Q5 (`clickTile` on `GameApi`) is settled before code | `docs/proposals/action-menu.md` |
| The job cut (8 jobs to 5) | A signal, not a decision (owner, 2026-09-05). Needs an ADR; do not start it under cover of the portrait slice | `docs/visual/portraits/reference/README.md`, "Scope" |
| The turn plate under the damage numeral | Open appearance call; render the alternatives before asking again | ADR-0032 amendment; `visual-artifacts/playtest/05c-turn-plate.png` after `npm run test:visual` |
| Team colour on portraits (clothing or panel chrome) | Blocked on one real crop wired in; judge with a real portrait beside a real swatch | `docs/visual/portraits/reference/README.md`, "Open: team colour" |
| The unit token | Still the flat kite; the owner bundled the choice with the portraits. Not this slice | ADR-0030 |
| Defect 1: the game picks the player's ability | Live, nothing red | `docs/defects.md` §1 |
| Defect 2: the party's only healer cannot heal | Live, nothing red | `docs/defects.md` §2 |
| Defect 3: at 360px the battle plate is taller than the board | Live, nothing red | `docs/defects.md` §3 |
| The `telemetry.test.ts` flake | Test code; route to `qe-tester` | `docs/defects.md` §4 |
| Test gaps A-H | Not scheduled; none is a shipping bug | `docs/defects.md` §5 |
| Variety score 7 to 8 | Off the priority list (owner, 2026-08-30); `docs/06` AC-E2 stays at 8 and CI still fails on a drop | root `CLAUDE.md`, `docs/11` §3 |
| Any balance, ability, encounter or scheduler slice | Owner order 2026-08-30: look and feel first. The human playtest is delayed, not dropped | root `CLAUDE.md`, "Not established" |
| A SessionStart warning for missing remote branches; more retrospective edits | Declined by the owner 2026-09-01; do not re-propose | this line |

---

## WHERE THE HISTORY LIVES

| Topic | Home |
|---|---|
| Portrait verdicts, per-file status, staged bytes, the style lock's origin | `docs/visual/portraits/reference/README.md` |
| GPT probe prompts, settings and the v1/v2 measurements | `docs/visual/portraits/reference/gpt-probe-prompts.md`, ADR-0034 |
| The ten v4 prompts, the v4 and v4.1 run records, the edit prompts the owner typed | `docs/visual/portraits/gpt-portrait-prompts.md` |
| Why GPT Image 2 and not Midjourney; the paper decision; the age rule | ADR-0034 and its amendments |
| The Midjourney method (Editor, Zoom Out, `::`, `--no`) and the character briefs | the `midjourney` skill |
| Live defects and open test gaps | `docs/defects.md` |
| Landed slices | `git log`, `npm run state` |
| Engine, content, viewer and environment traps | `src/sim/CLAUDE.md`, `data/CLAUDE.md`, `src/render/CLAUDE.md`, root `CLAUDE.md` |
