# Agent team

Specialized subagents for developing *the-unseen-hand*, plus the Product-Owner operating contract that coordinates them.

## How this works (important)

In Claude Code the **main session is always the human's interlocutor** — subagents are spawned *by* it, run in isolation, and return results *to* it. They cannot independently talk to the user or gate who reaches the user. So:

- **Product Owner is the operating contract of the main session, not a background subagent.** The session you (the human) talk to acts as PO: it holds the product vision, is the single point of contact for requirements and decisions, and **delegates implementation to the specialists below** — it does not surface raw sub-agent chatter to you. `product-owner.md` documents this contract (and can also be spawned to synthesize requirements).
- **The specialists are delegatable subagents.** The PO (main session) invokes them via the Agent tool, gives them a scoped task, and integrates their returned results.

## Roster

| Agent | Owns | Active | Seat | Key skills/docs |
|---|---|---|---|---|
| `product-owner` | Vision, requirements, prioritization, delegation, human liaison | now | `opus` | all docs; `decision-record` |
| `systems-designer` | Jobs/abilities/hybrids/economy/balance design | now | `opus` | `game-design`, `brainstorm`, `grill-me`; `docs/02/03/07` |
| `fft-fidelity` | FFT baseline accuracy; verify constants vs BMG/FFHacktics | now | `sonnet` | `docs/01`; web research |
| `reviewer` | Adversarial review of designs/specs/PRs | now | `opus` | `grill-me`; acceptance criteria |
| `combat-engineer` | Pure/headless sim core, scheduler, determinism | now | `sonnet` | `sim-determinism-guard`; `docs/05` |
| `viewer-engineer` | `src/render/` — renderer, camera, terrain painting, shell screens, the click seam | now | `sonnet` | `src/render/CLAUDE.md`; `docs/10` |
| `art-director` | How it LOOKS — treatments, palettes, map art, tokens, motion | now | `opus` | ADR-0028/0030; `index.html` tokens |
| `docs-steward` | The written record — docs, ADRs, Acceptance Criteria, `docs/NEXT.md` — and auditing it for drift | now | `sonnet` | `docs/` outranks the code; `decision-record` |
| `release-engineer` | Branches, commits, PR bodies, CI to green, the Pages deploy | now | `sonnet` | `pages.yml`; the check-runs API |
| `content-author` | Job/ability/status/battle data, and a battle's terrain | now | `sonnet` | `docs/05` schemas, `docs/01` fidelity |
| `qe-tester` | Whether a test can FAIL; coverage against the ACs; defect repro | now | `sonnet` | `docs/*` acceptance criteria |
| `playtester` | Player-experience critique; spawn **2–3** with distinct personas | now | `sonnet` | `docs/03` archetypes, `docs/00` |

**Seat** is the agent's default `model:`, set by the routing table in `CLAUDE.md` (open
judgment → `opus`, specced execution → `sonnet`). Override per spawn when the task is more
open or more mechanical than the agent's usual work. Never `fable`.

**Every agent is active.** The roster was written on 2026-07-30 against a repo with no
code, and four of them still said "until the stack is locked" / "pre-code" / "play on
paper" long after P0 and P1 had landed — which reads as *not my job yet* on work that is
squarely theirs. Rewritten 2026-08-30. If you find another pre-code gate, it is stale;
delete it.

Two boundaries worth stating because they are new and adjacent:

- **`qe-tester` vs `viewer-engineer`.** Judging whether a *screen looks right* is the
  viewer engineer's job and its accountability. `qe-tester` judges whether the *checks*
  around it can fail — that a contrast spec measures what it claims, that an analyzer is
  asked how many nodes it actually looked at.
- **`content-author` vs `viewer-engineer`.** A battle's painted terrain and props are
  **content**, authored in the `TERRAIN` table in `src/render/campaign-data.ts` even though
  that is a `.ts` file under `src/render/`. The renderer that paints it is the viewer
  engineer's.

## Known coverage gaps — escalate, do not absorb

Work the roster does **not** own today, found by asking who should have done what the main
session actually did. Each is a hiring or promotion conversation with the owner, not a task
to quietly pick up.

| Uncovered work | Resolved |
|---|---|
| **The written record** — docs, ADRs, Acceptance Criteria, `docs/NEXT.md`. Every word of ADR-0030 and ADR-0031 was written by the main session, and a review found three of their claims false. | **HIRED: `docs-steward`** (owner, 2026-08-30) |
| **Repository and release operations** — branches, commits, PR bodies, CI, the Pages deploy. | **HIRED: `release-engineer`** (owner, 2026-08-30) |
| **Process and tooling** — retrospectives, lint rules, hooks, CI guards, and the agent definitions themselves. | **STAYS WITH THE PO** (owner, 2026-08-30). An agent that rewrites its own team's definitions is a strange loop, and the `retrospective` skill is already approval-gated. This is the PO's one legitimate exception to "does not do the work" — do not quietly widen it. |

Three things stay the PO's by definition and are **not** gaps: deciding what to build,
speaking to the human, and the process/tooling exception above.

**A NEW AGENT FILE IS NOT LIVE UNTIL THE SESSION RELOADS ITS ROSTER.** `docs-steward` and
`release-engineer` were written and committed on 2026-08-30 and could not be spawned in the
session that wrote them — the Agent tool reported them as not found. Write them, commit
them, and expect them on the next session; do not conclude the definition is broken.

## Playtester personas (spawn 2–3 in parallel)

- **Newcomer** — first time with a tactics RPG; tests onboarding and the 2-hour-bounce risk.
- **Min-maxer / theorycrafter** — hunts the dominant build; tests anti-convergence and no-free-win-buttons.
- **Veteran tactician** — FFT/Tactics-Ogre veteran; tests depth, fidelity feel, and QoL expectations.

## Conventions

- **THE PO IS COMMAND CENTER AND DOES NOT DO THE WORK (owner, 2026-08-30).** Every piece
  of work goes to an agent; the PO decides, scopes, sequences, integrates, quality-gates
  and talks to the human. Work no agent covers is **escalated** — name the gap, propose a
  new hire or the promotion of an existing agent, and wait for the call. Absorbing it
  quietly is the failure this roster exists to prevent, and it went unnoticed for a whole
  session in which the agents were never once invoked.
- Design/review/fidelity/playtest agents are **read-only** (no code edits) — they produce findings/proposals the PO integrates. `art-director` is read-only *for shipped source*: it may write mockups and capture scripts to a scratch path, because its whole contract is to argue with rendered pictures rather than prose.
- `combat-engineer` and `content-author` may edit code/data, and must honor the determinism invariant (`sim-determinism-guard`) and the doc acceptance criteria.
- Model/tool scoping is left conservative now (mostly inherit); tune per agent at P0 (see `task-model-routing` for cheap-vs-strong routing once tasks exist).
