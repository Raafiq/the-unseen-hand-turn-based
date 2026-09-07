import { test, expect, type Page } from "@playwright/test";
import { dismissScene, startNewGame } from "./helpers.js";
import { GROUNDS, paintedStops } from "./contrast-helpers.js";

/**
 * The overhaul look's scene player (docs/visual/concepts/README.md §f, ADR-0040), built
 * from the approved mockup `coverage/overhaul/scene.html`. The DOM is the one
 * `src/render/scene.ts` already builds — every assertion below drives that same seam
 * (`e2e/portraits.spec.ts`'s walk to a real-art speaker), never a hard-coded frame.
 */

/**
 * A screenshot decoded into an in-page canvas, so pixel colour can be read the same way
 * `title.spec.ts`'s own `pixelSampler` proves what a mask/blend actually painted —
 * duplicated locally rather than imported, since that one is not exported and this file
 * owns its own fixtures per `src/render/CLAUDE.md`. `page.evaluate` sees computed CSS,
 * never composited pixels, so this is the only way to prove nothing else painted a
 * ground into the narration column (drift 2).
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

async function playCurrentBattle(page: Page): Promise<void> {
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await page.evaluate(() => window.tuhGame.autoplay());
  await page.getByTestId("conclude").click();
}

test("scene: backdrop resolves to the bundled night asset by name", async ({ page }) => {
  await page.goto("/");
  await startNewGame(page);
  await expect(page.getByTestId("screen-scene")).toBeVisible();

  const backdrop = page.locator("#scene-backdrop");
  await expect(backdrop).toHaveCount(1);
  const src = await backdrop.getAttribute("src");
  // A ~40 KB webp is well past Vite's 4 KB inline limit, so this is a hashed URL, the
  // same shape as the portrait/title-art assertions elsewhere in this suite.
  expect(src ?? "").toMatch(/^(data:|\/|https?:)/);
  expect(src ?? "", "the scene backdrop is not showing SCENE_ART.night").toContain("night");
  expect(await backdrop.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  // MUTATION this catches: bind `#scene-backdrop`'s src to `TITLE_ART.castle` instead of
  // `SCENE_ART.night` in `src/render/game.ts` → `src` contains "castle", not "night", red.
});

test("scene: narration holds no portrait", async ({ page }) => {
  // The prologue closes on a narration line (no speaker) — reached by "Show all", the
  // same seam `e2e/campaign.spec.ts`'s AC-M9 test uses.
  await page.goto("/");
  await startNewGame(page);
  await expect(page.getByTestId("screen-scene")).toBeVisible();
  await page.getByTestId("scene-story-all").click();

  const figure = page.getByTestId("scene-story-portrait");
  await expect(figure).toBeVisible();
  await expect(figure).toHaveAttribute("data-state", "none");
  // Scoped off the house ribbon's own `<img class="ribbon-charge">`, which is always
  // present in both states (the ribbon belongs to the frame, not the speaker) — see
  // "scene: the ribbon carries the house lion charge" below.
  await expect(figure.locator("img:not(.ribbon-charge)")).toHaveCount(0);
  await expect(figure.locator("figcaption")).toHaveCount(0);
});

test("scene: the portrait frame breaks the rail for a real-art speaker", async ({ page }) => {
  // Walk to the interlude before battle 3 (`sc-interlude-ford`) — the one scene beat
  // where a real-art unit (Briar, `archer-f`) speaks first, rather than the prologue's
  // placeholder-only cast. Both battles are won by the balance probe on both seats
  // (AC-M1's shipped seam), the same walk `e2e/portraits.spec.ts` uses one step further.
  await page.goto("/");
  await startNewGame(page);
  await dismissScene(page); // the prologue
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
  await playCurrentBattle(page);
  await expect(page.getByTestId("screen-after")).toBeVisible();
  await page.getByTestId("next").click();
  await dismissScene(page); // no interlude authored before b2
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
  await playCurrentBattle(page);
  await expect(page.getByTestId("screen-after")).toBeVisible();
  await page.getByTestId("next").click();
  await expect(page.getByTestId("screen-scene")).toBeVisible();

  const figure = page.getByTestId("scene-story-portrait");
  await expect(figure).toHaveAttribute("data-state", "art");
  // Scoped off the house ribbon's own `<img class="ribbon-charge">` — see "scene: the
  // ribbon carries the house lion charge" below.
  const speakerImg = figure.locator("img:not(.ribbon-charge)");
  await expect(speakerImg).toHaveCount(1);
  const src = await speakerImg.getAttribute("src");
  expect(src ?? "", "the interlude's first speaker is not Briar's archer-f asset").toContain(
    "archer-f",
  );

  const dims = await page.evaluate(() => {
    const card = document.querySelector("#screen-scene .card")!;
    const cardRect = card.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(card).paddingTop);
    const fig = document.querySelector('[data-testid="scene-story-portrait"]')!;
    return { boxTop: cardRect.top + pad, figTop: fig.getBoundingClientRect().top };
  });
  expect(
    dims.boxTop - dims.figTop,
    "the portrait frame does not clear the dialogue box's own top edge",
  ).toBeGreaterThanOrEqual(8);
  // MUTATION this catches: `#screen-scene .portrait{height:calc(100% + 2.15em)}` →
  // `height:100%` (dropping the overhang) pulls the frame's top back down level with the
  // dialogue box's own top, and this assertion goes red.
});

test("scene: the house ribbon is blue while speaking, grey for narration — computed colour", async ({
  page,
}) => {
  await page.goto("/");
  await startNewGame(page);
  await expect(page.getByTestId("screen-scene")).toBeVisible();

  const figure = page.getByTestId("scene-story-portrait");
  await expect(figure).toHaveAttribute("data-state", "pending"); // Vance speaks first
  const speaking = await figure.evaluate((el) => getComputedStyle(el, "::after").backgroundColor);
  expect(speaking).toBe(GROUNDS.houseBlue);

  await page.getByTestId("scene-story-all").click();
  await expect(figure).toHaveAttribute("data-state", "none");
  const narration = await figure.evaluate((el) => getComputedStyle(el, "::after").backgroundColor);
  expect(narration).toBe(GROUNDS.houseGrey);
  expect(narration, "narration's ribbon must be a DIFFERENT computed colour").not.toBe(speaking);
  // MUTATION this catches: swap `--house-blue`/`--house-grey` between the two rules
  // (`.portrait::after` and `.portrait[data-state="none"]::after`) — both exact-equality
  // assertions above then compare against the WRONG declared token and go red.
});

test("scene: the ribbon carries the house lion charge, resolved by name, in both states", async ({
  page,
}) => {
  await page.goto("/");
  await startNewGame(page);
  await expect(page.getByTestId("screen-scene")).toBeVisible();

  const figure = page.getByTestId("scene-story-portrait");
  const charge = figure.locator("img.ribbon-charge");

  await expect(figure).toHaveAttribute("data-state", "pending"); // Vance speaks first
  await expect(charge).toHaveCount(1);
  const speakingSrc = await charge.getAttribute("src");
  expect(
    speakingSrc ?? "",
    "the ribbon charge does not resolve to the bundled ribbon asset while speaking",
  ).toContain("ribbon");

  await page.getByTestId("scene-story-all").click();
  await expect(figure).toHaveAttribute("data-state", "none");
  await expect(charge, "the charge layer must survive into narration too").toHaveCount(1);
  const narrationSrc = await charge.getAttribute("src");
  expect(
    narrationSrc ?? "",
    "the ribbon charge does not resolve to the bundled ribbon asset in narration",
  ).toContain("ribbon");
  // MUTATION this catches: in scene.ts's `paintPortrait`, remove the
  // `figure.append(ribbonCharge)` call (the charge layer) — `charge` count drops to 0 in
  // both states and this test goes red before either `src` assertion is reached.
});

test("scene: narration's ribbon is the SAME box as speaking's, and the column paints nothing else", async ({
  page,
}) => {
  await page.goto("/");
  await startNewGame(page);
  await expect(page.getByTestId("screen-scene")).toBeVisible();

  const figure = page.getByTestId("scene-story-portrait");
  await expect(figure).toHaveAttribute("data-state", "pending");
  // The FIELD (`.portrait::after`) is a pseudo-element — `getBoundingClientRect` cannot
  // reach it, but `getComputedStyle(el, "::after")` resolves an absolutely-positioned
  // pseudo's `left/top/width/height` to real pixels, which is what makes this a genuine
  // bounding-box check rather than a colour-only one.
  const speakingBox = await figure.evaluate((el) => {
    const cs = getComputedStyle(el, "::after");
    return {
      left: parseFloat(cs.left),
      top: parseFloat(cs.top),
      width: parseFloat(cs.width),
      height: parseFloat(cs.height),
    };
  });

  await page.getByTestId("scene-story-all").click();
  await expect(figure).toHaveAttribute("data-state", "none");
  const narrationBox = await figure.evaluate((el) => {
    const cs = getComputedStyle(el, "::after");
    return {
      left: parseFloat(cs.left),
      top: parseFloat(cs.top),
      width: parseFloat(cs.width),
      height: parseFloat(cs.height),
    };
  });

  for (const key of ["left", "top", "width", "height"] as const) {
    expect(
      Math.abs(narrationBox[key] - speakingBox[key]),
      `ribbon field's ${key} drifted between states: speaking=${speakingBox[key]} narration=${narrationBox[key]}`,
    ).toBeLessThanOrEqual(2);
  }
  // MUTATION this catches: restore the old narration override (`left:50%; top:-0.4em;
  // width:2.1em; height:auto; bottom:0.5em; transform:translateX(-50%)`) on
  // `.portrait[data-state="none"]::after` — `narrationBox` then reports a materially
  // different box (notably `height`, no longer 5.1em) and the loop above goes red.

  // The rivets (`.portrait::before`) are the OTHER thing narration must not paint. Not
  // pixel-testable the same way as the leak below: `.portrait[data-state="none"]` sets
  // its OWN `visibility: visible` (deliberately — it is what keeps the ribbon showing
  // through a hidden `.card`, see the CSS comment), so hiding `.card` to get a "pure
  // backdrop" reference leaves the portrait's own rivets rendering regardless, and a
  // colour-delta check against that reference cannot see them. Asserted directly on
  // the declared value instead.
  const rivetsContent = await figure.evaluate((el) => getComputedStyle(el, "::before").content);
  expect(rivetsContent, "the portrait's corner rivets must not paint in narration").toBe("none");
  // MUTATION this catches: change `#screen-scene .portrait[data-state="none"]::before
  // { content: none; }` back to `content: "";` — `rivetsContent` reads `'""'` instead
  // of `"none"`, red.

  // "The empty portrait column must not paint a slab": sample three points down the
  // MIDDLE of the column (clear of the ribbon, which hangs off the top-left corner),
  // against the SAME points with the whole card hidden, i.e. against the raw backdrop.
  // Unlike the rivets, this leak is on `.card` ITSELF (not `.portrait`), which has no
  // such visibility override, so hiding `.card` genuinely isolates the backdrop here.
  const figBox = await figure.boundingBox();
  expect(figBox, "portrait figure has no box").not.toBeNull();
  const sampleX = figBox!.x + figBox!.width * 0.62;
  const sampleYs = [0.3, 0.6, 0.9].map((f) => figBox!.y + figBox!.height * f);

  const narrationSampler = await pixelSampler(page);
  const narrationColours = await Promise.all(sampleYs.map((y) => narrationSampler.avg3(sampleX, y)));

  await page.evaluate(() => {
    (document.querySelector("#screen-scene .card") as HTMLElement).style.visibility = "hidden";
  });
  const backdropSampler = await pixelSampler(page);
  const backdropColours = await Promise.all(sampleYs.map((y) => backdropSampler.avg3(sampleX, y)));
  await page.evaluate(() => {
    (document.querySelector("#screen-scene .card") as HTMLElement).style.visibility = "";
  });

  for (let i = 0; i < sampleYs.length; i++) {
    const a = narrationColours[i]!;
    const b = backdropColours[i]!;
    const delta = Math.max(...[0, 1, 2].map((c) => Math.abs(a[c]! - b[c]!)));
    expect(
      delta,
      `column point ${i} paints something other than the backdrop: narration=${a} backdrop=${b}`,
    ).toBeLessThan(12);
  }
  // MUTATION this catches: drop `#screen-scene .card { background-color: transparent;
  // background-image: none; box-shadow: none; }` — the page-wide `.card` rule's own
  // light parchment wash then leaks across the full grid box (all three columns,
  // including the portrait's), and at least one delta above crosses 12, red.
});

test("scene: the iron band under the dialogue box actually paints — A/B on its own tokens", async ({
  page,
}) => {
  // `.card::before` (parchment) and `.card::after` (the iron band, `--iron`/`--iron-hi`/
  // `--iron-lo`) both target `grid-column: 2/4; grid-row: 1/3` — without an inset between
  // them the two resolve to the identical box, and the iron sits at z-index -1, directly
  // behind the parchment, so none of it reaches the screen (review found 159 of 275,724
  // card pixels moving under this same probe, i.e. effectively nothing). Recolouring the
  // iron's own custom properties and diffing the card's rendered pixels is the only way
  // to prove the band paints ANYTHING, rather than reading the CSS as though a declared
  // gradient were a rendered one.
  await page.goto("/");
  await startNewGame(page);
  await expect(page.getByTestId("screen-scene")).toBeVisible();

  const card = page.locator("#screen-scene .card");
  const box = await card.boundingBox();
  expect(box, "the dialogue card has no box").not.toBeNull();
  const clip = {
    x: Math.round(box!.x),
    y: Math.round(box!.y),
    width: Math.round(box!.width),
    height: Math.round(box!.height),
  };

  const before = (await page.screenshot({ clip })).toString("base64");
  await page.evaluate(() => {
    const el = document.getElementById("screen-scene")!;
    el.style.setProperty("--iron", "magenta");
    el.style.setProperty("--iron-hi", "magenta");
    el.style.setProperty("--iron-lo", "magenta");
  });
  const after = (await page.screenshot({ clip })).toString("base64");
  await page.evaluate(() => {
    const el = document.getElementById("screen-scene")!;
    el.style.removeProperty("--iron");
    el.style.removeProperty("--iron-hi");
    el.style.removeProperty("--iron-lo");
  });

  const changedFraction = await page.evaluate(async ([beforeSrc, afterSrc]) => {
    const load = (b64: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("screenshot decode failed"));
        img.src = `data:image/png;base64,${b64}`;
      });
    const [a, b] = await Promise.all([load(beforeSrc), load(afterSrc)]);
    const draw = (img: HTMLImageElement) => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      return c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    };
    const dataA = draw(a);
    const dataB = draw(b);
    let changed = 0;
    const total = dataA.length / 4;
    for (let i = 0; i < dataA.length; i += 4) {
      const delta =
        Math.abs(dataA[i]! - dataB[i]!) +
        Math.abs(dataA[i + 1]! - dataB[i + 1]!) +
        Math.abs(dataA[i + 2]! - dataB[i + 2]!);
      if (delta > 30) changed++;
    }
    return changed / total;
  }, [before, after] as const);

  expect(
    changedFraction * 100,
    "recolouring the iron band's own tokens should move a real fraction of the card's pixels",
  ).toBeGreaterThanOrEqual(2);
  // MUTATION this catches: shrink `#screen-scene .card::before`'s `margin: var(--rv)`
  // back to nothing — the parchment reoccupies the exact box `.card::after` paints, the
  // iron band is once again fully hidden behind it, and `changedFraction` collapses under
  // 2%, red.
});

test("scene: the ? help dialog swallows Space and Escape instead of leaking to the beat", async ({
  page,
}) => {
  // The document-level SCENE keydown handler (`game.ts`) advances on Space and skips on
  // Escape from ANYWHERE on the screen, because the whole screen is one scene with one
  // command — but the `?` help panel is a `<dialog>` that opens over every screen,
  // including this one, and its own Escape-to-close is the browser's DEFAULT ACTION for
  // that keydown. Without a bail, Space reaches the scene handler behind the open modal
  // (the player reads ahead blind) and Escape's `ev.preventDefault()` suppresses the
  // dialog's own close on top of skipping the beat — two bugs on one key.
  await page.goto("/");
  await startNewGame(page);
  await expect(page.getByTestId("screen-scene")).toBeVisible();

  const progress = page.getByTestId("scene-story-progress");
  const linesBefore = await progress.innerText();

  const panel = page.getByTestId("help");
  await page.getByTestId("help-open").click();
  await expect(panel).toBeVisible();
  // `showModal()` autofocuses the panel's own Close button, and Space on a focused
  // BUTTON is a native activation the browser fires regardless of any keydown handler
  // (existing target-tagName check already bails for it) — that would close the panel
  // for a reason unrelated to the bug under test. Move focus to the scrollable topics
  // region instead (`tabindex="0"`, `role="region"`, not a button), which is where a
  // player who has started reading the panel actually has focus.
  await page.getByTestId("help-body").focus();

  await page.keyboard.press("Space");
  await expect(panel, "Space must not advance the beat behind the open dialog").toBeVisible();
  expect(await progress.innerText(), "the beat advanced while the dialog was open").toBe(
    linesBefore,
  );

  await page.keyboard.press("Escape");
  await expect(panel, "Escape must close the dialog, not just skip past it").toBeHidden();
  expect(await progress.innerText(), "Escape skipped the beat instead of only closing the dialog").toBe(
    linesBefore,
  );
  // MUTATION this catches: remove the `document.querySelector("dialog[open]")` bail from
  // the SCENE keydown handler in `game.ts` — Space's `toBeVisible()`/progress-unchanged
  // pair goes red first (the handler advances the model straight through), and even if
  // that were somehow tolerated, Escape's `toBeHidden()` goes red next: `preventDefault()`
  // on the keydown suppresses the dialog's native close, so the panel is still open.
});

test("scene: the help button sits top-right on this screen, clear of every plaque and the card", async ({
  page,
}) => {
  // Measured with Pillow against `docs/visual/concepts/mockups/scene-{w}x{h}.png`'s own
  // card right edge (a light-parchment→dark-backdrop column scan), not eyeballed.
  const mockupCardRight: Record<string, number> = {
    "640x300": 625,
    "851x324": 834,
    "1000x780": 881,
  };
  for (const [w, h] of [
    [640, 300],
    [851, 324],
    [1000, 780],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await startNewGame(page);
    await expect(page.getByTestId("screen-scene")).toBeVisible();

    const help = await page.getByTestId("help-open").boundingBox();
    const card = await page.locator("#screen-scene .card").boundingBox();
    expect(help, `${w}x${h} help button has no box`).not.toBeNull();
    expect(card, `${w}x${h} card has no box`).not.toBeNull();

    // Intersects: the help disc must clear the title plaque, the three scene-controls
    // buttons, AND the card itself.
    const plaques = await Promise.all(
      [
        page.getByTestId("scene-title"),
        page.getByTestId("scene-story-more"),
        page.getByTestId("scene-story-all"),
        page.getByTestId("scene-continue"),
      ].map((l) => l.boundingBox()),
    );
    const intersects = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ): boolean =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

    for (const box of [card, ...plaques]) {
      if (box === null) continue; // More/Show all retire once the beat is fully read
      expect(
        intersects(help!, box),
        `${w}x${h}: help button ${JSON.stringify(help)} intersects ${JSON.stringify(box)}`,
      ).toBe(false);
    }

    const cardRight = card!.x + card!.width;
    const wanted = mockupCardRight[`${w}x${h}`]!;
    expect(
      Math.abs(cardRight - wanted),
      `${w}x${h}: card right edge ${cardRight} is not within 12px of the mockup's ${wanted}`,
    ).toBeLessThanOrEqual(12);
  }
  // MUTATION this catches: move `#screen-scene:not([hidden]) ~ .help-btn` back to
  // `bottom: 18px` (index.html) — the help disc returns to the Continue-button corner,
  // the `intersects(help, continueBox)` check (and, at narrower folds, the card check)
  // goes true, and the loop's `.toBe(false)` assertion goes red.
});

test("scene: at 851x324, Show all scrolls to the end, and everything fits the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 851, height: 324 });
  await page.goto("/");
  await startNewGame(page);
  await expect(page.getByTestId("screen-scene")).toBeVisible();

  const linesBox = page.locator('[data-testid="scene-story-lines"]');

  // The three controls (More, Show all, Continue) plus the lines box, all fit the
  // viewport BEFORE Show all is pressed — the moment they are all legitimately visible
  // together (More/Show all retire once the beat is fully read). NOT a "no page scroll"
  // assertion — `#screen-scene`'s own `overflow:hidden` (the title screen's `body:has(
  // ...)` rule, extended to this id) would make that vacuous regardless of whether
  // anything actually fit.
  for (const locator of [
    page.getByTestId("scene-story-more"),
    page.getByTestId("scene-story-all"),
    page.getByTestId("scene-continue"),
    linesBox,
  ]) {
    const b = await locator.boundingBox();
    expect(b, "control has no box").not.toBeNull();
    expect(b!.x).toBeGreaterThanOrEqual(0);
    expect(b!.y).toBeGreaterThanOrEqual(0);
    expect(b!.x + b!.width).toBeLessThanOrEqual(851 + 1);
    expect(b!.y + b!.height).toBeLessThanOrEqual(324 + 1);
  }

  await page.getByTestId("scene-story-all").click();

  const scroll = await linesBox.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  // The prologue is FOUR lines; README §f measured two fitting at 851x324 and the rest
  // scrolling — a fixture that already fit would score identically whether or not the
  // scroll-to-end behaviour exists.
  expect(scroll.scrollHeight, "the box does not overflow at this size").toBeGreaterThan(
    scroll.clientHeight,
  );

  // The LAST line's box is inside the container's own visible box — i.e. it actually
  // scrolled to the end, not merely appended off-screen.
  const positions = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="scene-story-lines"]') as HTMLElement;
    const lines = box.querySelectorAll("p.line");
    const lastLine = lines[lines.length - 1] as HTMLElement;
    const boxRect = box.getBoundingClientRect();
    const lineRect = lastLine.getBoundingClientRect();
    return {
      boxTop: boxRect.top,
      boxBottom: boxRect.bottom,
      lineTop: lineRect.top,
      lineBottom: lineRect.bottom,
    };
  });
  expect(
    positions.lineTop,
    "last line's top is above the box's own visible top",
  ).toBeGreaterThanOrEqual(positions.boxTop - 1);
  expect(
    positions.lineBottom,
    "last line's bottom is below the box's own visible bottom",
  ).toBeLessThanOrEqual(positions.boxBottom + 1);
  // MUTATION this catches: remove the scroll-to-end (leave `scrollTop` at its default 0
  // after the append) — the last line then renders below the visible box, `lineBottom`
  // exceeds `boxBottom` by roughly the height of the lines that scrolled out, red.

  // More and Show all retire once the beat is fully read — Continue and the (still
  // in-viewport, checked above) lines box are what remain.
  await expect(page.getByTestId("scene-story-more")).toBeHidden();
  await expect(page.getByTestId("scene-story-all")).toBeHidden();
});

test("scene: contrast — the name plate's own ground, and every text element clears its bar", async ({
  page,
}) => {
  await page.goto("/");
  await startNewGame(page);
  await expect(page.getByTestId("screen-scene")).toBeVisible();

  // `.who` exists only once scene.ts has actually painted a beat — unlike `.card`/
  // `.card::before`, which `groundsAreReal()` (contrast.spec.ts) can already guard at
  // page load regardless of state.
  const plate = await page.evaluate(
    () => getComputedStyle(document.querySelector("#screen-scene .who")!).backgroundImage,
  );
  expect(paintedStops(plate), "scene plate grounds, as a set").toEqual(
    [...GROUNDS.scenePlate].sort(),
  );

  // Every text-bearing element on the scene screen, measured the same way
  // `contrast.spec.ts`'s `failures()` does — reimplemented narrowly here (worst opaque
  // stop found walking up the ancestor chain, falling back to the dialogue box's own
  // `::before` field for bare text) rather than imported, since the walk runs inside
  // `page.evaluate` and must be self-contained.
  const findings = await page.evaluate(() => {
    type RGBA = [number, number, number, number];
    const parse = (s: string): RGBA | null => {
      const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/.exec(s);
      return m ? [+m[1]!, +m[2]!, +m[3]!, m[4] === undefined ? 1 : +m[4]!] : null;
    };
    const lum = (c: RGBA): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: RGBA, b: RGBA): number => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    /** Every opaque stop an element's OWN `background-image`/`background-color` paints. */
    const ownGrounds = (node: Element): RGBA[] => {
      const s = getComputedStyle(node);
      const out: RGBA[] = [];
      for (const m of s.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []) {
        const c = parse(m);
        if (c && c[3] === 1) out.push(c);
      }
      const bg = parse(s.backgroundColor);
      if (bg && bg[3] === 1) out.push(bg);
      return out;
    };

    const scene = document.getElementById("screen-scene")!;
    // The dialogue box's field is a PSEUDO-element (`::before`), never a DOM ancestor the
    // walk below can reach — read directly, once, as the fallback for bare text.
    const boxFieldStyle = getComputedStyle(document.querySelector("#screen-scene .card")!, "::before");
    const boxStops: RGBA[] = [];
    for (const m of boxFieldStyle.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []) {
      const c = parse(m);
      if (c && c[3] === 1) boxStops.push(c);
    }

    const out: { where: string; ratio: number; need: number }[] = [];
    let examined = 0;
    for (const el of Array.from(scene.querySelectorAll<HTMLElement>("*"))) {
  const own = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
      );
      if (!own) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      examined += 1;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
      const fg = parse(cs.color);
      if (!fg || fg[3] === 0) continue;
      const px = parseFloat(cs.fontSize);
      const bold = +cs.fontWeight >= 700;
      const need = px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;

      // Walk up until something paints its own opaque ground; h1/.who/button find one
      // directly, bare text (.line/.scene-progress) never does and falls to the
      // dialogue box's own field (a pseudo, so it is the fallback rather than found by
      // the walk itself). `.card` (the root) is EXCLUDED from this check on purpose —
      // its own paint is the iron band, not what dialogue-box text sits on; without the
      // exclusion, `.line`/`.scene-progress` would stop there and measure against iron
      // tones nowhere near either element visually.
      const root = el.closest("#screen-scene .card");
      let bases: RGBA[] | null = null;
      let node: Element | null = el;
      while (node && node !== scene) {
        if (node !== root) {
          const g = ownGrounds(node);
          if (g.length > 0) {
            bases = g;
            break;
          }
        }
        if (node === root) break;
        node = node.parentElement;
      }
      bases = bases ?? boxStops;
      if (bases.length === 0) continue;

      let worst = Infinity;
      for (const base of bases) worst = Math.min(worst, ratio(fg, base));
      if (worst < need) {
        out.push({ where: `${el.tagName}.${el.className}`, ratio: Math.round(worst * 100) / 100, need });
      }
    }
    return { out, examined };
  });
  // EXACT, not a floor: a screen that rendered NOTHING (a beat that failed to mount,
  // scene.ts throwing before it appended a single line) would also produce zero
  // findings below, passing identically to a fully-legible one. Eight is the prologue's
  // first-line state, scoped to `#screen-scene`: the title plaque, the name plate, one
  // dialogue line, the pending-placeholder figcaption, the progress readout, and the
  // three controls (More, Show all, Continue).
  expect(findings.examined, "scene screen text-element count").toBe(8);
  expect(findings.out, `contrast failures: ${JSON.stringify(findings.out)}`).toEqual([]);
  // MUTATION this catches: colour `p.line` with `--ink-soft` (index.html's own softer ink
  // role, which README §a note 1 says fails on this darker parchment) — `p.line`'s `color`
  // no longer resolves to `--ink`, its ratio against the box-parch family drops under
  // 4.5, and this list is no longer empty.
});
