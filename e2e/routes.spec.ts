import { test, expect } from "@playwright/test";

/**
 * The site's three routes (docs/10 §7a, AC-V14).
 *
 * WHY A BROWSER TEST AND NOT A BUILD ASSERTION. A page missing from
 * `vite.config.ts`'s `rollupOptions.input` works perfectly under `npm run dev` and does
 * not exist in `dist` — it is simply not shipped, and nothing in the unit suite can see
 * that. Playwright serves `dist` through `npm run preview`, so a visit here is the only
 * thing that distinguishes "the page builds" from "the page is on the site".
 *
 * Every other spec now visits exactly one of these paths, so this file is where the
 * SHAPE of the site is asserted rather than any one page's behaviour.
 */

/** Which seam a page installs — the cheapest true statement of "which page is this". */
const seams = (page: import("@playwright/test").Page): Promise<{ game: boolean; viewer: boolean }> =>
  page.evaluate(() => ({
    game: typeof (window as unknown as { tuhGame?: unknown }).tuhGame !== "undefined",
    viewer: typeof (window as unknown as { tuh?: unknown }).tuh !== "undefined",
  }));

test("routes: / is the campaign, /viewer.html is the engine viewer, and they differ", async ({
  page,
}) => {
  // ── the root is the GAME. This is the whole point of the slice: a stranger handed
  // the bare site URL lands on something playable, not on a debug view.
  await page.goto("/");
  await expect(page.getByTestId("screen-title")).toBeVisible();
  const root = await seams(page);

  // ── the viewer still SHIPS. Moving it must not quietly drop it from the build.
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();
  const viewer = await seams(page);

  // ── and the two are DIFFERENT PAGES. "Both loaded" is not that claim: two rollup
  // entries pointed at one file would serve identical HTML at both paths and pass
  // every assertion above. The installed seam is what tells them apart.
  expect(root).toEqual({ game: true, viewer: false });
  expect(viewer).toEqual({ game: false, viewer: true });
});

test("routes: the campaign's old URL still reaches it", async ({ page }) => {
  // `/game.html` was public — README.md links it and docs/11 names it — so it stays as
  // a redirect. Asserted in two halves, because each hides a different failure.

  // 1. The DOCUMENT is not blank. A typo'd `<meta http-equiv="refresh">` renders a
  //    perfectly ordinary empty page, and a reader with scripting disabled sees only
  //    what is in the markup. Fetched rather than rendered so the redirect cannot race.
  const res = await page.request.get("/game.html");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('http-equiv="refresh"');
  expect(html).toMatch(/<a [^>]*href="\.\/"/);

  // 2. FOLLOWING it lands on the game. Half 1 alone would pass on a stub that points
  //    somewhere wrong; this asserts where it actually goes.
  await page.goto("/game.html");
  await page.waitForURL((url) => url.pathname.endsWith("/"));
  await expect(page.getByTestId("screen-title")).toBeVisible();
});
