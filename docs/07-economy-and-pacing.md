# 07 — Economy & Pacing

Turns "investment, not grind" from a slogan into a **falsifiable number**. All figures here are **placeholder targets** to be tuned in playtest — the point is that the system is *specified and testable*, not that these exact numbers are right.

---

## 1. What each currency is worth (targets)

Currencies defined in `docs/02` B0. Target magnitudes:

| Lever | Placeholder target | Rationale |
|---|---|---|
| **AP per battle** | ~80–150 (story), scaled by engagement | Enough that most battles buy 0.5–1 ability node |
| **Ability node cost** | ~60–300 AP (utility→capstone) | A cheap utility is ~half a battle; a capstone is a multi-battle goal |
| **Battles to master one job** | ~10–16 | A job is a mid-term arc, not an afternoon of farming |
| **Jobs to first hybrid** | 2 mastered (~20–30 battles) | First fusion lands in the early-mid game as a milestone |
| **Respec cost** | **0** (free, `docs/02` B7) | Experimentation is encouraged; only *learning* costs AP |
| **Mastery bonus** | 1 permanent trait per job | The long-tail reward that never expires |

## 2. The grind-budget curve (the falsifiable contract)

> **Contract:** *A player who fights only the authored/critical-path encounters SHALL be able to keep at least one fully-realized build online at all times, without ever farming optional battles.*

- Define `AP_available(criticalPathOnly)` across the campaign and `AP_needed(one competitive build per act)`. **The curve must satisfy `available ≥ needed` at every act boundary.** If it doesn't, the fix is *lower costs / raise per-battle AP*, never "expect the player to grind."
- Optional battles are **acceleration, not obligation** — they let you fund a *second* build or explore hybrids faster, but are never required to stay competitive.
- **No degenerate loop is ever optimal** (`docs/02` B4): AP-per-minute from repeating a trivial action must be **strictly worse** than progressing. This is a tuning invariant, checkable by simulation.

## 3. Numbers / tuning philosophy

- **Integers everywhere in the sim**, floored per step (`docs/05` §2). No floats in damage; multipliers (Haste 1.5, Zodiac 1.25…) applied then floored.
- **Target time-to-kill (TTK):** a squishy unit dies in ~1–2 committed actions; a tank in ~3–4. Encounters (`docs/06`) are budgeted to a TTK band, not to player level.
- **Power-vs-slot-count rule:** adding a slot/option must be paired with matched opportunity cost (`docs/02` B5). Total build power is bounded by **scarcity**, not by capping individual numbers.
- **"Allowed to be strong" rule (`docs/04` §2):** a combo may exceed the power curve **iff** it has telegraphed, actionable counterplay. Otherwise it's tuned down.
- **Soft caps > hard bans:** Speed/Haste, evasion, and hard-disable duration follow diminishing returns so stacking is a choice with falling marginal value, not a forbidden move or an auto-win.

## 4. Pacing of complexity (ties to onboarding, `docs/08`)

Economy pacing and *systems* pacing are linked: the player shouldn't be handed all currencies at once.
- **Act 1:** AP + chassis + secondary only. Mastery is visible but distant.
- **Act 2:** first masteries land → trait slots + first hybrid unlock.
- **Act 3+:** full hybrid web, optional sockets (`if kept`), deep specialization.
This keeps the AP economy legible while the player learns it (no 2-hour bounce, `docs/00`).

## 5. MP & in-battle economy

- **No natural MP regen** (`docs/01`/`docs/02` A4) — casters pace via Move-MP-Up / Chakra / items, so magic is a resource to manage, not free or starved. Tune starting MP + regen sources so a caster gets ~2–4 meaningful casts per battle without an item, more with investment.
- **Charged spells trade power for dodgeability** (tile targeting) — the balance handle that keeps burst magic from being oppressive without gutting MP.

## Acceptance Criteria (SDD-ready)

- **AC-P1 (grind budget):** Simulated critical-path AP income SHALL meet or exceed the AP needed for one competitive build per act at every act boundary.
- **AC-P2 (no degenerate loop):** For every repeatable action, AP-per-unit-time SHALL be strictly less than progressing the critical path. *Test:* economy simulation flags any action that inverts this.
- **AC-P3 (free respec):** Respec/loadout changes SHALL consume no currency (enforces `docs/02` AC-J4).
- **AC-P4 (integer tuning):** All sim-facing values SHALL be integers; documented multipliers SHALL be applied-then-floored in the pipeline order.
- **AC-P5 (soft caps):** Speed/Haste, evasion, and hard-disable duration SHALL exhibit diminishing returns beyond documented thresholds rather than linear stacking.
- **AC-P6 (TTK band is enforced, not aspirational):** Every shipped build's derived `maxHp` SHALL require the number of **committed actions** its declared TTK class allows (§3): squishy 1–2, tank 3–4. The reference committed action is **derived** from the engine (the sturdy reference bruiser's own basic attack against a peer), never hard-coded, so the band moves with the `docs/01` constants instead of going stale. *Test:* `src/sim/ttk.test.ts` classifies every build, asserts the band, and re-runs the same check against the pre-2026-08-12 HP values to prove it bites. *Corollary (same test file):* a showcase build's **signature ability SHALL out-damage that build's own basic attack** — otherwise the greedy balance probe never selects it and the build fights as the wrong job (the masking class, `src/sim/CLAUDE.md`).
  > **Why this AC exists.** Until 2026-08-12 the shipped data missed §3 by 3–4×: *every* build, squishy and tank alike, died to one basic attack (a 72-HP knight vs a 90-damage swing). Fights lasted 2–4 turns and were decided by turn order, which made range, positioning, tempo and signature abilities invisible and collapsed the build-diversity gate to **N=1**. No test asserted §3, so nothing caught it. Fixing the band recovered **N=5**. A prose target with no test is not a spec.
