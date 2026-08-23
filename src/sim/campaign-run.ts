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

import { loadEncounter, parseEncounter, type Encounter, type EncounterResolver } from "./encounter.js";
import { runFromState, type RunOptions, type RunReport, type UnitContribution } from "./harness.js";
import type { ApReward } from "./progression.js";
import type { UnitRecord } from "./roster.js";
import type { BattleState } from "./state.js";
import {
  applyBattleResult,
  currentBattle,
  startCampaign,
  type CampaignBattle,
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
 * The record map an encounter of this campaign is resolved against.
 *
 * THE ENTIRE PARTY-CARRY MECHANISM IS THIS FUNCTION, and it is one function on purpose.
 * Every path that starts a campaign battle — the headless runner AND the viewer — goes
 * through it, so "does progress carry?" has exactly one answer and exactly one place to
 * get wrong. Cast first, save's party second: the SAVE wins any id collision, which is
 * the one ordering that keeps progress flowing forward. (The def's uniqueness refine
 * means there is normally no collision to resolve.) Feed it `def.party` instead and
 * every battle silently restarts from scratch while every per-battle test stays green —
 * `campaign-run.test.ts`'s "fought with the SAVE's party" A/B is the only thing that
 * catches it, on both paths.
 */
export function campaignBattleRecords(
  def: CampaignDef,
  save: CampaignSave,
): Record<string, UnitRecord> {
  const records: Record<string, UnitRecord> = {};
  for (const rec of def.cast) records[rec.id] = rec;
  for (const rec of save.party) records[rec.id] = rec;
  return records;
}

/**
 * The player-side placements of `encounter`, in authored order — one per deployable
 * slot.
 *
 * The COUNT is the battle's, not the party's: the campaign ramps 2 → 3 → 4 units, and
 * that ramp is authored in the encounter files. A player chooses WHO fills the slots,
 * never HOW MANY.
 */
export function deployableSlots(encounter: Encounter, playerTeam: number): string[] {
  return encounter.placements.filter((p) => p.teamId === playerTeam).map((p) => p.slotId);
}

/**
 * Rewrite the player-side placements to field `deployment` instead of whoever the
 * encounter names, keeping every position, facing and slot id exactly as authored.
 *
 * Substituting the RECORD and not the placement is what keeps the ramp intact and keeps
 * `deriveRewards` working untouched: it maps battle-unit ids back through the same
 * placements, so a substituted member is credited for the AP it earned without any
 * second mapping.
 *
 * `[]` returns the encounter unchanged — the authored default. A length mismatch throws:
 * a save naming three units for a two-slot battle is a real error, and silently dropping
 * the third would bench somebody the player deliberately chose.
 */
export function applyDeployment(
  encounter: Encounter,
  playerTeam: number,
  deployment: readonly string[],
): Encounter {
  if (deployment.length === 0) return encounter;
  const slots = deployableSlots(encounter, playerTeam);
  if (deployment.length !== slots.length) {
    throw new CampaignSchemaVersionError(
      `applyDeployment: ${deployment.length} units chosen for ${slots.length} slots`,
    );
  }
  let next = 0;
  return {
    ...encounter,
    placements: encounter.placements.map((p) =>
      p.teamId === playerTeam
        ? { ...p, unit: { kind: "ref" as const, recordId: deployment[next++]! } }
        : p,
    ),
  };
}

/** The battle this save is sitting on, compiled and ready to fight. */
export interface LoadedCampaignBattle {
  battle: CampaignBattle;
  /** The parsed encounter — its objectives and caps judge the battle. */
  encounter: Encounter;
  /** A fresh {@link BattleState} with the SAVE's party deployed. */
  state: BattleState;
}

/**
 * Compile the campaign's current battle into a playable {@link BattleState}.
 *
 * Exposed separately from {@link runCampaignBattle} because the VIEWER does not want the
 * battle fought for it — it wants the board, hands it to a human, and folds the result
 * back with {@link resolveCampaignBattle}. Both halves are shared with the headless
 * runner, so a played battle and a probed battle start from the same state and are
 * judged by the same objectives.
 *
 * Throws if the save is not sitting on a battle, or if the def names an encounter the
 * caller did not supply — an unresolvable battle must fail loud, not silently end the
 * campaign.
 */
export function loadCampaignBattle(
  def: CampaignDef,
  save: CampaignSave,
  encounters: EncounterMap,
  resolver: EncounterResolver,
): LoadedCampaignBattle {
  const battle = currentBattle(def, save);
  if (!battle) {
    throw new CampaignSchemaVersionError(
      `loadCampaignBattle: campaign "${save.campaignId}" has no battle at index ${save.battleIndex}`,
    );
  }
  const encDef = encounters[battle.encounterId];
  if (encDef === undefined) {
    throw new CampaignSchemaVersionError(
      `loadCampaignBattle: no encounter data supplied for "${battle.encounterId}"`,
    );
  }
  const records = campaignBattleRecords(def, save);
  const encounter = applyDeployment(parseEncounter(encDef), def.playerTeam, save.deployment);
  const state = loadEncounter(encounter, { ...resolver, records });
  return { battle, encounter, state };
}

/**
 * party record id → the AP that battle earned it, derived from a finished battle's
 * per-unit contributions.
 *
 * `contributionByUnit` is keyed by BATTLE unit id, which `loadEncounter` assigns from
 * the placement's `slotId` — NOT the record id. Mapping back through the placements is
 * what credits a party member deployed under any slot name, and is the reason this is a
 * function rather than two lines copied into each caller: the viewer needs exactly this
 * mapping, and a second copy would drift the moment slot naming changed.
 */
export function deriveRewards(
  def: CampaignDef,
  save: CampaignSave,
  encounter: Encounter,
  contributionByUnit: Readonly<Record<string, UnitContribution>>,
): Record<string, ApReward> {
  const rewards: Record<string, ApReward> = {};
  for (const p of encounter.placements) {
    if (p.teamId !== def.playerTeam) continue;
    const src = p.unit;
    if (src.kind !== "ref") continue;
    if (!save.party.some((r) => r.id === src.recordId)) continue;
    rewards[src.recordId] = rewardOf(contributionByUnit[p.slotId]);
  }
  return rewards;
}

/**
 * Fold an ALREADY-FINISHED battle into the save — the seam a player-driven battle comes
 * back through (docs/11 M0 item 1). The report may come from the headless harness or
 * from the interactive viewer; both assemble it from the same `harness.ts` helpers, so
 * the campaign cannot tell (and must not care) who was holding the controller.
 */
export function resolveCampaignBattle(
  def: CampaignDef,
  save: CampaignSave,
  encounter: Encounter,
  report: RunReport,
): { save: CampaignSave; battle: CampaignBattleRun } {
  const battle = currentBattle(def, save);
  if (!battle) {
    throw new CampaignSchemaVersionError(
      `resolveCampaignBattle: campaign "${save.campaignId}" has no battle at index ${save.battleIndex}`,
    );
  }
  const rewards = deriveRewards(def, save, encounter, report.contributionByUnit);
  const next = applyBattleResult(def, save, { outcome: report.outcome, rewards });
  return {
    save: next,
    battle: { battleId: battle.id, encounterId: battle.encounterId, report, rewards },
  };
}

/**
 * Fight ONE battle of the campaign with the balance probe on both seats and fold it in.
 * Composed from {@link loadCampaignBattle} + {@link resolveCampaignBattle} so the
 * headless path and the viewer path share every step except who chooses the commands.
 */
export function runCampaignBattle(
  def: CampaignDef,
  save: CampaignSave,
  encounters: EncounterMap,
  resolver: EncounterResolver,
  opts: CampaignRunOptions = {},
): { save: CampaignSave; battle: CampaignBattleRun } {
  const loaded = loadCampaignBattle(def, save, encounters, resolver);
  const enc = loaded.encounter;
  const run = runFromState(
    loaded.state,
    {
      victory: enc.victory,
      defeat: enc.defeat,
      maxTurns: opts.maxTurns ?? enc.maxTurns,
      maxTicks: opts.maxTicks ?? enc.maxTicks,
    },
    opts,
  );
  return resolveCampaignBattle(def, save, enc, run.report);
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
