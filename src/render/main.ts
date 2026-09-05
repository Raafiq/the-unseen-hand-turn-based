/**
 * Viewer bootstrap — a THIN adapter over {@link Session}.
 *
 * Everything with a rule in it lives in `session.ts` (the docs/10 §3 state
 * machine) and `preview.ts` (the docs/10 §4 transparency set). This file only:
 *   - maps pointer/keyboard events onto Session methods,
 *   - paints `Session` through the pure `draw`,
 *   - exposes `window.tuh`, the DETERMINISTIC test seam.
 *
 * THE SEAM ROUTES THROUGH THE SAME HANDLERS AS REAL INPUT (docs/10 §7). There is
 * no parallel code path for tests: `clickTile` and `clickCanvas` both end in
 * `Session.onPick`, the single tile-driven mutator, exactly where a real
 * `pointerdown` ends. Only `clickCanvas` performs the pixel→tile mapping
 * (`pickTile`), which is why the
 * interaction suite drives GRID coordinates and the pointer mapping is covered
 * by one separate assertion (AC-V10) — otherwise every camera tweak would break
 * the whole suite for no behavioural reason.
 *
 * Wall-clock: this layer MAY use it for animation pacing, but nothing derived
 * from it may enter `BattleState`. Nothing here does — the viewer advances only
 * on an explicit user/seam call, so the command log is a function of input
 * order alone.
 */

import type { Position } from "../sim/index.js";
import { UNIT_META } from "./demo.js";
import { draw, pickTile } from "./iso.js";
import { MotionDirector, prefersReducedMotion, type MotionBeat } from "./motion.js";
import {
  logHtml,
  previewHtml,
  statusHtml,
  timelineHtml,
  unitCardHtml,
  type LookUp,
} from "./panels.js";
import { wireLandscapeButton } from "./orientation.js";
import { mountPrepDemo } from "./prep.js";
import { Session, type Phase } from "./session.js";
import type { ViewerApi } from "./viewer-api.js";

/** This page's presentation metadata: the demo battle's hand-authored roster. */
const look: LookUp = (id) => UNIT_META[id];

const canvas = document.getElementById("grid") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d canvas context unavailable");

const timelineEl = document.getElementById("timeline") as HTMLElement;
const unitCardEl = document.getElementById("unit-card") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const logEl = document.getElementById("log") as HTMLElement;
const previewEl = document.getElementById("preview") as HTMLElement;
const reasonEl = document.getElementById("reason") as HTMLElement;
const endTurnBtn = document.getElementById("btn-end-turn") as HTMLButtonElement;
const cancelBtn = document.getElementById("btn-cancel") as HTMLButtonElement;
const stepBtn = document.getElementById("btn-step") as HTMLButtonElement;

const session = new Session();
/** Draw the keyboard tile cursor only while the canvas actually has focus. */
let canvasFocused = false;

/**
 * THE PAGE OWNS THE CLOCK (docs/10 §3a). This is the wall-clock use the header above
 * always allowed and nothing had yet needed: `draw` stays pure, the sample is taken here,
 * and nothing derived from it reaches `BattleState` — the viewer still advances only on
 * an explicit user or seam call.
 *
 * `nameOf` is the demo page's own roster, for the same reason `unitColor` is a parameter:
 * this page names units `knight`/`archer`, the campaign names them `blue-vance`, and a
 * table baked into the renderer would miss one of them entirely.
 */
const motion = new MotionDirector({
  nameOf: (id) => UNIT_META[id]?.label ?? id,
  reduced: prefersReducedMotion,
});
let lastBeat: MotionBeat | null = null;
let motionFrame: number | null = null;

const PHASE_TEXT: Record<Phase, string> = {
  AWAIT_ACTOR: "Advancing the clock…",
  PLAYER_IDLE: "Your turn — click a tile to move, or an enemy to strike",
  MOVE_STAGED: "Move staged — click an enemy to strike from there, or End Turn",
  AI_TURN: "Enemy turn — press Play enemy turn to watch it resolve",
  ENDED: "Battle over",
};

/**
 * THE CANVAS ALONE — the only thing the animation frame loop repaints. A full `render()`
 * rebuilds the timeline (eight forecast clones) and every panel; doing that per frame
 * would put the cost of a cosmetic flourish onto the transparency panels.
 */
function paintBoard(): void {
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
    motion: motion.sample(),
  });
}

/** Hand a freshly committed beat to the director. Identity: `commit` builds a new one. */
function syncMotion(): void {
  if (session.beat === lastBeat) return;
  lastBeat = session.beat;
  if (lastBeat === null) {
    motion.clear();
    return;
  }
  motion.start(lastBeat);
  pumpMotion();
}

/** The page's ONLY frame loop, and it STOPS when nothing is animating. */
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

function render(): void {
  syncMotion();
  paintBoard();
  renderTimeline();
  renderStatus();
  renderControls();
  renderPreview();
  renderReason();
}

function renderTimeline(): void {
  timelineEl.innerHTML = timelineHtml(session.state, look);
  // The SAME renderer the campaign uses, over this page's hand-authored `UNIT_META` —
  // which carries no job and no portrait. That is why the card is on this page at all:
  // it is the live case for the two optional rows being genuinely ABSENT rather than
  // blank, and `panels.test.ts`'s A/B on it would be the only witness otherwise.
  unitCardEl.innerHTML = unitCardHtml(session.state, look);
}

function renderStatus(): void {
  statusEl.innerHTML = statusHtml(session, look);
}

function renderControls(): void {
  const playable = session.phase === "PLAYER_IDLE" || session.phase === "MOVE_STAGED";
  endTurnBtn.textContent = session.endTurnLabel();
  endTurnBtn.disabled = !playable;
  cancelBtn.disabled = session.phase !== "MOVE_STAGED";
  // One control, two honest readings. `Session.step()` resolves whoever is ACTIVE
  // through the balance probe regardless of team, so on the player's own turn it
  // hands their unit to the AI — which "Step turn" never said. Naming both cases
  // is the pillar-4 honesty rule applied to a label.
  stepBtn.textContent = session.phase === "AI_TURN" ? "Play enemy turn ▸" : "Auto-play my turn ▸";
  stepBtn.disabled = session.phase === "ENDED";
}

function renderReason(): void {
  const text = session.fatal ?? session.reason ?? session.outcome ?? PHASE_TEXT[session.phase];
  const kind = session.fatal ? "fatal" : session.reason ? "warn" : "info";
  reasonEl.className = `reason ${kind}`;
  reasonEl.textContent = text;
}

function renderPreview(): void {
  previewEl.innerHTML = previewHtml(session, look);
}

function renderLog(): void {
  logEl.innerHTML = logHtml(
    session.state,
    look,
    "No turns yet — move, strike, or let the AI play a turn.",
  );
}

function refresh(): void {
  render();
  renderLog();
}

/**
 * Run a session mutation and ALWAYS repaint — even when it throws.
 *
 * docs/10 §1 requires a viewer/sim fork (the sim rejecting a pick the viewer
 * allowed) to be surfaced LOUDLY, never swallowed. `Session.commit` records it in
 * `session.fatal` and RETHROWS, and {@link renderReason} paints it as the `fatal`
 * chip — but a bare `session.x(); refresh();` handler SKIPS that repaint on the
 * throw, so the one screen the message was written for never receives it: the
 * player is left with a stale chip over a frozen board while the only trace goes
 * to the console. `finally` guarantees the paint happens; the error still
 * propagates, so nothing is swallowed. EVERY handler below goes through this.
 */
function guard(mutate: () => void): void {
  try {
    mutate();
  } finally {
    refresh();
  }
}

// ─── input adapters ─────────────────────────────────────────────────────────

/** Client pixels → CANVAS pixels (the canvas is CSS-scaled to its container). */
function toCanvasPoint(ev: { clientX: number; clientY: number }): Position {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) * canvas.width) / rect.width,
    y: ((ev.clientY - rect.top) * canvas.height) / rect.height,
  };
}

/**
 * Canvas pixels → tile → {@link Session.onPick}. `pickTile` is the ONLY thing
 * this adds over the grid seam, which is exactly the split docs/10 §7 asks for.
 */
function pickAtCanvas(px: number, py: number): void {
  guard(() => session.onPick(pickTile(session.state, px, py, canvas.width, canvas.height)));
}

canvas.addEventListener("pointerdown", (ev) => {
  if (ev.button === 2) return; // right-click is handled by contextmenu (cancel)
  canvas.focus();
  const p = toCanvasPoint(ev);
  pickAtCanvas(p.x, p.y);
});

/**
 * Repaint on hover only when the hovered TILE changes, not on every pixel of
 * mouse travel — a full repaint rebuilds the timeline (8 forecast clones) and
 * every panel. Purely a rendering economy: the hover itself is still pure UI
 * intent that touches nothing in the sim.
 */
function sameTile(a: Position | null, b: Position | null): boolean {
  return a === null || b === null ? a === b : a.x === b.x && a.y === b.y;
}

canvas.addEventListener("pointermove", (ev) => {
  const p = toCanvasPoint(ev);
  const tile = pickTile(session.state, p.x, p.y, canvas.width, canvas.height);
  if (sameTile(tile, session.hover)) return;
  guard(() => session.onTileHover(tile));
});

canvas.addEventListener("pointerleave", () => {
  guard(() => session.onTileHover(null));
});

canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  guard(() => session.cancel());
});

canvas.addEventListener("focus", () => {
  canvasFocused = true;
  refresh();
});
canvas.addEventListener("blur", () => {
  canvasFocused = false;
  refresh();
});

/**
 * Keyboard reachability (docs/04 §7, docs/10 §3). The canvas is focusable; the
 * arrow keys walk a GRID-ALIGNED tile cursor (up/down = −y/+y, left/right =
 * −x/+x — grid axes, not screen diagonals, so the mapping is predictable),
 * Enter/Space activates the cursor tile through the same handler a click uses,
 * and Escape cancels. Every other action is a real focusable <button>.
 */
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
    guard(() => session.moveCursor(stepVec.x, stepVec.y));
    return;
  }
  if (ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    guard(() => session.onPick(session.cursor)); // the SAME mutator a click uses
    return;
  }
  if (ev.key === "Escape") {
    ev.preventDefault();
    guard(() => session.cancel());
  }
});

document.addEventListener("keydown", (ev) => {
  // Escape cancels from anywhere — the draft is UI intent, so this is free.
  if (ev.key === "Escape" && ev.target !== canvas) {
    guard(() => session.cancel());
  }
});

stepBtn.addEventListener("click", () => {
  guard(() => session.step());
});
document.getElementById("btn-reset")?.addEventListener("click", () => {
  guard(() => session.reset());
});
endTurnBtn.addEventListener("click", () => {
  guard(() => session.endTurn());
});
cancelBtn.addEventListener("click", () => {
  guard(() => session.cancel());
});

/** The shipped seam, typed by the shared {@link ViewerApi} contract. */
const api: ViewerApi = {
  step: () => guard(() => session.step()),
  reset: () => guard(() => session.reset()),
  getState: () => session.state,
  turn: () => session.turnCount,
  // The SAME mutator a real pointerdown ends in, under the same repaint guard.
  clickTile: (x, y) => guard(() => session.onPick({ x, y })),
  clickCanvas: (px, py) => pickAtCanvas(px, py),
  hoverTile: (x, y) => guard(() => session.onTileHover({ x, y })),
  cursor: () => session.cursor,
  draft: () => session.draft,
  commands: () => session.commands(),
  cancel: () => guard(() => session.cancel()),
  endTurn: () => guard(() => session.endTurn()),
  phase: () => session.phase,
  preview: () => session.preview(),
  reason: () => session.reason,
  // Camera controls over the animation clock. They touch no state and emit no command.
  settleMotion: () => {
    motion.settle();
    paintBoard();
  },
  freezeMotion: (ms) => {
    motion.freeze(ms);
    paintBoard();
    pumpMotion();
  },
};
window.tuh = api;

refresh();

// Slice 8: the prep/loadout viewer (customization pillar). Rendered below the
// battle; wholly independent of the battle state above.
const prepBody = document.getElementById("prep-body");
if (prepBody) mountPrepDemo(prepBody);

// AC-V32: the rotate gate's one button. The gate itself is pure CSS (AC-V30) — this
// only adds the best-effort fullscreen + landscape lock, which needs a user gesture and
// is a no-op wherever the APIs are absent (iOS Safari).
wireLandscapeButton(document, window.screen);
