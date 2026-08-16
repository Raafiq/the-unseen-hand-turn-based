import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

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
  // THE TWO GALLERY BEATS ARE CHOSEN BY STATE, NOT BY TURN INDEX. They used to be
  // hard-coded (i=5 "closing in", i=11 "combat") against one measured run, and both
  // rotted: the battle got shorter, i=11 stopped happening, and `03-combat.png` was
  // simply never written — while `build-gallery.mjs` kept a caption for it promising
  // "real hit rolls and damage, with damage popups". A caption for a frame that does
  // not exist is the purest form of the evidence-principle failure in CLAUDE.md.
  //
  // Keyed on total HP instead, each frame is true of its image BY CONSTRUCTION:
  //   02-closing-in — rewritten every turn while NO damage has landed yet, so the
  //                   file left on disk is the last pre-combat board. Maneuvering.
  //   03-combat     — written on the FIRST turn total HP drops, so a damage popup is
  //                   necessarily on screen. Never a whiff frame.
  let combatShot = false;
  for (let i = 1; i <= MAX_TURNS; i++) {
    if ((await phase(page)) === "ENDED") break;
    await step.click();
    taken = await turns(page);
    await page.waitForTimeout(HOLD_MS); // hold each turn long enough to read
    const hpNow = await totalHp(page);
    if (hpNow === startHp) {
      await page.screenshot({ path: `${SHOTS}/02-closing-in.png`, fullPage: true });
    } else if (!combatShot) {
      combatShot = true;
      await page.screenshot({ path: `${SHOTS}/03-combat.png`, fullPage: true });
    }
  }
  // Both gallery frames were actually produced — otherwise a caption ships over a
  // missing image again, silently, exactly as it did before.
  expect(combatShot, "no turn dealt damage, so 03-combat.png was never captured").toBe(true);
  expect(existsSync(`${SHOTS}/02-closing-in.png`)).toBe(true);

  // The battle reached a DECISIVE end under its own rules — the claim that matters,
  // and one that survives content re-tuning. The turn COUNT is deliberately not
  // pinned: it is a function of demo damage numbers, and the old `> 8` floor was an
  // arbitrary number that broke the moment the roster got a skill. The floor below
  // only guards against the loop failing to run at all.
  expect(await phase(page)).toBe("ENDED");
  expect(taken).toBeGreaterThanOrEqual(2);
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
