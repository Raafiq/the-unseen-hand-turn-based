import { expect, type Page } from "@playwright/test";

/**
 * Helpers shared by the browser specs.
 *
 * `prepEveryMember` lives here rather than in one spec because two files need it and a
 * second copy would drift: it encodes ADR-0027's policy (spend on the member's OWN job
 * tree), and two versions of that would let one spec's walkthrough quietly stop matching
 * the player the campaign is tuned for.
 */

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
/**
 * Open the member DOSSIER — the campaign briefing's member detail (owner: "Approve",
 * 2026-09-09). One sheet: identity, Stats, Profile + traits on the left; Gear, Armor,
 * Skills and Job Customization on the right. There are no tabs to switch any more, so
 * the three-way `openPrepTab` this replaces is gone rather than kept as a shim that
 * names a control the screen no longer has.
 *
 * `/viewer.html`'s showcase panel still mounts the CLASSIC tabbed layout and drives
 * `.tab[data-tab=…]` directly (`e2e/prep.spec.ts`); nothing here touches it.
 */
export async function openDossier(page: Page, memberId?: string): Promise<void> {
  await openMember(page, memberId);
  await expect(page.getByTestId("dossier-sheet")).toBeVisible();
}

/**
 * Open the member view's LEARN OVERLAY — the AP-priced list, the tree picker and the
 * receipt — through the control a player uses: the LEARN plate on the Skills heading
 * (owner pass 14). The overlay exists because the approved dossier has no room for a
 * permanent learn list, and deleting the list would take AP spending out of the game
 * (ADR-0027 tunes the finale so an unspent party loses).
 */
export async function openLearn(page: Page, memberId?: string): Promise<void> {
  await openMember(page, memberId);
  // IDEMPOTENT: opening the overlay closes nothing, so a sweep that calls this on every
  // member cannot toggle itself shut — but the door is only in the DOM while the overlay
  // is closed, so the click is conditional on that rather than on a state attribute.
  if ((await page.getByTestId("dossier-learn").count()) === 0) {
    await page.getByTestId("prep-learn-open").click();
  }
  await expect(page.getByTestId("prep-learn")).toBeVisible();
}

/** Back to the dossier from the learn overlay. A no-op if it is not open. */
export async function closeLearn(page: Page): Promise<void> {
  const close = page.getByTestId("prep-learn-close");
  if ((await close.count()) === 0 || !(await close.isVisible())) return;
  await close.click();
  await expect(page.getByTestId("dossier-learn")).toHaveCount(0);
}

/**
 * Open a party member's detail view from the briefing's party select.
 *
 * TOLERANT about there being no roster at all — the engine viewer's prep screen mounts
 * the same panel with no picker in front of it — and about already being in the member
 * view when no particular member was asked for.
 *
 * STRICT ABOUT IDENTITY. The early return used to fire whenever the roster was hidden,
 * INCLUDING when a caller had named a member: the helper then quietly left whichever
 * member happened to be open and reported success, so a whole `for (const id of PARTY)`
 * sweep could inspect the same member six times and read as covering six. A named call
 * now backs out to party select first, and asserts afterwards that the member the screen
 * is showing is the one that was asked for — by NAME, off the card, so a handler bound
 * to the wrong card fails here instead of somewhere downstream.
 *
 * `memberId` is the ROSTER record id (`pc-briar`), not a battle slot id.
 */
export async function openMember(page: Page, memberId?: string): Promise<void> {
  const roster = page.getByTestId("prep-roster");
  if (!(await roster.isVisible())) {
    // Already in the member view, and this helper does NOT shut the overlay: the page is
    // supposed to do that on every exit from the member view, and a helper that tidied up
    // first would hide exactly that bug (it did — the overlay survived Back, the next
    // briefing and the next member, with every spec green).
    if (memberId === undefined) return;
    // Already in the member view: back out so the named card can actually be clicked.
    const back = page.getByTestId("member-back");
    if (!(await back.isVisible())) {
      throw new Error(
        `openMember("${memberId}"): no roster and no way back to one — this page cannot open a named member`,
      );
    }
    await back.click();
    await expect(roster).toBeVisible();
  }
  const card =
    memberId === undefined
      ? page.locator('[data-testid="prep-roster"] .ptab').first()
      : page.locator(`[data-testid="prep-roster"] .ptab[data-member="${memberId}"]`);
  // Read the name off the card BEFORE the click, so the assertion afterwards compares
  // the screen against the roster rather than against a name written down here.
  const wanted = (await card.locator(".pname").innerText()).trim();
  await card.click();
  await expect(page.getByTestId("prep")).toBeVisible();
  await expect(
    page.locator("#screen-briefing .nameline h2"),
    `openMember(${memberId ?? "first"}): the member view opened on someone else`,
  ).toHaveText(wanted);
}

/** Back out of a member's detail view to party select. A no-op if already there. */
export async function backToParty(page: Page): Promise<void> {
  const back = page.getByTestId("member-back");
  if (!(await back.isVisible())) return;
  await back.click();
  await expect(page.getByTestId("prep-roster")).toBeVisible();
}

export async function prepEveryMember(page: Page): Promise<void> {
  const members = await page.locator('[data-testid="prep-roster"] button.ptab').all();
  for (let i = 0; i < members.length; i += 1) {
    // Re-resolve each pass: the panel re-renders after every purchase, so a handle taken
    // before the click is detached by the time the next one is needed.
    await backToParty(page);
    await page.locator('[data-testid="prep-roster"] button.ptab').nth(i).click();
    // The learn list lives behind the LEARN plate on the Skills heading since the dossier
    // (2026-09-09). `openLearn` asserts the list actually arrived, so a walkthrough that
    // silently failed to open it cannot report the same "nothing was affordable" a broke
    // party does.
    await openLearn(page);
    for (let guard = 0; guard < 20; guard += 1) {
      const buy = page.locator('[data-testid="prep-learn"] button.buy:not([disabled])').first();
      if ((await buy.count()) === 0) break;
      await buy.click();
    }
    // The five chassis slots are on the dossier, under the overlay — shut it first.
    await closeLearn(page);
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
  // LEAVE THE SCREEN AS IT WAS FOUND. Every one of these edits happens on the MEMBER
  // view (the split, owner 2026-09-07), where the Deploy plate does not exist — so a
  // caller that walks the party and then clicks Deploy would time out on a hidden
  // button, which reads exactly like a broken plate. Ten specs did.
  await backToParty(page);
}

/**
 * Walk past a standalone scene if one is standing on screen.
 *
 * TOLERANT about whether a scene exists here, STRICT about dismissal working. Scenes are
 * optional content — the campaign authors one before battle 1 and battle 3 and none
 * before battle 2 — so a helper demanding one at every landing would encode a rule
 * nobody wrote. That the prologue actually exists is asserted separately, by AC-V17's
 * own tests, where a vanished scene fails loudly instead of being shrugged past here.
 */
export async function dismissScene(page: Page): Promise<void> {
  const screen = page.getByTestId("screen-scene");
  if (!(await screen.isVisible())) return;
  await page.getByTestId("scene-continue").click();
  await expect(screen).toBeHidden();
}

/**
 * Click New Game the way a real player does — including through the in-page overwrite
 * step when a save is already on the slot.
 *
 * TOLERANT about whether the step appears, for the same reason {@link dismissScene} is:
 * a spec that reuses one `page` across several runs (no fresh context, so `localStorage`
 * carries the previous save forward) meets the confirm step on its second call; a spec
 * that starts from a clean context never does. Asserting the step is ALWAYS there would
 * encode a rule nobody wrote; skipping past it silently would leave the old save intact
 * and the caller playing on stale state instead of a fresh run.
 */
export async function startNewGame(page: Page): Promise<void> {
  await page.getByTestId("new-game").click();
  const confirm = page.getByTestId("new-game-confirm");
  if (await confirm.isVisible()) await page.getByTestId("new-game-confirm-yes").click();
}

/**
 * Put the board's cosmetic animation into a KNOWN frame before a screenshot.
 *
 * WHY THIS EXISTS RATHER THAN A SLEEP. Every spec that screenshots right after a state
 * change now lands on an arbitrary frame of a ~1.5 s animation, and nothing in the suite
 * can see a canvas — so a mid-animation capture would ship under a caption describing the
 * settled board with everything green. A `waitForTimeout` would only trade that for a
 * race on a loaded box. These two drive the page's own animation clock instead:
 *
 *   - {@link settleMotion} jumps to the finished frame (offsets at rest, the numeral
 *     expired). Use it for any frame whose caption describes a board at rest.
 *   - {@link freezeMotion} pins a CHOSEN instant. `0` is impact — the target flashed and
 *     recoiled with the damage numeral at full size — which is the only frame that makes
 *     a caption like "a damage popup is necessarily on screen" true of the image.
 *     Pass `null` to hand the clock back.
 *
 * Both are no-ops on a page with no battle, and tolerant of either seam: `/` installs
 * `window.tuhGame`, `/viewer.html` installs `window.tuh`.
 */
export async function settleMotion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      tuh?: { settleMotion?: () => void };
      tuhGame?: { settleMotion?: () => void };
    };
    w.tuhGame?.settleMotion?.();
    w.tuh?.settleMotion?.();
  });
}

export async function freezeMotion(page: Page, elapsedMs: number | null): Promise<void> {
  await page.evaluate((ms) => {
    const w = window as unknown as {
      tuh?: { freezeMotion?: (ms: number | null) => void };
      tuhGame?: { freezeMotion?: (ms: number | null) => void };
    };
    w.tuhGame?.freezeMotion?.(ms);
    w.tuh?.freezeMotion?.(ms);
  }, elapsedMs);
}

/**
 * OPEN A STAGE OVERLAY, then close it again — the ☰ menu, ⚙ settings, ? help, the
 * Actions sheet or the unit drawer.
 *
 * The battle screen is one stage now (ADR-0037), and the material that used to sit in
 * columns under the board — the turn log, the legend, the full stat card, the status
 * readout — lives behind one of these. Specs that used to read it off the page must
 * open the drawer a player would open, which is also the honest thing to assert: a
 * panel nobody can reach is not shipped.
 */
export async function openDrawer(
  page: Page,
  which: "menu" | "settings" | "help" | "actions" | "unit",
): Promise<void> {
  const opener = {
    menu: "hud-menu",
    settings: "hud-settings",
    help: "hud-help",
    actions: "actions",
    unit: "actor-tab",
  }[which];
  const panel = {
    menu: "menu-drawer",
    settings: "settings-drawer",
    help: "help-drawer",
    actions: "actions-sheet",
    unit: "unit-drawer",
  }[which];
  if (await page.getByTestId(panel).isVisible()) return;
  // CLOSE WHATEVER IS OPEN FIRST. Only one overlay is up at a time, and a LEFT drawer
  // covers the actor tab — the very control that opens the unit drawer — so "click the
  // next opener" is not always reachable. Closing through the panel's own ✕ is what a
  // player does and what always works.
  await closeDrawer(page);
  await page.getByTestId(opener).click();
  await expect(page.getByTestId(panel)).toBeVisible();
}

/**
 * Close whichever stage overlay is open, through its own control.
 *
 * `openDrawer` used to be called twice to "toggle shut", which was a NO-OP: it returns
 * early when the panel is already visible. The comment said one thing and the code did
 * another, and every case downstream was relying on the next opener happening to be
 * uncovered.
 */
export async function closeDrawer(page: Page): Promise<void> {
  for (const panel of ["menu-drawer", "unit-drawer", "settings-drawer", "help-drawer"]) {
    if (await page.getByTestId(panel).isVisible()) {
      await page.getByTestId(`${panel}-close`).click();
      await expect(page.getByTestId(panel)).toBeHidden();
    }
  }
  if (await page.getByTestId("actions-sheet").isVisible()) {
    await page.getByTestId("actions-close").click();
    await expect(page.getByTestId("actions-sheet")).toBeHidden();
  }
}

/** Walk the engine viewer to its PREP screen, which is behind the ☰ menu since ADR-0037. */
export async function openViewerPrep(page: Page): Promise<void> {
  await openDrawer(page, "menu");
  await page.getByTestId("menu-prep").click();
  await expect(page.getByTestId("screen-prep")).toBeVisible();
}

/**
 * Step the live battle one watch-mode turn, from the ☰ menu.
 *
 * IT CLOSES THE DRAWER AGAIN, and that matters for the capture specs: a drawer left
 * open sits in the next frame, under a caption describing a board. Watch mode is a
 * shipped feature (docs/10 §7), not a test hook — it resolves the ACTIVE unit through
 * the balance probe regardless of team, which is what keeps the visual baseline
 * frame-for-frame deterministic.
 */
export async function watchStep(page: Page): Promise<void> {
  await openDrawer(page, "menu");
  await page.getByTestId("btn-step").click();
  await page.getByTestId("hud-menu").click();
  await expect(page.getByTestId("menu-drawer")).toBeHidden();
}
