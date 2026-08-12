# Architecture / Any Decision Records

Durable records of non-trivial decisions and **why** they were made. Append-only: to change a decision, add a new ADR that supersedes the old one (don't rewrite history). Create records with the `decision-record` skill.

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-customization-spine.md) | Customization spine = chassis + AP trees + hybrid jobs | Accepted | 2026-07-30 |
| [0002](0002-respec-model.md) | Respec = permanent progress, free experiments | Accepted | 2026-07-30 |
| [0003](0003-sdd-hybrid-approach.md) | Spec-driven development: hybrid (GDD now, Spec Kit at build) | Accepted | 2026-07-30 |
| [0004](0004-determinism-p0-invariant.md) | Determinism (seeded RNG + serializable state) is a P0 invariant | Accepted | 2026-07-30 |
| [0005](0005-agent-first-project-setup.md) | Agent-first project setup (config + skills + retrospective loop) | Accepted | 2026-07-30 |
| [0006](0006-agent-team-and-po-contract.md) | Specialized agent team with a Product-Owner contract | Accepted | 2026-07-30 |
| [0007](0007-tech-stack-web-typescript.md) | Tech stack = Web / TypeScript (pure headless sim + thin render) | Accepted | 2026-07-30 |
| [0008](0008-scheduler-tiebreak-precision.md) | Scheduler tie-break precision (id-keyed, lexicographic, charge-vs-charge) | Accepted | 2026-07-30 |
| [0009](0009-retrospective-at-pr-time.md) | Retrospectives trigger at PR time, not via a per-turn Stop hook | Accepted | 2026-07-30 |
| [0010](0010-pr4-charged-actions-scope.md) | PR4 charged-actions scope — faithful now vs deferred (AC-04/S4 partial) | Accepted | 2026-07-30 |
| [0011](0011-p1-customization-architecture.md) | P1 customization data architecture (battle-start resolution, 3 version lines, status split) | Accepted | 2026-07-30 |
| [0012](0012-p1-ap-economy-and-job-set.md) | P1 AP economy baseline + starting-job set (Knight/Monk/Black Mage/Thief) | Accepted | 2026-07-30 |
| [0013](0013-defer-facing-on-move.md) | Defer facing-on-move; ship the balance-probe AI against deploy facing | Accepted | 2026-07-31 |
| [0014](0014-diversity-gate-phased-target.md) | Diversity gate ships as a phased ≥N-with-manifest target, not a flat ≥8 | Accepted | 2026-08-02 |
| [0015](0015-fold-move-and-act-into-one-command.md) | Fold move+act into one Command (the pre-authorized fold) | Accepted | 2026-08-08 |
| [0016](0016-ttk-band-is-the-balance-baseline.md) | Time-to-kill is the balance baseline, enforced by test | Accepted | 2026-08-12 |
| [0017](0017-support-slot-goes-live.md) | The support slot gets real effects; a dead slot is a defect class | Accepted | 2026-08-12 |
