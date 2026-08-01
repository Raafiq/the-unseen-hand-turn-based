# ADR-0013: Defer facing-on-move; ship the balance-probe AI against deploy facing

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Maintainer (approved as decision D3 of the P2 Slice 2 plan) + systems-designer (raised the gap)

## Context

Facing is load-bearing in the combat baseline: an attack from a target's side or rear
improves hit and (per WotL) crit, and evasion is directional (`docs/01` §5c). The AI-as-test-harness
is required to *demonstrably* attack from the side/rear when reachable (`docs/06` §4, AC-E3a).

But the battle layer does **not** update a unit's `facing` when it moves or acts — `driver.ts`'s
`move` command sets `pos` only, and no resolver re-faces a unit toward its mover/attacker. So a
unit keeps its **deploy** facing for the whole battle. Consequences for P2 Slice 2:

- The balance-probe AI's flanking heuristic (prefer a tile/target that strikes rear > side > front)
  works, but exploits a facing that never turns to face attackers — a **one-sided** advantage.
- AC-E3(a) can be proven only against static deploy facing, not against a target that reorients.

Modeling facing-on-move is a **combat-rule change** (touches the driver/resolve/state and the
`docs/01` fidelity baseline + golden vectors), not harness work. The question: fold it into the
harness slice, or defer it?

## Options considered

1. **Model facing-on-move now** (face movement direction on `move`; face target on `act`) — most
   faithful to `docs/01` §5c. But it expands a harness slice into a fidelity-gated combat-rule
   change: new golden vectors, `fft-fidelity` verification, and it blocks Slice 2 on unrelated work.
2. **Defer it; ship the AI flank heuristic against deploy facing, documented as one-sided.** Keeps
   Slice 2 scoped to the harness. The positioning probe is partial until the rule lands.
3. **Drop the flank heuristic entirely** until facing-on-move exists — simplest, but discards a
   `docs/06` §4 target behavior and makes the AI a weaker, less representative probe.

## Decision

**Option 2.** Facing-on-move stays unmodeled for P2 Slice 2. The balance-probe AI keeps its
rear > side > front preference, scored against each target's current (deploy) facing, and the
limitation is documented in the AI module and the plan (D3). A dedicated, fidelity-gated combat
rule for updating facing is deferred to a later slice.

## Consequences

- **Makes easy:** Slice 2 stays a harness slice — no combat-rule or fidelity-vector churn now, no
  block on the benchmark loop.
- **What we give up:** the AI's flanking is one-sided (targets never reorient), so AC-E3(a) is
  proven only against static facing; the probe slightly *over*-rewards positioning relative to a
  faithful battle where the defender would turn. This is an accepted, bounded inaccuracy in the
  test harness, not in shipped combat.
- **Follow-up invariants:** when facing-on-move lands, it (a) MUST be `fft-fidelity`-gated against
  `docs/01` §5c with golden vectors, (b) requires re-evaluating the AI's move-scoring rear/side
  preference and re-running the AC-E3(a) positioning tests, and (c) SHOULD supersede or amend this
  ADR. Until then, no code may assume a unit re-faces.

## References

- `docs/01` §5c (directional hit/evasion/crit) · `docs/06` §4 + AC-E3 (AI positioning)
- P2 Slice 2 plan, decision D3 (facing-on-move → ADR, don't block)
- ADR-0011 / ADR-0012 (P2 customization + AP-economy context)
