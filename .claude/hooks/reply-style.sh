#!/usr/bin/env bash
# UserPromptSubmit — re-assert the reply-style contract on EVERY turn.
#
# WHY A HOOK AND NOT JUST CLAUDE.md. CLAUDE.md already carries "Write plainly"
# (user directive, 2026-08-12) and the style still drifted back to long, dense
# replies across sessions — the rule sits far from the moment of writing and
# competes with a very large file. A UserPromptSubmit hook injects the rule as
# fresh context immediately before each response is composed, which is the only
# point in the loop where it can actually bind.
#
# LIMIT, stated plainly: a hook cannot edit or reject a reply. It raises the
# odds; it does not guarantee. If replies drift again, that is evidence this
# mechanism is insufficient, not that the rule was forgotten.
cat <<'REMINDER'
[reply style — user directive, standing]
Answer in UNDER 5 LINES unless asked for more. Bullet points. Plain words.
- Conclusion first. No preamble, no restating the question.
- Cut the audit trail: rejected options, re-measurements, how you verified.
  Those belong in the commit message, not the reply.
- No jargon without expanding it once: N, the gate, AC-*, the fold, in band.
- Tables beat paragraphs. Short sections beat tables of prose.
- Still say bad news, unverified claims, and open risks — just briefly.
REMINDER
