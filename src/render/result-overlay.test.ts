/**
 * The result overlay's PURE half — no DOM, so its shape is asserted directly rather
 * than through a browser. The DOM-facing half (is it actually shown, is it actually
 * hidden, does the button actually reach `hud.ts`) is `e2e/result-overlay.spec.ts`.
 */

import { describe, expect, it } from "vitest";
import { CampaignHistoryEntrySchema } from "../sim/index.js";
import { DEFEAT_COPY, resultOverlayHtml, verdictOf, type ResultOverlayData } from "./result-overlay.js";

/**
 * ASSERT: every outcome the sim's own history schema can record maps to VICTORY or
 * DEFEAT, and only `"victory"` itself maps to VICTORY. Looped over the ENUM taken
 * FROM the schema (`CampaignHistoryEntrySchema.shape.outcome.options`), not a
 * hand-copied list, so a future outcome added to the sim is covered automatically
 * rather than silently falling through this test's blind spot.
 *
 * MUTATION: mapping `"timeout"` (or any of `draw`/`stalemate`) to its own label
 * instead of `"DEFEAT"` goes red — each is asserted BY NAME, not folded into a
 * count, so no single wrong mapping can hide behind the others still being right.
 */
describe("verdictOf — every outcome the sim can record maps to a label", () => {
  const outcomes = CampaignHistoryEntrySchema.shape.outcome.options;
  it("the enum this test walks actually has five members (non-degeneracy)", () => {
    expect(outcomes).toEqual(["victory", "defeat", "draw", "stalemate", "timeout"]);
  });
  // LOOPED OVER THE SCHEMA'S OWN ENUM, not five hand-copied `it`s: a sixth outcome
  // added to the sim gets a sixth generated case here automatically, rather than
  // silently falling through this test's blind spot the way the "every skillset
  // donates a live action" check once did for two whole jobs. Each case is still
  // asserted BY NAME (`it.each`'s own `"%s -> %s"` title), so one wrong mapping
  // cannot hide behind the others still being right.
  it.each(outcomes.map((o) => [o, o === "victory" ? "VICTORY" : "DEFEAT"] as const))(
    "%s -> %s",
    (outcome, expected) => {
      expect(verdictOf(outcome)).toBe(expected);
    },
  );
});

const victoryData: ResultOverlayData = {
  verdict: "VICTORY",
  title: "Scratch Battle Fixture",
  step: 1,
  total: 5,
  members: [
    { id: "pc-vance", name: "Vance", ap: 88, portrait: { url: "/vance.png", key: "archer-m" } },
    { id: "pc-kest", name: "Kest", ap: 96, portrait: { url: "/kest.png", key: "wizard-m" } },
  ],
  weaponGrant: { id: "wpn-rapier", name: "Rapier" },
};

const defeatData: ResultOverlayData = {
  verdict: "DEFEAT",
  title: "Scratch Battle Fixture",
  step: 1,
  total: 5,
  // DELIBERATELY CARRIES `members` (reviewer finding 10) even though the real
  // pipeline (`game.ts`'s `resultOverlayPort`) never populates this field for a
  // DEFEAT — a fixture that omits it cannot tell "the renderer checks `victory`"
  // from "the renderer merely checks whether `members` happens to be present",
  // since both readings render nothing here either way. With this present, only
  // the FORMER reading still renders nothing.
  members: [{ id: "pc-vance", name: "Vance", ap: 0, portrait: { url: "/vance.png", key: "archer-m" } }],
};

describe("resultOverlayHtml — VICTORY", () => {
  it("lists exactly the members it was given, by id/name/AP — not a count", () => {
    const html = resultOverlayHtml(victoryData, "CONTINUE ▸");
    // ASSERT identity, not presence: swapping Vance's and Kest's AP figures must be
    // visible as a WRONG number next to a NAMED id, which a count of "+N AP" strings
    // could never catch.
    expect(html).toMatch(/data-member-id="pc-vance"[\s\S]*?\+88 AP/);
    expect(html).toMatch(/data-member-id="pc-kest"[\s\S]*?\+96 AP/);
    // MUTATION: swapping the two members' AP figures goes red above (Vance would
    // show +96, Kest +88) even though the SET of numbers on the page is unchanged.
  });

  it("shows the weapon grant's real name, not a hard-coded one", () => {
    const html = resultOverlayHtml(victoryData, "CONTINUE ▸");
    expect(html).toContain("Rapier");
    const other: ResultOverlayData = {
      ...victoryData,
      weaponGrant: { id: "wpn-cestus", name: "Cestus" },
    };
    const otherHtml = resultOverlayHtml(other, "CONTINUE ▸");
    expect(otherHtml).toContain("Cestus");
    expect(otherHtml).not.toContain("Rapier");
    // MUTATION: hard-coding "Rapier" in the renderer goes red on `otherHtml`.
  });

  it("omits the weapon-drop row entirely when the battle granted nothing — absent, not —", () => {
    const noGrant: ResultOverlayData = {
      verdict: "VICTORY",
      title: victoryData.title,
      step: victoryData.step,
      total: victoryData.total,
      members: victoryData.members!,
    };
    const html = resultOverlayHtml(noGrant, "CONTINUE ▸");
    expect(html).not.toContain("result-weapon-grant");
    // BOTH forms a placeholder dash could take: the raw character (what a literal
    // "—" in a template would emit unescaped, since `esc()` never touches it) and
    // the entity this file's OWN `&mdash;` usage elsewhere (`whereLine`) shows is
    // the codebase's actual convention. `not.toContain("—")` alone can never fail —
    // no code path here writes that literal character — so it proved nothing.
    expect(html).not.toContain("—");
    expect(html).not.toContain("&mdash;");
  });
});

describe("resultOverlayHtml — DEFEAT (owner note 2's leaner card)", () => {
  const html = resultOverlayHtml(defeatData, "RETRY ▸");

  it("renders no portrait and no per-member card", () => {
    expect(html).not.toContain("result-member");
    expect(html).not.toContain("<img");
    // MUTATION: rendering the roster on Defeat (e.g. by ignoring `data.members` being
    // absent and falling back to some default list) goes red here.
  });

  it("carries the five owner-specified lines from the ONE shared copy constant", () => {
    expect(html).toContain("DEFEAT");
    expect(html).toContain("Scratch Battle Fixture");
    expect(html).toContain("Battle 1 of 5");
    expect(html).toContain(DEFEAT_COPY.message);
    expect(html).toContain(DEFEAT_COPY.rewardSummary);
    expect(html).toContain(DEFEAT_COPY.retention);
  });

  it("the action button carries the given label, not a fixed one", () => {
    expect(html).toContain("RETRY");
    expect(resultOverlayHtml(victoryData, "CONTINUE ▸")).toContain("CONTINUE");
  });
});
