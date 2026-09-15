# Spec Kit Sync 2.0.0 — Test & Verification Prompt

You are testing the **Spec Kit Sync** extension v2.0.0 against this repository. The extension ships three commands: `/speckit-sync-specs`, `/speckit-sync-code`, and `/speckit-sync-rebase`. This version introduces two breaking changes from v1.0.0:

1. **Detection model** — `sync-specs` and `sync-code` now use full-state comparison (current code vs current artifacts) instead of `git diff HEAD`. Committed drift is now detectable.
2. **Artifact scope** — all three commands can read and write any `.md` file in the feature directory, not just `spec.md`, `plan.md`, and `tasks.md`.

`sync-rebase` stays diff-based. Source-of-truth exclusions are unchanged: `sync-code` never writes `spec.md`; `sync-specs` never writes source code.

---

## Phase 1: Setup

1. Install the extension from the provided zip:
   ```bash
   specify extension add /path/to/spec-kit-sync --dev
   ```
2. Confirm the active feature resolves: `SPECIFY_FEATURE_DIRECTORY` or `.specify/feature.json` must point to a feature directory with `spec.md`, `plan.md`, `tasks.md`, and at least one secondary artifact (e.g. `contracts/api.md` or `data-model.md`).
3. Verify the feature directory has at least one secondary `.md` file whose content references code constructs (paths, types, function signatures, or behavioural claims) that also appear in `spec.md` or `plan.md`.

If the repo lacks secondary artifacts, create a minimal `contracts/api.md` or `data-model.md` that contains a fenced code block duplicating a signature from `spec.md`, and commit it before testing.

---

## Phase 2: Test `/speckit-sync-specs` (code is truth)

### Test 2A — Committed drift (the v1.0.0 blind spot)

**Setup:** Introduce a code change that drifts from the spec, then **commit it**.
- Change a function signature, add a parameter, rename an export, or alter a return type in a source file that `spec.md` references.
- `git add . && git commit -m "test: introduce committed drift"`
- Confirm `git diff HEAD` is empty (no uncommitted changes).

**Run:** `/speckit-sync-specs`

**Verify:**
- [ ] The command detects the mismatch despite no uncommitted changes.
- [ ] Evidence is in "artifact says X, code says Y" format (not `+`/`-` diff lines).
- [ ] Findings reach `spec.md` and any secondary artifact that also references the changed construct.
- [ ] Proposed edits are shown for every artifact the finding reaches.
- [ ] After approval, edits are applied and the post-write chain (analyze → converge) runs.

### Test 2B — Secondary artifact detection

**Setup:** Ensure a secondary artifact (e.g. `contracts/api.md`) contains a fenced code block with a function signature that matches `spec.md` but does NOT match the current code (use the committed drift from 2A, or introduce a new one).

**Run:** `/speckit-sync-specs`

**Verify:**
- [ ] The secondary artifact appears in "Artifacts scanned: N".
- [ ] A finding reaches the secondary artifact (not just `spec.md`).
- [ ] The proposed diff for the secondary artifact is surgical — only the stale block/line changes.
- [ ] A `## Revisions` block is appended to the secondary artifact with a `[Drift: <slug>]` tag.

### Test 2C — No false positives on aligned artifacts

**Setup:** Make sure the code and all artifacts are fully in sync (run 2A/2B to completion, or manually align them).

**Run:** `/speckit-sync-specs`

**Verify:**
- [ ] Output is `✅ Nothing to sync — the code matches every artifact`.
- [ ] No approval gate is presented.
- [ ] Analyze and converge do NOT run (Steps 10–12 are skipped).

### Test 2D — `untracked` finding behaviour

**Setup:** Add a new exported function to a source file that `spec.md` references, but do NOT add it to any artifact. Commit it.

**Run:** `/speckit-sync-specs`

**Verify:**
- [ ] The new export appears as an `untracked` LOW finding.
- [ ] It has **no proposed edit** (the command never invents requirements).
- [ ] If it's the only finding, the command reports "Nothing to sync" (no edit reaches an artifact).

### Test 2E — Untracked export invalidates a count claim

**Setup:** Ensure a secondary artifact (e.g. `contracts/api.md`) contains an exhaustive or
count claim about a referenced file's exports — e.g. "exactly two runtime values" or "only
`foo` and `bar` are exported". Add a new exported function to that source file that no
artifact mentions. Commit it. The artifacts are otherwise aligned with the code.

**Run:** `/speckit-sync-specs`

**Verify:**
- [ ] An `untracked` LOW finding exists for the new export (no edit).
- [ ] A **separate** `behaviour` HIGH finding exists for the count/exhaustive claim, reaching the artifact that holds it.
- [ ] The proposed edit amends the count or enumeration to match reality (e.g. "exactly two" → "exactly three", or the enumeration lists the new export).
- [ ] The `untracked` finding still gets no edit — no requirement is invented for the new export itself.
- [ ] If no other finding reaches an artifact, the command still presents the approval gate (the `behaviour` finding has an edit).

### Test 2F — Weakened obligation flagged at approval gate

**Setup:** Change code so that a MUST or MUST NOT in `spec.md` is no longer true — e.g. a
function that MUST throw on invalid input no longer throws, or a guard that MUST reject
negative values now accepts zero. Commit it. The artifacts are otherwise aligned.

**Run:** `/speckit-sync-specs`

**Verify:**
- [ ] A `behaviour` HIGH finding exists for the weakened obligation.
- [ ] A `⚠ WEAKENED` line appears **above** the approval question, naming the FR, quoting the old and new obligation, and describing what changed.
- [ ] The `⚠ WEAKENED` line is present even if other non-weakened findings also exist.
- [ ] If the approver answers `yes`, the edit is applied normally.
- [ ] If the approver answers anything else, nothing is written (same as any rejection).

### Test 2G — Multiple root causes get separate slugs

**Setup:** Introduce two **unrelated** code changes in the same run — e.g. change a
function signature in one file AND change a type definition in a different file. Both should
make artifact claims false. Commit both.

**Run:** `/speckit-sync-specs`

**Verify:**
- [ ] Findings for the two changes get **different** slugs (e.g. `[Drift: parse-tag-options]` and `[Drift: element-type-change]`).
- [ ] Each artifact gets separate `### Revision:` entries for each slug it was affected by.
- [ ] Both entries sit under a single `## Revisions` heading (not duplicated).
- [ ] Tasks in `tasks.md` carry the slug of their respective root cause, not a shared slug.

---

## Phase 3: Test `/speckit-sync-code` (spec is truth)

### Test 3A — Spec change propagates to secondary artifacts

**Setup:** Edit `spec.md` — change a function signature in an FR's code block, or add a new acceptance criterion. Ensure a secondary artifact (e.g. `contracts/api.md`, `data-model.md`) references the same construct with the old version.

**Run:** `/speckit-sync-code`

**Verify:**
- [ ] The command reads `spec.md` as truth and finds mismatches in `plan.md`, `tasks.md`, AND the secondary artifact.
- [ ] `spec.md` is NOT in the list of files to be written — confirm it's excluded.
- [ ] Proposed edits for secondary artifacts follow the surgical rule (only the stale line/block).
- [ ] New tasks (if any) are appended under `## Remediation: Gaps` with `[Drift: <slug>]`.
- [ ] After approval: analyze → converge → implement (if open work) → converge runs in sequence.

### Test 3B — No diff baseline needed

**Setup:** Edit `spec.md` and **commit** the change. Confirm `git diff HEAD` is empty.

**Run:** `/speckit-sync-code`

**Verify:**
- [ ] The command still detects mismatches between `spec.md` and other artifacts — it does NOT require spec.md to have uncommitted changes.
- [ ] Evidence is "spec says X, artifact says Y" — no reference to a diff.

### Test 3C — `added` finding for untracked obligation

**Setup:** Add a new FR to `spec.md` that no other artifact mentions and no open task covers.

**Run:** `/speckit-sync-code`

**Verify:**
- [ ] An `added` finding is produced for the new FR.
- [ ] A task is appended to `tasks.md` for the new obligation.
- [ ] If the plan has no natural home for it, the command notes this under Outstanding instead of inventing a new section.

---

## Phase 4: Test `/speckit-sync-rebase` (upstream truth, still diff-based)

### Test 4A — Upstream change reaches secondary artifact

**Setup:**
1. On `main`, change a source file that a secondary artifact references. Commit and push.
2. On the feature branch, run `git rebase origin/main`.

**Run:** `/speckit-sync-rebase`

**Verify:**
- [ ] The command detects the upstream change via diff (not full-state).
- [ ] Findings reach the secondary artifact, not just `spec.md`/`plan.md`.
- [ ] The secondary artifact gets a proposed edit and a `[Drift: rebase-<old>-<new>]` revision note.
- [ ] Evidence includes `+`/`-` lines (diff-based, unlike sync-specs).

### Test 4B — Unchanged files don't enter scope

**Run:** `/speckit-sync-rebase` on a rebase where upstream only changed files no artifact references.

**Verify:**
- [ ] Output is `✅ Clean — N incoming commits, M changed files, none referenced by any artifact`.
- [ ] Not "none referenced by spec.md or plan.md" (old wording).

### Test 4C — Upstream weakens an obligation

**Setup:**
1. On `main`, change code so that a MUST in `spec.md` is weakened (e.g. a guard relaxed). Commit.
2. On the feature branch, `git rebase origin/main`.

**Run:** `/speckit-sync-rebase`

**Verify:**
- [ ] A `⚠ WEAKENED` line appears above the approval question.
- [ ] The line names the FR and describes the old vs new obligation.

---

## Phase 5: Cross-cutting checks (apply to every command)

Run these against the results of any test above:

- [ ] **Approval gate is all-or-nothing.** Answer something other than `yes` — confirm nothing is written.
- [ ] **`[X]` tasks are never touched.** Introduce drift on a construct that a completed task references — the finding should exist but no edit should touch that task.
- [ ] **No writes under `## Phase N: Convergence`.** Check tasks.md after every run.
- [ ] **Task IDs continue the sequence.** If the highest existing ID is T006, new tasks start at T007.
- [ ] **Header blocks untouched.** The content above the first `##` in every artifact is identical before and after.
- [ ] **Re-run produces no further changes.** After a successful sync, re-running the same command outputs "Nothing to sync".

### Test 5A — Revision note amend-in-place (idempotency)

The 1.0.0 report noted this path was never exercised. This test forces it.

**Setup:** Start from the state after Test 2A (committed drift detected, edits applied, all
artifacts carry `[Drift: <slug>]`). Now introduce a **second** code change to the same
construct that the existing `[Drift: <slug>]` covers — e.g. if 2A added a `floor` param,
change its type or default. Commit it. The artifacts are now stale again for the same
logical drift.

**Run:** `/speckit-sync-specs`

**Verify:**
- [ ] The command detects the new mismatch.
- [ ] It recognises the existing `[Drift: <slug>]` tag in each artifact and **amends** that
      entry's `Reason:` and `Items:` lines rather than appending a second `### Revision:` block.
- [ ] After the edit, each artifact has exactly **one** `### Revision:` entry for that slug,
      with updated reason and items.
- [ ] No duplicate `## Revisions` heading is created.
- [ ] Re-running again after approval produces "Nothing to sync".

### Test 5B — Revision note: new slug for a different drift

**Setup:** From the state after Test 5A, introduce a drift on a **different** construct (a
different function, type, or file) that no existing `[Drift: …]` tag covers. Commit it.

**Run:** `/speckit-sync-specs`

**Verify:**
- [ ] A **new** `### Revision:` entry is appended under the existing `## Revisions` heading
      with a different slug.
- [ ] The earlier `[Drift: <slug>]` entry is untouched.
- [ ] The artifact now has exactly two `### Revision:` entries under one `## Revisions` heading.

---

## Phase 6: Scale test (A1 / A4 validation)

The fixture in Phases 2–4 used 6 artifacts and 2–4 source files. This phase tests at a
scale closer to a real feature to validate assumptions A1 (token budget) and A4 (noise).

### Setup

Create a feature directory with the following (or use an existing large feature):

1. **10+ `.md` artifacts**: `spec.md`, `plan.md`, `tasks.md`, plus at least 7 secondary
   artifacts — e.g. `contracts/api.md`, `contracts/events.md`, `contracts/errors.md`,
   `data-model.md`, `research.md`, `migration-plan.md`, `test-strategy.md`. Each should
   contain at least one fenced code block or behavioural claim referencing a source file.
2. **10+ referenced source files**: the artifacts should collectively reference at least 10
   distinct source files by path. These files must exist and contain the constructs the
   artifacts describe.
3. **2–3 genuine mismatches**: introduce 2–3 committed code changes that make specific
   artifact claims false. Leave the remaining artifacts aligned.
4. **Noise traps**: include artifacts with prose that uses code-like words in non-technical
   context (similar to `research.md` in the fixture) to exercise A5 at scale.

Commit everything so the working tree is clean.

### Test 6A — `sync-specs` at scale

**Run:** `/speckit-sync-specs`

**Verify:**
- [ ] "Artifacts scanned" count matches the actual number of `.md` files.
- [ ] "Source files read" count matches the number of distinct files the artifacts reference.
- [ ] The 2–3 genuine mismatches are all found with correct evidence.
- [ ] No false positives on aligned artifacts or noise-trap prose.
- [ ] No truncation: every artifact that holds a stale claim gets a finding. Cross-check by
      searching each artifact for the changed construct — if it mentions it, there must be a
      finding.
- [ ] The findings table, proposed diffs, and post-write chain all complete without the agent
      losing track of context or producing hallucinated evidence.
- [ ] Total LOW/cosmetic findings are reasonable (not dozens of spurious matches).

### Test 6B — `sync-code` at scale

**Setup:** Edit `spec.md` to change a construct that 4+ secondary artifacts reference.

**Run:** `/speckit-sync-code`

**Verify:**
- [ ] Findings cascade to all 4+ artifacts that reference the changed construct.
- [ ] Proposed diffs across all artifacts are mutually consistent.
- [ ] The implement step (if it runs) doesn't time out or lose context.
- [ ] Final converge produces a coherent result.

Record context-window pressure symptoms if any: truncated findings tables, missed artifacts,
hallucinated file paths, garbled diffs, or the agent stopping mid-chain.

---

## Assumptions to validate

These are claims baked into the prompts that could fail in practice. Flag any that break.

| # | Assumption | Tested by | Risk |
|---|---|---|---|
| A1 | The agent can read all `.md` files in the feature dir in one pass and hold them in context alongside referenced source files. | **6A, 6B** (10+ artifacts, 10+ source files). Watch for truncation, missed findings, or hallucinated evidence. | High — token budget is the main constraint. |
| A2 | Content-based matching (references, code blocks, claims) is reliable enough to scope which artifacts a finding reaches. | **2A, 2E, 3A**. Check whether the agent correctly identifies which secondary artifacts reference the changed construct and doesn't false-positive on artifacts that don't. | Medium — the agent must parse fenced blocks and prose claims accurately. |
| A3 | "Artifact says X, code says Y" evidence is actionable enough for the developer to approve/reject. | **2A, 3A**. Read the proposed diffs. Is the evidence clear without `+`/`-` context? | Medium — loss of diff context could make large changes harder to evaluate. |
| A4 | Full-state comparison doesn't produce excessive noise on a large feature with many artifacts. | **6A** (mostly aligned, 2–3 genuine mismatches at scale). Count false positives and LOW/cosmetic findings. | Medium — the old diff filter suppressed noise; full-state must rely on classification. |
| A5 | The agent correctly distinguishes "artifact X references construct Y" from "artifact X happens to mention a word that looks like construct Y" (e.g. a prose mention of `Tag` vs the `Tag` interface). | **2A, 6A** (noise traps in both). Check whether prose-only artifacts are falsely flagged. | Medium — identifier extraction from prose is heuristic. |
| A6 | `sync-code` can cascade a spec change through 3+ artifacts without losing coherence or contradicting its own edits across files. | **3A** (3 artifacts), **6B** (4+ artifacts). Check mutual consistency. | Medium — each diff is generated independently against the spec. |
| A7 | `sync-rebase` with expanded artifact scope doesn't regress on the range detection or ORIG_HEAD sanity check. | **4A, 4B**. Confirm identical range detection behaviour to 1.0.0. | Low — those sections are unchanged. |
| A8 | The `[Drift: <slug>]` revision note in secondary artifacts works with the same idempotency as in primary artifacts. | **5A** (amend-in-place), **5B** (new slug alongside existing). Check secondary artifact revision notes. | Low — same prompt logic, but secondary artifacts are a new write target. |
| A9 | An `untracked` construct that invalidates a count/exhaustive claim produces a separate `behaviour` finding. | **2E**. The fix for Anomaly 1. | Medium — new prompt logic, not yet validated. |
| A10 | The agent assigns separate slugs to unrelated root causes in the same run, and writes separate revision entries for each. | **2G**. Two unrelated changes, one run. | Medium — the agent must judge "same root cause" vs "different root cause" per finding. |
| A11 | The agent reliably detects when a proposed edit weakens a MUST/MUST NOT and surfaces it as `⚠ WEAKENED` before the gate. | **2F, 4C**. One sync-specs, one sync-rebase. | Medium — the agent must compare old obligation text against the proposed replacement and judge whether it's weaker. |

---

## Reporting

For each test, record:
1. **Pass/Fail** with the checklist above.
2. **Evidence** — the command's output (findings table, proposed diffs, applied table, final status).
3. **Anomalies** — anything surprising, even if the test passes (e.g. excessive findings, unclear evidence, slow execution).
4. **Assumption validation** — which assumptions from the table above were exercised and whether they held.

Compile into a `TEST-REPORT.md` following the same structure as the 1.0.0 report.
