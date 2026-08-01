# Content packs (`data/`)

External, data-driven game content (docs/05 §6, AC-R2). A pack is validated and
indexed at load by `src/sim/content.ts::loadContentPack` — the sim reads *data*,
not hard-coded jobs. No code lives here.

## `base-pack.json` — base jobs + abilities

One `ContentPack` object:

```
{ contentSchemaVersion: 2, jobs: Job[], abilities: Ability[], statuses: StatusEffect[], traits: Trait[] }
```

- **8 jobs:** `knight`, `monk`, `wizard`, `thief` (Slice 1) + `priest`, `archer`,
  `geomancer`, `summoner` (Slice 3 — the four *live-formula* jobs, so the benchmark
  AI actually exercises them; see below)
- **63 abilities** across eight primary skillsets: `battle-skill`, `punch-art`,
  `black-magic`, `steal`, plus `white-magic` (Priest), `aim` (Archer), `geomancy`
  (Geomancer), `summon` (Summoner)
- **10 statuses** — the core catalog (`status.*`)
- **8 mastery traits** — one per job; the four P2 traits use a deliberately
  *non-dominated* stat-key spread (see `content-pack.test.ts`)

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

## `builds/*.json` — reference archetype records (Slice 3)

One serialized `UnitRecord` per file (`rosterSchemaVersion: 2`; the shape
`roster.ts::deserializeRecord` reads). Each is a concrete `docs/03` archetype — a
`currentJob` + `learned` abilities + a 5-slot `loadout` — that an encounter fields
via a `ref` source. This is the seed set the (Slice-4) build-diversity matrix draws
from. **Raw statlines are held constant** across archetype builds so a benchmark
compares *job + loadout*, not raw stats. **Authoring gotcha:** the balance-probe AI
only uses live-formula actions and picks the highest-magnitude one, so a build's own
job identity is *masked* if a borrowed secondary out-damages its primary — keep the
showcased skillset's live action un-dominated (e.g. `bld-terrain-geo` runs a utility
`thief` secondary so its geomancy is what fires).

## `encounters/*.json` — benchmark suite (Slice 2–3)

One `Encounter` per file (`encounterSchemaVersion: 1`; `encounter.ts::loadEncounter`).
The suite covers the `docs/06` §2 archetypes expressible today: skirmish
(`skirmish-a`), siege/choke (`enc-the-breach`), assassinate (`enc-behead-the-warlord`),
elevation (`enc-the-high-ground`), anti-cheese (`enc-mixed-company`), attrition
(`enc-the-long-march`). **Deferred:** *defend/survive-N* (needs a `surviveTurns`
condition) and *escort/protect* + reliable heal-in-encounter (need a support-aware AI
— the greedy 1-ply probe walks squishy support units to their death).

## Illustrative vs verified numbers

- **Growth multipliers** (`job.growth`): the P1 four are **verified** vs secondary
  sources (fft-fidelity); the P2 four (priest/archer/geomancer/summoner) are
  **[UNCERTAIN]** — the byte-to-multiplier *mapping* is confirmed but the specific
  bytes were not corroborable (primary sources 403). The raw growth-C leveling
  constants (a different quantity, not in this schema) remain uncertain too.
- **Combat constants** (spell `power`, `speed`, `range`, break/steal `hitBase`) are
  **illustrative** per docs/01 §12 until pinned to a golden vector. The summon damage
  Y-values are the strongest corroborated numbers; Geomancer is authored as `magic` +
  `power` (the engine has no FFT `⌊(PA+2)/2⌋×MA` formula — a flagged deviation) and
  Archer as instant physical shots, not FFT's charged Aim (engine-forced).
