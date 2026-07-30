# Feature specs (Spec Kit)

Spec-driven development, hybrid model (ADR-0003, `docs/08` §5). The design docs in
`docs/` are the **authoritative source of truth**; these `specs/*/spec.md` files
are their Spec-Kit-shaped projection for the `specify → plan → tasks → implement`
workflow. Each spec **ports its source doc's "Acceptance Criteria (SDD-ready)"
section verbatim** as its requirements. On any conflict, the `docs/` file wins —
update it first, then re-derive the spec.

The project **constitution** lives at `.specify/memory/constitution.md`, ported
from `docs/00`.

| Spec | Source doc | Covers |
|---|---|---|
| [`001-combat-engine`](001-combat-engine/spec.md) | `docs/01` | CT turns, formulas, evasion, Zodiac/Faith, status, permadeath (the `[BASELINE]`) |
| [`002-job-system`](002-job-system/spec.md) | `docs/02` | 5-slot chassis, AP trees + mastery, hybrids, free respec (the core) |
| [`003-simulation`](003-simulation/spec.md) | `docs/05` | Scheduler + tie-break, resolution pipeline, seeded RNG, rewind, `BattleState`, schemas |
| [`004-encounters-ai`](004-encounters-ai/spec.md) | `docs/06` | Benchmark suite, AI test-harness, difficulty-without-inflation |

Creative docs (`docs/03` build-fantasy catalog, `docs/04` differentiators) stay
GDD references the specs cite, not specs themselves.

## Workflow from here (per feature)

Run the Spec Kit skills in order for the feature you're building next:
`/speckit-plan` → `/speckit-tasks` → `/speckit-implement` (optionally
`/speckit-clarify` before plan, `/speckit-analyze` before implement). Set
`SPECIFY_FEATURE` to the feature dir first. P0 builds `003-simulation` and
`001-combat-engine` first (the engine before the customization on top of it).
