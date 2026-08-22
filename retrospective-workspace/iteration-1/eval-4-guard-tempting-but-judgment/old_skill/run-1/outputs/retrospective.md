# Retrospective

Session record: I twice submitted Vitest unit tests you rejected because they mocked so much that the assertions only verified the mocks — I mocked the repository, the mapper, and the clock in a unit that just formats a label. You corrected me both times and stated the rule: test through real collaborators unless the dependency does IO.

## Candidate lessons considered

**1. Mock only IO-boundary dependencies; use real collaborators otherwise.** (from the repeated correction)
The same rejection happened twice — highest-friction, recurring signal in the session. Load-bearing test: a future agent writing a unit test would wire the real mapper and formatter instead of mocking them, and would reach for a mock only where the dependency touches the network, filesystem, database, or wall clock. That is a concrete behavior change. **Survives.**

**2. A pure unit shouldn't be handed a mocked clock — pass a plain value instead.** (the clock mock in the label formatter)
Real, but it is an instance of lesson 1, not a separate rule: the clock got mocked because the test mocked everything on principle. Folding it into lesson 1's wording (as the "prefer passing values" corollary) changes behavior just as reliably without adding a second entry to read past. **Dropped as a separate lesson — folded into 1.**

**3. "A test whose assertions pass with the production code deleted proves nothing."**
This is the *tell* that identifies over-mocked tests, not an independent lesson. Same treatment: folded into lesson 1 as its one-line self-check, because the rule alone ("mock only IO") doesn't teach an agent how to notice when a test has gone wrong. **Dropped as a separate lesson — folded into 1.**

**4. Ask for the project's testing philosophy before writing the first tests.**
Fails the load-bearing test: with lesson 1 written down, the philosophy is already stated, so the question is moot; and as a general habit it's too vague to change behavior predictably. **Dropped.**

**5. The two specific test rewrites (which files, which mocks came out).**
Session-local — mattered only for this conversation's cleanup. **Dropped; stays in the chat.**

## Routing the survivor

One lesson survives. Two homes were weighed:

- **Global skill (`~/.claude/skills/testing/`)** — the heuristic does transcend this repo. But it is a bright-line *constraint* the user articulated as a rule ("unless the dependency does IO"), not a multi-step procedure, and a skill only helps when it triggers; a testing rule that must hold for *every* test written in this project is safer where every agent reads it on every task.
- **Project `CLAUDE.md`** — per the tie-breaker in the method (a constraint is usually an invariant; the rule form is what makes the next agent change behavior most reliably, since it's checkable against any test they're about to write), this is the home. **Chosen.** One home only, so no duplicate skill copy.

One route deliberately *not* taken: an automated check (e.g. an ESLint rule flagging `vi.mock`). Tempting because the failure recurred, but the rule is a judgment call a machine can't make — mocking a repository that does real IO is exactly what the rule *permits*, so a mechanical mock-ban would flag legitimate tests and miss the real offense (mocking pure collaborators). This lesson needs a rule agents apply with judgment, which is what a `CLAUDE.md` line is for.

## Proposed diff

**File:** `CLAUDE.md` (the target project's root; add a `## Testing` section, or append under it if one exists)

```
## Testing
- Test through real collaborators. Mock ONLY dependencies that do IO
  (network, filesystem, database, wall-clock reads). Pure collaborators —
  mappers, formatters, in-memory logic — stay real in the test.
- For pure code, prefer passing plain values (e.g. a timestamp) over
  injecting a mocked clock or repository it never needed.
- Self-check before committing a test: if the assertions would still pass
  with the production logic deleted, the test is verifying its mocks, not
  the unit. Rewrite it.
```

**Load-bearing because:** a future agent writing a Vitest test wires the real mapper/formatter and mocks only at IO boundaries, so the test fails when the unit is wrong instead of passing against its own mocks.

## Next step

Nothing is applied. If you approve the diff, add the `## Testing` block above to the project's `CLAUDE.md`; everything else from the session is intentionally left unpersisted.
