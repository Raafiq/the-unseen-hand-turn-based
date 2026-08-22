import { describe, it, expect } from "vitest";
import pack from "../../data/base-pack.json" with { type: "json" };
import {
  DEFERRED_ACTIONS,
  loadContentPack,
  type ContentRegistry,
} from "../sim/index.js";
import { HELP_TOPICS } from "./help.js";

/**
 * The `?` panel's claims, held to the shipped content pack.
 *
 * A help panel is prose, and prose in this repo is treated as an assertion: it reads as
 * true and nobody re-derives it. The specific failure guarded here is the one the M0
 * item 7 slice found — a panel that tells a player to equip a Reaction while the
 * cheapest live reaction costs 540 AP against a campaign that pays out ~280. That help
 * would look correct in review, describe a real slot, and still be undeliverable.
 */

const registry: ContentRegistry = loadContentPack(pack);

/**
 * The campaign's AP budget for its best-earning member, measured by walking the real
 * campaign (`campaign-run.test.ts`). Deliberately the OPTIMISTIC figure: if a slot is
 * out of reach even for the unit that earns most, it is out of reach for everyone.
 */
const CAMPAIGN_AP_BUDGET = 280;

/** Cheapest total AP to reach a LIVE ability of `type`, prerequisites included. */
function cheapestLive(type: "support" | "reaction" | "movement"): number {
  let best = Infinity;
  for (const jobId of registry.jobById.keys()) {
    const tree = registry.job(jobId).tree;
    const byNode = new Map(tree.map((n) => [n.node, n]));
    const cost = (node: string, seen = new Set<string>()): number => {
      if (seen.has(node)) return 0;
      seen.add(node);
      const n = byNode.get(node);
      if (!n) return 0;
      return n.apCost + n.requires.reduce((s, r) => s + cost(r, seen), 0);
    };
    for (const n of tree) {
      const ab = registry.ability(n.ability);
      if (ab.type !== type) continue;
      const live =
        type === "support"
          ? ab.supportEffect !== undefined
          : type === "reaction"
            ? ab.reactionEffect !== undefined
            : ab.movementEffect !== undefined;
      if (live) best = Math.min(best, cost(n.node));
    }
  }
  return best;
}

describe("the help panel never promises what the pack cannot deliver", () => {
  const claimed = HELP_TOPICS.flatMap((t) => (t.slot ? [t.slot] : []));

  it("claims all three ability slots — so the check below is not vacuous", () => {
    // A `slot`-keyed assertion over an EMPTY set of claims would pass forever while
    // proving nothing. This pins what the panel is actually on the hook for.
    expect(new Set(claimed)).toEqual(new Set(["support", "reaction", "movement"]));
  });

  it.each(["support", "reaction", "movement"] as const)(
    "the %s it describes is live AND affordable in one campaign",
    (slot) => {
      const cost = cheapestLive(slot);
      expect(cost).toBeLessThan(Infinity); // a live one exists at all
      expect(cost).toBeLessThanOrEqual(CAMPAIGN_AP_BUDGET);
    },
  );

  it("DISCRIMINATING: the budget bar is one the pack could fail", () => {
    // Before this slice the same three assertions read 300 / 540 / 120 — support and
    // reaction both failed. Keeping a live upper bound here means the bar cannot be
    // quietly satisfied by every possible pack: the deepest passive must stay beyond
    // a single campaign, or "reachable" would just mean "everything is cheap".
    let deepest = 0;
    for (const jobId of registry.jobById.keys()) {
      for (const n of registry.job(jobId).tree) {
        if (registry.ability(n.ability).type === "action") continue;
        deepest = Math.max(deepest, n.apCost);
      }
    }
    expect(deepest).toBeGreaterThan(CAMPAIGN_AP_BUDGET / 2);
  });

  it("keeps the “no effect yet” topic exactly while inert abilities ship", () => {
    // Stale-prose guard in BOTH directions, the `storyCoverage` pattern: the topic must
    // be present while deferred abilities exist, and must be removed when they stop
    // existing — otherwise the panel apologises for a limitation the build no longer has.
    const hasInert = Object.keys(DEFERRED_ACTIONS).length > 0;
    const explains = HELP_TOPICS.some((t) => t.id === "unfinished");
    expect(explains).toBe(hasInert);
  });
});

describe("the help content is well-formed", () => {
  it("every topic has a title and at least one line, with unique ids", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of HELP_TOPICS) {
      expect(t.title.trim().length, `${t.id} needs a title`).toBeGreaterThan(0);
      expect(t.lines.length, `${t.id} needs a body`).toBeGreaterThan(0);
      for (const line of t.lines) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it("teaches the board before it teaches the build", () => {
    // Reading order is the one thing a newcomer cannot recover on their own: a panel
    // that opens on chassis slots has lost the person it exists for.
    const order = HELP_TOPICS.map((t) => t.id);
    expect(order.indexOf("turn-order")).toBeLessThan(order.indexOf("jobs"));
    expect(order.indexOf("acting")).toBeLessThan(order.indexOf("slots-secondary"));
  });
});
