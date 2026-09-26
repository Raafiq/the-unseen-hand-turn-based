/**
 * The `window.tuhGame` seam's TYPE, shared by `game.ts` and the Playwright specs
 * (`tsconfig.json` includes `e2e`, so the seam is typechecked on both sides) — exactly
 * the arrangement `viewer-api.ts` uses for the engine viewer's `window.tuh`.
 *
 * It routes through the SAME shell methods the buttons call. There is no parallel path
 * for tests: `newGame()` here is `CampaignShell.newGame()`, the one a click reaches.
 */

import type { Screen } from "./campaign-shell.js";
import type { Speed } from "./pacer.js";
import type { Phase, SkillOption } from "./session.js";
import type { PlaytestLog } from "./telemetry.js";
import type { BattleState, CampaignBattleRun, CampaignSave, LoadoutSlot, Position, UnitRecord } from "../sim/index.js";

export interface GameApi {
  screen: () => Screen;
  /**
   * The id of whatever the SCENE screen is currently showing — a queued outcome beat
   * (`"outcome:<battleId>"`) or a pack scene's own id (`"sc-prologue"`) — or `null`
   * off that screen. A READ over `CampaignShell.activeScene()`, exposed so a test can
   * assert WHICH beat reached the scene player (identity, not merely that some scene
   * did) without pinning any story-pack prose (`check:story`).
   */
  activeSceneId: () => string | null;
  /** The live save, or `null` before a game is started. */
  save: () => CampaignSave | null;
  /**
   * The most recently banked battle's report and AP grants — the SAME artifact the
   * result overlay reads (`CampaignShell.result`/`lastBattle`), exposed as a READ so
   * a test can compute an expected AP figure off the sim's own
   * `apGrantAmount(rewards[id])` and compare it to what the overlay shows, rather
   * than re-typing a number. `null` before any battle has been banked.
   */
  lastBattle: () => CampaignBattleRun | null;
  /**
   * The registry's own name for an equipment id (`registry.equipment(id).name`).
   * `campaign-data.ts` cannot be imported into a Playwright spec directly — it pulls
   * in Vite-only asset imports (raw `.svg`/`.png`, `with { type: "json" }`) that a
   * plain Node/tsx loader cannot resolve — so a test that needs a REAL item name
   * (e.g. to prove the result overlay's drop line names ONLY what was granted, not
   * the whole inventory) reads it through this seam instead of re-typing a guess.
   */
  equipmentName: (id: string) => string;
  /**
   * The SAME portrait key `resolvePortrait(unitId).key` (ADR-0039) would answer —
   * exposed for the same reason {@link equipmentName} is, so a test can assert a
   * result-overlay member card's `data-portrait-key` names the RIGHT face, not
   * merely that some image arrived.
   */
  portraitKey: (unitId: string) => string;
  /**
   * `CampaignShell.result()` ITSELF — the call that banks a just-decided battle
   * (idempotent from the first read on), not merely a read of the already-banked
   * artifact the way {@link lastBattle} is. Exposed so a test proving "reading the
   * result overlay's content many times banks exactly once" can call the SAME port
   * `hud.ts`'s repaint loop calls (`resultOverlayPort` → `shell.result()`), rather
   * than looping over {@link lastBattle}, which never re-banks anything and would
   * pass identically whether or not the real bank-once guard still worked.
   */
  result: () => CampaignBattleRun | null;
  canContinue: () => boolean;
  newGame: () => void;
  continueGame: () => void;
  eraseSave: () => void;
  deploy: () => void;
  /** Advance the live battle one turn through the balance probe (watch mode). */
  step: () => void;
  /** Play the live battle to its end. Deterministic — no timers, no wall-clock. */
  autoplay: () => void;
  battleOver: () => boolean;
  /**
   * THE BATTLE SEAM, added with the stage (ADR-0037/0036). The engine viewer's
   * `window.tuh` has carried these since docs/10 §7; the campaign page had only
   * `step`/`autoplay`, so no browser spec could drive a REAL player turn here — and
   * the campaign is the page a stranger actually plays.
   *
   * Every entry is the same `Session` method a tap on the stage reaches, under the
   * same `act()` wrapper, so there is no parallel path (docs/10 §7).
   */
  /** The live battle state, or `null` off the battle screen. A READ; nothing mutates. */
  state: () => BattleState | null;
  /**
   * The keyboard tile cursor (arrow keys), or `null` off the battle screen / before
   * any turn has placed one. Exposed so a test can prove an ArrowKey press did NOT
   * move it (e.g. while the result overlay is open, reviewer finding 15) — the
   * absence of a staged target or a command is not that proof, since `moveCursor`
   * alone emits neither.
   */
  cursor: () => Position | null;
  clickTile: (x: number, y: number) => void;
  /** Commit the staged target (ADR-0038). A no-op with nothing staged. */
  confirm: () => void;
  cancel: () => void;
  endTurn: () => void;
  phase: () => Phase | null;
  /** The command log's length — AC-V36's A/B is read off this. */
  commandCount: () => number;
  /** The staged-but-uncommitted target, or `null`. AC-V36's second required half. */
  stagedTarget: () => { abilityId: string; unitId: string } | null;
  reason: () => string | null;
  conclude: () => void;
  next: () => void;
  retry: () => void;
  quitToTitle: () => void;
  /** The raw string in the save slot, so a test can assert persistence, not just UI. */
  storedSave: () => string | null;
  /**
   * The between-battle prep panel (docs/11 M0 item 3), or `null` before it is mounted
   * (it needs a party, so there is none on the title screen).
   *
   * These are the SAME `PrepHandle` methods the panel's own controls call, so a test
   * driving them exercises the write-back path a player's click takes — including the
   * `onChange` that pushes the edit into the save.
   */
  prep: () => PrepSeam | null;
  /**
   * The playtest log (`docs/plans/slice-m1-synthetic-playtest.md` step B1) as stored —
   * a READ, exposed so a browser spec can assert the recorder survived a real reload.
   * Everything in it was produced by the paths a player's clicks take; there is no
   * recording path that only tests reach.
   */
  playtestLog: () => PlaytestLog;
  /** Throw the log away. The campaign save is untouched — they are separate keys. */
  clearPlaytestLog: () => void;
  /**
   * MOTION IS COSMETIC, AND THESE TWO CONTROL ITS CLOCK — nothing else.
   *
   * They exist because a screenshot taken straight after a state change lands on an
   * arbitrary animation frame, and a spec that "fixed" that with a sleep would be
   * timing-dependent on a loaded box. `settleMotion` jumps the current animation to its
   * finished frame; `freezeMotion(ms)` pins it at a CHOSEN instant (`null` restores the
   * live clock), which is how a gallery frame captioned "a damage popup is on screen"
   * stays true of the image it names. Neither touches the sim, emits a command, or is
   * reachable from any code path a player's click takes.
   */
  settleMotion: () => void;
  freezeMotion: (elapsedMs: number | null) => void;
  /**
   * THE ENEMY'S TURN RUNS ITSELF (ADR-0046), and a capture needs it to sit still.
   * `holdEnemyTurns(true)` stops the pacer arming a pause, so `AI_TURN` waits for watch
   * mode exactly as it did before ADR-0046; `false` releases it and the pause is armed at
   * once. Not reachable from any control a player has, and it touches no command.
   */
  holdEnemyTurns: (on: boolean) => void;
  /** A pause is armed for the current enemy turn. A READ. */
  enemyTurnPending: () => boolean;
  /** The ×1/×2/×3 speed toggle (AC-V69). `set` is the same path the ☰ menu's entry takes. */
  enemySpeed: () => Speed;
  setEnemySpeed: (speed: Speed) => void;
  /**
   * READS for the skill picker (`intent/skill-picker.md`, AC-V23…V29) — the SAME
   * `Session` methods `hud.ts`'s ribbon/chip-strip/target-plate call, exposed so a
   * spec can assert on them directly rather than parsing rendered text. Chip
   * SELECTION itself is driven through the real chip elements
   * (`[data-testid="skill-chip"]`), not through this seam — there is no parallel
   * path for the gesture that matters (docs/10 §7).
   */
  commandMode: () => "attack" | "skill" | null;
  skillOptions: () => SkillOption[];
  selectedSkill: () => string | null;
  reach: () => Position[];
  actionReason: () => string | null;
  /**
   * TEST-ONLY, mirroring `CampaignShell.updateParty`'s own test usage
   * (`campaign-shell.test.ts`, `updateParty({ ..., ap: 500 })`) — not reachable from
   * any control a player has, and it touches no command. Exists so a browser spec can
   * reach a REAL second learned skill (e.g. `aim.leg-shot`, requires `aimed-shot`,
   * 120 AP) through the SAME `prep().learn()` a player's LEARN button calls, without
   * grinding several battles' worth of AP first. Between battles only, same guard as
   * `updateParty`.
   */
  grantTestAp: (recordId: string, amount: number) => void;
}

/** The prep methods the page exposes; a subset of `PrepHandle`, by value where it can be. */
export interface PrepSeam {
  record: () => UnitRecord;
  records: () => UnitRecord[];
  select: (recordId: string) => void;
  commands: () => string[];
  setSlot: (slot: LoadoutSlot, value: string | null) => void;
  setJob: (jobId: string) => void;
  learn: (jobId: string, nodeId: string) => void;
}

declare global {
  interface Window {
    tuhGame: GameApi;
  }
}
