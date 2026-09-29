# Implementation Plan: A Weapon Has a Range

**Branch**: `claude/project-thread-ov8xky` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)
**Input**: spec.md, ADR-0049, `docs/01` AC-011..AC-016, `intent/weapon-range.md`

## Summary

Add a required `range {h,v}` to `WeaponSchema` (the unit's weapon) and to the equipment item's weapon.
`basicAttackFrom` copies it instead of hard-coding `{h:1,v:1}`.
The battle schema goes from 11 to 12; `MIGRATIONS[11]` stamps `{h:1,v:1}` on every weapon.
The eight pack weapons get an explicit `{h:1,v:1}`.
One new item, `wpn-long-bow` (`{h:4,v:3}`, `speedWp`, WP 4), goes on `pc-briar`.
The AI (`ai.ts:138`, `:297`), the reaction gate (`resolve.ts:236`) and the viewer (`session.ts:611`) already read `basic.attack.range`.
So they change in tests only, not in logic.

## Technical Context

**Language**: TypeScript (strict, `exactOptionalPropertyTypes`) | **Deps**: Zod, Vitest | **Storage**: JSON saves (BattleState v12), content pack, roster records
**Testing**: `npm run check`, `npx vitest run <file>` | **Constraints**: determinism P0, no new roll, no balance edit

**Version lines (resolved against the code):**
- `ROSTER_SCHEMA_VERSION`: no bump. A record stores the weapon by id only (`roster.ts:104`).
- `CONTENT_SCHEMA_VERSION`: no bump (stays 2). The only pack with equipment is `data/base-pack.json`, re-authored in the same commit. A campaign save stores inventory ids only (`campaign.ts:149`).
- `CAMPAIGN_SCHEMA_VERSION`: stays 4. Campaign saves hold no BattleState.
- Raise in the PR: `content.ts:26` says "bump when any catalog shape changes". A required nested field is such a change. ADR-0049 intends a loud failure; the docstring disagrees.

## Constitution Check

- Determinism: passes. No new roll. The migration reads no registry. The golden changes by representation only.
- `range` is required, no `.default()`. No new import cycle: `equipment.ts` already imports `state.ts`, and `state.ts` imports `RangeBoxSchema` from `ability.ts`.
- ADR-0007 (sim never imports render) and ADR-0048 (no reach constant in render): unaffected.

## Build order (one editor at a time)

**Step 1 — combat-engineer (`src/sim`)**
1. `state.ts`:
   - `WeaponSchema` gains `range: RangeBoxSchema`.
   - `basicAttackFrom` sets `range: { h: weapon.range.h, v: weapon.range.v }` (a copy). Docstring drops "melee".
   - `defaultUnit`'s weapon gains `range: {h:1,v:1}`.
   - `SCHEMA_VERSION = 12`. New `migrate11to12` maps every unit's weapon to `{...weapon, range:{h:1,v:1}}`; `abilities` untouched. Register as `MIGRATIONS[11]`.
   - **Freeze `migrate4to5` (line ~646).** It must call `basicAttackFrom({...u.weapon, range:{h:1,v:1}})`. Otherwise it yields `range: undefined` and every v1–v4 load breaks.
2. `equipment.ts`: the item's inline weapon object becomes `WeaponSchema.optional()`. Item and unit weapon shapes can then never drift.
3. `build.ts`: `DEFAULT_BUILD_WEAPON` gains `range:{h:1,v:1}`. Rewrite the `projectAbilities` docstring (278–285): `abilityRange` still widens skills only, never `basic.attack` (ADR-0049).
4. `ai.ts`, `resolve.ts`, `reaction.ts`: docstrings only (`exposureOf` "weapon reach"; `reaction.ts:92`).
5. Test weapon literals gain `range:{h:1,v:1}`: `ai.test.ts` (10), `driver.test.ts` (3), `resolve.test.ts` (2), `encounter.test.ts` (1). Older-version fixtures built by stripping a current state (`reaction.test.ts:461` v10; `state.test.ts` v4/v5/v6) also delete `weapon.range`.
6. Regenerate the golden (below).

**Step 2 — viewer-engineer (`src/render`), literals only.** Add `range:{h:1,v:1}` in `demo.ts` (4; the demo stays melee), `session.test.ts` (7), `panels.test.ts` (3), `motion.test.ts` (1), `pacer.test.ts` (1).

**Step 3 — content-author (`data/`)**
- `base-pack.json`: `"range": {"h":1,"v":1}` on all 8 weapons. New item `wpn-long-bow`: `{wp:4, formula:"speedWp", element:"none", accuracy:100, range:{h:4,v:3}}`, `weaponEv: 0`, tags `["weapon","ranged"]`.
- `camp-the-first-march.json`: `pc-briar` `"weapon": null` → `"wpn-long-bow"`. `aim.aimed-shot` untouched.
- **The party owns the bow (owner, 2026-09-29).** Add `wpn-long-bow` to battle 1's `grants`, which seed the starting inventory (`campaign.ts:282`). The prep dropdown lists inventory only (`prep.ts:946`), so an un-granted bow would vanish on the first swap.
- CHECKPOINT: `npm run check` green, except balance tests (stop rule).

**Step 4 — combat-engineer.** AC-011..AC-015 tests.
**Step 5 — viewer-engineer.** AC-016 test. No `session.ts` change expected.
**Step 6 — coordinator.** Close `docs/defects.md` §1's row; mark ADR-0049 built; fix the AC text errata below; `npm run state` last.

## Acceptance tests

| AC | Test file | Fixture | Must go red on |
|---|---|---|---|
| 011 | new `src/sim/weapon-range.test.ts` | Flat 6×2 grid; sword at x=0; foes at x=1, x=2, (1,1). Sweep all pack weapons by id: `{wpn-long-bow}` ∪ range `{1,1}` | `basicAttackFrom` range `{h:2,v:1}`: the x=2 case |
| 012 | same file | 1×7 row, foe at x=1/4/5; 1×3 row, foe at x=2 on height 3 / 4; 4×4 grid, foe at (3,3); `pc-briar` built from camp json + base pack | Remove Briar's `weapon`: identity (`wpn-long-bow`; Aimed Shot still `{5,3}`). Also `h:3`, `h:5`, min range 2, `v:4`, `v:2` |
| 013 | `src/sim/state.test.ts` | v11 JSON, three units (paWp, braveWp, speedWp); replay before/after; deep-equal a hand-built v12 | Stamp `units[0]` only. Also no `MIGRATIONS[11]`; a `formula`/`wp` overwrite |
| 014 | `src/sim/ai.test.ts` | AI archer `move:0`, foe at 4, A/B with a sword (assert reaches differ first). `exposureOf`: two foes differing only in weapon, tile at Chebyshev move+4 | `ai.ts:138` and `:297` read `{h:1}`: both red |
| 015 | `src/sim/reaction.test.ts` | Reactor with `punch-art.counter`, Brave 100; attacker at 3; same seed, reactor sword vs bow; bow at 5; assert `rngCounter` for "no draw" | `swing.range` → `{h:1,v:1}` **at `resolve.ts:236`** (`tryReaction`): the bow case. AC-010 negatives stay green |
| 016 | `src/render/session.test.ts` (near AC-V24, :1667) | 7×2 grid; height-4 tile at (2,1), off the bow's row; bow at (0,0), sword on row 1; a `{h:2,v:1}` fixture weapon; Aimed Shot paints x=1..5 | Hard-code `{h:1,v:1}` in `Session.reach()`'s Attack branch: the bow set |

**AC text errata (fix in `docs/01` at step 6):** AC-011/012 put a diagonal foe on a 1-row grid; AC-016 puts the height-4 tile on the bow's own row; AC-015 names `reaction.ts` but the gate is `resolve.ts:236`. The fixes above are layout choices, not rule changes.

## Golden and fixtures

- Representation-only. The one frozen golden is `src/sim/driver.test.ts:235`.
- `schemaVersion` 11 → 12; each unit `weapon` gains `"range":{"h":1,"v":1}`. Nothing else moves.
- Grep the diff: `rngCounter`, `tick`, every `hp`/`crystalTimer` and `turnLog` entry must be byte-identical. If any moves, stop.
- No `.snap` files and no committed save JSON. The v1/v4/v5/v6 and v10 migration fixtures stay green after the `migrate4to5` freeze.

## Balance risk and stop rule

- Briar goes from the placeholder (paWp WP 8, about 64 per hit) to speedWp WP 4 (about 32) at reach 4. Damage roughly halves; reach quadruples.
- Can go red: `campaign-run.test.ts` AC-M1; `playtest.test.ts` "plays the whole shipped campaign"; `story.test.ts` and `campaign-data.test.ts` if they run encounters.
- Should not move, run anyway: the diversity gate (`gauntlet.test.ts`) and `ttk.test.ts`. All 15 `data/builds` have `weapon: null`.
- **STOP RULE:** any of these red → the build stops and asks the owner. No retune, no weapon swap, no threshold edit.

## Hidden range-1 assumptions

1. `migrate4to5` (step 1).
2. `ai.ts` `tryScreen` (~568–600) is a melee body-block. A ranged threat shoots past the screener. Unchanged; a hypothesis until a turn log shows it.
3. `ai.ts:138` `?? 1` and `build.ts:175` `ability.range ?? {h:1,v:1}`: legitimate fallbacks, leave them.
4. `prep.ts:946` inventory-only dropdown: closed by granting the bow (step 3).
5. Stale melee prose: `session.ts:585`, `build.ts:278`, the `basicAttackFrom` docstring.

## Risks

1. The `migrate4to5` trap breaks pre-v5 loads if not frozen first.
2. Campaign pacing tests may flip on Briar's halved damage → stop rule, owner call.
3. The prep dropdown drops an un-granted bow → closed: the bow is granted in battle 1.
4. AC fixture geometry errata (above).
5. AC-015's mutation must hit `resolve.ts:236`, or the test proves nothing.

## Complexity Tracking

None.
