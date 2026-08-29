import { describe, it, expect } from "vitest";
import {
  MIN_SUPPORTED_STORY_SCHEMA_VERSION,
  STORY_SCHEMA_VERSION,
  StorySchemaVersionError,
  parseStoryPack,
  portraitAssets,
  resolveBeat,
  sceneAt,
  storyBeat,
  storyCoverage,
  storyEntry,
  type StoryPack,
} from "./story.js";

/**
 * A minimal well-formed pack; each test bends one thing about it.
 *
 * `STORY_SCHEMA_VERSION` as a VARIABLE, never a literal, so a future bump does not
 * silently turn every case here into a "refuses an old version" test.
 */
const pack = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  storySchemaVersion: STORY_SCHEMA_VERSION,
  campaignId: "camp-test",
  characters: [
    { id: "kest", name: "Kest" },
    { id: "briar", name: "Briar" },
  ],
  entries: [
    {
      battleId: "b1",
      title: "One",
      pre: { lines: [{ speaker: "kest", text: "before one" }] },
      victory: { lines: [{ text: "won" }] },
    },
    {
      battleId: "b2",
      defeat: { lines: [{ speaker: "kest", text: "lost" }, { speaker: "kest", text: "again" }] },
    },
  ],
  scenes: [],
  ...over,
});

describe("the story pack is a versioned codec of its own", () => {
  it("parses a well-formed pack", () => {
    const p = parseStoryPack(pack());
    expect(p.entries).toHaveLength(2);
    expect(p.entries[0]!.title).toBe("One");
    expect(p.characters.map((c) => c.id)).toEqual(["kest", "briar"]);
  });

  it("refuses a missing, non-integer or NEWER version — never a partial load", () => {
    expect(() => parseStoryPack(pack({ storySchemaVersion: undefined }))).toThrow(
      StorySchemaVersionError,
    );
    expect(() => parseStoryPack(pack({ storySchemaVersion: 1.5 }))).toThrow(
      StorySchemaVersionError,
    );
    expect(() => parseStoryPack(pack({ storySchemaVersion: STORY_SCHEMA_VERSION + 1 }))).toThrow(
      /newer than this build supports/,
    );
    expect(() =>
      parseStoryPack(pack({ storySchemaVersion: MIN_SUPPORTED_STORY_SCHEMA_VERSION - 1 })),
    ).toThrow(/older than the minimum supported/);
    expect(() => parseStoryPack("not an object")).toThrow(StorySchemaVersionError);
  });

  it("refuses duplicate battle ids — a shadowed entry would silently drop a scene", () => {
    expect(() =>
      parseStoryPack(
        pack({
          entries: [
            { battleId: "b1", pre: { lines: [{ text: "first" }] } },
            { battleId: "b1", pre: { lines: [{ text: "second" }] } },
          ],
        }),
      ),
    ).toThrow();
  });

  it("refuses duplicate character ids", () => {
    expect(() =>
      parseStoryPack(
        pack({ characters: [{ id: "kest", name: "Kest" }, { id: "kest", name: "Kest Again" }] }),
      ),
    ).toThrow(/character ids must be unique/);
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
      parseStoryPack(pack({ entries: [{ battleId: "b1", after: { lines: [{ text: "x" }] } }] })),
    ).toThrow();
  });
});

describe("AC-M8: every reference resolves at PARSE time, so nothing falls back at render", () => {
  it("DISCRIMINATING: an unresolvable speaker does not parse", () => {
    // The pair is the whole assertion. An implementation that resolved at RENDER with a
    // fallback would accept both of these and quietly show the raw id — the
    // "no entry vs no match" defect `src/render/CLAUDE.md` records, which shipped once
    // with 720 tests green. The fix is having nothing to fall back from.
    const withGhost = pack({
      entries: [{ battleId: "b1", pre: { lines: [{ speaker: "ghost", text: "boo" }] } }],
    });
    expect(() => parseStoryPack(withGhost)).toThrow(/speaker 'ghost'/);

    const present = pack({
      characters: [{ id: "ghost", name: "A Ghost" }],
      entries: [{ battleId: "b1", pre: { lines: [{ speaker: "ghost", text: "boo" }] } }],
    });
    expect(() => parseStoryPack(present)).not.toThrow();
  });

  it("checks speakers inside SCENES too, not only inside battle entries", () => {
    // A refinement that walked `entries` alone would pass this. Scenes are the newer
    // prose site, so they are the one a copied check forgets.
    expect(() =>
      parseStoryPack(
        pack({
          scenes: [
            {
              id: "sc-1",
              at: { kind: "campaign-end" },
              beat: { lines: [{ speaker: "nobody", text: "the end" }] },
            },
          ],
        }),
      ),
    ).toThrow(/speaker 'nobody'/);
  });

  it("DISCRIMINATING: an expression must exist on that character's portrait", () => {
    const character = (variants: unknown) => ({
      id: "kest",
      name: "Kest",
      portrait: { asset: "kest", ...(variants ? { variants } : {}) },
    });
    const entries = [
      { battleId: "b1", pre: { lines: [{ speaker: "kest", expression: "grim", text: "hm" }] } },
    ];
    expect(() =>
      parseStoryPack(pack({ characters: [character(null)], entries })),
    ).toThrow(/no portrait variant 'grim'/);
    expect(() =>
      parseStoryPack(
        pack({ characters: [character([{ expression: "grim", asset: "kest-grim" }])], entries }),
      ),
    ).not.toThrow();
  });

  it("refuses an expression with no speaker to hang it on", () => {
    expect(() =>
      parseStoryPack(
        pack({ entries: [{ battleId: "b1", pre: { lines: [{ expression: "grim", text: "hm" }] }}] }),
      ),
    ).toThrow(/expression 'grim' with no speaker/);
  });

  it("refuses two scenes anchored at the same point — the shell has no scene queue", () => {
    const scene = (id: string) => ({
      id,
      at: { kind: "before-battle", battleId: "b1" },
      beat: { lines: [{ text: "x" }] },
    });
    expect(() => parseStoryPack(pack({ scenes: [scene("a"), scene("b")] }))).toThrow(
      /at most one scene/,
    );
    expect(() => parseStoryPack(pack({ scenes: [scene("a")] }))).not.toThrow();
  });
});

describe("AC-M8: migrating a v1 pack forward", () => {
  /** A v1 pack, spelled as a LITERAL 1 — this shape is frozen history, not the current one. */
  const v1 = {
    storySchemaVersion: 1,
    campaignId: "camp-test",
    entries: [
      { battleId: "b1", title: "One", pre: { speaker: "Vance", lines: ["first", "second"] } },
      { battleId: "b2", victory: { speaker: "Kest", lines: ["won"] }, defeat: { lines: ["lost"] } },
    ],
  };

  it("DISCRIMINATING: the migrated pack RENDERS as v1 did, and invents no extra character", () => {
    const p = parseStoryPack(structuredClone(v1));
    expect(p.storySchemaVersion).toBe(STORY_SCHEMA_VERSION);

    // Half one — grouping. v1 drew ONE plate over Vance's two lines. A migration that
    // dropped the speaker also yields one group (of narration), so this alone is not
    // enough.
    const pre = resolveBeat(p, storyBeat(p, "b1", "pre")!);
    expect(pre.map((l) => l.text)).toEqual(["first", "second"]);
    expect(pre.map((l) => l.who?.name)).toEqual(["Vance", "Vance"]);

    // Half two — the registry. A migration emitting one character per LINE rather than
    // per label passes half one and fails here.
    expect(p.characters).toEqual([
      { id: "Vance", name: "Vance" },
      { id: "Kest", name: "Kest" },
    ]);

    // A v1 beat with no speaker stays narration rather than acquiring one.
    expect(resolveBeat(p, storyBeat(p, "b2", "defeat")!)[0]!.who).toBeNull();
  });

  it("the label is carried VERBATIM — the migration invents no naming convention", () => {
    // Slugifying would make "Vance" and "vance" collide, and the collision would have to
    // be resolved silently inside a migration. The identity function cannot.
    const p = parseStoryPack(structuredClone(v1));
    expect(p.characters.map((c) => c.id)).toEqual(["Vance", "Kest"]);
  });

  it("back-fills NO scenes and NO portraits — absent, never a helpful default", () => {
    const p = parseStoryPack(structuredClone(v1));
    expect(p.scenes).toEqual([]);
    expect(p.characters.every((c) => c.portrait === undefined)).toBe(true);
    expect(portraitAssets(p)).toEqual([]);
  });

  it("DISCRIMINATING: the walk VALIDATES after migrating, not before", () => {
    // A v1 pack that is already malformed must still fail. An implementation that
    // parsed first and migrated after would reject this at the wrong shape; one that
    // migrated and trusted the result would accept it.
    expect(() =>
      parseStoryPack({ ...structuredClone(v1), entries: [{ battleId: "b1", pre: { lines: [] } }] }),
    ).toThrow();
  });
});

describe("looking a beat up", () => {
  const p: StoryPack = parseStoryPack(pack());

  it("returns the authored beat for the moment asked for", () => {
    expect(storyBeat(p, "b1", "pre")?.lines.map((l) => l.text)).toEqual(["before one"]);
    expect(storyBeat(p, "b2", "defeat")?.lines[0]?.speaker).toBe("kest");
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
    expect(storyBeat(p, "b1", "victory")?.lines.map((l) => l.text)).toEqual(["won"]);
    expect(storyBeat(p, "b1", "defeat")).toBeNull();
  });
});

describe("AC-M8: per-line attribution, and what resolving hands back", () => {
  const twoSpeakers = parseStoryPack(
    pack({
      entries: [
        {
          battleId: "b1",
          pre: {
            lines: [
              { speaker: "kest", text: "mine" },
              { speaker: "briar", text: "yours" },
              { text: "and nobody's" },
            ],
          },
        },
      ],
    }),
  );

  it("DISCRIMINATING: two lines in ONE beat can name DIFFERENT characters", () => {
    // The fixture that separates v2 from v1. A beat-level speaker gives one name for the
    // whole block, so it cannot produce this array — and a fixture where both lines named
    // the same character would score identically under both schemas.
    const lines = resolveBeat(twoSpeakers, storyBeat(twoSpeakers, "b1", "pre")!);
    expect(lines.map((l) => l.who?.name ?? null)).toEqual(["Kest", "Briar", null]);
  });

  it("an unattributed line is narration — null, never a character we could not find", () => {
    const lines = resolveBeat(twoSpeakers, storyBeat(twoSpeakers, "b1", "pre")!);
    expect(lines[2]!.who).toBeNull();
    expect(lines[2]!.portrait).toBeNull();
  });

  it("a character with no portrait resolves to a null asset, not to a placeholder", () => {
    const lines = resolveBeat(twoSpeakers, storyBeat(twoSpeakers, "b1", "pre")!);
    expect(lines.map((l) => l.portrait)).toEqual([null, null, null]);
  });

  it("an expression picks its VARIANT; its absence picks the base asset", () => {
    const p = parseStoryPack(
      pack({
        characters: [
          {
            id: "kest",
            name: "Kest",
            portrait: { asset: "kest", variants: [{ expression: "grim", asset: "kest-grim" }] },
          },
        ],
        entries: [
          {
            battleId: "b1",
            pre: {
              lines: [
                { speaker: "kest", text: "plain" },
                { speaker: "kest", expression: "grim", text: "grim" },
              ],
            },
          },
        ],
      }),
    );
    const lines = resolveBeat(p, storyBeat(p, "b1", "pre")!);
    // Two different assets from one character — a resolver ignoring `expression` would
    // return the base twice and pass any test that only checked the first line.
    expect(lines.map((l) => l.portrait)).toEqual(["kest", "kest-grim"]);
    expect(portraitAssets(p)).toEqual(["kest", "kest-grim"]);
  });
});

describe("AC-M8: standalone scenes are anchored, and found by their anchor", () => {
  const p = parseStoryPack(
    pack({
      scenes: [
        {
          id: "sc-prologue",
          title: "Before",
          at: { kind: "before-battle", battleId: "b1" },
          beat: { lines: [{ speaker: "kest", text: "we begin" }] },
        },
        {
          id: "sc-epilogue",
          at: { kind: "campaign-end" },
          beat: { lines: [{ text: "we end" }] },
        },
      ],
    }),
  );

  it("finds a scene by its anchor, and returns null where none is anchored", () => {
    expect(sceneAt(p, { kind: "before-battle", battleId: "b1" })?.id).toBe("sc-prologue");
    expect(sceneAt(p, { kind: "campaign-end" })?.id).toBe("sc-epilogue");
    // b2 has no interlude, which is well-authored content and not a gap.
    expect(sceneAt(p, { kind: "before-battle", battleId: "b2" })).toBeNull();
  });

  it("the two anchor kinds do not collapse into each other", () => {
    // A `sceneAt` keying on `kind` alone would hand the epilogue back for every battle.
    expect(sceneAt(p, { kind: "before-battle", battleId: "b1" })!.id).not.toBe(
      sceneAt(p, { kind: "campaign-end" })!.id,
    );
  });
});

describe("coverage is a TWO-direction partition, plus a ONE-direction scene check", () => {
  const p: StoryPack = parseStoryPack(pack());

  it("clean when the pack and the battle list agree exactly", () => {
    expect(storyCoverage(["b1", "b2"], p)).toEqual({ missing: [], extra: [], orphanScenes: [] });
  });

  it("reports a battle with no entry (a one-direction check would pass a short pack)", () => {
    expect(storyCoverage(["b1", "b2", "b3"], p)).toEqual({
      missing: ["b3"],
      extra: [],
      orphanScenes: [],
    });
  });

  it("reports a STALE entry too — the direction a missing-only check cannot see", () => {
    // The failure this exists for: a battle renamed b2 → b2a leaves an entry that
    // resolves for nothing. `missing` alone would report only half of that.
    expect(storyCoverage(["b1"], p)).toEqual({ missing: [], extra: ["b2"], orphanScenes: [] });
  });

  it("DISCRIMINATING: an orphan scene is reported; a battle with NO scene is not", () => {
    // Three cases, and the third is the one that separates an orphan check from a
    // blindly copied `missing` check: scenes are optional, so "b2 has no scene" must
    // stay silent while "sc-nowhere points at b9" must not.
    const withScenes = parseStoryPack(
      pack({
        scenes: [
          {
            id: "sc-nowhere",
            at: { kind: "before-battle", battleId: "b9" },
            beat: { lines: [{ text: "unreachable" }] },
          },
          {
            id: "sc-fine",
            at: { kind: "before-battle", battleId: "b1" },
            beat: { lines: [{ text: "reachable" }] },
          },
        ],
      }),
    );
    expect(storyCoverage(["b1", "b2"], withScenes).orphanScenes).toEqual(["sc-nowhere"]);
    // b2 has no scene at all and must NOT be reported as anything.
    expect(storyCoverage(["b1", "b2"], withScenes).missing).toEqual([]);
    // And an end-anchored scene is never an orphan, since it names no battle.
    const ending = parseStoryPack(
      pack({
        scenes: [{ id: "sc-end", at: { kind: "campaign-end" }, beat: { lines: [{ text: "." }] } }],
      }),
    );
    expect(storyCoverage(["b1", "b2"], ending).orphanScenes).toEqual([]);
  });
});
