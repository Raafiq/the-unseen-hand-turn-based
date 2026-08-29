/**
 * The scene player (docs/10 AC-V16) — a story beat read one line at a time.
 *
 * TWO PARTS, for the reason `session.ts` and `prep.ts` are split the same way: a pure
 * {@link SceneModel} that owns "how much has been read" and can be asserted in plain
 * Node, and a {@link mountScene} that draws it. The split is not tidiness here, it is
 * the fix for the bug this module exists around:
 *
 * REVEAL STATE MUST NOT LIVE IN THE DOM. `renderStory` is reached from `refresh()`,
 * and `refresh()` runs on every repaint — including the ones the prep panel's `onChange`
 * and every deploy toggle trigger, both of which land on the BRIEFING, which is exactly
 * where a scene is being read. The old renderer wiped and rebuilt its box on each call.
 * A cursor held in a DOM attribute, a class, or a count of child nodes is therefore
 * destroyed every time the player changes a job or benches someone. So the model lives
 * in a closure, `game.ts` holds the handles in a module-scope map, and the DOM is only
 * touched when the beat actually changes.
 *
 * NO TIMED REVEAL — no timer, no keyframe, no requestAnimationFrame, no transition on a
 * line. This would have been the codebase's first timed animation (the whole motion
 * inventory is three lines in `index.html`, and one reduced-motion query scoped to
 * `button`). Three reasons it stays input-driven:
 *
 *  1. A timer makes every browser assertion racy, and `playtest-capture.spec.ts`'s
 *     `shot()` asserts only that a testid is VISIBLE — a mid-typewriter frame passes it
 *     and ships as a silent screenshot regression.
 *  2. `prefers-reduced-motion` would force a second code path whose honest
 *     implementation is "show the line at once" — the path we would ship anyway.
 *  3. `contrast.spec.ts` skips elements at `opacity: 0` but MEASURES them at partial
 *     opacity without compositing element opacity, so a fade produces intermittently
 *     wrong ratios in the one instrument that guards legibility.
 *
 * So the reduced-motion claim this module makes is "there is nothing to reduce", and it
 * is asserted rather than narrated — see AC-V16's spec.
 *
 * No sim imports, no wall-clock, no RNG: advancing is a click, never a tick.
 */

import type { ResolvedLine } from "../sim/index.js";

/** Consecutive lines by one speaker, which share a single name plate. */
export interface SceneGroup {
  /** The name to print on the plate, or `null` for narration. */
  who: string | null;
  /** The asset key for the portrait to show beside this run, or `null`. */
  portrait: string | null;
  lines: string[];
}

/**
 * How much of a beat has been read.
 *
 * Starts at ONE revealed line, never zero. A scene that opens blank is
 * indistinguishable on screen from a scene that failed to load, and the existing browser
 * assertions ("the story block is not empty") would go green on the broken one.
 */
export class SceneModel {
  private readonly all: readonly ResolvedLine[];
  private cursor: number;

  constructor(lines: readonly ResolvedLine[]) {
    this.all = lines;
    this.cursor = lines.length === 0 ? 0 : 1;
  }

  /** How many lines the beat holds. */
  get total(): number {
    return this.all.length;
  }

  /** How many are currently on screen. */
  get revealed(): number {
    return this.cursor;
  }

  /** Whether every line has been read. */
  get done(): boolean {
    return this.cursor >= this.all.length;
  }

  /**
   * Reveal one more line. Returns the lines newly exposed — empty when there was
   * nothing left, so the caller appends rather than re-rendering, and a no-op advance
   * cannot re-announce the region to a screen reader.
   */
  advance(): readonly ResolvedLine[] {
    if (this.done) return [];
    const next = this.all[this.cursor]!;
    this.cursor += 1;
    return [next];
  }

  /** Reveal everything at once. Returns the lines newly exposed, in order. */
  skipToEnd(): readonly ResolvedLine[] {
    const rest = this.all.slice(this.cursor);
    this.cursor = this.all.length;
    return rest;
  }

  /** Everything revealed so far, grouped into name plates. */
  groups(): SceneGroup[] {
    return group(this.all.slice(0, this.cursor));
  }
}

/**
 * Group consecutive lines by speaker.
 *
 * Narration BREAKS a run: a line with no speaker resets the plate, so the next line by
 * the same character is re-attributed rather than reading as if the narrator said it.
 */
export function group(lines: readonly ResolvedLine[]): SceneGroup[] {
  const out: SceneGroup[] = [];
  for (const line of lines) {
    const who = line.who?.name ?? null;
    const last = out.at(-1);
    if (last && who !== null && last.who === who) {
      last.lines.push(line.text);
      continue;
    }
    out.push({ who, portrait: line.portrait, lines: [line.text] });
  }
  return out;
}

/** What the page can do to a mounted scene. */
export interface SceneHandle {
  /**
   * Point the scene at a beat.
   *
   * The KEY is the whole re-entrancy contract. Called with the same key, this does
   * nothing at all — no DOM work, no focus move, no live-region announcement — so a
   * repaint triggered by a prep edit or a deploy toggle cannot reset the cursor. Called
   * with a different key it rebuilds from line one. `null` hides the host, which is the
   * unchanged absent-not-zero contract: an unauthored beat is HIDDEN, never an empty box.
   *
   * A string key rather than the beat object, deliberately: object identity would break
   * silently the day an accessor grows a `.map()` in its path.
   */
  setBeat(key: string, lines: readonly ResolvedLine[] | null): void;
  /** Reveal one more line (the same thing the More control does). */
  advance(): void;
  /** Reveal the rest (the same thing Show all does). */
  showAll(): void;
  /** Read-only view, for the page's own keyboard handling and for tests. */
  readonly model: SceneModel | null;
  /** The button the page focuses when a scene screen is entered. */
  readonly moreButton: HTMLButtonElement;
}

export interface SceneOptions {
  /**
   * Called with a telemetry action name when the player advances or skips. Passed in
   * rather than read from a module, so this file keeps no dependency on the recorder.
   */
  onAction?: (action: string) => void;
}

/**
 * Draw a scene inside `host`, and hand back the controls.
 *
 * The inner DOM is built HERE rather than authored in `index.html` four times, following
 * `buildHelp()`: four copies of a structure is four places for one of them to drift, and
 * the drift is invisible because each screen is tested separately. Test ids are derived
 * from the host's id so each mount is still individually addressable.
 */
export function mountScene(host: HTMLElement, opts: SceneOptions = {}): SceneHandle {
  const id = host.id;
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    testid?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    node.className = className;
    if (testid !== undefined) node.dataset["testid"] = testid;
    return node;
  };

  host.textContent = "";

  const lineBox = make("div", "scene-lines", `${id}-lines`);
  // A REAL id, not just a test id: `aria-controls` below names it, and an
  // aria-controls pointing at nothing is a critical axe violation — which is how this
  // was found, on the first browser run.
  lineBox.id = `${id}-lines`;
  // `role="log"` with `aria-relevant="additions"`, NOT `role="status"`. `status`
  // re-announces the whole region on every change, so a reader would hear the entire
  // scene again on each click. `log` announces what was appended — which is only true
  // if the renderer really appends, and that is what AC-V16's `isConnected` assertion
  // pins down.
  lineBox.setAttribute("role", "log");
  lineBox.setAttribute("aria-live", "polite");
  lineBox.setAttribute("aria-relevant", "additions");
  host.append(lineBox);

  const controls = make("div", "scene-controls");
  const moreButton = make("button", "ghost", `${id}-more`);
  moreButton.type = "button";
  moreButton.textContent = "More ▸";
  moreButton.setAttribute("aria-controls", lineBox.id);
  const allButton = make("button", "ghost", `${id}-all`);
  allButton.type = "button";
  allButton.textContent = "Show all";
  const progress = make("p", "scene-progress", `${id}-progress`);
  // The readout is a live region of its own so "3 of 4" is announced when it changes,
  // without the line region having to re-read itself to carry the count.
  progress.setAttribute("role", "status");
  progress.setAttribute("aria-live", "polite");
  controls.append(moreButton, allButton, progress);
  host.append(controls);

  let model: SceneModel | null = null;
  let key: string | null = null;
  /** The plate currently at the bottom of the box, so an APPEND knows whether to add one. */
  let openPlate: string | null = null;

  const appendLines = (lines: readonly ResolvedLine[]): void => {
    for (const line of lines) {
      const who = line.who?.name ?? null;
      if (who !== null && who !== openPlate) {
        const plate = document.createElement("p");
        plate.className = "who";
        plate.textContent = who;
        lineBox.append(plate);
      }
      openPlate = who;
      const p = document.createElement("p");
      p.className = "line";
      // `textContent`, never `innerHTML` — story text is CONTENT from a data file, and
      // the seam exists so a separate repo can supply it.
      p.textContent = line.text;
      lineBox.append(p);
    }
  };

  const paintControls = (): void => {
    const m = model;
    if (m === null || m.done) {
      moreButton.hidden = true;
      allButton.hidden = true;
      // Cleared rather than left reading "Line 4 of 4": a readout that persists after
      // the last line implies there is more, which is the one thing it must not do.
      progress.textContent = "";
      return;
    }
    moreButton.hidden = false;
    // "Show all" only earns its place when it saves more than one click.
    allButton.hidden = m.total - m.revealed < 2;
    progress.textContent = `Line ${m.revealed} of ${m.total}`;
  };

  const step = (reveal: () => readonly ResolvedLine[], action: string): void => {
    if (!model || model.done) return;
    opts.onAction?.(action);
    appendLines(reveal());
    paintControls();
  };

  moreButton.addEventListener("click", () => {
    step(() => model!.advance(), `${id}-more`);
  });
  allButton.addEventListener("click", () => {
    step(() => model!.skipToEnd(), `${id}-all`);
  });

  return {
    setBeat(nextKey, lines) {
      if (lines === null) {
        host.hidden = true;
        model = null;
        key = null;
        return;
      }
      host.hidden = false;
      // The re-entrancy guard. Everything below this line is DOM work, and doing it on
      // an unchanged beat is what would reset the cursor mid-read.
      if (nextKey === key) return;
      key = nextKey;
      model = new SceneModel(lines);
      lineBox.textContent = "";
      openPlate = null;
      appendLines(lines.slice(0, model.revealed));
      paintControls();
    },
    advance() {
      step(() => model!.advance(), `${id}-more`);
    },
    showAll() {
      step(() => model!.skipToEnd(), `${id}-all`);
    },
    get model() {
      return model;
    },
    moreButton,
  };
}
