# Intent: Attack with a bow shoots
Author: the owner. Date: 2026-09-24. Status: accepted (owner, 2026-09-24) — the slice right after the skill picker.

## Problem
The Attack button reaches one tile for every unit, whatever the weapon.
`basicAttackFrom` (`src/sim/state.ts`) hard-codes `range {h:1,v:1}`; weapons carry no range.
So Briar, the archer, walks up and swings a bow. Her long shot exists only as a skill (`aim.aimed-shot`, range 5).
In FFT (Final Fantasy Tactics), Attack with a bow shoots at range. This is `docs/defects.md` §1, third row.

## Proposed outcome
A unit's basic Attack takes its reach from the weapon it holds.
A bow (and any other ranged weapon) shoots from range; a sword still hits the next tile.

## Affected users and systems
- The player: archers attack at range without spending a skill slot on it.
- `src/sim/state.ts` (`basicAttackFrom`), the `weapon` schema, and a save migration if the schema grows.
- The weapon data on the authored drip, `docs/05` §4 (equipment is deferred there), `docs/01` for the FFT weapon ranges.
- Balance: the enemy retune (ADR-0045) and the diversity gate were tuned with a melee-only Attack.

## Constraints
- Engine change: determinism, golden tests and a schema version bump apply (`src/sim/CLAUDE.md`).
- FFT weapon ranges need `fft-fidelity` sources, tagged by confidence.
- No balance tuning (owner, 2026-09-24). If the diversity gate or a pacing test goes red, stop and ask the owner; do not retune.

## Open questions
- Which weapon types shoot, and how far?
- Does Aimed Shot still earn its slot once a bow's Attack shoots?
- Does it wait for the full equipment system, or land as a range field on today's inline weapon?
