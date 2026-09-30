# ADR-0049 — A weapon has a range: Attack takes its reach from the weapon

- **Status:** Accepted — the owner, 2026-09-29 (six decisions, recorded below). Built 2026-09-29 on `claude/project-thread-ov8xky`; not yet merged.
- **Date:** 2026-09-29
- **Deciders:** the owner (`intent/weapon-range.md`).
- **Amends:** `docs/01` §5a, §7, §9a (Counter's reach) and Acceptance Criteria; `docs/05` §3
  (the "no weapon range" sentence); closes `docs/defects.md` §1's last live row on build.
- **Acceptance Criteria:** AC-011 … AC-016, authored into `docs/01` in this spec slice.
  Projected into `specs/005-weapon-range/spec.md`.
- **Status of the code:** built and tested (1088 tests green), not yet merged.

## Context

Reach belongs to the weapon in FFT. Here it does not. `basicAttackFrom` (`src/sim/state.ts`)
hard-codes `range {h:1,v:1}` for every unit, and `WeaponSchema` carries no range. Briar, the
archer, walks up and swings a bow. Her only long shot is the skill `aim.aimed-shot` (range 5).

Three other places read that one hard-coded number without knowing it. The reaction gate
(`src/sim/reaction.ts`) uses the bearer's basic-attack range as Counter's reach. The AI's
`exposureOf` (`src/sim/ai.ts`) adds it to `move`. The viewer paints Attack's reach from the
sim's `inAbilityRange` (ADR-0048, AC-V24). Change the number in one place and all three follow.

## Options considered

1. **Give only the bow a range field.** Smaller diff. Rejected: the second ranged weapon
   would need a second special case, and "a sword has range 1" would live nowhere in data.
2. **A range field on every weapon; Attack derives from it.** One rule, one place. **Chosen.**
3. **Wait for the full equipment system.** Rejected: the inline weapon already exists on the
   item and on the unit (ADR-0021). The field costs one schema bump now and none later.

## Decision

### 1. Range is a field on every weapon `[ENHANCEMENT]`

`range {h, v}` joins `WeaponSchema` (the unit's inline weapon) and the item's inline
`weapon` (`src/sim/equipment.ts`). Same notation as an ability's range (`docs/01` §7): `h`
is Chebyshev horizontal reach, `v` is height tolerance. It is **required**, not defaulted:
a defaulted field is how a weapon silently stays melee. `basicAttackFrom` copies
`weapon.range` and keeps `speed: null`, `aoe: null`, single target.

### 2. One bow, on Briar `[ENHANCEMENT]`

This slice adds one item, `wpn-long-bow` ("Long Bow"), and equips it on `pc-briar` in
`data/campaign/camp-the-first-march.json`. No crossbow, spear or gun. Those are content for
a later slice and need no engine change.

| Field | Value | Confidence |
|---|---|---|
| `range` | `{h:4, v:3}` | `[UNCERTAIN]` |
| `formula` | `speedWp` (`docs/01` §5a: Bow is a speed weapon) | `[VERIFIED]` |
| `wp` | 4 | `[UNCERTAIN]` |
| `element` / `accuracy` / `weaponEv` | `none` / 100 / 0 | `[UNCERTAIN]` |

`fft-fidelity` could not open AeroStar or FFHacktics; it saw snippets only. Every bow number
except the formula is the coordinator's default and is tagged so. Reach 4 keeps Aimed
Shot (5) longer, so the skill still earns its slot. Nothing tests the bow's numbers against
FFT; the tests pin them against this ADR.

### 3. Aimed Shot is untouched `[BASELINE]`

Same range (`{h:5, v:3}`), power and cost. The overlap with a range-4 Attack is a note for a
later design pass, not this slice (owner, 2026-09-29).

### 4. The field lands now, with a schema bump `[BASELINE]`

`SCHEMA_VERSION` 11 → 12. `MIGRATIONS[11]` stamps `range {h:1,v:1}` on every unit's
`weapon`. It reads no registry (the rule every migration here follows). A v11 unit's
`basic.attack` already carries `{h:1,v:1}`, so a migrated save plays byte-identically.
The shipped pack's eight existing weapons are authored with an explicit `{h:1,v:1}`.

### 5. Any tile from 1 to the reach `[ENHANCEMENT]`

No minimum range and no dead zone. `inAbilityRange` is unchanged: it already tests
`Chebyshev ≤ h` and `height delta ≤ v`, with no lower bound.

### 6. No height bonus, no line of sight, no arc `[DEFERRED]`

The reach is the flat `{h, v}` box and nothing else. FFT bows are commonly reported to gain
range from height `[UNCERTAIN]`; this slice models none of it. A target behind a wall is
attackable if it is in the box, as it is for every ability today.

### 7. What follows without new code

| Consumer | Effect |
|---|---|
| Counter / Hamedo (`docs/01` §9a) | Reach is the bearer's own basic-attack range, so it becomes the weapon's range. A bow-bearer answers a blow from 4 tiles away. The `[UNCERTAIN]` note on Counter's real FFT reach stays. |
| AI (`exposureOf`, `ai.ts`) | Threat reach = `move` + weapon `h`. An AI archer attacks from range without moving adjacent. |
| Viewer | `Session.reach()` for Attack comes from `inAbilityRange` on the derived range. No range constant in `src/render`. |
| Support `abilityRange` | Still applies to skills only, never to `basic.attack` (`docs/05` §3). Widening a weapon's reach is not in this slice. |

## Consequences

- **Balance is not tuned.** Briar's Attack changes from the placeholder swing to `speedWp`
  WP 4 at reach 4, and the enemy retune (ADR-0045) and the diversity gate (N=7 against a bar
  of 8) were measured with a melee-only Attack. If the gate or any pacing test goes red
  during build, the build stops and asks the owner. It does not retune. Whether the gate
  moves is unmeasured; this ADR predicts nothing.
- A hand-built fixture that omits `range` on a weapon now fails validation. Every
  `weapon: {…}` literal in tests and helpers (`defaultUnit`, `DEFAULT_BUILD_WEAPON`) gains
  the field.
- `docs/05` §3's claim "equipment is still deferred, so there is no weapon range" is retired
  in the same slice.

## Amendment 2026-09-29 (built)

- The party owns the Long Bow through battle 1's grants (`camp-b1-the-toll-road`), not the
  starting inventory (owner, 2026-09-29). The prep dropdown lists inventory only, so a bow
  granted nowhere could never be re-equipped after a swap.
- `CONTENT_SCHEMA_VERSION` stays 2 by design. The required `weapon.range` did not bump it
  because the only pack with equipment is re-authored in the same change (`src/sim/content.ts`
  docstring).
- The AC fixtures changed layout, not rules: diagonal and (3,3) foes sit on 2-D grids, and
  the height-4 tile sits off the bow's row (`docs/01` AC-011, AC-012, AC-016). The reaction gate is
  `tryReaction` in `src/sim/resolve.ts` (AC-015).
