# Session retrospective

Three candidate lessons came out of this session. One clears the load-bearing bar, one is borderline and proposed as a single line, one is noise and dropped. Proposals below are diffs for your approval — nothing has been written yet.

## Candidate 1 — Tenant scoping on queries (KEEP → CLAUDE.md)

**What happened:** Twice you had to stop me because a TypeORM query on `ShiftRepository` was missing `.andWhere('shift.accountId = :accountId')`. This is a multi-tenant app; an unscoped query leaks one tenant's data into another's.

**Why it survives the filter:** Corrected twice — the strongest recurrence signal in the session — and the cost of the mistake is a data leak, not a style nit. The code doesn't announce this rule on its own: a query without the clause compiles, runs, and returns plausible data.

**Routing:** This is an invariant — a rule that is simply true everywhere in this project, not a procedure. Invariants go to the project `CLAUDE.md`, where every agent reads it on every task.

**Proposed diff:**

```
File: CLAUDE.md   (under "Conventions" — create the section if absent)
+ - Multi-tenant app: every database query must be scoped to the current
+   tenant — TypeORM queries on tenant-owned entities (e.g. ShiftRepository)
+   must include `.andWhere('<alias>.accountId = :accountId')` (or the
+   equivalent `where` clause). An unscoped query leaks one tenant's data
+   into another's.
```

Load-bearing because: a future agent adds the `accountId` scope to every query by default instead of being caught twice in review.

## Candidate 2 — `date-fns`, not `moment` (KEEP, borderline → CLAUDE.md)

**What happened:** I used `moment` for a date diff; you said the project uses `date-fns` everywhere. One correction, fixed immediately, no further friction.

**Why it (just) survives:** Single occurrence, low friction — normally noise. But it is a real project-wide convention an agent can get wrong again (especially if `moment` still sits in `package.json` as a transitive or legacy dep), and it costs one line to state. The load-bearing sentence still works: a future agent reaches for `date-fns` first instead of `moment`.

**Routing:** An invariant (a "use X, not Y" rule), not know-how → project `CLAUDE.md`, same Conventions section.

**Proposed diff:**

```
File: CLAUDE.md   (under "Conventions")
+ - Dates: use `date-fns` for all date/time manipulation. Never introduce
+   `moment`.
```

Load-bearing because: a future agent picks `date-fns` for date work without a correction round-trip.

If you'd rather keep CLAUDE.md sparer, dropping this one is defensible — say the word and I'll leave it out.

## Candidate 3 — `readonly` on DTO fields (DROP)

**What happened:** You mentioned once, in passing, that you prefer `readonly` on DTO fields, and explicitly said "not a big deal".

**Why it's dropped:** This is exactly the skill's noise pattern — a preference mentioned once and waved off. It failed no review, caused no rework, and you marked it as low-stakes yourself. Persisting it would spend every future agent's attention on a nit you told me not to worry about. It stays in the chat.

## Not a lesson

Switching from `moment` to `date-fns` "was fine after that" — the fix itself needed no new know-how, so there's no procedure to capture, only the convention above.

## Next step

Approve any or all of the two diffs above and I'll apply them to the project's `CLAUDE.md`. Nothing else from this session is worth persisting.
