import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { dismissScene } from "./helpers.js";
import { prepEveryMember } from "./helpers";

/**
 * Automated accessibility scan of every screen a player passes through.
 *
 * WHAT THIS PROVES, AND EXACTLY WHERE IT STOPS. axe-core checks machine-decidable
 * rules — contrast ratios, accessible names, ARIA validity, label association. Deque's
 * own figure is that automation catches on the order of a third of real accessibility
 * problems, and it catches **none** of "is this screen understandable". A green run
 * here on an incomprehensible prep screen is byte-identical to a green run on a clear
 * one, so this file must never be cited as onboarding evidence (`docs/NEXT.md` — that
 * question needs a person).
 *
 * It exists because the parchment treatment put dark ink on a tan field and gold
 * small-caps on top of it, and "that looks readable" is exactly the kind of claim that
 * reads as proof while being unmeasured. This measures it.
 *
 * WHY IT ASSERTS ITS OWN REACH. `analyze()` on a page where the screen under test is
 * `hidden` returns zero violations — axe skips what is not rendered — so a spec that
 * merely walked to a screen and scanned would pass identically if the walk silently
 * failed. Each case asserts the screen is visible first, and `scan()` asserts axe
 * actually examined a non-trivial number of nodes.
 */

/** Rules we run. Scoped to the two levels a game UI is reasonably held to. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * CONTRAST IS DELIBERATELY NOT CHECKED HERE, and disabling it is the honest move
 * rather than a weakening. Every parchment sheet is a gradient under two noise
 * layers, and axe declines to judge a background it cannot flatten: on the briefing
 * screen it measured 2 nodes and returned 106 as "incomplete" while reporting zero
 * violations — a pass that would read identically if the ink were unreadable. Leaving
 * the rule enabled would let this file appear to carry a claim it cannot.
 *
 * `contrast.spec.ts` makes that claim instead, by computing ratios against both
 * extremes of each sheet's gradient. If you ever flatten these backgrounds, delete
 * this line rather than keeping both.
 */
const UNMEASURABLE_HERE = ["color-contrast"];

/**
 * Run axe and return the violations, having first established that it had something
 * to look at. `passes.length` is the count of rule/node pairs that were evaluated and
 * held — a page axe could not see at all reports zero of those *and* zero violations,
 * which is the false green this guards.
 */
async function scan(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).disableRules(UNMEASURABLE_HERE).analyze();
  expect(results.passes.length).toBeGreaterThan(5);
  return results.violations.map(
    (v) => `${v.id} (${v.impact ?? "n/a"}) ×${v.nodes.length}: ${v.help}\n    ${v.nodes[0]?.html ?? ""}`,
  );
}

test("a11y: the title screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("screen-title")).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("a11y: the briefing and prep screens", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-game").click();
  await dismissScene(page);
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
  // Scan the panel as first rendered…
  expect(await scan(page)).toEqual([]);

  // …and again once AP has been spent, because buying redraws the learn list with
  // rows the first pass never contained: the red "needs Secondary" tag, disabled buy
  // seals, and the receipt. Those are new colour pairs on new backgrounds.
  await prepEveryMember(page);
  await expect(page.getByTestId("prep-learn")).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("a11y: the help panel", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("help-open").click();
  await expect(page.getByTestId("help-body")).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("a11y: the battle screen", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-game").click();
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  // The board card is the one surface that stayed dark, so it is the one place the
  // ink/ground pairing differs from every other screen — worth its own case rather
  // than trusting the parchment result to cover it.
  expect(await scan(page)).toEqual([]);
});

test("a11y: the engine viewer", async ({ page }) => {
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();
  expect(await scan(page)).toEqual([]);
});
