/**
 * AP progression tests (AC-J2/J3/J7). Exercises the real shipped content pack
 * (`data/base-pack.json`) so mastery runs a genuine 7-node tree (Wizard).
 *
 * The test does IO (reads the JSON) — a test-layer concern; the sim stays pure.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { loadContentPack, type ContentRegistry } from "./content.js";
import { defaultUnitRecord, type UnitRecord } from "./roster.js";
import {
  canLearn,
  learnAbility,
  isMastered,
  checkMastery,
  changeJob,
  awardAp,
  learnedNodeIds,
  ACTION_AP_CAP,
  BASE_AP_GRANT,
} from "./progression.js";

function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return loadContentPack(raw);
}

const registry = loadShippedPack();

/** Learn every node of `jobId`'s tree in prereq order (given ample AP). */
function learnWholeTree(start: UnitRecord, jobId: string): UnitRecord {
  const job = registry.job(jobId);
  let rec = start;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const node of job.tree) {
      if (canLearn(rec, jobId, node.node, registry).ok) {
        rec = learnAbility(rec, jobId, node.node, registry);
        progressed = true;
      }
    }
  }
  return rec;
}

describe("AC-J2 — AP is the only path to a learned ability", () => {
  it("learnAbility debits exactly the node cost and appends the ability", () => {
    const rec = defaultUnitRecord("w", "wizard", { ap: 100 });
    const after = learnAbility(rec, "wizard", "fire", registry);
    // "fire" costs 60.
    expect(after.ap).toBe(40);
    expect(after.learned).toEqual(["black-magic.fire"]);
    // Input record is untouched (immutable update).
    expect(rec.ap).toBe(100);
    expect(rec.learned).toEqual([]);
  });

  it("rejects a learn when AP is insufficient (canLearn false + learnAbility throws)", () => {
    const rec = defaultUnitRecord("w", "wizard", { ap: 59 }); // fire costs 60
    const check = canLearn(rec, "wizard", "fire", registry);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/insufficient AP/);
    expect(() => learnAbility(rec, "wizard", "fire", registry)).toThrow(/insufficient AP/);
  });

  it("rejects a learn when a prerequisite node is unlearned", () => {
    const rec = defaultUnitRecord("w", "wizard", { ap: 9999 });
    // fire-2 requires fire, which is not yet learned.
    const check = canLearn(rec, "wizard", "fire-2", registry);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/prerequisite/);
    expect(() => learnAbility(rec, "wizard", "fire-2", registry)).toThrow(/prerequisite/);
  });

  it("an unknown job or node yields a reason, never a throw from the guard", () => {
    const rec = defaultUnitRecord("w", "wizard", { ap: 9999 });
    expect(canLearn(rec, "no-such-job", "fire", registry).ok).toBe(false);
    expect(canLearn(rec, "wizard", "no-such-node", registry).ok).toBe(false);
  });

  it("the freshly minted record starts with no learned abilities (AP is the only source)", () => {
    // AC-J2: there is no non-AP mutator that seeds `learned`; a new record is empty
    // and only learnAbility (which debits AP) can add to it.
    const rec = defaultUnitRecord("w", "wizard", { ap: 500 });
    expect(rec.learned).toEqual([]);
    const grown = learnAbility(rec, "wizard", "fire", registry);
    expect(grown.learned.length).toBe(1);
  });
});

describe("AC-J3 — progress is permanent and portable", () => {
  it("learned + mastered survive a job change untouched", () => {
    let rec = defaultUnitRecord("w", "wizard", { ap: 9999 });
    rec = learnAbility(rec, "wizard", "fire", registry);
    rec = { ...rec, mastered: ["thief"] };
    const apBefore = rec.ap;
    const moved = changeJob(rec, "knight");
    expect(moved.currentJob).toBe("knight");
    expect(moved.learned).toEqual(rec.learned);
    expect(moved.mastered).toEqual(rec.mastered);
    expect(moved.ap).toBe(apBefore);
  });

  it("a fully-bought tree latches mastery, which persists across another job change", () => {
    let rec = defaultUnitRecord("w", "wizard", { ap: 100000 });
    expect(isMastered(rec, "wizard", registry)).toBe(false);
    rec = learnWholeTree(rec, "wizard");
    expect(isMastered(rec, "wizard", registry)).toBe(true);

    rec = checkMastery(rec, "wizard", registry);
    expect(rec.mastered).toContain("wizard");

    // Idempotent: a second check does not duplicate the entry.
    const again = checkMastery(rec, "wizard", registry);
    expect(again.mastered).toEqual(rec.mastered);

    // Mastery survives switching jobs.
    const moved = changeJob(rec, "knight");
    expect(moved.mastered).toContain("wizard");
  });

  it("checkMastery is a no-op when the tree is not fully learned", () => {
    let rec = defaultUnitRecord("w", "wizard", { ap: 9999 });
    rec = learnAbility(rec, "wizard", "fire", registry);
    const checked = checkMastery(rec, "wizard", registry);
    expect(checked.mastered).toEqual([]);
    expect(checked).toEqual(rec);
  });

  it("re-learning an already-known ability is rejected (no re-charge, no duplicate)", () => {
    let rec = defaultUnitRecord("w", "wizard", { ap: 9999 });
    rec = learnAbility(rec, "wizard", "fire", registry);
    const check = canLearn(rec, "wizard", "fire", registry);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/already learned/);
    expect(() => learnAbility(rec, "wizard", "fire", registry)).toThrow(/already learned/);
  });

  it("learnedNodeIds maps the learned set back onto a job's node ids", () => {
    let rec = defaultUnitRecord("w", "wizard", { ap: 9999 });
    rec = learnAbility(rec, "wizard", "fire", registry);
    rec = learnAbility(rec, "wizard", "ice", registry);
    expect(new Set(learnedNodeIds(rec, registry.job("wizard")))).toEqual(new Set(["fire", "ice"]));
  });
});

describe("AC-J7 — AP grants are capped and level-independent", () => {
  it("caps the per-action bonus so grinding stops scaling", () => {
    const rec = defaultUnitRecord("w", "wizard", { ap: 0 });
    const few = awardAp(rec, { participated: true, meaningfulActions: 5 });
    const many = awardAp(rec, { participated: true, meaningfulActions: 500 });
    // The two grants differ by at most the cap — a huge action count cannot run away.
    expect(many.ap - few.ap).toBeLessThanOrEqual(ACTION_AP_CAP);
    // And the huge grant is exactly base + cap (fully saturated).
    expect(many.ap).toBe(BASE_AP_GRANT + ACTION_AP_CAP);
  });

  it("is independent of level (level 1 and level 50 grant identically)", () => {
    const lo = defaultUnitRecord("w", "wizard", { ap: 0, level: 1 });
    const hi = defaultUnitRecord("w", "wizard", { ap: 0, level: 50 });
    const rewardedLo = awardAp(lo, { participated: true, meaningfulActions: 7 });
    const rewardedHi = awardAp(hi, { participated: true, meaningfulActions: 7 });
    expect(rewardedLo.ap).toBe(rewardedHi.ap);
  });

  it("grants 0 AP when the unit did not participate", () => {
    const rec = defaultUnitRecord("w", "wizard", { ap: 25 });
    const after = awardAp(rec, { participated: false, meaningfulActions: 999 });
    expect(after.ap).toBe(25);
  });
});
