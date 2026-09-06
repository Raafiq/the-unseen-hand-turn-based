import { test, expect, type Page } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { closeDrawer, dismissScene, settleMotion } from "./helpers.js";

/**
 * FRAMES OF THE STAGE, for a human to open (ADR-0037, docs/10 §8).
 *
 * THE SUITE CANNOT SEE THE SCREEN. `stage.spec.ts` measures boxes, command counts and
 * computed styles; not one of its assertions can tell a legible board from an
 * unreadable one, a clipped control from a laid-out one, or a HUD that reads as one
 * game from one that reads as two. These frames are the other half, and looking at
 * them is the job — three painted-ground defects and a duplicated caption were found
 * this way with the whole suite green.
 *
 * WHAT IS HERE: the battle screen at rest at all FIVE supported viewports, plus five
 * interaction states at 851x324 — the owner's own phone, the only viewport that
 * reaches the 900 clamp. Each state's precondition is ASSERTED in the same block that
 * captures it, so a filename can never outlive the state it names.
 *
 * The directory is cleared at the start, so a missing frame means the run died and a
 * stale one can never read as current.
 */

const SHOTS = "docs/visual/stage";

const VIEWPORTS = [
  { name: "640x300", width: 640, height: 300 },
  { name: "800x360", width: 800, height: 360 },
  { name: "851x324", width: 851, height: 324 },
  { name: "900x390", width: 900, height: 390 },
  { name: "1000x780", width: 1000, height: 780 },
] as const;

const OWNERS_PHONE = { width: 851, height: 324 };

async function reachBattle(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("new-game").click();
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await settleMotion(page);
}

/** Step until the player holds the turn, whichever phase the board opens on. */
async function toPlayerTurn(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    for (let i = 0; i < 40; i += 1) {
      const ph = window.tuhGame.phase();
      if (ph === "PLAYER_IDLE" || ph === "MOVE_STAGED" || ph === "TARGET_STAGED") return true;
      if (ph === null || ph === "ENDED") return false;
      window.tuhGame.step();
    }
    return false;
  });
  expect(ok, "the board never reached a player turn").toBe(true);
}

/** Stage a legal target, searching moves as well — see `stage.spec.ts`'s copy. */
async function stageTarget(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const phase = (): string | null => window.tuhGame.phase();
    const click = (x: number, y: number): void => window.tuhGame.clickTile(x, y);
    const state = window.tuhGame.state();
    if (!state) return false;
    const units = state.units.filter((u) => u.hp > 0).map((u) => ({ x: u.pos.x, y: u.pos.y }));
    const tryUnits = (restage: { x: number; y: number } | null): boolean => {
      for (const u of units) {
        click(u.x, u.y);
        const ph = phase();
        if (ph === "TARGET_STAGED") return true;
        if (restage && ph === "PLAYER_IDLE") click(restage.x, restage.y);
      }
      return false;
    };
    if (tryUnits(null)) return true;
    if (phase() === "MOVE_STAGED") window.tuhGame.cancel();
    for (let y = 0; y < state.grid.height; y += 1) {
      for (let x = 0; x < state.grid.width; x += 1) {
        if (phase() !== "PLAYER_IDLE") return phase() === "TARGET_STAGED";
        click(x, y);
        if (phase() !== "MOVE_STAGED") continue;
        if (tryUnits({ x, y })) return true;
        window.tuhGame.cancel();
      }
    }
    return false;
  });
}

test.beforeAll(async () => {
  await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });
});

test("stage frames: the battle screen at rest, at every supported viewport", async ({ page }) => {
  for (const v of VIEWPORTS) {
    await page.setViewportSize({ width: v.width, height: v.height });
    await reachBattle(page);
    // The frame's caption is "at rest", so the state is asserted rather than assumed.
    await expect(page.getByTestId("preview-sheet")).toBeHidden();
    await expect(page.getByTestId("menu-drawer")).toBeHidden();
    await page.screenshot({ path: `${SHOTS}/rest-${v.name}.png` });
  }
});

test("stage frames: the five interaction states, on the owner's phone", async ({ page }) => {
  await page.setViewportSize(OWNERS_PHONE);
  await reachBattle(page);
  await toPlayerTurn(page);

  // 1. A unit selected — a staged move, the second of AC-V34's "at rest" states.
  const moved = await page.evaluate(() => {
    const state = window.tuhGame.state();
    if (!state) return false;
    for (let y = 0; y < state.grid.height; y += 1) {
      for (let x = 0; x < state.grid.width; x += 1) {
        if (window.tuhGame.phase() !== "PLAYER_IDLE") break;
        window.tuhGame.clickTile(x, y);
        if (window.tuhGame.phase() === "MOVE_STAGED") return true;
      }
    }
    return false;
  });
  expect(moved, "no legal move to stage").toBe(true);
  await settleMotion(page);
  await page.screenshot({ path: `${SHOTS}/851x324-unit-selected.png` });

  // 2. A target staged — the preview sheet, with Confirm.
  expect(await stageTarget(page), "no legal target to stage").toBe(true);
  await expect(page.getByTestId("preview-sheet")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/851x324-target-staged.png` });
  await page.getByTestId("cancel").click();

  // 3. The unit drawer — ADR-0033's full stat set, one tap from the tab.
  await page.getByTestId("actor-tab").click();
  await expect(page.getByTestId("unit-drawer")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/851x324-unit-drawer.png` });
  // Closed through the drawer's own ✕: a LEFT drawer covers the actor tab it opened
  // from, so the tab is not the way back out. Found by a click that could not land.
  await closeDrawer(page);

  // 4. The Actions sheet — every learned ability with its range, price in the header.
  await page.getByTestId("actions").click();
  await expect(page.getByTestId("actions-sheet")).toBeVisible();
  await expect(page.locator('[data-testid="ability-list"] li').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/851x324-actions-sheet.png` });
  await closeDrawer(page);

  // 5. The enemy's turn, with the phase-aware button carrying it.
  await page.evaluate(() => {
    for (let i = 0; i < 40 && window.tuhGame.phase() !== "AI_TURN"; i += 1) {
      window.tuhGame.endTurn();
      if (window.tuhGame.phase() === "ENDED") break;
    }
  });
  expect(await page.evaluate(() => window.tuhGame.phase())).toBe("AI_TURN");
  await expect(page.getByTestId("end-turn")).toContainText("Enemy turn");
  await settleMotion(page);
  await page.screenshot({ path: `${SHOTS}/851x324-ai-turn.png` });

  // 6. The menu drawer and the settings readout — the instrument ADR-0037 asked for.
  await page.getByTestId("hud-menu").click();
  await expect(page.getByTestId("menu-drawer")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/851x324-menu-drawer.png` });
  await closeDrawer(page);
  await page.getByTestId("hud-settings").click();
  await expect(page.getByTestId("settings-readout")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/851x324-settings.png` });
});
