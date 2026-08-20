/**
 * The headless campaign playthrough (docs/11 AC-M1) — what `harness.ts` is to one
 * encounter, this is to a whole campaign: load battle N, fight it with the balance
 * probe on both seats, fold the result into the save, repeat until the campaign ends.
 *
 * It is the AC-M1 INSTRUMENT. AC-M1's discriminator is that "a campaign that can start
 * but cannot reach an ending passes any per-battle test" — so the assertion has to be
 * over the whole sequence, and the whole sequence has to be driveable without a browser.
 * Everything here exists to make that assertion possible.
 *
 * WHY THE PARTY IS INJECTED AS `ref` RECORDS. The campaign's player placements use
 * `{ kind: "ref", recordId }` sources (encounter.ts), so the records the encounter
 * compiles are whatever this runner puts in the resolver map. Putting the SAVE's party
 * there — not the def's — is the entire mechanism by which banked AP and learned
 * abilities carry across a battle boundary. Feed it the def's party instead and every
 * battle silently starts from scratch while every per-battle test stays green.
 *
 * PURE + deterministic: no IO (encounter defs are passed in already parsed), no RNG of
 * its own, no wall-clock. Given the same def, the same encounter data and the same
 * content registry, the resulting save and reports are byte-identical.
 */

import { parseEncounter, type EncounterResolver } from "./encounter.js";
import { runEncounterDetailed, type RunOptions, type RunReport, type UnitContribution } from "./harness.js";
import type { ApReward } from "./progression.js";
import type { UnitRecord } from "./roster.js";
import {
  applyBattleResult,
  currentBattle,
  startCampaign,
  type CampaignDef,
  type CampaignSave,
  CampaignSchemaVersionError,
} from "./campaign.js";

/** Encounter id → its already-parsed JSON definition. The caller owns the IO. */
export type EncounterMap = Readonly<Record<string, unknown>>;

/** One battle of a playthrough: which step it was, and how it went. */
export interface CampaignBattleRun {
  battleId: string;
  encounterId: string;
  report: RunReport;
  /** party record id → the grant that battle earned (before it was banked). */
  rewards: Readonly<Record<string, ApReward>>;
}

/** A whole playthrough: every battle fought, and the save it ended on. */
export interface CampaignRunResult {
  save: CampaignSave;
  battles: CampaignBattleRun[];
}

export interface CampaignRunOptions extends RunOptions {
  /**
   * Stop after this many battles even if the campaign has not ended. A halting
   * guarantee in the same spirit as the harness's turn/tick caps: a runner that could
   * loop forever on a mis-authored def would hang CI rather than fail it. Defaults to
   * one attempt per authored battle plus a small margin.
   */
  maxBattles?: number;
  /** Resume from an existing save instead of starting a new game. */
  startFrom?: CampaignSave;
}

/**
 * The AP a party member earned. `participated` is true iff the member DEPLOYED in that
 * battle (had a placement), and `meaningfulActions` is the count of actions it actually
 * LANDED — see {@link UnitContribution.landedActions}. Deliberately not damage-derived:
 * a healer who spent the whole battle healing, or a thief who spent it inflicting
 * status, earns the same way a striker does, and a damage-only proxy would hand them
 * zero while the campaign still looked like it worked.
 */
function rewardOf(contribution: UnitContribution | undefined): ApReward {
  if (!contribution) return { participated: false, meaningfulActions: 0 };
  return { participated: true, meaningfulActions: contribution.landedActions };
}

/**
 * Fight ONE battle of the campaign and fold it into the save. Exposed separately from
 * {@link runCampaign} because the viewer drives battles one at a time — the shell hands
 * the player a battle, and calls this (or its player-driven equivalent) when it ends.
 *
 * Throws if the save is not `in-progress`, or if the def names an encounter the caller
 * did not supply — an unresolvable battle must fail loud, not silently end the campaign.
 */
export function runCampaignBattle(
  def: CampaignDef,
  save: CampaignSave,
  encounters: EncounterMap,
  resolver: EncounterResolver,
  opts: CampaignRunOptions = {},
): { save: CampaignSave; battle: CampaignBattleRun } {
  const battle = currentBattle(def, save);
  if (!battle) {
    throw new CampaignSchemaVersionError(
      `runCampaignBattle: campaign "${save.campaignId}" has no battle at index ${save.battleIndex}`,
    );
  }
  const encDef = encounters[battle.encounterId];
  if (encDef === undefined) {
    throw new CampaignSchemaVersionError(
      `runCampaignBattle: no encounter data supplied for "${battle.encounterId}"`,
    );
  }

  // Cast first, party second: the SAVE's party wins any id collision, which is the one
  // ordering that keeps progress flowing forward. (The def's own uniqueness refine means
  // there is normally no collision to resolve.)
  const records: Record<string, UnitRecord> = {};
  for (const rec of def.cast) records[rec.id] = rec;
  for (const rec of save.party) records[rec.id] = rec;

  const enc = parseEncounter(encDef);
  const run = runEncounterDetailed(encDef, { ...resolver, records }, undefined, opts);

  // contributionByUnit is keyed by battle unit id, which loadEncounter assigns from the
  // placement's slotId — NOT the record id. Map back through the placements so a party
  // member deployed under any slot name is credited.
  const rewards: Record<string, ApReward> = {};
  for (const p of enc.placements) {
    if (p.teamId !== def.playerTeam) continue;
    const src = p.unit;
    if (src.kind !== "ref") continue;
    if (!save.party.some((r) => r.id === src.recordId)) continue;
    rewards[src.recordId] = rewardOf(run.report.contributionByUnit[p.slotId]);
  }

  const next = applyBattleResult(def, save, { outcome: run.report.outcome, rewards });
  return {
    save: next,
    battle: { battleId: battle.id, encounterId: battle.encounterId, report: run.report, rewards },
  };
}

/**
 * Play a campaign from a fresh start (or a supplied save) to an ENDING — `completed`
 * when every battle is won, `gameOver` on the first loss. It deliberately does NOT
 * auto-retry: a runner that retried until it won would report `completed` for a
 * campaign no player could finish, which is precisely the claim AC-M1 makes.
 */
export function runCampaign(
  def: CampaignDef,
  encounters: EncounterMap,
  resolver: EncounterResolver,
  opts: CampaignRunOptions = {},
): CampaignRunResult {
  const maxBattles = opts.maxBattles ?? def.battles.length + 2;
  let save = opts.startFrom ?? startCampaign(def);
  const battles: CampaignBattleRun[] = [];

  while (save.status === "in-progress" && battles.length < maxBattles) {
    const step = runCampaignBattle(def, save, encounters, resolver, opts);
    save = step.save;
    battles.push(step.battle);
  }
  return { save, battles };
}
