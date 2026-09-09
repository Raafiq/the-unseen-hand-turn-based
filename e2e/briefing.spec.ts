import { test, expect, type Page } from "@playwright/test";
import {
  backToParty,
  closeLearn,
  dismissScene,
  openDossier,
  openLearn,
  openMember,
  openViewerPrep,
  startNewGame,
} from "./helpers.js";
// `with { type: "json" }` is required here: this file goes through Node's ESM loader,
// not Vite's, and a bare JSON import breaks only the browser job (campaign.spec.ts's
// own file-banner comment).
import storyPack from "../data/campaign/story/camp-the-first-march.story.json" with { type: "json" };
import campaignPack from "../data/campaign/camp-the-first-march.json" with { type: "json" };
import basePack from "../data/base-pack.json" with { type: "json" };

/**
 * The briefing screen, SPLIT INTO TWO VIEWS (owner decision 2026-09-07):
 *
 *   PARTY  — the roster alone on one full-width leaf, one big portrait card per member,
 *            the battle title/number AND the story beat on the top rail, the wax Deploy
 *            plate. One tap anywhere on a card opens that member.
 *   MEMBER — THE CHARACTER DOSSIER (owner: "Approve", 2026-09-09). One sheet, no tabs:
 *            a 1x6 portrait rail at the far left, then identity / Stats / Profile on the
 *            left and Wielded Gear / Worn Armor / Skills / Job Customization on the
 *            right. The back plaque on the top rail is the only way out. No Deploy.
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

/**
 * The party ids, IN ROSTER ORDER, READ FROM THE CAMPAIGN THE PAGE LOADS — not typed out.
 * A literal list would keep passing after the roster changed under it, which is exactly
 * how the old four-name copy of this constant went stale against a six-member party.
 */
const PARTY: readonly string[] = campaignPack.party.map((r) => r.id);

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

test.describe("briefing: the dossier is ONE sheet", () => {
  test("no tab bar survives; Stats is titled Stats and names its eight keys in order", async ({
    page,
  }) => {
    await toBriefing(page);
    await openDossier(page);

    // THE TABS ARE GONE, asserted by ROLE rather than by class: `role="tab"` is what a
    // tab IS to a screen reader, so a plaque that kept the look and dropped the role — or
    // kept the role and dropped the look — is still caught. Scoped to the member view so
    // this cannot be satisfied by some other screen having no tabs either.
    await expect(page.locator('#screen-briefing [role="tab"]')).toHaveCount(0);
    await expect(page.locator("#screen-briefing .tabs")).toHaveCount(0);
    // MUTATION (run): leave ONE tab button in `prep.ts`'s dossier branch → this goes red.

    // Everything the three tabs used to hide is on one sheet, at the same time.
    await expect(page.getByTestId("prep-stats")).toBeVisible();
    await expect(page.getByTestId("prep-reaction")).toBeVisible();
    await expect(page.getByTestId("prep-traits")).toBeVisible();
    await expect(page.getByTestId("prep-weapon")).toBeVisible();
    await expect(page.getByTestId("prep-job")).toBeVisible();

    // "Standing" is gone from the screen and the block is titled "Stats" (owner). The
    // heading is read off the block's own preceding heading, not searched for anywhere
    // on the page — a page-level `toContainText("Stats")` would pass on any stray word.
    const statsHeading = page
      .getByTestId("prep-stats")
      .locator("xpath=preceding-sibling::h3[1]");
    await expect(statsHeading).toHaveText("Stats");
    await expect(page.locator("#screen-briefing")).not.toContainText("Standing");

    // THE EIGHT KEYS, IN ORDER — identity, not count. A grid that dropped MA and drew HP
    // twice has eight cells and would pass a length check.
    // The rendered form, uppercased by `.stat-row .k`'s own `text-transform` — the same
    // reading (and the same reason) as the `.jcap` assertion further down this file.
    const keys = await page.locator('[data-testid="prep-stats"] li .k').allInnerTexts();
    expect(keys.map((k) => k.trim())).toEqual([
      "HP",
      "ATTACK",
      "PA",
      "MA",
      "MOVE",
      "EVADE",
      "BRAVE",
      "FAITH",
    ]);
  });

  test("Worn Armor is a stated absence: one disabled row, no control, its own glyph", async ({
    page,
  }) => {
    await toBriefing(page);
    await openDossier(page);

    const armor = page.getByTestId("prep-armor");
    await expect(armor).toBeVisible();
    await expect(armor).toHaveText("No armor equipped");
    // NO CONTROL, because the engine models no armour slot — the absent-not-zero rule
    // drawn rather than hidden (the heading is the owner's). A `<select>` here would
    // promise a choice the sim cannot honour, and a chevron would promise one too.
    await expect(armor.locator("select")).toHaveCount(0);
    await expect(armor.locator('svg[data-icon="chev"]')).toHaveCount(0);
    // IDENTITY, not presence: every slot row on this screen holds *an* svg, so
    // `svg` alone cannot tell the cuirass from the sword.
    await expect(armor.locator('svg[data-icon="cuirass"]')).toHaveCount(1);
    // MUTATION (run): put a `<select>` back in the armour row in `prep.ts` → the
    // select assertion goes red.

    // And the heading above it is the owner's word, not a paraphrase.
    await expect(armor.locator("xpath=preceding-sibling::h3[1]")).toHaveText("Worn Armor");
  });

  test("every rule the sheet enforces is VISIBLE text, never a `title` a thumb cannot open", async ({
    page,
  }) => {
    await toBriefing(page);
    await openDossier(page);

    // THE PRIMARY SLOT'S LOCK. The padlock is the approved mark and it stays, but a mark
    // plus a tooltip is nothing at all on a touch screen — the words ride the caption,
    // where there is width for them, rather than the value line pass 7 had to clear.
    const primary = page.getByTestId("prep-primary");
    await expect(primary.locator('svg[data-icon="lock"]')).toHaveCount(1);
    await expect(primary).toContainText(/locked to job/i);
    await expect(primary.locator("select")).toHaveCount(0); // no control: it is the job's

    // THE TRAIT CAP IS A REAL RULE — `onTraitToggle` slices the checked set to two — so a
    // player who earns a third and finds the box refusing to tick must have been told.
    await expect(page.getByTestId("prep-traits")).toContainText("max 2");

    // THE UNUSED-WEAPON MARK carries its own COUNT rather than hiding it in a tooltip.
    const weaponHint = page.getByTestId("prep-weapon-hint");
    if ((await weaponHint.count()) > 0) await expect(weaponHint).toContainText(/\d+ owned/);

    // NOTHING ON THIS SHEET SAYS SOMETHING ONLY IN A `title`. Enumerated rather than
    // spot-checked: any element carrying a title whose words are not also on screen is a
    // sentence a touch player can never read. `.lockwrap` is exempted by having no title
    // at all now; the roundels and rails carry none.
    const titleOnly = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("#screen-briefing [title]")) {
        const t = (el.getAttribute("title") ?? "").trim();
        if (t === "") continue;
        const seen = (el.textContent ?? "").toLowerCase();
        // A title that merely repeats or labels its own visible text is fine.
        if (seen.includes(t.toLowerCase())) continue;
        out.push(`${el.tagName.toLowerCase()}[${el.dataset["testid"] ?? el.className}] = ${t}`);
      }
      return out;
    });
    // The two that remain are labels on ICON-ONLY plaques (the back plaque, the help
    // disc), where the title IS the accessible name and there is no text to duplicate —
    // both also carry `aria-label`. Anything else is a sentence with nowhere to be read.
    expect(titleOnly.filter((t) => !/member-back|help-open|brief-quit|prep-ap/.test(t))).toEqual([]);
    // MUTATION (run): move "locked to job" back into a `title` on `.lockwrap` → the
    // `toContainText` goes red AND the sweep above reports it.
  });
});

test.describe("briefing: the 1x6 portrait rail", () => {
  test("six cells in the campaign's own roster order; tapping one swaps the sheet in place", async ({
    page,
  }) => {
    await toBriefing(page);
    await openDossier(page, "pc-briar");

    // EXACTLY THE CAMPAIGN'S PARTY, IN ITS OWN ORDER — read off the campaign JSON the
    // page loads, so a rail that sorted, filtered or reversed fails here rather than
    // looking plausible. A count check alone would pass a rail showing one member six
    // times.
    const ids = await page
      .locator('[data-testid="dossier-rail"] button.rtab')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["member"] ?? ""));
    expect(ids).toEqual([...PARTY]);
    expect(ids).toHaveLength(6);
    // MUTATION (run): reverse `model.records()` in `railHtml()` → this goes red while a
    // length-only check stays green.

    // The open member is the one the sheet is showing, and it is marked.
    await expect(page.locator('[data-testid="dossier-rail"] li.on button.rtab')).toHaveAttribute(
      "data-member",
      "pc-briar",
    );

    // TAP A DIFFERENT FACE: the sheet swaps IN PLACE. Three claims, because two of them
    // pass on their own for the wrong reason — the name alone would pass if the tap had
    // bounced back to party select and re-opened Kest, and the header alone would pass if
    // only the chrome updated.
    await page.locator('[data-testid="dossier-rail"] button.rtab[data-member="pc-kest"]').click();
    await expect(page.locator("#screen-briefing .nameline h2")).toHaveText("Kest");
    await expect(page.getByTestId("brief-member-name")).toContainText("managing Kest");
    await expect(page.getByTestId("prep-roster")).toBeHidden();
    await expect(page.getByTestId("dossier-sheet")).toBeVisible();
    await expect(page.locator('[data-testid="dossier-rail"] li.on button.rtab')).toHaveAttribute(
      "data-member",
      "pc-kest",
    );

    // THE RAIL ADDS TO THE CARD TAP, IT DOES NOT REPLACE IT (owner). Back out and the
    // party card still opens the member it names — and it opens the one the rail left
    // selected, so the two pickers cannot hold different opinions.
    await backToParty(page);
    await expect(
      page.locator('[data-testid="prep-roster"] li.member.on button.ptab'),
    ).toHaveAttribute("data-member", "pc-kest");
    await page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-isla"]').click();
    await expect(page.locator("#screen-briefing .nameline h2")).toHaveText("Isla");
  });
});

test.describe("briefing: the Profile block", () => {
  test("the lore on screen is the OPEN member's, read from the story pack at test time", async ({
    page,
  }) => {
    await toBriefing(page);

    // THE EXPECTED STRING COMES OUT OF THE PACK, never out of this file: the pack is
    // swappable by contract (docs/11 AC-M4) and `npm run check:story` fails a test that
    // pins its prose.
    const loreFor = (rosterId: string): string => {
      const c = storyPack.characters.find((ch) => `pc-${ch.id}` === rosterId);
      const lore = (c as { lore?: string } | undefined)?.lore;
      expect(lore, `the pack authors no lore for ${rosterId}`).toBeTruthy();
      return lore as string;
    };

    // TWO MEMBERS, and they must not share a line — a Profile hard-wired to one
    // character, or to the first record in the party, passes a single-member check.
    const briar = loreFor("pc-briar");
    const kest = loreFor("pc-kest");
    expect(briar).not.toBe(kest);

    await openDossier(page, "pc-briar");
    await expect(page.getByTestId("prep-lore")).toHaveText(briar);
    await openDossier(page, "pc-kest");
    await expect(page.getByTestId("prep-lore")).toHaveText(kest);
    // MUTATION (run): point `loreFor` in `game.ts` at a fixed member (`pc-vance`) →
    // both assertions go red.
  });

  test("the traits control is still on the sheet, still writes the save", async ({ page }) => {
    await toBriefing(page);
    await openDossier(page, "pc-briar");
    const box = page.locator('[data-testid="prep-traits"] input[data-trait]').first();
    await expect(box).toBeVisible();
    const trait = await box.getAttribute("data-trait");
    expect(trait).toBeTruthy();
    await box.check();
    // THE SAVE, not the checkbox: a control that ticks and tells nobody looks identical.
    await page.reload();
    await page.getByTestId("continue").click();
    await openDossier(page, "pc-briar");
    await expect(
      page.locator(`[data-testid="prep-traits"] input[data-trait="${trait}"]`),
    ).toBeChecked();
  });
});

test.describe("briefing: Job Customization", () => {
  test("CHANGE JOBS moves focus to the Main job select", async ({ page }) => {
    await toBriefing(page);
    await openDossier(page);
    const changeJobs = page.getByTestId("prep-change-jobs");
    await expect(changeJobs).toBeVisible();
    await changeJobs.click();
    // IDENTITY of the focused node, not "something is focused": the module holds two
    // selects and the sheet holds seven, so `document.activeElement.tagName` would pass
    // on any of them.
    const focused = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset["testid"] ?? null,
    );
    expect(focused).toBe("prep-job");
    // MUTATION (run): drop the `job.focus()` call in `prep.ts`'s change-jobs handler →
    // this goes red (focus stays on the plate itself).
  });
});

/**
 * The learn overlay (owner-approved pass 14): a LEARN plate on the Skills heading opens a
 * parchment leaf over the right column. It exists because the approved dossier has no
 * room for a permanent learn list and deleting the list would take AP spending out of
 * the game (ADR-0027 tunes the finale so a party that never spends AP loses it).
 */
test.describe("briefing: the learn overlay", () => {
  /** The tree of a job, straight out of the pack the page loads: node ids, in order. */
  const treeNodes = (jobId: string): string[] => {
    const job = basePack.jobs.find((j) => j.id === jobId);
    expect(job, `the pack has no job "${jobId}"`).toBeTruthy();
    return job!.tree.map((n) => n.node);
  };
  /**
   * The node id as the panel prints it. MIRRORS `prep.ts`'s `prettify` — the pack ships
   * no display name, so the label is derived, and a test that invented its own wording
   * would be asserting itself. Kept to the de-kebab only; the ids that get a hand-written
   * label (`ABILITY_LABEL`) are all in other skillsets.
   */
  const asLabel = (node: string): string =>
    node.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
  /** The job a party member starts in, from the campaign def rather than from memory. */
  const jobOf = (id: string): string => {
    const rec = campaignPack.party.find((r) => r.id === id);
    expect(rec, `the campaign has no member "${id}"`).toBeTruthy();
    return rec!.currentJob;
  };

  test("LEARN sits on the Skills heading and opens a dialog named for the OPEN member's job", async ({
    page,
  }) => {
    await toBriefing(page);
    await openDossier(page, "pc-briar");

    const plate = page.getByTestId("prep-learn-open");
    await expect(plate).toHaveText("Learn");
    // ON THE HEADING, not merely near it: the plate is a DOM child of the Skills `<h3>`
    // and the approved frame puts it on that rule. A box check is what would catch it
    // drifting into the rows below.
    const headBox = await page.locator("#screen-briefing .blk-skills > .sect").boundingBox();
    const plateBox = await plate.boundingBox();
    expect(boxInside(plateBox!, headBox!), "LEARN is not inside the Skills heading's box").toBe(true);
    await expect(page.getByTestId("dossier-learn")).toHaveCount(0);

    await plate.click();
    const dialog = page.locator('#screen-briefing [role="dialog"]');
    await expect(dialog).toHaveCount(1);
    // AND IT IS NOT `aria-modal`. The leaf covers the right column only — the rail, the
    // identity block, Stats and the traits checkbox stay visible and tabbable under it —
    // so a modal flag would tell a screen reader the rest of the page is inert when it is
    // not. Asserted as ABSENT rather than left unsaid, because "we removed it" is a claim.
    await expect(dialog).not.toHaveAttribute("aria-modal", /.*/);
    // THE NAME CARRIES THE JOB, and the expected job is read from the campaign def — a
    // literal "Archer" here would pass on a label hard-wired to one word.
    const briarJob = jobOf("pc-briar");
    expect(briarJob).not.toBe(jobOf("pc-kest")); // the two members must DIFFER, or this proves nothing
    await expect(dialog).toHaveAttribute("aria-label", new RegExp(asLabel(briarJob), "i"));

    // THE DISCRIMINATING SECOND MEMBER: Kest is a wizard. A label fixed to "Archer"
    // satisfies Briar and fails here, which is the whole point of running both.
    await closeLearn(page);
    await openLearn(page, "pc-kest");
    await expect(page.locator('#screen-briefing [role="dialog"]')).toHaveAttribute(
      "aria-label",
      new RegExp(asLabel(jobOf("pc-kest")), "i"),
    );
    // MUTATION (run): hard-code `Learn · Archer` as the title in `learnOverlayHtml()` →
    // the Kest assertion goes red and the Briar one stays green.
  });

  test("the overlay lists the open member's OWN job tree, in the pack's order", async ({ page }) => {
    await toBriefing(page);
    await openLearn(page, "pc-briar");
    // IDENTITY AND ORDER, off the pack: `data-node` is what the content authors, so this
    // cannot be satisfied by a list of the right LENGTH or by the right names in the
    // wrong order.
    const nodes = await page
      .locator('[data-testid="prep-learn"] li')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["node"] ?? ""));
    expect(nodes).toEqual(treeNodes(jobOf("pc-briar")));
    // …and the ids are what the rows actually SAY, so a list keyed right and labelled
    // wrong fails too.
    // The row's own NAME, not its chips: `.n` also carries the slot mark ("support") and
    // the "no effect yet" tag, which are a different claim and are asserted elsewhere.
    const names = await page
      .locator('[data-testid="prep-learn"] li .n')
      .evaluateAll((els) => els.map((e) => (e.firstChild?.textContent ?? "").trim()));
    expect(names).toEqual(nodes.map(asLabel));
    // MUTATION (run): point `learnRowsHtml()` at another job's tree (`model.learnRows()`
    // → the wizard's) → both assertions go red.
  });

  test("buying Piercing Shot stamps it LEARNED, charges BOTH AP readouts, and names it in the receipt", async ({
    page,
  }) => {
    await toBriefing(page);
    // THE FIXTURE IS THE SAVE, through the real slot — nobody banks AP before battle 1,
    // and a test that played two battles to earn some would be measuring the campaign's
    // pacing instead of this control. 500 clears the 120-AP node with room to spare.
    await page.evaluate(() => {
      const stored = localStorage.getItem("tuh.campaign.v1");
      if (stored === null) throw new Error("no save in localStorage after New Game");
      const raw = JSON.parse(stored) as { party: { id: string; ap: number }[] };
      const briar = raw.party.find((r) => r.id === "pc-briar");
      if (!briar) throw new Error("no pc-briar in the save");
      briar.ap = 500;
      localStorage.setItem("tuh.campaign.v1", JSON.stringify(raw));
    });
    await page.reload();
    await page.getByTestId("continue").click();
    await dismissScene(page);
    await openLearn(page, "pc-briar");

    const row = page.locator('[data-testid="prep-learn"] li[data-node="piercing-shot"]');
    const price = Number((await row.locator("button.buy").innerText()).replace(/[^0-9]/g, ""));
    expect(price, "piercing-shot is priced in the pack").toBe(
      basePack.jobs.find((j) => j.id === jobOf("pc-briar"))!.tree.find((n) => n.node === "piercing-shot")!
        .apCost,
    );
    const apOf = async (testid: string): Promise<number> =>
      Number((await page.getByTestId(testid).innerText()).replace(/[^0-9]/g, ""));
    expect(await apOf("learn-ap")).toBe(500);
    expect(await apOf("prep-ap")).toBe(500);

    await row.locator("button.buy").click();

    // The row is DONE, not merely un-buyable: `.known` and the LEARNED stamp, no plaque.
    await expect(row).toHaveClass(/known/);
    await expect(row.locator(".s")).toHaveText("learned");
    await expect(row.locator("button.buy")).toHaveCount(0);
    // BOTH readouts, because the overlay prints the AP a second time and a panel that
    // updated only the one under the player's thumb looks correct from inside the overlay.
    expect(await apOf("learn-ap")).toBe(500 - price);
    expect(await apOf("prep-ap")).toBe(500 - price);
    // The receipt names the ABILITY, and the name comes from the pack's node id — not
    // from prose typed here.
    await expect(page.getByTestId("prep-receipt")).toContainText(asLabel("piercing-shot"));
    // MUTATION (run): print `record.ap` in the identity block from a value captured
    // before the buy (a stale copy) → the `prep-ap` assertion goes red and the
    // `learn-ap` one stays green, which is what tells the two readouts apart.

    // AND IT REACHED THE SAVE, not just the panel: the reload is the load-bearing half.
    await page.reload();
    await page.getByTestId("continue").click();
    await openLearn(page, "pc-briar");
    await expect(
      page.locator('[data-testid="prep-learn"] li[data-node="piercing-shot"]'),
    ).toHaveClass(/known/);
    expect(await apOf("prep-ap")).toBe(500 - price);
  });

  test("Close, Escape and a rail tap all shut it; focus goes back to LEARN", async ({ page }) => {
    await toBriefing(page);
    await openLearn(page, "pc-briar");
    // FOCUS FOLLOWS THE PLAYER: on open it is on the way out, so a keyboard user is not
    // dropped at the top of the document.
    expect(
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset["testid"] ?? null),
    ).toBe("prep-learn-close");

    await page.getByTestId("prep-learn-close").click();
    await expect(page.getByTestId("dossier-learn")).toHaveCount(0);
    expect(
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset["testid"] ?? null),
    ).toBe("prep-learn-open");

    await page.getByTestId("prep-learn-open").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dossier-learn")).toHaveCount(0);
    expect(
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset["testid"] ?? null),
    ).toBe("prep-learn-open");

    // A RAIL TAP WHILE IT IS OPEN closes it. Leaving it up would show Briar's tree over
    // Kest's dossier, and its buy plaques would spend Kest's AP on Briar's prices.
    await page.getByTestId("prep-learn-open").click();
    await expect(page.getByTestId("dossier-learn")).toHaveCount(1);
    await page.locator('[data-testid="dossier-rail"] button.rtab[data-member="pc-kest"]').click();
    await expect(page.getByTestId("dossier-learn")).toHaveCount(0);
    await expect(page.locator("#screen-briefing .nameline h2")).toHaveText("Kest");
    // MUTATION (run): drop the `learn = "closed"` line from the rail handler in
    // `prep.ts` → this assertion goes red with Briar's Aim tree over Kest's sheet.
  });

  test("it does not survive leaving the member view — Back, or the next briefing", async ({
    page,
  }) => {
    // THE PANEL IS MOUNTED ONCE FOR THE WHOLE SESSION and the overlay is state inside that
    // closure, so nothing in `prep.ts` can see a player leave. Both exits are asserted
    // because they are two different call sites (`setBriefView` and `renderScreens`) and
    // fixing one leaves the other.
    await toBriefing(page);
    await openLearn(page, "pc-briar");
    await expect(page.getByTestId("dossier-learn")).toHaveCount(1);

    // EXIT ONE: the Back plaque, then a DIFFERENT member — the failure was Briar's job
    // tree standing over Kest's sheet.
    await page.getByTestId("member-back").click();
    await expect(page.getByTestId("prep-roster")).toBeVisible();
    await page.locator('[data-testid="prep-roster"] .ptab[data-member="pc-kest"]').click();
    await expect(page.locator("#screen-briefing .nameline h2")).toHaveText("Kest");
    await expect(
      page.getByTestId("dossier-learn"),
      "the overlay survived Back and opened over the next member",
    ).toHaveCount(0);
    // MUTATION (run): drop the `prep?.closeLearn()` call from `setBriefView` in `game.ts`
    // → this goes red and the re-entry half below stays green.

    // EXIT TWO: the whole SCREEN. Leave the briefing with the overlay open, fight, come
    // back — the entry reset (AC-V60) has to take the overlay with it.
    await page.getByTestId("prep-learn-open").click();
    await expect(page.getByTestId("dossier-learn")).toHaveCount(1);
    // THROUGH THE SEAM, and said plainly: no click reaches this today. The wax Deploy
    // plate is on party select, so the only way out of the member view is Back — which is
    // exit one. `window.tuhGame.deploy()` is the same command that plate emits (docs/10
    // §7: the seam is the shipped path, not a parallel one), and it is what leaves the
    // briefing with `briefView === "member"` still set. The reset in `renderScreens` is
    // what makes that safe, and this is the only way to see it fail.
    await page.evaluate(() => window.tuhGame.deploy());
    await expect(page.getByTestId("screen-battle")).toBeVisible();
    await page.evaluate(() => window.tuhGame.autoplay());
    await page.getByTestId("conclude").click();
    await expect(page.getByTestId("screen-after")).toBeVisible();
    const nextBtn = page.getByTestId("next");
    await ((await nextBtn.isVisible()) ? nextBtn : page.getByTestId("retry")).click();
    await dismissScene(page);
    await expect(page.getByTestId("screen-briefing")).toBeVisible();
    await openMember(page, "pc-briar");
    await expect(
      page.getByTestId("dossier-learn"),
      "the overlay survived a whole battle and reopened on the next briefing",
    ).toHaveCount(0);
    // MUTATION (run): drop the `prep?.closeLearn()` from `renderScreens` → this half goes
    // red and the Back half stays green.
  });

  test("Escape closes it from anywhere in the member view, not only from inside it", async ({
    page,
  }) => {
    await toBriefing(page);
    await openLearn(page, "pc-briar");
    // FOCUS SOMEWHERE THE OVERLAY DOES NOT COVER. The leaf is over the RIGHT column only,
    // so the traits checkbox is visible, tabbable and outside it — which is exactly the
    // spot a listener bound to the overlay node cannot hear.
    await page.locator('[data-testid="prep-traits"] input[data-trait]').first().focus();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dossier-learn")).toHaveCount(0);
    // MUTATION (run): move the listener back onto the `dossier-learn` node → red (the key
    // never reaches it), while the "Close, Escape and a rail tap" test above stays green
    // because there focus starts on Close, inside the overlay.
  });

  test("the AP readout is a readout: it is not a button and opens nothing", async ({ page }) => {
    await toBriefing(page);
    await openDossier(page, "pc-briar");
    const ap = page.getByTestId("prep-ap");
    // LEARN IS THE ONLY DOOR (owner, pass 14). The readout briefly WAS the door, which is
    // an affordance nobody can see — so this asserts the tag as well as the behaviour.
    expect(await ap.evaluate((e) => e.tagName)).toBe("P");
    await ap.click();
    await expect(page.getByTestId("dossier-learn")).toHaveCount(0);
    // MUTATION (run): restore the readout as a `<button>` with the open handler → both
    // the tag assertion and the click assertion go red.
  });

  for (const [w, h] of FOLDS) {
    test(`${w}x${h}: the overlay's last row stays inside its own leaf`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);
      await openLearn(page, "pc-briar");
      const sheet = await page.locator("#screen-briefing .learnsheet").boundingBox();
      expect(sheet, `${w}x${h}: the learn leaf has no box`).not.toBeNull();
      // THE SPEND LINE IS THE LAST THING IN THE LEAF, so it is what falls out when the
      // overlay grows. The list itself scrolls by design (a long tree is longer than any
      // fold), which is why the assertion is on the line UNDER it and not on the rows.
      const hint = await page.getByTestId("prep-spend-hint").boundingBox();
      expect(hint, `${w}x${h}: the spend line has no box`).not.toBeNull();
      expect(
        boxInside(hint!, sheet!),
        `${w}x${h}: the spend line ${JSON.stringify(hint)} has left the leaf ${JSON.stringify(sheet)}`,
      ).toBe(true);
      // The rows are scrollable, so "the list fits" is not the claim; "the list has room
      // to scroll IN" is, and a list squeezed to nothing is what that catches.
      const list = await page.getByTestId("prep-learn").boundingBox();
      expect(list!.height, `${w}x${h}: the learn list is squeezed to a sliver`).toBeGreaterThan(60);
      // MUTATION (run): `.learn-list { flex: 0 1 auto }` → `0 0 auto` in overhaul.css (the
      // list stops shrinking, so its full 324px of rows push the spend line out of a
      // 238px leaf) → red at BOTH folds.
      // MUTATION (run, and it does NOT fail — said because a mutation that stays green
      // is the more useful half): +48px of padding on `.learnsheet` keeps everything
      // inside, because the list shrinks by exactly that much and scrolls. The leaf
      // absorbing extra chrome is correct; what this test guards is the list refusing to.
    });
  }
});

test.describe("briefing: an edit does not throw focus away", () => {
  test("changing an equipped item leaves focus on the control that changed it", async ({ page }) => {
    await toBriefing(page);
    await openDossier(page, "pc-briar");
    // THE WEAPON SELECT, not the Secondary: at battle 1 nobody has learned enough of a
    // second job for `equippableSecondaryJobs()` to offer one, so that control has exactly
    // one option and "change it" is not a thing a player can do. The weapon drip has
    // already landed two, which makes this the discriminating edit AND the ordinary one.
    const sec = page.getByTestId("prep-weapon");
    const values = await sec.locator("option").evaluateAll((os) =>
      os.map((o) => (o as HTMLOptionElement).value),
    );
    const current = await sec.inputValue();
    const next = values.find((v) => v !== current);
    expect(next, "prep-weapon offers nothing else to equip — nothing to change").toBeDefined();
    await sec.focus();
    await sec.selectOption(next!);
    await expect(sec).toHaveValue(next!); // the edit really landed
    // EVERY EDIT REPAINTS THE WHOLE PANEL, so the select the player just used is a
    // detached node and focus falls to `<body>` — on a keyboard that is being thrown back
    // to the top of the document on every equip.
    expect(
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset["testid"] ?? null),
      "the repaint dropped focus",
    ).toBe("prep-weapon");
    // MUTATION (run): drop the refocus from `act()` in `prep.ts` → red (focus is `body`).
  });
});

test.describe("briefing: control manifest", () => {
  /**
   * AC-V53. Every testid this screen's code can emit that the two views OWN, tagged with
   * which VIEW it belongs to (party select / member detail), which STATE of the member
   * view shows it, and whether the node itself may be OMITTED — not merely hidden — in
   * some state, the absent-not-zero rule (a weapon row before any weapon is owned, a
   * receipt before any purchase).
   *
   * "both" IS NOT LAZINESS: the learn overlay is laid OVER the right column, it does not
   * replace the sheet, so every dossier control stays attached and visible underneath it
   * (covered, which `toBeHidden()` cannot see and should not claim). Only the overlay's
   * own ids and the door that opens it come and go.
   *
   * Built from `grep -oE 'data-testid="(prep|member|dossier)-[a-z-]*"'` across `prep.ts`
   * / `game.ts` / `index.html`, not copied from prose. The partition below is EXACT in
   * both directions: a stray id fails, and a stale key here fails too (its per-face loop
   * demands the node be present).
   */
  const MANIFEST: Record<
    string,
    { view: "party" | "member"; face: "both" | "sheet" | "overlay"; optional?: true }
  > = {
    // ── party select ────────────────────────────────────────────────────────────
    "prep-roster": { view: "party", face: "both" },
    // ── member detail: the DOSSIER, which the overlay COVERS rather than hides ───
    "member-back": { view: "member", face: "both" },
    "brief-member-name": { view: "member", face: "both" },
    "dossier-rail": { view: "member", face: "both" },
    "dossier-sheet": { view: "member", face: "both" },
    "prep-ap": { view: "member", face: "both" },
    "prep-stats": { view: "member", face: "both" },
    "prep-lore": { view: "member", face: "both" },
    "prep-traits": { view: "member", face: "both" },
    "prep-traits-hint": { view: "member", face: "both", optional: true },
    "prep-weapon": { view: "member", face: "both", optional: true },
    "prep-weapon-hint": { view: "member", face: "both", optional: true },
    "prep-armor": { view: "member", face: "both" },
    "prep-primary": { view: "member", face: "both" },
    "prep-secondary-skill": { view: "member", face: "both" },
    "prep-reaction": { view: "member", face: "both" },
    "prep-support": { view: "member", face: "both" },
    "prep-movement": { view: "member", face: "both" },
    "prep-change-jobs": { view: "member", face: "both" },
    "prep-job": { view: "member", face: "both" },
    "prep-secondary": { view: "member", face: "both" },
    // The door stays ATTACHED under the overlay — it is covered, not hidden, which is
    // what an overlay laid over one column actually does. Claiming otherwise would be a
    // `toBeHidden()` this screen cannot honour.
    "prep-learn-open": { view: "member", face: "both" },
    // ── member detail: the LEARN OVERLAY, built on demand ────────────────────────
    "dossier-learn": { view: "member", face: "overlay" },
    "prep-progression": { view: "member", face: "overlay" },
    "prep-tree": { view: "member", face: "overlay" },
    "prep-learn": { view: "member", face: "overlay" },
    "prep-learn-close": { view: "member", face: "overlay" },
    "learn-ap": { view: "member", face: "overlay" },
    "prep-spend-hint": { view: "member", face: "overlay", optional: true },
    "prep-receipt": { view: "member", face: "overlay", optional: true },
  };

  /** Every testid the partition scans. Widened with the dossier's own prefix. */
  const PARTITION_SELECTOR =
    '[data-testid^="prep-"], [data-testid^="member-"], [data-testid^="dossier-"], [data-testid="brief-member-name"]';

  test("every manifest control is attached on its view and face, or legitimately absent; nothing stray ships", async ({
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
    const checkView = async (view: "party" | "member", face: string): Promise<void> => {
      for (const [testid, spec] of Object.entries(MANIFEST)) {
        const el = page.locator(`[data-testid="${testid}"]`);
        const count = await el.count();
        const showing = spec.view === view && (spec.face === "both" || spec.face === face);
        if (showing) {
          if (spec.optional) {
            if (count === 0) continue; // absent-not-zero in THIS state, not a failure
            seenOptional.add(testid);
          }
          expect(count, `${testid} must be attached on the ${view} view's ${face} face`).toBeGreaterThan(0);
          await expect(el.first(), `${testid} must be VISIBLE on the ${view} view's ${face} face`).toBeVisible();
        } else if (count > 0) {
          await expect(
            el.first(),
            `${testid} must be hidden while the ${view} view's ${face} face is open`,
          ).toBeHidden();
        }
      }
    };

    /** Walk the member view's two states: the dossier, and the dossier + overlay. */
    const checkMemberFaces = async (): Promise<void> => {
      await closeLearn(page);
      await checkView("member", "sheet");
      await openLearn(page);
      await checkView("member", "overlay");
      await closeLearn(page);
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
     * {@link checkMemberFaces} for exactly that reason.
     */
    const checkFaces = async (id: string, name: string): Promise<void> => {
      await backToParty(page);
      // The party view has no faces; "sheet" is passed only so the member entries are
      // all judged as not-showing here.
      await checkView("party", "sheet");
      await openMember(page, id);
      await expect(
        page.getByTestId("brief-member-name"),
        `the manifest sweep asked for ${id} and the rail is managing someone else`,
      ).toContainText(name);
      await checkMemberFaces();
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
      await checkFaces(id, name);
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
      await openDossier(page, id);
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
    await checkFaces(equipped!.id, equipped!.name);

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
      await openLearn(page);
      const buyable = page.locator('[data-testid="prep-learn"] li button[data-learn]:not([disabled])').first();
      if ((await buyable.count()) === 0) continue;
      await buyable.click();
      bought = true;
      break;
    }
    expect(bought, "no party member has an affordable node after two battles — nothing to buy").toBe(true);
    await checkMemberFaces();

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
    // (the party/member split hides the other view's markup by CSS, but the dossier's two
    // FACES are conditionally rendered — one is not in the document at all while the other
    // is up — so the sweep opens both.)
    const found: string[] = [];
    for (const where of ["party", "sheet", "overlay"] as const) {
      await backToParty(page);
      if (where === "sheet") await openDossier(page);
      if (where === "overlay") await openLearn(page);
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
    // MUTATION 3: delete `data-testid="prep-support"` in `prep.ts` → the sheet-face
    // loop goes red.
    // MUTATION 4 (M3, previously run): delete `data-testid="prep-weapon-hint"` in
    // `weaponSlotHtml()` → `seenOptional` never gains it and the equality goes red.
    // MUTATION 5 (RUN 2026-09-08): make `checkFaces` ignore its id and call
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
      await openLearn(page);
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
      const traits = page.getByTestId("prep-traits");
      // `.tnone` is the dossier's empty state; `.empty` is the classic panel's, which the
      // viewer fallback below reads. Both, so neither branch can pass by looking at the
      // other's markup.
      const empty = traits.locator(".empty, .tnone");
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
    // The VIEWER's panel is still the classic tabbed layout — it is a showcase over a
    // fixed record, not the campaign's dossier — so this half drives its tab directly.
    await page.locator('.tab[data-tab="profile"]').click();
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
      await openDossier(page);
      await shortSide("member-back", page.getByTestId("member-back"));
      // EVERY SELECT ON THE DOSSIER, all on one sheet now — seven of them, not the four
      // the tabbed layout could show at once.
      for (const testid of [
        "prep-job",
        "prep-secondary",
        "prep-secondary-skill",
        "prep-reaction",
        "prep-support",
        "prep-movement",
      ]) {
        await tallEnough(testid, page.getByTestId(testid));
      }
      const weaponSelect = page.getByTestId("prep-weapon");
      if ((await weaponSelect.count()) > 0) await tallEnough("prep-weapon", weaponSelect);
      // THE RAIL'S SIX CELLS. 44px is the whole reason the rail bleeds through the
      // leaf's burn padding (overhaul.css): inside it the cells measure 43.3px at 328.
      const cellsEl = await page.locator('[data-testid="dossier-rail"] button.rtab').all();
      expect(cellsEl.length, `${w}x${h}: no rail cells`).toBe(6);
      for (const [i, cell] of cellsEl.entries()) {
        const box = await cell.boundingBox();
        expect(box, `${w}x${h}: rail cell ${i} has no box`).not.toBeNull();
        expect(box!.height, `${w}x${h}: rail cell ${i} height`).toBeGreaterThanOrEqual(floor);
      }
      // The two plate-shaped controls the dossier adds. Both are ~12-15px PICTURES with a
      // 44px overlay taken out of flow (the same construction `select.jval` uses), so
      // their `boundingBox()` is the wrong thing to measure — what a thumb hits is the
      // `::after`. MEASURED THROUGH `elementFromPoint`, walking y and taking the
      // CONTIGUOUS run that resolves to this control: that is direction-agnostic, so it
      // passes for Change Jobs (centred) and for the AP readout (anchored upward, because
      // `.ident`'s clip leaves it nowhere else to grow) without encoding either choice.
      // A stacking bug is invisible in a screenshot; only this can see one.
      const tapRun = async (testid: string): Promise<number> => {
        const box = await page.getByTestId(testid).boundingBox();
        expect(box, `${w}x${h}: ${testid} has no box`).not.toBeNull();
        return page.evaluate(
          ([id, x, y0]) => {
            const at = (y: number): string | null =>
              document
                .elementFromPoint(x as number, y)
                ?.closest("[data-testid]")
                ?.getAttribute("data-testid") ?? null;
            let top = y0 as number;
            let bottom = y0 as number;
            while (at(top - 1) === id && top > 0) top -= 1;
            while (at(bottom + 1) === id && bottom < window.innerHeight - 1) bottom += 1;
            return at(y0 as number) === id ? bottom - top + 1 : 0;
          },
          [testid, box!.x + box!.width / 2, box!.y + box!.height / 2] as const,
        );
      };
      // The AP readout is NOT in this list any more, and that is the point: pass 14 made
      // it plain text again, so a 44px floor on it would be asserting a control that no
      // longer exists. The two plates are the controls; both are ~9-15px PICTURES.
      for (const testid of ["prep-change-jobs", "prep-learn-open"]) {
        expect(await tapRun(testid), `${w}x${h}: ${testid}'s tappable height`).toBeGreaterThanOrEqual(floor);
      }
      await openLearn(page);
      expect(await tapRun("prep-learn-close"), `${w}x${h}: the overlay's Close`).toBeGreaterThanOrEqual(floor);
      await closeLearn(page);

      // A PACK-LEGAL LORE MUST NOT PUSH THE TRAITS CONTROL OFF THE SHEET. The story pack
      // is swappable by contract (`docs/11` AC-M4) and its schema allows 240 characters
      // (`StorySchema`'s `lore.max(240)`); the shipped lines are about half that, so the
      // fit measured above proves nothing about the NEXT pack.
      //
      // THE STRING IS PATHOLOGICAL ON PURPOSE, and that is the difference between a test
      // and a formality: 240 characters of ORDINARY prose wrap into three lines here and
      // fit with or without the clamp (measured — the first cut of this fixture used
      // "Lorem ipsum…" and stayed green against the very mutant it names). 240 characters
      // of twenty-letter words wrap into SIX, which is the case a pack can legally ship
      // and this screen cannot survive. Generated, not prose, so `check:story` has nothing
      // to pin and the fixture cannot drift into a copy of the shipped text.
      await page.evaluate(() => {
        const lore = document.querySelector('[data-testid="prep-lore"]');
        if (lore) lore.textContent = "Wwwwwwwwwwwwwwwwwwww ".repeat(12).slice(0, 240);
      });
      const sheetLong = await page.getByTestId("dossier-sheet").boundingBox();
      const traitsLong = await page.locator("#screen-briefing .traitline").boundingBox();
      expect(traitsLong, `${w}x${h}: the traits line has no box under a 240-char lore`).not.toBeNull();
      expect(
        boxInside(traitsLong!, sheetLong!),
        `${w}x${h}: a 240-character lore pushed the traits control off the sheet`,
      ).toBe(true);
      // MUTATION (run): remove `-webkit-line-clamp` from `.lore` in overhaul.css → the
      // lore grows to 71px, the traits line's bottom lands at 325.5 against a sheet that
      // ends at 307.5, red at 832x328 — and green at 832x384, which is what tells the two
      // folds apart.
      // MUTATION (run): delete `.jchange::after` in overhaul.css → all three runs collapse
      // to the plates' own ~9-15px and this goes red at both folds.
      // ── NO VERTICAL SCROLL, and then the check that can actually fail.
      //
      // The document-level reading is kept because it is the literal claim ("both folds
      // fit, no scroll") — but said plainly: on this screen it is NEARLY UNFALSIFIABLE.
      // `#screen-briefing` is pinned to the viewport and every box inside it has a fixed
      // height, so content that does not fit is clipped or painted outside its box rather
      // than lengthening the document. MEASURED, not assumed: adding 10px to `.profile`
      // leaves `documentElement.scrollHeight` at exactly `innerHeight`.
      //
      // `scrollHeight` on the SHEET is no better, for a reason worth writing down: every
      // 44px tap overlay (`select.gval`, `select.jval`, `.jchange::after`,
      // `.apline::after`) is `position: absolute` and overflows its own row BY DESIGN, so
      // `.sheet` reports scrollHeight 254 against clientHeight 238 on a perfectly fitting
      // page. A fit test built on it would be red from the first commit.
      //
      // WHAT DOES DISCRIMINATE is box containment of the LAST thing in each column — the
      // traits line on the left, the job cards on the right. Those are what fall off the
      // sheet when the dossier grows.
      const noScroll = async (where: string): Promise<void> => {
        const m = await page.evaluate(() => ({
          sh: document.documentElement.scrollHeight,
          ih: window.innerHeight,
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        expect(m.sh, `${w}x${h}: ${where} scrolls vertically (${m.sh} > ${m.ih})`).toBe(m.ih);
        expect(m.sw, `${w}x${h}: ${where} scrolls horizontally`).toBeLessThanOrEqual(m.cw + 1);
      };
      await noScroll("the dossier");
      const sheetBox = await page.getByTestId("dossier-sheet").boundingBox();
      expect(sheetBox, `${w}x${h}: the dossier sheet has no box`).not.toBeNull();
      for (const [name, sel] of [
        ["the traits line", "#screen-briefing .traitline"],
        ["the job cards", "#screen-briefing .jobrow"],
      ] as const) {
        const box = await page.locator(sel).boundingBox();
        expect(box, `${w}x${h}: ${name} has no box`).not.toBeNull();
        expect(
          boxInside(box!, sheetBox!),
          `${w}x${h}: ${name} ${JSON.stringify(box)} has fallen off the sheet ${JSON.stringify(sheetBox)}`,
        ).toBe(true);
      }
      await openLearn(page);
      await noScroll("the progression face");
      await closeLearn(page);
      // MUTATION (run): +10px on `.profile`'s margin does NOT go red — the left column
      // has ~29px of real slack at 328, because the shipped lore is shorter than the
      // mockup's sample prose. +48px DOES: the traits line leaves the sheet at 832x328
      // and stays inside at 832x384, which is what tells the two folds apart. Both
      // numbers are in the report rather than only the one that fails. Same construction
      // guards `.backplaque`'s 44px floor and `member-back`.
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

test.describe("briefing: D2 — the dossier's gear, stats and skill rows survive the short folds", () => {
  for (const [w, h] of FOLDS) {
    test(`${w}x${h}: the gear row, the first four Stats cells and the Primary/Reaction/Support rows are fully inside the leaf`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await toBriefing(page);
      await openDossier(page);
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

      // The dossier's LEFT column: the gear row + at least the first four Stats cells.
      const gearRowBox = await page
        .locator('[data-testid="prep-weapon"]')
        .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' gearrow ')][1]")
        .boundingBox();
      expect(gearRowBox, "gear row has no box").not.toBeNull();
      expect(
        boxInside(gearRowBox!, leafBox!),
        `${w}x${h}: gear row ${JSON.stringify(gearRowBox)} is not fully inside the member leaf ${JSON.stringify(leafBox)}`,
      ).toBe(true);

      const statCells = await page.locator('[data-testid="prep-stats"] li').all();
      expect(statCells.length, "no Stats rows found").toBeGreaterThanOrEqual(4);
      for (let i = 0; i < 4; i += 1) {
        const cellBox = await statCells[i]!.boundingBox();
        expect(cellBox, `Stats row ${i} has no box`).not.toBeNull();
        expect(
          boxInside(cellBox!, leafBox!),
          `${w}x${h}: Stats row ${i} ${JSON.stringify(cellBox)} is not fully inside the member leaf ${JSON.stringify(leafBox)}`,
        ).toBe(true);
      }

      // Skills: Primary, and the first two of Reaction/Support/Movement — the brief
      // names Reaction and Support explicitly, so both are asserted by name. No tab
      // click: the dossier shows all five slots at once, which is the point of it.
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
      // 44px-floored shape; both folds go red.
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
