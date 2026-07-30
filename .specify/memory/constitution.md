# The Unseen Hand — Constitution

> Ported from `docs/00-vision-and-pillars.md` (the constitution seed) at P0, per
> `docs/08` §5 and ADR-0003. `docs/00` remains the authoritative source; this
> file is its governing-principles projection for the Spec Kit workflow. When the
> two disagree, update `docs/00` first, then re-derive this file.

## Core Principles

### I. Customization sandbox (Pillar 1)
Depth over breadth. Success is measured not by the *number* of options but by the
number of *meaningfully different, viable* builds. **Opportunity cost is sacred** —
the anti-convergence law (`docs/02`) is non-negotiable: no loadout may hold two
mutually-exclusive strong branches at once, and deployment is capped below roster
size. Every new customization mechanic must earn a currency row (`docs/02` B0) and
feed a real archetype (`docs/03`), or it is cut.

### II. Intensive job system (Pillar 2)
A broad, branching job web with **directed** progression — spend AP to walk trees,
never passive grind. **Mastery is permanent and portable**; learned abilities and
masteries are never lost, consumed, or refunded across job changes, death, or
loadout swaps (ADR-0002).

### III. Tactical grid combat (Pillar 3)
The faithful FFT CT/clock-tick engine (`docs/01`): true per-tile height, facing,
charge timing on a single shared timeline. Fidelity to the PSX (1997) numeric
baseline is a contract, not an approximation — constants are illustrative until
verified against AeroStar's BMG / FFHacktics and pinned by a golden test-vector
(`docs/01` §12).

### IV. Readable, low-friction UX (Pillar 4)
Deep math, honest interface. **Resolution transparency** (hit %, damage, CT
forecast, hidden Faith/Zodiac multipliers) is adopted fully. **Progression
discovery** (what a fusion becomes) is preserved — hinted, not spoiled.
Accessibility is first-class, not a footnote (`docs/04`).

### V. Determinism is an architectural invariant (P0, NON-NEGOTIABLE)
A battle SHALL be byte-for-byte reproducible from `(seed, ordered commands)`
(ADR-0004, `docs/05` §3). One seeded PRNG drives all randomness in a declared
roll order; no unseeded randomness or wall-clock ever enters sim code; integer
math is floored per step in the documented order; the scheduler tie-break is
pinned; the sim core is pure, headless, and serializable. Rewind, saves, and
build-sharing all depend on this — retrofitting it later is a rewrite.

### VI. Respec = permanent progress, free experiments (ADR-0002)
Learned abilities/masteries are permanent; changing any loadout slot in the prep
screen costs no resource and is reversible. Early experimentation can never
permanently gimp a character.

## The customization spine (the identity — do not dilute)

Three axes ARE the game; everything else is `[OPTIONAL]`/`[DEFERRED]` and gated
behind the build-fantasy catalog (`docs/03`) and cut-lines (`docs/08`):

1. **5-slot ability chassis** — cross-job recombination (FFT's soul).
2. **AP-driven job & skill trees** — directed investment + permanent mastery.
3. **Hybrid / fusion jobs** — combinatorial discovery; the top replay driver.

This spine is a locked decision (ADR-0001). Promoting a secondary axis to core, or
adding a fourth spine axis, requires a new ADR.

## Success criteria (acceptance tests, not aspirations)

1. **Build diversity.** Against the benchmark suite (`docs/06`), **≥ 8 distinct
   archetypes** (`docs/03`) clear within a defined efficiency band, with **no
   single dominant build** clearing everything at top efficiency.
2. **Generic ≈ unique.** A fully-built generic can rival a named unique; uniques
   are premium chassis with a signature trait, not premade gods.
3. **Investment, not grind.** Reaching a target build is bounded by a defined
   grind budget (`docs/07`); no degenerate farming loop is ever optimal.
4. **No free win-buttons.** Every high-power option has telegraphed counterplay.
5. **No 2-hour bounce.** A new player reaches a first satisfying self-made build
   within the onboarding arc (`docs/08`) without needing a wiki.

## Non-goals (scope guardrails)

- **Not** a narrative engine (that is the separate story repo); battles are
  data-driven placeholders until the story layer arrives.
- **Not** a faithful *content* clone — we recreate FFT's *mechanics*, not its
  maps/characters/story.
- **Not** an MMO / live-service; single-player, sharing via deterministic build
  codes, not netcode.
- **Not** chasing photorealism or a large art budget — scope discipline is a
  design input.

## Governance

This constitution projects `docs/00` and the locked ADRs (`docs/adr/`); together
they supersede ad-hoc practice. Every feature spec (`specs/*/spec.md`) MUST honor
these principles, and every plan/PR MUST verify compliance — determinism (V),
anti-convergence (I), respec permanence (II/VI), and FFT-fidelity (III) are the
standing review gates. Amending a locked decision requires a new ADR (via the
`decision-record` skill) that supersedes the old one; do not relitigate settled
calls silently. Runtime development guidance lives in `CLAUDE.md`.

**Version**: 1.0.0 | **Ratified**: 2026-07-30 | **Last Amended**: 2026-07-30
