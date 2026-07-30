# ADR-0008: Scheduler tie-break precision (id-keyed, lexicographic, charge-vs-charge)

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** maintainer + Product Owner (PR2), prompted by adversarial review

## Context

`docs/05` §1a pins the scheduler tie-break as fidelity-critical: (1) higher `ct`,
(2) ChargedAction before Unit, (3) "lower `unitId` (assigned at deploy in
team-then-slot order)." Implementing PR2's scheduler surfaced two under-specified
points an adversarial review flagged:

1. **What key is level 3, really?** The first implementation keyed on the unit's
   index in `state.units`. That equals "unitId asc" only if the array is pre-sorted
   by id — an unenforced invariant. A migrated or hand-authored battle with an
   out-of-order `units` array would silently produce a turn order contradicting the
   spec (still deterministic, so replay/rewind hold — but wrong per fidelity).
2. **Charge-vs-charge is undefined.** §1a only covers charge-before-unit and
   unitId; two charged actions tied at the same `ct` had no specified order. The
   implementability gate says the engine must not invent such a rule silently.

## Options considered

1. **Key level 3 on array index** — cheap, but correctness rests on an unvalidated
   "units sorted by id" invariant; violated by migrations/authoring (rejected).
2. **Key level 3 on `unitId`, enforce array sort separately** — matches the spec
   text but adds a second invariant to police (rejected as redundant).
3. **Key level 3 on the actor id directly, lexicographically, and extend the same
   id rule to charge-vs-charge** — the id is the source of truth; array order can
   never change the outcome. Chosen.

## Decision

Level-3 tie-break compares the **actor id** with a **locale-independent
lexicographic** compare (`a < b` on the raw string — never `localeCompare`, which
is locale-dependent and would break determinism). This applies to unit-vs-unit
(the spec's "unitId asc") **and** charge-vs-charge (same rule). The comparator is a
total order on `(ct desc, charge-before-unit, id asc)` and never falls back to
insertion/iteration order. `docs/05` §1a is updated to state this precisely.

## Consequences

- A mis-ordered `units` array (from a migration or authored battle) can no longer
  change turn order — the id decides.
- Charge-vs-charge ordering is now defined and testable (AC-S3).
- Ids must be treated as stable identifiers whose ascending order is meaningful;
  content/authoring should assign them in deploy (team-then-slot) order so the
  intended priority matches. This is a convention, not enforced by the schema.
- Locale-independent compare is mandatory — a `localeCompare` here would be a
  determinism violation (ADR-0004).

## References

- `docs/05` §1a (updated), ADR-0004 (determinism), `specs/003-simulation/spec.md`
  (AC-S3), `src/sim/scheduler.ts` (`tieBreak`).
