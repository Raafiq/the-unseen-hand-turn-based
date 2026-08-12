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

/**
 * Drives the live derived-stats strip: toggling the Lightfoot mastery trait (Move
 * +1, earned by mastering Thief) visibly moves the unit's Move stat. Proves that
 * mastery traits are no longer inert labels — they change the BUILT unit's derived
 * stats at battle-start — and that a loadout swap is free + reversible (AC-J4).
 * Deterministic (no RNG, no timers affecting state), so the before/after
 * screenshots double as a visual regression baseline.
 */
test("prep viewer: toggling the Lightfoot trait moves the derived Move stat", async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });

  await page.goto("/");

  const stats = page.getByTestId("prep-stats");
  await expect(stats).toBeVisible();
  await stats.scrollIntoViewIfNeeded();
  await expect(stats).toContainText("Move");

  // Lightfoot (Thief mastery, Move +1) is equipped by default → Move is boosted.
  const moveCell = page.locator('[data-stat="move"]');
  const moveWith = Number((await moveCell.innerText()).replace(/[^\d-]/g, ""));

  const lightfoot = page.locator('input[data-trait="lightfoot"]');
  await expect(lightfoot).toBeChecked();
  await page.waitForTimeout(INTRO_MS);
  await page.screenshot({ path: `${SHOTS}/07-prep-stats-trait-on.png`, fullPage: true });

  // Un-equip Lightfoot → the flat +1 Move is removed at the next build.
  await lightfoot.uncheck();
  await page.waitForTimeout(HOLD_MS);
  const moveWithout = Number((await moveCell.innerText()).replace(/[^\d-]/g, ""));
  expect(moveWithout).toBe(moveWith - 1);
  await page.screenshot({ path: `${SHOTS}/08-prep-stats-trait-off.png`, fullPage: true });

  // Cross-check the deterministic hook: the built unit's Move matches the display.
  const built = await page.evaluate(() => {
    const w = window as unknown as { tuhPrep: { getStats(): { move: number } } };
    return w.tuhPrep.getStats();
  });
  expect(built.move).toBe(moveWithout);

  // Reversible (AC-J4): re-equipping restores the boost exactly.
  await lightfoot.check();
  await page.waitForTimeout(HOLD_MS);
  await expect(moveCell).toHaveText(String(moveWith));
});

/**
 * The SUPPORT slot is live (ADR-0017) — proved in the shipped viewer, not only in the
 * sim tests. The demo Knight starts with Equip Heavy Armor, which is one of the
 * deliberately DEFERRED supports (equipment is not modeled), so the slot begins with a
 * visibly inert effect; switching to Magic Attack Up — learned by mastering the Wizard
 * tree — moves the derived MA cell.
 *
 * DISCRIMINATING: the assertion is the DIFFERENCE between two supports on the SAME unit,
 * not "MA is a number". Against the pre-ADR-0017 engine every support built an identical
 * unit, so this case fails there — which is the only reason it is worth running. It also
 * pins the honest half: the deferred support must NOT move the stat, so a future effect
 * authored without updating DEFERRED_SUPPORT_EFFECTS shows up here too.
 */
test("prep viewer: equipping Magic Attack Up moves the derived MA stat", async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await page.goto("/");

  const stats = page.getByTestId("prep-stats");
  await expect(stats).toBeVisible();
  await stats.scrollIntoViewIfNeeded();

  const maCell = page.locator('[data-stat="ma"]');
  const support = page.getByTestId("prep-support");

  // Equip Heavy Armor is equipped by default and is DEFERRED → the slot is inert.
  await expect(support).toHaveValue("battle-skill.equip-heavy-armor");
  const maInert = Number((await maCell.innerText()).replace(/[^\d-]/g, ""));

  // Clearing the slot entirely must not move MA either — that is what "inert" means.
  await support.selectOption("");
  await page.waitForTimeout(HOLD_MS);
  expect(Number((await maCell.innerText()).replace(/[^\d-]/g, ""))).toBe(maInert);

  // Magic Attack Up is LIVE: ma x1.33, floored.
  await support.selectOption("black-magic.magic-attack-up");
  await page.waitForTimeout(HOLD_MS);
  const maLive = Number((await maCell.innerText()).replace(/[^\d-]/g, ""));
  expect(maLive).toBe(Math.floor(maInert * 1.33));
  expect(maLive).toBeGreaterThan(maInert);
  await page.screenshot({ path: `${SHOTS}/09-prep-support-live.png`, fullPage: true });

  // The deterministic hook agrees with the display (no re-derivation in the strip).
  const built = await page.evaluate(() => {
    const w = window as unknown as { tuhPrep: { getStats(): { ma: number } } };
    return w.tuhPrep.getStats();
  });
  expect(built.ma).toBe(maLive);

  // Reversible + free (AC-J4), same as the trait swap above.
  await support.selectOption("battle-skill.equip-heavy-armor");
  await page.waitForTimeout(HOLD_MS);
  await expect(maCell).toHaveText(String(maInert));
});
