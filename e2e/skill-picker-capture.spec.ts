import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { startNewGame, dismissScene } from "./helpers.js";

/**
 * PROOF FRAMES for the skill picker (`intent/skill-picker.md`, "Owner correction 2", "Final refinement" and "Last two fixes"),
 * NOT an assertion suite — `skill-picker.spec.ts` is that. This file exists because
 * `src/render/CLAUDE.md` requires opening the frames after any change to a screen: it
 * captures the named states of the vertical menu at both reference viewports
 * into `coverage/frames/skill-picker/` as `<frame>-pass7-<viewport>.png`, plus the
 * measured numbers as `measure-pass7-<viewport>.json`.
 *
 * Same real-content fixtures `skill-picker.spec.ts` uses — see that file's header
 * for why (`grantTestAp` + `prep().learn()`, not a hard-coded skill list).
 *
 * REVIEW FIX (pass3, still true in pass7): every `pass2` frame showed "THE TOLL ROAD" entry plaque
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

/** Real content for the MUTED-ROW frame — same fixture `skill-picker.spec.ts`'s
 * own muted-row test uses (see that file's header for why). */
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

/**
 * NINE REAL SKILLS, no cloned rows: Ottoline's four priest actions plus five wizard
 * actions through a wizard Secondary (`prep().learn()` + `setSlot`, the same seams the
 * dossier's LEARN button and Secondary `<select>` call). Every row label is a real
 * shipped name, so no row can read as a duplicate and no test-only label is needed.
 */
async function reachOttolineWithNineSkills(page: Page): Promise<void> {
  await startNewGame(page);
  await dismissScene(page);
  await page.evaluate(() => {
    const g = window.tuhGame;
    g.grantTestAp("pc-ottoline", 5000);
    const p = g.prep()!;
    p.select("pc-ottoline");
    for (const n of ["cura", "holy", "retribution", "esuna", "protect", "raise"]) p.learn("priest", n);
    for (const n of ["fire", "fire-2", "bolt", "bolt-2", "ice"]) p.learn("wizard", n);
    p.setSlot("secondary", "wizard");
  });
  await page.getByTestId("deploy").click();
  await page.evaluate(() => {
    const g = window.tuhGame;
    for (let i = 0; i < 300; i += 1) {
      const ph = g.phase();
      if (ph === null || ph === "ENDED") return;
      if (ph === "PLAYER_IDLE" && g.skillOptions().length === 9) return;
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
    const commandsBefore = await page.evaluate(() => window.tuhGame.commandCount());

    await page.evaluate(() => window.tuhGame.settleMotion());
    await page.getByTestId("actions").click();
    await expect(page.getByTestId("skill-menu")).toBeVisible();
    await page.screenshot({ path: `${DIR}/menu-open-pass7-${vp.name}.png` });
    const measured = await page.evaluate(() => {
      const R = (e: Element) => e.getBoundingClientRect();
      const menu = document.querySelector<HTMLElement>('[data-testid="skill-menu"]')!;
      const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="skill-row"]')];
      const scroller = document.querySelector<HTMLElement>('[data-testid="skill-menu-rows"]')!;
      const skill = R(document.querySelector('[data-testid="actions"]')!);
      const rib = R(document.querySelector(".tuh-ribbon")!);
      const rail = R(document.querySelector(".tuh-rail")!);
      const stage = R(document.querySelector(".tuh-stage")!);
      const m = R(menu);
      return {
        rowHeights: rows.map((r) => R(r).height),
        menuWidth: m.width,
        menuHeight: m.height,
        menuLeft: m.left,
        menuRight: m.right,
        gapToRibbon: rib.top - m.bottom,
        menuCentreMinusSkillCentre: (m.left + m.right) / 2 - (skill.left + skill.right) / 2,
        boardLeft: stage.left,
        railLeft: rail.left,
        rowFontPx: rows.map((r) => parseFloat(getComputedStyle(r).fontSize)),
        rowTextFit: rows.map((r) => [r.clientWidth, r.scrollWidth]),
        scroll: [scroller.scrollHeight, scroller.clientHeight],
        menuHasReach: (menu.textContent ?? "").includes("Reach"),
      };
    });
    writeFileSync(`${DIR}/measure-pass7-${vp.name}.json`, JSON.stringify(measured, null, 1));

    // Tap row 2 once: HIGHLIGHT (pointer + plate move), nothing picked.
    await page.locator('[data-testid="skill-row"][data-ability="aim.leg-shot"]').click();
    await page.screenshot({ path: `${DIR}/highlight-row2-pass7-${vp.name}.png` });

    // Tap it again: PICK — menu gone, reach painted.
    await page.locator('[data-testid="skill-row"][data-ability="aim.leg-shot"]').click();
    await expect(page.getByTestId("skill-menu")).toBeHidden();
    await page.screenshot({ path: `${DIR}/after-pick-pass7-${vp.name}.png` });

    expect(await page.evaluate(() => window.tuhGame.commandCount())).toBe(commandsBefore);
  });

  test(`skill-picker frames — muted highlighted — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachOttolineWithSplitSkills(page);
    await page.evaluate(() => window.tuhGame.settleMotion());
    await page.getByTestId("actions").click();
    await page
      .locator('[data-testid="skill-row"][data-ability="white-magic.holy"]')
      .click({ force: true });
    await page.screenshot({ path: `${DIR}/muted-highlighted-pass7-${vp.name}.png` });
  });

  test(`skill-picker frames — 9 skills scroll — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachOttolineWithNineSkills(page);
    await page.evaluate(() => window.tuhGame.settleMotion());
    await page.getByTestId("actions").click();
    await expect(page.getByTestId("skill-menu")).toBeVisible();
    const rowsBox = page.getByTestId("skill-menu-rows");
    expect(await page.locator('[data-testid="skill-row"]').count()).toBe(9);

    const scrollTo = async (top: number | "end") => {
      await page.evaluate((t) => {
        const s = document.querySelector<HTMLElement>('[data-testid="skill-menu-rows"]')!;
        s.scrollTop = t === "end" ? s.scrollHeight : t;
      }, top);
      await expect
        .poll(() => rowsBox.evaluate((s: HTMLElement) => s.scrollTop % 46))
        .toBe(0);
    };
    await page.screenshot({ path: `${DIR}/menu-scroll-top-pass7-${vp.name}.png` });
    // KEYBOARD: Down x4 from row 1 (window follows one row per step past row 3).
    for (let k = 0; k < 4; k += 1) await page.keyboard.press("ArrowDown");
    await page.screenshot({ path: `${DIR}/keyboard-down-4-pass7-${vp.name}.png` });
    for (let k = 0; k < 4; k += 1) await page.keyboard.press("ArrowUp");
    await expect.poll(() => rowsBox.evaluate((s: HTMLElement) => s.scrollTop)).toBe(0);

    // SETTLED MIDDLE: a real wheel scroll of three rows strands the highlight (row 1) above
    // the window; on settle it moves to the top visible row and the plate follows.
    await rowsBox.hover();
    await page.mouse.wheel(0, 3 * 46);
    await expect.poll(() => rowsBox.evaluate((s: HTMLElement) => s.scrollTop)).toBe(3 * 46);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const r = document.querySelector<HTMLElement>(".tuh-skill-row.highlighted")!;
          const s = document.querySelector<HTMLElement>('[data-testid="skill-menu-rows"]')!;
          return r.offsetTop >= s.scrollTop && r.offsetTop + r.offsetHeight <= s.scrollTop + s.clientHeight;
        }),
      )
      .toBe(true);
    await expect(page.getByTestId("skill-menu-up")).toBeVisible();
    await expect(page.getByTestId("skill-menu-down")).toBeVisible();
    await page.screenshot({ path: `${DIR}/menu-scroll-settled-middle-pass7-${vp.name}.png` });
    await scrollTo("end");
    await expect(page.getByTestId("skill-menu-down")).toBeHidden();
    await page.screenshot({ path: `${DIR}/menu-scroll-end-pass7-${vp.name}.png` });
  });
}
