# Retrospective

Three incidents in this session carried friction. Each produced one candidate lesson; all three pass the load-bearing test, and each gets exactly one home on the routing ladder. No lesson goes to auto-memory.

---

## Candidate lessons considered

| # | Signal | Candidate lesson | Verdict |
|---|--------|------------------|---------|
| 1 | **Urgent user correction** — you had to stop me before I ran a data backfill against staging | Staging shares its Postgres instance with production analytics; backfills there corrupt real dashboards | **Keep** — highest-friction correction of the session |
| 2 | **Rework** — two blind patches from the stack trace failed; a local repro cracked the bug | Reproduce a bug locally before patching from the stack trace | **Keep** — hard-won pattern, recurred (two failures before the fix) |
| 3 | **Rework ×3** — the API error-response mapper was regenerated three times on guessed shapes | The error-response shape is defined in `libs/shared/contracts`; code must be written against it, not guessed | **Keep** — three regenerations of one artifact |
| 4 | "Don't run destructive scripts on shared environments without confirmation" (generalization of #1) | — | **Drop as a separate item** — subsumed by lesson 1; a second prose rule saying the same thing is noise |
| 5 | The specific bug's fix details | — | **Drop** — session-local; a future agent gains nothing from the particulars of one fixed bug |

Load-bearing statements for the survivors:

1. A future agent, asked to run any data-writing script "against staging," will treat it as a production-impacting operation and stop for confirmation instead of proceeding.
2. A future agent facing a bug will build a local reproduction before writing a patch, instead of patching twice from the stack trace.
3. A future agent writing or regenerating anything that mirrors an API response shape will be forced (by the typechecker/linter) to use the contract types from `libs/shared/contracts` instead of guessing.

---

## Lesson 1 — Staging Postgres is shared with production analytics

**Routing walk:**
- *Rung 1 (lint/CI)?* No. The summary is explicit: nothing in the code indicates this. There is no diff a rule could inspect — the danger lives in infrastructure topology, not in any file.
- *Rung 2 (hook)?* No. A `PreToolUse` hook could only pattern-match command text ("backfill" + "staging"), but the dangerous surface is unbounded — `psql`, ad-hoc node scripts, ORM CLIs, a renamed script — so a keyword hook fails open on every variant while teaching false confidence. The lesson must inform judgment, not match a string.
- *Rung 3 (skill)?* No. This is not a procedure or heuristic; it is a fact about this project's infrastructure.
- **Rung 4 (CLAUDE.md): yes.** Why no guard or hook can carry it, in one line: the hazard is invisible in the repo — no tool that reads code or commands can know that two environments share a database.

**Proposed diff** — target: project `CLAUDE.md` (fictional monorepo), under an `## Environments` section (create it if absent):

```diff
+ ## Environments
+
+ - Staging shares its Postgres instance with production analytics. Any write-heavy
+   script run "against staging" (backfills, migrations run out-of-band, bulk updates)
+   corrupts real production dashboards. Never run one without explicit user
+   confirmation naming the target database. Nothing in the code indicates this —
+   the connection strings look like an ordinary isolated staging environment.
```

**Load-bearing because:** a future agent asks before writing to staging, which no guard can enforce since the danger is infrastructure the repo cannot see.

---

## Lesson 2 — Reproduce locally before patching

**Routing walk:**
- *Rung 1 / Rung 2?* No tool can decide "did you actually reproduce it?" — reproduction is a judgment-laden procedure, not a detectable code property or a fixed workflow moment.
- **Rung 3 (skill): yes — global.** "Reproduce a bug before patching it" transcends this repo entirely; it applies to any codebase. Per the ladder, it goes to `~/.claude/skills/`, not the project.

**Proposed diff** — target: `~/.claude/skills/debugging/SKILL.md` (new file, or this section added if the skill exists):

```diff
+ ---
+ name: debugging
+ description: Debugging method — use whenever fixing a reported bug, especially
+   one known only from a stack trace, log line, or user report.
+ ---
+
+ # Debugging
+
+ ## Reproduce before you patch
+
+ Build a local reproduction of the bug before writing any fix. A stack trace
+ shows where execution died, not why — patching from it alone is guessing, and
+ each failed guess costs a full edit-deploy-observe cycle. A repro turns the
+ same loop into seconds, and proves the fix by turning red to green. If you
+ cannot reproduce it, say so and treat any patch as a hypothesis, not a fix.
```

**Load-bearing because:** a future agent spends its first effort on a reproduction instead of burning two rounds of blind patches, as happened this session.

---

## Lesson 3 — Error-response shapes come from `libs/shared/contracts`

**Routing walk:**
- This reads like prose ("read the contract first"), but the skill's own test applies: *what tool could catch a violation?* A guessed shape is visible in code — the mapper declares or returns a locally-invented type instead of the one exported by `libs/shared/contracts`. That is machine-checkable.
- **Rung 1 (type constraint + lint rule): yes.** Stop at the highest rung; no skill or CLAUDE.md line needed once the typechecker refuses a guessed shape.

**Proposed diff, part A** — target: the mapper module (e.g. `libs/api/src/error-mapper.ts`): type it against the contract so any guessed shape fails `tsc`:

```diff
- interface ApiErrorResponse {   // locally guessed shape — remove
-   ...
- }
+ import type { ApiErrorResponse } from '@<org>/shared/contracts';

- export function mapError(err: unknown) {
+ export function mapError(err: unknown): ApiErrorResponse {
```

**Proposed diff, part B** — target: ESLint flat config for the API layer: forbid re-declaring contract shapes locally, so the constraint survives future rewrites of the mapper:

```diff
+ // libs/api/**: response/error shapes must come from shared contracts,
+ // never be re-declared locally.
+ {
+   files: ['libs/api/**/*.ts'],
+   rules: {
+     'no-restricted-syntax': ['error', {
+       selector: "TSInterfaceDeclaration[id.name=/^(Api)?Error(Response)?/], TSTypeAliasDeclaration[id.name=/^(Api)?Error(Response)?/]",
+       message: 'Error-response shapes are defined in libs/shared/contracts — import the type, do not redeclare it.',
+     }],
+   },
+ },
```

**Load-bearing because:** the next regeneration of the mapper fails typecheck/lint the moment it guesses, instead of shipping wrong three times — no agent has to remember to go read the contract.

*(Note: the general habit "find the source-of-truth contract before generating code against it" is real, but for this project the mechanical guard covers the incident; adding a prose rule on top would be a second home for the same lesson, which the ladder forbids.)*

---

## Summary of proposals

| Lesson | Rung | Target |
|---|---|---|
| Staging Postgres shared with prod analytics | 4 — uncheckable fact | project `CLAUDE.md`, "Environments" |
| Reproduce before patching | 3 — global skill | `~/.claude/skills/debugging/SKILL.md` |
| Contract shapes must be imported, not guessed | 1 — type constraint + lint rule | mapper module + API-layer ESLint config |

All three are proposals awaiting confirmation; nothing has been applied.
