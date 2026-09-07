import { test, expect, type Page } from "@playwright/test";
import { dismissScene, openPrepTab, openViewerPrep, startNewGame } from "./helpers.js";
// `with { type: "json" }` is required here: this file goes through Node's ESM loader,
// not Vite's, and a bare JSON import breaks only the browser job (campaign.spec.ts's
// own file-banner comment).
import storyPack from "../data/campaign/story/camp-the-first-march.story.json" with { type: "json" };

/**
 * The briefing screen in the overhaul look (owner decision 2026-09-07, option A): one
 * two-pane screen, portrait cards on the left leaf, a three-tab detail leaf (Equipment /
 * Skills / Profile) on the right, briefing chrome on a top rail, a wax Deploy plate
 * breaking the right leaf's bottom-right corner. Third screen ported after the title
 * (ADR-0040) and the scene player (ADR-0040 amendment).
 *
 * `src/render/prep.ts` builds the right leaf into `#prep-body`; `src/render/game.ts`
 * builds the left leaf's roster cards (`brief-party`, shared between the deploy roster
 * and the prep member picker — one list, not two). `src/render/overhaul.css` is scoped
 * under `#screen-briefing`.
 */

/** Every party member id the shipped campaign's battle 1 fields, in roster order. */
const PARTY = ["pc-vance", "pc-kest", "pc-briar", "pc-ottoline"] as const;

async function toBriefing(page: Page): Promise<void> {
  await page.goto("/");
  await startNewGame(page);
  await dismissScene(page);
  await expect(page.getByTestId("screen-briefing")).toBeVisible();
}

/** Play the current battle to its end via the balance probe (both seats), deterministic. */
async function playCurrentBattle(page: Page): Promise<void> {
  await page.getByTestId("deploy").click();
  await expect(page.getByTestId("screen-battle")).toBeVisible();
  await page.evaluate(() => window.tuhGame.autoplay());
  await page.getByTestId("conclude").click();
}

test.describe("briefing: portrait identity", () => {
  // MUTATION: swap `pc-briar`'s `PORTRAIT_BY_UNIT` entry for `"knight-m"` in
  // src/render/campaign-data.ts → both assertions below go red (the card and the head
  // portrait both resolve to the knight crop instead of archer-f).
  test("Briar's card and head portrait resolve to the bundled archer-f asset; Vance's to the placeholder", async ({
    page,
  }) => {
    await toBriefing(page);

    const briarCard = page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-briar"] img');
    await expect(briarCard).toHaveAttribute("src", /archer-f/);

    // Open Briar so the right leaf's hero portrait resolves the SAME id.
    await briarCard.click();
    const hero = page.locator(".hero img");
    await expect(hero).toHaveAttribute("src", /archer-f/);

    // Vance's job (geomancer) has no approved portrait — the honest answer is the
    // bundled placeholder, not a substituted face (ADR-0039). Vite inlines the small
    // placeholder SVG as a `data:` URI rather than emitting a `placeholder.svg` file,
    // so identity is asserted on the SVG's own content (its `aria-label`, unique to
    // the placeholder) plus the `.pending` class prep.ts/game.ts mark it with —
    // neither a real portrait crop carries either.
    const vanceCard = page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-vance"] img');
    await expect(vanceCard).toHaveClass(/pending/);
    await expect(vanceCard).toHaveAttribute("src", /Portrait%20pending/);
    // m14b: `.ptab .face img` is `object-fit: cover` (a real crop fills the frame);
    // the placeholder SVG needs `contain` or it is cropped illegibly.
    await expect(vanceCard).toHaveCSS("object-fit", "contain");
    // MUTATION (run, see the fix report): drop `#screen-briefing .ptab .face
    // img.pending` from `overhaul.css` — this reads "cover", red.
  });
});

test.describe("briefing: tabs", () => {
  test("Equipment is selected on entry; Skills reveals prep-reaction; Profile reveals prep-traits; aria-selected follows", async ({
    page,
  }) => {
    await toBriefing(page);

    const equipmentTab = page.locator('.tab[data-tab="equipment"]');
    const skillsTab = page.locator('.tab[data-tab="skills"]');
    const profileTab = page.locator('.tab[data-tab="profile"]');

    await expect(equipmentTab).toHaveAttribute("aria-selected", "true");
    await expect(skillsTab).toHaveAttribute("aria-selected", "false");
    await expect(profileTab).toHaveAttribute("aria-selected", "false");
    await expect(page.getByTestId("prep-stats")).toBeVisible();
    await expect(page.getByTestId("prep-reaction")).toBeHidden();
    await expect(page.getByTestId("prep-traits")).toBeHidden();

    await skillsTab.click();
    await expect(skillsTab).toHaveAttribute("aria-selected", "true");
    await expect(equipmentTab).toHaveAttribute("aria-selected", "false");
    await expect(page.getByTestId("prep-reaction")).toBeVisible();
    await expect(page.getByTestId("prep-stats")).toBeHidden();
    await expect(page.getByTestId("prep-traits")).toBeHidden();

    // m13: the Primary row's command list used to be a bare, unlabelled `<p>` —
    // give it the same leading caption every other row on this screen carries.
    const commandsHint = page
      .getByTestId("prep-primary")
      .locator("xpath=following-sibling::p[contains(concat(' ', normalize-space(@class), ' '), ' hint ')][1]");
    await expect(commandsHint).toContainText(/^Commands/);
    // MUTATION: drop the `<span class="gcap">Commands</span>` from `prep.ts`'s
    // Primary-row hint → this assertion reads the bare action list and goes red.

    await profileTab.click();
    await expect(profileTab).toHaveAttribute("aria-selected", "true");
    await expect(skillsTab).toHaveAttribute("aria-selected", "false");
    await expect(page.getByTestId("prep-traits")).toBeVisible();
    await expect(page.getByTestId("prep-reaction")).toBeHidden();
    await expect(page.getByTestId("prep-stats")).toBeHidden();
    // MUTATION: no-op the tab click handler in `prep.ts`'s `bind()` (drop the
    // `container.querySelectorAll("button[data-tab]")` loop) → every assertion above
    // that follows a `.click()` goes red; the ones before the first click stay green,
    // which is what tells the two apart.
  });
});

test.describe("briefing: tab persistence", () => {
  test("switching roster member keeps Skills selected; buying an ability shows the receipt without a tab click", async ({
    page,
  }) => {
    // Nobody has banked AP before battle 1 is fought (0 AP campaign-wide — matches
    // `campaign.spec.ts`'s own "between-battle prep: an unaffordable ability is
    // refused" fixture), and one battle's earnings still is not enough for even the
    // cheapest tier-one node (that spec's own comment: "two battles of banked AP —
    // enough for one 60-AP node and not much else"). Play two, the same way, so the
    // purchase path below exercises a REAL purchase rather than finding nothing.
    await toBriefing(page);
    for (let i = 0; i < 2; i++) {
      await playCurrentBattle(page);
      await expect(page.getByTestId("screen-after")).toBeVisible();
      await page.getByTestId("next").click();
      await dismissScene(page);
    }
    await expect(page.getByTestId("screen-briefing")).toBeVisible();

    await openPrepTab(page, "skills");
    await expect(page.locator('.tab[data-tab="skills"]')).toHaveAttribute("aria-selected", "true");

    // Path one: selecting a different member repaints the whole briefing (the roster
    // click goes through `prep.select()` then `renderBriefingText()`), which must NOT
    // reset the render-layer tab state.
    await page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-kest"]').click();
    await expect(page.locator('.tab[data-tab="skills"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("prep-reaction")).toBeVisible();

    // Path two: a purchase (`act()` -> `render()`), a SEPARATE re-render path from the
    // roster click above. The receipt is Skills-only content, so it can only be visible
    // if the tab survived the purchase's own repaint too. Discover whichever member
    // actually banked enough AP rather than assuming which one did.
    for (const id of PARTY) {
      const card = page.locator(`[data-testid="prep-roster"] .ptab[data-member="${id}"]`);
      if ((await card.count()) === 0) continue;
      await card.click();
      const buyable = page.locator('[data-testid="prep-learn"] li button[data-learn]:not([disabled])');
      if ((await buyable.count()) > 0) break;
    }
    const buy = page.locator('[data-testid="prep-learn"] li button[data-learn]:not([disabled])').first();
    expect(await buy.count(), "no party member has an affordable node at battle 1 — nothing to buy").toBeGreaterThan(0);
    await buy.click();
    await expect(page.locator('.tab[data-tab="skills"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("prep-receipt")).toBeVisible();
    // MUTATION: add `tab = "equipment";` at the top of `render()` in `prep.ts` →
    // both `aria-selected` assertions above go red (the roster-click path fires
    // `render()` via `select()`, the purchase path via `act()`, so a reset placed in
    // the shared `render()` catches both — a reset placed only in one caller would
    // pass the other, which is why this test drives two different call paths rather
    // than clicking the tab once and checking it twice).
  });
});

test.describe("briefing: control manifest", () => {
  /**
   * Every `prep-*` testid this screen's code can emit, tagged with which tab shows it
   * ("always" = the unit-head/Job Customization strip, visible regardless of tab) and
   * whether the DOM node itself may be OMITTED (not merely hidden) in some states —
   * the absent-not-zero rule (a weapon row before any weapon is owned, a receipt
   * before any purchase). Built from `grep -oE 'data-testid="prep-[a-z-]*"'` across
   * `prep.ts`/`game.ts`/`index.html`, not copied from prose — the exact 21 that exist.
   */
  const MANIFEST: Record<string, { tab: "always" | "equipment" | "skills" | "profile"; optional?: true }> = {
    "prep-roster": { tab: "always" },
    "prep-ap": { tab: "always" },
    "prep-job": { tab: "always" },
    "prep-secondary": { tab: "always" },
    "prep-weapon": { tab: "equipment", optional: true },
    "prep-weapon-desc": { tab: "equipment", optional: true },
    "prep-weapon-hint": { tab: "equipment", optional: true },
    "prep-stats": { tab: "equipment" },
    "prep-primary": { tab: "skills" },
    "prep-reaction": { tab: "skills" },
    "prep-support": { tab: "skills" },
    "prep-movement": { tab: "skills" },
    "prep-commands": { tab: "skills" },
    "prep-command-count": { tab: "skills" },
    "prep-progression": { tab: "skills" },
    "prep-tree": { tab: "skills" },
    "prep-learn": { tab: "skills" },
    "prep-spend-hint": { tab: "skills" },
    "prep-receipt": { tab: "skills", optional: true },
    "prep-traits": { tab: "profile" },
    "prep-traits-hint": { tab: "profile", optional: true },
  };

  test("every manifest control is attached on its tab, or legitimately absent; nothing stray ships", async ({
    page,
  }) => {
    await toBriefing(page);
    // M3: `if (spec.optional && count === 0) continue` alone can never tell "this
    // optional row is absent in THIS state, correctly" from "this row can never be
    // produced and nothing here would notice" — five rows (prep-receipt, prep-weapon,
    // prep-weapon-desc, prep-weapon-hint, prep-traits-hint) were skipped every run.
    // `seenOptional` collects every optional testid that was actually PRESENT at least
    // once, and the test fails unless it equals the full optional set — so a row that
    // stops being reachable (a content or code change) goes red here instead of
    // silently reading as "legitimately absent" forever.
    const seenOptional = new Set<string>();

    const checkTabs = async (): Promise<void> => {
      for (const tab of ["equipment", "skills", "profile"] as const) {
        await openPrepTab(page, tab);
        for (const [testid, spec] of Object.entries(MANIFEST)) {
          const el = page.locator(`[data-testid="${testid}"]`);
          const count = await el.count();
          if (spec.tab === "always" || spec.tab === tab) {
            if (spec.optional) {
              if (count === 0) continue; // absent-not-zero in THIS state, not a failure
              seenOptional.add(testid);
            }
            expect(count, `${testid} must be attached on the ${tab} tab`).toBeGreaterThan(0);
            await expect(el.first(), `${testid} must be VISIBLE on the ${tab} tab`).toBeVisible();
          } else if (count > 0) {
            await expect(el.first(), `${testid} must be hidden while ${tab} is open`).toBeHidden();
          }
        }
      }
    };

    // Pass 1: every party member, as-shipped battle-1 state. `startCampaign` grants
    // battle 1's weapons (`wpn-arming-sword`, `wpn-cestus`) into the save's inventory
    // BEFORE the first briefing (src/sim/campaign.ts's own comment: "the first battle —
    // the one a new player meets — as the single fight with no gear in it" is exactly
    // what that grant-at-start avoids), and every starting record's `weapon` field is
    // `null` — so prep-weapon and prep-weapon-hint ("owns N, none equipped") are both
    // reachable with no state change at all. Every party member also starts with a
    // mastered job and an EMPTY `loadout.traits` (`data/campaign/camp-the-first-
    // march.json`), which is exactly `prep-traits-hint`'s condition — so that one is
    // reachable here too, on the Profile tab.
    for (const id of PARTY) {
      const card = page.locator(`[data-testid="prep-roster"] .ptab[data-member="${id}"]`);
      if ((await card.count()) === 0) continue;
      await card.click();
      await checkTabs();
    }

    // Drive prep-weapon-desc: it needs the OPPOSITE state from prep-weapon-hint (a
    // weapon actually equipped), so equip the first owned weapon on whichever member
    // is currently open.
    await openPrepTab(page, "equipment");
    const weaponSelect = page.getByTestId("prep-weapon");
    expect(await weaponSelect.count(), "no member has an owned, equippable weapon at battle 1").toBeGreaterThan(0);
    await weaponSelect.selectOption({ index: 1 });
    await checkTabs();

    // Drive prep-receipt: reuse the tab-persistence fixture (0 AP campaign-wide until
    // two battles are banked) — play two, then buy whichever party member's cheapest
    // affordable node.
    for (let i = 0; i < 2; i++) {
      await playCurrentBattle(page);
      await expect(page.getByTestId("screen-after")).toBeVisible();
      await page.getByTestId("next").click();
      await dismissScene(page);
    }
    await expect(page.getByTestId("screen-briefing")).toBeVisible();
    let bought = false;
    for (const id of PARTY) {
      const card = page.locator(`[data-testid="prep-roster"] .ptab[data-member="${id}"]`);
      if ((await card.count()) === 0) continue;
      await card.click();
      await openPrepTab(page, "skills");
      const buyable = page.locator('[data-testid="prep-learn"] li button[data-learn]:not([disabled])').first();
      if ((await buyable.count()) === 0) continue;
      await buyable.click();
      bought = true;
      break;
    }
    expect(bought, "no party member has an affordable node after two battles — nothing to buy").toBe(true);
    await checkTabs();

    const expectedOptional = new Set(
      Object.entries(MANIFEST)
        .filter(([, spec]) => spec.optional === true)
        .map(([testid]) => testid),
    );
    expect([...seenOptional].sort(), "every optional row must be driven to PRESENT at least once").toEqual(
      [...expectedOptional].sort(),
    );

    // THE EXACT PARTITION: every `prep-*` testid actually in the DOM must be a key of
    // MANIFEST — a stray id (a leftover, a typo, an un-catalogued new control) fails
    // here even though every per-control loop above stayed green.
    const found = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="prep-"]')].map((e) => (e as HTMLElement).dataset["testid"]),
    );
    const stray = [...new Set(found)].filter((id) => id !== undefined && !(id in MANIFEST));
    expect(stray, `stray prep-* testid(s) not in MANIFEST: ${stray.join(", ")}`).toEqual([]);
    // MUTATION 1: delete `prep-support`'s testid attribute in `prep.ts` → the Skills-tab
    // loop's `toBeGreaterThan(0)` for `prep-support` goes red.
    // MUTATION 2: add `data-testid="prep-extra"` to any element in `prep.ts` → the
    // stray-partition assertion goes red, even though nothing else in this test does.
    // MUTATION 3 (M3, run — see the fix report): delete the `data-testid="prep-weapon-
    // hint"` attribute in `weaponSlotHtml()` (prep.ts) → `seenOptional` never gains
    // "prep-weapon-hint", and the `expectedOptional` equality assertion goes red, even
    // though every other assertion in this test stays green.
  });
});

test.describe("briefing: drift from the mockup, at 851x324", () => {
  // Measured against `docs/visual/concepts/mockups/prep-851x324.png` by rendering the
  // APPROVED MOCKUP's own HTML (`coverage/overhaul/prep.html`, the file the PNG was
  // captured from) at the same viewport and reading real element boxes — more precise
  // than a pixel colour scan, and still the mockup's own numbers, not eyeballed.
  test("tab-row top, leaf's right edge, Deploy plate's bottom-right, and the first card's box are within 12px of the mockup", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 851, height: 324 });
    await toBriefing(page);
    // CHECKED, NOT ASSUMED: every one of the five shipped battles authors a
    // pre-battle beat (the story pack's own `pre` field, read directly rather than
    // trusting a stale doc claim — see the comment this replaced). The mockup's own
    // `brief-story` ships permanently `hidden` (README §(f)), so there is no briefing
    // state in this build that matches the mockup's story-free assumption; the first
    // card's Y position is therefore NOT held to the mockup's number below (a real,
    // permanent content difference, not a layout bug) — only its X position and width
    // are, since the story's height cannot move the roster sideways.
    expect(storyPack.entries.every((e) => e.pre !== undefined)).toBe(true);
    await expect(page.getByTestId("brief-story")).toBeVisible();

    // Scoped to #screen-briefing: the title screen's OWN `.leaf-right` sits in the DOM
    // too (every screen's markup coexists, only `hidden` toggles), so a bare `.leaf-
    // right` is a strict-mode violation, not a wrong answer.
    const tabsBox = await page.locator("#screen-briefing .tabs").boundingBox();
    const leafRightBox = await page.locator("#screen-briefing .leaf-right").boundingBox();
    const sealBox = await page.getByTestId("deploy").boundingBox();
    const firstCardBox = await page
      .locator('[data-testid="prep-roster"] .ptab')
      .first()
      .boundingBox();
    expect(tabsBox, "tabs has no box").not.toBeNull();
    expect(leafRightBox, "leaf-right has no box").not.toBeNull();
    expect(sealBox, "deploy seal has no box").not.toBeNull();
    expect(firstCardBox, "first roster card has no box").not.toBeNull();

    const near = (label: string, actual: number, wanted: number): void => {
      expect(Math.abs(actual - wanted), `${label}: ${actual} is not within 12px of the mockup's ${wanted}`).toBeLessThanOrEqual(12);
    };
    near("tab-row top", tabsBox!.y, 111);
    near("leaf's right edge", leafRightBox!.x + leafRightBox!.width, 841);
    near("Deploy plate's right edge", sealBox!.x + sealBox!.width, 847);
    near("Deploy plate's bottom edge", sealBox!.y + sealBox!.height, 320);
    // X only — see the comment above for why Y is not held to the mockup's number.
    near("first card's left edge", firstCardBox!.x, 21);
    near("first card's width", firstCardBox!.width, 165);
    // MUTATION: change `.leaf` padding (`--burn`/`--burn-spread` in overhaul.css) by
    // 20px worth — the leaf's right edge and the first card's left edge both shift by
    // more than 12px, and at least one `near()` call goes red.
  });
});

test.describe("briefing: the leak check", () => {
  test("a disabled buy plaque keeps opacity 1 and the iron gradient; the eyebrow keeps its mixed case", async ({
    page,
  }) => {
    await toBriefing(page);
    // Battle 1: at least one party member has 0 AP, so the FIRST buy button their
    // learn list offers is genuinely disabled (a real state, not staged).
    for (const id of PARTY) {
      const card = page.locator(`[data-testid="prep-roster"] .ptab[data-member="${id}"]`);
      if ((await card.count()) === 0) continue;
      await card.click();
      await openPrepTab(page, "skills");
      const disabledBuy = page.locator('[data-testid="prep-learn"] button.buy[disabled]').first();
      if ((await disabledBuy.count()) === 0) continue;

      const style = await disabledBuy.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { opacity: cs.opacity, backgroundImage: cs.backgroundImage };
      });
      // THE LEAK this subtree's CLAUDE.md names by name: index.html's page-wide
      // `button[disabled] { opacity: .4 }` would wash this plaque to a translucent
      // slab. TWO scoped rules independently name `opacity: 1` here (`.buy:disabled`
      // AND the generic `#screen-briefing button:disabled` reset) — belt-and-
      // suspenders, matching `#screen-title`'s own FIX 6 precedent — so removing
      // EITHER ALONE (verified) still passes; only removing BOTH (also verified)
      // reproduces the leak this assertion exists to catch.
      expect(style.opacity, "disabled buy plaque must stay fully opaque").toBe("1");
      // The iron plaque gradient (`--plaque` family), not `none` and not the parchment.
      expect(style.backgroundImage, "disabled buy plaque must keep the iron gradient").toContain(
        "linear-gradient",
      );
      expect(style.backgroundImage).not.toBe("none");

      const eyebrowTransform = await page
        .getByTestId("brief-step")
        .evaluate((el) => getComputedStyle(el).textTransform);
      // THE OTHER LEAK: index.html's page-wide `.eyebrow { text-transform: uppercase }`
      // (the other four screens' small caption). "Battle 1 of 5" is mixed case here.
      expect(eyebrowTransform, "brief-step must not be uppercased").toBe("none");
      const eyebrowText = await page.getByTestId("brief-step").innerText();
      expect(eyebrowText).toBe("Battle 1 of 5");
      return;
    }
    throw new Error("no party member offered a disabled buy button at battle 1 — nothing to assert");
    // MUTATION (run, see the comment above): delete `opacity: 1;` from BOTH
    // `#screen-briefing .buy:disabled` and `#screen-briefing button:disabled` →
    // opacity reads "0.4", red. MUTATION (run): delete `text-transform: none;` from
    // `#screen-briefing .eyebrow` (overhaul.css) → the transform assertion reads
    // "uppercase" and the text assertion reads "BATTLE 1 OF 5", both red.
  });

  test("prep-stats stays an unboxed field, pinned rather than left to coincidence", async ({ page }) => {
    await toBriefing(page);
    // index.html's page-wide `.stats` (the OLD engine-viewer panel) has no scoped
    // competitor here — the leak-probe pass (viewer-engineer, see overhaul.css's own
    // comment on this rule) verified the leaked value already matches this screen's
    // intent (no box; `.stat-row li` carries the visuals) and pinned it explicitly
    // rather than leaving it to that coincidence.
    const style = await page.getByTestId("prep-stats").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage, padding: cs.padding };
    });
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.backgroundImage).toBe("none");
    expect(style.padding).toBe("0px");
    // MUTATION (run, see the fix report): change `#screen-briefing .stats`'s
    // `padding: 0` to `padding: 1em` (overhaul.css) — the scoped rule still wins (it
    // is the higher-specificity one), so the padding assertion above reads a nonzero
    // px value, red. Proves the scoped declaration is what the computed value
    // actually traces to, not a coincidence with the page-wide default.
  });
});

test.describe("briefing: states", () => {
  test("the weapon row is absent before any weapon is owned", async ({ page }) => {
    await toBriefing(page);
    // Battle 1's very first briefing, before ANY weapon has been granted or equipped:
    // find a member with zero owned weapons (the drip may have already reached the
    // party by battle 1 for some jobs, so this discovers rather than assumes).
    for (const id of PARTY) {
      const card = page.locator(`[data-testid="prep-roster"] .ptab[data-member="${id}"]`);
      if ((await card.count()) === 0) continue;
      await card.click();
      const weaponHint = page.getByTestId("prep-weapon-hint");
      const weaponSelect = page.getByTestId("prep-weapon");
      if ((await weaponSelect.count()) === 0) {
        // Absent entirely (own nothing) — the row itself must not render either.
        await expect(page.getByTestId("prep-weapon-desc")).toHaveCount(0);
        await expect(weaponHint).toHaveCount(0);
        return;
      }
    }
    // Not discoverable in the shipped campaign — every battle-1 party member already
    // owns two weapons (the drip grants them before the first briefing). Discover it
    // through the purpose-built seam instead: `?prep=empty` on the engine viewer
    // (wired in `main.ts`) mounts `makeEmptyDemoRecord()` (prep.ts) — a record with
    // no `inventory` and `weapon: null` — but the PREP screen itself still sits
    // behind the ☰ menu (ADR-0037, `openViewerPrep`), same as every other viewer test.
    await page.goto("/viewer.html?prep=empty");
    await openViewerPrep(page);
    await expect(page.locator('.tab[data-tab="equipment"]')).toBeVisible();
    await expect(page.getByTestId("prep-weapon")).toHaveCount(0);
    await expect(page.getByTestId("prep-weapon-desc")).toHaveCount(0);
    await expect(page.getByTestId("prep-weapon-hint")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("You own");
    // MUTATION (run, see the fix report): in `weaponSlotHtml()` (prep.ts), delete the
    // `if (owned.length === 0) return "";` early return — `prep-weapon` and "You own"
    // both render for `makeEmptyDemoRecord()` too, and the assertions above go red.
  });

  test("an empty traits state names itself for a unit with no mastered job", async ({ page }) => {
    await toBriefing(page);
    for (const id of PARTY) {
      const card = page.locator(`[data-testid="prep-roster"] .ptab[data-member="${id}"]`);
      if ((await card.count()) === 0) continue;
      await card.click();
      await openPrepTab(page, "profile");
      const traits = page.getByTestId("prep-traits");
      const empty = traits.locator(".empty");
      if ((await empty.count()) > 0) {
        await expect(empty).toContainText("No mastered jobs yet");
        return;
      }
    }
    // DISCOVERED, not assumed: every starting party member ships with a mastered job
    // already on their record (`data/campaign/camp-the-first-march.json`), so the
    // empty state genuinely has no in-play fixture at battle 1 — the same shape as
    // the weapon-row test above. Discover it the same way: `/viewer.html?prep=empty`
    // mounts `makeEmptyDemoRecord()` (prep.ts), whose `mastered` is `[]`.
    await page.goto("/viewer.html?prep=empty");
    await openViewerPrep(page);
    await openPrepTab(page, "profile");
    const empty = page.locator('[data-testid="prep-traits"] .empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("No mastered jobs yet");
    // MUTATION (run, see the fix report): pass `mastered: ["knight"]` in
    // `makeEmptyDemoRecord()` (prep.ts) — `.empty` no longer renders and the
    // `toBeVisible()` assertion above goes red.
  });

  // A single-member party's roster (and with it `brief-deploy-note`) is hidden entirely
  // (prep.ts's own "< 2 members ⇒ nothing to choose" rule, mirrored in `game.ts`'s
  // `showRoster` check) — but nothing in ordinary play ever SHRINKS this campaign's
  // four-member roster to one; there is no permadeath and no bench-to-zero state.
  // Injecting a hand-built one-member `CampaignSave` would be asserting a state the
  // shipped game can never actually reach (the mirror image of "check a named fixture
  // is realizable" — CLAUDE.md), so this is a DOCUMENTED skip, not a silent gap: the
  // rule itself is asserted at the model layer by `mountPrepDemo`'s own single-record
  // mount (`src/render/prep.ts`), which never draws a roster at all.
  test.skip(
    "one-member party: roster hidden — no in-play fixture reaches this state; see prep.ts's mountPrepDemo for the model-layer half",
    () => {},
  );
});

test.describe("briefing: phone fit", () => {
  for (const [w, h] of [
    [640, 300],
    [851, 324],
  ] as const) {
    test(`${w}x${h}: no horizontal scroll; Deploy/Quit/tabs/roster cards clear 44px; the Deploy plate stays inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `${w}x${h}: page scrolls horizontally`).toBeLessThanOrEqual(clientWidth + 1);

      const floor = 44;
      // M5: `prep-job`/`prep-secondary` (always visible) and `prep-weapon` (the
      // default Equipment tab) are checked here; `prep-reaction`/`prep-support`/
      // `prep-movement` live on Skills and are checked further below, after
      // switching tabs — a `getByTestId` on a hidden element resolves to a box with
      // zero size, which would silently pass a `>= 0` floor, so each is only
      // measured on the tab where the manifest says it is visible.
      const targets: Record<string, ReturnType<Page["getByTestId"]>> = {
        deploy: page.getByTestId("deploy"),
        "brief-quit": page.getByTestId("brief-quit"),
      };
      for (const [name, locator] of Object.entries(targets)) {
        const box = await locator.boundingBox();
        expect(box, `${w}x${h}: ${name} has no box`).not.toBeNull();
        expect(box!.width, `${w}x${h}: ${name} width`).toBeGreaterThanOrEqual(floor);
        expect(box!.height, `${w}x${h}: ${name} height`).toBeGreaterThanOrEqual(floor);
      }
      // M5's brief names the ≥44px floor for HEIGHT ("tall") — these are wide, full-
      // row selects, not square buttons, so only height is asserted, the same shape
      // as the reaction/support/movement checks below.
      for (const testid of ["prep-job", "prep-secondary"]) {
        const box = await page.getByTestId(testid).boundingBox();
        expect(box, `${w}x${h}: ${testid} has no box`).not.toBeNull();
        expect(box!.height, `${w}x${h}: ${testid} height`).toBeGreaterThanOrEqual(floor);
      }
      // `prep-weapon` is absent-not-zero (owned-weapon state) — check its size only
      // when it is actually attached, same guard the manifest test uses.
      const weaponSelect = page.getByTestId("prep-weapon");
      if ((await weaponSelect.count()) > 0) {
        const box = await weaponSelect.boundingBox();
        expect(box, `${w}x${h}: prep-weapon has no box`).not.toBeNull();
        expect(box!.height, `${w}x${h}: prep-weapon height`).toBeGreaterThanOrEqual(floor);
      }
      await openPrepTab(page, "skills");
      for (const testid of ["prep-reaction", "prep-support", "prep-movement"]) {
        const box = await page.getByTestId(testid).boundingBox();
        expect(box, `${w}x${h}: ${testid} has no box`).not.toBeNull();
        expect(box!.height, `${w}x${h}: ${testid} height`).toBeGreaterThanOrEqual(floor);
      }
      await openPrepTab(page, "equipment");
      for (const tab of ["equipment", "skills", "profile"]) {
        const box = await page.locator(`.tab[data-tab="${tab}"]`).boundingBox();
        expect(box, `${w}x${h}: ${tab} tab has no box`).not.toBeNull();
        expect(box!.height, `${w}x${h}: ${tab} tab height`).toBeGreaterThanOrEqual(floor);
      }
      const cards = await page.locator('[data-testid="prep-roster"] .ptab').all();
      expect(cards.length, `${w}x${h}: no roster cards found`).toBeGreaterThan(0);
      for (const card of cards) {
        const box = await card.boundingBox();
        expect(box, `${w}x${h}: a roster card has no box`).not.toBeNull();
        // Cards are wide, dense grid tiles — the 44px floor applies to their SHORT
        // axis; both are asserted since a card can be taller-than-wide at 2 columns.
        expect(Math.min(box!.width, box!.height), `${w}x${h}: roster card short side`).toBeGreaterThanOrEqual(
          floor,
        );
      }

      const sealBox = await page.getByTestId("deploy").boundingBox();
      expect(sealBox!.x, `${w}x${h}: Deploy plate left edge off-screen`).toBeGreaterThanOrEqual(0);
      expect(sealBox!.y, `${w}x${h}: Deploy plate top edge off-screen`).toBeGreaterThanOrEqual(0);
      expect(sealBox!.x + sealBox!.width, `${w}x${h}: Deploy plate right edge off-screen`).toBeLessThanOrEqual(w + 1);
      expect(sealBox!.y + sealBox!.height, `${w}x${h}: Deploy plate bottom edge off-screen`).toBeLessThanOrEqual(
        h + 1,
      );
      // MUTATION: shrink `.tab`'s `min-height` (overhaul.css) from 44px to 30px →
      // the per-tab height assertion above goes red at both folds.
    });
  }
});

/**
 * Four defects visible in the delivered captures (`docs/visual/overhaul/prep-*.png`
 * against `docs/visual/concepts/mockups/prep-*.png`), fixed together below. Each test
 * names the mutation that turns it red, and each was actually run — see the fix
 * report for the exit codes.
 */

/** A box fully contained by another, both in viewport (page) coordinates. */
function boxInside(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5
  );
}

function boxesIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test.describe("briefing: D1 — the pre-battle story row never clips its own control or the roster", () => {
  for (const [w, h] of [
    [1000, 780],
    [851, 324],
    [640, 300],
  ] as const) {
    test(`${w}x${h}: brief-story's reveal control stays inside the leaf and clear of the roster; the line is not clipped`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);

      const story = page.getByTestId("brief-story");
      await expect(story).toBeVisible();
      const leafBox = await page.locator("#screen-briefing .leaf-left").boundingBox();
      const rosterBox = await page.getByTestId("prep-roster").boundingBox();
      // The "More" control — `id="<host>-more"` in scene.ts, `data-testid` on the same
      // element (`brief-story-more`), not a bare `#brief-story-more` (the button only
      // carries a `dataset.testid`, never a real `id`).
      const more = page.locator('[data-testid="brief-story-more"]');
      expect(leafBox, "leaf-left has no box").not.toBeNull();
      expect(rosterBox, "prep-roster has no box").not.toBeNull();

      if (await more.isHidden()) {
        // The beat is short enough that everything is already revealed — nothing to
        // clip. Fall through to the line-clip check below.
      } else {
        const moreBox = await more.boundingBox();
        expect(moreBox, "brief-story-more has no box").not.toBeNull();
        expect(
          boxInside(moreBox!, leafBox!),
          `${w}x${h}: More control ${JSON.stringify(moreBox)} is not fully inside the leaf ${JSON.stringify(leafBox)}`,
        ).toBe(true);
        expect(
          boxesIntersect(moreBox!, rosterBox!),
          `${w}x${h}: More control ${JSON.stringify(moreBox)} intersects the roster ${JSON.stringify(rosterBox)}`,
        ).toBe(false);
      }

      // The line itself is not clipped: either its box shows everything it holds
      // (scrollHeight <= clientHeight), or the reveal control is offered as the
      // honest "there is more" signal.
      const lineState = await page.evaluate(() => {
        const box = document.querySelector('[data-testid="brief-story"] .scene-lines');
        if (!box) return null;
        return { scrollHeight: box.scrollHeight, clientHeight: box.clientHeight };
      });
      expect(lineState, "brief-story has no .scene-lines box").not.toBeNull();
      const controlOffered = await more.isVisible();
      expect(
        lineState!.scrollHeight <= lineState!.clientHeight + 1 || controlOffered,
        `${w}x${h}: the story line is clipped (scrollHeight ${lineState!.scrollHeight} > clientHeight ${lineState!.clientHeight}) with no reveal control offered`,
      ).toBe(true);
      // MUTATION (run, see the fix report): revert `#screen-briefing
      // #brief-story:not([hidden])` to its pre-fix rule (`flex: 0 1 auto; max-height:
      // 42%; overflow: auto;`, dropping the grid layout and `display: contents`) —
      // at 640×300 the More control's box intersects the roster's box, red.
    });
  }
});

test.describe("briefing: D2 — Equipment and Skills content survives the short folds", () => {
  for (const [w, h] of [
    [851, 324],
    [640, 300],
  ] as const) {
    test(`${w}x${h}: Equipment's gear row and first four Standing rows, Skills' Primary/Reaction/Support rows, are fully inside the leaf`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);
      const leafBox = await page.locator("#screen-briefing .leaf-right").boundingBox();
      expect(leafBox, "leaf-right has no box").not.toBeNull();

      // m14a: `.jcap` used to be `display: none` at this fold, so the Main/Secondary
      // job plaques lost their captions entirely. Both must still be readable text,
      // not merely present-but-invisible.
      // `.jcap`'s own CSS uppercases (`text-transform: uppercase`, matching every
      // other small-caps caption on this screen), and Playwright's rendered-text
      // read reflects that, so the expected strings are the UPPERCASED form.
      const jcaps = await page.locator("#screen-briefing .jobrow .jcap").allInnerTexts();
      expect(jcaps, `${w}x${h}: job plaque captions`).toEqual(["MAIN", "SECONDARY"]);
      // `toBeVisible()` alone cannot see a SECOND way to hide text: `.jcap` shares its
      // flex row with `.pips` (non-shrinking), and a plain `minmax(0, …fr)` track let
      // the default `flex-shrink: 1` crush it to a ~1.4px sliver at 640×300 — still
      // "visible" (size > 0), still unreadable. A real minimum width is the only
      // thing that tells the two apart.
      for (const jcap of await page.locator("#screen-briefing .jobrow .jcap").all()) {
        await expect(jcap, `${w}x${h}: a job plaque caption is hidden`).toBeVisible();
        const box = await jcap.boundingBox();
        expect(box, `${w}x${h}: a job plaque caption has no box`).not.toBeNull();
        expect(box!.width, `${w}x${h}: a job plaque caption is too narrow to read`).toBeGreaterThanOrEqual(12);
      }

      // Equipment (the default tab): the gear row + at least the first four Standing
      // cells.
      const gearRowBox = await page
        .locator('[data-testid="prep-weapon"]')
        .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' gearrow ')][1]")
        .boundingBox();
      expect(gearRowBox, "gear row has no box").not.toBeNull();
      expect(
        boxInside(gearRowBox!, leafBox!),
        `${w}x${h}: gear row ${JSON.stringify(gearRowBox)} is not fully inside the leaf ${JSON.stringify(leafBox)}`,
      ).toBe(true);

      const statCells = await page.locator('[data-testid="prep-stats"] .stat-row li').all();
      expect(statCells.length, "no Standing rows found").toBeGreaterThanOrEqual(4);
      for (let i = 0; i < 4; i += 1) {
        const cellBox = await statCells[i]!.boundingBox();
        expect(cellBox, `Standing row ${i} has no box`).not.toBeNull();
        expect(
          boxInside(cellBox!, leafBox!),
          `${w}x${h}: Standing row ${i} ${JSON.stringify(cellBox)} is not fully inside the leaf ${JSON.stringify(leafBox)}`,
        ).toBe(true);
      }

      // Skills: Primary, and the first two of Reaction/Support/Movement — the brief
      // names Reaction and Support explicitly, so both are asserted by name.
      await openPrepTab(page, "skills");
      const primaryBox = await page.getByTestId("prep-primary").boundingBox();
      expect(primaryBox, "prep-primary has no box").not.toBeNull();
      expect(
        boxInside(primaryBox!, leafBox!),
        `${w}x${h}: prep-primary ${JSON.stringify(primaryBox)} is not fully inside the leaf`,
      ).toBe(true);

      for (const testid of ["prep-reaction", "prep-support"]) {
        const rowBox = await page
          .getByTestId(testid)
          .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' gearrow ')][1]")
          .boundingBox();
        expect(rowBox, `${testid}'s row has no box`).not.toBeNull();
        expect(
          boxInside(rowBox!, leafBox!),
          `${w}x${h}: ${testid}'s row ${JSON.stringify(rowBox)} is not fully inside the leaf`,
        ).toBe(true);
      }
      // MUTATION (run, see the fix report): disable the whole `@media (max-height:
      // 400px)` block (overhaul.css) — e.g. change its threshold to `0px` — so the
      // strip and the Reaction/Support gearrows revert to their tall, two-row/
      // 44px-floored shape; both folds go red (851×324 on Standing, 640×300 on
      // prep-reaction's row).
    });
  }
});

test.describe("briefing: D3 — the tagline ribbon and the help plaque stay clear of each other", () => {
  for (const [w, h] of [
    [1000, 780],
    [851, 324],
    [640, 300],
  ] as const) {
    test(`${w}x${h}: brief-note's text is not clipped, help-open clears the ribbon and reads as an iron plaque`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);

      const noteBox = await page.getByTestId("brief-note").boundingBox();
      const helpBox = await page.getByTestId("help-open").boundingBox();
      expect(noteBox, "brief-note has no box").not.toBeNull();
      expect(helpBox, "help-open has no box").not.toBeNull();
      expect(
        boxesIntersect(noteBox!, helpBox!),
        `${w}x${h}: help-open ${JSON.stringify(helpBox)} intersects the ribbon ${JSON.stringify(noteBox)}`,
      ).toBe(false);

      // The ribbon's own text is not clipped: it fits its two-line clamp (scrollHeight
      // <= clientHeight — no line is cut mid-word the way the delivered frame showed).
      const clip = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="brief-note"]');
        return el ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight } : null;
      });
      expect(clip, "brief-note has no box").not.toBeNull();
      expect(
        clip!.scrollHeight,
        `${w}x${h}: ribbon text clipped (scrollHeight ${clip!.scrollHeight} > clientHeight ${clip!.clientHeight})`,
      ).toBeLessThanOrEqual(clip!.clientHeight + 1);

      // The castle end-cap survives the repaint: `renderBriefingText` used to
      // `.textContent =` the whole `<p>`, destroying `#brief-castle` on every call.
      const castleSrc = await page.locator("#brief-castle").getAttribute("src");
      expect(castleSrc, "brief-castle was destroyed by a repaint").not.toBe("");

      // help-open reads as the iron plaque, not the page-wide pale disc.
      const bg = await page.getByTestId("help-open").evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(bg, "help-open kept the page-wide pale gradient").toContain("linear-gradient");
      expect(bg).not.toContain("240, 230, 203"); // the page-wide `.help-btn`'s pale stop (#f0e6cb)
      // MUTATION: drop the scoped `#screen-briefing:not([hidden]) ~ button.help-btn`
      // override (overhaul.css) — the background-image assertion above reads the
      // page-wide pale gradient (`rgb(240, 230, 203)` survives in the string), red;
      // the intersection assertion also goes red at 851×324/640×300 since the button
      // reverts to 46px at the un-reserved `right: 18px`.
    });
  }
});

test.describe("briefing: D4 — the first roster row keeps its name/job foot on screen", () => {
  for (const [w, h] of [
    [851, 324],
    [640, 300],
  ] as const) {
    test(`${w}x${h}: the first card, including its foot, is fully inside the roster's visible box`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);

      const rosterBox = await page.getByTestId("prep-roster").boundingBox();
      const cardBox = await page.locator('[data-testid="prep-roster"] .ptab').first().boundingBox();
      expect(rosterBox, "prep-roster has no box").not.toBeNull();
      expect(cardBox, "first card has no box").not.toBeNull();
      expect(
        boxInside(cardBox!, rosterBox!),
        `${w}x${h}: first card ${JSON.stringify(cardBox)} is not fully inside the roster ${JSON.stringify(rosterBox)}`,
      ).toBe(true);

      // The foot (name + job) specifically — not just the face.
      const plateBox = await page.locator('[data-testid="prep-roster"] .ptab').first().locator(".plate").boundingBox();
      expect(plateBox, "first card's .plate has no box").not.toBeNull();
      expect(
        boxInside(plateBox!, rosterBox!),
        `${w}x${h}: first card's foot ${JSON.stringify(plateBox)} is not fully inside the roster ${JSON.stringify(rosterBox)}`,
      ).toBe(true);
      // MUTATION (run, see the fix report): under the `@media (max-height: 400px)`
      // block (overhaul.css), set `#screen-briefing { --face-ar: 0.6; }` — a tall
      // face instead of the compact wide one — and the card grows past the roster's
      // visible box at both folds, red.
    });
  }
});

test.describe("briefing: B1 — the Deploy plate clears every prep-* control and every roster card", () => {
  for (const [w, h] of [
    [640, 300],
    [851, 324],
  ] as const) {
    test(`${w}x${h}: deploy's box intersects no prep-* control and no roster card, on every tab`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);

      for (const tab of ["equipment", "skills", "profile"] as const) {
        await openPrepTab(page, tab);
        const sealBox = await page.getByTestId("deploy").boundingBox();
        expect(sealBox, `${w}x${h} ${tab}: deploy has no box`).not.toBeNull();

        // Every VISIBLE `prep-*` control plus every roster card (`.ptab`) — the same
        // manifest the control-manifest test walks, read directly off the live DOM
        // rather than re-listed here, so a future control needs no update to this
        // test to be covered.
        const otherBoxes = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('[data-testid^="prep-"], .ptab')]
            .map((el) => {
              const r = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              if (cs.display === "none" || cs.visibility === "hidden" || r.width === 0 || r.height === 0) {
                return null;
              }
              return {
                label: el.dataset["testid"] ?? ".ptab",
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
              };
            })
            .filter((b): b is { label: string; x: number; y: number; width: number; height: number } => b !== null),
        );
        for (const box of otherBoxes) {
          expect(
            boxesIntersect(sealBox!, box),
            `${w}x${h} ${tab}: deploy ${JSON.stringify(sealBox)} intersects ${box.label} ${JSON.stringify(box)}`,
          ).toBe(false);
        }
      }
      // MUTATION (run, see the fix report): remove `.jobrow { padding-right: 7.6em; }`
      // (overhaul.css, inside `@media (max-height: 400px)`) — at 640x300, on every
      // tab (the job strip is "always" visible), the Secondary plaque's box
      // intersects `deploy`'s box, red.
    });
  }
});

test.describe("briefing: B2 — the body scroll lock extends to the briefing screen", () => {
  test("1000x780: body.overflow matches title/scene's own rule, and the page does not scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 780 });
    await toBriefing(page);

    // "What the rule sets for title/scene" — read straight off the CSSOM rule ITSELF
    // (the shared `body:has(#screen-title:not([hidden])), body:has(#screen-scene:
    // not([hidden])), body:has(#screen-briefing:not([hidden])) { overflow: hidden;
    // height: 100%; }` declaration in `overhaul.css`), not a second-guessed literal
    // — so this fails the moment either the VALUE or the selector list drifts, and a
    // wrong guess here can never coincidentally agree with a wrong rule.
    const rule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const r of Array.from(rules)) {
          if (
            r instanceof CSSStyleRule &&
            r.selectorText.includes("#screen-title:not([hidden])") &&
            r.selectorText.includes("#screen-briefing:not([hidden])")
          ) {
            return { selector: r.selectorText, overflow: r.style.overflow };
          }
        }
      }
      return null;
    });
    expect(rule, "no body:has(...) scroll-lock rule names both #screen-title and #screen-briefing").not.toBeNull();
    expect(rule!.overflow, "the shared rule's own declared overflow").toBe("hidden");

    const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(bodyOverflow, "body overflow with the briefing screen up").toBe(rule!.overflow);

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.mouse.move(500, 400);
    await page.mouse.wheel(0, 500);
    expect(await page.evaluate(() => window.scrollY), "the page scrolled behind the briefing screen").toBe(0);
    const scroll = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    });
    expect(
      scroll.scrollHeight,
      `document scrolls behind the briefing screen (scrollHeight ${scroll.scrollHeight} > clientHeight ${scroll.clientHeight})`,
    ).toBeLessThanOrEqual(scroll.clientHeight + 1);
    // MUTATION (run, see the fix report): drop `body:has(#screen-briefing:not(
    // [hidden]))` from the shared selector list (overhaul.css) — `bodyOverflow` reads
    // "visible" instead of "hidden" (title's own toggle above still reads "hidden"),
    // and the first assertion goes red.
  });
});

test.describe("briefing: M6 — the portrait-pending caption never overlaps the story text", () => {
  for (const [w, h] of [
    [1000, 780],
    [851, 324],
    [640, 300],
  ] as const) {
    test(`${w}x${h}: figcaption.pending's box (if visible) does not intersect .story p.line's box`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);

      // Battle 1's own pre-battle beat is spoken by Vance (geomancer — one of the
      // three jobs with no approved portrait yet, ADR-0039), so the placeholder
      // caption is a REAL reachable state here, not a contrived one.
      // `[data-testid="brief-story"]` IS the `.story` element (index.html), not an
      // ancestor of one — so the line lives at `p.line` directly under it, never at
      // a nested `.story p.line`.
      const caption = page.locator('[data-testid="brief-story"] .portrait figcaption.pending');
      const line = page.locator('[data-testid="brief-story"] p.line').first();
      await expect(line, "brief-story has no story line").toBeVisible();

      if (await caption.isHidden()) {
        return; // no placeholder in this state — nothing to overlap
      }
      const captionBox = await caption.boundingBox();
      const lineBox = await line.boundingBox();
      expect(captionBox, "figcaption.pending has no box").not.toBeNull();
      expect(lineBox, ".story p.line has no box").not.toBeNull();
      expect(
        boxesIntersect(captionBox!, lineBox!),
        `${w}x${h}: figcaption.pending ${JSON.stringify(captionBox)} intersects the story line ${JSON.stringify(lineBox)}`,
      ).toBe(false);
      // NOT MUTATION-VERIFIED, honestly: `min-width: 0; overflow: hidden;` on
      // `#screen-briefing #brief-story .portrait` (overhaul.css) is the textbook fix
      // for a grid item's auto-minimum-size overflowing its declared box, and the
      // static reference frame this item was filed against
      // (`docs/visual/overhaul/prep-851x324.png`) shows exactly that failure mode —
      // but with the CURRENT content (Vance's short "Portrait pending" caption) this
      // assertion stayed green with those two properties removed, at all three
      // folds; the earlier D1 fix (`.portrait`'s fixed 40px/30px sizing) already
      // keeps the grid's `auto 1fr` track from growing under this content. Kept as a
      // real regression guard and correct CSS, not reported as a verified catch.
    });
  }
});
