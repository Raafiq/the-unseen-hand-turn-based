---
name: decision-record
description: >-
  Record or look up an architecture/design decision as an ADR in docs/adr/. Use
  this whenever a non-trivial or hard-to-reverse choice is made or revisited —
  tech stack, a combat/job/economy rule, a schema, a workflow, or reversing a
  prior call. Trigger on phrases like "let's decide", "we chose", "why did we",
  "should we change", or when a change would contradict a locked decision. It
  keeps decisions durable and stops future agents from relitigating settled
  calls without context.
---

# Decision Records (ADRs)

An ADR captures **why** a decision was made, so future agents (and humans) don't silently reverse it or re-argue it from scratch. Records live in `docs/adr/`, numbered and append-only. Superseding a decision means writing a *new* ADR that references the old one — never rewriting history.

## When to write one

- A locked decision is being made, questioned, or reversed (spine, respec, determinism, tech stack…).
- A choice is hard to reverse or affects multiple systems (a schema, the scheduler model, the economy shape).
- A review/panel settled a trade-off worth remembering.

You do **not** need an ADR for routine, easily-reversible edits.

## How to write one

1. Find the next number: look at `docs/adr/` and increment the highest `NNNN`.
2. Copy `assets/adr-template.md` to `docs/adr/NNNN-short-kebab-title.md`.
3. Fill every section. Be concrete about **Options considered** and **Consequences** (including the downsides you accept) — that context is the whole point.
4. Set **Status** (`Proposed` → `Accepted`; later maybe `Superseded by ADR-XXXX`).
5. Add a row to `docs/adr/README.md` index.

## When reversing a decision

Write a new ADR that (a) states the new choice, (b) links the superseded ADR, and (c) explains what changed. Then mark the old one `Superseded by ADR-NNNN` — leave its body intact.

## Style

Keep it to one page. The value is the reasoning and the rejected alternatives, not length. Prefer plain statements over hedging: what we chose, what we gave up, and why it was worth it.
