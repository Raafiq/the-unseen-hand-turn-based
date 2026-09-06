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
// The six approved portraits this slice bundles (ADR-0039). Ten were approved; the
// other four (archer-m, priest-m, thief-f, wizard-m) are NOT imported here on purpose —
// nothing in {@link PORTRAIT_BY_UNIT} names them, and the boot check below throws on
// bundled art nothing names. Their source PNGs wait in `docs/visual/portraits/reference/`.
import archerF from "../../data/campaign/story/portraits/archer-f.png";
import priestF from "../../data/campaign/story/portraits/priest-f.png";
import knightM from "../../data/campaign/story/portraits/knight-m.png";
import knightF from "../../data/campaign/story/portraits/knight-f.png";
import thiefM from "../../data/campaign/story/portraits/thief-m.png";
import wizardF from "../../data/campaign/story/portraits/wizard-f.png";
// The title screen's three photographic crops (docs/visual/concepts/README.md §e),
// imported the same way and for the same reason as the portraits above — so VITE
// resolves each to a hashed, `base`-aware URL instead of a hand-written relative path
// `index.html`'s static markup would have to get right for both the dev server and the
// Pages sub-path.
import titleCastle from "../../data/campaign/story/art/castle.webp";
import titleRibbon from "../../data/campaign/story/art/ribbon.webp";
import titleWatermark from "../../data/campaign/story/art/watermark.webp";
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
 * the pack — and {@link PORTRAIT_BY_UNIT} below — in both directions.
 */
export const PORTRAITS: Readonly<Record<string, string>> = Object.freeze({
  placeholder: placeholderPortrait,
  "archer-f": archerF,
  "priest-f": priestF,
  "knight-m": knightM,
  "knight-f": knightF,
  "thief-m": thiefM,
  "wizard-f": wizardF,
});

/** The title screen's bundled art (docs/visual/concepts/README.md §e), by name. */
export const TITLE_ART: Readonly<{ castle: string; ribbon: string; watermark: string }> =
  Object.freeze({ castle: titleCastle, ribbon: titleRibbon, watermark: titleWatermark });

/**
 * Unit id → portrait asset key (ADR-0039).
 *
 * WHY THIS IS A VIEWER TABLE, NOT AN ENGINE FIELD. Nothing in the game knows a
 * character's gender: the roster schema (`rosterSchemaVersion` 3) has no such field,
 * and `src/sim/state.ts` defaults every battle unit's zodiac to `gender: "neutral"`.
 * Shipping ten approved portraits (five jobs x two genders) means answering, per
 * character, which one a given unit shows — and the engine has no field to hold that
 * answer and does not need one. So the answer lives here instead, keyed by the same
 * unit ids the roster and the encounters already use.
 *
 * Only six of the ten approved keys are cut and bundled this slice (see the import
 * comment above `archerF`). `pc-vance` (geomancer) and `pc-kest` (monk) are deliberately
 * ABSENT from this table — those jobs are out of portrait scope — so `look()` in
 * `game.ts` falls back to `"placeholder"` for them, which is the honest answer.
 *
 * A dead row here (a key naming a retired unit id) is a silent no-op, not a render
 * error — the boot check below turns that into a loud one instead, so a renamed
 * roster entry cannot leave a row that reads as wired but resolves for nobody.
 */
export const PORTRAIT_BY_UNIT: Readonly<Record<string, string>> = Object.freeze({
  "pc-briar": "archer-f",
  "pc-ottoline": "priest-f",
  "foe-brigand": "knight-m",
  "foe-marauder": "knight-f",
  "foe-warchief": "knight-m",
  "foe-cutthroat": "thief-m",
  "foe-hexer": "wizard-f",
});

/**
 * The two-direction portrait check (ADR-0039), against the UNION of what the story
 * pack names and what {@link PORTRAIT_BY_UNIT} names — not the story pack alone.
 * `missing` is a key either one names with no file bundled behind it; `extra` is art
 * that shipped wired to nothing, which reads as done and is not. Exported so the shell
 * test can assert the same two-direction claim without re-deriving the union.
 *
 * Built ON TOP of the sim's own `portraitCoverage` (src/sim/story.ts) rather than
 * re-deriving the story-pack half by hand, so that export keeps a live production
 * caller instead of existing only for tests to exercise. `portraitCoverage` only knows
 * the STORY pack's named keys, so its `missing`/`extra` are patched here for
 * `PORTRAIT_BY_UNIT`'s values: a value the table names is not "extra" merely because no
 * story CHARACTER speaks as a Brigand, and a value the table names with no file bundled
 * behind it is still "missing".
 */
export function portraitArtCoverage(): { missing: string[]; extra: string[] } {
  const bundled = Object.keys(PORTRAITS);
  const bundledSet = new Set(bundled);
  const tableValues = new Set(Object.values(PORTRAIT_BY_UNIT));
  const base = portraitCoverage(story, bundled);
  const missing = new Set(base.missing);
  for (const key of tableValues) if (!bundledSet.has(key)) missing.add(key);
  const extra = base.extra.filter((key) => !tableValues.has(key));
  return { missing: [...missing].sort(), extra: [...extra].sort() };
}

/**
 * Mismatches between the scene player's story-pack `asset` and the unit card's
 * {@link PORTRAIT_BY_UNIT} entry, for every story character whose id — prefixed
 * `"pc-"` — names a roster unit. The scene player resolves art through `resolveBeat`
 * (src/sim/story.ts), reading the pack's own `asset` field; the unit card resolves it
 * through {@link resolvePortrait}, reading this table. Nothing previously tied the two
 * together, so a story character's `asset` could drift from the roster row's table
 * entry with neither side noticing — the same person would show different art on the
 * briefing than on their own unit card. An absent table row reads as `"placeholder"`,
 * matching `resolvePortrait`'s own fallback, so a job out of portrait scope (no row) is
 * not flagged as a mismatch as long as the pack also stays on `"placeholder"`.
 */
export function portraitLinkMismatches(): Array<{
  rosterId: string;
  storyAsset: string;
  tableAsset: string;
}> {
  const rosterIds = new Set([...campaign.party.map((r) => r.id), ...campaign.cast.map((r) => r.id)]);
  const mismatches: Array<{ rosterId: string; storyAsset: string; tableAsset: string }> = [];
  for (const c of story.characters) {
    const rosterId = `pc-${c.id}`;
    if (!rosterIds.has(rosterId)) continue;
    const storyAsset = c.portrait?.asset ?? "placeholder";
    const tableAsset = PORTRAIT_BY_UNIT[rosterId] ?? "placeholder";
    if (storyAsset !== tableAsset) mismatches.push({ rosterId, storyAsset, tableAsset });
  }
  return mismatches;
}

/** The one bundled fallback portrait. Resolved once so a missing key fails at boot. */
export const PORTRAIT_PLACEHOLDER: string = (() => {
  const url = PORTRAITS["placeholder"];
  if (url === undefined) throw new Error("no placeholder portrait is bundled");
  return url;
})();

/**
 * Portrait key + URL for a unit id (ADR-0039) — `PORTRAIT_BY_UNIT[id]`, or the bundled
 * `"placeholder"` for a unit the table names nothing for (today: `pc-vance`, `pc-kest`,
 * whose jobs are out of portrait scope).
 *
 * THE ONE PLACE THIS RESOLUTION HAPPENS. `game.ts`'s `look()` calls this rather than
 * indexing the two tables itself, so there is exactly one function to A/B-test and no
 * second caller that could disagree with it about what a unit id resolves to.
 */
export function resolvePortrait(unitId: string): { key: string; url: string } {
  const key = PORTRAIT_BY_UNIT[unitId] ?? "placeholder";
  const url = PORTRAITS[key] ?? PORTRAIT_PLACEHOLDER;
  return { key, url };
}

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
  // Both directions again, against the UNION of the story pack's named keys and
  // PORTRAIT_BY_UNIT's values (ADR-0039) — a named-but-unbundled key would render a
  // broken image, and a bundled-but-unnamed one is art that shipped wired to nothing
  // and reads as done. Checking the pack alone would flag every enemy portrait as
  // "unused" the moment it is bundled, because no story character speaks as a Brigand.
  const art = portraitArtCoverage();
  if (art.missing.length > 0 || art.extra.length > 0) {
    throw new Error(
      `story pack / portrait table and bundled portraits disagree — no asset for ` +
        `[${art.missing.join(", ")}], unused art [${art.extra.join(", ")}]`,
    );
  }
  // PORTRAIT_BY_UNIT's keys must be real roster ids, loudly, so a renamed or retired
  // character leaves a dead row that FAILS instead of one that silently never resolves
  // (a risk this ADR names explicitly).
  const rosterIds = new Set([...campaign.party.map((r) => r.id), ...campaign.cast.map((r) => r.id)]);
  const staleTableIds = Object.keys(PORTRAIT_BY_UNIT).filter((id) => !rosterIds.has(id));
  if (staleTableIds.length > 0) {
    throw new Error(
      `PORTRAIT_BY_UNIT names unit ids the campaign roster does not have: ` +
        `[${staleTableIds.join(", ")}]`,
    );
  }
  // The scene player and the unit card resolve portraits through two separate paths
  // (story-pack `asset` vs PORTRAIT_BY_UNIT) that nothing previously tied together —
  // see portraitLinkMismatches's doc comment.
  const linkMismatches = portraitLinkMismatches();
  if (linkMismatches.length > 0) {
    throw new Error(
      `story pack and PORTRAIT_BY_UNIT disagree on portrait for ` +
        linkMismatches
          .map((m) => `${m.rosterId} (story "${m.storyAsset}" vs table "${m.tableAsset}")`)
          .join(", "),
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
 * **This is presentation and nothing else.** No entry here reaches `BattleState`; the
 * sim's `passable` is the only answer to "may I stand there".
 *
 * WHETHER IT WAS ASKED IS NOW PER-MAP (ADR-0031). `camp-b4-the-broken-span` authors real
 * `passable: false` tiles in its encounter file, so its river and its gap block movement
 * and the paint below is honest. The other four maps author no tiles at all, so their
 * water is decorative and a unit wades through it — battle 2's ford is the live example.
 * An earlier version of this comment said flatly that "the sim was not asked"; that has
 * been false since ADR-0031. See `terrain.ts`, and note that making water block needs no
 * schema change — it is authored encounter data.
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
