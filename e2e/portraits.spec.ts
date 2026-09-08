import { test, expect } from "@playwright/test";
import { dismissScene, startNewGame } from "./helpers.js";

/**
 * ADR-0039 + the six-member roster (owner decision, 2026-09-08): nine real portraits are
 * wired into the scene player, the briefing party cards and the battle unit card.
 *
 * THE DISCRIMINATOR IS THE `src`, NOT `naturalWidth`. Width separates ABSENT from
 * PRESENT — the placeholder SVG is 96px wide, a real crop is 192 — and that is a
 * different question from RIGHT vs WRONG: every one of the nine crops is 192 wide, so a
 * knight's face on the archer passes a width check. Vite emits each as
 * `assets/<key>-<hash>.png` (a ~100 KB file, far past the 4 KB inline limit, so never a
 * `data:` URI), which makes the asset basename in `src` the thing that names the unit.
 * Width is still asserted, because it is the one check that catches a `src` that is
 * right and a FILE that never reached `dist`.
 *
 * WHAT THIS FILE NO LONGER COVERS, said plainly: every roster unit now has real art, so
 * no in-play fixture reaches the placeholder branch (`data-state="pending"`, the
 * "Portrait pending" caption, the `.pending` class and its `object-fit: contain` rule).
 * The fallback itself is asserted in `src/render/campaign-data.test.ts` against an id the
 * table does not name; its RENDERING is unasserted here until content needs it again.
 */
test("ADR-0039: real art resolves per unit, by asset identity", async ({
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
  // The prologue opens on Vance, an archer since the six-member roster — `archer-m`.
  await expect(page.getByTestId("screen-scene")).toBeVisible();
  const prologueFigure = page.getByTestId("scene-story-portrait");
  // Scoped off the house ribbon's own `<img class="ribbon-charge">`
  // (docs/visual/concepts/README.md §f) — always present, so an unscoped `img`
  // locator would match it too.
  const prologueImg = prologueFigure.locator("img:not(.ribbon-charge)");
  await expect(prologueFigure).toHaveAttribute("data-state", "art");
  await expect(prologueImg).toHaveCount(1);
  await expect(prologueFigure.locator("figcaption")).toHaveCount(0);
  await expect
    .poll(async () => await prologueImg.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(192);
  // Vance and Briar are BOTH archers. Asserting `archer-m` here and `archer-f` for Briar
  // below is what separates "the right face" from "an archer's face".
  await expect(prologueImg).toHaveAttribute("src", /archer-m/);

  // ── Branch two: the BRIEFING PARTY CARDS, all six at once ────────────────────
  // The only surface that renders every party member. Corin and Isla are on NO
  // encounter's placements, so a battle-screen loop could never reach their cards —
  // a test that covered the four who deploy would read as covering the party.
  await dismissScene(page);
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
  const EXPECTED_CARD_ASSET: ReadonlyArray<readonly [string, string]> = [
    ["pc-vance", "archer-m"],
    ["pc-kest", "wizard-m"],
    ["pc-briar", "archer-f"],
    ["pc-ottoline", "priest-f"],
    ["pc-corin", "priest-m"],
    ["pc-isla", "wizard-f"],
  ];
  // The loop is over the ROSTER the page drew, not over the literal list, so a card that
  // stopped being drawn cannot be silently skipped by a list that still names it.
  const drawnMembers = await page
    .locator('[data-testid="prep-roster"] .ptab')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-member") ?? ""));
  expect(drawnMembers).toEqual(EXPECTED_CARD_ASSET.map(([id]) => id));
  for (const [id, asset] of EXPECTED_CARD_ASSET) {
    const cardImg = page.locator(`[data-testid="prep-roster"] .ptab[data-member="${id}"] img`);
    await expect(cardImg, `${id}'s card is not showing ${asset}`).toHaveAttribute(
      "src",
      new RegExp(asset),
    );
    // The FILE reached dist and decoded — a `src` naming the right asset over a 404 is
    // the one failure the identity assertion above cannot see.
    await expect
      .poll(async () => await cardImg.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBe(192);
  }
  // Six DISTINCT faces: no two members can be satisfied by one crop.
  expect(new Set(EXPECTED_CARD_ASSET.map(([, a]) => a)).size).toBe(EXPECTED_CARD_ASSET.length);

  // Battle 2's briefing is Briar's first line in the pack. Reaching it needs playing
  // battle 1, which the balance probe on both seats wins deterministically.
  await expect(page.getByTestId("brief-story")).toContainText("Vance");
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();

  // ── Branch three: an ENEMY unit card, battle 1 ───────────────────────────────
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
  // UNSCOPED locator, deliberately: the briefing's `brief-story` host must never carry
  // the ribbon charge at all (`overhaul.css` styles `.ribbon-charge` under `#screen-scene`
  // only), so this count is the discriminator for `renderStory` in `game.ts` handing the
  // ribbon to every story host instead of `scene-story` alone.
  // MUTATION: pass `ribbon: TITLE_ART.ribbon` unconditionally for every host again →
  // `.portrait img` (this locator) resolves to 2 elements here, red.
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

  // ── Branch four: the UNIT CARD, on a battle screen ───────────────────────────
  // Battle 2 fields Vance (archer-m), Kest (wizard-m) and Briar (archer-f) against two
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

  // Vance is the DISCRIMINATING second card: he and Briar are both archers, so a card
  // wired to "an archer crop" rather than to this member satisfies one and not the other.
  const vanceCard = actorName === "Vance" ? actorCard : await findCard("Vance");
  expect(vanceCard.width, "Vance (archer-m) should be real art").toBe(192);
  expect(vanceCard.captioned, "Vance's card shows a pending caption").toBe(false);
  expect(vanceCard.src, "Vance's card is not showing archer-m's asset").toContain("archer-m");
  expect(vanceCard.src, "Vance's card is showing Briar's face").not.toContain("archer-f");
});
