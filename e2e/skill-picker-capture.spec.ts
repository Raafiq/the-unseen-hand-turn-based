import { test, expect, type Page } from "@playwright/test";
import { startNewGame, dismissScene } from "./helpers.js";

/**
 * PROOF FRAMES for the skill picker (`intent/skill-picker.md`), NOT an assertion
 * suite — `skill-picker.spec.ts` is that. This file exists because `src/render/
 * CLAUDE.md` requires opening the frames after any change to `iso.ts`: it captures
 * the seven named states at both reference viewports into `coverage/frames/
 * skill-picker/` for the report to open and compare against the approved
 * `*-pass1-*` mockups.
 *
 * Same real-content fixtures `skill-picker.spec.ts` uses — see that file's header
 * for why (`grantTestAp` + `prep().learn()`, not a hard-coded skill list).
 *
 * REVIEW FIX (pass3): every `pass2` frame showed "THE TOLL ROAD" entry plaque
 * (`hud.ts`'s timed banner, owner decision 9) still fading over the board — a
 * screenshot taken mid-animation, not a real state. Every capture below now
 * waits for `[data-testid="entry-plaque"]` to leave the DOM first — an explicit
 * wait on its own hidden state, never a fixed sleep.
 */

const VIEWPORTS: { name: string; size: { width: number; height: number } }[] = [
  { name: "832x328", size: { width: 832, height: 328 } },
  { name: "832x384", size: { width: 832, height: 384 } },
];
const DIR = "coverage/frames/skill-picker";

async function stepToBriar(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.tuhGame;
    for (let i = 0; i < 300; i += 1) {
      const active = g.state()?.units.find((u) => u.ct >= 100 && u.hp > 0);
      const ph = g.phase();
      if (
        active?.id === "blue-briar" &&
        (ph === "PLAYER_IDLE" || ph === "MOVE_STAGED" || ph === "TARGET_STAGED")
      ) {
        return;
      }
      if (ph === null || ph === "ENDED") return;
      g.step();
    }
  });
}

async function reachBriarWithExtraSkills(page: Page): Promise<void> {
  await startNewGame(page);
  await dismissScene(page);
  await page.evaluate(() => {
    const g = window.tuhGame;
    g.grantTestAp("pc-briar", 1000);
    const p = g.prep()!;
    p.select("pc-briar");
    p.learn("archer", "leg-shot");
    p.learn("archer", "piercing-shot");
  });
  await page.getByTestId("deploy").click();
  await stepToBriar(page);
  await expect(page.getByTestId("entry-plaque")).toBeHidden();
}

/** Real content for the UNAVAILABLE-CHIP frame — same fixture `skill-picker.spec.ts`'s
 * own "an unavailable chip among 2+" test uses (see that file's header for why). */
async function reachOttolineWithSplitSkills(page: Page): Promise<void> {
  await startNewGame(page);
  await dismissScene(page);
  await page.evaluate(() => {
    const g = window.tuhGame;
    g.grantTestAp("pc-ottoline", 1000);
    const p = g.prep()!;
    p.select("pc-ottoline");
    p.learn("priest", "cura");
    p.learn("priest", "holy");
  });
  await page.getByTestId("deploy").click();
  await page.evaluate(() => {
    const g = window.tuhGame;
    for (let i = 0; i < 300; i += 1) {
      const ph = g.phase();
      if (ph === null || ph === "ENDED") return;
      if (ph === "PLAYER_IDLE" && g.skillOptions().length >= 2) return;
      g.step();
    }
  });
  await expect(page.getByTestId("entry-plaque")).toBeHidden();
}

for (const vp of VIEWPORTS) {
  test(`skill-picker frames — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachBriarWithExtraSkills(page);

    await page.evaluate(() => window.tuhGame.settleMotion());
    await page.getByTestId("actions").click();
    await page.screenshot({ path: `${DIR}/chips-open-pass3-${vp.name}.png` });

    await page.locator('[data-testid="skill-chip"]').nth(1).click(); // aim.leg-shot
    await page.screenshot({ path: `${DIR}/reach-picked-pass3-${vp.name}.png` });
    // SAME MOMENT, a second name: the target plate naming the picked skill
    // ("Leg Shot · Reach 5 · Pick a target") is the thing item 3 fixed — kept as
    // its own named frame so the report opens it under the name that names the
    // fix, not only the board's reach paint.
    await page.screenshot({ path: `${DIR}/pick-named-in-plate-pass3-${vp.name}.png` });

    // Cancel back to root, stage a move, re-open Skill: reach redraws from there.
    await page.getByTestId("cancel").click();
    await page.getByTestId("cancel").click();
    await page.evaluate(() => {
      const g = window.tuhGame;
      const s = g.state()!;
      // EMPTY tiles only — `clickTile` here is `hud.pick`, which opens the unit
      // inspect drawer for a tap on a non-target ally (AC-V37), not a plain refusal.
      const occupied = new Set(s.units.filter((u) => u.hp > 0).map((u) => `${u.pos.x},${u.pos.y}`));
      for (let y = 0; y < s.grid.height; y += 1) {
        for (let x = 0; x < s.grid.width; x += 1) {
          if (occupied.has(`${x},${y}`)) continue;
          g.clickTile(x, y);
          if (g.phase() === "MOVE_STAGED") return;
        }
      }
    });
    await page.getByTestId("actions").click();
    await page.locator('[data-testid="skill-chip"]').nth(1).click();
    await page.screenshot({ path: `${DIR}/reach-staged-pass3-${vp.name}.png` });

    await page.getByTestId("cancel").click(); // back to sheet
    await page.getByTestId("cancel").click(); // back to root
    await page.getByTestId("cancel").click(); // unstage the move

    await page.getByTestId("attack").click();
    await page.screenshot({ path: `${DIR}/attack-no-target-pass3-${vp.name}.png` });

    await page.getByTestId("cancel").click();
    await page.screenshot({ path: `${DIR}/after-cancel-pass3-${vp.name}.png` });
  });

  test(`skill-picker frames — unavailable chip — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachOttolineWithSplitSkills(page);
    await page.evaluate(() => window.tuhGame.settleMotion());
    await page.getByTestId("actions").click();
    await page.screenshot({ path: `${DIR}/unavailable-chip-pass3-${vp.name}.png` });
  });
}
