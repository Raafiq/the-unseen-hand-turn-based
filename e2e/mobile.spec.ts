import { test, expect, type Page } from "@playwright/test";
import { dismissScene, prepEveryMember, settleMotion } from "./helpers.js";

/**
 * AC-V30 (rotate gate) and AC-V31 (landscape fit) — the phone slice.
 *
 * WHAT THIS SUITE CAN AND CANNOT SEE. It measures bounding boxes and computed styles;
 * it cannot see the screen. `e2e/playtest-capture.spec.ts` and the frames under
 * `docs/visual/mobile-landscape/` are the other half, and the numbers below were
 * written after looking at those.
 *
 * WHY `pointer: coarse` IS THE GATE AND NOT A WIDTH. Measured in this repo's Chromium
 * before the CSS was written: an emulated phone (`isMobile` + `hasTouch`) matches
 * `(pointer: coarse)`, and a 700x900 DESKTOP viewport — portrait-shaped, narrower than
 * any phone breakpoint — matches `(pointer: fine)`. A `max-width` gate would have
 * covered that desktop window with a "turn your phone" card. The third case below is
 * exactly that viewport, and it is the one that fails under the plausible wrong rule.
 */

const PHONE_PORTRAIT = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };

/** The board's intrinsic size. `pickTile` inverts through this ratio; see AC-V31. */
const BOARD_RATIO = 900 / 440;

const PAGES = ["/", "/viewer.html"] as const;

/** Drive the campaign as far as a live battle board. No-op on the viewer page. */
async function reachBattle(page: Page, path: string): Promise<void> {
  if (path !== "/") return;
  await page.getByTestId("new-game").click();
  await dismissScene(page);
  await prepEveryMember(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await settleMotion(page);
}

test.describe("AC-V30 — portrait phone is gated", () => {
  test.use({ viewport: PHONE_PORTRAIT, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  for (const path of PAGES) {
    test(`${path} shows the rotate card and hides the game beneath`, async ({ page }) => {
      await page.goto(path);

      const gate = page.getByTestId("rotate-gate");
      await expect(gate).toBeVisible();
      await expect(page.getByTestId("rotate-go")).toBeVisible();

      // The card covers the whole viewport, not a corner of it.
      const box = (await gate.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(PHONE_PORTRAIT.width - 1);
      expect(box.height).toBeGreaterThanOrEqual(PHONE_PORTRAIT.height - 1);

      // HIDDEN, NOT COVERED. A card painted over a live page still leaves every button
      // under it focusable and clickable — `.click()` fires, tab reaches it, a screen
      // reader reads it. `toBeHidden` is false for an element merely overlapped, so
      // this is the assertion that tells the two apart.
      await expect(page.locator(".wrap")).toBeHidden();

      // ...and nothing under the gate can take focus. Counting the focusable elements
      // the browser itself reports visible is the check that survives a future screen
      // being added: it does not enumerate ids.
      const reachable = await page.evaluate(() => {
        const wrap = document.querySelector(".wrap");
        if (!wrap) return -1;
        return [...wrap.querySelectorAll("button, a[href], select, textarea, canvas[tabindex]")]
          .filter((el) => (el as HTMLElement).offsetParent !== null).length;
      });
      expect(reachable).toBe(0);
    });

    test(`${path} the rotate button really reaches the orientation APIs`, async ({ page }) => {
      // AC-V32's wiring, end to end. `orientation.test.ts` proves the module locks; it
      // cannot see whether either page ever calls it — a listener attached to nothing
      // reads exactly like one that works, and that is a defect this repo has shipped.
      // Both APIs are replaced before any script runs, so the assertion is on calls the
      // real page made through the real button.
      await page.addInitScript(() => {
        (window as unknown as { __calls: string[] }).__calls = [];
        const rec = (window as unknown as { __calls: string[] }).__calls;
        // ON THE PROTOTYPE, not on `document.documentElement`. An init script runs
        // before the document is parsed, where `documentElement` is still null — the
        // first draft assigned to it, threw, and left the real APIs in place, so the
        // test failed with an empty call log that looked exactly like missing wiring.
        Element.prototype.requestFullscreen = async () => {
          rec.push("fullscreen");
        };
        Object.defineProperty(window.screen, "orientation", {
          configurable: true,
          value: {
            lock: async (o: string) => {
              rec.push(`lock:${o}`);
            },
          },
        });
      });
      await page.goto(path);

      // Nothing fires at boot: a lock outside a user gesture is refused everywhere.
      expect(await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls))
        .toEqual([]);

      // ...and the dead-end hint stays hidden while nothing has been pressed.
      await expect(page.getByTestId("rotate-hint")).toBeHidden();

      await page.getByTestId("rotate-go").click();
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls))
        .toEqual(["fullscreen", "lock:landscape"]);

      // BOTH HALVES GRANTED: the hint must NOT appear. This is the A/B partner of the
      // iOS case below — without it, a page that revealed the line unconditionally
      // would pass, and would tell a player their browser had failed on the one device
      // where it worked.
      await expect(page.getByTestId("rotate-hint")).toBeHidden();
    });

    test(`${path} says so when the browser cannot rotate (iOS Safari)`, async ({ page }) => {
      // Neither API exists — the iOS Safari case, which this Chromium cannot produce on
      // its own and which is the whole reason the button needs a fallback line. A
      // button that silently does nothing reads as a broken game.
      await page.addInitScript(() => {
        delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
        Object.defineProperty(window.screen, "orientation", {
          configurable: true,
          value: undefined,
        });
      });
      await page.goto(path);

      await expect(page.getByTestId("rotate-hint")).toBeHidden();
      await page.getByTestId("rotate-go").click();
      await expect(page.getByTestId("rotate-hint")).toBeVisible();
      await expect(page.getByTestId("rotate-hint")).toContainText("cannot rotate");
      // The rotation-lock advice is the PERSISTENT line, not this one — the two must
      // not say the same thing twice on a card that is already the whole screen.
      await expect(page.getByTestId("rotate-hint")).not.toContainText("rotation lock");
      await expect(page.locator(".rotate-sub")).toContainText("rotation lock");
    });

    test(`${path} carries the turning-phone figure, hidden from assistive tech`, async ({
      page,
    }) => {
      await page.goto(path);
      const fig = page.locator(".rotate-card .rotate-fig");
      await expect(fig).toBeVisible();
      // Decorative: it repeats what the line above it already says in words, so a
      // screen reader announcing "graphic" here is noise. `aria-hidden` is the claim
      // a11y.spec.ts's scan is allowed to rely on.
      await expect(fig).toHaveAttribute("aria-hidden", "true");
      await expect(fig.locator("svg.arc")).toHaveCount(1);
      await expect(fig.locator("svg.phone")).toHaveCount(1);
    });
  }
});

/**
 * The turn is CSS, so the only thing that can prove it is wired is the computed
 * transform — and the discriminator is an A/B between the two motion preferences.
 *
 * Under `reduce` the phone is parked at the finished 90 degrees: `rotate(90deg)` is
 * exactly `matrix(0, 1, -1, 0, 0, 0)`. Under no-preference it must NOT be that at the
 * start of the loop, because the animation opens on `rotate(0deg)` and holds there for
 * the first 14% of its 4s. A card with no animation at all would read `matrix(0, 1, -1,
 * 0, 0, 0)` in BOTH — or `none` in both — so neither half alone is evidence.
 */
const PARKED_AT_90 = "matrix(0, 1, -1, 0, 0, 0)";

test.describe("AC-V30 — the phone turns, and parks when motion is reduced", () => {
  test.use({ viewport: PHONE_PORTRAIT, isMobile: true, hasTouch: true });

  for (const path of PAGES) {
    test(`${path} under prefers-reduced-motion the phone is static at 90 degrees`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      const phone = page.locator(".rotate-card .rotate-fig .phone");
      await expect(phone).toHaveCSS("animation-name", "none");
      await expect(phone).toHaveCSS("transform", PARKED_AT_90);
    });

    test(`${path} with motion allowed the phone starts upright and is animated`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(path);
      const phone = page.locator(".rotate-card .rotate-fig .phone");
      await expect(phone).toHaveCSS("animation-name", "tuh-turn");
      // t=0 of the loop is `rotate(0deg)`, held to 14%. Reading anything other than
      // the parked matrix here is what separates "animated" from "statically rotated".
      const at0 = await phone.evaluate((el) => getComputedStyle(el).transform);
      expect(at0, "the phone is parked at 90 degrees even with motion allowed").not.toBe(
        PARKED_AT_90,
      );
    });
  }
});

test.describe("AC-V30 — a desktop window is never gated, at EITHER aspect", () => {
  // BOTH orientations, because docs/10 says the gate is absent on a non-touch device at
  // any aspect and a single portrait case cannot support "either time". The two are
  // driven with `setViewportSize` rather than two `test.use` blocks so `hasTouch` is
  // provably the same (false) in both — the variable under test is the aspect alone.
  //
  // 700x900 is the discriminating one: portrait-SHAPED and narrower than any tablet
  // breakpoint, but `pointer: fine`. It passes under `(orientation: portrait) and
  // (pointer: coarse)` and FAILS under `(orientation: portrait) and (max-width: 1023px)`.
  const SHAPES = [
    { name: "700x900 portrait-shaped", size: { width: 700, height: 900 }, portrait: true },
    { name: "1000x780 landscape", size: { width: 1000, height: 780 }, portrait: false },
  ] as const;

  for (const path of PAGES) {
    for (const shape of SHAPES) {
      test(`${path} at ${shape.name} with no touch is untouched`, async ({ page }) => {
        await page.setViewportSize(shape.size);
        await page.goto(path);
        await expect(page.getByTestId("rotate-gate")).toBeHidden();
        await expect(page.locator(".wrap")).toBeVisible();
        // The aspect really was what this case claims — otherwise the portrait row
        // would pass for the boring reason that the media query never matched.
        expect(await page.evaluate(() => matchMedia("(orientation: portrait)").matches)).toBe(
          shape.portrait,
        );
        expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(false);
      });
    }
  }
});

test.describe("AC-V31 — the battle fits a phone in landscape", () => {
  test.use({ viewport: PHONE_LANDSCAPE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  for (const path of PAGES) {
    test(`${path} board, stat plate and commands are all on screen`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId("rotate-gate")).toBeHidden();
      // POSITIVE, not just "the gate is absent": this describe's whole claim is about a
      // TOUCH device held sideways. Without it the block would pass identically if the
      // emulation silently stopped reporting a coarse pointer — at which point the
      // landscape rules under test would not be applying either.
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      expect(await page.evaluate(() => matchMedia("(orientation: landscape)").matches)).toBe(true);
      await reachBattle(page, path);

      // MEASURE AT THE TOP OF THE DOCUMENT. Bounding boxes are viewport-relative, and
      // walking the prep screen leaves the page scrolled hundreds of pixels down — a
      // canvas measured there reports a negative top and the test would be failing for
      // the wrong reason. AC-V31's promise is "no vertical scroll NEEDED", so the
      // honest measurement is taken with the page scrolled home.
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      const canvas = (await page.getByTestId("grid").boundingBox())!;
      const plate = (await page.locator("#unit-card").boundingBox())!;
      // Scoped to the board's own card: the campaign page carries a `.controls` row on
      // every screen, and `.first()` resolves to the TITLE screen's — hidden, so its
      // bounding box is null and the failure reads as a layout bug rather than a bad
      // selector.
      const controls = (await page.locator(".board .controls, .stage .controls").boundingBox())!;

      expect(canvas, "canvas is laid out").not.toBeNull();
      expect(plate, "stat plate is laid out").not.toBeNull();
      expect(controls, "command row is laid out").not.toBeNull();

      for (const [name, b] of [
        ["canvas", canvas],
        ["stat plate", plate],
        ["controls", controls],
      ] as const) {
        expect(b.x, `${name} left`).toBeGreaterThanOrEqual(-0.5);
        expect(b.y, `${name} top`).toBeGreaterThanOrEqual(-0.5);
        expect(b.x + b.width, `${name} right`).toBeLessThanOrEqual(PHONE_LANDSCAPE.width + 0.5);
        expect(b.y + b.height, `${name} bottom`).toBeLessThanOrEqual(PHONE_LANDSCAPE.height + 0.5);
      }

      // The board keeps 900:440. `draw` and `pickTile` share `viewFor`; a canvas
      // stretched off its intrinsic ratio does not fail, it silently misses.
      //
      // Measured on the CONTENT box, not the bounding box: the campaign's canvas
      // carries a 1px border, which alone moves the border-box ratio to 2.038 and would
      // have forced a slack tolerance that a genuinely stretched board could hide in.
      // The drawing surface is the thing `toCanvasPoint` scales against, so it is also
      // the honest thing to measure — and it lets the tolerance be three places.
      const drawnRatio = await page.getByTestId("grid").evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const bw = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
        const bh = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
        return (r.width - bw) / (r.height - bh);
      });
      expect(drawnRatio).toBeCloseTo(BOARD_RATIO, 3);

      // The plate is genuinely narrower than the desktop 272px / 250px, and still wide
      // enough to hold a name. Without this, "inside the viewport" would also be
      // satisfied by a plate that collapsed to nothing.
      expect(plate.width).toBeLessThan(220);
      expect(plate.width).toBeGreaterThan(120);

      // ON THE BOARD, ON ALL FOUR SIDES. The first version of this test checked only
      // the plate's RIGHT edge against the canvas, and the frame showed the plate
      // sitting entirely to the LEFT of the map on the dark card margin — the shrunken
      // canvas is centred while `.board-stage` was still full width, and the one-sided
      // check was green throughout. Caught by opening the screenshot; asserted here so
      // it cannot come back.
      expect(plate.x, "plate left of the board").toBeGreaterThanOrEqual(canvas.x - 0.5);
      expect(plate.y, "plate above the board").toBeGreaterThanOrEqual(canvas.y - 0.5);
      expect(plate.x + plate.width, "plate right of the board").toBeLessThanOrEqual(
        canvas.x + canvas.width + 0.5,
      );
      expect(plate.y + plate.height, "plate below the board").toBeLessThanOrEqual(
        canvas.y + canvas.height + 0.5,
      );

      // A drag on a tile must not scroll the page.
      await expect(page.getByTestId("grid")).toHaveCSS("touch-action", "none");
    });

    test(`${path} does not overflow horizontally`, async ({ page }) => {
      await page.goto(path);
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    });
  }

  test("/ every campaign screen fits the width", async ({ page }) => {
    // Vertical scrolling is allowed off the battle screen; horizontal is not, on any of
    // them. Enumerating the SCREENS rather than testing one is the point — the prep
    // grid and the scene player are the two most likely to burst a 844px column.
    await page.goto("/");
    const overflow = async (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

    expect(await overflow(), "title").toBeLessThanOrEqual(1);
    await page.getByTestId("new-game").click();
    if (await page.getByTestId("screen-scene").isVisible()) {
      expect(await overflow(), "scene").toBeLessThanOrEqual(1);
    }
    await dismissScene(page);
    expect(await overflow(), "briefing + prep").toBeLessThanOrEqual(1);
    await prepEveryMember(page);
    await page.getByTestId("deploy").click();
    await expect(page.getByTestId("screen-battle")).toBeVisible();
    expect(await overflow(), "battle").toBeLessThanOrEqual(1);
  });
});

/**
 * AC-V32's other half — the web manifest, which nothing asserted until now.
 *
 * It is checked from the browser rather than by reading `public/`: the href is
 * RELATIVE so it survives the Pages base path, and a relative href that resolves
 * somewhere wrong is exactly the failure a file-existence check cannot see. Fetching
 * it through the page resolves it the way a browser would.
 */
test.describe("AC-V32 — the web manifest", () => {
  for (const path of PAGES) {
    test(`${path} links a manifest that asks for landscape`, async ({ page }) => {
      await page.goto(path);

      const href = await page.locator('link[rel="manifest"]').getAttribute("href");
      expect(href, "no <link rel=manifest> on this page").toBeTruthy();
      // Relative, so the Pages deploy under /<repo>/ resolves it inside the site.
      expect(href!.startsWith("/")).toBe(false);
      expect(href!.startsWith("http")).toBe(false);

      const manifest = await page.evaluate(async () => {
        const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        const res = await fetch(link!.href);
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      });

      expect(manifest.status, "the manifest href does not resolve").toBe(200);
      // The load-bearing key: this whole slice is "the game is played sideways".
      expect(manifest.body["orientation"]).toBe("landscape");
      expect(manifest.body["display"]).toBe("standalone");
      // Relative scope and start_url for the same base-path reason as the href.
      expect(manifest.body["start_url"]).toBe("./");
      expect(manifest.body["scope"]).toBe("./");
      expect(manifest.body["name"]).toBeTruthy();
      expect(manifest.body["short_name"]).toBeTruthy();
      // NOT ASSERTED, deliberately: there are no icons, so no browser will offer to
      // install this. Stated here rather than left to look like an oversight.
      expect(manifest.body["icons"]).toBeUndefined();
    });
  }
});
