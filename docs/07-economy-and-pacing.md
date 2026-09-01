# 07 — Economy & Pacing

Turns "investment, not grind" from a slogan into a **falsifiable number**. All figures here are **placeholder targets** to be tuned in playtest — the point is that the system is *specified and testable*, not that these exact numbers are right. **Placeholder is not a licence (2026-09-01).** §3's time-to-kill band sat under this same preamble and shipped content missed it by 3–4× for the life of the repo. So each number below is either asserted by a test (§3's band, now AC-P6) or marked **aspirational** where it is not — an unmarked, unasserted number is the defect, not the preamble.

---

## 1. What each currency is worth (targets)

Currencies defined in `docs/02` B0. Target magnitudes:

| Lever | Placeholder target | Rationale |
|---|---|---|
| **AP per battle** | ~80–150 (story), scaled by engagement — **aspirational, and above what ships** | Enough that most battles buy 0.5–1 ability node. The shipped grant is `BASE_AP_GRANT` 40 + `AP_PER_ACTION` 8 per landed action, capped at `ACTION_AP_CAP` 80, i.e. **40–120 per battle** and 40 for a unit that lands nothing (`src/sim/progression.ts`, ADR-0012 placeholders). The band assumes a per-battle grant of 80–150; the code's floor is 40 and its ceiling 120. No test asserts either range |
| **Ability node cost** | ~60–300 AP (utility→capstone) | A cheap utility is ~half a battle; a capstone is a multi-battle goal |
| **Battles to master one job** | ~10–16 | A job is a mid-term arc, not an afternoon of farming. **Aspirational:** the figure follows from the ~80–150 band above, not from the shipped 40–120 grant or from the authored tree costs, and nothing asserts it |
| **Jobs to first hybrid** | 2 mastered (~20–30 battles) | First fusion lands in the early-mid game as a milestone |
| **Respec cost** | **0** (free, `docs/02` B7) | Experimentation is encouraged; only *learning* costs AP |
| **Mastery bonus** | 1 permanent trait per job | The long-tail reward that never expires |
| **Character Level** | **No stat value at all** (ADR-0021) — built and asserted (`docs/02` AC-J10) | ~~A gate on job/equipment tiers; it rises on the critical path~~ **`[NOT BUILT]`: nothing reads `level` and nothing raises it** — it is a stored field only (`src/sim/roster.ts`), never bought with EXP. The gate is intent, not code (`docs/02` B0) |
| **Equipment** | Horizontal: formula, range, element, resistance, Brave/Faith shifts | Counterplay and identity, **not** a rising weapon-power ladder — see §3 |

## 2. The grind-budget curve (the falsifiable contract)

> **Contract:** *A player who fights only the authored/critical-path encounters SHALL be able to keep at least one fully-realized build online at all times, without ever farming optional battles.*

- Define `AP_available(criticalPathOnly)` across the campaign and `AP_needed(one competitive build per act)`. **The curve must satisfy `available ≥ needed` at every act boundary.** If it doesn't, the fix is *lower costs / raise per-battle AP*, never "expect the player to grind."
- Optional battles are **acceleration, not obligation** — they let you fund a *second* build or explore hybrids faster, but are never required to stay competitive.
- **No degenerate loop is ever optimal** (`docs/02` B4): AP-per-minute from repeating a trivial action must be **strictly worse** than progressing. This is a tuning invariant, checkable by simulation.

## 3. Numbers / tuning philosophy

- **Integers everywhere in the sim**, floored per step (`docs/05` §2). No floats in damage; multipliers (Haste 1.5, Zodiac 1.25…) applied then floored.
- **Target time-to-kill (TTK):** a squishy unit dies in ~1–2 committed actions; a tank in ~3–4. Encounters (`docs/06`) are budgeted to a TTK band, not to player level.
  - **Measured, and the reason equipment stays horizontal (ADR-0021):** holding `raw.hp` fixed and raising only the weapon tier, shipped builds outside their band go **0/15 → 1/15 → 6/15** at WP 8 → 12 → 16. At WP 16 the reference committed action is 180 damage and **every tank dies in 2 hits**. Offense on gear and defence on the record scale independently, so a vertical gear ladder relocates the balance problem rather than solving it.
- **Power-vs-slot-count rule:** adding a slot/option must be paired with matched opportunity cost (`docs/02` B5). Total build power is bounded by **scarcity**, not by capping individual numbers.
- **"Allowed to be strong" rule (`docs/04` §2):** a combo may exceed the power curve **iff** it has telegraphed, actionable counterplay. Otherwise it's tuned down.
- **Soft caps > hard bans `[NOT BUILT]`:** ~~Speed/Haste, evasion, and hard-disable duration follow diminishing returns so stacking is a choice with falling marginal value~~ — **no diminishing-returns curve exists in the engine** (checked 2026-09-01). What ships instead is three unrelated rules: Speed is banned outright from the trait, support and movement effect schemas (no `speed` key, `.strict()` rejects one — ADR-0012, AC-P5); the four evasion sources are independent **multiplicative** miss chances (`formulas.ts`), so stacking them never reaches certainty; and re-inflicting a status **refreshes** it to the longer of the two remaining lifetimes (`resolve.ts` `applyInflicts`) — full duration every time, which is the opposite of a falling return. The curve itself is aspirational and now sits in **AC-P7**.

## 4. Pacing of complexity (ties to onboarding, `docs/08`)

Economy pacing and *systems* pacing are linked: the player shouldn't be handed all currencies at once.
- **Act 1:** AP + chassis + secondary only. Mastery is visible but distant.
- **Act 2:** first masteries land → trait slots + first hybrid unlock.
- **Act 3+:** full hybrid web, optional sockets (`if kept`), deep specialization.
This keeps the AP economy legible while the player learns it (no 2-hour bounce, `docs/00`).

### 3a. EXP and the level band `[DEFERRED]`

**Not built, and deliberately given no acceptance criterion** (ADR-0021 decision 5). If character Level ever becomes *earned* rather than authored, the mechanism of record is a **level-gap-scaled EXP curve** — a large award when a unit is under the encounter's level, near-nothing when it is over — which makes farming a favourite converge to zero while letting a benched unit catch up cheaply. Triangle Strategy and Fire Emblem both ship this shape.

This paragraph is **aspirational, not governing**. Nothing asserts it, no number here is a target, and per the repo's own rule an unasserted number in `docs/` is worse than an absent one — so it stays tagged until there is an EXP system to test. Note also that in both cited games **levels grant stats**; they are evidence for the EXP band only, never for ADR-0021's decision 1.

## 5. MP & in-battle economy

- **No natural MP regen** (`docs/01`/`docs/02` A4) — casters pace via Move-MP-Up / Chakra / items, so magic is a resource to manage, not free or starved. Tune starting MP + regen sources so a caster gets ~2–4 meaningful casts per battle without an item, more with investment.
- **Charged spells trade power for dodgeability** (tile targeting) — the balance handle that keeps burst magic from being oppressive without gutting MP.

## Acceptance Criteria (SDD-ready)

- **AC-P1 (grind budget):** Simulated critical-path AP income SHALL meet or exceed the AP needed for one competitive build per act at every act boundary.
- **AC-P2 (no degenerate loop) — UNASSERTED:** For every repeatable action, AP-per-unit-time SHALL be strictly less than progressing the critical path. ~~*Test:* economy simulation flags any action that inverts this.~~ **No such test and no economy simulation exist** (checked 2026-09-01: no file under `src/` cites AC-P2). The nearest live coverage is `docs/02` AC-J7 in `progression.test.ts` — the AP grant is capped and level-independent, so repeating a trivial action stops scaling — which bounds the grant, not AP-per-unit-time. Treat AC-P2 as spec, not as coverage.
- **AC-P3 (free respec):** Respec/loadout changes SHALL consume no currency (enforces `docs/02` AC-J4).
- **AC-P4 (integer tuning):** All sim-facing values SHALL be integers; documented multipliers SHALL be applied-then-floored in the pipeline order.
- **AC-P5 (Speed is not a purchasable stat — the structural ban):** No trait, support or movement effect SHALL be able to change a unit's Speed or CT accrual. The three effect schemas SHALL carry no `speed` key and SHALL reject an authored one; `chargeSpeed` — a *charged action's* own accrual rate (`docs/01` §3) — is a different quantity and stays legal. *Test:* `support.test.ts` and `content.test.ts` parse a `speed` key and require a throw; `movement.ts` carries the same shape. *Discriminator:* add `speed` to `SupportEffectSchema` and both tests must go red; a build-time A/B cannot see this, because the banned key has no caller to compare against.
  > **Rewritten 2026-09-01, and this is a narrowing.** ~~Old text: "Speed/Haste, evasion, and hard-disable duration SHALL exhibit diminishing returns beyond documented thresholds rather than linear stacking."~~ That criterion is **not built**; it moved to AC-P7. Nine files under `src/sim` cite `AC-P5` — `build.ts`, `build.test.ts`, `content.test.ts`, `content-pack.test.ts`, `movement.ts`, `support.ts`, `support.test.ts`, `trait.ts`, `trait.test.ts` — and **not one of them measures a curve**. Two test files assert the ban directly (`support.test.ts` and `content.test.ts` each parse a `speed` key and require a throw); three schemas carry it as shape (`support.ts`, `trait.ts`, `movement.ts`); `build.ts` and `content-pack.test.ts` rely on it in comments; and `trait.test.ts` and `build.test.ts` cite AC-P5 while testing mastery-trait stat effects and their order-independence. The identifier's presence in nine files read as coverage for a criterion nothing tested. AC-P5 now says what those files actually prove.
- **AC-P6 (TTK band is enforced, not aspirational):** Every shipped build's derived `maxHp` SHALL require the number of **committed actions** its declared TTK class allows (§3): squishy 1–2, tank 3–4. The reference committed action is **derived** from the engine (the sturdy reference bruiser's own basic attack against a peer), never hard-coded, so the band moves with the `docs/01` constants instead of going stale. *Test:* `src/sim/ttk.test.ts` classifies every build, asserts the band, and re-runs the same check against the pre-2026-08-12 HP values to prove it bites. *Corollary (same test file):* a showcase build's **signature ability SHALL out-damage that build's own basic attack** — otherwise the greedy balance probe never selects it and the build fights as the wrong job (the masking class, `src/sim/CLAUDE.md`).
  > **Why this AC exists.** Until 2026-08-12 the shipped data missed §3 by 3–4×: *every* build, squishy and tank alike, died to one basic attack (a 72-HP knight vs a 90-damage swing). Fights lasted 2–4 turns and were decided by turn order, which made range, positioning, tempo and signature abilities invisible and collapsed the build-diversity gate to **N=1**. No test asserted §3, so nothing caught it. Fixing the band recovered **N=5**. A prose target with no test is not a spec.
- **AC-P7 (soft caps) `[NOT BUILT]` — explicitly aspirational, nothing asserts it:** Speed/Haste, evasion and hard-disable duration SHALL exhibit diminishing returns beyond documented thresholds rather than linear stacking. **Split out of AC-P5 on 2026-09-01.** No threshold is documented anywhere in `docs/`, no code implements a curve, and no test measures one — §3 above lists the three rules that ship in its place. Do not cite AC-P7 from code until both a threshold and a test exist: a citation is what made the old AC-P5 read as covered.
