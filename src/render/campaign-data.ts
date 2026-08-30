/**
 * The shipped campaign, bundled for the browser.
 *
 * `src/sim/campaign.ts` and `campaign-run.ts` never read a file — the caller owns the
 * IO (the tests read from disk; the browser gets the JSON inlined by the bundler). This
 * module is that caller for the web build, and nothing else: it parses, validates, and
 * hands back plain data.
 *
 * WHY THE ENCOUNTER IMPORTS ARE SPELLED OUT ONE BY ONE. A glob would be
 * self-maintaining, but `import.meta.glob` is Vite-only and this data is also reachable
 * from plain-Node contexts. The cost of writing them out is that a battle whose file is
 * never imported would be invisible — `data/campaign/encounters` shipping five battles
 * that a directory-blind counter could not see is a documented failure in this repo. So
 * {@link ENCOUNTERS} is checked against the campaign def's own battle list in
 * `campaign-shell.test.ts`: every `encounterId` the campaign names must resolve, and
 * every encounter bundled here must be named. A missing import fails loudly instead of
 * shortening the campaign.
 */

import campaignJson from "../../data/campaign/camp-the-first-march.json" with { type: "json" };
import storyJson from "../../data/campaign/story/camp-the-first-march.story.json" with { type: "json" };
import b1 from "../../data/campaign/encounters/camp-b1-the-toll-road.json" with { type: "json" };
import b2 from "../../data/campaign/encounters/camp-b2-ambush-at-the-ford.json" with { type: "json" };
import b3 from "../../data/campaign/encounters/camp-b3-the-hollow-watch.json" with { type: "json" };
import b4 from "../../data/campaign/encounters/camp-b4-the-broken-span.json" with { type: "json" };
import b5 from "../../data/campaign/encounters/camp-b5-the-warchiefs-camp.json" with { type: "json" };
import pack from "../../data/base-pack.json" with { type: "json" };
// Portrait art, imported so VITE resolves each to a URL with `base` applied — the Pages
// sub-path is then the bundler's problem, as it already is for every JS chunk, rather
// than a relative-path convention every future author has to remember. Spelled out one
// per line for the same reason the five encounter imports are (see above).
import placeholderPortrait from "../../data/campaign/story/portraits/placeholder.svg";
import {
  loadContentPack,
  parseCampaign,
  parseStoryPack,
  portraitCoverage,
  storyCoverage,
  type CampaignDef,
  type ContentRegistry,
  type EncounterMap,
  type StoryPack,
} from "../sim/index.js";
import { parseTerrain, type TerrainMap } from "./terrain.js";

/** The content registry every campaign unit is compiled against. */
export const registry: ContentRegistry = loadContentPack(pack);

/** The shipped campaign, validated at module load — a bad def fails at boot, loudly. */
export const campaign: CampaignDef = parseCampaign(campaignJson);

const ENCOUNTER_DEFS: readonly unknown[] = [b1, b2, b3, b4, b5];

/** encounter id → its raw def, keyed by the def's OWN id rather than its filename. */
export const ENCOUNTERS: EncounterMap = Object.freeze(
  Object.fromEntries(
    ENCOUNTER_DEFS.map((def) => {
      const id = (def as { id?: unknown }).id;
      if (typeof id !== "string" || id === "") {
        throw new Error("a bundled campaign encounter has no string id");
      }
      return [id, def] as const;
    }),
  ),
);

/**
 * The shipped story pack (docs/11 M0 item 4, AC-M4) — the text a player reads around
 * each battle, as DATA. Nothing in `src/sim` or `src/render` authors a word of it; this
 * module only parses it and checks it lines up with the campaign it claims to be for.
 */
export const story: StoryPack = parseStoryPack(storyJson);

/**
 * Asset key → the URL the bundle serves it from.
 *
 * The engine never resolves an asset key (`story.ts` holds keys and nothing else); this
 * is the one place that mapping exists, and the boot check below asserts it agrees with
 * the pack in both directions.
 */
export const PORTRAITS: Readonly<Record<string, string>> = Object.freeze({
  placeholder: placeholderPortrait,
});

// Boot-time coverage, in BOTH directions, for the reason the encounter partition below
// exists: `missing` catches a battle that ships with a blank screen where a scene should
// be, and `extra` catches an entry left behind by a renamed battle, which resolves for
// nothing and reads as "covered". A one-direction check passes half of those. Loud at
// module load rather than at the briefing, so a content mistake cannot reach a player.
{
  if (story.campaignId !== campaign.id) {
    throw new Error(
      `story pack is authored for campaign "${story.campaignId}", not "${campaign.id}"`,
    );
  }
  const gaps = storyCoverage(
    campaign.battles.map((b) => b.id),
    story,
  );
  if (gaps.missing.length > 0 || gaps.extra.length > 0) {
    throw new Error(
      `story pack does not match the campaign's battles — no text for ` +
        `[${gaps.missing.join(", ")}], text for absent [${gaps.extra.join(", ")}]`,
    );
  }
  // Standalone scenes are checked in ONE direction only, and that asymmetry is
  // deliberate: a battle with no interlude is well-authored content, while a scene
  // anchored to a battle the campaign does not play is a scene no player can ever reach.
  if (gaps.orphanScenes.length > 0) {
    throw new Error(
      `story pack anchors scenes to battles this campaign does not play: ` +
        `[${gaps.orphanScenes.join(", ")}]`,
    );
  }
  // Both directions again: a named-but-unbundled key would render a broken image, and a
  // bundled-but-unnamed one is art that shipped wired to nothing and reads as done.
  const art = portraitCoverage(story, Object.keys(PORTRAITS));
  if (art.missing.length > 0 || art.extra.length > 0) {
    throw new Error(
      `story pack and bundled portraits disagree — no asset for ` +
        `[${art.missing.join(", ")}], unused art [${art.extra.join(", ")}]`,
    );
  }
}

/**
 * The FALLBACK display name for a battle, derived from its encounter id.
 *
 * The story pack authors a real title (`StoryEntry.title`) and the page prefers it; this
 * is what a battle with no authored title gets. Kept because a derivation is honest about
 * being one — it cannot invent prose, so an unauthored battle reads as plainly unnamed
 * rather than as narrative the engine made up.
 */
export function battleTitle(encounterId: string): string {
  return encounterId
    .replace(/^camp-b\d+-/, "")
    .split("-")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * PAINTED GROUND, per battle (owner decision, 2026-08-30 — "Daylight field").
 *
 * One authored row of letters per grid row: `g` grass, `d` dirt, `r` rock, `w` water,
 * `s` sand, `p` wood. Props stand on tiles and block nothing.
 *
 * **This is presentation and nothing else.** No entry here reaches `BattleState`, so a
 * unit walks across painted water exactly as it walks across painted grass — the sim's
 * `passable` is still the only answer to "may I stand there", and it was not asked.
 * See `terrain.ts` for why that is deliberate rather than an oversight.
 *
 * EVERY BATTLE MUST HAVE AN ENTRY. Battle 1 shipped alone first so the look could be
 * judged in the real game; the owner said go on 2026-08-30 and the other four followed,
 * so `campaign-shell.test.ts` now checks the two sets are EQUAL. Both directions earn
 * their keep: a battle with no map would draw the flat look by omission and read as a
 * rendering bug, and a map keyed to a renamed battle is ground nobody can stand on.
 * `terrainFor` still returns `undefined` for an unknown id — that is the engine demo's
 * path, not a campaign battle's.
 *
 * The map's dimensions are re-checked against the real grid at the first frame
 * (`assertFitsGrid`), so a row of the wrong length fails loudly rather than painting a
 * battle half-right.
 */
export const TERRAIN: Readonly<Record<string, TerrainMap>> = Object.freeze({
  // The Toll Road — 7x5. A dirt road runs the length of it, grass either side, a rocky
  // verge where the brigands hold the far end.
  "camp-b1-the-toll-road": parseTerrain(
    [
      "ggggggr",
      "gdddddr",
      "dddddrr",
      "gdddddr",
      "ggggggr",
    ],
    [
      { pos: { x: 1, y: 0 }, kind: "tree" },
      { pos: { x: 5, y: 4 }, kind: "tree" },
      { pos: { x: 0, y: 4 }, kind: "boulder" },
      { pos: { x: 6, y: 0 }, kind: "pillar" },
    ],
  ),

  // Ambush at the Ford — 9x5. A river cuts the road in two; the road crosses it at a
  // shallow sand bar, which is the ford the battle is named for.
  "camp-b2-ambush-at-the-ford": parseTerrain(
    [
      "ggdwwgggg",
      "gddwwgggg",
      "dddssdddd",
      "gddwwgggg",
      "ggdwwgggg",
    ],
    [
      { pos: { x: 1, y: 0 }, kind: "tree" },
      { pos: { x: 7, y: 0 }, kind: "tree" },
      { pos: { x: 6, y: 4 }, kind: "tree" },
      { pos: { x: 1, y: 4 }, kind: "boulder" },
    ],
  ),

  // The Hollow Watch — 9x7. A ruined watchpost: a flagstone floor with four broken
  // pillars where the tower stood, the road running through what is left of it.
  "camp-b3-the-hollow-watch": parseTerrain(
    [
      "ggggggggg",
      "ggdrrrdgg",
      "gddrrrddg",
      "dddrrrddd",
      "gddrrrddg",
      "ggdrrrdgg",
      "ggggggggg",
    ],
    [
      { pos: { x: 3, y: 1 }, kind: "pillar" },
      { pos: { x: 5, y: 1 }, kind: "pillar" },
      { pos: { x: 3, y: 5 }, kind: "pillar" },
      { pos: { x: 5, y: 5 }, kind: "pillar" },
      { pos: { x: 1, y: 0 }, kind: "tree" },
      { pos: { x: 7, y: 6 }, kind: "tree" },
      { pos: { x: 7, y: 0 }, kind: "boulder" },
    ],
  ),

  // The Broken Span — 11x7. A plank deck two steps above a river, with the middle of
  // the span collapsed. THE WATER AND THE GAP ARE REAL (ADR-0031): those tiles are
  // `passable: false` in the encounter, so this is the one map where paint and rule
  // agree. The west abutment runs one row further than the east because a party member
  // starts at (0, 5); a unit standing on painted water is the defect that check exists
  // to catch.
  "camp-b4-the-broken-span": parseTerrain(
    [
      "wwwwwwwwwww",
      "wwwwwwwwwww",
      "rppppwppppr",
      "rpppppppppr",
      "rppppwppppr",
      "rwwwwwwwwww",
      "wwwwwwwwwww",
    ],
    [
      { pos: { x: 2, y: 2 }, kind: "pillar" },
      { pos: { x: 8, y: 4 }, kind: "pillar" },
      { pos: { x: 3, y: 3 }, kind: "boulder" },
    ],
  ),

  // The Warchief's Camp — 11x7. Ground trampled to dirt and sand around a plank floor,
  // with banner posts at its corners.
  "camp-b5-the-warchiefs-camp": parseTerrain(
    [
      "ggdddddddgg",
      "gddsssssddg",
      "ddsspppssdd",
      "ddsspppssdd",
      "ddsspppssdd",
      "gddsssssddg",
      "ggdddddddgg",
    ],
    [
      { pos: { x: 4, y: 1 }, kind: "pillar" },
      { pos: { x: 6, y: 1 }, kind: "pillar" },
      { pos: { x: 4, y: 5 }, kind: "pillar" },
      { pos: { x: 6, y: 5 }, kind: "pillar" },
      { pos: { x: 1, y: 0 }, kind: "tree" },
      { pos: { x: 9, y: 6 }, kind: "tree" },
      { pos: { x: 9, y: 0 }, kind: "boulder" },
    ],
  ),
});

/** The painted ground for a battle, or `undefined` where none is authored yet. */
export function terrainFor(encounterId: string): TerrainMap | undefined {
  return TERRAIN[encounterId];
}
