/**
 * THE BATTLE HUD — one module, both pages (ADR-0037, docs/10 §8).
 *
 * This file BUILDS the battle screen's DOM rather than reading it out of two hand-
 * authored HTML files. That is the whole point of it existing: `index.html` and
 * `viewer.html` each carried their own copy of the board, the controls, the timeline
 * and a set of phone media queries, and the two drifted — the campaign's landscape
 * rules and the viewer's were separate transcriptions of the same idea. With the
 * markup generated here, "the two pages cannot diverge" is a fact about the code
 * rather than a promise, and docs/10 AC-V42's "the stage's child set is identical" is
 * satisfied by construction.
 *
 * WHAT IS AND IS NOT HERE. Everything with a rule in it still lives elsewhere: the
 * turn state machine in `session.ts` (docs/10 §3), the transparency set in
 * `preview.ts` (§4), the honest panels in `panels.ts`, the geometry in `stage.ts`
 * (§8a). This file is layout, wiring and the four surfaces the stage adds — the
 * drawers, the sheets, the toast and the phase-aware primary button.
 *
 * THE SIM IS NEVER TOUCHED DIRECTLY. Every mutation goes through a {@link Session}
 * method, through the page's `act()` wrapper, so a HUD button and the test seam are
 * the same code path (docs/10 §7). Confirm and End Turn are the only two controls
 * here that can emit a command, and `Session` is what decides whether they do.
 *
 * NO TIMERS. The toast is untimed and the enemy's turn advances on an explicit Step
 * (docs/10 §3, AC-V39): a wall-clock advance would make "how many commands have been
 * applied by now" a function of elapsed time.
 */

import "./stage.css";
import type { Position } from "../sim/index.js";
import { pickTile, tileSizeFor } from "./iso.js";
import {
  logHtml,
  previewHtml,
  statusHtml,
  timelineHtml,
  unitCardHtml,
  type LookUp,
} from "./panels.js";
import { abilityLabel } from "./prep.js";
import type { Phase, Session } from "./session.js";
import { mountStage, type StageController, type StageGeometry } from "./stage.js";

/** The canvas's backing store — the fixed surface `viewFor` fits the board to. */
const CANVAS_W = 900;
const CANVAS_H = 440;

/**
 * What the page must supply. Everything here is something only the page can answer:
 * which session is live, what the units are called, how the board is painted (the
 * campaign has authored terrain, the engine viewer does not), and what the menu
 * drawer offers (save/quit versus reset).
 */
export interface HudPorts {
  /** The live session, or `null` when no battle is mounted. */
  session(): Session | null;
  /** Presentation metadata for this page's units. */
  look(): LookUp;
  /** Repaint everything the page owns; must end up calling {@link HudHandle.render}. */
  refresh(): void;
  /** Repaint the canvas alone — the page owns the terrain, theme and unit colours. */
  paintBoard(): void;
  /** Run a named player action: the page logs it and repaints. */
  act(name: string, run: () => void): void;
  /**
   * Legend rows for the menu drawer, QUOTED FROM THE PAINT rather than written down
   * beside it: `index.html` told every player the walkable tiles were amber for the
   * whole life of painted ground, while the board painted them pale blue, because
   * nothing compared a swatch to the theme it describes (fixed 2026-09-02).
   *
   * `sw` is the key `e2e/campaign.spec.ts` reads the swatch back by, and `edge` is the
   * turn-ring's stroke, which differs from its fill — one row genuinely needs two
   * colours, and a single-colour shape would quietly drop half of it.
   */
  legend(): { sw?: string; color: string; edge?: string; label: string }[];
  /** Help topics for the help drawer. */
  help(): readonly { title: string; lines: readonly string[] }[];
  /**
   * Page-specific menu entries — save/quit on the campaign, reset on the viewer.
   *
   * `run` is OPTIONAL, and an entry without one renders as a NOTE rather than a
   * button. The campaign has no save ACTION — `campaign-shell.ts` writes the slot on
   * every transition — so a "Save" button here would be a control that validates
   * nothing and does nothing, which is the exact shape this repo's evidence rules
   * forbid. It says what is true instead.
   */
  menu(): { id: string; label: string; run?: () => void }[];
  /**
   * What to do once the battle is decided, for a page that has somewhere to go.
   * `null`/absent on the engine viewer, which has no campaign to return to — so the
   * button is BUILT on both pages and merely never shown on one, keeping the stage's
   * child set identical (AC-V42).
   */
  conclude?(): { label: string; run: () => void } | null;
}

export interface HudHandle {
  /** The stage element every zone lives in. */
  stage: HTMLElement;
  /** The board canvas, created here so both pages get the same one. */
  canvas: HTMLCanvasElement;
  /** Re-render every zone from the current session. */
  render(): void;
  /** Re-measure the host and re-apply the transform. */
  resize(): void;
  /** The geometry currently applied (the settings readout and the tests read this). */
  geometry(): StageGeometry;
  /** Does the board have keyboard focus? The page needs it to draw the tile cursor. */
  canvasFocused(): boolean;
  /**
   * CLOSE ANY OPEN OVERLAY, returning true if one was open.
   *
   * Escape has to unwind the SHALLOWEST thing first: a player with the ☰ drawer over
   * the board presses Escape to shut the drawer, and a handler that went straight to
   * `Session.cancel()` would throw away a staged move they never asked to lose while
   * leaving the drawer exactly where it was. The page's document-level Escape handler
   * asks this before it cancels.
   */
  closeOverlay(): boolean;
  /**
   * ACTIVATE A TILE — the entry a real `pointerdown` and a keyboard Enter both use,
   * exposed so each page's `clickTile` seam routes through it too.
   *
   * It matters that the seam comes through HERE and not straight to
   * `Session.onPick`: the read-only inspect (docs/10 §3, AC-V37) is a decision made
   * ABOVE the session — a tap on a unit that is not a legal target opens the drawer
   * rather than being refused — and a seam that skipped this branch would be a
   * parallel path, which docs/10 §7 forbids. It shipped that way for one afternoon
   * and the inspect ACs could not see the feature at all.
   */
  pick(p: Position | null): void;
}

/**
 * Phase hints. They are NOT the toast — the toast says why something was refused
 * (AC-V39) and is empty at rest. These ride on the primary button and the sheet.
 */
const PHASE_HINT: Record<Phase, string> = {
  AWAIT_ACTOR: "Advancing the clock…",
  PLAYER_IDLE: "Your turn — tap a tile to move, or an enemy to aim",
  MOVE_STAGED: "Move staged — tap an enemy to strike from there",
  TARGET_STAGED: "Target held — Confirm to commit, Cancel to unstage",
  AI_TURN: "The enemy is acting",
  ENDED: "Battle over",
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

/** A range box printed the way the Actions sheet shows it. */
const rangeText = (r: { h: number; v: number }): string => `range ${r.h} · height ±${r.v}`;

/**
 * Build the stage inside `host` and wire every control.
 *
 * The host is expected to be an element sized `100svw x 100svh` (see `stage.css`'s
 * `.tuh-host`); everything is measured off its `getBoundingClientRect()`, never off a
 * CSS variable — a variable computed correctly and applied to nothing reads as
 * working from the variable's side (AC-V33).
 */
export function mountHud(host: HTMLElement, ports: HudPorts): HudHandle {
  host.classList.add("tuh-host");
  host.replaceChildren();

  const stage = el("div", "tuh-stage");
  stage.dataset["testid"] = "stage";
  host.append(stage);

  // ── top bar ───────────────────────────────────────────────────────────────
  const top = el("div", "tuh-top");
  top.dataset["hud"] = "top-bar";
  const menuBtn = iconButton("☰", "Menu", "hud-menu");
  const chips = el("div", "tuh-chips");
  chips.dataset["testid"] = "timeline";
  chips.dataset["hud"] = "turn-order";
  // "one row; tap expands it" (docs/10 §8b). The strip is a DIV, not a button — it is
  // full of chips and a button wrapping them announces one enormous label — so the
  // expander is its own control, which is also what keeps it inside the 44 px floor.
  const chipsMore = iconButton("⋯", "Show the whole turn order", "turn-order-more");
  const helpBtn = iconButton("?", "How to play", "hud-help");
  const settingsBtn = iconButton("⚙", "Settings", "hud-settings");
  top.append(menuBtn, chips, chipsMore, helpBtn, settingsBtn);

  // ── middle row: the actor tab, then the board ─────────────────────────────
  const mid = el("div", "tuh-mid");
  const tab = el("button", "tuh-tab");
  tab.type = "button";
  tab.dataset["testid"] = "actor-tab";
  tab.dataset["hud"] = "actor-tab";
  tab.setAttribute("aria-label", "Acting unit — open the full stat card");
  const boardBox = el("div", "tuh-board");
  boardBox.dataset["hud"] = "board";
  const canvas = el("canvas");
  canvas.id = "grid";
  canvas.dataset["testid"] = "grid";
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Battle grid. Arrow keys move the tile cursor, Enter selects, Escape cancels.",
  );
  boardBox.append(canvas);
  mid.append(tab, boardBox);

  // ── bottom action bar ─────────────────────────────────────────────────────
  const bottom = el("div", "tuh-bottom");
  bottom.dataset["hud"] = "action-bar";
  const cancelBtn = el("button", "tuh-ghost");
  cancelBtn.type = "button";
  cancelBtn.dataset["testid"] = "cancel";
  cancelBtn.textContent = "Cancel";
  const actionsBtn = el("button", "tuh-actions-btn");
  actionsBtn.type = "button";
  actionsBtn.dataset["testid"] = "actions";
  actionsBtn.textContent = "Actions ▲";
  const primaryBtn = el("button", "tuh-primary");
  primaryBtn.type = "button";
  primaryBtn.dataset["testid"] = "end-turn";
  primaryBtn.textContent = "End Turn";
  const concludeBtn = el("button", "tuh-primary");
  concludeBtn.type = "button";
  concludeBtn.dataset["testid"] = "conclude";
  concludeBtn.textContent = "Continue ▸";
  concludeBtn.hidden = true;
  bottom.append(cancelBtn, actionsBtn, primaryBtn, concludeBtn);

  // ── overlays ──────────────────────────────────────────────────────────────
  const sheet = el("aside", "tuh-sheet");
  sheet.dataset["testid"] = "preview-sheet";
  sheet.hidden = true;
  const sheetBody = el("div", "tuh-sheet-body");
  sheetBody.dataset["testid"] = "preview";
  // A SCROLLABLE REGION MUST BE FOCUSABLE. axe files this as a serious violation and
  // it is a real one: the §4 transparency set can overflow this panel, and without a
  // tab stop the numbers a keyboard player is about to commit to are unreachable.
  scrollable(sheetBody, "Resolution preview");
  const sheetFoot = el("div", "tuh-sheet-foot");
  const confirmBtn = el("button");
  confirmBtn.type = "button";
  confirmBtn.dataset["testid"] = "confirm";
  confirmBtn.textContent = "Confirm";
  sheetFoot.append(confirmBtn);
  sheet.append(sheetBody, sheetFoot);

  const toast = el("div", "tuh-toast");
  toast.dataset["testid"] = "reason";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;

  const menuDrawer = drawer("menu-drawer", "left", "Menu");
  const menuLog = el("ul", "log");
  menuLog.dataset["testid"] = "turn-log";
  const menuLegend = el("div", "tuh-legend");
  menuLegend.dataset["testid"] = "legend";
  const unitDrawer = drawer("unit-drawer", "left", "Unit");
  const settingsDrawer = drawer("settings-drawer", "right", "Settings");
  const helpDrawer = drawer("help-drawer", "right", "How to play");

  const actionsSheet = el("aside", "tuh-bottom-sheet");
  actionsSheet.dataset["testid"] = "actions-sheet";
  actionsSheet.hidden = true;
  const actionsHead = el("div", "tuh-sheet-head");
  const actionsTitle = el("h2");
  actionsTitle.textContent = "Actions";
  actionsTitle.style.margin = "0";
  actionsTitle.style.fontSize = "14px";
  const actionsPrice = el("span", "price");
  actionsPrice.dataset["testid"] = "actions-price";
  const actionsClose = iconButton("✕", "Close the actions list", "actions-close");
  actionsHead.append(actionsTitle, actionsPrice, actionsClose);
  const abilityList = el("ul", "tuh-ability-list");
  abilityList.dataset["testid"] = "ability-list";
  scrollable(abilityList, "Learned abilities", "");
  actionsSheet.append(actionsHead, abilityList);

  // The help drawer's content never changes at runtime, so it is built once — for the
  // same reason `game.ts`'s `<dialog>` help is: rebuilding it would throw away the
  // reader's scroll position for nothing.
  {
    const frag = document.createDocumentFragment();
    for (const topic of ports.help()) {
      const h = el("h3");
      h.textContent = topic.title;
      frag.append(h);
      for (const line of topic.lines) {
        const p = el("p");
        p.textContent = line;
        frag.append(p);
      }
    }
    helpDrawer.body.replaceChildren(frag);
  }

  stage.append(
    top,
    mid,
    bottom,
    sheet,
    toast,
    menuDrawer.root,
    unitDrawer.root,
    settingsDrawer.root,
    helpDrawer.root,
    actionsSheet,
  );

  // ── drawer/sheet bookkeeping ──────────────────────────────────────────────

  /**
   * Which overlay is open. ONE AT A TIME, and it is a single variable rather than
   * four `hidden` flags read back out of the DOM — reveal state kept in the DOM is
   * destroyed by the next repaint, which is the trap `scene.ts` documents at length.
   */
  type Overlay = "menu" | "unit" | "settings" | "help" | "actions" | null;
  let overlay: Overlay = null;
  /** Whose card the unit drawer shows: `null` means the acting unit. */
  let inspectId: string | null = null;
  let focused = false;

  const setOverlay = (next: Overlay): void => {
    overlay = overlay === next ? null : next;
    if (overlay !== "unit") inspectId = null;
    ports.refresh();
  };

  // ── rendering ─────────────────────────────────────────────────────────────

  function render(): void {
    const session = ports.session();
    const look = ports.look();
    if (!session) {
      chips.innerHTML = "";
      return;
    }

    chips.innerHTML = timelineHtml(session.state, look);

    // The tab shows NAME AND HP ONLY (AC-V37). Clock, Brave, Faith and the job are
    // the drawer's job — and asserting they are absent from the tab is what separates
    // this from a full card clipped by `overflow: hidden`.
    const actor = session.actor();
    const name = actor ? (look(actor.id)?.label ?? actor.id) : "—";
    const pct =
      actor && actor.maxHp > 0
        ? Math.max(0, Math.min(100, Math.round((actor.hp / actor.maxHp) * 100)))
        : 0;
    const color = actor ? (look(actor.id)?.color ?? "#e8b45c") : "#e8b45c";
    tab.innerHTML =
      `<span class="tab-name">${escapeHtml(name)}</span>` +
      (actor
        ? `<span class="tab-bar" style="--c:${escapeHtml(color)}"><i style="width:${pct}%"></i></span>` +
          `<span class="tab-hp">HP ${actor.hp} / ${actor.maxHp}</span>`
        : `<span class="tab-hp">No unit is acting</span>`);

    // THE UNIT DRAWER CLOSES WHEN A TARGET IS SELECTED (AC-V37) — and only then. It
    // deliberately survives an ILLEGAL tap: a drawer that closed on any board tap
    // would pass "it closed after a target tap" while telling the player nothing.
    const staged = session.stagedTarget();
    if (staged !== null && (overlay === "unit" || overlay === "actions")) overlay = null;
    sheet.hidden = staged === null;
    if (staged !== null) sheetBody.innerHTML = previewHtml(session, look);

    // The toast is EMPTY AT REST: it carries a refusal, a fatal fork or the terminal
    // banner and nothing else. The phase hint rides on the sheet and the buttons, so
    // the board is never covered by an idle status line.
    const message = session.fatal ?? session.reason ?? session.outcome ?? null;
    toast.hidden = message === null;
    toast.className = `tuh-toast ${session.fatal ? "fatal" : session.reason ? "warn" : "info"}`;
    toast.textContent = message ?? "";

    renderControls(session);
    renderDrawers(session, look);

    ports.paintBoard();
  }

  function renderControls(session: Session): void {
    const playable =
      session.phase === "PLAYER_IDLE" ||
      session.phase === "MOVE_STAGED" ||
      session.phase === "TARGET_STAGED";

    cancelBtn.disabled = session.phase !== "MOVE_STAGED" && session.phase !== "TARGET_STAGED";
    actionsBtn.disabled = session.actor() === undefined;

    // THE PHASE-AWARE PRIMARY BUTTON (docs/10 §3, AC-V38b). In `AI_TURN` it is the
    // only control the enemy's turn has — an explicit Step, never a timer. Both the
    // LABEL and the BEHAVIOUR change, because a button that relabels but does nothing
    // strands the player and a button that steps while still reading "End Turn"
    // passes a behaviour-only check.
    if (session.phase === "AI_TURN") {
      primaryBtn.textContent = "Enemy turn ▸";
      primaryBtn.disabled = false;
      primaryBtn.title = PHASE_HINT.AI_TURN;
    } else {
      primaryBtn.textContent = session.endTurnLabel();
      // DISABLED WITH A TARGET HELD. `Session.endTurn` refuses there too (that is the
      // guard); this stops the player reaching for a control whose only answer is a
      // refusal. Confirm is the one way to spend a turn once a shot is aimed.
      primaryBtn.disabled = !playable || session.phase === "TARGET_STAGED";
      primaryBtn.title = PHASE_HINT[session.phase];
    }

    confirmBtn.disabled = session.phase !== "TARGET_STAGED";

    // The campaign's way off a finished battle. It REPLACES the primary button rather
    // than crowding beside it: at the narrowest stage four controls do not fit, and a
    // decided battle has no turn left to end.
    const done = session.phase === "ENDED" ? (ports.conclude?.() ?? null) : null;
    concludeBtn.hidden = done === null;
    primaryBtn.hidden = done !== null;
    if (done) concludeBtn.textContent = done.label;
  }

  /**
   * EVERY DRAWER'S CONTENT IS LIVE WHETHER OR NOT IT IS OPEN, and that is deliberate
   * on two counts. A panel built only on open is a panel whose content is a function
   * of when you looked; and the turn log, the legend and the status readout are what
   * three browser specs read to establish that a battle happened at all.
   *
   * WHAT IS *NOT* REBUILT is the menu's button list. `replaceChildren` on every
   * repaint destroys focus inside it, and `refresh()` runs on every action — so a
   * keyboard player pressing a menu button would be thrown out of the menu by their
   * own press. The buttons are built once and relabelled in place; only the parts
   * with no focusable children are rebuilt.
   */
  function renderDrawers(session: Session, look: LookUp): void {
    menuDrawer.root.hidden = overlay !== "menu";
    unitDrawer.root.hidden = overlay !== "unit";
    settingsDrawer.root.hidden = overlay !== "settings";
    helpDrawer.root.hidden = overlay !== "help";
    actionsSheet.hidden = overlay !== "actions";

    renderMenu(session, look);

    // ADR-0033's full stat set, through `unitCardHtml`'s `focusUnitId` seam — the hook
    // that ADR kept alive for exactly this. Pass nothing and the card describes
    // whoever acts next; pass an id and it describes that unit, which is what "tap a
    // non-target unit to inspect it" means (AC-V37).
    unitDrawer.body.innerHTML =
      inspectId === null
        ? unitCardHtml(session.state, look)
        : unitCardHtml(session.state, look, inspectId);
    unitDrawer.title.textContent = inspectId === null ? "Acting unit" : "Unit";

    settingsDrawer.body.replaceChildren(readout(session), statusBlock(session, look));
    renderActions(session);
  }

  /** The menu's buttons are built once; everything else in it is rebuilt each paint. */
  let menuButtons: HTMLButtonElement[] | null = null;
  function renderMenu(session: Session, look: LookUp): void {
    const entries = ports.menu();
    if (menuButtons === null) {
      const list = el("div", "tuh-menu-list");
      menuButtons = entries.map((entry) => {
        if (entry.run === undefined) {
          const note = el("p", "tuh-menu-note");
          note.dataset["testid"] = entry.id;
          note.textContent = entry.label;
          list.append(note);
          return note as unknown as HTMLButtonElement;
        }
        const b = el("button");
        b.type = "button";
        b.dataset["testid"] = entry.id;
        b.textContent = entry.label;
        // The HANDLER re-reads `ports.menu()` so a relabelled entry still runs the
        // right thing — the closure must not capture the entry it was built from.
        b.addEventListener("click", () => {
          ports.menu().find((e) => e.id === entry.id)?.run?.();
        });
        list.append(b);
        return b;
      });
      const logTitle = el("h3");
      logTitle.textContent = "Turn log";
      const legendTitle = el("h3");
      legendTitle.textContent = "Legend";
      menuDrawer.body.replaceChildren(list, logTitle, menuLog, legendTitle, menuLegend);
    } else {
      entries.forEach((entry, i) => {
        const b = menuButtons![i];
        if (b && b.textContent !== entry.label) b.textContent = entry.label;
      });
    }
    menuLog.innerHTML = logHtml(session.state, look, "No turns yet — move or strike to begin.");
    menuLegend.replaceChildren();
    for (const row of ports.legend()) {
      const span = el("span");
      const swatch = el("i");
      if (row.sw !== undefined) swatch.dataset["sw"] = row.sw;
      swatch.style.background = row.color;
      if (row.edge !== undefined) {
        swatch.style.borderWidth = "2px";
        swatch.style.borderColor = row.edge;
        swatch.style.borderRadius = "50%";
      }
      span.append(swatch, document.createTextNode(row.label));
      menuLegend.append(span);
    }
  }

  /**
   * THE ACTIONS SHEET IS DERIVED, NOT AUTHORED (AC-V38a): one row per entry in the
   * `unit.abilities` projection, each with its own range. A static table or a
   * template printing one shared range passes a count-only check, which is why the
   * spec asserts two rows print DIFFERENT ranges.
   *
   * THERE IS NO PER-ABILITY COST TO PRINT. `BattleAbilitySchema` carries no cost:
   * `apCost` is progression-only and is dropped from the battle projection by design
   * (ADR-0010/0011). The price of acting is the turn's flat Clock price, and it is
   * printed once, in the header.
   */
  function renderActions(session: Session): void {
    const actor = session.actor();
    // THE PRICE COMES FROM THE SIM'S OWN COST MODEL, not from an arithmetic in this
    // file. It read `didMove ? 100 : 80` — a combat constant restated in the render
    // layer, which would have gone on quoting the old figure if `CT_COST_MOVE_AND_ACT`
    // ever moved, with nothing going red.
    const cost = session.actCost();
    actionsPrice.textContent = cost
      ? `Acting costs the turn · ends at −${cost.cost} clock`
      : "—";
    abilityList.replaceChildren();
    if (!actor) return;
    for (const ability of actor.abilities) {
      const li = el("li");
      li.dataset["ability"] = ability.id;
      const name = el("span", "ab-name");
      name.textContent = abilityLabel(ability.id);
      const range = el("span", "ab-range");
      range.textContent = rangeText(ability.range);
      li.append(name, range);
      abilityList.append(li);
    }
  }

  /**
   * The settings readout (AC-V40). FOUR things, and `visualViewport` is printed
   * SEPARATELY from the host's measured box because the two can disagree — that
   * disagreement is the bug an on-device readout exists to catch.
   */
  function readout(session: Session): HTMLElement {
    const g = stageCtl.geometry();
    const hostBox = host.getBoundingClientRect();
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    const tile = tileSizeFor(session.state, CANVAS_W, CANVAS_H);
    // Backing-store px → CSS px: the canvas's own box already carries the stage
    // transform, so one measurement covers both the stage scale and the CSS size.
    const canvasBox = canvas.getBoundingClientRect();
    const k = canvasBox.width / CANVAS_W;
    const p = el("p", "tuh-readout");
    p.dataset["testid"] = "settings-readout";
    const rows: [string, string][] = [
      [
        "visualViewport",
        vv ? `${round(vv.width)} x ${round(vv.height)}` : "unavailable",
      ],
      ["host box", `${round(hostBox.width)} x ${round(hostBox.height)}`],
      ["stage", `${g.stageW} x ${g.stageH} @ ${g.scale.toFixed(4)}`],
      ["tile", `${round(tile.x * k)} x ${round(tile.y * k)} css px`],
    ];
    p.innerHTML = rows
      .map(([k2, v]) => `<b>${escapeHtml(k2)}</b> ${escapeHtml(v)}`)
      .join("<br>");
    return p;
  }

  function statusBlock(session: Session, look: LookUp): HTMLElement {
    // NO `id="status"`: both pages style `#status` as a flex row of the OLD battle
    // chrome, and an id selector outranks every class rule in `stage.css`. The seam
    // is the test id, which is what the specs use.
    const box = el("p", "tuh-readout");
    box.dataset["testid"] = "status";
    box.innerHTML = statusHtml(session, look).replace(/<\/span>/g, "</span><br>");
    return box;
  }

  // ── input ─────────────────────────────────────────────────────────────────

  let chipsExpanded = false;
  chipsMore.addEventListener("click", () => {
    chipsExpanded = !chipsExpanded;
    chips.classList.toggle("expanded", chipsExpanded);
    chipsMore.setAttribute("aria-expanded", String(chipsExpanded));
  });
  chipsMore.setAttribute("aria-expanded", "false");

  menuBtn.addEventListener("click", () => setOverlay("menu"));
  helpBtn.addEventListener("click", () => setOverlay("help"));
  settingsBtn.addEventListener("click", () => setOverlay("settings"));
  actionsBtn.addEventListener("click", () => setOverlay("actions"));
  actionsClose.addEventListener("click", () => setOverlay(null));
  menuDrawer.close.addEventListener("click", () => setOverlay(null));
  unitDrawer.close.addEventListener("click", () => setOverlay(null));
  settingsDrawer.close.addEventListener("click", () => setOverlay(null));
  helpDrawer.close.addEventListener("click", () => setOverlay(null));

  tab.addEventListener("click", () => {
    inspectId = null;
    setOverlay("unit");
  });

  cancelBtn.addEventListener("click", () => {
    ports.act("cancel", () => ports.session()?.cancel());
  });

  primaryBtn.addEventListener("click", () => {
    const session = ports.session();
    if (!session) return;
    // ONE control, TWO behaviours, chosen by phase — not two controls one of which is
    // hidden. `step()` resolves the active unit through the balance probe, which is
    // the same explicit beat the seam uses, so the enemy's turn never races a clock.
    if (session.phase === "AI_TURN") ports.act("step", () => session.step());
    else ports.act("end-turn", () => session.endTurn());
  });

  confirmBtn.addEventListener("click", () => {
    ports.act("confirm", () => ports.session()?.confirm());
  });

  concludeBtn.addEventListener("click", () => {
    ports.conclude?.()?.run();
  });

  /** Client pixels → CANVAS backing pixels. The rect already carries the stage scale. */
  function toCanvasPoint(ev: { clientX: number; clientY: number }): Position {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((ev.clientY - rect.top) * CANVAS_H) / rect.height,
    };
  }

  /**
   * A board tap. Two outcomes and they are not the same gesture:
   *   - a LEGAL target, or a tile ⇒ `Session.onPick`, the one tile-driven mutator;
   *   - a unit that is NOT a legal target ⇒ the unit drawer, read-only, for that
   *     unit (docs/10 §3, AC-V37). This is ADR-0033's parked cursor-follow inspect
   *     arriving as a tap, through `unitCardHtml`'s `focusUnitId` seam.
   */
  function pickAt(p: Position | null): void {
    const session = ports.session();
    if (!session || p === null) {
      ports.act("pick", () => ports.session()?.onPick(p));
      return;
    }
    // LIVING units only. A KO'd unit still holds its tile and `onPick` names that
    // honestly ("A crystal blocks that tile"); inspecting a corpse's stat card instead
    // would replace a real refusal with a panel.
    const occupant = session.state.units.find(
      (u) => u.pos.x === p.x && u.pos.y === p.y && u.hp > 0,
    );
    const targetable = session.targetTiles().some((t) => t.x === p.x && t.y === p.y);
    const actor = session.actor();
    const isActor = actor !== undefined && actor.pos.x === p.x && actor.pos.y === p.y;
    if (occupant && !targetable && !isActor) {
      inspectId = occupant.id;
      overlay = "unit";
      ports.refresh();
      return;
    }
    ports.act("pick", () => session.onPick(p));
  }

  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.button === 2) return;
    canvas.focus();
    const p = toCanvasPoint(ev);
    const session = ports.session();
    pickAt(session ? pickTile(session.state, p.x, p.y, CANVAS_W, CANVAS_H) : null);
  });

  canvas.addEventListener("pointermove", (ev) => {
    const session = ports.session();
    if (!session) return;
    const p = toCanvasPoint(ev);
    const tile = pickTile(session.state, p.x, p.y, CANVAS_W, CANVAS_H);
    if (sameTile(tile, session.hover)) return;
    session.onTileHover(tile);
    ports.refresh();
  });

  canvas.addEventListener("pointerleave", () => {
    const session = ports.session();
    if (!session) return;
    session.onTileHover(null);
    ports.refresh();
  });

  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    ports.act("cancel", () => ports.session()?.cancel());
  });

  canvas.addEventListener("focus", () => {
    focused = true;
    ports.refresh();
  });
  canvas.addEventListener("blur", () => {
    focused = false;
    ports.refresh();
  });

  const CURSOR_STEP: Record<string, Position> = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };

  canvas.addEventListener("keydown", (ev) => {
    const session = ports.session();
    if (!session) return;
    const stepVec = CURSOR_STEP[ev.key];
    if (stepVec) {
      ev.preventDefault();
      session.moveCursor(stepVec.x, stepVec.y);
      ports.refresh();
      return;
    }
    // ENTER ON THE BOARD STAGES; it does not commit (ADR-0038). Confirm is reached by
    // ordinary focus — staging moves focus to the sheet's button below — so no key
    // path commits without passing through Confirm, and there is no new binding.
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      pickAt(session.cursor);
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      // The board cannot be focused while a drawer is up, but the rule is the same
      // one the page-level handler applies: shallowest first.
      if (!closeOpenOverlay()) ports.act("cancel", () => session.cancel());
    }
  });

  function closeOpenOverlay(): boolean {
    if (overlay === null) return false;
    overlay = null;
    inspectId = null;
    ports.refresh();
    return true;
  }

  /**
   * FOCUS FOLLOWS THE STAGE (ADR-0038 property 3). The instant a target is staged,
   * focus moves to Confirm so **Enter** commits through ordinary focus; when the
   * target is unstaged, focus goes back to the board so picking is re-armed.
   * Tracked against the PREVIOUS phase so a repaint does not steal focus every frame.
   */
  let lastPhase: Phase | null = null;
  function syncFocus(): void {
    const session = ports.session();
    const phase = session?.phase ?? null;
    if (phase === lastPhase) return;
    const was = lastPhase;
    lastPhase = phase;
    if (phase === "TARGET_STAGED") confirmBtn.focus();
    else if (was === "TARGET_STAGED" && document.activeElement === confirmBtn) canvas.focus();
  }

  // ── the stage transform ───────────────────────────────────────────────────

  const stageCtl: StageController = mountStage(host, stage, () => {
    // Nothing in the HUD is sized in CSS px, so a resize needs no re-layout — but the
    // settings readout quotes the geometry, so it has to be redrawn while open.
    if (overlay === "settings") {
      const session = ports.session();
      if (session) settingsDrawer.body.replaceChildren(readout(session), statusBlock(session, ports.look()));
    }
  });

  return {
    stage,
    canvas,
    render: () => {
      render();
      syncFocus();
    },
    pick: (p) => pickAt(p),
    resize: () => stageCtl.refresh(),
    geometry: () => stageCtl.geometry(),
    canvasFocused: () => focused,
    closeOverlay: () => {
      if (overlay === null) return false;
      overlay = null;
      inspectId = null;
      ports.refresh();
      return true;
    },
  };
}

// ── small builders ───────────────────────────────────────────────────────────

function iconButton(glyph: string, label: string, testId: string): HTMLButtonElement {
  const b = el("button", "tuh-icon");
  b.type = "button";
  b.textContent = glyph;
  b.setAttribute("aria-label", label);
  b.title = label;
  b.dataset["testid"] = testId;
  return b;
}

interface Drawer {
  root: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  close: HTMLButtonElement;
}

function drawer(testId: string, side: "left" | "right", heading: string): Drawer {
  const root = el("aside", `tuh-drawer tuh-drawer-${side}`);
  root.dataset["testid"] = testId;
  root.hidden = true;
  const head = el("div", "tuh-drawer-head");
  const title = el("h2");
  title.textContent = heading;
  const close = iconButton("✕", `Close ${heading.toLowerCase()}`, `${testId}-close`);
  head.append(title, close);
  const body = el("div", "tuh-drawer-body");
  scrollable(body, heading);
  root.append(head, body);
  return { root, title, body, close };
}

/**
 * Make an overflowing panel reachable by keyboard.
 *
 * axe reports `scrollable-region-focusable` as SERIOUS, and it is not pedantry here:
 * the preview sheet holds §4's transparency set, which is exactly the material a
 * player needs before committing, and the drawers hold the stat card and the turn log.
 * A region that scrolls with no tab stop hides all of it from anyone not using a mouse.
 */
function scrollable(node: HTMLElement, label: string, role = "region"): void {
  node.tabIndex = 0;
  // NO `role="region"` ON A <ul>. It REPLACES the implicit list role, and axe then
  // files every child as "a <li> not contained in a <ul>" — a real orphaning, not a
  // false positive: a screen reader stops announcing "list, 6 items". Measured.
  if (role !== "") node.setAttribute("role", role);
  node.setAttribute("aria-label", label);
}

function sameTile(a: Position | null, b: Position | null): boolean {
  return a === null || b === null ? a === b : a.x === b.x && a.y === b.y;
}

const round = (n: number): number => Math.round(n * 10) / 10;

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
