# Transcript

1. Read `/home/user/the-unseen-hand-turn-based/retrospective-workspace/skill-snapshot/SKILL.md` — the retrospective methodology (harvest → load-bearing test → route to exactly one home → propose as concrete diffs; never write to auto-memory; be a stingy editor). Used only this file as the method; ignored the installed `retrospective` skill and this repo's CLAUDE.md for the retrospective's content, per instructions.
2. Treated the task's session summary as the complete record of a session in a fictional monorepo (worked on with Claude Code, so `.claude/skills/`, `~/.claude/skills/`, and `CLAUDE.md` are available homes).
3. Extracted three candidate lessons:
   - Staging shares its Postgres instance with production analytics (urgent user stop before a backfill).
   - Reproducing the bug locally cracked it after two failed blind patches from the stack trace.
   - The error-mapper was regenerated three times from guessed shapes; the shape is defined in `libs/shared/contracts`.
4. Applied the load-bearing test to each; all three passed (each changes a future agent's behavior). Nothing else in the summary cleared the bar.
5. Routing decisions:
   - Lesson 1 → project `CLAUDE.md`: an invariant not derivable from the code — the skill's exact definition of a CLAUDE.md entry.
   - Lesson 2 → global skill `~/.claude/skills/debugging/SKILL.md`: cross-project know-how (the skill's own example of a global-skill lesson).
   - Lesson 3 → project `CLAUDE.md`: weighed project skill vs CLAUDE.md; chose the one-line rule ("shapes live in libs/shared/contracts, read before writing") because a rule checked on every task beats a skill that may not trigger, and a whole skill for one pointer is overhead.
6. Wrote `retrospective.md` in the outputs directory with every candidate, its routing rationale, the concrete proposed diff (target file + exact lines), and a one-sentence load-bearing reason per lesson. Diffs are proposals only — no real files were modified anywhere.
7. Wrote this `transcript.md` alongside it.
