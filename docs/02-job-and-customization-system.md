# 02 — Job & Customization System (THE CORE DOC)

This is the centerpiece. Pillars #1 (customization) and #2 (jobs) live here. **Part A** is the faithful FFT baseline. **Part B** is our reconciled enhancement layer — and it opens with a gate (the currency table) precisely so it stays *one deep system*, not ten shallow ones sharing a menu.

> Reading order: understand Part A, then read Part B's currency table **before** its feature list. Any Part-B mechanic that can't earn a row in that table, or can't produce an archetype in `docs/03`, is cut.

---

## Part A — Faithful FFT baseline `[BASELINE]`

### A1. Progression: JP → Job Level → Job Tree
- Acting in battle awards **EXP** (drives character Level) and **JP** (Job Points), earned **per job**.
- Accumulated JP raises that **Job's Level (1–8)**. **Job Level — not character Level — gates the job tree.**
- **Abilities are bought with JP and are permanent** once learned. **There is no learn-on-hit / learn-from-equipment in FFT** — every ability is a JP purchase. *(This matters: the FFTA-style "gear teaches abilities" idea in Part B is an intentional departure, not a port.)*
- **JP-spillover:** other same-job units present in a battle earn a fraction of JP too; **JP Up** (support) and party-wide JP options accelerate this. This is the baseline the anti-grind enhancement improves on.
- **Growth constants:** stats grow per level-up scaled by the **current job's growth C-values**. Because growth depends on the job you level *in*, the base game enables the "de-level then re-grow in a high-growth job" min-max exploit — the enhancement layer kills this (B4).

### A2. The 5-slot ability chassis (the soul)
Every unit fields five equip slots, filled from abilities learned across any jobs:

| Slot | Source | Notes |
|---|---|---|
| **Primary action** | Current job's command (fixed) | e.g. Knight → Battle Skill. Not chosen. |
| **Secondary action** | **Any** other learned job's command | The core of build identity (Knight + Black Magic). |
| **Reaction** (×1) | Any learned reaction | Triggers on a condition; chance scales with **Brave%**. |
| **Support** (×1) | Any learned support | Passive (Two Swords, Two Hands, Concentrate, Short Charge, Equip-X…). |
| **Movement** (×1) | Any learned movement | Passive (Move+N, Teleport, Ignore Height, Fly…). |

Cross-job equipping is what turns a class list into a build sandbox.

> **Implementation status (2026-08-18, ADR-0019).** Primary, Secondary, **Support** and
> **Reaction** are live in the sim. **Movement is the last inert slot** — validated at equip
> time, then ignored at build time.
>
> That gap is a real one, not a rounding error: it cost two slices, because nine of fourteen
> shipped builds equipped a support ability that did nothing and the resulting weakness read as
> a *content-tuning* problem. **A slot that type-checks its input and then discards it looks
> identical to a working one.** Reaction had the same shape — seven of fifteen builds wore a
> dead reaction, and the diversity gate had to EXCLUDE `bld-counter-wall` for it.
>
> Every slot now keeps a manifest of what is authored-but-inert and why:
> `DEFERRED_SUPPORT_EFFECTS`, `DEFERRED_REACTION_EFFECTS`, `DEFERRED_MOVEMENT_EFFECTS`. A test
> asserts each partitions the shipped pack **exactly, in both directions** — an unlisted inert
> ability fails, and so does a stale entry for one that has since gained an effect. Movement is
> held back by SCOPE, not by a missing mechanic: eight of fifteen builds equip `move-plus-2`, so
> waking it is a roster-wide tempo change that has to be measured on its own slice.

### A3. The job web (representative)
Generic human jobs: Squire, Chemist (both starting), Knight, Archer, Monk, Priest, Wizard, Time Mage, Summoner, Thief, Mystic/Oracle, Geomancer, Lancer/Dragoon, Samurai, Ninja, **Calculator/Arithmetician**, Bard (♂), Dancer (♀), **Mime**. `[WotL]` adds **Dark Knight** and **Onion Knight**. Representative gates: Knight/Archer ← Squire 2; Priest/Wizard ← Chemist 2; Monk ← Knight 3; Geomancer ← Monk 3; Thief ← Archer 2; Dragoon ← Thief 3; Summoner ← Time Mage 3; Ninja ← Archer 4 + Thief 5 + Geomancer 2; Calculator ← Priest 4 + Wizard 4 + Time 3 + Oracle 4; Mime ← very steep. `[WotL]` gates are generally stricter. **(All thresholds verify-against-BMG before use — see `docs/01` §12.)**

### A4. Special jobs & mechanics the baseline must model
These are load-bearing and easy to forget:

- **Mime:** cannot equip weapons/armor or change its command slots; **mimics allies' actions**; inflated innate stats. A genuine special case, not "just another job."
- **Calculator/Arithmetician:** casts a chosen mage spell **for free, no charge time**, on every unit whose **Level / CT / Height / EXP is divisible** by a chosen number (3/4/5…). Baseline includes it; `docs/04` explains why it's the canonical balance failure and how B6 defuses it.
- **Monster jobs:** monster families (Chocobo, Goblin, Bomb, Panther, etc.) **can't change jobs**, have innate skillsets, are recruited via **Invite** (Mystic) — hidden-Faith-gated — and bred on the world map. No blue-magic learning.
- **Perform (Bard/Dancer):** gender-locked; map-wide **ticking** buffs/debuffs that resolve on the shared timeline (charged, interruptible).
- **Charge/Aim (Archer):** delayed damage-boost command (charged).
- **Jump (Dragoon):** the unit **leaves the field and is untargetable while airborne**, landing later on a tile (dodgeable by vacating). Uses separate Horizontal/Vertical Jump.
- **Steal (Thief):** Speed/level-diff success formula; Steal Heart/Weapon/Armor/Gil. **Poach/Secret Hunt:** world-map-only monster-to-loot conversion.
- **Propositions/Errands `[WotL]`:** off-map dispatch of units for Gil/items/JP/EXP — an alternate progression axis.
- **MP economy:** **no natural regen** — only Move-MP-Up / Chakra / items. (Baseline fact behind the "mages are swingy" critique.)

---

## Part B — Enhancement layer `[ENHANCEMENT]`

### B0. The gate: Progression-Currency Reconciliation
No feature below is real until it earns a row here. **Rule: if any two rows can't be told apart by a player, one is cut or merged.**

| Currency | Earned by | Spent on | Why it's distinct | Status |
|---|---|---|---|---|
| **AP** | Acting in battle (all deployed units earn; no degenerate self-farm — see B4) | Buying abilities / walking a job's skill tree | The single directed spend. Replaces passive JP drip. | `[CORE]` |
| **Mastery** | Fully completing a job's tree | Unlocks a **permanent, portable passive** + counts toward hybrid eligibility | A milestone, **never a wallet and never lost** — long-term goal, not a resource you juggle. | `[CORE]` |
| **Hybrid unlock** | Mastering **two specific** base jobs | Opens a fusion job | Gated by **combinations**, not accumulation — orthogonal to AP/mastery totals. | `[CORE]` |
| **Socket loot** | Encounter/boss rewards | Modular passives **moved between units** | The only **transferable** axis — solves "I want this passive on two builds" without re-earning it. | `[OPTIONAL]` |

Everything else considered (weapon skill-trees, ability rank-up, set bonuses) collapses into **"AP walks a tree"** and is therefore **not** a separate currency — they are presentation variants of the AP spend, kept only if `docs/03` needs them. **Behavior scripting is `[DEFERRED]`** (a different game's spine).

### B1. Spine axis 1 — widen but don't dilute the chassis `[CORE]`
Keep the 5 slots. Add **exactly two Trait slots** for mastery-earned passives. **We do NOT add a free "ultimate" slot** — the review flagged that as decision-diluting power creep. New slots must come with matched opportunity cost (B5).

### B2. Spine axis 2 — AP job & skill trees + mastery `[CORE]`
- Replace passive JP drip with **directed AP purchase**: spend AP to walk a **branching per-job tree**. Branch points force identity (a job's offense spec vs. its utility spec — you can't have all of it cheaply).
- **Mastery bonus:** completing a job's tree grants a **permanent cross-job passive** (a small stat mod or trait) usable in any job and slottable into a Trait slot (B1). This makes "grinding a job" feel like unlocking a build piece.
- Optional presentation: **ability rank-up** (an ability you invest further AP into upgrades, Fire→Fira) instead of buying a separate spell — rewards commitment. `[OPTIONAL]`

### B3. Spine axis 3 — hybrid / fusion jobs `[CORE]`
- **Mastering two specific base jobs unlocks a hybrid job** with a **blended kit + a few unique abilities** (Knight + Black Mage → Spellblade; Thief + Archer → Ranger; Monk + Time Mage → …). This is the combinatorial **discovery web** and our biggest replay driver.
- **Discovery, not spoiler:** hybrid recipes are **hinted, not listed** in-game (the transparency split, `docs/04`). Resolution math is always transparent; *what a fusion becomes* is a reward for exploration.
- **Cost honesty:** each hybrid is real content (unique abilities, art, balancing). The **cut-lines doc (`docs/08`) caps the hybrid count** for a small team — we ship a curated set, not the full N² explosion.

### B4. Kill the grind, kill the exploits `[CORE]`
- **AP is earned by meaningful action**, and **all deployed units earn**, so the optimal path is never "spam Throw Stone on your own ally." No action rewards more AP for being degenerate.
- **Normalize stat growth** so there is **no incentive to de-level** (flat per-level growth, or Tactics-Ogre-Reborn-style per-unit leveling). The A1 exploit is designed out.
- The **grind-budget curve** (`docs/07`) makes "investment, not grind" a falsifiable number, not a slogan.

### B5. The anti-convergence / opportunity-cost design law `[CORE]`
> **Design law:** *Depth comes from what you give up, not from how many options you hold. No slot, currency, or unlock may be added if it reduces total build tension. Every specialization must cost a generalization.*

Concretely: slots stay **scarce**; strong branches are **mutually exclusive**; deployment is **capped** (you can't field one of everything); some powerful passives **conflict**. This is the rule that prevents FFT's endgame "everyone converges on the same god-build."

### B6. Uniques and the "win-button" problem `[CORE]`
- **Special characters = premium chassis, not premade gods.** A unique gets an **innate signature trait + one exclusive ability line**, but is otherwise routed through **this same** job/customization system. A fully-built generic can rival it (success criterion, `docs/00`). Optional **roster "unique tax"** so fielding many uniques costs build flexibility.
- **If a Calculator-like class exists,** its win-button is **gated**: charge time or cooldown, a scaling resource cost, and setup the enemy can **disrupt**. Power fantasies are fine; *free, spammable, no-counterplay* ones are not (`docs/04`).

### B7. Respec & permanence (the resolved tension) `[CORE]`
**Model: permanent progress, free experiments.**
- Everything **learned** (abilities, masteries) is **permanent and never lost.** Swapping loadouts, secondaries, and slotted passives is **free and instant** in the prep/tinker screen.
- Because nothing is destroyed, experimentation is encouraged — but a character's **accumulated masteries are what make it *yours***, so identity still accretes over time. This threads the needle between "cheap respec" and "investment, not grind" (both were in tension in the first draft).

### B8. Optional / deferred axes (kept only if `docs/03` needs them)
- **Gear-as-ability + rune/materia sockets** `[OPTIONAL]` — loot grants abilities (an intentional departure from A1's JP-only rule) and **transferable** sockets (the one row in B0 that isn't redundant). Strong candidate to keep because it adds the *transfer* axis nothing else covers.
- **Weapon skill-trees** `[OPTIONAL]` — signature weapons unlock/upgrade specific abilities. Presentation variant of AP-walks-a-tree.
- **Set bonuses** `[OPTIONAL]` — emergent payoffs for themed loadouts.
- **Behavior scripting / gambits** `[DEFERRED]` — conditional-tactics AI for companions/auto-resolve. Post-1.0; it conflicts tonally with hand-controlled tactical play.

### B9. Data-model gesture (full schema in `docs/05`)
One paragraph, deliberately: a **Unit** references a **Job** (with growth multipliers + a **SkillTree** of AP-priced **Ability** nodes), a **Loadout** (the 5 slots + 2 trait slots), learned-ability and mastery sets, and raw-vs-derived **StatBlocks**. Hybrids are Jobs with a `requires: [jobId, jobId]` unlock and a merged tree. **The authoritative schema lives in `docs/05` — this is only a shape, not a spec, so we don't bikeshed a model for systems we might cut.**

---

## Acceptance Criteria (SDD-ready)

- **AC-J1 (chassis):** A unit SHALL equip exactly one Secondary command (any learned job), one Reaction, one Support, one Movement, and up to two mastery Traits; the Primary SHALL be fixed by the current job.
- **AC-J2 (AP purchase):** Abilities SHALL be acquired only by spending AP on the owning job's tree; the system SHALL NOT grant abilities from equipment unless the `[OPTIONAL]` gear-as-ability module is enabled.
- **AC-J3 (mastery permanence):** Learned abilities and job masteries SHALL persist across job changes, deaths (post-revive), and loadout swaps, and SHALL never be consumable or refundable.
- **AC-J4 (free respec):** Changing any loadout slot in the prep screen SHALL cost no resource and SHALL be reversible.
- **AC-J5 (hybrid unlock):** A hybrid job SHALL become available iff its two required base jobs are both mastered; recipes SHALL be hinted, not enumerated, in-game.
- **AC-J6 (anti-convergence):** No two mutually-exclusive strong branches SHALL be simultaneously equippable; deployment SHALL be capped below roster size.
- **AC-J7 (no degenerate AP):** No single repeatable action SHALL yield disproportionate AP; growth SHALL NOT reward de-leveling.
- **AC-J9 (no decorative slot):** For every chassis slot, equipping an ability SHALL either change the built unit (and, where the effect is behavioural, the fight) or the ability SHALL appear in that slot's DEFERRED manifest with a named reason. *Test:* an **A/B on the built object** — the same record with the slot filled and emptied must produce different output — plus a manifest test that partitions the shipped pack exactly in both directions. Equip-time validation alone SHALL NOT count as evidence: it looks identical whether or not the effect exists.
- **AC-J8 (currency distinctness):** The shipped currency set SHALL contain no two currencies with identical earn+spend semantics (the B0 rule, enforced in review).
