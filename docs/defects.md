# Live defects and open test gaps

Each entry is dated and says what would make it go red.
Nothing here fails a test today.
Route a defect to its owning engineer and a gap to `qe-tester`.
Retire an entry by striking it and naming the commit that closed it; do not delete it.

## 1. The game picks the player's ability (viewer, found 2026-09-02)

The player never chooses an ability; the board offers one per target.

| Link | Evidence (line numbers at `6067276`) |
|---|---|
| One ability per target | `targetOptions` (`src/render/preview.ts:252`) takes the first match in `actor.abilities` order (`abilities.find`, line 259) |
| `basic.attack` is always index 0 | `projectAbilities` (`src/sim/build.ts:268`) seeds it first and returns insertion order |
| The basic swing is melee whatever the weapon | `basicAttackFrom` (`src/sim/state.ts:462`) hard-codes `range {h:1,v:1}`; equipment is deferred (`docs/05` §4) |
| So Briar (archer) swings instead of shooting, and Vance (geomancer) swings instead of casting | Adjacent, both actions are legal and the swing wins. The damage ordering is not asserted; the player has no choice either way |
| No gesture selects one | The only act path is `commitAct` (`src/render/session.ts`); `game.ts` names no ability id |

`demo.ts:159-168` argues the ordering is deliberate for the engine viewer's two-ability roster; that argument does not cover a campaign unit with a growing `learned` list.
`docs/10` §5 says the action set is "whatever the loadout projects" and does not state the limitation; the action-menu slice (`docs/proposals/action-menu.md`) owes §5 a sentence.
Goes red when a spec stages two legal abilities on one target and asserts the player can commit the second.

## 2. The party's only healer cannot heal (viewer, found 2026-09-02)

| Link | Evidence |
|---|---|
| `white-magic.cure` is an area heal | `"aoe": {"h":1,"v":1}`, `data/base-pack.json:453` |
| The viewer refuses every area ability | `isClickTargetable` (`src/render/preview.ts:234`) returns false when `aoe !== null`; AoE preview is deferred (`docs/10` §4) |
| It is Ottoline's only action | Her `learned` is `["white-magic.cure"]` (`data/campaign/camp-the-first-march.json`), and an ally is offered only a `heal`-formula ability |
| She cannot be benched | Battles 3-5 each author five team-0 placements (counted 2026-09-06) against a four-record party, so `setDeployment` fields all four |
| The sim is fine | `applyCommand` routes an instant area act to `resolveAbilityAoe` (`src/sim/driver.ts`). Measured 2026-09-02: `runCampaign` records `cure` twice in battle 3 and six times in battle 5, so the probe heals and a human cannot |

Two facts recorded so nobody re-derives them: all 10 charged actions in the pack are also AoE, so fixing AoE alone leaves 10 abilities needing charge UI; `punch-art.chakra` and `white-magic.raise` are buyable in prep and would pass the filter.
Both gaps are the player's alone: `ai.ts` picks from the sim's own projection.
Route the fix to `viewer-engineer`.
Goes red when a spec commits `white-magic.cure` on an ally through the campaign page.

## 3. At 360px the battle plate is taller than the board (viewer, measured 2026-09-02)

147px of plate against a 135px board, measured in the 3:4 frame slice.
Pre-existing; the ratio change made it 7px worse and was left alone deliberately.
Nothing asserts a plate-vs-board height relation.
Goes red when a spec at the 360px breakpoint asserts the plate is shorter than the canvas.

## 4. A load-dependent flake in `telemetry.test.ts` (test code, found 2026-09-01)

"replaces a log it cannot read rather than repairing it" (line 254) asserts `log.events[0]?.at` is exactly 0 and injects no clock, though `Recorder` accepts one (`opts.now`, `telemetry.ts:140`).
`at` is `Date.now()` minus the recorder's start; on a loaded box it came back 1, once, in a full `npm run check`.
One argument fixes it.
Route to `qe-tester`.

## 5. Open test gaps (none is a shipping bug; re-derived 2026-09-02, pointers re-checked 2026-09-06)

| # | Gap | Where | Why it proves nothing |
|---|---|---|---|
| A | The camera/click A/B passes on an off-board point | `src/render/iso.test.ts:324` | The miss half is `not.toEqual({ x: 4, y: 3 })`, and `null` satisfies it. Fix: pick a point resolving to a genuinely different tile and assert that tile. `docs/10` AC-V19 was weakened to match; tighten it in the same slice |
| B | Side-face culling has no test | `paintTerrainTile` in `src/render/iso.ts` | `terrain.test.ts:149` asserts `wallLeft !== wallRight`, a palette claim. A renderer drawing every side face, or none, stays green. Fixture: `camp-b4-the-broken-span`, the only map with relief |
| C | Nothing reads a pixel off the finished picture for legibility | every canvas test | Canvas tests assert what the code asked to draw; the range panel's separation is asserted against a blend re-implemented in the test. `contrast.spec.ts` cannot see a canvas |
| D | The ~58 s per-battle motion ceiling and motion legibility have no test | AC-V21, reserved in `docs/10` §6 | Land as an AC with a test, or mark it aspirational. Route: `qe-tester` with `viewer-engineer` |
| E | No AC covers frame/asset aspect agreement | `e2e/campaign.spec.ts`, "portraits: every frame matches the aspect of the asset it holds" | The spec ships with no doc behind it. AC-V23..V29 are claimed by the menu spec, so the letter comes after V29 |
| F | Six `src/sim` files cite a `docs/02 §2` that does not exist | `ability.ts`, `movement.ts`, `reaction.ts`, `reaction.test.ts`, `support.ts`, `support.test.ts` | The section is `§A2`. Comment fix, `combat-engineer` |
| G | AC-E3(c) has no test | `src/sim/ai.ts:22`, `effHp = hp` | Needs a fixture where the countering choice and the raw-magnitude choice disagree |
| H | `benchmark-suite.test.ts:207` covers 5 of 8 skillsets with no exclusion list | `battle-skill`, `punch-art`, `steal` are neither checked nor named | A subset reads as the set; this shape let two skillsets ship inert |

What C is not: `getImageData` appears twice in `e2e/campaign.spec.ts` (the sky corner and the legend swatch); those prove wiring, not legibility.
The range panel's margins over sand and water are judged by CIEDE2000 floors in `iso.test.ts`.
