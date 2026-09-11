/**
 * Engine-viewer bootstrap — a THIN adapter over {@link Session} and {@link mountHud}.
 *
 * Everything with a rule in it lives elsewhere: the docs/10 §3 state machine in
 * `session.ts`, the §4 transparency set in `preview.ts`, the §8 stage geometry in
 * `stage.ts`, and the battle screen's DOM in `hud.ts` — SHARED with `index.html`, so
 * the two pages cannot hold two versions of the same screen the way they used to.
 * This file supplies what only this page can answer: its hand-authored roster, its
 * dark board theme, and a menu that offers Reset rather than Save and Quit.
 *
 * THE SEAM ROUTES THROUGH THE SAME HANDLERS AS REAL INPUT (docs/10 §7). `clickTile`
 * and `clickCanvas` both go through `hud.pick`, exactly where a real `pointerdown`
 * ends — which either opens the read-only unit drawer or reaches `Session.onPick`, the
 * one tile-driven mutator. Only `clickCanvas` adds the pixel→tile mapping (`pickTile`),
 * which is why the interaction suite drives GRID coordinates and the pointer mapping is
 * covered by one separate assertion (AC-V10).
 *
 * Wall-clock: this layer MAY use it for animation pacing, but nothing derived from it
 * may enter `BattleState`. Nothing here does — the viewer advances only on an explicit
 * user or seam call, so the command log is a function of input order alone.
 */

import { UNIT_META } from "./demo.js";
import { draw, pickTile } from "./iso.js";
import { mountHud, type HudHandle } from "./hud.js";
import { MotionDirector, prefersReducedMotion, type MotionBeat } from "./motion.js";
import type { LookUp } from "./panels.js";
import { wireLandscapeButton } from "./orientation.js";
import { mountPrepDemo, mountPrepEmpty } from "./prep.js";
import { Session } from "./session.js";
import type { ViewerApi } from "./viewer-api.js";

/** This page's presentation metadata: the demo battle's hand-authored roster. */
const look: LookUp = (id) => UNIT_META[id];

const session = new Session();

/**
 * THE PAGE OWNS THE CLOCK (docs/10 §3a). `draw` stays pure, the sample is taken here,
 * and nothing derived from it reaches `BattleState`.
 *
 * `nameOf` is this page's own roster, for the same reason `unitColor` is a parameter:
 * this page names units `knight`/`archer`, the campaign names them `blue-vance`, and a
 * table baked into the renderer would miss one of them entirely.
 */
const motion = new MotionDirector({
  nameOf: (id) => UNIT_META[id]?.label ?? id,
  reduced: prefersReducedMotion,
});
let lastBeat: MotionBeat | null = null;
let motionFrame: number | null = null;

/** The legend's colours are DARK_THEME's — the theme this page's board is painted with. */
const LEGEND: { color: string; label: string }[] = [
  { color: "#4f8cff", label: "Team A — Knight, Archer (you)" },
  { color: "#e2603c", label: "Team B — Brawler, Mage (AI)" },
  { color: "#e2a948", label: "Move range · solid gold ring = your turn" },
  { color: "#7fd7ff", label: "Staged move — nothing has moved yet" },
  { color: "#e05563", label: "A legal target from the staged tile" },
  { color: "#ff7a3c", label: "Dashed ring = AI's turn · a charging spell's reticle" },
  { color: "#ff5d5d", label: "Damage / miss popup · a crystal marks a KO'd unit" },
  { color: "#6a2f2f", label: "Impassable tile · raised tiles = terrain height" },
];

const HELP: { title: string; lines: readonly string[] }[] = [
  {
    title: "Your turn",
    lines: [
      "Tap a highlighted tile to stage a move. Nothing touches the sim yet — cancel is free.",
      "Tap an enemy to aim from there. The sheet on the right shows hit %, the facing arc, the exact damage and what the turn costs.",
      "Confirm commits it. That is the only tap that spends the turn.",
    ],
  },
  {
    title: "The clock",
    lines: [
      "Everyone acts when their clock fills. Moving and striking together costs the most; waiting costs the least, so you come round soonest.",
      "The chips along the top are the turn order. Dotted chips past the divider are a guess, not a fact.",
    ],
  },
  {
    title: "The enemy",
    lines: [
      "The enemy's turn resolves when you press it — never on a timer. Everything is deterministic from the seed, so the same seed replays the same battle.",
    ],
  },
];

// ─── screens ────────────────────────────────────────────────────────────────

const battleScreen = document.getElementById("screen-battle") as HTMLElement;
const prepScreen = document.getElementById("screen-prep") as HTMLElement;
let onPrep = false;

function showScreen(): void {
  battleScreen.hidden = onPrep;
  prepScreen.hidden = !onPrep;
  // The stage owns the whole viewport while the battle is up, so the page beneath it
  // must not scroll (AC-V33). On the prep screen the page is ordinary again.
  document.documentElement.classList.toggle("tuh-on-stage", !onPrep);
  document.body.classList.toggle("tuh-on-stage", !onPrep);
  // Measured AFTER the section is shown: a hidden host has a zero-sized box, and a
  // geometry derived from it would letterbox the whole stage away.
  if (!onPrep) hud.resize();
}

// ─── painting ───────────────────────────────────────────────────────────────

function paintBoard(): void {
  const ctx = hud.canvas.getContext("2d");
  if (!ctx) return;
  const active = session.actor();
  draw(ctx, session.state, hud.canvas.width, hud.canvas.height, {
    activeId: active?.id,
    activeControl:
      active === undefined ? undefined : active.teamId === session.playerTeam ? "player" : "ai",
    range: session.moveTiles(),
    targets: session.targetTiles(),
    staged: session.stagedTile(),
    cursor: hud.canvasFocused() ? session.cursor : null,
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

function refresh(): void {
  syncMotion();
  hud.render();
}

/**
 * Run a session mutation and ALWAYS repaint — even when it throws.
 *
 * docs/10 §1 requires a viewer/sim fork (the sim rejecting a pick the viewer allowed)
 * to be surfaced LOUDLY, never swallowed. `Session.commit` records it in
 * `session.fatal` and RETHROWS, and the HUD paints it as the fatal toast — but a bare
 * `session.x(); refresh();` handler SKIPS that repaint on the throw, so the one screen
 * the message was written for never receives it. `finally` guarantees the paint; the
 * error still propagates, so nothing is swallowed.
 */
function guard(mutate: () => void): void {
  try {
    mutate();
  } finally {
    refresh();
  }
}

const hud: HudHandle = mountHud(document.getElementById("stage-host") as HTMLElement, {
  session: () => session,
  look: () => look,
  refresh,
  paintBoard,
  act: (_name, run) => guard(run),
  legend: () => LEGEND,
  help: () => HELP,
  menu: () => [
    { id: "reset", label: "Reset the battle", run: () => guard(() => session.reset()) },
    {
      id: "menu-prep",
      label: "Prep & loadout ▸",
      run: () => {
        onPrep = true;
        showScreen();
      },
    },
    // WATCH MODE (docs/10 §7) is a shipped feature, not a test seam: it resolves the
    // ACTIVE unit through the balance probe regardless of team, so a fully scripted
    // deterministic run exists for the Playwright baseline. The label names BOTH
    // readings, because on the player's own turn it hands their unit to the AI.
    {
      id: "btn-step",
      label: session.phase === "AI_TURN" ? "Play the enemy turn ▸" : "Auto-play my turn ▸",
      run: () => guard(() => session.step()),
    },
  ],
});

document.getElementById("btn-to-battle")?.addEventListener("click", () => {
  onPrep = false;
  showScreen();
  refresh();
});

/** Canvas pixels → tile → {@link Session.onPick}, the one tile-driven mutator. */
function pickAtCanvas(px: number, py: number): void {
  hud.pick(pickTile(session.state, px, py, hud.canvas.width, hud.canvas.height));
}

/**
 * Escape from anywhere. SHALLOWEST FIRST: an open drawer or sheet closes, and only
 * once nothing is overlaid does Escape reach the draft. Cancelling a staged move the
 * player never asked to lose — while leaving the drawer they DID mean to close still
 * open — is the failure this ordering prevents.
 */
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || ev.target === hud.canvas) return;
  if (hud.closeOverlay()) return;
  guard(() => session.cancel());
});

/** The shipped seam, typed by the shared {@link ViewerApi} contract. */
const api: ViewerApi = {
  step: () => guard(() => session.step()),
  reset: () => guard(() => session.reset()),
  getState: () => session.state,
  turn: () => session.turnCount,
  // The SAME mutator a real pointerdown ends in, under the same repaint guard.
  // THROUGH THE HUD, not straight to `Session.onPick`: the read-only inspect branch
  // lives above the session, and a seam that skipped it would be a parallel path.
  clickTile: (x, y) => hud.pick({ x, y }),
  clickCanvas: (px, py) => pickAtCanvas(px, py),
  hoverTile: (x, y) => guard(() => session.onTileHover({ x, y })),
  cursor: () => session.cursor,
  draft: () => session.draft,
  commands: () => session.commands(),
  cancel: () => guard(() => session.cancel()),
  endTurn: () => guard(() => session.endTurn()),
  confirm: () => guard(() => session.confirm()),
  phase: () => session.phase,
  preview: () => session.preview(),
  actCost: () => session.actCost(),
  reason: () => session.reason,
  moveTiles: () => session.moveTiles(),
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

showScreen();
refresh();

// Slice 8: the prep/loadout viewer (customization pillar). Its own screen since
// ADR-0037 — the battle screen must not scroll, and this panel is long.
const prepBody = document.getElementById("prep-body");
// `?prep=empty`: the no-weapon/no-mastered-job fixture `e2e/briefing.spec.ts`'s
// "weapon-absent" and "empty-traits" tests mount, since the shipped campaign cannot
// discover either state honestly (prep.ts's own `mountPrepEmpty` docstring).
if (prepBody) {
  if (new URLSearchParams(window.location.search).get("prep") === "empty") {
    mountPrepEmpty(prepBody);
  } else {
    mountPrepDemo(prepBody);
  }
}

// AC-V32: the rotate gate's one button. The gate itself is pure CSS (AC-V30) — this
// only adds the best-effort fullscreen + landscape lock, which needs a user gesture and
// is a no-op wherever the APIs are absent (iOS Safari).
wireLandscapeButton(document, window.screen);
