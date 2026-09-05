/**
 * The game page's bootstrap — `index.html`, the SITE ROOT (docs/10 §7a) — a THIN adapter over {@link CampaignShell}, the same way
 * `main.ts` is a thin adapter over {@link Session}.
 *
 * Everything with a rule in it lives elsewhere: the campaign transitions in
 * `src/sim/campaign.ts`, the run in `campaign-shell.ts`, the battle in `session.ts`, the
 * honesty-critical panels in `panels.ts`. This file maps clicks onto shell methods,
 * shows one screen at a time, and exposes `window.tuhGame`.
 *
 * Wall-clock: the PLAYTEST LOG reads it, and nothing else does. Battles still advance on
 * an explicit click, exactly as the engine viewer does, and `Recorder` is a pure sink —
 * it is handed scalars, returns `void`, and holds no reference to the shell or the
 * session. So elapsed time is measured here and cannot reach `BattleState`.
 */

import type { Position, StoryBeat, UnitRecord } from "../sim/index.js";
import {
  ENCOUNTERS,
  PORTRAITS,
  battleTitle,
  campaign,
  registry,
  story,
  terrainFor,
} from "./campaign-data.js";
import { CampaignShell, type Screen } from "./campaign-shell.js";
import type { GameApi, PrepSeam } from "./game-api.js";
import { HELP_TOPICS } from "./help.js";
import { draw, pickTile, FIELD_THEME, RING_FILL_ALPHA } from "./iso.js";
import { MotionDirector, prefersReducedMotion, type MotionBeat } from "./motion.js";
import {
  logHtml,
  previewHtml,
  statusHtml,
  timelineHtml,
  unitCardHtml,
  type LookUp,
} from "./panels.js";
import { jobLabel, mountPrep, type PrepHandle } from "./prep.js";
import { wireLandscapeButton } from "./orientation.js";
import { mountScene, type SceneHandle } from "./scene.js";
import { SAVE_KEY, browserSlot, memorySlot } from "./storage.js";
import { PLAYTEST_LOG_KEY, Recorder, diffRecord, summarize } from "./telemetry.js";
import type { Phase, Session } from "./session.js";

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = el<HTMLCanvasElement>("grid");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d canvas context unavailable");

/**
 * `localStorage` can be missing entirely (a sandboxed frame). Fall back to an in-memory
 * slot so the game still runs — and say so on the title screen rather than letting the
 * player finish a campaign that was never going to be saved.
 */
const storageAvailable = typeof localStorage !== "undefined";
const shell = new CampaignShell({
  def: campaign,
  encounters: ENCOUNTERS,
  registry,
  slot: storageAvailable ? browserSlot(localStorage) : memorySlot(),
  story,
});

/**
 * The playtest log (docs/plans step B1). Its own storage key, never the save's — see
 * `telemetry.ts`. In-memory when the browser refuses storage, for the same reason the
 * save falls back: an unrecordable session is still a playable one.
 *
 * WALL-CLOCK ENTERS HERE AND GOES NOWHERE ELSE. `Recorder` is fed scalars and copies,
 * holds no reference to the shell or the session, and returns `void` from every
 * observation — so nothing it measures can reach `BattleState`.
 */
const telemetry = new Recorder({
  slot: storageAvailable ? browserSlot(localStorage, PLAYTEST_LOG_KEY) : memorySlot(),
});

const SCREENS: Screen[] = ["TITLE", "SCENE", "BRIEFING", "BATTLE", "AFTER_BATTLE", "COMPLETED"];
const SCREEN_EL: Record<Screen, string> = {
  TITLE: "screen-title",
  SCENE: "screen-scene",
  BRIEFING: "screen-briefing",
  BATTLE: "screen-battle",
  AFTER_BATTLE: "screen-after",
  COMPLETED: "screen-completed",
};

const PHASE_TEXT: Record<Phase, string> = {
  AWAIT_ACTOR: "Advancing the clock…",
  PLAYER_IDLE: "Your turn — click a tile to move, or an enemy to strike",
  MOVE_STAGED: "Move staged — click an enemy to strike from there, or End Turn",
  AI_TURN: "Enemy turn — press Play enemy turn to watch it resolve",
  ENDED: "Battle over",
};

/**
 * The two screens that carry the "copy playtest log" control (docs/plans step B2) — the
 * title and the ending, the places a player is done rather than mid-run.
 *
 * TWO BLOCKS OF MARKUP, ONE RENDERER. A DOM node lives in exactly one place, so the
 * control is authored twice in `index.html` and driven from here over this list — the
 * same shape `renderStory(id, beat)` uses. Rendering only one of them is what a screen
 * the state machine skips looks like, and the ending screen is precisely the one this
 * repo has already shipped unreachable content on once.
 */
const LOG_SCREENS = ["title", "done"] as const;

/** Plain names for the screens, for a sentence a playtester reads. */
const SCREEN_LABEL: Record<Screen, string> = {
  TITLE: "the title screen",
  SCENE: "a story scene",
  BRIEFING: "a briefing",
  BATTLE: "a battle",
  AFTER_BATTLE: "the after-battle screen",
  COMPLETED: "the ending",
};

/** Team colours match the engine viewer's legend: team 0 blue, everyone else red. */
const TEAM_COLOR = ["#4f8cff", "#e2603c", "#8ad17a", "#c58bff"];
/** A team the palette has no entry for. One fallback, so the legend cannot quote a second. */
const UNKNOWN_TEAM_COLOR = "#9aa4bb";
const teamColor = (teamId: number): string => TEAM_COLOR[teamId] ?? UNKNOWN_TEAM_COLOR;

/** The one bundled portrait asset. Resolved once so a missing key fails at boot, not mid-battle. */
const PORTRAIT_PLACEHOLDER: string = (() => {
  const url = PORTRAITS["placeholder"];
  if (url === undefined) throw new Error("no placeholder portrait is bundled");
  return url;
})();

/**
 * Presentation for the CURRENT battle, derived from the shell's own record names.
 *
 * `job` and `portrait` feed the mini stat card. Job comes from the SAME placement walk
 * the names do (`deployedRecords`), so the card can never caption one unit's name with
 * another's job. It is spread conditionally rather than defaulted: a slot with no record
 * shows no job row at all, which is the honest answer, and `exactOptionalPropertyTypes`
 * makes `job: undefined` a compile error.
 *
 * EVERY UNIT GETS THE `placeholder` KEY, deliberately — no portrait art exists yet
 * (`PORTRAITS` holds exactly one entry, and `campaign-data.ts`'s boot check plus the
 * `["placeholder"]` tripwire in `campaign-shell.test.ts` both police that). The card
 * captions it "portrait pending" off the KEY, so the day a real job x gender table lands
 * the caption disappears for the units that have art without any change here.
 */
function look(): LookUp {
  const names = shell.unitNames();
  const jobs = shell.unitJobs();
  const state = shell.session?.state;
  return (id) => {
    const unit = state?.units.find((u) => u.id === id);
    if (!unit) return undefined;
    const job = jobs[id];
    return {
      label: names[id] ?? id,
      color: teamColor(unit.teamId),
      ...(job !== undefined ? { job: jobLabel(job) } : {}),
      portrait: { url: PORTRAIT_PLACEHOLDER, key: "placeholder" },
    };
  };
}


/**
 * One mounted scene per story host, kept OUT of the DOM so a repaint cannot reset how
 * much has been read. Lazily filled, exactly as the prep panel is.
 */
const scenes = new Map<string, SceneHandle>();

let canvasFocused = false;

/**
 * THE PAGE OWNS THE CLOCK (docs/10 §3a). `draw` stays a pure function of `(state, opts)`;
 * everything about elapsed time lives here and in `motion.ts`, and the only thing that
 * crosses into the renderer is one plain `MotionState` value.
 *
 * Wall-clock is now read by TWO things on this page — the playtest log and this — and
 * neither can reach `BattleState`. The battle still advances only on an explicit click or
 * seam call, so "how many commands have been applied" is a function of input order alone.
 */
const motion = new MotionDirector({
  nameOf: (id) => look()(id)?.label ?? id,
  reduced: prefersReducedMotion,
});
/** The beat already handed to {@link motion}; a new one starts an animation. */
let lastBeat: MotionBeat | null = null;
let motionFrame: number | null = null;

// ─── painting ───────────────────────────────────────────────────────────────

function renderScreens(): void {
  for (const s of SCREENS) {
    el(SCREEN_EL[s]).hidden = s !== shell.screen;
  }
}

function renderTitle(): void {
  const continueBtn = el<HTMLButtonElement>("btn-continue");
  continueBtn.disabled = !shell.canContinue();
  el<HTMLButtonElement>("btn-erase").disabled = shell.slotState.kind === "empty";

  const slot = shell.slotState;
  const note = el("title-slot");
  if (slot.kind === "save") {
    const done = slot.save.history.filter((h) => h.outcome === "victory").length;
    note.className = "reason info";
    note.textContent =
      slot.save.status === "completed"
        ? `Saved run: finished — all ${campaign.battles.length} battles won.`
        : `Saved run: battle ${slot.save.battleIndex + 1} of ${campaign.battles.length}` +
          `${slot.save.status === "gameOver" ? " (lost — retry pending)" : ""}, ${done} won.`;
  } else if (slot.kind === "error") {
    // Loud, and specific. A save that cannot be read is the player's business —
    // silently offering "New Game" alone would look like they never had a save.
    note.className = "reason warn";
    note.textContent = `${slot.message} — New Game still works, but Continue does not.`;
  } else {
    note.className = "reason info";
    note.textContent = storageAvailable
      ? "No saved run yet. New Game starts the campaign."
      : "This browser is not letting the game store data, so progress will NOT be saved.";
  }
  renderLogControl();
}

/**
 * Draw one story beat, or hide the block entirely when the pack authors nothing here.
 *
 * HIDDEN, not empty: an unauthored moment is a legitimate choice (`storyBeat` returns
 * `null` for it), and rendering an empty bordered box in its place would present an
 * authoring gap as a scene. Same rule as the preview panel's absent-not-zero.
 *
 * The reveal state lives in the mounted {@link SceneHandle}, NOT in the DOM this
 * function touches, because this function is reached from `refresh()` — which the prep
 * panel's `onChange` and every deploy toggle also trigger, on the very screen a scene is
 * being read. See `scene.ts`'s header. The KEY is what makes that safe: an unchanged key
 * is a no-op all the way down.
 */
function renderStory(id: string, key: string, beat: StoryBeat | null): void {
  let handle = scenes.get(id);
  if (!handle) {
    handle = mountScene(el(id), {
      portraits: PORTRAITS,
      onAction: (action) => {
        telemetry.action(shell.screen, action);
      },
    });
    scenes.set(id, handle);
  }
  handle.setBeat(key, beat === null ? null : shell.resolve(beat));
}

/**
 * The key identifying WHICH beat a host is showing, so a repaint of the same beat is a
 * no-op and a genuinely new beat starts from line one.
 *
 * Strings assembled from save state rather than object identity: a beat object is
 * re-derived on every call, so identity would never match, and a `.map()` appearing
 * anywhere in an accessor's path would break an identity check silently.
 *
 * `attempts` is in the briefing key on purpose — a retry is a fresh read of the same
 * scene, and the player has been away to a battle in between.
 */
function preKey(): string {
  const brief = shell.briefing();
  if (!brief) return "brief:none";
  const attempts = shell.save?.history.filter((h) => h.battleId === brief.battleId).length ?? 0;
  return `brief:${brief.battleId}:${attempts}`;
}

function outcomeKey(): string {
  const history = shell.save?.history ?? [];
  const last = history.at(-1);
  return last ? `outcome:${last.battleId}:${last.outcome}:${history.length}` : "outcome:none";
}

/**
 * The between-battle prep panel (docs/11 M0 item 3), mounted once and re-pointed at the
 * save's party on every briefing.
 *
 * `onChange` routes straight to `shell.updateParty`, which is `updatePartyMember` plus a
 * write — so a loadout swap, a job change or an AP purchase is in the save file before
 * the player reaches Deploy. Mounted lazily because the panel needs a party to exist,
 * and there is none on the title screen.
 */
let prep: PrepHandle | null = null;

/**
 * The last record the log saw for each member, so an edit can be DIFFED rather than
 * declared. The panel reports "this record changed" and nothing finer, and a recorder
 * that logged the click instead of the delta would credit an edit the sim refused —
 * the same discipline `playtest.ts` uses for its decision count.
 *
 * Re-seeded on every `renderPrep`, which runs AFTER an edit has been diffed and BEFORE
 * the next one can arrive: `onChange` repaints through `renderBriefingText`, and only
 * the enclosing `guard`'s `refresh` comes back through here.
 */
const prepSeen = new Map<string, UnitRecord>();

function renderPrep(): void {
  const party = shell.save?.party;
  if (!party || party.length === 0) return;
  if (!prep) {
    prep = mountPrep(el("prep-body"), {
      registry,
      records: party,
      inventory: shell.save?.inventory ?? [],
      progression: true,
      onChange: (record) => {
        const before = prepSeen.get(record.id);
        if (before) telemetry.prep(record.id, diffRecord(before, record));
        shell.updateParty(record);
        // Repaint the screens that show party state (the roster list, the save note).
        // The panel has already redrawn itself.
        renderBriefingText();
      },
    });
    seedPrepSeen(party);
    return;
  }
  // Both no-op when nothing changed, so this cannot steal focus mid-edit. The
  // inventory is re-pointed too: a battle's grant lands between briefings, so a panel
  // that only re-read the party would show the new weapon nowhere until a reload.
  prep.setInventory(shell.save?.inventory ?? []);
  prep.setRecords(party);
  seedPrepSeen(party);
}

/** Point the diff baseline at the party as it now stands in the save. */
function seedPrepSeen(party: readonly UnitRecord[]): void {
  prepSeen.clear();
  for (const r of party) prepSeen.set(r.id, r);
}

/** Everything on the briefing EXCEPT the prep panel, which owns its own repaint. */
function renderBriefingText(): void {
  const brief = shell.briefing();
  if (!brief) return;
  el("brief-step").textContent = `Battle ${brief.step} of ${brief.total}`;
  // The authored scene name when the story pack has one, the id-derived fallback when it
  // does not — the page prefers data over its own derivation, which is what makes the
  // title part of the story seam rather than a naming convention.
  el("brief-title").textContent = shell.sceneTitle() ?? battleTitle(brief.encounterId);
  renderStory("brief-story", preKey(), shell.preBeat());
  el("brief-note").textContent = brief.retrying
    ? "You lost this one. The party is exactly as it was before the first attempt."
    : "Your party carries everything it has earned so far.";
  const party = shell.save?.party ?? [];
  const dep = shell.deployment();
  const chosen = new Set(dep?.chosen ?? party.map((r) => r.id));

  // Every member is listed, but WHO FIGHTS is marked — the briefing used to show four
  // names and then send two, which reads as a bug rather than as the authored ramp it is.
  el("brief-party").innerHTML = party
    .map((r) => {
      const going = chosen.has(r.id);
      return (
        `<li class="${going ? "deployed" : "benched"}">` +
        `<button type="button" class="pick" data-deploy="${r.id}"` +
        ` aria-pressed="${going}" title="${going ? "Deployed — click to bench" : "Benched — click to deploy"}">` +
        `${going ? "▪" : "▫"}</button> ` +
        `<b>${r.name}</b> · ${r.currentJob} · <span class="muted">${r.ap} AP banked</span>` +
        `${going ? "" : ` <span class="muted">· benched</span>`}</li>`
      );
    })
    .join("");

  const note = el("brief-deploy-note");
  if (dep === null) {
    note.hidden = true;
  } else {
    note.hidden = false;
    note.textContent =
      `This battle fields ${dep.slots} of ${party.length}. ` +
      `A benched member earns no AP — click a name to swap.`;
  }

  // Rebound on every repaint because the list is rewritten wholesale.
  for (const btn of el("brief-party").querySelectorAll<HTMLButtonElement>("button[data-deploy]")) {
    btn.addEventListener("click", () => guard(() => toggleDeploy(btn.dataset["deploy"] as string)));
  }
}

/**
 * Swap one member in or out.
 *
 * The slot count is FIXED by the encounter, so benching somebody is only legal when
 * another is benched to take their place — otherwise the click would silently shrink
 * the party the battle expects. Deploying somebody when the roster is full replaces the
 * FIRST currently-deployed member who was not just clicked, which is what "swap" means
 * with no drag-and-drop: one click, one exchange, and the reason is visible in the list.
 */
function toggleDeploy(id: string): void {
  const dep = shell.deployment();
  if (!dep) return;
  const chosen = [...dep.chosen];
  const at = chosen.indexOf(id);
  if (at !== -1) {
    // Benching: only if somebody is waiting to take the slot.
    const bench = dep.party.map((r) => r.id).filter((pid) => !chosen.includes(pid));
    if (bench.length === 0) return;
    chosen[at] = bench[0]!;
  } else {
    // Deploying: take the first slot, pushing its occupant to the bench.
    chosen[0] = id;
  }
  shell.setDeployment(chosen);
  telemetry.deploy(chosen);
  refresh();
}

function renderBriefing(): void {
  renderBriefingText();
  renderPrep();
}

/**
 * THE CANVAS ALONE — the only thing the animation frame loop repaints.
 *
 * Split out of {@link renderBattle} deliberately: a full `refresh()` rebuilds every
 * panel, re-runs eight forecast clones and files a screen row with the playtest recorder.
 * Doing that sixty times a second would put the cost of a cosmetic flourish onto the
 * telemetry and the timeline. Nothing here reads or writes game state.
 */
function paintBoard(): void {
  const session = shell.session;
  if (!session || shell.screen !== "BATTLE") return;
  const active = session.actor();
  // The battle a player is LOOKING at, for its painted ground. `briefing()` reads the
  // save's pending battle, which on this screen is still the one being fought.
  const encounterId = shell.briefing()?.encounterId;
  // A battle with no authored terrain draws the flat look, unchanged — absent, not a
  // default map, because painting one battle's ground onto another's grid would be a lie
  // about where the fight is happening. The theme moves WITH the terrain: `FIELD_THEME`'s
  // blue range panels are unreadable on the dark slate the flat look paints.
  const terrain = encounterId === undefined ? undefined : terrainFor(encounterId);
  draw(ctx!, session.state, canvas.width, canvas.height, {
    ...(terrain ? { terrain, theme: FIELD_THEME } : {}),
    activeId: active?.id,
    activeControl:
      active === undefined ? undefined : active.teamId === session.playerTeam ? "player" : "ai",
    range: session.moveTiles(),
    targets: session.targetTiles(),
    staged: session.stagedTile(),
    cursor: canvasFocused ? session.cursor : null,
    popups: session.popups,
    // Friend vs foe, on the BOARD — not only in the timeline chips. Without this the
    // campaign's units all fall through to one grey and a player cannot tell their
    // party from the enemy by looking at the grid.
    unitColor: (u) => teamColor(u.teamId),
    motion: motion.sample(),
  });
}

/**
 * Hand a freshly committed beat to the director, if there is a new one.
 *
 * Identity, not a deep compare: `Session.commit` builds a fresh object every time and
 * `reset()` nulls it, so `!==` is exact. It is a stored field, never a value re-derived
 * per call — the trap `scene.ts` documents.
 */
function syncMotion(session: Session): void {
  if (session.beat === lastBeat) return;
  lastBeat = session.beat;
  if (lastBeat === null) {
    motion.clear();
    return;
  }
  motion.start(lastBeat);
  pumpMotion();
}

/**
 * The page's ONLY frame loop, and it STOPS. `running()` goes false the moment the
 * current beat's clock runs out, is settled or is pinned — so an idle board burns
 * nothing, which is the difference between an animation and a spinning canvas.
 */
function pumpMotion(): void {
  if (motionFrame !== null || !motion.running()) return;
  if (typeof requestAnimationFrame !== "function") return;
  const tick = (): void => {
    motionFrame = null;
    paintBoard();
    if (motion.running()) motionFrame = requestAnimationFrame(tick);
  };
  motionFrame = requestAnimationFrame(tick);
}

function renderBattle(): void {
  const session = shell.session;
  if (!session) return;
  const lk = look();
  syncMotion(session);
  paintBoard();
  el("timeline").innerHTML = timelineHtml(session.state, lk);
  el("unit-card").innerHTML = unitCardHtml(session.state, lk);
  el("status").innerHTML = statusHtml(session, lk);
  el("preview").innerHTML = previewHtml(session, lk);
  el("log").innerHTML = logHtml(session.state, lk, "No turns yet — move or strike to begin.");

  const playable = session.phase === "PLAYER_IDLE" || session.phase === "MOVE_STAGED";
  const endTurnBtn = el<HTMLButtonElement>("btn-end-turn");
  endTurnBtn.textContent = session.endTurnLabel();
  endTurnBtn.disabled = !playable;
  el<HTMLButtonElement>("btn-cancel").disabled = session.phase !== "MOVE_STAGED";
  const stepBtn = el<HTMLButtonElement>("btn-step");
  stepBtn.textContent = session.phase === "AI_TURN" ? "Play enemy turn ▸" : "Auto-play my turn ▸";
  stepBtn.disabled = session.phase === "ENDED";
  el<HTMLButtonElement>("btn-conclude").hidden = session.phase !== "ENDED";

  const reason = el("reason");
  const text = session.fatal ?? session.reason ?? session.outcome ?? PHASE_TEXT[session.phase];
  reason.className = `reason ${session.fatal ? "fatal" : session.reason ? "warn" : "info"}`;
  reason.textContent = text;
}

/**
 * A standalone scene — a prologue, an interlude, an epilogue (docs/10 AC-V17).
 *
 * The whole screen is the scene, which is why this is the one screen that takes a
 * document-level key handler and moves focus. The briefing deliberately gets neither:
 * it is full of selects and buttons where Space and Enter already mean something.
 */
function renderScene(): void {
  const scene = shell.pendingScene();
  if (!scene) return;
  el("scene-title").textContent = scene.title ?? "";
  el("scene-title").hidden = scene.title === undefined;
  renderStory("scene-story", `scene:${scene.id}`, scene.beat);
}

function renderAfter(): void {
  const outcome = shell.lastOutcome();
  const won = outcome === "victory";
  el("after-title").textContent = won ? "Battle won" : "Battle lost";
  el("after-note").textContent = won
    ? "AP is banked. The party redeploys at full HP — nobody is lost in this chapter."
    : "Nothing was spent. Retry the same battle with exactly the party you had.";
  renderStory("after-story", outcomeKey(), shell.outcomeBeat());
  el<HTMLButtonElement>("btn-next").hidden = !won;
  el<HTMLButtonElement>("btn-retry").hidden = won;
}

function renderCompleted(): void {
  // The FINAL victory never passes through the after-battle screen — winning the last
  // battle goes straight to `COMPLETED` — so the last battle's victory scene would be
  // the one beat in the pack a player could never read. It belongs here.
  renderStory("done-story", outcomeKey(), shell.outcomeBeat());
  const wins = shell.save?.history.filter((h) => h.outcome === "victory").length ?? 0;
  const losses = (shell.save?.history.length ?? 0) - wins;
  el("done-note").textContent =
    `The First March is over — ${wins} battles won` +
    (losses > 0 ? `, ${losses} lost along the way.` : ", start to finish.");
  renderLogControl();
}

/**
 * What the log control says before it is clicked.
 *
 * IT DISCLOSES WHAT IS COLLECTED. A page that records a session and mentions it only in
 * a button label is collecting quietly, and the honest version costs two sentences. It
 * also reports when the log is known to be incomplete, because a reader who cannot see
 * that would take a truncated funnel for a whole one.
 */
function logNote(): string {
  const log = telemetry.snapshot();
  if (log.events.length === 0) {
    return "Nothing recorded yet. Play, then come back here to copy a record of the session.";
  }
  const s = summarize(log);
  const where = s.stoppedAt
    ? `${SCREEN_LABEL[s.stoppedAt.screen]}${s.stoppedAt.battleStep === null ? "" : ` (battle ${s.stoppedAt.battleStep})`}`
    : "nowhere yet";
  const n = log.events.length;
  return (
    `${n} moment${n === 1 ? "" : "s"} recorded, up to ${where}. ` +
    // Widened when the scene player landed: how much of a scene a player reads is a new
    // CATEGORY of collected thing, and this sentence is the only place the page says
    // what it keeps. Collection widening without this widening is what turns a complete
    // disclosure into a partial one, silently.
    "The log holds which screens you saw, how long each took, how much of each story " +
    "scene you read, what you bought and equipped, " +
    "and how each battle went — no name, no typing, and no date or time of day. " +
    "Nothing is sent anywhere: copying puts it on your clipboard and that is all." +
    (s.incomplete ? " Some of it was dropped, so the timings are a lower bound." : "")
  );
}

function renderLogControl(): void {
  for (const k of LOG_SCREENS) el(`log-note-${k}`).textContent = logNote();
}

/**
 * Put the log on the clipboard, and ALWAYS into the textarea first.
 *
 * The textarea is the payload; the clipboard is a convenience on top of it. A browser
 * can refuse `navigator.clipboard` outright (an insecure context, a denied permission),
 * and a control that only tried the clipboard would then look like it worked and hand
 * the playtester nothing. Same rule as `storage.ts`: failure is a state, not a crash.
 */
function copyLog(k: (typeof LOG_SCREENS)[number]): void {
  // Recorded BEFORE serializing, so the copied payload contains the copy itself —
  // "did the playtester actually click it" is otherwise unanswerable.
  telemetry.action(shell.screen, `btn-log-${k}`);
  const json = telemetry.serialize();
  const box = el<HTMLTextAreaElement>(`log-text-${k}`);
  const note = el(`log-note-${k}`);
  box.value = json;

  const fallback = (): void => {
    box.hidden = false;
    box.select();
    note.textContent =
      "This browser would not let the page use the clipboard. Select the text below and copy it.";
  };

  const clip = navigator.clipboard as Clipboard | undefined;
  if (!clip || typeof clip.writeText !== "function") {
    fallback();
    return;
  }
  void clip.writeText(json).then(() => {
    note.textContent = `Copied — ${json.length} characters on your clipboard. Paste it wherever you were asked to.`;
  }, fallback);
}

for (const k of LOG_SCREENS) {
  el(`btn-log-${k}`).addEventListener("click", () => copyLog(k));
}

function renderSaveError(): void {
  const box = el("save-error");
  box.hidden = shell.saveError === null;
  box.textContent = shell.saveError
    ? `Progress could NOT be saved: ${shell.saveError}. The run continues, but closing this tab will lose it.`
    : "";
}

/**
 * The battle the player is on, for the log — supplied ONLY where it is unambiguous.
 *
 * `briefing()` reads the save's PENDING battle, which has already moved past the one
 * just fought by the time the after-battle screen renders. Reporting it there would
 * label the wrong fight, so those screens carry no step and `summarize` holds the last
 * one it saw. `undefined`, not 0 — absent, never a modeled zero.
 */
function loggedStep(): number | undefined {
  // Deliberately NOT on SCENE. A scene sits between battles, so "which battle step is
  // this" has two defensible answers there — absent, not a guess (absent-not-zero).
  if (shell.screen !== "BRIEFING" && shell.screen !== "BATTLE") return undefined;
  return shell.briefing()?.step;
}

function refresh(): void {
  // Before painting, so the log's screen order matches the player's, and `Recorder`
  // drops the repeats: `refresh` runs on every repaint, a screen change does not.
  telemetry.screen(shell.screen, loggedStep());
  renderScreens();
  renderSaveError();
  switch (shell.screen) {
    case "TITLE":
      renderTitle();
      break;
    case "SCENE":
      renderScene();
      break;
    case "BRIEFING":
      renderBriefing();
      break;
    case "BATTLE":
      renderBattle();
      break;
    case "AFTER_BATTLE":
      renderAfter();
      break;
    case "COMPLETED":
      renderCompleted();
      break;
  }
}

/**
 * Run a mutation and ALWAYS repaint, even when it throws — the same reason `main.ts`
 * does it: a fatal viewer/sim fork is written into `session.fatal` and RETHROWN, and a
 * handler that skipped the repaint would leave the one screen the message was written
 * for showing stale state while the only trace went to the console.
 */
function guard(mutate: () => void): void {
  try {
    mutate();
  } finally {
    refresh();
  }
}

/**
 * A named player action: log it, then run it under {@link guard}.
 *
 * The screen is read BEFORE the mutation — an action belongs to the screen it was taken
 * on, not the one it led to. Every button and every `window.tuhGame` entry goes through
 * here, so the log cannot tell a click from the test seam; that is deliberate, and it is
 * what lets a browser spec assert against the same rows a human generates.
 */
/**
 * Bank the finished battle AND log how it went.
 *
 * The reads happen BEFORE `concludeBattle`, which nulls the session and advances the
 * save's battle index — afterwards there is no report to read and `briefing()` names
 * the NEXT fight. `attempt` is counted off `history` after banking, where this run's
 * own row is the last of however many this battle has now taken.
 *
 * Nothing here re-derives an outcome: `outcome` and `turns` come from the same
 * `RunReport` the campaign banked, so the log and the save cannot disagree.
 */
function concludeAndLog(): void {
  const step = shell.briefing()?.step ?? null;
  const report = shell.session?.report() ?? null;
  shell.concludeBattle();
  const history = shell.save?.history ?? [];
  const last = history.at(-1);
  if (step === null || report === null || last === undefined) return;
  telemetry.battle({
    battleId: last.battleId,
    step,
    attempt: history.filter((h) => h.battleId === last.battleId).length,
    outcome: last.outcome,
    turns: report.turns,
    ticks: report.ticks,
  });
}

function act(action: string, mutate: () => void): void {
  telemetry.action(shell.screen, action);
  guard(mutate);
}

// ─── input ──────────────────────────────────────────────────────────────────

function withSession(fn: (s: Session) => void): void {
  guard(() => {
    if (shell.session) fn(shell.session);
  });
}

function toCanvasPoint(ev: { clientX: number; clientY: number }): Position {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) * canvas.width) / rect.width,
    y: ((ev.clientY - rect.top) * canvas.height) / rect.height,
  };
}

canvas.addEventListener("pointerdown", (ev) => {
  if (ev.button === 2) return;
  canvas.focus();
  telemetry.action(shell.screen, "pick");
  const p = toCanvasPoint(ev);
  withSession((s) => s.onPick(pickTile(s.state, p.x, p.y, canvas.width, canvas.height)));
});
canvas.addEventListener("pointermove", (ev) => {
  const p = toCanvasPoint(ev);
  withSession((s) => s.onTileHover(pickTile(s.state, p.x, p.y, canvas.width, canvas.height)));
});
canvas.addEventListener("pointerleave", () => withSession((s) => s.onTileHover(null)));
canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  withSession((s) => s.cancel());
});
canvas.addEventListener("focus", () => {
  canvasFocused = true;
  refresh();
});
canvas.addEventListener("blur", () => {
  canvasFocused = false;
  refresh();
});

/** Keyboard reachability (docs/04 §7): arrows walk a tile cursor, Enter picks, Esc cancels. */
const CURSOR_STEP: Record<string, Position> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};
canvas.addEventListener("keydown", (ev) => {
  const stepVec = CURSOR_STEP[ev.key];
  if (stepVec) {
    ev.preventDefault();
    withSession((s) => s.moveCursor(stepVec.x, stepVec.y));
    return;
  }
  if (ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    telemetry.action(shell.screen, "pick");
    withSession((s) => s.onPick(s.cursor));
    return;
  }
  if (ev.key === "Escape") {
    ev.preventDefault();
    withSession((s) => s.cancel());
  }
});

/**
 * The help panel (docs/11 M0 item 7). Built once from {@link HELP_TOPICS} — the content
 * never changes at runtime, and rebuilding it on every open would throw away the
 * viewer's scroll position for no reason.
 *
 * `textContent`, never `innerHTML`, for the same reason `renderStory` uses it: this is
 * authored content rendered into a page, and the habit is worth more than the one case.
 */
function buildHelp(): void {
  const body = el("help-body");
  for (const topic of HELP_TOPICS) {
    const section = document.createElement("section");
    const h = document.createElement("h3");
    h.textContent = topic.title;
    section.append(h);
    for (const line of topic.lines) {
      const p = document.createElement("p");
      p.textContent = line;
      section.append(p);
    }
    body.append(section);
  }
}
buildHelp();

/**
 * Paint the legend's swatches from the BOARD'S OWN CONSTANTS (defect fixed 2026-09-02).
 *
 * The legend told every player who ever started a battle that the tiles they may walk to
 * are AMBER. They are pale blue: this file hands `draw` the `FIELD_THEME` whenever the
 * encounter has terrain, which is all five of them, and the amber belongs to
 * `DARK_THEME` — the engine viewer's palette, correct on `viewer.html` and nowhere here.
 * The turn-ring swatch was amber too against a gold ring. Nothing was wrong with the code
 * that drew the board; the stylesheet simply held a second opinion, and no test in the
 * tree compared a swatch to the theme it describes, so it survived the whole life of
 * painted ground (ADR-0030).
 *
 * So the swatches now carry no colour of their own — `index.html` declares none. Each is
 * set here from the same value the renderer is handed, which makes drift impossible
 * rather than merely unlikely.
 *
 * A SWATCH SHOWS THE PAINT, NOT THE COMPOSITE. `FIELD_THEME.highlight` carries its own
 * alpha (`b3`) and the board composites it over six painted ground tones, so there is no
 * single "how it looks on the field" to show; a swatch picking one would be a hand-chosen
 * lie about the other five. The swatch is therefore the theme string verbatim, left for
 * the browser to composite over the dark board card — which is one more reason that card
 * stays dark (see the note beside `.card.board` in `index.html`).
 *
 * Called once, like {@link buildHelp}: the legend is static markup and none of these
 * constants change at runtime.
 */
function paintLegend(): void {
  const sw = (key: string): HTMLElement => {
    const node = document.querySelector<HTMLElement>(`[data-testid="legend"] [data-sw="${key}"]`);
    if (node === null) throw new Error(`legend swatch "${key}" is missing from the page`);
    return node;
  };
  sw("party").style.background = teamColor(0);
  sw("foe").style.background = teamColor(1);
  sw("move").style.background = FIELD_THEME.highlight;
  // `drawUnit` strokes the active ring in `theme.active` and fills the disc with the
  // same colour at `RING_FILL_ALPHA`. The swatch is that disc, both halves.
  const ring = sw("ring");
  ring.style.borderColor = FIELD_THEME.active;
  ring.style.background = FIELD_THEME.active + RING_FILL_ALPHA;
}
paintLegend();

const helpDialog = el<HTMLDialogElement>("help");
// `showModal` gives focus trapping and Escape-to-close for free; the fallback keeps the
// panel usable where <dialog> is unsupported rather than silently doing nothing.
el("btn-help").addEventListener("click", () => {
  // Logged because "did the player ever open the manual, and when" is one of the few
  // onboarding questions the page can answer on its own (docs/11 M0 item 7).
  telemetry.action(shell.screen, "btn-help");
  if (typeof helpDialog.showModal === "function") helpDialog.showModal();
  else helpDialog.setAttribute("open", "");
});
el("btn-help-close").addEventListener("click", () => {
  if (typeof helpDialog.close === "function") helpDialog.close();
  else helpDialog.removeAttribute("open");
});

/** Bind a button. The id doubles as the log's action name — one name, one source. */
const on = (id: string, fn: () => void): void =>
  el(id).addEventListener("click", () => act(id, fn));

on("btn-new-game", () => shell.newGame());
on("btn-scene-continue", () => shell.endScene());
on("btn-continue", () => shell.continueGame());
on("btn-erase", () => shell.eraseSave());
on("btn-deploy", () => shell.deploy());
on("btn-brief-quit", () => shell.quitToTitle());
on("btn-conclude", () => concludeAndLog());
on("btn-next", () => shell.nextBattle());
on("btn-retry", () => shell.retry());
on("btn-after-quit", () => shell.quitToTitle());
on("btn-done-title", () => shell.quitToTitle());
on("btn-end-turn", () => shell.session?.endTurn());
on("btn-cancel", () => shell.session?.cancel());
on("btn-step", () => shell.session?.step());

/**
 * Keyboard on the SCENE screen, and ONLY there.
 *
 * A document-level handler is safe here because the whole screen is one scene with one
 * command. It is deliberately NOT installed on the briefing: that screen is full of
 * selects, checkboxes and buttons where Space and Enter already mean something, and a
 * document handler would fight them.
 *
 * The scene's own More/Show all buttons keep working by being real buttons — this only
 * adds the "press anything to continue" reflex a reader expects.
 */
document.addEventListener("keydown", (ev) => {
  if (shell.screen !== "SCENE") return;
  const handle = scenes.get("scene-story");
  const target = ev.target as HTMLElement | null;
  // Never swallow a key aimed at a control the player has actually focused.
  if (target && (target.tagName === "BUTTON" || target.tagName === "SELECT")) return;
  if (ev.key === "Enter" || ev.key === " " || ev.key === "ArrowRight") {
    ev.preventDefault();
    if (handle?.model && !handle.model.done) act("scene-key-advance", () => handle.advance());
    else act("scene-key-continue", () => shell.endScene());
    return;
  }
  if (ev.key === "End" || ev.key === "Escape") {
    ev.preventDefault();
    act("scene-key-all", () => handle?.showAll());
  }
});

/**
 * The shipped seam. Every entry routes through the SAME shell/session method a button
 * click reaches — there is no parallel path for tests (docs/10 §7).
 */
const api: GameApi = {
  screen: () => shell.screen,
  save: () => shell.save,
  canContinue: () => shell.canContinue(),
  newGame: () => act("btn-new-game", () => shell.newGame()),
  continueGame: () => act("btn-continue", () => shell.continueGame()),
  eraseSave: () => act("btn-erase", () => shell.eraseSave()),
  deploy: () => act("btn-deploy", () => shell.deploy()),
  step: () => act("btn-step", () => shell.session?.step()),
  autoplay: () =>
    act("autoplay", () => {
      const s = shell.session;
      if (!s) return;
      let steps = 0;
      while (s.phase !== "ENDED") {
        s.step();
        if (++steps > 600) throw new Error("autoplay: the battle never ended");
      }
    }),
  battleOver: () => shell.battleOver(),
  conclude: () => act("btn-conclude", () => concludeAndLog()),
  next: () => act("btn-next", () => shell.nextBattle()),
  retry: () => act("btn-retry", () => shell.retry()),
  // "quit", not a button id: three different buttons reach this, so naming one of
  // them would put a click in the log that nobody made.
  quitToTitle: () => act("quit", () => shell.quitToTitle()),
  storedSave: () => (storageAvailable ? localStorage.getItem(SAVE_KEY) : null),
  playtestLog: () => telemetry.snapshot(),
  clearPlaytestLog: () => telemetry.clear(),
  // Camera controls, not game actions: deliberately NOT routed through `act()`, because a
  // row in the playtest log would claim a player did something they did not.
  settleMotion: () => {
    motion.settle();
    paintBoard();
  },
  freezeMotion: (ms) => {
    motion.freeze(ms);
    paintBoard();
    pumpMotion();
  },
  prep: (): PrepSeam | null => {
    const h = prep;
    if (!h) return null;
    // Each entry is the handle's own method — the one the panel's controls call — so
    // there is no parallel path for tests (docs/10 §7). `guard` around the mutators for
    // the same reason every button has it: repaint even when the sim refuses the edit.
    return {
      record: h.record,
      records: h.records,
      select: (id) => guard(() => h.select(id)),
      commands: h.commands,
      setSlot: (slot, value) => guard(() => h.setSlot(slot, value)),
      setJob: (jobId) => guard(() => h.setJob(jobId)),
      learn: (jobId, nodeId) => guard(() => h.learn(jobId, nodeId)),
    };
  },
};
window.tuhGame = api;

refresh();

// AC-V32: the rotate gate's one button. The gate itself is pure CSS (AC-V30) — this
// only adds the best-effort fullscreen + landscape lock, which needs a user gesture and
// is a no-op wherever the APIs are absent (iOS Safari).
wireLandscapeButton(document, window.screen);
