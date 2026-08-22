import { describe, it, expect } from "vitest";
import {
  STORY_SCHEMA_VERSION,
  StorySchemaVersionError,
  parseStoryPack,
  storyBeat,
  storyCoverage,
  storyEntry,
  type StoryPack,
} from "./story.js";

/** A minimal well-formed pack; each test bends one thing about it. */
const pack = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  storySchemaVersion: STORY_SCHEMA_VERSION,
  campaignId: "camp-test",
  entries: [
    { battleId: "b1", title: "One", pre: { lines: ["before one"] }, victory: { lines: ["won"] } },
    { battleId: "b2", defeat: { speaker: "Kest", lines: ["lost", "again"] } },
  ],
  ...over,
});

describe("the story pack is a versioned codec of its own", () => {
  it("parses a well-formed pack", () => {
    const p = parseStoryPack(pack());
    expect(p.entries).toHaveLength(2);
    expect(p.entries[0]!.title).toBe("One");
  });

  it("refuses a missing, non-integer or unsupported version — never a partial load", () => {
    expect(() => parseStoryPack(pack({ storySchemaVersion: undefined }))).toThrow(
      StorySchemaVersionError,
    );
    expect(() => parseStoryPack(pack({ storySchemaVersion: 1.5 }))).toThrow(
      StorySchemaVersionError,
    );
    expect(() => parseStoryPack(pack({ storySchemaVersion: STORY_SCHEMA_VERSION + 1 }))).toThrow(
      StorySchemaVersionError,
    );
    expect(() => parseStoryPack("not an object")).toThrow(StorySchemaVersionError);
  });

  it("refuses duplicate battle ids — a shadowed entry would silently drop a scene", () => {
    expect(() =>
      parseStoryPack(
        pack({
          entries: [
            { battleId: "b1", pre: { lines: ["first"] } },
            { battleId: "b1", pre: { lines: ["second"] } },
          ],
        }),
      ),
    ).toThrow();
  });

  it("refuses an EMPTY beat — a scene with no lines is a content bug, not a choice", () => {
    // The discriminating pair: an absent `pre` is fine (b2 has none), a present-but-empty
    // one is not. Without the `.min(1)` both would parse and only one is authorable.
    expect(() => parseStoryPack(pack({ entries: [{ battleId: "b1" }] }))).not.toThrow();
    expect(() =>
      parseStoryPack(pack({ entries: [{ battleId: "b1", pre: { lines: [] } }] })),
    ).toThrow();
  });

  it("refuses unknown fields, so a typo'd moment is loud rather than invisible", () => {
    // `.strict()` is what stops `postt:` or `after:` from parsing cleanly and then
    // never appearing on screen — the authoring mistake that looks like a UI bug.
    expect(() =>
      parseStoryPack(pack({ entries: [{ battleId: "b1", after: { lines: ["x"] } }] })),
    ).toThrow();
  });
});

describe("looking a beat up", () => {
  const p: StoryPack = parseStoryPack(pack());

  it("returns the authored beat for the moment asked for", () => {
    expect(storyBeat(p, "b1", "pre")?.lines).toEqual(["before one"]);
    expect(storyBeat(p, "b2", "defeat")?.speaker).toBe("Kest");
  });

  it("DISCRIMINATING: an unauthored moment is null, not an empty beat", () => {
    // The caller has to be able to tell "nothing to say here" from "a blank scene".
    // A lookup returning `{lines: []}` would make an authoring gap render as a void.
    expect(storyBeat(p, "b1", "defeat")).toBeNull();
    expect(storyBeat(p, "b2", "pre")).toBeNull();
    expect(storyBeat(p, "nope", "pre")).toBeNull();
    expect(storyEntry(p, "nope")).toBeNull();
  });

  it("the moments do not collapse into each other", () => {
    // If `victory` and `defeat` were read from one "after" field, this pair would be
    // equal — which is precisely the shell bug the split exists to prevent.
    expect(storyBeat(p, "b1", "victory")?.lines).toEqual(["won"]);
    expect(storyBeat(p, "b1", "defeat")).toBeNull();
  });
});

describe("coverage is a TWO-direction partition", () => {
  const p: StoryPack = parseStoryPack(pack());

  it("clean when the pack and the battle list agree exactly", () => {
    expect(storyCoverage(["b1", "b2"], p)).toEqual({ missing: [], extra: [] });
  });

  it("reports a battle with no entry (a one-direction check would pass a short pack)", () => {
    expect(storyCoverage(["b1", "b2", "b3"], p)).toEqual({ missing: ["b3"], extra: [] });
  });

  it("reports a STALE entry too — the direction a missing-only check cannot see", () => {
    // The failure this exists for: a battle renamed b2 → b2a leaves an entry that
    // resolves for nothing. `missing` alone would report only half of that.
    expect(storyCoverage(["b1"], p)).toEqual({ missing: [], extra: ["b2"] });
  });
});
