# Retrospective

Three candidate lessons from this session. All three pass the load-bearing test; each gets exactly one home. Proposed diffs below — nothing is applied until you approve.

## Candidate lessons

### 1. Staging shares Postgres with production analytics (near-miss, urgent user stop)

**What happened:** I was about to run a data backfill script against staging. You had to stop me urgently: staging's Postgres instance is shared with production analytics, so backfills there corrupt real dashboards. Nothing in the code indicates this — it is pure infrastructure knowledge.

**Load-bearing test:** A future agent would refuse to run backfills (or any bulk write) against staging instead of assuming staging is a safe sandbox. Without a written rule, every future agent will make the same safe-looking, wrong assumption — the code cannot tell them otherwise.

**Routing:** This is an **invariant** — a fact that is simply true here, that an agent must not violate and could not derive from the code alone. That is the definition of a project `CLAUDE.md` entry. Not a skill: there is no procedure to follow, just a rule to check against, and a rule an agent must never violate has to be read on every task, not only when a skill triggers.

**Proposed diff:**

```
File: CLAUDE.md   (project root of the monorepo; under a "Environments" or "Invariants" section — create one if absent)
+ - **Staging is NOT isolated.** The staging environment shares its Postgres
+   instance with production analytics. Never run backfills, migrations-with-data,
+   or any bulk-write script against staging — it corrupts real production
+   dashboards. This is infrastructure knowledge; nothing in the code signals it.
```

Load-bearing because: a future agent treats staging as production-adjacent and stops before any bulk write, instead of assuming "staging" means "safe".

### 2. Reproduce the bug locally before patching (two failed blind patches)

**What happened:** I patched twice straight from the stack trace and both patches failed. What actually cracked the bug was reproducing it locally first.

**Load-bearing test:** A future agent facing a bug report reproduces it before writing a fix, instead of burning two rounds on plausible-looking blind patches.

**Routing:** This is **know-how that transcends this repo** — a method, not a fact about this codebase. Per the routing rule, that goes to a **global skill**: `~/.claude/skills/debugging/SKILL.md` (create it if it doesn't exist; otherwise add the section).

**Proposed diff:**

```
File: ~/.claude/skills/debugging/SKILL.md   (under "Before writing a fix"; create the skill if absent)
+ Reproduce the bug before patching it. A stack trace narrows *where*, not
+ *why* — patches written straight from the trace are guesses, and failed
+ guesses cost a full round-trip each. Get a local repro first; the fix is
+ then verified against it instead of hoped-for. (Earned: two blind patches
+ failed on the same bug that a local repro cracked immediately.)
```

If the skill file doesn't exist yet, create it with frontmatter:

```
---
name: debugging
description: Method for diagnosing and fixing bugs — reproduce before patching, verify the fix against the repro. Use when investigating any bug report, failing test, or stack trace.
---
```

Load-bearing because: a future agent's first debugging step becomes "get a repro", eliminating the blind-patch loop.

### 3. Error-response shapes live in `libs/shared/contracts` — read, don't guess (3× rework)

**What happened:** I regenerated the API error-response mapper three times because I kept guessing the shape. The shape is defined in `libs/shared/contracts`; reading it first would have made the first attempt correct.

**Load-bearing test:** A future agent writing anything against an API shape opens `libs/shared/contracts` first instead of inferring the shape from call sites or memory.

**Routing:** The general habit ("read the contract definition before generating code against it") is already what a competent agent should do; the load-bearing part is the **project-specific fact of where the contracts live** plus the rule to consult them. Between a procedure (project skill) and a rule checked against (CLAUDE.md), the rule wins here: it is one line, it applies to any task touching API shapes, and a dedicated project skill for a single pointer would be overhead the next agent may never trigger. → project **`CLAUDE.md`**.

**Proposed diff:**

```
File: CLAUDE.md   (project root of the monorepo; under "Conventions")
+ - API request/response shapes — including error responses — are defined in
+   `libs/shared/contracts`. Read the definition there before writing any
+   mapper, client, or handler against them; never reconstruct a shape from
+   call sites or memory. (A mapper was regenerated three times from guessed
+   shapes that one read would have prevented.)
```

Load-bearing because: a future agent's first move on any API-shape task is to open `libs/shared/contracts`, killing the guess-regenerate loop.

## Dropped

Nothing else in the session record clears the bar. The specific bug being debugged and the specific mapper content are session-local — they change no future behavior beyond the two lessons already captured above.

## Summary

| # | Lesson | Home | Why that home |
|---|--------|------|---------------|
| 1 | Staging shares prod-analytics Postgres; no bulk writes there | project `CLAUDE.md` | Invariant not derivable from code; must be read on every task |
| 2 | Reproduce a bug before patching | global skill `~/.claude/skills/debugging/` | Cross-project method (know-how) |
| 3 | API shapes are defined in `libs/shared/contracts`; read before writing | project `CLAUDE.md` | One-line project rule; a rule checked against beats a skill that may not trigger |

On your confirmation I would apply the approved diffs and leave the rest.
