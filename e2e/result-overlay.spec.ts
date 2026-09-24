import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { apGrantAmount, NO_AP_REWARD } from "../src/sim/index.js";
import { DEFEAT_COPY } from "../src/render/result-overlay.js";
import {
  dismissScene,
  forfeitCurrentBattle,
  holdEnemyTurns,
  openDrawer,
  settleMotion,
  startNewGame,
} from "./helpers.js";
import { GROUNDS, contrastRatio, paintedStops } from "./contrast-helpers.js";

/**
 * THE END-OF-BATTLE RESULT OVERLAY (intent/win-lose-screen.md, ADR-0043 §4).
 *
 * `src/render/result-overlay.test.ts` already proves the pure HTML builder — every
 * outcome maps to the right label, identity is preserved, the roster and the drop
 * row are conditional. What only a browser can prove is that the REAL wiring reaches
 * that builder with the REAL data (a real battle's banked AP, a real portrait, a real
 * save), that the chrome around it is actually hidden and actually inert, and that
 * nothing clips at the two asserted viewports (docs/10 §8).
 */

const SHOTS = "coverage/win-lose";

const REFERENCE_VIEWPORTS = [
  { name: "832x328", size: { width: 832, height: 328 } },
  { name: "832x384", size: { width: 832, height: 384 } },
] as const;

async function toVictory(page: Page): Promise<void> {
  await page.goto("/");
  await startNewGame(page);
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await page.evaluate(() => window.tuhGame.autoplay());
  await expect(page.getByTestId("result-overlay")).toBeVisible();
}

async function toDefeat(page: Page): Promise<void> {
  await page.goto("/");
  await startNewGame(page);
  await dismissScene(page);
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await holdEnemyTurns(page);
  await forfeitCurrentBattle(page);
  await expect(page.getByTestId("result-overlay")).toBeVisible();
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * The smallest `font-size` (CSS px, computed style — AFTER any cascade/clamp, not a
 * value read off a stylesheet) of any element inside `[data-testid="result-overlay"]`
 * that actually carries visible text. The pass-2 defect had the AP pills and body copy
 * rendering at ~7-8px; this is what makes that assertable directly, rather than by
 * eyeballing a screenshot.
 */
async function minResultFontPx(page: Page): Promise<number> {
  return page.getByTestId("result-overlay").evaluate((root) => {
    let min = Infinity;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.textContent && n.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (Number.isFinite(size)) min = Math.min(min, size);
    }
    return min;
  });
}

/**
 * THE OVERLAY's OWN GROUNDS, SAMPLED — not copied off `GROUNDS.plaque`/`GROUNDS.leaf`
 * on the strength of a coincidence (reviewer finding 4, win-lose-screen slice).
 * `.tuh-result-layer` (`stage.css`) redeclares `--plaque*`/`--parch*` as its OWN local
 * custom properties, in a SEPARATE stylesheet scope from wherever `GROUNDS` was
 * measured — they happen to share the same hex values today, but nothing ties the two
 * declarations together. Without this guard, every pinned contrast ratio below would
 * go on measuring a palette the overlay had quietly stopped painting, exactly the
 * "measuring the wrong sheet" shape `contrast.spec.ts`'s own `groundsAreReal` exists
 * to catch for the other screens.
 *
 * MUTATION: repainting `.rleaf` a materially different colour (e.g. swapping the
 * defeat gradient's own stops) goes red here FIRST, before any ratio assertion would
 * even get a chance to notice — proven below by actually running that mutation.
 */
async function resultGroundsAreReal(page: Page, verdict: "VICTORY" | "DEFEAT"): Promise<void> {
  const painted = await page.evaluate(() => {
    const grab = (sel: string): string => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundImage : "";
    };
    return {
      verdict: grab('[data-testid="result-verdict"]'),
      leaf: grab(".rleaf"),
      ap: grab('[data-testid="result-ap"]'),
      action: grab('[data-testid="result-action"]'),
    };
  });
  expect(paintedStops(painted.verdict), "result-verdict grounds, as a set").toEqual(
    [...GROUNDS.plaque].sort(),
  );
  expect(paintedStops(painted.leaf), `result leaf (${verdict}) grounds, as a set`).toEqual(
    verdict === "VICTORY" ? [...GROUNDS.leaf].sort() : [...GROUNDS.resultDefeatLeaf].sort(),
  );
  if (verdict === "VICTORY") {
    expect(paintedStops(painted.ap), "result-ap grounds, as a set").toEqual([...GROUNDS.plaque].sort());
  }
  expect(paintedStops(painted.action), "result-action (.rgo) grounds, as a set").toEqual(
    [...GROUNDS.resultSeal].sort(),
  );
}

/** The worst (lowest) ratio of `fg` against every stop a ground family declares — the
 * same "clears the bar against BOTH ends" rule `contrast.spec.ts`'s own banner states,
 * applied here to whichever set the element actually sits on. */
function worstRatio(fg: string, grounds: readonly string[]): number {
  return Math.min(...grounds.map((bg) => contrastRatio(fg, bg)));
}

function parseRgb(s: string): [number, number, number] {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(s);
  if (!m) throw new Error(`not an rgb() string: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function mixRgb(a: readonly [number, number, number], b: readonly [number, number, number], f: number): string {
  const lerp = (x: number, y: number): number => Math.round(x + (y - x) * f);
  return `rgb(${lerp(a[0], b[0])}, ${lerp(a[1], b[1])}, ${lerp(a[2], b[2])})`;
}

/**
 * The colour the DEFEAT leaf's own radial gradient (`stage.css`'s `.tuh-result.defeat
 * .rleaf`) actually paints at normalized radial distance `t` (0 = the gradient's own
 * centre, 1 = its outer edge) — linearly interpolated between the two nearest of
 * `GROUNDS.resultDefeatLeaf`'s four stops, at the SAME percentages the gradient
 * declares (`0%, 46%, 84%, 100%`). This is real gradient math, not a guess.
 */
function defeatLeafColorAt(t: number): string {
  const stops: ReadonlyArray<{ at: number; rgb: readonly [number, number, number] }> = [
    { at: 0, rgb: parseRgb(GROUNDS.resultDefeatLeaf[0]!) },
    { at: 0.46, rgb: parseRgb(GROUNDS.resultDefeatLeaf[1]!) },
    { at: 0.84, rgb: parseRgb(GROUNDS.resultDefeatLeaf[2]!) },
    { at: 1, rgb: parseRgb(GROUNDS.resultDefeatLeaf[3]!) },
  ];
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (clamped <= b.at) return mixRgb(a.rgb, b.rgb, (clamped - a.at) / (b.at - a.at));
  }
  return mixRgb(stops.at(-1)!.rgb, stops.at(-1)!.rgb, 0);
}

/**
 * THE REAL SAMPLED GROUND under a text element on the DEFEAT leaf (reviewer finding
 * 4's "no text element's sampled ground is the outer stop… or ≤4.5 vs ink") — not the
 * worst DECLARED stop across the whole gradient (too pessimistic: `worstRatio` against
 * every stop fails even a line sitting well inside the lighter centre, since `#a87a50`
 * exists SOMEWHERE in the box, just not under most text) and not the wrong-leaf proxy
 * the pass-3 build used (`GROUNDS.leaf[3]`, a lighter colour the VICTORY gradient
 * paints, never the DEFEAT one). Reads the element's own centre, turns it into the
 * SAME normalized radial distance CSS computes for
 * `radial-gradient(126% 100% at 50% 30%, …)`, and returns the colour actually there.
 */
async function sampledDefeatLeafColor(page: Page, testid: string): Promise<string> {
  const leafBox = await page.locator(".rleaf").boundingBox();
  const elBox = await page.getByTestId(testid).boundingBox();
  if (!leafBox || !elBox) throw new Error(`sampledDefeatLeafColor: missing box for ${testid}`);
  const fx = (elBox.x + elBox.width / 2 - leafBox.x) / leafBox.width;
  const fy = (elBox.y + elBox.height / 2 - leafBox.y) / leafBox.height;
  const dx = (fx - 0.5) / 1.26; // ellipse horizontal radius: 126% of the box width
  const dy = (fy - 0.3) / 1.0; // ellipse vertical radius: 100% of the box height, centre at 30%
  const t = Math.sqrt(dx * dx + dy * dy);
  return defeatLeafColorAt(t);
}

test.describe("VICTORY overlay", () => {
  test("lists exactly the six party members by id, each AP figure equal to the banked grant", async ({
    page,
  }) => {
    await toVictory(page);
    const banked = await page.evaluate(() => window.tuhGame.lastBattle());
    const save = await page.evaluate(() => window.tuhGame.save());
    expect(banked).not.toBeNull();
    expect(save?.party.length).toBe(6);

    const cards = page.locator('[data-testid="result-member"]');
    // MUTATION this catches: rendering five cards (a dropped member) fails the count.
    await expect(cards).toHaveCount(6);

    for (const rec of save!.party) {
      const card = page.locator(`[data-testid="result-member"][data-member-id="${rec.id}"]`);
      await expect(card, `no card rendered for ${rec.id}`).toHaveCount(1);
      const expectedAp = apGrantAmount(banked!.rewards[rec.id] ?? NO_AP_REWARD);
      // Read BY ID, not by position — so two members whose AP was SWAPPED shows up as
      // a wrong number next to a named id, not merely a reordered list.
      await expect(card.getByTestId("result-ap"), rec.id).toHaveText(`+${expectedAp} AP`);

      // PORTRAIT IDENTITY (reviewer finding 11) — not merely "some image arrived".
      // `data-portrait-key` is the SAME key `resolvePortrait(rec.id)` derives for
      // this exact member, so two members whose portraits were SWAPPED shows up as
      // the WRONG key next to a named id — a width/presence check (this file's own
      // `src/render/CLAUDE.md` names the trap: 192px passed a knight's face on the
      // archer) could never catch that.
      const key = await card.locator("img").getAttribute("data-portrait-key");
      const expectedKey = await page.evaluate((id) => window.tuhGame.portraitKey(id), rec.id);
      expect(key, `portrait key for ${rec.id}`).toBe(expectedKey);
    }
  });

  test("the weapon-drop line names the real grant reaching the overlay — and nothing else in the inventory", async ({
    page,
  }) => {
    // Battle 1's win banks battle 2's own grant (`wpn-rapier`, camp-the-first-march.json).
    // `save.inventory` is SEEDED with battle 1's own grants at game start
    // (`startCampaign`), so it already holds `wpn-arming-sword`/`wpn-cestus` before this
    // win — real "something else" for the negative half below to discriminate against,
    // not a fixture that happens to hold exactly one item.
    await toVictory(page);
    const inventory = await page.evaluate(() => window.tuhGame.save()?.inventory ?? []);
    // Non-degeneracy: this walk only proves anything if a grant actually happened.
    expect(inventory.length, "no equipment was granted — fixture does not discriminate").toBeGreaterThan(0);
    const dropText = (await page.getByTestId("result-weapon-grant").innerText()).trim();
    expect(dropText).toContain("Rapier");
    // AND NOTHING ELSE FROM THE INVENTORY — the previous version only checked "the
    // whole inventory is non-empty", which would pass identically whether the row
    // named ONLY this battle's grant or joined the WHOLE inventory onto the line
    // (`shell.save.inventory` instead of the diff `lastGrantedEquipment` takes).
    for (const id of inventory) {
      const name = await page.evaluate((eid) => window.tuhGame.equipmentName(eid), id);
      if (name === "Rapier") continue;
      expect(dropText, `${name} (${id}) leaked into the drop line`).not.toContain(name);
    }
    // MUTATION this catches: hard-coding "Rapier" in the renderer would still pass THIS
    // battle — `src/render/result-overlay.test.ts`'s own test swaps the id/name pair to
    // catch that; joining the WHOLE inventory instead of the diff goes red on the loop
    // above (Arming Sword/Cestus would leak into the line).
  });
});

test.describe("DEFEAT overlay (owner note 2's leaner card)", () => {
  test("renders no portrait, no per-member card, and the five specified lines", async ({ page }) => {
    await toDefeat(page);
    await expect(page.getByTestId("result-verdict")).toHaveText("DEFEAT");
    // MUTATION this catches: rendering the roster on Defeat (falling back to a default
    // member list) fails both counts below.
    await expect(page.locator('[data-testid="result-member"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="result-overlay"] img')).toHaveCount(0);

    await expect(page.getByTestId("result-message")).toHaveText(DEFEAT_COPY.message);
    await expect(page.getByTestId("result-reward-summary")).toHaveText(DEFEAT_COPY.rewardSummary);
    await expect(page.getByTestId("result-retention")).toHaveText(DEFEAT_COPY.retention);

    // ONE GLYPH, FROM ONE SOURCE. `innerText`, trimmed, EXACT — not a substring/regex
    // match, which "CONTINUE ▸ ▸" (the pass-2 doubled-arrow defect) would also pass.
    const label = (await page.getByTestId("result-action").innerText()).trim();
    // MUTATION this catches: re-adding the template's own `.rchev` span alongside a
    // label that already carries the glyph reproduces "RETRY ▸ ▸" and this goes red.
    expect(label).toBe("RETRY ▸");
  });
});

test.describe("the overlay disables everything under it (owner note 3)", () => {
  test("the objective plaque and the ribbon are HIDDEN (not merely covered); the board and menu are inert", async ({
    page,
  }) => {
    await toVictory(page);

    // "IN THE DOM IS NOT ON THE SCREEN": `toBeHidden` checks actual rendered
    // visibility (display/visibility/size), not merely the `hidden` attribute.
    await expect(page.getByTestId("entry-plaque")).toBeHidden();
    await expect(page.getByTestId("move")).toBeHidden();
    await expect(page.getByTestId("end-turn")).toBeHidden();

    // THE ENDED TOAST ("Victory — the objective is complete") IS HIDDEN TOO — the
    // overlay's own VICTORY plaque is the verdict now, and a pass-2 defect left the
    // toast showing underneath, overlapping the sheet's bottom edge.
    await expect(page.getByTestId("reason")).toBeHidden();
    // MUTATION this catches: dropping `if (open) toast.hidden = true;` from
    // `renderResultOverlay` goes red here (the toast is populated with
    // `session.outcome` the instant the battle ends).

    // THE SCRIM SWALLOWS A REAL POINTER EVENT — the overlay sits above the board
    // (z-index), so a real mouse click never reaches `pickAt` at all. That proves the
    // scrim, not the guard: this click would pass identically whether or not `pickAt`
    // itself still checked `ENDED`.
    const before = {
      commands: await page.evaluate(() => window.tuhGame.commandCount()),
      staged: await page.evaluate(() => window.tuhGame.stagedTarget()),
    };
    const grid = page.getByTestId("grid");
    const box = await grid.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    expect(await page.evaluate(() => window.tuhGame.commandCount())).toBe(before.commands);
    expect(await page.evaluate(() => window.tuhGame.stagedTarget())).toEqual(before.staged);
    await expect(page.getByTestId("unit-drawer")).toBeHidden();

    // THE REAL GUARD, exercised directly: `clickTile` (`GameApi`) reaches `hud.pick`
    // — the SAME seam `pointerdown`/keyboard Enter route through — with NO DOM
    // hit-test in between, so this is the one assertion that can actually see
    // `pickAt`'s `session?.phase === "ENDED"` short-circuit. Target a tile a LIVE
    // unit occupies: if the guard were gone, this tap would fall through to the
    // "occupied, not targetable" branch and open the read-only unit-inspect drawer.
    const unitPos = await page.evaluate(() => {
      const u = window.tuhGame.state()?.units.find((unit) => unit.hp > 0);
      return u ? { x: u.pos.x, y: u.pos.y } : null;
    });
    expect(unitPos, "fixture needs at least one living unit on the board").not.toBeNull();
    await page.evaluate((p) => window.tuhGame.clickTile(p.x, p.y), unitPos!);
    expect(await page.evaluate(() => window.tuhGame.commandCount())).toBe(before.commands);
    expect(await page.evaluate(() => window.tuhGame.stagedTarget())).toEqual(before.staged);
    await expect(page.getByTestId("unit-drawer")).toBeHidden();
    // MUTATION this catches: removing `if (session?.phase === "ENDED") return;` from
    // `pickAt` opens the unit drawer here — a real click can never reach that branch
    // to prove it (the scrim intercepts it first), which is exactly why this call
    // bypasses the DOM and goes straight at the seam.

    // THE TURN-ORDER RAIL IS INERT — it has no click handler at all, so a tap can only
    // ever fail to change anything; this pins that as a claim, not an accident.
    const rail = page.getByTestId("timeline");
    const railBox = await rail.boundingBox();
    await page.mouse.click(railBox!.x + 5, railBox!.y + 5);
    expect(await page.evaluate(() => window.tuhGame.phase())).toBe("ENDED");

    // ONLY THE RESULT-SCREEN ACTION REMAINS INTERACTIVE.
    await expect(page.getByTestId("hud-menu")).toBeDisabled();
    await expect(page.getByTestId("actor-tab")).toBeDisabled();
    await expect(page.getByTestId("target-plate")).toBeDisabled();
    await expect(page.getByTestId("result-action")).toBeEnabled();

    // ☰ IS NOT MERELY MARKED disabled — A TAP OPENS NOTHING. `.click()` on a native
    // `disabled` button is a browser no-op with no event dispatched, so calling it
    // directly (bypassing Playwright's own actionability pre-check, which would
    // otherwise refuse to even attempt the click) is the genuine A/B: does the menu
    // drawer open, or not.
    await page.evaluate(() => {
      (document.querySelector('[data-testid="hud-menu"]') as HTMLButtonElement | null)?.click();
    });
    // MUTATION this catches: re-enabling `menuBtn` while the overlay is open (e.g.
    // reverting `menuBtn.disabled = open`) opens the drawer here.
    await expect(page.getByTestId("menu-drawer")).toBeHidden();
  });
});

test.describe("a drawer left open when the battle ends (reviewer finding 1)", () => {
  test("the ☰ drawer, opened during the enemy's own timed step, force-closes the instant that step ends the battle — and the overlay out-ranks it in z-index either way", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await startNewGame(page);
    await dismissScene(page);
    await page.getByTestId("deploy").click();
    await expect(page.getByTestId("screen-battle")).toBeVisible();
    // Fast enemy pacing (AC-V69: ×3 is an exact fraction of ×1) so this spends real
    // time on the assertion, not the wait — the PACER's own `setTimeout` is what
    // fires the step below, never a manual `window.tuhGame.step()` call.
    await page.evaluate(() => window.tuhGame.setEnemySpeed(3));
    await openDrawer(page, "menu");
    await expect(page.getByTestId("menu-drawer")).toBeVisible();

    // FORFEIT EVERY PLAYER TURN, letting the pacer's OWN timer run every enemy
    // turn — the drawer stays open the whole time, re-opened if anything else
    // happened to close it, so it is provably open going into whichever enemy
    // turn actually ends the battle.
    let guard = 0;
    while ((await page.evaluate(() => window.tuhGame.phase())) !== "ENDED") {
      const phase = await page.evaluate(() => window.tuhGame.phase());
      if (phase === "PLAYER_IDLE" || phase === "MOVE_STAGED") {
        await page.evaluate(() => window.tuhGame.endTurn());
        if (!(await page.getByTestId("menu-drawer").isVisible())) await openDrawer(page, "menu");
      } else {
        await page.waitForTimeout(40); // let the pacer's real timer fire — no manual step()
      }
      if (++guard > 4000) throw new Error("battle never reached ENDED");
    }

    await expect(page.getByTestId("result-overlay")).toBeVisible();
    // FIRST HALF: the drawer that was open when the timed step landed is
    // force-closed, not merely painted over — `quit` is INSIDE it, so its own
    // `toBeHidden` (an ancestor `[hidden]`, not merely covered) proves both at once.
    await expect(page.getByTestId("menu-drawer")).toBeHidden();
    await expect(page.getByTestId("quit")).toBeHidden();
    // MUTATION this catches: dropping `if (resultInfo !== null) overlay = null;`
    // from `render()` leaves `menu-drawer` (and `quit` inside it) visible here.

    // SECOND HALF, independent of the close call above: the overlay's own layer
    // must out-rank a drawer in the cascade even if something else left one open.
    const [layerZ, drawerZ] = await Promise.all([
      page.getByTestId("result-layer").evaluate((el) => Number(getComputedStyle(el).zIndex)),
      page.getByTestId("menu-drawer").evaluate((el) => Number(getComputedStyle(el).zIndex)),
    ]);
    expect(layerZ, "result-layer z-index").toBeGreaterThan(drawerZ);
    // MUTATION this catches: reverting `.tuh-result-layer`'s `z-index: 9` to the
    // pre-fix `5` fails this comparison against `.tuh-drawer`'s `z-index: 8`.
  });
});

test.describe("keyboard, on the overlay (reviewer finding 15)", () => {
  test("focus moves to the action button on open, survives an unrelated refresh, and ArrowRight cannot move the cursor", async ({
    page,
  }) => {
    await toVictory(page);

    // FOCUS MOVES TO THE ACTION BUTTON the instant the overlay opens.
    const activeTestId = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset["testid"] ?? null,
    );
    expect(activeTestId).toBe("result-action");
    // MUTATION this catches: removing the `.focus()` call from `renderResultOverlay`
    // goes red on the line above (focus would still sit wherever it was pre-battle —
    // the canvas, in `toVictory`'s own flow).

    // FOCUS SURVIVES AN UNRELATED REFRESH TICK. `settleMotion()` calls `paintBoard()`
    // directly (not through `ports.refresh()`), so drive an actual repaint the way a
    // player's own idle tick would: re-reading the SAME banked result many times, as
    // the earlier "banked exactly once" test already does deliberately.
    await page.evaluate(() => window.tuhGame.result());
    const stillActive = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset["testid"] ?? null,
    );
    expect(stillActive, "an unchanged repaint must not steal focus back").toBe("result-action");

    // ARROWRIGHT CANNOT MOVE THE CURSOR while the overlay is open. The canvas's own
    // `keydown` listener is what `moveCursor` lives behind, and focus just moved
    // AWAY from it (to the action button, above) — which is itself already most of
    // the real-world protection. To prove the LISTENER's own `resultOverlayOpen`
    // guard specifically (not merely "focus is elsewhere"), re-focus the canvas
    // directly first, the way a stray Tab or a leftover reference could.
    await page.evaluate(() => {
      (document.querySelector('[data-testid="grid"]') as HTMLCanvasElement | null)?.focus();
    });
    const before = await page.evaluate(() => window.tuhGame.cursor());
    await page.keyboard.press("ArrowRight");
    const after = await page.evaluate(() => window.tuhGame.cursor());
    expect(after).toEqual(before);
    // MUTATION this catches: removing the `resultOverlayOpen` guard from the
    // `keydown` handler goes red here — with the canvas focused, an unguarded
    // handler moves the cursor one tile right and this comparison fails.
  });
});

test.describe("navigation", () => {
  test("Continue on a non-final Victory plays battle 1's OWN victory beat, by identity, then lands on the next stop", async ({
    page,
  }) => {
    await toVictory(page);
    await page.getByTestId("result-action").click();
    // BATTLE 1 IN THE SHIPPED PACK AUTHORS A `victory` BEAT (`data/campaign/story/
    // camp-the-first-march.story.json`), so this is deterministic, not a loose
    // "SCENE or BRIEFING" either/or: the beat plays THROUGH THE SCENE PLAYER before
    // any landing, identified by battle id + outcome (never a pinned story phrase —
    // `check:story`).
    expect(await page.evaluate(() => window.tuhGame.screen())).toBe("SCENE");
    // MUTATION this catches: routing Continue straight to `arrive()` (the pre-fix
    // routing) goes red here — the screen would already be BRIEFING, `activeSceneId`
    // would be `null`, and b1's authored victory beat would be unreachable in live
    // play, the exact defect this test exists to catch.
    expect(await page.evaluate(() => window.tuhGame.activeSceneId())).toBe("outcome:b1:victory");
    await dismissScene(page);
    const screen = await page.evaluate(() => window.tuhGame.screen());
    expect(["SCENE", "BRIEFING"]).toContain(screen); // b2 authors no pre-battle scene, but tolerate one
  });

  test("Retry on Defeat plays battle 1's OWN defeat beat, by identity, then reaches its briefing with the party byte-identical", async ({
    page,
  }) => {
    await toDefeat(page);
    const before = await page.evaluate(() => JSON.stringify(window.tuhGame.save()?.party));
    await page.getByTestId("result-action").click();
    expect(await page.evaluate(() => window.tuhGame.screen())).toBe("SCENE");
    expect(await page.evaluate(() => window.tuhGame.activeSceneId())).toBe("outcome:b1:defeat");
    // MUTATION this catches: `retry()` skipping the queue goes red on the identity
    // assertion above the same way Continue's does.
    await dismissScene(page);
    await expect(page.getByTestId("screen-briefing")).toBeVisible();
    await expect(page.getByTestId("brief-step")).toContainText("Battle 1 of 5");
    const after = await page.evaluate(() => JSON.stringify(window.tuhGame.save()?.party));
    // MUTATION this catches: Retry wired to `nextBattle()`/`arrive()` instead of
    // `shell.retry()` either throws (status stays `gameOver`, `nextBattle` no-ops and
    // leaves the screen on BATTLE, failing the briefing check above) or, if it somehow
    // advanced, would not restore `battleIndex`; comparing the PARTY bytes catches a
    // subtler drift even if the screen happens to match.
    expect(after).toBe(before);
  });

  test("the save is banked exactly once, however many times the overlay is read before the tap", async ({
    page,
  }) => {
    await page.goto("/");
    await startNewGame(page);
    await dismissScene(page);
    await page.getByTestId("deploy").click();
    await page.evaluate(() => window.tuhGame.autoplay());
    await expect(page.getByTestId("result-overlay")).toBeVisible();
    const banked = await page.evaluate(() => window.tuhGame.lastBattle());
    const expectedAp = apGrantAmount(
      banked!.rewards["pc-vance"] ?? NO_AP_REWARD,
    );
    // Force several extra reads THROUGH THE PORT THAT RENDERS — `window.tuhGame.result()`
    // is `shell.result()` itself, the exact call `hud.ts`'s `ports.resultOverlay()` makes
    // on every repaint. `lastBattle()` (used above only to read the expected AP) is a
    // plain field read that never re-banks anything, so looping over IT would pass
    // identically whether or not the bank-once guard below still worked.
    for (let i = 0; i < 5; i++) await page.evaluate(() => window.tuhGame.result());
    const ap = await page.evaluate(
      () => window.tuhGame.save()?.party.find((r) => r.id === "pc-vance")?.ap,
    );
    // MUTATION this catches: banking again on every read would make this 2x/3x/... the
    // grant instead of exactly it (a fresh party starts at 0 AP, so this is exact, not
    // merely "increased").
    expect(ap).toBe(expectedAp);
  });
});

for (const vp of REFERENCE_VIEWPORTS) {
  test.describe(`at ${vp.name}`, () => {
    test(`victory overlay: no clipping/overlap, 44px targets, pinned contrast`, async ({ page }) => {
      await page.setViewportSize(vp.size);
      await mkdir(SHOTS, { recursive: true });
      await toVictory(page);
      await settleMotion(page);
      // GROUND REALITY FIRST (reviewer finding 4): every pinned ratio below is only
      // honest if the overlay is still painting the palette those numbers were taken
      // against.
      await resultGroundsAreReal(page, "VICTORY");

      // THE PASS-1 DEFECT (owner note 1): the VICTORY plaque must not overlap the
      // "Battle N of 5" subtitle line.
      const verdictBox = (await page.getByTestId("result-verdict").boundingBox())!;
      const whereBox = (await page.getByTestId("result-where").boundingBox())!;
      expect(
        rectsIntersect(verdictBox, whereBox),
        "the VICTORY plaque overlaps the battle-identifier subtitle",
      ).toBe(false);
      // MUTATION this catches: reverting the `.rleaf` top-padding fix (moving the
      // plaque back down 0px) reproduces the pass-1 overlap and this goes red.

      // No page scroll at this fold.
      const scroll = await page.evaluate(() => ({
        h: document.documentElement.scrollHeight,
        ch: document.documentElement.clientHeight,
      }));
      expect(scroll.h).toBeLessThanOrEqual(scroll.ch + 1);

      // THE LAYER COVERS THE WHOLE STAGE (board + rail + band), not merely the
      // board's own grid cell — the pass-2 defect (`boardBox.append(..., resultLayer)`)
      // confined it to ~360px wide. `result-layer` is the scrim; its box must equal
      // the stage's own box at both reference viewports.
      const stageBox = (await page.getByTestId("stage").boundingBox())!;
      const layerBox = (await page.getByTestId("result-layer").boundingBox())!;
      // MUTATION this catches: re-mounting `resultLayer` inside `boardBox` (reverting
      // the `hud.ts` change) shrinks this box back to the board cell's own — under
      // the rail's width and short of the band's height — and every assertion below
      // fails with it.
      for (const axis of ["x", "y", "width", "height"] as const) {
        expect(layerBox[axis], `result-layer.${axis} vs stage.${axis}`).toBeCloseTo(stageBox[axis], 0);
      }

      // THE SHEET ITSELF reaches the approved frame's proportions — at least 80% of
      // the viewport wide, matching the mockup's own measured panel (`coverage/win-lose/
      // victory-pass1-832x328.png`, right edge ≈749 of 832 ≈ 0.80).
      const sheetBox = (await page.getByTestId("result-overlay").boundingBox())!;
      expect(sheetBox.width, "sheet width").toBeGreaterThanOrEqual(0.8 * vp.size.width);

      // READABLE TEXT — the AP pill and body copy included, not merely the verdict
      // plaque. MUTATION this catches: the pass-2 build's `font-size: clamp(8px, 2.6px
      // + 1.55vh, 14px)` bottoms out AT 8px on this exact viewport height and this
      // assertion is what the current build fails on.
      expect(await minResultFontPx(page), "smallest rendered font-size in the sheet").toBeGreaterThanOrEqual(11);

      // Every overlay control clears the 44px CSS-px floor, measured via
      // `getBoundingClientRect` AFTER the stage transform (docs/10 §8, ~line 737).
      const btn = (await page.getByTestId("result-action").boundingBox())!;
      // MUTATION this catches: shrinking the button below 44px (e.g. a `min-height:
      // 40px`) fails either assertion below.
      expect(btn.width, "action button width").toBeGreaterThanOrEqual(44);
      expect(btn.height, "action button height").toBeGreaterThanOrEqual(44);
      // NOT MERELY 44px TALL — ENTIRELY INSIDE THE VISIBLE VIEWPORT. `getBoundingClientRect`
      // reports the LAYOUT box regardless of an ancestor's `overflow: hidden`, so a button
      // sized correctly but pushed past the host's bottom edge would still pass the two
      // checks above while its own label renders invisible — caught only by reading the
      // frame (`victory-pass3-832x328.png`, the CONTINUE button's red face visible with no
      // text on it). MUTATION this catches: widening the plaque's top clearance (`margin-top`
      // on `.tuh-result`) without shrinking anything else pushes the footer below `vp.size.
      // height` and this goes red.
      expect(btn.y, "action button top").toBeGreaterThanOrEqual(0);
      expect(btn.y + btn.height, "action button bottom").toBeLessThanOrEqual(vp.size.height);

      // ONE GLYPH, FROM ONE SOURCE — see the DEFEAT card's own comment above.
      const label = (await page.getByTestId("result-action").innerText()).trim();
      expect(label).toBe("CONTINUE ▸");

      // CONTRAST — sampled off the REAL rendered `color`, checked against the exact
      // declared grounds `e2e/contrast-helpers.ts` already pins (never a re-typed
      // guess), matching the mock's own measured pairs.
      const verdictColor = await page
        .getByTestId("result-verdict")
        .evaluate((el) => getComputedStyle(el).color);
      expect(contrastRatio(verdictColor, GROUNDS.plaque[1])).toBeCloseTo(14.95, 1);

      const inkColor = await page.getByTestId("result-where").evaluate((el) => getComputedStyle(el).color);
      expect(contrastRatio(inkColor, GROUNDS.leaf[1])).toBeCloseTo(7.7, 1); // ink / parch
      expect(contrastRatio(inkColor, GROUNDS.leaf[2])).toBeCloseTo(6.52, 1); // ink / parch-lo

      const apColor = await page
        .locator('[data-testid="result-ap"]')
        .first()
        .evaluate((el) => getComputedStyle(el).color);
      // The AP chip sits on the SAME plaque family as the verdict.
      expect(contrastRatio(apColor, GROUNDS.plaque[1])).toBeGreaterThanOrEqual(4.5);

      const dropInk = await page
        .locator('[data-testid="result-weapon-grant"] .ritem')
        .evaluate((el) => getComputedStyle(el).color);
      expect(contrastRatio(dropInk, GROUNDS.briefPlate[0])).toBeCloseTo(5.78, 1); // ink / plate-parch

      // THE ACTION BUTTON — never checked before this finding (reviewer finding 4
      // names it explicitly among "AP pill, reward strip, defeat body lines, button").
      const actionColor = await page
        .getByTestId("result-action")
        .evaluate((el) => getComputedStyle(el).color);
      expect(
        worstRatio(actionColor, GROUNDS.resultSeal),
        "CONTINUE label vs the button's own worst seal stop",
      ).toBeGreaterThanOrEqual(4.5);

      await page.screenshot({ path: `${SHOTS}/victory-pass4-${vp.name}.png` });
    });

    test(`defeat overlay: no clipping/overlap, 44px target, pinned contrast, no text on the forbidden outer stop`, async ({
      page,
    }) => {
      await page.setViewportSize(vp.size);
      await mkdir(SHOTS, { recursive: true });
      await toDefeat(page);
      await settleMotion(page);
      await resultGroundsAreReal(page, "DEFEAT");

      const scroll = await page.evaluate(() => ({
        h: document.documentElement.scrollHeight,
        ch: document.documentElement.clientHeight,
      }));
      expect(scroll.h).toBeLessThanOrEqual(scroll.ch + 1);

      const btn = (await page.getByTestId("result-action").boundingBox())!;
      expect(btn.width, "RETRY button width").toBeGreaterThanOrEqual(44);
      expect(btn.height, "RETRY button height").toBeGreaterThanOrEqual(44);
      expect(btn.y, "RETRY button top").toBeGreaterThanOrEqual(0);
      expect(btn.y + btn.height, "RETRY button bottom").toBeLessThanOrEqual(vp.size.height);

      const label = (await page.getByTestId("result-action").innerText()).trim();
      expect(label).toBe("RETRY ▸");

      expect(await minResultFontPx(page), "smallest rendered font-size in the sheet").toBeGreaterThanOrEqual(11);

      const stageBox = (await page.getByTestId("stage").boundingBox())!;
      const layerBox = (await page.getByTestId("result-layer").boundingBox())!;
      for (const axis of ["x", "y", "width", "height"] as const) {
        expect(layerBox[axis], `result-layer.${axis} vs stage.${axis}`).toBeCloseTo(stageBox[axis], 0);
      }
      const sheetBox = (await page.getByTestId("result-overlay").boundingBox())!;
      expect(sheetBox.width, "sheet width").toBeGreaterThanOrEqual(0.8 * vp.size.width);

      // EVERY DEFEAT-LEAF TEXT ELEMENT, against its OWN REAL SAMPLED GROUND
      // (`sampledDefeatLeafColor`, the gradient's actual colour at that element's
      // measured position — not the worst DECLARED stop across the whole box, which
      // is a different, harsher claim than "no text sits on the forbidden stop":
      // `#a87a50` exists somewhere in `.rleaf`, just not under most centred text, so
      // a worst-of-all-stops check fails even a line that never gets near it. Nor
      // the VICTORY leaf's `GROUNDS.leaf[3]` proxy the pass-3 build used, a
      // different, lighter colour than what a defeat card actually paints.
      for (const testid of ["result-message", "result-reward-summary", "result-retention"] as const) {
        const ink = await page.getByTestId(testid).evaluate((el) => getComputedStyle(el).color);
        const ground = await sampledDefeatLeafColor(page, testid);
        const ratio = contrastRatio(ink, ground);
        expect(
          ratio,
          `${testid} vs its real sampled ground (${ground}) — ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }

      const verdictColor = await page
        .getByTestId("result-verdict")
        .evaluate((el) => getComputedStyle(el).color);
      expect(worstRatio(verdictColor, GROUNDS.plaque), "DEFEAT plaque").toBeGreaterThanOrEqual(4.5);

      const actionColor = await page
        .getByTestId("result-action")
        .evaluate((el) => getComputedStyle(el).color);
      expect(
        worstRatio(actionColor, GROUNDS.resultSeal),
        "RETRY label vs the button's own worst seal stop",
      ).toBeGreaterThanOrEqual(4.5);

      await page.screenshot({ path: `${SHOTS}/defeat-pass4-${vp.name}.png` });
    });
  });
}
