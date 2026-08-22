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

import type { Position, StoryBeat } from "../sim/index.js";
import { ENCOUNTERS, battleTitle, campaign, registry, story } from "./campaign-data.js";
import { CampaignShell, type Screen } from "./campaign-shell.js";
import type { GameApi, PrepSeam } from "./game-api.js";
import { draw, pickTile } from "./iso.js";
import { logHtml, previewHtml, statusHtml, timelineHtml, type LookUp } from "./panels.js";
import { mountPrep, type PrepHandle } from "./prep.js";
import { SAVE_KEY, browserSlot, memorySlot } from "./storage.js";
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

function renderPrep(): void {
  const party = shell.save?.party;
  if (!party || party.length === 0) return;
  if (!prep) {
    prep = mountPrep(el("prep-body"), {
      registry,
      records: party,
      progression: true,
      onChange: (record) => {
        shell.updateParty(record);
        // Repaint the screens that show party state (the roster list, the save note).
        // The panel has already redrawn itself.
        renderBriefingText();
      },
    });
    return;
  }
  // A no-op when the party is unchanged, so this cannot steal focus mid-edit.
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
  el("brief-party").innerHTML = party
    .map(
      (r) =>
        `<li><b>${r.name}</b> · ${r.currentJob} · <span class="muted">${r.ap} AP banked</span></li>`,
    )
    .join("");
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

const on = (id: string, fn: () => void): void =>
  el(id).addEventListener("click", () => guard(fn));

on("btn-new-game", () => shell.newGame());
on("btn-continue", () => shell.continueGame());
on("btn-erase", () => shell.eraseSave());
on("btn-deploy", () => shell.deploy());
on("btn-brief-quit", () => shell.quitToTitle());
on("btn-conclude", () => shell.concludeBattle());
on("btn-next", () => shell.nextBattle());
on("btn-retry", () => shell.retry());
on("btn-after-quit", () => shell.quitToTitle());
on("btn-done-title", () => shell.quitToTitle());
on("btn-end-turn", () => shell.session?.endTurn());
on("btn-cancel", () => shell.session?.cancel());
on("btn-step", () => shell.session?.step());

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
  deploy: () => guard(() => shell.deploy()),
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
  conclude: () => guard(() => shell.concludeBattle()),
  next: () => guard(() => shell.nextBattle()),
  retry: () => guard(() => shell.retry()),
  quitToTitle: () => guard(() => shell.quitToTitle()),
  storedSave: () => (storageAvailable ? localStorage.getItem(SAVE_KEY) : null),
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
