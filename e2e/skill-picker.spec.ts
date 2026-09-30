import { test, expect, type Browser, type Page } from "@playwright/test";
import { startNewGame, dismissScene, openMember, backToParty } from "./helpers.js";

/**
 * THE SKILL PICKER, in a real browser (`intent/skill-picker.md`, AC-V23…V29). The
 * headless half (`session.test.ts`) proves the STATE MACHINE, mutation-verified; this
 * file proves the DOM — CSS layout, real clicks reaching the same `Session` methods,
 * and (found only by driving the real Cancel button rather than calling
 * `session.cancel()` directly) that the button was DISABLED outside a staged draft and
 * so the picker's own "back one level" was unreachable by anyone without a script.
 * Fixed in `hud.ts`'s `cancelBtn.disabled` in the same slice.
 *
 * FIXTURES: campaign battle 1 (`/`), never `/viewer.html` (out of scope,
 * `intent/skill-picker.md`). No shipped unit carries two skills, so
 * `reachBriarWithExtraSkills` grants Briar (`pc-briar`) two more real archer-tree
 * nodes through the SAME `prep().learn()` seam the LEARN button calls —
 * `aim.leg-shot` and `aim.piercing-shot`, both requiring only `aim.aimed-shot`, which
 * every archer starts with. `grantTestAp` is TEST-ONLY (mirrors
 * `campaign-shell.test.ts`'s own `updateParty({ ap: 500 })`); it skips the AP grind,
 * it does not fabricate an ability. This is REAL shipped content reached through the
 * REAL prep pipeline, not a hard-coded skill list — `docs/proposals/action-menu.md`
 * AC-V23(b) is the precedent for a fixture-only case honestly labelled as one.
 */

const VIEWPORTS: { name: string; size: { width: number; height: number } }[] = [
  { name: "832x328", size: { width: 832, height: 328 } },
  { name: "832x384", size: { width: 832, height: 384 } },
];

/** Step the balance probe until `blue-briar` itself holds a player turn, or fail. */
async function stepToBriar(page: Page): Promise<void> {
  const reached = await page.evaluate(() => {
    const g = window.tuhGame;
    for (let i = 0; i < 60; i += 1) {
      const active = g.state()?.units.find((u) => u.ct >= 100 && u.hp > 0);
      const ph = g.phase();
      if (
        active?.id === "blue-briar" &&
        (ph === "PLAYER_IDLE" || ph === "MOVE_STAGED" || ph === "TARGET_STAGED")
      ) {
        return true;
      }
      if (ph === null || ph === "ENDED") return false;
      g.step();
    }
    return false;
  });
  expect(reached, "battle 1's fixed seed no longer gives Briar her own turn in 60 steps").toBe(true);
}

/** Fresh game, past the prologue, Briar on her own turn — no extra skills. */
async function reachBriarTurn(page: Page): Promise<void> {
  await startNewGame(page);
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await stepToBriar(page);
}

/**
 * `reachBriarTurn`, but with Briar re-armed with the Arming Sword in prep first, so her
 * Attack reaches 1 (a melee swing) instead of the Long Bow's 4 (ADR-0049). Two tests need
 * "Attack with NO foe in reach" on her first turn, and that premise is a fact about her
 * weapon, not about archers: with the bow shipped a foe IS in reach and no reason shows.
 * The swap goes through the prep weapon dropdown (`updateParty`, the same path a player
 * uses) and the premise is asserted here so a content change fails at the setup, not at
 * a locator timeout on `target-reason`.
 */
async function reachMeleeBriarTurn(page: Page): Promise<void> {
  await startNewGame(page);
  await dismissScene(page);
  await openMember(page, "pc-briar");
  await page.getByTestId("prep-weapon").selectOption("wpn-arming-sword");
  await expect(
    page.getByTestId("prep-weapon"),
    "premise: Briar must be on the Arming Sword (reach 1) for a foe to be out of reach on her first turn",
  ).toHaveValue("wpn-arming-sword");
  await backToParty(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await stepToBriar(page);
}

/**
 * `reachBriarTurn`, plus two more real archer skills learned for Briar first — see the
 * file header. Three real skills is what Briar can reach (a third extra learn ends the
 * fight before her turn); the 5- and 9-skill cases use Ottoline instead
 * (`reachOttolineWithSkillCount`: priest actions + a wizard Secondary), also real content.
 */
async function reachBriarWithExtraSkills(page: Page): Promise<void> {
  await startNewGame(page);
  await dismissScene(page);
  await page.evaluate(() => {
    const g = window.tuhGame;
    g.grantTestAp("pc-briar", 1000);
    const p = g.prep()!;
    p.select("pc-briar");
    p.learn("archer", "leg-shot");
    p.learn("archer", "piercing-shot");
  });
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await stepToBriar(page);
}

/**
 * EVERY NUMBER OWNER CORRECTION 2 (2026-09-29) NAMES, measured off the live DOM in one
 * place so both viewports and the overflow case read the same instrument. `stage` is
 * the stage's own box (the board column starts at its left), `rail` the turn rail; the
 * ribbon is `.tuh-ribbon`, whose top is the top of every button. `up` / `down` are the
 * continuation cues, "visible" meaning not `hidden` and actually displayed.
 */
async function measureMenu(page: Page) {
  return page.evaluate(() => {
    const rect = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const shown = (e: Element) => !(e as HTMLElement).hidden && getComputedStyle(e).display !== "none";
    const menu = document.querySelector<HTMLElement>('[data-testid="skill-menu"]')!;
    const scroller = document.querySelector<HTMLElement>('[data-testid="skill-menu-rows"]')!;
    const rows = [...scroller.querySelectorAll<HTMLElement>('[data-testid="skill-row"]')];
    return {
      menu: rect(menu),
      scroller: rect(scroller),
      stage: rect(document.querySelector(".tuh-stage")!),
      ribbon: rect(document.querySelector(".tuh-ribbon")!),
      skill: rect(document.querySelector('[data-testid="actions"]')!),
      rail: rect(document.querySelector(".tuh-rail")!),
      canvas: rect(document.querySelector('[data-testid="grid"]')!),
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      scrollTop: scroller.scrollTop,
      upVisible: shown(document.querySelector('[data-testid="skill-menu-up"]')!),
      downVisible: shown(document.querySelector('[data-testid="skill-menu-down"]')!),
      menuText: menu.textContent ?? "",
      ids: rows.map((r) => r.dataset["ability"]),
      names: rows.map((r) => r.textContent),
      highlightedIds: rows.filter((r) => r.classList.contains("highlighted")).map((r) => r.dataset["ability"]),
      rows: rows.map((r) => ({
        ...rect(r),
        fontSize: parseFloat(getComputedStyle(r).fontSize),
        textFit: [r.clientWidth, r.scrollWidth],
      })),
    };
  });
}

/** The plate's rendered text, and how far every text node sits inside the plate's box. */
async function plateReading(page: Page) {
  return page.evaluate(() => {
    const plate = document.querySelector('[data-testid="target-plate"]') as HTMLElement;
    const box = plate.getBoundingClientRect();
    const walker = document.createTreeWalker(plate, NodeFilter.SHOW_TEXT);
    let minInset = Infinity;
    let minFont = Infinity;
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if (!n.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      minInset = Math.min(minInset, r.top - box.top, box.bottom - r.bottom, r.left - box.left, box.right - r.right);
      minFont = Math.min(minFont, parseFloat(getComputedStyle(n.parentElement!).fontSize));
    }
    return { text: plate.innerText, minInset, minFont };
  });
}

/** Tap a menu row by ability id — a real pointer click on the row, never a seam call. */
const row = (page: Page, id: string) => page.locator(`[data-testid="skill-row"][data-ability="${id}"]`);

for (const vp of VIEWPORTS) {
  test(`three real skills: a narrow vertical menu meets the ribbon, centred on SKILL, all rows whole; two taps pick — ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachBriarWithExtraSkills(page);
    await expect(page.getByTestId("entry-plaque")).toBeHidden();
    const commandsBefore = await page.evaluate(() => window.tuhGame.commandCount());
    const boardBefore = await page.getByTestId("grid").boundingBox();

    await page.getByTestId("actions").click();
    await expect(page.getByTestId("skill-menu")).toBeVisible();
    const m = await measureMenu(page);

    // IDENTITY: the rows ARE the unit's real skills, in the sim's own order, and the
    // names are the ones the unit plate/prep screen print for those ids.
    const optionIds = await page.evaluate(() => window.tuhGame.skillOptions().map((o) => o.ability.id));
    expect(optionIds).toEqual(["aim.aimed-shot", "aim.leg-shot", "aim.piercing-shot"]);
    expect(m.ids).toEqual(optionIds);
    expect(m.names).toEqual(["Aimed Shot", "Leg Shot", "Piercing Shot"]);

    // LOOK 1: every row >= 44px, and the rows are ONE column (each strictly below the last,
    // all the same left edge) — a horizontal layout fails the second half.
    for (const r of m.rows) expect(r.height, "a row is under the 44px touch floor").toBeGreaterThanOrEqual(44);
    for (let i = 1; i < m.rows.length; i += 1) {
      expect(m.rows[i]!.top, `row ${i + 1} is not below row ${i}`).toBeGreaterThanOrEqual(m.rows[i - 1]!.bottom - 0.5);
      expect(Math.abs(m.rows[i]!.left - m.rows[0]!.left), "rows do not share one column").toBeLessThanOrEqual(0.5);
    }

    // LOOK 2: the menu's bottom edge meets the ribbon (0-6px).
    const gap = m.ribbon.top - m.menu.bottom;
    expect(gap, `menu bottom to ribbon top is ${gap}px`).toBeGreaterThanOrEqual(-0.01);
    expect(gap, `menu bottom to ribbon top is ${gap}px`).toBeLessThanOrEqual(6);

    // LOOK 3: centred on SKILL (within 40px) unless clamped, and always inside the board column.
    const menuMid = (m.menu.left + m.menu.right) / 2;
    const skillMid = (m.skill.left + m.skill.right) / 2;
    expect(m.menu.left, "menu runs off the board's left edge").toBeGreaterThanOrEqual(m.stage.left);
    expect(m.menu.right, "menu runs under the turn rail").toBeLessThanOrEqual(m.rail.left);
    const clamped = m.menu.left <= m.stage.left + 4.5 || m.menu.right >= m.rail.left - 4.5;
    if (!clamped) expect(Math.abs(menuMid - skillMid), `menu centre ${menuMid} vs SKILL centre ${skillMid}`).toBeLessThanOrEqual(40);

    // LOOK 4: narrow.
    expect(m.menu.width, "the menu is wider than 240px").toBeLessThanOrEqual(240);

    // LOOK 5: three real skills all fit WHOLE — nothing scrolls, no cue shows.
    expect(m.scrollHeight, "three real skills scroll").toBeLessThanOrEqual(m.clientHeight);
    expect(m.upVisible, "an up cue shows with nothing above").toBe(false);
    expect(m.downVisible, "a down cue shows with nothing below").toBe(false);
    for (const r of m.rows) {
      expect(r.top, "a row is cut at the top of the window").toBeGreaterThanOrEqual(m.scroller.top - 0.5);
      expect(r.bottom, "a row is cut at the bottom of the window").toBeLessThanOrEqual(m.scroller.bottom + 0.5);
    }

    // LOOK 6: row text >= 11px, never clipped sideways, and NO "Reach" inside the menu.
    for (const r of m.rows) {
      expect(r.fontSize).toBeGreaterThanOrEqual(11);
      expect(r.textFit[1], "a row's text is clipped horizontally").toBeLessThanOrEqual(r.textFit[0]!);
    }
    expect(m.menuText, "Reach N belongs in the plate, not under each row").not.toContain("Reach");

    // The menu is a `position: absolute` overlay — it must not push the board.
    expect(await page.getByTestId("grid").boundingBox()).toEqual(boardBefore);

    // OPENS with row 1 highlighted and the plate showing it: name + "Reach".
    expect(m.highlightedIds).toEqual(["aim.aimed-shot"]);
    let plate = await plateReading(page);
    expect(plate.text).toContain("Aimed Shot");
    expect(plate.text).toContain("Reach");
    expect(plate.minInset, "plate text is clipped by its own box").toBeGreaterThanOrEqual(1);
    expect(plate.minFont).toBeGreaterThanOrEqual(11);

    // FIRST tap on row 2 HIGHLIGHTS it: pointer moves, plate names row 2 — nothing is picked.
    await row(page, "aim.leg-shot").click();
    expect((await measureMenu(page)).highlightedIds).toEqual(["aim.leg-shot"]);
    plate = await plateReading(page);
    expect(plate.text, "the plate still names row 1 (or not row 2)").toContain("Leg Shot");
    expect(plate.text).not.toContain("Aimed Shot");
    expect(plate.text).toContain("Reach");
    expect(await page.evaluate(() => window.tuhGame.selectedSkill()), "the first tap picked").toBeNull();
    await expect(page.getByTestId("skill-menu")).toBeVisible();

    // SECOND tap on the highlighted row PICKS it: menu gone, reach painted, layout back.
    await row(page, "aim.leg-shot").click();
    expect(await page.evaluate(() => window.tuhGame.selectedSkill())).toBe("aim.leg-shot");
    await expect(page.getByTestId("skill-menu"), "menu must vanish on pick").toBeHidden();
    await expect(page.locator('[data-testid="skill-row"]')).toHaveCount(0);
    expect(await page.getByTestId("grid").boundingBox(), "board moved after a pick").toEqual(boardBefore);
    expect(await page.evaluate(() => window.tuhGame.reach().length)).toBeGreaterThan(0);

    // Cancel unwinds ONE level: back to the menu, row 1 highlighted afresh, not to root.
    await page.getByTestId("cancel").click();
    await expect(page.getByTestId("skill-menu"), "Cancel must reopen the menu").toBeVisible();
    expect(await page.evaluate(() => window.tuhGame.selectedSkill())).toBeNull();
    expect((await measureMenu(page)).highlightedIds).toEqual(["aim.aimed-shot"]);

    // Cancel again: back to root — menu absent, board rect identical to pre-Skill.
    await page.getByTestId("cancel").click();
    expect(await page.evaluate(() => window.tuhGame.commandMode())).toBeNull();
    await expect(page.getByTestId("skill-menu")).toBeHidden();
    expect(await page.getByTestId("grid").boundingBox(), "board moved after Cancel").toEqual(boardBefore);

    expect(
      await page.evaluate(() => window.tuhGame.commandCount()),
      "highlighting, picking and cancelling must never itself commit a command",
    ).toBe(commandsBefore);
  });
}

/**
 * REAL content at 5 and 9 skills, no clones: Ottoline (priest) learns her tree's four
 * castable actions, and the wizard nodes named here are learned through the same
 * `prep().learn()` seam, with `wizard` set as her Secondary through `setSlot` (the
 * `<select>`'s own seam). The menu's rows are then `skillOptions()` exactly. Measured:
 * `[]` gives 4 skills, `["fire"]` 5, all five nodes 9 (priest 4 + wizard 5).
 */
const WIZARD_NODES = ["fire", "fire-2", "bolt", "bolt-2", "ice"];
async function reachOttolineWithSkillCount(page: Page, total: 5 | 9): Promise<void> {
  const wizard = WIZARD_NODES.slice(0, total - 4);
  await startNewGame(page);
  await dismissScene(page);
  await page.evaluate((nodes) => {
    const g = window.tuhGame;
    g.grantTestAp("pc-ottoline", 5000);
    const p = g.prep()!;
    p.select("pc-ottoline");
    for (const n of ["cura", "holy", "retribution", "esuna", "protect", "raise"]) p.learn("priest", n);
    for (const n of nodes) p.learn("wizard", n);
    p.setSlot("secondary", "wizard");
  }, wizard);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  const reached = await page.evaluate((want) => {
    const g = window.tuhGame;
    for (let i = 0; i < 300; i += 1) {
      const ph = g.phase();
      if (ph === null || ph === "ENDED") return false;
      if (ph === "PLAYER_IDLE" && g.skillOptions().length === want) return true;
      g.step();
    }
    return false;
  }, total);
  expect(reached, `battle 1's fixed seed no longer gives Ottoline her own ${total}-skill turn`).toBe(true);
  await expect(page.getByTestId("entry-plaque")).toBeHidden();
}

/** A page for `n` skills in its OWN browser context (a fresh save), at `vp`. */
async function menuPageWith(browser: Browser, vp: { width: number; height: number }, n: 3 | 5 | 9): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: vp });
  const page = await context.newPage();
  await page.goto("/");
  if (n === 3) {
    await reachBriarWithExtraSkills(page);
    await expect(page.getByTestId("entry-plaque")).toBeHidden();
  } else {
    await reachOttolineWithSkillCount(page, n);
  }
  return { page, close: () => context.close() };
}

/**
 * PASS-5 VALUES, kept as constants because pass 5 was never committed (git HEAD still
 * holds the chip row), measured off the running pass-5 build (`probe-pass5-*.json`,
 * with the same three real rows and with nine rows in the scroller):
 *   menu top y, 3 skills / 9 skills: 832x328 = 112 / 66, 832x384 = 168 / 122
 *   frame: `border: 0`; the visible dark frame was PADDING — 6px at the sides and
 *   13px top and bottom (the cue strips), around a 1px inset gold line.
 * "Border width" in the brief is read as that visible frame thickness (a computed
 * border of 0 cannot be beaten by a border that is "strictly less").
 */
const PASS5 = {
  top3: { "832x328": 112, "832x384": 168 } as Record<string, number>,
  top9: { "832x328": 66, "832x384": 122 } as Record<string, number>,
  frameSide: 6,
  frameVertical: 13,
};

/**
 * Is this cue actually PAINTED? `hidden` and `display` cannot tell: the ▲ was "visible" to
 * every attribute check while the scroller (a later positioned sibling) covered it. A/B on
 * the pixels — screenshot the cue's own box, hide the cue, screenshot again: the two differ
 * only if the cue reached the screen. Restores the cue afterwards.
 */
async function cuePainted(page: Page, testId: "skill-menu-up" | "skill-menu-down"): Promise<boolean> {
  const cue = page.getByTestId(testId);
  const box = (await cue.boundingBox())!;
  const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) };
  const shown = await page.screenshot({ clip });
  await cue.evaluate((e) => ((e as HTMLElement).style.visibility = "hidden"));
  const gone = await page.screenshot({ clip });
  await cue.evaluate((e) => ((e as HTMLElement).style.visibility = ""));
  return !shown.equals(gone);
}

/** Every row that intersects the scroller's window lies fully inside it. */
function wholeRowsOnly(m: Awaited<ReturnType<typeof measureMenu>>, label: string): void {
  const vis = m.rows.filter((r) => r.bottom > m.scroller.top + 0.5 && r.top < m.scroller.bottom - 0.5);
  expect(vis.length, `${label}: no row is in the window`).toBeGreaterThan(0);
  for (const r of vis) {
    expect(r.top, `${label}: a row is cut at the window's top (row top ${r.top} < window ${m.scroller.top})`).toBeGreaterThanOrEqual(m.scroller.top - 0.5);
    expect(r.bottom, `${label}: a row is cut at the window's bottom (row bottom ${r.bottom} > window ${m.scroller.bottom})`).toBeLessThanOrEqual(m.scroller.bottom + 0.5);
  }
}

for (const vp of VIEWPORTS) {
  test(`fixed window: 3, 5 and 9 skills all show exactly 3 whole rows of 46px in one identical frame — ${vp.name}`, async ({ browser }) => {
    const seen: Record<number, Awaited<ReturnType<typeof measureMenu>>> = {};
    let frame: { borders: string[]; colour: string } | null = null;
    for (const n of [3, 5, 9] as const) {
      const { page, close } = await menuPageWith(browser, vp.size, n);
      // Nothing else in the band moves: rects with the menu closed vs open.
      const bandRects = () =>
        page.evaluate(() => {
          const R = (s: string) => {
            const r = document.querySelector(s)!.getBoundingClientRect();
            return [r.left, r.top, r.width, r.height];
          };
          return {
            ribbon: R(".tuh-ribbon"),
            actor: R('[data-testid="actor-tab"]'),
            target: R('[data-testid="target-plate"]'),
            rail: R(".tuh-rail"),
            board: R('[data-testid="grid"]'),
          };
        });
      const closed = await bandRects();
      await page.getByTestId("actions").click();
      await expect(page.getByTestId("skill-menu")).toBeVisible();
      const m = await measureMenu(page);
      seen[n] = m;
      expect(await bandRects(), `${n} skills: opening the menu moved the ribbon, a plate, the rail or the board`).toEqual(closed);

      // IDENTITY: the rows are the sim's own options, in order.
      const options = await page.evaluate(() => window.tuhGame.skillOptions().map((o) => o.ability.id));
      expect(options.length).toBe(n);
      expect(m.ids, `${n} skills: rows are not skillOptions() in order`).toEqual(options);
      expect(new Set(m.names).size, `${n} skills: two rows carry the same label`).toBe(n);

      // LOOK: row 46px; the scroller's window is exactly 3 rows.
      expect(m.rows.length).toBe(n);
      for (const r of m.rows) expect(r.height, `${n} skills: a row is not 46px`).toBe(46);
      expect(m.clientHeight, `${n} skills: the window is not exactly 3 rows`).toBe(3 * 46);
      expect(m.scrollHeight, `${n} skills: rows do not stack at 46px`).toBe(n * 46);
      wholeRowsOnly(m, `${n} skills at rest`);

      // Frame: the scroller sits 2px or less inside the menu on every side, and the
      // computed border is <= 2px — both strictly under pass 5's 6px / 13px.
      const insets = {
        left: m.scroller.left - m.menu.left,
        right: m.menu.right - m.scroller.right,
        top: m.scroller.top - m.menu.top,
        bottom: m.menu.bottom - m.scroller.bottom,
      };
      for (const side of ["left", "right"] as const) {
        expect(insets[side], `${n}: frame ${side} thickness`).toBeLessThanOrEqual(2);
        expect(insets[side]).toBeLessThan(PASS5.frameSide);
      }
      for (const side of ["top", "bottom"] as const) {
        expect(insets[side], `${n}: frame ${side} thickness`).toBeLessThanOrEqual(2);
        expect(insets[side]).toBeLessThan(PASS5.frameVertical);
      }
      const cs = await page.evaluate(() => {
        const c = getComputedStyle(document.querySelector('[data-testid="skill-menu"]')!);
        return { borders: [c.borderTopWidth, c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth], colour: c.borderTopColor };
      });
      for (const b of cs.borders) expect(parseFloat(b), `${n}: computed border width`).toBeLessThanOrEqual(2);
      expect(cs.borders.map(parseFloat).every((b) => b > 0), "the iron border is gone").toBe(true);
      frame = cs;
      await close();
    }
    // The outer box is identical across 3, 5 and 9 skills — and is exactly 3 rows + 2 borders.
    expect(seen[5]!.menu.height, "5 skills changed the menu's outer height").toBe(seen[3]!.menu.height);
    expect(seen[9]!.menu.height, "9 skills changed the menu's outer height").toBe(seen[3]!.menu.height);
    expect(seen[3]!.menu.height).toBe(3 * 46 + 4);
    expect(seen[9]!.menu.width, "the menu's width changed with skill count").toBeLessThanOrEqual(240);
    expect(frame).not.toBeNull();

    // The menu is at least 46px lower than pass 5's (nine rows in the scroller, where
    // pass 5 grew to 4 rows + cue strips = 210px), and lower than pass 5's three-row menu.
    const top9 = seen[9]!.menu.top;
    console.log(`[skill-menu ${vp.name}] top y pass5=${PASS5.top9[vp.name]} (9 skills) / ${PASS5.top3[vp.name]} (3) -> pass6=${top9} / ${seen[3]!.menu.top}; row 46, window ${seen[9]!.clientHeight}, menu ${seen[9]!.menu.height}`);
    expect(top9 - PASS5.top9[vp.name]!, "the 9-skill menu's top is not >= 46px lower than pass 5's").toBeGreaterThanOrEqual(46);
    expect(seen[3]!.menu.top, "the 3-skill menu's top is not lower than pass 5's").toBeGreaterThan(PASS5.top3[vp.name]!);
  });

  test(`scrolling snaps to whole rows, and the up/down cues take no row's space — ${vp.name}`, async ({ browser }) => {
    const { page, close } = await menuPageWith(browser, vp.size, 9);
    await page.getByTestId("actions").click();
    await expect(page.getByTestId("skill-menu")).toBeVisible();
    const top = await measureMenu(page);

    // AT TOP: up hidden, down visible.
    expect(top.scrollTop).toBe(0);
    expect(top.upVisible, "up cue at the top").toBe(false);
    expect(top.downVisible, "down cue missing with rows below").toBe(true);
    wholeRowsOnly(top, "at rest");
    expect(await cuePainted(page, "skill-menu-down"), "the down cue is in the DOM but not painted").toBe(true);

    // ONE STEP DOWN with a real wheel of LESS than a row (40 < 46): only scroll-snap can
    // land this on a whole row. Without snap, scrollTop rests at 40 and row 1 is cut.
    await page.getByTestId("skill-menu-rows").hover();
    await page.mouse.wheel(0, 40);
    await expect.poll(async () => (await measureMenu(page)).scrollTop, { message: "the wheel never scrolled" }).toBeGreaterThan(0);
    await expect
      .poll(async () => (await measureMenu(page)).scrollTop % 46, { message: "scroll did not settle on a whole row" })
      .toBe(0);
    const step = await measureMenu(page);
    wholeRowsOnly(step, "after one wheel step");

    // MIDDLE: both cues; the window and the rows' positions are those of the top state.
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('[data-testid="skill-menu-rows"]')!.scrollTop = 3 * 46;
    });
    await expect.poll(async () => (await measureMenu(page)).upVisible).toBe(true);
    const mid = await measureMenu(page);
    expect(mid.downVisible, "down cue in the middle").toBe(true);
    wholeRowsOnly(mid, "middle");
    expect(await cuePainted(page, "skill-menu-up"), "the up cue is in the DOM but not painted (covered by the rows)").toBe(true);
    expect(await cuePainted(page, "skill-menu-down"), "the down cue is in the DOM but not painted").toBe(true);

    // END: up visible, down hidden.
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>('[data-testid="skill-menu-rows"]')!;
      s.scrollTop = s.scrollHeight;
    });
    await expect.poll(async () => (await measureMenu(page)).downVisible).toBe(false);
    const end = await measureMenu(page);
    expect(end.upVisible, "up cue at the end").toBe(true);
    expect(end.scrollTop).toBe((9 - 3) * 46);
    wholeRowsOnly(end, "end");
    expect(await cuePainted(page, "skill-menu-up"), "the up cue at the end is not painted").toBe(true);

    // The cues never cost the window anything: same scroller box in every state.
    for (const s of [step, mid, end]) {
      expect(s.clientHeight, "a cue took space from the window").toBe(top.clientHeight);
      expect(s.scroller.top, "a cue pushed the rows").toBe(top.scroller.top);
      expect(s.menu.height).toBe(top.menu.height);
    }
    // Overlay, not strip: a shown cue sits inside the frame's own box.
    const cue = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="skill-menu-up"]')!.getBoundingClientRect();
      const m = document.querySelector('[data-testid="skill-menu"]')!.getBoundingClientRect();
      return { insideTop: c.top >= m.top - 0.5, insideBottom: c.bottom <= m.bottom + 0.5, h: c.height };
    });
    expect(cue.insideTop && cue.insideBottom, "the up cue is outside the frame").toBe(true);
    expect(cue.h, "the cue is a full-height block").toBeLessThan(46 / 2);
    await close();
  });

  test(`keyboard Down from row 3 of 5 highlights row 4, scrolls it fully into view, and the plate names it — ${vp.name}`, async ({ browser }) => {
    const { page, close } = await menuPageWith(browser, vp.size, 5);
    await page.getByTestId("actions").click();
    await expect(page.getByTestId("skill-menu-rows")).toBeFocused();
    const options = await page.evaluate(() => window.tuhGame.skillOptions().map((o) => o.ability.id));
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    let m = await measureMenu(page);
    expect(m.highlightedIds).toEqual([options[2]]);
    const row3Name = m.names[2]!;
    await page.keyboard.press("ArrowDown");
    m = await measureMenu(page);
    // IDENTITY: row 4's own skill id, not merely "some other row".
    expect(m.highlightedIds).toEqual([options[3]]);
    const i = m.ids.indexOf(options[3]);
    expect(i).toBe(3);
    const r4 = m.rows[i]!;
    expect(r4.top, "row 4 is cut at the window's top").toBeGreaterThanOrEqual(m.scroller.top - 0.5);
    expect(r4.bottom, "row 4 is cut at the window's bottom").toBeLessThanOrEqual(m.scroller.bottom + 0.5);
    wholeRowsOnly(m, "after Down to row 4");
    expect(m.scrollTop % 46).toBe(0);
    const plate = await plateReading(page);
    expect(plate.text, "the plate does not name row 4's skill").toContain(m.names[i]!);
    expect(plate.text, "the plate still names row 3").not.toContain(row3Name);
    await close();
  });
}

/**
 * PASS-6 FRAME, as constants (measured fresh off the pass-6 build with the 9-skill
 * Ottoline fixture before the pass-7 CSS edit): the keyline must not move or resize the
 * menu by a pixel. `top` differs per viewport because the menu meets the ribbon.
 */
const PASS6_MENU: Record<string, { w: number; h: number; left: number; top: number }> = {
  "832x328": { w: 168, h: 142, left: 226, top: 134 },
  "832x384": { w: 168, h: 142, left: 226, top: 190 },
};

/**
 * THE INVARIANT (owner, 2026-09-29): in any settled state the plate's skill == the
 * highlighted row == a row fully visible in the window. Returns the highlighted id so a
 * caller can also assert WHICH row (the identity), not merely "some visible one".
 */
async function expectHighlightSettled(page: Page, label: string): Promise<string> {
  const m = await measureMenu(page);
  expect(m.highlightedIds.length, `${label}: exactly one highlighted row`).toBe(1);
  const id = m.highlightedIds[0]!;
  const i = m.ids.indexOf(id);
  const r = m.rows[i]!;
  expect(r.top, `${label}: the highlighted row is cut at the window's top`).toBeGreaterThanOrEqual(m.scroller.top - 0.5);
  expect(r.bottom, `${label}: the highlighted row is cut at the window's bottom`).toBeLessThanOrEqual(m.scroller.bottom + 0.5);
  const plate = await plateReading(page);
  expect(plate.text.toLowerCase(), `${label}: the plate does not name the highlighted row "${m.names[i]}"`).toContain(m.names[i]!.toLowerCase());
  for (let k = 0; k < m.names.length; k += 1) {
    if (k === i) continue;
    // Another skill's name may be a substring of this one's (Cure / Cura): only flag a
    // name that the highlighted one does not contain.
    if (m.names[i]!.toLowerCase().includes(m.names[k]!.toLowerCase())) continue;
    expect(plate.text.toLowerCase(), `${label}: the plate also names row ${k + 1} "${m.names[k]}"`).not.toContain(m.names[k]!.toLowerCase());
  }
  return id;
}

const settleEvent = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-testid="skill-menu-rows"]')!.dispatchEvent(new Event("scrollend")));
const setScroll = (page: Page, top: number) =>
  page.evaluate((t) => {
    document.querySelector<HTMLElement>('[data-testid="skill-menu-rows"]')!.scrollTop = t;
  }, top);

for (const vp of VIEWPORTS) {
  test(`the highlight is always visible: keys scroll exactly one row, and a settled scroll moves it into the window — ${vp.name}`, async ({ browser }) => {
    const { page, close } = await menuPageWith(browser, vp.size, 9);
    await page.getByTestId("actions").click();
    await expect(page.getByTestId("skill-menu-rows")).toBeFocused();
    const options = await page.evaluate(() => window.tuhGame.skillOptions().map((o) => o.ability.id));
    expect(options.length).toBe(9);
    expect(await expectHighlightSettled(page, "open"), "opens on row 1").toBe(options[0]);

    // (a) Down x4: the window follows ONE row per step once the highlight passes row 3.
    const scrollAfterEach: number[] = [];
    for (let k = 1; k <= 4; k += 1) {
      await page.keyboard.press("ArrowDown");
      expect(await expectHighlightSettled(page, `Down ${k}`), `Down ${k}: wrong row`).toBe(options[k]);
      scrollAfterEach.push((await measureMenu(page)).scrollTop);
    }
    expect(scrollAfterEach, "each step past the bottom row must scroll exactly one row (46px)").toEqual([0, 0, 46, 92]);
    expect((await measureMenu(page)).scrollTop).toBe(2 * 46);

    // (b) Up back to row 1: scrolls back to the top one row at a time.
    const back: number[] = [];
    for (let k = 3; k >= 0; k -= 1) {
      await page.keyboard.press("ArrowUp");
      expect(await expectHighlightSettled(page, `Up to row ${k + 1}`)).toBe(options[k]);
      back.push((await measureMenu(page)).scrollTop);
    }
    expect(back, "Up: the window holds until the highlight passes the top row, then one row per step").toEqual([92, 92, 46, 0]);

    // (c) A scroll that strands the highlight (row 1) above the window: on settle it moves to
    // the TOP visible row (row 4), and the plate follows — not the stale "Cure".
    await setScroll(page, 3 * 46);
    await settleEvent(page);
    await expect.poll(async () => (await measureMenu(page)).highlightedIds[0], { message: "the highlight stayed on a row scrolled out of view" }).toBe(options[3]);
    expect(await expectHighlightSettled(page, "after scroll down past the highlight")).toBe(options[3]);
    expect((await measureMenu(page)).scrollTop, "moving the highlight must not scroll").toBe(3 * 46);
    expect((await plateReading(page)).text.toLowerCase()).not.toContain((await measureMenu(page)).names[0]!.toLowerCase());

    // (d) From the bottom: highlight on the LAST row, then scroll UP past it: the BOTTOM visible row.
    for (let k = 0; k < 8; k += 1) await page.keyboard.press("ArrowDown");
    expect(await expectHighlightSettled(page, "Down to the last row")).toBe(options[8]);
    expect((await measureMenu(page)).scrollTop).toBe(6 * 46);
    await setScroll(page, 2 * 46);
    await settleEvent(page);
    await expect.poll(async () => (await measureMenu(page)).highlightedIds[0]).toBe(options[4]);
    expect(await expectHighlightSettled(page, "after scroll up past the highlight")).toBe(options[4]);

    // (e) The real input: one wheel step (40px < a row) with the highlight on row 5 leaves
    // the window; whatever the browser's own settle event does, the invariant holds.
    await setScroll(page, 0);
    await settleEvent(page);
    await expect.poll(async () => (await measureMenu(page)).highlightedIds[0]).toBe(options[2]);
    await page.getByTestId("skill-menu-rows").hover();
    await page.mouse.wheel(0, 40 + 46 * 2);
    await expect.poll(async () => (await measureMenu(page)).scrollTop).toBeGreaterThan(0);
    await expect
      .poll(async () => {
        const m = await measureMenu(page);
        const i = m.ids.indexOf(m.highlightedIds[0]!);
        const r = m.rows[i]!;
        return m.scrollTop % 46 === 0 && r.top >= m.scroller.top - 0.5 && r.bottom <= m.scroller.bottom + 0.5;
      }, { message: "after a real wheel scroll the highlight is not on a fully visible row" })
      .toBe(true);
    await expectHighlightSettled(page, "after a real wheel");
    await close();
  });

  test(`frame separation: a brass keyline outside the 2px border, and the menu's box has not moved — ${vp.name}`, async ({ browser }) => {
    const { page, close } = await menuPageWith(browser, vp.size, 9);
    await page.getByTestId("actions").click();
    await expect(page.getByTestId("skill-menu")).toBeVisible();
    const want = PASS6_MENU[vp.name]!;
    const got = await page.evaluate(() => {
      const e = document.querySelector<HTMLElement>('[data-testid="skill-menu"]')!;
      const r = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      return {
        offsetWidth: e.offsetWidth,
        offsetHeight: e.offsetHeight,
        left: r.left,
        top: r.top,
        position: c.position,
        borders: [c.borderTopWidth, c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth],
        boxShadow: c.boxShadow,
        outlineStyle: c.outlineStyle,
      };
    });
    // The layout box is exactly pass 6's (a keyline that grew the frame would move these).
    expect(got.offsetWidth, "menu width changed").toBe(want.w);
    expect(got.offsetHeight, "menu height changed").toBe(want.h);
    expect(got.left, "menu left moved").toBe(want.left);
    expect(got.top, "menu top moved").toBe(want.top);
    expect(got.position).toBe("absolute");
    expect(got.borders, "the border must stay 2px").toEqual(["2px", "2px", "2px", "2px"]);

    // The keyline: present, and small — no glow (blur <= 2), no spread past 1px.
    expect(got.boxShadow !== "none" || got.outlineStyle !== "none", "no keyline or shadow on the frame").toBe(true);
    const layers = [...got.boxShadow.matchAll(/(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/g)];
    expect(layers.length, `box-shadow "${got.boxShadow}" is not one parseable layer`).toBeGreaterThan(0);
    for (const l of layers) {
      expect(parseFloat(l[4]!), `keyline blur in "${got.boxShadow}"`).toBeLessThanOrEqual(2);
      expect(parseFloat(l[5] ?? "0"), `keyline spread in "${got.boxShadow}"`).toBeLessThanOrEqual(1);
    }

    // It reaches the screen: A/B a 3px strip just OUTSIDE the frame (above the top edge and
    // left of the left edge, over the terrain), with and without the keyline. A control pair
    // (same state twice) must be identical first, so a moving canvas cannot fake a difference.
    const strips = [
      { x: want.left, y: want.top - 3, width: want.w, height: 3 },
      { x: want.left - 3, y: want.top + 8, width: 3, height: want.h - 16 },
    ];
    for (const clip of strips) {
      const a = await page.screenshot({ clip });
      const a2 = await page.screenshot({ clip });
      expect(a.equals(a2), "control: two captures of the same state differ (the strip is not stable)").toBe(true);
      await page.getByTestId("skill-menu").evaluate((e) => ((e as HTMLElement).style.boxShadow = "none"));
      const b = await page.screenshot({ clip });
      await page.getByTestId("skill-menu").evaluate((e) => ((e as HTMLElement).style.boxShadow = ""));
      expect(a.equals(b), `the keyline did not reach the pixels just outside the frame (${JSON.stringify(clip)})`).toBe(false);
    }
    await close();
  });
}

test("a one-skill unit: Skill opens the old informational sheet, never a menu", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachBriarTurn(page); // Briar's own `learned` is exactly `["aim.aimed-shot"]`

  await page.getByTestId("actions").click();
  await expect(page.getByTestId("skill-menu")).toBeHidden();
  expect(await page.locator('[data-testid="skill-row"]').count()).toBe(0);
  // Unchanged from before the menu existed: the read-only list still opens for one skill.
  await expect(page.getByTestId("actions-sheet")).toBeVisible();
  await expect(page.locator('[data-testid="ability-list"] li')).toHaveCount(2); // basic.attack + aimed-shot
});

test("Attack with no foe in reach: the reason names itself in the target plate", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachMeleeBriarTurn(page); // Arming Sword, reach 1: no foe is adjacent on her first turn
  const commandsBefore = await page.evaluate(() => window.tuhGame.commandCount());

  await page.getByTestId("attack").click();
  await expect(page.getByTestId("target-reason"), "premise: the no-foe reason is what shows").toHaveText(/No foe in reach/);
  expect(await page.evaluate(() => window.tuhGame.actionReason())).toBe("No foe in reach");
  expect(await page.evaluate(() => window.tuhGame.reach().length), "reach still paints").toBeGreaterThan(0);
  expect(
    await page.evaluate(() => window.tuhGame.commandCount()),
    "selecting Attack with no legal target must never itself commit a command",
  ).toBe(commandsBefore);
});

for (const vp of VIEWPORTS) {
  test(`the menu is parchment inside an iron frame, and the highlight is a gold pointer + tint, not a button — ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachBriarWithExtraSkills(page);
    await page.getByTestId("actions").click();
    await expect(page.getByTestId("skill-menu")).toBeVisible();
    const look = await page.evaluate(() => {
      const bg = (e: Element) => getComputedStyle(e).backgroundColor;
      const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="skill-row"]')];
      const hi = rows.find((r) => r.classList.contains("highlighted"))!;
      const lo = rows.find((r) => !r.classList.contains("highlighted"))!;
      const pointer = (r: Element) => getComputedStyle(r, "::before").content;
      return {
        frameBg: bg(document.querySelector('[data-testid="skill-menu"]')!),
        scrollerBg: bg(document.querySelector('[data-testid="skill-menu-rows"]')!),
        moveBg: bg(document.querySelector('[data-testid="move"]')!),
        hiImage: getComputedStyle(hi).backgroundImage,
        loImage: getComputedStyle(lo).backgroundImage,
        hiPointer: pointer(hi),
        loPointer: pointer(lo),
        hiRadius: getComputedStyle(hi).borderRadius,
        tagName: hi.tagName,
      };
    });
    // The parchment is the ribbon's own token; the frame is the dark band's iron.
    expect(look.scrollerBg).toBe(look.moveBg);
    expect(look.frameBg).toBe("rgb(29, 23, 16)"); // --hud-bg
    // A/B on the highlight: the highlighted row alone carries the gold tint and the `›`.
    expect(look.hiImage, "the highlighted row has no gold tint").toContain("rgba(184, 137, 47");
    expect(look.loImage, "an un-highlighted row is tinted too").toBe("none");
    expect(look.hiPointer).toBe('"›"');
    expect(look.loPointer, "an un-highlighted row carries a pointer").not.toBe('"›"');
    // Not a card / button per row.
    expect(look.tagName).not.toBe("BUTTON");
    expect(look.hiRadius).toBe("0px");
  });
}

for (const vp of VIEWPORTS) {
  test(`target plate text fits inside its own box, and no field is under the 11px floor — ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachMeleeBriarTurn(page); // Arming Sword: Attack reaches 1, so no foe is in reach
    await page.getByTestId("attack").click(); // "ATTACK / Reach 1 / ⊘ No foe in reach"
    await expect(page.getByTestId("target-reason"), "premise: the no-foe reason is what shows").toHaveText(/No foe in reach/);

    const rows = await page.evaluate(() => {
      const plate = document.querySelector('[data-testid="target-plate"]') as HTMLElement;
      const plateRect = plate.getBoundingClientRect();
      const walker = document.createTreeWalker(plate, NodeFilter.SHOW_TEXT);
      const out: { text: string; inset: number; fontSize: number }[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const text = n.textContent?.trim();
        if (!text) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        const fontSize = parseFloat(getComputedStyle(n.parentElement!).fontSize);
        const inset = Math.min(
          r.top - plateRect.top,
          plateRect.bottom - r.bottom,
          r.left - plateRect.left,
          plateRect.right - r.right,
        );
        out.push({ text, inset, fontSize });
      }
      return out;
    });
    expect(rows.length, "the plate rendered no text at all").toBeGreaterThan(0);
    expect(rows.map((r) => r.text).join(" | ")).toMatch(/Attack/i);
    for (const row of rows) {
      expect(row.inset, `"${row.text}" sits outside the plate's own box — clipped`).toBeGreaterThanOrEqual(1);
      expect(row.fontSize, `"${row.text}" is under the 11px floor`).toBeGreaterThanOrEqual(11);
    }
  });
}

for (const vp of VIEWPORTS) {
  test(`the plate names the PICKED skill until a target is staged, then shows the preview — ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachBriarWithExtraSkills(page);

    await page.getByTestId("actions").click();
    await row(page, "aim.leg-shot").click(); // highlight
    await row(page, "aim.leg-shot").click(); // pick
    await expect(page.getByTestId("skill-menu")).toBeHidden();

    const beforeStage = await page.getByTestId("target-plate").innerText();
    expect(beforeStage, "the plate does not name the picked skill by identity").toContain("Leg Shot");
    expect(beforeStage).toContain("Pick a target");
    expect(beforeStage).not.toContain("No target");

    // Stage the real, only foe on the board — the SAME seam `clickTile`/`clickCanvas`
    // bottom out in (`hud.pick` → `Session.onPick`), not a parallel path.
    await page.evaluate(() => {
      const g = window.tuhGame;
      const foe = g.state()!.units.find((u) => u.teamId !== 0 && u.hp > 0)!;
      g.clickTile(foe.pos.x, foe.pos.y);
    });
    const afterStage = await page.getByTestId("target-plate").innerText();
    expect(afterStage, "staging a target must replace the pick-a-target hint").not.toContain("Pick a target");
  });
}

/**
 * Real content for a MUTED row among 2+ (item 5) — none of the six party
 * members ships with a range/type split reachable from Briar's own opening tile
 * (`docs/proposals/action-menu.md` AC-V23(b)'s gap again: the map is small and
 * archer's own tree is uniformly h:4-5). A priest's `cure`/`cura` (heal, allies
 * only) and `holy` (magic, foes only) genuinely disagree given the one foe near
 * the party at Ottoline's own opening turn — `holy` finds no foe in ITS OWN box
 * from there, MEASURED against the real build (not assumed): confirmed stable and
 * deterministic across repeated runs, unlike several other real combinations that
 * end battle 1 before the modified unit ever gets a turn.
 */
async function reachOttolineWithSplitSkills(page: Page): Promise<void> {
  await startNewGame(page);
  await dismissScene(page);
  await page.evaluate(() => {
    const g = window.tuhGame;
    g.grantTestAp("pc-ottoline", 1000);
    const p = g.prep()!;
    p.select("pc-ottoline");
    p.learn("priest", "cura");
    p.learn("priest", "holy");
  });
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  const reached = await page.evaluate(() => {
    const g = window.tuhGame;
    for (let i = 0; i < 300; i += 1) {
      const ph = g.phase();
      if (ph === null || ph === "ENDED") return false;
      if (ph === "PLAYER_IDLE" && g.skillOptions().length >= 2) return true;
      g.step();
    }
    return false;
  });
  expect(reached, "battle 1's fixed seed no longer gives a priest her own 2+-skill turn").toBe(true);
}

for (const vp of VIEWPORTS) {
  test(`a muted row among 2+ is shown, distinguishable, its reason reads in the plate, and no second tap or Enter picks it — ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachOttolineWithSplitSkills(page);
    const commandsBefore = await page.evaluate(() => window.tuhGame.commandCount());

    await page.getByTestId("actions").click();
    const rows = page.locator('[data-testid="skill-row"]');
    await expect(rows).toHaveCount(3);
    const holy = row(page, "white-magic.holy");
    await expect(holy, "the muted row is not even shown").toHaveCount(1);
    await expect(holy).toHaveClass(/muted/);
    await expect(holy).toHaveAttribute("aria-disabled", "true");
    // The reason is accessible on the row itself, and the visible text is the NAME only.
    await expect(holy).toHaveAttribute("aria-label", /No foe in reach/);
    await expect(holy).toHaveText("Holy");

    // MUTED, NOT ONLY LABELLED: the muted row's own ink and ground differ from an available
    // sibling's (A/B in one column), and it stays a full >= 44px row.
    const look = await page.evaluate(() => {
      const read = (e: Element) => {
        const cs = getComputedStyle(e);
        return { color: cs.color, bg: cs.backgroundColor, h: e.getBoundingClientRect().height };
      };
      const off = document.querySelector('[data-testid="skill-row"][data-ability="white-magic.holy"]')!;
      const on = [...document.querySelectorAll('[data-testid="skill-row"]')].find(
        (c) => !c.classList.contains("muted") && !c.classList.contains("highlighted"),
      )!;
      return { off: read(off), on: read(on), offStyle: getComputedStyle(off).fontStyle };
    });
    // The page-wide `.muted { font-style: italic }` in index.html matches this class name;
    // the row must name the property itself (seen as an italic "Holy" in a frame).
    expect(look.offStyle, "a page-wide .muted rule leaked italic onto the row").toBe("normal");
    expect(look.off.color, "the muted row's text is the same colour as an available one's").not.toBe(look.on.color);
    expect(look.off.bg, "the muted row's parchment is not muted").not.toBe(look.on.bg);
    expect(look.off.h).toBeGreaterThanOrEqual(44);

    // FIRST tap highlights it (aria-disabled blocks Playwright's own actionability check,
    // so `force`; the row really is clickable to a real pointer). The PLATE says why,
    // with its own reach, and stays inside its box.
    await holy.click({ force: true });
    expect((await measureMenu(page)).highlightedIds).toEqual(["white-magic.holy"]);
    const plate = await plateReading(page);
    expect(plate.text).toContain("Holy");
    expect(plate.text).toContain("No foe in reach");
    expect(plate.text).toContain("Reach");
    await expect(page.getByTestId("target-reason")).toHaveText(/No foe in reach · Reach \d+/);
    expect(plate.minInset, "the muted reason is clipped by the plate's own box").toBeGreaterThanOrEqual(1);
    expect(plate.minFont).toBeGreaterThanOrEqual(11);

    // SECOND tap and Enter both leave it un-picked, the menu open.
    await holy.click({ force: true });
    expect(await page.evaluate(() => window.tuhGame.selectedSkill()), "a second tap picked a muted skill").toBeNull();
    await expect(page.getByTestId("skill-menu")).toBeVisible();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.tuhGame.selectedSkill()), "Enter picked a muted skill").toBeNull();
    await expect(page.getByTestId("skill-menu")).toBeVisible();
    expect((await measureMenu(page)).highlightedIds).toEqual(["white-magic.holy"]);

    // Nothing is staged, so Confirm is genuinely `disabled` — no click path to it at all.
    await expect(page.getByTestId("confirm")).toBeDisabled();
    expect(
      await page.evaluate(() => window.tuhGame.commandCount()),
      "a muted row must never let anything commit a command",
    ).toBe(commandsBefore);
  });
}

test("keyboard: the menu opens focused, Up/Down move the highlight and the plate, Enter picks", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachBriarWithExtraSkills(page);
  const cursorBefore = await page.evaluate(() => JSON.stringify(window.tuhGame.cursor()));

  await page.getByTestId("actions").click();
  await expect(page.getByTestId("skill-menu")).toBeVisible();
  await expect(page.getByTestId("skill-menu-rows"), "the menu did not take focus on open").toBeFocused();
  const hi = async () => (await measureMenu(page)).highlightedIds;
  expect(await hi()).toEqual(["aim.aimed-shot"]);

  await page.keyboard.press("ArrowUp"); // already at the top: stays
  expect(await hi()).toEqual(["aim.aimed-shot"]);
  await page.keyboard.press("ArrowDown");
  expect(await hi()).toEqual(["aim.leg-shot"]);
  expect((await plateReading(page)).text, "the plate did not follow the highlight").toContain("Leg Shot");
  await page.keyboard.press("ArrowDown");
  expect(await hi()).toEqual(["aim.piercing-shot"]);
  expect((await plateReading(page)).text).toContain("Piercing Shot");
  await page.keyboard.press("ArrowDown"); // already at the bottom: stays
  expect(await hi()).toEqual(["aim.piercing-shot"]);
  expect(await page.evaluate(() => window.tuhGame.selectedSkill()), "an arrow key picked").toBeNull();
  expect(
    await page.evaluate(() => JSON.stringify(window.tuhGame.cursor())),
    "an arrow key moved the board cursor under the open menu",
  ).toBe(cursorBefore);

  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.tuhGame.selectedSkill())).toBe("aim.piercing-shot");
  await expect(page.getByTestId("skill-menu")).toBeHidden();
});

/**
 * A raw byte/screenshot diff of the whole canvas is NOT the right instrument
 * here — measured, not guessed: battle 1's fixed seed routes several OTHER
 * units' real turns (real combat, a real "WHIFF −83 −75" popup) before Briar's
 * own, and that popup's own text rendering differs by a handful of pixels
 * between two otherwise-identical captures (`freezeMotion`/`settleMotion`
 * notwithstanding — confirmed even across two INDEPENDENT pages replaying the
 * identical deterministic script). A whole-canvas byte compare would pass on
 * that noise alone with `reach` deleted entirely — a false pass this test must
 * not have.
 *
 * Instead: count pixels carrying the REACH TOKEN'S OWN colour signature
 * (`FIELD_THEME.reach`, `#e879f0` composited over the ground — high red, high
 * blue, LOW green relative to both) directly off the canvas's own pixel
 * buffer. The popup's red digits fail this on purpose (low blue), so they
 * cannot false-positive it. `reach()` returns 35 tiles for this fixture/pick —
 * tens of thousands of matching pixels once painted, against a low single-digit
 * baseline from whatever incidentally similar hue already exists on the board.
 */
async function pinkPixelCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="grid"]') as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (r > g + 30 && b > g + 20) count += 1;
    }
    return count;
  });
}

test("the pink reach panel actually reaches the canvas (A/B against the same frame)", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachBriarWithExtraSkills(page);
  await expect(page.getByTestId("entry-plaque")).toBeHidden();

  const before = await pinkPixelCount(page);
  await page.getByTestId("actions").click();
  await row(page, "aim.leg-shot").click(); // highlight
  await row(page, "aim.leg-shot").click(); // pick — arms `reach()`
  const after = await pinkPixelCount(page);

  expect(
    after - before,
    "picking a skill painted no new reach-coloured pixels — `game.ts` may have dropped the `reach:` wire",
  ).toBeGreaterThan(1000);
});

/**
 * A ZERO-SKILL unit (item 7) — real content again: `pc-vance` learns only
 * `aim.aimed-shot` (archer/`aim` skillset). Switching his job to `knight`
 * (`battle-skill` skillset) through the SAME `setJob` the prep screen's dropdown
 * calls leaves him with no learned node in his NEW primary's skillset and no
 * secondary equipped — `basic.attack` only, with nothing fabricated.
 */
async function reachVanceWithZeroSkills(page: Page): Promise<void> {
  await startNewGame(page);
  await dismissScene(page);
  await page.evaluate(() => {
    const g = window.tuhGame;
    const p = g.prep()!;
    p.select("pc-vance");
    p.setJob("knight");
  });
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  const reached = await page.evaluate(() => {
    const g = window.tuhGame;
    for (let i = 0; i < 300; i += 1) {
      const ph = g.phase();
      if (ph === null || ph === "ENDED") return false;
      // `skillOptions().length === 0` is unique to Vance here — every other party
      // member ships with a real learned skill, so this cannot false-match a
      // DIFFERENT unit's own turn.
      if (ph === "PLAYER_IDLE" && g.skillOptions().length === 0) return true;
      g.step();
    }
    return false;
  });
  expect(reached, "battle 1's fixed seed no longer gives the zero-skill unit its own turn").toBe(true);
}

test("a zero-skill unit: Skill shows no menu at all (hud.ts's `options.length > 1` guard)", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachVanceWithZeroSkills(page);

  await page.getByTestId("actions").click();
  await expect(page.locator('[data-testid="skill-row"]')).toHaveCount(0);
  await expect(page.getByTestId("skill-menu")).toBeHidden();
  expect(await page.evaluate(() => window.tuhGame.skillOptions().length)).toBe(0);
});

/**
 * FALSE REASONS ON A TAP (item 9) — NOT reachable as an e2e DOM proof, and that
 * is the honest finding, not a gap: `hud.ts`'s `pickAt` opens the unit-INSPECT
 * drawer (not `Session.onPick`) for ANY tap on a living, non-targetable,
 * non-actor unit — with the menu open and nothing picked, `targets()` is
 * deliberately empty (see its own docstring), so EVERY occupied tile reads
 * "non-targetable" and the tap opens the drawer before `onPick`'s own refusal
 * reason is ever reached. Confirmed by reading `pickAt`'s own branch, not
 * guessed: `g.clickTile(foe.x, foe.y)` here — the SAME seam a real click
 * reaches — opens the inspect drawer, not a toast, for both of item 9's cases.
 * `tapRefusalReason`'s own correctness (`"Pick a skill first"` /
 * `"Heals allies only"`) is proven, mutation-verified, at the session level
 * (`session.test.ts`, "false reasons on a tap") — the level a script or a
 * future caller that reaches `onPick` directly (the balance probe's own
 * `onPick`-shaped calls, or a later UX change that narrows the drawer gate)
 * actually exercises today.
 */
test("menu open + tap a foe: the inspect drawer opens, not a false 'Out of Ability range' toast", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachBriarWithExtraSkills(page);

  await page.getByTestId("actions").click();
  await expect(page.getByTestId("skill-menu")).toBeVisible();
  await page.evaluate(() => {
    const g = window.tuhGame;
    const foe = g.state()!.units.find((u) => u.teamId !== 0 && u.hp > 0)!;
    g.clickTile(foe.pos.x, foe.pos.y);
  });
  await expect(page.getByTestId("unit-drawer")).toBeVisible();
  await expect(page.getByTestId("reason")).toBeHidden(); // never a stray toast either
});
