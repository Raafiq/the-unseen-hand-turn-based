# Patched trigger-eval harness (skill-creator description optimization)

The stock `skill-creator` trigger harness measures NOTHING in this repo's
remote environment: every query scores 0/3, including obvious should-trigger
ones. Two environment facts cause it:

1. `.claude/commands/*.md` files (how the stock harness advertises a candidate
   description) are not surfaced to nested `claude -p` sessions here.
2. Account-synced skills load from the server regardless of `HOME`; the synced
   `retrospective` skill absorbs any trigger a candidate would get.

`run_eval.patched.py` is the fix used for the 2026-08-22 optimization run
(see `../desc-opt/`): each run writes the candidate as a PROJECT skill in a
throwaway per-run project root and invokes `claude -p --setting-sources
project`, which hides synced skills and isolates parallel workers. Drop it
over `scripts/run_eval.py` in a copy of skill-creator and run
`python -m scripts.run_loop` from that copy.

Sanity check before trusting any run: if all should-trigger queries read 0/3,
the harness is broken, not the description.

Also: in `benchmark.md`/`benchmark.json` from `scripts.aggregate_benchmark`,
the "Tokens" column falls back to output CHARACTERS whenever grading.json
already contains timing; real executor tokens are in each run's timing.json.
