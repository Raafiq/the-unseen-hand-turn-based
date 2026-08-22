import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = "visual-artifacts/screenshots";

/**
 * The game shell in a real browser (docs/11 M0 item 1, AC-M1/AC-M2/AC-M3).
 *
 * `campaign-shell.test.ts` already drives the same object headlessly. What only a
 * browser can prove is the half that lives OUTSIDE that object: that the page mounts,
 * that the screens actually swap, and — the one that matters — that the save really
 * lands in `localStorage` and is still there after a full RELOAD. A memory-backed slot
 * passes every headless persistence test whether or not the browser wiring works.
 *
 * The battle is driven through `autoplay()` (the shipped watch-mode seam: the balance
 * probe on both seats, on an explicit call, no timers), so the run is deterministic and
 * this spec cannot flake on a slow machine.
 */
const screen = (page: Page): Promise<string> => page.evaluate(() => window.tuhGame.screen());
const stored = (page: Page): Promise<string | null> =>
  page.evaluate(() => window.tuhGame.storedSave());

async function playCurrentBattle(page: Page): Promise<void> {
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await page.evaluate(() => window.tuhGame.autoplay());
  await page.getByTestId("conclude").click();
}

test("campaign shell: title → battle → saved progress survives a reload", async ({ page }) => {
  await mkdir(SHOTS, { recursive: true });
  await page.goto("/game.html");

  // A fresh browser: no save, so Continue is genuinely unavailable rather than a
  // button that quietly does nothing.
  await expect(page.getByTestId("screen-title")).toBeVisible();
  await expect(page.getByTestId("continue")).toBeDisabled();
  expect(await stored(page)).toBeNull();
  await page.screenshot({ path: `${SHOTS}/20-title.png`, fullPage: true });

  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
  await expect(page.getByTestId("brief-step")).toContainText("Battle 1 of 5");
  await expect(page.getByTestId("brief-party")).toContainText("Vance");

  // The story seam on screen (AC-M4): the AUTHORED title and the pre-battle text, both
  // from `data/campaign/story/*.story.json`. The A/B that proves they came from the data
  // is headless (`campaign-shell.test.ts`); what a browser adds is that they render.
  await expect(page.getByTestId("brief-title")).toHaveText("The Toll Road");
  await expect(page.getByTestId("brief-story")).toContainText("Four of us, one road");

  // The between-battle prep panel is mounted on the briefing with the whole party.
  await expect(page.getByTestId("prep-roster")).toContainText("Ottoline");
  await expect(page.getByTestId("prep-progression")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/21-briefing.png`, fullPage: true });

  // New Game writes the slot immediately — a player who closes the tab on the
  // briefing screen has still started a run.
  expect(await stored(page)).not.toBeNull();

  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await expect(page.getByTestId("timeline")).toContainText("Next up");
  await expect(page.getByTestId("preview")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/22-battle.png`, fullPage: true });

  await page.evaluate(() => window.tuhGame.autoplay());
  await expect(page.getByTestId("conclude")).toBeVisible();
  await page.getByTestId("conclude").click();
  await expect(page.getByTestId("screen-after")).toBeVisible();
  await expect(page.getByTestId("after-title")).toHaveText("Battle won");
  await expect(page.getByTestId("after-story")).toContainText("They ran before the last of them fell");
  await page.screenshot({ path: `${SHOTS}/23-after-battle.png`, fullPage: true });

  const afterOne = await stored(page);
  expect(afterOne).toContain('"battleIndex":1');

  // THE RELOAD IS THE POINT. Everything above passes against an in-memory slot; only a
  // real round trip through `localStorage` survives the page being thrown away.
  await page.reload();
  await expect(page.getByTestId("screen-title")).toBeVisible();
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page.getByTestId("title-slot")).toContainText("battle 2 of 5");
  expect(await stored(page)).toBe(afterOne);

  await page.getByTestId("continue").click();
  await expect(page.getByTestId("brief-step")).toContainText("Battle 2 of 5");
  expect(await screen(page)).toBe("BRIEFING");
});

test("campaign shell: the five-battle run reaches its ending in the browser", async ({ page }) => {
  await page.goto("/game.html");
  await page.getByTestId("new-game").click();

  for (let i = 0; i < 5; i++) {
    await expect(page.getByTestId("brief-step")).toContainText(`Battle ${i + 1} of 5`);
    await playCurrentBattle(page);
    if (i < 4) {
      await expect(page.getByTestId("screen-after")).toBeVisible();
      await page.getByTestId("next").click();
    }
  }

  await expect(page.getByTestId("screen-completed")).toBeVisible();
  // The final victory skips the after-battle screen entirely, so the ending screen is the
  // only place its scene can be read.
  await expect(page.getByTestId("done-story")).toContainText("It is over, and it is not finished");
  await expect(page.getByTestId("done-note")).toContainText("5 battles won");
  expect(await screen(page)).toBe("COMPLETED");
  expect(await stored(page)).toContain('"status":"completed"');
  await page.screenshot({ path: `${SHOTS}/24-completed.png`, fullPage: true });
});

test("campaign shell: an unreadable save is a message, and New Game still works", async ({ page }) => {
  // A player whose save is corrupt (a half-written blob, a build downgrade) must not
  // meet a blank page. Seed the slot with garbage BEFORE the module loads.
  await page.addInitScript(() => {
    localStorage.setItem("tuh.campaign.v1", "{ not a save");
  });
  await page.goto("/game.html");

  await expect(page.getByTestId("screen-title")).toBeVisible();
  await expect(page.getByTestId("title-slot")).toContainText("could not be read");
  await expect(page.getByTestId("continue")).toBeDisabled();

  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
});

test("between-battle prep: banked AP buys a new command, and it survives a reload", async ({
  page,
}) => {
  await mkdir(SHOTS, { recursive: true });
  await page.goto("/game.html");
  await page.getByTestId("new-game").click();

  // Two battles of banked AP. Vance holds 96 by the third briefing — enough for one
  // 60-AP tier-one node and not much else, which is the whole decision.
  for (let i = 0; i < 2; i++) {
    await playCurrentBattle(page);
    await page.getByTestId("next").click();
  }
  await expect(page.getByTestId("brief-step")).toContainText("Battle 3 of 5");
  await expect(page.getByTestId("prep-ap")).toContainText("96 AP");

  // Vance is a Knight and knows no magic: no Fire anywhere in his command list.
  const commands = page.getByTestId("prep-commands");
  await expect(commands).not.toContainText("Fire");

  // Change job (free) → buy Fire with banked AP → change back → equip Black Magic as the
  // Secondary. Every step is a real control, and the last one is the customization pillar
  // arriving through play rather than through the demo's pre-loaded record.
  await page.getByTestId("prep-job").selectOption("wizard");
  await page.locator('[data-testid="prep-learn"] li[data-node="fire"] button').click();
  await expect(page.getByTestId("prep-ap")).toContainText("36 AP");

  await page.getByTestId("prep-job").selectOption("knight");
  await page.getByTestId("prep-secondary").selectOption("wizard");
  await expect(commands).toContainText("Fire");
  await page.screenshot({ path: `${SHOTS}/25-briefing-prep.png`, fullPage: true });

  // THE RELOAD IS THE POINT, again. Every assertion above holds against a panel editing
  // its own copy and telling nobody; only a real round trip through `localStorage` shows
  // the edit actually reached the save.
  await page.reload();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("brief-step")).toContainText("Battle 3 of 5");
  await expect(page.getByTestId("prep-ap")).toContainText("36 AP");
  await expect(page.getByTestId("prep-commands")).toContainText("Fire");

  // And the edit is on the unit that DEPLOYS, not merely in the panel — the assertion
  // that reaches through `updatePartyMember` rather than stopping at it.
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  const abilities = await page.evaluate(() => {
    const save = window.tuhGame.save();
    return save?.party.find((r) => r.id === "pc-vance")?.learned ?? [];
  });
  expect(abilities).toContain("black-magic.fire");
});

test("between-battle prep: an unaffordable ability is refused, with the reason", async ({
  page,
}) => {
  // The first briefing has zero banked AP, so every purchase must be blocked — and the
  // panel must say WHY rather than just greying out, or a player cannot tell "save up"
  // from "learn something else first".
  await page.goto("/game.html");
  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("prep-ap")).toContainText("0 AP");

  const first = page.locator('[data-testid="prep-learn"] li').first();
  await expect(first.locator("button")).toBeDisabled();
  await expect(first.locator("button")).toHaveAttribute("title", /insufficient AP/);

  // And a node whose ability does nothing SAYS so before anyone pays for it. AP is never
  // refunded (AC-J3), so an unmarked inert node charges real currency for nothing —
  // Vance's whole Knight tree is exactly that case today.
  await expect(page.locator('[data-testid="prep-learn"] li[data-node="armor-break"]')).toContainText(
    "no effect yet",
  );
});

test("help: the ? panel opens from any screen and explains the mechanics", async ({ page }) => {
  // The `?` is the whole of M0 item 7 (user decision, 2026-08-22): nothing is TAUGHT on
  // rails, so this control is the only route to an explanation. A panel that exists in
  // the markup but cannot be opened is the same as no panel at all, and no headless test
  // can see the difference — `<dialog>.showModal()` only means anything in a browser.
  await page.goto("/game.html");

  const panel = page.getByTestId("help");
  await expect(panel).toBeHidden();

  await page.getByTestId("help-open").click();
  await expect(panel).toBeVisible();
  // Content, not just an open box: the slot topics are the ones this slice made real.
  await expect(page.getByTestId("help-body")).toContainText("Secondary command");
  await expect(page.getByTestId("help-body")).toContainText("Reaction");

  await page.getByTestId("help-close").click();
  await expect(panel).toBeHidden();

  // Reachable mid-battle too, not only from the title — a player asks "what is CT?"
  // while looking at the clock, not before they have seen one.
  await page.getByTestId("new-game").click();
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await page.getByTestId("help-open").click();
  await expect(panel).toBeVisible();
});

test("equipment: a granted weapon can be equipped, and it survives a reload", async ({ page }) => {
  // The headless tests prove the record changes and the built unit changes. What only a
  // browser proves is the half outside those objects: the drip reaches the panel, the
  // selector writes through `updateParty` to the save, and the save is really in
  // localStorage. An in-memory slot passes every headless persistence test regardless.
  await page.goto("/game.html");
  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("screen-briefing")).toBeVisible();

  // Battle one's grant is in hand before battle one is fought, so the row exists now.
  const weapon = page.getByTestId("prep-weapon");
  await expect(weapon).toBeVisible();
  await weapon.selectOption("wpn-cestus");

  await page.reload();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
  await expect(page.getByTestId("prep-weapon")).toHaveValue("wpn-cestus");
});
