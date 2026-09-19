import { test, expect, type Page } from "@playwright/test";
import { closeDrawer, dismissScene, openDrawer, startNewGame } from "./helpers.js";

/**
 * THE ENEMY'S TURN RUNS ITSELF (ADR-0046) — in the real page, on a real timer.
 *
 * Every other game-page spec HOLDS the pacer so its frames and reads are of a chosen
 * state; this is the one that does not, because "the enemy acts without the player
 * pressing anything" is a claim only a live timer can prove. What it asserts:
 *   - entering `AI_TURN` arms a pause, the primary button is inert, and the command
 *     count grows with NO call from the spec;
 *   - the ×1/×2/×3 speed is a device preference: set through the ☰ menu's own entry, it
 *     survives a reload on its own key and never appears in the campaign save.
 * Byte-identity of the log across speeds is `src/render/pacer.test.ts`'s job (AC-V68),
 * driven by a hand-run scheduler where every fire is chosen; a browser cannot pin that.
 */

const PREFS_KEY = "tuh.prefs.v1";
const SAVE_KEY = "tuh.campaign.v1";

async function reachBattle(page: Page): Promise<void> {
  await page.goto("/");
  await startNewGame(page);
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
}

/** Wait through the player's turns (each a synchronous End Turn) until the enemy's. */
async function reachEnemyTurn(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (let i = 0; i < 40 && window.tuhGame.phase() !== "AI_TURN"; i += 1) {
      window.tuhGame.endTurn();
      if (window.tuhGame.phase() === "ENDED") break;
    }
  });
  expect(await page.evaluate(() => window.tuhGame.phase())).toBe("AI_TURN");
}

test("the enemy acts on its own: no button, no call, the log grows by itself", async ({ page }) => {
  await reachBattle(page);
  // ×3 so the pause is short; the mechanism is the same at ×1.
  await page.evaluate(() => window.tuhGame.setEnemySpeed(3));
  await reachEnemyTurn(page);

  // The pause is armed, and the player's command ribbon is GONE — every one of its
  // buttons hidden, one notice in their slot, drawn inside the band (owner, 2026-09-19).
  expect(await page.evaluate(() => window.tuhGame.enemyTurnPending())).toBe(true);
  for (const id of ["move", "attack", "actions", "item", "defend", "end-turn", "confirm", "cancel"]) {
    await expect(page.getByTestId(id)).toBeHidden();
  }
  const notice = page.getByTestId("ribbon-notice");
  await expect(notice).toBeVisible();
  const boxes = await page.evaluate(() => {
    const r = (sel: string): DOMRect | undefined =>
      document.querySelector(sel)?.getBoundingClientRect();
    return { notice: r('[data-testid="ribbon-notice"]'), band: r(".tuh-band") };
  });
  expect(boxes.notice!.top).toBeGreaterThanOrEqual(boxes.band!.top);
  expect(boxes.notice!.bottom).toBeLessThanOrEqual(boxes.band!.bottom);
  expect(boxes.notice!.width).toBeGreaterThan(0);

  // NOTHING is called from here on. The count moves because the pause came due.
  const before = await page.evaluate(() => window.tuhGame.commandCount());
  await expect
    .poll(() => page.evaluate(() => window.tuhGame.commandCount()), { timeout: 5_000 })
    .toBeGreaterThan(before);

  // …and it keeps going through every enemy turn in the round, then stops at the
  // player's: the pacer never steps a player unit.
  await expect
    .poll(() => page.evaluate(() => window.tuhGame.phase()), { timeout: 10_000 })
    .not.toBe("AI_TURN");
  const settled = await page.evaluate(() => ({
    phase: window.tuhGame.phase(),
    pending: window.tuhGame.enemyTurnPending(),
    count: window.tuhGame.commandCount(),
  }));
  expect(settled.pending).toBe(false);
  expect(settled.count).toBeGreaterThan(before);
  expect(["PLAYER_IDLE", "ENDED"]).toContain(settled.phase);
  // …and the ribbon is back for the player.
  if (settled.phase === "PLAYER_IDLE") {
    await expect(page.getByTestId("move")).toBeVisible();
    await expect(page.getByTestId("end-turn")).toBeVisible();
    await expect(page.getByTestId("ribbon-notice")).toBeHidden();
  }
  // Held, the count sits still: the hold is what every other spec relies on.
  if (settled.phase === "PLAYER_IDLE") {
    await page.evaluate(() => window.tuhGame.holdEnemyTurns(true));
    await reachEnemyTurn(page);
    expect(await page.evaluate(() => window.tuhGame.enemyTurnPending())).toBe(false);
    const held = await page.evaluate(() => window.tuhGame.commandCount());
    await page.waitForTimeout(600); // > ×3's pause, < ×1's — a fire here would be a leak
    expect(await page.evaluate(() => window.tuhGame.commandCount())).toBe(held);
  }
});

test("the speed toggle is a device preference: the ☰ entry cycles it, a reload keeps it, the save never sees it", async ({
  page,
}) => {
  await reachBattle(page);
  await page.evaluate(() => window.tuhGame.holdEnemyTurns(true));
  expect(await page.evaluate(() => window.tuhGame.enemySpeed())).toBe(1);
  const saveBefore = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  expect(saveBefore, "no save was written, so 'the save is untouched' would be vacuous").not.toBeNull();

  // The menu's own entry, twice: ×1 → ×2 → ×3.
  await openDrawer(page, "menu");
  await expect(page.getByTestId("menu-speed")).toContainText("×1");
  await page.getByTestId("menu-speed").click();
  await closeDrawer(page);
  expect(await page.evaluate(() => window.tuhGame.enemySpeed())).toBe(2);
  await openDrawer(page, "menu");
  await expect(page.getByTestId("menu-speed")).toContainText("×2");
  await page.getByTestId("menu-speed").click();
  await closeDrawer(page);
  expect(await page.evaluate(() => window.tuhGame.enemySpeed())).toBe(3);

  // Its own key; the save's string is BYTE-IDENTICAL to before the toggle was touched.
  // (`"speed"` is also a unit stat inside the save, so a substring check cannot be the
  // assertion — the A/B on the whole string is.)
  const stored = await page.evaluate(
    ([prefs, save]) => ({
      prefs: localStorage.getItem(prefs!),
      save: localStorage.getItem(save!),
    }),
    [PREFS_KEY, SAVE_KEY],
  );
  expect(JSON.parse(stored.prefs ?? "{}")).toEqual({ speed: 3 });
  expect(stored.save).toBe(saveBefore);

  // A real reload, not an in-memory read.
  await page.reload();
  expect(await page.evaluate(() => window.tuhGame.enemySpeed())).toBe(3);
});
