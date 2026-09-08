# intent/

One file per idea, written **before** any spec, plan, mockup or build — the first artifact
of the AI-Native SDLC (Stage 1, "Capture as intent.md"). The `capture-intent` skill holds
the template and the playbook chapter.

- `intent/<slug>.md` — one idea, in the owner's words: Problem, Proposed outcome,
  Affected users and systems, Constraints, Open questions. Status `draft` → `accepted`
  → `shipped` / `closed`.
- `docs/INTENT.md` — the STANDING intent of the whole game. Not the same thing; do not
  put a single idea there.

The next stage cites the intent file: a `/speckit.specify` spec under `specs/`, or a
mockup pass for a taste change. A shipped intent names its PR or ADR under Status.
