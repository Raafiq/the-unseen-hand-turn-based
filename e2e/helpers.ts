import { type Page } from "@playwright/test";

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
