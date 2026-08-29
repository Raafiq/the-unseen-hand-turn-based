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
export const STORY_SCHEMA_VERSION = 2;

/**
 * Oldest `storySchemaVersion` this build still knows how to migrate forward.
 *
 * Honest on arrival: this equals the oldest version that has ever existed, so today it
 * refuses nothing — exactly the state {@link MIN_SUPPORTED_CAMPAIGN_SCHEMA_VERSION}
 * shipped in. It exists so the walk below has the same four branches as the roster and
 * campaign codecs; a copy of that loop missing a branch is a copy that has silently
 * diverged from the pattern the other three codecs teach.
 */
export const MIN_SUPPORTED_STORY_SCHEMA_VERSION = 1;

/**
 * When a beat is shown. `pre` is the briefing, before deploy; `victory` and `defeat`
 * are the after-battle screen, chosen by what actually happened.
 */
export const StoryMomentSchema = z.enum(["pre", "victory", "defeat"]);
export type StoryMoment = z.infer<typeof StoryMomentSchema>;

/** Every moment, in the order a single attempt at a battle can reach them. */
export const STORY_MOMENTS: readonly StoryMoment[] = ["pre", "victory", "defeat"];

/**
 * One expression of one character, as an ASSET KEY — never a path, never a URL.
 *
 * The engine does not know where art lives. A key is resolved by whoever owns the
 * bundle (`src/render/campaign-data.ts`), which is what lets the Pages base path stay
 * the bundler's problem instead of a convention every future author must remember.
 */
export const PortraitVariantSchema = z
  .object({
    expression: z.string().min(1),
    asset: z.string().min(1),
  })
  .strict();
export type PortraitVariant = z.infer<typeof PortraitVariantSchema>;

/**
 * A character's art. `asset` is what shows when a line names no expression — called
 * `asset` and not `neutral` deliberately, because the engine does not get to imply a
 * mood the pack did not author.
 */
export const PortraitSchema = z
  .object({
    asset: z.string().min(1),
    variants: z.array(PortraitVariantSchema).min(1).optional(),
  })
  .strict()
  .refine(
    (p) => !p.variants || new Set(p.variants.map((v) => v.expression)).size === p.variants.length,
    { message: "portrait expression ids must be unique", path: ["variants"] },
  );
export type Portrait = z.infer<typeof PortraitSchema>;

/**
 * Someone who can speak: an identity, a name plate, and optionally some art.
 *
 * THIS IS NOT A UNIT RECORD, and the distinction is load-bearing. `docs/08` §4 also
 * mentions "unique-character references (which resolve to `docs/02` B6 premium chassis
 * units)" — that is a different, unbuilt thing. `Character.id` lives in the PACK's
 * namespace and is deliberately not joined to `pc-vance` (a campaign record id) or
 * `blue-vance` (an encounter slot id). v1's docstring made the same promise about the
 * old free-text `speaker` label, and it is kept: the story repo can name someone this
 * build has never heard of, and nothing here will try to find them in a roster.
 *
 * No `bio` or `description`: prose with no screen to show it on is a spec with no test.
 */
export const CharacterSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    portrait: PortraitSchema.optional(),
  })
  .strict();
export type Character = z.infer<typeof CharacterSchema>;

/**
 * One spoken or narrated line.
 *
 * `speaker` is a CHARACTER ID, resolved against the pack's registry at PARSE time (see
 * {@link StoryPackSchema}). Absent means narration: no plate, no portrait. That is the
 * whole reason attribution moved down here from the beat — one mechanism, not a
 * `line → beat → nothing` chain whose middle rung no test can observe.
 */
export const StoryLineSchema = z
  .object({
    speaker: z.string().min(1).optional(),
    expression: z.string().min(1).optional(),
    text: z.string().min(1),
  })
  .strict();
export type StoryLine = z.infer<typeof StoryLineSchema>;

/**
 * One block of text. `lines` rather than one string because the shell renders
 * paragraphs and must not be in the business of splitting prose on newlines — a
 * presentation rule hiding in a parser.
 *
 * Still an OBJECT wrapping `lines` rather than a bare array, so the next field this
 * needs is an additive change instead of another version bump.
 */
export const StoryBeatSchema = z
  .object({
    lines: z.array(StoryLineSchema).min(1),
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
 * Where a standalone scene sits in a run.
 *
 * TWO anchors, and the omission is deliberate. `before-battle` covers the prologue
 * (before the first battle) and every interlude; `campaign-end` covers the epilogue.
 *
 * There is no `after-battle`, for the reason `mid` is still absent below: that
 * transition ALREADY carries an outcome-split beat (`victory`/`defeat`), so a scene
 * there would have to branch on the outcome and on whether this was a retry, and for a
 * player who simply continues, "after b3" and "before b4" are the same moment. The one
 * case where they differ is quitting to the title in between. That is the stated cost,
 * and it is smaller than a second anchor nobody can describe the rule for.
 */
export const SceneAnchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("before-battle"), battleId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("campaign-end") }).strict(),
]);
export type SceneAnchor = z.infer<typeof SceneAnchorSchema>;

/**
 * A scene that belongs to no battle — a prologue, an interlude, an epilogue.
 *
 * Keyed by its own `id` rather than by its anchor, because the id is what the save
 * records as seen, and an anchor can move while the scene stays the same scene.
 */
export const StorySceneSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    at: SceneAnchorSchema,
    beat: StoryBeatSchema,
  })
  .strict();
export type StoryScene = z.infer<typeof StorySceneSchema>;

/** Every place a beat can hide in a pack. One walker, so a refinement cannot skip one. */
function* eachBeat(p: {
  entries: readonly StoryEntry[];
  scenes: readonly StoryScene[];
}): Generator<StoryBeat> {
  for (const entry of p.entries) {
    for (const moment of STORY_MOMENTS) {
      const beat = entry[moment];
      if (beat) yield beat;
    }
  }
  for (const scene of p.scenes) yield scene.beat;
}

/** The anchor as a comparable string, so "one scene per anchor" is a set check. */
function anchorKey(at: SceneAnchor): string {
  return at.kind === "before-battle" ? `before-battle:${at.battleId}` : "campaign-end";
}

/**
 * A story pack: every beat for one campaign. `campaignId` is checked by the caller
 * against the campaign it is paired with, the same way a save is — a pack authored for
 * a different campaign whose battle ids happen to collide would otherwise load cleanly
 * and narrate the wrong story.
 *
 * EVERY REFERENCE RESOLVES HERE, AT PARSE TIME. A pack naming a speaker or an
 * expression that does not exist does not parse. That is what lets the render layer
 * hold no character lookup at all — and `src/render/CLAUDE.md` records why that
 * matters: a content-keyed lookup with a fallback cannot tell "no entry" from "no
 * match", and the last one painted every unit in the shipped game the same colour with
 * 720 tests green. The fix is not a better fallback; it is having nothing to fall back
 * from.
 */
export const StoryPackSchema = z
  .object({
    storySchemaVersion: z.number().int(),
    campaignId: z.string().min(1),
    /**
     * An array, not a record. A duplicate id in an object literal silently keeps the
     * last one; an array lets the check below say so out loud — the same reasoning
     * `CampaignDefSchema` uses for its party/cast id uniqueness refinement.
     */
    characters: z.array(CharacterSchema),
    entries: z.array(StoryEntrySchema),
    scenes: z.array(StorySceneSchema),
  })
  .strict()
  .superRefine((p, ctx) => {
    const dup = (n: string, path: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: n, path: [path] });

    // A duplicate would shadow one entry in the lookup and quietly drop a scene.
    if (new Set(p.entries.map((e) => e.battleId)).size !== p.entries.length) {
      dup("story entry battleIds must be unique", "entries");
    }
    if (new Set(p.characters.map((c) => c.id)).size !== p.characters.length) {
      dup("character ids must be unique", "characters");
    }
    if (new Set(p.scenes.map((s) => s.id)).size !== p.scenes.length) {
      dup("scene ids must be unique", "scenes");
    }
    // At most one scene per anchor, so the shell never needs a scene QUEUE: one scene
    // holds a whole conversation, and "which of the two plays first" is a rule nobody
    // has written down.
    if (new Set(p.scenes.map((s) => anchorKey(s.at))).size !== p.scenes.length) {
      dup("at most one scene may be anchored at each point", "scenes");
    }

    const byId = new Map(p.characters.map((c) => [c.id, c]));
    for (const beat of eachBeat(p)) {
      for (const line of beat.lines) {
        if (line.expression !== undefined && line.speaker === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `a line names expression '${line.expression}' with no speaker`,
            path: ["entries"],
          });
          continue;
        }
        if (line.speaker === undefined) continue;
        const who = byId.get(line.speaker);
        if (!who) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `a line names speaker '${line.speaker}', which is not in characters`,
            path: ["characters"],
          });
          continue;
        }
        if (line.expression === undefined) continue;
        const has = who.portrait?.variants?.some((v) => v.expression === line.expression);
        if (!has) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              `'${who.id}' has no portrait variant '${line.expression}'`,
            path: ["characters"],
          });
        }
      }
    }
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
 * v1 → v2: attribution moves from the beat down onto each line, and the speaker labels
 * v1 wrote as free text become the pack's character registry.
 *
 * Every choice here is the conservative one, and each is conservative for a reason:
 *
 * - **The id is the v1 label, VERBATIM.** No slugify, no case-folding. The identity
 *   function cannot invent a naming convention the engine then owns forever, and it
 *   introduces no collision failure mode ("Vance" vs "vance") that a migration would
 *   have to resolve silently.
 * - **The speaker is pushed onto EVERY line**, not kept as a beat-level default. One
 *   attribution mechanism. The v1 *look* is preserved by the renderer collapsing
 *   consecutive same-speaker lines into one plate — which is the property the migration
 *   test asserts, rather than "the fields look similar".
 * - **`scenes: []`**, not a back-filled scene. A v1 pack authored no standalone scenes,
 *   and inventing one hands the reader content nobody wrote (the same reasoning
 *   `migrateCampaign2to3` gives for an empty inventory).
 * - **No `portrait` key.** A v1 pack has no art; asserting a placeholder would be the
 *   engine authoring content. Absent, not zero.
 *
 * Defensive on shape throughout: an unrecognised value is passed through UNTOUCHED, so
 * a malformed v1 pack fails as a Zod error naming the offending field rather than as a
 * `TypeError` thrown from inside the migration, where the message would name this file
 * instead of the data.
 */
const migrateStory1to2: StoryMigration = (pack) => {
  const labels: string[] = [];

  const line = (raw: unknown, speaker: unknown): unknown => {
    if (typeof raw !== "string") return raw;
    return typeof speaker === "string" && speaker.length > 0 ? { speaker, text: raw } : { text: raw };
  };

  const beat = (raw: unknown): unknown => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
    const b = raw as Record<string, unknown>;
    if (!Array.isArray(b["lines"])) return raw;
    const speaker = b["speaker"];
    if (typeof speaker === "string" && speaker.length > 0 && !labels.includes(speaker)) {
      labels.push(speaker); // first-appearance order, so the registry reads like the story
    }
    return { lines: b["lines"].map((l) => line(l, speaker)) };
  };

  const entries = Array.isArray(pack["entries"])
    ? pack["entries"].map((raw) => {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
        const e = { ...(raw as Record<string, unknown>) };
        for (const moment of STORY_MOMENTS) {
          if (e[moment] !== undefined) e[moment] = beat(e[moment]);
        }
        return e;
      })
    : pack["entries"];

  return {
    ...pack,
    storySchemaVersion: 2,
    entries,
    characters: labels.map((l) => ({ id: l, name: l })),
    scenes: [],
  };
};

/**
 * Migration registry: `STORY_MIGRATIONS[v]` upgrades a pack from version `v` to `v + 1`.
 * The migration-per-bump pattern the campaign, roster, content and battle codecs use.
 */
export const STORY_MIGRATIONS: Readonly<Record<number, StoryMigration>> = {
  1: migrateStory1to2,
};

/**
 * Parse + validate an authored story pack, migrating an older one forward first. Loud
 * fail on a missing or unsupported version — a story pack that loaded PARTIALLY would
 * put half a scene on screen and look like an authoring gap.
 *
 * DELIBERATE DIVERGENCE FROM `parseCampaign`, which is exact-match and leaves migration
 * to `deserializeCampaign`. A campaign definition lives in THIS repo, so an old one is
 * a mistake. A story pack is contracted to arrive from a separate repo on its own
 * release cadence (`docs/08` §4, `docs/11` AC-M4), so refusing an older-but-migratable
 * pack would break the "no engine change needed" promise in the other direction: the
 * story repo would have to ship in lockstep with this one. Hence the walk lives here.
 */
export function parseStoryPack(pack: unknown): StoryPack {
  if (typeof pack !== "object" || pack === null || Array.isArray(pack)) {
    throw new StorySchemaVersionError("a story pack must be a JSON object");
  }
  let obj = pack as Record<string, unknown>;
  const version = obj["storySchemaVersion"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new StorySchemaVersionError("story pack is missing an integer storySchemaVersion");
  }
  if (version > STORY_SCHEMA_VERSION) {
    throw new StorySchemaVersionError(
      `story schemaVersion ${version} is newer than this build supports ` +
        `(${STORY_SCHEMA_VERSION}); update the game`,
    );
  }
  if (version < MIN_SUPPORTED_STORY_SCHEMA_VERSION) {
    throw new StorySchemaVersionError(
      `story schemaVersion ${version} is older than the minimum supported ` +
        `(${MIN_SUPPORTED_STORY_SCHEMA_VERSION})`,
    );
  }
  for (let v = version; v < STORY_SCHEMA_VERSION; v++) {
    const migrate = STORY_MIGRATIONS[v];
    if (!migrate) {
      // Unreachable while the registry is dense. It is the tripwire for the day someone
      // bumps STORY_SCHEMA_VERSION and forgets to register the migration.
      throw new StorySchemaVersionError(
        `no story migration registered from schemaVersion ${v} to ${v + 1}`,
      );
    }
    obj = migrate(obj);
  }
  // Validate AFTER migrating: a migration that produces a bad shape must fail here, not
  // be trusted because its input parsed.
  return StoryPackSchema.parse(obj);
}

/**
 * One line, with everything the renderer needs already looked up.
 *
 * `who: Character | null` and `portrait: string | null` are NULLABLE, not optional, on
 * purpose. `exactOptionalPropertyTypes` is on, and an absent key would let the render
 * layer treat "narration" and "we could not find them" as the same shape — which is the
 * ambiguity {@link StoryPackSchema} exists to make unrepresentable. `null` here means
 * narration, and nothing else, because a missing character cannot survive the parse.
 */
export interface ResolvedLine {
  text: string;
  /** `null` = narration. Never "a character we failed to find". */
  who: Character | null;
  /** The asset key to show, already chosen. `null` = this character authored no art. */
  portrait: string | null;
}

/**
 * Resolve a beat's speakers and portraits against the pack.
 *
 * This is the ONLY place a character id is looked up, and it lives in the sim rather
 * than the render layer so the page never holds a keyed table it could miss against.
 * There is no fallback branch because there is no miss to fall back from: the parse
 * already rejected any unresolvable reference.
 */
export function resolveBeat(pack: StoryPack, beat: StoryBeat): ResolvedLine[] {
  const byId = new Map(pack.characters.map((c) => [c.id, c]));
  return beat.lines.map((line) => {
    const who = line.speaker === undefined ? null : (byId.get(line.speaker) ?? null);
    const portrait =
      who?.portrait === undefined
        ? null
        : line.expression === undefined
          ? who.portrait.asset
          : (who.portrait.variants?.find((v) => v.expression === line.expression)?.asset ??
            who.portrait.asset);
    return { text: line.text, who, portrait };
  });
}

/** The scene anchored at a point, or `null`. At most one can exist (enforced at parse). */
export function sceneAt(pack: StoryPack, at: SceneAnchor): StoryScene | null {
  const key = anchorKey(at);
  return pack.scenes.find((s) => anchorKey(s.at) === key) ?? null;
}

/**
 * Which asset keys the pack and the bundle disagree about.
 *
 * BOTH directions, and each catches a different real mistake. `missing` is a key the
 * pack names with no bundled asset behind it — a typo, or a forgotten import line, which
 * is exactly the failure mode the hand-written encounter imports already guard against.
 * `extra` is art that shipped and is wired to nothing, which reads as done and is not.
 *
 * Returned rather than thrown, like {@link storyCoverage}: a half-wired pack is a
 * reasonable thing to hold mid-authoring, and judging it belongs to the caller.
 */
export function portraitCoverage(
  pack: StoryPack,
  assetKeys: readonly string[],
): { missing: string[]; extra: string[] } {
  const named = portraitAssets(pack);
  const bundled = new Set(assetKeys);
  const namedSet = new Set(named);
  return {
    missing: named.filter((k) => !bundled.has(k)),
    extra: [...assetKeys].filter((k) => !namedSet.has(k)).sort(),
  };
}

/** Every asset key the pack names, so a bundle can be checked against it. */
export function portraitAssets(pack: StoryPack): string[] {
  const keys = new Set<string>();
  for (const c of pack.characters) {
    if (!c.portrait) continue;
    keys.add(c.portrait.asset);
    for (const v of c.portrait.variants ?? []) keys.add(v.asset);
  }
  return [...keys].sort();
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
): { missing: string[]; extra: string[]; orphanScenes: string[] } {
  const authored = new Set(pack.entries.map((e) => e.battleId));
  const played = new Set(battleIds);
  return {
    missing: battleIds.filter((id) => !authored.has(id)),
    extra: pack.entries.map((e) => e.battleId).filter((id) => !played.has(id)),
    // ASYMMETRIC, and the asymmetry is the point. An entry per battle is the pack's
    // contract, so both directions are errors. An interlude per battle is NOT a
    // contract — a campaign with scenes before only two of five battles is perfectly
    // well authored — so only the orphan direction exists here. A battle with no scene
    // is deliberately not reported.
    //
    // One function rather than a second `sceneCoverage()`, because a second function is
    // one the boot check can forget to call, which is exactly the one-direction gap
    // this partition was written against.
    orphanScenes: pack.scenes
      .filter((s) => s.at.kind === "before-battle" && !played.has(s.at.battleId))
      .map((s) => s.id),
  };
}
