import { test, expect, type Page } from "@playwright/test";
import { closeDrawer, dismissScene, openDrawer } from "./helpers.js";
import { prepEveryMember } from "./helpers";

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
 * The extreme stops of each sheet's ground gradient, taken from index.html. A text
 * colour must clear the bar against every entry.
 *
 * These are duplicated from the stylesheet on purpose: if someone re-tones the
 * parchment and forgets this list, the test measures against the OLD ground and can
 * pass on a sheet that actually got worse. `groundsAreReal()` below is the guard —
 * it asserts each listed colour is one the page genuinely paints.
 */
const GROUNDS = {
  parchment: ["rgb(242, 230, 196)", "rgb(220, 195, 143)"],
  table: ["rgb(36, 27, 16)", "rgb(11, 8, 5)"],
  /**
   * THE STAGE'S HUD SURFACES — a FLAT opaque fill, unlike every other ground here, and
   * the same colour the stat plate used to be (ADR-0037 moved the card, not its tone).
   *
   * They have to be opaque, and the reason is this file's own algorithm. The walk below
   * composites a translucent layer onto the SHEET its element sits in — and the stage
   * sits in NO sheet: its bars, tab, drawers, sheets and toast float over the CANVAS,
   * which no DOM walk can sample (a canvas has no background colour, only pixels). A
   * see-through bar would be scored against the table gradient while the player reads it
   * over grass, sky or water: a green run and an unreadable HUD, which is exactly the
   * shape of evidence this repo forbids.
   *
   * Because the fill IS opaque the walk finds it by itself, so this entry is never used
   * as a fallback. It is the DECLARED value the tests below compare the live one
   * against — the same duplicate-and-guard the two grounds above use.
   *
   * `GROUNDS.board` is GONE, not forgotten: `.card.board` no longer exists. The battle
   * screen is the stage, and its dark ground is these surfaces plus the canvas.
   */
  plate: ["rgb(29, 23, 16)"],
  /**
   * The rotate gate's card — like the plate, a FLAT opaque fill rather than a gradient.
   *
   * It has to be flat for the same reason: the card is a sibling of nothing this walk
   * can sample, sitting on the table gradient, and `sheetOf()` does not recognise it as
   * a sheet (it is neither `.card` nor `.panel` nor a `dialog`). Because the fill is
   * opaque the walk finds it by itself, so this entry is the DECLARED value the test at
   * the bottom of this file compares the live one against.
   */
  gate: ["rgb(233, 215, 168)"],
} as const;

type Finding = { where: string; text: string; ratio: number; need: number; color: string; on: string };

/**
 * Assert the declared grounds still match the stylesheet. Without this the whole file
 * could be measuring against a palette the page stopped using.
 */
async function groundsAreReal(page: Page): Promise<void> {
  const painted = await page.evaluate(() => {
    const grab = (sel: string): string => {
      const el = document.querySelector(sel);
      if (!el) return "";
      return getComputedStyle(el).backgroundImage;
    };
    return {
      sheet: grab(".card:not(.board)") || grab(".panel"),
      body: getComputedStyle(document.body).backgroundImage,
    };
  });
  for (const c of GROUNDS.parchment) expect(painted.sheet, `parchment stop ${c}`).toContain(c);
  for (const c of GROUNDS.table) expect(painted.body, `table stop ${c}`).toContain(c);
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
  await screenPasses(page, 8);
});

test("contrast: briefing and prep, before and after spending", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-game").click();
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
  await page.getByTestId("new-game").click();
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
  await page.getByTestId("new-game").click();
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
