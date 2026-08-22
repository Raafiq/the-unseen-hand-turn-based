# Prompt for Claude Code

First locate this bundle: I attached `retrospective-eval-bundle.zip` to the session. Find it (check the uploads/attachments directory and the repo root), unzip it to `eval-bundle/` at the repo root, then follow the instructions below.

Use the **skill-creator** skill to run a full evaluation of the updated `retrospective` skill in this bundle. If skill-creator is not installed in this environment, say so and stop — do not improvise your own harness.

## Inputs (in `eval-bundle/`)

- `retrospective/SKILL.md` — the NEW version under test. Install it to `.claude/skills/retrospective/`.
- `retrospective-old/SKILL.md` — the OLD version. This is the **baseline**: point baseline subagents at this snapshot (skill-creator's "improving an existing skill" mode), not at no-skill.
- `evals/evals.json` — 5 test cases with assertions, in skill-creator's schema.

## What changed between old and new (so you can grade the delta)

The new version replaces the two-way routing (skill vs CLAUDE.md) with a 5-rung enforcement ladder: (1) lint/type/CI guard, (2) Claude Code hook, (3) skill, (4) CLAUDE.md as last resort with stated justification, (5) drop. The claim under test: checkable lessons now become real guards instead of CLAUDE.md prose, without over-mechanizing judgment lessons (eval 4 tests exactly that failure mode).

## Run

1. Follow skill-creator's standard loop: spawn with-skill AND old-skill baseline subagents for all 5 evals **in the same turn**, workspace at `retrospective-workspace/iteration-1/`.
2. While runs execute, review the assertions in `evals.json`; tighten them if any are vague, but keep their intent.
3. Grade with a grader subagent per `agents/grader.md`. Note: eval 2's assertion a0 requires "why no guard fits" reasoning that only the new skill can produce — grade the old skill on substantive routing too and record the distinction in evidence.
4. Generate the eval viewer with `eval-viewer/generate_review.py` BEFORE doing your own analysis, and give me the link/file. I will review and submit feedback.
5. After my feedback: run the **description optimization loop** (`python -m scripts.run_loop`) on the new skill's description. Seed the trigger eval with these known near-misses as should-NOT-trigger cases, plus your own: "let's do a retro of our sprint in Jira", "write a post-mortem doc for yesterday's prod incident", "add an eslint rule so unscoped queries don't happen again", "what did we learn" (after a trivial 2-message exchange).
6. Apply the best description only if it beats the current one on the held-out set; show me before/after.
7. Package the final skill with `package_skill` and hand me the `.skill`.

## Constraints

- Don't edit anything in this repo outside `eval-bundle/`, `.claude/skills/retrospective/`, and the eval workspace.
- Don't apply any of the retrospectives' proposed diffs (CLAUDE.md lines, hooks, lint rules) to the actual repo — they're test outputs, not real lessons from a real session.
- If subagent runs disagree with the assertions, fix the skill, not the assertions, unless the assertion is wrong on its face — then flag it to me first.
