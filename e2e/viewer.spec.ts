import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = "visual-artifacts/screenshots";

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

  const step = page.getByTestId("step");
  for (let i = 1; i <= 8; i++) {
    await step.click();
    if (i === 3) await page.screenshot({ path: `${SHOTS}/02-after-3-turns.png`, fullPage: true });
    if (i === 6) await page.screenshot({ path: `${SHOTS}/03-after-6-turns.png`, fullPage: true });
  }

  await expect(page.getByTestId("status")).toContainText("Turns 8");
  await page.screenshot({ path: `${SHOTS}/04-after-8-turns.png`, fullPage: true });

  // Reset restores turn 0 (state is rebuilt from the seed).
  await page.getByTestId("reset").click();
  await expect(page.getByTestId("status")).toContainText("Turns 0");
});
