# 05 — Simulation & State Model (Engineering)

`[ENGINEERING]` The authoritative bridge from design to code. `docs/01` says *what* the rules are; this says *how the engine computes them* with no ambiguity. The implementability gate (`docs/08` verification) is: **an engineer should be able to write the scheduler and damage pipeline from this doc alone, without inventing tie-break or interrupt rules.**

Engine-agnostic (no language/framework assumed). Pseudocode is illustrative.

---

## 1. The core loop — one timeline for units *and* charges

The scheduler advances a discrete tick clock. **Charged abilities are first-class actors on the same timeline as units** — never a separate system.

```
Actor = Unit | ChargedAction        // both have: ct:int, ctRate():int, priority key
tick():
  loop:
    ready = actors.filter(a => a.ct >= 100)
    if ready not empty: break
    for a in actors: a.ct += a.ctRate()   // Unit: Speed (×Haste/Slow); ChargedAction: ability.speed
  active = ready.sortBy(TIEBREAK).first
  resolveActor(active)
```

### 1a. Tie-break order (PINNED — fidelity-critical)
When multiple actors reach ct ≥ 100 on the same tick, resolve in this exact order:
1. **Higher `ct`** first.
2. If tied: **ChargedAction before Unit** (a spell that matured this tick lands before the caster's next move).
3. If still tied: **lower actor id**, compared as a **locale-independent lexicographic** string compare (never `localeCompare`). For units this is the `unitId` (ids assigned at deploy in team-then-slot order, so ascending id = deploy order); **two charged actions tied at the same `ct` use the same id rule.** Keying on the id — not array/queue position — means a mis-ordered `units` array can never change the outcome. (ADR-0008.)

*This order is a spec commitment, not an implementation detail — changing it changes battle outcomes. Encode it as data and cover it with a test (AC below).*

### 1b. ctRate and status
- Unit `ctRate` = `floor(Speed × hasteFactor)` where hasteFactor = 1.5 (Haste), 0.5 (Slow), 1.0 (none); Stop → 0.
- ChargedAction `ctRate` = the ability's own `speed` (independent of caster Speed — this is why Short Charge matters; Short Charge raises the *starting* charge or the ability speed, per ability data).

### 1c. End-of-turn CT settlement (units)
```
onUnitTurnEnd(u, didMove, didAct):
  cost = didMove && didAct ? 100 : (didMove || didAct ? 80 : 60)
  u.ct -= cost          // remainder carries; no separate cap
```

---

## 2. Action resolution pipeline (ordered — every step floors integers)

A declared action runs through fixed stages. **Charged actions split declare (now) from resolve (later tick).**

```
DECLARE:  validate targetTile in range/LoS; if charged → enqueue ChargedAction(targetTile, speed); end turn phase
RESOLVE:  (immediate action now, or charged action on its matured tick)
  1. INTERRUPT CHECK (charged only): caster KO/Stop/Sleep/Don't-Act? → cancel, no effect
  2. TARGET RESOLUTION: gather units currently on target tile(s); charged spells that find an empty tile → whiff
  3. per target, per hit (Two Swords = 2 hits):
     a. HIT ROLL:  base = abilityAcc; apply facing→evasion (independent multiplicative rolls);
                   apply Faith (magic) and Zodiac to hit%; roll vs seeded RNG (§3)
     b. REACTION PRE-CHECK: a `preemptive` reaction (Hamedo) is checked BEFORE damage —
                   it strikes first and CANCELS the blow (damage, KO and status alike);
                   Concentrate bypasses evasion
     c. MAGNITUDE: weapon/magic formula (docs/01 §5), floor each bracket;
                   × elemental modifier (weak/half/absorb/null) × Zodiac
     d. APPLY: clamp HP≥0; on lethal → set KO + crystalTimer=3; apply status w/ CT-based duration
                   (unconditional on a landed hit — NO separate status roll yet, so the §3
                   roll order is unchanged; never onto a corpse; a re-hit REFRESHES to the
                   longer lifetime rather than stacking; a `controlsTarget` status is
                   stamped with the inflicter's team — §6a)
     e. REACTION POST: a `counter` reaction answers a blow that REMOVED HP from a
                   defender still standing, striking back with the reactor's own basic
                   attack. Resolved INLINE, never routed back through the attack path, so
                   a counter can never wake a counter. Each fired reaction reports itself
                   and is accounted to the REACTOR (§2a)
```

### 2a. Who gets the credit `[ENHANCEMENT]`

Contribution is measured by diffing HP across a resolution and crediting the acting unit.
A counter breaks that mapping in a way that is easy to miss: its damage lands on the
**attacker**, which is the diff's own source, and a unit is never credited for its own HP
loss. A live counter would therefore change the fight and still score **zero** everywhere
the project measures — the diversity gate's band, its signature-landed count, all of it.

So a fired reaction **emits its own accounting event**, credited to the reactor under the
reaction ability's id. Any future effect that moves HP on behalf of someone other than the
acting unit SHALL do the same rather than ride the diff.

**Truncation points** (must floor, in this order): PA/Brave scaling → × weapon power → elemental → Zodiac → Protect/Shell. Getting the *order* wrong drifts damage even if every step floors.

---

## 3. Determinism, RNG & rewind — a **P0 architectural invariant**

> **This is not a P3 feature. It is a foundational constraint decided before P0 code.** Rewind + RNG + a shared charge timeline is a triple footgun; retrofitting determinism after P0–P2 is a rewrite.

### 3a. Seeded PRNG, single stream
- One **seeded PRNG** (e.g. a small counter-based / splitmix-style generator) per battle, seeded from `battleSeed`.
- **All nondeterminism flows through it** — hit rolls, status rolls, crits, AI choices, loot. No `Math.random`, no wall-clock, no unseeded platform RNG anywhere in the sim.
- **Declared roll-consumption order** per action (hit → reaction → crit → status → …), so the Nth roll is always the same given the same state. Document the order alongside the pipeline (§2). Per (attacker, defender) blow the live order is: **1.** hit roll — always drawn; **2.** reaction trigger (the defender's Brave%) — drawn **only** when its equipped reaction's condition holds for this blow, and a unit equips at most one; **3.** the reaction's own swing hit roll — only when 2 fired. A unit with no reaction consumes exactly the draws it did before reactions existed, which is why the frozen golden moved by representation alone.

### 3b. Rewind substrate — decision
Two viable substrates; **we choose seeded command-replay as primary, with periodic snapshots as an optimization:**
- **Command log + replay (primary):** store `(seed, ordered list of player commands)`. Any state = replay from start. Tiny to store, perfectly reproducible, and **doubles as the share/challenge format** (`docs/04` §8). Requires the sim to be pure/deterministic (which §3a guarantees).
- **Snapshot-per-turn (optimization):** serialize authoritative state every N turns so rewind doesn't replay from tick 0 on long battles. Snapshots are derived, not the source of truth.
- Rewind **UI** can ship at P3; the substrate ships at **P0**.

### 3c. Authoritative serializable state
The **BattleState** is the single serializable source of truth: `{ seed, tick, rngCounter, grid, units[], chargeQueue[], turnLog[] }`. If it serializes for rewind, it serializes for **saves** (§5) — same mechanism.

---

## 4. Stat-derivation pipeline (ordered)

Subtle bugs live here, and `docs/02`'s enhancements (mastery traits, sockets, set bonuses) all pile on. Derive displayed stats in this fixed order:

```
raw (hidden PA/MA/Speed/HP/MP/Brave/Faith)
  → × current Job growth-multipliers
  → + equipment modifiers (weapon/armor/accessory)
  → + socket/set-bonus modifiers        [OPTIONAL modules]
  → + mastery-trait modifiers
  → + equipped-SUPPORT modifiers        [LIVE — ADR-0017]  (pa / ma / maxHp)
  → + equipped-MOVEMENT modifiers       [LIVE — ADR-0020]  (move)
  → + active status modifiers (Protect/Shell/Haste as flags, Faith/Innocent as overrides)
  → clamp (Brave/Faith 0–100; HP/MP ≥ 0; Speed ≥ 1)
  = derived stat used by the pipeline
```
Store **raw** and **derived** separately; never mutate raw from equipment/status.

The SUPPORT and MOVEMENT layers sit at the same position and touch **disjoint** fields, so
there is no ordering question between them; each floors once, and the final clamp follows
both. (`docs/02` §2's fifth slot could not ship until the AI weighed a tile's exposure —
see `docs/06` AC-E3(d) and ADR-0020 — because until then extra `move` only bought a
fragile unit a deeper grave.)

**The support layer has two halves, and only one of them is in the ladder above** (ADR-0017,
`src/sim/support.ts`). Its **stat** mods (`pa`/`ma`/`maxHp`) fold in at the marked position —
after mastery, before the clamp, so a support's multiplier scales the *post*-mastery stat.
Its **ability** mods (`chargeSpeed`, `abilityRange`) are not stats at all: they fold onto each
projected `BattleAbility` at build time, so they travel inside the serialized battle and a
replay never re-reads the content registry (the self-containment rule, ADR-0010/ADR-0011).
Ability mods apply to **skills only**, never to the weapon-derived `basic.attack` — equipment
is still deferred, so there is no weapon range for a range-up support to widen.

**A support may not touch a unit's Speed** — the same structural ban traits carry (AC-P5,
ADR-0012), enforced by the schema shape. `chargeSpeed` is a *charged action's* own accrual
rate (`docs/01` §3), which is a different quantity and is why Short Charge exists.

---

## 5. Save format & data versioning

- **Save = serialized campaign state** (roster, learned abilities, masteries, inventory, progress) + optionally in-battle `BattleState` for mid-battle save.
- **Every save and every content data file carries a `schemaVersion`.** Deep, moddable job data (§6) *will* change; without versioning, saves break silently.
- Provide **migration hooks** (version N→N+1) from day one. A save older than the oldest supported migration fails loudly with a clear message, never corrupts.

---

## 6. Data schemas (illustrative — firm up at P0 once the spine is validated)

Content is **data-driven** so battles, jobs, and abilities are authored, not coded (and moddable — a tech-stack selection criterion, `docs/09`). Examples (shape, not final):

```jsonc
// Ability
{ "id":"black.fire", "type":"action|reaction|support|movement",
  "skillset":"black-magic", "apCost":180, "mp":6, "speed":25,     // speed→charge; omit for instant
  "range":{"h":4,"v":2}, "aoe":{"h":1,"v":2}, "element":"fire",
  "power":18, "formula":"magic", "hitBase":"MA+?", "inflicts":[], "tags":["ranged"] }

// Job (hybrids add `requires`)
{ "id":"spellblade", "requires":["knight","black-mage"],           // omit for base jobs
  "primarySkillset":"spell-blade", "genderLock":null,
  "growth":{"pa":1.1,"ma":1.0,"speed":0.9,"hp":1.05,"mp":0.8},
  "tree":[ {"node":"n1","ability":"spell-blade.bolt","apCost":120,"requires":[]} , ... ],
  "masteryBonus":{"trait":"spell-parry"} }

// StatusEffect  (behaviour = code, tuning + discriminant FLAGS = data, ADR-0011)
{ "id":"haste", "kind":"buff", "ctFactor":1.5, "durationCT":320, "dispellable":true }
{ "id":"status.charm", "kind":"debuff", "ctFactor":1, "durationCT":32, "dispellable":true,
  "controlsTarget":true }                                  // §6a — allegiance

// Battle / Map definition (the narrative-repo contract, docs/08)
{ "id":"story.ch1.gate", "map":"gate", "deployZones":[...], "spawns":[...],
  "victory":{"type":"defeatBoss","target":"u.boss"}, "defeat":{"type":"allDown"},
  "events":[...], "loot":[...], "seed":123456 }

// Unit save record
{ "id":"u.generic.07", "name":"...", "level":18, "currentJob":"ninja",
  "raw":{"pa":..,"ma":..,"speed":..}, "brave":68, "faith":42,
  "learned":["...","..."], "mastered":["thief","archer"],
  "loadout":{"secondary":"steal","reaction":"...","support":"two-swords","movement":"...","traits":["...","..."]},
  "equipment":{"weapon":"...","armor":"...","accessory":"...","sockets":["..."]} }
```

### 6a. Allegiance — who a unit fights for (Charm)

`docs/01` §8 lists Charm as a hard disable: *the enemy controls it*. That is one flag in the
catalog (`controlsTarget`) plus **one seam in code** — `effectiveTeamOf(unit)` — and nothing
else may ask the question. At inflict time the resolver stamps the inflicter's team onto the
status (`controlledByTeamId`); the catalog cannot know it, and a template carries `null`.

Read the seam: **target selection** (the AI and every friend/foe filter, including area
effects), **damage attribution** (a charmed unit hitting its old comrades is damage, not
friendly fire), **movement traversal** (its rule is "enemies block, allies pass"), and the
**victory/defeat conditions**.

Do NOT read it: the **scheduler** (allegiance is not a CT concept) and per-team **reporting**
(a body still belongs to the roster that deployed it).

**A charmed unit counts for the team it fights for when victory is evaluated** — charming the
last defender ends the battle exactly as felling it would, and symmetrically, if your last
unit is charmed you lose. This is a design commitment, not an implementation detail: counting
the body for its nominal team makes a battle nobody can end (no AI attacks an ally, and the
charmer re-applies control the moment it lapses — measured as a 580-tick timeout with 18
charms landed). See **ADR-0018**. `[UNCERTAIN vs FFT]` — the source game's rule for an
all-charmed enemy team is unverified.

---

## Acceptance Criteria (SDD-ready)

- **AC-S1 (determinism):** Given identical `(seed, command log)`, the engine SHALL reproduce byte-identical `BattleState` at every tick. *Test:* replay equality harness.
- **AC-S2 (single RNG stream):** The sim SHALL consume randomness only from the seeded PRNG in the declared order; a lint/test SHALL fail on any unseeded random call in sim code.
- **AC-S3 (tie-break):** Simultaneous ct≥100 actors SHALL resolve by (ct desc, charge-before-unit, unitId asc). *Test:* crafted tie scenario yields the pinned order.
- **AC-S4 (charge interrupt):** A charged action whose caster is KO/Stop/Sleep/Don't-Act at its resolve tick SHALL produce no effect; one whose target tile is vacated SHALL whiff.
- **AC-S5 (formula fidelity):** The damage pipeline SHALL match every golden test-vector (`docs/01` §12) exactly, including floor order.
- **AC-S6 (serialization round-trip):** `deserialize(serialize(state)) == state` for BattleState and campaign save; a save with an unsupported `schemaVersion` SHALL fail with a clear error, never load partially.
- **AC-S7 (rewind):** Rewinding K turns then replaying the same commands SHALL yield the same result as never having rewound.
- **AC-S9 (the reaction draw is conditional):** A reaction trigger roll SHALL be drawn **iff** the defender's equipped reaction can actually trigger on that blow, and the reaction's own swing roll **iff** the trigger passed. A unit with no equipped reaction — or one whose condition fails — SHALL leave `rngCounter` exactly where the pre-reaction engine left it. *Test:* asserted draw counts of 1 (no reaction), 1 (out of reach), 2 (rolled, failed) and 3 (fired) on the same fixture; and the frozen golden regenerated by a mechanical field-add, which only reproduces the engine's output if no roll moved.
- **AC-S8 (allegiance):** A unit under a `controlsTarget` status SHALL act for, be targeted as, and be counted for the **inflicting** team — in AI target selection, area friend/foe filters, damage attribution, traversal and the victory/defeat check — and SHALL revert when the status expires. Turn order SHALL be unaffected. *Test:* the same battle with and without the stamped status, asserted on each reader (`src/sim/charm.test.ts`).
