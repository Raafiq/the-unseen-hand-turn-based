import { test, expect, type Page } from "@playwright/test";
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
  board: ["rgb(29, 23, 16)", "rgb(13, 9, 6)"],
  table: ["rgb(36, 27, 16)", "rgb(11, 8, 5)"],
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
      board: grab(".card.board"),
      body: getComputedStyle(document.body).backgroundImage,
    };
  });
  for (const c of GROUNDS.parchment) expect(painted.sheet, `parchment stop ${c}`).toContain(c);
  for (const c of GROUNDS.board) expect(painted.board, `board stop ${c}`).toContain(c);
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
      if (root.classList.contains("board")) return { root, stops: [...grounds.board] };
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

test("contrast: the battle screen, which is the one dark sheet", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-game").click();
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await screenPasses(page, 15);
});
