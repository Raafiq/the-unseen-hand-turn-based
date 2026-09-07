import { test, expect } from "@playwright/test";
import { dismissScene, prepEveryMember, startNewGame } from "./helpers.js";

/**
 * AC-V30 (the rotate gate) and AC-V32 (the lock attempt + the manifest) — the
 * orientation half of the phone work.
 *
 * **AC-V31 IS RETIRED (ADR-0037), not weakened.** It promised the board, the stat
 * plate and the controls all on screen at 844x390 — and it was GREEN on the real
 * phone screenshot where the plate covered half the map, because it permitted the
 * overlap. Its promise is subsumed by **AC-V33** (the stage geometry, at five
 * viewports instead of one) and **AC-V34** (the board is uncovered at rest, which
 * AC-V31 allowed), both in `e2e/stage.spec.ts`. Nothing about the LAYOUT is asserted
 * in this file any more.
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

const PAGES = ["/", "/viewer.html"] as const;

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
      //
      // `checkVisibility()`, NOT `offsetParent !== null`. The battle stage is
      // `position: fixed` since ADR-0037, and a fixed element's `offsetParent` is
      // ALWAYS null — so the old filter reported zero whether the gate hid the page or
      // not, which is a check that cannot come out the other way. The landscape control
      // below is what proves the new one can.
      const countReachable = (): Promise<number> =>
        page.evaluate(() => {
          const wrap = document.querySelector(".wrap");
          if (!wrap) return -1;
          return [...wrap.querySelectorAll("button, a[href], select, textarea, canvas[tabindex]")]
            .filter((el) => (el as HTMLElement).checkVisibility()).length;
        });
      expect(await countReachable()).toBe(0);

      // THE CONTROL: rotate the same page and the same query finds controls. Without
      // it, "0" is equally what a broken selector reports.
      await page.setViewportSize({ width: PHONE_PORTRAIT.height, height: PHONE_PORTRAIT.width });
      await expect(gate).toBeHidden();
      expect(await countReachable()).toBeGreaterThan(0);
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

/**
 * WHAT SURVIVED AC-V31'S RETIREMENT: no HORIZONTAL overflow, anywhere.
 *
 * That claim was never about the board — it is about the campaign's other four
 * screens, which ADR-0037 explicitly left on their old layout (docs/10 §8f). The
 * battle screen's own geometry is asserted in `e2e/stage.spec.ts` (AC-V33), which also
 * covers vertical scroll, which this file never could.
 */
test.describe("no horizontal overflow on a phone held sideways", () => {
  test.use({ viewport: PHONE_LANDSCAPE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  for (const path of PAGES) {
    test(`${path} does not overflow horizontally`, async ({ page }) => {
      await page.goto(path);
      // POSITIVE, not just "the gate is absent": this describe's whole claim is about a
      // TOUCH device held sideways. Without it the block would pass identically if the
      // emulation silently stopped reporting a coarse pointer.
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      expect(await page.evaluate(() => matchMedia("(orientation: landscape)").matches)).toBe(true);
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
    await startNewGame(page);
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

/**
 * THE TITLE SCREEN'S FOLD (docs/visual/concepts/README.md §d, `src/render/overhaul.css`).
 *
 * Three stages, one rule: below 8:5 the codex fills the stage edge to edge (two leaves
 * side by side); at or above 8:5 it would go portrait and both leaves fill with dead
 * parchment, so it is capped at 8:5 and centred instead. 640x300 and 851x324 are both
 * BELOW 8:5 (1.6) — 2.13 and 2.63 — so the cap must NOT engage there; 1000x780 is 1.28,
 * above the cap, so it must.
 */
test.describe("title: the fold, per ADR-0037", () => {
  for (const [w, h] of [
    [640, 300],
    [851, 324],
  ] as const) {
    test(`${w}x${h}: both leaves sit side by side, all three buttons fit, no page scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/");
      await expect(page.getByTestId("screen-title")).toBeVisible();

      // The cap must not have engaged: the codex's own aspect ratio tracks the
      // VIEWPORT's, not the 8:5 cap (1.6) — asserted on the ratio, not the height alone.
      // A wrongly-engaged cap at these sizes still fills most of the available height
      // (the stage is short), so a height-only check ties between "cap off" and "cap
      // wrongly on" and cannot tell them apart; the width the cap produces (height*1.6)
      // is well short of the viewport's, so the RATIO does discriminate.
      //
      // TOLERANCE MEASURED, not the nominal 0 it would be on an edge-to-edge codex:
      // `#screen-title`'s own `padding: 0.75em` shrinks the codex's box on every side,
      // which moves its ratio away from the raw viewport's by an amount that grows with
      // that padding — 0.063 at 640x300, 0.096 at 851x324, both measured directly. 0.2 is
      // comfortably above that real drift and still an order of magnitude below what an
      // engaged cap produces (ratio 1.6, ~1.0 away from either viewport here).
      const codexBox = await page.locator("#screen-title .codex").boundingBox();
      expect(codexBox, "codex has no box").not.toBeNull();
      const viewportRatio = w / h;
      const codexRatio = codexBox!.width / codexBox!.height;
      expect(
        Math.abs(codexRatio - viewportRatio),
        `codex ratio ${codexRatio} vs viewport ratio ${viewportRatio}`,
      ).toBeLessThan(0.2);
      /**
       * MUTATION, RUN FOR REAL: unconditionally applied `#screen-title .codex {
       * aspect-ratio: 8/5; margin: auto; }` (dropping BOTH the `@media` guard and the
       * `max-height: 100%` the shipped rule pairs it with). The obvious-looking mutation
       * — widening the `@media` condition alone, `max-height` left in place — is a
       * VERIFIED NO-OP at these two sizes: with the flex item's width already fixed by
       * `flex-grow` and `max-height: 100%` clamping the aspect-ratio-derived height right
       * back to the stretch value, the rendered box came out pixel-identical to the
       * uncapped case (measured, both builds). Dropping `max-height` too is what lets the
       * cap's real effect show: RED at 851x324, `codex ratio 1.600036…` vs viewport
       * `2.626543…`, `Received: 1.0265…` against `Expected: < 0.2` — and 640x300 failed
       * the same way.
       */

      // Both leaves are on screen, side by side (left leaf's right edge is left of the
      // right leaf's left edge — they do not stack).
      const leftBox = await page.locator("#screen-title .leaf-left").boundingBox();
      const rightBox = await page.locator("#screen-title .leaf-right").boundingBox();
      expect(leftBox, "left leaf has no box").not.toBeNull();
      expect(rightBox, "right leaf has no box").not.toBeNull();
      expect(leftBox!.x).toBeLessThan(rightBox!.x);
      expect(leftBox!.y).toBeCloseTo(rightBox!.y, 0);

      // Every button, AND the codex itself, is fully inside the viewport. This replaces a
      // `scrollHeight - clientHeight` check: `overhaul.css`'s `body:has(#screen-title:not(
      // [hidden])) { overflow: hidden }` forces that difference to 0 regardless of whether
      // the content actually fits, which makes a scroll-height assertion pass on a codex
      // that overflows the stage and is simply clipped rather than laid out to fit — the
      // rule is legitimate (AC-V33's "the screen owns the viewport"), but it means "no
      // scroll" cannot be read as "nothing overflowed". A bounding-box check can.
      for (const [testId, box] of [
        ["codex", codexBox],
        ["new-game", await page.getByTestId("new-game").boundingBox()],
        ["continue", await page.getByTestId("continue").boundingBox()],
        ["copy-log-title", await page.getByTestId("copy-log-title").boundingBox()],
      ] as const) {
        expect(box, `${testId} has no box`).not.toBeNull();
        expect(box!.x, `${testId} left edge`).toBeGreaterThanOrEqual(0);
        expect(box!.y, `${testId} top edge`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `${testId} right edge`).toBeLessThanOrEqual(w + 1);
        expect(box!.y + box!.height, `${testId} bottom edge`).toBeLessThanOrEqual(h + 1);
      }
    });
  }

  test("1000x780: the codex is capped at 8:5 and centred", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 780 });
    await page.goto("/");
    await expect(page.getByTestId("screen-title")).toBeVisible();

    const codexBox = await page.locator("#screen-title .codex").boundingBox();
    expect(codexBox, "codex has no box").not.toBeNull();
    // Capped: the codex's own aspect ratio is 8:5 (within rounding), not the stage's
    // taller 1000x780 (1.28).
    expect(codexBox!.width / codexBox!.height).toBeCloseTo(8 / 5, 1);
    // Centred: roughly equal table showing left and right of the codex.
    const stageBox = await page.locator("#screen-title").boundingBox();
    expect(stageBox, "stage has no box").not.toBeNull();
    const leftGap = codexBox!.x - stageBox!.x;
    const rightGap = stageBox!.x + stageBox!.width - (codexBox!.x + codexBox!.width);
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(4);
  });

  /**
   * MUTATION (remove the 8:5 cap): drop the `@media (max-aspect-ratio: 8/5)` block from
   * `overhaul.css` → at 1000x780 the codex reverts to filling the whole (1.28-aspect)
   * stage, so its own aspect ratio departs from 8:5. RAN FOR REAL: red on
   * `expect(codexBox!.width / codexBox!.height).toBeCloseTo(8 / 5, 1)`,
   * `Received: 1.28...` against `Expected: 1.6`.
   */
});
