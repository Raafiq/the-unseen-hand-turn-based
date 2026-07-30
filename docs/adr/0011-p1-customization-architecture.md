# ADR-0011: P1 customization data architecture

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Product Owner (main session) + Plan/reviewer synthesis, P1 kickoff

## Context

P1 adds the customization spine (ADR-0001) to a sim whose P0 invariant is
byte-for-byte determinism (ADR-0004): a battle SHALL be reproducible from
`(seed, ordered commands)`, the sim core is pure/headless, and `BattleState` is
plain-data serializable. P1 introduces the *first* data-driven content layer
(jobs/abilities/statuses as external data, AC-R2) plus persistent character
progression (AP, learned abilities, masteries, loadout). This raises three
cross-cutting questions that will bind every subsequent slice, so they are
settled once here rather than relitigated per PR:

1. Where does the equipped loadout live relative to `BattleState`?
2. How many schema-version lines exist, and how do they relate?
3. Do status effects become data, code, or both?

See `docs/05` §3 (determinism), §4 (stat derivation), §6 (schemas); `docs/02`
(chassis); ADR-0010 (the `ChargeEffect` self-containment precedent).

## Options considered

1. **Loadout lives in `BattleState` as references into the content registry.**
   Compact state. But `replay(seed, commands)` would then depend on external
   content — a job/ability data edit between save and load could silently change
   or desync a replay, breaking the P0 determinism guarantee. Rejected.
2. **Loadout resolves into self-contained battle payloads at battle-START.**
   A one-way bridge (`build.ts`) reads the registry once at construction, runs the
   `docs/05` §4 derivation pipeline, and embeds resolved `BattleAbility` payloads
   on each `UnitState`. Mirrors the existing `ChargeEffect` pattern ("self-contained
   so a serialized charge resolves without re-reading an ability book", ADR-0010).
   `replay` never touches the registry. Chosen.
3. **One global schema version across battle + campaign + content.** Simple to
   count, but couples three independently-evolving artifacts: a content-only edit
   would force a battle-save migration and vice-versa. Rejected.

## Decision

- **The loadout resolves at battle-start; it does not live in `BattleState` as
  registry references.** `build.ts` is the single one-way bridge
  (`record + registry → BattleState`); nothing flows back mid-battle. Sim
  resolvers take only `BattleState` + ids — **never the registry** — so replay
  stays registry-free and deterministic.
- **Three independent schema-version lines**, each with its own `MIGRATIONS` map,
  `MIN_SUPPORTED_*`, and loud-fail codec (the `state.ts:deserialize` pattern):
  `SCHEMA_VERSION` (battle), `ROSTER_SCHEMA_VERSION` (persistent Unit save record),
  `CONTENT_SCHEMA_VERSION` (data packs). A number's meaning is never reused across
  codecs.
- **Status behavior = code, status tuning = data.** The catalog
  (`StatusEffectSchema`: durationCT, ctFactor, dispellable) is authored data;
  the *reading* of a status (CT factor in the scheduler, interrupt rules in charge
  resolution) stays in code. At inflict time the resolved behavior is copied onto a
  self-contained `ActiveStatus` on the unit, so a running/replayed battle never
  needs the catalog.

## Consequences

- **Determinism is preserved by construction** — a content edit can never desync a
  saved battle, because the battle carries its own resolved payloads.
- **Clean seams:** content authoring, character progression, and battle state
  version independently; a new job pack doesn't touch battle saves.
- **What we give up:** `BattleState` grows (embedded ability + active-status
  payloads = larger saves and more migration surface — this plan bumps
  `SCHEMA_VERSION` v4→v7), and there is transient duplication (the inline `weapon`
  lives beside the new ability projection during transition; a cleanup pass is
  owed once all resolvers read the projection).
- **New invariant for all P1+ sim code:** resolvers accept `BattleState` + ids
  only; any registry lookup happens at build-time in `build.ts`. Missing-id lookups
  fail loudly (the `SchemaVersionError` discipline), never a non-null assertion.
  `awardAp` derives from the deterministic battle result, never Map iteration order
  or wall-clock.

## References

- ADR-0001 (spine), ADR-0004 (determinism), ADR-0010 (`ChargeEffect` self-containment).
- `docs/05` §3/§4/§6; `docs/02`; `specs/002-job-system/spec.md` (AC-J1..J8), `specs/003-simulation`.
- Companion: ADR-0012 (P1 AP economy + starting-job set).
