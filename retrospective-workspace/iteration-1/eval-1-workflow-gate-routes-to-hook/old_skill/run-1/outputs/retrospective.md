# Retrospective — Nx monorepo session (2026-08-21)

Three lessons survive the load-bearing test; two candidates are dropped. All proposals are diffs for your approval — nothing has been applied.

## Candidate lessons considered

### 1. Claimed "done" twice without running the affected Vitest suites — both times a test was broken (SURVIVES)

- **Signal:** Correction, repeated. The user caught a broken test after each of the two features, and pushed back with visible frustration the second time. Recurrence + friction make this the strongest candidate in the session.
- **Load-bearing test:** A future agent runs the affected test suites before reporting a feature as done, instead of reporting done on the strength of the edit alone. Passes.
- **Routing:** This is a rule the agent must not violate, not a method — an invariant. It goes to the project **CLAUDE.md**. (Considered a global skill, since "verify before claiming done" transcends this repo — but the actionable form here is repo-specific: Nx's `affected` target is *how* you know which suites your change touched. The repo-specific rule is what changes behavior most reliably, so it gets the one home.)

### 2. Edited a Prisma schema without regenerating the client — next edit failed with type errors, 20 minutes lost (SURVIVES)

- **Signal:** Rework. The generated client is a hidden dependency of the type-checker; nothing in the schema file announces that editing it stales the client. The cost (20 minutes of misdirected debugging) came from the failure surfacing far from its cause.
- **Load-bearing test:** A future agent runs `prisma generate` immediately after any `schema.prisma` edit, and reads sudden Prisma-typed errors as "stale client" before anything else. Passes.
- **Routing:** A rule that is simply true here and not derivable from the code → project **CLAUDE.md**.

### 3. The custom `nx run-many` wrapper OOMs on CI-sized runners without `--parallel=3` — took four failed attempts to discover (SURVIVES)

- **Signal:** Hard-won pattern. Four failed runs to find a flag no document records. Any future agent (or the same agent next session) would pay the same four attempts again.
- **Load-bearing test:** A future agent passes `--parallel=3` on the first invocation of the wrapper in CI-sized environments instead of rediscovering the OOM by trial and error. Passes.
- **Routing:** A project-specific fact an agent must check against, not a procedure → project **CLAUDE.md**.

### 4. The user was annoyed the second time (DROPPED)

The annoyance is the *weighting* on lesson 1, not a lesson itself — it tells us that lesson is load-bearing, but "the user dislikes broken tests" would not change any future agent's behavior beyond what lesson 1 already does. Session-local; leave it in the chat.

### 5. The specific debugging path (20 minutes, four failed attempts) (DROPPED)

The audit trail of how the lessons were earned changes nothing about future behavior once the rules themselves are captured. Dropped as noise; the costs are cited above only as evidence of load-bearing weight.

## Proposed diffs

All three survivors are invariants in the same project, so they land as one small block in the project's `CLAUDE.md`. Keeping them together (and terse) respects the "keep CLAUDE.md spare" rule — three lines of rule, each preventing a failure this session actually paid for.

```
File: CLAUDE.md   (in the target Nx repo; under "Conventions" — create the section if absent)
+ ## Conventions
+
+ - A change is not "done" until the affected Vitest suites pass. Run
+   `nx affected -t test` (or the touched projects' test targets) and report
+   the result before declaring a feature complete — never report done on the
+   edit alone.
+ - After any edit to a `schema.prisma`, run `prisma generate` before doing
+   anything else. The generated client is what the type-checker sees; skipping
+   this makes the *next* edit fail with misleading type errors.
+ - The custom `nx run-many` wrapper script must be invoked with `--parallel=3`
+   on CI-sized runners — higher parallelism OOMs the runner.
```

**Load-bearing reasons, one per line:**

1. *Done-means-tested:* a future agent verifies with the affected suites before claiming done, so broken tests are caught by the agent instead of the user — the correction that recurred twice this session.
2. *Prisma regenerate:* a future agent regenerates the client immediately after a schema edit, so the stale-client type errors (and the 20-minute misdiagnosis they caused) never occur.
3. *`--parallel=3`:* a future agent passes the flag on the first try instead of re-paying four OOM'd CI runs to rediscover it.

## Not routed anywhere else

No candidate was know-how that transcends this repo in an actionable form, so no global skill is proposed; no project skill is proposed because none of the lessons is a multi-step procedure — each is a one-line rule, which is exactly what CLAUDE.md is for. Nothing is written to auto-memory.

**Next step:** approve any or all of the three lines and they get written to the target repo's CLAUDE.md; anything unapproved is left in the chat.
