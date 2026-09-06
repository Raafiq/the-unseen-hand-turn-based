import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { closeDrawer, dismissScene, openDrawer } from "./helpers.js";
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

/**
 * THE BATTLE STAGE (ADR-0037) — scanned at rest AND with every overlay open, and the
 * NODE COUNT is asserted at each step rather than inferred from a green run.
 *
 * A CHECKER THAT DECLINES TO CHECK STILL REPORTS PASS. axe skips what is not rendered,
 * so a `hidden` drawer contributes nothing and a run that never opened one is
 * byte-identical to a run over a drawer full of unlabelled icon buttons. Each overlay
 * is opened, and each is asserted to have ADDED nodes to axe's reach — which is the
 * only thing that separates "axe examined this panel" from "axe never saw it".
 */
test("a11y: the battle stage, at rest and with every overlay open", async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 324 });
  await page.goto("/");
  await page.getByTestId("new-game").click();
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();

  const reach = async (): Promise<number> => {
    const results = await new AxeBuilder({ page })
      .withTags(TAGS)
      .disableRules(UNMEASURABLE_HERE)
      .analyze();
    return results.passes.reduce((n, r) => n + r.nodes.length, 0);
  };

  expect(await scan(page)).toEqual([]);
  const atRest = await reach();
  // MEASURED 2026-09-05: the stage at rest puts dozens of nodes in front of axe. The
  // floor says it really examined the HUD rather than an empty document.
  expect(atRest, "axe evaluated almost nothing on the stage").toBeGreaterThan(15);

  for (const which of ["unit", "settings", "menu", "help", "actions"] as const) {
    await openDrawer(page, which);
    expect(await scan(page), `violations with the ${which} overlay open`).toEqual([]);
    expect(
      await reach(),
      `opening the ${which} overlay added nothing to axe's reach — it never saw it`,
    ).toBeGreaterThan(atRest);
    await closeDrawer(page);
  }
});

test("a11y: the engine viewer", async ({ page }) => {
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

/**
 * The PORTRAIT ROTATE GATE (AC-V30) — the one screen no other case in this file can
 * reach, because it exists only on a touch device held upright.
 *
 * HOW MUCH AXE ACTUALLY LOOKED AT IS THE POINT HERE. A checker that declines to check
 * still reports pass, so a count is asserted rather than inferred from a green run —
 * and it is asserted as an A/B against the SAME page rotated into landscape rather than
 * against a hard-coded floor. Portrait: the game is `display: none` and axe evaluates a
 * handful of nodes. Landscape: the gate is gone and the game renders, and axe evaluates
 * several times as many. A gate that merely COVERED the page instead of hiding it would
 * score the same in both, which is exactly the defect AC-V30 is about.
 *
 * DECLINED CHECKS, STATED: axe returns `bypass` as incomplete on this card (it cannot
 * decide a skip-link on a page with one landmark-less dialog). That is the only rule it
 * refuses, and the assertion below pins the set so a NEW refusal cannot arrive silently.
 * `color-contrast` is disabled file-wide; `contrast.spec.ts` measures the card instead.
 */
test.describe("a11y: the portrait rotate gate", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  /** Nodes axe evaluated and held, plus the rules it refused to decide. */
  async function reach(page: Page): Promise<{ nodes: number; declined: string[] }> {
    const results = await new AxeBuilder({ page })
      .withTags(TAGS)
      .disableRules(UNMEASURABLE_HERE)
      .analyze();
    return {
      nodes: results.passes.reduce((n, r) => n + r.nodes.length, 0),
      declined: results.incomplete.map((r) => r.id).sort(),
    };
  }

  for (const path of ["/", "/viewer.html"]) {
    test(`a11y: the rotate gate on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId("rotate-gate")).toBeVisible();
      await expect(page.locator(".wrap")).toBeHidden();
      expect(await scan(page)).toEqual([]);

      const gated = await reach(page);
      expect(gated.declined, "axe started refusing a new rule on the gate").toEqual(["bypass"]);
      // Measured 2026-09-05: 17 on `/`, 15 on `/viewer.html`. The floor says axe really
      // examined the card rather than an empty document.
      expect(gated.nodes, "axe evaluated almost nothing on the gate").toBeGreaterThanOrEqual(10);

      // ROTATE, and scan the same page again. This is the control the count above is
      // read against.
      await page.setViewportSize({ width: 844, height: 390 });
      await expect(page.getByTestId("rotate-gate")).toBeHidden();
      await expect(page.locator(".wrap")).toBeVisible();
      expect(await scan(page)).toEqual([]);

      const open = await reach(page);
      expect(
        open.nodes,
        "the gate scanned as much as the open game — it is covering the page, not hiding it",
      ).toBeGreaterThan(gated.nodes * 2);
    });
  }
});
