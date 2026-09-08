---
name: capture-intent
description: >-
  Write an idea down as an intent file BEFORE any spec, plan or build — the first
  artifact of the AI-Native SDLC (Claude Academy playbook, Stage 1). Use whenever the
  owner brings a new idea, a complaint about the game, a ticket, or a "could we…" —
  before running /speckit.specify, before mockups, before spawning an engineer. Trigger
  on "I want", "I'm not satisfied with", "could we", "new feature", "next slice", or
  any ask whose scope is not yet written down. Produces `intent/<slug>.md` in the
  playbook's five sections; the owner corrects it; then the spec follows.
---

# Capture intent

An idea becomes `intent/<slug>.md` **before** anything is designed or built. The file is a
proto-spec in the owner's own words: what is wanted, why, and under which constraints.
It is not a spec, not a plan, not a task list — those come after, and each one points back
at the intent it serves.

The playbook chapter this follows is saved verbatim in
`references/playbook-capture-intent.md` (the site is egress-blocked here). Read it once.

**Do not confuse this with `docs/INTENT.md`.** That file is the STANDING intent of the
whole game — direction, owner directives, what is not green-lit, the next slice. An
`intent/*.md` is one idea. When an intent is accepted and shipped, `docs/INTENT.md`'s
next-slice section is what changes; the intent file itself stays as the record.

## How to run it

1. **Brainstorm until the idea is concrete.** Ask what an analyst would ask, one question
   at a time: what cannot be done today, who is affected, what better looks like, what is
   out of scope, what success looks like. Options to pick from, not open prompts.
2. **Write `intent/<slug>.md`** from the template below. The owner's words, not yours;
   plain sentences under 20 words. Keep it under a screen.
3. **The owner corrects it.** Show the file; fix what was misunderstood. Nothing is built
   from an intent the owner has not read.
4. **Commit it** — with the owner's words, as always (`CLAUDE.md`, "NEVER COMMIT OR PUSH
   WITHOUT THE OWNER'S WORDS"). Author and date join the record through git.
5. **Then** the next stage: `/speckit.specify` for a feature, or a mockup pass for a
   taste change (`CLAUDE.md`, "For a TASTE change"). Both cite the intent file.

Status moves `draft` → `accepted` (the owner said go) → `shipped` (name the PR / ADR) or
`closed` (say why). The accept/close decision is the record the playbook measures.

## Template

```markdown
# Intent: <short name>
Author: <owner>. Date: <YYYY-MM-DD>. Status: draft.

## Problem
<What cannot be done today, or what is wrong. The owner's words.>

## Proposed outcome
<What better looks like. Observable, not a solution.>

## Affected users and systems
<Who plays differently; which screens, data, docs, tests move.>

## Constraints
<What must not change. Locked decisions, ADRs, the phone viewport, determinism.>

## Open questions
<What the owner has not decided. One question per line.>
```

## The rule that exists because it was broken

The two-screen prep redesign (2026-09-08) went from the owner's screenshot straight to
mockups and a build. Four notes, then "all six deploy", then a style brief, then "keep
archer and wizard, combat comes later" all arrived **after** the engineer had started;
three redirects cost about a third of a 368k-token run. Every one of those was an intent
sentence that a ten-minute intent file would have held before the first spawn. Write the
intent first; collect every note into it; then build.
