/**
 * Viewer bootstrap. Wires the canvas, the Step/Reset controls, the turn-order
 * timeline, and a status line — all driven by the pure sim. Deterministic hooks
 * (`window.tuh`) are exposed so the Playwright visual tests can drive the app
 * frame-accurately.
 */

import type { ActiveActor, BattleState } from "../sim/index.js";
import { forecast, makeDemoBattle, stepDemo, UNIT_META, type StepResult } from "./demo.js";
import { draw } from "./iso.js";

interface ViewerApi {
  step: () => void;
  reset: () => void;
  getState: () => BattleState;
  turn: () => number;
}
declare global {
  interface Window {
    tuh: ViewerApi;
  }
}

const canvas = document.getElementById("grid") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d canvas context unavailable");

const timelineEl = document.getElementById("timeline") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const logEl = document.getElementById("log") as HTMLElement;

let state: BattleState = makeDemoBattle();
let last: StepResult | null = null;
let turnCount = 0;

function activeId(): string | undefined {
  return last?.active?.kind === "unit" ? last.active.id : undefined;
}

function render(): void {
  const w = canvas.width;
  const h = canvas.height;
  draw(ctx!, state, w, h, { activeId: activeId(), range: last?.activeRange ?? [] });
  renderTimeline();
  renderStatus();
}

function chip(actor: ActiveActor, leading: boolean): string {
  const meta = UNIT_META[actor.id];
  const color = meta?.color ?? "#9aa4bb";
  const label = meta?.label ?? actor.id;
  return `<span class="chip${leading ? " lead" : ""}" style="--c:${color}">
    <span class="swatch"></span>${label}</span>`;
}

function renderTimeline(): void {
  const upcoming = forecast(state, 8);
  timelineEl.innerHTML =
    `<span class="tl-label">Next up</span>` + upcoming.map((a, i) => chip(a, i === 0)).join("");
}

function renderStatus(): void {
  const act = last?.active;
  const who = act ? (UNIT_META[act.id]?.label ?? act.id) : "—";
  statusEl.innerHTML =
    `<span><b>Tick</b> ${state.tick}</span>` +
    `<span><b>Turns</b> ${turnCount}</span>` +
    `<span><b>Last actor</b> ${who}</span>` +
    `<span><b>Seed</b> ${state.seed}</span>`;
}

function renderLog(): void {
  const rows = state.turnLog
    .slice(-6)
    .reverse()
    .map((e) => {
      const meta = UNIT_META[e.unitId];
      return `<li><span class="dot" style="background:${meta?.color ?? "#9aa4bb"}"></span>
        t${e.tick} · ${meta?.label ?? e.unitId} · ${e.action}</li>`;
    })
    .join("");
  logEl.innerHTML = rows || `<li class="muted">No turns yet — press Step.</li>`;
}

function doStep(): void {
  last = stepDemo(state);
  state = last.state;
  turnCount += 1;
  render();
  renderLog();
}

function doReset(): void {
  state = makeDemoBattle();
  last = null;
  turnCount = 0;
  render();
  renderLog();
}

document.getElementById("btn-step")?.addEventListener("click", doStep);
document.getElementById("btn-reset")?.addEventListener("click", doReset);

window.tuh = {
  step: doStep,
  reset: doReset,
  getState: () => state,
  turn: () => turnCount,
};

render();
renderLog();
