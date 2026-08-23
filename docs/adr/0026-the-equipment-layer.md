# ADR-0026 — The equipment layer: an id on the record, a horizontal catalog, an authored drip

- **Status:** Accepted — **the catalog's numbers are MVP-PROVISIONAL** (the standing note from ADR-0025). What is not provisional: gear is horizontal, and gear arrives on an authored schedule.
- **Date:** 2026-08-22
- **Supersedes / amends:** implements **ADR-0021** decisions 2 and 3, which scoped this and left it unbuilt. Builds on ADR-0017 (support), ADR-0019 (reaction), ADR-0020 (movement).
- **Owner docs:** `docs/11` §3 M0 item 5 + AC-M7, `docs/02` (the chassis), `docs/07` §2 (the grind budget)

## Context

M0's last item. `build.ts` armed every unit from a module constant, `DEFAULT_BUILD_WEAPON`, and nothing on a `UnitRecord` could change it — so all 15 reference builds and all four campaign characters fought the whole game with the same weapon. ADR-0021 had already done the hard thinking (gear is horizontal; power must be authored rather than farmed) and left the wiring.

## Decision

**1. The record stores an ID, not a weapon.**

`UnitRecord.weapon: string | null` at `rosterSchemaVersion` 3, resolved against the content registry at build time. A record that copied the weapon's stats would freeze them at the moment of equipping, so re-tuning a weapon in the pack would silently not reach any existing save. `learned` and `loadout` already work this way.

`null` means the placeholder weapon, and the `2 → 3` migration writes exactly that — **a migrated save fights identically to how it did before gear existed.** Handing an old record a real weapon would be a silent re-balance of every unit in every save, wearing a migration's clothes.

**2. The catalog is horizontal, and that is asserted rather than asserted-in-prose.**

Eight weapons. They differ in formula, element, accuracy, evasion and Brave/Faith. Measured on the reference body, **no weapon out-damages the placeholder** — the spread is 54–72 against a 72 baseline, so every one of them is a trade.

`wp` still exists on a horizontal item and that needs saying, because it looks like a tier: the five weapon formulas scale differently, so equal damage across them requires *different* `wp` values. It is a per-formula calibration constant. Oathblade shipped at `wp: 12` in the first draft, which measured 84 damage **and** +10 Brave — a strict upgrade, not a trade — and was repriced to 10 before landing.

Two tests carry this, and a third exists because the first two are not sufficient:

- No weapon beats the baseline. (Mutation-verified: restore `wp: 12` and it goes red.)
- **Which weapon is best depends on the body.** Without this, a catalog that was a ladder with its top rung removed would pass — every unit would want the same weapon and the choice would be fake. The Warhammer (`wpWp`, stat-independent) is the best swing a low-PA caster has and among the worst a knight has; that inversion is what "horizontal" means operationally.
- No weapon is indistinguishable from the placeholder on every axis, so none is an option that costs a slot and changes nothing (`docs/02` B5).

**3. Gear arrives on an authored drip, and the inventory is a SET.**

`CampaignBattle.grants` names ids; `CampaignSave.inventory` holds what the party owns (`campaignSchemaVersion` 2). `grantEquipment` never appends a duplicate.

**Set semantics ARE the anti-grind invariant** (ADR-0021 decision 2), not tidiness. Without them, lose-and-retry would pay a battle's grant again, and gear on a farmable drip is exactly as ruinous as farmable levels. Asserted as an experiment — grant twice, assert nothing changed — and mutation-verified by making the filter append blindly. A full playthrough is walked end to end and its inventory compared as a set against what the def authors, because a per-call check cannot see two different battles authoring the same id.

Battle one's grant is applied in `startCampaign`, not on advancing, or the first fight — the one a new player meets — would be the single battle with no gear in it.

**4. The panel offers what the party OWNS, and the model enforces it.**

`setWeapon` refuses an item not in the inventory. A drip enforced solely by which options a dropdown happens to render is not enforced. The weapon row is hidden entirely when the inventory holds no weapon (absent-not-zero): before the first grant there is no such thing as a weapon choice, and an empty dropdown reads like a bug.

**5. The reference builds are NOT re-armed, and the diversity gate therefore does not move.**

`data/builds/*` migrate to `weapon: null` and keep fighting with the placeholder. Stated plainly because the alternative reading is available: **gear is a diversity axis the gate does not yet use.** That is a deliberate M0 boundary — equipment is a campaign feature this slice, and re-arming 15 benchmark builds is a balance pass, not a wiring change. It is the obvious next question for M1, and it is the one place where "the gate stayed at 7" is a statement about coverage rather than about quality.

## Consequences

- `rosterSchemaVersion` 2 → 3 and `campaignSchemaVersion` 1 → 2, each with a migration. The battle `SCHEMA_VERSION` is untouched, so **the frozen golden did not move** — verified, not assumed: it is a battle-codec artifact and this slice changes the roster and campaign codecs.
- 16 authored data files gained `"weapon": null`. That fan-out is the migration-per-bump pattern working as intended (`src/sim/CLAUDE.md`), not a reason to reach for a schema default.
- `EquipSlotSchema` names `shield` and `accessory` but the loader **rejects** content for them, so an unfillable slot cannot ship looking filled. Adding them later is authoring plus one line in `LIVE_EQUIP_SLOTS`.
- Brave/Faith shifts are clamped in `build.ts` rather than at the pipeline's final clamp, because those two stats never pass through the `docs/05` §4 derivation and so have no later clamp to catch them.
- **Still not modelled:** shields, accessories, armour, gil, shops, weapon range (a spear's reach is still the ability's), and status immunity or elemental resistance on gear — `docs/03` asks for the last two and `EquipmentSchema` deliberately does not carry them yet, because nothing in the resolver reads a per-unit resistance.
