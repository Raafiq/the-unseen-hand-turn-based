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
- **Steal line** (`steal.gil/armor/helmet/weapon`): the item/gil transfer — `gil` needs the
  post-battle economy (`docs/07`), the other three the equipment modifier layer
  (`docs/05` §4). NOTE the `steal` SKILLSET is live now (see `steal.heart` below) while
  these four are not, which is why the deferral manifest is per-ABILITY
  (`content.ts` `DEFERRED_ACTIONS`, read by the prep panel) and not per-skillset.
- **`steal.heart` is LIVE — it is not on this list any more** (2026-08-16, ADR-0018). A
  landed hit applies Charm, and a charmed unit fights for its inflicter until the status
  decays: it acts for that team, is targeted as one of its units, and counts for it when
  victory is checked. `bld-cutpurse` is built on it. (History, because the line was wrong
  twice: the pack claimed charm "*is* wired" while **nothing applied `inflicts` at all**;
  the inflict path then landed and the status became a real but **inert marker**, since
  nothing read allegiance from it. Only the third step made it a mechanic.)
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

**`bld-cutpurse` (2026-08-16)** is the roster's first CONTROL build: its signature
`steal.heart` deals no damage at all, so it wins by charming rather than by killing. Its
raw Speed is the roster's uniform 8 deliberately — a *faster* thief outruns its escorts,
arrives alone and dies, and a *slower* one clears every map with no losing matchup, which
is the convergence failure `docs/02` B5 exists to prevent.

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

## Physical-skill `power`: the pricing rule (2026-08-16)

Until this slice the resolver routed **every** `formula: "physical"` action to the plain
weapon swing, so an authored physical skill's `power` was projected, validated and then
discarded — six abilities were untunable and all dealt identical damage.
`power` is now live for authored skills; only the weapon-derived `basic.attack` still
resolves off `weapon` (`isBasicAttack`, `src/sim/state.ts`).

The six were re-priced against two rules that pull in opposite directions, and the values
sit where both hold:

- **Anti-convergence** (`docs/02` B5): reach must cost something, or a ranged skill is the
  melee swing plus free range.
- **Anti-masking** (AC-P6 corollary, `ttk.test.ts`): a signature must **strictly**
  out-damage its owner's basic attack, or the greedy probe never picks it and the build
  fights as the wrong job.

So reach is priced in the **margin above** the basic attack (whose power is `weapon.wp`,
8 on the placeholder weapon), never below it:

> `power = 9` at maximum reach (h5), **+1** per tile of reach surrendered, **+** the AP
> tier (0 / 1 / 2 for 60 / 120 / 240), **+1** for a vertically-restricted line (`v: 0`),
> **−2** for an area.

| ability | h / v | AP | area | power | derivation |
|---|---|---|---|---|---|
| `punch-art.wave-fist` | 3 / 1 | 60 | – | 11 | 9 +2 |
| `punch-art.earth-slash` | 4 / 0 | 120 | – | 12 | 9 +1 +1 (line) +1 |
| `aim.aimed-shot` | 5 / 3 | 60 | – | 9 | 9 |
| `aim.piercing-shot` | 5 / 3 | 120 | – | 10 | 9 +1 |
| `aim.head-shot` | 4 / 3 | 120 | – | 11 | 9 +1 +1 |
| `aim.leg-shot` | 5 / 3 | 120 | – | 10 | 9 +1 |
| `aim.volley` | 4 / 2 | 120 | 1×0 | 9 | 9 +1 −2 +1 |

**The status riders are NOT priced in yet.** `head-shot` (Stop) and `leg-shot` (Slow)
carry `inflicts`, but no resolver applies it, so discounting them for an effect that does
not exist would be pricing a phantom. Re-price both **down** in the slice that lands the
on-hit inflict path.

Measured, not asserted: the diversity gate holds `N = 6`, `pass = true` and no new
build in `winsAllInBand` across power −1 … +3 on every one of these values — a plateau, so
the numbers sit on a mechanism rather than on a knife-edge. `aim.volley` is **unmeasured**:
no shipped build learns it.
