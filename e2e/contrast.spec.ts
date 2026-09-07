import { test, expect, type Page } from "@playwright/test";
import { closeDrawer, dismissScene, openDrawer, startNewGame } from "./helpers.js";
import { prepEveryMember } from "./helpers";
import { GROUNDS, paintedStops } from "./contrast-helpers.js";

/**
 * Text contrast on the parchment sheets, measured.
 *
 * WHY THIS FILE EXISTS — a11y.spec.ts CANNOT MAKE THIS CLAIM. axe-core refuses to
 * judge contrast when it cannot resolve a flat background colour, and every parchment
 * surface is a gradient under two noise layers. On the briefing screen axe returned
 * **2 nodes measured and 106 "incomplete"** while reporting zero violations: a green
 * run that would have looked identical had the ink been unreadable. That is the exact
 * shape of evidence this repo forbids, so `a11y.spec.ts` now disables the
 * `color-contrast` rule outright and the claim lives here instead.
 *
 * WHAT IS MEASURED. For every element holding visible text, the ratio is computed
 * against the WORST ground that element could actually be painted on — not one
 * sampled pixel. A sheet's ground varies between the light and dark stops of its
 * gradient, so a colour is only accepted if it clears the bar against BOTH ends. Any
 * translucent layer between the text and the sheet (a `.slot`'s wash, a hover fill) is
 * composited in; any element that paints its own opaque fill (the sanguine command
 * buttons, the gold price seals) ends the walk and becomes the ground itself, with
 * every stop of its own gradient treated as a candidate.
 *
 * ACKNOWLEDGED GAP, stated rather than hidden: the stain and tooth noise layers are
 * not modelled. Both only reach strength at the sheet's margins, outside the ruled
 * frame and well outside the content padding, and both DARKEN the parchment — so
 * ignoring them is conservative for dark ink on a light sheet, which is every
 * parchment surface here. It would not be conservative if light text were ever placed
 * on parchment; nothing does that today, and this comment is the reason to re-check
 * if something starts.
 */

/**
 * WCAG 2.1 AA thresholds, applied inside the page. Large text is ≥24px, or ≥18.66px
 * when bold; everything else takes the normal bar.
 */
const AA = { normal: 4.5, large: 3 } as const;

/**
 * The extreme stops of each sheet's ground gradient — `GROUNDS`, and the `contrastRatio`
 * formula this file's `failures()` mirrors in-page, moved to `contrast-helpers.ts` so a
 * second spec (`campaign.spec.ts`'s with-save Continue-plaque check) can reuse the exact
 * declared grounds and the exact WCAG math instead of hand-rolling a copy that could
 * quietly drift from what this file actually measures.
 */

type Finding = { where: string; text: string; ratio: number; need: number; color: string; on: string };

/**
 * The opaque `rgb(...)` gradient stops actually painted in a `background-image` string,
 * deduplicated and order-independent — used to compare against a declared list as SETS
 * (see `groundsAreReal` below), not merely check the declared ones are present among
 * possibly more.
 */
/**
 * Assert the declared grounds still match the stylesheet. Without this the whole file
 * could be measuring against a palette the page stopped using.
 */
async function groundsAreReal(page: Page): Promise<void> {
  const painted = await page.evaluate(() => {
    const grab = (sel: string, pseudo?: string): string => {
      const el = document.querySelector(sel);
      if (!el) return "";
      return getComputedStyle(el, pseudo).backgroundImage;
    };
    return {
      // NOT `#screen-scene`'s own `.card` — it sits earlier in DOM order than the
      // briefing/prep cards this is meant to describe, so an un-scoped first-match query
      // would silently start reading the scene's iron band instead of the parchment.
      sheet: grab(".card:not(.board):not(#screen-scene .card)") || grab(".panel"),
      body: getComputedStyle(document.body).backgroundImage,
      leaf: grab("#screen-title .leaf"),
      // The VISIBLE New Game button, not `#screen-title button` (the first match in DOM
      // order — the overwrite step's hidden Yes button, which precedes it in the markup).
      // Both happen to share the generic plaque rule today, but `#btn-new-game` is never
      // `:disabled` and never `hidden`, so it is the one selector guaranteed to describe
      // what a player actually sees rather than whichever button sits first in the DOM.
      plaque: grab("#btn-new-game"),
      // The scene player's own surfaces (docs/visual/concepts/README.md §f): the
      // dialogue box field and the iron band, both pseudo-elements of `.card` (hence
      // the second `getComputedStyle` argument on each) — `.card` itself paints
      // NEITHER any more (src/render/overhaul.css: moving the iron band off `.card`
      // itself and onto a column-scoped `::after` is what stopped it bleeding into
      // the portrait's own grid column, drift 2 of the scene-player visual pass).
      // NOT the name plate (`.who`) — scene.ts builds it dynamically once a beat is
      // showing, and nothing has set one yet while the title screen is up;
      // `e2e/scene.spec.ts` guards that one instead, where a beat is actually on
      // screen.
      sceneBox: grab("#screen-scene .card", "::before"),
      sceneIron: grab("#screen-scene .card", "::after"),
    };
  });
  for (const c of GROUNDS.parchment) expect(painted.sheet, `parchment stop ${c}`).toContain(c);
  for (const c of GROUNDS.table) expect(painted.body, `table stop ${c}`).toContain(c);
  // Only meaningful while the title screen is up — every caller of this function goes
  // through it (both call sites below start at "/"), so `.leaf`/a plaque `button` are
  // always in the DOM here.
  //
  // EQUALITY, not "each declared stop is present": a `toContain` subset check cannot see
  // an undeclared stop added alongside the declared ones — this file would keep measuring
  // against a palette that no longer describes everything the page paints, and a real
  // darkening could ship on an extra, unlisted stop while every declared one still passed.
  expect(paintedStops(painted.leaf), "leaf grounds, as a set").toEqual([...GROUNDS.leaf].sort());
  expect(paintedStops(painted.plaque), "plaque grounds, as a set").toEqual(
    [...GROUNDS.plaque].sort(),
  );
  expect(paintedStops(painted.sceneBox), "scene box grounds, as a set").toEqual(
    [...GROUNDS.sceneBox].sort(),
  );
  for (const c of GROUNDS.sceneIron) expect(painted.sceneIron, `iron stop ${c}`).toContain(c);
}

/** Every text element on the current screen that falls below its AA bar. */
async function failures(page: Page): Promise<Finding[]> {
  return page.evaluate(({ grounds, aa }) => {
    type RGBA = [number, number, number, number];

    const parse = (s: string): RGBA | null => {
      const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/.exec(s);
      return m ? [+m[1]!, +m[2]!, +m[3]!, m[4] === undefined ? 1 : +m[4]!] : null;
    };
    /** src over dst, both premultiplied by nothing; dst is assumed opaque. */
    const over = (src: RGBA, dst: RGBA): RGBA => [
      src[0] * src[3] + dst[0] * (1 - src[3]),
      src[1] * src[3] + dst[1] * (1 - src[3]),
      src[2] * src[3] + dst[2] * (1 - src[3]),
      1,
    ];
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
    /** Opaque colours an element paints itself: its own fill plus every gradient stop. */
    const ownGrounds = (cs: CSSStyleDeclaration): RGBA[] => {
      const out: RGBA[] = [];
      const img = cs.backgroundImage;
      if (img && img !== "none") {
        // Gradient stops only — the noise layers are url() and carry no rgb().
        for (const m of img.matchAll(/rgba?\([^)]*\)/g)) {
          const c = parse(m[0]);
          if (c && c[3] === 1) out.push(c);
        }
      }
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] === 1) out.push(bg);
      return out;
    };

    const sheetOf = (el: Element): { root: Element | null; stops: string[] } => {
      const root = el.closest(".card, .panel, dialog");
      if (!root) return { root: null, stops: [...grounds.table] };
      // The playtest aside deliberately drops the parchment and sits on the table.
      if (root.classList.contains("logbox")) return { root, stops: [...grounds.table] };
      // The scene player's `.card` is painted by a PSEUDO-element (`::before`), which this
      // walk can never see as an ancestor no matter how far it climbs — so bare text with
      // no ground of its own (`.line`, `.scene-progress`) would otherwise fall all the way
      // through to the generic parchment stops below, which this screen never paints.
      if (root.closest("#screen-scene")) return { root, stops: [...grounds.sceneBox] };
      return { root, stops: [...grounds.parchment] };
    };

    const label = (el: Element): string => {
      const id = el.id ? `#${el.id}` : "";
      const cls = el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };

    const out: {
      where: string; text: string; ratio: number; need: number; color: string; on: string;
    }[] = [];

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const own = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
      );
      if (!own) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
      // Text painted transparent is decoration (the wax-seal pick markers), not reading matter.
      const fg = parse(cs.color);
      if (!fg || fg[3] === 0) continue;

      const px = parseFloat(cs.fontSize);
      const bold = +cs.fontWeight >= 700;
      const need = px >= 24 || (bold && px >= 18.66) ? aa.large : aa.normal;

      // Walk up compositing translucent layers until something paints opaquely.
      const stack: RGBA[] = [];
      let node: Element | null = el;
      let opaque: RGBA[] | null = null;
      const { root } = sheetOf(el);
      while (node) {
        const s = getComputedStyle(node);
        const solid = ownGrounds(s);
        if (solid.length > 0 && node !== root) { opaque = solid; break; }
        if (node === root) break;
        const bg = parse(s.backgroundColor);
        if (bg && bg[3] > 0) stack.push(bg);
        node = node.parentElement;
      }

      const bases: RGBA[] =
        opaque ?? (sheetOf(el).stops.map((s) => parse(s)!).filter(Boolean) as RGBA[]);

      let worst = Infinity;
      let worstOn = "";
      for (const base of bases) {
        let ground = base;
        for (let i = stack.length - 1; i >= 0; i -= 1) ground = over(stack[i]!, ground);
        const r = ratio(over(fg, ground), ground);
        if (r < worst) { worst = r; worstOn = `rgb(${base.map((v) => Math.round(v)).slice(0, 3).join(", ")})`; }
      }
      if (worst < need) {
        out.push({
          where: label(el),
          text: (el.textContent ?? "").trim().slice(0, 44),
          ratio: Math.round(worst * 100) / 100,
          need,
          color: cs.color,
          on: worstOn,
        });
      }
    }
    return out;
  }, { grounds: GROUNDS, aa: AA });
}

/** How many text elements were examined — a screen that rendered nothing scores zero. */
async function textNodeCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      Array.from(document.body.querySelectorAll("*")).filter(
        (el) =>
          Array.from(el.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
          ) && el.getBoundingClientRect().width > 0,
      ).length,
  );
}

/**
 * Check one screen. `least` guards the measurement itself: an empty or unrendered
 * screen produces no findings and would pass exactly like a compliant one.
 */
async function screenPasses(page: Page, least: number): Promise<void> {
  expect(await textNodeCount(page)).toBeGreaterThanOrEqual(least);
  expect(await failures(page)).toEqual([]);
}

test("contrast: the declared grounds are the ones the page paints", async ({ page }) => {
  await page.goto("/");
  await groundsAreReal(page);
});

test("contrast: title screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("screen-title")).toBeVisible();
  // EXACTLY 7 at rest, measured: the display line, the subtitle, the lede, New Game,
  // Continue, Copy playtest log, and the page-wide "?" help disc. `title-slot` and
  // `log-note-title` start `hidden` (the overhaul — shown only for an unreadable save /
  // storage-unavailable warning, or after Copy is pressed) so they contribute nothing
  // here; the hidden-state colours are asserted separately below. Exact, not a floor —
  // this screen has few enough text-bearing elements that a floor would tolerate one of
  // them silently vanishing (`display: none`, an emptied text node) without going red.
  expect(await textNodeCount(page), "title screen text-node count").toBe(7);
  expect(await failures(page)).toEqual([]);
});

/**
 * The overwrite step and the unreadable-save note — the title's two conditionally-shown
 * texts, neither exercised by the rest-state check above. `--ink` is used for BOTH (see
 * overhaul.css): the shared stylesheet's `--warn-lit` is 1.44:1 on `--parch-burn`, the
 * darkest leaf stop, and would fail there outright.
 *
 * MUTATION this catches: swap `#screen-title .reason`'s colour to `var(--ink-soft)` (an
 * ADR-0028 role that reads as a reasonable secondary-text choice) and this goes red —
 * measured 4.07:1 against `--parch-lo` in the README, below the 4.5:1 bar.
 */
test("contrast: title screen — the overwrite step and the unreadable-save note", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tuh.campaign.v1", "{ not a save");
  });
  await page.reload();
  await expect(page.getByTestId("title-slot")).toBeVisible();
  expect(await failures(page)).toEqual([]);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await startNewGame(page);
  await dismissScene(page);
  await page.evaluate(() => window.tuhGame.quitToTitle());
  await page.reload();
  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("new-game-confirm")).toBeVisible();
  expect(await failures(page)).toEqual([]);
});

test("contrast: briefing and prep, before and after spending", async ({ page }) => {
  await page.goto("/");
  await startNewGame(page);
  await dismissScene(page);
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
  // MEASURED 2026-08-29, not guessed: this screen paints 113 text-bearing elements on
  // first paint and 112 once the scene is read out (the progress readout and the two
  // scene controls retire as a line is added). The old floor of 40 had a 73-node margin,
  // which is another way of saying it could not have noticed most of the screen failing
  // to render. 100 keeps a real margin and is sensitive enough to be evidence.
  await screenPasses(page, 100);

  // The scene player's own chrome is new ink on the parchment — the progress readout in
  // --ink-soft and two ghost buttons — so read the scene out and measure again rather
  // than assuming the first paint covered them.
  await page.getByTestId("brief-story-more").click();
  await screenPasses(page, 100);

  // Spending redraws the learn list with rows the first pass never held — the red
  // "needs Secondary" tag, spent-out seals, the receipt. New colours on new grounds.
  await prepEveryMember(page);
  await expect(page.getByTestId("prep-learn")).toBeVisible();
  await screenPasses(page, 100);
});

test("contrast: the help panel", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("help-open").click();
  await expect(page.getByTestId("help-body")).toBeVisible();
  await screenPasses(page, 10);
});

/**
 * THE BATTLE SCREEN IS THE STAGE (ADR-0037), and every surface on it is dark HUD
 * chrome rather than parchment — so it is measured zone by zone, with each overlay
 * OPENED, because a `hidden` drawer contributes no text and would drop out of the walk
 * silently. That is the whole risk here: "no findings" is what an unrendered screen
 * reports too, which is why `screenPasses` takes a floor.
 */
test("contrast: the battle stage, at rest and with every overlay open", async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 324 });
  await page.goto("/");
  await startNewGame(page);
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();

  // MEASURED 2026-09-05 at 851x324, not guessed: 18 text-bearing elements at rest, and
  // 25 / 30 / 30 / 35 / 59 with the actions sheet, the unit drawer, the menu drawer,
  // the settings drawer and the help drawer open. Each floor sits just under its own
  // measurement, so a zone that stopped rendering is caught rather than absorbed by a
  // margin — the 40-node slack this file used to carry on the briefing screen is the
  // mistake being avoided.
  await screenPasses(page, 16);

  // …then each overlay in turn. The unit drawer carries the full ADR-0033 stat set, the
  // settings drawer the readout, the menu drawer the turn log and the legend — none of
  // which the at-rest pass can see, and each is new ink on a new ground.
  const FLOORS = { actions: 23, unit: 28, menu: 28, settings: 33, help: 55 } as const;
  for (const which of ["unit", "settings", "menu", "help", "actions"] as const) {
    await openDrawer(page, which);
    await screenPasses(page, FLOORS[which]);
    await closeDrawer(page);
  }
});

/**
 * The stat card's plate is OPAQUE — the precondition the measurement above depends on.
 *
 * WITHOUT THIS the file is quietly wrong rather than red. `failures()` would keep
 * returning `[]` for a translucent card, because it would composite the card onto the
 * dark board card behind it and get a perfectly good ratio, while the player reads the
 * same text over whatever the canvas painted. Asserting the opacity is the only way
 * this file can say what it is actually measuring.
 *
 * MUTATION TO RUN: give `.tuh-drawer .unit-card` an `rgba(…, .6)` background in
 * `stage.css`. The `alpha` assertion goes red; `screenPasses` above stays green, which
 * is the point.
 */
test("contrast: the stat card sits on an OPAQUE plate of the declared colour", async ({
  page,
}) => {
  await page.goto("/");
  await startNewGame(page);
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  // The full card lives in the actor tab's drawer since ADR-0037 (the tab shows name
  // and HP only, AC-V37). Its plate is still opaque, and still for THIS file's reason:
  // the drawer floats over the canvas, which no DOM walk can sample.
  await openDrawer(page, "unit");
  const card = page.getByTestId("unit-card");
  await expect(card).toBeVisible();

  const paint = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.backgroundColor, image: cs.backgroundImage };
  });
  // `rgb(...)` with no fourth channel is how a computed style spells alpha 1. An
  // `rgba(...)` string here means the plate is see-through.
  expect(paint.color, "the stat card's plate is translucent").toBe(GROUNDS.plate[0]);
  // A gradient or image would put text on a ground that varies across the plate, which
  // the single declared stop above could no longer describe.
  expect(paint.image).toBe("none");

  // AND the elements that actually hold the text must resolve to that plate rather than
  // painting their own fills — otherwise the declared ground describes nothing they use.
  const owners = await card.evaluate((root) =>
    Array.from(root.querySelectorAll("*"))
      .filter((el) =>
        Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
        ),
      )
      .map((el) => getComputedStyle(el).backgroundColor),
  );
  expect(owners.length, "the card rendered no text at all").toBeGreaterThanOrEqual(4);
  expect(owners.every((c) => c === "rgba(0, 0, 0, 0)")).toBe(true);
});

/**
 * The PORTRAIT ROTATE GATE (AC-V30) — a screen no other case here can reach, because it
 * exists only on a touch device held upright.
 *
 * THE NODE COUNT IS ASSERTED EXACTLY, not as a floor, and that is the discriminating
 * half. This card holds exactly three text-bearing elements — the primary line, the
 * button, and the persistent rotation-lock line; the turning-phone figure is SVG and
 * carries no text, and the dead-end hint is `hidden` until a press — while the game
 * beneath it is `display: none`.
 * A gate that merely COVERED the page would leave the campaign's own text laid out and
 * measured — every screen this file already checks, plus a stack of elements composited
 * against the wrong ground — and the count would run to three figures. So "2" is
 * simultaneously the measurement guard and the proof that nothing is rendering
 * underneath.
 */
/**
 * EVERY LAID-OUT AND OVERLAID STAGE SURFACE IS OPAQUE — the precondition the whole
 * battle-stage measurement above depends on, exactly as the rotate card's is.
 *
 * WITHOUT THIS the file is quietly wrong rather than red. `failures()` would keep
 * returning `[]` for a translucent bar, because it would composite the bar onto the
 * TABLE gradient behind it and get a perfectly good ratio, while the player reads the
 * same text over whatever the canvas painted underneath.
 *
 * MUTATION TO RUN: give `.tuh-top` an `rgba(29, 23, 16, .6)` background in
 * `stage.css`. This test goes red; the one above stays green, which is the point.
 */
test("contrast: every stage surface is an OPAQUE fill of the declared colour", async ({
  page,
}) => {
  await page.setViewportSize({ width: 851, height: 324 });
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();
  // Everything is opened first, because a `hidden` element reports no useful computed
  // background and would silently drop out of the enumeration.
  for (const which of ["unit", "settings", "menu", "help", "actions"] as const) {
    await openDrawer(page, which);
  }
  await expect(page.getByTestId("reason")).toBeHidden();
  await page.evaluate(() => window.tuh.clickTile(-9, -9)); // raise a toast to measure

  const surfaces = await page.evaluate(() => {
    const names = [
      ".tuh-top",
      ".tuh-bottom",
      ".tuh-tab",
      '[data-testid="menu-drawer"]',
      '[data-testid="unit-drawer"]',
      '[data-testid="settings-drawer"]',
      '[data-testid="help-drawer"]',
      '[data-testid="actions-sheet"]',
      '[data-testid="preview-sheet"]',
      '[data-testid="reason"]',
    ];
    return names.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, color: "MISSING", image: "MISSING" };
      const cs = getComputedStyle(el);
      return { sel, color: cs.backgroundColor, image: cs.backgroundImage };
    });
  });

  // The set is enumerated and asserted non-empty: a loop that found two surfaces
  // passes vacuously.
  expect(surfaces).toHaveLength(10);
  for (const s of surfaces) {
    expect(s.color, `${s.sel} is missing from the stage`).not.toBe("MISSING");
    // `rgb(...)` with no fourth channel is how a computed style spells alpha 1. An
    // `rgba(...)` string here means the surface is see-through.
    expect(s.color, `${s.sel} is translucent`).toBe(GROUNDS.plate[0]);
    // A gradient would vary the ground across the surface, which the single declared
    // stop above could no longer describe.
    expect(s.image, `${s.sel} paints a gradient`).toBe("none");
  }
});

test.describe("contrast: the portrait rotate gate", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("contrast: the rotate gate's card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("rotate-gate")).toBeVisible();

    // THREE: the primary line, the button, and the persistent rotation-lock line. The
    // turning-phone figure is SVG and holds no text; the dead-end hint is `hidden`
    // until a press.
    expect(await textNodeCount(page), "the gate is not the only thing rendered").toBe(3);
    expect(await failures(page)).toEqual([]);
  });

  /**
   * The card is OPAQUE and the colour is the declared one — the precondition the
   * measurement above depends on, exactly as the stat plate's is.
   *
   * WITHOUT THIS the file is quietly wrong rather than red. The walk composites a
   * translucent card onto the TABLE gradient and gets a fine ratio, while the player
   * reads the same text over whatever the game beneath happens to be painting.
   *
   * MUTATION TO RUN: give `.rotate-card` an `rgba(233, 215, 168, .6)` background. This
   * test goes red; the one above stays green, which is the point.
   */
  test("contrast: the rotate card is an OPAQUE sheet of the declared colour", async ({ page }) => {
    await page.goto("/");
    const card = page.locator(".rotate-card");
    await expect(card).toBeVisible();

    const paint = await card.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.backgroundColor, image: cs.backgroundImage };
    });
    // `rgb(...)` with no fourth channel is how a computed style spells alpha 1.
    expect(paint.color, "the rotate card is translucent").toBe(GROUNDS.gate[0]);
    expect(paint.image, "a gradient would vary the ground across the card").toBe("none");

    // The dead-end hint is measured too, once it is revealed — it is the smallest and
    // faintest text on the card, so it is the line most likely to fail the bar, and it
    // is invisible to the case above by design.
    await page.evaluate(() => {
      document.querySelector<HTMLElement>("[data-testid='rotate-hint']")!.hidden = false;
    });
    await expect(page.getByTestId("rotate-hint")).toBeVisible();
    expect(await textNodeCount(page), "the hint did not render").toBe(4);
    expect(await failures(page)).toEqual([]);
  });
});
