/**
 * AP progression rules (docs/02, docs/05 §6; AC-J2/J3/J7) — the pure, deterministic
 * functions that spend AP on a job's skill tree, latch job mastery, and grant AP
 * after a battle. Operates on the persistent {@link UnitRecord} (roster.ts), reading
 * job trees from a {@link ContentRegistry} (content.ts).
 *
 * PURE + deterministic: no RNG, no wall-clock, no IO, no mutation. Every function
 * that changes a record returns a NEW record (immutable update); inputs are never
 * touched. This is engine substrate, but not battle-sim per se — it never draws
 * from the PRNG (there is no randomness in AP spend/grant).
 *
 * Customization-spine invariants enforced here:
 *   - AC-J2: `learnAbility` is the ONLY path that appends to `record.learned`, and
 *     it costs AP from the single global pool. No equipment/other mutator adds to it.
 *   - AC-J3: learned abilities + mastered jobs are PERMANENT — there is deliberately
 *     no unlearn/refund/de-master function, and they survive `changeJob`.
 *   - AC-J7: `awardAp` is capped and level-independent, so grinding a trivial action
 *     stops scaling AP and de-leveling can never inflate a grant.
 */

import { z } from "zod";
import type { ContentRegistry } from "./content.js";
import type { Job } from "./job.js";
import type { UnitRecord } from "./roster.js";

/** Result of a {@link canLearn} check: a clear reason string on failure. */
export type CanLearnResult = { ok: true } | { ok: false; reason: string };

/**
 * The node ids of `job`'s tree whose ability is already in `record.learned`.
 * A node is "learned" iff its `ability` id is in `learned` — the learned set is
 * keyed by ABILITY id (records are portable across jobs), so this is the bridge
 * back to a specific job's node ids for prereq checks and mastery.
 */
export function learnedNodeIds(record: UnitRecord, job: Job): string[] {
  const learned = new Set(record.learned);
  return job.tree.filter((n) => learned.has(n.ability)).map((n) => n.node);
}

/**
 * Whether `record` may learn tree node `nodeId` of job `jobId`. Checks, in order:
 * job exists, node exists in that job's tree, ability not already learned
 * (AC-J3: no re-learn), every `requires` prereq node's ability is already
 * learned, and `record.ap >= node.apCost`. Returns a clear reason on failure.
 */
export function canLearn(
  record: UnitRecord,
  jobId: string,
  nodeId: string,
  registry: ContentRegistry,
): CanLearnResult {
  // registry.job throws on an unknown id — guard so this returns a reason
  // rather than propagating (callers branch on ok, they don't try/catch).
  let job: Job;
  try {
    job = registry.job(jobId);
  } catch {
    return { ok: false, reason: `unknown job id "${jobId}"` };
  }

  const node = job.tree.find((n) => n.node === nodeId);
  if (!node) {
    return { ok: false, reason: `job "${jobId}" has no tree node "${nodeId}"` };
  }

  const learned = new Set(record.learned);
  if (learned.has(node.ability)) {
    // AC-J3: an already-known ability is never re-learned (and never re-charged AP).
    return { ok: false, reason: `ability "${node.ability}" is already learned` };
  }

  for (const reqNodeId of node.requires) {
    const reqNode = job.tree.find((n) => n.node === reqNodeId);
    if (!reqNode) {
      // Referential integrity is enforced by the loader, so this is defensive.
      return {
        ok: false,
        reason: `job "${jobId}" node "${nodeId}" requires unknown node "${reqNodeId}"`,
      };
    }
    if (!learned.has(reqNode.ability)) {
      return {
        ok: false,
        reason: `prerequisite node "${reqNodeId}" (ability "${reqNode.ability}") is not learned`,
      };
    }
  }

  if (record.ap < node.apCost) {
    return {
      ok: false,
      reason: `insufficient AP: have ${record.ap}, node "${nodeId}" costs ${node.apCost}`,
    };
  }

  return { ok: true };
}

/**
 * Learn tree node `nodeId` of job `jobId`: returns a NEW record with the node's
 * ability appended to `learned` and `ap` decremented by the node cost. Throws if
 * {@link canLearn} is false.
 *
 * AC-J2: this is the ONLY mutator that adds to `learned`, and it always debits
 * the global AP pool. AC-J3: there is intentionally NO inverse — nothing here
 * removes a learned ability or refunds AP.
 */
export function learnAbility(
  record: UnitRecord,
  jobId: string,
  nodeId: string,
  registry: ContentRegistry,
): UnitRecord {
  const check = canLearn(record, jobId, nodeId, registry);
  if (!check.ok) {
    throw new Error(`cannot learn node "${nodeId}" of job "${jobId}": ${check.reason}`);
  }
  // canLearn passing guarantees the node exists.
  const node = registry.job(jobId).tree.find((n) => n.node === nodeId)!;
  return {
    ...record,
    ap: record.ap - node.apCost,
    learned: [...record.learned, node.ability],
  };
}

/**
 * Whether every node's ability in job `jobId`'s tree is in `record.learned`
 * (i.e. the job's tree is fully bought). Reads the tree from the registry.
 */
export function isMastered(record: UnitRecord, jobId: string, registry: ContentRegistry): boolean {
  const job = registry.job(jobId);
  const learned = new Set(record.learned);
  return job.tree.every((n) => learned.has(n.ability));
}

/**
 * If `jobId`'s tree is fully learned and not already in `mastered`, return a NEW
 * record with `jobId` appended to `mastered`; otherwise return `record` unchanged.
 * Idempotent and latching (AC-J3: mastery is permanent, never removed here).
 */
export function checkMastery(
  record: UnitRecord,
  jobId: string,
  registry: ContentRegistry,
): UnitRecord {
  if (!isMastered(record, jobId, registry)) return record;
  if (record.mastered.includes(jobId)) return record;
  return { ...record, mastered: [...record.mastered, jobId] };
}

/**
 * Set the active job to `jobId`, leaving `learned` / `mastered` / `ap` untouched
 * — proving AC-J3 portability: progress is owned by the unit, not the job, so a
 * job change never costs or reveals anything. (Does not validate the id; the
 * caller/UI picks from unlocked jobs.)
 */
export function changeJob(record: UnitRecord, jobId: string): UnitRecord {
  return { ...record, currentJob: jobId };
}

/**
 * AP-grant inputs (ADR-0012 PLACEHOLDER shape, tuned by the grind-budget harness):
 * did the unit take part, and how many "meaningful" actions did it perform. Kept
 * deliberately minimal — the point is the SHAPE of the grant (capped, level-
 * independent), not the specific signal set, which the harness will refine.
 */
export const ApRewardSchema = z
  .object({
    participated: z.boolean(),
    meaningfulActions: z.number().int().min(0),
  })
  .strict();
export type ApReward = z.infer<typeof ApRewardSchema>;

/**
 * AP-grant constants (ADR-0012 PLACEHOLDERS, tuned by the grind-budget harness —
 * do not treat as balanced numbers). `ACTION_AP_CAP` is the load-bearing one for
 * AC-J7: it caps the per-action bonus so repeating a trivial action stops scaling.
 */
export const BASE_AP_GRANT = 40;
export const AP_PER_ACTION = 8;
export const ACTION_AP_CAP = 80;

/**
 * Deterministic post-battle AP grant. Returns a NEW record with `ap` increased by
 *   gained = participated ? BASE_AP_GRANT + min(ACTION_AP_CAP, meaningfulActions*AP_PER_ACTION) : 0
 *
 * AC-J7 invariants encoded here:
 *   - The per-action bonus is CAPPED at `ACTION_AP_CAP`, so grinding a repeated
 *     trivial action stops scaling AP (any two grants' bonus differ by at most the cap).
 *   - The grant is INDEPENDENT of `record.level` — this function never reads level,
 *     so de-leveling can never increase a grant and stat growth stays orthogonal to AP.
 */
export function awardAp(record: UnitRecord, reward: ApReward): UnitRecord {
  const r = ApRewardSchema.parse(reward);
  const bonus = Math.min(ACTION_AP_CAP, r.meaningfulActions * AP_PER_ACTION);
  const gained = r.participated ? BASE_AP_GRANT + bonus : 0;
  return { ...record, ap: record.ap + gained };
}
