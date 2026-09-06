/**
 * OVERLAYS AND THE BOARD UNDER THEM — rewritten for ADR-0037.
 *
 * THE FILE'S OLD CLAIM IS GONE, and it is worth saying why rather than deleting it
 * quietly. Until 2026-09-05 the stat plate sat ON the canvas (ADR-0033 decision 2) and
 * this file's whole job was proving it declined pointer events, because a plate that
 * ate clicks stops the board responding in one corner with no error, no red test and
 * nothing on screen to see. ADR-0037 superseded that placement: the plate became a
 * laid-out tab beside the board, and AC-V34 now asserts — at five viewports, in three
 * states — that NOTHING laid out overlaps the canvas at all.
 *
 * WHAT STILL NEEDS THIS FILE. AC-V34 measures BOXES. It cannot see the browser's
 * hit-test, and a zero-overlap layout can still be unclickable: a transparent
 * full-stage element, a stray `z-index`, an overlay left mounted with
 * `visibility: hidden` instead of `hidden`. So this file keeps the half no geometry
 * assertion reaches — `elementFromPoint` and a REAL click, end to end, through the
 * page's own cursor seam.
 *
 * WHY THE ENGINE VIEWER. It is the page with a pixel seam (`window.tuh.cursor()`
 * reports the tile the last pick resolved to), so a click can be observed end to end
 * rather than inferred from a repaint. The campaign carries the same stage, built by
 * the same module; its half is the hit-test.
 */

import { test, expect, type Page } from "@playwright/test";
import { pickTile } from "../src/render/iso.js";
import { dismissScene } from "./helpers.js";
import type { BattleState } from "../src/sim/index.js";

const CANVAS_W = 900;
const CANVAS_H = 440;

/**
 * A canvas point that resolves to a REAL, EMPTY tile.
 *
 * EMPTY, and that changed with ADR-0037. The old version aimed at a UNIT's tile — the
 * most expensive thing a swallowed click could cost — but a tap on a unit that is not
 * a legal target now opens the read-only drawer instead of reaching `Session.onPick`
 * (docs/10 §3), so the cursor deliberately does not move and this file's end-to-end
 * observation would have been reading the wrong outcome. An empty tile still goes
 * through the whole chain: pointer → `pickTile` → `hud.pick` → `onPick` → `cursor`.
 *
 * Found through the page's own `pickTile`, so "resolves to a tile" means exactly what
 * it means to a real click, occlusion and all. `avoid` keeps the target off the tile
 * the cursor already sits on: "the cursor is here afterwards" was already true before
 * the click, and a test that cannot tell those apart proves nothing.
 */
async function aimAtATile(
  page: Page,
  avoid: { x: number; y: number } | null,
): Promise<{ tile: { x: number; y: number }; at: { x: number; y: number } }> {
  const canvasBox = (await page.getByTestId("grid").boundingBox())!;
  // THE LIVE STATE, not a freshly built demo: the viewer boots mid-battle and its units
  // have already moved, so a fresh `makeDemoBattle()` names the wrong occupants.
  const state = (await page.evaluate(() => window.tuh.getState())) as BattleState;
  const toBacking = CANVAS_W / canvasBox.width;

  let found: { tile: { x: number; y: number }; at: { x: number; y: number } } | null = null;
  for (let by = 4; by < CANVAS_H && !found; by += 4) {
    for (let bx = 4; bx < CANVAS_W; bx += 4) {
      const tile = pickTile(state, bx, by, CANVAS_W, CANVAS_H);
      if (!tile) continue;
      if (state.units.some((u) => u.pos.x === tile.x && u.pos.y === tile.y)) continue;
      if (avoid && tile.x === avoid.x && tile.y === avoid.y) continue;
      found = { tile, at: { x: canvasBox.x + bx / toBacking, y: canvasBox.y + by / toBacking } };
      break;
    }
  }
  expect(found, "no empty tile is reachable by pointer on the demo board").not.toBeNull();
  return found!;
}

test("the board takes a real click at rest — nothing invisible sits over it", async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 324 });
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();
  // A known start: `reset` parks the tile cursor on the active unit, so "the cursor
  // moved" below is a fact about this click rather than about the boot state.
  await page.evaluate(() => window.tuh.reset());

  const before = await page.evaluate(() => window.tuh.cursor());
  const { tile, at } = await aimAtATile(page, before);

  // The browser's OWN hit-test, which is what routes a click. Anything transparent
  // stretched over the stage answers here and nowhere else.
  const hit = await page.evaluate(
    (p) => document.elementFromPoint(p.x, p.y)?.tagName.toLowerCase() ?? "none",
    at,
  );
  expect(hit).toBe("canvas");

  // …and end to end: a real click at that point reaches `pickTile` → the HUD → the
  // session. The before/after is required because `reset` parks the cursor somewhere
  // real; `cursor() === tile` alone could have been true before the click.
  expect(before).not.toEqual(tile);
  await page.mouse.click(at.x, at.y);
  expect(await page.evaluate(() => window.tuh.cursor())).toEqual(tile);
});

/**
 * AN OPEN DRAWER *DOES* EAT THE BOARD, AND THAT IS THE DESIGN — it is an overlay the
 * player just asked for, and Cancel/the bar are how they leave it. What must never
 * happen is the drawer eating the BARS, because those are the way out.
 *
 * MUTATION RUN: set `.tuh-drawer { bottom: 0 }` in `stage.css` and rebuild — the
 * action-bar assertion below goes red, and so do four cases in `stage.spec.ts` that
 * time out trying to click Cancel. That is the defect this replaces: the first draft
 * of the stage had exactly that rule.
 */
test("an open drawer never covers the bars that close it", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 300 });
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();

  await page.getByTestId("hud-menu").click();
  await expect(page.getByTestId("menu-drawer")).toBeVisible();

  const clear = async (testId: string): Promise<string> => {
    const box = (await page.getByTestId(testId).boundingBox())!;
    return page.evaluate(
      (p) => document.elementFromPoint(p.x, p.y)?.getAttribute("data-testid") ?? "none",
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
  };

  // The topmost element at each control's own centre is that control — not the drawer.
  expect(await clear("cancel"), "the drawer covers Cancel").toBe("cancel");
  expect(await clear("end-turn"), "the drawer covers the primary button").toBe("end-turn");
  expect(await clear("hud-menu"), "the drawer covers its own ☰").toBe("hud-menu");
  expect(await clear("hud-settings"), "the drawer covers ⚙").toBe("hud-settings");

  // …and it really was open the whole time, so none of the above is vacuous.
  await expect(page.getByTestId("menu-drawer")).toBeVisible();
});

test("the campaign board carries the same stage, and it takes a click", async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 324 });
  await page.goto("/");
  await page.getByTestId("new-game").click();
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();

  const box = (await page.getByTestId("grid").boundingBox())!;
  const hit = await page.evaluate(
    (p) => document.elementFromPoint(p.x, p.y)?.tagName.toLowerCase() ?? "none",
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe("canvas");
});
