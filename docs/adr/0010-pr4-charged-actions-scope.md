# ADR-0010: PR4 charged-actions scope — what's faithful now, what's deferred (AC-04 / AC-S4 partial)

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Product Owner, after a 3-agent verification pass (reviewer, qe-tester, fft-fidelity)

## Context

PR4 added charged actions on the shared CT timeline plus the command-log
**replay-equality harness**. A three-agent verification confirmed the
determinism/replay **core is sound and faithful** — but surfaced several
fidelity/validation items that are **not yet implemented**. Per the fidelity
contract (`docs/01` §12) and honest-scope discipline, this ADR records what
landed vs what is deferred so AC-04 and AC-S4 are marked **partial**, not
silently checked off. (reviewer's explicit ask: record the descope here rather
than ship it as "done".)

## Decision

Ship PR4 as the faithful charged-action **mechanics** + a trustworthy
replay-equality harness. AC-04 / AC-S4 are **partially landed**; the deferred
items below are tracked, not silent descopes.

### Landed & verified (faithful)
- Charge accrues at the **ability's own speed, independent of caster Speed**
  (fft-fidelity: verified) — why Short Charge/Speed-stacking will matter.
- **Tile-targeting + whiff** (resolves against whoever is living on the tile at
  maturity; empty → whiff, no RNG draw).
- **Interrupt on KO + Stop**; cancel/whiff consume zero RNG; **dequeue on every
  resolution** (no scheduler starvation).
- Magic magnitude with the correct **two-Faith-floor → Zodiac → Shell → clamp**
  order (`docs/05` §2).
- Single seeded stream, exact draw accounting; **replay-equality harness** with a
  **frozen-golden serialized oracle** (AC-S1) and a `serialize→deserialize`
  rewind test (AC-S7).

### Deferred (tracked — NOT counted as done)
1. **Interrupt-set completeness.** Sleep / Don't-Act (statuses not in the enum
   yet), **Petrify** (always interrupts — a status, not HP≤0), and **Silence**
   (interrupts **magic charges only** — must be `effect.kind`-aware). The check
   auto-picks up statuses via `CHARGE_INTERRUPT_STATUSES`; kind-awareness is owed.
2. **Interrupt timing.** Currently evaluated **at maturity**; FFT latches
   "interrupted" the **instant** the disable applies. Diverges only if the caster
   is disabled and then **recovers before maturity** — unreachable until
   status-expiry/revival exist. Latch an interrupted-flag when those land.
3. **Faith/Zodiac on the magic HIT %** + the separate **magic-evasion** stat
   (AC-07). The charge hit roll uses raw `accuracy`; faithful magic success is
   `base% × casterFaith/100 × targetFaith/100 × Zodiac` and uses magic-evasion,
   not the physical facing tiers. Cross-cutting magic-hit-fidelity slice.
4. **Element modifier** is a pass-through (`effect.element` read but unapplied);
   weak/half/absorb/null deferred.
5. **DECLARE range/LoS** (`docs/05` §2) — only `inBounds` is checked; the
   range/LoS gate is deferred until abilities carry range (RvV) data.
6. **AoE** — single-tile only; RvV AoE (and "whiff = AoE now empty") deferred.
7. **move-XOR-act command granularity** — a move-only turn costs 80 and never
   pays the 100 move+act cost, shifting CT pacing. **Do not tune encounters
   against current pacing.**
8. **KO'd body on the target tile** — PO ruling: treated as **vacated (whiff)**;
   a crystal/body does not absorb a tile-targeted spell. Revisit if design wants
   bodies to block.
9. **AC-S1 `live == replay`** only becomes load-bearing once an interactive/AI
   loop exists — that loop **must route through `applyCommand`**, or the
   guarantee goes untested.

Charge speeds/power/accuracy remain **`[UNVERIFIED]`** (Fire≈25→4 ticks is
illustrative with medium corroboration; **not** stamped `[VERIFIED]`).

## Consequences

- The replay oracle now catches **deterministic-but-wrong** regressions (not just
  proves purity).
- Encounter tuning must not assume final CT pacing or magic hit rates.
- A future **magic-hit-fidelity** slice + the **status system** close items 1–4;
  range/LoS + AoE close 5–6. Each should re-verify constants when BMG/FFHacktics
  is reachable.

## References

- `docs/01` §3 / §6, `docs/05` §2 / §3, `specs/003-simulation` (AC-04/S1/S4/S7),
  `specs/001-combat-engine` (AC-04), ADR-0004 (determinism), ADR-0008 (tie-break).
