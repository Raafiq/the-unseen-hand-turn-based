# Retrospective — Nx monorepo session (2026-08-21)

Session record: two features implemented. Twice I said "done" without running the affected
Vitest suites and you found a broken test afterward (the second time with real frustration).
After a Prisma schema edit I forgot to regenerate the client, costing 20 minutes of type-error
confusion. And it took four failed CI runs to learn the custom `nx run-many` wrapper OOMs on
CI-sized runners without `--parallel=3`.

Nothing below is applied. Every change is a written proposal awaiting your approval.

## Candidate lessons considered

| # | Candidate | Signal | Verdict |
|---|-----------|--------|---------|
| 1 | "Done" declared twice without running affected Vitest suites | Correction, **recurred**, visible frustration | **Keep** — route to hook |
| 2 | Prisma schema edited, client not regenerated → type errors, 20 min lost | Rework, high friction | **Keep** — route to hook |
| 3 | Wrapper `nx run-many` script OOMs on CI runners unless `--parallel=3` | Hard-won pattern, four failed attempts | **Keep** — route to a mechanical fix in the tool itself |
| 4 | "Be more careful / verify before claiming completion" as a general rule | Same events as #1 | **Drop** — fully carried by lesson 1's hook; a prose restatement would be read once and forgotten, which is exactly what the hook exists to replace |
| 5 | "The user gets annoyed at repeat mistakes" | Meta-observation | **Drop** — session-local; it's weighting evidence for #1, not a lesson with its own behavior change |
| 6 | "Debugging CI OOMs takes many attempts; batch hypotheses" | The four failed runs | **Drop** — the specific fix (#3) removes the need to ever re-debug this; the general debugging heuristic didn't produce a distinct behavior change here |

Load-bearing test applied to each survivor (one sentence: how would a future agent behave
differently?) — stated with each proposal below.

## Lesson 1 — Affected tests must run before "done"

**Routing.** This is a *when*, not a *what*: no lint rule can see that a completion claim was
made without tests running. It is exactly the skill's rung-2 case ("run affected tests before
declaring done") → **Claude Code `Stop` hook**. Not CLAUDE.md: a prose "always run tests"
line is read once and forgotten under context pressure; the hook fires mechanically at the
exact moment the mistake happens, every time.

**Proposed diff** — `.claude/settings.json` (fictional Nx repo), add to `hooks`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "timeout": 600,
            "command": "cd \"$CLAUDE_PROJECT_DIR\" && if [ -n \"$(git status --porcelain)\" ] || ! git diff --quiet origin/main...HEAD 2>/dev/null; then npx nx affected -t test --base=origin/main --parallel=3 > /tmp/claude-affected-test.log 2>&1 || { tail -40 /tmp/claude-affected-test.log >&2; echo 'BLOCK: affected Vitest suites are failing — fix them before finishing. Full log: /tmp/claude-affected-test.log' >&2; exit 2; }; fi"
          }
        ]
      }
    ]
  }
}
```

Notes: exit code 2 on a `Stop` hook blocks the agent from stopping and feeds stderr back to
it, so a broken suite is fixed *before* "done" is ever uttered. `nx affected` keeps it fast
(only touched projects); the no-changes guard keeps question-only turns cheap; `--parallel=3`
matches lesson 3 so the hook itself can't OOM a CI-sized runner.

**Load-bearing because:** a future agent is mechanically interrupted at the moment of
claiming completion with failing affected tests, instead of being trusted to remember a
guideline — the exact failure that happened twice today.

## Lesson 2 — `prisma generate` must follow any schema edit

**Routing.** Also a workflow gate — "regenerate a client after touching a schema" is a
*when*-rule, named verbatim at rung 2 → **Claude Code `PostToolUse` hook**. Not a skill:
no judgment is involved; the step is unconditional and a hook performs it rather than asking
an agent to recall it.

**Proposed diff** — `.claude/settings.json` (fictional Nx repo), add to `hooks`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "timeout": 120,
            "command": "f=$(jq -r '.tool_input.file_path // empty'); case \"$f\" in *schema.prisma) cd \"$CLAUDE_PROJECT_DIR\" && npx prisma generate >/tmp/claude-prisma-generate.log 2>&1 || { tail -20 /tmp/claude-prisma-generate.log >&2; echo 'prisma generate FAILED after schema edit — client is now stale; fix before further edits.' >&2; exit 2; } ;; esac"
          }
        ]
      }
    ]
  }
}
```

Notes: fires only when the edited file is `schema.prisma`, regenerates the client
immediately, and on failure (exit 2) pushes the error back to the agent so the stale-client
state can never silently persist into the next edit.

**Load-bearing because:** the client is regenerated automatically the moment the schema
changes, so the 20-minute stale-client type-error hunt cannot recur regardless of what any
agent remembers.

## Lesson 3 — The `nx run-many` wrapper OOMs without `--parallel=3`

**Routing.** The temptation is a CLAUDE.md line ("always pass `--parallel=3`"), but the
constraint is visible in — and enforceable by — the code itself: encode the safe value as
the wrapper's default so the lesson stops needing to be known at all. That is the top of the
ladder (fix the tool that already runs on every invocation), above prose. CLAUDE.md would
only be right if the wrapper couldn't be changed.

**Proposed diff** — the wrapper script (adjust the path to wherever the fictional repo keeps
it, e.g. `tools/run-many.sh`):

```diff
+ # CI-sized runners OOM above 3 parallel Nx processes (found empirically,
+ # 2026-08-21, after four failed CI runs). Default to the safe value;
+ # override with NX_PARALLEL for beefier machines.
+ PARALLEL="${NX_PARALLEL:-3}"
- exec npx nx run-many "$@"
+ exec npx nx run-many --parallel="$PARALLEL" "$@"
```

(A caller-supplied `--parallel` in `"$@"` comes later on the command line and wins, so
explicit overrides still work.)

**Load-bearing because:** every future invocation — by any agent or human, on any runner —
gets the OOM-safe parallelism by default, eliminating the four-failed-attempts discovery
instead of documenting it.

## Not persisted

Candidates 4–6 (table above) are dropped: #4 is subsumed by the Stop hook, #5 and #6 are
session-local with no distinct future behavior change. Nothing here belongs in CLAUDE.md —
all three survivors landed at a mechanical rung, which is the outcome the routing ladder
prefers: nothing to remember, everything enforced.

**On approval** I would apply the two hook blocks to the fictional repo's
`.claude/settings.json` and the default-parallelism change to the wrapper script, and
nothing else.
