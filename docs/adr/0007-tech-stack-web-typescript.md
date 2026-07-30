# ADR-0007: Tech stack = Web / TypeScript (pure headless sim + thin render layer)

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** maintainer + Product Owner (P0 kickoff)

## Context

P0 begins and the deferred tech-stack decision (`docs/09`, ADR-0003 seam) must be
locked before code lands. The stack must satisfy the P0 invariants — a
deterministic, pure, headless, unit-testable sim (`docs/05` §3, ADR-0004) — and
the data-driven/moddable content model (`docs/05` §6). It must also iterate fast
in this headless cloud environment and not foreclose a faithful **isometric**
renderer later (`docs/01` §7: true per-tile height + facing).

## Options considered

1. **Web / TypeScript** — a pure TS `sim/` core (zero render deps, fully
   unit-testable against the formula vectors) + a thin render/UI layer added
   later. Fastest iteration here; JSON/TS data + a schema validator (Zod) map
   cleanly to the data-driven design; seeded PRNG and serializable state are
   trivial in pure TS. Isometric is a pure projection function in the render
   layer (grid height/facing live in `BattleState`), so the renderer pick
   (PixiJS / Phaser / Three.js ortho) is deferred with no risk to the engine.
2. **Godot 4** — strong 2D/iso editor and height tooling for the eventual UI,
   but weaker to preview headlessly here (slower iteration *now*), and a
   GDScript/C# sim is less trivially unit-testable than pure TS (rejected for P0).
3. **Unity (C#)** — capable but heavy; overkill for a 2D grid-tactics game at
   this scope and heavier to run headlessly (rejected).

## Decision

Option 1: **Web / TypeScript**, structured as a pure headless `src/sim/` core
with `src/render/` reserved for later. P0 toolchain: **TypeScript `strict`**,
**Vitest** (headless unit tests: golden vectors + replay-equality), **Zod**
(runtime validation of data-driven content, `docs/05` §6), **Vite** (dev/build
for the eventual render layer; P0 stays headless), **ESLint** with a determinism
guard forbidding `Math.random` / `Date.now` / `new Date` in `sim/`, and **npm**.
The isometric renderer (leaning PixiJS) is chosen at P1/P2, not now.

## Consequences

- **Easy/better:** fast iteration in this env; determinism invariants (ADR-0004)
  are natural in pure TS; content stays data + schema; the sim is importable by
  both the UI and the benchmark suite (`docs/06`).
- **What we give up:** no built-in isometric/height *editor* (Godot's strength) —
  we hand-roll grid tooling and the iso projection. Accepted: P0 is headless and
  the projection is a small pure function; maps are authored as data regardless.
- **Invariants this creates:** sim code stays render-free and determinism-clean
  (enforced by the ESLint guard + `sim-determinism-guard` skill + a
  replay-equality test); grid height + facing are first-class in `BattleState`
  so any renderer can consume them.

## References

- `docs/09` (stack lean), `docs/05` §3/§6, `docs/01` §7, `docs/08` §5 (Spec Kit).
- Prior ADRs: ADR-0003 (SDD hybrid), ADR-0004 (determinism invariant).
