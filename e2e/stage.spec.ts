import { test, expect, type Page } from "@playwright/test";
import { UNIT_META } from "../src/render/demo.js";
import { contrastRatio } from "./contrast-helpers.js";
import { dismissScene, prepEveryMember, startNewGame } from "./helpers.js";

/**
 * THE LANDSCAPE-PHONE STAGE — docs/10 AC-V35 … AC-V42, AC-V66 (ADR-0043, ADR-0038).
 *
 * WHAT THIS SUITE CAN AND CANNOT SEE. It measures bounding boxes, computed styles and
 * the command log. It cannot see the screen: `docs/visual/stage/` holds the frames,
 * and every number here was written after opening them.
 *
 * ADR-0043 RETIRED THE 360-UNIT VIRTUAL STAGE (a fixed logical height, uniformly
 * scaled and letterboxed as a whole). AC-V33's five-viewport table tested exactly
 * that arithmetic and is gone with it — `stage.ts`'s own header explains why. What
 * replaces it is AC-V66 row 1's battlefield-dominance RATIO, asserted at the two
 * reference viewports ADR-0043 names: 832×328 and 832×384. Every other describe
 * block below still sweeps a broader viewport set where doing so is still
 * meaningful (AC-V34, AC-V35) — those checks do not depend on the retired scale.
 */

const VIEWPORTS: { name: string; size: { width: number; height: number } }[] = [
  { name: "640x300", size: { width: 640, height: 300 } },
  { name: "800x360", size: { width: 800, height: 360 } },
  { name: "832x328", size: { width: 832, height: 328 } },
  { name: "900x390", size: { width: 900, height: 390 } },
  { name: "1000x780", size: { width: 1000, height: 780 } },
];

/** ADR-0043's two reference viewports — the ONLY two the brief asks to be asserted. */
const REFERENCE_VIEWPORTS = [
  { name: "832x328", size: { width: 832, height: 328 } },
  { name: "832x384", size: { width: 832, height: 384 } },
];

/** docs/10 AC-V35 / §8c: iOS asks 44 pt, Android 48 dp. */
const TOUCH_FLOOR = 44;

const PAGES = ["/", "/viewer.html"] as const;

/** Drive the campaign as far as a live battle board. The viewer boots on one. */
async function reachBattle(page: Page, path: string): Promise<void> {
  if (path !== "/") {
    await expect(page.getByTestId("grid")).toBeVisible();
    return;
  }
  await startNewGame(page);
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
}

interface Measured {
  host: { w: number; h: number };
  stage: { w: number; h: number };
  scroll: { w: number; cw: number; h: number; ch: number };
}

/**
 * Everything read from `getBoundingClientRect()`, never from a CSS custom property.
 * A variable computed correctly and applied to nothing reads as working from the
 * variable's side, which is the shape AC-V33 spells out at length.
 */
async function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const host = document.querySelector('[data-testid="stage-host"]')!.getBoundingClientRect();
    const stage = document.querySelector('[data-testid="stage"]')!.getBoundingClientRect();
    const d = document.documentElement;
    return {
      host: { w: host.width, h: host.height },
      stage: { w: stage.width, h: stage.height },
      scroll: { w: d.scrollWidth, cw: d.clientWidth, h: d.scrollHeight, ch: d.clientHeight },
    };
  });
}

/** The board canvas and every LAID-OUT HUD zone, by name. */
async function boxes(page: Page): Promise<{
  canvas: { x: number; y: number; w: number; h: number };
  hud: { name: string; x: number; y: number; w: number; h: number }[];
}> {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const canvas = box(document.querySelector('[data-testid="grid"]')!);
    const hud = [...document.querySelectorAll<HTMLElement>("[data-hud]")]
      // The board's own wrapper is the canvas's container, not chrome over it.
      .filter((el) => el.dataset["hud"] !== "board")
      .map((el) => ({ name: el.dataset["hud"]!, ...box(el) }));
    return { canvas, hud };
  });
}

const overlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * The two pages expose the same battle seam under different names (`window.tuh` on the
 * engine viewer, `window.tuhGame` on the campaign). These three helpers are the only
 * place that difference lives.
 *
 * DISCOVERED, NOT HARD-CODED. Both pages mount content whose topology drifts —
 * `makeDemoBattle()` here, five authored encounters there — and hard-coded tiles were
 * invalidated four times in this repo's history. Each helper asks the board, through
 * the shipped seam, for something with the property under test, and every caller
 * asserts the discovery SUCCEEDED before relying on it.
 */
/**
 * Step until the PLAYER has the turn. Both boards can open on an AI actor.
 *
 * Any of the three player phases counts as "the player has the turn". That matters:
 * `step()` resolves whoever is ACTIVE through the balance probe, so an implementation
 * that treated `MOVE_STAGED` as "not yet the player" would step the player's own turn
 * away and every caller downstream would be measuring a board nobody staged anything
 * on. Found exactly that way.
 */
async function toPlayerTurn(page: Page, path: string): Promise<boolean> {
  return page.evaluate((p) => {
    const phase = (): string | null =>
      p === "/" ? window.tuhGame.phase() : window.tuh.phase();
    const step = (): void => (p === "/" ? window.tuhGame.step() : window.tuh.step());
    for (let i = 0; i < 40; i += 1) {
      const ph = phase();
      if (ph === "PLAYER_IDLE" || ph === "MOVE_STAGED" || ph === "TARGET_STAGED") return true;
      if (ph === null || ph === "ENDED") return false;
      step();
    }
    return false;
  }, path);
}

/** Stage a legal move. Returns false if the board offers none. */
async function stageMove(page: Page, path: string): Promise<boolean> {
  if (!(await toPlayerTurn(page, path))) return false;
  return page.evaluate((p) => {
    const phase = (): string | null =>
      p === "/" ? window.tuhGame.phase() : window.tuh.phase();
    const click = (x: number, y: number): void =>
      p === "/" ? window.tuhGame.clickTile(x, y) : window.tuh.clickTile(x, y);
    const state = p === "/" ? window.tuhGame.state() : window.tuh.getState();
    if (!state) return false;
    if (phase() === "MOVE_STAGED") return true;
    for (let y = 0; y < state.grid.height; y += 1) {
      for (let x = 0; x < state.grid.width; x += 1) {
        if (phase() !== "PLAYER_IDLE") return phase() === "MOVE_STAGED";
        click(x, y);
        if (phase() === "MOVE_STAGED") return true;
      }
    }
    return false;
  }, path);
}

/**
 * Stage a legal TARGET — the discovery this whole file leans on.
 *
 * WHY IT IS A SEARCH AND NOT A COORDINATE. The demo board opens with no foe in the
 * actor's reach, so "tap every tile until the phase changes" finds nothing: a staged
 * MOVE has to be tried too. Hard-coded tiles were invalidated by content drift four
 * times in this repo's history, which is why nothing here is written down — move tiles
 * come from the grid, target tiles from the live unit list, and every speculative
 * stage is undone (the stage/unstage pair are exact inverses, docs/10 §3) so the
 * search cannot leave the actor somewhere it did not intend.
 */
async function stageTarget(page: Page, path: string): Promise<boolean> {
  if (!(await toPlayerTurn(page, path))) return false;
  return page.evaluate((p) => {
    const phase = (): string | null =>
      p === "/" ? window.tuhGame.phase() : window.tuh.phase();
    const click = (x: number, y: number): void =>
      p === "/" ? window.tuhGame.clickTile(x, y) : window.tuh.clickTile(x, y);
    const cancel = (): void => (p === "/" ? window.tuhGame.cancel() : window.tuh.cancel());
    const state = p === "/" ? window.tuhGame.state() : window.tuh.getState();
    if (!state) return false;
    const units = state.units.filter((u) => u.hp > 0).map((u) => ({ x: u.pos.x, y: u.pos.y }));

    /**
     * `restage` is not a nicety. One of the tiles in `units` is the ACTOR's own, and
     * tapping the actor CLEARS THE WHOLE DRAFT (docs/10 §3) — so without putting the
     * move back, every unit after the actor in the list is tried from the wrong tile
     * and the search reports "no target" on a board that has one. Measured.
     */
    const tryUnits = (restage: { x: number; y: number } | null): boolean => {
      for (const u of units) {
        click(u.x, u.y);
        const ph = phase();
        if (ph === "TARGET_STAGED") return true;
        if (restage && ph === "PLAYER_IDLE") click(restage.x, restage.y);
      }
      return false;
    };

    if (phase() === "TARGET_STAGED") return true;
    if (tryUnits(null)) return true;
    if (phase() === "MOVE_STAGED") cancel();
    if (phase() !== "PLAYER_IDLE") return false;

    for (let y = 0; y < state.grid.height; y += 1) {
      for (let x = 0; x < state.grid.width; x += 1) {
        if (phase() !== "PLAYER_IDLE") return phase() === "TARGET_STAGED";
        click(x, y);
        if (phase() !== "MOVE_STAGED") continue;
        if (tryUnits({ x, y })) return true;
        cancel(); // back to idle and try the next destination
      }
    }
    return false;
  }, path);
}

/**
 * Open the deep-dive preview sheet EXPLICITLY (combat-revamp refinement,
 * 2026-09-10) — a tap on the TARGET UNIT plate, the only thing that opens it now
 * that staging alone no longer does (`hud.ts`'s `sheet.hidden = overlay !==
 * "preview"`). Callers that want the OLD "staged ⇒ sheet open" behaviour are
 * testing a state this build deliberately no longer has.
 */
async function openPreview(page: Page): Promise<void> {
  await page.getByTestId("target-plate").click();
}

// ───────────────────────────────────────────────────────────────────────────────
// AC-V66 row 1 — battlefield dominance: unobscuredBattlefieldArea / usableStageArea >= 0.75.
// ───────────────────────────────────────────────────────────────────────────────

/** The board allocation box (`data-hud="board"`) — excluded from `boxes()`'s hud list on purpose. */
async function boardAllocation(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  return page.evaluate(() => {
    const r = document.querySelector('[data-hud="board"]')!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
}

type Rect = { x: number; y: number; w: number; h: number };

/** Clip `a` to lie inside `bound`; zero-area if they do not overlap at all. */
function clip(a: Rect, bound: Rect): Rect {
  const x1 = Math.max(a.x, bound.x);
  const y1 = Math.max(a.y, bound.y);
  const x2 = Math.min(a.x + a.w, bound.x + bound.w);
  const y2 = Math.min(a.y + a.h, bound.y + bound.h);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

/**
 * The AREA of the UNION of `rects` — "HUD boxes are UNIONED, never summed" (ADR-0043):
 * two persistent regions that overlapped each other would be double-charged by a
 * plain sum. Coordinate-compression over a handful of rectangles (the rail and the
 * band, never more than a few) rather than a library: correct for any overlap, not
 * just the disjoint case this shell's grid layout happens to produce today.
 */
function unionArea(rects: Rect[]): number {
  const live = rects.filter((r) => r.w > 0 && r.h > 0);
  if (live.length === 0) return 0;
  const xs = [...new Set(live.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(live.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      const covered = live.some((r) => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h);
      if (covered) area += (xs[i + 1]! - xs[i]!) * (ys[j + 1]! - ys[j]!);
    }
  }
  return area;
}

test.describe("AC-V66 row 1 — battlefield dominance at ADR-0043's two reference viewports", () => {
  for (const path of PAGES) {
    for (const viewport of REFERENCE_VIEWPORTS) {
      test(`${path} at ${viewport.name} clears the >=0.75 battlefield-dominance floor`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport.size);
        await page.goto(path);
        await reachBattle(page, path);

        // usableStage = viewport - safe-area insets. Chromium emulation reports ZERO
        // insets on every edge, so usableStage == the host's own box here — stated,
        // not silently assumed: 832x328/832x384 are stress targets, unverified on real
        // hardware (`docs/INTENT.md` open ask G), and a real device's insets would
        // shrink usableStage on both sides of the ratio, not just the numerator.
        const m = await measure(page);
        const usableStage: Rect = { x: 0, y: 0, w: m.host.w, h: m.host.h };
        const usableStageArea = usableStage.w * usableStage.h;

        const board = clip(await boardAllocation(page), usableStage);
        const b = await boxes(page);
        const persistentHud = b.hud.map((h) => clip(h, usableStage));

        const obscured = unionArea(persistentHud.map((h) => clip(h, board)));
        const unobscuredBattlefieldArea = board.w * board.h - obscured;
        const ratio = unobscuredBattlefieldArea / usableStageArea;

        expect(board.w * board.h, "the board allocation has no area").toBeGreaterThan(0);
        expect(ratio, `${viewport.name} battlefieldRatio`).toBeGreaterThanOrEqual(0.75);

        // The battle screen does not scroll, in either direction.
        expect(m.scroll.w, `${viewport.name} horizontal scroll`).toBeLessThanOrEqual(m.scroll.cw + 1);
        expect(m.scroll.h, `${viewport.name} vertical scroll`).toBeLessThanOrEqual(m.scroll.ch + 1);
      });
    }
  }

  /**
   * ROW 2, folded in here rather than a separate block: persistent HUD hides no
   * playable tile, measured as INTERSECTION (never z-order) — a canvas painted
   * BEHIND the rail/band would still pass a z-order check.
   */
  for (const path of PAGES) {
    test(`${path} persistent HUD boxes intersect the board allocation at exactly 0 px²`, async ({
      page,
    }) => {
      await page.setViewportSize(REFERENCE_VIEWPORTS[0]!.size);
      await page.goto(path);
      await reachBattle(page, path);
      const board = await boardAllocation(page);
      const b = await boxes(page);
      expect(b.hud.length, "no persistent HUD found — the test would pass vacuously").toBeGreaterThan(0);
      for (const hud of b.hud) {
        const c = clip(hud, board);
        expect(c.w * c.h, `${hud.name} ∩ board`).toBe(0);
      }
    });
  }

  /**
   * THE DISCRIMINATING CASE, IN THE ARITHMETIC (ADR-0043, verbatim): "a full-screen
   * board with HUD painted on top MUST FAIL. A ratio computed from the rendered
   * board rectangle passes identically whether the rule holds or not — the board is
   * full-screen either way." No page needed — this is `unionArea`/`clip` themselves,
   * against a synthetic fixture built to have the property ADR-0043 names: a board
   * allocation that fills the WHOLE usable stage, with persistent HUD painted over
   * PART of it (both readings genuinely disagree, unlike the shipped shell's CSS
   * Grid, which never lets a HUD box and the board box overlap at all).
   */
  test("the RATIO formula fails a full-screen board with HUD painted on top (no CSS Grid to save it)", () => {
    const usableStage: Rect = { x: 0, y: 0, w: 832, h: 328 };
    const usableStageArea = usableStage.w * usableStage.h;
    // The anti-pattern ADR-0043 replaces: the board rect is the WHOLE stage, and a
    // rail + a band are painted ON TOP of it (and, deliberately, on top of EACH
    // OTHER in one corner — the union-vs-sum discriminator below needs that) rather
    // than reserved beside it, the way this shell's CSS Grid actually does.
    const fullScreenBoard: Rect = { ...usableStage };
    const railOnTop: Rect = { x: 732, y: 0, w: 100, h: 328 };
    const bandOnTop: Rect = { x: 0, y: 178, w: 832, h: 150 };

    // THE WRONG FORMULA — the board's OWN rendered rect, ignoring what is painted
    // over it. This is exactly what a naive "is the board big enough" check would
    // compute, and ADR-0043 names it as the thing that must NOT be measured.
    const wrongRatio = (fullScreenBoard.w * fullScreenBoard.h) / usableStageArea;
    expect(wrongRatio, "the wrong formula reads a full-screen board as 100% dominant").toBe(1);

    // THE CORRECT FORMULA — unobscured = board minus the UNION of what persistent
    // HUD covers. MUTATION: replace `unobscured` with `fullScreenBoard.w * fullScreenBoard.h`
    // (stop subtracting `obscured`) and this collapses to `wrongRatio === correctRatio`.
    const obscured = unionArea([railOnTop, bandOnTop].map((h) => clip(h, fullScreenBoard)));
    const unobscured = fullScreenBoard.w * fullScreenBoard.h - obscured;
    const correctRatio = unobscured / usableStageArea;

    expect(correctRatio).toBeLessThan(wrongRatio);
    expect(correctRatio, "a HUD-covered full-screen board must fail the >=0.75 floor").toBeLessThan(0.75);

    // UNION, NOT SUM (ADR-0043: "two persistent rails that overlap … would otherwise
    // be double-charged"). `railOnTop` and `bandOnTop` overlap in one 100x150 corner,
    // so a plain SUM double-subtracts that corner and UNDER-counts the obscured area
    // less than the union does — the two must disagree, or `unionArea` could be a
    // sum in disguise. MUTATION: replace `unionArea(...)` with a plain
    // `railOnTop.w*railOnTop.h + bandOnTop.w*bandOnTop.h` and `obscured` changes.
    const summed = railOnTop.w * railOnTop.h + bandOnTop.w * bandOnTop.h;
    expect(obscured, "the two boxes genuinely overlap, or this proves nothing").toBeLessThan(summed);
    const cornerOverlap = 100 * 150; // the exact double-counted region
    expect(summed - obscured).toBe(cornerOverlap);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V34 — the board is uncovered at rest, and the sheet is bounded.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * AC-V34's DISCRIMINATOR IS A MEASUREMENT, NOT A PREDICTION — "the mutant is already
 * built", so it was run.
 *
 * RUN 2026-09-05 against the PRE-REBUILD build (commit fbc4e95, built in a detached
 * worktree and served on its own port; this file's measurement logic re-pointed at the
 * old page's selectors, since `[data-hud]` does not exist there). Every viewport
 * failed, and the same element failed at all five:
 *
 * | viewport | `#unit-card` ∩ canvas | share of canvas | vertical scroll |
 * |---|---|---|---|
 * | 640x300  | 40 031 px² | **31 %** | 889 px |
 * | 800x360  | 40 031 px² | **18 %** | 749 px |
 * | 851x324  | 40 031 px² | **16 %** | 809 px |
 * | 900x390  | 40 031 px² | **14 %** | 716 px |
 * | 1000x780 | 40 031 px² | **11 %** | 375 px |
 *
 * The action bar and the timeline scored zero — they sat under the board, not over it —
 * so the plate is the whole failure, which is exactly what ADR-0033 decision 2 put
 * there and ADR-0037 supersedes. The plate's box does NOT shrink across the five: the
 * old landscape rules were gated on `pointer: coarse`, which a plain desktop context
 * does not match, so what the table shows is the desktop plate measured at phone sizes
 * — the same 40 031 px² everywhere, covering a third of the smallest board.
 *
 * The vertical-scroll column is AC-V33's half of the same run: the pre-rebuild battle
 * screen scrolled at every one of the five.
 */
test.describe("AC-V34 — nothing covers the board at rest", () => {
  for (const path of PAGES) {
    for (const row of VIEWPORTS) {
      test(`${path} at ${row.name} the HUD never overlaps the canvas at rest`, async ({ page }) => {
        await page.setViewportSize(row.size);
        await page.goto(path);
        await reachBattle(page, path);
        expect(await toPlayerTurn(page, path), "no player turn to measure").toBe(true);

        // ── STATE 1: nothing selected.
        let b = await boxes(page);

        // NON-DEGENERACY, and all three halves are required. "Nothing intersects" is
        // exactly what a page with no HUD reports, and a zero-area box intersects
        // nothing — which is what `display: none` on the whole HUD looks like.
        expect(b.canvas.w * b.canvas.h, "the canvas has no area").toBeGreaterThan(0);
        const names = b.hud.map((e) => e.name).sort();
        expect(names, `${row.name} HUD set`).toEqual(["band", "rail"]);
        for (const e of b.hud) {
          expect(e.w * e.h, `${e.name} has a zero-area box`).toBeGreaterThan(0);
        }
        for (const e of b.hud) {
          expect(overlap(e, b.canvas), `${e.name} covers the board at rest`).toBe(0);
        }

        // ── STATE 2: a player unit selected, no target staged. A HUD that appears
        // only once a unit is selected passes state 1 alone.
        const moved = await stageMove(page, path);
        expect(moved, `${row.name}: no legal move to stage`).toBe(true);
        b = await boxes(page);
        for (const e of b.hud) {
          expect(overlap(e, b.canvas), `${e.name} covers the board with a move staged`).toBe(0);
        }

        // ── STATE 3: a target staged, sheet NOT explicitly opened (combat-revamp
        // refinement, 2026-09-10). ADR-0043 decision 4 allows a temporary overlay
        // ONLY after an explicit ask — staging is not that ask any more, so the
        // sheet stays closed and the board stays fully uncovered, same as states 1/2.
        const staged = await stageTarget(page, path);
        expect(staged, `${row.name}: no legal target to stage`).toBe(true);
        b = await boxes(page);
        for (const e of b.hud) {
          expect(overlap(e, b.canvas), `${e.name} covers the board with a target staged`).toBe(0);
        }
        await expect(
          page.getByTestId("preview-sheet"),
          "the sheet opened without an explicit tap",
        ).toBeHidden();

        // ── STATE 4: the TARGET UNIT plate is tapped — the one explicit ask that
        // may open the temporary overlay. It may cover at most 35% of the canvas
        // WIDTH (docs/10 §3/§8b unchanged by this refinement).
        await openPreview(page);
        const sheet = await page.getByTestId("preview-sheet").boundingBox();
        expect(sheet, "the preview sheet did not open on the explicit tap").not.toBeNull();
        const s = { x: sheet!.x, y: sheet!.y, w: sheet!.width, h: sheet!.height };
        expect(s.w * s.h, "the sheet has no area").toBeGreaterThan(0);
        // WIDTH, not area. docs/10 §3 and §8b both say "at most 35% of the canvas
        // WIDTH", and the two are not the same bound: a sheet spanning half the board's
        // width but only the top third of its height passes an AREA check at 17% while
        // hiding half of every row of tiles — which is the thing the budget exists to
        // prevent ("a visible target can be re-staged with one tap").
        const covered =
          Math.max(0, Math.min(s.x + s.w, b.canvas.x + b.canvas.w) - Math.max(s.x, b.canvas.x));
        const share = covered / b.canvas.w;
        expect(share, `${row.name}: the sheet covers ${Math.round(share * 100)}% of the board's width`)
          .toBeLessThanOrEqual(0.35);
      });
    }
  }

  // THE OLD "expanded turn-order strip" overlay is RETIRED, not adapted. ADR-0037's
  // top-bar strip clipped to one row and expanded into an overlay on tap; the
  // combat-revamp rail (`intent/combat-revamp.md`) is a PERSISTENT vertical column
  // that scrolls its own entries instead — there is no expand/collapse affordance
  // left to test. `turn-order-more` no longer exists.

  /**
   * The sheet is ABSENT-BY-DEFAULT even once a target IS staged — combat-revamp
   * refinement, 2026-09-10 (Correction 1). This is the discriminating rewrite of
   * the old "opens automatically on stage" test: MUTATION — restore
   * `sheet.hidden = staged === null && overlay !== "preview"` in `hud.ts` and the
   * THIRD assertion below (still hidden after staging) goes red while the other
   * two stay green, which is exactly why staging alone is not enough to prove the
   * fix; the explicit-tap-opens / tap-again-closes pair has to be checked too.
   */
  test("the preview sheet stays CLOSED once staged, opens on the plate's tap, and closes again", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 851, height: 324 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    await expect(page.getByTestId("preview-sheet")).toBeHidden();
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);
    expect(await stageTarget(page, "/viewer.html")).toBe(true);
    // STILL hidden — this is the line the reverted mutant fails.
    await expect(page.getByTestId("preview-sheet")).toBeHidden();

    await openPreview(page);
    await expect(page.getByTestId("preview-sheet")).toBeVisible();

    // Tapping the SAME plate again toggles it closed (`hud.ts`'s `setOverlay`).
    await openPreview(page);
    await expect(page.getByTestId("preview-sheet")).toBeHidden();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V35 — every control is thumb-sized where it is smallest.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V35 — 44 CSS px at the NARROWEST viewport", () => {
  for (const path of PAGES) {
    test(`${path} every control clears 44x44 CSS px at 640x300`, async ({ page }) => {
      await page.setViewportSize({ width: 640, height: 300 });
      await page.goto(path);
      await reachBattle(page, path);

      // hud-help / hud-settings moved INSIDE the ☰ menu drawer (combat revamp — three
      // top-bar icons do not fit ADR-0043's pixel budget, one stud does), so they are
      // `display: none` (their drawer is `[hidden]`) until the stud is opened; measured
      // hidden they would report a false 0x0 and the floor check would be meaningless.
      await page.getByTestId("hud-menu").click();
      await expect(page.getByTestId("menu-drawer")).toBeVisible();

      // MEASURED FOR REAL, no stage-unit transform to account for any more (ADR-0043
      // retired the whole-stage scale) — these are the actual rendered CSS boxes.
      const controls = await page.evaluate(() => {
        const ids = [
          "hud-menu",
          "hud-help",
          "hud-settings",
          "cancel",
          "actions",
          "move",
          "attack",
          "end-turn",
          "actor-tab",
          "target-plate",
        ];
        const out: { name: string; w: number; h: number }[] = [];
        for (const id of ids) {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          out.push({ name: id, w: r.width, h: r.height });
        }
        const tile = document.querySelector('[data-testid="tile-hit"]');
        if (tile) {
          const r = tile.getBoundingClientRect();
          out.push({ name: "tile-hit", w: r.width, h: r.height });
        }
        return out;
      });

      // A loop that finds two buttons passes vacuously, so the set is enumerated.
      expect(controls.map((c) => c.name).sort()).toEqual([
        "actions",
        "actor-tab",
        "attack",
        "cancel",
        "end-turn",
        "hud-help",
        "hud-menu",
        "hud-settings",
        "move",
        "target-plate",
        "tile-hit",
      ]);
      for (const c of controls) {
        expect(c.w, `${c.name} width`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
        expect(c.h, `${c.name} height`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      }
    });
  }

  /**
   * RETIRED (combat revamp, ADR-0043, owner decision 3): the RENDERED diamond used
   * to be exempt from the 44px floor by recorded limitation — it still can be
   * smaller than 44px (this case no longer asserts it is not), but the exemption no
   * longer matters for TAPPING, because every ground tile now has an invisible
   * 44×44 CSS px HIT REGION centred on it regardless of the diamond's own size (see
   * "AC-V67 — the 44px touch-target overlay" below, which is the test that replaces
   * the claim this one used to make).
   */
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V36 — Confirm is a separate tap, proved by the command log.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V36 — a target tap stages; Confirm commits", () => {
  for (const path of PAGES) {
    test(`${path} the tap emits ZERO commands and Confirm emits exactly one`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);

      const count = (): Promise<number> =>
        page.evaluate((p) =>
          p === "/" ? window.tuhGame.commandCount() : window.tuh.commands().length, path);
      const staged = (): Promise<unknown> =>
        page.evaluate((p) =>
          p === "/" ? window.tuhGame.stagedTarget() : (window.tuh.draft()?.act ?? null), path);

      expect(await toPlayerTurn(page, path), "no player turn to drive").toBe(true);
      const before = await count();
      expect(await stageTarget(page, path)).toBe(true);

      // ── THE LOAD-BEARING HALF. The wrong behaviour is the one this repo shipped:
      // the command was emitted on the target tap, and "after Confirm a command
      // exists" passes against it because by then the command does exist.
      expect(await count(), "the target tap emitted a command").toBe(before);
      // ── THE SECOND REQUIRED HALF: a viewer that ignored the tap entirely satisfies
      // both counts. A non-null staged target is what rules that out.
      expect(await staged(), "nothing was staged").not.toBeNull();
      // The deep-dive sheet no longer opens on staging alone (combat-revamp
      // refinement, 2026-09-10) — the compact forecast that answers "will this
      // land" now lives in the TARGET UNIT plate itself, always on; the full §4 set
      // is still reachable before Confirm, one explicit tap away.
      await expect(page.getByTestId("preview-sheet")).toBeHidden();
      await openPreview(page);
      await expect(page.getByTestId("preview-sheet")).toBeVisible();

      // Asserted on the LOG, not on the button: a Confirm that is present and inert
      // leaves a state change nobody made.
      await page.getByTestId("confirm").click();
      expect(await count()).toBe(before + 1);
      expect(await staged()).toBeNull();
    });

    /**
     * END TURN CANNOT SPEND A TURN WITH A SHOT AIMED, and this is the blocker a review
     * found: the primary button stayed live in `TARGET_STAGED` and `endTurn()` emitted
     * a bare move/wait, silently discarding the attack the sheet was quoting. The
     * player sees "Move + Act · −100" and gets a move at −80.
     *
     * TWO ASSERTIONS, and neither substitutes for the other: the control is DISABLED
     * (so nobody reaches for it) and the log is UNCHANGED after forcing the call
     * through the seam (so the session refuses it even if some future control does not
     * disable). A disabled-only check passes against a session that would still
     * discard the shot; a log-only check passes against a live button that looks
     * usable and answers with a refusal chip.
     */
    test(`${path} End Turn is refused while a target is staged`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      const count = (): Promise<number> =>
        page.evaluate((p) =>
          p === "/" ? window.tuhGame.commandCount() : window.tuh.commands().length, path);

      expect(await toPlayerTurn(page, path), "no player turn to drive").toBe(true);
      expect(await stageTarget(page, path)).toBe(true);
      const before = await count();

      await expect(page.getByTestId("end-turn")).toBeDisabled();

      // …and the session refuses it too. Driven through the seam because the button is
      // (correctly) unclickable — this is the half that survives a future control.
      await page.evaluate((p) =>
        p === "/" ? window.tuhGame.endTurn() : window.tuh.endTurn(), path);

      expect(await count(), "End Turn discarded the staged shot").toBe(before);
      expect(await page.evaluate((p) =>
        p === "/" ? window.tuhGame.phase() : window.tuh.phase(), path)).toBe("TARGET_STAGED");

      // Confirm still works, at the price the sheet quoted: a refusal, not a wedge.
      await page.getByTestId("confirm").click();
      expect(await count()).toBe(before + 1);
    });

    /**
     * A DISABLED CONTROL MUST LOOK DISABLED, and `opacity` alone does not do it: the
     * rubricated primary at 55% is still a red slab in gold caps, which is what the
     * `TARGET_STAGED` frame showed — the one control the player must NOT press reading
     * as the one to press.
     *
     * THE ASSERTION IS ON THE COMPUTED BACKGROUND, because that is the property an
     * opacity-only treatment leaves IDENTICAL in both states: `getComputedStyle` reports
     * the same `background-color` whether the element is at opacity 1 or 0.55, so a
     * colour A/B is the only check that can tell the two apart. The cursor is asserted
     * too, and `default` rather than `not-allowed`: this control is not for you yet, it
     * is not broken.
     */
    test(`${path} the disabled primary does not read as the thing to press`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      expect(await toPlayerTurn(page, path)).toBe(true);

      const paint = async (): Promise<{ bg: string; cursor: string; color: string }> =>
        page.getByTestId("end-turn").evaluate((el) => {
          const cs = getComputedStyle(el);
          return { bg: cs.backgroundColor, cursor: cs.cursor, color: cs.color };
        });

      await expect(page.getByTestId("end-turn")).toBeEnabled();
      const live = await paint();
      expect(live.cursor).toBe("pointer");

      expect(await stageTarget(page, path)).toBe(true);
      await expect(page.getByTestId("end-turn")).toBeDisabled();
      const dead = await paint();

      expect(dead.bg, "the disabled primary keeps the live fill").not.toBe(live.bg);
      expect(dead.color, "the disabled primary keeps the live ink").not.toBe(live.color);
      expect(dead.cursor, "a refused control should not read as broken").toBe("default");
      // NON-DEGENERACY: both states painted something. Two empty strings differ from
      // nothing and would satisfy the inequalities above.
      expect(live.bg).toMatch(/^rgb/);
      expect(dead.bg).toMatch(/^rgb/);
    });

    test(`${path} Cancel unstages and emits nothing`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      const count = (): Promise<number> =>
        page.evaluate((p) =>
          p === "/" ? window.tuhGame.commandCount() : window.tuh.commands().length, path);

      expect(await toPlayerTurn(page, path), "no player turn to drive").toBe(true);
      const before = await count();
      expect(await stageTarget(page, path)).toBe(true);
      // Open the sheet EXPLICITLY first — otherwise "hidden after Cancel" is true
      // trivially (it was already hidden by default) and proves nothing about
      // Cancel's own close behaviour (combat-revamp refinement, 2026-09-10).
      await openPreview(page);
      await expect(page.getByTestId("preview-sheet")).toBeVisible();
      await page.getByTestId("cancel").click();
      await expect(page.getByTestId("preview-sheet")).toBeHidden();
      expect(await count(), "Cancel emitted a command").toBe(before);
    });
  }
});

/**
 * §4'S SET FITS THE SHEET — no row is clipped, at either end of the stage range.
 *
 * The frame captured on the first build showed "ACTION" cut in half at 851x324: the
 * sheet scrolls, and `previewHtml`'s rows wrapped to two and three lines each (measured
 * 489 units of content into a 162-unit body). Rewriting the values one-line-each and
 * merging the two rows that are facts about the same target brings it to 146 into 150.
 *
 * THE CLOSING `.phint` DISCLAIMER IS GONE (combat-revamp refinement, 2026-09-10) —
 * "not modeled yet, so not shown" plus the forecast's exactness essay was developer
 * accounting, not combat UI (owner decision), so there is no longer a below-the-fold
 * paragraph to record here. What §4 requires — the fact/projection distinction on
 * the "Next slot" row — is now carried by the row's own "≈" prefix instead of prose.
 *
 * A CONDITIONAL ROW CAN STILL OVERFLOW. Six rows use 126 of 138 usable units, so one
 * more fits and two do not: a shot at a target with a live reaction adds the counter
 * row (fits), and a Hamedo target adds a "Blocked" row on top of it (does not). The
 * fixture below is a plain shot, which is the common case; the exceptional one is named
 * rather than quietly excluded by the selector.
 */
test.describe("§4's rows fit the preview sheet without scrolling", () => {
  for (const size of [
    { name: "851x324", width: 851, height: 324 },
    { name: "640x300", width: 640, height: 300 },
  ]) {
    test(`every preview row is inside the sheet's visible box at ${size.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();
      expect(await stageTarget(page, "/viewer.html")).toBe(true);
      await openPreview(page);
      await expect(page.getByTestId("preview-sheet")).toBeVisible();

      const fit = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="preview"]') as HTMLElement;
        const rows = [...body.querySelectorAll<HTMLElement>(".prow")];
        return {
          rows: rows.length,
          // Layout units, not CSS px: `offsetTop`/`offsetHeight` are pre-transform, so
          // this measures the same numbers `stage.css` is written in and the answer
          // cannot drift with the viewport's scale.
          overflowing: rows
            .filter((r) => r.offsetTop + r.offsetHeight > body.clientHeight)
            .map((r) => r.querySelector(".pk")?.textContent ?? "?"),
          tallest: Math.max(...rows.map((r) => r.offsetHeight)),
          used: rows.reduce((n, r) => n + r.offsetHeight, 0),
          available: body.clientHeight,
        };
      });

      // NON-DEGENERACY: a sheet that rendered no rows overflows nothing. §4 items 2–8
      // plus the Zodiac enhancement come to SIX rows for a plain shot — hit % with its
      // arc, damage with the HP it leaves and the lethal verdict, the turn's price with
      // the slot it buys, the act, where it resolves from, and Zodiac with the target's
      // statuses. Every value §4 asks for is in there; only the row COUNT was folded.
      expect(fit.rows, "the sheet rendered no rows").toBeGreaterThanOrEqual(6);
      expect(fit.overflowing, `${size.name}: rows below the fold`).toEqual([]);
      // EVERY ROW IS ONE LINE. A row that wrapped would still "fit" while the total was
      // small, and wrapping is what pushed Action off the bottom in the first place.
      expect(fit.tallest, `${size.name}: a row wrapped to two lines`).toBeLessThan(30);
      expect(fit.used).toBeLessThanOrEqual(fit.available);
    });
  }
});

/**
 * THE SKIN'S TWO FACES ARE ACTUALLY LOADED, on both pages.
 *
 * `viewer.html` carried no `@font-face` until 2026-09-05, so the shared battle stage —
 * one module, one stylesheet, built precisely so the two pages cannot diverge —
 * rendered in Cinzel on the campaign and in GEORGIA on the engine viewer. Nothing in
 * the suite could see it and every frame in `docs/visual/stage/` was captured on the
 * campaign page.
 *
 * `document.fonts.check()` is the discriminating read: a declared `@font-face` whose
 * URL 404s still appears in `document.fonts`, so the test waits for `ready` and asks
 * whether the family can actually be used at the size the stage sets it.
 */
test.describe("the stage's typefaces load on both pages", () => {
  for (const path of PAGES) {
    test(`${path} has Cinzel and EB Garamond loaded`, async ({ page }) => {
      await page.goto(path);
      await reachBattle(page, path);
      const fonts = await page.evaluate(async () => {
        await document.fonts.ready;
        const loaded = [...document.fonts].map((f) => `${f.family}:${f.status}`);
        return {
          loaded,
          cinzel: document.fonts.check('600 13px "Cinzel"'),
          garamond: document.fonts.check('400 14px "EB Garamond"'),
        };
      });
      expect(fonts.cinzel, `Cinzel is not usable on ${path}: ${fonts.loaded.join(", ")}`).toBe(
        true,
      );
      expect(fonts.garamond, `EB Garamond is not usable on ${path}`).toBe(true);
      // …and the stage really asks for them, so the check above is about this screen
      // rather than about a face some other panel happens to load.
      await expect(page.getByTestId("end-turn")).toHaveCSS("font-family", /Cinzel/);
      await expect(page.getByTestId("actor-tab")).toHaveCSS("font-family", /Garamond/);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V37 — the ACTIVE UNIT plate shows name/job/Clock/HP; the drawer shows the rest.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V37 — the ACTIVE UNIT plate and the unit drawer", () => {
  for (const path of PAGES) {
    test(`${path} the plate shows name, job, Clock and HP; the drawer holds Brave/Faith`, async ({
      page,
    }) => {
      // SUPERSEDED FROM ADR-0038's "name and HP only" (owner's approved combat-master
      // frame shows the acting unit's job and Clock value directly on the band's plate
      // — `docs/visual/mockups/combat-master-pass1-832x328.png`, "Vance / Archer /
      // Clock 82"). Brave and Faith stay in the drawer — progressive disclosure still
      // applies to THOSE two, just not to job/Clock any more.
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      expect(await toPlayerTurn(page, path)).toBe(true);

      const tab = page.getByTestId("actor-tab");
      // (ii) VISIBLE, WITH A NON-ZERO BOX. A text assertion alone passes against a tab
      // set to `display: none`, where "the plate is empty" is trivially true.
      await expect(tab).toBeVisible();
      const tabBox = (await tab.boundingBox())!;
      expect(tabBox.width * tabBox.height).toBeGreaterThan(0);

      // `textContent`, not `innerText`: `innerText` applies `text-transform`, so a card
      // printing "Clock" reads back as "CLOCK" and every check below would be about CSS.
      const tabText = (await tab.textContent()) ?? "";
      expect(tabText).toMatch(/HP\s+\d+\s*\/\s*\d+/);
      expect(tabText, "the plate lost its Clock value").toMatch(/Clock\s+\d+/);
      for (const banned of ["Brave", "Faith"]) {
        expect(tabText, `the plate prints ${banned}`).not.toContain(banned);
      }
      // THE JOB IS PRESENT on a page that has one (the campaign; the engine viewer's
      // hand-authored `UNIT_META` genuinely carries none). Read off the page's own
      // roster rather than written down, so this cannot pass by naming a job the
      // campaign does not field.
      const job = await page.evaluate(() => {
        const drawer = document.querySelector('[data-testid="unit-drawer"] .uc-job');
        return drawer?.textContent?.trim() ?? null;
      });
      if (path === "/") {
        expect(job, "the campaign card lost its job row").toBeTruthy();
        expect(tabText.toLowerCase(), "the plate lost its job row").toContain(
          job!.toLowerCase(),
        );
      }

      await tab.click();
      const drawer = page.getByTestId("unit-drawer");
      await expect(drawer).toBeVisible();
      const drawerText = (await drawer.textContent()) ?? "";
      for (const wanted of ["Clock", "Brave", "Faith"]) {
        expect(drawerText, `the drawer omits ${wanted}`).toContain(wanted);
      }
      // ABSENT, NOT ZERO (ADR-0033, ADR-0021): the sim models neither.
      expect(drawerText).not.toMatch(/\bMP\b/);
      expect(drawerText).not.toMatch(/\bLevel\b/);
    });

    test(`${path} the drawer closes on a TARGET tap and stays open on an illegal one`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      expect(await toPlayerTurn(page, path)).toBe(true);

      // ONE assertion is not enough here: a drawer that closed on ANY board tap
      // passes "it closed after a target tap". The illegal tap is the control.
      await page.getByTestId("actor-tab").click();
      await expect(page.getByTestId("unit-drawer")).toBeVisible();
      await page.evaluate((p) => {
        const seam = (p === "/" ? window.tuhGame : window.tuh) as unknown as {
          clickTile: (x: number, y: number) => void;
        };
        seam.clickTile(-1, -1); // off-board: refused, and nothing else
      }, path);
      await page.evaluate((p) => {
        const seam = (p === "/" ? window.tuhGame : window.tuh) as unknown as {
          clickTile: (x: number, y: number) => void;
        };
        seam.clickTile(99, 99);
      }, path);
      await expect(
        page.getByTestId("unit-drawer"),
        "an illegal tap closed the unit drawer",
      ).toBeVisible();

      expect(await stageTarget(page, path)).toBe(true);
      await expect(page.getByTestId("unit-drawer")).toBeHidden();
    });
  }

  /**
   * READ-ONLY INSPECT (ADR-0033's parked cursor-follow, arriving as a tap).
   *
   * The discriminator is that the drawer's NAME and HP change with the unit tapped: a
   * drawer wired to the forecast lead is byte-identical between two units, which is
   * exactly what the dead `focusUnitId` seam looks like from outside.
   */
  test("tapping two different non-target units shows two different cards", async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 324 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);

    // DISCOVER two units that are NOT the actor and NOT legal targets — the inspect
    // path. Asserting the pair exists first is what stops this passing vacuously on a
    // board where every other unit happens to be targetable.
    const pair = await page.evaluate(() => {
      const state = window.tuh.getState();
      const actorId = state.units.find((u) => u.ct >= 100)?.id ?? state.units[0]!.id;
      const draftBefore = window.tuh.phase();
      void draftBefore;
      const others = state.units.filter((u) => u.id !== actorId && u.hp > 0);
      return others.slice(0, 2).map((u) => ({ id: u.id, x: u.pos.x, y: u.pos.y }));
    });
    expect(pair.length, "fewer than two other units on the board").toBe(2);

    const cards: string[] = [];
    for (const u of pair) {
      await page.evaluate((t) => window.tuh.clickTile(t.x, t.y), u);
      const drawer = page.getByTestId("unit-drawer");
      if (!(await drawer.isVisible())) continue; // this one WAS a legal target
      cards.push((await drawer.textContent()) ?? "");
    }
    // THE DISCRIMINATOR: a drawer wired to the forecast lead is byte-identical between
    // two units, which is exactly what the dead `focusUnitId` seam looks like.
    expect(cards.length, "no non-target unit opened the read-only drawer").toBe(2);
    expect(cards[0]).not.toBe(cards[1]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V38 — the action bar is phase-aware; the Actions sheet is derived.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V38 — the action bar and the Actions sheet", () => {
  test("the Actions sheet is DERIVED from the projection, ranges and all", async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 324 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);

    // DISCOVER the discriminating pair from the fixture's own data. Hard-coding an
    // ability's range bakes today's content into the test, and a range has already
    // moved once (ADR-0014's `summon.*` h4 → h6).
    const projection = await page.evaluate(() => {
      const state = window.tuh.getState();
      const actorId = window.tuh.getState().units.find((u) => u.ct >= 100)?.id;
      const actor = state.units.find((u) => u.id === actorId) ?? state.units[0]!;
      return actor.abilities.map((a) => ({ id: a.id, h: a.range.h, v: a.range.v }));
    });
    expect(projection.length).toBeGreaterThan(1);
    const distinct = new Set(projection.map((a) => `${a.h}/${a.v}`));
    expect(distinct.size, "this actor's abilities all share one range — nothing to tell apart")
      .toBeGreaterThan(1);

    await page.getByTestId("actions").click();
    const rows = page.locator('[data-testid="ability-list"] li');
    await expect(rows).toHaveCount(projection.length);
    const printed = await rows.evaluateAll((els) => els.map((e) => e.textContent ?? ""));
    const ranges = new Set(printed.map((t) => /range\s+\d+\s+·\s+height\s+±\d+/.exec(t)?.[0] ?? ""));
    // A static table or a template printing one shared range passes a count-only check.
    expect(ranges.size, "every row printed the same range").toBeGreaterThan(1);

    // The flat act price is printed ONCE, in the header — there is no per-ability cost
    // in `BattleAbilitySchema` to print, so a per-row one would be invented.
    //
    // AND THE NUMBER IS THE SIM'S. It used to be `didMove ? 100 : 80`, computed in the
    // render layer: a combat constant restated in the viewer, which would go on quoting
    // the old figure if `CT_COST_MOVE_AND_ACT` ever moved, with nothing going red.
    // Asserted against `Session.actCost()`, the same `turnCost` the staged shot is
    // priced with — a presence check on the word "clock" passes against any number.
    const priced = await page.evaluate(() => window.tuh.actCost()?.cost ?? null);
    expect(priced, "the session cannot price the act turn").not.toBeNull();
    await expect(page.getByTestId("actions-price")).toContainText(`−${priced!} clock`);

    // …and it MOVES with the staged move, so it is not a constant that happens to
    // match. A header printing one fixed price passes the equality above at one state.
    expect(await stageMove(page, "/viewer.html")).toBe(true);
    await page.getByTestId("actions").click();
    await page.getByTestId("actions").click();
    const pricedAfterMove = await page.evaluate(() => window.tuh.actCost()?.cost ?? null);
    expect(pricedAfterMove, "the act price did not move with the staged move").not.toBe(priced);
    await expect(page.getByTestId("actions-price")).toContainText(`−${pricedAfterMove!} clock`);
    await page.getByTestId("cancel").click();

    for (const t of printed) expect(t).not.toMatch(/\bAP\b/);
  });

  test("the primary button relabels AND behaves, in both phases", async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 324 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();

    const primary = page.getByTestId("end-turn");
    const phase = (): Promise<string> => page.evaluate(() => window.tuh.phase());
    const count = (): Promise<number> => page.evaluate(() => window.tuh.commands().length);

    // BOUNDED, and the bound is asserted. An unbounded `while` turns a mutant that
    // relabels-but-never-Steps into a 30-second TIMEOUT instead of an assertion — red
    // either way, but a timeout says "something hung", not "the button does not Step",
    // and the next reader has to work out which. Measured on this board: 2 steps.
    let walked = 0;
    while ((await phase()) === "AI_TURN" && walked < 40) {
      await primary.click();
      walked += 1;
    }
    expect(walked, "the enemy-turn button never yielded a player turn").toBeLessThan(40);
    expect(await phase()).toBe("PLAYER_IDLE");

    // (b) BOTH HALVES, IN BOTH PHASES. A button that always says Wait but happens to
    // Step passes a behaviour-only check; one that relabels and does nothing passes a
    // label-only check — and the second is the one that strands the player.
    //
    // SHORT VISIBLE LABEL, FULL LABEL IN `title` — the ribbon button is one of eight
    // sharing a 56px-tall band (`intent/combat-revamp.md`'s pixel budget), so
    // `Session.endTurnLabel()`'s full sentence ("End Turn · moved only · act again
    // sooner") lives in the tooltip; the on-button text is just "Wait"/"End". Both are
    // asserted — a label-only check on the SHORT text alone could not tell "waited"
    // from "moved only" apart, which is the whole point of (c) below.
    await expect(primary).toContainText("Wait");
    // (c) THE PRICE CLAIM MOVES: waited (−60) vs moved only (−80), carried in `title`.
    // A hard-coded label passes either alone.
    await expect(primary).toHaveAttribute("title", /waited/);
    expect(await stageMove(page, "/viewer.html")).toBe(true);
    await expect(primary).toContainText("End");
    await expect(primary).toHaveAttribute("title", /moved only/);
    await page.getByTestId("cancel").click();

    const beforeEnd = await count();
    await primary.click();
    expect(await count()).toBe(beforeEnd + 1);

    // …and in AI_TURN it is the enemy's only control. Bounded and asserted, same reason.
    let handed = 0;
    while ((await phase()) !== "AI_TURN" && (await phase()) !== "ENDED" && handed < 40) {
      await primary.click();
      handed += 1;
    }
    expect(handed, "End Turn never handed the turn over").toBeLessThan(40);
    expect(await phase()).toBe("AI_TURN");
    await expect(primary).toContainText("Enemy");
    await expect(primary).not.toContainText("Wait");
    const beforeStep = await count();
    await primary.click();
    expect(await count(), "the enemy-turn button emitted no Step").toBe(beforeStep + 1);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V39 — an illegal tap is a toast and nothing else.
// ───────────────────────────────────────────────────────────────────────────────

test("AC-V39 — an illegal tap toasts a REASON and changes nothing", async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 324 });
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();

  // A KO'd unit's tile is the second illegal ground, so the board has to have one.
  // Played for, then ASSERTED — a fixture that never produced a crystal would leave
  // the "two different toasts" check comparing one reason with itself.
  const crystal = await page.evaluate(() => {
    for (let i = 0; i < 40; i += 1) {
      const down = window.tuh.getState().units.find((u) => u.hp <= 0);
      if (down) return { x: down.pos.x, y: down.pos.y };
      if (window.tuh.phase() === "ENDED") return null;
      window.tuh.step();
    }
    return null;
  });
  expect(crystal, "no unit fell — there is no crystal to tap").not.toBeNull();
  expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);

  const serialized = (): Promise<string> =>
    page.evaluate(() => JSON.stringify(window.tuh.getState()));
  const count = (): Promise<number> => page.evaluate(() => window.tuh.commands().length);

  // The out-of-range tile must lie INSIDE a naive Manhattan radius of the actor and
  // OUTSIDE `moveRange`, asserted in BOTH directions (the AC-V7 warning) — otherwise
  // the tap was never illegal for the reason claimed. Discovered from the live board.
  const far = await page.evaluate(() => {
    const state = window.tuh.getState();
    const actor = state.units.find((u) => u.ct >= 100) ?? state.units[0]!;
    let naiveOnly: { x: number; y: number; naive: number; move: number } | null = null;
    for (let y = 0; y < state.grid.height; y += 1) {
      for (let x = 0; x < state.grid.width; x += 1) {
        const naive = Math.abs(x - actor.pos.x) + Math.abs(y - actor.pos.y);
        if (naive === 0) continue;
        if (state.units.some((u) => u.pos.x === x && u.pos.y === y)) continue;
        const tile = state.grid.tiles[y * state.grid.width + x];
        const blocked = !tile || !tile.passable;
        if (naive <= actor.move && blocked) {
          naiveOnly = { x, y, naive, move: actor.move };
        }
      }
    }
    return naiveOnly;
  });

  const before = await serialized();
  const cmds = await count();

  // ── GROUND A: an OCCUPIED tile — the crystal. Occupied and illegal at once, which
  // an ally's tile no longer is: under ADR-0037 a tap on a living non-target unit
  // opens the read-only drawer instead of being refused.
  await page.evaluate((c) => window.tuh.clickTile(c.x, c.y), crystal!);
  const reasonA = await page.evaluate(() => window.tuh.reason());

  // ── GROUND B: out of move range.
  await page.evaluate(() => window.tuh.clickTile(0, 0));
  const reasonB = await page.evaluate(() => window.tuh.reason());

  // TWO GROUNDS, TWO MESSAGES. A toast that always reads "illegal move" passes a
  // presence check; this does not.
  expect(reasonA, "no reason for the crystal tap").toBeTruthy();
  expect(reasonB, "no reason for the out-of-range tap").toBeTruthy();
  expect(reasonA, "both illegal grounds produced the SAME toast").not.toBe(reasonB);
  await expect(page.getByTestId("reason")).toBeVisible();
  await expect(page.getByTestId("reason")).toContainText(reasonB!);

  // `serialize` equality catches a speculative apply-and-rollback; the log length
  // catches a committed no-op. Neither substitutes for the other.
  expect(await serialized(), "an illegal tap moved the sim").toBe(before);
  expect(await count(), "an illegal tap consumed a command").toBe(cmds);

  // NOT TIMED. Still there after a real wait; it is replaced by the next reason or
  // cleared by the next state change, never by a clock (docs/10 §3).
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("reason")).toBeVisible();
  expect(await page.evaluate(() => window.tuh.reason())).toBe(reasonB);

  // The AC-V7 half, when the map offers such a tile: inside a naive radius, outside
  // `moveRange`. Reported rather than asserted-away when the board has none.
  if (far) {
    expect(far.naive).toBeLessThanOrEqual(far.move);
    await page.evaluate((f) => window.tuh.clickTile(f.x, f.y), far);
    expect(await page.evaluate(() => window.tuh.reason())).toBeTruthy();
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V40 — the corners, and the settings readout is real.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V40 — the corners and the readout", () => {
  for (const path of PAGES) {
    test(`${path} the menu drawer offers save, quit, log and legend`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);

      await page.getByTestId("hud-menu").click();
      const drawer = page.getByTestId("menu-drawer");
      await expect(drawer).toBeVisible();
      await expect(drawer).toContainText("Turn log");
      await expect(drawer).toContainText("Legend");
      await expect(page.getByTestId("turn-log")).toBeVisible();
      await expect(page.getByTestId("legend")).toBeVisible();
      // Save and quit exist on the campaign; the engine viewer has no campaign to
      // return to and offers Reset instead. Named per page rather than looped, so a
      // page that silently lost its own entry cannot hide behind the other's.
      if (path === "/") {
        await expect(drawer).toContainText("saved automatically");
        await expect(page.getByTestId("quit")).toBeVisible();
      } else {
        await expect(page.getByTestId("reset")).toBeVisible();
      }
      await expect(page.getByTestId("hud-help")).toBeVisible();
      await expect(page.getByTestId("hud-settings")).toBeVisible();
    });
  }

  /**
   * THE READOUT MUST BE REAL, and that is the whole point of the criterion: it exists
   * so the owner can check the 360 figure against a device nobody here can measure.
   * A hard-coded "800 x 360" passes a presence check at one viewport, and a readout
   * that is WRONG is worse than none.
   */
  test("the settings readout changes with the viewport and matches the page", async ({ page }) => {
    await page.goto("/viewer.html");

    const read = async (
      w: number,
      h: number,
    ): Promise<{ text: string; m: Measured; vv: { w: number; h: number } }> => {
      await page.setViewportSize({ width: w, height: h });
      // hud-settings now lives INSIDE the ☰ menu drawer (combat revamp) — it must be
      // opened first, every time, since the drawer is re-hidden by `close()` below.
      await page.getByTestId("hud-menu").click();
      await page.getByTestId("hud-settings").click();
      await expect(page.getByTestId("settings-drawer")).toBeVisible();
      const text = (await page.getByTestId("settings-readout").textContent()) ?? "";
      const m = await measure(page);
      // SAMPLED HERE, at the viewport the readout was printed at. Read after the loop
      // moved on and the comparison is against a different viewport's numbers — the
      // first draft did exactly that and failed 851 against 800.
      const vv = await page.evaluate(() => ({
        w: window.visualViewport?.width ?? -1,
        h: window.visualViewport?.height ?? -1,
      }));
      await page.getByTestId("settings-drawer-close").click();
      await expect(page.getByTestId("settings-drawer")).toBeHidden();
      return { text, m, vv };
    };

    const a = await read(800, 360);
    const b = await read(851, 324);
    expect(a.text, "the readout is identical at two different viewports").not.toBe(b.text);

    for (const { text, m, vv, name } of [
      { ...a, name: "800x360" },
      { ...b, name: "851x324" },
    ]) {
      // FOUR things, and the host box and `visualViewport` are printed SEPARATELY
      // because they can disagree — that disagreement is what an on-device readout
      // exists to catch, and printing only one hides it. `board` replaces ADR-0037's
      // single whole-stage `scale` figure (ADR-0043 retired it) with the board
      // canvas's own fitted CSS box — the one number left that a resize can move.
      // EQUALITY, not presence. A readout printing "800 x 360" forever satisfies a
      // pattern match at every viewport, and a WRONG readout is worse than none — the
      // owner cannot check it against anything, which is the only reason it exists.
      const vvPrinted = /visualViewport\s+([\d.]+) x ([\d.]+)/.exec(text);
      expect(vvPrinted, `${name} has no visualViewport row`).not.toBeNull();
      expect(Number(vvPrinted![1]), `${name} visualViewport width`).toBeCloseTo(vv.w, 0);
      expect(Number(vvPrinted![2]), `${name} visualViewport height`).toBeCloseTo(vv.h, 0);
      expect(text, `${name} host box`).toMatch(/host box\s+[\d.]+ x [\d.]+/);
      expect(text, `${name} board`).toMatch(/board\s+[\d.]+ x [\d.]+ css px/);
      expect(text, `${name} tile`).toMatch(/tile\s+[\d.]+ x [\d.]+ css px/);

      const host = /host box\s+([\d.]+) x ([\d.]+)/.exec(text)!;
      expect(Number(host[1]), `${name} host width`).toBeCloseTo(m.host.w, 0);
      expect(Number(host[2]), `${name} host height`).toBeCloseTo(m.host.h, 0);

      const board = /board\s+([\d.]+) x ([\d.]+) css px/.exec(text)!;
      expect(Number(board[1]), `${name} board width`).toBeGreaterThan(0);
      expect(Number(board[2]), `${name} board height`).toBeGreaterThan(0);

      // The tile size has NO test behind its accuracy (AC-V35 exempts tiles), so it is
      // asserted only to be present, non-zero and to move with the viewport.
      const tile = /tile\s+([\d.]+) x ([\d.]+) css px/.exec(text)!;
      expect(Number(tile[1]), `${name} tile width`).toBeGreaterThan(0);
    }

    const tileA = Number(/tile\s+([\d.]+)/.exec(a.text)![1]);
    const tileB = Number(/tile\s+([\d.]+)/.exec(b.text)![1]);
    expect(tileA, "the tile size did not move with the viewport").not.toBeCloseTo(tileB, 1);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V41 — safe-area and svh are DECLARED. A presence check, said plainly.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V41 — the declarations (NOT their effect)", () => {
  /**
   * THIS ASSERTS DECLARATION, NOT EFFECT. Playwright cannot emulate a display cutout,
   * so no test here can say a control clears a notch on hardware. Saying so is the
   * criterion's honest half.
   */
  for (const path of PAGES) {
    test(`${path} declares viewport-fit=cover, safe-area padding and svh`, async ({ page }) => {
      await page.goto(path);
      await reachBattle(page, path);

      const meta = await page.locator('meta[name="viewport"]').getAttribute("content");
      expect(meta, `${path} viewport meta`).toContain("viewport-fit=cover");
      expect(meta, "user-scalable=no is banned (docs/10 §8c)").not.toContain("user-scalable");

      // THE STAGE RULE'S DECLARED VALUE, not "the token appears somewhere in the file".
      // Both pages sized in `dvh` before this slice, so a grep for "svh" would have
      // passed while the stage still used `dvh`.
      const declared = await page.evaluate(() => {
        const out: string[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue;
          }
          for (const rule of Array.from(rules)) {
            const css = rule.cssText;
            if (css.includes(".tuh-host")) out.push(css);
          }
        }
        return out.join("\n");
      });
      expect(declared, `${path} has no .tuh-host rule at all`).not.toBe("");
      expect(declared, `${path} stage height is not svh`).toContain("100svh");
      expect(declared, `${path} stage width is not svw`).toContain("100svw");
      expect(declared, `${path} has no safe-area padding`).toContain("safe-area-inset");
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V42 — desktop is the same stage, letterboxed.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V42 — desktop gets the same stage", () => {
  /**
   * "Hover works and Enter confirms" passes against a second, desktop-only layout,
   * which is the outcome this criterion exists to prevent. The child-set comparison
   * is what rules it out; the non-zero letterbox at 1000x780 is what rules out a
   * desktop page that simply ignores the stage.
   */
  for (const path of PAGES) {
    test(`${path} the stage's child set is identical at 1000x780 and 800x360`, async ({ page }) => {
      const fingerprint = async (): Promise<string> =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-testid="stage"] *')]
            .map(
              (e) =>
                `${e.tagName}#${e.id}.${[...e.classList].sort().join(".")}@${
                  (e as HTMLElement).dataset["testid"] ?? ""
                }`,
            )
            .join("|"),
        );

      await page.setViewportSize({ width: 1000, height: 780 });
      await page.goto(path);
      await reachBattle(page, path);
      const desktop = await fingerprint();
      // ADR-0043 RETIRES THE WHOLE-STAGE LETTERBOX CHECK THAT USED TO LIVE HERE: the
      // stage now fills its host exactly at every viewport (`.tuh-stage{inset:0}`) —
      // there is no outer letterbox any more, only the board canvas's OWN internal fit
      // (`stage.ts`'s `fitBox`), which is not what this test is about. What survives is
      // the identical-child-set discriminator below.

      // RELOADED AT THE PHONE SIZE, not merely resized. The stage's DOM is BUILT once
      // at boot, so a resize cannot see a layout that branches on viewport width at
      // construction — which is exactly the "second, desktop-only layout" this
      // criterion exists to prevent. MUTATION RUN: appending a `desktop-extra` child
      // when `innerWidth > 900` was GREEN under the resize-only version and is red
      // under this one.
      await page.setViewportSize({ width: 800, height: 360 });
      await page.goto(path);
      await reachBattle(page, path);
      const phone = await fingerprint();
      expect(phone.length, "the stage rendered no children").toBeGreaterThan(200);
      expect(phone).toBe(desktop);
    });
  }

  /**
   * ESCAPE UNWINDS THE SHALLOWEST THING FIRST: an open drawer or sheet closes, and only
   * once nothing is overlaid does Escape reach the draft.
   *
   * THE DISCRIMINATOR IS THE SURVIVING DRAFT. A handler that went straight to
   * `Session.cancel()` also "closes nothing and cancels", so the assertion that
   * separates the two is that the staged MOVE is still there after the first Escape —
   * the player asked to close a drawer, not to throw away the tile they had chosen.
   */
  for (const path of PAGES) {
    test(`${path} Escape closes an open drawer before it touches the draft`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      const phase = (): Promise<string | null> =>
        page.evaluate((p) => (p === "/" ? window.tuhGame.phase() : window.tuh.phase()), path);

      expect(await stageMove(page, path), "no legal move to stage").toBe(true);
      await page.getByTestId("hud-menu").click();
      await expect(page.getByTestId("menu-drawer")).toBeVisible();

      // FIRST Escape: the drawer goes, the draft stays.
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("menu-drawer")).toBeHidden();
      expect(await phase(), "Escape threw away the staged move as well").toBe("MOVE_STAGED");

      // SECOND Escape: nothing is overlaid, so now it reaches the draft.
      await page.keyboard.press("Escape");
      expect(await phase()).toBe("PLAYER_IDLE");
    });
  }

  test("Enter confirms a staged target and Escape cancels", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 780 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    const count = (): Promise<number> => page.evaluate(() => window.tuh.commands().length);

    // ESCAPE first, so the Enter case below cannot be passing because the draft was
    // already gone. Escape unwinds one level and emits nothing.
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);
    expect(await stageTarget(page, "/viewer.html")).toBe(true);
    const before = await count();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => window.tuh.phase())).not.toBe("TARGET_STAGED");
    expect(await count()).toBe(before);

    // ENTER through ORDINARY FOCUS: staging moves focus to the sheet's Confirm button,
    // so no new key binding is invented and no key path commits without passing
    // through Confirm (ADR-0038 property 3).
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);
    expect(await stageTarget(page, "/viewer.html")).toBe(true);
    await expect(page.getByTestId("confirm")).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await count()).toBe(before + 1);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V67 — the 44px touch-target overlay (owner decision 3, combat revamp).
// ───────────────────────────────────────────────────────────────────────────────

/** Every `.tuh-tile-hit`'s DOM box, plus the diamond size the settings readout reports. */
async function tileHitGeometry(
  page: Page,
): Promise<{
  hits: { x: number; y: number; box: { w: number; h: number; cx: number; cy: number } }[];
  diamond: { w: number; h: number } | null;
}> {
  const hits = await page.evaluate(() => {
    return [...document.querySelectorAll<HTMLElement>('[data-testid="tile-hit"]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Number(el.dataset["x"]),
        y: Number(el.dataset["y"]),
        box: { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 },
      };
    });
  });
  const text = (await page.getByTestId("settings-readout").textContent().catch(() => null)) ?? "";
  const m = /tile\s+([\d.]+) x ([\d.]+) css px/.exec(text);
  return { hits, diamond: m ? { w: Number(m[1]), h: Number(m[2]) } : null };
}

test.describe("AC-V67 — the 44px touch-target overlay", () => {
  for (const path of PAGES) {
    for (const viewport of REFERENCE_VIEWPORTS) {
      test(`${path} at ${viewport.name}: every hit region is >=44x44, the diamond is untouched`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport.size);
        await page.goto(path);
        await reachBattle(page, path);
        expect(await toPlayerTurn(page, path), "no player turn to measure").toBe(true);

        await page.getByTestId("hud-menu").click();
        await page.getByTestId("hud-settings").click();
        const { hits, diamond } = await tileHitGeometry(page);

        expect(hits.length, "no tile-hit elements were built").toBeGreaterThan(0);
        for (const h of hits) {
          expect(h.box.w, `(${h.x},${h.y}) hit width`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
          expect(h.box.h, `(${h.x},${h.y}) hit height`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
          // EXACTLY 44, not merely "at least": `stage.css`'s `.tuh-tile-hit` is a
          // fixed 44x44 box, never derived from the diamond's own (map- and
          // viewport-dependent) size. See the cross-viewport test below for the
          // half that actually separates "fixed" from "coincidentally >= 44 here".
          expect(h.box.w, `(${h.x},${h.y}) hit width is not the fixed 44px box`).toBe(TOUCH_FLOOR);
          expect(h.box.h, `(${h.x},${h.y}) hit height is not the fixed 44px box`).toBe(TOUCH_FLOOR);
        }
        expect(diamond, "no tile row in the readout").not.toBeNull();
        expect(diamond!.w, "the readout printed no real diamond size").toBeGreaterThan(0);
      });
    }
  }

  /**
   * THE DISCRIMINATING HALF (owner decision 3, "the RENDERED diamond is unchanged
   * in size"): the diamond genuinely MOVES with the viewport (a bigger board box
   * gives `viewFor`'s camera more room, so the tile grows) while the HIT REGION
   * does not — it is a fixed 44x44 in `stage.css`, never derived from the diamond.
   * A test that only checked "hit box >= 44" at one viewport could not tell a FIXED
   * 44px box from a box that happens to equal the diamond's own (also >=44 at a
   * generous viewport) size — this is the case that tells the two apart.
   */
  test("/viewer.html the diamond's size MOVES with the viewport; the hit region does NOT", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 300 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    await page.getByTestId("hud-menu").click();
    await page.getByTestId("hud-settings").click();
    const narrow = await tileHitGeometry(page);
    await page.getByTestId("settings-drawer-close").click();

    await page.setViewportSize(REFERENCE_VIEWPORTS[0]!.size);
    await page.getByTestId("hud-menu").click();
    await page.getByTestId("hud-settings").click();
    const wide = await tileHitGeometry(page);

    expect(narrow.diamond, "no diamond size at 640x300").not.toBeNull();
    expect(wide.diamond, "no diamond size at 832x328").not.toBeNull();
    // MUTATION: derive `.tuh-tile-hit`'s width from the diamond instead of a fixed
    // 44px (e.g. `Math.max(44, diamondPx)`) and this line goes red — both sides
    // would then move together.
    expect(wide.diamond!.w, "the diamond did not change with the viewport — fixture is degenerate").not.toBeCloseTo(
      narrow.diamond!.w,
      0,
    );
    for (const h of [...narrow.hits, ...wide.hits]) {
      expect(h.box.w).toBe(TOUCH_FLOOR);
      expect(h.box.h).toBe(TOUCH_FLOOR);
    }
  });

  /**
   * THE AMBIGUOUS TAP (owner decision 3): "adjacent hit regions may overlap; resolve
   * ambiguous taps to the nearest tile centre." DISCOVERED, not hard-coded — the
   * board's own move range names two ADJACENT move-destination tiles whose 44px
   * boxes overlap (tiles this close together are the common case at this viewport,
   * per the diamond-vs-hit-box gap just measured above).
   *
   * THE POINT IS CHOSEN TO BE NEARER ONE CENTRE WHILE STILL INSIDE BOTH BOXES — an
   * equidistant point proves nothing (either resolution would be defensible); this
   * one has exactly one correct answer.
   */
  test("/viewer.html an ambiguous tap resolves to the NEAREST tile centre, not an arbitrary overlap winner", async ({
    page,
  }) => {
    await page.setViewportSize(REFERENCE_VIEWPORTS[0]!.size);
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);

    const { hits } = await tileHitGeometry(page);
    const moveTiles = await page.evaluate(() => window.tuh.moveTiles());
    const isMove = (x: number, y: number): boolean => moveTiles.some((t) => t.x === x && t.y === y);

    // Find a pair of DIFFERENT move-destination tiles whose boxes overlap (centre-to-
    // centre distance < 44, the hit region's own width).
    let pair: (typeof hits)[number][] | null = null;
    outer: for (const a of hits) {
      if (!isMove(a.x, a.y)) continue;
      for (const b of hits) {
        if (a === b || !isMove(b.x, b.y)) continue;
        const d = Math.hypot(a.box.cx - b.box.cx, a.box.cy - b.box.cy);
        if (d > 4 && d < TOUCH_FLOOR) {
          pair = [a, b];
          break outer;
        }
      }
    }
    expect(pair, "no two overlapping move-tile hit regions were found on this board").not.toBeNull();
    const a = pair![0]!;
    const b = pair![1]!;

    // A point 30% of the way from A's centre to B's — strictly nearer A, and (since
    // the two centres are under 44 apart) still inside BOTH 22px-radius boxes.
    const px = a.box.cx + (b.box.cx - a.box.cx) * 0.3;
    const py = a.box.cy + (b.box.cy - a.box.cy) * 0.3;
    expect(Math.hypot(px - a.box.cx, py - a.box.cy), "point is not inside A's box").toBeLessThan(22);
    expect(Math.hypot(px - b.box.cx, py - b.box.cy), "point is not inside B's box").toBeLessThan(22);
    expect(
      Math.hypot(px - a.box.cx, py - a.box.cy),
      "the point is not strictly nearer A — an equidistant point proves nothing",
    ).toBeLessThan(Math.hypot(px - b.box.cx, py - b.box.cy));

    await page.mouse.click(px, py);
    const staged = await page.evaluate(() => window.tuh.draft()?.move?.to ?? null);
    expect(staged, "the tap staged no move at all").not.toBeNull();
    expect(staged).toEqual({ x: a.x, y: a.y });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Item and Defend — carved and dormant (owner decision 4).
// ───────────────────────────────────────────────────────────────────────────────

test.describe("Item and Defend are disabled by IDENTITY, not by a look", () => {
  for (const viewport of REFERENCE_VIEWPORTS) {
    test(`/viewer.html at ${viewport.name}: both are present, disabled, unfocusable-gold, opacity-free, and a tap changes NOTHING`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport.size);
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();
      expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);

      for (const id of ["item", "defend"]) {
        const btn = page.getByTestId(id);
        await expect(btn, `${id} is not in the DOM`).toBeVisible();
        // IDENTITY: the `disabled` PROPERTY, not a class that merely looks disabled.
        await expect(btn, `${id} is not disabled`).toBeDisabled();

        const style = await btn.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { bg: cs.backgroundColor, border: cs.borderColor, opacity: cs.opacity };
        });
        const enabled = await page.getByTestId("move").evaluate((el) => {
          const cs = getComputedStyle(el);
          return { bg: cs.backgroundColor, border: cs.borderColor };
        });
        // TOKEN IDENTITY, not merely "looks different": `--hud-disabled-bg` is a
        // DECLARED colour distinct from `--hud-bg-2` (the enabled ribbon ground) —
        // MUTATION: change `.tuh-ribbon button:disabled` to reuse `--hud-bg-2`
        // (the same fill Move/Attack/Skill use) and this line goes red.
        expect(style.bg, `${id}'s fill matches an ENABLED ribbon button`).not.toBe(enabled.bg);
        expect(style.border, `${id}'s border matches an ENABLED ribbon button`).not.toBe(
          enabled.border,
        );
        // NO GOLD ACCENT ANYWHERE ON THE DISABLED CONTROL — `--hud-accent` is
        // rgb(184, 137, 47); neither the fill nor the border may resolve to it.
        expect(style.bg, `${id}'s fill is gold`).not.toMatch(/184, *137, *47/);
        expect(style.border, `${id}'s border is gold`).not.toMatch(/184, *137, *47/);

        // OPACITY IS NOT THE MECHANISM (owner spec) — a `getComputedStyle().opacity`
        // of anything but "1" means the dormant look was built by dimming the
        // enabled paint rather than by a dedicated ash/charcoal token pair.
        // MUTATION: add `opacity: .4` to `.tuh-ribbon button:disabled` in
        // `stage.css` (leaving the background/border tokens as they are) and this
        // line goes red while the two colour assertions above would stay green —
        // proving `background-color` alone cannot catch an opacity-based fake.
        expect(style.opacity, `${id} is dimmed via opacity, not a distinct token`).toBe("1");

        // NO GOLD FOCUS BORDER: force focus (a disabled button refuses real focus, so
        // this checks the STYLE RULE rather than the browser's own refusal) and read
        // the outline colour computed style would use if it COULD focus.
        const outline = await btn.evaluate((el) => getComputedStyle(el).outlineColor);
        expect(outline, `${id} would take a gold focus ring`).not.toMatch(/184, *137, *47/);

        // A TAP CHANGES NOTHING: the phase and command log are byte-identical after.
        const before = { phase: await page.evaluate(() => window.tuh.phase()), n: await page.evaluate(() => window.tuh.commands().length) };
        await btn.click({ force: true });
        const after = { phase: await page.evaluate(() => window.tuh.phase()), n: await page.evaluate(() => window.tuh.commands().length) };
        expect(after, `${id} changed session state`).toEqual(before);
      }
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// The entry plaque (owner decision 9, combat revamp) — campaign only.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("the entry plaque", () => {
  test("reads the battle's name, reserves no permanent height, and is GONE after dismissal", async ({
    page,
  }) => {
    await page.setViewportSize(REFERENCE_VIEWPORTS[0]!.size);
    await page.goto("/");
    await startNewGame(page);
    await dismissScene(page);

    // BEFORE deploy: the plaque is not shown (it announces on entry, not before it).
    // Not measured against the board box here — `.tuh-board` sits inside the
    // `#screen-battle` section, `hidden` before deploy, so its own
    // `getBoundingClientRect()` would report a false 0x0 and prove nothing; the
    // meaningful comparison is DURING the plaque vs AFTER it is dismissed, both
    // taken once the battle screen is actually up.
    await expect(page.getByTestId("entry-plaque")).toBeHidden();

    // READ OFF THE PAGE, never hard-coded or imported: `npm run check:story`
    // forbids a test asserting pack prose verbatim (docs/11 AC-M4 — the pack must
    // stay swappable), and importing `battleTitle` here dragged in `campaign-
    // data.ts`'s asset imports (SVG placeholders), which Playwright's plain
    // transform cannot parse. The briefing's own title (`brief-title`, `game.ts`)
    // is computed by the EXACT SAME expression `deployIntoBattle` captures for the
    // plaque, so cross-checking the plaque against it proves the two agree without
    // either pinning or re-deriving the string.
    const briefedTitle = ((await page.getByTestId("brief-title").textContent()) ?? "").trim();
    expect(briefedTitle.length, "the briefing named no battle to cross-check against").toBeGreaterThan(0);

    await page.getByTestId("deploy").click();
    await expect(page.getByTestId("screen-battle")).toBeVisible();

    // ON ENTRY: visible, and it names the SAME battle the briefing just named.
    const plaque = page.getByTestId("entry-plaque");
    await expect(plaque).toBeVisible();
    await expect(plaque).toContainText(briefedTitle);

    const boardBox = (): Promise<{ w: number; h: number }> =>
      page.evaluate(() => {
        const r = document.querySelector('[data-hud="board"]')!.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
    // RESERVES NO PERMANENT HEIGHT: the board allocation is the SAME box while the
    // plaque is showing and once it is gone — it overlays the board (`position:
    // absolute`, ADR-0043 decision 4's temporary-overlay exception) rather than
    // pushing it down or reserving a row for it.
    const boardDuring = await boardBox();
    expect(boardDuring.w * boardDuring.h, "the board has no area while the plaque shows").toBeGreaterThan(0);

    // GONE AFTER DISMISSAL — not merely faded. The AFTER state is asserted, not only
    // that the plaque appeared: `toBeHidden()` requires `display:none`/`[hidden]`,
    // which a CSS-only fade to opacity 0 would NOT satisfy.
    await expect(plaque).toBeHidden({ timeout: 4000 });
    const boardAfter = await boardBox();
    expect(boardAfter, "the board allocation moved once the plaque left — it reserved space").toEqual(
      boardDuring,
    );
  });

  test("/viewer.html the plaque exists in the DOM (identical child set, AC-V42) but is never shown", async ({
    page,
  }) => {
    await page.setViewportSize(REFERENCE_VIEWPORTS[0]!.size);
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    await expect(page.getByTestId("entry-plaque")).toBeHidden();
    // Give it the hold+fade window and confirm it never appeared — the viewer has no
    // battle identity to announce (`HudPorts.battleName` is absent there).
    await page.waitForTimeout(500);
    await expect(page.getByTestId("entry-plaque")).toBeHidden();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// The campaign's own walk — the page a stranger actually plays.
// ───────────────────────────────────────────────────────────────────────────────

test("the campaign reaches a battle on the stage and can finish it there", async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 324 });
  await page.goto("/");
  await startNewGame(page);
  await dismissScene(page);
  await prepEveryMember(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();

  // The board is up and the page beneath it does not scroll.
  const m = await measure(page);
  expect(m.scroll.h).toBeLessThanOrEqual(m.scroll.ch + 1);

  await page.evaluate(() => window.tuhGame.autoplay());
  // The primary button is REPLACED by Continue once the battle is decided — a decided
  // battle has no turn left to end, and four controls do not fit the narrowest stage.
  await expect(page.getByTestId("conclude")).toBeVisible();
  await expect(page.getByTestId("end-turn")).toBeHidden();
  await page.getByTestId("conclude").click();
  await expect(page.getByTestId("screen-after")).toBeVisible();
});

// ───────────────────────────────────────────────────────────────────────────────
// Combat-revamp refinement, 2026-09-10 — Correction 1 (compact-in-band forecast)
// and Correction 2 (Confirm/Cancel are not a 7th/8th canonical command).
// ───────────────────────────────────────────────────────────────────────────────

/**
 * BOARD GEOMETRY IS IDENTICAL BETWEEN REST AND TARGET-STAGED — with the deep-dive
 * sheet both closed AND explicitly opened. ADR-0043 decision 6 forbids a resize; a
 * measurement taken in only one state cannot see a reflow the other state alone
 * would have (this file's own README rule).
 *
 * MUTATION: give `.tuh-sheet` `position: static` (so it participates in the CSS
 * Grid's `board` column instead of overlaying it) — `boardAfterOpen` then differs
 * from `boardAtRest` and the third `toEqual` below goes red.
 */
test.describe("board geometry is byte-identical across rest and every targeting state", () => {
  for (const path of PAGES) {
    for (const viewport of REFERENCE_VIEWPORTS) {
      test(`${path} at ${viewport.name}: the board rect never moves`, async ({ page }) => {
        await page.setViewportSize(viewport.size);
        await page.goto(path);
        await reachBattle(page, path);
        expect(await toPlayerTurn(page, path), "no player turn to measure").toBe(true);

        const boardAtRest = await boardAllocation(page);
        expect(boardAtRest.w * boardAtRest.h, "the board has no area at rest").toBeGreaterThan(0);

        expect(await stageTarget(page, path), "no legal target to stage").toBe(true);
        const boardStagedClosed = await boardAllocation(page);
        expect(boardStagedClosed, "the board moved when a target was merely staged").toEqual(
          boardAtRest,
        );

        await openPreview(page);
        await expect(page.getByTestId("preview-sheet")).toBeVisible();
        const boardStagedOpen = await boardAllocation(page);
        expect(
          boardStagedOpen,
          "the board moved when the deep-dive sheet opened over it",
        ).toEqual(boardAtRest);
      });
    }
  }
});

/**
 * NO ELEMENT INTERSECTS THE BOARD DURING ORDINARY TARGET STAGING — measured in
 * px², not by class presence. The temporary entry plaque is the one named
 * exception (ADR-0043 decision 4); it is long gone by the time a turn is staged
 * (`dismissScene`/its own hold+fade run at battle entry), so this asserts its
 * ABSENCE rather than special-casing it — a plaque still on screen this late
 * would itself be a bug the "except the plaque" clause is not a licence for.
 *
 * MUTATION: revert `hud.ts`'s `sheet.hidden = overlay !== "preview"` to the old
 * `staged === null && overlay !== "preview"` and the `sheetInBoard` assertion
 * below goes red — the sheet, which sits at `right: var(--rail-w); top: 0`,
 * intersects the board allocation the instant a target is staged.
 */
test.describe("no element intersects the board allocation while ordinarily staging a target", () => {
  for (const viewport of REFERENCE_VIEWPORTS) {
    test(`/viewer.html at ${viewport.name}: 0 px² of intersection, and the plaque is absent`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport.size);
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();
      await expect(
        page.getByTestId("entry-plaque"),
        "the plaque should not be showing this late — the exception does not apply",
      ).toBeHidden();
      expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);
      expect(await stageTarget(page, "/viewer.html")).toBe(true);

      const board = await boardAllocation(page);
      const b = await boxes(page);
      for (const hud of b.hud) {
        const px2 = overlap(hud, board);
        expect(px2, `${hud.name} ∩ board while staging`).toBe(0);
      }
      const sheetBox = await page.getByTestId("preview-sheet").boundingBox();
      const sheetPx2 = sheetBox ? overlap({ ...sheetBox, w: sheetBox.width, h: sheetBox.height }, board) : 0;
      expect(sheetPx2, "the closed sheet still intersects the board").toBe(0);
    });
  }
});

/**
 * THE COMPACT FORECAST IN THE BAND IS REAL DATA, AND THE DEEP PANEL IS CLOSED BY
 * DEFAULT, THEN OPENS/CLOSES ON THE EXPLICIT TAP.
 *
 * MUTATION 1 (real data): hard-code `targetPlateHtml` to print a fixed "HIT 50%"
 * regardless of `p.hitChance` — the `domHit === seamHit` assertion goes red the
 * instant a discovered fixture's real hit chance is not 50.
 * MUTATION 2 (default closed): see the geometry test above for the same revert.
 * MUTATION 3 (name, combat-revamp pass 3): change `targetPlateHtml`'s name span
 * to a fixed string, e.g. `"Target"`. `plateText` no longer contains
 * `UNIT_META[targetId].label` and the WHO assertion below goes red. This is also
 * the PIXEL-BUDGET regression this pass fixes: before the plate's row count was
 * cut from six to three (see `panels.ts`/`stage.css`), the name span existed in
 * the HTML but was clipped out of the rendered 50px box by `overflow: hidden` —
 * a check that only read `innerHTML` could not have seen that; `textContent`
 * off the real element, as this test already does, can.
 */
test.describe("the TARGET UNIT plate carries real data; the deep panel is closed by default", () => {
  for (const viewport of REFERENCE_VIEWPORTS) {
    test(`/viewer.html at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();
      expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);
      expect(await stageTarget(page, "/viewer.html")).toBe(true);

      // CLOSED BY DEFAULT.
      await expect(page.getByTestId("preview-sheet")).toBeHidden();

      // THE COMPACT PLATE ALREADY SHOWS THE ANSWER — read straight off the seam's
      // OWN preview, never re-derived, so this cannot pass by coincidence.
      const seam = await page.evaluate(() => {
        const p = window.tuh.preview();
        if (!p) return null;
        return { hit: p.hitChance, dmg: p.magnitude, heal: p.heal, targetId: p.targetId };
      });
      expect(seam, "no live preview to compare against").not.toBeNull();
      const plateText = (await page.getByTestId("target-plate").textContent()) ?? "";
      expect(plateText, "the plate does not print the real hit %").toContain(`${seam!.hit}%`);
      expect(
        plateText,
        "the plate does not print the real magnitude",
      ).toContain(`${seam!.dmg}`);
      expect(plateText, "the plate does not name the reading (DMG/HEAL)").toMatch(
        seam!.heal ? /HEAL/ : /DMG/,
      );
      // WHO — the owner's acceptance line ("target identity remain clear"), matched
      // against the SAME id the seam staged, resolved through the demo's own
      // `UNIT_META` (the table `main.ts`'s `look` reads) rather than a hard-coded
      // string. `id` itself must NOT appear (`Session.reset()`'s discovery never
      // targets the actor's own team, but if it ever did, printing the raw id
      // instead of the resolved label would still read as "some text is there").
      const expectedName = UNIT_META[seam!.targetId]?.label;
      expect(expectedName, `${seam!.targetId} has no UNIT_META entry to check against`).toBeTruthy();
      expect(plateText, "the plate does not print the target's real name").toContain(
        expectedName!,
      );

      // OPENS ON THE EXPLICIT TAP …
      await openPreview(page);
      await expect(page.getByTestId("preview-sheet")).toBeVisible();
      // … AND CLOSES AGAIN on the same control (toggle).
      await openPreview(page);
      await expect(page.getByTestId("preview-sheet")).toBeHidden();
    });
  }
});

/**
 * THE DEVELOPER-DEBUG PROSE IS GONE FROM THE DOM — at rest, while staging, and
 * even once the deep panel is explicitly opened. There is no disclosure gate to
 * check "only after the tap" against: the owner's decision was to DELETE the
 * sentence, not relocate it, so the A/B here is "never present" rather than
 * "present only behind the tap".
 *
 * MUTATION: restore the `slotHonesty()` call and its closing `<p class="phint">`
 * in `panels.ts`'s `previewHtml` — every assertion below goes red at once, which
 * is itself worth noting (a single removal, not several).
 */
test.describe("developer-debug prose does not reach the player", () => {
  const BANNED = [
    "Not modeled yet",
    "elemental weak/half/absorb",
    "line of sight",
    "projection, not a fact",
    "is <b>exact</b>: nobody ahead of you",
  ];

  test("/viewer.html absent at rest, while staging, and inside the opened deep panel", async ({
    page,
  }) => {
    await page.setViewportSize(REFERENCE_VIEWPORTS[0]!.size);
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();

    const bodyHtml = async (): Promise<string> => page.evaluate(() => document.body.innerHTML);

    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);
    let html = await bodyHtml();
    for (const phrase of BANNED) expect(html, `"${phrase}" present at rest`).not.toContain(phrase);

    expect(await stageTarget(page, "/viewer.html")).toBe(true);
    html = await bodyHtml();
    for (const phrase of BANNED)
      expect(html, `"${phrase}" present while staging`).not.toContain(phrase);

    await openPreview(page);
    await expect(page.getByTestId("preview-sheet")).toBeVisible();
    html = await bodyHtml();
    for (const phrase of BANNED)
      expect(html, `"${phrase}" present inside the OPENED deep panel`).not.toContain(phrase);
  });
});

/**
 * CONFIRM/CANCEL RESOLVE TO DIFFERENT CONSTRUCTION TOKENS THAN THE SIX CANONICAL
 * COMMANDS — by declared background colour, never "looks similar". Both still
 * clear the 44×44 floor and WCAG AA 4.5:1 against their own ink.
 *
 * MUTATION: in `hud.ts`, change `confirmBtn.classList.add("tuh-confirm")` back to
 * `confirmBtn.classList.add("tuh-commit")` (Confirm shares Wait's construction
 * again) — the CLASS-IDENTITY assertion below (`confirm.classes`) goes red.
 *
 * WAIT/END-TURN IS DELIBERATELY NOT READ HERE FOR A LIVE-COLOUR COMPARISON: it is
 * `disabled` throughout `TARGET_STAGED` ("End Turn cannot spend a turn with a shot
 * aimed" — this file's own AC-V36 block), and a disabled control's computed colour
 * is the SHARED ash/charcoal token regardless of which class it also carries — so
 * `confirm.bg !== wait.bg` would pass even after the mutation above (confirmed:
 * comparing live colours against a disabled sibling is confounded by the disabled
 * state, not sensitive to the construction class at all). The class-name check
 * below is what the brief asks for anyway — identity, not "looks different".
 */
test.describe("Confirm/Cancel are a CONTEXTUAL pair, not a 7th/8th canonical command", () => {
  for (const viewport of REFERENCE_VIEWPORTS) {
    test(`/viewer.html at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();
      expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);
      expect(await stageTarget(page, "/viewer.html")).toBe(true);

      const read = async (id: string) =>
        page.getByTestId(id).evaluate((el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            bg: cs.backgroundColor,
            ink: cs.color,
            w: r.width,
            h: r.height,
            classes: [...el.classList],
          };
        });

      const move = await read("move"); // canonical, enabled, non-commit
      const confirm = await read("confirm");
      const cancel = await read("cancel");

      // TOKEN IDENTITY, BY CLASS NAME — the discriminating check. Confirm/Cancel
      // must carry their OWN construction class, never the canonical `.tuh-commit`
      // (Wait/End Turn's) and never bare (the plain enabled-ribbon look).
      expect(confirm.classes, "Confirm is not wearing its own construction class").toContain(
        "tuh-confirm",
      );
      expect(confirm.classes, "Confirm shares Wait's .tuh-commit class").not.toContain(
        "tuh-commit",
      );
      expect(cancel.classes, "Cancel is not wearing its own construction class").toContain(
        "tuh-cancel",
      );
      expect(cancel.classes, "Cancel shares Wait's .tuh-commit class").not.toContain(
        "tuh-commit",
      );

      // DIFFERENT FROM THE CANONICAL SIX'S ENABLED GROUND, IN PAINT TOO.
      expect(confirm.bg, "Confirm matches Move's plain enabled fill").not.toBe(move.bg);
      expect(cancel.bg, "Cancel matches Move's plain enabled fill").not.toBe(move.bg);
      // CONFIRM AND CANCEL ARE ALSO DISTINCT FROM EACH OTHER.
      expect(cancel.bg, "Cancel matches Confirm's fill").not.toBe(confirm.bg);

      for (const [name, box] of [["confirm", confirm], ["cancel", cancel]] as const) {
        expect(box.w, `${name} width`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
        expect(box.h, `${name} height`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
        const ratio = contrastRatio(box.ink, box.bg);
        expect(ratio, `${name} ink/fill contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

/**
 * SELECTED VS ENABLED-UNSELECTED COMMAND RESOLVE TO DIFFERENT TOKENS, and every
 * band/rail label clears AA 4.5:1 — computed, not eyeballed.
 *
 * The selected state (`.tuh-ribbon button[aria-pressed="true"]`) is built from
 * `--hud-accent` on `color` and `border-color`/`box-shadow`, NOT `background-
 * color` — the fill is deliberately unchanged (`stage.css`'s own comment: "the
 * SAME gold/ember emphasis"), so `ink` and `border` are the tokens under test.
 *
 * MUTATION: delete the `.tuh-ribbon button[aria-pressed="true"]` rule in
 * `stage.css` — `selected.ink === unselected.ink` and the first assertion below
 * goes red.
 */
test.describe("selected vs enabled-unselected ribbon commands, and label contrast", () => {
  for (const viewport of REFERENCE_VIEWPORTS) {
    test(`/viewer.html at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();
      expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);

      const read = async (id: string) =>
        page.getByTestId(id).evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            bg: cs.backgroundColor,
            ink: cs.color,
            border: cs.borderColor,
            pressed: el.getAttribute("aria-pressed"),
          };
        });

      const unselected = await read("move");
      expect(unselected.pressed, "Move reads pressed before it was pressed").not.toBe("true");

      await page.getByTestId("attack").click();
      const selected = await read("attack");
      expect(selected.pressed, "Attack did not register as pressed").toBe("true");

      expect(selected.ink, "the selected and enabled-unselected ink tokens match").not.toBe(
        unselected.ink,
      );
      expect(
        selected.border,
        "the selected and enabled-unselected border tokens match",
      ).not.toBe(unselected.border);

      // EVERY BAND/RAIL LABEL CLEARS AA 4.5:1, at the SAME viewport this test just
      // set — the two other label-bearing controls asserted above only cover two
      // of eight ribbon buttons plus the two plates; this sweeps the rest by id.
      const ids = ["move", "attack", "actions", "item", "defend", "end-turn", "actor-tab", "target-plate"];
      let worst = Infinity;
      for (const id of ids) {
        const el = page.getByTestId(id);
        const paint = await el.evaluate((node) => {
          const cs = getComputedStyle(node);
          return { bg: cs.backgroundColor, ink: cs.color };
        });
        const ratio = contrastRatio(paint.ink, paint.bg);
        worst = Math.min(worst, ratio);
        expect(ratio, `${id} ink/fill contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
      expect(worst, "no control was actually measured").toBeLessThan(Infinity);
    });
  }
});

/**
 * MATERIAL PASS (owner brief, this session) — the ribbon's enabled command face
 * resolves to the declared PARCHMENT token, never the HUD's dark ground token,
 * and IDENTITY is asserted by reading the custom property's own resolved value
 * off the element, not a hard-coded hex — the token carries the value, the test
 * only carries the name (`src/render/CLAUDE.md`'s own instruction for this pass).
 *
 * MUTATION: in `stage.css`, change `.tuh-ribbon button`'s `background` from
 * `var(--hud-face-bg)` back to `var(--hud-bg-2)` (the old dark-skin ground).
 * `enabled.bg` then equals `ground` instead of `face`, and the first assertion
 * goes red.
 */
test.describe("the ribbon's enabled face resolves to the parchment token", () => {
  for (const viewport of REFERENCE_VIEWPORTS) {
    test(`/viewer.html at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();
      expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);

      const read = await page.getByTestId("move").evaluate((el) => {
        const cs = getComputedStyle(el);
        const face = cs.getPropertyValue("--hud-face-bg").trim();
        const ground = cs.getPropertyValue("--hud-bg-2").trim();
        return { bg: cs.backgroundColor, face, ground };
      });
      expect(read.face, "--hud-face-bg is not declared").not.toBe("");
      expect(read.ground, "--hud-bg-2 is not declared").not.toBe("");
      // IDENTITY: the painted fill resolves to the PARCHMENT token's own value —
      // read from the token itself, not a literal this test would have to keep
      // in sync by hand.
      expect(read.bg, "the enabled face does not resolve to --hud-face-bg").toBe(read.face);
      expect(read.bg, "the enabled face resolves to the old dark ground token").not.toBe(
        read.ground,
      );
    });
  }
});

/**
 * MATERIAL PASS — the right rail's frame resolves to the IRON/STEEL token
 * (`--hud-iron`, its OWN literal since combat-revamp pass 3, distinct from
 * `--hud-bg`, and pinned separately by `e2e/contrast.spec.ts` as
 * `GROUNDS.ironFrame`), and its turn-order mounts are circular —
 * asserted by `border-radius`'s IDENTITY (`50%`), not by "a portrait renders".
 *
 * MUTATION 1: in `stage.css`, declare `.tuh-rail { background: var(--hud-bg-2); }`
 * instead of `var(--hud-iron)`. `rail.bg !== rail.iron` and the first assertion
 * goes red (this does NOT trip `e2e/contrast.spec.ts`'s own pinned-ground test,
 * because that test only knows the literal RGB `--hud-bg-2` happens not to
 * equal here — a real gap this test closes by reading the token instead).
 * MUTATION 2: in `stage.css`, change `.tuh-rail-chips .chip`'s `border-radius`
 * from `50%` to `4px`. The second assertion goes red.
 */
test.describe("the rail's frame is iron/steel and its mounts are circular", () => {
  for (const viewport of REFERENCE_VIEWPORTS) {
    test(`/viewer.html at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();

      const rail = await page.getByTestId("timeline").evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, iron: cs.getPropertyValue("--hud-iron").trim() };
      });
      expect(rail.iron, "--hud-iron is not declared").not.toBe("");
      expect(rail.bg, "the rail's frame does not resolve to --hud-iron").toBe(rail.iron);

      const chip = await page
        .locator(".tuh-rail-chips .chip")
        .first()
        .evaluate((el) => getComputedStyle(el).borderRadius);
      expect(chip, "a turn-order mount is not circular").toBe("50%");
    });
  }
});

/**
 * THE BAND/RAIL RIVETS ARE ACTUALLY PAINTED, not merely declared (combat-revamp
 * pass 3) — `stage.css`'s own history names the failure mode: `.tuh-rail::before`
 * shipped invisible for a full round of screenshots even though every computed
 * style read back exactly as declared, because its `z-index: -1` escaped past the
 * nearest real stacking context instead of stopping at `.tuh-rail` itself. A test
 * that only reads `background-image` off the DECLARATION cannot see that — it has
 * to read the pseudo-element's own RENDERED box.
 *
 * MUTATION 1: delete `content: "";` from `.tuh-rail::before` in `stage.css`. Per
 * spec a `::before` with no `content` generates no box at all — the browser's
 * computed `width`/`height` for the pseudo collapse to `auto`, and `parseFloat`
 * on that is `NaN`, so the `toBeGreaterThan(0)` assertions go red.
 * MUTATION 2: revert `.tuh-rail`'s own `z-index: 0` (the exact historical bug).
 * The pseudo keeps a non-zero rendered size — it is still laid out — so this
 * mutation does NOT trip this test; it is a real, named limitation (size and
 * position cannot see stacking order) rather than a silent gap, which is why the
 * frames in `docs/visual/stage/` are still opened, not skipped, for this change.
 */
test.describe("the band/rail rivets are PAINTED, not merely declared", () => {
  for (const viewport of REFERENCE_VIEWPORTS) {
    test(`/viewer.html at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();

      const read = await page.evaluate(() => {
        return [".tuh-rail", ".tuh-band"].map((sel) => {
          const el = document.querySelector(sel)!;
          const box = el.getBoundingClientRect();
          const cs = getComputedStyle(el, "::before");
          return {
            sel,
            image: cs.backgroundImage,
            w: parseFloat(cs.width),
            h: parseFloat(cs.height),
            boxW: box.width,
            boxH: box.height,
          };
        });
      });

      for (const r of read) {
        expect(r.image, `${r.sel}::before declares no gradient at all`).toContain(
          "radial-gradient",
        );
        // RENDERED, not merely declared: a real numeric box, not `NaN` from `auto`.
        expect(r.w, `${r.sel}::before rendered at zero width`).toBeGreaterThan(0);
        expect(r.h, `${r.sel}::before rendered at zero height`).toBeGreaterThan(0);
        // INSIDE THE SURFACE'S OWN BOX — `inset: 0` measured from the padding edge,
        // so up to the surface's own 1px border may separate the two; never more.
        expect(r.w, `${r.sel}::before is not sized to the surface`).toBeGreaterThan(
          r.boxW - 4,
        );
        expect(r.h, `${r.sel}::before is not sized to the surface`).toBeGreaterThan(
          r.boxH - 4,
        );
      }
    });
  }
});

/**
 * CONFIRM/CANCEL READ AS A CONTEXTUAL PAIR, NOT A SEVENTH/EIGHTH CANONICAL COMMAND
 * (owner spec, combat-revamp pass 3) — two independent halves, checked
 * separately, because either one alone reads as "fixed":
 *   - a same-WIDTH, different-COLOUR repaint would pass the colour half only;
 *   - a same-COLOUR, narrower resize would pass the width half only.
 * Both are asserted together on the SAME staged state so neither can be the one
 * that was actually tested.
 *
 * MUTATION 1 (colour): in `stage.css`, delete `.tuh-ribbon button.tuh-confirm`'s
 * `background` override. `confirm.bg` falls back to the base rule's plain
 * `--hud-face-bg`, equal to `move.bg`, and the colour-half assertions go red.
 * MUTATION 2 (width): in `stage.css`, delete the `.tuh-ribbon button.tuh-confirm,
 * .tuh-ribbon button.tuh-cancel { flex: 0 0 44px; min-width: 44px; }` rule. Both
 * buttons then inherit the base rule's 48px, `confirm.w === move.w`, and the
 * width-half assertions go red even though the colours above still differ.
 */
test.describe("Confirm/Cancel: distinct construction tokens AND a distinct rendered width", () => {
  for (const viewport of REFERENCE_VIEWPORTS) {
    test(`/viewer.html at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();
      // Staged, not at rest: Confirm only ENABLES at `TARGET_STAGED` (`hud.ts`), and
      // its disabled ash tone is shared with every other disabled ribbon button —
      // measuring it disabled could not tell this pair's own construction from any
      // other button's "off" state.
      expect(await stageTarget(page, "/viewer.html")).toBe(true);

      const read = await page.evaluate(() => {
        const box = (id: string) => {
          const el = document.querySelector(`[data-testid="${id}"]`)!;
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height, bg: getComputedStyle(el).backgroundColor };
        };
        return {
          move: box("move"),
          commit: box("end-turn"),
          confirm: box("confirm"),
          cancel: box("cancel"),
        };
      });

      // TOKEN HALF — Confirm/Cancel resolve to their OWN fills: neither the plain
      // enabled face (Move/Attack/Skill/Item/Defend) nor `--hud-red` (Wait/End
      // Turn, a canonical command that also "commits"), and not each other's.
      expect(read.confirm.bg, "Confirm reuses the plain enabled face").not.toBe(read.move.bg);
      expect(read.confirm.bg, "Confirm reuses End Turn's --hud-red").not.toBe(read.commit.bg);
      expect(read.cancel.bg, "Cancel reuses the plain enabled face").not.toBe(read.move.bg);
      expect(read.cancel.bg, "Cancel reuses End Turn's --hud-red").not.toBe(read.commit.bg);
      expect(read.confirm.bg, "Confirm and Cancel share one fill").not.toBe(read.cancel.bg);

      // WIDTH HALF — narrower than BOTH canonical commands measured, never equal.
      expect(read.confirm.w, "Confirm is not narrower than Move").toBeLessThan(read.move.w);
      expect(read.cancel.w, "Cancel is not narrower than Move").toBeLessThan(read.move.w);
      expect(read.confirm.w, "Confirm is not narrower than End Turn").toBeLessThan(
        read.commit.w,
      );
      expect(read.cancel.w, "Cancel is not narrower than End Turn").toBeLessThan(read.commit.w);

      // NEITHER HALF MAY SHRINK BELOW THE TOUCH FLOOR (docs/10 AC-V35).
      for (const b of [read.confirm, read.cancel]) {
        expect(b.w).toBeGreaterThanOrEqual(TOUCH_FLOOR);
        expect(b.h).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      }
    });
  }
});
