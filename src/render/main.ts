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

import type { ActiveActor, Position } from "../sim/index.js";
import { UNIT_META, forecast } from "./demo.js";
import { draw, pickTile } from "./iso.js";
import { mountPrep } from "./prep.js";
import { Session, type Phase } from "./session.js";
import type { ViewerApi } from "./viewer-api.js";

const canvas = document.getElementById("grid") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d canvas context unavailable");

const timelineEl = document.getElementById("timeline") as HTMLElement;
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

const PHASE_TEXT: Record<Phase, string> = {
  AWAIT_ACTOR: "Advancing the clock…",
  PLAYER_IDLE: "Your turn — click a tile to move, or an enemy to strike",
  MOVE_STAGED: "Move staged — click an enemy to strike from there, or End Turn",
  AI_TURN: "Enemy turn — press Step to watch it resolve",
  ENDED: "Battle over",
};

function label(id: string): string {
  return UNIT_META[id]?.label ?? id;
}

function render(): void {
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
  renderTimeline();
  renderStatus();
  renderControls();
  renderPreview();
  renderReason();
}

function chip(actor: ActiveActor, leading: boolean): string {
  if (actor.kind === "charge") {
    const charge = session.state.chargeQueue.find((c) => c.id === actor.id);
    const caster = charge ? UNIT_META[charge.sourceUnitId] : undefined;
    const color = caster?.color ?? "#ff7a3c";
    const text = caster ? `⚡ ${caster.label}` : "⚡ Spell";
    return `<span class="chip spell${leading ? " lead" : ""}" style="--c:${color}">
      <span class="swatch"></span>${text}</span>`;
  }
  const meta = UNIT_META[actor.id];
  const color = meta?.color ?? "#9aa4bb";
  return `<span class="chip${leading ? " lead" : ""}" style="--c:${color}">
    <span class="swatch"></span>${meta?.label ?? actor.id}</span>`;
}

function renderTimeline(): void {
  const upcoming = forecast(session.state, 8);
  timelineEl.innerHTML =
    `<span class="tl-label">Next up</span>` + upcoming.map((a, i) => chip(a, i === 0)).join("");
}

function renderStatus(): void {
  const active = session.actor();
  const who = active ? label(active.id) : "—";
  const control = !active ? "" : active.teamId === session.playerTeam ? " (you)" : " (AI)";
  statusEl.innerHTML =
    `<span><b>Tick</b> ${session.state.tick}</span>` +
    `<span><b>Turns</b> ${session.turnCount}</span>` +
    `<span><b>Active</b> ${who}${control}</span>` +
    `<span><b>Phase</b> ${session.phase}</span>` +
    `<span><b>Seed</b> ${session.state.seed}</span>`;
}

function renderControls(): void {
  const playable = session.phase === "PLAYER_IDLE" || session.phase === "MOVE_STAGED";
  endTurnBtn.textContent = session.endTurnLabel();
  endTurnBtn.disabled = !playable;
  cancelBtn.disabled = session.phase !== "MOVE_STAGED";
  stepBtn.textContent = session.phase === "AI_TURN" ? "Enemy turn ▸ Resolve" : "Step turn ▸";
  stepBtn.disabled = session.phase === "ENDED";
}

function renderReason(): void {
  const text = session.fatal ?? session.reason ?? session.outcome ?? PHASE_TEXT[session.phase];
  const kind = session.fatal ? "fatal" : session.reason ? "warn" : "info";
  reasonEl.className = `reason ${kind}`;
  reasonEl.textContent = text;
}

const row = (k: string, v: string, cls = ""): string =>
  `<div class="prow ${cls}"><span class="pk">${k}</span><span class="pv">${v}</span></div>`;

/**
 * The resolution-transparency panel (docs/10 §4). DEFERRED ROWS ARE ABSENT — no
 * crit, reaction, status-on-hit, elemental, AoE, LoS or charge line is printed,
 * because printing one as zero would assert a modeled zero for something the sim
 * does not model (ADR-0010), which pillar 4 forbids. The closing note NAMES what
 * is unmodeled instead of faking a value for it.
 */
function renderPreview(): void {
  const p = session.preview();
  if (!p) {
    const cost = session.endTurnCost();
    previewEl.innerHTML = cost
      ? row("Turn as staged", `${cost.didMove ? "Move only" : "Wait"} · −${cost.cost} CT`) +
        row("CT after", `${cost.ctBefore} → ${cost.ctAfter}`) +
        `<p class="phint">Hover an enemy to see the exact hit %, damage and CT price before you commit.</p>`
      : `<p class="phint">No unit is awaiting your input.</p>`;
    return;
  }
  const hpBar = `${p.targetHpBefore} → ${p.targetHpAfter} / ${p.targetMaxHp}`;
  const statuses =
    p.targetStatuses.length === 0
      ? "none"
      : p.targetStatuses.map((s) => `${s.id} (${s.kind})`).join(", ");
  previewEl.innerHTML =
    row("Action", `${label(p.actorId)} · ${p.abilityId} → ${label(p.targetId)}`) +
    row("Resolves from", `${p.moved ? "staged tile" : "current tile"} (${p.from.x},${p.from.y})`) +
    row("Facing", `${p.facing.toUpperCase()} arc`) +
    row("Hit chance", `${p.hitChance}%`) +
    row(p.heal ? "Heal" : "Damage", `${p.magnitude}`) +
    row("Target HP", hpBar, p.lethal ? "lethal" : "") +
    (p.lethal ? row("Outcome", "LETHAL — the target is KO'd") : "") +
    row("Zodiac", p.zodiac) +
    row("Target statuses", statuses) +
    row(
      "Turn price",
      `${p.moved ? "Move + Act" : "Act"} · −${p.turn.cost} CT` +
        ` · CT ${p.turn.ctBefore} → ${p.turn.ctAfter}`,
    ) +
    row(
      "Next slot (projected)",
      p.turn.timelineSlot === null
        ? "beyond the next 8 turns"
        : `≈ #${p.turn.timelineSlot + 1} in the timeline`,
    ) +
    `<p class="phint">Not modeled yet, so not shown: crit, reactions, status-on-hit, elemental
     weak/half/absorb, AoE spread, line of sight (ADR-0010). “Next slot” is a
     <b>projection, not a fact</b>: the forecast assumes every actor ahead of you spends a
     plain −80 turn, so a Wait (−60) or a move+act fold (−100) anywhere in between moves it.
     The CT price above it <i>is</i> exact.</p>`;
}

function renderLog(): void {
  const rows = session.state.turnLog
    .slice(-6)
    .reverse()
    .map((e) => {
      const meta = UNIT_META[e.unitId];
      return `<li><span class="dot" style="background:${meta?.color ?? "#9aa4bb"}"></span>
        t${e.tick} · ${meta?.label ?? e.unitId} · ${e.action}</li>`;
    })
    .join("");
  logEl.innerHTML = rows || `<li class="muted">No turns yet — move, strike, or press Step.</li>`;
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
};
window.tuh = api;

refresh();

// Slice 8: the prep/loadout viewer (customization pillar). Rendered below the
// battle; wholly independent of the battle state above.
const prepBody = document.getElementById("prep-body");
if (prepBody) mountPrep(prepBody);
