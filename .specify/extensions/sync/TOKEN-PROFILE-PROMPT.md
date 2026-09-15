# Spec Kit Sync 2.0.0 — Token Consumption Profiling

You are profiling token consumption of the Spec Kit Sync extension against this repository.
The goal is to identify where tokens are spent so we can decide where to optimize.

---

## What to measure

For each command run, capture a **token ledger** — a table breaking down what was read,
what was generated, and what was read again by the post-write chain.

### Input token proxies

We can't read API billing directly, but we can measure **characters read** as a proxy
(~4 chars ≈ 1 token for English/code). For every file the agent reads during a run:

```markdown
| Step | File | Lines | Chars | Read how | Why |
|------|------|-------|-------|----------|-----|
| 2    | spec.md | 847 | 34,200 | full | artifact discovery |
| 2    | plan.md | 312 | 14,800 | full | artifact discovery |
| 2    | contracts/api.md | 89 | 3,600 | full | artifact discovery |
| 4    | src/sim/movement.ts | 225 | 8,100 | full | referenced source file |
| 10   | spec.md | 847 | 34,200 | full | analyze re-reads |
| 10   | plan.md | 315 | 15,020 | full | analyze re-reads |
| ...  | ...  | ...   | ...   | ... | ... |
```

Count **every** file read, including re-reads by the post-write chain. The same file read
three times (once by sync, once by analyze, once by converge) appears three times.

### Output token proxies

Measure the character count of each output section:

```markdown
| Section | Chars | What |
|---------|-------|------|
| Reference table | 2,400 | Step 3 output |
| Findings table | 1,800 | Step 6 output |
| Proposed diffs | 4,200 | Step 7 output |
| Applied report | 600 | Step 9 output |
| Analyze output | 3,100 | Step 10 (full analyze run) |
| Converge output | 2,800 | Step 11 (full converge run) |
| Implement output | 8,500 | Step 11 (sync-code only) |
| Final status | 400 | Step 12 output |
```

### The command prompt itself

Before running any test, measure the three command prompts:

```bash
wc -c commands/sync-specs.md commands/sync-code.md commands/sync-rebase.md
```

And the core command prompts they invoke (analyze, converge, implement) — find them in
`.claude/skills/` or the speckit extension directory:

```bash
find .claude/skills -name "*.md" | xargs wc -c | sort -n
```

---

## Runs to profile

### Run P1 — `sync-specs` on the small fixture (6 artifacts, 4 source files)

Use the same fixture as Phase 2 tests (996-movement-slot). Introduce one committed drift.

**Run:** `/speckit-sync-specs`

Capture the full token ledger. After the run, also note:
- Total input chars (sum of all file reads, including re-reads)
- Total output chars (sum of all output sections)
- Total estimated tokens: `(input_chars + output_chars) / 4`
- **Waste ratio**: chars from files that had zero findings / total input chars

### Run P2 — `sync-specs` on the scale fixture (11 artifacts, 11 source files)

Use the same fixture as Phase 6 tests (993-sim-surface). Introduce 2–3 committed drifts.

Same measurements as P1.

### Run P3 — `sync-code` on the small fixture

Edit spec.md to change one construct. Run `/speckit-sync-code`.

Same measurements, plus separately measure the implement + second converge chain.

### Run P4 — `sync-code` on the scale fixture

Same as P3 but on the 993 fixture.

### Run P5 — Baseline: `analyze` alone

Run `/speckit-analyze` on the same fixture without any sync. This tells us the baseline
cost of a core command run, so we can see how much the sync command adds on top.

### Run P6 — Baseline: `converge` alone

Run `/speckit-converge` on the same fixture. Same purpose.

---

## Analysis to produce

After all runs, compile:

### 1. Token breakdown by category

For each run, calculate what percentage of total tokens went to:

```markdown
| Category | P1 chars | P1 % | P2 chars | P2 % |
|----------|----------|------|----------|------|
| Command prompt | | | | |
| Artifact reads (sync steps) | | | | |
| Source file reads | | | | |
| Findings + diffs (output) | | | | |
| Post-write chain: analyze | | | | |
| Post-write chain: converge | | | | |
| Post-write chain: implement | | | | |
| **Total** | | | | |
```

### 2. Re-read amplification

How many times was each file read across the full run (sync + chain)?

```markdown
| File | Sync | Analyze | Converge | Implement | Converge 2 | Total reads |
|------|------|---------|----------|-----------|------------|-------------|
| spec.md | 1 | 1 | 1 | 0 | 1 | 4 |
| plan.md | 1 | 1 | 1 | 0 | 1 | 4 |
| tasks.md | 1 | 1 | 1 | 1 | 1 | 5 |
| src/sim/movement.ts | 1 | 0 | 0 | 1 | 0 | 2 |
```

### 3. Waste analysis

For each run, identify:
- **Files read with zero findings** (artifact was read but nothing was stale)
- **Source files read with no mismatch** (referenced but code matches perfectly)
- **Post-write chain re-reads of unchanged files** (file wasn't edited by sync but
  analyze/converge read it again anyway)

Calculate: `waste_chars / total_chars = waste_ratio`

### 4. Scaling projection

Based on P1 vs P2 (and P3 vs P4), estimate:
- Per-artifact marginal cost (how much does each additional .md file add?)
- Per-source-file marginal cost
- Is growth linear or worse?

### 5. Top-3 reduction opportunities

Rank the categories by potential savings. For each, note:
- What could be skipped or reduced
- What would be missed (false negatives)
- Estimated savings as a percentage of total

---

## Report format

Compile into `TOKEN-PROFILE.md` with all tables above. Include the raw ledgers from each
run as appendices so we can drill into specific files.

The report should end with a **Recommendation** section: based on the data, which
optimization approach (staged reading, git pre-filter, both, or something else) would
give the best token reduction with the least coverage loss?
