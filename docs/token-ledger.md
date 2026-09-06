# Token ledger

One row per slice, written by the retrospective (`retrospective` skill, step 0) before the
PR opens. The pre-PR hook refuses a PR until this file has a row from the current session.
Numbers come from the harness's per-agent usage notices; the main session's own spend is an
estimate and says so. The point is the last two columns: name the waste, name the guard.

| Date | Slice | Total | Agents (tokens) | Biggest avoidable cost | Guard added |
| --- | --- | --- | --- | --- | --- |
| 2026-09-06 | Portrait wiring (ADR-0039) | ~830k (agents 738k, main ~90k est.) | viewer-engineer 246k, viewer-engineer 160k, reviewer 93k, art-director 89k, docs-steward 75k, docs-steward 75k | ~250k: a second engineer pass the first brief should have prevented (100k); docs briefed before the code constraint was checked, two passes (60k); art director over-delivered (40k); slot-id bug found by a browser run (30k) | `guard-brief.sh` (brief must name MUTATION, ASSERT, a report cap; one pass for art; one docs pass per session), effort floors per agent, spawn caps, `check:hooks` |
