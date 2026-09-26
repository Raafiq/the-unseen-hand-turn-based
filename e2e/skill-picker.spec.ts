import { test, expect, type Page } from "@playwright/test";
import { startNewGame, dismissScene } from "./helpers.js";

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
 * `reachBriarTurn`, plus two more real archer skills learned for Briar first — see the
 * file header. MEASURED, not assumed: a THIRD extra learn (a fourth or fifth skill)
 * reliably makes the fight end (Vance + Ottoline alone win it) before Briar ever gets a
 * turn, so three real chips is the ceiling this fixture can show — the overflow test
 * below says so and proves the CSS mechanism a different way rather than pretend a
 * fourth real chip is reachable here.
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

for (const vp of VIEWPORTS) {
  test(`three real chips: ≥44px, distinct by text not colour alone, gone on pick and on Cancel, board height unchanged — ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachBriarWithExtraSkills(page);
    const commandsBefore = await page.evaluate(() => window.tuhGame.commandCount());

    const boardBefore = await page.getByTestId("grid").boundingBox();

    await page.getByTestId("actions").click();
    const chips = page.locator('[data-testid="skill-chip"]');
    await expect(chips).toHaveCount(3);

    const heights = await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    for (const h of heights) expect(h, "a chip is under the 44px touch floor").toBeGreaterThanOrEqual(44);

    const ids = await chips.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["ability"]));
    expect(ids).toEqual(["aim.aimed-shot", "aim.leg-shot", "aim.piercing-shot"]);

    // Available chips read "Reach N" — no reason text — so "available" is legible from
    // the TEXT alone, not only from the `.unavailable` class's colour.
    const metas = await chips.evaluateAll((els) => els.map((e) => e.querySelector(".chip-meta")?.textContent));
    for (const m of metas) expect(m).toMatch(/^Reach \d+$/);

    // The sheet is a `position: absolute` overlay — it must not push the board.
    const boardWithChipsOpen = await page.getByTestId("grid").boundingBox();
    expect(boardWithChipsOpen?.height).toBeCloseTo(boardBefore!.height, 1);

    // Pick the SECOND chip.
    await chips.nth(1).click();
    await expect(page.getByTestId("skill-chips"), "chips must vanish on pick").toBeHidden();
    expect(await page.evaluate(() => window.tuhGame.selectedSkill())).toBe("aim.leg-shot");
    expect(await page.evaluate(() => window.tuhGame.reach().length)).toBeGreaterThan(0);

    // Cancel unwinds ONE level: back to the chip sheet, not to root.
    await page.getByTestId("cancel").click();
    await expect(page.getByTestId("skill-chips"), "Cancel must reopen the sheet").toBeVisible();
    expect(await page.evaluate(() => window.tuhGame.commandMode())).toBe("skill");
    expect(await page.evaluate(() => window.tuhGame.selectedSkill())).toBeNull();

    // Cancel again: back to root.
    await page.getByTestId("cancel").click();
    expect(await page.evaluate(() => window.tuhGame.commandMode())).toBeNull();
    await expect(page.getByTestId("skill-chips")).toBeHidden();

    const boardAfter = await page.getByTestId("grid").boundingBox();
    expect(boardAfter?.height).toBeCloseTo(boardBefore!.height, 1);

    expect(
      await page.evaluate(() => window.tuhGame.commandCount()),
      "picking, cancelling and re-picking a skill must never itself commit a command",
    ).toBe(commandsBefore);
  });
}

test("overflow: the sheet scrolls once chips exceed its width, and text never shrinks", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachBriarWithExtraSkills(page);
  await page.getByTestId("actions").click();
  await expect(page.locator('[data-testid="skill-chip"]')).toHaveCount(3);

  // Battle 1's content tops out at 3 real chips (see the file header). To prove the
  // OVERFLOW MECHANISM itself — not invent game content — clone the real, already-
  // rendered chip nodes (same markup, same CSS classes the live renderer just built)
  // until they exceed the sheet's width. This is a claim about the STYLESHEET rule
  // (`.tuh-chip { flex: none }` inside a `overflow-x: auto` container), which the
  // 3-chip case above cannot exercise on its own; it is not a claim about the picker's
  // selection logic, which that case already covers with real content.
  //
  // REVIEW FIX: the old third assertion compared a computed `font-size` before and
  // after cloning — nothing in this CSS or JS ever CHANGES a chip's font-size (no
  // `clamp()`, no JS resize), so that comparison could never go red regardless of
  // whether text actually got clipped. The real claim — "text never shrinks [to
  // fit]" — is a claim about WIDTH, not about the font-size property: a chip whose
  // text is being clipped by `overflow:hidden` would show `clientWidth <
  // scrollWidth` on the NAME span even though its `font-size` is untouched.
  const result = await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>('[data-testid="skill-chips"]')!;
    const before = { scroll: container.scrollWidth, client: container.clientWidth };
    const firstChip = container.querySelector('[data-testid="skill-chip"]')!;
    for (let i = 0; i < 6; i += 1) container.appendChild(firstChip.cloneNode(true));
    const after = { scroll: container.scrollWidth, client: container.clientWidth };
    // BOTH levels: the NAME span (would clip if `.chip-name` itself grew
    // `overflow:hidden`) and the CHIP itself (would clip if `.tuh-chip` grew a
    // narrow `max-width` + `overflow:hidden`, the mutation this test is built to
    // catch — a chip narrower than its own scrollWidth means real content is being
    // cut off, not merely scrolled).
    const chips = [...container.querySelectorAll<HTMLElement>('[data-testid="skill-chip"]')];
    const names = [...container.querySelectorAll<HTMLElement>(".chip-name")];
    const chipFits = chips.map((c) => ({ client: c.clientWidth, scroll: c.scrollWidth }));
    const nameFits = names.map((n) => ({ client: n.clientWidth, scroll: n.scrollWidth }));
    return { before, after, chipFits, nameFits };
  });
  // NOTE: the strip's `max-width` is now 280px (review fix, item 1 — the strip
  // must stay under 60% of the board canvas), which real ability names alone
  // already exceed at 3 chips (~380px) — so the BEFORE state legitimately
  // overflows/scrolls too now, and asserting otherwise would be asserting
  // against the width fix this same slice makes. The claim this test owns is
  // the MECHANISM (scroll, not shrink-or-clip), covered by `after` and the
  // per-element fit checks below.
  expect(result.after.scroll, "9 chips did not overflow the sheet").toBeGreaterThan(result.after.client);
  for (const c of result.chipFits) {
    expect(c.client, "a chip is narrower than its own content — clipped").toBeGreaterThanOrEqual(c.scroll);
  }
  for (const n of result.nameFits) {
    expect(n.client, "a chip's name is narrower than its own text — clipped").toBeGreaterThanOrEqual(n.scroll);
  }
});

test("a one-skill unit: Skill opens the old informational sheet, never a chip element", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachBriarTurn(page); // Briar's own `learned` is exactly `["aim.aimed-shot"]`

  await page.getByTestId("actions").click();
  await expect(page.getByTestId("skill-chips")).toBeHidden();
  expect(await page.locator('[data-testid="skill-chip"]').count()).toBe(0);
  // Unchanged from before chips existed: the read-only list still opens for one skill.
  await expect(page.getByTestId("actions-sheet")).toBeVisible();
  await expect(page.locator('[data-testid="ability-list"] li')).toHaveCount(2); // basic.attack + aimed-shot
});

test("Attack with no foe in reach: the reason names itself in the target plate", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachBriarTurn(page); // an archer's melee swing does not reach where her bow does
  const commandsBefore = await page.evaluate(() => window.tuhGame.commandCount());

  await page.getByTestId("attack").click();
  await expect(page.getByTestId("target-reason")).toHaveText(/No foe in reach/);
  expect(await page.evaluate(() => window.tuhGame.actionReason())).toBe("No foe in reach");
  expect(await page.evaluate(() => window.tuhGame.reach().length), "reach still paints").toBeGreaterThan(0);
  expect(
    await page.evaluate(() => window.tuhGame.commandCount()),
    "selecting Attack with no legal target must never itself commit a command",
  ).toBe(commandsBefore);
});

for (const vp of VIEWPORTS) {
  test(`chips are a narrow floating parchment strip, not the old full-width dark band — ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachBriarWithExtraSkills(page);
    const board = await page.getByTestId("grid").boundingBox();
    await page.getByTestId("actions").click();
    const strip = page.getByTestId("skill-chips");
    await expect(strip).toBeVisible();
    const box = await strip.boundingBox();
    expect(box!.width, "the strip covers most of the board — the old full-width band").toBeLessThan(
      board!.width * 0.6,
    );
    // The RIBBON's own parchment token (`--hud-face-bg`), not the dark `--hud-bg`
    // band this replaced. "item" is one of the plain six ribbon buttons, never
    // pressed/disabled in this state, so its computed background is the plain face.
    const stripBg = await strip.evaluate((el) => getComputedStyle(el).backgroundColor);
    const ribbonBg = await page.getByTestId("move").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(stripBg).toBe(ribbonBg);
    expect(stripBg).not.toBe("rgb(29, 23, 16)"); // --hud-bg, the band's own colour
  });
}

for (const vp of VIEWPORTS) {
  test(`target plate text fits inside its own box, and no field is under the 11px floor — ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp.size);
    await page.goto("/");
    await reachBriarTurn(page);
    await page.getByTestId("attack").click(); // "ATTACK / Reach 1 / ⊘ No foe in reach"
    await expect(page.getByTestId("target-reason")).toBeVisible();

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
    await page.locator('[data-testid="skill-chip"]').nth(1).click(); // aim.leg-shot
    await expect(page.getByTestId("skill-chips")).toBeHidden();

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
 * Real content for an UNAVAILABLE chip among 2+ (item 5) — none of the six party
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

test("an unavailable chip among 2+ is shown, distinguishable, and Confirm cannot fire it", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachOttolineWithSplitSkills(page);
  const commandsBefore = await page.evaluate(() => window.tuhGame.commandCount());

  await page.getByTestId("actions").click();
  const chips = page.locator('[data-testid="skill-chip"]');
  await expect(chips).toHaveCount(3);
  const holy = page.locator('[data-testid="skill-chip"][data-ability="white-magic.holy"]');
  await expect(holy, "the unavailable chip is not even shown").toHaveCount(1);
  await expect(holy).toHaveClass(/unavailable/);
  await expect(holy).toContainText("No foe in reach"); // the reason, not just "Reach N"

  // aria-disabled (not the DOM `disabled` attribute — see `hud.ts`'s own comment
  // on the chip: "selectable, not disabled"), so Playwright's default
  // actionability check — which treats `aria-disabled="true"` as blocking —
  // needs `force`; the button really is clickable to a real pointer/JS listener.
  await holy.click({ force: true });
  await expect(page.getByTestId("target-reason")).toHaveText(/No foe in reach/);

  // NOTHING is staged (`targets()` is empty for an unavailable ability), so
  // Confirm is genuinely `disabled` — the STRONGEST form of "cannot fire it":
  // there is no click path to it at all, not merely a refused one.
  await expect(page.getByTestId("confirm")).toBeDisabled();
  expect(
    await page.evaluate(() => window.tuhGame.commandCount()),
    "an unavailable chip must never let Confirm commit a command",
  ).toBe(commandsBefore);
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
  await page.locator('[data-testid="skill-chip"]').nth(1).click(); // aim.leg-shot — arms `reach()`
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

test("a zero-skill unit: Skill shows no chips at all (hud.ts's `options.length > 1` guard)", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachVanceWithZeroSkills(page);

  await page.getByTestId("actions").click();
  await expect(page.locator('[data-testid="skill-chip"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.tuhGame.skillOptions().length)).toBe(0);
});

/**
 * FALSE REASONS ON A TAP (item 9) — NOT reachable as an e2e DOM proof, and that
 * is the honest finding, not a gap: `hud.ts`'s `pickAt` opens the unit-INSPECT
 * drawer (not `Session.onPick`) for ANY tap on a living, non-targetable,
 * non-actor unit — with chips open and nothing picked, `targets()` is
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
test("chips open + tap a foe: the inspect drawer opens, not a false 'Out of Ability range' toast", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS[0]!.size);
  await page.goto("/");
  await reachBriarWithExtraSkills(page);

  await page.getByTestId("actions").click();
  await expect(page.getByTestId("skill-chips")).toBeVisible();
  await page.evaluate(() => {
    const g = window.tuhGame;
    const foe = g.state()!.units.find((u) => u.teamId !== 0 && u.hp > 0)!;
    g.clickTile(foe.pos.x, foe.pos.y);
  });
  await expect(page.getByTestId("unit-drawer")).toBeVisible();
  await expect(page.getByTestId("reason")).toBeHidden(); // never a stray toast either
});
