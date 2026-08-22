# Transcript

1. Read `/home/user/the-unseen-hand-turn-based/.claude/skills/retrospective/SKILL.md` in
   full and used it as the sole methodology.
2. Treated the given session summary (fictional Vitest project) as the complete record;
   deliberately did not use this repo's CLAUDE.md or conventions for the retrospective's
   content, per the task instructions. Read no other files.
3. Extracted candidates from the record's signals: one twice-repeated correction
   (over-mocking), plus its sub-forms (mock-only assertions; the unneeded clock mock) and
   incidental facts (Vitest in use).
4. Applied the load-bearing test: one lesson survives ("mock only IO boundaries"); the
   sub-forms merged into it; incidental facts dropped as session-local.
5. Walked the routing ladder for the survivor. Rejected rung 1 (a mock-count/ban lint rule
   cannot evaluate the "unless it does IO" exception, so it fires identically on good and
   bad tests) and rung 2 (no workflow moment to hook). Landed on rung 3: a global skill,
   since the heuristic transcends any one repo. Explicitly declined a CLAUDE.md line
   (one-home rule; procedure-with-judgment belongs in a skill).
6. Wrote the full proposed skill content as a concrete diff inside `retrospective.md`.
   Made no changes to any real files — proposals exist only inside the output file.

Outputs: `retrospective.md` and this `transcript.md` in
`/home/user/the-unseen-hand-turn-based/retrospective-workspace/iteration-1/eval-4-guard-tempting-but-judgment/new_skill/run-1/outputs/`.
