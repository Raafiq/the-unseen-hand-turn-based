import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = "visual-artifacts/screenshots";

// Purely paces the recorded video; does not affect the sim, the record, or the
// screenshots — the prep panel is deterministic (fixed learn/equip sequence).
const HOLD_MS = 1200;
const INTRO_MS = 1200;

/**
 * Drives the prep / loadout viewer and captures the customization "aha": a Knight
 * whose castable command list GROWS when Black Magic is equipped as the Secondary
 * command. Deterministic (no RNG, no timers affecting state), so the before/after
 * screenshots double as a visual regression baseline.
 */
test("prep viewer: equipping a Secondary command grows the castable command list", async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });

  await page.goto("/");

  const prep = page.getByTestId("prep");
  await expect(prep).toBeVisible();
  await prep.scrollIntoViewIfNeeded();

  // The five chassis slots + traits render.
  for (const label of ["Primary", "Secondary", "Reaction", "Support", "Movement", "Traits"]) {
    await expect(prep).toContainText(label);
  }

  // Initial command list: the Primary command (Attack + Battle Skill actions),
  // and NO Black Magic yet (the Secondary starts empty).
  const commands = page.getByTestId("prep-commands");
  await expect(commands).toContainText("Attack");
  await expect(commands).toContainText("Weapon Break");
  await expect(commands).not.toContainText("Fire");

  // The Secondary select offers Black Magic among the learned jobs.
  const secondary = page.getByTestId("prep-secondary");
  await expect(secondary).toContainText("Black Magic");

  await page.waitForTimeout(INTRO_MS);
  await page.screenshot({ path: `${SHOTS}/05-prep-chassis.png`, fullPage: true });

  // Equip Black Magic as the Secondary command (drive the real <select>).
  await secondary.selectOption("wizard");
  await page.waitForTimeout(HOLD_MS);

  // The flagship moment: the Knight can now cast Fire (and its whole line).
  await expect(commands).toContainText("Fire");
  await expect(commands).toContainText("Attack"); // primary commands are retained
  await expect(commands).toContainText("Weapon Break");
  await page.screenshot({ path: `${SHOTS}/06-prep-black-magic.png`, fullPage: true });

  // Cross-check against the deterministic hook: the command projection includes
  // the black-magic actions once the secondary is equipped.
  const ids = await page.evaluate(() => {
    const w = window as unknown as { tuhPrep: { getCommands(): string[] } };
    return w.tuhPrep.getCommands();
  });
  expect(ids).toContain("black-magic.fire");
  expect(ids).toContain("basic.attack");

  // Free + reversible (AC-J4): clearing the Secondary removes the added commands.
  await secondary.selectOption("");
  await page.waitForTimeout(HOLD_MS);
  await expect(commands).not.toContainText("Fire");
});
