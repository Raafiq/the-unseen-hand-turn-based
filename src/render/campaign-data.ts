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
import {
  loadContentPack,
  parseCampaign,
  parseStoryPack,
  storyCoverage,
  type CampaignDef,
  type ContentRegistry,
  type EncounterMap,
  type StoryPack,
} from "../sim/index.js";

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
