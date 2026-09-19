# ADR-0044 — All six deploy on every map

- **Status:** Accepted
- **Date:** 2026-09-19
- **Deciders:** the owner, in words: "work off the assumption that all battles will have
  six deployed; don't worry about selection yet."
- **Amends:** ADR-0041's decision that who fights is authored per encounter (2/3/4/4/4)
  and its "In camp" party-select mark. ADR-0041's two views, the dossier (ADR-0042) and
  hand-play suspension stand unchanged.
- **Owner docs:** `docs/10` AC-V61 (retired), `docs/11` §3.

## Context

ADR-0041 authored per-encounter placements (2/3/4/4/4 across battles 1–5) and a party
view that marked the rest of the roster "In camp". The owner has now decided every battle
fields all six; selection (which of the six, if ever fewer than six) is deferred, not
designed here. Enemies are untouched — that retune is a separate slice.

## Decision

**1. Every encounter authors six `teamId: 0` placements.** New refs
(`blue-briar`, `blue-ottoline`, `blue-corin`, `blue-isla`) were appended after each
battle's existing refs, so deploy-order ids stay stable.

**2. The "six shown, N fielded" state is retired from the render layer.** No encounter
fields fewer than six, so there is no "In camp" caption and no count. Party select reads
"Tap a member to manage them." `AC-V61` (`docs/10`) is struck through and marked retired,
not deleted.

**3. `save.deployment` survives as an ORDER seam, not a selection.** `shell.deployment()`
and `continueGame`'s clearing of a stale array are unchanged; a chosen deploy **order**
still reaches battle state.

**4. Enemies are not retuned here.** That is a separate slice's job.

## Evidence

Naive zero-prep run, unretuned foes, old (2/3/4/4/4) → new (6/6/6/6/6), all five battles:

| | Outcome | Turns | Survivors |
|---|---|---|---|
| Battle 1 | victory → victory | 5 → 10 | 2 → 6 |
| Battle 2 | victory → victory | 8 → 13 | 3 → 6 |
| Battle 3 | victory → victory | 17 → 16 | 4 → 6 |
| Battle 4 | victory → victory | 23 → 30 | 3 → 5 |
| Battle 5 (finale) | victory → victory | 29 → 37 | 2 → 5 |

The naive party clears the finale with zero deaths. This is a measurement, not a
difficulty claim — the enemies were not touched.

## Consequences

- Two tests are parked with `DEFERRED (six-deploy)` until the retune lands:
  `src/sim/campaign-run.test.ts` ("the campaign actually KILLS party members" — nobody
  dies) and `src/render/playtest.test.ts` ("spending at HOME wins where spending
  cheapest-anywhere does not" — both personas now clear 4 of 4). Re-arm both once the
  retune makes at least one battle lethal to a naive/zero-prep run again. The two older
  `DEFERRED (ADR-0041)` sites (one per file) stay parked, unrelated to this change.
- The finale is winnable by a naive party until the retune ships. No claim is made here
  about difficulty, pacing or fun for a real player — see root `CLAUDE.md`'s standing
  caveat that nobody outside the build has played it.
- The turn-order rail was checked at six friendlies, 832×328 and 832×384 (battles 1 and
  5): no clipping. Its chip strip is a fixed 8-slot window; battle 5's 9-unit board shows
  8 of 9 by design, not a defect (the chip labels are already `display:none` at these
  widths).
