import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = "visual-artifacts/screenshots";

// How long each state lingers on screen, purely to pace the recorded video so
// it is comfortable to watch. Does not affect the sim, the state, or the
// screenshots — only the video's playback rhythm.
const HOLD_MS = 1100;
const INTRO_MS = 1500;
const OUTRO_MS = 2000;

/**
 * Drives the deterministic engine viewer in WATCH MODE and captures a screenshot
 * proof-sheet plus a video of the run.
 *
 * Watch mode (the Step affordance) resolves the ACTIVE unit through the balance
 * probe regardless of team (docs/10 §7), which is exactly why it survived the
 * ADR-0015 retirement of `stepDemo`: it keeps a fully scripted, deterministic
 * path so this baseline stays stable frame-for-frame. The frames themselves DID
 * change with that ADR — the viewer now routes through `applyCommand`, so the
 * pixel baseline is intentionally new.
 *
 * The run is driven by PHASE rather than a hard-coded turn count: the battle is
 * decided the moment a team is wiped, and pinning "exactly N turns" would make
 * this spec fail on any legitimate balance change rather than on a viewer bug.
 */
const phase = (page: Page): Promise<string> => page.evaluate(() => window.tuh.phase());
const turns = (page: Page): Promise<number> => page.evaluate(() => window.tuh.turn());
const totalHp = (page: Page): Promise<number> =>
  page.evaluate(() => window.tuh.getState().units.reduce((sum, u) => sum + u.hp, 0));

test("engine viewer: renders the grid and steps the CT clock deterministically", async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });

  await page.goto("/");

  const canvas = page.getByTestId("grid");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("timeline")).toContainText("Next up");
  await expect(page.getByTestId("status")).toContainText("Turns 0");
  await expect(page.getByTestId("preview")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-initial.png`, fullPage: true });
  await page.waitForTimeout(INTRO_MS); // let the opening frame settle

  const startHp = await totalHp(page);

  const MAX_TURNS = 24;
  const step = page.getByTestId("step");
  let taken = 0;
  for (let i = 1; i <= MAX_TURNS; i++) {
    if ((await phase(page)) === "ENDED") break;
    await step.click();
    taken = await turns(page);
    await page.waitForTimeout(HOLD_MS); // hold each turn long enough to read
    // The beats are chosen so each gallery CAPTION is true of its frame, measured
    // against this build's watch-mode run rather than assumed:
    //   i=5  Knight (5,1) / Archer (5,5) / Brawler (6,3) — everyone has closed,
    //        nobody has landed a blow yet. "Closing in" is literally the board.
    //   i=11 the Knight's strike lands: a −105 damage popup is ON SCREEN and the
    //        Brawler drops 120 → 15. The old i=10 was a WHIFF frame, so the
    //        caption's "with damage popups" was false of the image it labelled.
    if (i === 5) await page.screenshot({ path: `${SHOTS}/02-closing-in.png`, fullPage: true });
    if (i === 11) await page.screenshot({ path: `${SHOTS}/03-combat.png`, fullPage: true });
  }

  // Real turns were committed, and each Step committed exactly one command.
  expect(taken).toBeGreaterThan(8);
  await expect(page.getByTestId("status")).toContainText(`Turns ${taken}`);
  expect(await page.evaluate(() => window.tuh.commands().length)).toBe(taken);

  await page.screenshot({ path: `${SHOTS}/04-aftermath.png`, fullPage: true });
  await page.waitForTimeout(OUTRO_MS); // hold the final board before reset

  // Combat actually happened: total HP dropped from real damage.
  expect(await totalHp(page)).toBeLessThan(startHp);

  // Reset restores turn 0 (state is rebuilt from the seed).
  await page.getByTestId("reset").click();
  await page.waitForTimeout(HOLD_MS);
  await expect(page.getByTestId("status")).toContainText("Turns 0");
  expect(await page.evaluate(() => window.tuh.commands().length)).toBe(0);
});
