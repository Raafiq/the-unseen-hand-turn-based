---
name: retrospective
description: Run a retrospective on the session — harvest the load-bearing lessons from corrections, rework, and hard-won patterns, then route each to an automated guard (lint rule, hook, CI check), a skill, or CLAUDE.md as a concrete diff. Use when the user asks for a retrospective, post-mortem, or "what did we learn"; says "so this doesn't happen again" or "so the next agent doesn't repeat this"; or after a multi-step session with repeated corrections or rework.
---

# Retrospective

A retrospective harvests **lessons** from a finished session and writes them where the next agent will actually read them. The whole job is one judgment, repeated: separate the **load-bearing** lessons — the ones that would change how a future agent behaves — from noise, and route each survivor to its one right home.

The failure mode is not missing a lesson; it's capturing too many. A skill or `CLAUDE.md` swollen with one-off observations is worse than one left alone, because every future agent now reads past the noise to find what matters. Be a stingy editor.

## What to harvest

Scan the session for the moments where the documented way and the actual way diverged:

- **Corrections** — the user rejected or redirected your output ("no, do it this way", "stop, you're guessing"). The sharper the friction and the more it recurred, the more load-bearing the lesson.
- **Rework** — something was regenerated several times, or a subagent's output needed cleanup, because guidance was missing or wrong.
- **Improvised steps** — the workflow needed a step that no skill documents and you had to invent it.
- **Hard-won patterns** — an approach that finally worked after friction, worth making the default.

Weight candidates by recurrence and friction, not recency. A correction the user made twice, or pushed back on with visible frustration, is usually load-bearing. A preference mentioned once and waved off ("not a big deal") is usually noise.

## The load-bearing test

Before proposing any change, state in one sentence how a future agent would behave differently because of it. If you can't — because the agent would already do the right thing by default, or the lesson only mattered for this conversation — drop it. This is the filter that keeps skills clean; apply it to every candidate before routing.

## Where each lesson goes

Route down this ladder, top to bottom, and give each lesson its **one** home at the highest rung it fits. The ordering matters: a mechanical guard fails loudly on every violation, forever; a prose rule is read once and forgotten under context pressure. Prose is the fallback, never the first choice.

1. **Machine-checkable rule** → a **lint rule, type constraint, or CI check**. If a violation can be detected by looking at the code, encode it in the tool that already runs on every change: an ESLint rule (built-in, plugin, or a small custom rule), a stricter compiler option, a dependency-boundary rule (Nx module boundaries, dependency-cruiser), or a CI script that greps for the forbidden pattern. Examples: "no `any`", "every query filters by `accountId`" (a custom rule matching un-scoped repository calls), "lib A must not import lib B".

2. **Workflow gate** → a **hook**. If the lesson is about *when* something must happen rather than what the code looks like — run affected tests before declaring done, regenerate a client after touching a schema, block edits to generated files — encode it as a Claude Code hook (`PreToolUse`, `PostToolUse`, `Stop`) in `.claude/settings.json`. A hook interrupts the agent at the exact moment the mistake would happen, which no document can do.

3. **Know-how** — a heuristic, procedure, or gotcha that needs judgment and can't be mechanically checked → a **skill**.
   - Transcends this repo (e.g. "reproduce a bug before patching it") → a global skill, `~/.claude/skills/<skill>/`.
   - Specific to working in *this* repo (e.g. how shift data flows through the scheduler) → a project skill, `.claude/skills/`.

4. **An uncheckable invariant** — a fact an agent must know and could not derive from the code, that no tool can enforce (e.g. "this service is multi-tenant", "staging shares the production database") → the project **`CLAUDE.md`**. This is the rung of last resort. Before writing here, say in one line why no guard or hook can carry the lesson; if you can't, move it up the ladder. Keep the file spare; every line is read by every agent on every task.

5. **Session-local** — mattered only for the rest of this conversation → **nowhere**. Leave it in the chat.

**Never write lessons to the auto-memory system** (`~/.claude/projects/.../memory/`). That store is the user's, maintained separately; a retrospective improves guards, hooks, skills, and `CLAUDE.md` only. Even when a `memory/` directory sits there looking like a convenient target, it is not one.

Many lessons that read like prose rules are checkable once you look. "Never show cancelled shifts" sounds like a CLAUDE.md line, but a unit test asserting the filter, or a lint rule on the query builder, enforces it without spending anyone's attention. Ask "what tool could catch a violation of this?" before concluding none can.

When a lesson genuinely needs prose, ask which form makes the next agent change behavior more reliably — a procedure they follow (skill) or a fact they must know (CLAUDE.md).

## Examples

**A checkable rule → guard, not prose.** This service is multi-tenant, and the user had to remind you that every query must scope by `accountId`. The temptation is a CLAUDE.md line — but a violation is visible in code, so it belongs at rung 1:

```
File: tools/eslint-rules/require-account-scope.ts   (new custom rule)
+ Flags any repository/query-builder call chain that reaches `.getMany()` or
+ `.find*()` without a `.andWhere` / `where` clause referencing `accountId`.
Wired into the flat config for `libs/api/**`.
```
Load-bearing because: an unscoped query now fails lint on every future change, with no agent needing to remember anything.

**A workflow gate → hook.** Twice you declared a task done without running the affected tests, and the user caught regressions. That's a *when*, not a *what* — rung 2:

```
File: .claude/settings.json   (hooks)
+ "Stop": [{ "hooks": [{ "type": "command",
+   "command": "npx nx affected -t test --base=HEAD~1 || echo 'BLOCK: affected tests failing'" }] }]
```
Load-bearing because: the agent is interrupted at the moment of claiming completion, instead of trusting it re-read a guideline.

**A cross-project heuristic → skill.** Twice the user stopped you from renaming a symbol before you'd found its other usages. No tool can decide "did you look?", so it's know-how — rung 3:

```
File: ~/.claude/skills/refactoring/SKILL.md   (under "Before renaming")
+ Find every usage of a symbol before renaming it — grep the whole repo,
+ don't trust your memory of where it's referenced. A rename that misses a
+ caller still compiles, then breaks at runtime.
```
Load-bearing because: a future agent greps for usages first instead of renaming blind.

**An uncheckable fact → CLAUDE.md.** Staging and production share a message broker, so replaying events in staging affects real users. No lint rule can see infrastructure topology — rung 4:

```
File: CLAUDE.md   (under "Environments")
+ - Staging shares the production message broker. Never replay or publish
+   events from staging without explicit user confirmation.
```
Load-bearing because: a future agent asks before publishing from staging. No guard can enforce this — the danger lives in infra, not in the diff.

## Doing the retrospective

1. **Extract and filter** — gather candidate lessons from the signals above; drop everything that fails the load-bearing test.
2. **Route** — walk each survivor down the ladder; stop at the first rung that fits.
3. **Propose as diffs** — for each, show the target file and the exact lines to add or change (for guards and hooks: the actual rule/config, not a promise to write one), plus the one-sentence reason it's load-bearing. A concrete diff lets the user approve at a glance; "I'll update the debugging skill" doesn't.
4. **Apply on confirmation** — write the changes the user approves and leave the rest. If nothing clears the bar, say so plainly: "nothing here is worth persisting" is a valid and common result.

## When to suggest one

Offer a retrospective when a session shows the symptoms it cures — several user corrections, an artifact regenerated three or more times, or improvised steps no skill documents. Those are exactly the sessions whose lessons are most worth catching, so don't wait to be asked.
