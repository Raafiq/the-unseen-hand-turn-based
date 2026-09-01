import { expect, type Page } from "@playwright/test";

/**
 * Helpers shared by the browser specs.
 *
 * `prepEveryMember` lives here rather than in one spec because two files need it and a
 * second copy would drift: it encodes ADR-0027's policy (spend on the member's OWN job
 * tree), and two versions of that would let one spec's walkthrough quietly stop matching
 * the player the campaign is tuned for.
 */

/**
 * Use the prep screen the way an engaged player does — through the real controls
 * (ADR-0027).
 *
 * Since ADR-0027 the finale is tuned so a party that never spends AP loses it, so a
 * browser walkthrough that skipped this would be asserting the zero-engagement path,
 * which the campaign deliberately no longer grants an ending to.
 *
 * IT ONLY EVER TOUCHES THE MEMBER'S OWN TREE, and that is the whole policy rather than an
 * incidental simplification: the tree selector defaults to the current job, so clicking
 * every enabled buy button without changing it spends on the job the unit is in. Measured
 * headlessly, that clears the campaign at 8 of 8 seeds — while buying the cheapest node
 * anywhere in the pack clears 1 of 8. Spending at home is the thing the game now asks a
 * player to work out.
 */
export async function prepEveryMember(page: Page): Promise<void> {
  const members = await page.locator('[data-testid="prep-roster"] button.ptab').all();
  for (let i = 0; i < members.length; i += 1) {
    // Re-resolve each pass: the panel re-renders after every purchase, so a handle taken
    // before the click is detached by the time the next one is needed.
    await page.locator('[data-testid="prep-roster"] button.ptab').nth(i).click();
    for (let guard = 0; guard < 20; guard += 1) {
      const buy = page.locator('[data-testid="prep-learn"] button.buy:not([disabled])').first();
      if ((await buy.count()) === 0) break;
      await buy.click();
    }
    // Equip what was just bought. A passive that is learned and never equipped does
    // nothing at all, which is exactly what an untouched slot looks like from outside.
    for (const slot of ["support", "movement", "reaction", "secondary"]) {
      const select = page.getByTestId(`prep-${slot}`);
      if ((await select.count()) === 0) continue;
      const values = await select.locator("option").evaluateAll((os) =>
        os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ""),
      );
      const current = await select.inputValue();
      if (current === "" && values.length > 0) await select.selectOption(values[0]!);
    }
  }
}

/**
 * Walk past a standalone scene if one is standing on screen.
 *
 * TOLERANT about whether a scene exists here, STRICT about dismissal working. Scenes are
 * optional content — the campaign authors one before battle 1 and battle 3 and none
 * before battle 2 — so a helper demanding one at every landing would encode a rule
 * nobody wrote. That the prologue actually exists is asserted separately, by AC-V17's
 * own tests, where a vanished scene fails loudly instead of being shrugged past here.
 */
export async function dismissScene(page: Page): Promise<void> {
  const screen = page.getByTestId("screen-scene");
  if (!(await screen.isVisible())) return;
  await page.getByTestId("scene-continue").click();
  await expect(screen).toBeHidden();
}

/**
 * Put the board's cosmetic animation into a KNOWN frame before a screenshot.
 *
 * WHY THIS EXISTS RATHER THAN A SLEEP. Every spec that screenshots right after a state
 * change now lands on an arbitrary frame of a ~1.5 s animation, and nothing in the suite
 * can see a canvas — so a mid-animation capture would ship under a caption describing the
 * settled board with everything green. A `waitForTimeout` would only trade that for a
 * race on a loaded box. These two drive the page's own animation clock instead:
 *
 *   - {@link settleMotion} jumps to the finished frame (offsets at rest, the numeral
 *     expired). Use it for any frame whose caption describes a board at rest.
 *   - {@link freezeMotion} pins a CHOSEN instant. `0` is impact — the target flashed and
 *     recoiled with the damage numeral at full size — which is the only frame that makes
 *     a caption like "a damage popup is necessarily on screen" true of the image.
 *     Pass `null` to hand the clock back.
 *
 * Both are no-ops on a page with no battle, and tolerant of either seam: `/` installs
 * `window.tuhGame`, `/viewer.html` installs `window.tuh`.
 */
export async function settleMotion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      tuh?: { settleMotion?: () => void };
      tuhGame?: { settleMotion?: () => void };
    };
    w.tuhGame?.settleMotion?.();
    w.tuh?.settleMotion?.();
  });
}

export async function freezeMotion(page: Page, elapsedMs: number | null): Promise<void> {
  await page.evaluate((ms) => {
    const w = window as unknown as {
      tuh?: { freezeMotion?: (ms: number | null) => void };
      tuhGame?: { freezeMotion?: (ms: number | null) => void };
    };
    w.tuhGame?.freezeMotion?.(ms);
    w.tuh?.freezeMotion?.(ms);
  }, elapsedMs);
}
