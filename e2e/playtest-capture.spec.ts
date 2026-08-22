import { test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = "visual-artifacts/playtest";

/** What a player would see, captured for a human to judge. */
test("PLAYTEST: capture every screen a player passes through", async ({ page }) => {
  test.setTimeout(180_000);
  await mkdir(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  const shot = async (name: string) => {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    console.log(`captured ${name}`);
  };

  await page.goto("/game.html");
  await shot("01-title");

  await page.getByTestId("new-game").click();
  await shot("02-briefing-battle-1");

  await page.getByTestId("help-open").click();
  await shot("03-help-panel");
  await page.getByTestId("help-close").click();

  await page.getByTestId("deploy").click();
  await shot("04-battle-1-start");

  // One enemy turn, so the board shows a fight in progress rather than the opening.
  await page.getByTestId("step").click();
  await shot("05-battle-1-midfight");

  await page.evaluate(() => window.tuhGame.autoplay());
  await shot("06-battle-1-over");
  await page.getByTestId("conclude").click();
  await shot("07-after-battle");

  // Walk to the last briefing so the prep panel is shown fully stocked.
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("next").click();
    await page.getByTestId("deploy").click();
    await page.evaluate(() => window.tuhGame.autoplay());
    await page.getByTestId("conclude").click();
  }
  await page.getByTestId("next").click();
  await shot("08-briefing-battle-5-full-prep");

  await page.getByTestId("deploy").click();
  await page.evaluate(() => window.tuhGame.autoplay());
  await page.getByTestId("conclude").click();
  await shot("09-ending");
});
