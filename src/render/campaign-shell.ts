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
  deployableSlots,
  parseEncounter,
  setDeployment,
  resolveCampaignBattle,
  retryBattle,
  startCampaign,
  currentBattle,
  updatePartyMember,
  resolveBeat,
  sceneAt,
  storyBeat,
  storyEntry,
  type CampaignBattleRun,
  type CampaignDef,
  type CampaignSave,
  type ContentRegistry,
  type EncounterMap,
  type Encounter,
  type ResolvedLine,
  type SceneAnchor,
  type StoryBeat,
  type StoryScene,
  type StoryPack,
  type UnitRecord,
} from "../sim/index.js";
import { Session } from "./session.js";
import { readSave, writeSave, type SaveSlot } from "./storage.js";

/**
 * The screens (docs/11 M0 item 1). `AFTER_BATTLE` is a screen and not a modal because
 * a loss has to be somewhere the player can act — AC-M3's "losing is a state, not a
 * crash" is exactly this row existing.
 */
export type Screen = "TITLE" | "SCENE" | "BRIEFING" | "BATTLE" | "AFTER_BATTLE" | "COMPLETED";

export interface ShellOptions {
  def: CampaignDef;
  encounters: EncounterMap;
  registry: ContentRegistry;
  slot: SaveSlot;
  /**
   * The story pack (docs/11 M0 item 4). OPTIONAL: the shell runs a campaign with no
   * text at all, which is what the story seam being a seam means — the engine plays the
   * game and the prose is data laid alongside it. Absent here, every accessor below
   * reports nothing to say, and the page renders no scene rather than an empty one.
   */
  story?: StoryPack;
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
  private readonly storyPack: StoryPack | null;

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
    this.storyPack = opts.story ?? null;
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
    this.lastBattle = null;
    this.arrive();
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
    this.lastBattle = null;
    // gameOver still lands on AFTER_BATTLE — the retry screen is where a loss is
    // acknowledged, and a scene must never stand in front of that.
    if (this.save.status === "gameOver") this.screen = "AFTER_BATTLE";
    else this.arrive();
    return true;
  }

  /** Leave the run. The save stays on disk — quitting is not erasing. */
  quitToTitle(): void {
    this.save = null;
    this.session = null;
    this.encounter = null;
    this.lastBattle = null;
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

  // ─── the story seam (docs/11 M0 item 4, AC-M4) ────────────────────────────
  //
  // Lookups, no prose. Each one asks the PACK a question and hands back what it says, so
  // swapping the data changes what a player reads with no change here — which is AC-M4's
  // discriminator, and the only reason these are methods rather than the page reading
  // strings out of a constant.

  /**
   * The screen to show on ARRIVING somewhere — a pending scene, or the place it stands
   * in front of.
   *
   * One resolver called from every transition that can land on a briefing or the ending,
   * rather than five copies of the same ternary. `src/render/CLAUDE.md` names the trap
   * this closes: a screen the state machine skips has content nobody can reach, and the
   * transitions (not the states) are what has to be enumerated — this repo has already
   * shipped an unreadable story beat exactly that way.
   */
  private arrive(): void {
    this.screen =
      this.pendingScene() !== null
        ? "SCENE"
        : this.save?.status === "completed"
          ? "COMPLETED"
          : "BRIEFING";
  }

  /**
   * The standalone scene standing in front of the current moment, or `null`.
   *
   * Only the CURRENT anchor is consulted — the scene before the pending battle, or the
   * one before the ending. A run that somehow skipped past an anchor does not accumulate
   * a backlog to play through; the scene is simply missed, which is the same thing that
   * happens to a player who is already past that point in the story.
   */
  pendingScene(): StoryScene | null {
    if (!this.save || !this.storyPack) return null;
    const seen = new Set(this.save.scenesSeen);
    const at: SceneAnchor | null =
      this.save.status === "completed"
        ? { kind: "campaign-end" }
        : (() => {
            const battle = currentBattle(this.def, this.save);
            return battle ? { kind: "before-battle" as const, battleId: battle.id } : null;
          })();
    if (!at) return null;
    const scene = sceneAt(this.storyPack, at);
    return scene && !seen.has(scene.id) ? scene : null;
  }

  /**
   * Dismiss the pending scene: mark it read, persist, and go where it stood in front of.
   *
   * MARKED ON EXIT, not on entry. A reload part-way through a scene therefore replays it
   * from the top, which is the friendlier answer and puts the write on the same boundary
   * every other `persist()` sits on. How far the player had read is presentation and is
   * deliberately not saved.
   */
  endScene(): void {
    const scene = this.pendingScene();
    if (!this.save || !scene) return;
    this.save = { ...this.save, scenesSeen: [...this.save.scenesSeen, scene.id] };
    this.persist();
    this.arrive();
  }

  /**
   * A beat with its speakers and portraits already looked up (`docs/11` AC-M8).
   *
   * Here rather than in `game.ts` so the PAGE never holds a character table it could
   * miss against — `src/render/CLAUDE.md`'s content-keyed-lookup rule. Returns `[]` with
   * no pack, which is unreachable in practice (the caller only has a beat if a pack gave
   * it one) and is still the honest answer rather than a throw.
   */
  resolve(beat: StoryBeat): ResolvedLine[] {
    return this.storyPack ? resolveBeat(this.storyPack, beat) : [];
  }

  /** The authored name of the pending battle's scene, or `null` if the pack has none. */
  sceneTitle(): string | null {
    const brief = this.briefing();
    if (!brief || !this.storyPack) return null;
    return storyEntry(this.storyPack, brief.battleId)?.title ?? null;
  }

  /** The text shown BEFORE the pending battle, or `null` when nothing is authored. */
  preBeat(): StoryBeat | null {
    const brief = this.briefing();
    if (!brief || !this.storyPack) return null;
    return storyBeat(this.storyPack, brief.battleId, "pre");
  }

  /**
   * The text shown AFTER the most recently resolved battle, chosen by how it went.
   *
   * Keyed off `history`, not off the pending battle: by the time this is read the index
   * has already moved past a win, and on the final victory there is no pending battle at
   * all. Any non-`victory` outcome is a loss for the player — the same reading
   * `applyBattleResult` uses — so a draw or a timeout gets the defeat scene rather than
   * silently getting none.
   */
  outcomeBeat(): StoryBeat | null {
    const last = this.save?.history.at(-1);
    if (!last || !this.storyPack) return null;
    return storyBeat(this.storyPack, last.battleId, last.outcome === "victory" ? "victory" : "defeat");
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
    this.lastBattle = step.battle;
    this.persist();
    this.session = null;
    this.encounter = null;
    // A win goes through `arrive`, so the epilogue can stand in front of the ending.
    // A loss goes straight to AFTER_BATTLE: the retry screen is the one place a defeat
    // is acknowledged, and no scene belongs in front of it.
    if (this.save.status === "completed") this.arrive();
    else this.screen = "AFTER_BATTLE";
  }

  /**
   * The most recent resolved battle, in full: its report and the AP grants it earned,
   * exactly as {@link resolveCampaignBattle} produced them. `null` before the first
   * battle is banked.
   *
   * KEPT RATHER THAN RECOMPUTED. `concludeBattle` already receives this object and used
   * to discard everything but the next save, so anything downstream that wanted "how did
   * that battle go" had to re-derive it from the encounter and the report — a second copy
   * of a fold the sim already owns, and one that would drift. `lastOutcome()` below still
   * reads `history`, because that is the durable record; this is the live detail, and it
   * is deliberately NOT persisted.
   */
  lastBattle: CampaignBattleRun | null = null;

  /** The outcome of the most recent resolved battle, for the after-battle screen. */
  lastOutcome(): string | null {
    const last = this.save?.history.at(-1);
    return last ? last.outcome : null;
  }

  /** After a WIN: on to the next briefing. */
  nextBattle(): void {
    if (!this.save || this.save.status !== "in-progress") return;
    this.arrive();
  }

  /**
   * After a LOSS: retry the same battle with the same party (AC-M3). Exact, not
   * approximate — a loss never spent anything, so there is no snapshot to restore.
   */
  retry(): void {
    if (!this.save || this.save.status !== "gameOver") return;
    this.save = retryBattle(this.save);
    this.persist();
    // Through `arrive` like every other landing, and the seen-set is what makes this
    // correct with no special case: an interlude already read is not replayed on a
    // retry, and one somehow unread still plays.
    this.arrive();
  }

  // ─── between-battle prep (docs/11 M0 item 3) ──────────────────────────────

  /**
   * Write one party member's edited record back to the save and persist it — the seam
   * the briefing screen's prep panel drives (spend AP, change job, change loadout).
   *
   * ONLY between battles. `updatePartyMember` would happily rewrite the party mid-fight,
   * but the units on the field were compiled by `loadCampaignBattle` at deploy time, so
   * the edit would apply to the NEXT battle while the player watched this one — a change
   * that appears to do nothing and then does something an hour later.
   *
   * The sim owns the rules here too: `updatePartyMember` re-parses the record through
   * `UnitRecordSchema` and throws on an id the party does not contain, so a panel wired
   * to the wrong record fails loudly instead of silently saving nothing.
   */
  updateParty(record: UnitRecord): void {
    if (!this.save) throw new Error("updateParty: no campaign in progress");
    if (this.session !== null) {
      throw new Error("updateParty: the party cannot be edited during a battle");
    }
    this.save = updatePartyMember(this.save, record);
    this.persist();
  }

  /**
   * How many party members this battle fields, and who is currently chosen.
   *
   * The COUNT comes from the encounter, never from the party: the campaign ramps
   * 2 → 3 → 4 units and that ramp is authored content. `chosen` falls back to the
   * encounter's own placements when the player has not picked, so "the default" is
   * always the authored roster rather than a guess made here.
   *
   * `null` when there is no battle to deploy into (the title or ending screen).
   */
  deployment(): { slots: number; chosen: string[]; party: UnitRecord[] } | null {
    if (!this.save) return null;
    const battle = currentBattle(this.def, this.save);
    if (!battle) return null;
    const encDef = this.encounters[battle.encounterId];
    if (encDef === undefined) return null;
    const encounter = parseEncounter(encDef);
    const slots = deployableSlots(encounter, this.def.playerTeam);
    const authored = encounter.placements
      .filter((p) => p.teamId === this.def.playerTeam)
      .map((p) => (p.unit.kind === "ref" ? p.unit.recordId : ""));
    const chosen = this.save.deployment.length > 0 ? [...this.save.deployment] : authored;
    return { slots: slots.length, chosen, party: [...this.save.party] };
  }

  /**
   * Choose who deploys. Refused mid-battle for the same reason `updateParty` is: the
   * units on the field were compiled at deploy time, so a change here would appear to
   * do nothing and then take effect an hour later.
   *
   * The COUNT is checked here because only this class can see both the save and the
   * encounter; membership and duplicates are `setDeployment`'s, in the sim.
   */
  setDeployment(ids: readonly string[]): void {
    if (!this.save) throw new Error("setDeployment: no campaign in progress");
    if (this.session !== null) {
      throw new Error("setDeployment: the roster cannot be changed during a battle");
    }
    const current = this.deployment();
    if (current && ids.length !== current.slots) {
      throw new Error(`setDeployment: this battle fields ${current.slots}, not ${ids.length}`);
    }
    this.save = setDeployment(this.save, ids);
    this.persist();
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
