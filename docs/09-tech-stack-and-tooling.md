# 09 — Tech Stack & Tooling

**Decision status: deferred (recommend-and-defer).** Docs stay engine-agnostic; we lock the stack at P0 (`docs/08`). This is a one-page lean, not a weighted matrix — building a decision matrix to *defer* a decision is paralysis bait.

---

## 1. Stack lean (revisit at P0)

**Leaning: Web / TypeScript.** Rationale for *this* project and *this* environment:
- **Iteration** is fastest here (build/preview in a browser; the game runs cross-platform without per-OS packaging).
- **Data-driven, moddable content** (`docs/05` §6) maps cleanly to JSON/TS data + a schema validator (e.g. Zod) — a stated selection criterion.
- **Deterministic sim** (`docs/05` §3) is straightforward in a pure TS core with an injected seeded PRNG; the sim can be a headless module the UI and the benchmark suite (`docs/06`) both import.
- Suggested shape: a **pure TS `sim/` core** (no rendering deps, fully unit-testable against the formula vectors) + a thin render/UI layer (Canvas/Pixi/Phaser for the isometric grid; DOM/React for the deep job & loadout menus).

**Alternatives considered (kept open):**
- **Godot 4** — excellent for 2D/isometric tactics and a strong editor; weaker to preview in this headless cloud env, so slower iteration *here* (a reason to lean web now, not a knock on Godot for the real build).
- **Unity** — capable but heavy; overkill for a 2D grid tactics game at this scope.

**Selection criteria to re-check at P0:** team familiarity; isometric/height tooling; headless-testability of the sim; moddability of the deep job data; deploy targets; determinism guarantees of the RNG.

## 2. AI-assisted development tooling

- **GitHub Spec Kit `[adopt at P0/P1]`** — the SDD backbone (`docs/08` §5). Installs into Claude Code natively; drives constitution → specify → plan → tasks → implement from these docs.
- **`skill-creator`** *(already available)* — build a **project-specific skill** later, e.g. an "FFT-formula authoring" or "job-data authoring" skill that enforces the `docs/05` schemas and the `docs/01` fidelity contract.
- **`session-start-hook`** *(available)* — once code exists, set up a SessionStart hook so web sessions can run the sim's test suite and linter automatically.

## 3. Helper skills for the design loop (recommended, not installed)

You asked me to find skills for brainstorming, "grill me," etc. Status and how to enable:

| Skill / plugin | Use it for | Availability |
|---|---|---|
| **`brainstorming`** | Divergent ideation for jobs/abilities/hybrids and encounter concepts | **Not in your library yet** — enable from the skills catalog on claude.ai (Settings → Capabilities → Skills), then invoke with `/brainstorming` |
| **`grill-me`** | Adversarial interrogation of a design before building — pressure-tests specs (pairs perfectly with the `docs/*` Acceptance Criteria) | **Not in your library yet** — enable the same way, invoke `/grill-me` |
| **`design`** plugin | Structured design critique / UX-copy / accessibility audit for the job & loadout menus (`/design:critique`, `/design:accessibility`) | Available in your `knowledge-work-plugins` catalog — install from the plugin catalog |
| **`dataviz`** *(available)* | Any in-game charts, stat readouts, the turn-order timeline, build-planner visuals | Already available |
| **`canvas-design`** *(available)* | Key-art / poster / marketing visuals later | Already available |

> Note: `brainstorming` and `grill-me` did **not** appear in a search of your current claude.ai skill library, so they must be enabled before `/brainstorming` or `/grill-me` will resolve. The `design` plugin *is* in your org catalog and can be installed directly.

## 4. What this repo commits to *now*

Nothing technical. No dependencies, no framework, no build tooling — just the design docs. The first code lands at **P0** under whatever stack we confirm then, following the Spec Kit flow (`docs/08` §5).
