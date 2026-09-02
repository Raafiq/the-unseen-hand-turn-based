/**
 * THE STAT CARD IS AN OVERLAY, AND AN OVERLAY CAN BREAK THE BOARD UNDER IT.
 *
 * The card is DOM absolutely positioned on top of `<canvas id="grid">` — the FFT
 * placement — which means it sits between the player's pointer and live tiles. Two
 * properties keep that safe, and neither is visible to any other spec:
 *
 *   1. `pointer-events: none`, so a click meant for a tile reaches the canvas. Without
 *      it the board silently stops responding in one corner: no error, no red test,
 *      nothing on screen to see. The suite cannot see the screen, so this is asserted
 *      through the browser's OWN hit-test and then through a real click.
 *   2. the plate is OPAQUE, asserted in `contrast.spec.ts` where the measurement that
 *      depends on it lives.
 *
 * WHY THE ENGINE VIEWER. This is the one page with a pixel seam (`window.tuh.cursor()`
 * reports the tile the last pick resolved to), so the click can be observed end to end
 * rather than inferred from a repaint. The campaign page carries the same CSS; its half
 * of the claim is the hit-test assertion, which needs no seam.
 */

import { test, expect, type Page } from "@playwright/test";
import { pickTile } from "../src/render/iso.js";
import type { BattleState } from "../src/sim/index.js";

const CANVAS_W = 900;
const CANVAS_H = 440;

/**
 * Park the card over a point that resolves to a REAL TILE, and return that point.
 *
 * WHY THE CARD IS MOVED. Measured on this build: at the shipped corner the plate covers
 * only empty sky. The demo board is a diamond whose drawn extent is x 124–776, y 80–406
 * in canvas pixels, and its lower-LEFT quadrant is background — so a click-through test
 * at the shipped position would be aimed at sky and would pass whatever `pointer-events`
 * said. That is the vacuous-fixture shape, so the plate is moved to somewhere it can
 * actually swallow something.
 *
 * ONLY `left`/`top` ARE OVERRIDDEN. `pointer-events` still comes from the stylesheet,
 * which is the property under test — deleting it from the page turns this red.
 */
async function parkCardOverTheBoard(
  page: Page,
  avoid: { x: number; y: number } | null,
): Promise<{ tile: { x: number; y: number }; at: { x: number; y: number } }> {
  const canvasBox = (await page.getByTestId("grid").boundingBox())!;
  // THE LIVE STATE, not a freshly built demo. The viewer boots mid-battle and its units
  // have already moved, so a fresh `makeDemoBattle()` names the wrong occupants — the
  // first draft of this test clicked a tile the page said was (3,3) and the fixture said
  // was (1,1). `getState()` is plain data and survives the structured clone intact.
  const state = (await page.evaluate(() => window.tuh.getState())) as BattleState;
  // CSS pixels → backing-store pixels. The canvas is laid out at `width: 100%`, so the
  // two differ by however wide the window happens to be; `play.spec.ts`'s AC-V10 test
  // documents the same conversion in the other direction.
  const toBacking = CANVAS_W / canvasBox.width;

  // A unit's own tile, so the click lands on the most expensive thing a swallowed click
  // could cost. Found through the page's own `pickTile`, so "resolves to a tile" means
  // exactly what it means to a real click, occlusion and all.
  let found: { tile: { x: number; y: number }; at: { x: number; y: number } } | null = null;
  for (let by = 4; by < CANVAS_H && !found; by += 4) {
    for (let bx = 4; bx < CANVAS_W; bx += 4) {
      const tile = pickTile(state, bx, by, CANVAS_W, CANVAS_H);
      if (!tile) continue;
      if (!state.units.some((u) => u.pos.x === tile.x && u.pos.y === tile.y)) continue;
      // Never the tile the cursor is already on: the click would then be indetectable,
      // since "the cursor is here afterwards" was already true before it.
      if (avoid && tile.x === avoid.x && tile.y === avoid.y) continue;
      found = {
        tile,
        at: { x: canvasBox.x + bx / toBacking, y: canvasBox.y + by / toBacking },
      };
      break;
    }
  }
  expect(found, "no unit tile is reachable by pointer on the demo board").not.toBeNull();

  // Centre the plate on that point.
  const cardBox = (await page.locator("#unit-card .unit-card").boundingBox())!;
  await page.locator("#unit-card").evaluate((el, box) => {
    const host = el as HTMLElement;
    host.style.left = `${box.left}px`;
    host.style.top = `${box.top}px`;
    host.style.bottom = "auto";
    host.style.right = "auto";
  }, {
    left: found!.at.x - canvasBox.x - cardBox.width / 2,
    top: found!.at.y - canvasBox.y - cardBox.height / 2,
  });

  // It really is on top of the point now — otherwise the assertions below test nothing.
  const moved = (await page.locator("#unit-card .unit-card").boundingBox())!;
  expect(found!.at.x).toBeGreaterThan(moved.x);
  expect(found!.at.x).toBeLessThan(moved.x + moved.width);
  expect(found!.at.y).toBeGreaterThan(moved.y);
  expect(found!.at.y).toBeLessThan(moved.y + moved.height);
  return found!;
}

test("the stat card overlays the board and does not eat the clicks under it", async ({
  page,
}) => {
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();
  // SCROLL FIRST, and measure after. Both shipped boards sit below the fold at this
  // viewport, and a synthesised click at a point the page has not scrolled to is simply
  // not delivered — measured: the identical click resolves the tile after this line and
  // does nothing before it. `play.spec.ts`'s AC-V10 test does the same for the same reason.
  await page.getByTestId("grid").scrollIntoViewIfNeeded();
  // A known start: `reset` clears the tile cursor, so "the cursor moved" below is a fact
  // about this click rather than about whatever the page was doing when it loaded.
  await page.evaluate(() => window.tuh.reset());
  const card = page.locator("#unit-card .unit-card");
  await expect(card).toBeVisible();

  // IT IS ACTUALLY ON THE CANVAS. Without this the whole file passes on a card that
  // quietly fell back into the flow below the board, where nothing it does can matter.
  const canvasBox = (await page.getByTestId("grid").boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.y).toBeGreaterThanOrEqual(canvasBox.y);
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1);
  expect(cardBox.x).toBeGreaterThanOrEqual(canvasBox.x);

  const before = await page.evaluate(() => window.tuh.cursor());
  const { tile, at } = await parkCardOverTheBoard(page, before);

  // The browser's own hit-test, which is what routes a click. `elementFromPoint` returns
  // the CANVAS only because the card declines pointer events.
  const hit = await page.evaluate(
    (p) => document.elementFromPoint(p.x, p.y)?.tagName.toLowerCase() ?? "none",
    at,
  );
  expect(hit).toBe("canvas");

  // And end to end: a real click at that point reaches `pickTile` → `Session.onPick`.
  // MUTATION RUN (2026-09-01): deleted `pointer-events: none` from `#unit-card` in
  // viewer.html — red here, and red on the campaign half below with index.html mutated
  // the same way. The tag it returns is whatever DESCENDANT of the plate is topmost at
  // that point, not the host: measured "i" (the HP bar's fill) on the viewer and "p"
  // (the HP row) on the campaign board. Assert `"canvas"`, never a specific wrong tag.
  //
  // A BEFORE/AFTER, because `reset` parks the cursor on the active unit rather than
  // clearing it: `cursor() === tile` alone could have been true before the click, so the
  // target tile is chosen to differ from where the cursor already sits.
  expect(before).not.toEqual(tile);
  await page.mouse.click(at.x, at.y);
  expect(await page.evaluate(() => window.tuh.cursor())).toEqual(tile);
});

test("the campaign board carries the same overlay, and it declines pointer events", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("new-game").click();
  // The prologue stands between the title and the briefing.
  const scene = page.getByTestId("screen-scene");
  if (await scene.isVisible()) await page.getByTestId("scene-continue").click();
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await page.getByTestId("grid").scrollIntoViewIfNeeded();

  const card = page.locator("#unit-card .unit-card");
  await expect(card).toBeVisible();
  const canvasBox = (await page.getByTestId("grid").boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.y).toBeGreaterThanOrEqual(canvasBox.y);
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1);

  // Sampled at the card's own centre, so the point is inside the plate by construction.
  const hit = await page.evaluate(
    (p) => document.elementFromPoint(p.x, p.y)?.tagName.toLowerCase() ?? "none",
    { x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 },
  );
  expect(hit).toBe("canvas");
});
