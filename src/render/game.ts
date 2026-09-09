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

import type { StoryBeat, UnitRecord } from "../sim/index.js";
import {
  ENCOUNTERS,
  PORTRAIT_PLACEHOLDER,
  PORTRAITS,
  SCENE_ART,
  TITLE_ART,
  battleTitle,
  campaign,
  registry,
  resolvePortrait,
  story,
  storyCharacterFor,
  terrainFor,
} from "./campaign-data.js";
import { CampaignShell, type Screen } from "./campaign-shell.js";
import type { GameApi, PrepSeam } from "./game-api.js";
import { HELP_TOPICS } from "./help.js";
import { icon } from "./icons.js";
import { draw, FIELD_THEME, RING_FILL_ALPHA } from "./iso.js";
import { mountHud, type HudHandle } from "./hud.js";
import { MotionDirector, prefersReducedMotion, type MotionBeat } from "./motion.js";
import type { LookUp } from "./panels.js";
import { jobCrest, jobLabel, mountPrep, type PrepHandle } from "./prep.js";
import { wireLandscapeButton } from "./orientation.js";
import { mountScene, type SceneHandle } from "./scene.js";
import { SAVE_KEY, browserSlot, memorySlot } from "./storage.js";
import { PLAYTEST_LOG_KEY, Recorder, diffRecord, summarize } from "./telemetry.js";
import type { Session } from "./session.js";

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// The title screen's art (docs/visual/concepts/README.md §e) — bundled via TITLE_ART so
// Vite resolves each to a hashed, `base`-aware URL (the same reason the portraits are
// imported rather than hand-written as relative `src` attributes in index.html). Set
// once at boot: none of the three ever changes while the page is open.
el<HTMLImageElement>("title-castle").src = TITLE_ART.castle;
el<HTMLImageElement>("title-ribbon").src = TITLE_ART.ribbon;
el<HTMLImageElement>("title-watermark").src = TITLE_ART.watermark;
// The scene player's backdrop (docs/visual/concepts/README.md §e), same reasoning.
el<HTMLImageElement>("scene-backdrop").src = SCENE_ART.night;
// The briefing's three ribbon crops (top rail, party leaf, member leaf) — the SAME
// bundled art the title screen wears, reused rather than re-cropped, and set once for
// the same reason: none of them ever changes while the page is open.
//
// The tagline's castle end-cap is GONE with the tagline itself: the split moved that
// line into the party leaf's foot rail as a plain italic aside (the approved
// `party-851x324.png` frame), where a decorative end-cap has no ribbon to cap. Its
// former test (`e2e/briefing.spec.ts` D3) moved onto `brief-member-name`, which is the
// element that now carries the same "a `.textContent` write destroys a sibling" trap.
el<HTMLImageElement>("brief-ribbon-top").src = TITLE_ART.ribbon;
el<HTMLImageElement>("brief-ribbon-side").src = TITLE_ART.ribbon;
el<HTMLImageElement>("brief-ribbon-member").src = TITLE_ART.ribbon;
// The three static plaque buttons' glyphs — inline SVG rather than a shared sprite (see
// `icons.ts`'s file banner: a `<symbol>` sprite would have to land before ANY of this
// panel's three DOM sources paints its first `<use>`, and nothing enforces that order).
el("btn-brief-quit").innerHTML = icon("back");
el("btn-member-back").innerHTML = icon("back");
// Crossed swords, not `flag`: the pennant read as a small filled square at this size
// (owner, 2026-09-07). "March" is the verb this plate commits to.
el("btn-deploy").innerHTML = `${icon("swords")}Deploy`;

/**
 * `localStorage` can be missing entirely (a sandboxed frame), or PRESENT but unusable — a
 * privacy configuration that lets the `localStorage` property resolve yet throws the
 * moment anything actually touches it (the getter itself, or `getItem`/`setItem`). A bare
 * `typeof localStorage !== "undefined"` only catches the first case, so a real probe —
 * write a throwaway key, read it back, remove it — is needed to catch the second; every
 * step is wrapped so a probe that throws proves unavailability instead of taking the page
 * down. Fall back to an in-memory slot when it fails, and say so on the title screen
 * rather than letting the player finish a campaign that was never going to be saved.
 */
function detectStorage(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const probeKey = "tuh.storage-probe";
    localStorage.setItem(probeKey, "1");
    localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}
const storageAvailable = detectStorage();
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

/**
 * Presentation for the CURRENT battle, derived from the shell's own record names.
 *
 * `job` and `portrait` feed the mini stat card. Job comes from the SAME placement walk
 * the names do (`deployedRecords`), so the card can never caption one unit's name with
 * another's job. It is spread conditionally rather than defaulted: a slot with no record
 * shows no job row at all, which is the honest answer, and `exactOptionalPropertyTypes`
 * makes `job: undefined` a compile error.
 *
 * THE PORTRAIT COMES FROM `resolvePortrait` (ADR-0039), a viewer-only table keyed by
 * the ROSTER RECORD's id ("pc-briar") — the engine has no gender field to derive this
 * from, and never needs one. `id` here is the battle unit's id, which is the
 * placement's `slotId` ("blue-briar"), NOT the record id — the same gap `unitNames`
 * closes for the display name, so the lookup goes through `shell.unitRecordIds()`
 * first. A record id the table names nothing for (today: `pc-vance`, `pc-kest` — the
 * two jobs out of portrait scope) resolves to `"placeholder"`, the honest answer for a
 * character no approved art exists for. The card captions off the KEY, not off
 * whether a URL resolved, so a unit with real art gets no "Portrait pending" caption.
 *
 * A slot with NO record id (there should never be one on a real battle — see
 * `shell.unitRecordIds()`'s doc comment and `campaign-shell.test.ts`) gets an EXPLICIT
 * placeholder branch rather than falling back to the slot id itself: `recordIds[id] ??
 * id` would silently hand `resolvePortrait` a value that happens never to collide with
 * a table key today, which is a coincidence, not a guarantee.
 */
function look(): LookUp {
  const names = shell.unitNames();
  const jobs = shell.unitJobs();
  const recordIds = shell.unitRecordIds();
  const state = shell.session?.state;
  return (id) => {
    const unit = state?.units.find((u) => u.id === id);
    if (!unit) return undefined;
    const job = jobs[id];
    const recordId = recordIds[id];
    return {
      label: names[id] ?? id,
      color: teamColor(unit.teamId),
      ...(job !== undefined ? { job: jobLabel(job) } : {}),
      portrait:
        recordId === undefined
          ? { key: "placeholder", url: PORTRAIT_PLACEHOLDER }
          : resolvePortrait(recordId),
    };
  };
}


/**
 * One mounted scene per story host, kept OUT of the DOM so a repaint cannot reset how
 * much has been read. Lazily filled, exactly as the prep panel is.
 */
const scenes = new Map<string, SceneHandle>();

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

/**
 * THE BATTLE SCREEN, BUILT ONCE (ADR-0037). `hud.ts` owns the stage, the zones and the
 * controls; this page supplies the four things only it can answer — which session is
 * live, what the units are called and coloured, how the board is painted (this page has
 * authored terrain and a field theme; the engine viewer has neither), and where a
 * finished battle leads.
 */
const hud: HudHandle = mountHud(el("stage-host"), {
  session: () => shell.session ?? null,
  look: () => look(),
  refresh: () => refresh(),
  paintBoard: () => paintBoard(),
  // Named, so a HUD button files the same playtest row a `window.tuhGame` call does.
  act: (name, run) => act(name, run),
  legend: () => LEGEND_ROWS(),
  help: () => HELP_TOPICS,
  menu: () => [
    // A NOTE, not a button. The save is written on every transition already
    // (`campaign-shell.ts`), so a "Save" control would validate nothing and do nothing
    // while looking exactly like a working one — and what a player actually wants to
    // know before pressing Quit is that nothing is lost. docs/10 AC-V40 asks the ☰
    // drawer to offer "save"; this is the honest form of that, and the deviation is
    // deliberate rather than an omission.
    { id: "menu-save", label: "Progress is saved automatically — quitting loses nothing" },
    { id: "quit", label: "Quit to title", run: () => act("quit", toTitle) },
    {
      id: "btn-step",
      label: shell.session?.phase === "AI_TURN" ? "Play the enemy turn ▸" : "Auto-play my turn ▸",
      run: () => act("btn-step", () => shell.session?.step()),
    },
  ],
  conclude: () => ({ label: "Continue ▸", run: () => act("btn-conclude", () => concludeAndLog()) }),
});

/**
 * The screen the last paint showed, so a TRANSITION can be told from a repaint.
 *
 * `refresh()` runs on every click; a screen change does not. The briefing's view
 * (party / member) resets on ENTERING the screen and must survive every repaint after
 * that, so it needs the edge, not the level. Enumerated by transition rather than by
 * state on purpose (`src/render/CLAUDE.md`): a briefing is entered from the scene
 * player, from Retry and from Next battle, and all three land here.
 */
let shownScreen: Screen | null = null;

function renderScreens(): void {
  if (shell.screen !== shownScreen) {
    // Entering the briefing ALWAYS starts on party select — the member view is two
    // taps deep and reaching a battle through it would be a second commit point. The
    // learn overlay goes with it: the panel is mounted ONCE for the whole session, so
    // an overlay left open on battle 2 is still open on battle 3's briefing, over
    // whichever member is opened next (AC-V60's reset, extended to the overlay).
    if (shell.screen === "BRIEFING") {
      briefView = "party";
      prep?.closeLearn();
    }
    shownScreen = shell.screen;
  }
  for (const s of SCREENS) {
    el(SCREEN_EL[s]).hidden = s !== shell.screen;
  }
  // THE STAGE OWNS THE WHOLE VIEWPORT while a battle is up, so the page beneath it
  // must not scroll (AC-V33); every other screen is an ordinary scrolling document.
  const onStage = shell.screen === "BATTLE";
  document.documentElement.classList.toggle("tuh-on-stage", onStage);
  document.body.classList.toggle("tuh-on-stage", onStage);
  // Re-measured AFTER the section is shown. A hidden host measures 0 x 0, and a
  // geometry derived from that would letterbox the entire stage away.
  if (onStage) hud.resize();
}

/**
 * The title screen's New-Game overwrite step (replaces the removed Erase-save button,
 * per the owner's concept). UI-only — it never reaches the shell until "Yes" — so it is
 * plain module state, the same way {@link prepSeen} is: `renderTitle` only runs while
 * `shell.screen === "TITLE"` (see `refresh`), so nothing here can leak a stale prompt
 * onto another screen; {@link toTitle} clears it on every path back to this one.
 */
let confirmOverwrite = false;

/**
 * Focus owed on the NEXT `renderTitle()` paint, set by whichever action just changed
 * `confirmOverwrite` and cleared once applied. Deferred rather than called inline because
 * the target is `hidden` until `renderTitle()` un-hides it — focusing a hidden element is
 * a silent no-op, so the call has to land after the DOM actually shows the button.
 */
let pendingTitleFocus: "confirm-yes" | "new-game" | null = null;

function renderTitle(): void {
  const slot = shell.slotState;

  el<HTMLDivElement>("new-game-confirm").hidden = !confirmOverwrite;
  el<HTMLButtonElement>("btn-new-game").hidden = confirmOverwrite;
  const continueBtn = el<HTMLButtonElement>("btn-continue");
  continueBtn.hidden = confirmOverwrite;
  continueBtn.disabled = !shell.canContinue();
  // The save readout lives ON the plaque now, not beside it: a second line under
  // "Continue" carries the progress, in its own smaller italic rather than crammed onto
  // one line with the plaque caps (that wrapped mid-phrase — see `.continue-progress`
  // in overhaul.css). With no save the line is empty, so the plaque stays one line.
  el("continue-progress").textContent =
    slot.kind === "save"
      ? slot.save.status === "completed"
        ? `All ${campaign.battles.length} won`
        : `Battle ${slot.save.battleIndex + 1} of ${campaign.battles.length}`
      : "";

  const note = el("title-slot");
  if (slot.kind === "save") {
    // Nothing to add here any more — the label above already carries this state, and the
    // note is about to be hidden regardless (see below).
    note.className = "reason info";
    note.textContent = "";
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
  // SHOWN for either warning a player must act on — a save that cannot be read, or a
  // browser that will not let anything be saved at all — and hidden otherwise: the
  // "save"/"empty"-with-storage branches above still set text (harmless, and simpler than
  // threading a third state through), they just never surface it.
  note.hidden = slot.kind !== "error" && storageAvailable;
  renderLogControl();

  if (pendingTitleFocus === "confirm-yes") {
    el<HTMLButtonElement>("btn-new-game-yes").focus();
    pendingTitleFocus = null;
  } else if (pendingTitleFocus === "new-game") {
    el<HTMLButtonElement>("btn-new-game").focus();
    pendingTitleFocus = null;
  }
}

/**
 * New Game, clicked. Asks first, in page, on the plaque — no `window.confirm` — but ONLY
 * when the slot holds a genuinely READABLE save (`kind === "save"`): that is the one case
 * with something to lose. An unreadable slot (`kind === "error"`) has nothing left to
 * protect — the bytes are already garbage — so gating it too would turn "New Game still
 * works" on a corrupt save into an extra, pointless tap; it starts over at once, same as
 * an empty slot.
 */
function newGameClick(): void {
  if (shell.slotState.kind !== "save") {
    shell.newGame();
    return;
  }
  confirmOverwrite = true;
  pendingTitleFocus = "confirm-yes";
}

/** "Yes" on the overwrite step: start the fresh run, dropping the old save. */
function newGameConfirmed(): void {
  confirmOverwrite = false;
  shell.newGame();
}

/** "Back" on the overwrite step (or Escape, see the TITLE keydown handler below): leave
 * the existing save untouched and return focus to New Game. */
function newGameCancelled(): void {
  confirmOverwrite = false;
  pendingTitleFocus = "new-game";
}

/** Every path back to the title screen, so a stale overwrite prompt cannot survive it. */
function toTitle(): void {
  confirmOverwrite = false;
  shell.quitToTitle();
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
    // The house-ribbon charge belongs to the SCENE screen only (`overhaul.css` styles it
    // under `#screen-scene`); `renderStory` also mounts `brief-story`, `after-story` and
    // `done-story`, none of which are scoped by that CSS, so an unscoped `.portrait img`
    // rule on those screens would paint the ribbon as a second stacked portrait. `id` IS
    // the host id (`el(id)`), so this is the same "which screen" test the DOM already
    // answers — no new lookup to drift. `exactOptionalPropertyTypes` forbids passing
    // `ribbon: undefined` explicitly (that is a declared-absent value, not an absent
    // key), so the field is left OFF the options object entirely for every other host.
    handle = mountScene(el(id), {
      portraits: PORTRAITS,
      ...(id === "scene-story" ? { ribbon: TITLE_ART.ribbon } : {}),
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
 * A party member's Profile prose, from the STORY PACK, or `null` when the pack writes
 * none for them.
 *
 * A BATTLE-ROSTER ID IS NOT A STORY ID (`src/render/CLAUDE.md`): the roster record is
 * `pc-briar` and the story character is `briar`, so the join goes through
 * `storyCharacterFor` — the ONE copy of that convention in the render layer. Resolved
 * here rather than in `prep.ts` because the pack is swappable by contract (`docs/11`
 * AC-M4) and the panel must not know what a campaign is.
 */
function loreFor(recordId: string): string | null {
  return storyCharacterFor(recordId)?.lore ?? null;
}

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
      layout: "dossier",
      portrait: (record) => resolvePortrait(record.id).url,
      portraitPending: (record) => resolvePortrait(record.id).key === "placeholder",
      lore: (record) => loreFor(record.id),
      // THE RAIL CHANGED WHO IS OPEN. The page owns the chrome that names them — the
      // top rail's "· managing Briar" and the roster card's gold ring — so it repaints
      // that chrome here. `renderBriefingText` does not touch the panel, so this cannot
      // re-enter: it reads `prep.record()` and rewrites the roster only.
      onSelect: () => renderBriefingText(),
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

/**
 * WHICH BRIEFING VIEW IS UP — party select, or one member's detail (owner decision,
 * 2026-09-07).
 *
 * MODULE STATE, NEVER THE DOM. `renderBriefingText()` rewrites the roster's whole
 * `innerHTML` on every deploy toggle and on every prep edit, so a view flag kept in an
 * attribute, a class read back, or a child count would be destroyed by the first
 * ordinary party edit — the same rule `scene.ts`'s reveal cursor follows
 * (`src/render/CLAUDE.md`, "reveal state must never live in the DOM"). The `.party` /
 * `.member` class on `#screen-briefing` is a WRITE TARGET derived from this variable
 * on every paint, never a read source.
 */
type BriefView = "party" | "member";
let briefView: BriefView = "party";

/**
 * Switch views. Does NO DOM work at all on an unchanged view — the same shape
 * `scene.ts`'s `setBeat` and `prep.ts`'s `setTab` hold, so tapping the card that is
 * already open cannot rebuild the panel or steal focus mid-edit.
 */
function setBriefView(next: BriefView): void {
  if (next === briefView) return;
  briefView = next;
  // LEAVING THE MEMBER VIEW SHUTS THE LEARN OVERLAY. It is closure state inside a panel
  // mounted once per session, so the Back plaque is the only place that can see this
  // transition; without it, Back then opening anyone else showed the previous member's
  // job tree over the new sheet.
  if (next === "party") prep?.closeLearn();
  renderBriefingText();
  // FOCUS FOLLOWS THE VIEW, and only on an actual SWITCH.
  //
  // Both leaves are toggled with `display: none`, which blows focus away to `<body>`:
  // a keyboard or screen-reader user who opened a member landed nowhere, and had to tab
  // in from the top of the document to reach the panel they just asked for. Going back
  // was worse — the roster is rebuilt wholesale on every paint, so the card they came
  // from is a brand-new node with no focus on it.
  //
  // PARKED, not called: every caller of this function is inside `guard`, which repaints
  // AGAIN after the mutation returns. Focusing here works for `btn-member-back` (an
  // authored node that survives) and silently does nothing for a roster card (rebuilt,
  // measured: `document.activeElement` came back `body`). Parking it is what makes the
  // two directions behave the same way.
  //
  // Placed HERE rather than in `applyBriefView`, which every ordinary repaint calls: a
  // job change or a purchase re-enters that function, and moving focus there would yank
  // the caret out of the select the player is mid-edit in. `setBriefView` already
  // returns early on an unchanged view, so this runs exactly on the two transitions.
  const view = briefView;
  pendingFocus = () => {
    if (view === "member") {
      el("btn-member-back").focus();
    } else {
      // The card that was open, not the first one: the last paint marked it `.on` from
      // `prep.record()`, the same selection the member view was showing.
      document.querySelector<HTMLElement>("#brief-party li.member.on button.ptab")?.focus();
    }
  };
}

/**
 * Paint the current view. Idempotent, and called from every briefing repaint — that is
 * what makes the view survive `refresh()`, which is reached from every deploy toggle.
 *
 * `memberName` rides the rail beside the battle number ("Battle 2 of 5 · managing
 * Briar"), in its own span: `brief-step`'s own text is written with `.textContent`, and
 * a `.textContent` write on a parent destroys every child node — the trap the tagline's
 * castle end-cap was found in.
 */
function applyBriefView(memberName: string | null): void {
  const screen = el("screen-briefing");
  screen.classList.toggle("party", briefView === "party");
  screen.classList.toggle("member", briefView === "member");
  el("brief-member-name").textContent =
    briefView === "member" && memberName !== null ? ` \u00b7 managing ${memberName}` : "";
}

/** Everything on the briefing EXCEPT the prep panel, which owns its own repaint. */
function renderBriefingText(): void {
  const brief = shell.briefing();
  if (!brief) return;
  el("brief-step-text").textContent = `Battle ${brief.step} of ${brief.total}`;
  // The authored scene name when the story pack has one, the id-derived fallback when it
  // does not — the page prefers data over its own derivation, which is what makes the
  // title part of the story seam rather than a naming convention.
  el("brief-title").textContent = shell.sceneTitle() ?? battleTitle(brief.encounterId);
  renderStory("brief-story", preKey(), shell.preBeat());
  // ONE element, so this write has no sibling to destroy — the tagline's castle end-cap
  // (which this line used to sit beside) went with the split, and the same trap now
  // lives on `brief-step` / `brief-member-name` instead.
  el("brief-note-text").textContent = brief.retrying
    ? "You lost this one. The party is exactly as it was before the first attempt."
    : "Your party carries everything it has earned so far.";
  const party = shell.save?.party ?? [];
  // Which card the member view is showing (prep's own selection), so the roster's
  // outline never disagrees with the leaf it opens. `prep` is not yet mounted on the
  // very first paint of a briefing — `renderBriefing()` mounts it before calling this,
  // so by the time a real party is on screen `prep` is set; the fallback only covers a
  // call with no party at all (nothing to select).
  const selected = prep?.record();
  const selectedId = selected?.id;
  applyBriefView(selected?.name ?? null);

  // THE ROSTER IS OMITTED ENTIRELY FOR ONE MEMBER (mirrors `prep.ts`'s own "< 2 ⇒
  // absent" rule, since a single card offers no choice) — and with it the hint that
  // exists only to explain a list.
  const showRoster = party.length >= 2;
  el("prep-roster-wrap").hidden = !showRoster;
  const note = el("brief-deploy-note");
  note.hidden = !showRoster;
  // SIX SHOWN, TWO FIGHT — SAID OUT LOUD (ADR-0041). The per-card deploy TOGGLE is gone
  // (owner, 2026-09-08: "we don't worry about selection of party members yet"), and all
  // six will deploy in a later slice — but the shipped encounters still author 2/3/4/4/4
  // placements, so at battle 1 four of the six cards on this screen never reach the
  // board. A screen that lists six and fields two without saying so is the pillar-4
  // violation ("never render a state the sim did not produce" has a mirror: never let a
  // list imply a state the sim will not honour). This line and the per-card mark are
  // READ-ONLY: they report `shell.deploy()`'s authored set, they offer no control, and
  // no click changes them.
  //
  // The count comes from the ENCOUNTER's placements, never from `save.deployment` —
  // which is empty on every save this build writes (see `continueGame`), so a mark
  // derived from it would say the whole party is in camp.
  const authored = new Set(shell.deployment()?.authored ?? []);
  note.textContent =
    authored.size > 0 && authored.size < party.length
      ? `This battle fields ${authored.size} of ${party.length}. Tap a member to manage them.`
      : "Tap a member to manage them.";

  // HOW MANY COLUMNS, written as a custom property rather than solved by `auto-fit`:
  // the owner's ask is that a SIX-member party stands in ONE ROW at 832 CSS px, and
  // `repeat(auto-fit, minmax(<floor>, 1fr))` cannot honour that and a readable floor at
  // the same time — at 773px of leaf, six tracks are 124px each, under any floor wide
  // enough to keep four cards from looking starved. The count is the data's, so the
  // data supplies it. Capped at 6 so a seventh member wraps to a second row instead of
  // shrinking the whole roster below a readable face.
  const cardsList = el<HTMLUListElement>("brief-party");
  cardsList.style.setProperty("--cards", String(Math.min(Math.max(party.length, 1), 6)));
  cardsList.innerHTML = party
    .map((r) => {
      const on = r.id === selectedId;
      const portrait = resolvePortrait(r.id);
      // IN CAMP = this battle's placements do not name them. An ATTRIBUTE plus a
      // caption, and deliberately nothing else: no border change (which would read as
      // a selection state next to `.on`) and no control (there is nothing to toggle).
      // Suppressed entirely when the encounter fields everybody, so the mark means
      // something wherever it appears.
      const camp = authored.size > 0 && authored.size < party.length && !authored.has(r.id);
      return (
        `<li class="member${on ? " on" : ""}"${camp ? ' data-camp="true"' : ""}>` +
        `${icon("fleur", "finial")}` +
        `<button type="button" class="ptab${on ? " on" : ""}" data-member="${r.id}"${on ? ' aria-current="true"' : ""}>` +
        `<span class="face"><img class="${portrait.key === "placeholder" ? "pending" : ""}" src="${portrait.url}" alt="" /></span>` +
        `<span class="plate">` +
        `<span class="nline"><b class="pname">${r.name}</b><span class="pap">${r.ap} AP</span></span>` +
        `<span class="pjob">${icon(jobCrest(r.currentJob))}${jobLabel(r.currentJob)}</span>` +
        (camp ? `<span class="camp">In camp</span>` : "") +
        `</span></button>` +
        `<span class="pennant" aria-hidden="true">${icon("fleur")}</span>` +
        `</li>`
      );
    })
    .join("");

  // Rebound on every repaint because the list is rewritten wholesale.
  //
  // ONE TAP, ANYWHERE ON THE TILE. The handler is bound on the ROW (`li.member`), not on
  // the card button, so the finial, the pennant, the gaps and the foot are all the same
  // target — on a phone the difference between "the card" and "the button inside the
  // card" is a mis-tap. Nothing inside the tile stops propagation, and a foot element
  // that did would make part of the card dead; `e2e/briefing.spec.ts` taps the foot for
  // exactly that reason.
  for (const li of cardsList.querySelectorAll<HTMLLIElement>("li.member")) {
    const card = li.querySelector<HTMLButtonElement>("button[data-member]");
    if (!card) continue;
    const id = card.dataset["member"] as string;
    li.addEventListener("click", () =>
      guard(() => {
        // The same `select()` a test or the balance probe would drive, never a parallel
        // "which card is on" of this file's own.
        prep?.select(id);
        setBriefView("member");
      }),
    );
  }
}

function renderBriefing(): void {
  // PREP FIRST. The roster cards drawn by `renderBriefingText()` read `prep?.record()`
  // to mark which card is open in the right leaf, so on the very first paint of a
  // briefing the panel must already be mounted (mounting also does its own first
  // render) before the left leaf reads it — reversed, the first frame would show no
  // card selected at all.
  renderPrep();
  renderBriefingText();
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
  const ctx = hud.canvas.getContext("2d");
  if (!ctx) return;
  draw(ctx, session.state, hud.canvas.width, hud.canvas.height, {
    ...(terrain ? { terrain, theme: FIELD_THEME } : {}),
    activeId: active?.id,
    activeControl:
      active === undefined ? undefined : active.teamId === session.playerTeam ? "player" : "ai",
    range: session.moveTiles(),
    targets: session.targetTiles(),
    staged: session.stagedTile(),
    cursor: hud.canvasFocused() ? session.cursor : null,
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

/**
 * The battle screen is THE STAGE (ADR-0037, docs/10 §8), and `hud.ts` owns every zone
 * on it. What is left here is the two things only this page can answer — whether the
 * page beneath may scroll, and where a finished battle leads.
 */
function renderBattle(): void {
  const session = shell.session;
  if (!session) return;
  syncMotion(session);
  hud.render();
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
  // `log-note-title` starts `hidden` (rest matches the picture — docs/visual/concepts);
  // this is the one place that un-hides it, and it is a no-op everywhere else, since no
  // other screen's note starts hidden.
  note.hidden = false;

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
    // FOCUS IS APPLIED AFTER THE LAST PAINT, and this is why the hook exists.
    //
    // `refresh()` rebuilds whole panels — `renderBriefingText()` rewrites the roster's
    // `innerHTML` wholesale — so an element focused DURING the mutation is a detached
    // node by the time this returns and focus has fallen back to `<body>`. A mutation
    // that wants to move focus therefore parks a closure here instead of calling
    // `focus()` itself, and it runs once, after the final repaint, against the nodes
    // that actually ended up on screen. One-shot and cleared before it runs, so a
    // handler that re-enters `guard` cannot re-fire it.
    const focusAfter = pendingFocus;
    pendingFocus = null;
    focusAfter?.();
  }
}

/**
 * Where focus should land once the repaint {@link guard} runs is finished. `null` unless
 * the mutation in flight asked for it. See {@link setBriefView}, the only writer.
 */
let pendingFocus: (() => void) | null = null;

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

/**
 * THE BOARD'S OWN INPUT LIVES IN `hud.ts` NOW — pointer, hover, right-click cancel,
 * focus tracking and the arrow/Enter/Escape keys, all of it, shared with the engine
 * viewer. `Session.onPick` is still the one tile-driven mutator a real `pointerdown`
 * and the test seam both bottom out in (docs/10 §7); it is simply reached from one
 * place instead of two near-identical ones.
 */

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
function LEGEND_ROWS(): { sw?: string; color: string; edge?: string; label: string }[] {
  // `drawUnit` strokes the active ring in `theme.active` and fills the disc with the
  // same colour at `RING_FILL_ALPHA`, so the swatch quotes the paint rather than a
  // literal beside it — the defect of 2026-09-01 was a legend naming amber over a
  // board painted pale blue, and it survived because nothing compared the two.
  return [
    { sw: "party", color: teamColor(0), label: "Your party" },
    { sw: "foe", color: teamColor(1), label: "Enemies" },
    { sw: "move", color: FIELD_THEME.highlight, label: "Where the active unit can walk" },
    {
      sw: "ring",
      color: FIELD_THEME.active + RING_FILL_ALPHA,
      edge: FIELD_THEME.active,
      label: "Whose turn it is",
    },
  ];
}

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

on("btn-new-game", newGameClick);
on("btn-new-game-yes", newGameConfirmed);
on("btn-new-game-back", newGameCancelled);
on("btn-scene-continue", () => shell.endScene());
on("btn-continue", () => shell.continueGame());
on("btn-deploy", () => shell.deploy());
on("btn-brief-quit", toTitle);
// Same plaque, two destinations: quit-to-title on party select, back-to-party-select on
// member detail. Only one is ever visible (overhaul.css keys both off the view class).
on("btn-member-back", () => setBriefView("party"));
on("btn-next", () => shell.nextBattle());
on("btn-retry", () => shell.retry());
on("btn-after-quit", toTitle);
on("btn-done-title", toTitle);

/**
 * Escape on the BATTLE screen, from anywhere on it.
 *
 * SHALLOWEST FIRST, the same rule `main.ts` applies: an open drawer or sheet closes,
 * and only once nothing is overlaid does Escape reach the draft. The alternative
 * throws away a staged move the player never asked to lose while leaving the drawer
 * they DID mean to close still open.
 *
 * Scoped to the battle screen so it cannot fight the scene player's own handler below,
 * and skipped when the board itself has focus — `hud.ts` handles that case with the
 * same ordering.
 */
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || shell.screen !== "BATTLE") return;
  if (ev.target === hud.canvas) return;
  if (hud.closeOverlay()) return;
  guard(() => shell.session?.cancel());
});

/**
 * Escape on the TITLE screen, but ONLY while the overwrite-confirm step is open — at rest
 * there is nothing for it to back out of. Otherwise the step was a keyboard dead end: Tab
 * reaches Yes/Back, but nothing let a keyboard user close it without committing or
 * clicking, which a mouse user could always do. Acts exactly like Back.
 */
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || shell.screen !== "TITLE" || !confirmOverwrite) return;
  ev.preventDefault();
  guard(newGameCancelled);
});

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
  // Never swallow a key aimed at an open <dialog> (the `?` help panel opens over every
  // screen, this one included). The BUTTON/SELECT check below only bails for a target
  // actually focused inside such a control — Space and Escape on the dialog's own body
  // reach here uncaught, so without this the scene would advance/skip BEHIND the modal
  // on Space, and on Escape this handler's `preventDefault()` would suppress the
  // <dialog>'s native close-on-Escape (the default action `preventDefault` cancels),
  // leaving the help panel open while the beat skipped anyway.
  if (document.querySelector("dialog[open]")) return;
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
  // Routes through the SAME gate a click on the plaque does (`newGameClick`), so the
  // seam cannot silently overwrite a save the real button would have stopped to confirm.
  newGame: () => act("btn-new-game", newGameClick),
  continueGame: () => act("btn-continue", () => shell.continueGame()),
  // The button that reached this is gone from the title (replaced by the in-page
  // overwrite step), but the method stays: it is still how a corrupt/stale slot gets
  // cleared from a test, and `GameApi` is the shipped seam, not the DOM.
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
  state: () => shell.session?.state ?? null,
  clickTile: (x, y) => hud.pick({ x, y }),
  confirm: () => act("confirm", () => shell.session?.confirm()),
  cancel: () => act("cancel", () => shell.session?.cancel()),
  endTurn: () => act("end-turn", () => shell.session?.endTurn()),
  phase: () => shell.session?.phase ?? null,
  commandCount: () => shell.session?.commands().length ?? 0,
  stagedTarget: () => shell.session?.stagedTarget() ?? null,
  reason: () => shell.session?.reason ?? null,
  conclude: () => act("btn-conclude", () => concludeAndLog()),
  next: () => act("btn-next", () => shell.nextBattle()),
  retry: () => act("btn-retry", () => shell.retry()),
  // "quit", not a button id: three different buttons reach this, so naming one of
  // them would put a click in the log that nobody made.
  quitToTitle: () => act("quit", toTitle),
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
