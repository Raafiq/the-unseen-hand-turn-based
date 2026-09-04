<!-- written-against: f7e8375 -->

# NEXT — the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the *derived* facts (branch,
merge state, unpushed work) because those cannot rot. This file holds what only a human or
a departing session knows: **what the next slice is, why, and what will bite.**

> **Trust rule.** This file is stamped with the commit it was written against, and the
> SessionStart hook flags it once it falls behind. If the hook says it is stale, treat
> every claim below as a hypothesis and re-derive. **A "nothing covers X" you read here
> is a hypothesis too** — grep for the test before repeating it. This file has carried a
> false one before, and carried a second one until 2026-09-02: it said the action-menu
> spec existed only in a scratchpad. It is in the repo, at `docs/proposals/action-menu.md`.

**Reading marks used below.** *Measured* = a number a tool produced. *Eyeballed* = a human
or an agent looked at an image and judged. Age and framing verdicts on portraits are all
eyeballed, on images that are committed but that no test reads.

---

## OPEN — WAITING ON THE OWNER

**Read this before telling the owner "nothing is pending".** Three things need the owner.

### 1. SQUASH-merge this branch. Not a normal merge. (The single most important instruction here.)

Seven Midjourney 2×2 grids sit in this branch's **history** (`659ff71`, `1c3b841`), removed
from HEAD. A normal merge carries their blobs into `main` permanently — ~59 MB git can never
delta away. A squash-merge lands only the HEAD tree, so the grids never reach `main`.
`check:assets` blocks re-adding a grid; it cannot undo a merge that already shipped one.

### 2. Keep local copies of the two good knight grids.

`knight-f-4-2` and `knight-m-4-2` — the chosen quadrants of the regenerated knight grids —
were removed from git and live only on the owner's drive. They are the source the shipped
knight crops get cut from. Lose them and the knight runs must be paid again.

### 3. The remaining portrait runs — owner's paid Midjourney runs.

| Run | Note |
|---|---|
| monk, thief, geomancer, summoner (both genders) | run from the original prompts, generated with headroom |
| priest-female | age re-run first (`priest-f.png` reads **11–13**, eyeballed), then headroom |
| wizard-female | hood-up first (`wizard-f.png` top row is **0% background**, measured — the hood is cut), then headroom |

Prompts: `.claude/skills/midjourney/references/portrait-prompts.md` and `reframe-prompts.md`.
**Their per-block framing wording is superseded by the monk recipe** (generate-with-headroom,
below) — say so when handing them over; the age and hood edits in `reframe-prompts.md` still
stand.

**Done — do not re-raise:** archer (the locked style reference), knight-male and
knight-female are generated and measured good (see the method section). `knight-female` is no
longer an open age re-run; its age now reads **~16–19** (eyeballed). Which style reference
each committed single used is recorded in
`docs/visual/portraits/reference/README.md` — that gap is closed.

### Still open, unchanged — the turn plate under the damage numeral

**"Turn plate" = the small parchment label naming the acting unit, over their head.** When
the struck unit is also next to act, both land on one head and the numeral paints over the
plate. The reverse ordering was worse (the plate erased the numeral for ~700 ms). It is an
appearance call. **Render the alternatives before asking again.** Current behaviour:
`npm run test:visual`, then `visual-artifacts/playtest/05c-turn-plate.png` (gitignored,
empty until you capture). `docs/visual/motion/run.mp4` is committed and shows the
**superseded** placement.

### Still open — portraits: where does the team colour go?

Blocked on **one committed crop wired into `PORTRAITS`**, not on paid runs. `PORTRAITS` in
`campaign-data.ts` still holds exactly one entry, `placeholder`.

| Route | Count | Risk |
|---|---|---|
| Red/blue on the **clothing** | 8 jobs x 2 genders x 2 colourways = **32 portraits** | a recolour can drift the face |
| Red/blue on the **panel chrome and backdrop**, as FFT does it | **16 portraits** | none — the art is untouched |

Related and measured, in `reframe-prompts.md` Block 4: the wizard's hood is **8.0%** of her
pixels at **22% mean / 31% peak** saturation; the party colour `#4f8cff` is **69%**. The
hood is a slate, not the party blue — the collision is **smaller** than it was first
called. Deferred: judge it when a real portrait sits beside a real swatch in the plate.

---

## THE NEXT SLICE — the action menu. The spec is written and in the repo.

**Owner-deferred on 2026-09-02 to the next session.** `docs/proposals/action-menu.md`
(23 KB, committed in `61a3036`). Read it rather than re-deriving; it re-derived every claim
against the tree that day.

- Tag `[BASELINE]` — this is FFT's own menu; today's one-click flow is the deviation.
- Owning doc `docs/10` §3 (state table), §4 item 2, §5, §6 with **AC-V23 … AC-V29**.
- Moves **no combat constant**. AoE is explicitly `[DEFERRED]`.
- Needs an ADR: it reverses a shipped interaction model and changes what Esc means.

**Why it is the slice and not chrome.** The board picks the player's ability for them (live
defect 1 below). The legend is now *correct* and the owner judges it **redundant** — it
labels two colours the board paints unconditionally, because there is no choice for them to
be a consequence of. The menu is the missing half of the action economy.

**AC letters.** `docs/10` §6 ends at **AC-V22**; **AC-V21 is RESERVED** for the motion
layer. **AC-V23 is the next free letter and the menu spec claims V23–V29** — anything else
minted there collides. That includes the frame/asset criterion the 3:4 slice ships without
(see below): pick a letter after V29, or mint it only if the menu spec is dropped.

**One decision the spec leaves open (its Q5).** The campaign page exposes **no tile-click
seam**, so a browser spec cannot drive target selection without raw canvas clicks, which
`docs/10` §8 forbids. Either `GameApi` gains `clickTile` (mirroring `viewer-api.ts` through
the same `onPick`), or AC-V27's browser half is unwritable. Settle it before code.

### NOT in this slice

| Item | Why |
|---|---|
| Redesigning the stat plate as an FFT window | Needs real portraits to judge against. |
| Cursor-follow | Parked, not cancelled. Seam: `unitCardHtml(state, look, focusUnitId)`. |
| The 28-pixel legibility comparison | **Never run.** The silhouette table predicts sixteen outlines and measures none. |
| `telemetry.test.ts` reading the real clock | Test code — route to `qe-tester`, see the flake below. |
| Variety score 7 → 8 | **Off the priority list by the owner, 2026-08-30.** `DIVERSITY_TARGET_N` stays 7, `docs/06` AC-E2's bar stays ≥ 8, CI still fails on a drop. Leave `docs/06`, `docs/08` §1a and `docs/11` §3 as they read. |

**Owner order, unchanged since 2026-08-30.** (1) The human playtest is delayed, not
dropped — standing reminder below. (2) Look and feel before combat: no balance, ability,
encounter or scheduler slice unless the owner asks.

**Declined, so nobody re-proposes them as new** (owner, 2026-09-01): a SessionStart warning
for remote branches missing locally; any further retrospective edits.

---

## LANDED 2026-09-04 — the asset-storage policy (`f7e8375`)

**Media over 3 MiB cannot be committed.** `scripts/check-assets.mjs` (wired into `npm run
check` as `check:assets`) fails on any tracked media file over the cap, reading the real
tracked tree via `git ls-files`, not a curated list. A size cap, not a name pattern, so the
next big asset (texture atlas, audio, video) is caught too. Mutation-verified by hand
(staging a 8.9 MiB grid → exit 1; removing → exit 0); it is a standalone script, not a
vitest test, so the counts are unchanged.

Three homes for three kinds of file, recorded in
`docs/visual/portraits/reference/README.md`:

| Kind | Example | Home |
|---|---|---|
| **Shipped** — the game imports it | a ~15 KB WebP crop | `data/campaign/story/portraits/`, in git |
| **Source** — the Midjourney master | a ~9 MB 2×2 grid | owner's drive or a GitHub Release — **never git** |
| **Evidence** — a proof frame a PR links | a single upscale, a motion clip | `docs/visual/`, kept small |

`.gitignore` covers `docs/visual/portraits/reference/*-4*.png` so `git add -A` cannot re-add
a grid by reflex. Five single upscales stay under `reference/` as interim source
(`archer-f`, `knight-f`, `knight-m`, `priest-f`, `wizard-f`), one anchor per job, all under
the cap; **`archer-f.png` (the locked style reference) is kept for good**, the rest until the
shipped WebP crops land. **Revisit triggers, recorded in the commit:** published site > 300
MB, egress > 50 GB/month, or audio/video arriving.

## LANDED 2026-09-02 — six commits on `claude/next-work-slice-kh442z`

| Commit | What landed |
|---|---|
| `61f062c` | The campaign legend paints the board's real colours. `.gitignore` covers `.claude/.git-go`. |
| `81b1692` | The AoE filter's docstring tells the truth: it hides 16 of 46 actions. Comment only. |
| `4c8bfba`, `61a3036` | The two prompts the owner ran, with their settings, and the action-menu spec. |
| `2ca76d1` | Five more Midjourney pages as raw HTML. Two of them changed the plan. |
| `3927c38` | The portrait frame is 3:4, declared once, with a test that sees a frame/asset mismatch. |

Counts at head: **947 unit tests, 49 browser specs in 9 files.**

### The legend (`61f062c`)

It painted `DARK_THEME` — the engine viewer's palette — on all five campaign battles since
painted ground landed (ADR-0030). Two rows were wrong, not one: the move-range swatch and
the turn-ring swatch, both `#e2a948` amber against a board drawing `FIELD_THEME`.
`paintLegend()` in `game.ts` now sets all four rows from the constants `draw()` is handed;
`index.html` declares no swatch colour. `e2e/campaign.spec.ts` — "legend: every swatch is
the colour the board actually paints" — asserts move and ring against `FIELD_THEME` and
party and foe against **counted canvas pixels**, because an A/B between two callers of one
constant cannot see a bug in the constant. Mutation-verified four ways.

**Deliberately not asserted:** the move swatch against a canvas pixel. At 70% alpha its raw
value exists nowhere in a frame; `iso.test.ts:783` holds that link instead. **Open
appearance call:** the swatch composites over the dark board card, the same hue as but not
a match for the range slab over sunlit grass.

### The 3:4 portrait frame (`3927c38`)

The frames were built around the placeholder's 96×116 (0.827). Midjourney's Editor returns
944×1264 (0.747), and `.uc-portrait img` was 72×86 `cover`, so every head shipped **clipped
5.2% off the top**. Six sizing sites moved together — a half-landed ratio is worse than
none: `index.html`'s `.portrait img`, its 620px breakpoint, `.uc-portrait img`;
`viewer.html`'s three `.uc-portrait` rules **deleted** (`UNIT_META` carries no portrait, so
they were dead); `placeholder.svg` re-proportioned 96×116 → **96×128**; `.scene-body`
unchanged because the ratio now lives in one token.

- The ratio is declared once: **`--portrait-ratio: 3 / 4`** at `:root` in `index.html`.
- **0.75 and not the delivered 0.7468**, because 944×1264 is Midjourney's own rounding, not
  a number anyone chose, and it moves with the next model or upscale. True 3:4 trims
  **0.42%** of that art (measured) and buys integer frame heights (72→96, 96→128).
- **No `object-position` is declared anywhere in `index.html`** (verified), so it defaults
  to centre and the 0.42% comes off **both** edges.
- Also fixed, pre-existing: `.uc-portrait img` was 72px inside a 70px content box, so the
  art crossed its own right rule in every plate frame.

The test is `e2e/campaign.spec.ts`, "portraits: every frame matches the aspect of the asset
it holds" (line ~959). It compares `getBoundingClientRect()` after cascade and breakpoint
against `naturalWidth`/`naturalHeight` from the decoded file — reaching through to what the
browser painted, rather than comparing two CSS numbers that agree on the wrong answer.
Three frames: scene at 1000px, scene at 360px, battle plate. Tolerance 0.02, which accepts
the delivered 0.42% and rejects the shipped 12.1%. Mutation-verified four ways, each on a
build that typechecked; a fifth, unplanned, proved the assertion reaches the file (a `--`
inside an XML comment stopped the SVG parsing, `naturalWidth` went to 0, and both this spec
and AC-M9 went red).

**Not asserted:** that a frame is well *composed* — a badly centred face passes. **And no
AC letter in `docs/10` covers frame/asset agreement** (grepped 2026-09-02: `docs/10`
contains no mention of aspect, 3:4 or 5:6). The spec ships with no doc behind it.

---

## THE MIDJOURNEY METHOD — generate with headroom, then crop. Most likely to be lost.

**Headroom is generated in-prompt, not outpainted.** Generate at `--ar 3:4 --raw` with the
**monk recipe** framing (waist-up, a margin clause in the second position, a named feature
*above the crown*), then crop the chosen quadrant to the shipped frame. The monk recipe is
the proven one in `reframe-prompts.md`; the per-block framing wording predates it.

**Outpaint was tried and dropped — do not retry it.** Outpainting the head-room in
Midjourney's Editor measured worse: visible seams, and only ~20% of the added canvas came
back as clean paper (the rest painted as hair). Generate-with-headroom needs no second paid
step and has no seam.

**The probe passed.** Regenerating knight-male and knight-female with the monk framing came
back **7 of 8 frames clean** (measured), style holds against the archer reference
(eyeballed), and knight-female's age now reads **~16–19** (eyeballed). Their grids are on the
owner's drive; **no shipped crop is cut or wired yet**.

**Settings for every run:** `--ar 3:4 --raw`, four images per run, `archer-f.png` locked in
the Style Reference slot. Recorded in `docs/visual/portraits/reference/README.md`.

**Two prompt facts that still hold** (from the pages the owner pasted, `2ca76d1`):

- **`::` prompt weights do not exist in V8.2** — `child::-1` as an age lever is impossible.
- **`--no red` is exactly `red::-0.5`** — a weak nudge, not a ban, so `--no lipstick` is
  honoured but weak (this is why two wizard frames still showed lip colour).

**Drift to close, and it is prose (route to `docs-steward`):** `portrait-prompts.md`'s PROVEN
VARIANTS still tells a reader to "decide the framing question first, then run" (line 82) and
warns that the un-reframed blocks split the set. Under the monk recipe the framing question
is settled; that warning reads live and is now stale. The per-block framing clauses should
be replaced with the monk margin clause rather than each block deciding its own.

**Raw HTML was saved rather than distilled notes, deliberately** — distilling is where the
last two wrong flags entered. `docs.midjourney.com` is egress-blocked here; the owner
pasted these. Read the `midjourney` skill before writing any prompt.

---

## THREE LIVE DEFECTS. None is a test failure; nothing goes red today.

### 1. The game picks the player's ability. No gesture selects one.

| Link | Evidence (line numbers as of `3927c38`) |
|---|---|
| The viewer offers one ability per target | `targetOptions` (`src/render/preview.ts:252`) takes the **first** match in `actor.abilities` order — `abilities.find(...)`, line 259 |
| `basic.attack` is always index 0 for a campaign unit | `projectAbilities` (`src/sim/build.ts:294`) seeds it first and returns `[...byId.values()]` — insertion order |
| The basic swing is melee whatever the weapon is | `basicAttackFrom` (`src/sim/state.ts:454-467`) hard-codes `range {h:1,v:1}`; equipment is deferred (`docs/05` §4) |
| So the archer swings instead of shooting | Briar's `learned` is `["aim.aimed-shot"]`, range `{h:5,v:3}`. Adjacent, both are legal and the swing wins |
| And the geomancer swings instead of casting | Vance's `learned` is `["geomancy.pitfall"]`, power **43**, against the placeholder weapon's `wp: 8`. **The damage ordering is not asserted** — `magic` and `paWp` are different formulas — but the player never gets the choice either way |
| Nothing lets the player choose | The only act path is `commitAct` (`src/render/session.ts`), which takes the `TargetOption` a click produced. `game.ts` names no ability id |

**Not a pure bug — the ordering is argued for in the tree.** `demo.ts:159-168` calls it
deliberate **for the engine viewer's two-ability roster**, where the Archer's swing genuinely
out-damages its own shot up close. That is not an argument about a campaign unit with a
secondary command and a growing `learned` list. **What is missing is the choice**, and
`docs/10` §5 does not state the limitation — it says the action set is "whatever the loadout
projects" and lists demo-roster limits only. The menu slice owes §5 a sentence.

### 2. The party's only healer cannot heal.

| Link | Evidence |
|---|---|
| `white-magic.cure` is an area heal | `"aoe": {"h":1,"v":1}` — `data/base-pack.json:453` |
| The viewer refuses every area ability | `isClickTargetable` (`src/render/preview.ts:234`) returns false when `aoe !== null` — AoE preview deferred, `docs/10` §4 |
| It is her only action | Ottoline's `learned` is exactly `["white-magic.cure"]`, and `targetOptions` offers an ally only a `heal`-formula ability, so the swing cannot fill the gap |
| She cannot be benched | Battles 3, 4 and 5 each author four team-0 placements and the party holds four records, so `setDeployment` can only field all of them |
| The sim is fine | `applyCommand` routes an instant area act to `resolveAbilityAoe` (`driver.ts` ~515). **Measured:** `runCampaign` over `data/campaign` records `white-magic.cure` **twice in battle 3 and six times in battle 5**, and no enemy learns it — so the probe heals eight times and a human cannot heal once |

**The false comment is fixed; the defect is live.** `isClickTargetable`'s docstring used to
say "nothing playable is hidden by this filter". It now names the 16 rejected actions and
says what they cost. **Route the fix to `viewer-engineer`.** Two things it records so
nobody re-derives them: the `speed` clause is **subsumed today** (all 10 charged actions in
the pack are also AoE), so fixing AoE alone still leaves 10 abilities needing charge UI;
and `punch-art.chakra` (120 AP) and `white-magic.raise` are buyable in prep and would pass
the filter, which is why the comment says "the party's only **learned** heal".

**Both gaps are the player's alone.** `targetOptions` and `isClickTargetable` live only in
`src/render`; `ai.ts` picks from the sim's own projection.

### 3. At 360px the battle plate is taller than the board.

**147px of plate against a 135px board** (measured in the 3:4 slice). Pre-existing; the
ratio change made it **7px worse**, and it was left alone deliberately rather than folded
into a slice about aspect. Nothing asserts a plate-vs-board height relation.

---

## Measured facts a future session should not re-derive

- **The 28-pixel rail portrait does not exist.** `chip()` in `panels.ts` emits a **9×9
  colour dot** (`index.html:236`) and a text label — no image, no crop. Weeks of prompt
  discussion assumed a portrait there. The rail is chips; the **plate** holds the portrait.
- **Portraits are sized in six places**, all now reading `--portrait-ratio`. Listed above.
- **A frame/asset mismatch was invisible to the whole suite.** 3:4 art in the old ≈5:6
  frame clipped every head and passed 947 unit tests and 48 browser specs. That is why the
  aspect spec exists.
- **Outpaint fill does not convert to headroom one-for-one — this is why it was dropped.**
  Of **122 px** of canvas added at the top, only **19–31 px** came back as clean paper; the
  rest became hair. Headroom is now generated in-prompt (the monk recipe), not outpainted.
- **3:4 alone does not create headroom.** The frame ratio stops the crop; the *framing* (the
  monk margin clause) is what buys space above the head.
- **The hood blue is a slate, not the party blue** — 8.0% of pixels, 22% mean / 31% peak
  saturation, against `#4f8cff` at 69%.
- **Vite inlines an asset under 4 KB as a `data:` URI.** The placeholder is 1025 bytes, so
  a spec pinning a hashed filename flakes the day real art crosses the limit. Assert the
  shape loosely and lean on `naturalWidth`.
- **A non-SVG asset import fails `npm run typecheck`.** `src/vite-env.d.ts` declares `*.svg`
  only; the shipped crops are **WebP** (asset policy), so add a `*.webp` block in the same
  commit as the first import.

### The portrait wiring, when the art arrives

| Step | Where |
|---|---|
| Crop the chosen quadrant to the placeholder's size — now **96×128** — as **WebP** (asset policy, `f7e8375`) | `data/campaign/story/portraits/<job>-<gender>.webp`; keys are the prompt block titles |
| Build the job × gender → key table | `PORTRAITS` in `src/render/campaign-data.ts` |
| Resolve a unit to its key | `look()` in `src/render/game.ts`, which hard-codes `"placeholder"` today |

**Three tripwires go red, and that is them working.** (1) `campaign-data.ts`'s boot-time
`portraitCoverage` check **throws** on a bundled-but-unnamed asset. (2)
`campaign-shell.test.ts:872-879` asserts both sides equal exactly `["placeholder"]`. (3)
`camp-the-first-march.story.json` names Vance, Kest, Briar and Ottoline, all carrying
`"asset": "placeholder"` — sixteen bundled keys none of them names is exactly the `extra`
case that throws. **(3) is a decision, not a mechanical fix: surface it before writing
code.** Move all three in one commit and say why each moved.

Two more, neither of them work: the `"Portrait pending"` caption **self-retires**
(`statCardHtml` keys it on `portrait.key === "placeholder"`, and `panels.test.ts` covers
absent / pending / real) — true of the caption only, `look()` still has to resolve a key.
And **the placeholder stays**: it is the honest fallback, and the engine viewer's
absent-portrait branch (`main.ts`'s `UNIT_META` carries neither job nor portrait) is what
keeps that path exercised in shipped product.

**Interim source images live in `docs/visual/portraits/reference/`, not under `data/`.**
Five single upscales (one anchor per job, all under the 3 MiB cap) plus a `README.md`
recording each one's prompt and locked style reference. Nothing imports them; `docs/visual/`
is committed. The shipped crops go under `data/campaign/story/portraits/` as WebP. Note what
would *not* happen under `data/`: the boot check reads `Object.keys(PORTRAITS)`, a
hand-authored map, and there is no `import.meta.glob` in the tree — a stray file there is
invisible to every check in the repo.

---

## Open test gaps — available to pick up, NOT scheduled

**None is a shipping bug.** Each is a test that cannot come out the other way. **All three
re-derived against the tree on 2026-09-02.**

| # | Gap | Where | Why it proves nothing |
|---|---|---|---|
| **A** | The camera/click A/B passes on an off-board point | `iso.test.ts:324` | The miss half is `expect(pickTile(world.x, world.y, …)).not.toEqual({x: 4, y: 3})`, and `null` satisfies it. At the test's 900×600 canvas the unscaled point **is** `null`; the shipped pages are 900×440, where it lands on (1, 2). **Fix:** pick a point resolving to a genuinely different tile and assert that tile. |
| **B** | Side-face culling has no test | `paintTerrainTile` in `iso.ts` | A cliff face is cut only where the ground drops — LEFT against `(x, y+1)`, RIGHT against `(x+1, y)`, each skipped when the drop is ≤ 0. **Re-checked 2026-09-02:** `terrain.test.ts:149` asserts `wallLeft !== wallRight` per surface — a **palette** claim, not a cull claim — and nothing asserts the condition. A renderer drawing every side face, or none, stays green. `iso.test.ts`'s recording 2D context already records the fill strings. Purpose-built fixture: `camp-b4-the-broken-span`, the only shipped map with relief. |
| **C** | Nothing reads a pixel off the finished picture, for legibility | every canvas test | Canvas tests assert what the code **asked** to draw. The range panel's separation is asserted against `compositeOver`, a source-over blend **re-implemented in the test** — model, not pixel. So the two can disagree over the mottle, antialiasing or the panel's own edge stroke with nothing going red. `contrast.spec.ts` measures DOM text and cannot see a canvas. |

**What C is NOT** — three claims already covered; recording them again would be wrong.
`getImageData` appears **twice** in the tree, both in `e2e/campaign.spec.ts` (line 522, the
opaque blue-dominant sky corner; line 1037, the legend swatch read added by `61f062c`) —
those prove the page-to-terrain wire and the legend colours, not legibility anywhere. The
panel's thin margins over sand and water **are** judged, by CIEDE2000 separation floors
(`9cc4890`). The reduced-motion spec **does** compare two whole-canvas `toDataURL()`
strings — an equality between frames, not a reading of a colour.

**A carries a doc consequence.** `docs/10`'s AC-V19 was **weakened** to "not the same tile"
to match what the test asserts. Fixing A tightens that wording in the same slice.

### A FLAKE, found 2026-09-01, not fixed — route to `qe-tester`

`telemetry.test.ts`, "replaces a log it cannot read rather than repairing it" (line 264)
asserts `log.events[0]?.at` is exactly **0**. That field is `Date.now()` minus the
recorder's start, and the test **injects no clock** even though `Recorder` accepts one
(`opts.now`, `telemetry.ts:207`). On a loaded box `at` comes back **1**. Observed once in a
full `npm run check` and not reproducible in three isolated runs — which is what a
load-dependent flake looks like. One argument fixes it. **Test code: do not fix it from a
docs slice.**

---

## Landed earlier — one line each, and the traps they left

| Slice | Landed | Where the detail is |
|---|---|---|
| Painted ground on all five battles | 2026-08-30 | ADR-0030, AC-V18/V19 |
| Battle 4 gets real relief and blocked water | 2026-08-30 | ADR-0031, AC-V20 |
| An adversarial `reviewer` pass — 8 findings, 3 blockers | 2026-08-30 | `c1507dc` |
| Story v2 and the scene player | 2026-08-29 | ADR-0029, AC-V16/V17 |
| The board moves on a commit | 2026-09-01 | ADR-0032 + amendment |
| The stat plate, bottom-left over the canvas | 2026-09-01 | ADR-0033, AC-V22 |
| The record audited; `check:counts` reached CI | 2026-09-01 | `91f9739`, `86f8319` |

**AC-V21 is RESERVED for the motion layer** and held by a named line in `docs/10` §6. What
is already asserted, verified 2026-09-01 — do not repeat any of it as a gap: the numeral's
1400–2000 ms literal band, that the blow was not stretched with it, that the plate starts
after the blow and holds its window (relative to `MOTION_MS.plate`), that both labels clamp
into the viewport on all five maps, `HEADROOM` from both sides, and reduced motion in unit
**and** browser. What has **no** test: the ~58 s per-battle motion ceiling, and whether any
of the motion is legible (gap C). Those two land as an AC with a test, or get marked
explicitly aspirational. Route: `qe-tester` with `viewer-engineer`.

**The stat plate's colours were never designed.** `.unit-card` inherits `.card.board`'s
`#1d1710` fill and `#4a3a24` border; it reads as board chrome on the board. **Constraint on
any redesign: the fill stays opaque and flat.** `e2e/contrast.spec.ts` measures against a
single declared stop and cannot sample a canvas, so a gradient or any alpha silently
invalidates every contrast claim on the battle screen (AC-V22(g)).

**Cursor-follow is parked, not cancelled.** The seam is
`unitCardHtml(state, look, focusUnitId?)`. No shipped page passes an id, so
`panels.test.ts` is the only thing keeping it honest: its A/B renders the same state with
and without and asserts the two name different units with different HP — the dead-slot
shape otherwise. Three behaviours are pinned and a future inspect control inherits all
three: the override wins; an id naming nobody falls back to the lead rather than blanking;
a focused unit is never captioned "casting". Deleting the parameter costs the feature its
landing site.

### Traps that still bind

**The screen.**

0. **THE SUITE CANNOT SEE THE SCREEN.** Three defects in the painted-ground slice, two in
   the scene-player slice and the head-clipping above were all found by opening a PNG with
   the suite green. **Open `visual-artifacts/playtest/` after any change to a screen.**
   `map-battle-{1..5}.png` are the only view of the maps.
0. **CONTRAST IS MEASURED, BUT ONLY FOR DOM TEXT.** `contrast.spec.ts` cannot see a canvas,
   so nothing measures the battle map's legibility.
0. **AN ANALYZER THAT DECLINES TO CHECK STILL SAYS PASS.** axe-core files an unflattenable
   background as `incomplete`, not a violation — 2 nodes evaluated, 106 incomplete, zero
   violations on the briefing. `a11y.spec.ts` asserts `results.passes.length` and disables
   `color-contrast` rather than banking its green.
0. **`--accent` IS RULES AND BORDERS ONLY.** Gold leaf as text on parchment measures 1.55:1.
   New gold text takes `--accent-ink`.
0. **THE SHEET'S PADDING AND THE SCORCH ARE COUPLED.** `--burn + --burn-spread +
   --burn-jitter` is the depth the burn reaches; `.card`/`.panel` padding must clear it.
   **Do not mint a new sheet class** or `contrast.spec.ts`'s `sheetOf()` measures against
   the wrong ground.
0. **THE CONTRAST FLOOR IS 100, MEASURED.** The briefing paints 113 text-bearing elements;
   the old floor of 40 had a 73-node margin. Re-measure rather than nudging it.
0. **THE PLATE IS DOM BETWEEN THE POINTER AND LIVE TILES.** `pointer-events: none` is the
   only thing keeping that corner clickable, and its failure is silent. `overlay.spec.ts`
   moves the plate over a discovered unit tile first — at the shipped corner it covers only
   sky, where a click-through test is vacuous. Assert `"canvas"`, never a specific wrong
   tag: with `pointer-events` deleted, `elementFromPoint` returned a **descendant**.
0. **REVEAL STATE MUST NOT MOVE INTO THE DOM.** `renderStory` is re-entered from
   `refresh()` on the briefing while a scene is being read. `setBeat(key, …)` no-oping on an
   unchanged key is all that stands between a party edit and a reset cursor.
0. **A CAPTURED FRAME'S FILENAME IS AN ASSERTION.** `shot()` takes the `data-testid` the
   frame must show; `02a` asserts the More control is present and `02b` that it is gone.

**The board and the sim.**

0. **`viewFor` IS ON THE CLICK PATH.** A zoom applied to the painting and not the inverse
   offsets every click by a constant factor — it does not fail, it misses. Never read a
   scale off a test as what a player sees: tests run 900×600, the pages are **900×440**.
0. **NOTHING STANDING IS OCCLUDED BY TERRAIN.** Props and units draw in a second pass over
   finished ground. The opposite error is live — a unit behind a tall cliff shows through —
   and stays invisible only because every *passable* tile on battle 4 is the same height.
   **The first map with two standable heights owes the fix.**
0. **A BLOCKED TILE MUST BE PAINTED `water`** (AC-V20) — an **allow-list of one**. The
   first version listed surfaces that read walkable and so exempted `rock`, which *is*
   walkable ground on battles 3 and 4. The converse is deliberately not asserted: battle
   2's ford is paint and units wade through it.
0. **WHETHER THE PAINT AND THE RULE AGREE IS PER MAP.** True on battle 4, false on the
   other four. Keep `terrain.ts`, `campaign-data.ts` and AC-V18 in step — two of the three
   went stale after ADR-0031. What stays forbidden is a second opinion in `src/render`:
   this layer never answers "may I stand there".
0. **BATTLES 1, 2, 3 AND 5 ARE FLAT BY OWNER DECISION**, not by a limit. Relief and blocked
   water need **no schema change** — the encounter format already carries per-tile
   `{height, passable}`. It changes what a fight *is*, which is why they are parked.
0. **JUMP IS UNIFORM AT 3 ACROSS THE PARTY**, so height cannot gate a route today. Making
   it one is a job-system decision, not a terrain one.
0. **A UNIT CAN BE AUTHORED INTO THE RIVER.** Placements live in the encounter, paint in
   `campaign-data.ts` — two files, no compiler between them. Guarded, and the guard was
   earned during authoring.
0. **FOLIAGE MUST NOT BE THE GROUND'S GREEN, AND `!==` DOES NOT SAY THAT.** A shipped
   `leafLit` of `#548b38` against a grass mottle of `#5c8737` is contrast **1.03** and
   passed string inequality. `terrain.test.ts` asserts a WCAG floor of 1.6.
0. **"NO GRID" IS ABOUT WHAT IS SEEN, NOT ABOUT `stroke()`.** A water band at a fixed
   offset from each tile centre drew a plain lattice while passing the no-stroke check.
   Place every texture by the tile's own noise.
0. **A RANGE PANEL HAS TWO GROUNDS TO SEPARATE FROM.** `FIELD_THEME.highlight` is
   `#8fd0ffb3`, a light blue at 70% alpha. Only **opacity** moves a translucent colour off
   its ground — **do not "restore" a darker blue**; three earlier colours each fixed one
   ground and collided with the next. Floors are CIEDE2000, own-ground and cross-ground,
   because sand and the composited panel share a luminance and are 29.8 apart perceptually.
0. **THE UNIT TOKEN IS UNDECIDED.** Still the flat kite with a facing pip. Three treatments
   are drawn; the owner bundled the choice with the portrait references. Do not pick one
   under cover of another slice.
0. **MOTION OWNS THE FIRST CLOCK ON THE DRAWING PATH.** It never blocks input or a step;
   `accepting()` is unchanged, and a commit landing mid-animation **replaces** the beat.
   Every timing source stays out of `src/sim` **and** out of `session.ts`, which produces
   the command log. `draw()` stays pure — phase arrives through `DrawOptions`, and the
   layer animates `applied.event` rather than re-deriving what happened.
0. **REDUCED MOTION IS A `matchMedia` BRANCH, NOT A CSS QUERY.** A CSS query cannot reach a
   canvas. `scene.ts` is untouched and AC-V16's untimed reveal still holds.
0. **A LABEL SIZED IN CANVAS PIXELS CANNOT BE RESERVED FOR IN WORLD UNITS.** Both labels
   draw after the camera transform is popped: world anchor, canvas-pixel size, clamped.
   That circularity is why a clamp works where reserved headroom does not.
0. **ADR-0032's AMENDMENT QUOTES A TEST TITLE THAT NO LONGER EXISTS** — "the plate waits
   for the numeral to leave". The test now reads "the plate follows the blow by a beat".

**Process and tooling.**

0. **NEVER ANCHOR A CHECK ON THE THING IT IS CHECKING.** The camera test imported the
   shipped `HEADROOM`, so setting it to 0 moved code and expectation together.
0. **A MUTATION VERDICT FROM A FAILED BUILD IS NOT A VERDICT**, and **`git checkout` cannot
   restore an untracked file**. Gate every mutation on a successful `npm run typecheck` /
   build, and copy the file aside rather than checking it out.
0. **A STALE `dist` FAILS A BROWSER TEST THAT IS FINE.** `npx playwright test` does not
   rebuild; `npm run test:visual` does. A *failed* build leaves the previous `dist`.
0. **`tiles` GOES INSIDE `grid`**, not at an encounter file's root. Both halves of the
   defect that taught this are mechanical now: the build-freshness check lives in
   Playwright's `globalSetup`, and `playtest-capture.spec.ts` clears its output directory
   first, so a dead run leaves a missing frame rather than yesterday's.
0. **`chip()` IN `panels.ts` IS STILL UNESCAPED.** The card's label and job go through
   `esc`; the rail chip does not. Unit names come from campaign data, so nothing is
   attacker-controlled today.
0. **THE MP TRIPWIRE IS THE POINT.** "The card names no MP" stays green forever, including
   the day MP ships. `panels.test.ts` asserts `UnitStateSchema` holds no `mp` and fails
   then. Level is `docs/02` AC-J10's, deliberately not duplicated.
0. **`campaign.spec.ts` ASSERTS THE EXACT SCREEN SEQUENCE**
   `["TITLE","SCENE","BRIEFING","BATTLE","AFTER_BATTLE"]` — a new screen moves that array.
   `play.spec.ts` asserts the viewer's tab order exactly.
0. **THE DEF AND THE SAVE SHARE ONE VERSION CONSTANT**, and typecheck stays silent:
   `startCampaign` parses through `.parse()` on `unknown`, so only runtime tests catch a
   missing required field.
0. **`AP_TIERS` IS 60/120/240 AND NOBODY CAN AFFORD ANYTHING BEFORE BATTLE 3.** The
   best-earning member holds 56 AP after battle one.
0. **`EXPECTED_TREE_SIZES` in `content-pack.test.ts` pins every job's node count.**
0. Still true from earlier handoffs: a screen the state machine skips has unreachable
   content; the prep panel is mounted **once** and re-pointed; the story pack's coverage is
   checked at boot **both ways**; story text is rendered with `textContent`;
   `campaign-data.ts` imports the five encounter files **by name**; the AP grant reads
   `landedActions`; the campaign is winnable **under the probe**, which is reachability
   evidence, not difficulty evidence; `docs/11` §3 and `docs/08` §1a carry **authored**
   status tables nothing derives; the browser tests are **not** in `npm run check`.

### Three gaps found by the 2026-09-01 audit, still open, none of them prose

| Gap | Evidence |
|---|---|
| Six `src/sim` files cite a **`docs/02 §2` that does not exist** | `ability.ts`, `movement.ts`, `reaction.ts`, `reaction.test.ts`, `support.ts`, `support.test.ts`. The section is **`§A2`**. |
| **AC-E3(c) has no test** — "select damage/status types that counter the target's defenses" | `ai.ts` sets `effHp = hp` with no mitigation term. Closing it needs a fixture where the countering choice and the raw-magnitude choice **disagree**. |
| **`benchmark-suite.test.ts` covers 5 of 8 skillsets with no exclusion list** | Line 207 loops `aim`, `black-magic`, `geomancy`, `summon`, `white-magic`. `battle-skill`, `punch-art` and `steal` are neither checked nor named. A subset reads as the set — this is the defect that let two skillsets ship inert. |

---

## STANDING REMINDER — one person still has to play it

**Deferred by the owner on 2026-08-30, expected to be a while. Do not delete this section,
and do not let a prettier screen read as an answer to it.**

Nothing in the repo can settle whether a newcomer understands this game. Every automated
run drives the balance probe or a deliberate forfeit, so "completable" means *reachable* —
never difficulty, pacing or fun.

**When a human is available:** give them a link to the site root and say nothing else. When
they finish or give up, ask them to press **Copy playtest log** and paste it back. Read
`stoppedAt` first, then `timeToFirstActionMs` for `BRIEFING` (a large number is the 5-slot
chassis being illegible — the open bet), then `prepChanges` (an empty object means they
never touched progression, which ADR-0027 tuned the campaign to punish). `summarize()` in
`src/render/telemetry.ts` folds a pasted log into those numbers.

| Question | Settled? | By what |
|---|---|---|
| Is the campaign reachable start to finish | yes | `campaign-shell.test.ts`, `e2e/campaign.spec.ts` |
| Does engaging with the prep screen matter | yes | never-prep 2/16 seeds, spend-at-home 16/16 |
| Do story scenes render, advance and persist | yes | AC-V16, AC-V17, frames opened |
| Does a newcomer UNDERSTAND the 5-slot chassis | **no** | nothing can |
| Is 30–45 minutes right, is it too hard, is it fun | **no** | agent skill is not human skill |

---

## Parked — not the next slice, and not because they are wrong

| Item | Why parked |
|---|---|
| **The story repo** (`docs/08` §4) — the pack moves out, this repo consumes it as a versioned package | The natural follow-on to the scene player, but a content move, so it sits behind the visual slices |
| **Variety score 7 → 8** (`docs/06` AC-E2). The untried lever is **gear**: every build in `data/builds/*` carries `weapon: null` | Removed from the priority list by the owner. The criterion is untouched. This row is not permission to reopen it |
| **The AP grant shape** (ADR-0012) — a healer who only heals banks nothing | Combat/progression work |
| **MP enforcement** (`docs/08` §1a) | Blocked on durable carriers |
| **Terrain rules on battles 1, 2, 3, 5** | Owner decision, 2026-08-30. They keep the difficulty they were tuned for; the six balance test battles are untouched, so the variety score stays comparable |
| **Unit presentation** (the token) | Deferred by the owner, bundled with the portrait decision |

---

## Measured facts (re-derive rather than trust, but these were probed)

> **The balance numbers across ADR-0025 and ADR-0026 are MVP-PROVISIONAL** (user,
> 2026-08-22). Node costs, prereq chains and weapon stats exist to make M0 work. The RULES
> under them are not provisional.

Cheapest live option per chassis slot, walking prerequisites, after ADR-0025: secondary 60
AP (any job's first action), support 120 (`battle-skill.hp-boost`), movement 120
(`steal.move-plus-2`), reaction 180 (`punch-art.counter`). Campaign AP budget: **~280** for
the best-earning member, **~184** for the worst.

- **AC-E6 is REACHABILITY, not balance.**
- **A mobility, reach or range grant is not automatically a buff** (ADR-0020).
- **An aggregate A/B can read "identical" while a third of the rows moved.**
- **`bld-counter-wall` and `bld-aggro-tank` are the same build in practice**;
  `punch-art.` has TWO carriers; `bld-cutpurse` sits EXACTLY at `VIABLE_MIN_MAPS` (4/6).
- **The MP contingency is live:** `white-magic.holy` and `summon.*` ride unenforced MP.
- **`battle-skill` is excluded by user decision** (2026-08-16).
- **`compareCandidate` is the most load-bearing function in the repo.**
- **The frozen golden is a tripwire, not a maintenance item.**
- **GEAR IS A DIVERSITY AXIS THE GATE DOES NOT USE** — the score of 7 is measured with
  every build on the same placeholder weapon. **`wp` on a horizontal weapon is a
  calibration constant, not a tier.**
- **`ReactionEffectSchema` IS `{kind}` WITH NO MAGNITUDE** — before authoring a passive,
  check whether its effect schema can express "weaker".
- **A GATE THAT CANNOT SEE A CHANGE GOING GREEN IS NOT EVIDENCE.** Shipped builds author
  `learned` explicitly, so progression-economy changes never reach a built unit.

---

## Environment facts that cost real time to learn

- **`@axe-core/playwright` was declared but not installed** in a fresh container. If
  `npm run typecheck` fails on it, run `npm install`.
- **Scratch probes belong outside the tree but INSIDE the repo** (`coverage/`, gitignored):
  `vite-node` resolves imports against the Vite root.
- **Never round-trip `data/base-pack.json` through a JSON parser** — it reformats the whole
  file. The small authored files under `data/campaign/` are fine.
- **`src/vite-env.d.ts` exists because `tsconfig.json` sets `"types": ["node"]`.**
- **A bare JSON import breaks ONLY the browser job** — `e2e/*.spec.ts` goes through Node's
  ESM loader, which requires `with { type: "json" }`.
- **`vite.config.ts` has three entries.** A page missing from `rollupOptions.input` works
  under `npm run dev` and does not exist in `dist`.
- **A PUSHED BRANCH WITH NO PULL REQUEST CAN READ AS LOST** — 13 commits once looked gone.
  `git fetch origin` and check `origin/<branch>` first. After a merge the remote branch is
  deleted, so `--force-with-lease` fails with "stale info": `git remote prune origin`.
- **Use the check-runs API for CI**; the legacy commit-status endpoint reports nothing.
  **GitHub auto-merge is NOT enabled** — watch the checks and merge.
- **The sandbox proxy blocks `/repos/*/pages`, `/environments`, `/deployments` and all
  `*.github.io` egress**, but a CI runner reaches them with `${{ github.token }}`. It also
  blocks `docs.midjourney.com` — the owner pastes those pages, and they are saved under
  `.claude/skills/midjourney/references/`.

## Pages — RESOLVED 2026-08-12 (first successful deploy on run #23)

`pages.yml` was always correct; runs #1–#22 failed on two sequential *settings*, both
derived from the repository default branch. Two preflights now guard the `build` job. **An
agent can confirm the deployment API reported success but cannot confirm the page renders**
— `*.github.io` is blocked. Nobody in this sandbox has seen the shipped shell render.
