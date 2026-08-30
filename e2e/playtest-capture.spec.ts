import { test, expect } from "@playwright/test";
import { prepEveryMember, dismissScene } from "./helpers.js";
import { mkdir } from "node:fs/promises";

const SHOTS = "visual-artifacts/playtest";

/** What a player would see, captured for a human to judge. */
test("PLAYTEST: capture every screen a player passes through", async ({ page }) => {
  test.setTimeout(180_000);
  await mkdir(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  /**
   * Capture one frame.
   *
   * THE FILENAME IS A CAPTION, AND A CAPTION ASSERTS WHAT THE FRAME SHOWS. Tying it to
   * an asserted `data-testid` is what stops a name outliving the state it named: this
   * spec shipped a `09-ending.png` showing "Battle lost" for as long as ADR-0027 had
   * been making an unprepped party lose the finale, and nothing went red. A reader
   * trusts the caption without opening the file, which is exactly why it has to be
   * checkable.
   */
  const shot = async (name: string, expectVisible: string) => {
    await expect(page.getByTestId(expectVisible)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    console.log(`captured ${name}`);
  };

  /**
   * Capture the BOARD alone — the canvas element, not the page.
   *
   * Same caption rule as `shot`: the battle screen must actually be up, or the frame is
   * of whatever was on screen instead. Cropped to the canvas because these frames exist
   * to judge the painted ground, and a full page puts four fifths of its pixels into
   * panels that are identical in every one of them.
   */
  const board = async (name: string) => {
    await expect(page.getByTestId("screen-battle")).toBeVisible();
    await page.locator("canvas").first().screenshot({ path: `${SHOTS}/${name}.png` });
    console.log(`captured ${name}`);
  };

  await page.goto("/");
  await shot("01-title", "screen-title");

  await page.getByTestId("new-game").click();

  // The prologue is a screen a player passes through, so it is a frame. Its caption is
  // checkable the same way every other one is: `02a` must show the scene mid-read (the
  // More control still on screen), `02b` must show it finished (More gone). Without the
  // second assertion a half-revealed beat would sit under a caption saying "read".
  await expect(page.getByTestId("screen-scene")).toBeVisible();
  await expect(page.getByTestId("scene-story-more")).toBeVisible();
  await shot("02a-prologue-first-line", "screen-scene");
  await page.getByTestId("scene-story-all").click();
  await expect(page.getByTestId("scene-story-more")).toBeHidden();
  await shot("02b-prologue-read", "screen-scene");

  await dismissScene(page);
  await shot("02c-briefing-battle-1", "screen-briefing");

  await page.getByTestId("help-open").click();
  await shot("03-help-panel", "help");
  await page.getByTestId("help-close").click();

  await page.getByTestId("deploy").click();
  await shot("04-battle-1-start", "screen-battle");
  await board("map-battle-1");

  // One enemy turn, so the board shows a fight in progress rather than the opening.
  await page.getByTestId("step").click();
  await shot("05-battle-1-midfight", "screen-battle");

  await page.evaluate(() => window.tuhGame.autoplay());
  await shot("06-battle-1-over", "screen-battle");
  await page.getByTestId("conclude").click();
  await shot("07-after-battle", "screen-after");

  // Walk to the last briefing so the prep panel is shown fully stocked, capturing each
  // battle's BOARD on the way. Every map is painted by hand (ADR-0030) and nothing in the
  // suite can see a canvas, so these frames are the only way a human judges whether a map
  // reads as the place its name claims — a ford, a ruin, a broken span, a camp.
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("next").click();
    await dismissScene(page);
    await page.getByTestId("deploy").click();
    await board(`map-battle-${i + 2}`);
    await page.evaluate(() => window.tuhGame.autoplay());
    await page.getByTestId("conclude").click();
  }
  await page.getByTestId("next").click();
  await dismissScene(page);
  await shot("08-briefing-battle-5-full-prep", "screen-briefing");

  // ADR-0027: an unprepped party LOSES the finale, so without this the walkthrough ends
  // on the after-battle screen and the last frame is a defeat under a caption saying
  // "ending". The set claims to show every screen a player passes through; the ending is
  // one of them, and it is where the copy-log control lives.
  await prepEveryMember(page);
  await page.getByTestId("deploy").click();
  await board("map-battle-5");
  await page.evaluate(() => window.tuhGame.autoplay());
  await page.getByTestId("conclude").click();
  // The epilogue stands in front of the ending (AC-V17).
  await shot("09-epilogue", "screen-scene");
  await dismissScene(page);
  await shot("10-ending", "screen-completed");
});
