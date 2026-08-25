# 005 — Conditional Job Unlocks: CUT

**Decision date**: 2026-08-25 · **Decided by**: user · **Status**: rejected, not deferred

## The proposal

Jobs unlocked by a permanent per-unit tally of battlefield deeds. Bounty Hunter after
15 kills was the worked example.

## The decision

**Cut.** Two reasons, either sufficient alone:

| # | Reason | Source |
|---|---|---|
| 1 | Adds a **fourth axis** to a customization spine locked at three | ADR-0001, constitution "customization spine" |
| 2 | A kill-count threshold rewards farming | `docs/02` §B4, "Kill the grind, kill the exploits" |

A third finding made the cut easy rather than causing it: the shipped campaign fields
**12 enemy units in total**, so a 15-kill threshold was unreachable by a unit that
solo-killed the entire game.

## What to do instead

The **hybrid/fusion** axis already expresses "you have to earn this", through job mastery
combinations. It is spine axis 3, it costs no new concept, and it carries no farming
incentive. Put behaviour-gated content there.

## Why these files are kept

So the idea is not re-proposed from scratch. The spec, plan, research, data model,
contract and 44-task breakdown are all intact — they show what the work would have cost
(9 source files, 5 test files, two save-format version bumps and a migration, for one job)
and exactly where it collided with the design.

**Nothing here is authorized. Do not implement any of it.**

## ⚠️ This decision is not yet durable

These files live on `claude/speckit-tooling-spike-voxuhy`, which is **never merged**. So
this rejection is invisible to anyone working on `main`, and a future agent can re-propose
deed-gated jobs with no idea it was considered and refused.

**To make it stick, an ADR has to land on `main`** — separately from this branch.
