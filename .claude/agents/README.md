# Agent team

Specialized subagents for developing *the-unseen-hand*, plus the Product-Owner operating contract that coordinates them.

## How this works (important)

In Claude Code the **main session is always the human's interlocutor** — subagents are spawned *by* it, run in isolation, and return results *to* it. They cannot independently talk to the user or gate who reaches the user. So:

- **Product Owner is the operating contract of the main session, not a background subagent.** The session you (the human) talk to acts as PO: it holds the product vision, is the single point of contact for requirements and decisions, and **delegates implementation to the specialists below** — it does not surface raw sub-agent chatter to you. `product-owner.md` documents this contract (and can also be spawned to synthesize requirements).
- **The specialists are delegatable subagents.** The PO (main session) invokes them via the Agent tool, gives them a scoped task, and integrates their returned results.

## Roster

| Agent | Owns | Active | Key skills/docs |
|---|---|---|---|
| `product-owner` | Vision, requirements, prioritization, delegation, human liaison | now | all docs; `decision-record` |
| `systems-designer` | Jobs/abilities/hybrids/economy/balance design | now | `game-design`, `brainstorm`, `grill-me`; `docs/02/03/07` |
| `fft-fidelity` | FFT baseline accuracy; verify constants vs BMG/FFHacktics | now | `docs/01`; web research |
| `reviewer` | Adversarial review of designs/specs/PRs | now | `grill-me`; acceptance criteria |
| `combat-engineer` | Pure/headless sim core, scheduler, determinism | **P0** | `sim-determinism-guard`; `docs/05` |
| `content-author` | Job/ability/status/battle data against schemas | **P0** | `docs/05` schemas, `docs/01` fidelity |
| `qe-tester` | Test plans, acceptance-criteria coverage; later, running tests + screenshots | partial now, full at **P0** | `docs/*` acceptance criteria |
| `playtester` | Player-experience critique; spawn **2–3** with distinct personas | design-level now, real play at **P0** | `docs/03` archetypes, `docs/00` |

"Active: P0" agents are defined now but do their real work once the tech stack is locked and code/build exists (`docs/08`). Their `tools:`/`model:` scoping should be revisited then.

## Playtester personas (spawn 2–3 in parallel)

- **Newcomer** — first time with a tactics RPG; tests onboarding and the 2-hour-bounce risk.
- **Min-maxer / theorycrafter** — hunts the dominant build; tests anti-convergence and no-free-win-buttons.
- **Veteran tactician** — FFT/Tactics-Ogre veteran; tests depth, fidelity feel, and QoL expectations.

## Conventions

- Design/review/fidelity/playtest agents are **read-only** (no code edits) — they produce findings/proposals the PO integrates.
- `combat-engineer` and `content-author` may edit code/data, and must honor the determinism invariant (`sim-determinism-guard`) and the doc acceptance criteria.
- Model/tool scoping is left conservative now (mostly inherit); tune per agent at P0 (see `task-model-routing` for cheap-vs-strong routing once tasks exist).
