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
     b. REACTION PRE-CHECK: Brave-based reactions (Blade Grasp) checked BEFORE damage; Concentrate bypasses evasion
     c. MAGNITUDE: weapon/magic formula (docs/01 §5), floor each bracket;
                   × elemental modifier (weak/half/absorb/null) × Zodiac
     d. APPLY: clamp HP≥0; on lethal → set KO + crystalTimer=3; apply status w/ CT-based duration
     e. REACTION POST: on-hit/on-damage reactions (Counter, Auto-Potion) enqueue their own actions
```

**Truncation points** (must floor, in this order): PA/Brave scaling → × weapon power → elemental → Zodiac → Protect/Shell. Getting the *order* wrong drifts damage even if every step floors.

---

## 3. Determinism, RNG & rewind — a **P0 architectural invariant**

> **This is not a P3 feature. It is a foundational constraint decided before P0 code.** Rewind + RNG + a shared charge timeline is a triple footgun; retrofitting determinism after P0–P2 is a rewrite.

### 3a. Seeded PRNG, single stream
- One **seeded PRNG** (e.g. a small counter-based / splitmix-style generator) per battle, seeded from `battleSeed`.
- **All nondeterminism flows through it** — hit rolls, status rolls, crits, AI choices, loot. No `Math.random`, no wall-clock, no unseeded platform RNG anywhere in the sim.
- **Declared roll-consumption order** per action (hit → reaction → crit → status → …), so the Nth roll is always the same given the same state. Document the order alongside the pipeline (§2).

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
  → + equipped-SUPPORT modifiers        [LIVE — ADR-0017]
  → + active status modifiers (Protect/Shell/Haste as flags, Faith/Innocent as overrides)
  → clamp (Brave/Faith 0–100; HP/MP ≥ 0; Speed ≥ 1)
  = derived stat used by the pipeline
```
Store **raw** and **derived** separately; never mutate raw from equipment/status.

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

// StatusEffect
{ "id":"haste", "kind":"buff", "ctFactor":1.5, "durationCT":320, "dispellable":true }

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

---

## Acceptance Criteria (SDD-ready)

- **AC-S1 (determinism):** Given identical `(seed, command log)`, the engine SHALL reproduce byte-identical `BattleState` at every tick. *Test:* replay equality harness.
- **AC-S2 (single RNG stream):** The sim SHALL consume randomness only from the seeded PRNG in the declared order; a lint/test SHALL fail on any unseeded random call in sim code.
- **AC-S3 (tie-break):** Simultaneous ct≥100 actors SHALL resolve by (ct desc, charge-before-unit, unitId asc). *Test:* crafted tie scenario yields the pinned order.
- **AC-S4 (charge interrupt):** A charged action whose caster is KO/Stop/Sleep/Don't-Act at its resolve tick SHALL produce no effect; one whose target tile is vacated SHALL whiff.
- **AC-S5 (formula fidelity):** The damage pipeline SHALL match every golden test-vector (`docs/01` §12) exactly, including floor order.
- **AC-S6 (serialization round-trip):** `deserialize(serialize(state)) == state` for BattleState and campaign save; a save with an unsupported `schemaVersion` SHALL fail with a clear error, never load partially.
- **AC-S7 (rewind):** Rewinding K turns then replaying the same commands SHALL yield the same result as never having rewound.
