# spec-kit-sync 2.0.0 — token consumption profile

**Spec Kit**: 1.0.6 · **Extension**: `sync` 2.0.0 (directory `spec-kit-sync`, third drop) ·
**Date**: 2026-09-15 · **Prompt**: `TOKEN-PROFILE-PROMPT.md` in this directory

**Where**: two scratch clones under the session scratchpad — `sync-drop3` on branch
`profile-small` at baseline `43a4f7f` (fixture `specs/996-movement-slot`, runs P1, P5, P6, P3)
and `sync-scale` at `4f5ca71` (fixture `specs/993-sim-surface`, runs P2, P4). Nothing was
committed in the working checkout and nothing was pushed.

**Read this first.** Each row is **one run** of an agent following a prompt through the Skill
tool. Characters read and written are a **proxy** for tokens at ~4 chars ≈ 1 token; they are
not API billing. A real run re-sends the whole accumulated conversation on every turn, so the
true token count is several times the proxy: `TEST-REPORT.md` 6A logged **~174k real tokens**
against a ~52k char/4 estimate for the same run shape, and 6B logged **~192k**. Use these
numbers to compare *where* tokens go, not *how many* there are.

---

## Method

| What | How |
|---|---|
| Input | `wc -lc` on every file the agent read, counted **once per read** — a file read three times appears three times. Script, grep and CLI output counted as rendered into context. |
| Output | `wc -c` on each printed section, captured one file per section under `profile/out/`. Nothing estimated except three grep sizes in P4, marked `~`. |
| Est. tokens | `(input_chars + output_chars) / 4`. |
| Waste ratio | chars of input that produced **no finding and no edit** in that run / total input chars. |
| Excluded | Warm-up runs. Both fixtures got one `✅ Nothing to sync` run on the aligned baseline before any drift was planted; neither is ledgered (996 ≈ 56.9k input chars, 993 ≈ 108.0k). |

### Caveats

| Caveat | Effect on the numbers |
|---|---|
| char/4 is not an API token count | Every figure here is low by the conversation-re-send multiple. TEST-REPORT 6A: ~174k real vs ~52k proxy for a P2-shaped run — a ~3.3× gap. Ratios and shares are unaffected; absolute totals are floors. |
| Skill prompts are charged cold, but deduplicated in-conversation | P1, P2, P3 charge each `SKILL.md` at its on-disk size per invocation. In P4 the harness answered analyze and both converge invocations with "already loaded" and sent **0** chars. P4 is therefore reported twice: warm 75,429 / cold 100,653 input. |
| P2's converge source re-read was truncated by an output cap | The five-file batch (`equipment,rng,ability,condition,loadout`) rendered 2,048 of 35,651 chars inline; the rest went to a file the model never read. Counted at **2,048**. An uncapped run would add 33,603 chars (+18.7% of P2 input). |
| P3's implement could not run the suite | The small clone has no `node_modules`; vitest died with `ERR_MODULE_NOT_FOUND` and only a 1,354-char failure log was read. Whether P3's new tests pass is **n/m**. P4 ran clean: `tsc` exit 0, `vitest run src/sim` 613 passed / 1 skipped. |
| Three P4 grep sizes are `~` estimates | `~1000`, `~110`, `~980`, `~400` chars, from rendered line counts, ±10%. Everything else is a `wc -c`. |
| Converge appends duplicate tasks with fresh IDs | P1's chained converge and the standalone P6 each re-derived the same two gaps and appended new IDs; the same two pieces of work are queued four times across T006/T007/T010 and T008/T011. Inflates output and every later read of `tasks.md`. Core Spec Kit behaviour, not this extension's. |

### Ledger corrections applied

Three of the two agents' stated figures do not survive re-adding their own rows. The rows win.

| Figure | Reported | Row sum | Used here |
|---|---|---|---|
| P2 total input chars | 179,639 | **179,644** | 179,644. The 5-char `git rev-parse` row was dropped from the total; the ledger's own category table also sums to 179,644. Est. tokens 51,582 (not 51,580); waste 45.05% (not 45.1%). |
| P4 "steps 1–8" input | 41,886 | **47,314** | 47,314. The run totals (75,429 / 16,095 / 22,881) are correct; only the segment row was wrong. Corrected est. tokens for steps 1–8: 13,861. |
| P4 "steps 1–8" output | 9,180 | **8,130** | 8,130. |
| P4 input-category table | sums to 77,561 | total is 75,429 | Rebuilt from the Step column (converge row is 5,808 across both invocations, not 3,311; grep/CLI rows were double-counted into the chain rows). |

Everything else the two agents reported matched their ledgers on re-check, including P1
(122,381 / 14,642 / 34,256 / 0.451), P3 (161,614 / 13,858 / 43,868 / 0.149, implement 43.2%,
implement + converge-2 58.3%), P5, P6, all prompt sizes and P2's 59,879 / 44,511 source figures.

---

## Prompt sizes

| Prompt | Lines | Chars |
|---|---|---|
| `.claude/skills/speckit-sync-specs/SKILL.md` | 295 | 16,771 |
| `.claude/skills/speckit-sync-code/SKILL.md` | 272 | 15,328 |
| `.claude/skills/speckit-sync-rebase/SKILL.md` | 344 | 19,791 |
| `.claude/skills/speckit-implement/SKILL.md` | 229 | 13,199 |
| `.claude/skills/speckit-converge/SKILL.md` | 279 | 13,085 |
| `.claude/skills/speckit-analyze/SKILL.md` | 262 | 12,139 |
| Chain total (analyze + converge + implement) | 770 | **38,423** |

The `.specify/extensions/sync/commands/*.md` originals are the same content, 86–127 chars
larger in frontmatter (sync-specs 16,857 · sync-code 15,482 · sync-rebase 19,918). The Skill
tool loads the `.claude/skills` copy; that is what every ledger charges.

## Fixtures

| | `996-movement-slot` (small) | `993-sim-surface` (scale) |
|---|---|---|
| Artifacts | 6 | 11 |
| Artifact lines / chars | 132 / **5,395** | 697 / **31,360** |
| Mean artifact size | 899 chars | 2,851 chars |
| Referenced source files | 4 (+ `docs/02-…md`, named by a task path) | 11 |
| Source lines / chars | 763 / **34,528** (+17,659 for `docs/02` = 52,187) | 1,298 / **59,872** |
| Mean source size | 8,632 chars (10,437 incl. `docs/02`) | 5,443 chars |
| Largest single file | `src/sim/build.test.ts` 22,387 | `src/sim/loadout.ts` 9,626 |

P2 read 59,879 chars of source, not 59,872: the planted drifts added 8 chars to `element.ts`
and removed 1 from `rng.ts`. P1 read `movement.ts` at 3,334, not 3,310, for the same reason.

## Per-run totals

| Run | Command | Fixture | Input chars | Output chars | Est. tokens | Waste ratio | Chain stages run | Findings | Files written |
|---|---|---|---|---|---|---|---|---|---|
| **P1** | `sync-specs` | 996, 1 drift | 122,381 | 14,642 | **34,256** | 0.451 | analyze, converge | 5 HIGH | 5 (spec, plan, api, data-model, tasks) |
| **P2** | `sync-specs` | 993, 3 drifts | 179,644 | 26,682 | **51,582** | 0.451 | analyze, converge | 13 HIGH + 1 LOW | 6 by sync + tasks.md by converge |
| **P3** | `sync-code` | 996, 1 spec change | 161,614 | 13,858 | **43,868** | 0.149 | analyze, converge, implement, converge-2 | 1 CRITICAL, 1 HIGH, 2 MEDIUM | 4 by sync + 3 source by implement + tasks.md appends |
| **P4** | `sync-code` | 993, rename | 75,429 warm / 100,653 cold | 16,095 | **22,881** warm / **29,187** cold | 0.136 strict / 0.181 incl. | analyze, converge, implement, converge-2 | 4 CRITICAL, 1 HIGH, 1 MEDIUM | 6 artifacts + 5 source by implement |
| **P5** | `analyze` alone | 996, post-P1 | 23,015 | 2,643 | **6,415** | 0.272 loose / 0.225 strict | — | 1 HIGH, 4 MEDIUM, 1 LOW | 0 (read-only) |
| **P6** | `converge` alone | 996, post-P1 | 32,439 | 2,753 | **8,798** | 0.160 | — | 1 HIGH, 1 MEDIUM, 2 LOW | 1 (tasks.md append) |

A full `sync-code` chain (P3) costs **5.0× a bare analyze** and **2.6× a bare converge** on the
same fixture. On the scale fixture `sync-specs` costs **2.3× `sync-code`** (P2 51,582 vs P4
22,881), and still 1.8× against P4's cold figure.

---

## 1. Token breakdown by category

Percentages are of the **whole run** (input + output), so the rows sum to 100%. Two folds were
needed to fit the prompt's category list; both are stated rather than hidden:

- **Command prompt(s)** holds every `SKILL.md` loaded in the run — the sync command *and* the
  chained analyze/converge/implement prompts. The chain rows therefore exclude their own
  prompt. The split is given under the table.
- **Source file reads** in P1 includes `docs/02-job-and-customization-system.md` (17,659), read
  because a `tasks.md` line names the path. It is not a feature artifact and not a `src/` file.
- **Script / CLI output** (`check-prerequisites.sh`, `git rev-parse`, `find`, `git diff --stat`)
  has no row in the prompt's list; it is broken out rather than folded, because folding it would
  silently move 0.3–0.7% into whichever category was chosen.
- Chain rows are **input + output for that stage**. `Findings + diffs` is the sync step's output
  only (reference table, findings table, proposed diffs, gate, applied report, final status).

| Category | P1 chars | P1 % | P2 chars | P2 % | P3 chars | P3 % | P4 chars | P4 % |
|---|---|---|---|---|---|---|---|---|
| Command prompt(s) | 41,995 | 30.6% | 41,995 | 20.4% | 66,836 | 38.1% | 28,527 | 31.2% |
| Artifact reads (sync steps) | 5,395 | 3.9% | 31,360 | 15.2% | 5,407 | 3.1% | 31,390 | 34.3% |
| Source file reads (sync steps) | 52,211 | 38.1% | 59,879 | 29.0% | 0 | 0% | 0 | 0% |
| Findings + diffs (output) | 9,131 | 6.7% | 22,053 | 10.7% | 5,014 | 2.9% | 8,617 | 9.4% |
| Post-write chain: analyze | 13,370 | 9.8% | 22,168 | 10.7% | 12,606 | 7.2% | 7,852 | 8.6% |
| Post-write chain: converge | 14,144 | 10.3% | 28,245 | 13.7% | 25,172 | 14.3% | 8,253 | 9.0% |
| Post-write chain: implement | 0 | — | 0 | — | 59,671 | 34.0% | 6,289 | 6.9% |
| Script / CLI output | 777 | 0.6% | 626 | 0.3% | 766 | 0.4% | 596 | 0.7% |
| **Total** | **137,023** | 100% | **206,326** | 100% | **175,472** | 100% | **91,524** | 100% |

**Command-prompt split** (chars):

| Run | Sync command | Chained prompts | Why |
|---|---|---|---|
| P1 | sync-specs 16,771 | analyze 12,139 + converge 13,085 = 25,224 | one chain pass |
| P2 | sync-specs 16,771 | analyze 12,139 + converge 13,085 = 25,224 | one chain pass |
| P3 | sync-code 15,328 | analyze 12,139 + converge 13,085 + implement 13,199 + converge 13,085 = **51,508** | converge charged twice |
| P4 | sync-code 15,328 | implement 13,199 only — analyze and both converge loads returned 0 | harness dedupe; cold would be +25,224 |

**What the table says.** Three different runs, three different dominant costs:

- **P2 (`sync-specs` at scale): source reading, 29.0%** — and the chain reads the same source
  again, putting another 12.7% of the run in the converge row. Source is charged ~1.4× even
  with the truncation.
- **P3 (`sync-code`, small): the chain, 55.5%** — implement alone is 34.0%, converge 14.3%.
  The sync step proper is 12.3% of the run. Prompts are 38.1%, more than the codebase.
- **P4 (`sync-code` at scale): artifacts and prompts, 65.5% between them.** Source reading is
  zero in the sync steps by design, and implement worked by grep rather than by full reads.
- **P1 (`sync-specs`, small): source, 38.1%** — but 40,046 of that 52,211 is two files
  (`build.test.ts` 22,387, `docs/02` 17,659) that produced **zero findings**.

---

## 2. Re-read amplification

### `sync-specs` shape

**P1** (996, 1 drift). Chain = analyze + converge; no implement, so those columns are `–`.

| File | Sync | Analyze | Converge | Implement | Converge 2 | Total reads |
|---|---|---|---|---|---|---|
| spec.md | 1 | 1 | 1 | – | – | 3 |
| plan.md | 1 | 1 | 1 | – | – | 3 |
| tasks.md | 1 | 1 | 1 | – | – | 3 |
| contracts/api.md | 1 | 0 | 0 | – | – | 1 |
| data-model.md | 1 | 0 | 0 | – | – | 1 |
| research.md | 1 | 0 | 0 | – | – | 1 |
| src/sim/movement.ts | 1 | 0 | 0 | – | – | 1 |
| src/sim/trait.ts | 1 | 0 | 0 | – | – | 1 |
| src/sim/trait.test.ts | 1 | 0 | 0 | – | – | 1 |
| src/sim/build.test.ts | 1 | 0 | 1 (grep) | – | – | 2 |
| docs/02-…-system.md | 1 | 0 | 0 | – | – | 1 |
| .specify/memory/constitution.md | 0 | 1 | 1 | – | – | 2 |
| .specify/extensions.yml | 0 | 1 | 1 | – | – | 2 |
| `SKILL.md` prompts | 1 | 1 | 1 | – | – | 3 (three different files) |

**P2** (993, 3 drifts).

| File | Sync | Analyze | Converge | Implement | Converge 2 | Total reads |
|---|---|---|---|---|---|---|
| spec.md | 1 | 1 | 0 | – | – | 2 |
| plan.md | 1 | 1 | 0 | – | – | 2 |
| tasks.md | 1 | 1 | 0 | – | – | 2 |
| data-model.md · research.md · glossary.md · migration-plan.md · test-strategy.md · contracts/{api,events,errors}.md | 1 each | 0 | 0 | – | – | 1 each |
| src/sim/{element,trait,support,reaction,status,job}.ts | 1 | 0 | 1 | – | – | 2 |
| src/sim/{equipment,rng,ability,condition,loadout}.ts | 1 | 0 | 1 (truncated) | – | – | 2 |
| .specify/memory/constitution.md | 0 | 1 | 0 | – | – | 1 |
| .specify/extensions.yml | 0 | 1 | 0 | – | – | 1 |

P2's converge re-read **all eleven** source files and skipped the three core artifacts, because
analyze had read them in the same turn. P1's converge did the reverse. The amplification moves
between categories run to run; the total does not fall.

### `sync-code` shape

**P3** (996). Full chain.

| File | Sync | Analyze | Converge | Implement | Converge 2 | Total reads |
|---|---|---|---|---|---|---|
| **spec.md** | 1 | 1 | 1 | 0 | 1 | **4** |
| plan.md | 1 | 1 | 1 | 1 | 1 | 5 |
| **tasks.md** | 1 | 1 | 1 | 1 | 1 | **5** |
| contracts/api.md | 1 | 0 | 0 | 1 | 0 | 2 |
| data-model.md | 1 | 0 | 0 | 1 | 0 | 2 |
| research.md | 1 | 0 | 0 | 1 | 0 | 2 |
| .specify/memory/constitution.md | 0 | 1 | 1 | 1 | 1 | 4 |
| .specify/extensions.yml | 0 | 1 | 1 | 1 | 1 | 4 |
| src/sim/movement.ts | 0 | 0 | 1 (range) | 1 | 1 (grep) | 3 |
| src/sim/build.test.ts | 0 | 0 | 1 (grep) | 2 | 1 (grep) | 4 |
| src/sim/build.ts | 0 | 0 | 1 (range) | 0 | 0 | 1 |
| docs/02-…-system.md | 0 | 0 | 0 | 1 | 1 (grep) | 2 |
| check-prerequisites.sh | 1 | 1 | 1 | 1 | 1 | 5 |

`spec.md` is read four times although `sync-code` may never write it.
`constitution.md` (5,176) is read four times and produced a finding in none of them.

**P4** (993). Full chain. **Every count is a lower bound** — the harness suppressed re-sends
of content already in the conversation. Cold counts beside them.

| File | Sync | Analyze | Converge | Implement | Converge 2 | Total (warm) | Total (cold) |
|---|---|---|---|---|---|---|---|
| **spec.md** | 1 | 0 | 0 | 0 | 0 | **1** | **2** (cold analyze re-reads it, +6,949) |
| plan.md | 1 | 1 | 0 | 0 | 0 | 2 | 2 |
| **tasks.md** | 1 | 1 | 0 | 0 | 0 | **2** | **3** (cold implement re-reads it, +1,417) |
| data-model.md · research.md · glossary.md · migration-plan.md · test-strategy.md · contracts/{api,events,errors}.md | 1 each | 0 | 0 | 0 | 0 | 1 each | 1 each |
| src/sim/element.ts | 0 | 0 | 1 | 1 (grep) | 1 | 3 | 3 |
| src/sim/state.ts | 0 | 0 | 1 (grep) | 1 (grep) | 1 (range) | 3 | 3 |
| src/sim/{ability,equipment,index}.ts | 0 | 0 | 1 (grep) | 1 (grep) | 1 (grep) | 3 (grep only) | 3 |
| other `src/sim/*.ts` (8 files) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `SKILL.md` prompts | sync-code 1 | 0 (deduped) | 0 (deduped) | implement 1 | 0 (deduped) | 2 files | 5 loads, +25,224 chars |

Cold P4 input: **100,653** (warm 75,429 + 25,224 prompt re-sends). The +8,366 of cold artifact
re-reads (spec.md 6,949 + tasks.md 1,417) is **not** included in that figure — it is named in
the ledger but was never folded into a total, so the true cold input is ~109,019. Reported here
as the ledger has it, with the gap stated.

---

## 3. Waste analysis

`waste = chars of input that produced no finding and no edit in that run`.

| Run | Files read with zero findings | Source files with no mismatch | Chain re-reads of unchanged files | Waste / total | What dominates |
|---|---|---|---|---|---|
| **P1** | research.md 720 · tasks.md 469 · docs/02 17,659 · constitution.md 5,176 | trait.ts 5,308 · trait.test.ts 3,523 · build.test.ts 22,387 = **31,218** (3 of 4, 25.5% of input) | constitution 2× · extensions.yml 2× · check-prerequisites 3× (second reads folded into the 5,176 above, not double-counted) | 55,242 / 122,381 = **0.451** | Source. Two files — `build.test.ts` and `docs/02` — are 40,046 chars, 32.7% of input, zero findings between them. |
| **P2** | tasks.md 1,179 · research.md 2,440 · glossary.md 1,782 · test-strategy.md 1,943 · contracts/events.md 1,620 = **8,964** | 8 of 11 = **44,511** (24.8% of input) | analyze re-read tasks.md 1,179 (unedited) · converge re-read all 11 source files 26,276 as delivered = **27,455** | 80,930 / 179,644 = **0.450** | Source, twice over: 44,511 read for nothing, then 26,276 of re-read that `sync-specs` can never act on (it never writes source). |
| **P3** | research.md 720 ×2 = 1,440 · constitution.md 5,176 ×4 = **20,704** · contracts/api.md + data-model.md re-read by implement 2,009 | none — `sync-code` reads no source in its own steps; the chain's `build.ts` slice (249) matched | spec.md read 3 extra times after sync (5,409) · constitution 4× · extensions.yml 4× · check-prerequisites 5× | 24,153 / 161,614 = **0.149** | The constitution. 20,704 chars, 12.8% of input, four passes, zero principle findings. |
| **P4** | research.md 2,440 · test-strategy.md 1,943 · contracts/events.md 1,620 · contracts/errors.md 1,842 = **7,845** | **0** — `sync-code` reads no source | converge-1's element.ts + 2 greps 2,440 (sync never writes source) · converge-2's verification re-reads 3,368 | 10,285 / 75,429 = **0.136** strict; 13,653 = **0.181** with converge-2 | Artifacts. 7,845 of 31,390 artifact chars (25%) carried nothing. Converge-2's 3,368 is reported separately: it is the only evidence implement's pass landed. |
| **P5** | constitution.md 5,176 · tasks.md 1,090 (useful only in combination with spec.md) | none — analyze reads no source | none (no chain) | 6,266 / 23,015 = **0.272** loose; constitution alone = **0.225** | The constitution, again: 22.5% of a bare analyze buys nothing. |
| **P6** | constitution.md 5,176 | none — both source reads produced findings | none (no chain); but converge re-derived and re-queued two gaps P1 had already filed | 5,176 / 32,439 = **0.160** | The constitution. Every other read earned its place — converge is the leanest command measured. |

Three patterns hold across all six runs:

1. `.specify/memory/constitution.md` (5,176) is loaded by analyze, converge and implement on
   every invocation and produced **zero** findings in **all eleven** loads across P1–P6.
2. `sync-specs` pays for source twice — once in Step 4, once when the chained converge assesses
   the code — and can act on neither, because it may not write source.
3. Prose-only artifacts (`research.md`, `glossary.md`, `test-strategy.md`, `contracts/events.md`)
   were read in full in every run and produced findings in none.

---

## 4. Scaling projection

### P1 → P2 (`sync-specs`): 6 → 11 artifacts, 5 → 11 referenced files

| Quantity | P1 | P2 | Δ | Marginal |
|---|---|---|---|---|
| Artifacts | 6 | 11 | +5 | — |
| Artifact chars read (sync Step 3) | 5,395 | 31,360 | +25,965 | **5,193 chars per added artifact** |
| Source files | 5 (incl. `docs/02`) | 11 | +6 | — |
| Source chars read (sync Step 4) | 52,211 | 59,879 | +7,668 | **1,278 per added file** — meaningless, see below |
| Source chars charged incl. chain re-read | 53,374 | 86,155 | +32,781 | 1.02× → **1.44×** per source byte |
| Chain input excl. prompts | 22,003 | 45,784 | +23,781 | 94% of it is converge's source re-read |
| Prompt chars | 41,995 | 41,995 | 0 | **flat** |
| Total input | 122,381 | 179,644 | +57,263 | ×1.47 |

**Growth is linear in BYTES, not in file count, and the slope is 1.0 for artifacts and ~1.4 for
source.** Every artifact and every referenced source file is read exactly once in full by the
sync steps, so that part of the cost *is* the sum of their sizes. The per-file marginal figures
above are artefacts of file-size distribution, not of the algorithm: the 996 fixture's mean
source file is 10,437 chars and the 993 fixture's is 5,443, which is why adding six files added
only 7,668 chars. A projection should be run on bytes:

```
sync-specs input ≈ 42,000 (prompts, flat)
                 + 1.0 × artifact_bytes
                 + 1.4 × source_bytes          (chain re-reads source; 1.4 is with truncation)
                 + ~12,000 (constitution, hooks, scripts, re-reads of spec/plan/tasks)
```
Checked against P1: 42,000 + 5,395 + 73,096 + 12,000 = 132,491 vs 122,381 actual (+8%, because
P1's converge sampled source by grep instead of re-reading it). Against P2: 42,000 + 31,360 +
83,831 + 12,000 = 169,191 vs 179,644 actual (−6%). Good to ±10% on two points.

### P3 → P4 (`sync-code`): 6 → 11 artifacts, source read by the sync steps = 0 in both

| Quantity | P3 | P4 (warm) | Δ | Marginal |
|---|---|---|---|---|
| Artifact chars read (Steps 2–3) | 5,407 | 31,390 | +25,983 | **5,197 chars per added artifact** |
| Sync-step input (Steps 1–8) | 21,501 | 47,314 | +25,813 | = Δ artifact chars − 170 script chars |
| Source chars read by the sync steps | 0 | 0 | 0 | **0 per source file** |
| Chain input excl. prompts | 88,605 | 14,916 | **−73,689** | driven by what implement edits, not by fixture size |
| Total input | 161,614 | 75,429 (100,653 cold) | −86,185 | the **larger** fixture cost **less** |

`sync-code`'s own steps are exactly linear: `input ≈ 15,328 + artifact_bytes + ~600`. The Δ of
25,813 matches the Δ of 25,983 artifact chars minus 170 chars of script output, to the character.

**The scale run cost half of the small run**, and the reason is not scale at all:

- P3's implement read `build.test.ts` (22,387) and `docs/02` (17,659) **in full** because its
  tasks named them as edit targets; P4's implement resolved a mechanical rename with two greps
  (1,656 chars) and never opened a file.
- P3 charged the converge prompt twice (26,170); P4's chain prompts were deduplicated (0).
  Cold, P4 is 100,653 — still below P3's 161,614.

So for `sync-code`, cost scales with **the size of the files implement must edit**, not with the
number of artifacts or referenced files.

### What would break these projections

- **Two data points per shape, with different drift counts** (P1 one drift, P2 three; P3 one
  spec change, P4 one rename). Findings drive *output* and the chain's depth; neither variable
  was held fixed, so the fits above cannot separate "more files" from "more drift".
- **P2's converge re-read was truncated.** Uncapped, P2 input is ~213,247 and the source
  multiplier is 2.0×, not 1.4×. The 1.4 is a property of the harness, not of the prompt.
- **P4's prompt dedupe.** Any figure taken from a fresh conversation is +25,224 on a full chain.
- **Ranged reads.** Both fixtures were read whole. A file large enough to force ranged reads
  changes the slope in either direction and was not exercised.
- **Implement's edit targets.** P3 vs P4 differ by 73,689 chars of chain input on this variable
  alone. No projection over artifact count survives it.

---

## 5. Top-3 reduction opportunities

Savings are computed from the tables above, as a share of the **whole run** they apply to. A
`—` means the run shape cannot benefit; `n/m` means the saving exists but was not measured.

### 1. Git pre-filter on `sync-specs` source reads — up to −35.7% (P1), −32.8% (P2)

**Skip** any referenced source file unchanged since the artifacts' last commit (or since the
last `[Drift: …]` note), in Step 4 **and** in the chained converge's code assessment.

| Run | Source skipped | Chain re-read skipped | Saving | % of run |
|---|---|---|---|---|
| P1 | trait.ts 5,308 · trait.test.ts 3,523 · build.test.ts 22,387 · docs/02 17,659 = 48,877 | 0 (converge sampled by grep) | **48,877** | **−35.7%** of 137,023 |
| P2 | 8 of 11 files = 44,511 | trait/support/reaction/status/job re-read in full = 23,077 | **67,588** | **−32.8%** of 206,326 |
| P3, P4 | — | — | 0 | `sync-code` reads no source |

**False negative accepted:** a drift that entered **before** the artifacts' last commit. That is
exactly the class 2.0.0's full-state comparison was built to catch — `sync-specs` is full-state
by design and `sync-rebase` is the diff-based command. The filter reintroduces the
diff-dependence 2.0.0 removed, and it is a real loss, not a technicality: the 993 fixture's three
mismatches were *committed*, so a pre-filter anchored on "changed since the artifacts' commit"
finds them only if the code commit is newer than the artifact commit. Anchor wrong and the run
goes green on a stale spec. Mitigation: full-state on the first run per feature and on demand,
pre-filtered on the rest.

### 2. Reuse chain prompts instead of re-charging them — −29.4% (P3), −18.4% (P1), −12.2% (P2)

Analyze, converge and implement reload their full `SKILL.md` on every invocation: 38,423 chars
for one pass of all three, and P3 charged converge **twice** for 51,508 total.

| Run | Chain prompt chars | % of run | Note |
|---|---|---|---|
| P3 | 51,508 | **−29.4%** of 175,472 | converge charged twice (13,085 ×2) |
| P1 | 25,224 | **−18.4%** of 137,023 | analyze + converge |
| P2 | 25,224 | **−12.2%** of 206,326 | analyze + converge |
| P4 | 0 | already realised | harness returned "already loaded"; cold this is 25,224, **−21.6%** of the 116,748 cold run |

**False negative: none behavioural.** P4 is the proof — it ran the full chain with 0 chars of
analyze and converge prompt and produced 6 findings, a clean `tsc`, 613 passing tests and a
`converged` verdict. The only risk is instruction drift if a prompt is *summarised* rather than
referenced verbatim. This is the cheapest of the three: the saving is measured, the coverage
loss is zero, and P4 shows the mechanism already exists inside one conversation.

### 3. Drop the chain's redundant fixed re-reads — −13.6% (P3), −4.5% (P1), −0.6% (P2)

`constitution.md` (5,176), `.specify/extensions.yml` (967) and, in `sync-code`, `spec.md` — all
re-read once per chain stage. The constitution produced **zero findings in eleven loads** across
P1–P6.

| Run | Redundant chars | % of run |
|---|---|---|
| P3 | constitution 3 extra loads 15,528 + extensions.yml 3 extra 2,901 + spec.md 3 extra 5,409 = **23,838** | **−13.6%** of 175,472 |
| P1 | constitution 1 extra 5,176 + extensions.yml 1 extra 967 = **6,143** | **−4.5%** of 137,023 |
| P2 | analyze's re-read of unedited tasks.md 1,179 | **−0.6%** of 206,326 |
| P4 | 0 measured warm; cold adds spec.md 6,949 + tasks.md 1,417 | n/m cold |

**False negative:** a constitution or hook file edited *by* the sync step mid-chain would be read
stale. Neither is in any command's write scope, so on this evidence the risk is nil — but it is
an invariant nobody currently asserts.

### Runner-up, not in the top three: staged source reading — −29.2% (P1), **−0%** (P2)

Read exports and signatures first, the full file only when an artifact claim names a construct in
it. On the 996 fixture that skips `build.test.ts` (22,387) and `docs/02` (17,659) — 40,046 chars,
29.2% of P1, zero findings from either.

It collapses at scale. The 993 `spec.md` carries **one FR per source file** (FR-001…FR-011), so
the trigger "an artifact claim names a construct in it" fires for all eleven and the staged read
degrades to a full read: **0% saving on P2**. And two of P2's three planted drifts sit inside
function bodies (`SeededRng.nextInt`'s `bound <= 0` guard, `LoadoutSchema.traits.max`), invisible
to a signature pass, so a laxer trigger buys the saving by losing findings. Where staged reading
does pay (P1), the git pre-filter already skips the same two files. **Subsumed by #1; do not
build it separately.** The cost of the signature pass itself is **n/m** — no run measured one.

---

## Recommendation

**Build the git pre-filter for `sync-specs` and reuse chain prompts within a run; do not build
staged reading.** Those two are worth **−35.7% on P1 and −32.8% on P2** (pre-filter) and
**−29.4% on P3, −18.4% on P1, −12.2% on P2** (prompt reuse), and they do not overlap: the
pre-filter cuts source bytes, prompt reuse cuts fixed overhead, and between them they reach every
run shape measured — `sync-specs`, whose largest cost is source read twice for nothing (44,511
wasted of 59,879 in P2), and `sync-code`, whose largest cost is a chain in which prompts outweigh
the codebase (implement's own prompt is 13,199 of its 16,407 input in P4). Staged reading loses
on its own evidence: it saves 29.2% of P1 only on files the pre-filter already skips, and 0% of
P2, because the scale fixture names a construct in every source file. The false negative accepted
is **a drift committed before the artifacts' last commit** — full-state detection is the thing
2.0.0 added, so the pre-filter must ship with a full-state first run per feature and a documented
override, and the `⚠ WEAKENED` and count-claim rules must stay on the unfiltered path.

**What would change this answer:** if features are used where artifacts are committed rarely or
never (so "unchanged since the artifacts' last commit" excludes nothing), the pre-filter saves
close to zero and prompt reuse becomes the first item — and the whole ranking inverts for any
team that runs `sync-code` far more than `sync-specs`, since the pre-filter is worth exactly 0%
there.

---

# Appendix A — Run P1 raw ledger (`sync-specs`, 996, one planted drift)

Clone `sync-drop3`, branch `profile-small` @ `43a4f7f`. Drift:
`applyMovementEffect(move, effect)` → `applyMovementEffect(move, effect, floor = 0)`, clamp
becomes `Math.max(floor, …)`. Contradicts spec FR-003 + Contract block, plan TD-002,
`contracts/api.md` (signature, "no third parameter", "lower bound is the literal 0"),
`data-model.md` (fold code block, "the clamp is not configurable").

## P1 — Input ledger

| Step | File | Lines | Chars | Read how | Why |
|---|---|---|---|---|---|
| 0 | .claude/skills/speckit-sync-specs/SKILL.md | 295 | 16,771 | full | command prompt loaded |
| 1 | check-prerequisites.sh (output) | 1 | 251 | output | feature resolution |
| 1 | `git rev-parse` (output) | 1 | 5 | output | git gate |
| 2 | `find specs/996-movement-slot -name '*.md'` (output) | 6 | 191 | output | artifact discovery |
| 3 | specs/996-movement-slot/spec.md | 41 | 1,791 | full | artifact read |
| 3 | specs/996-movement-slot/plan.md | 25 | 872 | full | artifact read |
| 3 | specs/996-movement-slot/tasks.md | 9 | 469 | full | artifact read |
| 3 | specs/996-movement-slot/contracts/api.md | 25 | 1,029 | full | artifact read |
| 3 | specs/996-movement-slot/data-model.md | 19 | 514 | full | artifact read |
| 3 | specs/996-movement-slot/research.md | 13 | 720 | full | artifact read |
| 4 | src/sim/movement.ts | 65 | 3,334 | full | referenced source (drifted) |
| 4 | src/sim/trait.ts | 145 | 5,308 | full | referenced source (TD-003, contracts Upstream) |
| 4 | src/sim/trait.test.ts | 89 | 3,523 | full | referenced source (contracts Upstream) |
| 4 | src/sim/build.test.ts | 468 | 22,387 | 2 ranges | referenced source (plan Testing, T004) |
| 4 | docs/02-job-and-customization-system.md | 150 | 17,659 | full | path referenced by tasks.md T005 |
| 9 | `git diff --stat` (output) | 6 | 330 | output | verify own writes |
| 10 | .claude/skills/speckit-analyze/SKILL.md | 262 | 12,139 | full | chained command prompt |
| 10 | .specify/extensions.yml | 29 | 967 | full | hook check (analyze pre + post) |
| 10 | check-prerequisites.sh (output) | 1 | 251 | output | analyze re-resolves feature |
| 10 | .specify/memory/constitution.md | 96 | 5,176 | full | analyze principle validation |
| 10 | specs/996-movement-slot/spec.md (post-edit) | 47 | 2,237 | full | analyze re-read |
| 10 | specs/996-movement-slot/plan.md (post-edit) | 31 | 1,155 | full | analyze re-read |
| 10 | specs/996-movement-slot/tasks.md (post-edit) | 13 | 634 | full | analyze re-read |
| 11 | .claude/skills/speckit-converge/SKILL.md | 279 | 13,085 | full | chained command prompt |
| 11 | .specify/extensions.yml | 29 | 967 | full | hook check (converge pre + post) |
| 11 | check-prerequisites.sh (output) | 1 | 251 | output | converge re-resolves feature |
| 11 | specs/996-movement-slot/spec.md (post-edit) | 47 | 2,237 | full | converge re-read |
| 11 | specs/996-movement-slot/plan.md (post-edit) | 31 | 1,155 | full | converge re-read |
| 11 | specs/996-movement-slot/tasks.md (post-edit) | 13 | 634 | full | converge re-read |
| 11 | .specify/memory/constitution.md | 96 | 5,176 | full | converge principle check |
| 11 | `grep -rn applyMovementEffect src/` (output) | 6 | 693 | output | converge code-scope map |
| 11 | `grep -n floor src/sim/build.test.ts` (output) | 9 | 470 | output | converge: is `floor` tested? |
| | **TOTAL INPUT** | | **122,381** | | |

## P1 — Output ledger

| Section | Chars | What |
|---|---|---|
| Reference table | 1,740 | Step 3 |
| Findings table | 1,666 | Step 6 |
| Proposed diffs | 3,977 | Step 7 |
| Approval gate (2 ⚠ WEAKENED + question) | 547 | Step 8 |
| Applied report | 816 | Step 9 |
| Analyze output | 2,950 | Step 10 |
| Converge output | 2,561 | Step 11 |
| Final status | 385 | Step 12 |
| **TOTAL OUTPUT** | **14,642** | |

## P1 — Totals

| Metric | Value |
|---|---|
| Total input chars | 122,381 |
| Total output chars | 14,642 |
| Est. tokens `(in+out)/4` | 34,256 |
| Waste chars (files with zero findings) | 55,242 |
| **Waste ratio** | **0.451** |

Waste = docs/02 (17,659) + build.test.ts (22,387) + trait.ts (5,308) + trait.test.ts (3,523)
+ research.md (720) + tasks.md sync-step read (469) + one constitution read (5,176) =
**55,242** of 122,381 = **0.451**. (The second constitution read is counted under re-reads,
not double-counted here.)

**Files read with zero findings:** research.md, tasks.md (sync step — every task is `[X]` or
unrelated), docs/02-job-and-customization-system.md, .specify/memory/constitution.md (both reads).
**Source files read with no mismatch:** src/sim/trait.ts, src/sim/trait.test.ts,
src/sim/build.test.ts (3 of 4 referenced source files, 31,218 chars — 26% of total input).
**Post-write-chain re-reads of files the sync step did not edit:** none of the artifacts (sync
edited all three core files); constitution.md read twice (analyze + converge) with no finding
either time; extensions.yml read twice; check-prerequisites.sh run three times.

## P1 — Re-read amplification

(See §2 above — table reproduced there verbatim.)

## P1 — What happened

5 HIGH findings (4 artifacts stale on the new `floor` parameter), 5 files written (spec.md,
plan.md, contracts/api.md, data-model.md, tasks.md + T006).
Analyze: 5 findings, 0 CRITICAL — F1 is this run's own residue (plan Summary and TD-001 still
say "clamped at zero" beside the amended TD-002; the sync step's claim scan missed them).
Converge: `tasks_appended`, 3 tasks (T007–T009), and it disputed the run by classifying the
`floor` parameter `unrequested` — no production caller passes it.

---

# Appendix B — Run P2 raw ledger (`sync-specs`, 993, three planted drifts)

Clone `sync-scale` @ `4f5ca71`. Drifts planted (all uncommitted, on-disk):
1. `src/sim/element.ts` — `"void"` appended to `ElementSchema` (9 → 10 values)
2. `src/sim/loadout.ts` — `LoadoutSchema.traits` `.max(2)` → `.max(3)` (the `setLoadoutTraits`
   guard left at 2, so `contracts/errors.md` stays true)
3. `src/sim/rng.ts` — `SeededRng.nextInt` guard `bound <= 0` → `bound < 0`

## P2 — Input ledger

| Step | File | Lines | Chars | Read how | Why |
|---|---|---|---|---|---|
| 0 | .claude/skills/speckit-sync-specs/SKILL.md | 295 | 16771 | full | the command prompt itself |
| 1 | (output) `check-prerequisites.sh --json --require-tasks --include-tasks` | 1 | 224 | full | Step 1 gate |
| 1 | (output) `git rev-parse --is-inside-work-tree` | 1 | 5 | full | Step 1 gate |
| 2 | (output) `find specs/993-sim-surface -name '*.md'` | 11 | 397 | full | Step 2 artifact discovery |
| 3 | specs/993-sim-surface/spec.md | 122 | 6919 | full | artifact discovery |
| 3 | specs/993-sim-surface/plan.md | 90 | 4019 | full | artifact discovery |
| 3 | specs/993-sim-surface/tasks.md | 17 | 1179 | full | artifact discovery |
| 3 | specs/993-sim-surface/data-model.md | 102 | 3543 | full | artifact discovery |
| 3 | specs/993-sim-surface/research.md | 46 | 2440 | full | artifact discovery |
| 3 | specs/993-sim-surface/glossary.md | 33 | 1782 | full | artifact discovery |
| 3 | specs/993-sim-surface/migration-plan.md | 39 | 2068 | full | artifact discovery |
| 3 | specs/993-sim-surface/test-strategy.md | 35 | 1943 | full | artifact discovery |
| 3 | specs/993-sim-surface/contracts/api.md | 146 | 4005 | full | artifact discovery |
| 3 | specs/993-sim-surface/contracts/events.md | 36 | 1620 | full | artifact discovery |
| 3 | specs/993-sim-surface/contracts/errors.md | 31 | 1842 | full | artifact discovery |
| 4 | src/sim/element.ts | 22 | 1151 | full | referenced source file |
| 4 | src/sim/status.ts | 52 | 2450 | full | referenced source file |
| 4 | src/sim/job.ts | 69 | 2611 | full | referenced source file |
| 4 | src/sim/equipment.ts | 83 | 3753 | full | referenced source file |
| 4 | src/sim/rng.ts | 119 | 4591 | full | referenced source file |
| 4 | src/sim/trait.ts | 145 | 5308 | full | referenced source file |
| 4 | src/sim/support.ts | 139 | 6870 | full | referenced source file |
| 4 | src/sim/reaction.ts | 98 | 5838 | full | referenced source file |
| 4 | src/sim/ability.ts | 168 | 8540 | full | referenced source file |
| 4 | src/sim/condition.ts | 178 | 9141 | full | referenced source file |
| 4 | src/sim/loadout.ts | 225 | 9626 | full | referenced source file |
| 10 | .claude/skills/speckit-analyze/SKILL.md | 262 | 12139 | full | analyze prompt |
| 10 | (output) `check-prerequisites.sh --require-spec …` | 1 | 224 | full | analyze Step 1 |
| 10 | .specify/extensions.yml | 28 | 967 | full | analyze pre-execution hook check |
| 10 | .specify/memory/constitution.md | 96 | 5176 | full | analyze constitution load |
| 10 | specs/993-sim-surface/spec.md (post-edit) | 137 | 7525 | full | analyze re-read |
| 10 | specs/993-sim-surface/plan.md (post-edit) | 100 | 4437 | full | analyze re-read |
| 10 | specs/993-sim-surface/tasks.md | 17 | 1179 | full | analyze re-read |
| 11 | .claude/skills/speckit-converge/SKILL.md | 279 | 13085 | full | converge prompt |
| 11 | src/sim/element.ts | 22 | 1151 | full | converge code assessment (re-read) |
| 11 | src/sim/trait.ts | 145 | 5308 | full | converge code assessment (re-read) |
| 11 | src/sim/support.ts | 139 | 6870 | full | converge code assessment (re-read) |
| 11 | src/sim/reaction.ts | 98 | 5838 | full | converge code assessment (re-read) |
| 11 | src/sim/status.ts | 52 | 2450 | full | converge code assessment (re-read) |
| 11 | src/sim/job.ts | 69 | 2611 | full | converge code assessment (re-read) |
| 11 | src/sim/{equipment,rng,ability,condition,loadout}.ts | 623 | 2048 of 35651 | **truncated** — harness persisted the 34.9 KB output to a file and returned only a ~2 KB preview inline | converge code assessment (re-read) |
| | **TOTAL INPUT (rows)** | | **179,644** | | ledger stated 179,639; see "Ledger corrections" |

**Measurement caveats for P2 (stated rather than estimated):**
- The Step-11 batch-2 source re-read was cut off by the harness output cap. Only ~2,048 chars
  reached the model; the converge assessment for those five files therefore rested on the Step-4
  read in the same turn. Counted at 2,048, not 35,651.
- Converge did **not** re-issue `check-prerequisites.sh` nor re-read spec.md / plan.md /
  tasks.md: they had been read in the analyze step of the same turn. A converge run started cold
  would add 224 + 7,525 + 4,437 + 1,179 = 13,365 chars. Not counted.
- Char totals count each read once. They are **not** API token counts: a real run re-sends the
  whole accumulated conversation on every turn, which is why the Phase-6 6A run was recorded at
  ~174k tokens against the ~52k estimated here.

## P2 — Output ledger

| Section | Chars | What |
|---|---|---|
| Reference table | 6204 | Step 3 output |
| Findings table | 3582 | Step 6 output |
| Proposed diffs | 9948 | Step 7 output (6 unified diffs + slug list) |
| Approval gate + ⚠ WEAKENED lines | 643 | Step 8 output |
| Applied report | 1260 | Step 9 output |
| Analyze output | 2660 | Step 10 (full analyze run) |
| Converge output | 1739 | Step 11 (full converge run) |
| Converge's `tasks.md` append (T012) | 230 | Step 11 write |
| Final status | 416 | Step 12 output |
| **Total** | **26682** | |

## P2 — Totals

| Metric | Value |
|---|---|
| Total input chars | 179,644 (ledger stated 179,639) |
| Total output chars | 26,682 |
| Est. tokens `(in+out)/4` | 51,582 |
| Waste chars | 80,930 |
| **Waste ratio** | **45.05%** |

## P2 — Waste list

**Artifacts read in full with zero findings (8,964 chars):**
tasks.md 1179 · research.md 2440 · glossary.md 1782 · test-strategy.md 1943 ·
contracts/events.md 1620

**Source files read with no mismatch (8 of 11 — 44,511 chars):**
trait.ts 5308 · support.ts 6870 · reaction.ts 5838 · status.ts 2450 · job.ts 2611 ·
equipment.ts 3753 · ability.ts 8540 · condition.ts 9141

**Post-write chain re-reads of files the sync step did not edit (27,455 chars):**
analyze re-read tasks.md 1179 (unedited) · converge re-read all eleven source files (24,228
delivered for six + 2,048 delivered for the truncated five) — sync-specs never writes source, so
**every** chain source re-read is a re-read of an unedited file.

Waste = 8,964 + 44,511 + 27,455 = 80,930 / 179,644 = **45.05%**

## P2 — Re-read amplification

(See §2 above — reproduced there, condensed by file group.)

## P2 — What happened

1. 14 findings: 13 HIGH `behaviour` + 1 LOW `untracked` (`"void"`); all three planted root causes
   found, each reaching the right artifacts (element → 5 artifacts, loadout cap → 5, rng guard →
   3); zero findings on research.md, glossary.md, test-strategy.md, events.md.
2. Files written: 6 (spec.md, plan.md, data-model.md, migration-plan.md, contracts/api.md,
   contracts/errors.md), 13 edits, three `[Drift: …]` slugs, plus converge's tasks.md append.
3. Chain: three `⚠ WEAKENED` lines above the gate (FR-001, FR-008, FR-011); analyze 4 findings /
   0 CRITICAL (2 residue); converge `tasks_appended` — one MEDIUM `contradicts` on the real
   three-way cap disagreement (schema 3 / setter 2 / trait.ts docstring 2).

---

# Appendix C — Run P3 raw ledger (`sync-code`, 996, one spec construct changed)

Reset to baseline first (`git checkout -f -- . && git clean -fdq specs src`; feature.json intact).
Drift planted in `spec.md` only: FR-003 `>= 0` → `>= 1`, and US1/AC3's stated result `0` → `1`.
Full chain ran: sync → analyze → converge → implement → converge.

## P3 — Input ledger

| Step | File | Lines | Chars | Read how | Why |
|---|---|---|---|---|---|
| 0 | .claude/skills/speckit-sync-code/SKILL.md | 272 | 15,328 | full | command prompt loaded |
| 1 | check-prerequisites.sh (output) | 1 | 251 | output | feature resolution |
| 1 | `git rev-parse` (output) | 1 | 5 | output | git gate |
| 2 | specs/996-movement-slot/spec.md | 41 | 1,803 | full | the source of truth |
| 3 | `find … ! -name spec.md` (output) | 5 | 180 | output | target-artifact discovery |
| 3 | specs/996-movement-slot/plan.md | 25 | 872 | full | target artifact |
| 3 | specs/996-movement-slot/tasks.md | 9 | 469 | full | target artifact |
| 3 | specs/996-movement-slot/contracts/api.md | 25 | 1,029 | full | target artifact |
| 3 | specs/996-movement-slot/data-model.md | 19 | 514 | full | target artifact |
| 3 | specs/996-movement-slot/research.md | 13 | 720 | full | target artifact |
| 8 | `git diff --stat` (output) | 6 | 330 | output | verify own writes |
| | **sync subtotal** | | **21,501** | | |
| 9 | .claude/skills/speckit-analyze/SKILL.md | 262 | 12,139 | full | chained prompt |
| 9 | .specify/extensions.yml | 29 | 967 | full | hook check |
| 9 | check-prerequisites.sh (output) | 1 | 251 | output | analyze re-resolves |
| 9 | .specify/memory/constitution.md | 96 | 5,176 | full | principle validation |
| 9 | spec.md | 41 | 1,803 | full | analyze re-read |
| 9 | plan.md (post-edit) | 31 | 1,090 | full | analyze re-read |
| 9 | tasks.md (post-edit) | 14 | 708 | full | analyze re-read |
| | **analyze subtotal** | | **22,134** | | |
| 10 | .claude/skills/speckit-converge/SKILL.md | 279 | 13,085 | full | chained prompt |
| 10 | .specify/extensions.yml | 29 | 967 | full | hook check |
| 10 | check-prerequisites.sh (output) | 1 | 251 | output | converge re-resolves |
| 10 | spec.md | 41 | 1,803 | full | converge re-read |
| 10 | plan.md | 31 | 1,090 | full | converge re-read |
| 10 | tasks.md | 14 | 708 | full | converge re-read |
| 10 | .specify/memory/constitution.md | 96 | 5,176 | full | converge re-read |
| 10 | src/sim/movement.ts (fold region) | 7 | 241 | range | assess the clamp |
| 10 | src/sim/build.ts (caller region) | 5 | 249 | range | assess the caller |
| 10 | grep clamp assertions in build.test.ts (output) | 3 | 202 | output | assess test coverage |
| | **converge subtotal** | | **23,772** | | |
| 11 | .claude/skills/speckit-implement/SKILL.md | 229 | 13,199 | full | chained prompt |
| 11 | .specify/extensions.yml | 29 | 967 | full | hook check (before + after) |
| 11 | check-prerequisites.sh (output) | 1 | 251 | output | implement re-resolves |
| 11 | tasks.md (post-converge) | 21 | 1,159 | full | the task list |
| 11 | plan.md | 31 | 1,090 | full | tech stack / structure |
| 11 | contracts/api.md (post-edit) | 31 | 1,250 | full | "IF EXISTS" context |
| 11 | data-model.md (post-edit) | 25 | 759 | full | "IF EXISTS" context |
| 11 | research.md | 13 | 720 | full | "IF EXISTS" context |
| 11 | .specify/memory/constitution.md | 96 | 5,176 | full | governance constraints |
| 11 | ignore-file detection (output) | 3 | 41 | output | Step 4 project setup |
| 11 | src/sim/build.test.ts | 468 | 22,387 | ranges | edit target (T007/T009/T010) |
| 11 | src/sim/build.test.ts (clamp region re-read) | 11 | 539 | range | verify the assertion converge named |
| 11 | docs/02-job-and-customization-system.md | 150 | 17,659 | full | edit target (T005/T011) |
| 11 | src/sim/movement.ts | 61 | 3,334 | full | edit target (T006/T008) |
| 11 | vitest failure log (tail) | 21 | 1,354 | output | suite could not start |
| | **implement subtotal** | | **69,885** | | |
| 12 | .claude/skills/speckit-converge/SKILL.md | 279 | 13,085 | full | chained prompt (2nd time) |
| 12 | .specify/extensions.yml | 29 | 967 | full | hook check |
| 12 | check-prerequisites.sh (output) | 1 | 251 | output | converge re-resolves |
| 12 | spec.md | 41 | 1,803 | full | converge re-read |
| 12 | plan.md | 31 | 1,090 | full | converge re-read |
| 12 | tasks.md (post-implement) | 21 | 1,159 | full | converge re-read |
| 12 | .specify/memory/constitution.md | 96 | 5,176 | full | converge re-read |
| 12 | post-implement code checks (wc + sed + 2 greps, output) | 12 | 791 | output | assess the new state |
| | **converge-2 subtotal** | | **24,322** | | |
| | **TOTAL INPUT** | | **161,614** | | |

## P3 — Output ledger

| Section | Chars | What |
|---|---|---|
| Findings table | 1,395 | Step 5 |
| Proposed diffs | 2,339 | Step 6 (+ Step 7 gate question, in the same block) |
| Applied report | 790 | Step 8 |
| Analyze output | 2,611 | Step 9 |
| Converge output | 1,946 | Step 10 |
| Implement output | 2,985 | Step 11 |
| Converge-2 output | 1,302 | Step 12 |
| Final status | 490 | Step 13 |
| **TOTAL OUTPUT** | **13,858** | |

## P3 — Totals

| Metric | Value |
|---|---|
| Total input chars | 161,614 |
| Total output chars | 13,858 |
| Est. tokens `(in+out)/4` | 43,868 |
| Waste chars | 24,153 |
| **Waste ratio** | **0.149** |

### P3 — Chain split

| Segment | Input chars | Share of run |
|---|---|---|
| sync steps 0–8 | 21,501 | 13.3% |
| analyze (step 9) | 22,134 | 13.7% |
| converge (step 10) | 23,772 | 14.7% |
| **implement (step 11)** | **69,885** | **43.2%** |
| **converge-2 (step 12)** | **24,322** | **15.1%** |
| **implement + converge-2 together** | **94,207** | **58.3%** |

**Files read with zero findings / zero edits:** research.md (720, read twice = 1,440),
.specify/memory/constitution.md (5,176, read four times = 20,704 — no principle issue in any
pass), contracts/api.md + data-model.md when re-read by implement (2,009 — implement did not edit
them). Total 24,153.
**Source files read with no mismatch:** none in the sync step (sync-code reads no source at all;
it resolves task paths only). In the chain, `src/sim/build.ts` (249-char slice) matched.
**Post-write-chain re-reads of files the sync step did not edit:** spec.md read 4 more times after
the sync step (analyze, converge, converge-2 — 5,409 chars) though sync-code may never write it;
constitution 4×; extensions.yml 4×; check-prerequisites.sh run 5×.

## P3 — Re-read amplification

(See §2 above — table reproduced there verbatim.)

## P3 — What happened

4 findings (1 CRITICAL, 1 HIGH, 2 MEDIUM) + 1 wording; 4 files written by the sync step (plan.md,
contracts/api.md, data-model.md, tasks.md +T006/T007) — spec.md untouched, as the contract
requires. Converge added 4 tasks (2 of them restating T006/T007), implement executed all 7 open
tasks and edited 3 files (movement.ts clamp → `Math.max(1, …)`, build.test.ts +2 tests, docs/02
+5 lines), the second converge appended 2 more and returned `⚠ Not converged after one implement
pass`.
One substantive catch: converge's F2 pointed implement at `build.test.ts:326`, an assertion that
does **not** run through `applyMovementEffect` (the unit there has no movement equipped, so the
`0` is `build.ts`'s schema clamp). Editing it as instructed would have been wrong; a direct test
of the fold at the floor was written instead.
**Not measurable honestly:** whether the new tests pass. The clone has no `node_modules`, so
vitest could not start (`ERR_MODULE_NOT_FOUND`), and no suite output exists for this run beyond
the 1,354-char failure log.

---

# Appendix D — Run P4 raw ledger (`sync-code`, 993, rename)

Reset: `git checkout -f -- src` (all three P2 drifts reverted, verified: `"void"` gone, `.max(2)`
back, `bound <= 0` back); `specs/993-sim-surface/` restored byte-for-byte from
`profile/snap-993-baseline/` (697 lines / 31,360 chars).
Spec change (the 6B change, uncommitted): FR-001 renames `ElementSchema` → `DamageElementSchema`
and `Element` → `DamageElement`. spec.md is now 122 lines / 6,949 chars (+30).

## P4 — Input ledger

| Step | File | Lines | Chars | Read how | Why |
|---|---|---|---|---|---|
| 0 | .claude/skills/speckit-sync-code/SKILL.md | 272 | 15328 | full | the command prompt itself |
| 1 | (output) `check-prerequisites.sh --json --require-tasks --include-tasks` | 1 | 224 | full | Step 1 gate |
| 1 | (output) `git rev-parse --is-inside-work-tree` | 1 | 5 | full | Step 1 gate |
| 2 | specs/993-sim-surface/spec.md | 122 | 6949 | full | Step 2 — spec as source of truth |
| 3 | (output) `find … ! -name spec.md` | 10 | 367 | full | Step 3 target-artifact discovery |
| 3 | plan.md | 90 | 4019 | full | target artifact |
| 3 | tasks.md | 17 | 1179 | full | target artifact |
| 3 | data-model.md | 102 | 3543 | full | target artifact |
| 3 | research.md | 46 | 2440 | full | target artifact |
| 3 | glossary.md | 33 | 1782 | full | target artifact |
| 3 | migration-plan.md | 39 | 2068 | full | target artifact |
| 3 | test-strategy.md | 35 | 1943 | full | target artifact |
| 3 | contracts/api.md | 146 | 4005 | full | target artifact |
| 3 | contracts/events.md | 36 | 1620 | full | target artifact |
| 3 | contracts/errors.md | 31 | 1842 | full | target artifact |
| 9 | .claude/skills/speckit-analyze/SKILL.md | 262 | **0** | not re-sent | already loaded earlier in this conversation (see caveat) |
| 9 | (output) `check-prerequisites.sh --require-spec …` | 1 | 224 | full | analyze Step 1 |
| 9 | plan.md (post-edit) | 96 | 4259 | full | analyze re-read |
| 9 | tasks.md (post-edit) | 21 | 1417 | full | analyze re-read |
| 10 | .claude/skills/speckit-converge/SKILL.md | 279 | **0** | not re-sent | already loaded earlier in this conversation |
| 10 | src/sim/element.ts | 22 | 1143 | full | converge code assessment |
| 10 | (output) grep `element.js\|ElementSchema` src/sim/state.ts | 5 | 297 | range/grep | converge code assessment |
| 10 | (output) grep `ElementSchema\|\bElement\b` across src/ | 15 | ~1000 | range/grep | converge code assessment |
| 11 | .claude/skills/speckit-implement/SKILL.md | 229 | 13199 | full | implement prompt (first load) |
| 11 | (output) `ls specs/993-sim-surface/checklists` | 1 | 62 | full | checklist gate |
| 11 | (output) two greps enumerating every rename site in src/ | 21 | 1656 | range/grep | implement — resolve the blast radius |
| 11 | (output) `bash scripts/quiet.sh npx tsc --noEmit` | 1 | ~110 | tail only | implement validation |
| 11 | (output) `bash scripts/quiet.sh npx vitest run src/sim` | 15 | ~980 | tail only (full log in coverage/quiet/) | implement validation |
| 11 | (output) `git status --short` + `git diff --stat` | 12 | ~400 | full | implement report |
| 12 | .claude/skills/speckit-converge/SKILL.md | 279 | **0** | not re-sent | second converge, same conversation |
| 12 | src/sim/element.ts (post-rename) | 22 | 1191 | full | converge 2 verification |
| 12 | (output) `sed -n '78,90p' state.ts` + grep of every `DamageElement*` site | 31 | 2177 | range/grep | converge 2 verification |
| | **TOTAL INPUT** | | **75,429** | | |

**Measurement caveats for P4 (stated rather than estimated):**
- **Prompt re-send is deduplicated inside one conversation.** The harness answered the analyze
  and both converge invocations with "already loaded above; instructions unchanged" and sent
  **0** chars. Only `sync-code` (15,328) and `implement` (13,199) were delivered. A cold session
  would add analyze 12,139 + converge 13,085 = **25,224** chars, taking P4's input from 75,429 to
  100,653. Both figures are given below.
- Analyze did not re-read `spec.md`, and implement did not re-read `tasks.md`: both had been read
  earlier in the same turn. A cold chain would add spec.md 6,949 + tasks.md 1,417.
- Test-suite output was read as a 15-line tail through `scripts/quiet.sh`; the full log (43 lines)
  stayed in `coverage/quiet/` and was never read into context. ~980 chars counted.
- The three grep outputs marked `~` are estimated from the rendered line counts, ±10%; every
  other figure is a `wc -c`.

## P4 — Output ledger

| Section | Chars | What |
|---|---|---|
| Findings table | 2134 | Step 5 output |
| Proposed diffs | 4446 | Step 6 output (6 unified diffs + slug) |
| Approval gate | 165 | Step 7 output (no ⚠ WEAKENED — that scan is sync-specs only) |
| Applied report | 1135 | Step 8 output |
| tasks.md T012 append | 250 | Step 8 write |
| Analyze output | 1952 | Step 9 |
| Converge output (1st) | 1474 | Step 10 |
| Implement output | 1831 | Step 11 (task list, git status/diff, validation) |
| Implement source edit (the rename script) | ~1250 | Step 11 write — 18 lines across 5 files |
| Converge output (2nd) | 971 | Step 12 |
| Final status | 487 | Step 13 |
| **Total** | **16095** | |

### P4 — The implement + second-converge chain, measured separately

Corrected: the ledger's "Steps 1–8" row read 41,886 in / 9,180 out / 12,767 tokens; re-adding its
own rows gives 47,314 / 8,130 / 13,861. Every other row checks out.

| | Input chars | Output chars | Est. tokens |
|---|---|---|---|
| Steps 1–8 (sync-code proper) | 47,314 | 8,130 | 13,861 |
| Step 9 analyze | 5,900 | 1,952 | 1,963 |
| Step 10 converge | 2,440 | 1,474 | 979 |
| **Step 11 implement** | **16,407** | **3,081** | **4,872** |
| **Step 12 converge 2** | **3,368** | **971** | **1,085** |
| Step 13 final status | 0 | 487 | 122 |
| **Total** | **75,429** | **16,095** | **22,881** |

The implement + second-converge chain is **19,775 input / 4,052 output = 5,957 est. tokens**,
**26.0%** of the run. Implement alone is 21.8% of input — and 13,199 of its 16,407 input chars
are its own command prompt, not the codebase.

## P4 — Totals

| Metric | Value |
|---|---|
| Total input chars (this conversation) | 75,429 |
| Total input chars (cold session, +25,224 prompt re-sends) | 100,653 |
| Total output chars | 16,095 |
| Est. tokens `(in+out)/4` — this conversation | 22,881 |
| Est. tokens — cold session | 29,187 |
| Waste chars (strict) | 10,285 |
| **Waste ratio (strict)** | **13.6%** |
| Waste chars (incl. converge-2 verification re-reads) | 13,653 |
| Waste ratio (inclusive) | 18.1% |

## P4 — Waste list

**Artifacts read in full with zero findings (7,845 chars):**
research.md 2440 · test-strategy.md 1943 · contracts/events.md 1620 · contracts/errors.md 1842

**Source files read with no mismatch: 0.** `sync-code` reads no source in Steps 1–8 — the spec,
not the code, is its evidence. This is the structural difference from `sync-specs`, whose Step 4
read 59,879 chars of source.

**Post-write chain re-reads of files the sync step did not edit (2,440 strict / 5,808 inclusive):**
converge-1 read `src/sim/element.ts` + two greps (2,440) — sync-code never writes source, so every
chain source read is of an unedited file. Converge-2's 3,368 chars re-read files `implement` had
just edited; by the letter of the profile's definition ("not edited by sync") that is waste, but
it is the only evidence the implement pass actually landed, so it is reported separately rather
than folded in.

Strict waste = 7,845 + 2,440 = 10,285 / 75,429 = **13.6%**

## P4 — Re-read amplification

(See §2 above — table reproduced there, with cold counts.)

## P4 — What happened

1. 6 findings from one root cause (`damage-element-rename`): 4 CRITICAL `changed`/`contract`
   (plan.md, contracts/api.md, data-model.md, migration-plan.md), 1 MEDIUM (glossary.md), 1 HIGH
   `added` (tasks.md, no open task covered the rename). Zero findings on research.md,
   test-strategy.md, contracts/events.md, contracts/errors.md.
2. Files written: 6 artifacts (5 amended + tasks.md appended T012), then implement rewrote 5
   source files / 18 lines (`element.ts`, `state.ts`, `ability.ts`, `equipment.ts`, `index.ts`);
   no test file referenced either name, so no test changed.
3. Chain: analyze 3 findings / 0 CRITICAL (2 residue that no command here may write — spec.md's
   Acceptance Scenario 1 and `[X]` T001 both still say `ElementSchema`); converge-1 found the
   expected code lag and appended nothing (T012 already covered it); implement `tsc` exit 0 and
   `vitest run src/sim` **613 passed / 1 skipped**; converge-2 **converged**, 0 leftover
   `ElementSchema` in `src/`.

---

# Appendix E — Run P5 raw ledger (`analyze` alone, baseline)

State: the P1 post-approval state, i.e. after P1's edits **and** after P1's chained converge
appended Phase 2 (tasks.md is 19 lines here, not 13). No sync step.

## P5 — Input ledger

| Step | File | Lines | Chars | Read how | Why |
|---|---|---|---|---|---|
| 0 | .claude/skills/speckit-analyze/SKILL.md | 262 | 12,139 | full | command prompt loaded |
| pre | .specify/extensions.yml | 29 | 967 | full | before_analyze + after_analyze hook check |
| 1 | check-prerequisites.sh (output) | 1 | 251 | output | feature resolution |
| 2 | .specify/memory/constitution.md | 96 | 5,176 | full | principle validation |
| 2 | specs/996-movement-slot/spec.md | 47 | 2,237 | full | requirements, SC, user stories |
| 2 | specs/996-movement-slot/plan.md | 31 | 1,155 | full | decisions, constraints |
| 2 | specs/996-movement-slot/tasks.md | 19 | 1,090 | full | task IDs, phases, paths |
| | **TOTAL INPUT** | | **23,015** | | |

Analyze reads no source file and no secondary artifact (contracts/, data-model.md, research.md
are outside its Step 2 list) — that is the whole difference from a sync run.

## P5 — Output ledger

| Section | Chars | What |
|---|---|---|
| Analysis report (findings + coverage + metrics + next actions + hooks) | 2,643 | single output block |
| **TOTAL OUTPUT** | **2,643** | |

## P5 — Totals

| Metric | Value |
|---|---|
| Total input chars | 23,015 |
| Total output chars | 2,643 |
| Est. tokens `(in+out)/4` | 6,415 |
| Waste chars (files with zero findings) | 6,266 |
| **Waste ratio** | **0.272** |

**Files read with zero findings:** .specify/memory/constitution.md (5,176 — no alignment issue),
.specify/extensions.yml (967 — no analyze hooks registered; counted separately as control-plane,
not in the waste figure), tasks.md contributed only duplication findings. Waste figure =
constitution 5,176 + the 1,090 tasks.md read, which yielded findings only in combination with
spec.md; a stricter reading (constitution alone) gives 0.225.
**Source files read with no mismatch:** none — analyze reads no source.
**Post-write-chain re-reads:** none (no chain; analyze alone writes nothing).

## P5 — Re-read amplification

| File | Sync | Analyze | Converge | Implement | Converge 2 | Total reads |
|---|---|---|---|---|---|---|
| spec.md | – | 1 | – | – | – | 1 |
| plan.md | – | 1 | – | – | – | 1 |
| tasks.md | – | 1 | – | – | – | 1 |
| constitution.md | – | 1 | – | – | – | 1 |
| extensions.yml | – | 1 | – | – | – | 1 |

## P5 — What happened

6 findings (1 HIGH, 4 MEDIUM, 1 LOW), 0 CRITICAL; no files written (analyze is read-only). The
HIGH is the same I1/F1 P1's chain found: plan Summary + TD-001 still say "clamped at zero" next to
the amended TD-002. It also found a duplication P1's chain did not name — T006 and T007 ask for
the same `floor` test, and T009 restates T005.
Chain outcome: none — analyze runs alone and stops at the remediation offer.

---

# Appendix F — Run P6 raw ledger (`converge` alone, baseline)

Same state as P5 (P1 post-approval + P1's Phase 2). Converge appends only; it never edits spec.md
or plan.md.

## P6 — Input ledger

| Step | File | Lines | Chars | Read how | Why |
|---|---|---|---|---|---|
| 0 | .claude/skills/speckit-converge/SKILL.md | 279 | 13,085 | full | command prompt loaded |
| pre | .specify/extensions.yml | 29 | 967 | full | before_converge + after_converge hook check |
| 1 | check-prerequisites.sh (output) | 1 | 251 | output | feature resolution |
| 2 | specs/996-movement-slot/spec.md | 47 | 2,237 | full | FR / SC / acceptance scenarios |
| 2 | specs/996-movement-slot/plan.md | 31 | 1,155 | full | decisions + named touch-points |
| 2 | specs/996-movement-slot/tasks.md | 19 | 1,090 | full | IDs, next phase number |
| 2 | .specify/memory/constitution.md | 96 | 5,176 | full | MUST principles |
| 3 | `grep -no 'src/sim/…\|docs/02…'` over the 3 artifacts (output) | 13 | 672 | output | code-scope map |
| 4 | src/sim/movement.ts | 65 | 3,334 | full | the file every FR names |
| 4 | src/sim/build.test.ts (movement-slot block, L400–468) | 69 | 3,772 | range | does any test cover `floor`? |
| 4 | `grep -rn applyMovementEffect src/sim/*.test.ts` (output) | 0 | 290 | output | direct-call check (empty result) |
| 4 | `grep -n 'Movement\|floor' docs/02-…' (output) | 4 | 410 | output | T005 doc-coverage check |
| | **TOTAL INPUT** | | **32,439** | | |

Converge reads no secondary artifact (contracts/api.md, data-model.md, research.md are outside its
Step 2 list) but does read source, which analyze never does.

## P6 — Output ledger

| Section | Chars | What |
|---|---|---|
| Convergence findings + metrics + next actions + hook block | 2,263 | single output block |
| tasks.md append (Phase 3, 4 tasks) | 490 | the only write |
| **TOTAL OUTPUT** | **2,753** | |

## P6 — Totals

| Metric | Value |
|---|---|
| Total input chars | 32,439 |
| Total output chars | 2,753 |
| Est. tokens `(in+out)/4` | 8,798 |
| Waste chars (inputs that produced zero findings) | 5,176 |
| **Waste ratio** | **0.160** |

**Files read with zero findings:** .specify/memory/constitution.md (5,176 — no principle gap).
Every other read contributed to at least one finding.
**Source files read with no mismatch:** none — both source reads produced findings (G1 from the
absent `floor` test, G2 from the single two-argument caller).
**Post-write-chain re-reads:** none (converge alone). Note the overlap instead: converge appended
T010/T011/T012 that duplicate the still-open T006/T007/T008/T009 from P1 — converge has no dedupe
against an existing Remediation or Convergence phase.

## P6 — Re-read amplification

| File | Sync | Analyze | Converge | Implement | Converge 2 | Total reads |
|---|---|---|---|---|---|---|
| spec.md | – | – | 1 | – | – | 1 |
| plan.md | – | – | 1 | – | – | 1 |
| tasks.md | – | – | 1 | – | – | 1 |
| constitution.md | – | – | 1 | – | – | 1 |
| extensions.yml | – | – | 1 | – | – | 1 |
| src/sim/movement.ts | – | – | 1 | – | – | 1 |
| src/sim/build.test.ts | – | – | 1 (range) + 1 grep | – | – | 2 |
| docs/02-…-system.md | – | – | 1 grep | – | – | 1 |

## P6 — What happened

4 findings (1 HIGH, 1 MEDIUM, 2 LOW), 0 CRITICAL; one file written (tasks.md, Phase 3, T010–T013
appended). Converge re-derived the same two gaps its P1 run had already recorded as T007/T008 and
appended fresh IDs for them — the same work is now queued four times across T006/T007/T010 and
T008/T011.
Chain outcome: `tasks_appended`, plus the optional `after_converge` reconcile hook offered
(not run).
