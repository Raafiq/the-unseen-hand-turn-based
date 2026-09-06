import { test, expect, type Page } from "@playwright/test";
import { dismissScene, startNewGame } from "./helpers.js";

/**
 * The overhaul title screen (docs/visual/concepts/README.md, `src/render/overhaul.css`).
 *
 * `campaign.spec.ts` already proves the shell's persistence and screen transitions; this
 * file is scoped to the NEW title-screen surface the overhaul slice adds — the rest
 * state matching the concept, the in-page overwrite step that replaces the removed Erase
 * button, and the bundled art. `e2e/contrast.spec.ts` covers text contrast on this screen
 * separately; `e2e/mobile.spec.ts` covers the phone fold.
 */

const stored = (page: Page): Promise<string | null> =>
  page.evaluate(() => window.tuhGame.storedSave());

/** Play battle 1 to a banked victory, so the save carries `history` an overwrite would lose. */
async function bankOneVictory(page: Page): Promise<void> {
  await startNewGame(page);
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await page.evaluate(() => window.tuhGame.autoplay());
  await page.getByTestId("conclude").click();
  await expect(page.getByTestId("screen-after")).toBeVisible();
  await page.evaluate(() => window.tuhGame.quitToTitle());
  await expect(page.getByTestId("screen-title")).toBeVisible();
}

test.describe("title: rest matches the picture", () => {
  test("three visible buttons; the removed controls are gone; the status notes are hidden", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("screen-title")).toBeVisible();

    // ASSERT: exactly three visible buttons on the whole title screen.
    const visibleButtons = await page
      .locator("#screen-title button")
      .evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).length);
    expect(visibleButtons).toBe(3);
    await expect(page.getByTestId("new-game")).toBeVisible();
    await expect(page.getByTestId("continue")).toBeVisible();
    await expect(page.getByTestId("copy-log-title")).toBeVisible();

    // ASSERT: the save-status line and the copy-log note are both hidden at rest.
    await expect(page.getByTestId("title-slot")).toBeHidden();
    await expect(page.getByTestId("log-note-title")).toBeHidden();

    // ASSERT: the removed controls are absent from the DOM outright, not merely hidden —
    // `btn-erase` and the footer link to the engine viewer.
    expect(await page.locator("#btn-erase").count()).toBe(0);
    expect(await page.locator('a[href="./viewer.html"]').count()).toBe(0);
    expect(await page.locator("#screen-title footer").count()).toBe(0);
  });

  /**
   * MUTATION (leave the footer link in): re-add `<footer>Also here: the <a
   * href="./viewer.html">engine viewer</a>…</footer>` inside `#screen-title` → the
   * `a[href="./viewer.html"]` count assertion above goes from 0 to 1 and fails. RAN FOR
   * REAL: red on `expect(...count()).toBe(0)`, `Expected: 0, Received: 1`.
   *
   * MUTATION (unhide title-slot at rest): `renderTitle()` re-asserts `hidden` on every
   * repaint, so dropping the attribute from index.html alone is not the real mutation —
   * `note.hidden = slot.kind !== "error"` in `game.ts` is the controlling line. Changed
   * to `note.hidden = false` → `toBeHidden()` above goes red (`Received: visible`). RAN
   * FOR REAL, same failure.
   */
});

test.describe("title: New Game asks before overwriting a save", () => {
  test("clicking New Game with a save present shows the step, does not start a run, and Back leaves the save intact", async ({
    page,
  }) => {
    await page.goto("/");
    await bankOneVictory(page);

    const before = await stored(page);
    expect(before).not.toBeNull();
    // Identity of the OLD save: it has played battle 1 and holds one history entry — the
    // field a fresh run does not have. Asserted here so the "still intact" check below is
    // not vacuous (a save that was already empty would "survive" trivially).
    const beforeParsed = JSON.parse(before!) as { battleIndex: number; history: unknown[] };
    expect(beforeParsed.battleIndex).toBe(1);
    expect(beforeParsed.history).toHaveLength(1);

    // Clicking New Game does NOT start a run: the confirm step shows, the title screen
    // stays up, and the save on disk is byte-identical to before the click.
    await page.getByTestId("new-game").click();
    await expect(page.getByTestId("new-game-confirm")).toBeVisible();
    await expect(page.getByTestId("screen-title")).toBeVisible();
    expect(
      await page.evaluate(() => window.tuhGame.screen()),
      "New Game must not have started a run",
    ).toBe("TITLE");
    expect(await stored(page)).toBe(before);

    // Back returns to rest with the save untouched.
    await page.getByTestId("new-game-confirm-back").click();
    await expect(page.getByTestId("new-game-confirm")).toBeHidden();
    await expect(page.getByTestId("new-game")).toBeVisible();
    expect(await stored(page)).toBe(before);
  });

  test("Yes starts a fresh run and the old save's identity is gone", async ({ page }) => {
    await page.goto("/");
    await bankOneVictory(page);
    const before = JSON.parse((await stored(page))!) as { history: unknown[] };
    expect(before.history).toHaveLength(1);

    await page.getByTestId("new-game").click();
    await expect(page.getByTestId("new-game-confirm")).toBeVisible();
    await page.getByTestId("new-game-confirm-yes").click();

    // A run actually started: past the title, onto the scene/briefing the fresh
    // campaign begins on.
    await expect(page.getByTestId("screen-title")).toBeHidden();
    await dismissScene(page);
    await expect(page.getByTestId("screen-briefing")).toBeVisible();

    // The old save's identity — one banked victory — is gone; the fresh save has none.
    const after = JSON.parse((await stored(page))!) as { battleIndex: number; history: unknown[] };
    expect(after.battleIndex).toBe(0);
    expect(after.history).toHaveLength(0);
  });

  /**
   * MUTATION (skip the confirm when a save exists): `newGameClick` reduced to `shell.
   * newGame()` unconditionally → RAN FOR REAL: both tests above go red on
   * `getByTestId("new-game-confirm")` staying hidden instead of becoming visible.
   */

  test("an EMPTY slot skips the confirm entirely", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("screen-title")).toBeVisible();
    await expect(page.getByTestId("new-game-confirm")).toBeHidden();

    await page.getByTestId("new-game").click();
    // The confirm block must never become visible on a fresh slot — asserted
    // immediately, not just "eventually hidden", since a real appearance-then-dismissal
    // would still read as an empty slot skipping the confirm if checked too late.
    await expect(page.getByTestId("new-game-confirm")).toBeHidden();
    await expect(page.getByTestId("screen-title")).toBeHidden();
    await dismissScene(page);
    await expect(page.getByTestId("screen-briefing")).toBeVisible();
  });
  /**
   * MUTATION (`confirmOverwrite = true` unconditionally in `newGameClick`): RAN FOR REAL
   * — red on `expect(page.getByTestId("new-game-confirm")).toBeHidden()` right after the
   * click, `Expected: hidden, Received: visible`, and the run never reaches BRIEFING.
   */
});

test.describe("title: the overwrite step is a real keyboard control", () => {
  test("entering the step moves focus to Yes; Escape backs out with the save intact and focus on New Game", async ({
    page,
  }) => {
    await page.goto("/");
    await bankOneVictory(page);
    const before = await stored(page);

    await page.getByTestId("new-game").click();
    await expect(page.getByTestId("new-game-confirm")).toBeVisible();
    await expect(page.getByTestId("new-game-confirm-yes")).toBeFocused();
    await expect(
      page.locator("#new-game-confirm .confirm-text"),
      "the prompt must be announced, not just painted",
    ).toHaveAttribute("role", "alert");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("new-game-confirm")).toBeHidden();
    await expect(page.getByTestId("new-game")).toBeVisible();
    await expect(page.getByTestId("new-game")).toBeFocused();
    // Escape backed out — it must not have touched the save.
    expect(await stored(page)).toBe(before);
    expect(await page.evaluate(() => window.tuhGame.screen())).toBe("TITLE");
  });
  /**
   * MUTATION A (drop `pendingTitleFocus = "confirm-yes"` from `newGameClick`): RAN FOR
   * REAL — red on `expect(page.getByTestId("new-game-confirm-yes")).toBeFocused()`,
   * focus stayed on the New Game button that was clicked.
   * MUTATION B (delete the TITLE-scoped Escape `keydown` listener in `game.ts`): RAN FOR
   * REAL — red on `expect(page.getByTestId("new-game-confirm")).toBeHidden()` after
   * Escape, the step was still showing (Escape did nothing).
   */
});

test.describe("title: a browser that blocks localStorage entirely", () => {
  test("the storage warning shows on the plaque, not swallowed", async ({ page }) => {
    // "Getters throw": accessing the global `localStorage` property itself throws, the
    // way some privacy configurations behave — stricter than merely `getItem`/`setItem`
    // throwing, which `browserSlot` already tolerated before this fix.
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get(): never {
          throw new DOMException("localStorage is blocked", "SecurityError");
        },
      });
    });
    await page.goto("/");
    await expect(page.getByTestId("screen-title")).toBeVisible();
    await expect(page.getByTestId("title-slot")).toBeVisible();
    await expect(page.getByTestId("title-slot")).toContainText(
      "not letting the game store data",
    );
  });
  /**
   * MUTATION (`note.hidden = slot.kind !== "error"` — drop the `&& storageAvailable`):
   * RAN FOR REAL — red on `expect(page.getByTestId("title-slot")).toBeVisible()`,
   * `Expected: visible, Received: hidden` (the slot reads "empty", not "error", when
   * storage is blocked rather than merely missing a save).
   */
});

test.describe("title: a refused save write is visible even after returning to the title", () => {
  test("#save-error paints above the parchment sheet, not under it", async ({ page }) => {
    await page.goto("/");
    // Every write refused from here on — the same seam `campaign-shell.test.ts`'s
    // "a refused WRITE is surfaced" case uses (a slot whose `write` throws), reached here
    // by breaking the browser primitive underneath `browserSlot` instead of swapping the
    // slot object, since this file drives the real page rather than a headless shell.
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      };
    });
    await page.getByTestId("new-game").click(); // empty slot: starts at once, no confirm
    await dismissScene(page);
    // `quitToTitle` does not clear `saveError` (only `eraseSave` does) — the failure
    // travels back to the title with the player, which is the point: it is what warns
    // them THIS run was never actually saved.
    await page.evaluate(() => window.tuhGame.quitToTitle());
    await expect(page.getByTestId("screen-title")).toBeVisible();
    await expect(page.getByTestId("save-error")).toBeVisible();
    await expect(page.getByTestId("save-error")).toContainText("could NOT be saved");

    // ON TOP, not merely `visible` (Playwright's visibility check does not see
    // `#screen-title`'s opaque parchment painted over it at a higher paint order): the
    // element actually hit by a click at the alert's own centre must be the alert or one
    // of its descendants.
    const onTop = await page.evaluate(() => {
      const alert = document.getElementById("save-error")!;
      const r = alert.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === alert || alert.contains(hit);
    });
    expect(onTop, "something else is painted over #save-error").toBe(true);
  });
  /**
   * MUTATION (drop `#save-error`'s `position: relative; z-index: 6;` in index.html): RAN
   * FOR REAL — `toBeVisible()` still passed (Playwright's visibility check does not model
   * paint order), but `onTop` went `false`, and `elementFromPoint` returned `#screen-title`
   * (or a descendant of it) instead of `#save-error`.
   */
});

test.describe("title: the bundled art is the right asset, by name", () => {
  test("the castle drawing and the ribbon resolve to their own bundled files", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("screen-title")).toBeVisible();
    const castleSrc = await page.locator("#title-castle").getAttribute("src");
    const ribbonSrc = await page.locator("#title-ribbon").getAttribute("src");
    const watermarkSrc = await page.locator("#title-watermark").getAttribute("src");
    expect(castleSrc, "castle <img> did not resolve to the bundled castle asset").toMatch(/castle/);
    expect(ribbonSrc, "banner <img> did not resolve to the bundled ribbon asset").toMatch(/ribbon/);
    expect(watermarkSrc, "watermark <img> did not resolve to the bundled watermark asset").toMatch(
      /watermark/,
    );
    // The three names are pairwise distinct — three empty/identical strings would match
    // every regex above and prove nothing.
    expect(new Set([castleSrc, ribbonSrc, watermarkSrc]).size).toBe(3);
  });

  /**
   * MUTATION (swap the two imports): in `campaign-data.ts`, `TITLE_ART` built with
   * `castle: titleRibbon, ribbon: titleCastle` → RAN FOR REAL: red on the `castleSrc`
   * assertion, `Received: "/assets/ribbon-…webp"` against `/castle/`.
   */
});

/** WCAG 2.1 relative luminance / contrast ratio, computed the same way contrast.spec.ts does. */
function relLum([r, g, b]: [number, number, number]): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [relLum(a), relLum(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const rgbTriple = (rgb: string): [number, number, number] => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) throw new Error(`not an rgb() string: ${rgb}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

/**
 * A screenshot decoded into an in-page canvas, so pixel colour can be read the same way
 * `iso.test.ts`'s recording context proves what reached a canvas — here there is no
 * `<canvas>` under test, so the screenshot IS the only record of what a blend-mode /
 * mask actually painted (`page.evaluate` cannot see CSS compositing, only computed
 * style). `page.screenshot()` with no `clip` captures the viewport, matching the
 * viewport-relative coordinates `getBoundingClientRect()` returns.
 */
async function pixelSampler(page: Page): Promise<{
  avg3: (x: number, y: number) => Promise<[number, number, number]>;
}> {
  const b64 = (await page.screenshot()).toString("base64");
  await page.evaluate(async (src) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("screenshot image failed to decode"));
      img.src = src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    (window as unknown as { __pixelCanvas: HTMLCanvasElement }).__pixelCanvas = canvas;
  }, `data:image/png;base64,${b64}`);
  return {
    // 3×3 average, not a single texel: the parchment ground is a procedural noise
    // texture (overhaul.css `--tooth`/`--stain`), so two adjacent single pixels can
    // legitimately differ by up to ~20/255 with NO seam present — measured directly
    // against plain parchment far from any mask boundary. A single-pixel probe on a
    // noisy ground would be exactly the "cannot come out the other way" shape CLAUDE.md
    // warns about: it would fail on clean renders as often as broken ones. Averaging a
    // small patch is still fully sensitive to a genuine hard edge (confirmed below: the
    // real seam and the `mask-image: none` mutant both read ~29/255 through this same
    // averaging, against a <6 on every genuine edge).
    avg3: (x: number, y: number) =>
      page.evaluate(([px, py]: [number, number]) => {
        const canvas = (window as unknown as { __pixelCanvas: HTMLCanvasElement }).__pixelCanvas;
        const d = canvas.getContext("2d")!.getImageData(Math.round(px) - 1, Math.round(py) - 1, 3, 3).data;
        let r = 0,
          g = 0,
          b = 0;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]!;
          g += d[i + 1]!;
          b += d[i + 2]!;
        }
        const n = d.length / 4;
        return [r / n, g / n, b / n] as [number, number, number];
      }, [x, y] as [number, number]),
  };
}

/**
 * Four visual drifts against `docs/visual/concepts/mockups/title-851x324.png`, found by
 * opening `docs/visual/overhaul/title-{851x324,1000x780}.png` next to it (THE SUITE CANNOT
 * SEE THE SCREEN — src/render/CLAUDE.md). Each fix is a one-property cascade bug: the
 * page-wide `.eyebrow`/`button::before`/`button[disabled]` rules (index.html) set
 * `text-transform`/`opacity`/`transform` that `#screen-title`'s more-specific rules never
 * named, so the LESS specific global rule kept winning for that one property alone —
 * `overhaul.css`'s FIX 4/5/6 comments name each site.
 */
test.describe("title: four drifts from the mockup", () => {
  test("drift 1 — the display title is mixed case and italic, not uppercase", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("screen-title")).toBeVisible();
    // Per the DOM role flip documented in overhaul.css §c and README §c, the DISPLAY
    // TITLE lives in `.eyebrow` (a <p>), not `<h1>` — `<h1>` holds the italic subtitle
    // "The First March". Asserted against the element that actually carries the text,
    // not the tag name a generic page would use for it.
    const title = page.locator("#screen-title .eyebrow");
    await expect(title).toHaveText("The Unseen Hand");
    const style = await title.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { textTransform: cs.textTransform, fontStyle: cs.fontStyle };
    });
    expect(style.textTransform, "text-transform").toBe("none");
    expect(style.fontStyle, "font-style").toBe("italic");
  });
  /**
   * MUTATION (put the uppercase transform back): added `text-transform: uppercase;` to
   * `#screen-title .eyebrow` in overhaul.css → RAN FOR REAL: red on
   * `expect(style.textTransform).toBe("none")`, `Expected: "none", Received: "uppercase"`.
   */

  test("drift 2 — four brass rivets paint on every plaque at rest", async ({ page }) => {
    await page.goto("/");
    const info = await page.locator("#btn-new-game").evaluate((el) => {
      const cs = getComputedStyle(el, "::before");
      return { display: cs.display, backgroundImage: cs.backgroundImage, opacity: cs.opacity, inset: cs.inset };
    });
    expect(info.display, "the rivet layer must actually render").not.toBe("none");
    expect(info.opacity, "opacity").toBe("1");
    expect(info.backgroundImage, "rivet gradient").toContain("radial-gradient");
    // "the plaque's full size": position:absolute + inset:0 on a position:relative
    // button forces the pseudo-element's box to the button's own padding box exactly —
    // the same technique `.codex::before`'s board rivets already use.
    expect(info.inset, "inset:0, sized to the button's own box").toBe("0px");
  });
  /**
   * MUTATION (hide the rivet layer): added `display: none;` to
   * `#screen-title button::before` → RAN FOR REAL: red on
   * `expect(info.display).not.toBe("none")`, `Expected not: "none", Received: "none"`.
   */

  test("drift 3 — disabled Continue is the dark iron plaque, dimmed label, no whole-button fade", async ({
    page,
  }) => {
    await page.goto("/");
    const btn = page.getByTestId("continue");
    await expect(btn).toBeDisabled();
    const info = await btn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, backgroundImage: cs.backgroundImage, opacity: cs.opacity };
    });
    // No opacity on the whole button — the global `button[disabled]{opacity:.4}` (index.html)
    // is what washed the correctly-toned plaque out to a light slab.
    expect(info.opacity, "opacity").toBe("1");
    const label = rgbTriple(info.color);
    expect(label, "label colour is --label-off").toEqual([143, 133, 120]);
    // The gradient's darkest stop must be --plaque-lo, #1b1a17 / rgb(27, 26, 23) — not a
    // flat light grey.
    expect(info.backgroundImage, "darkest stop is --plaque-lo").toContain("rgb(27, 26, 23)");
    const plaqueLo: [number, number, number] = [27, 26, 23];
    const ratio = contrastRatio(label, plaqueLo);
    expect(ratio, "label-off on plaque-lo, AC-V15's 4.5:1 floor").toBeGreaterThanOrEqual(4.5);
  });
  /**
   * MUTATION A (the ground the previous engineer shipped): replaced
   * `#screen-title button:disabled`'s `background-image` with a flat
   * `linear-gradient(180deg, #b8b0a4, #b8b0a4)` (the light grey slab) → RAN FOR REAL: red
   * on `expect(info.backgroundImage).toContain("rgb(27, 26, 23)")`.
   * MUTATION B (the actual regression this drift shipped with): removed the `opacity: 1;`
   * line this fix adds to `#screen-title button:disabled`, restoring the page-wide
   * `button[disabled]{opacity:.4}` → RAN FOR REAL: red on `expect(info.opacity).toBe("1")`,
   * `Expected: "1", Received: "0.4"` — this is the one that actually shipped, and the
   * gradient-string check alone could not have caught it (opacity is a separate property).
   */

  test("drift 4 — the lion watermark dissolves fully at its own box edges, no visible patch", async ({
    page,
  }) => {
    for (const [width, height] of [
      [851, 324],
      [1000, 780],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.getByTestId("screen-title")).toBeVisible();

      const box = await page.locator("#title-watermark").evaluate((el) => el.getBoundingClientRect().toJSON());
      // TOP and RIGHT are not tested here: `box.top === leaf.top` and
      // `box.right === leaf.right` exactly (measured) — the watermark is flush against
      // the LEAF's own edges on those two sides, same as the approved mockup (checked
      // against `docs/visual/concepts/mockups/title-851x324.png`: the lion bleeds to the
      // frame on top/right there too). "One step outside" those two edges is the book's
      // iron rail, not open parchment — an always-hard, intentional edge no mask fades
      // into. LEFT and BOTTOM float inside the leaf over open parchment (`right:0` /
      // `top:0` positioning with `width:58%`/`height:auto`), which is where the reported
      // patch actually was and where a seam is a real, testable possibility.
      const sampler = await pixelSampler(page);
      const midY = (box.top + box.bottom) / 2;
      // The New Game plaque can sit under the watermark's bottom edge at the narrower
      // size (measured: it does at 851×324, not at 1000×780) — sample bottom-edge
      // continuity to the right of the plaque, still inside the watermark's own width.
      const newGame = await page.locator("#btn-new-game").evaluate((el) => el.getBoundingClientRect().toJSON());
      const bottomX = newGame.right < box.right - 20 ? (newGame.right + box.right) / 2 : (box.left + box.right) / 2;

      const leftOut = await sampler.avg3(box.left - 1, midY);
      const leftIn = await sampler.avg3(box.left + 1, midY);
      const bottomOut = await sampler.avg3(bottomX, box.bottom + 1);
      const bottomIn = await sampler.avg3(bottomX, box.bottom - 1);

      const edges: Array<[string, [number, number, number], [number, number, number]]> = [
        ["left", leftOut, leftIn],
        ["bottom", bottomOut, bottomIn],
      ];
      for (const [name, out, inn] of edges) {
        const delta = [out[0] - inn[0], out[1] - inn[1], out[2] - inn[2]].map(Math.abs);
        expect(Math.max(...delta), `${width}x${height} ${name} edge, out=${out} in=${inn}`).toBeLessThan(6);
      }
    }
  });
  /**
   * MUTATION (kill the feather): `#screen-title .watermark { mask-image: none; }` → RAN
   * FOR REAL at 1000×780: the left-edge delta went from [1,2,2] (max 2) to
   * [15.1,23.3,29.2] (max 29.2) — comfortably red against the <6 bar.
   */
});
