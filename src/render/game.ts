/**
 * The game page's bootstrap — a THIN adapter over {@link CampaignShell}, the same way
 * `main.ts` is a thin adapter over {@link Session}.
 *
 * Everything with a rule in it lives elsewhere: the campaign transitions in
 * `src/sim/campaign.ts`, the run in `campaign-shell.ts`, the battle in `session.ts`, the
 * honesty-critical panels in `panels.ts`. This file maps clicks onto shell methods,
 * shows one screen at a time, and exposes `window.tuhGame`.
 *
 * Wall-clock: none. Battles advance on an explicit click, exactly as the engine viewer
 * does, so nothing derived from elapsed time can reach `BattleState`.
 */

import type { Position, StoryBeat, UnitRecord } from "../sim/index.js";
import { ENCOUNTERS, battleTitle, campaign, registry, story } from "./campaign-data.js";
import { CampaignShell, type Screen } from "./campaign-shell.js";
import type { GameApi, PrepSeam } from "./game-api.js";
import { HELP_TOPICS } from "./help.js";
import { draw, pickTile } from "./iso.js";
import { logHtml, previewHtml, statusHtml, timelineHtml, type LookUp } from "./panels.js";
import { mountPrep, type PrepHandle } from "./prep.js";
import { SAVE_KEY, browserSlot, memorySlot } from "./storage.js";
import { LOG_KEY, Recorder, type LoggedAction } from "./telemetry.js";
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
 * The playtest log (Part B of the synthetic-playtest slice).
 *
 * OBSERVES ONLY. Nothing below reads it back into the shell or the session — every call
 * is one-way, which is what makes wall-clock legal here at all (`docs/05` §3 bans it from
 * anything that can reach `BattleState`). It shares the page's storage but never the
 * save's key: erasing a run keeps the log, because the run that was erased is data.
 */
const recorder = new Recorder({ storage: storageAvailable ? localStorage : undefined });

/** Record an action, then do the thing. Never the reverse — a throw must still be seen. */
const noted = (kind: LoggedAction, fn: () => void): (() => void) => () => {
  recorder.action(kind);
  fn();
};

const SCREENS: Screen[] = ["TITLE", "BRIEFING", "BATTLE", "AFTER_BATTLE", "COMPLETED"];
const SCREEN_EL: Record<Screen, string> = {
  TITLE: "screen-title",
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

/** Team colours match the engine viewer's legend: team 0 blue, everyone else red. */
const TEAM_COLOR = ["#4f8cff", "#e2603c", "#8ad17a", "#c58bff"];

/** Presentation for the CURRENT battle, derived from the shell's own record names. */
function look(): LookUp {
  const names = shell.unitNames();
  const state = shell.session?.state;
  return (id) => {
    const unit = state?.units.find((u) => u.id === id);
    if (!unit) return undefined;
    return {
      label: names[id] ?? id,
      color: TEAM_COLOR[unit.teamId] ?? "#9aa4bb",
    };
  };
}

let canvasFocused = false;

// ─── painting ───────────────────────────────────────────────────────────────

function renderScreens(): void {
  for (const s of SCREENS) {
    el(SCREEN_EL[s]).hidden = s !== shell.screen;
  }
}

function renderTitle(): void {
  renderLogNote("log-note");
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
}

/**
 * Draw one story beat, or hide the block entirely when the pack authors nothing here.
 *
 * HIDDEN, not empty: an unauthored moment is a legitimate choice (`storyBeat` returns
 * `null` for it), and rendering an empty bordered box in its place would present an
 * authoring gap as a scene. Same rule as the preview panel's absent-not-zero.
 *
 * `textContent`, never `innerHTML` — story text is CONTENT from a data file, and the
 * seam exists so a separate repo can supply it. Interpolating it as markup would make
 * every future story author able to inject script into the page.
 */
function renderStory(id: string, beat: StoryBeat | null): void {
  const box = el(id);
  box.hidden = beat === null;
  box.textContent = "";
  if (!beat) return;
  if (beat.speaker !== undefined) {
    const who = document.createElement("p");
    who.className = "who";
    who.textContent = beat.speaker;
    box.append(who);
  }
  for (const line of beat.lines) {
    const p = document.createElement("p");
    p.className = "line";
    p.textContent = line;
    box.append(p);
  }
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
 * What changed between two versions of one party member, as log actions.
 *
 * A LIST rather than one verdict: a single purchase can complete a mastery and a single
 * job change can clear a colliding secondary, so one `onChange` legitimately carries two
 * edits. Collapsing them to "something changed" would make the counts undercount exactly
 * the players who used the panel most.
 */
function classifyEdit(before: UnitRecord, after: UnitRecord): LoggedAction[] {
  const kinds: LoggedAction[] = [];
  if (after.learned.length > before.learned.length) kinds.push("buy");
  if (after.currentJob !== before.currentJob) kinds.push("change-job");
  if (after.weapon !== before.weapon) kinds.push("change-weapon");
  for (const slot of ["secondary", "reaction", "support", "movement"] as const) {
    if (before.loadout[slot] !== after.loadout[slot]) {
      kinds.push("equip");
      break;
    }
  }
  return kinds;
}

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
        // CLASSIFIED BY DIFFING THE RECORD, not by wiring each control. Every edit the
        // panel makes bottoms out in one `commit` and arrives here — the panel's own
        // clicks and the `window.tuhGame.prep` seam alike — so recording at this one
        // point cannot miss a control, and a control added later is covered for free.
        const before = shell.save?.party.find((r) => r.id === record.id);
        shell.updateParty(record);
        if (before) for (const kind of classifyEdit(before, record)) recorder.action(kind);
        // Repaint the screens that show party state (the roster list, the save note).
        // The panel has already redrawn itself.
        renderBriefingText();
      },
    });
    return;
  }
  // Both no-op when nothing changed, so this cannot steal focus mid-edit. The
  // inventory is re-pointed too: a battle's grant lands between briefings, so a panel
  // that only re-read the party would show the new weapon nowhere until a reload.
  prep.setInventory(shell.save?.inventory ?? []);
  prep.setRecords(party);
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
  renderStory("brief-story", shell.preBeat());
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
    btn.addEventListener("click", () =>
      guard(noted("change-deployment", () => toggleDeploy(btn.dataset["deploy"] as string))),
    );
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
  refresh();
}

function renderBriefing(): void {
  renderBriefingText();
  renderPrep();
}

function renderBattle(): void {
  const session = shell.session;
  if (!session) return;
  const lk = look();
  const active = session.actor();
  draw(ctx!, session.state, canvas.width, canvas.height, {
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
    unitColor: (u) => TEAM_COLOR[u.teamId] ?? "#9aa4bb",
  });
  el("timeline").innerHTML = timelineHtml(session.state, lk);
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

function renderAfter(): void {
  const outcome = shell.lastOutcome();
  const won = outcome === "victory";
  el("after-title").textContent = won ? "Battle won" : "Battle lost";
  el("after-note").textContent = won
    ? "AP is banked. The party redeploys at full HP — nobody is lost in this chapter."
    : "Nothing was spent. Retry the same battle with exactly the party you had.";
  renderStory("after-story", shell.outcomeBeat());
  el<HTMLButtonElement>("btn-next").hidden = !won;
  el<HTMLButtonElement>("btn-retry").hidden = won;
}

function renderCompleted(): void {
  renderLogNote("done-log-note");
  // The FINAL victory never passes through the after-battle screen — winning the last
  // battle goes straight to `COMPLETED` — so the last battle's victory scene would be
  // the one beat in the pack a player could never read. It belongs here.
  renderStory("done-story", shell.outcomeBeat());
  const wins = shell.save?.history.filter((h) => h.outcome === "victory").length ?? 0;
  const losses = (shell.save?.history.length ?? 0) - wins;
  el("done-note").textContent =
    `The First March is over — ${wins} battles won` +
    (losses > 0 ? `, ${losses} lost along the way.` : ", start to finish.");
}

function renderSaveError(): void {
  const box = el("save-error");
  box.hidden = shell.saveError === null;
  box.textContent = shell.saveError
    ? `Progress could NOT be saved: ${shell.saveError}. The run continues, but closing this tab will lose it.`
    : "";
}

function refresh(): void {
  renderScreens();
  renderSaveError();
  // Every repaint, not every transition. The recorder ignores a repeat of the screen it
  // is already on, and driving it from the ONE function that always runs means a new
  // transition cannot be added without the log seeing it — the "a screen the state
  // machine skips has content nobody can reach" trap, pointed the other way.
  recorder.screen(shell.screen, shell.briefing()?.battleId ?? shell.lastBattle?.battleId ?? null);
  switch (shell.screen) {
    case "TITLE":
      renderTitle();
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

const helpDialog = el<HTMLDialogElement>("help");
// `showModal` gives focus trapping and Escape-to-close for free; the fallback keeps the
// panel usable where <dialog> is unsupported rather than silently doing nothing.
el("btn-help").addEventListener("click", () => {
  // Recorded because ZERO is the finding: a player who never opens the manual and then
  // loses the finale is evidence about the game, not about them.
  recorder.action("help");
  if (typeof helpDialog.showModal === "function") helpDialog.showModal();
  else helpDialog.setAttribute("open", "");
});
el("btn-help-close").addEventListener("click", () => {
  if (typeof helpDialog.close === "function") helpDialog.close();
  else helpDialog.removeAttribute("open");
});

/**
 * Deploy, and start the battle's wall-clock.
 *
 * ONE function, called by the button AND by `window.tuhGame.deploy` — not two paths that
 * happen to agree. A seam that skipped the timing would let a browser spec drive a
 * battle the log never saw, and the spec would still pass (docs/10 §7).
 */
function deployAndTime(): void {
  shell.deploy();
  recorder.battleStarted();
}

/** Bank the battle, and record what it cost — read off the report the shell just banked. */
function concludeAndTime(): void {
  shell.concludeBattle();
  const banked = shell.lastBattle;
  if (banked) {
    recorder.battleEnded(banked.battleId, banked.report.outcome, banked.report.turns);
  }
}

/**
 * The result of the last log action, shown until something else happens.
 *
 * A VARIABLE RATHER THAN A DIRECT WRITE, because every click runs through `guard`, which
 * repaints — a handler that set the text itself had it overwritten by the repaint a
 * microsecond later, and the message only appeared at all when it happened to arrive
 * after the paint. One writer (`renderLogNote`), one source.
 */
let logNotice: string | null = null;

const MANUAL_COPY = `Open the console and run: copy(localStorage['${LOG_KEY}'])`;

/**
 * Put the log on the clipboard, and SAY what happened either way.
 *
 * The clipboard API is refused outside a secure context and in some embeddings, and a
 * button that silently did nothing would cost a playtester their whole session — so a
 * refusal names the manual way out rather than failing quietly.
 */
function copyLog(): void {
  const json = recorder.serialize();
  const say = (text: string): void => {
    logNotice = text;
    refresh();
  };
  const clip = navigator.clipboard;
  if (!clip || typeof clip.writeText !== "function") {
    logNotice = `This browser will not let the page use the clipboard. ${MANUAL_COPY}`;
    return;
  }
  clip.writeText(json).then(
    () => say(`Copied — ${json.length} characters. Paste it back to whoever asked for it.`),
    (err: unknown) => say(`Could not copy (${String(err)}). ${MANUAL_COPY}`),
  );
}

/** What the page says about the log. Both screens that offer the control render it. */
function renderLogNote(id: string): void {
  const note = el(id);
  const log = recorder.log();
  if (logNotice !== null) {
    note.className = "hint";
    note.textContent = logNotice;
    return;
  }
  if (recorder.writeError !== null) {
    note.className = "hint warn";
    note.textContent = `The playtest log is NOT being saved: ${recorder.writeError}`;
    return;
  }
  note.className = "hint";
  note.textContent = recorder.persisting
    ? `Playtest log: ${log.battles.length} battle${log.battles.length === 1 ? "" : "s"} recorded. No personal data, nothing sent anywhere.`
    : "This browser is not letting the game store data, so the playtest log lasts only until you close the tab.";
}

const on = (id: string, fn: () => void): void =>
  el(id).addEventListener("click", () => guard(fn));

/** Any run action clears the log notice — it describes a click, not a state. */
const clearNotice = (fn: () => void): (() => void) => () => {
  logNotice = null;
  fn();
};

on("btn-new-game", noted("start", clearNotice(() => shell.newGame())));
on("btn-continue", noted("start", () => shell.continueGame()));
on("btn-erase", () => shell.eraseSave());
on("btn-deploy", noted("deploy", () => deployAndTime()));
on("btn-brief-quit", () => shell.quitToTitle());
on("btn-conclude", noted("conclude", () => concludeAndTime()));
on("btn-next", noted("next", () => shell.nextBattle()));
on("btn-retry", noted("retry", () => shell.retry()));
on("btn-after-quit", () => shell.quitToTitle());
on("btn-done-title", () => shell.quitToTitle());
on("btn-end-turn", noted("battle-input", () => shell.session?.endTurn()));
on("btn-cancel", noted("battle-input", () => shell.session?.cancel()));
on("btn-step", noted("battle-input", () => shell.session?.step()));
on("btn-copy-log", () => copyLog());
on("btn-done-copy-log", () => copyLog());
on("btn-clear-log", () => {
  recorder.clear();
  logNotice = "Playtest log cleared.";
});

/**
 * The shipped seam. Every entry routes through the SAME shell/session method a button
 * click reaches — there is no parallel path for tests (docs/10 §7).
 */
const api: GameApi = {
  screen: () => shell.screen,
  save: () => shell.save,
  canContinue: () => shell.canContinue(),
  newGame: () => guard(() => shell.newGame()),
  continueGame: () => guard(() => shell.continueGame()),
  eraseSave: () => guard(() => shell.eraseSave()),
  deploy: () => guard(() => deployAndTime()),
  step: () => guard(() => shell.session?.step()),
  autoplay: () =>
    guard(() => {
      const s = shell.session;
      if (!s) return;
      let steps = 0;
      while (s.phase !== "ENDED") {
        s.step();
        if (++steps > 600) throw new Error("autoplay: the battle never ended");
      }
    }),
  battleOver: () => shell.battleOver(),
  conclude: () => guard(() => concludeAndTime()),
  next: () => guard(() => shell.nextBattle()),
  retry: () => guard(() => shell.retry()),
  quitToTitle: () => guard(() => shell.quitToTitle()),
  storedSave: () => (storageAvailable ? localStorage.getItem(SAVE_KEY) : null),
  playtestLog: () => recorder.log(),
  storedLog: () => (storageAvailable ? localStorage.getItem(LOG_KEY) : null),
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
