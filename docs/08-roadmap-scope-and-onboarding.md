# 08 — Roadmap, Scope & Onboarding

How the design becomes a game, what a small team must cut to ship, how a new player is taught, and where the narrative repo plugs in.

---

## 1. Phased roadmap

> **Scope note.** The phases below are the **engine** roadmap. The **game** roadmap — the shell, the campaign container, persistence, story delivery, equipment, failure handling — lives in **`docs/11`**, which also defines the **MVP slice (M0)** that should come before deepening any of this. `docs/11` records the call that P2's diversity-gate exit criterion is *not* an MVP blocker.

Guiding rule: **foundational invariants come first, even if their UI comes later.** The architect's warning (`docs/05` §3) is honored — determinism and data-driven state are P0, not features bolted on late.

| Phase | Goal | Ships | Notes |
|---|---|---|---|
| **P0 — Core loop** | Prove the engine | Grid + CT tick scheduler (with pinned tie-break) + move/attack; **seeded RNG + serializable BattleState from day one**; formula test-vectors wired as tests | Rewind *substrate* exists here; no UI yet |
| **P1 — Chassis + data** | Prove customization | 5-slot loadout; 3–4 base jobs; **data-driven job/ability/battle schema** (`docs/05` §6); AP purchase; **Spec Kit initialized** (see §5) | Battles are data now, so story battles can slot in later |
| **P2 — Customization depth** | The pillar | Full 5+2 slots, per-job trees, mastery bonuses, free respec, transparency previews | Run the build-diversity metric for the first time |
| **P3 — Enhancements** | Differentiators | Hybrid/fusion jobs, **rewind UI**, scan, speed toggle; evaluate `[OPTIONAL]` sockets against `docs/03` | Cut-line decisions get made here |
| **P4 — Content, balance, polish** | Ship-shape | Encounter suite, balance passes vs. the metric, difficulty toggles, onboarding, accessibility, build-sharing | New Game+ if scope allows |

### 1a. Progress against the phases

> **This is an authored checklist, not a derived one.** `npm run state` renders the phase
> timeline from `scripts/state-content.ts`, and CI fails if the committed dashboard drifts
> from that source — but that check proves *the HTML matches the source*, *not* that the
> source matches reality. A phase marked done stays marked done until a human corrects it.
> Re-check this list whenever you touch the roadmap, and treat a tick as a claim that needs
> evidence (a shipped file, a passing AC), not as proof. Last reconciled against the code
> on **2026-08-18**; a stale header here once claimed "pre-code" against 428 passing tests,
> a later one claimed P3 while P3's own deliverables were unshipped, and a third still read
> `N = 6` two slices after the gate reached 7.

**P0 — Core loop · LANDED.** Grid, CT scheduler with pinned tie-break, move/attack, seeded
RNG, serializable `BattleState`, formula vectors as tests. Command-replay substrate exists
(`docs/05` §3b).

**P1 — Chassis + data · LANDED.** 5-slot loadout, base job set, data-driven
job/ability/encounter schemas, AP purchase, Spec Kit initialized (`.specify/`, `specs/`).

**P2 — Customization depth · IN PROGRESS.** The current phase.

- [x] Per-job trees, mastery bonuses, free respec (AC-J4)
- [x] **Resolution-transparency previews** — hit %, named facing arc, exact damage, HP
      before→after, and the CT price of the turn as staged (`docs/10` §4). Shipped with the
      playable viewer; this is a **P2** deliverable, not P3.
- [x] Build-diversity gate exists, runs live in CI, and can FAIL (ADR-0014)
- [x] **All five chassis slots are live** — support (ADR-0017), reaction (ADR-0019),
      movement (ADR-0020). The customization spine's first axis is complete.
- [ ] **The gate reaches the release bar — N ≥ 8. Currently N = 7.** ⚠ **NOT an MVP blocker
      (user decision, 2026-08-19): carried into `docs/11`'s M1, after the M0 playable slice.**
      The criterion is unchanged — `DIVERSITY_TARGET_N` stays 7, the gate still fails CI on a
      drop, ≥ 8 is still the release bar; only its due date moved.
      Detail: `DIVERSITY_TARGET_N` lives in `src/sim/gauntlet.ts`. The MEASURABLE manifest
      holds **9 builds** over **7 distinct signature prefixes** — `black-magic.` and
      `punch-art.` each have two carriers, so two builds add no identity.
      Remaining EXCLUDED entries: `aggro-tank` (provoke/threat — re-measured 2026-08-18: it
      now clears 6/6, but its rows are byte-identical to `counter-wall`, so it is blocked
      from being *distinct*, not from being measured), `battle-cleric` (prefix collapse —
      structurally uncountable), `warlord` (boss chassis, not an archetype). `counter-wall`
      is no longer excluded — ADR-0019 moved it to MEASURABLE, where its `punch-art.`
      prefix collapses onto `faithzero-monk`'s and adds no identity.
      **No remaining EXCLUDED entry can supply a new prefix**, so the eighth identity must
      come from new content or a new mechanic, not from retiring an exclusion.
- [ ] MP enforcement. Blocked, deliberately: two of the seven counted identities ride
      unenforced MP — `white-magic.` (holy costs 56 MP off a 24 budget) and `summon.` — so
      enforcing it today would drop the count. Needs durable carriers first. (The old
      **N 6→4** figure was measured at N = 6 and has NOT been re-measured since; treat it
      as a direction, not a number.)

**P3 — Enhancements · NOT STARTED.** Hybrid/fusion jobs (partial sim support in `job.ts`;
no player-facing path), **rewind UI** (the substrate exists, the UI does not), scan, speed
toggle.

**P4 — Content, balance, polish · NOT STARTED.**

## 2. Scope & cut-lines (for a small/solo team)

The single most important discipline. **Minimum viable job system that still delivers the fantasy = the three spine axes + a handful of jobs.** Everything else is negotiable.

| Feature | Tier | If cut… |
|---|---|---|
| 5-slot chassis + secondary | **Must** | there is no game |
| AP trees + mastery + free respec | **Must** | the "intensive job system" pillar collapses |
| ~10–14 base jobs | **Must** | (fewer than ~8 and builds don't diverge) |
| Determinism / serializable state | **Must** | rewind, saves, and sharing all become rewrites |
| Encounter benchmark suite | **Must** | balance is unverifiable |
| Hybrid/fusion jobs | **Should** | **curated set only** — cap the count; the full N² web is a content trap |
| Rewind UI, scan, speed toggle | **Should** | modern players expect them, but game is playable without |
| Gear-as-ability + sockets | **Could** | keep only if it keeps feeding `docs/03` archetypes (#11/#12/#14) |
| Build-sharing / codes | **Could** | free-ish given determinism; not a launch blocker |
| Weapon skill-trees, set bonuses | **Cut without regret** | fold into AP trees; revisit only if playtest demands |
| Behavior scripting / gambits | **Cut without regret** | `[DEFERRED]` post-1.0; wrong spine for manual tactics |
| Monster breeding, propositions | **Cut without regret** | `[BASELINE]` flavor; nice later, not now |

> **Log every cut.** Silent truncation reads as "we covered everything." When a system is cut or capped (e.g. "shipping 12 hybrids, not 190"), say so in the changelog so scope stays honest.

## 3. Onboarding & complexity ramp

Deep job systems' #1 failure is the **2-hour bounce**. The counter is **progressive disclosure**, mirrored by the economy ramp (`docs/07` §4):

- **Hour 1:** move, attack, CT turn order, one job, the primary command. No permanent choices yet.
- **Reversible early choices:** the tutorial arc **cannot permanently gimp** a character — free respec (`docs/02` B7) means early experiments are safe by design.
- **Guided first build:** a scripted moment where the game walks the player through equipping a secondary + a reaction, so the recombination "aha" happens on rails once, then is theirs.
- **Staged unlocks:** secondary command → reaction/support/movement → trait slots → first hybrid, each introduced with its own beat (Act structure, `docs/07` §4).
- **Teach vs. trust:** *resolution* is always taught (previews, tooltips-everywhere option); *progression discovery* (what a hybrid becomes) is trusted to exploration (`docs/04` §3).
- **Transparent requirements:** unlock *requirements* are shown in-game (FFT's opacity was a flaw) — you never need a wiki to know how to progress.

## 4. The narrative-repo seam (data contract)

Story and content come from a **separate, not-yet-started repo**. This engine stays narrative-agnostic by consuming a **battle-definition data contract** (schema in `docs/05` §6). A story battle file must provide:

- `map` id + `deployZones` + enemy/guest `spawns` (with jobs, loadouts, levels)
- `victory` / `defeat` conditions (defeatAll / defeatBoss / survive N / reach-tile / escort / protagonist-KO)
- pre/mid/post-battle `events` hooks (dialogue triggers, reinforcements — dialogue itself lives in the story repo)
- `loot` / rewards and a `seed`
- unique-character references (which resolve to `docs/02` B6 "premium chassis" units)

As long as the story repo emits this contract, no engine change is needed to add content. Keep the contract **versioned** (`docs/05` §5).

## 5. Spec Kit adoption seam (the SDD hybrid, confirmed)

At **P0/P1**, initialize **[GitHub Spec Kit](https://github.com/github/spec-kit)** (installs into Claude Code natively):
1. `specify init` in the repo.
2. Port **`docs/00`** → `constitution` (its pillars, spine, success criteria, non-goals become governing principles).
3. Port each **buildable-system doc** → `specs/<feature>/spec.md`, lifting the **Acceptance Criteria** sections verbatim as the spec's requirements: `01`→combat-engine, `02`→job-system, `05`→simulation, `06`→encounters-ai.
4. Generate `plan.md` + `tasks.md` per feature at implementation time.
- Creative docs (`03`, `04`) remain GDD references the specs cite, not specs themselves.
- Rationale for waiting: SDD specs describe features you're about to *build*; doing it before P0 would spec systems that might still be cut (§2).

## Acceptance Criteria (SDD-ready)

- **AC-R1 (P0 invariants):** P0 SHALL land seeded RNG + serializable BattleState + the pinned scheduler before any customization feature.
- **AC-R2 (data-driven):** By end of P1, jobs, abilities, statuses, and battles SHALL be defined in external data validated against the `docs/05` schemas, not hard-coded.
- **AC-R3 (diversity gate is CI):** From P2, the build-diversity metric (`docs/00`, `docs/06` AC-E2) SHALL run in the benchmark suite each balance pass.
- **AC-R4 (narrative contract):** The engine SHALL load any battle satisfying the `docs/05` §6 battle schema without code changes.
- **AC-R5 (cut log):** Every capped/cut system SHALL be recorded in a visible changelog with what was dropped.
