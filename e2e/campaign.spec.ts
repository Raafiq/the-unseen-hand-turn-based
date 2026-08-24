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

/**
 * Use the prep screen the way an engaged player does — through the real controls
 * (ADR-0027).
 *
 * Since ADR-0027 the finale is tuned so a party that never spends AP loses it, so a
 * browser walkthrough that skipped this would be asserting the zero-engagement path,
 * which the campaign deliberately no longer grants an ending to.
 *
 * IT ONLY EVER TOUCHES THE MEMBER'S OWN TREE, and that is the whole policy rather than an
 * incidental simplification: the tree selector defaults to the current job, so clicking
 * every enabled buy button without changing it spends on the job the unit is in. Measured
 * headlessly, that clears the campaign at 8 of 8 seeds — while buying the cheapest node
 * anywhere in the pack clears 1 of 8. Spending at home is the thing the game now asks a
 * player to work out.
 */
async function prepEveryMember(page: Page): Promise<void> {
  const members = await page.locator('[data-testid="prep-roster"] button.ptab').all();
  for (let i = 0; i < members.length; i += 1) {
    // Re-resolve each pass: the panel re-renders after every purchase, so a handle taken
    // before the click is detached by the time the next one is needed.
    await page.locator('[data-testid="prep-roster"] button.ptab').nth(i).click();
    for (let guard = 0; guard < 20; guard += 1) {
      const buy = page.locator('[data-testid="prep-learn"] button.buy:not([disabled])').first();
      if ((await buy.count()) === 0) break;
      await buy.click();
    }
    // Equip what was just bought. A passive that is learned and never equipped does
    // nothing at all, which is exactly what an untouched slot looks like from outside.
    for (const slot of ["support", "movement", "reaction", "secondary"]) {
      const select = page.getByTestId(`prep-${slot}`);
      if ((await select.count()) === 0) continue;
      const values = await select.locator("option").evaluateAll((os) =>
        os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ""),
      );
      const current = await select.inputValue();
      if (current === "" && values.length > 0) await select.selectOption(values[0]!);
    }
  }
}

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
  // Not a story LITERAL: the pack is meant to be swappable, so pinning its prose here
  // turns the seam's whole purpose into a test failure (it did — this line named a party
  // size the battle does not field, and had to change). The speaker is structure, not
  // prose, and the block being non-empty is the claim.
  await expect(page.getByTestId("brief-story")).toContainText("Vance");
  await expect(page.getByTestId("brief-story")).not.toBeEmpty();

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
  // Structure, not prose: the block is populated and attributed. Pinning the line
  // would make swapping the story pack — the point of the seam — a test failure.
  await expect(page.getByTestId("after-story")).not.toBeEmpty();
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
    await prepEveryMember(page);
    await playCurrentBattle(page);
    if (i < 4) {
      await expect(page.getByTestId("screen-after")).toBeVisible();
      await page.getByTestId("next").click();
    }
  }

  await expect(page.getByTestId("screen-completed")).toBeVisible();
  // The final victory skips the after-battle screen entirely, so the ending screen is the
  // only place its scene can be read.
  await expect(page.getByTestId("done-story")).not.toBeEmpty();
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

  // Two battles of banked AP — enough for one 60-AP tier-one node and not much else,
  // which is the whole decision. The FIGURE is read off the panel rather than written
  // down: it moved 96 → 88 the moment Vance changed job, because what a member earns
  // depends on what they land, and a hard-coded total made a content change look like a
  // regression. What matters is that it affords exactly one purchase.
  for (let i = 0; i < 2; i++) {
    await playCurrentBattle(page);
    await page.getByTestId("next").click();
  }
  await expect(page.getByTestId("brief-step")).toContainText("Battle 3 of 5");
  const apBefore = Number(
    (await page.getByTestId("prep-ap").innerText()).replace(/[^0-9]/g, ""),
  );
  expect(apBefore).toBeGreaterThanOrEqual(60);
  expect(apBefore).toBeLessThan(120);

  // Vance knows no black magic: no Fire anywhere in his command list.
  const commands = page.getByTestId("prep-commands");
  await expect(commands).not.toContainText("Fire");

  // Change job (free) → buy Fire with banked AP → change back → equip Black Magic as the
  // Secondary. Every step is a real control, and the last one is the customization pillar
  // arriving through play rather than through the demo's pre-loaded record.
  await page.getByTestId("prep-job").selectOption("wizard");
  await page.locator('[data-testid="prep-learn"] li[data-node="fire"] button').click();
  const apAfter = Number((await page.getByTestId("prep-ap").innerText()).replace(/[^0-9]/g, ""));
  expect(apAfter).toBe(apBefore - 60); // the node's price, charged exactly once

  await page.getByTestId("prep-job").selectOption("geomancer");
  await page.getByTestId("prep-secondary").selectOption("wizard");
  await expect(commands).toContainText("Fire");
  await page.screenshot({ path: `${SHOTS}/25-briefing-prep.png`, fullPage: true });

  // THE RELOAD IS THE POINT, again. Every assertion above holds against a panel editing
  // its own copy and telling nobody; only a real round trip through `localStorage` shows
  // the edit actually reached the save.
  await page.reload();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("brief-step")).toContainText("Battle 3 of 5");
  await expect(page.getByTestId("prep-ap")).toContainText(`${apAfter} AP`);
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

  // The first row a member ALREADY KNOWS renders no buy button at all, so `.first()`
  // is not necessarily purchasable — Vance starts knowing his tier-one node. Take the
  // first row that actually offers a purchase.
  const buyable = page.locator('[data-testid="prep-learn"] li button[data-learn]').first();
  await expect(buyable).toBeDisabled();
  await expect(buyable).toHaveAttribute("title", /insufficient AP/);

  // And a node whose ability does nothing SAYS so before anyone pays for it. AP is never
  // refunded (AC-J3), so an unmarked inert node charges real currency for nothing.
  //
  // The row is DISCOVERED, not named: this used to point at `armor-break`, a Knight
  // node, and broke the moment Vance changed job — the fourth time a hard-coded content
  // id has rotted a spec here. Asking the page for "a row tagged inert" survives any
  // re-jobbing, and the count assertion keeps it from passing vacuously on a tree that
  // has none.
  const inert = page.locator('[data-testid="prep-learn"] li.deferred');
  await expect(inert.first()).toContainText("no effect yet");

  // Every live row must NOT carry the tag — otherwise "some row says it" would pass on a
  // panel that tagged everything.
  const live = page.locator('[data-testid="prep-learn"] li:not(.deferred)');
  expect(await live.count()).toBeGreaterThan(0);
  await expect(live.first()).not.toContainText("no effect yet");
});

test("prep: an action from another job is marked BEFORE it is bought", async ({ page }) => {
  // The expensive mistake the campaign now punishes (ADR-0027): AP is one pool and the
  // panel browses any tree, so buying cheap actions from several jobs leaves a unit able
  // to use one of them. Measured, a player who spends at home clears the campaign at 8 of
  // 8 seeds and one who buys the cheapest node anywhere clears 1 of 8.
  await page.goto("/game.html");
  await page.getByTestId("new-game").click();

  // The unit's OWN tree is what the panel opens on, and none of it needs a Secondary.
  const own = page.locator('[data-testid="prep-learn"] li');
  expect(await own.count()).toBeGreaterThan(0);
  await expect(page.locator('[data-testid="prep-learn"] [data-testid="reach-secondary"]')).toHaveCount(0);

  // Browse to a tree the unit is NOT in. Discovered, not named: a hard-coded job id here
  // would rot the next time a starting character is re-jobbed, which has already happened
  // four times in this file.
  const current = await page.getByTestId("prep-job").inputValue();
  const other = await page
    .getByTestId("prep-tree")
    .locator("option")
    .evaluateAll((os, cur) =>
      os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== cur),
      current,
    );
  expect(other.length).toBeGreaterThan(0);
  await page.getByTestId("prep-tree").selectOption(other[0]!);

  const flagged = page.locator('[data-testid="prep-learn"] [data-testid="reach-secondary"]');
  expect(await flagged.count()).toBeGreaterThan(0);
  await expect(flagged.first()).toContainText("needs Secondary");

  // And the panel says what to do about it, on the screen where the money is spent —
  // the help panel is a click away and a player who never opens it still gets this.
  await expect(page.getByTestId("prep-spend-hint")).toContainText("job this unit is in");
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

test("prep: free things that are going unused SAY so, and stop saying it once used", async ({ page }) => {
  // A playtest found the final battle's prep screen with nine weapons owned, none
  // equipped, and a free trait unchecked — with nothing on screen pointing at either.
  //
  // The A/B is the point: a hint that is always present is wallpaper and would pass a
  // mere "is it visible" check. Both halves are asserted — it appears while the free
  // thing is unused, and it is GONE once the player uses it.
  await page.goto("/game.html");
  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("screen-briefing")).toBeVisible();

  const weaponHint = page.getByTestId("prep-weapon-hint");
  const traitHint = page.getByTestId("prep-traits-hint");

  await expect(weaponHint).toBeVisible();
  await expect(weaponHint).toContainText("none equipped");
  await expect(traitHint).toBeVisible();

  await page.getByTestId("prep-weapon").selectOption("wpn-arming-sword");
  await expect(weaponHint).toHaveCount(0);

  await page.locator('[data-testid="prep-traits"] input[type="checkbox"]').first().check();
  await expect(traitHint).toHaveCount(0);
});

test("deployment: the briefing shows who fights, and a click swaps them into the battle", async ({ page }) => {
  // The gap: the briefing listed four names and then deployed two, which reads as a bug
  // rather than the authored ramp it is. What only a browser proves is that the click
  // reaches the SAVE and then the BOARD — the headless tests drive the shell directly.
  await page.goto("/game.html");
  await page.getByTestId("new-game").click();

  await expect(page.getByTestId("brief-deploy-note")).toContainText("fields 2 of 4");
  const benched = page.locator('[data-testid="brief-party"] li.benched');
  await expect(benched).toHaveCount(2);

  // Bench somebody who is going, by deploying somebody who is not.
  await page.locator('[data-testid="brief-party"] li.benched button[data-deploy]').first().click();
  await expect(benched).toHaveCount(2); // the COUNT never moves — the ramp is the battle's

  const chosen = await page.evaluate(() => window.tuhGame.save()?.deployment ?? []);
  expect(chosen).toHaveLength(2);

  // The names still on the briefing's DEPLOYED rows are the ones that must appear on
  // the board. Read them off the page rather than writing them down: which member the
  // click promoted depends on the authored roster, and hard-coding it would rot the
  // moment the campaign's opening battle is re-authored.
  const going = await page
    .locator('[data-testid="brief-party"] li:not(.benched) b')
    .allInnerTexts();
  expect(going).toHaveLength(2);

  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  // The timeline names every unit due to act, so it is where "who actually took the
  // field" is observable to a player.
  const timeline = page.getByTestId("timeline");
  for (const name of going) await expect(timeline).toContainText(name);
});

test("learnability: the board explains itself and the buttons drop engine jargon", async ({ page }) => {
  // Findings 3 and 4 of the cognitive walkthrough. Scoped to what ONLY a browser can
  // show: the legend exists solely in markup, and the End Turn label is rendered text.
  // The purchase receipt (finding 1) is asserted in `prep.test.ts`, where the model can
  // be handed AP directly — battle one pays none, so a browser test would have to walk
  // three battles to reach a purchase and would be testing the campaign, not the fix.
  await page.goto("/game.html");
  await page.getByTestId("new-game").click();
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();

  const legend = page.getByTestId("legend");
  await expect(legend).toBeVisible();
  await expect(legend).toContainText("Your party");
  await expect(legend).toContainText("Enemies");

  // "CT" is the engine's word for the turn clock. It belonged on neither of the two
  // controls a new player looks at most.
  // Checked across ALL FOUR surfaces, not just the button: the first pass reworded the
  // button and left the preview panel two inches below still reading "CT AFTER", which
  // is worse than not fixing it — the two controls then disagreed on vocabulary.
  for (const id of ["end-turn", "timeline", "preview", "status"]) {
    await expect(page.getByTestId(id)).not.toContainText(/\bCT\b/);
  }
});
