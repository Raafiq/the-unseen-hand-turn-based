# Feature Specification: A Weapon Has a Range

**Feature Branch**: `claude/project-thread-ov8xky`
**Created**: 2026-09-29
**Status**: Draft (spec only; nothing built)
**Source of truth**: [`docs/01-combat-system.md`](../../docs/01-combat-system.md) AC-011 … AC-016 and [`docs/adr/0049-…`](../../docs/adr/0049-a-weapon-has-a-range-attack-takes-its-reach-from-the-weapon.md). This spec ports those criteria verbatim (`specs/README.md`). The doc governs on any conflict.
**Intent**: `intent/weapon-range.md` (all questions answered, owner, 2026-09-29).
**Constitution**: honors Principle V (determinism: a schema bump with a migration, no new randomness).

## Overview

Attack reaches one tile for every unit today, whatever it holds. After this slice every
weapon carries `range {h, v}`, and a unit's basic Attack takes its reach from its weapon.
One bow, the Long Bow, is added and equipped on Briar. Counter's reach, the AI's threat
reach and the viewer's reach paint all follow, with no new code path of their own.

## User Scenarios & Testing

### User Story 1 - The archer shoots (Priority: P1)
Briar, holding the Long Bow, attacks a foe up to four tiles away without spending a skill.

**Independent Test**: AC-012 on a purpose-built row: foes at distance 1, 4, 5 and at height 3 / 4.

**Acceptance Scenarios**:
1. **Given** Briar with the Long Bow, **When** a foe stands 4 tiles away on level ground, **Then** Attack is legal.
2. **Given** the same, **When** the foe stands 5 tiles away, **Then** Attack is not legal, and Aimed Shot (reach 5) still is.
3. **Given** a foe adjacent, **When** Briar attacks, **Then** it is legal: there is no dead zone.

### User Story 2 - A sword still reaches one tile (Priority: P1)
Nothing about melee changes. Every existing weapon is `1v1`.

**Independent Test**: AC-011 and AC-013 (a v11 save migrates and replays identically).

### User Story 3 - The world reads the weapon (Priority: P2)
The AI attacks from range, a Counter fires by the bearer's weapon, and the board paints the bow's reach.

**Independent Test**: AC-014, AC-015, AC-016, each an A/B of one unit with sword vs bow.

### Edge Cases
- Height tolerance is the weapon's `v`: a foe 3 higher is in reach for the bow, 4 higher is not.
- A save written before the bump loads with every weapon at `{h:1, v:1}` and plays identically.
- A fixture weapon that omits `range` fails validation: the field is required, never defaulted.
- No line of sight, arc or height bonus: a foe behind a wall inside the box is attackable.
- A range-up support still widens skills only, never the weapon (`docs/05` §3).

## Requirements (ported verbatim from `docs/01`)

- **AC-011 (a melee weapon keeps reach 1, ADR-0049):** Every shipped weapon other than the Long Bow SHALL carry `range {h:1, v:1}`, and a unit holding one SHALL have a `basic.attack` whose range is exactly that. *Fixture:* a purpose-built flat 1×6 row, two builds of one unit. Sword-bearer at x=0, a foe at x=1 (in reach) and, in a second battle, a foe at x=2 (out); plus a diagonal foe at (1,1) (in, Chebyshev) on a separate flat 6×2 grid, because a 1-row grid has no y=1 tile. Tests: `src/sim/weapon-range.test.ts`, `src/sim/state.test.ts`. *Discriminator:* a `basicAttackFrom` that widens the default (`h:2`) or reads `wp` as reach passes the x=1 case and fails x=2. *Mutation:* set `basicAttackFrom`'s range to `{h:2,v:1}`; the x=2 case MUST go red. A data sweep asserts the partition `pack weapons = {Long Bow} ∪ {range {1,1}}` exactly, and fails on a stale name.
- **AC-012 (the bow reaches exactly 1..4 within v 3, ADR-0049):** A unit holding `wpn-long-bow` (`range {h:4, v:3}`) SHALL be able to Attack a foe at every horizontal distance 1, 2, 3 and 4, and SHALL NOT at distance 5. Height tolerance SHALL be 3: a foe on a tile 3 higher is in reach, 4 higher is not. There is no minimum range: distance 1 is legal. *Fixture:* purpose-built flat 1×7 row (archer at x=0), one foe per battle at x=1, 4 and 5; plus a 1×3 row with the foe at x=2 on a tile of height 3 (in) and another battle at height 4 (out); plus a foe at (3,3) (in, Chebyshev) on a separate flat 4×4 grid, for the same reason. Heights are integers ≥ 0 and unbounded, so both tiles exist. *Discriminators (one mutation each, each MUST go red):* `h:3` fails x=4; `h:5` fails x=5; a minimum range of 2 fails x=1; `v:4` fails height 4; `v:2` fails height 3. A second assertion reaches the shipped data: `pc-briar`, built from `camp-the-first-march.json`, holds an item whose id is `wpn-long-bow` (identity, not just "some ranged weapon"), and her `aim.aimed-shot` is still `{h:5, v:3}` (Aimed Shot unchanged, so it still out-reaches Attack at distance 5). The party owns the bow through battle 1's grants, because the prep dropdown lists inventory only. *Mutation:* remove the `weapon` line from Briar's record; the identity assertion MUST go red. Tests: `src/sim/weapon-range.test.ts`.
- **AC-013 (migration v11 → v12, ADR-0049):** `SCHEMA_VERSION` SHALL be 12 and `MIGRATIONS[11]` SHALL exist. Loading a v11 save SHALL stamp `range {h:1, v:1}` on the `weapon` of EVERY unit, keep `basic.attack`'s range `{h:1,v:1}`, and replay the same command log to the same outcome as before the bump. *Fixture:* a v11 save with three units whose weapons differ (a `paWp` sword, a `braveWp` blade, a `speedWp` weapon) so a migration that stamps the first unit only, or copies one unit's weapon onto all, is visible. *Discriminators:* bumping the version without registering `MIGRATIONS[11]` (load throws); stamping `units[0]` only (units 1 and 2 fail schema validation); overwriting `formula`/`wp` while stamping (the three weapons' other fields MUST survive byte-for-byte). *Mutation:* delete the `map` and stamp `units[0]`; the all-units assertion MUST go red. The migrated state SHALL deep-equal a hand-built v12 state of the same content.
- **AC-014 (the AI's reach reads the weapon, ADR-0049):** An AI unit holding a ranged weapon SHALL attack from range without closing to melee, and its threat reach (`exposureOf`) SHALL be `move` plus the weapon's `h`. *Fixture:* purpose-built flat row, AI archer with `move: 0` (legal, `IntSchema.min(0)`), a player foe at distance 4. A hard-coded reach of 1 cannot attack at all and ends its turn; the correct AI emits an attack. A/B: the same unit with a sword emits no attack. For `exposureOf`: two foe units identical except weapon, a candidate tile at Chebyshev `move + 4` from both; the bow-bearer counts it (1), the sword-bearer does not (0). `exposureOf` tests horizontal distance only (its own approximation, unchanged). *Mutation:* make `exposureOf` and the attack search read `{h:1}`; both cases MUST go red. The fixture SHALL assert that the two weapons differ in reach before comparing. Tests: `src/sim/ai.test.ts`.
- **AC-015 (a reaction fires or not by the reactor's own weapon range, ADR-0049):** A `counter` reaction SHALL fire when the attacker stands inside the REACTOR's basic-attack range, and SHALL NOT fire when it stands outside, whichever weapon the attacker holds. *Fixture:* one reactor built with `punch-art.counter` at Brave 100, one physical ranged blow at it from an attacker at distance 3, and the SAME reactor and seed differing only in weapon. Sword: no counter, and no reaction draw is consumed. Bow: the counter fires. A third battle with the attacker at distance 5 and the bow: no counter. *Discriminators:* a gate hard-coded to `{h:1,v:1}` fails the bow case; a gate that ignores range fires for the sword and fails the sword case; a gate that reads the ATTACKER's weapon range gets the sword/bow cases backwards. *Mutation:* replace `swing.range` in `tryReaction` (`src/sim/resolve.ts`) with `{h:1,v:1}`; the bow case MUST go red. The gate lives in `resolve.ts`, not `reaction.ts`. Existing AC-010 negatives stay green against the melee build. Tests: `src/sim/reaction.test.ts`.
- **AC-016 (the viewer paints Attack's reach from the same sim rule, ADR-0049):** `Session.reach()` for Attack SHALL equal the set `inAbilityRange` returns for the unit's derived `basic.attack` range, and no reach constant SHALL live in `src/render`. *Fixture:* purpose-built flat 7×2 grid, with the height-4 tile at (2,1), off the bow's row (a height-4 tile on the bow's own row would cut x=2 out of the x=1..4 span); one archer with the Long Bow and one sword-bearer on the same map. The bow unit's Attack reach is exactly x=1..4 on its row and excludes x=5 and the height-4 tile; the sword unit's is x=1 only. Picking Aimed Shot on the bow unit paints x=1..5 (identity: a different set from Attack's). *Discriminators:* a render-side radius of 1 fails the bow set; a render-side table keyed on the weapon's name passes the Long Bow and fails a purpose-built `{h:2,v:1}` fixture weapon. Assertions compare against `inAbilityRange` directly (cf. AC-V24), and one asserts the bow and sword sets differ. *Mutation:* hard-code `{h:1,v:1}` in the Attack branch of `Session.reach()`; the bow set MUST go red. Tests: `src/render/session.test.ts`.

### Functional Requirements

- **FR-001**: Every weapon, on the unit and on the equipment item, MUST carry a required `range {h, v}`.
- **FR-002**: `basicAttackFrom` MUST copy the weapon's range; it MUST NOT hard-code one.
- **FR-003**: `SCHEMA_VERSION` MUST be 12, with a migration stamping `{h:1, v:1}` on every existing weapon.
- **FR-004**: The pack MUST gain exactly one new weapon, `wpn-long-bow`, equipped on `pc-briar` only.
- **FR-005**: `aim.aimed-shot` MUST be unchanged.
- **FR-006**: `src/render` MUST NOT define any reach constant; it reads `inAbilityRange`.

### Key Entities

- **Weapon**: `wp`, `formula`, `element`, `accuracy`, and now `range {h, v}`.
- **Long Bow** (`wpn-long-bow`): `range {h:4, v:3}`, `speedWp`, WP 4, element `none`, accuracy 100, `weaponEv` 0. Every number except the formula is `[UNCERTAIN]` (ADR-0049).

## Success Criteria

- **SC-001**: AC-011 … AC-016 each have a test that goes red under the mutation the AC names.
- **SC-002**: `npm run check` stays green with no balance edit. If the diversity gate (N=7 against a bar of 8) or a pacing test goes red, the build STOPS and asks the owner.
- **SC-003**: The state page is regenerated last (`npm run state`), since ADR-0049 is a counted artifact.

## Assumptions

- The content-pack and roster schema versions do not bump: records store the weapon by id, and the pack is authored in this repo. The engineer confirms this against `content.ts` before building; if a bump is needed, that is a gap to raise, not to fill.
- Crossbow, spear and gun are a later content slice with no engine change.
- Tuning the bow, or Aimed Shot's overlap with a range-4 Attack, is a later design pass.
