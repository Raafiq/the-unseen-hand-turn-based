# Content packs (`data/`)

External, data-driven game content (docs/05 §6, AC-R2). A pack is validated and
indexed at load by `src/sim/content.ts::loadContentPack` — the sim reads *data*,
not hard-coded jobs. No code lives here.

## `base-pack.json` — Slice 1 base jobs

One `ContentPack` object:

```
{ contentSchemaVersion: 1, jobs: Job[], abilities: Ability[], statuses: StatusEffect[] }
```

- **4 jobs:** `knight`, `monk`, `wizard`, `thief`
- **31 abilities** across four primary skillsets: `battle-skill` (Knight),
  `punch-art` (Monk), `black-magic` (Wizard), `steal` (Thief)
- **10 statuses** — the core catalog (`status.*`)

Every record satisfies the Zod `.strict()` schemas in `src/sim/{ability,job,status}.ts`
and the referential-integrity rules the loader enforces (no unknown keys, no
dangling ability/status/node refs, no duplicate ids, every `skillset` is a job's
`primarySkillset` or a baseline skillset).

## ID convention

Stable, human-readable, namespaced ids:

- **Abilities:** `<skillset>.<short-name>` — e.g. `black-magic.fire`,
  `battle-skill.armor-break`, `steal.heart`. Reaction/support/movement abilities
  reuse their owning job's primary skillset as the namespace (see friction note).
- **Statuses:** `status.<name>` — e.g. `status.haste`, `status.charm`.
- **Jobs:** the bare job name — `knight`, `monk`, `wizard`, `thief`.
- **Tree nodes:** tree-local short ids (`weapon-break`, `fire-2`), unique within a
  job only; `requires` references other node ids in the *same* tree.

## Chassis-slot coverage

The four non-primary chassis slots are each donated with a real ability so the
5-slot chassis is exercised, not just the command slot:

| Slot | Donated by |
|---|---|
| Secondary command | all four skillsets (by construction) |
| Reaction | `punch-art.counter`, `punch-art.hamedo`, `steal.gilgame-heart` |
| Support | `battle-skill.equip-heavy-armor`, `punch-art.martial-arts`, `black-magic.magic-attack-up`, `steal.secret-hunt` |
| Movement | `steal.move-plus-2` |

## `authored-but-effect-deferred` list

These are authored faithfully as data now; their special resolution is wired in a
later combat slice (tagged `effect-deferred` in the JSON). Working-in-combat-now
abilities (Black Magic damage, Monk Wave Fist / Earth Slash, Chakra/Revive heal
magnitude) are **not** on this list.

- **Stat-break line** (all `battle-skill.*-break`): the stat-reduction effect.
- **Steal line** (`steal.gil/armor/helmet/weapon`): the item/gil transfer.
- **`steal.heart`**: charm *is* wired via `inflicts: [status.charm]`; the
  item-transfer side is deferred.
- **`punch-art.chakra` / `revive`**: heal magnitude works; MP-restore (Chakra) and
  KO-raise (Revive) semantics are deferred.
- **`punch-art.purification`**: status-cleanse.
- **All passives** (`counter`, `hamedo`, `martial-arts`, `equip-heavy-armor`,
  `magic-attack-up`, `secret-hunt`, `move-plus-2`, `gilgame-heart`): trigger/passive
  behavior. Authored as slot markers with `tags`; no magnitude.

## Illustrative vs verified numbers

- **Growth multipliers** (`job.growth`) are **verified** vs secondary sources
  (fft-fidelity); the raw growth-C leveling constants (a different quantity, not in
  this schema) remain uncertain — primary sources 403 in this environment.
- **Combat constants** (spell `power`, `speed`, `range`, break/steal `hitBase`) are
  **illustrative** per docs/01 §12 until pinned to a golden vector. Charge speeds
  (Fire ~25, tier-2 ~33) follow the docs/01 §3 illustrative model.
