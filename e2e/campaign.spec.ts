import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = "visual-artifacts/screenshots";

/**
 * The game shell in a real browser (docs/11 M0 item 1, AC-M1/AC-M2/AC-M3).
 *
 * `campaign-shell.test.ts` already drives the same object headlessly. What only a
 * browser can prove is the half that lives OUTSIDE that object: that the page mounts,
 * that the screens actually swap, and — the one that matters — that the save really
 * lands in `localStorage` and is still there after a full RELOAD. A memory-backed slot
 * passes every headless persistence test whether or not the browser wiring works.
 *
 * The battle is driven through `autoplay()` (the shipped watch-mode seam: the balance
 * probe on both seats, on an explicit call, no timers), so the run is deterministic and
 * this spec cannot flake on a slow machine.
 */
const screen = (page: Page): Promise<string> => page.evaluate(() => window.tuhGame.screen());
const stored = (page: Page): Promise<string | null> =>
  page.evaluate(() => window.tuhGame.storedSave());

async function playCurrentBattle(page: Page): Promise<void> {
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await page.evaluate(() => window.tuhGame.autoplay());
  await page.getByTestId("conclude").click();
}

test("campaign shell: title → battle → saved progress survives a reload", async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await page.goto("/game.html");

  // A fresh browser: no save, so Continue is genuinely unavailable rather than a
  // button that quietly does nothing.
  await expect(page.getByTestId("screen-title")).toBeVisible();
  await expect(page.getByTestId("continue")).toBeDisabled();
  expect(await stored(page)).toBeNull();
  await page.screenshot({ path: `${SHOTS}/20-title.png`, fullPage: true });

  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
  await expect(page.getByTestId("brief-step")).toContainText("Battle 1 of 5");
  await expect(page.getByTestId("brief-party")).toContainText("Vance");
  await page.screenshot({ path: `${SHOTS}/21-briefing.png`, fullPage: true });

  // New Game writes the slot immediately — a player who closes the tab on the
  // briefing screen has still started a run.
  expect(await stored(page)).not.toBeNull();

  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await expect(page.getByTestId("timeline")).toContainText("Next up");
  await expect(page.getByTestId("preview")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/22-battle.png`, fullPage: true });

  await page.evaluate(() => window.tuhGame.autoplay());
  await expect(page.getByTestId("conclude")).toBeVisible();
  await page.getByTestId("conclude").click();
  await expect(page.getByTestId("screen-after")).toBeVisible();
  await expect(page.getByTestId("after-title")).toHaveText("Battle won");
  await page.screenshot({ path: `${SHOTS}/23-after-battle.png`, fullPage: true });

  const afterOne = await stored(page);
  expect(afterOne).toContain('"battleIndex":1');

  // THE RELOAD IS THE POINT. Everything above passes against an in-memory slot; only a
  // real round trip through `localStorage` survives the page being thrown away.
  await page.reload();
  await expect(page.getByTestId("screen-title")).toBeVisible();
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page.getByTestId("title-slot")).toContainText("battle 2 of 5");
  expect(await stored(page)).toBe(afterOne);

  await page.getByTestId("continue").click();
  await expect(page.getByTestId("brief-step")).toContainText("Battle 2 of 5");
  expect(await screen(page)).toBe("BRIEFING");
});

test("campaign shell: the five-battle run reaches its ending in the browser", async ({ page }) => {
  await page.goto("/game.html");
  await page.getByTestId("new-game").click();

  for (let i = 0; i < 5; i++) {
    await expect(page.getByTestId("brief-step")).toContainText(`Battle ${i + 1} of 5`);
    await playCurrentBattle(page);
    if (i < 4) {
      await expect(page.getByTestId("screen-after")).toBeVisible();
      await page.getByTestId("next").click();
    }
  }

  await expect(page.getByTestId("screen-completed")).toBeVisible();
  await expect(page.getByTestId("done-note")).toContainText("5 battles won");
  expect(await screen(page)).toBe("COMPLETED");
  expect(await stored(page)).toContain('"status":"completed"');
  await page.screenshot({ path: `${SHOTS}/24-completed.png`, fullPage: true });
});

test("campaign shell: an unreadable save is a message, and New Game still works", async ({ page }) => {
  // A player whose save is corrupt (a half-written blob, a build downgrade) must not
  // meet a blank page. Seed the slot with garbage BEFORE the module loads.
  await page.addInitScript(() => {
    localStorage.setItem("tuh.campaign.v1", "{ not a save");
  });
  await page.goto("/game.html");

  await expect(page.getByTestId("screen-title")).toBeVisible();
  await expect(page.getByTestId("title-slot")).toContainText("could not be read");
  await expect(page.getByTestId("continue")).toBeDisabled();

  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
});
