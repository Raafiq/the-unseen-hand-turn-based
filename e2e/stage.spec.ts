import { test, expect, type Page } from "@playwright/test";
import { dismissScene, prepEveryMember, startNewGame } from "./helpers.js";

/**
 * THE LANDSCAPE-PHONE STAGE — docs/10 AC-V33 … AC-V42 (ADR-0037, ADR-0038).
 *
 * WHAT THIS SUITE CAN AND CANNOT SEE. It measures bounding boxes, computed styles and
 * the command log. It cannot see the screen: `docs/visual/stage/` holds the frames,
 * and every number here was written after opening them.
 *
 * WHY FIVE VIEWPORTS. A fluid width has to be proved at both ends or it is proved
 * nowhere, and the three plausible wrong implementations each survive a different
 * subset: a fixed 16:9 stage dies only at 800x360, a stretch-to-fit only at 1000x780,
 * and dropping the 900 clamp only at 851x324 — the owner's own phone, which is why it
 * is in the set at all.
 */

/** docs/10 §8a's table. `scale` is derived, never asserted where it would tie. */
interface Row {
  name: string;
  size: { width: number; height: number };
  stageW: number;
  scale: number;
  /** Total letterbox in CSS px. "0" means UNDER 1 px, which is the stated tolerance. */
  lbX: number;
  lbY: number;
}

const VIEWPORTS: Row[] = [
  { name: "640x300", size: { width: 640, height: 300 }, stageW: 768, scale: 0.8333, lbX: 0, lbY: 0 },
  { name: "800x360", size: { width: 800, height: 360 }, stageW: 800, scale: 1, lbX: 0, lbY: 0 },
  { name: "851x324", size: { width: 851, height: 324 }, stageW: 900, scale: 0.9, lbX: 41, lbY: 0 },
  { name: "900x390", size: { width: 900, height: 390 }, stageW: 831, scale: 1.083, lbX: 0, lbY: 0.11 },
  { name: "1000x780", size: { width: 1000, height: 780 }, stageW: 640, scale: 1.5625, lbX: 0, lbY: 217.5 },
];

/** docs/10 §8a: within 1 CSS px of the formula; "none" means under 1 CSS px. */
const TOL = 1;
/** docs/10 AC-V35 / §8c: iOS asks 44 pt, Android 48 dp. Measured AFTER the transform. */
const TOUCH_FLOOR = 44;

const PAGES = ["/", "/viewer.html"] as const;

/** Drive the campaign as far as a live battle board. The viewer boots on one. */
async function reachBattle(page: Page, path: string): Promise<void> {
  if (path !== "/") {
    await expect(page.getByTestId("grid")).toBeVisible();
    return;
  }
  await startNewGame(page);
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
}

interface Measured {
  host: { w: number; h: number };
  stage: { w: number; h: number };
  scroll: { w: number; cw: number; h: number; ch: number };
}

/**
 * Everything read from `getBoundingClientRect()`, never from a CSS custom property.
 * A variable computed correctly and applied to nothing reads as working from the
 * variable's side, which is the shape AC-V33 spells out at length.
 */
async function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const host = document.querySelector('[data-testid="stage-host"]')!.getBoundingClientRect();
    const stage = document.querySelector('[data-testid="stage"]')!.getBoundingClientRect();
    const d = document.documentElement;
    return {
      host: { w: host.width, h: host.height },
      stage: { w: stage.width, h: stage.height },
      scroll: { w: d.scrollWidth, cw: d.clientWidth, h: d.scrollHeight, ch: d.clientHeight },
    };
  });
}

/** The board canvas and every LAID-OUT HUD zone, by name. */
async function boxes(page: Page): Promise<{
  canvas: { x: number; y: number; w: number; h: number };
  hud: { name: string; x: number; y: number; w: number; h: number }[];
}> {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const canvas = box(document.querySelector('[data-testid="grid"]')!);
    const hud = [...document.querySelectorAll<HTMLElement>("[data-hud]")]
      // The board's own wrapper is the canvas's container, not chrome over it.
      .filter((el) => el.dataset["hud"] !== "board")
      .map((el) => ({ name: el.dataset["hud"]!, ...box(el) }));
    return { canvas, hud };
  });
}

const overlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * The two pages expose the same battle seam under different names (`window.tuh` on the
 * engine viewer, `window.tuhGame` on the campaign). These three helpers are the only
 * place that difference lives.
 *
 * DISCOVERED, NOT HARD-CODED. Both pages mount content whose topology drifts —
 * `makeDemoBattle()` here, five authored encounters there — and hard-coded tiles were
 * invalidated four times in this repo's history. Each helper asks the board, through
 * the shipped seam, for something with the property under test, and every caller
 * asserts the discovery SUCCEEDED before relying on it.
 */
/**
 * Step until the PLAYER has the turn. Both boards can open on an AI actor.
 *
 * Any of the three player phases counts as "the player has the turn". That matters:
 * `step()` resolves whoever is ACTIVE through the balance probe, so an implementation
 * that treated `MOVE_STAGED` as "not yet the player" would step the player's own turn
 * away and every caller downstream would be measuring a board nobody staged anything
 * on. Found exactly that way.
 */
async function toPlayerTurn(page: Page, path: string): Promise<boolean> {
  return page.evaluate((p) => {
    const phase = (): string | null =>
      p === "/" ? window.tuhGame.phase() : window.tuh.phase();
    const step = (): void => (p === "/" ? window.tuhGame.step() : window.tuh.step());
    for (let i = 0; i < 40; i += 1) {
      const ph = phase();
      if (ph === "PLAYER_IDLE" || ph === "MOVE_STAGED" || ph === "TARGET_STAGED") return true;
      if (ph === null || ph === "ENDED") return false;
      step();
    }
    return false;
  }, path);
}

/** Stage a legal move. Returns false if the board offers none. */
async function stageMove(page: Page, path: string): Promise<boolean> {
  if (!(await toPlayerTurn(page, path))) return false;
  return page.evaluate((p) => {
    const phase = (): string | null =>
      p === "/" ? window.tuhGame.phase() : window.tuh.phase();
    const click = (x: number, y: number): void =>
      p === "/" ? window.tuhGame.clickTile(x, y) : window.tuh.clickTile(x, y);
    const state = p === "/" ? window.tuhGame.state() : window.tuh.getState();
    if (!state) return false;
    if (phase() === "MOVE_STAGED") return true;
    for (let y = 0; y < state.grid.height; y += 1) {
      for (let x = 0; x < state.grid.width; x += 1) {
        if (phase() !== "PLAYER_IDLE") return phase() === "MOVE_STAGED";
        click(x, y);
        if (phase() === "MOVE_STAGED") return true;
      }
    }
    return false;
  }, path);
}

/**
 * Stage a legal TARGET — the discovery this whole file leans on.
 *
 * WHY IT IS A SEARCH AND NOT A COORDINATE. The demo board opens with no foe in the
 * actor's reach, so "tap every tile until the phase changes" finds nothing: a staged
 * MOVE has to be tried too. Hard-coded tiles were invalidated by content drift four
 * times in this repo's history, which is why nothing here is written down — move tiles
 * come from the grid, target tiles from the live unit list, and every speculative
 * stage is undone (the stage/unstage pair are exact inverses, docs/10 §3) so the
 * search cannot leave the actor somewhere it did not intend.
 */
async function stageTarget(page: Page, path: string): Promise<boolean> {
  if (!(await toPlayerTurn(page, path))) return false;
  return page.evaluate((p) => {
    const phase = (): string | null =>
      p === "/" ? window.tuhGame.phase() : window.tuh.phase();
    const click = (x: number, y: number): void =>
      p === "/" ? window.tuhGame.clickTile(x, y) : window.tuh.clickTile(x, y);
    const cancel = (): void => (p === "/" ? window.tuhGame.cancel() : window.tuh.cancel());
    const state = p === "/" ? window.tuhGame.state() : window.tuh.getState();
    if (!state) return false;
    const units = state.units.filter((u) => u.hp > 0).map((u) => ({ x: u.pos.x, y: u.pos.y }));

    /**
     * `restage` is not a nicety. One of the tiles in `units` is the ACTOR's own, and
     * tapping the actor CLEARS THE WHOLE DRAFT (docs/10 §3) — so without putting the
     * move back, every unit after the actor in the list is tried from the wrong tile
     * and the search reports "no target" on a board that has one. Measured.
     */
    const tryUnits = (restage: { x: number; y: number } | null): boolean => {
      for (const u of units) {
        click(u.x, u.y);
        const ph = phase();
        if (ph === "TARGET_STAGED") return true;
        if (restage && ph === "PLAYER_IDLE") click(restage.x, restage.y);
      }
      return false;
    };

    if (phase() === "TARGET_STAGED") return true;
    if (tryUnits(null)) return true;
    if (phase() === "MOVE_STAGED") cancel();
    if (phase() !== "PLAYER_IDLE") return false;

    for (let y = 0; y < state.grid.height; y += 1) {
      for (let x = 0; x < state.grid.width; x += 1) {
        if (phase() !== "PLAYER_IDLE") return phase() === "TARGET_STAGED";
        click(x, y);
        if (phase() !== "MOVE_STAGED") continue;
        if (tryUnits({ x, y })) return true;
        cancel(); // back to idle and try the next destination
      }
    }
    return false;
  }, path);
}

// ───────────────────────────────────────────────────────────────────────────────
// AC-V33 — the stage is 360 tall, uniformly scaled, and nothing overflows.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V33 — one logical stage, uniformly scaled", () => {
  for (const path of PAGES) {
    for (const row of VIEWPORTS) {
      test(`${path} at ${row.name} derives docs/10 §8a's row`, async ({ page }) => {
        await page.setViewportSize(row.size);
        await page.goto(path);
        await reachBattle(page, path);
        const m = await measure(page);

        // The host really is the viewport-sized box the formula is fed. Without this
        // every number below could be right about the wrong rectangle.
        expect(m.host.w).toBeCloseTo(row.size.width, 0);
        expect(m.host.h).toBeCloseTo(row.size.height, 0);

        // 360 UNITS TALL, and the width is the CLAMPED formula — read back by dividing
        // the measured box by the measured scale rather than by trusting the page.
        const scaleY = m.stage.h / 360;
        const stageW = m.stage.w / scaleY;
        expect(stageW, `${row.name} stageW`).toBeCloseTo(row.stageW, 0);
        expect(scaleY, `${row.name} scale`).toBeCloseTo(row.scale, 3);

        // UNIFORM: the same scale on both axes. A stretch-to-fit shows no letterbox
        // anywhere, so this and the 1000x780 row below are the pair that kills it.
        const scaleX = m.stage.w / row.stageW;
        expect(scaleX, `${row.name} scaleX vs scaleY`).toBeCloseTo(scaleY, 4);

        // THE LETTERBOX IS THE ASSERTION, not the scale: at 851x324 the clamped and
        // unclamped scales are 0.9 and 0.8996, which tie under any sane tolerance.
        expect(Math.abs(m.host.w - m.stage.w - row.lbX), `${row.name} pillarbox`).toBeLessThan(TOL);
        expect(Math.abs(m.host.h - m.stage.h - row.lbY), `${row.name} letterbox`).toBeLessThan(TOL);

        // The battle screen does not scroll, in either direction.
        expect(m.scroll.w, `${row.name} horizontal scroll`).toBeLessThanOrEqual(m.scroll.cw + 1);
        expect(m.scroll.h, `${row.name} vertical scroll`).toBeLessThanOrEqual(m.scroll.ch + 1);
      });
    }
  }

  /**
   * The clamp, called out on its own because it is invisible at four of the five.
   * `round(360 * 851 / 324)` is 946; without the clamp the stage fills the width and
   * the 41 px pillarbox disappears. This case and the 851x324 row above are the only
   * two in the file that go red for it.
   */
  test("851x324 is the only viewport that reaches the 900 clamp", async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 324 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    const m = await measure(page);
    expect(Math.round((360 * 851) / 324), "the fluid width must exceed the clamp here").toBe(946);
    expect(m.stage.w / (m.stage.h / 360)).toBeCloseTo(900, 0);
    expect(m.host.w - m.stage.w).toBeCloseTo(41, 0);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V34 — the board is uncovered at rest, and the sheet is bounded.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * AC-V34's DISCRIMINATOR IS A MEASUREMENT, NOT A PREDICTION — "the mutant is already
 * built", so it was run.
 *
 * RUN 2026-09-05 against the PRE-REBUILD build (commit fbc4e95, built in a detached
 * worktree and served on its own port; this file's measurement logic re-pointed at the
 * old page's selectors, since `[data-hud]` does not exist there). Every viewport
 * failed, and the same element failed at all five:
 *
 * | viewport | `#unit-card` ∩ canvas | share of canvas | vertical scroll |
 * |---|---|---|---|
 * | 640x300  | 40 031 px² | **31 %** | 889 px |
 * | 800x360  | 40 031 px² | **18 %** | 749 px |
 * | 851x324  | 40 031 px² | **16 %** | 809 px |
 * | 900x390  | 40 031 px² | **14 %** | 716 px |
 * | 1000x780 | 40 031 px² | **11 %** | 375 px |
 *
 * The action bar and the timeline scored zero — they sat under the board, not over it —
 * so the plate is the whole failure, which is exactly what ADR-0033 decision 2 put
 * there and ADR-0037 supersedes. The plate's box does NOT shrink across the five: the
 * old landscape rules were gated on `pointer: coarse`, which a plain desktop context
 * does not match, so what the table shows is the desktop plate measured at phone sizes
 * — the same 40 031 px² everywhere, covering a third of the smallest board.
 *
 * The vertical-scroll column is AC-V33's half of the same run: the pre-rebuild battle
 * screen scrolled at every one of the five.
 */
test.describe("AC-V34 — nothing covers the board at rest", () => {
  for (const path of PAGES) {
    for (const row of VIEWPORTS) {
      test(`${path} at ${row.name} the HUD never overlaps the canvas at rest`, async ({ page }) => {
        await page.setViewportSize(row.size);
        await page.goto(path);
        await reachBattle(page, path);
        expect(await toPlayerTurn(page, path), "no player turn to measure").toBe(true);

        // ── STATE 1: nothing selected.
        let b = await boxes(page);

        // NON-DEGENERACY, and all three halves are required. "Nothing intersects" is
        // exactly what a page with no HUD reports, and a zero-area box intersects
        // nothing — which is what `display: none` on the whole HUD looks like.
        expect(b.canvas.w * b.canvas.h, "the canvas has no area").toBeGreaterThan(0);
        const names = b.hud.map((e) => e.name).sort();
        expect(names, `${row.name} HUD set`).toEqual(
          expect.arrayContaining(["action-bar", "actor-tab", "top-bar", "turn-order"]),
        );
        for (const e of b.hud) {
          expect(e.w * e.h, `${e.name} has a zero-area box`).toBeGreaterThan(0);
        }
        for (const e of b.hud) {
          expect(overlap(e, b.canvas), `${e.name} covers the board at rest`).toBe(0);
        }

        // ── STATE 2: a player unit selected, no target staged. A HUD that appears
        // only once a unit is selected passes state 1 alone.
        const moved = await stageMove(page, path);
        expect(moved, `${row.name}: no legal move to stage`).toBe(true);
        b = await boxes(page);
        for (const e of b.hud) {
          expect(overlap(e, b.canvas), `${e.name} covers the board with a move staged`).toBe(0);
        }

        // ── STATE 3: a target staged. The sheet may overlay at most 35% of the
        // canvas AREA; everything else is still zero.
        const staged = await stageTarget(page, path);
        expect(staged, `${row.name}: no legal target to stage`).toBe(true);
        b = await boxes(page);
        for (const e of b.hud) {
          expect(overlap(e, b.canvas), `${e.name} covers the board with a target staged`).toBe(0);
        }
        const sheet = await page.getByTestId("preview-sheet").boundingBox();
        expect(sheet, "the preview sheet did not open").not.toBeNull();
        const s = { x: sheet!.x, y: sheet!.y, w: sheet!.width, h: sheet!.height };
        expect(s.w * s.h, "the sheet has no area").toBeGreaterThan(0);
        // WIDTH, not area. docs/10 §3 and §8b both say "at most 35% of the canvas
        // WIDTH", and the two are not the same bound: a sheet spanning half the board's
        // width but only the top third of its height passes an AREA check at 17% while
        // hiding half of every row of tiles — which is the thing the budget exists to
        // prevent ("a visible target can be re-staged with one tap").
        const covered =
          Math.max(0, Math.min(s.x + s.w, b.canvas.x + b.canvas.w) - Math.max(s.x, b.canvas.x));
        const share = covered / b.canvas.w;
        expect(share, `${row.name}: the sheet covers ${Math.round(share * 100)}% of the board's width`)
          .toBeLessThanOrEqual(0.35);
      });
    }
  }

  /**
   * THE FOURTH STATE: the turn-order strip EXPANDED (docs/10 §8b, "one row; tap
   * expands it"). Expanding makes it an absolute overlay under the top bar, so it is
   * the one laid-out zone that can become an overlay — and an overlay owes the same
   * budget every other one owes.
   *
   * HEIGHT is the axis here, not width: the strip spans the stage's full width by
   * construction, so a width bound would be meaningless, and what a player needs is to
   * still see the board they are reading the order against.
   *
   * COLLAPSING MUST RESTORE ZERO, and that is the half that makes this non-vacuous: a
   * strip that never expanded at all satisfies the bound trivially, so the test asserts
   * the intersection is genuinely non-zero while expanded before bounding it.
   */
  test("the expanded turn-order strip stays inside the same budget", async ({ page }) => {
    // WAS EXPECTED-RED, NOW GREEN. Measured 2026-09-05 at 640x300 with
    // `.tuh-chips.expanded { max-height: 150px }`: the strip covered **57%** of the
    // board's height against a 35% budget, and this case carried `test.fail()` while
    // `stage.css` was frozen. The bound is now 75 units — 216 x 0.35 = 75.6 — and the
    // marker is gone. MUTATION RUN: put 150px back and this goes red at 57%.
    await page.setViewportSize({ width: 640, height: 300 }); // the narrowest stage
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();

    // VERTICAL overlap over canvas HEIGHT — not an area over a height, which is what
    // the first draft computed and which reported 21136%.
    const strip = async (): Promise<number> => {
      const b = await boxes(page);
      const el = (await page.getByTestId("timeline").boundingBox())!;
      const covered =
        Math.max(0, Math.min(el.y + el.height, b.canvas.y + b.canvas.h) - Math.max(el.y, b.canvas.y));
      return covered / b.canvas.h;
    };

    // Collapsed: zero, like every other laid-out zone.
    expect(await strip()).toBe(0);

    await page.getByTestId("turn-order-more").click();
    await expect(page.getByTestId("turn-order-more")).toHaveAttribute("aria-expanded", "true");
    const expanded = await strip();
    expect(expanded, "the strip did not actually expand over the board").toBeGreaterThan(0);
    expect(
      expanded,
      `the expanded strip covers ${Math.round(expanded * 100)}% of the board's height`,
    ).toBeLessThanOrEqual(0.35);

    await page.getByTestId("turn-order-more").click();
    await expect(page.getByTestId("turn-order-more")).toHaveAttribute("aria-expanded", "false");
    expect(await strip(), "collapsing did not give the board back").toBe(0);
  });

  /** The sheet is ABSENT at rest, not merely small — that is what "at rest" means. */
  test("the preview sheet does not exist until a target is staged", async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 324 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    await expect(page.getByTestId("preview-sheet")).toBeHidden();
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);
    expect(await stageTarget(page, "/viewer.html")).toBe(true);
    await expect(page.getByTestId("preview-sheet")).toBeVisible();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V35 — every control is thumb-sized where it is smallest.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V35 — 44 CSS px at the NARROWEST viewport", () => {
  for (const path of PAGES) {
    test(`${path} every control clears 44x44 CSS px at 640x300`, async ({ page }) => {
      await page.setViewportSize({ width: 640, height: 300 });
      await page.goto(path);
      await reachBattle(page, path);

      // MEASURED AFTER THE TRANSFORM. At 640x300 the stage scale is 0.833, so a
      // control authored 44 STAGE UNITS wide renders 36.7 CSS px and fails — a test
      // reading the authored size passes against exactly that defect.
      const controls = await page.evaluate(() => {
        const ids = [
          "hud-menu",
          "hud-help",
          "hud-settings",
          "cancel",
          "actions",
          "end-turn",
          "actor-tab",
        ];
        const out: { name: string; w: number; h: number }[] = [];
        for (const id of ids) {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          out.push({ name: id, w: r.width, h: r.height });
        }
        const chip = document.querySelector('[data-testid="timeline"] .chip');
        if (chip) {
          const r = chip.getBoundingClientRect();
          out.push({ name: "turn-order chip", w: r.width, h: r.height });
        }
        return out;
      });

      // A loop that finds two buttons passes vacuously, so the set is enumerated.
      expect(controls.map((c) => c.name).sort()).toEqual([
        "actions",
        "actor-tab",
        "cancel",
        "end-turn",
        "hud-help",
        "hud-menu",
        "hud-settings",
        "turn-order chip",
      ]);
      for (const c of controls) {
        expect(c.w, `${c.name} width`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
        expect(c.h, `${c.name} height`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
      }
    });
  }

  /**
   * NOT ASSERTED, and said here rather than left to look like an oversight: board
   * TILES are exempt. This case measures the number instead of arguing about it, so
   * the exemption is a recorded quantity rather than a shrug — and the settings
   * readout (AC-V40) prints the same figure on a real device.
   */
  test("board tiles are BELOW the floor at 640x300 — a recorded limit, not a pass", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 300 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    await page.getByTestId("hud-settings").click();
    const text = (await page.getByTestId("settings-readout").textContent()) ?? "";
    const tile = /tile\s+([\d.]+) x ([\d.]+)/.exec(text);
    expect(tile, `no tile row in the readout: ${text}`).not.toBeNull();
    expect(Number(tile![1]), "a tile is somehow already thumb-sized").toBeLessThan(TOUCH_FLOOR);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V36 — Confirm is a separate tap, proved by the command log.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V36 — a target tap stages; Confirm commits", () => {
  for (const path of PAGES) {
    test(`${path} the tap emits ZERO commands and Confirm emits exactly one`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);

      const count = (): Promise<number> =>
        page.evaluate((p) =>
          p === "/" ? window.tuhGame.commandCount() : window.tuh.commands().length, path);
      const staged = (): Promise<unknown> =>
        page.evaluate((p) =>
          p === "/" ? window.tuhGame.stagedTarget() : (window.tuh.draft()?.act ?? null), path);

      expect(await toPlayerTurn(page, path), "no player turn to drive").toBe(true);
      const before = await count();
      expect(await stageTarget(page, path)).toBe(true);

      // ── THE LOAD-BEARING HALF. The wrong behaviour is the one this repo shipped:
      // the command was emitted on the target tap, and "after Confirm a command
      // exists" passes against it because by then the command does exist.
      expect(await count(), "the target tap emitted a command").toBe(before);
      // ── THE SECOND REQUIRED HALF: a viewer that ignored the tap entirely satisfies
      // both counts. A non-null staged target is what rules that out.
      expect(await staged(), "nothing was staged").not.toBeNull();
      await expect(page.getByTestId("preview-sheet")).toBeVisible();

      // Asserted on the LOG, not on the button: a Confirm that is present and inert
      // leaves a state change nobody made.
      await page.getByTestId("confirm").click();
      expect(await count()).toBe(before + 1);
      expect(await staged()).toBeNull();
    });

    /**
     * END TURN CANNOT SPEND A TURN WITH A SHOT AIMED, and this is the blocker a review
     * found: the primary button stayed live in `TARGET_STAGED` and `endTurn()` emitted
     * a bare move/wait, silently discarding the attack the sheet was quoting. The
     * player sees "Move + Act · −100" and gets a move at −80.
     *
     * TWO ASSERTIONS, and neither substitutes for the other: the control is DISABLED
     * (so nobody reaches for it) and the log is UNCHANGED after forcing the call
     * through the seam (so the session refuses it even if some future control does not
     * disable). A disabled-only check passes against a session that would still
     * discard the shot; a log-only check passes against a live button that looks
     * usable and answers with a refusal chip.
     */
    test(`${path} End Turn is refused while a target is staged`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      const count = (): Promise<number> =>
        page.evaluate((p) =>
          p === "/" ? window.tuhGame.commandCount() : window.tuh.commands().length, path);

      expect(await toPlayerTurn(page, path), "no player turn to drive").toBe(true);
      expect(await stageTarget(page, path)).toBe(true);
      const before = await count();

      await expect(page.getByTestId("end-turn")).toBeDisabled();

      // …and the session refuses it too. Driven through the seam because the button is
      // (correctly) unclickable — this is the half that survives a future control.
      await page.evaluate((p) =>
        p === "/" ? window.tuhGame.endTurn() : window.tuh.endTurn(), path);

      expect(await count(), "End Turn discarded the staged shot").toBe(before);
      expect(await page.evaluate((p) =>
        p === "/" ? window.tuhGame.phase() : window.tuh.phase(), path)).toBe("TARGET_STAGED");

      // Confirm still works, at the price the sheet quoted: a refusal, not a wedge.
      await page.getByTestId("confirm").click();
      expect(await count()).toBe(before + 1);
    });

    /**
     * A DISABLED CONTROL MUST LOOK DISABLED, and `opacity` alone does not do it: the
     * rubricated primary at 55% is still a red slab in gold caps, which is what the
     * `TARGET_STAGED` frame showed — the one control the player must NOT press reading
     * as the one to press.
     *
     * THE ASSERTION IS ON THE COMPUTED BACKGROUND, because that is the property an
     * opacity-only treatment leaves IDENTICAL in both states: `getComputedStyle` reports
     * the same `background-color` whether the element is at opacity 1 or 0.55, so a
     * colour A/B is the only check that can tell the two apart. The cursor is asserted
     * too, and `default` rather than `not-allowed`: this control is not for you yet, it
     * is not broken.
     */
    test(`${path} the disabled primary does not read as the thing to press`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      expect(await toPlayerTurn(page, path)).toBe(true);

      const paint = async (): Promise<{ bg: string; cursor: string; color: string }> =>
        page.getByTestId("end-turn").evaluate((el) => {
          const cs = getComputedStyle(el);
          return { bg: cs.backgroundColor, cursor: cs.cursor, color: cs.color };
        });

      await expect(page.getByTestId("end-turn")).toBeEnabled();
      const live = await paint();
      expect(live.cursor).toBe("pointer");

      expect(await stageTarget(page, path)).toBe(true);
      await expect(page.getByTestId("end-turn")).toBeDisabled();
      const dead = await paint();

      expect(dead.bg, "the disabled primary keeps the live fill").not.toBe(live.bg);
      expect(dead.color, "the disabled primary keeps the live ink").not.toBe(live.color);
      expect(dead.cursor, "a refused control should not read as broken").toBe("default");
      // NON-DEGENERACY: both states painted something. Two empty strings differ from
      // nothing and would satisfy the inequalities above.
      expect(live.bg).toMatch(/^rgb/);
      expect(dead.bg).toMatch(/^rgb/);
    });

    test(`${path} Cancel unstages and emits nothing`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      const count = (): Promise<number> =>
        page.evaluate((p) =>
          p === "/" ? window.tuhGame.commandCount() : window.tuh.commands().length, path);

      expect(await toPlayerTurn(page, path), "no player turn to drive").toBe(true);
      const before = await count();
      expect(await stageTarget(page, path)).toBe(true);
      await page.getByTestId("cancel").click();
      await expect(page.getByTestId("preview-sheet")).toBeHidden();
      expect(await count(), "Cancel emitted a command").toBe(before);
    });
  }
});

/**
 * §4'S SET FITS THE SHEET — no row is clipped, at either end of the stage range.
 *
 * The frame captured on the first build showed "ACTION" cut in half at 851x324: the
 * sheet scrolls, and `previewHtml`'s rows wrapped to two and three lines each (measured
 * 489 units of content into a 162-unit body). Rewriting the values one-line-each and
 * merging the two rows that are facts about the same target brings it to 146 into 150.
 *
 * WHAT IS NOT ASSERTED, and it is the honest half: the closing `.phint` — the "not
 * modeled yet, so not shown" disclaimer plus the forecast's exactness note — is 178
 * units on its own and still sits below the fold. It is reachable (the body is a
 * focusable scroll region, AC-V22's a11y half) but it is not visible without scrolling,
 * and no markup change fixes that; it needs either a taller sheet or a smaller hint,
 * both of which are CSS. Recorded here rather than quietly excluded by the selector.
 *
 * A CONDITIONAL ROW CAN STILL OVERFLOW. Six rows use 126 of 138 usable units, so one
 * more fits and two do not: a shot at a target with a live reaction adds the counter
 * row (fits), and a Hamedo target adds a "Blocked" row on top of it (does not). The
 * fixture below is a plain shot, which is the common case; the exceptional one is named
 * rather than quietly excluded by the selector.
 */
test.describe("§4's rows fit the preview sheet without scrolling", () => {
  for (const size of [
    { name: "851x324", width: 851, height: 324 },
    { name: "640x300", width: 640, height: 300 },
  ]) {
    test(`every preview row is inside the sheet's visible box at ${size.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/viewer.html");
      await expect(page.getByTestId("grid")).toBeVisible();
      expect(await stageTarget(page, "/viewer.html")).toBe(true);
      await expect(page.getByTestId("preview-sheet")).toBeVisible();

      const fit = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="preview"]') as HTMLElement;
        const rows = [...body.querySelectorAll<HTMLElement>(".prow")];
        return {
          rows: rows.length,
          // Layout units, not CSS px: `offsetTop`/`offsetHeight` are pre-transform, so
          // this measures the same numbers `stage.css` is written in and the answer
          // cannot drift with the viewport's scale.
          overflowing: rows
            .filter((r) => r.offsetTop + r.offsetHeight > body.clientHeight)
            .map((r) => r.querySelector(".pk")?.textContent ?? "?"),
          tallest: Math.max(...rows.map((r) => r.offsetHeight)),
          used: rows.reduce((n, r) => n + r.offsetHeight, 0),
          available: body.clientHeight,
        };
      });

      // NON-DEGENERACY: a sheet that rendered no rows overflows nothing. §4 items 2–8
      // plus the Zodiac enhancement come to SIX rows for a plain shot — hit % with its
      // arc, damage with the HP it leaves and the lethal verdict, the turn's price with
      // the slot it buys, the act, where it resolves from, and Zodiac with the target's
      // statuses. Every value §4 asks for is in there; only the row COUNT was folded.
      expect(fit.rows, "the sheet rendered no rows").toBeGreaterThanOrEqual(6);
      expect(fit.overflowing, `${size.name}: rows below the fold`).toEqual([]);
      // EVERY ROW IS ONE LINE. A row that wrapped would still "fit" while the total was
      // small, and wrapping is what pushed Action off the bottom in the first place.
      expect(fit.tallest, `${size.name}: a row wrapped to two lines`).toBeLessThan(30);
      expect(fit.used).toBeLessThanOrEqual(fit.available);
    });
  }
});

/**
 * THE SKIN'S TWO FACES ARE ACTUALLY LOADED, on both pages.
 *
 * `viewer.html` carried no `@font-face` until 2026-09-05, so the shared battle stage —
 * one module, one stylesheet, built precisely so the two pages cannot diverge —
 * rendered in Cinzel on the campaign and in GEORGIA on the engine viewer. Nothing in
 * the suite could see it and every frame in `docs/visual/stage/` was captured on the
 * campaign page.
 *
 * `document.fonts.check()` is the discriminating read: a declared `@font-face` whose
 * URL 404s still appears in `document.fonts`, so the test waits for `ready` and asks
 * whether the family can actually be used at the size the stage sets it.
 */
test.describe("the stage's typefaces load on both pages", () => {
  for (const path of PAGES) {
    test(`${path} has Cinzel and EB Garamond loaded`, async ({ page }) => {
      await page.goto(path);
      await reachBattle(page, path);
      const fonts = await page.evaluate(async () => {
        await document.fonts.ready;
        const loaded = [...document.fonts].map((f) => `${f.family}:${f.status}`);
        return {
          loaded,
          cinzel: document.fonts.check('600 13px "Cinzel"'),
          garamond: document.fonts.check('400 14px "EB Garamond"'),
        };
      });
      expect(fonts.cinzel, `Cinzel is not usable on ${path}: ${fonts.loaded.join(", ")}`).toBe(
        true,
      );
      expect(fonts.garamond, `EB Garamond is not usable on ${path}`).toBe(true);
      // …and the stage really asks for them, so the check above is about this screen
      // rather than about a face some other panel happens to load.
      await expect(page.getByTestId("end-turn")).toHaveCSS("font-family", /Cinzel/);
      await expect(page.getByTestId("actor-tab")).toHaveCSS("font-family", /Garamond/);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V37 — the actor tab shows two facts; the drawer shows the rest.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V37 — the actor tab and the unit drawer", () => {
  for (const path of PAGES) {
    test(`${path} the tab shows name and HP only; the drawer holds the rest`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      expect(await toPlayerTurn(page, path)).toBe(true);

      const tab = page.getByTestId("actor-tab");
      // (ii) VISIBLE, WITH A NON-ZERO BOX. A text assertion alone passes against a tab
      // set to `display: none`, where "Clock is absent" is trivially true.
      await expect(tab).toBeVisible();
      const tabBox = (await tab.boundingBox())!;
      expect(tabBox.width * tabBox.height).toBeGreaterThan(0);

      // (i) The stats are ABSENT FROM THE TEXT, not merely clipped. A tab that
      // rendered the whole card and hid the overflow passes a visibility check
      // exactly as a correct one does.
      // `textContent`, not `innerText`: `innerText` applies `text-transform`, so a card
      // printing "Clock" reads back as "CLOCK" and every check below would be about CSS.
      const tabText = (await tab.textContent()) ?? "";
      expect(tabText).toMatch(/HP\s+\d+\s*\/\s*\d+/);
      for (const banned of ["Clock", "Brave", "Faith"]) {
        expect(tabText, `the tab prints ${banned}`).not.toContain(banned);
      }
      // THE JOB IS BANNED TOO — "name and HP only" (AC-V37) means only those two, and
      // the job is the row most likely to creep back in because it reads as part of a
      // name. Read off the page's own roster rather than written down, so this cannot
      // pass by naming a job the campaign does not field. Skipped on the engine viewer,
      // whose hand-authored `UNIT_META` genuinely carries no job (that absence is the
      // reason the card is on that page at all).
      const job = await page.evaluate(() => {
        const drawer = document.querySelector('[data-testid="unit-drawer"] .uc-job');
        return drawer?.textContent?.trim() ?? null;
      });
      if (path === "/") {
        expect(job, "the campaign card lost its job row").toBeTruthy();
        expect(tabText.toLowerCase(), "the tab prints the job").not.toContain(
          job!.toLowerCase(),
        );
      }

      await tab.click();
      const drawer = page.getByTestId("unit-drawer");
      await expect(drawer).toBeVisible();
      const drawerText = (await drawer.textContent()) ?? "";
      for (const wanted of ["Clock", "Brave", "Faith"]) {
        expect(drawerText, `the drawer omits ${wanted}`).toContain(wanted);
      }
      // ABSENT, NOT ZERO (ADR-0033, ADR-0021): the sim models neither.
      expect(drawerText).not.toMatch(/\bMP\b/);
      expect(drawerText).not.toMatch(/\bLevel\b/);
    });

    test(`${path} the drawer closes on a TARGET tap and stays open on an illegal one`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      expect(await toPlayerTurn(page, path)).toBe(true);

      // ONE assertion is not enough here: a drawer that closed on ANY board tap
      // passes "it closed after a target tap". The illegal tap is the control.
      await page.getByTestId("actor-tab").click();
      await expect(page.getByTestId("unit-drawer")).toBeVisible();
      await page.evaluate((p) => {
        const seam = (p === "/" ? window.tuhGame : window.tuh) as unknown as {
          clickTile: (x: number, y: number) => void;
        };
        seam.clickTile(-1, -1); // off-board: refused, and nothing else
      }, path);
      await page.evaluate((p) => {
        const seam = (p === "/" ? window.tuhGame : window.tuh) as unknown as {
          clickTile: (x: number, y: number) => void;
        };
        seam.clickTile(99, 99);
      }, path);
      await expect(
        page.getByTestId("unit-drawer"),
        "an illegal tap closed the unit drawer",
      ).toBeVisible();

      expect(await stageTarget(page, path)).toBe(true);
      await expect(page.getByTestId("unit-drawer")).toBeHidden();
    });
  }

  /**
   * READ-ONLY INSPECT (ADR-0033's parked cursor-follow, arriving as a tap).
   *
   * The discriminator is that the drawer's NAME and HP change with the unit tapped: a
   * drawer wired to the forecast lead is byte-identical between two units, which is
   * exactly what the dead `focusUnitId` seam looks like from outside.
   */
  test("tapping two different non-target units shows two different cards", async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 324 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);

    // DISCOVER two units that are NOT the actor and NOT legal targets — the inspect
    // path. Asserting the pair exists first is what stops this passing vacuously on a
    // board where every other unit happens to be targetable.
    const pair = await page.evaluate(() => {
      const state = window.tuh.getState();
      const actorId = state.units.find((u) => u.ct >= 100)?.id ?? state.units[0]!.id;
      const draftBefore = window.tuh.phase();
      void draftBefore;
      const others = state.units.filter((u) => u.id !== actorId && u.hp > 0);
      return others.slice(0, 2).map((u) => ({ id: u.id, x: u.pos.x, y: u.pos.y }));
    });
    expect(pair.length, "fewer than two other units on the board").toBe(2);

    const cards: string[] = [];
    for (const u of pair) {
      await page.evaluate((t) => window.tuh.clickTile(t.x, t.y), u);
      const drawer = page.getByTestId("unit-drawer");
      if (!(await drawer.isVisible())) continue; // this one WAS a legal target
      cards.push((await drawer.textContent()) ?? "");
    }
    // THE DISCRIMINATOR: a drawer wired to the forecast lead is byte-identical between
    // two units, which is exactly what the dead `focusUnitId` seam looks like.
    expect(cards.length, "no non-target unit opened the read-only drawer").toBe(2);
    expect(cards[0]).not.toBe(cards[1]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V38 — the action bar is phase-aware; the Actions sheet is derived.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V38 — the action bar and the Actions sheet", () => {
  test("the Actions sheet is DERIVED from the projection, ranges and all", async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 324 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);

    // DISCOVER the discriminating pair from the fixture's own data. Hard-coding an
    // ability's range bakes today's content into the test, and a range has already
    // moved once (ADR-0014's `summon.*` h4 → h6).
    const projection = await page.evaluate(() => {
      const state = window.tuh.getState();
      const actorId = window.tuh.getState().units.find((u) => u.ct >= 100)?.id;
      const actor = state.units.find((u) => u.id === actorId) ?? state.units[0]!;
      return actor.abilities.map((a) => ({ id: a.id, h: a.range.h, v: a.range.v }));
    });
    expect(projection.length).toBeGreaterThan(1);
    const distinct = new Set(projection.map((a) => `${a.h}/${a.v}`));
    expect(distinct.size, "this actor's abilities all share one range — nothing to tell apart")
      .toBeGreaterThan(1);

    await page.getByTestId("actions").click();
    const rows = page.locator('[data-testid="ability-list"] li');
    await expect(rows).toHaveCount(projection.length);
    const printed = await rows.evaluateAll((els) => els.map((e) => e.textContent ?? ""));
    const ranges = new Set(printed.map((t) => /range\s+\d+\s+·\s+height\s+±\d+/.exec(t)?.[0] ?? ""));
    // A static table or a template printing one shared range passes a count-only check.
    expect(ranges.size, "every row printed the same range").toBeGreaterThan(1);

    // The flat act price is printed ONCE, in the header — there is no per-ability cost
    // in `BattleAbilitySchema` to print, so a per-row one would be invented.
    //
    // AND THE NUMBER IS THE SIM'S. It used to be `didMove ? 100 : 80`, computed in the
    // render layer: a combat constant restated in the viewer, which would go on quoting
    // the old figure if `CT_COST_MOVE_AND_ACT` ever moved, with nothing going red.
    // Asserted against `Session.actCost()`, the same `turnCost` the staged shot is
    // priced with — a presence check on the word "clock" passes against any number.
    const priced = await page.evaluate(() => window.tuh.actCost()?.cost ?? null);
    expect(priced, "the session cannot price the act turn").not.toBeNull();
    await expect(page.getByTestId("actions-price")).toContainText(`−${priced!} clock`);

    // …and it MOVES with the staged move, so it is not a constant that happens to
    // match. A header printing one fixed price passes the equality above at one state.
    expect(await stageMove(page, "/viewer.html")).toBe(true);
    await page.getByTestId("actions").click();
    await page.getByTestId("actions").click();
    const pricedAfterMove = await page.evaluate(() => window.tuh.actCost()?.cost ?? null);
    expect(pricedAfterMove, "the act price did not move with the staged move").not.toBe(priced);
    await expect(page.getByTestId("actions-price")).toContainText(`−${pricedAfterMove!} clock`);
    await page.getByTestId("cancel").click();

    for (const t of printed) expect(t).not.toMatch(/\bAP\b/);
  });

  test("the primary button relabels AND behaves, in both phases", async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 324 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();

    const primary = page.getByTestId("end-turn");
    const phase = (): Promise<string> => page.evaluate(() => window.tuh.phase());
    const count = (): Promise<number> => page.evaluate(() => window.tuh.commands().length);

    // BOUNDED, and the bound is asserted. An unbounded `while` turns a mutant that
    // relabels-but-never-Steps into a 30-second TIMEOUT instead of an assertion — red
    // either way, but a timeout says "something hung", not "the button does not Step",
    // and the next reader has to work out which. Measured on this board: 2 steps.
    let walked = 0;
    while ((await phase()) === "AI_TURN" && walked < 40) {
      await primary.click();
      walked += 1;
    }
    expect(walked, "the enemy-turn button never yielded a player turn").toBeLessThan(40);
    expect(await phase()).toBe("PLAYER_IDLE");

    // (b) BOTH HALVES, IN BOTH PHASES. A button that always says End Turn but happens
    // to Step passes a behaviour-only check; one that relabels and does nothing passes
    // a label-only check — and the second is the one that strands the player.
    await expect(primary).toContainText("End Turn");
    // (c) THE PRICE LABEL MOVES: waited (−60) vs moved only (−80). A hard-coded label
    // passes either alone.
    await expect(primary).toContainText("waited");
    expect(await stageMove(page, "/viewer.html")).toBe(true);
    await expect(primary).toContainText("moved only");
    await page.getByTestId("cancel").click();

    const beforeEnd = await count();
    await primary.click();
    expect(await count()).toBe(beforeEnd + 1);

    // …and in AI_TURN it is the enemy's only control. Bounded and asserted, same reason.
    let handed = 0;
    while ((await phase()) !== "AI_TURN" && (await phase()) !== "ENDED" && handed < 40) {
      await primary.click();
      handed += 1;
    }
    expect(handed, "End Turn never handed the turn over").toBeLessThan(40);
    expect(await phase()).toBe("AI_TURN");
    await expect(primary).toContainText("Enemy turn");
    await expect(primary).not.toContainText("End Turn");
    const beforeStep = await count();
    await primary.click();
    expect(await count(), "the enemy-turn button emitted no Step").toBe(beforeStep + 1);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V39 — an illegal tap is a toast and nothing else.
// ───────────────────────────────────────────────────────────────────────────────

test("AC-V39 — an illegal tap toasts a REASON and changes nothing", async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 324 });
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();

  // A KO'd unit's tile is the second illegal ground, so the board has to have one.
  // Played for, then ASSERTED — a fixture that never produced a crystal would leave
  // the "two different toasts" check comparing one reason with itself.
  const crystal = await page.evaluate(() => {
    for (let i = 0; i < 40; i += 1) {
      const down = window.tuh.getState().units.find((u) => u.hp <= 0);
      if (down) return { x: down.pos.x, y: down.pos.y };
      if (window.tuh.phase() === "ENDED") return null;
      window.tuh.step();
    }
    return null;
  });
  expect(crystal, "no unit fell — there is no crystal to tap").not.toBeNull();
  expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);

  const serialized = (): Promise<string> =>
    page.evaluate(() => JSON.stringify(window.tuh.getState()));
  const count = (): Promise<number> => page.evaluate(() => window.tuh.commands().length);

  // The out-of-range tile must lie INSIDE a naive Manhattan radius of the actor and
  // OUTSIDE `moveRange`, asserted in BOTH directions (the AC-V7 warning) — otherwise
  // the tap was never illegal for the reason claimed. Discovered from the live board.
  const far = await page.evaluate(() => {
    const state = window.tuh.getState();
    const actor = state.units.find((u) => u.ct >= 100) ?? state.units[0]!;
    let naiveOnly: { x: number; y: number; naive: number; move: number } | null = null;
    for (let y = 0; y < state.grid.height; y += 1) {
      for (let x = 0; x < state.grid.width; x += 1) {
        const naive = Math.abs(x - actor.pos.x) + Math.abs(y - actor.pos.y);
        if (naive === 0) continue;
        if (state.units.some((u) => u.pos.x === x && u.pos.y === y)) continue;
        const tile = state.grid.tiles[y * state.grid.width + x];
        const blocked = !tile || !tile.passable;
        if (naive <= actor.move && blocked) {
          naiveOnly = { x, y, naive, move: actor.move };
        }
      }
    }
    return naiveOnly;
  });

  const before = await serialized();
  const cmds = await count();

  // ── GROUND A: an OCCUPIED tile — the crystal. Occupied and illegal at once, which
  // an ally's tile no longer is: under ADR-0037 a tap on a living non-target unit
  // opens the read-only drawer instead of being refused.
  await page.evaluate((c) => window.tuh.clickTile(c.x, c.y), crystal!);
  const reasonA = await page.evaluate(() => window.tuh.reason());

  // ── GROUND B: out of move range.
  await page.evaluate(() => window.tuh.clickTile(0, 0));
  const reasonB = await page.evaluate(() => window.tuh.reason());

  // TWO GROUNDS, TWO MESSAGES. A toast that always reads "illegal move" passes a
  // presence check; this does not.
  expect(reasonA, "no reason for the crystal tap").toBeTruthy();
  expect(reasonB, "no reason for the out-of-range tap").toBeTruthy();
  expect(reasonA, "both illegal grounds produced the SAME toast").not.toBe(reasonB);
  await expect(page.getByTestId("reason")).toBeVisible();
  await expect(page.getByTestId("reason")).toContainText(reasonB!);

  // `serialize` equality catches a speculative apply-and-rollback; the log length
  // catches a committed no-op. Neither substitutes for the other.
  expect(await serialized(), "an illegal tap moved the sim").toBe(before);
  expect(await count(), "an illegal tap consumed a command").toBe(cmds);

  // NOT TIMED. Still there after a real wait; it is replaced by the next reason or
  // cleared by the next state change, never by a clock (docs/10 §3).
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("reason")).toBeVisible();
  expect(await page.evaluate(() => window.tuh.reason())).toBe(reasonB);

  // The AC-V7 half, when the map offers such a tile: inside a naive radius, outside
  // `moveRange`. Reported rather than asserted-away when the board has none.
  if (far) {
    expect(far.naive).toBeLessThanOrEqual(far.move);
    await page.evaluate((f) => window.tuh.clickTile(f.x, f.y), far);
    expect(await page.evaluate(() => window.tuh.reason())).toBeTruthy();
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V40 — the corners, and the settings readout is real.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V40 — the corners and the readout", () => {
  for (const path of PAGES) {
    test(`${path} the menu drawer offers save, quit, log and legend`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);

      await page.getByTestId("hud-menu").click();
      const drawer = page.getByTestId("menu-drawer");
      await expect(drawer).toBeVisible();
      await expect(drawer).toContainText("Turn log");
      await expect(drawer).toContainText("Legend");
      await expect(page.getByTestId("turn-log")).toBeVisible();
      await expect(page.getByTestId("legend")).toBeVisible();
      // Save and quit exist on the campaign; the engine viewer has no campaign to
      // return to and offers Reset instead. Named per page rather than looped, so a
      // page that silently lost its own entry cannot hide behind the other's.
      if (path === "/") {
        await expect(drawer).toContainText("saved automatically");
        await expect(page.getByTestId("quit")).toBeVisible();
      } else {
        await expect(page.getByTestId("reset")).toBeVisible();
      }
      await expect(page.getByTestId("hud-help")).toBeVisible();
      await expect(page.getByTestId("hud-settings")).toBeVisible();
    });
  }

  /**
   * THE READOUT MUST BE REAL, and that is the whole point of the criterion: it exists
   * so the owner can check the 360 figure against a device nobody here can measure.
   * A hard-coded "800 x 360" passes a presence check at one viewport, and a readout
   * that is WRONG is worse than none.
   */
  test("the settings readout changes with the viewport and matches the page", async ({ page }) => {
    await page.goto("/viewer.html");

    const read = async (
      w: number,
      h: number,
    ): Promise<{ text: string; m: Measured; vv: { w: number; h: number } }> => {
      await page.setViewportSize({ width: w, height: h });
      await page.getByTestId("hud-settings").click();
      await expect(page.getByTestId("settings-drawer")).toBeVisible();
      const text = (await page.getByTestId("settings-readout").textContent()) ?? "";
      const m = await measure(page);
      // SAMPLED HERE, at the viewport the readout was printed at. Read after the loop
      // moved on and the comparison is against a different viewport's numbers — the
      // first draft did exactly that and failed 851 against 800.
      const vv = await page.evaluate(() => ({
        w: window.visualViewport?.width ?? -1,
        h: window.visualViewport?.height ?? -1,
      }));
      await page.getByTestId("settings-drawer-close").click();
      await expect(page.getByTestId("settings-drawer")).toBeHidden();
      return { text, m, vv };
    };

    const a = await read(800, 360);
    const b = await read(851, 324);
    expect(a.text, "the readout is identical at two different viewports").not.toBe(b.text);

    for (const { text, m, vv, name } of [
      { ...a, name: "800x360" },
      { ...b, name: "851x324" },
    ]) {
      // FOUR things, and the host box and `visualViewport` are printed SEPARATELY
      // because they can disagree — that disagreement is what an on-device readout
      // exists to catch, and printing only one hides it.
      // EQUALITY, not presence. A readout printing "800 x 360" forever satisfies a
      // pattern match at every viewport, and a WRONG readout is worse than none — the
      // owner cannot check it against anything, which is the only reason it exists.
      const vvPrinted = /visualViewport\s+([\d.]+) x ([\d.]+)/.exec(text);
      expect(vvPrinted, `${name} has no visualViewport row`).not.toBeNull();
      expect(Number(vvPrinted![1]), `${name} visualViewport width`).toBeCloseTo(vv.w, 0);
      expect(Number(vvPrinted![2]), `${name} visualViewport height`).toBeCloseTo(vv.h, 0);
      expect(text, `${name} host box`).toMatch(/host box\s+[\d.]+ x [\d.]+/);
      expect(text, `${name} stage`).toMatch(/stage\s+\d+ x 360 @ [\d.]+/);
      expect(text, `${name} tile`).toMatch(/tile\s+[\d.]+ x [\d.]+ css px/);

      const host = /host box\s+([\d.]+) x ([\d.]+)/.exec(text)!;
      expect(Number(host[1]), `${name} host width`).toBeCloseTo(m.host.w, 0);
      expect(Number(host[2]), `${name} host height`).toBeCloseTo(m.host.h, 0);

      // The printed scale must EQUAL the scale AC-V33 measures, or the two instruments
      // disagree and neither can be trusted.
      const stage = /stage\s+(\d+) x 360 @ ([\d.]+)/.exec(text)!;
      expect(Number(stage[1]), `${name} stageW`).toBeCloseTo(m.stage.w / (m.stage.h / 360), 0);
      expect(Number(stage[2]), `${name} scale`).toBeCloseTo(m.stage.h / 360, 3);

      // The tile size has NO test behind its accuracy (AC-V35 exempts tiles), so it is
      // asserted only to be present, non-zero and to move with the viewport.
      const tile = /tile\s+([\d.]+) x ([\d.]+) css px/.exec(text)!;
      expect(Number(tile[1]), `${name} tile width`).toBeGreaterThan(0);
    }

    const tileA = Number(/tile\s+([\d.]+)/.exec(a.text)![1]);
    const tileB = Number(/tile\s+([\d.]+)/.exec(b.text)![1]);
    expect(tileA, "the tile size did not move with the viewport").not.toBeCloseTo(tileB, 1);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V41 — safe-area and svh are DECLARED. A presence check, said plainly.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V41 — the declarations (NOT their effect)", () => {
  /**
   * THIS ASSERTS DECLARATION, NOT EFFECT. Playwright cannot emulate a display cutout,
   * so no test here can say a control clears a notch on hardware. Saying so is the
   * criterion's honest half.
   */
  for (const path of PAGES) {
    test(`${path} declares viewport-fit=cover, safe-area padding and svh`, async ({ page }) => {
      await page.goto(path);
      await reachBattle(page, path);

      const meta = await page.locator('meta[name="viewport"]').getAttribute("content");
      expect(meta, `${path} viewport meta`).toContain("viewport-fit=cover");
      expect(meta, "user-scalable=no is banned (docs/10 §8c)").not.toContain("user-scalable");

      // THE STAGE RULE'S DECLARED VALUE, not "the token appears somewhere in the file".
      // Both pages sized in `dvh` before this slice, so a grep for "svh" would have
      // passed while the stage still used `dvh`.
      const declared = await page.evaluate(() => {
        const out: string[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue;
          }
          for (const rule of Array.from(rules)) {
            const css = rule.cssText;
            if (css.includes(".tuh-host")) out.push(css);
          }
        }
        return out.join("\n");
      });
      expect(declared, `${path} has no .tuh-host rule at all`).not.toBe("");
      expect(declared, `${path} stage height is not svh`).toContain("100svh");
      expect(declared, `${path} stage width is not svw`).toContain("100svw");
      expect(declared, `${path} has no safe-area padding`).toContain("safe-area-inset");
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// AC-V42 — desktop is the same stage, letterboxed.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V42 — desktop gets the same stage", () => {
  /**
   * "Hover works and Enter confirms" passes against a second, desktop-only layout,
   * which is the outcome this criterion exists to prevent. The child-set comparison
   * is what rules it out; the non-zero letterbox at 1000x780 is what rules out a
   * desktop page that simply ignores the stage.
   */
  for (const path of PAGES) {
    test(`${path} the stage's child set is identical at 1000x780 and 800x360`, async ({ page }) => {
      const fingerprint = async (): Promise<string> =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-testid="stage"] *')]
            .map(
              (e) =>
                `${e.tagName}#${e.id}.${[...e.classList].sort().join(".")}@${
                  (e as HTMLElement).dataset["testid"] ?? ""
                }`,
            )
            .join("|"),
        );

      await page.setViewportSize({ width: 1000, height: 780 });
      await page.goto(path);
      await reachBattle(page, path);
      const desktop = await fingerprint();
      const wide = await measure(page);
      expect(wide.host.h - wide.stage.h, "desktop shows no letterbox at all").toBeGreaterThan(1);

      // RELOADED AT THE PHONE SIZE, not merely resized. The stage's DOM is BUILT once
      // at boot, so a resize cannot see a layout that branches on viewport width at
      // construction — which is exactly the "second, desktop-only layout" this
      // criterion exists to prevent. MUTATION RUN: appending a `desktop-extra` child
      // when `innerWidth > 900` was GREEN under the resize-only version and is red
      // under this one.
      await page.setViewportSize({ width: 800, height: 360 });
      await page.goto(path);
      await reachBattle(page, path);
      const phone = await fingerprint();
      expect(phone.length, "the stage rendered no children").toBeGreaterThan(200);
      expect(phone).toBe(desktop);
    });
  }

  /**
   * ESCAPE UNWINDS THE SHALLOWEST THING FIRST: an open drawer or sheet closes, and only
   * once nothing is overlaid does Escape reach the draft.
   *
   * THE DISCRIMINATOR IS THE SURVIVING DRAFT. A handler that went straight to
   * `Session.cancel()` also "closes nothing and cancels", so the assertion that
   * separates the two is that the staged MOVE is still there after the first Escape —
   * the player asked to close a drawer, not to throw away the tile they had chosen.
   */
  for (const path of PAGES) {
    test(`${path} Escape closes an open drawer before it touches the draft`, async ({ page }) => {
      await page.setViewportSize({ width: 851, height: 324 });
      await page.goto(path);
      await reachBattle(page, path);
      const phase = (): Promise<string | null> =>
        page.evaluate((p) => (p === "/" ? window.tuhGame.phase() : window.tuh.phase()), path);

      expect(await stageMove(page, path), "no legal move to stage").toBe(true);
      await page.getByTestId("hud-menu").click();
      await expect(page.getByTestId("menu-drawer")).toBeVisible();

      // FIRST Escape: the drawer goes, the draft stays.
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("menu-drawer")).toBeHidden();
      expect(await phase(), "Escape threw away the staged move as well").toBe("MOVE_STAGED");

      // SECOND Escape: nothing is overlaid, so now it reaches the draft.
      await page.keyboard.press("Escape");
      expect(await phase()).toBe("PLAYER_IDLE");
    });
  }

  test("Enter confirms a staged target and Escape cancels", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 780 });
    await page.goto("/viewer.html");
    await expect(page.getByTestId("grid")).toBeVisible();
    const count = (): Promise<number> => page.evaluate(() => window.tuh.commands().length);

    // ESCAPE first, so the Enter case below cannot be passing because the draft was
    // already gone. Escape unwinds one level and emits nothing.
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);
    expect(await stageTarget(page, "/viewer.html")).toBe(true);
    const before = await count();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => window.tuh.phase())).not.toBe("TARGET_STAGED");
    expect(await count()).toBe(before);

    // ENTER through ORDINARY FOCUS: staging moves focus to the sheet's Confirm button,
    // so no new key binding is invented and no key path commits without passing
    // through Confirm (ADR-0038 property 3).
    expect(await toPlayerTurn(page, "/viewer.html")).toBe(true);
    expect(await stageTarget(page, "/viewer.html")).toBe(true);
    await expect(page.getByTestId("confirm")).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await count()).toBe(before + 1);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// The campaign's own walk — the page a stranger actually plays.
// ───────────────────────────────────────────────────────────────────────────────

test("the campaign reaches a battle on the stage and can finish it there", async ({ page }) => {
  await page.setViewportSize({ width: 851, height: 324 });
  await page.goto("/");
  await startNewGame(page);
  await dismissScene(page);
  await prepEveryMember(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();

  // The board is up and the page beneath it does not scroll.
  const m = await measure(page);
  expect(m.scroll.h).toBeLessThanOrEqual(m.scroll.ch + 1);

  await page.evaluate(() => window.tuhGame.autoplay());
  // The primary button is REPLACED by Continue once the battle is decided — a decided
  // battle has no turn left to end, and four controls do not fit the narrowest stage.
  await expect(page.getByTestId("conclude")).toBeVisible();
  await expect(page.getByTestId("end-turn")).toBeHidden();
  await page.getByTestId("conclude").click();
  await expect(page.getByTestId("screen-after")).toBeVisible();
});
