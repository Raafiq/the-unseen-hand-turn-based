import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = "visual-artifacts/screenshots";

// How long each state lingers on screen, purely to pace the recorded video so
// it is comfortable to watch. Does not affect the sim, the state, or the
// screenshots — only the video's playback rhythm.
const HOLD_MS = 1100;
const INTRO_MS = 1500;
const OUTRO_MS = 2000;

/**
 * Drives the deterministic engine viewer and captures a screenshot proof-sheet
 * plus a video of the run. Because the sim and the demo step policy are fully
 * deterministic, these frames are identical every run — the screenshots double
 * as a visual regression baseline.
 */
test("engine viewer: renders the grid and steps the CT clock deterministically", async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });

  await page.goto("/");

  const canvas = page.getByTestId("grid");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("timeline")).toContainText("Next up");
  await expect(page.getByTestId("status")).toContainText("Turns 0");
  await page.screenshot({ path: `${SHOTS}/01-initial.png`, fullPage: true });
  await page.waitForTimeout(INTRO_MS); // let the opening frame settle

  const totalHp = (): Promise<number> =>
    page.evaluate(() => {
      const w = window as unknown as { tuh: { getState(): { units: { hp: number }[] } } };
      return w.tuh.getState().units.reduce((sum, u) => sum + u.hp, 0);
    });
  const startHp = await totalHp();

  const TURNS = 16;
  const step = page.getByTestId("step");
  for (let i = 1; i <= TURNS; i++) {
    await step.click();
    await page.waitForTimeout(HOLD_MS); // hold each turn long enough to read
    if (i === 5) await page.screenshot({ path: `${SHOTS}/02-closing-in.png`, fullPage: true });
    if (i === 10) await page.screenshot({ path: `${SHOTS}/03-combat.png`, fullPage: true });
  }

  await expect(page.getByTestId("status")).toContainText(`Turns ${TURNS}`);
  await page.screenshot({ path: `${SHOTS}/04-aftermath.png`, fullPage: true });
  await page.waitForTimeout(OUTRO_MS); // hold the final board before reset

  // Combat actually happened: total HP dropped from real damage.
  expect(await totalHp()).toBeLessThan(startHp);

  // Reset restores turn 0 (state is rebuilt from the seed).
  await page.getByTestId("reset").click();
  await page.waitForTimeout(HOLD_MS);
  await expect(page.getByTestId("status")).toContainText("Turns 0");
});
