# 01 — Combat System (Faithful FFT Baseline)

**Purpose:** an accurate, implementation-oriented reference for FFT/WotL combat. This is the `[BASELINE]`. Improvements live in `docs/02` (jobs) and `docs/04` (combat/QoL) and are tagged `[ENHANCEMENT]` so this reference stays uncorrupted.

> **Version baseline banner.** Numeric constants below follow the **PSX (1997)** engine as documented by AeroStar's Battle Mechanics Guide (BMG) and the FFHacktics data-mine. **War of the Lions** deltas are tagged `[WotL]` (added jobs Dark Knight/Onion Knight; some ability/MP tweaks; multiplayer Melee/Rendezvous; the infamous PSP spell-animation slowdown). The 2025 **Ivalice Chronicles** remaster is **not** the baseline. **All specific numbers here are illustrative until verified against BMG/FFHacktics** (see §12).

---

## 1. Turn order — the CT / clock-tick system

FFT has no fixed rounds. It is a continuous active-time queue driven by **Speed**.

- Each unit has a personal **CT** (Charge Time), starting at **0** (bosses/pre-placed units may start higher).
- On **each clock tick**, every unit's CT increases by its **Speed**.
- When a unit's **CT ≥ 100**, it gets an **Active Turn**. The engine ticks until at least one unit crosses 100.
- **Tie-break** (multiple units ≥100 on the same tick): resolved by a deterministic order (higher CT first, then a fixed unit/team ordering). *This exact order must be pinned in `docs/05` — it is a fidelity-critical, easy-to-get-wrong detail.*

**End-of-turn CT reduction** (this is what makes "doing less" get you back sooner). Reaching ≥100 grants the turn; at turn end you **subtract** based on what you did, and the remainder **carries over** to the next tick cycle:

| Action taken | Subtract |
|---|---|
| Moved **and** Acted | −100 |
| Move only **or** Act only | −80 |
| Neither (Wait) | −60 |

Example: act at CT 108 → −100 → carry 8. There is **no separate "60 cap"** — carryover is simply whatever remains after the subtraction. (The remainder is small by construction because you only act at 100–~130ish.)

**Speed modifiers:**
- **Haste** = CT accrual **×1.5** (not ×2). **Slow** = **×0.5** (rounded down). **Stop** = CT frozen (no accrual).
- Speed grows very slowly on level-up; it is the single most valuable stat.

---

## 2. Action economy per turn

An Active Turn is a sequence of sub-phases:

1. **Move** — within Move range (§7). Optional. Before or after Act.
2. **Act** — one action from an equipped command (Attack / primary skillset / secondary skillset / Item / etc.). Optional.
3. **Face / Wait** — end by choosing a compass facing (matters for defense, §7).

Rules: Move and Act are each used at most once, in either order (a real tactical choice). **Wait** ends early (cheaper CT). Some actions end the turn immediately or lock the other sub-phase (charged spells, Jump, Perform).

---

## 3. Charged (Slow) actions on the shared timeline

Many spells/abilities **do not resolve instantly** — they enter a **Charging** state and resolve on a later tick using the same CT engine.

- On cast, the unit declares a **target tile** (not a locked unit) and enters Charging. The ability has its **own Speed**; the charge builds **+abilitySpeed per tick**, resolving at 100. *Illustrative:* Fire ≈ Speed 25 → ~4 ticks; Bahamut ≈ Speed 10 → ~10 ticks. **These raw values are not verified — treat as placeholders.**
- **Charge time is (largely) independent of caster Speed** in FFT — which is exactly why **Short Charge** (support) and Speed-stacking matter. State this explicitly in implementation.
- **Target is a tile:** if the target unit walks out of the area before resolution, the spell whiffs. Fast spells are near-guaranteed; slow nukes (Meteor, high summons, Holy) are dodgeable. This is the central tension.
- **Interruptible:** killing or disabling the caster (Sleep/Stop/Don't Act/death) before resolution cancels it.
- **Other charged actions:** Dragoon **Jump**, Archer **Charge/Aim**, Bard/Dancer **Perform** — all resolve on delay via the same model.

**Implementer note:** model charged abilities as first-class entities on the same tick timeline as units, each with speed, target tile, and interrupt hooks. Full algorithm in `docs/05`.

---

## 4. Stats

**Primary:** HP (0 = KO, §11); MP (spell fuel; **no natural regen** — only Move-MP-Up / Chakra / items); **Speed** (CT rate); **PA** (physical attack); **MA** (magic attack). Raw PA/MA/Speed/HP/MP are stored hidden and modified by **job multipliers** + equipment, which is why the same character shows different stats in different jobs. Derivation order is specified in `docs/05`.

**Special (0–100 percentages):**
- **Brave** — sets **Reaction ability trigger chance** (Brave% ≈ activation odds; Blade Grasp success = Brave%); multiplies **Brave-scaling weapons** (Knight Swords, Katanas, bare-handed). **Brave ≤ 5** → generic becomes a Chicken and flees *(verify exact cutoff vs BMG)*.
- **Faith** — the magic percentage on **both ends**: spell power ∝ `casterFaith% × targetFaith%`. Low Faith = strong magic resistance but weak own casting. **Innocent** sets Faith 0 (magic-immune, unhealable by magic); **Faith** status maxes it. **Faith ≥ ~95** → generic leaves to pray *(verify cutoff)*. Hidden Faith also gates **Invite** success.

> `[UX TRAP → see docs/04]` Faith is double-edged and hidden; Zodiac (§6) is a hidden ±50% swing. Both should be surfaced in previews as enhancements.

---

## 5. Damage & hit formulas

`[ ]` = integer floor at each bracketed step — replicate every truncation or damage drifts.

### 5a. Weapon-type formula table `[BASELINE]`
Physical damage is **not** uniformly `PA×WP`. Each weapon class has its own formula and Two-Hands/Two-Swords eligibility:

| Weapon class | Damage formula | Notes |
|---|---|---|
| Sword, Crossbow, Spear/Polearm | `PA × WP` | Standard `[VERIFIED]`. |
| **Knife/Dagger, Bow, Ninja Sword** | `[(PA + Speed)/2] × WP` | **Speed weapons** — floor the average, then × WP. `[VERIFIED — Knife corrected here: it is NOT PA×WP]` |
| Knight Sword, Katana | `[Br/100 × PA] × WP` | Brave-scaled: floor `(Br×PA)/100` first, then × WP. `[VERIFIED]` |
| Bare hands | `[PA × Br/100] × PA` | PA-squared, Brave-scaled. **× 1.5 (floored) with Martial Arts** (Monk-innate/support). `[VERIFIED]` |
| Gun | `WP × WP` | **PA- and Faith-independent** (non-elemental guns). Elemental guns route through magic. `[VERIFIED]` |
| Staff, Rod, Book, Stick, Cloth | `[UNCERTAIN]` — some are **MA-based** (`MA×WP`) or `[(PA+MA)/2]×WP`, not `PA×WP` | **Do not implement as `PA×WP` without per-type verification.** Sources conflict; primary refs (BMG/FFHacktics) were egress-blocked this pass. |
| Axe, Flail, Bag | `Rand(1..PA) × WP` | **Random-damage** weapons — note for later; needs a seeded roll. `[VERIFIED]` |

> **Verification note (fft-fidelity, PR3):** the rows above were cross-checked against search-surfaced BMG/FFHacktics text; primary pages could not be opened directly (proxy 403), so `[UNCERTAIN]` rows must be re-verified before use, and no constant is hard-coded in `src/sim` without a golden vector (§12).

- **Two Hands** (support): wield a one-hander in both hands → roughly **doubled** single-hit damage.
- **Two Swords** (support): dual-wield → **two separate hits** (each its own accuracy/damage roll). This — plus Speed and Concentrate — is the real engine behind the "Orlandeau/Ninja delete a unit" power that `docs/04` critiques.
- Physical melee skills (Monk Wave Fist / Earth Slash, etc.) commonly use `[(1 + Br/100) × PA]`.
- **Concentrate** (support) makes physical attacks **ignore evasion**. **Element-strengthening gear** ≈ +50% to that element.

### 5b. Magic damage / healing `[BASELINE]`
Faith enters on **both ends**, each a floored `/100` step. Keep the two floors **separate** — the game floors *between* the Caster-Faith and Target-Faith multiplies, so collapsing them can drift by 1 `[VERIFIED — fft-fidelity]`:
```
d0 = MA × Q                          # base spell power
d1 = floor( d0 × casterFaith / 100 ) # floor here
d2 = floor( d1 × targetFaith / 100 ) # floor here
# then Zodiac, then Shell (§5d, §8), each floored
```
`Q` = spell's internal power. Innocent = Faith 0 (→ 0). Faith and Zodiac also modify the **hit / status-infliction chance**, not only damage (§5d, §9). *(Do not use the single-outer-bracket form `[Q×MA×(cF/100)×(tF/100)]` — it hides the intermediate floors.)*

### 5c. Evasion — four independent rolls, by facing `[BASELINE]`
Evasion is **not summed**. There are four separate sources — **Class Ev, Weapon Ev** (only with Weapon Guard), **Shield Ev, Accessory Ev** — each rolled **independently** (multiplicative miss chance). Facing removes sources:

- **Front:** all applicable sources apply.
- **Side (flank):** Class Ev ignored.
- **Rear (back):** Class, Shield, Weapon ignored — **only Accessory Ev remains** (≈ zero for most units). Back attacks also raise crit/effect odds.

Magic evasion is a **separate** stat. **Blade Grasp** and Brave-based reactions are checked **before** normal evasion. **Concentrate** bypasses evasion entirely.

### 5d. Zodiac compatibility multiplier `[BASELINE]`
Applies to damage, healing, **and %-based hit/status success** — for hostile *and* friendly effects:

| Compatibility | ×Multiplier |
|---|---|
| Best | 1.50 |
| Good | 1.25 |
| Neutral | 1.00 |
| Bad | 0.75 |
| Worst | 0.50 |

Good/Bad are fixed sign relationships. **Best/Worst** occur only between **opposite signs**, resolved by gender (opposite gender = Best, same gender = Worst). This is a hidden ±50% swing → surface it in previews (`docs/04`).

---

## 6. Accuracy & status infliction

Base hit% comes from the ability (often `Spd+c`, `PA+c`, `MA+c`, or flat), then reduced by evasion (§5c). **Magic hit% and status-infliction% are additionally modified by caster/target Faith and Zodiac.** Status durations are **CT-based** (tick down on the afflicted unit's timeline). Height advantage helps ranged accuracy (notably Bows).

---

## 7. Grid & positioning

- **Isometric tile grid** with true per-tile **height** (half-tile "h" units); hand-built maps with slopes, water, cliffs, impassable tiles.
- **Move range** = Move stat (horizontal tiles), gated by **Jump** tolerance (a tile is reachable only if the height delta is within Jump). Higher Jump climbs steeper terrain / crosses gaps.
- **Facing** (load-bearing, §5c): front/side/rear determine which evasion applies; choose end-of-turn facing defensively.
- **Range notation `RvV`** = horizontal range v vertical tolerance (e.g. `3v2`); AoE similarly (e.g. Haste area `2v3`).
- **Dragoon Jump** uses separate Horizontal Jump / Vertical Jump (e.g. HJ5/VJ3). **While airborne the jumper leaves the field and is untargetable**, landing on a tile later (dodgeable by vacating it).
- **No true zone-of-control:** pass through allies (can't end on an occupied tile), can't pass through enemies.

---

## 8. Status effects (tactical roles)

- **Hard disables:** KO/Death (starts crystal timer, §11); **Petrify/Stone** (counts as "lost" for defeat check); Stop (CT frozen); Sleep; Disable/Don't-Act; Immobilize/Don't-Move; Charm (enemy controls it); Confusion (random, may hit allies); Berserk (auto-attack, boosted); Frog/Toad; Silence; Blind/Darkness.
- **Attrition:** Poison; **Undead** (see §10); Oil (amplifies Fire); Slow.
- **Buffs:** **Haste** (×1.5 CT — arguably strongest); Regen; Protect (~⅔ physical); Shell (~⅔ magic); **Reraise** (auto-revive); Faith / Innocent; Float (immune to earth/ground); Transparent (near-unhittable until it acts); Reflect (bounces targeted magic).

Statuses (Haste, Reraise, Petrify, Stop, Charm, Don't-Act) swing battles more than raw damage. `[BASELINE, but see docs/04]` Sleep/Charm/Confusion/Stop **stun-lock chains** are oppressive; enhancements should cap or telegraph them.

---

## 9. Special unit / interaction rules `[BASELINE]`

- **Undead:** **Phoenix Down / Raise instantly KILLS them**; Cure damages, magic-heal damages; they self-revive off the KO counter; Blood Suck spreads undead.
- **Petrify-all = defeat:** a side entirely KO'd **or Petrified** loses (Stone counts as "out").
- **Charm/Confusion/Berserk** hand unit control to AI/RNG — a core disable axis.
- **Reflect** redirects single-target magic; AoE and some spells ignore it.

---

## 10. Battle flow

- **Deployment:** pick a formation from the roster; place in a starting zone. You typically can't preview the exact map before committing.
- **Party size:** PSX/WotL field up to **5 units** from a **16-slot roster**; **guests** join without a slot. (*Ivalice Chronicles raised roster caps — not our baseline.*)
- **Victory/defeat:** per-battle (Defeat All / Defeat [boss] / survive / reach-tile / escort). Defeat = your whole deployed side KO'd/Petrified. **Protagonist-KO game-over:** if the story lead falls (and can't crystallize), immediate Game Over.
- **Random vs story battles:** story = fixed scripted encounters; random = green world-map dots (~50% trigger), region- and **level-scaled** generic pools (the JP-farming venue and a source of tedium, `docs/04`).

---

## 11. Permadeath — the crystal / treasure timer `[BASELINE]`

- A KO'd unit shows a countdown from **3**, decrementing each time that unit's turn would come up.
- While > 0: revive via Phoenix Down / Raise / items.
- At **0**: the body becomes a **Crystal** or **Treasure Chest** and is **permanently dead** (generics gone forever; uniques usually can't crystallize in story battles).
  - **Crystal:** a unit stepping on it either fully restores HP/MP **or** learns some of the deceased's abilities.
  - **Treasure Chest:** yields item/equipment.

> `[BASELINE, but see docs/04]` Permadeath + no-undo punishes experimentation; our enhancement layer adds rewind and difficulty toggles rather than deleting permadeath.

---

## 12. Fidelity contract — test vectors & invariants

A "faithful baseline" is only real if it's checkable. Before any values are hard-coded:

1. **Verify against sources:** per-weapon damage variants, per-spell **Q**, per-ability **Speed**, job-unlock thresholds, growth constants, Brave/Faith desertion cutoffs — all against **AeroStar's BMG** and the **FFHacktics Formulas wiki** (the definitive data-mined references).
2. **Author golden test vectors:** a handful of reference `input → expected output` cases per formula (e.g. "Br 70, PA 10, WP 21 → `floor(70×10/100)×21` = 147"), used as regression tests when combat code is written (`docs/05`). *(WP 21 = Save the Queen; Excalibur is commonly WP 24 → 168 — pick the intended weapon.)* **Done for PR3:** the Brave/PA-scaled, speed-weapon, bare-hands, gun, magic, Zodiac, Protect/Shell, and evasion-by-facing vectors are wired in `src/sim/formulas.test.ts` (14 vectors).
3. **State invariants:** integer-floor at each step; non-negative clamps; evasion is multiplicative not additive; Zodiac/Faith apply to hit *and* damage.

---

## Acceptance Criteria (SDD-ready)

When this becomes a Spec Kit feature spec, these are its testable requirements. Each maps to a golden test-vector (§12) or an observable behavior.

- **AC-01 (turn order):** The scheduler SHALL advance every unit's CT by its Speed each tick and grant a turn at CT ≥ 100, resolving simultaneous ≥100 via the pinned tie-break order (`docs/05`). *Test:* a fixed set of Speeds produces a deterministic, reproducible turn sequence.
- **AC-02 (CT reduction):** On turn end, the system SHALL subtract 100 / 80 / 60 for move+act / one / neither, carrying the remainder. *Test:* act-at-108 → next CT 8.
- **AC-03 (Haste/Slow):** Haste SHALL scale CT accrual ×1.5 and Slow ×0.5 (floored); Stop SHALL freeze accrual. *Test:* hasted vs. base unit turn ratio ≈ 3:2.
- **AC-04 (charge resolution):** A charged ability SHALL resolve on the shared timeline at charge-CT ≥ 100 against its **target tile**, SHALL miss if the tile is vacated, and SHALL cancel if the caster is KO'd/Stopped/Don't-Act before resolution.
- **AC-05 (damage fidelity):** Each weapon-class and the magic formula SHALL match the golden test-vectors (§12) exactly, including integer-floor at every step.
- **AC-06 (evasion by facing):** Evasion SHALL be computed as independent multiplicative rolls, with Class ignored from the side and Class+Shield+Weapon ignored from the rear. *Test:* rear-attack hit-rate == accessory-only computation.
- **AC-07 (Zodiac/Faith on hit and damage):** Zodiac (×0.5–×1.5 across 5 tiers) and Faith SHALL modify both the %-hit/status-infliction chance and the magnitude.
- **AC-08 (special units):** Phoenix Down/Raise on Undead SHALL kill; a side entirely KO'd or Petrified SHALL be defeated.
- **AC-09 (permadeath):** A KO'd unit SHALL decrement its crystal counter from 3 on each of its would-be turns and SHALL become a Crystal/Chest at 0.

## Sources

CT/turns & action economy: [FF Wiki — Charge time](https://finalfantasy.fandom.com/wiki/Charge_time); [Game8 — CT Explained](https://game8.co/games/Final-Fantasy-Tactics/archives/543470); [AeroStar Battle Mechanics Guide (GameFAQs)](https://gamefaqs.gamespot.com/ps/197339-final-fantasy-tactics/faqs/3876).
Formulas/stats: [AeroStar BMG](https://gamefaqs.gamespot.com/ps/197339-final-fantasy-tactics/faqs/3876); [FFHacktics — Formulas](https://ffhacktics.com/wiki/Formulas); [FF Wiki — FFT stats](https://finalfantasy.fandom.com/wiki/Final_Fantasy_Tactics_stats); [RPG Site — Bravery & Faith](https://www.rpgsite.net/guide/18606-final-fantasy-tactics-the-ivalice-chronicles-how-bravery-and-faith-works).
Zodiac: [Game8 — Zodiac chart](https://game8.co/games/Final-Fantasy-Tactics/archives/541708).
Evasion/accuracy: [FF Wiki — Evasion](https://finalfantasy.fandom.com/wiki/Evasion) / [Accuracy](https://finalfantasy.fandom.com/wiki/Accuracy).
Status/flow/permadeath: [FF Wiki — FFT statuses](https://finalfantasy.fandom.com/wiki/Final_Fantasy_Tactics_statuses); [Game8 — Status Effects](https://game8.co/games/Final-Fantasy-Tactics/archives/543030); [FF Wiki — Death (Tactics)](https://finalfantasy.fandom.com/wiki/Death_(Tactics)); [FF Wiki — Random encounter](https://finalfantasy.fandom.com/wiki/Random_encounter).
