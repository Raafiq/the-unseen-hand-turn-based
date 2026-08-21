/**
 * The game shell (docs/11 M0 item 1) — DOM-FREE, for the same reason `session.ts` is.
 *
 * `Session` is one battle; this is everything around it: the title screen, the save
 * slot, which battle comes next, what a loss means, and where a win goes. It owns no
 * canvas and no `document`, so the whole path AC-M1 names — "title screen to ending" —
 * is driveable in a unit test rather than only through a browser.
 *
 * THE SIM STILL OWNS THE RULES. This file starts battles with `loadCampaignBattle` and
 * ends them with `resolveCampaignBattle`, the SAME two calls the headless
 * `runCampaignBattle` is built from. The only thing that differs between a played
 * campaign and a probed one is who chooses the commands — which is the whole point of
 * docs/10 §1's "input is a command source". Nothing here re-derives an outcome, a
 * reward or a party.
 *
 * DETERMINISM: no wall-clock, no RNG of its own, no timers. Every transition is an
 * explicit call, so "what has happened by now" is a function of input order alone.
 */

import {
  loadCampaignBattle,
  resolveCampaignBattle,
  retryBattle,
  startCampaign,
  currentBattle,
  type CampaignDef,
  type CampaignSave,
  type ContentRegistry,
  type EncounterMap,
  type Encounter,
} from "../sim/index.js";
import { Session } from "./session.js";
import { readSave, writeSave, type SaveSlot } from "./storage.js";

/**
 * The screens (docs/11 M0 item 1). `AFTER_BATTLE` is a screen and not a modal because
 * a loss has to be somewhere the player can act — AC-M3's "losing is a state, not a
 * crash" is exactly this row existing.
 */
export type Screen = "TITLE" | "BRIEFING" | "BATTLE" | "AFTER_BATTLE" | "COMPLETED";

export interface ShellOptions {
  def: CampaignDef;
  encounters: EncounterMap;
  registry: ContentRegistry;
  slot: SaveSlot;
}

/** What the briefing screen has to say: which battle, and where it sits in the run. */
export interface Briefing {
  battleId: string;
  encounterId: string;
  /** 1-based, for "Battle 2 of 5". */
  step: number;
  total: number;
  /** True when this battle has already been lost at least once — a retry, not a first go. */
  retrying: boolean;
}

export class CampaignShell {
  readonly def: CampaignDef;
  private readonly encounters: EncounterMap;
  private readonly registry: ContentRegistry;
  private readonly slot: SaveSlot;

  screen: Screen = "TITLE";
  /** The live save, or `null` before a game is started/continued. */
  save: CampaignSave | null = null;
  /** The battle in progress, or `null` outside `BATTLE`. */
  session: Session | null = null;
  /** The encounter the live battle is judged against — kept for the fold-back. */
  private encounter: Encounter | null = null;

  /**
   * What the title screen offers as "Continue": a readable save, nothing, or a reason it
   * could not be read. Refreshed by {@link refreshSlot}; never a thrown error, because
   * a bad save file must not make the game unstartable.
   */
  slotState: ReturnType<typeof readSave>;

  /**
   * A failed WRITE, surfaced rather than swallowed. A shell that reported "progress
   * saved" over a storage exception looks identical to one that saved, right up until
   * the player closes the tab.
   */
  saveError: string | null = null;

  constructor(opts: ShellOptions) {
    this.def = opts.def;
    this.encounters = opts.encounters;
    this.registry = opts.registry;
    this.slot = opts.slot;
    this.slotState = readSave(this.slot, this.def.id);
  }

  /** Re-read the slot (after a write, a clear, or a return to the title). */
  refreshSlot(): void {
    this.slotState = readSave(this.slot, this.def.id);
  }

  /** True when the title screen's Continue should be offered. */
  canContinue(): boolean {
    return this.slotState.kind === "save";
  }

  // ─── title-screen actions ─────────────────────────────────────────────────

  /**
   * New Game. OVERWRITES the slot — one save slot is an explicit M0 cut (docs/11), so
   * there is nowhere else for it to go, and the UI is responsible for confirming first.
   */
  newGame(): void {
    this.save = startCampaign(this.def);
    this.persist();
    this.session = null;
    this.encounter = null;
    this.screen = "BRIEFING";
  }

  /**
   * Continue. Lands on the screen the SAVED STATUS implies, not always the briefing: a
   * campaign abandoned mid-`gameOver` must come back to the retry screen, or the player
   * would be quietly handed a fresh attempt with no record that they lost.
   */
  continueGame(): boolean {
    if (this.slotState.kind !== "save") return false;
    this.save = this.slotState.save;
    this.session = null;
    this.encounter = null;
    this.screen =
      this.save.status === "completed"
        ? "COMPLETED"
        : this.save.status === "gameOver"
          ? "AFTER_BATTLE"
          : "BRIEFING";
    return true;
  }

  /** Leave the run. The save stays on disk — quitting is not erasing. */
  quitToTitle(): void {
    this.save = null;
    this.session = null;
    this.encounter = null;
    this.screen = "TITLE";
    this.refreshSlot();
  }

  /** Erase the slot (the only way to clear a save this build offers). */
  eraseSave(): void {
    this.slot.clear();
    this.saveError = null;
    this.refreshSlot();
  }

  // ─── the run ──────────────────────────────────────────────────────────────

  /** What the briefing screen shows, or `null` when there is no pending battle. */
  briefing(): Briefing | null {
    if (!this.save) return null;
    const battle = currentBattle(this.def, this.save);
    if (!battle) return null;
    return {
      battleId: battle.id,
      encounterId: battle.encounterId,
      step: this.save.battleIndex + 1,
      total: this.def.battles.length,
      retrying: this.save.history.some((h) => h.battleId === battle.id),
    };
  }

  /**
   * Deploy: compile the pending battle and hand it to the player.
   *
   * The battle is built by `loadCampaignBattle`, so the party that deploys is the
   * SAVE's — banked AP and learned abilities included — and the session is handed the
   * encounter's own objectives and caps as its `rules`, so it is judged by what the
   * encounter says rather than by counting corpses.
   */
  deploy(): void {
    if (!this.save) throw new Error("deploy: no campaign in progress");
    if (this.save.status !== "in-progress") {
      throw new Error(`deploy: campaign is "${this.save.status}", not "in-progress"`);
    }
    const loaded = loadCampaignBattle(this.def, this.save, this.encounters, {
      registry: this.registry,
    });
    this.encounter = loaded.encounter;
    const enc = loaded.encounter;
    this.session = new Session({
      makeState: () => loaded.state,
      playerTeam: this.def.playerTeam,
      rules: {
        victory: enc.victory,
        defeat: enc.defeat,
        maxTurns: enc.maxTurns,
        maxTicks: enc.maxTicks,
      },
    });
    this.screen = "BATTLE";
  }

  /**
   * battle unit id → the NAME of the record deployed in that slot.
   *
   * Data, not presentation: `loadEncounter` names units after the placement's `slotId`
   * ("blue-vance"), and a page that wanted to print "Vance" would otherwise have to
   * parse that id — a naming convention masquerading as a lookup. Built from the
   * encounter's placements against the def's own records, so it is correct for any slot
   * naming at all. Empty outside a battle.
   */
  unitNames(): Record<string, string> {
    if (!this.encounter || !this.save) return {};
    const byId = new Map(
      [...this.save.party, ...this.def.cast].map((r) => [r.id, r.name] as const),
    );
    const names: Record<string, string> = {};
    for (const p of this.encounter.placements) {
      if (p.unit.kind !== "ref") continue;
      const name = byId.get(p.unit.recordId);
      if (name !== undefined) names[p.slotId] = name;
    }
    return names;
  }

  /** True once the live battle is decided and waiting to be banked. */
  battleOver(): boolean {
    return this.session !== null && this.session.phase === "ENDED";
  }

  /**
   * Bank the finished battle: fold its report into the save, persist, and move to the
   * screen the result implies. The report comes from {@link Session.report}, which is
   * assembled from the same `harness.ts` helpers the headless runner uses — so what is
   * banked for a played battle and for a probed one is the same artifact.
   *
   * Throws while the battle is still running: `applyBattleResult` refuses an `ongoing`
   * outcome, and it is right to. Banking an unfinished battle would advance the campaign
   * past a fight nobody won.
   */
  concludeBattle(): void {
    if (!this.save || !this.session || !this.encounter) {
      throw new Error("concludeBattle: no battle in progress");
    }
    const report = this.session.report();
    if (!report) throw new Error("concludeBattle: the battle produced no report");
    const step = resolveCampaignBattle(this.def, this.save, this.encounter, report);
    this.save = step.save;
    this.persist();
    this.session = null;
    this.encounter = null;
    this.screen = this.save.status === "completed" ? "COMPLETED" : "AFTER_BATTLE";
  }

  /** The outcome of the most recent resolved battle, for the after-battle screen. */
  lastOutcome(): string | null {
    const last = this.save?.history.at(-1);
    return last ? last.outcome : null;
  }

  /** After a WIN: on to the next briefing. */
  nextBattle(): void {
    if (!this.save || this.save.status !== "in-progress") return;
    this.screen = "BRIEFING";
  }

  /**
   * After a LOSS: retry the same battle with the same party (AC-M3). Exact, not
   * approximate — a loss never spent anything, so there is no snapshot to restore.
   */
  retry(): void {
    if (!this.save || this.save.status !== "gameOver") return;
    this.save = retryBattle(this.save);
    this.persist();
    this.screen = "BRIEFING";
  }

  // ─── persistence ──────────────────────────────────────────────────────────

  /**
   * Write the save at every boundary that changes it. A refused write is CAPTURED and
   * shown, not thrown: the run in memory is still perfectly playable, and taking the
   * page down would lose the very progress the write failed to keep.
   */
  private persist(): void {
    if (!this.save) return;
    try {
      writeSave(this.slot, this.save);
      this.saveError = null;
    } catch (err) {
      this.saveError = String(err);
    }
    this.refreshSlot();
  }
}
