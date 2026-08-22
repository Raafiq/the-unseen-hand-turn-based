# Retrospective

Session record: three times, a new file added to `libs/ui` was not exported from the lib's barrel `index.ts`. Downstream imports failed each time, and the user had to point it out each time.

## Candidate lessons considered

### 1. New files in `libs/ui` must be exported from the lib's barrel `index.ts`

- **Signal:** Correction, repeated three times — the strongest signal the session offers. High recurrence, high friction (the user did the catching every time).
- **Load-bearing test:** A future agent, after creating a file in `libs/ui`, would add the export to `libs/ui/.../index.ts` in the same change instead of shipping a file that downstream code cannot import. Passes.
- **Routing:** This is the ambiguous case the skill anticipates — it could be know-how (a step in the "add a file to a lib" procedure) or an invariant (a structural rule of this monorepo). Applying the skill's tie-breaker — *which form makes the next agent change behavior more reliably: a procedure they follow, or a rule they check against?* — this is a **constraint**, not a method: "a file that exists but is un-exported is invisible to the rest of the monorepo" is simply true here, holds for every lib, and the code does not announce it (the build succeeds inside the lib; only downstream consumption fails, later). A constraint is usually an invariant → **project `CLAUDE.md`**.
- Not a global skill: barrel-export discipline is a convention of *this* workspace's public-API style, not a truth of all codebases (many repos deliberately avoid barrels). Not a project skill: there is no multi-step procedure to teach — it is one rule, and a rule an agent checks against belongs in `CLAUDE.md`, which every agent reads on every task.
- **Verdict: KEEP → CLAUDE.md.** Generalized to all `libs/*`, not just `libs/ui`: the mechanism (barrel = public API) is workspace-wide, and scoping the rule to the one lib where it happened to bite would leave the identical failure live everywhere else.

### 2. Verify downstream imports resolve after adding a lib file

- **Signal:** Same three corrections, read as a missing verification step ("check that consumers can import it before declaring done").
- **Load-bearing test:** Marginal — it changes behavior, but only as a detection net for the failure that lesson 1 prevents at the source. If the barrel rule is followed, this check adds nothing session-to-session.
- **Verdict: DROP** (merged into lesson 1). Capturing both would be the swollen-file failure mode the skill warns about: two homes for one lesson. The one rule, stated with its consequence, covers it.

### 3. Automate the check (an ESLint barrel rule, or scaffold via Nx generators)

- **Signal:** Improvised-fix instinct — a repeated mechanical omission is a natural candidate for tooling.
- **Routing:** This retrospective's methodology routes lessons to **a skill or `CLAUDE.md` only**; standing up lint rules or changing the scaffolding workflow is project work, not a lesson-capture target, and proposing it here would exceed the retrospective's remit.
- **Verdict: DROP as a routed lesson.** Worth a one-line suggestion to the user (below) so the idea isn't lost, but nothing is written for it.

### 4. Anything session-local

No corrections in the record were one-off preferences or conversation-scoped context. Nothing to leave in the chat beyond the above.

## Proposed change (awaiting confirmation — nothing has been written)

**Target:** the fictional Nx monorepo's project `CLAUDE.md`, under "Conventions" (or a new "Conventions" section if none exists).

```
File: CLAUDE.md   (under "Conventions")
+ - Every lib in `libs/` exposes its public API through its barrel `index.ts`.
+   When you add a new file to a lib, export it from that lib's `index.ts` in
+   the same change — a file that exists but is un-exported builds fine locally
+   and then fails at the downstream import site.
```

Load-bearing because: a future agent adding a file to any lib wires the barrel export in the same change, instead of the user catching the missing export downstream for the third time.

## Not persisted, but worth saying once

Since the omission recurred three times mechanically, the durable fix beyond documentation is tooling: scaffold new lib files with `nx generate` (which wires barrel exports) or add a lint check that every module in a lib is reachable from its `index.ts`. That is a task to schedule, not a lesson to file.

## Bottom line

One lesson clears the bar, routed to the project `CLAUDE.md` as a single convention entry. Everything else is either the same lesson in another shape or outside what a retrospective writes down.
