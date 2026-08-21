/**
 * Campaign container + persistence (docs/11 M0 items 1–2, AC-M1/AC-M2/AC-M3) — the
 * durable record that outlives a single BATTLE the way {@link UnitRecord} outlives a
 * single turn. A campaign is an ordered list of authored battles plus the party that
 * carries across them; a {@link CampaignSave} is where that party's progress lives
 * between them.
 *
 * SEPARATE CODEC (ADR-0011 precedent): this file owns its OWN version line,
 * {@link CAMPAIGN_SCHEMA_VERSION}, independent of the battle `SCHEMA_VERSION`
 * (state.ts), the roster `ROSTER_SCHEMA_VERSION` (roster.ts), the content
 * `CONTENT_SCHEMA_VERSION` and the encounter line. A campaign-shape change never
 * forces a battle-save, roster or content migration, and vice versa. Version
 * handling mirrors `roster.ts:deserializeRecord` — loud fail on an unsupported
 * version, forward migrations per bump, never a silent/partial load.
 *
 * PURE + no IO + no RNG + no wall-clock: nothing here reads a file, draws from the
 * PRNG or looks at a clock. Callers pass already-parsed JSON and receive plain
 * strings, exactly as `loadContentPack` and `parseEncounter` do. The headless
 * playthrough that actually FIGHTS the battles lives in `campaign-run.ts`; this file
 * only holds the shape and the state transitions, so the transitions stay testable
 * without running a battle.
 *
 * NARRATIVE-AGNOSTIC (CLAUDE.md): a {@link CampaignDef} references its battles by
 * ENCOUNTER ID only. It carries no prose, no dialogue and no story hooks — the
 * `docs/08` §4 story seam is a later M0 slice and lands as its own data, not as
 * fields bolted onto this schema.
 *
 * WHAT IS PERSISTED, AND WHAT DELIBERATELY IS NOT. The save stores {@link UnitRecord}s,
 * whose `raw.hp` is a MAXIMUM, not a current value. Battle HP lives on `UnitState` and
 * dies with the battle. That is the whole implementation of docs/11's "HP restored
 * between battles" and of M0's no-permadeath cut — a party member who ended a battle at
 * 3 HP, or KO'd, redeploys at full. It is asserted in `campaign.test.ts` rather than
 * assumed, because a persistence layer that quietly dropped the party's progress would
 * look exactly the same from here.
 */

import { z } from "zod";
import type { Outcome } from "./condition.js";
import { awardAp, type ApReward } from "./progression.js";
import { UnitRecordSchema, type UnitRecord } from "./roster.js";

/** Current on-disk campaign schema version. Bump when a shape below changes. */
export const CAMPAIGN_SCHEMA_VERSION = 1;

/** Oldest campaignSchemaVersion we still know how to migrate forward. */
export const MIN_SUPPORTED_CAMPAIGN_SCHEMA_VERSION = 1;

const IntSchema = z.number().int();

/**
 * One step of the authored sequence. `encounterId` is resolved by the CALLER against
 * its own encounter map — this module never reads a file, so a campaign def can be
 * validated with no encounter data present at all.
 */
export const CampaignBattleSchema = z
  .object({
    id: z.string().min(1),
    encounterId: z.string().min(1),
  })
  .strict();
export type CampaignBattle = z.infer<typeof CampaignBattleSchema>;

/**
 * The authored campaign (docs/11 M0 item 1). `party` is the STARTING party — the
 * records a new game begins with; the save owns them from then on. `cast` is every
 * NON-party record the campaign's encounters reference by `ref` (enemies, guests), kept
 * here rather than inline in each encounter so that "every unit this campaign fields"
 * is enumerable from ONE place — the TTK band check reads exactly this list, and a
 * roster nothing enumerates is the documented repeat failure (CLAUDE.md).
 */
export const CampaignDefSchema = z
  .object({
    campaignSchemaVersion: IntSchema,
    id: z.string().min(1),
    title: z.string().min(1),
    /** Which team the human plays. Every battle's `victory` is authored from its seat. */
    playerTeam: IntSchema.min(0),
    party: z.array(UnitRecordSchema).min(1),
    cast: z.array(UnitRecordSchema),
    battles: z.array(CampaignBattleSchema).min(1),
  })
  .strict()
  .refine((d) => new Set(d.battles.map((b) => b.id)).size === d.battles.length, {
    message: "campaign battle ids must be unique",
    path: ["battles"],
  })
  .refine(
    (d) => {
      const ids = [...d.party.map((r) => r.id), ...d.cast.map((r) => r.id)];
      return new Set(ids).size === ids.length;
    },
    {
      // A duplicate id would silently shadow one record in the resolver's map, and the
      // wrong unit would deploy — a content bug that looks like a balance problem.
      message: "party and cast record ids must be unique across both lists",
      path: ["cast"],
    },
  );
export type CampaignDef = z.infer<typeof CampaignDefSchema>;

/**
 * How the campaign stands. `in-progress` — a battle is pending at `battleIndex`.
 * `gameOver` — the battle at `battleIndex` was lost and the player must retry it
 * (AC-M3; the party is still the PRE-battle party, so retry is exact). `completed` —
 * every authored battle was won.
 */
export const CampaignStatusSchema = z.enum(["in-progress", "gameOver", "completed"]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

/** One resolved battle, oldest first — what happened, not how it looked. */
export const CampaignHistoryEntrySchema = z
  .object({
    battleId: z.string().min(1),
    outcome: z.enum(["victory", "defeat", "draw", "stalemate", "timeout"]),
  })
  .strict();
export type CampaignHistoryEntry = z.infer<typeof CampaignHistoryEntrySchema>;

/**
 * The save file (docs/11 M0 item 2, AC-M2). `battleIndex` points at the NEXT battle to
 * play (or, on `gameOver`, the one to retry); on `completed` it equals
 * `def.battles.length`. `party` is the live party — the ONLY place a unit's banked AP
 * and learned abilities live once a campaign starts.
 */
export const CampaignSaveSchema = z
  .object({
    campaignSchemaVersion: IntSchema,
    campaignId: z.string().min(1),
    battleIndex: IntSchema.min(0),
    status: CampaignStatusSchema,
    party: z.array(UnitRecordSchema).min(1),
    history: z.array(CampaignHistoryEntrySchema),
  })
  .strict();
export type CampaignSave = z.infer<typeof CampaignSaveSchema>;

/** Thrown when a serialized campaign save's version is missing or unsupported. */
export class CampaignSchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignSchemaVersionError";
  }
}

/** A campaign migration transforms a parsed save one schema version forward. */
export type CampaignMigration = (save: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration registry: `CAMPAIGN_MIGRATIONS[v]` upgrades a save from version `v` to
 * `v + 1`. Empty at v1 (no prior versions); every future bump registers here, the
 * migration-per-bump pattern the other three codecs use.
 */
export const CAMPAIGN_MIGRATIONS: Readonly<Record<number, CampaignMigration>> = {};

/** Parse + validate an authored campaign def (loud fail on an unsupported version). */
export function parseCampaign(def: unknown): CampaignDef {
  if (typeof def !== "object" || def === null || Array.isArray(def)) {
    throw new CampaignSchemaVersionError("a campaign definition must be a JSON object");
  }
  const version = (def as Record<string, unknown>)["campaignSchemaVersion"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new CampaignSchemaVersionError(
      "campaign definition is missing an integer campaignSchemaVersion",
    );
  }
  if (version !== CAMPAIGN_SCHEMA_VERSION) {
    throw new CampaignSchemaVersionError(
      `campaign schemaVersion ${version} is not supported by this build ` +
        `(${CAMPAIGN_SCHEMA_VERSION})`,
    );
  }
  return CampaignDefSchema.parse(def);
}

/**
 * Begin a new game: the def's starting party becomes the save's party, at battle 0.
 * The party is DEEP-COPIED through the schema parse, so a caller that keeps editing
 * the def can never reach back into a live save.
 */
export function startCampaign(def: CampaignDef): CampaignSave {
  return CampaignSaveSchema.parse({
    campaignSchemaVersion: CAMPAIGN_SCHEMA_VERSION,
    campaignId: def.id,
    battleIndex: 0,
    status: "in-progress",
    party: def.party.map((r) => UnitRecordSchema.parse(r)),
    history: [],
  });
}

/**
 * The battle this save is sitting on — the one to play, or (on `gameOver`) the one to
 * retry. `null` once the campaign is `completed`, which is what makes "is there
 * anything left to do?" a single call rather than an index comparison at each caller.
 */
export function currentBattle(def: CampaignDef, save: CampaignSave): CampaignBattle | null {
  if (save.status === "completed") return null;
  return def.battles[save.battleIndex] ?? null;
}

/** What one resolved battle reports back to the campaign. */
export interface BattleResult {
  outcome: Outcome;
  /** party record id → the AP grant that battle earned it (progression.ts). */
  rewards: Readonly<Record<string, ApReward>>;
}

/**
 * Fold a resolved battle into the save (AC-M1's step, AC-M3's loss branch).
 *
 * A `victory` banks each party member's AP grant and advances the index; advancing
 * past the last battle sets `completed`. ANY other outcome — defeat, draw, stalemate
 * or timeout — is a loss for the player: the status becomes `gameOver`, the index does
 * NOT move, and **the party is carried through byte-identically**. That last clause is
 * what makes {@link retryBattle} exact rather than approximate: there is no pre-battle
 * snapshot to restore because nothing was ever spent.
 *
 * Throws if the campaign is not `in-progress` — resolving a battle for a completed or
 * already-lost campaign is a caller bug, and silently accepting it would let a save
 * advance past its own ending.
 */
export function applyBattleResult(
  def: CampaignDef,
  save: CampaignSave,
  result: BattleResult,
): CampaignSave {
  if (save.status !== "in-progress") {
    throw new CampaignSchemaVersionError(
      `applyBattleResult: campaign is "${save.status}", not "in-progress"`,
    );
  }
  const battle = def.battles[save.battleIndex];
  if (!battle) {
    throw new CampaignSchemaVersionError(
      `applyBattleResult: no battle at index ${save.battleIndex}`,
    );
  }
  if (result.outcome === "ongoing") {
    throw new CampaignSchemaVersionError("applyBattleResult: an ongoing battle has no result");
  }

  const history: CampaignHistoryEntry[] = [
    ...save.history,
    { battleId: battle.id, outcome: result.outcome },
  ];

  if (result.outcome !== "victory") {
    return { ...save, status: "gameOver", history };
  }

  // A member with no entry in `rewards` never deployed; `awardAp` with
  // `participated: false` grants 0, so absence and non-participation agree.
  const party = save.party.map((rec) =>
    awardAp(rec, result.rewards[rec.id] ?? { participated: false, meaningfulActions: 0 }),
  );
  const battleIndex = save.battleIndex + 1;
  return {
    ...save,
    battleIndex,
    status: battleIndex >= def.battles.length ? "completed" : "in-progress",
    party,
    history,
  };
}

/**
 * Retry the lost battle (AC-M3). Returns the save to `in-progress` at the SAME index
 * with the SAME party — which is exact, not approximate, because a loss never mutated
 * the party in the first place. The lost attempt stays in `history`; erasing it would
 * make a save that retried nine times indistinguishable from one that walked it.
 *
 * Throws unless the campaign is in `gameOver` — retrying a live or finished campaign is
 * a caller bug.
 */
export function retryBattle(save: CampaignSave): CampaignSave {
  if (save.status !== "gameOver") {
    throw new CampaignSchemaVersionError(
      `retryBattle: campaign is "${save.status}", not "gameOver"`,
    );
  }
  return { ...save, status: "in-progress" };
}

/**
 * Replace one party member's record (the seam the between-battle prep screen writes
 * through: spend AP, change job, change loadout). Returns a NEW save; throws on an id
 * the party does not contain, so a typo cannot silently no-op and read as "the prep
 * screen saved nothing".
 */
export function updatePartyMember(save: CampaignSave, record: UnitRecord): CampaignSave {
  const idx = save.party.findIndex((r) => r.id === record.id);
  if (idx === -1) {
    throw new CampaignSchemaVersionError(
      `updatePartyMember: no party member with id "${record.id}"`,
    );
  }
  const party = [...save.party];
  party[idx] = UnitRecordSchema.parse(record);
  return { ...save, party };
}

/**
 * Serialize a save to a JSON string. Validate-on-the-way-out (mirrors
 * `roster.ts:serializeRecord`) so a malformed save can never be persisted.
 */
export function serializeCampaign(save: CampaignSave): string {
  return JSON.stringify(CampaignSaveSchema.parse(save));
}

/**
 * Parse + validate + migrate a serialized {@link CampaignSave}.
 *
 * Failure is always loud (mirrors `roster.ts:deserializeRecord`): a version newer than
 * this build, older than the oldest supported migration, or a missing/non-integer
 * version throws {@link CampaignSchemaVersionError} — never a silent/partial load. A
 * save that loads PARTIALLY is the worst outcome for a persistence layer: it looks like
 * a working load and quietly drops progress.
 */
export function deserializeCampaign(json: string): CampaignSave {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CampaignSchemaVersionError("a serialized CampaignSave must be a JSON object");
  }

  let obj = raw as Record<string, unknown>;
  const version = obj["campaignSchemaVersion"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new CampaignSchemaVersionError(
      "serialized CampaignSave is missing an integer campaignSchemaVersion",
    );
  }
  if (version > CAMPAIGN_SCHEMA_VERSION) {
    throw new CampaignSchemaVersionError(
      `campaign schemaVersion ${version} is newer than this build supports ` +
        `(${CAMPAIGN_SCHEMA_VERSION}); update the game`,
    );
  }
  if (version < MIN_SUPPORTED_CAMPAIGN_SCHEMA_VERSION) {
    throw new CampaignSchemaVersionError(
      `campaign schemaVersion ${version} is older than the minimum supported ` +
        `(${MIN_SUPPORTED_CAMPAIGN_SCHEMA_VERSION})`,
    );
  }

  for (let v = version; v < CAMPAIGN_SCHEMA_VERSION; v++) {
    const migrate = CAMPAIGN_MIGRATIONS[v];
    if (!migrate) {
      throw new CampaignSchemaVersionError(
        `no campaign migration registered from schemaVersion ${v} to ${v + 1}`,
      );
    }
    obj = migrate(obj);
  }

  return CampaignSaveSchema.parse(obj);
}
