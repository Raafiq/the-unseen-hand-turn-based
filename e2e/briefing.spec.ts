import { test, expect, type Page } from "@playwright/test";
import { backToParty, dismissScene, openMember, openPrepTab, openViewerPrep, startNewGame } from "./helpers.js";
// `with { type: "json" }` is required here: this file goes through Node's ESM loader,
// not Vite's, and a bare JSON import breaks only the browser job (campaign.spec.ts's
// own file-banner comment).
import storyPack from "../data/campaign/story/camp-the-first-march.story.json" with { type: "json" };

/**
 * The briefing screen, SPLIT INTO TWO VIEWS (owner decision 2026-09-07):
 *
 *   PARTY  — the roster alone on one full-width leaf, one big portrait card per member,
 *            the battle title/number AND the story beat on the top rail, the wax Deploy
 *            plate. One tap anywhere on a card opens that member.
 *   MEMBER — everything the old right leaf held, full width: unit head, Equipment /
 *            Skills / Profile, gear, standing, job strip, and a back plaque. No Deploy.
 *
 * `src/render/prep.ts` builds the member leaf into `#prep-body`; `src/render/game.ts`
 * builds the party leaf's roster cards (`brief-party`). `src/render/overhaul.css` is
 * scoped under `#screen-briefing`, and the VIEW is a class on that section written from
 * a module variable in `game.ts` — never read back off the DOM.
 *
 * VIEWPORTS: the owner's phone in landscape and nothing else (directive, 2026-09-07) —
 * 832x328 (a ~56px browser bar, unverified) and 832x384 (none). The CSS stays fluid so
 * larger screens lay out sensibly, but no assertion here is made at another fold.
 */

/** The owner's phone, landscape, with and without the browser bar. */
const FOLDS = [
  [832, 328],
  [832, 384],
] as const;

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
  test("Briar's and Vance's cards, and the head portrait, resolve to their OWN bundled assets", async ({
    page,
  }) => {
    await toBriefing(page);

    const briarCard = page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-briar"] img');
    await expect(briarCard).toHaveAttribute("src", /archer-f/);

    // Open Briar so the right leaf's hero portrait resolves the SAME id.
    await briarCard.click();
    const hero = page.locator(".hero img");
    await expect(hero).toHaveAttribute("src", /archer-f/);
    await backToParty(page);

    // Vance was a geomancer with no approved portrait and this test asserted he showed
    // the PLACEHOLDER. The six-member roster (2026-09-08) made him an archer and claimed
    // `archer-m` for him, so the honest answer flipped. He is the DISCRIMINATING second
    // card precisely because he and Briar are both archers: a card wired to "the archer
    // crop" rather than to this member would satisfy one of these two and not the other.
    const vanceCard = page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-vance"] img');
    await expect(vanceCard).toHaveAttribute("src", /archer-m/);
    await expect(vanceCard).not.toHaveClass(/pending/);
    // A real crop fills the frame; only the placeholder SVG asks for `contain`.
    await expect(vanceCard).toHaveCSS("object-fit", "cover");
  });
});

test.describe("briefing: tabs", () => {
  test("Equipment is selected on entry; Skills reveals prep-reaction; Profile reveals prep-traits; aria-selected follows", async ({
    page,
  }) => {
    await toBriefing(page);
    // The tabs live on the MEMBER view (the split, owner 2026-09-07): "Equipment is
    // selected on entry" is a claim about entering a member, not the screen.
    await openMember(page);

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
    await backToParty(page);
    await page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-kest"]').click();
    await expect(page.locator('.tab[data-tab="skills"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("prep-reaction")).toBeVisible();

    // Path two: a purchase (`act()` -> `render()`), a SEPARATE re-render path from the
    // roster click above. The receipt is Skills-only content, so it can only be visible
    // if the tab survived the purchase's own repaint too. Discover whichever member
    // actually banked enough AP rather than assuming which one did.
    for (const id of PARTY) {
      await backToParty(page);
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
   * AC-V53. Every testid this screen's code can emit that the split OWNS, tagged with
   * which VIEW it belongs to (party select / member detail), which TAB shows it within
   * the member view ("always" = the unit head and Job Customization strip, visible on
   * every tab) and whether the node itself may be OMITTED — not merely hidden — in some
   * state, the absent-not-zero rule (a weapon row before any weapon is owned, a receipt
   * before any purchase).
   *
   * Built from `grep -oE 'data-testid="(prep|member)-[a-z-]*"'` across `prep.ts` /
   * `game.ts` / `index.html`, plus the two ids the split adds, not copied from prose.
   * The partition below is EXACT in both directions: a stray id fails, and a stale key
   * here fails too (its per-view loop demands the node be present).
   */
  const MANIFEST: Record<
    string,
    { view: "party" | "member"; tab: "always" | "equipment" | "skills" | "profile"; optional?: true }
  > = {
    // ── party select ────────────────────────────────────────────────────────────
    "prep-roster": { view: "party", tab: "always" },
    // ── member detail ───────────────────────────────────────────────────────────
    "member-back": { view: "member", tab: "always" },
    "brief-member-name": { view: "member", tab: "always" },
    "prep-ap": { view: "member", tab: "always" },
    "prep-job": { view: "member", tab: "always" },
    "prep-secondary": { view: "member", tab: "always" },
    "prep-weapon": { view: "member", tab: "equipment", optional: true },
    "prep-weapon-desc": { view: "member", tab: "equipment", optional: true },
    "prep-weapon-hint": { view: "member", tab: "equipment", optional: true },
    "prep-stats": { view: "member", tab: "equipment" },
    "prep-primary": { view: "member", tab: "skills" },
    "prep-reaction": { view: "member", tab: "skills" },
    "prep-support": { view: "member", tab: "skills" },
    "prep-movement": { view: "member", tab: "skills" },
    "prep-commands": { view: "member", tab: "skills" },
    "prep-command-count": { view: "member", tab: "skills" },
    "prep-progression": { view: "member", tab: "skills" },
    "prep-tree": { view: "member", tab: "skills" },
    "prep-learn": { view: "member", tab: "skills" },
    "prep-spend-hint": { view: "member", tab: "skills" },
    "prep-receipt": { view: "member", tab: "skills", optional: true },
    "prep-traits": { view: "member", tab: "profile" },
    "prep-traits-hint": { view: "member", tab: "profile", optional: true },
  };

  /** Every testid the partition scans. Widened with the split's own two prefixes. */
  const PARTITION_SELECTOR =
    '[data-testid^="prep-"], [data-testid^="member-"], [data-testid="brief-member-name"]';

  test("every manifest control is attached on its view and tab, or legitimately absent; nothing stray ships", async ({
    page,
  }) => {
    await toBriefing(page);
    // M3: `if (spec.optional && count === 0) continue` alone can never tell "this
    // optional row is absent in THIS state, correctly" from "this row can never be
    // produced and nothing here would notice" — five rows were skipped every run.
    // `seenOptional` collects every optional testid that was actually PRESENT at least
    // once, and the test fails unless it equals the full optional set.
    const seenOptional = new Set<string>();

    /** Assert every entry of `view` against the live DOM, and every OTHER view's absent. */
    const checkView = async (view: "party" | "member", tab: string): Promise<void> => {
      for (const [testid, spec] of Object.entries(MANIFEST)) {
        const el = page.locator(`[data-testid="${testid}"]`);
        const count = await el.count();
        const showing = spec.view === view && (spec.tab === "always" || spec.tab === tab);
        if (showing) {
          if (spec.optional) {
            if (count === 0) continue; // absent-not-zero in THIS state, not a failure
            seenOptional.add(testid);
          }
          expect(count, `${testid} must be attached on the ${view} view's ${tab} tab`).toBeGreaterThan(0);
          await expect(el.first(), `${testid} must be VISIBLE on the ${view} view's ${tab} tab`).toBeVisible();
        } else if (count > 0) {
          await expect(
            el.first(),
            `${testid} must be hidden while the ${view} view's ${tab} tab is open`,
          ).toBeHidden();
        }
      }
    };

    /** Walk the member view's three tabs. */
    const checkMemberTabs = async (): Promise<void> => {
      for (const tab of ["equipment", "skills", "profile"] as const) {
        await openPrepTab(page, tab);
        await checkView("member", tab);
      }
    };

    /**
     * Both views, FOR A NAMED MEMBER.
     *
     * The id is not decoration. This helper used to call `openMember(page)` with no
     * argument, which opens the FIRST card — so the `for (const id of PARTY)` sweep
     * below inspected Vance on every pass and a manifest that was wrong for every other
     * member read as green four times over. The rail assertion is what makes the id
     * load-bearing: it names who is actually on screen, and it is checked here rather
     * than at the end so a wrong member fails on the pass that caused it.
     *
     * NOT usable right after a purchase: backing out to party select and re-opening the
     * member calls `prep.select()`, which re-points the panel and clears
     * `learnReceipt()` — so `prep-receipt`, whose whole point is "only until the panel is
     * re-pointed", would be gone before it was ever seen. The receipt pass below uses
     * {@link checkMemberTabs} for exactly that reason.
     */
    const checkTabs = async (id: string, name: string): Promise<void> => {
      await backToParty(page);
      // The party view has no tabs; "equipment" is passed only so the member entries are
      // all judged as not-showing here.
      await checkView("party", "equipment");
      await openMember(page, id);
      await expect(
        page.getByTestId("brief-member-name"),
        `the manifest sweep asked for ${id} and the rail is managing someone else`,
      ).toContainText(name);
      await checkMemberTabs();
    };

    // Pass 1: every party member, as-shipped battle-1 state. `startCampaign` grants
    // battle 1's weapons into the save's inventory BEFORE the first briefing and every
    // starting record's `weapon` is `null` — so prep-weapon and prep-weapon-hint are
    // both reachable with no state change. Every member also starts with a mastered job
    // and an EMPTY `loadout.traits`, which is exactly `prep-traits-hint`'s condition.
    for (const id of PARTY) {
      await backToParty(page);
      const card = page.locator(`[data-testid="prep-roster"] .ptab[data-member="${id}"]`);
      if ((await card.count()) === 0) continue;
      const name = (await card.locator(".pname").innerText()).trim();
      await checkTabs(id, name);
    }

    // Drive prep-weapon-desc: it needs the OPPOSITE state from prep-weapon-hint (a
    // weapon actually equipped). DISCOVERED, not assumed: which member owns an
    // equippable weapon at battle 1 is authored content, and the pass has to re-inspect
    // THAT member — equipping on one and then walking Vance's tabs (which is what the
    // no-argument `checkTabs()` did) leaves `prep-weapon-desc` unreached here and lets a
    // later, unrelated pass be the only thing that ever sees it.
    let equipped: { id: string; name: string } | null = null;
    for (const id of PARTY) {
      await backToParty(page);
      const card = page.locator(`[data-testid="prep-roster"] .ptab[data-member="${id}"]`);
      if ((await card.count()) === 0) continue;
      const name = (await card.locator(".pname").innerText()).trim();
      await openMember(page, id);
      await openPrepTab(page, "equipment");
      const weaponSelect = page.getByTestId("prep-weapon");
      if ((await weaponSelect.count()) === 0) continue;
      const values = await weaponSelect.locator("option").evaluateAll((os) =>
        os.map((o) => (o as HTMLOptionElement).value),
      );
      if (values.length < 2) continue;
      await weaponSelect.selectOption(values[1]!);
      await expect(weaponSelect).toHaveValue(values[1]!); // the edit really landed
      equipped = { id, name };
      break;
    }
    expect(equipped, "no member has an owned, equippable weapon at battle 1").not.toBeNull();
    await checkTabs(equipped!.id, equipped!.name);

    // Drive prep-receipt: 0 AP campaign-wide until two battles are banked — play two,
    // then buy whichever party member's cheapest affordable node.
    for (let i = 0; i < 2; i++) {
      await backToParty(page);
      await playCurrentBattle(page);
      await expect(page.getByTestId("screen-after")).toBeVisible();
      await page.getByTestId("next").click();
      await dismissScene(page);
    }
    await expect(page.getByTestId("screen-briefing")).toBeVisible();
    let bought = false;
    for (const id of PARTY) {
      await backToParty(page);
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
    await checkMemberTabs();

    const expectedOptional = new Set(
      Object.entries(MANIFEST)
        .filter(([, spec]) => spec.optional === true)
        .map(([testid]) => testid),
    );
    expect([...seenOptional].sort(), "every optional row must be driven to PRESENT at least once").toEqual(
      [...expectedOptional].sort(),
    );

    // THE EXACT PARTITION, in both views: every `prep-*` / `member-*` testid actually in
    // the DOM must be a key of MANIFEST — a stray id (a leftover, a typo, an
    // un-catalogued new control) fails here even though every per-control loop above
    // stayed green. Scanned on BOTH views, since each hides the other's markup by CSS
    // (the nodes are still in the document, so one scan would have found them anyway —
    // the two passes are what would survive a switch to conditional rendering).
    const found: string[] = [];
    for (const goToMember of [false, true]) {
      await backToParty(page);
      if (goToMember) await openMember(page);
      found.push(
        ...(await page.evaluate(
          (sel) =>
            [...document.querySelectorAll(sel)].map((e) => (e as HTMLElement).dataset["testid"] ?? ""),
          PARTITION_SELECTOR,
        )),
      );
    }
    const stray = [...new Set(found)].filter((id) => id !== "" && !(id in MANIFEST));
    expect(stray, `stray testid(s) not in MANIFEST: ${stray.join(", ")}`).toEqual([]);
    // MUTATION 1 (run): delete `member-back`'s entry from MANIFEST → the stray-partition
    // assertion goes red (`member-back` is on the page and in no manifest key).
    // MUTATION 2 (run): add a STALE key (`member-bogus`) to MANIFEST → the member-view
    // loop's `toBeGreaterThan(0)` for it goes red; the partition alone cannot see it,
    // which is why both directions are asserted.
    // MUTATION 3: delete `data-testid="prep-support"` in `prep.ts` → the Skills-tab
    // loop goes red.
    // MUTATION 4 (M3, previously run): delete `data-testid="prep-weapon-hint"` in
    // `weaponSlotHtml()` → `seenOptional` never gains it and the equality goes red.
    // MUTATION 5 (RUN 2026-09-08): make `checkTabs` ignore its id and call
    // `openMember(page)` (the first card, every time) — the rail assertion goes red on
    // the first non-Vance member of the sweep. That is the bug this sweep shipped with:
    // it walked four ids and inspected one member.
  });
});

test.describe("briefing: six shown, two fight (ADR-0041)", () => {
  test("battle 1 marks exactly the four members it does NOT field, and says so in the hint", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 832, height: 328 });
    await toBriefing(page);

    // THE ENCOUNTER IS THE SOURCE, and the assertion names the two it fields rather than
    // counting marks: a count alone passes on a mark put on the wrong four cards.
    // `camp-b1-the-toll-road.json` places `pc-vance` and `pc-kest` on team 0.
    const marked = await page
      .locator('[data-testid="prep-roster"] li.member')
      .evaluateAll((lis) =>
        lis.map((li) => ({
          name: (li.querySelector(".pname") as HTMLElement).innerText.trim(),
          camp: li.getAttribute("data-camp"),
          caption: (li.querySelector(".camp") as HTMLElement | null)?.innerText.trim() ?? null,
        })),
      );
    expect(marked.length, "the shipped party is six").toBe(6);
    expect(
      marked.filter((m) => m.camp === null).map((m) => m.name).sort(),
      "battle 1's authored placements are Vance and Kest",
    ).toEqual(["Kest", "Vance"]);
    // The mark is VISIBLE, not just an attribute: every camp-marked card carries the
    // caption too, and no fielded card does.
    for (const m of marked) {
      expect(m.caption === null, `${m.name}: caption/attribute disagree`).toBe(m.camp === null);
    }

    await expect(page.getByTestId("brief-deploy-note")).toHaveText(
      "This battle fields 2 of 6. Tap a member to manage them.",
    );

    // …and it is READ-ONLY: a camp-marked card still opens its member like any other.
    // (`data-camp` must not have become a disabled state — the whole party is editable.)
    await openMember(page, "pc-isla");
    await expect(page.locator("#screen-briefing .nameline h2")).toHaveText("Isla");

    // MUTATION (RUN 2026-09-08): derive the mark and the count from `save.deployment`
    // (`shell.deployment()?.chosen` reading the save's own array) instead of the
    // encounter's `authored` — the save's deployment is empty at battle 1, so every card
    // is marked, the "fields 2 of 6" hint disappears, and both assertions go red.
  });

  test("the fielded set follows the ENCOUNTER even when a stale deployment is in the save", async ({
    page,
  }) => {
    // A save written by an older build (or by `playtest.ts`, which still calls
    // `setDeployment`) can carry a deployment this build has no control for. Nothing on
    // screen would show it and nothing could change it, so `continueGame` drops it —
    // empty means "as the encounter authored it".
    //
    // THE FIXTURE IS DISCRIMINATING: it names Ottoline, who battle 1 does NOT place, so
    // an honoured stale deployment and a dropped one field different units. A fixture
    // naming Vance and Kest would pass either way.
    await page.goto("/");
    await startNewGame(page);
    await dismissScene(page);
    await expect(page.getByTestId("screen-briefing")).toBeVisible();
    await page.evaluate(() => {
      // `SAVE_KEY` from `src/render/storage.ts`; the same literal `campaign.spec.ts`
      // uses, and the whole point is to go through the REAL slot, not a memory one.
      const stored = localStorage.getItem("tuh.campaign.v1");
      if (stored === null) throw new Error("no save in localStorage after New Game");
      const raw = JSON.parse(stored) as { deployment?: unknown };
      raw.deployment = ["pc-vance", "pc-ottoline"];
      localStorage.setItem("tuh.campaign.v1", JSON.stringify(raw));
    });
    await page.reload();
    await page.getByTestId("continue").click();
    await dismissScene(page);
    await expect(page.getByTestId("screen-briefing")).toBeVisible();

    // WHO IS ON THE BOARD, read the way a player reads it. NOT by battle-unit id:
    // `applyDeployment` SUBSTITUTES THE RECORD and keeps every slot id as authored
    // (`campaign-run.ts`), so the ids are `blue-vance` / `blue-kest` under both answers
    // and an id assertion here would be green either way — the exact "cannot come out
    // the other way" trap. The NAME is what changes, and the timeline is where it shows.
    const roster = await page
      .locator('[data-testid="prep-roster"] li.member .pname')
      .allInnerTexts();
    expect(roster.length, "the shipped party is six").toBe(6);
    await page.getByTestId("deploy").click();
    await expect(page.getByTestId("screen-battle")).toBeVisible();
    const timeline = await page.getByTestId("timeline").innerText();
    const fielded = roster.map((n) => n.trim()).filter((n) => timeline.includes(n)).sort();
    expect(fielded, "the stale deployment was honoured — Ottoline reached the board").toEqual([
      "Kest",
      "Vance",
    ]);
    // MUTATION (RUN 2026-09-08): drop the `deployment: []` clear in
    // `CampaignShell.continueGame` (`this.save = this.slotState.save`) — Ottoline is
    // fielded in Kest's place and this assertion goes red.
  });
});

test.describe("briefing: focus follows the view switch", () => {
  test("opening a member focuses Back; going back focuses the card that was open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 832, height: 328 });
    await toBriefing(page);

    // BOTH LEAVES ARE `display: none`-TOGGLED, which drops focus to `<body>`. A keyboard
    // player who opened a member landed nowhere and had to tab in from the top of the
    // document; going back was worse, because the roster is rebuilt wholesale and the
    // card they came from is a brand-new node.
    const active = (): Promise<string> =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (el === null) return "null";
        return el.dataset["testid"] ?? el.dataset["member"] ?? el.tagName.toLowerCase();
      });

    await page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-briar"]').click();
    await expect(page.getByTestId("member-back")).toBeVisible();
    expect(await active(), "opening a member left focus on the body").toBe("member-back");

    await page.getByTestId("member-back").click();
    await expect(page.getByTestId("prep-roster")).toBeVisible();
    // THE CARD THAT WAS OPEN, named — "some card is focused" would pass on the first one.
    expect(await active(), "back left focus on the body or on the wrong card").toBe("pc-briar");

    // MUTATION (RUN 2026-09-08): delete both `focus()` calls from `setBriefView` in
    // `game.ts` — `document.activeElement` is `<body>` after each switch and both
    // assertions go red.
  });
});

test.describe("briefing: drift from the approved party mockup, at 832x328", () => {
  // Measured against `docs/visual/concepts/mockups/src/party.html` — the source the
  // approved `party-851x324.png` frame was captured from — re-shot at the OWNER'S fold
  // (832x328). Real element boxes, not a pixel scan: more precise, and still the mockup's
  // own numbers rather than eyeballed ones.
  //
  // RE-DERIVABLE. The first version of these constants came off a re-shoot into a
  // gitignored `coverage/` directory, so the numbers were an assertion nobody could
  // check. The frame is now tracked as `docs/visual/concepts/mockups/party-832x328.png`
  // and `docs/visual/concepts/mockups/src/shoot.mjs` prints exactly the six values below
  // (its `constants: true` shot). Re-derive with:
  //
  //     node docs/visual/concepts/mockups/src/shoot.mjs
  //
  // which re-shot 2026-09-08 as, verbatim:
  //   MOCKUP_832x328 (4 mockup cards) = {"cardFirstX":44,"cardLastRight":811,
  //     "cardTop":97,"rosterRight":814,"sealRight":828,"sealBottom":324}
  //
  // Two deliberate deviations from the approved frame:
  //  1. the mockup's per-card deploy pip is GONE (owner, 2026-09-08);
  //  2. the party is SIX members (owner, 2026-09-08) where the mockup drew four.
  //
  // (2) is why the per-card numbers below are the mockup's INVARIANTS rather than its
  // four pixel positions. `cardX: [44, 237, 430, 624]` and `cardWidth: 187` describe a
  // four-track grid and are unsatisfiable at six; re-recording six measured positions
  // off the running build would be a test that cannot come out the other way — it would
  // assert whatever the CSS did. What the mockup actually fixes, independent of the
  // count, is the ROW's box: where the first card starts, where the last one ends, how
  // tall the row sits, and that the tracks are equal and side by side. Those still bite
  // (see the mutation at the end), and they hold at the shipped six: measured x = 44,
  // 173, 301, 430, 559, 688 at width 123, last right edge 811 — the same 811 the
  // mockup's fourth card reached at width 187.
  //
  // NOT ASSERTED, and owed to the art director: nobody has approved a SIX-card frame.
  // The card width is 123px where the approved four-card frame drew 187, and whether a
  // face still reads at that size is a taste call this file cannot make.
  const MOCKUP_832x328 = {
    cardFirstX: 44,
    cardLastRight: 811,
    cardTop: 97,
    rosterRight: 814,
    sealRight: 828,
    sealBottom: 324,
  };

  test("the card row's box, the roster's right edge and the Deploy plate are within 12px of the mockup", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 832, height: 328 });
    await toBriefing(page);
    // CHECKED, NOT ASSUMED: every shipped battle authors a pre-battle beat, read off the
    // pack rather than trusting a doc claim. The mockup ships one too (on the rail), so
    // unlike the pre-split screen there is no content mismatch to except.
    expect(storyPack.entries.every((e) => e.pre !== undefined)).toBe(true);
    await expect(page.getByTestId("brief-story")).toBeVisible();

    const boxes = await page
      .locator('[data-testid="prep-roster"] .ptab')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ x: b.x, w: b.width, y: b.y })));
    expect(boxes.length, "the shipped party is six members").toBe(6);

    const near = (label: string, actual: number, wanted: number): void => {
      expect(
        Math.abs(actual - wanted),
        `${label}: ${actual} is not within 12px of the mockup's ${wanted}`,
      ).toBeLessThanOrEqual(12);
    };

    near("the row's first card left edge", boxes[0]!.x, MOCKUP_832x328.cardFirstX);
    near(
      "the row's last card right edge",
      boxes.at(-1)!.x + boxes.at(-1)!.w,
      MOCKUP_832x328.cardLastRight,
    );
    for (const [i, box] of boxes.entries()) {
      near(`card ${i} top`, box.y, MOCKUP_832x328.cardTop);
      // Equal tracks, to 2px — the mockup's grid is `1fr` per card at every count, so a
      // row that filled the same box with UNEVEN cards would pass the two edges above.
      expect(
        Math.abs(box.w - boxes[0]!.w),
        `card ${i} is ${Math.round(box.w)}px against card 0's ${Math.round(boxes[0]!.w)}px`,
      ).toBeLessThanOrEqual(2);
    }

    const rosterBox = await page.getByTestId("prep-roster").boundingBox();
    const sealBox = await page.getByTestId("deploy").boundingBox();
    expect(rosterBox, "prep-roster has no box").not.toBeNull();
    expect(sealBox, "deploy seal has no box").not.toBeNull();
    near("roster's right edge", rosterBox!.x + rosterBox!.width, MOCKUP_832x328.rosterRight);
    near("Deploy plate's right edge", sealBox!.x + sealBox!.width, MOCKUP_832x328.sealRight);
    near("Deploy plate's bottom edge", sealBox!.y + sealBox!.height, MOCKUP_832x328.sealBottom);
    // MUTATION (RUN 2026-09-08): pin `#screen-briefing.party .cards`'s track count to
    // five (`grid-template-columns: repeat(5, minmax(0, 1fr))`, overhaul.css) — the sixth
    // card wraps to a second row and the run failed on
    // "the row's last card right edge: 192.375 is not within 12px of the mockup's 811".
    // The `card 5 top` assertion behind it sees the same wrap (the ONE ROW test below
    // went red on it in the same run, y 188 against card 0's 97).
  });

  test("a six-member party still stands in ONE ROW at both folds", async ({ page }) => {
    // THE FIXTURE IS NOW THE SHIPPED CAMPAIGN. This test used to seed a synthetic
    // six-member save into `localStorage`, because the campaign shipped four and the
    // owner's directive (2026-09-08) was that six is the working assumption. The roster
    // landed six that same day, so the synthetic save would now grow the party to EIGHT
    // and measure a layout no player ever sees. Reading the real save is strictly
    // stronger: it drives the real codec, the real shell and the real content.
    for (const [w, h] of FOLDS) {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);
      const shipped = await page.evaluate(() => {
        const raw = localStorage.getItem("tuh.campaign.v1");
        if (raw === null) return 0;
        return (JSON.parse(raw) as { party: unknown[] }).party.length;
      });
      // Guards the fixture: if the campaign ever ships a different party size, this test
      // says so instead of silently measuring a four- or eight-card row against a claim
      // about six.
      expect(shipped, "the shipped campaign save is not a six-member party").toBe(6);

      const boxes = await page
        .locator('[data-testid="prep-roster"] .ptab')
        .evaluateAll((els) =>
          els.map((e) => {
            const b = e.getBoundingClientRect();
            return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) };
          }),
        );
      expect(boxes.length, `${w}x${h}: six cards must be drawn`).toBe(6);
      // ONE ROW is the assertion, and it is stated as "every card shares the first
      // card's top", not "the roster is short" — an aggregate could not tell a single
      // row from two half-height ones.
      for (const [i, b] of boxes.entries()) {
        expect(b.y, `${w}x${h}: card ${i} is on a second row (y ${b.y} vs ${boxes[0]!.y})`).toBe(boxes[0]!.y);
      }
      // …and they are genuinely side by side, in order, none of them collapsed.
      for (let i = 1; i < boxes.length; i += 1) {
        expect(boxes[i]!.x, `${w}x${h}: card ${i} is not right of card ${i - 1}`).toBeGreaterThan(boxes[i - 1]!.x);
      }
      for (const [i, b] of boxes.entries()) {
        expect(b.w, `${w}x${h}: card ${i} is too narrow to read a face`).toBeGreaterThanOrEqual(100);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        `${w}x${h}: six cards made the page scroll horizontally`,
      ).toBe(true);
      // MUTATION (run): drop `--cards` from `#screen-briefing.party .cards`'s
      // `grid-template-columns` (back to `repeat(auto-fit, minmax(138px, 1fr))`) — at
      // 773px of leaf `auto-fit` yields FIVE tracks, the sixth card wraps, and the
      // shared-top assertion goes red at both folds.
    }
  });
});

test.describe("briefing: the two views", () => {
  test("entering shows party select only; a card opens that member; back keeps the same member selected", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 832, height: 328 });
    await toBriefing(page);

    // ON ENTRY: the roster is up and NOTHING of the member leaf is.
    await expect(page.getByTestId("prep-roster")).toBeVisible();
    await expect(page.getByTestId("brief-quit")).toBeVisible();
    await expect(page.getByTestId("deploy")).toBeVisible();
    await expect(page.getByTestId("prep-weapon")).toBeHidden();
    await expect(page.getByTestId("member-back")).toBeHidden();

    // BRIAR by name, not "some card": a view switch that opened the wrong member, or the
    // first member every time, passes an "is a member open" assertion.
    await page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-briar"]').click();
    await expect(page.getByTestId("prep-weapon")).toBeVisible();
    await expect(page.getByTestId("member-back")).toBeVisible();
    await expect(page.getByTestId("deploy")).toBeHidden();
    await expect(page.getByTestId("prep-roster")).toBeHidden();
    await expect(page.getByTestId("brief-quit")).toBeHidden();
    await expect(page.getByTestId("brief-member-name")).toContainText("Briar");
    await expect(page.locator("#screen-briefing .nameline h2")).toHaveText("Briar");

    // BACK: party select again, and the SAME member is still the selected card.
    await page.getByTestId("member-back").click();
    await expect(page.getByTestId("prep-roster")).toBeVisible();
    await expect(page.getByTestId("prep-weapon")).toBeHidden();
    await expect(page.getByTestId("deploy")).toBeVisible();
    const selected = await page.locator('[data-testid="prep-roster"] li.member.on .pname').innerText();
    expect(selected, "back reset the selection instead of keeping it").toBe("Briar");
    // MUTATION 1 (run): make `setBriefView` ignore its argument (`briefView = "member"`)
    // — the back click leaves the member leaf up and the roster assertion goes red.
    // MUTATION 2 (run): have `btn-member-back` also call `prep?.select(<first member>)`
    // — the selected card reads "Vance" and the last assertion goes red.
  });

  test("tapping the DEEPEST thing on a card opens that member — nothing inside the tile swallows the tap", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 832, height: 328 });
    await toBriefing(page);

    // WHAT THIS CAN AND CANNOT SEE, measured rather than assumed (2026-09-08).
    //
    // The previous version clicked `.plate` and called that "the card's foot, outside
    // the button". It is not: `.plate` is a CHILD of `button.ptab` (`game.ts`'s card
    // markup), so the click landed inside the button no matter where the open handler
    // was bound, and the mutation the comment named — move the handler from `li.member`
    // onto `.ptab` — could not turn it red.
    //
    // Nor can any click, because the two boxes are the SAME box: `.member` is a column
    // flex container with no padding and `.ptab` is `flex: 1 1 auto`, so at 832x328 the
    // row and the button both measure 123x176 at the same origin (asserted below, so a
    // future padding on the row is not silently taken as coverage this test does not
    // have). The ornaments that DO stick out — `.finial`, `.pennant` — are
    // `pointer-events: none` by design. "The handler is on the row, not the button" is
    // therefore currently unobservable from outside, and saying so is the honest
    // reading; if the owner wants a real row band around the card, that is a layout
    // change and this assertion is where it would show up.
    //
    // WHAT IS STILL LOAD-BEARING, and is what the title claims: a tap on the deepest,
    // smallest descendant of the tile — the job label, and the portrait image — reaches
    // the handler and opens THE RIGHT member. That catches a child that swallows its own
    // click, a child that is not a descendant of the bound node, and a handler bound to
    // the wrong card.
    //
    // KEST BY NAME. A handler bound to the wrong card — or to the first card always —
    // passes a bare "the member view opened" assertion, because Vance is already the
    // SELECTED member on entry and would be the one a broken binding lands on. Kest is
    // neither first nor pre-selected, so the rail naming him is the discriminating read.
    const kest = page
      .locator('[data-testid="prep-roster"] li.member')
      .filter({ hasText: "Kest" });
    const geometry = await kest.evaluate((li) => {
      const row = li.getBoundingClientRect();
      const btn = li.querySelector("button.ptab")!.getBoundingClientRect();
      return {
        row: [row.x, row.y, row.width, row.height].map(Math.round),
        btn: [btn.x, btn.y, btn.width, btn.height].map(Math.round),
      };
    });
    expect(
      geometry.btn,
      `the card button no longer fills its row (row ${geometry.row.join()}, button ${geometry.btn.join()}) — there IS now a row-only band, so this test can and should click it`,
    ).toEqual(geometry.row);

    // THE JOB LABEL: the deepest text node on the card, two elements below the button.
    const label = kest.locator(".pjob");
    const box = await label.boundingBox();
    expect(box, "Kest's job label has no box").not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(page.getByTestId("prep-weapon")).toBeVisible();
    await expect(page.getByTestId("brief-member-name")).toContainText("Kest");
    await expect(page.locator("#screen-briefing .nameline h2")).toHaveText("Kest");

    // …and the PORTRAIT IMAGE, a different subtree of the same card. Briar this time, so
    // "it opened Kest again" cannot pass.
    await backToParty(page);
    const briarFace = page
      .locator('[data-testid="prep-roster"] li.member')
      .filter({ hasText: "Briar" })
      .locator(".face img");
    const faceBox = await briarFace.boundingBox();
    expect(faceBox, "Briar's portrait has no box").not.toBeNull();
    await page.mouse.click(faceBox!.x + faceBox!.width / 2, faceBox!.y + faceBox!.height / 2);
    await expect(page.getByTestId("brief-member-name")).toContainText("Briar");
    await expect(page.locator("#screen-briefing .nameline h2")).toHaveText("Briar");
    // MUTATION (RUN 2026-09-08): bind the card handler to `.face` instead of `li.member`
    // in `renderBriefingText()` — the job-label tap no longer reaches any handler, the
    // member view never opens, and the `prep-weapon` assertion goes red.
  });

  test("the view survives a repaint: editing in member view stays in member view, on the same member", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 832, height: 328 });
    await toBriefing(page);
    await page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-briar"]').click();
    await expect(page.locator("#screen-briefing .nameline h2")).toHaveText("Briar");

    // A JOB CHANGE is the discriminating edit: it goes through `onChange` →
    // `shell.updateParty` → `renderBriefingText`, which rewrites the whole roster. A view
    // flag living in the DOM, or reset on every paint, dies exactly here.
    const job = page.getByTestId("prep-job");
    const values = await job.locator("option").evaluateAll((os) =>
      os.map((o) => (o as HTMLOptionElement).value),
    );
    const current = await job.inputValue();
    const next = values.find((v) => v !== current);
    expect(next, "prep-job offers only one job — nothing to change, the edit would be a no-op").toBeDefined();
    await job.selectOption(next!);
    await expect(job).toHaveValue(next!); // the edit really landed

    await expect(page.getByTestId("prep-weapon")).toBeVisible();
    await expect(page.getByTestId("prep-roster")).toBeHidden();
    await expect(page.locator("#screen-briefing .nameline h2")).toHaveText("Briar");
    await expect(page.getByTestId("brief-member-name")).toContainText("Briar");
    // MUTATION (run): read the view back off the DOM in `applyBriefView`
    // (`briefView = screen.classList.contains("member") ? "member" : "party"` before the
    // toggles) or reset `briefView = "party"` at the top of `renderBriefingText` — the
    // edit's repaint drops back to party select and `prep-weapon` goes hidden, red.
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
      await backToParty(page);
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
      // The rail reads "Battle 1 of 5 · managing <name>" on the member view — the
      // battle number in its own span, the member suffix in a second one, so a
      // `.textContent` write on either cannot destroy the other (D3 asserts that half).
      const eyebrowText = await page.getByTestId("brief-step").innerText();
      expect(eyebrowText).toMatch(/^Battle 1 of 5 · managing \S/);
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
    await openMember(page);
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
      await backToParty(page);
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
      await backToParty(page);
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
  for (const [w, h] of FOLDS) {
    test(`${w}x${h}: no horizontal scroll; every control on both views clears 44px; the Deploy plate stays inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `${w}x${h}: page scrolls horizontally`).toBeLessThanOrEqual(clientWidth + 1);

      const floor = 44;
      const shortSide = async (
        name: string,
        locator: ReturnType<Page["getByTestId"]>,
      ): Promise<void> => {
        const box = await locator.boundingBox();
        expect(box, `${w}x${h}: ${name} has no box`).not.toBeNull();
        expect(
          Math.min(box!.width, box!.height),
          `${w}x${h}: ${name} short side (${Math.round(box!.width)}x${Math.round(box!.height)})`,
        ).toBeGreaterThanOrEqual(floor);
      };
      const tallEnough = async (
        name: string,
        locator: ReturnType<Page["getByTestId"]>,
      ): Promise<void> => {
        const box = await locator.boundingBox();
        expect(box, `${w}x${h}: ${name} has no box`).not.toBeNull();
        expect(box!.height, `${w}x${h}: ${name} height`).toBeGreaterThanOrEqual(floor);
      };

      // ── PARTY VIEW. Every card's SHORT side, plus the two rail/plate controls that
      // live here. A card is the one control on this view, so it is measured whole
      // rather than by height alone.
      await shortSide("deploy", page.getByTestId("deploy"));
      await shortSide("brief-quit", page.getByTestId("brief-quit"));
      const cards = await page.locator('[data-testid="prep-roster"] .ptab').all();
      expect(cards.length, `${w}x${h}: no roster cards found`).toBeGreaterThan(0);
      for (const [i, card] of cards.entries()) {
        const box = await card.boundingBox();
        expect(box, `${w}x${h}: roster card ${i} has no box`).not.toBeNull();
        expect(
          Math.min(box!.width, box!.height),
          `${w}x${h}: roster card ${i} short side`,
        ).toBeGreaterThanOrEqual(floor);
      }

      const sealBox = await page.getByTestId("deploy").boundingBox();
      expect(sealBox!.x, `${w}x${h}: Deploy plate left edge off-screen`).toBeGreaterThanOrEqual(0);
      expect(sealBox!.y, `${w}x${h}: Deploy plate top edge off-screen`).toBeGreaterThanOrEqual(0);
      expect(sealBox!.x + sealBox!.width, `${w}x${h}: Deploy plate right edge off-screen`).toBeLessThanOrEqual(w + 1);
      expect(sealBox!.y + sealBox!.height, `${w}x${h}: Deploy plate bottom edge off-screen`).toBeLessThanOrEqual(h + 1);

      // ── MEMBER VIEW. `member-back` is the split's new control and gets the same
      // SHORT-side floor the other two plaques do; the selects are wide full-row
      // controls, so only their height is asserted (the same shape the pre-split test
      // used) — each on the tab where the manifest says it is visible, because a
      // `getByTestId` on a hidden element resolves to a zero-size box that would pass a
      // `>= 0` floor silently.
      await openMember(page);
      await shortSide("member-back", page.getByTestId("member-back"));
      for (const testid of ["prep-job", "prep-secondary"]) {
        await tallEnough(testid, page.getByTestId(testid));
      }
      const weaponSelect = page.getByTestId("prep-weapon");
      if ((await weaponSelect.count()) > 0) await tallEnough("prep-weapon", weaponSelect);
      await openPrepTab(page, "skills");
      for (const testid of ["prep-reaction", "prep-support", "prep-movement"]) {
        await tallEnough(testid, page.getByTestId(testid));
      }
      await openPrepTab(page, "equipment");
      for (const tab of ["equipment", "skills", "profile"]) {
        const box = await page.locator(`#screen-briefing .tab[data-tab="${tab}"]`).boundingBox();
        expect(box, `${w}x${h}: ${tab} tab has no box`).not.toBeNull();
        expect(box!.height, `${w}x${h}: ${tab} tab height`).toBeGreaterThanOrEqual(floor);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        `${w}x${h}: the member view scrolls horizontally`,
      ).toBe(true);
      // MUTATION: shrink `.tab`'s `min-height` (overhaul.css) from 44px to 30px → the
      // per-tab height assertion goes red at both folds. Same for `.backplaque`'s floor
      // and `member-back`.
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
  for (const [w, h] of FOLDS) {
    test(`${w}x${h}: brief-story's reveal control stays inside the leaf and clear of the roster; the line is not clipped`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);

      const story = page.getByTestId("brief-story");
      await expect(story).toBeVisible();
      // The beat moved ONTO THE TOP RAIL with the split (owner, 2026-09-07), so the box
      // it must stay inside is the rail, not the leaf it used to share with the roster.
      const leafBox = await page.locator("#screen-briefing .toprail").boundingBox();
      const rosterBox = await page.getByTestId("prep-roster").boundingBox();
      // The "More" control — `id="<host>-more"` in scene.ts, `data-testid` on the same
      // element (`brief-story-more`), not a bare `#brief-story-more` (the button only
      // carries a `dataset.testid`, never a real `id`).
      const more = page.locator('[data-testid="brief-story-more"]');
      expect(leafBox, "toprail has no box").not.toBeNull();
      expect(rosterBox, "prep-roster has no box").not.toBeNull();

      if (await more.isHidden()) {
        // The beat is short enough that everything is already revealed — nothing to
        // clip. Fall through to the line-clip check below.
      } else {
        const moreBox = await more.boundingBox();
        expect(moreBox, "brief-story-more has no box").not.toBeNull();
        expect(
          boxInside(moreBox!, leafBox!),
          `${w}x${h}: More control ${JSON.stringify(moreBox)} is not fully inside the top rail ${JSON.stringify(leafBox)}`,
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
      // MUTATION: drop `#screen-briefing #brief-story p.line`'s `-webkit-line-clamp: 2`
      // (overhaul.css) — the beat's line runs to full height inside a ribbon that has
      // `overflow: hidden`, `scrollHeight` exceeds `clientHeight`, and if the beat is
      // fully revealed (no More control offered) the last assertion goes red. Note that
      // rule's OWN history: it was written as `#brief-story .story p.line`, which needs a
      // nested `.story` wrapper `scene.ts` does not emit, so it matched NOTHING and the
      // clamp was dead for the life of the screen — found by measuring the rail's height
      // against the mockup's, not by this test, which the offered control kept green.
    });
  }
});

test.describe("briefing: D2 — Equipment and Skills content survives the short folds", () => {
  for (const [w, h] of FOLDS) {
    test(`${w}x${h}: Equipment's gear row and first four Standing rows, Skills' Primary/Reaction/Support rows, are fully inside the leaf`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);
      await openMember(page);
      const leafBox = await page.locator("#screen-briefing #leaf-member").boundingBox();
      expect(leafBox, "the member leaf has no box").not.toBeNull();

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
        `${w}x${h}: gear row ${JSON.stringify(gearRowBox)} is not fully inside the member leaf ${JSON.stringify(leafBox)}`,
      ).toBe(true);

      const statCells = await page.locator('[data-testid="prep-stats"] .stat-row li').all();
      expect(statCells.length, "no Standing rows found").toBeGreaterThanOrEqual(4);
      for (let i = 0; i < 4; i += 1) {
        const cellBox = await statCells[i]!.boundingBox();
        expect(cellBox, `Standing row ${i} has no box`).not.toBeNull();
        expect(
          boxInside(cellBox!, leafBox!),
          `${w}x${h}: Standing row ${i} ${JSON.stringify(cellBox)} is not fully inside the member leaf ${JSON.stringify(leafBox)}`,
        ).toBe(true);
      }

      // Skills: Primary, and the first two of Reaction/Support/Movement — the brief
      // names Reaction and Support explicitly, so both are asserted by name.
      await openPrepTab(page, "skills");
      const primaryBox = await page.getByTestId("prep-primary").boundingBox();
      expect(primaryBox, "prep-primary has no box").not.toBeNull();
      expect(
        boxInside(primaryBox!, leafBox!),
        `${w}x${h}: prep-primary ${JSON.stringify(primaryBox)} is not fully inside the member leaf`,
      ).toBe(true);

      for (const testid of ["prep-reaction", "prep-support"]) {
        const rowBox = await page
          .getByTestId(testid)
          .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' gearrow ')][1]")
          .boundingBox();
        expect(rowBox, `${testid}'s row has no box`).not.toBeNull();
        expect(
          boxInside(rowBox!, leafBox!),
          `${w}x${h}: ${testid}'s row ${JSON.stringify(rowBox)} is not fully inside the member leaf`,
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

test.describe("briefing: D3 — the party foot-rail note and the help plaque stay clear of each other", () => {
  for (const [w, h] of FOLDS) {
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

      // The note's own text is not clipped VERTICALLY: it is a one-line ellipsised aside
      // on the party foot rail now (it lost the tagline ribbon with the split), so a
      // second line appearing — or the line being cut mid-height the way the delivered
      // frame showed — is what this catches. Horizontal truncation IS the design here
      // (`text-overflow: ellipsis`) and is deliberately not asserted.
      const clip = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="brief-note"]');
        return el ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight } : null;
      });
      expect(clip, "brief-note has no box").not.toBeNull();
      expect(
        clip!.scrollHeight,
        `${w}x${h}: ribbon text clipped (scrollHeight ${clip!.scrollHeight} > clientHeight ${clip!.clientHeight})`,
      ).toBeLessThanOrEqual(clip!.clientHeight + 1);

      // THE SAME TRAP, MOVED. `#brief-castle` went with the tagline ribbon (the note is a
      // plain italic aside on the party foot rail now, per the approved mockup), so a
      // `getAttribute` on it would return `null` and pass VACUOUSLY — worse than no
      // check. The element that now holds a `.textContent`-written sibling is
      // `#brief-step`, whose two spans `renderBriefingText` writes independently: assert
      // BOTH survive a real repaint, which is what destroying a sibling would break.
      await openMember(page);
      await expect(page.getByTestId("brief-member-name")).not.toHaveText("");
      const job = page.getByTestId("prep-job");
      const jobValues = await job.locator("option").evaluateAll((os) =>
        os.map((o) => (o as HTMLOptionElement).value),
      );
      const currentJob = await job.inputValue();
      const other = jobValues.find((v) => v !== currentJob);
      if (other !== undefined) await job.selectOption(other);
      await expect(page.getByTestId("brief-step"), "the battle number was destroyed by a repaint").toContainText(
        "Battle 1 of 5",
      );
      await expect(
        page.getByTestId("brief-member-name"),
        "the rail's member name was destroyed by a repaint",
      ).not.toHaveText("");
      await backToParty(page);

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
  for (const [w, h] of FOLDS) {
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

test.describe("briefing: B1 — the Deploy plate clears every roster card", () => {
  for (const [w, h] of FOLDS) {
    test(`${w}x${h}: deploy's box intersects no roster card and no other party-view control`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);

      // The plate is a PARTY-VIEW control now (the split put it there and nowhere else),
      // so the things it can collide with are the roster cards and the foot rail — the
      // `prep-*` controls it used to share a leaf with are two taps away and cannot be
      // on screen at the same time. That the plate is absent from the member view is
      // asserted in "briefing: the two views"; this is the geometry half.
      const sealBox = await page.getByTestId("deploy").boundingBox();
      expect(sealBox, `${w}x${h}: deploy has no box`).not.toBeNull();

      // Read off the LIVE DOM rather than re-listed here, so a future party-view control
      // is covered with no change to this test.
      const otherBoxes = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#leaf-party .ptab, #leaf-party .note, #leaf-party .ready, [data-testid="brief-deploy-note"]')]
          .map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (cs.display === "none" || cs.visibility === "hidden" || r.width === 0 || r.height === 0) {
              return null;
            }
            return {
              label: el.dataset["testid"] ?? el.className,
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
            };
          })
          .filter((b): b is { label: string; x: number; y: number; width: number; height: number } => b !== null),
      );
      expect(otherBoxes.length, `${w}x${h}: nothing was measured — the selector found no live control`).toBeGreaterThan(4);
      for (const box of otherBoxes) {
        expect(
          boxesIntersect(sealBox!, box),
          `${w}x${h}: deploy ${JSON.stringify(sealBox)} intersects ${box.label} ${JSON.stringify(box)}`,
        ).toBe(false);
      }
      // MUTATION (run): remove `#screen-briefing.party .roster { padding-bottom: 1.8em; }`
      // (overhaul.css) — the cards fill the roster box right down to the leaf's bottom
      // corner, the last card's foot runs under the wax plate, and this goes red at both
      // folds. That reservation exists BECAUSE the split's cards fill their box; the old
      // fixed-aspect cards left slack that hid the collision.
    });
  }
});

test.describe("briefing: B2 — the body scroll lock extends to the briefing screen", () => {
  test("832x328: body.overflow matches title/scene's own rule, and the page does not scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 832, height: 328 });
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
    await page.mouse.move(400, 200);
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
  for (const [w, h] of FOLDS) {
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
