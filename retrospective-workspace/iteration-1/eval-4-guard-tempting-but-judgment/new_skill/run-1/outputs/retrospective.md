# Retrospective

Session record: twice the user rejected Vitest tests because they mocked so much that the
test only verified the mocks — the repository, the mapper, and the clock were all mocked
in a unit that just formats a label. The user's rule: **test through real collaborators
unless the dependency does IO.**

## Candidate lessons

### 1. Over-mocking: mock only IO boundaries — SURVIVES

**Signal:** A correction, made twice, on the same defect class. Highest-weight signal the
skill recognizes (recurrence + friction).

**Load-bearing test:** A future agent writing a unit test would, by default, mock every
collaborator "to isolate the unit" — that is exactly what happened twice this session.
With this lesson, it instead instantiates the real mapper and passes a fixed `Date`, and
mocks only the repository (the one dependency that does IO). Behavior changes; it passes.

**Routing — walked down the ladder:**

- **Rung 1 (lint/CI guard) — tempting, rejected.** A rule like "flag test files with more
  than N `vi.mock` calls" or "ban `vi.fn()` outside `__mocks__`" *looks* checkable, but the
  actual rule has an exception clause — "unless the dependency does IO" — that no static
  check can evaluate. A mock count can't tell a justified repository mock from an
  unjustified mapper mock: a heavy integration seam legitimately mocks three IO
  dependencies (rule fires, false positive), while a test that mocks the single pure
  collaborator that matters slips under any threshold (rule silent, false negative). A
  guard that fires identically on good and bad tests proves nothing and trains agents to
  appease the counter instead of writing real tests. The judgment call — *does this
  dependency do IO?* — is the whole lesson, so it cannot live in a mechanical rule.
- **Rung 2 (hook) — rejected.** The lesson is about *what the test looks like*, not *when*
  something must run. There is no workflow moment a `PreToolUse`/`Stop` hook could
  intercept that decides "is this mock justified".
- **Rung 3 (skill) — fits.** This is know-how needing judgment: a heuristic for deciding
  what to mock, plus a diagnostic for recognizing a vacuous test. It **transcends the
  repo** — nothing about it is specific to this codebase's domain; it is the user's
  standard for unit tests anywhere Vitest (or any test runner) is used — so it goes to a
  **global skill**, `~/.claude/skills/`. (If the user prefers to scope it to this project
  only, the identical content can land in the project's `.claude/skills/` instead; the
  content does not change.)

**Proposed diff:**

```
File: ~/.claude/skills/unit-testing/SKILL.md   (new global skill)
```

```markdown
---
name: unit-testing
description: How to choose test doubles when writing or fixing unit tests (Vitest,
  Jest, or any runner). Use whenever writing a new test, deciding what to mock,
  or reviewing a test that stubs its collaborators.
---

# Unit testing: mock only IO boundaries

**Default to real collaborators. Mock a dependency only if it does IO** — network,
database, filesystem, message queue — or is otherwise unusable in-process (wall-clock
time *when time affects the behavior under test*, true randomness). Everything else —
mappers, formatters, validators, domain objects, pure helpers — is constructed for
real and exercised through the unit.

Why: a test whose collaborators are all mocked asserts only that the mocks were
called as configured. It passes whether the unit is correct or broken, so it proves
nothing — and it breaks on every refactor of the wiring while missing every real bug.

Before finishing a test, run this check:

- **If every assertion is about a mock** (`toHaveBeenCalledWith`, mock return values
  flowing straight to `expect`), the test verifies the mocks, not the unit. Rewrite
  it against real collaborators until at least one assertion is about a real output.
- **For each mock, name the IO it replaces.** Can't name any? Use the real object.
  A clock is not IO for a unit that doesn't branch on time — pass a fixed `Date`
  as an argument or construct the input directly rather than stubbing the clock.
- **A hard-to-construct real collaborator is a design signal**, not a reason to
  mock. Say so rather than papering over it with `vi.mock`.
```

**Load-bearing because:** a future agent asked for a unit test reaches for real
collaborators first and can justify each remaining mock by the IO it replaces, instead of
producing the mock-everything test the user rejected twice.

### 2. "A test asserting only on mock interactions verifies nothing" — MERGED into 1

This is the diagnostic form of the same lesson, not a separate one (the user's rejection
reason and the user's rule are two faces of one defect class). Giving it a second home
would violate the one-home rule and duplicate content; it lives as the first bullet of the
skill's checklist.

### 3. "The clock didn't need mocking for a label formatter" — MERGED into 1

A sub-case: time is only an IO-like boundary when the behavior under test depends on it.
Folded into the skill's second checklist bullet rather than made its own entry.

### 4. "The user uses Vitest" / this session's specific test files — DROPPED

Session-local (rung 5). The runner is visible from the repo's `package.json` and the
rejected tests were fixed in-session; no future agent behaves differently for knowing
these details.

### 5. A CLAUDE.md line stating the mocking convention — CONSIDERED, NOT USED

Tempting as a one-liner ("mock only IO dependencies in tests"), but the ladder places
know-how above CLAUDE.md, and this is a procedure requiring judgment, not an uncheckable
repo fact an agent couldn't derive. A bare prose line also carries none of the diagnostic
("are all your assertions about mocks?") that makes the lesson actionable. One home only:
the skill.

## Summary

One lesson survives: **mock only IO boundaries; test through real collaborators** — routed
to a new global skill `~/.claude/skills/unit-testing/SKILL.md` with the exact content
above. A lint guard was considered and rejected because the rule's IO exception requires
judgment no static check can make; a hook was rejected because the lesson has no workflow
moment to intercept. Nothing else from the session clears the load-bearing bar.

Apply on your confirmation — nothing has been written outside this proposal.
