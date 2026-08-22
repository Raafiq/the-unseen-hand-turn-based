# Transcript — retrospective run (old_skill, run-1)

1. **Read** `/home/user/the-unseen-hand-turn-based/retrospective-workspace/skill-snapshot/SKILL.md` — the only methodology used. Noted its routing homes are limited to: global skill, project skill, project CLAUDE.md, or nowhere (no hook/lint/CI routing exists in this snapshot), plus the ban on writing to auto-memory.
2. **Did not** read this host repo's CLAUDE.md conventions into the retrospective content, per the task's instruction that the target project is a fictional Nx/Vitest/Prisma monorepo. Treated the session summary as the complete record.
3. **Harvested candidates** from the summary's signals:
   - "done" without running affected Vitest suites (correction, x2, escalating friction)
   - Prisma schema edited, client not regenerated (rework, 20 min lost)
   - `nx run-many` wrapper needs `--parallel=3` (hard-won pattern, 4 failed attempts)
   - the user's annoyance (candidate, dropped as session-local weighting)
   - the debugging audit trail (candidate, dropped as noise)
4. **Applied the load-bearing test** to each: stated in one sentence how a future agent behaves differently. Three pass, two drop.
5. **Routed** all three survivors to the fictional project's CLAUDE.md as invariants (rules to check against, not procedures). Considered and rejected a global skill for "test before done" — the actionable, behavior-changing form is repo-specific (`nx affected -t test`), and the skill mandates exactly one home per lesson.
6. **Wrote proposals as concrete diffs** (target file + exact lines + one-sentence reason each) inside `retrospective.md` only. No real files in this repo or elsewhere were modified; per the skill, application waits on user confirmation, which in this eval never comes.
7. **Created** the outputs directory and saved `retrospective.md` and this `transcript.md` there.
