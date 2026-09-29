# Intent: a weapon has a range
Author: the owner. Date: 2026-09-24; reframed 2026-09-29 from "Attack with a bow shoots". Status: accepted (owner, 2026-09-24) — the next slice now that the skill picker is merged (PR #75).

## Problem
The Attack button reaches one tile for every unit, whatever the weapon.
`basicAttackFrom` (`src/sim/state.ts`) hard-codes `range {h:1,v:1}`; weapons carry no range.
So Briar, the archer, walks up and swings a bow. Her long shot exists only as a skill (`aim.aimed-shot`, range 5).
In FFT (Final Fantasy Tactics), reach belongs to the weapon: a bow shoots, a spear reaches two tiles, a sword hits the next one.
This is `docs/defects.md` §1, third row.

## Proposed outcome
Range is a property of the weapon, not of the bow. Every weapon carries a range.
A unit's basic Attack takes its reach from the weapon it holds.
A sword keeps range 1; a bow shoots from range; any future weapon (spear, crossbow, gun) sets its own.
Range in the sim's own notation, `{h, v}` (horizontal tiles, vertical tolerance), like every ability.

## Affected users and systems
- The player: archers attack at range without spending a skill slot on it. Any unit holding a ranged weapon does.
- `src/sim/state.ts` (`basicAttackFrom`, `WeaponSchema`), `src/sim/equipment.ts` (the item's inline weapon), and a save migration if the schema grows.
- `src/sim/reaction.ts`: a reaction's reach IS the bearer's basic-attack range, so a ranged weapon changes when Counter fires.
- The weapon data in `data/base-pack.json` (eight weapons today, no bow), `docs/05` §4 (equipment is deferred there), `docs/01` for the FFT weapon ranges.
- Balance: the enemy retune (ADR-0045) and the diversity gate were tuned with a melee-only Attack.

## Constraints
- Engine change: determinism, golden tests and a schema version bump apply (`src/sim/CLAUDE.md`).
- FFT weapon ranges need `fft-fidelity` sources, tagged by confidence.
- No balance tuning (owner, 2026-09-24). If the diversity gate or a pacing test goes red, stop and ask the owner; do not retune.
- The viewer paints Attack's reach from the sim's own range rule (ADR-0048); no range lives in the render layer.

## Open questions
All three answered on 2026-09-29; kept here so the spec can cite them.
- ~~Which weapons get a range above 1 in this slice?~~ **Answered (owner, 2026-09-29): bow only.** One bow item for Briar; its exact range comes from `fft-fidelity`, tagged by confidence. Crossbow, spear and gun are content for a later slice, no engine change.
- ~~Does Aimed Shot still earn its slot once the weapon itself shoots?~~ **Answered (owner, 2026-09-29): keep it as is.** No content change this slice. The overlap (skill range 5 vs a bow Attack of about 4) is a note for a later design pass, not this one.
- ~~Does the range field land on today's inline weapon now, or wait for the full equipment system?~~ **Answered (owner, 2026-09-29): now.** `range {h, v}` joins the inline weapon on the item and the unit; schema version bump; the migration gives every existing weapon `{h:1, v:1}`.
