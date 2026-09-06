import { test, expect } from "@playwright/test";
import { dismissScene, startNewGame } from "./helpers.js";

/**
 * ADR-0039: six real portraits are wired into the scene player and the unit card, for
 * the characters/units the table names — everyone else still reads as the placeholder.
 *
 * THE DISCRIMINATOR IS `naturalWidth` PLUS THE `src`. The placeholder SVG is 96px wide
 * (`data/campaign/story/portraits/placeholder.svg`'s `viewBox`); a real crop is bundled
 * at 192x256 (a 2x asset for the 96x128 CSS frame, ADR-0039) — that alone tells "real
 * art" from "placeholder" but NOT one real portrait from another: naturalWidth is 192
 * for every one of the six. Vite emits each as `assets/<key>-<hash>.png` (a ~100 KB
 * file, far past the 4 KB inline limit, so it is never a `data:` URI) — asserting the
 * `src` CONTAINS the expected key is what ties a card to the RIGHT unit's face, not
 * merely to "some" real portrait. Both checks run on the SAME page, in the SAME test,
 * so this cannot pass by exercising only the branch that already worked.
 */
test("ADR-0039: real art resolves per unit; unauthored units keep the placeholder", async ({
  page,
}) => {
  await page.goto("/");
  await startNewGame(page);

  const cardImg = page.locator('[data-testid="unit-card"] .uc-portrait img');
  const cardCaption = page.locator('[data-testid="unit-card"] figcaption');
  const cardName = page.locator('[data-testid="unit-card"] .uc-name b');
  const drawer = page.getByTestId("unit-drawer");

  const readOpenCard = async (): Promise<{
    width: number;
    captioned: boolean;
    src: string;
  }> => {
    await expect(cardImg).toHaveCount(1);
    const width = await cardImg.evaluate((el) => (el as HTMLImageElement).naturalWidth);
    const captioned = (await cardCaption.count()) > 0;
    const src = await cardImg.getAttribute("src");
    return { width, captioned, src: src ?? "" };
  };

  /**
   * Tap every living unit until `wantedName` is found, opening the drawer and reading
   * its card. Discovery, not a hard-coded tile: a tap on a LEGAL TARGET stages an
   * attack instead of opening the drawer (AC-V37), so each miss is undone with
   * `cancel()` before moving to the next unit.
   */
  const findCard = async (
    wantedName: string,
  ): Promise<{ width: number; captioned: boolean; src: string }> => {
    const state = await page.evaluate(() => window.tuhGame.state());
    expect(state).not.toBeNull();
    for (const u of state!.units.filter((u) => u.hp > 0)) {
      await page.evaluate((p) => window.tuhGame.clickTile(p.x, p.y), u.pos);
      if (await drawer.isVisible()) {
        const name = (await cardName.innerText()).trim();
        if (name === wantedName) {
          const card = await readOpenCard();
          await page.getByTestId("unit-drawer-close").click();
          await expect(drawer).toBeHidden();
          return card;
        }
        await page.getByTestId("unit-drawer-close").click();
        await expect(drawer).toBeHidden();
      } else {
        await page.evaluate(() => window.tuhGame.cancel());
      }
    }
    throw new Error(`"${wantedName}" was never found on the board`);
  };

  // ── Branch one: the SCENE PLAYER ─────────────────────────────────────────────
  // The prologue opens on Vance (geomancer — out of portrait scope, ADR-0039):
  // placeholder, captioned.
  await expect(page.getByTestId("screen-scene")).toBeVisible();
  const prologueFigure = page.getByTestId("scene-story-portrait");
  const prologueImg = prologueFigure.locator("img");
  await expect(prologueFigure).toHaveAttribute("data-state", "pending");
  await expect(prologueImg).toHaveCount(1);
  await expect(prologueFigure.locator("figcaption")).toHaveText("Portrait pending");
  await expect
    .poll(async () => await prologueImg.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(96);
  await dismissScene(page);

  // Battle 1's briefing text is Vance again (still placeholder); battle 2's briefing is
  // Briar's first line in the pack — real art, since ADR-0039 moved her `asset` field
  // from "placeholder" to "archer-f". Reaching it needs playing battle 1, which the
  // balance probe on both seats wins deterministically (AC-M1's shipped seam).
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
  await expect(page.getByTestId("brief-story")).toContainText("Vance");
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();

  // ── Branch two: an ENEMY unit card, battle 1 ─────────────────────────────────
  // Battle 1's only enemy is `foe-brigand` (job knight, PORTRAIT_BY_UNIT["foe-brigand"]
  // = "knight-m") — a table row for an ENEMY, never asserted before this slice, so
  // nothing previously stopped a row pointing at the wrong job's face for a foe. Read
  // BEFORE autoplay, while the placement is still on the board.
  const brigandCard = await findCard("Brigand");
  expect(brigandCard.width, "Brigand (knight-m) should be real art").toBe(192);
  expect(brigandCard.captioned, "Brigand's card shows a pending caption").toBe(false);
  expect(brigandCard.src, "Brigand's card is not showing knight-m's asset").toContain("knight-m");

  await page.evaluate(() => window.tuhGame.autoplay());
  await page.getByTestId("conclude").click();
  await expect(page.getByTestId("screen-after")).toBeVisible();
  await page.getByTestId("next").click();
  await dismissScene(page); // no interlude authored before b2

  await expect(page.getByTestId("screen-briefing")).toBeVisible();
  await expect(page.getByTestId("brief-story")).toContainText("Briar");
  const briefFigure = page.getByTestId("brief-story-portrait");
  const briefImg = briefFigure.locator("img");
  await expect(briefFigure).toHaveAttribute("data-state", "art");
  await expect(briefImg).toHaveCount(1);
  // No figcaption at all — the placeholder's caption is keyed on the asset KEY, so it
  // disappears by itself the moment the pack names real art (src/render/CLAUDE.md).
  await expect(briefFigure.locator("figcaption")).toHaveCount(0);
  await expect
    .poll(async () => await briefImg.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(192);
  const briefSrc = await briefImg.getAttribute("src");
  // A ~100 KB PNG is well past Vite's 4 KB inline limit, so this is a hashed URL —
  // asserted loosely, the same way AC-M9's placeholder check accepts either form.
  expect(briefSrc === null ? "" : briefSrc).toMatch(/^(data:|\/|https?:)/);
  expect(briefSrc ?? "", "the briefing is not showing Briar's own asset").toContain("archer-f");

  // ── Branch three: the UNIT CARD, on a battle screen ──────────────────────────
  // Battle 2 fields Vance, Kest (both placeholder) and Briar (archer-f) against two
  // Brigands (knight-m). Cards are found by NAME, never by battle unit id:
  // `state.units[].id` is the placement's SLOT id ("blue-briar"), not the roster
  // record id `PORTRAIT_BY_UNIT` is keyed by ("pc-briar") — there is no id here that
  // matches the table directly, and asserting "SOME unit shows real art" would pass
  // even if `PORTRAIT_BY_UNIT["pc-briar"]` were wrong, as long as a Brigand still
  // resolved. Naming Briar specifically is what ties this assertion to HER row.
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();

  // The acting unit's card, via the tab — read-only (AC-V37).
  await page.getByTestId("actor-tab").click();
  await expect(drawer).toBeVisible();
  const actorName = (await cardName.innerText()).trim();
  const actorCard = await readOpenCard();
  await page.getByTestId("unit-drawer-close").click();
  await expect(drawer).toBeHidden();

  const briarCard = actorName === "Briar" ? actorCard : await findCard("Briar");
  expect(briarCard.width, "Briar (archer-f, PORTRAIT_BY_UNIT) should be real art").toBe(192);
  expect(briarCard.captioned, "Briar's card shows a pending caption").toBe(false);
  expect(briarCard.src, "Briar's card is not showing archer-f's asset").toContain("archer-f");

  const vanceCard = actorName === "Vance" ? actorCard : await findCard("Vance");
  expect(vanceCard.width, "Vance (geomancer, out of portrait scope) should be the placeholder").toBe(
    96,
  );
  expect(vanceCard.captioned, "Vance's card is missing the pending caption").toBe(true);
});
