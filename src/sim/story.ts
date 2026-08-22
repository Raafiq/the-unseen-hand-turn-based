/**
 * The story seam (docs/11 M0 item 4, AC-M4) — the `docs/08` §4 data contract for the
 * text a player reads AROUND a battle, kept as far from the engine as a schema can be.
 *
 * WHY A SCHEMA LIVES IN THE ENGINE WHEN THE PROSE MUST NOT. CLAUDE.md's rule is that
 * this repo carries no narrative CONTENT; `docs/08` §4 is the promise that a separate
 * story repo can add content with **no engine change**. Those two only hold together if
 * the engine owns the shape and nothing else — so this file has a Zod schema, a parse
 * and a lookup, and not one authored word. The prose ships as data
 * (`data/campaign/story/*.story.json`), which is what makes AC-M4's discriminator an
 * A/B: swap the pack and what the player reads changes, with no code change at all.
 *
 * SEPARATE CODEC (the `campaign.ts` precedent): its own {@link STORY_SCHEMA_VERSION},
 * independent of the campaign, battle, roster, encounter and content version lines. A
 * story-shape change never forces a save migration, and a save migration never
 * invalidates a story pack.
 *
 * PURE + no IO + no RNG + no wall-clock, like every other module here: the caller hands
 * over already-parsed JSON.
 *
 * WHAT THIS DELIBERATELY DOES NOT MODEL. `docs/08` §4 names "pre/mid/post-battle events
 * hooks". Only PRE and POST are here. A mid-battle hook needs an event system to fire
 * it — a trigger, a point in the resolution pipeline, a way to pause a turn — and none
 * of that exists. Shipping a `mid` field nothing can deliver would be a spec with no
 * test: it would read as governing while governing nothing. When the event system lands,
 * that is a version bump and a migration, which is exactly what the version line is for.
 *
 * The post-battle beat SPLITS BY OUTCOME (`victory` / `defeat`) rather than being one
 * "after" string, because a shell that read the same line out after a win and a loss
 * would look identical to one with no outcome branch at all — and the campaign already
 * distinguishes the two (AC-M3).
 */

import { z } from "zod";

/** Current on-disk story-pack schema version. Bump when a shape below changes. */
export const STORY_SCHEMA_VERSION = 1;

/**
 * When a beat is shown. `pre` is the briefing, before deploy; `victory` and `defeat`
 * are the after-battle screen, chosen by what actually happened.
 */
export const StoryMomentSchema = z.enum(["pre", "victory", "defeat"]);
export type StoryMoment = z.infer<typeof StoryMomentSchema>;

/** Every moment, in the order a single attempt at a battle can reach them. */
export const STORY_MOMENTS: readonly StoryMoment[] = ["pre", "victory", "defeat"];

/**
 * One block of text. `lines` rather than one string because the shell renders
 * paragraphs and must not be in the business of splitting prose on newlines — a
 * presentation rule hiding in a parser. `speaker` is optional and is a plain label;
 * the engine never resolves it against a unit record, so the story repo can name
 * someone this build has never heard of.
 */
export const StoryBeatSchema = z
  .object({
    speaker: z.string().min(1).optional(),
    lines: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type StoryBeat = z.infer<typeof StoryBeatSchema>;

/**
 * The beats for one battle, keyed by the CAMPAIGN battle id (`b1`), not the encounter
 * id. A campaign is free to field the same encounter twice; the story around the second
 * time is a different scene, and keying on the encounter would silently merge them.
 *
 * Every moment is optional: a battle with no text is a legitimate authored choice, and
 * an absent beat must read as absent rather than as an empty screen (the viewer's
 * absent-not-zero rule).
 */
export const StoryEntrySchema = z
  .object({
    battleId: z.string().min(1),
    /**
     * The scene's name, shown on the briefing. Optional and authored HERE rather than
     * derived from the encounter id, because de-kebabing `camp-b2-ambush-at-the-ford`
     * is a naming convention masquerading as a title — it cannot say "The Ford, Again"
     * on a second visit, and it forces the file name to carry prose. The caller falls
     * back to its own derivation when a pack does not author one.
     */
    title: z.string().min(1).optional(),
    pre: StoryBeatSchema.optional(),
    victory: StoryBeatSchema.optional(),
    defeat: StoryBeatSchema.optional(),
  })
  .strict();
export type StoryEntry = z.infer<typeof StoryEntrySchema>;

/**
 * A story pack: every beat for one campaign. `campaignId` is checked by the caller
 * against the campaign it is paired with, the same way a save is — a pack authored for
 * a different campaign whose battle ids happen to collide would otherwise load cleanly
 * and narrate the wrong story.
 */
export const StoryPackSchema = z
  .object({
    storySchemaVersion: z.number().int(),
    campaignId: z.string().min(1),
    entries: z.array(StoryEntrySchema),
  })
  .strict()
  .refine((p) => new Set(p.entries.map((e) => e.battleId)).size === p.entries.length, {
    // A duplicate would shadow one entry in the lookup map and quietly drop a scene.
    message: "story entry battleIds must be unique",
    path: ["entries"],
  });
export type StoryPack = z.infer<typeof StoryPackSchema>;

/** Thrown when a story pack's version is missing or unsupported. */
export class StorySchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorySchemaVersionError";
  }
}

/** A story migration transforms a parsed pack one schema version forward. */
export type StoryMigration = (pack: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration registry: `STORY_MIGRATIONS[v]` upgrades a pack from version `v` to `v + 1`.
 * Empty at v1 (no prior versions); every future bump registers here — the
 * migration-per-bump pattern the campaign, roster, content and battle codecs use.
 */
export const STORY_MIGRATIONS: Readonly<Record<number, StoryMigration>> = {};

/**
 * Parse + validate an authored story pack. Loud fail on a missing or unsupported
 * version, mirroring {@link parseCampaign} — a story pack that loaded PARTIALLY would
 * put half a scene on screen and look like an authoring gap.
 */
export function parseStoryPack(pack: unknown): StoryPack {
  if (typeof pack !== "object" || pack === null || Array.isArray(pack)) {
    throw new StorySchemaVersionError("a story pack must be a JSON object");
  }
  const version = (pack as Record<string, unknown>)["storySchemaVersion"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new StorySchemaVersionError("story pack is missing an integer storySchemaVersion");
  }
  if (version !== STORY_SCHEMA_VERSION) {
    throw new StorySchemaVersionError(
      `story schemaVersion ${version} is not supported by this build (${STORY_SCHEMA_VERSION})`,
    );
  }
  return StoryPackSchema.parse(pack);
}

/**
 * The beat for one battle at one moment, or `null` when the pack does not author it.
 *
 * `null`, never an empty beat: the caller must be able to tell "there is nothing to say
 * here" from "there is a scene here and it is blank", because only the first is a
 * legitimate authored choice and only the second is a content bug.
 */
export function storyBeat(
  pack: StoryPack,
  battleId: string,
  moment: StoryMoment,
): StoryBeat | null {
  return storyEntry(pack, battleId)?.[moment] ?? null;
}

/** Everything the pack authors for one battle, or `null` when it authors nothing. */
export function storyEntry(pack: StoryPack, battleId: string): StoryEntry | null {
  return pack.entries.find((e) => e.battleId === battleId) ?? null;
}

/**
 * Which battles the pack and the campaign disagree about — `missing` are battles the
 * campaign plays with no entry at all, `extra` are entries naming a battle the campaign
 * does not contain.
 *
 * A TWO-DIRECTION partition, for the reason CLAUDE.md gives: a coverage check that only
 * looked for `missing` would go green on a pack full of stale entries for battles that
 * were renamed away, and one that only looked for `extra` would go green on a pack
 * covering four of five battles. Returned rather than thrown, because a partial pack is
 * a perfectly reasonable thing to hold mid-authoring — it is SHIPPING one that is the
 * error, and that judgement belongs to the test and the bundler, not to a lookup.
 */
export function storyCoverage(
  battleIds: readonly string[],
  pack: StoryPack,
): { missing: string[]; extra: string[] } {
  const authored = new Set(pack.entries.map((e) => e.battleId));
  const played = new Set(battleIds);
  return {
    missing: battleIds.filter((id) => !authored.has(id)),
    extra: pack.entries.map((e) => e.battleId).filter((id) => !played.has(id)),
  };
}
