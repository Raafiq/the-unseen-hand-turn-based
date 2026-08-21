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
import b1 from "../../data/campaign/encounters/camp-b1-the-toll-road.json" with { type: "json" };
import b2 from "../../data/campaign/encounters/camp-b2-ambush-at-the-ford.json" with { type: "json" };
import b3 from "../../data/campaign/encounters/camp-b3-the-hollow-watch.json" with { type: "json" };
import b4 from "../../data/campaign/encounters/camp-b4-the-broken-span.json" with { type: "json" };
import b5 from "../../data/campaign/encounters/camp-b5-the-warchiefs-camp.json" with { type: "json" };
import pack from "../../data/base-pack.json" with { type: "json" };
import {
  loadContentPack,
  parseCampaign,
  type CampaignDef,
  type ContentRegistry,
  type EncounterMap,
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

/** Display name and battle order for the current step, for the briefing screen. */
export function battleTitle(encounterId: string): string {
  // Derived from the id rather than authored: story text is a LATER M0 slice
  // (docs/11 item 4) with its own data contract, and inventing prose here would put
  // narrative content in the engine, which CLAUDE.md forbids.
  return encounterId
    .replace(/^camp-b\d+-/, "")
    .split("-")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}
