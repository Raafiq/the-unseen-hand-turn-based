# Spec Kit Behaviour Verification — Complete Report (Rounds 1–3)

**Spec Kit version**: 1.0.6 (upgraded from 0.14.5.dev0)
**Reconcile extension**: 1.2.1 (stn1slv/spec-kit-reconcile)
**Tested**: 2026-09-13, three rounds, controlled mutations on scratch features
**Method**: Read installed SKILL.md files first, then ran commands against purpose-built scenarios with one variable changed per test, snapshots restored between tests

---

## The caveat that governs everything below

**`analyze` and `converge` are agent prompts (SKILL.md), not programs.** The only
deterministic parts are the shell scripts. Findings from prompt text are stable.
Findings marked *observed* are single runs of an LLM following that prompt — real evidence,
but not a guarantee of repeatability. Where both agree, confidence is high.

---

## 1. What changes your plan

### 1a. `converge` is brand new
First commit is `0c29d89` (PR #3001), earliest tag **v1.0.6**. The command is days old. No
community track record. Anything scoped assuming it has been in the wild for months needs
re-thinking. The prior claim of v0.11.2 is **refuted**.

### 1b. Feature resolution uses env var, not git branch
Both commands resolve from `SPECIFY_FEATURE_DIRECTORY` → `.specify/feature.json` → error.
`get_current_branch()` does not call git. `feature.json` is gitignored in 1.0.6. Two
developers on the same branch can point at different features. CI points at nothing.

### 1c. Converge follows spec over plan — with nuance
When spec and plan disagree, converge follows spec. A **silent** stale plan (omits a
requirement) is ignored. An **explicitly contradicting** plan is flagged. Plan-only
decisions that impose buildable obligations DO create tasks.

### 1d. Converge cannot see code blocks under non-canonical headings
A `## Contract` code block is invisible. Code blocks inside FR bodies or acceptance
scenarios ARE visible. Workaround: put binding snippets inside FRs.

### 1e. The reconcile extension works and is good
587 lines, carefully written, designed as converge's mirror image. Reconcile and converge
do not fight — converge accepted every reconciled requirement with zero findings.

---

## 2. What each command reads

| Command | spec.md | plan.md | tasks.md | Constitution | Source code | Optional docs |
|---------|---------|---------|----------|-------------|-------------|--------------|
| analyze | FR, SC, User Stories, Edge Cases | Architecture, Data Model refs, Phases, Constraints | IDs, descriptions, phases | Yes | **No** | **No** |
| converge | FR, SC, User Stories, Edge Cases | Architecture, decisions, constraints | IDs, descriptions, file paths | Yes | **Yes** (reads, never runs) | **No** |

Neither reads `research.md`, `data-model.md`, `contracts/`, or `quickstart.md`.

### What converge sees in spec.md — placement matters

| Placement | Visible? |
|-----------|----------|
| Inside FR-### body text (including nested code blocks) | **YES** |
| Inside Acceptance Scenario body | **YES** |
| Under `## Contract`, `## API`, `## Schema` (non-canonical headings) | **NO** |
| Success Criteria (SC-###) | **YES** |
| Edge Cases | **YES** |

---

## 3. What each command writes

| Command | Writes to | Shape | Can delete? |
|---------|-----------|-------|------------|
| analyze | **Nothing** — strictly read-only | Markdown table + metrics + "want remediations?" prompt | No |
| converge | **tasks.md only** — append-only | `## Phase N: Convergence` section at end, new `T###` IDs | No |
| reconcile | **spec.md + tasks.md** (plan.md untouched) | Surgical line-level edits + `## Remediation: Gaps` append | No |

- Converge when everything is satisfied: `tasks.md` **byte-for-byte unchanged**, reports Converged
- Converge never runs tests, build, or tsc — reads source text only
- Reconcile detection is **100% manual** — it reconciles exactly the drift you describe and nothing else

---

## 4. Plan reading behaviour (Round 3, P1–P3)

| Test | Setup | Result |
|------|-------|--------|
| P1 | Spec says B, plan silent, code does A | Converge follows **spec**. Flagged code as `contradicts`. |
| P2 | Spec and code say B, plan says A explicitly | Converge **detected** the plan-spec contradiction. Flagged plan as `contradicts` MEDIUM. |
| P3 | Plan has unimplemented decision, spec silent | Converge picked up the **plan-only obligation** as `missing` HIGH. |

**Rule**: spec is primary authority. Explicit plan contradictions are caught. Silent stale plans are not. Plan decisions create real obligations.

---

## 5. Scope creep detection

| Mutation | Detected? | Gap type | Mechanism |
|----------|-----------|----------|-----------|
| New exported function (no spec mentions it) | **YES** | `unrequested` MEDIUM | Converge scans exports against FR scope |
| Internal code path that contradicts an FR | **YES** | `contradicts` HIGH | Caught via FR violation, not scope creep |
| Internal addition that doesn't contradict any FR | **Likely NO** | — | Untested, but converge is requirement-driven, not code-diff-driven |

---

## 6. Analyze remediation shape

| Question | Answer |
|----------|--------|
| What shape? | One-line prose in a Recommendation column per finding. Then asks "want concrete edits?" Nothing written until user approves. |
| Distinguishes target artifact? | **YES** — Location(s) names file:line, Recommendation names the command. |
| Flags stale plan? | **YES** — as Inconsistency/HIGH. Both analyze and converge catch explicit plan contradictions; analyze classifies as Inconsistency, converge as `contradicts`. |

---

## 7. The two post-implement change paths

### Path A — code first, then reconcile

Best for: **code is right, artifacts are stale (S5)**

```
ship code  →  /speckit-reconcile-run <feature> <gap report>  →  /speckit-converge  →  (confirm)
```

- Reconcile writes spec.md (surgical) + tasks.md (append). Never touches plan.md or code.
- Updates fenced code blocks. Does NOT infer drift from code — you describe it.
- Converge accepts reconciled state cleanly. No loop.

### Path B — spec first

Best for: **requirement genuinely changed**

```
edit spec.md + plan.md  →  /speckit-analyze  →  /speckit-converge  →  /speckit-implement  →  /speckit-converge
                              (reports)           (creates tasks)       (writes delta)         (confirms)
```

**Important**: the prior claim of `analyze → implement → converge` is wrong. After a
requirement change, all tasks are `[X]`, so implement has nothing to run. **Converge must
come before implement** to create the tasks.

### When to use which

| Situation | Path | Why |
|-----------|------|-----|
| Code is right, artifacts stale | A (reconcile) | Only route that writes spec.md from shipped behaviour |
| Requirement genuinely changed | B (spec first) | Code must change; only implement writes code |
| Review feedback, no behaviour change | Neither | Fix code, touch nothing |
| Not sure which side is right | B, then A if converge was wrong | Converge tells you what artifacts want; reconcile is the follow-up |

---

## 8. Known gaps and double-counting

### Converge + reconcile double-count
Reconcile's open tasks and converge's findings can describe the same work under different
IDs. Converge is not reconcile-aware. Mitigation: complete reconcile's tasks before running
converge.

### tasks.md accumulation
Both commands are append-only. After many cycles, tasks.md is mostly convergence phases
with no consolidation mechanism. Nothing will ever tidy it.

### Bug fix drift
The bug extension is **not bundled** with 1.0.6. Bug fixes write to `.specify/bugs/`, not
`specs/`. Code drifts from spec silently. Reconcile needed after every bug fix.

---

## 9. Original ten claims — verdicts

| # | Claim | Verdict |
|---|-------|---------|
| 1 | analyze = artifact-vs-artifact; converge = code-vs-artifacts | **CONFIRMED** |
| 2 | analyze never checked code — since v0.0.17 | **SPLIT**: behaviour confirmed, version wrong (v0.0.52) |
| 3 | converge introduced in v0.11.2 | **REFUTED** — v1.0.6 |
| 4 | converge is append-only to tasks.md | **CONFIRMED** |
| 5 | converge has no git/diff/history | **CONFIRMED** |
| 6 | code always loses against spec | **CONFIRMED** (with `unrequested` caveat) |
| 7 | nothing reads across feature directories | **CONFIRMED** |
| 8 | nothing propagates spec changes to plan/tasks | **CONFIRMED** |
| 9 | no epic/parent level | **CONFIRMED** |
| 10 | rebase onto changed main — undetected | **CONFIRMED** |

---

## 10. Corrected routing guide

| # | Situation | Route |
|---|-----------|-------|
| S0 | **First** | Set `SPECIFY_FEATURE_DIRECTORY=specs/<feature>` or write `.specify/feature.json` |
| S1 | Code doesn't match spec | `/speckit-converge` → `/speckit-implement` → `/speckit-converge` |
| S2 | Requirement changed | Edit spec.md **and plan.md** → `/speckit-analyze` → `/speckit-converge` → `/speckit-implement` → `/speckit-converge` |
| S3 | Style/naming review feedback | Fix code. Touch nothing. |
| S4 | Behaviour-changing review feedback | Same as S2 |
| S5 | Code is right, spec is wrong | `/speckit-reconcile-run <feature> <gap report>` → `/speckit-converge` |
| S6 | Behaviour-neutral optimisation | Update plan.md. Invisible to spec.md. |
| S7 | Behaviour removed from spec | Edit spec.md → `/speckit-converge` (flags orphaned code as `unrequested`) |
| S8 | Rebased onto changed main | Re-read plan.md by hand. No git awareness. |

**Standing rule: run analyze before converge, always.** Converge alone gives false comfort on a stale plan.

---

## 11. Open questions — still unsettled

| Question | What would settle it |
|----------|---------------------|
| Internal scope creep without FR contradiction | Add a helper that doesn't violate any FR, run converge |
| Bug extension direct test | Install and run the `spec-kit-bug` extension |
| Analyze "concrete remediation edits" shape | Accept Step 8's offer and see what it produces |
| Do both paths converge on same artifacts? | Express one identical change both ways, diff results |
| tasks.md accumulation at scale | Run 10 converge cycles, check file usability |
| Does converge scale to large features? | Tested on 3 requirements, 1 file |
| Converge reliability across models | Repeat P2 and CB tests 3–5 times across two models |
