---
name: retrospective
description: Run a retrospective on the session — harvest the load-bearing lessons from corrections, rework, and hard-won patterns, then route each to a skill or CLAUDE.md as a concrete diff. Use when the user asks for a retrospective, post-mortem, or "what did we learn"; says "so this doesn't happen again" or "so the next agent doesn't repeat this"; or after a multi-step session with repeated corrections or rework.
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

Route by asking *what kind of thing the lesson is*, then give it exactly one home:

- **Know-how** — a heuristic, procedure, or gotcha; *how* to do a kind of work → a **skill**.
  - Transcends this repo (e.g. "reproduce a bug before patching it") → a global skill, `~/.claude/skills/<skill>/`.
  - Specific to working in *this* repo (e.g. how shift data flows through the scheduler) → a project skill, `.claude/skills/`.
- **An invariant** — a rule or fact that is simply true here, that an agent must not violate and could not derive from the code alone → the project **`CLAUDE.md`**. Keep that file spare; every line is read by every agent on every task.
- **Session-local** — mattered only for the rest of this conversation → **nowhere**. Leave it in the chat.

**Never write lessons to the auto-memory system** (`~/.claude/projects/.../memory/`). That store is the user's, maintained separately; a retrospective improves skills and `CLAUDE.md` only. Even when a `memory/` directory sits there looking like a convenient target, it is not one.

When a lesson could be know-how *or* an invariant, ask which form makes the next agent change behavior more reliably — a procedure they follow, or a rule they check against. A constraint ("never show cancelled shifts") is usually an invariant; a method ("reproduce before fixing") is usually know-how.

## Examples

**A cross-project heuristic → skill.** Twice the user stopped you from renaming a symbol before you'd found its other usages. That's know-how that holds in any codebase, so it belongs in a refactoring skill:

```
File: ~/.claude/skills/refactoring/SKILL.md   (under "Before renaming")
+ Find every usage of a symbol before renaming it — grep the whole repo,
+ don't trust your memory of where it's referenced. A rename that misses a
+ caller still compiles, then breaks at runtime.
```
Load-bearing because: a future agent greps for usages first instead of renaming blind.

**A project invariant → CLAUDE.md.** This service is multi-tenant, and the user had to remind you that every query must scope by `accountId`. That's a rule, true everywhere here, that the code doesn't announce on its own:

```
File: CLAUDE.md   (under "Conventions")
+ - Multi-tenant service: every database query must filter by `accountId`.
+   An unscoped query leaks one tenant's data into another's.
```
Load-bearing because: every future query is tenant-scoped without anyone being told.

## Doing the retrospective

1. **Extract and filter** — gather candidate lessons from the signals above; drop everything that fails the load-bearing test.
2. **Route** — give each survivor exactly one home.
3. **Propose as diffs** — for each, show the target file and the exact lines to add or change, plus the one-sentence reason it's load-bearing. A concrete diff lets the user approve at a glance; "I'll update the debugging skill" doesn't.
4. **Apply on confirmation** — write the changes the user approves and leave the rest. If nothing clears the bar, say so plainly: "nothing here is worth persisting" is a valid and common result.

## When to suggest one

Offer a retrospective when a session shows the symptoms it cures — several user corrections, an artifact regenerated three or more times, or improvised steps no skill documents. Those are exactly the sessions whose lessons are most worth catching, so don't wait to be asked.
