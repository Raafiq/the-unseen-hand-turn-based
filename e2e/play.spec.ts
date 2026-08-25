/**
 * The PLAYABLE-path interaction suite (docs/10 §6).
 *
 * WHAT THIS FILE IS FOR — and what it deliberately is NOT. `src/render/session.test.ts`
 * already covers AC-V2/V6/V7/V8/V9 headlessly, 22 cases, over purpose-built fixture
 * grids. Re-asserting them here would be slower and weaker. This suite exists for the
 * things only a REAL BROWSER can prove:
 *
 *   1. the shipped `window.tuh` seam is wired to the shipped `Session` (a spec that
 *      passes headlessly proves nothing about `main.ts`'s DOM wiring),
 *   2. the ONE pixel→tile assertion docs/10 §8 allows (AC-V10),
 *   3. keyboard reachability with a visible focus ring — a DOM property,
 *   4. the static screenshots that carry the "this is playable" proof (CLAUDE.md:
 *      the GitHub mobile app shows NO motion format for a private repo, so a still
 *      has to say it on its own).
 *
 * docs/10 §8: "Player-input e2e must not click raw canvas pixels." Every test below
 * drives GRID coordinates through `tuh.clickTile` — which bottoms out in the exact
 * `Session.onPick` a real `pointerdown` uses — EXCEPT the single AC-V10 test, which is
 * the one assertion whose whole subject is the pointer→tile mapping.
 *
 * ─────────────────────────── THE MEASURED SESSION ───────────────────────────
 * Every number below was measured against this build (seed 20260730, `makeDemoBattle`)
 * before a single assertion was written; nothing here is inherited from a planning note.
 *
 *  beat                                  phase        tick cmds actor    pos    CT
 *  page load                             AI_TURN         8    0 mage    (7,5)  104
 *  step()      Mage declares spell.fire  PLAYER_IDLE    10    1 archer  (1,5)  110
 *  (5,5)+End   Archer moves             PLAYER_IDLE    12    2 knight  (1,1)  108
 *  (5,1)+End   Knight moves             AI_TURN        13    3 brawler (7,1)  104
 *  step()      Brawler folds onto Knight AI_TURN        14    4 mage    (7,5)  102
 *  step()      Mage folds move + 2nd cast PLAYER_IDLE   17    5 archer  (5,5)  107   ← the flank decision
 *
 * RE-MEASURED 2026-08-12, after `ai.ts` learned ADR-0015's move+act fold. The six rows
 * above are UNCHANGED (same ticks, command counts, next actor, position and CT) — what
 * changed is what the AI beats DO. The Brawler no longer walks to (6,3); it folds its own
 * move+attack onto the Knight and ends at (5,0), and the Mage folds move+cast to (7,2),
 * aiming its charge at the KNIGHT at (5,1) rather than at the Archer's tile.
 *
 * At the flank decision the Archer sits at (5,5) with ct 107 and the reachable foe is the
 * MAGE at (7,2), facing N. Two staged tiles in its `moveRange` give two different arcs:
 *
 *      staged (6,3) → SIDE arc, 100% hit      staged (7,3) → REAR arc, 100% hit
 *
 * ⚠ Both read 100%: the Mage carries no directional evasion (all eight adjacent tiles
 * probed). The pre-fold pair straddled the Brawler at 75% vs 100%, so it moved the arc
 * NAME *and* the hit %; only the name moves now. These viewer fixtures ride on demo
 * content that a sim change can shift under them — the third time it has happened — so a
 * purpose-built board is recorded in docs/NEXT.md as work for the next slice.
 *
 * (Damage 100 either way — this engine's magnitude is deterministic given a hit, so
 * the arc buys accuracy, not size.) That is the discriminating pair test 3 needs: a
 * preview computed from the ORIGIN (5,5) would read the SIDE arc at 100% for both.
 */

import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { makeDemoBattle } from "../src/render/demo.js";
import { originFor, project } from "../src/render/iso.js";
import { serialize, type BattleState } from "../src/sim/index.js";

const SHOTS = "visual-artifacts/screenshots";

/** The canvas BACKING STORE size (viewer.html `<canvas width height>`). */
const CANVAS_W = 900;
const CANVAS_H = 440;

const phase = (page: Page): Promise<string> => page.evaluate(() => window.tuh.phase());
const state = (page: Page): Promise<BattleState> => page.evaluate(() => window.tuh.getState());
const commandCount = (page: Page): Promise<number> =>
  page.evaluate(() => window.tuh.commands().length);

/** The canonical save-string — the same bytes a mid-battle save would write. */
const saveString = async (page: Page): Promise<string> => serialize(await state(page));

/**
 * Drive the measured opening to the FLANK DECISION POINT (the table above): the
 * Archer active at (5,5) on CT 107, with the Brawler at (6,3) reachable from two
 * tiles that sit in two different facing arcs.
 *
 * Every beat goes through the shipped seam, so this is the same command log a
 * human would produce with the same clicks.
 */
async function playToFlankDecision(page: Page): Promise<void> {
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();
  await page.evaluate(() => {
    window.tuh.step(); // AI: the Mage declares its charged spell
    window.tuh.clickTile(5, 5); // stage the Archer's move …
    window.tuh.endTurn(); //     … and pay only for it (−80)
    window.tuh.clickTile(5, 1); // stage the Knight's move …
    window.tuh.endTurn();
    window.tuh.step(); // AI: the Brawler advances to (6,3)
    window.tuh.step(); // AI: the Mage declares a second cast
  });

  // The measured landing state — asserted, so a drift in the sim surfaces HERE
  // with a clear message instead of as a baffling failure three tests later.
  expect(await phase(page)).toBe("PLAYER_IDLE");
  expect(await commandCount(page)).toBe(5);
  const archer = (await state(page)).units.find((u) => u.id === "archer");
  expect(archer?.pos).toEqual({ x: 5, y: 5 });
  expect(archer?.ct).toBe(107);
}

/** A foe plus two legal staging tiles that put it in DIFFERENT facing arcs. */
interface ArcPair {
  foeId: string;
  foeTile: { x: number; y: number };
  a: { tile: { x: number; y: number }; facing: string };
  b: { tile: { x: number; y: number }; facing: string };
}

/**
 * DISCOVER the flank fixture from the live board instead of hard-coding tiles.
 *
 * These viewer fixtures have now been invalidated FOUR times by demo content shifting
 * under them — each time a named tile stopped holding the unit the test assumed, and
 * each time the fix was to write down new coordinates that would rot the same way. The
 * property under test never involved a particular tile: it is "the preview and the fold
 * are computed from the STAGED tile". So find any foe and any two legal stagings whose
 * arcs differ, and assert against those.
 *
 * Everything here goes through the shipped seam, and none of it touches the sim:
 * staging is pure (AC-V6) and an ILLEGAL stage is refused, so simply attempting every
 * unoccupied tile lets `moveRange` — the sim's own legality — do the filtering. Occupied
 * tiles are skipped because clicking a foe COMMITS the attack.
 */
async function findArcPair(page: Page): Promise<ArcPair> {
  const found = await page.evaluate(() => {
    const s = window.tuh.getState();
    const actor = s.units.find((u) => u.id === window.tuh.getState().units[0]?.id);
    void actor;
    const active = s.units.find((u) => u.ct >= 100 && u.hp > 0)!;
    const occupied = new Set(s.units.filter((u) => u.hp > 0).map((u) => `${u.pos.x},${u.pos.y}`));
    const foes = s.units.filter((u) => u.teamId !== active.teamId && u.hp > 0);

    for (const foe of foes) {
      // Keyed by ABILITY, then by facing. The two stagings must select the SAME ability
      // or the staged tile is not the only variable: on this board the Archer answers a
      // near tile with its range-1 swing and a far one with the bow, and comparing those
      // two would attribute an ability difference to the arc.
      const byAbility = new Map<string, Map<string, { x: number; y: number }>>();
      for (let y = 0; y < s.grid.height; y++) {
        for (let x = 0; x < s.grid.width; x++) {
          if (occupied.has(`${x},${y}`)) continue;
          window.tuh.clickTile(x, y); // stage — refused (no-op) if illegal
          const staged = window.tuh.draft()?.move?.to;
          if (!staged || staged.x !== x || staged.y !== y) continue; // not reachable
          window.tuh.hoverTile(foe.pos.x, foe.pos.y);
          const p = window.tuh.preview();
          if (p && p.targetId === foe.id) {
            const byFacing = byAbility.get(p.abilityId) ?? new Map();
            if (!byFacing.has(p.facing)) byFacing.set(p.facing, { x, y });
            byAbility.set(p.abilityId, byFacing);
          }
          window.tuh.clickTile(x, y); // re-click ⇒ unstage, leaving a clean board
        }
      }
      for (const byFacing of byAbility.values()) {
        const entries = [...byFacing.entries()];
        if (entries.length < 2) continue;
        const first = entries[0]!;
        const second = entries[1]!;
        return {
          foeId: foe.id,
          foeTile: { x: foe.pos.x, y: foe.pos.y },
          a: { tile: first[1], facing: first[0] },
          b: { tile: second[1], facing: second[0] },
        };
      }
    }
    return null;
  });
  // Non-degeneracy: the whole point is that the two stagings DISAGREE. If the board
  // ever stops offering two arcs on any foe, fail loudly here rather than let a
  // downstream assertion pass on a tie.
  expect(found, "no foe on this board is reachable from two different facing arcs").not.toBeNull();
  expect(found!.a.facing).not.toBe(found!.b.facing);
  return found!;
}

// ───────────────────────────────────────────────────────────────────────────────
// 1. AC-V10 — the ONE raw-pixel assertion in the suite.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("AC-V10 — the pointer→tile mapping", () => {
  // Shot at a NARROW viewport on purpose: the canvas is a 900×440 backing store
  // laid out at `width:100%`, so a small window makes the CSS scale ≈0.70 instead
  // of the ≈0.99 a 1000px window gives. At 0.99 a test that forgot the conversion
  // would still land on the right tile by luck; at 0.70 the unconverted point is
  // 134px off — four tiles wide. The conversion has to be real to pass here.
  test.use({ viewport: { width: 700, height: 900 } });

  test("docs/10 AC-V10: a real pointer event resolves to the drawn-on-top tile", async ({
    page,
  }) => {
    await page.goto("/viewer.html");
    const canvas = page.getByTestId("grid");
    await expect(canvas).toBeVisible();
    await canvas.scrollIntoViewIfNeeded();

    // Where the height-2 plateau top at (4,3) is DRAWN, in canvas-backing-store
    // pixels. Taken from the renderer's own forward projection rather than a
    // hard-coded pair, so a camera tweak moves the click with the art instead of
    // breaking this test for a non-behavioural reason (docs/10 §8).
    const origin = originFor(makeDemoBattle(), CANVAS_W, CANVAS_H);
    const plateau = project(4, 3, 2, origin); // measured: { x: 450, y: 216 }

    // NON-DEGENERACY GUARD (CLAUDE.md: an AC test must exercise the discriminating
    // case). Model the BUG — a height-ignoring algebraic inverse of the (x−y, x+y)
    // isometric transform — and prove it picks a DIFFERENT tile at this very point.
    // Without this, the test would also pass against the naive viewer and prove
    // nothing. `project(1,0,0,·)` recovers the half-tile basis, so the bug model
    // stays tied to the real tile size without importing private constants.
    const basis = project(1, 0, 0, { x: 0, y: 0 }); // { TILE_W/2, TILE_H/2 }
    const dx = (plateau.x - origin.x) / basis.x;
    const dy = (plateau.y - origin.y) / basis.y;
    const naive = { x: Math.round((dy + dx) / 2), y: Math.round((dy - dx) / 2) };
    expect(naive).toEqual({ x: 3, y: 2 });
    expect(naive).not.toEqual({ x: 4, y: 3 });

    // CSS pixels → backing-store pixels, via the live box ratio.
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const scaleX = box!.width / CANVAS_W;
    const scaleY = box!.height / CANVAS_H;
    expect(scaleX).toBeLessThan(0.8); // the scaling is substantial, not a no-op
    await page.mouse.click(box!.x + plateau.x * scaleX, box!.y + plateau.y * scaleY);

    // A real pointerdown → `pickTile` → `Session.onPick`: the tile the player SEES
    // on top, not the one a flat inverse computes.
    expect(await page.evaluate(() => window.tuh.cursor())).toEqual({ x: 4, y: 3 });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 2. The fold: one player turn ⇒ exactly ONE command, priced at −100.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * `Session.commit` applies the command (settling the actor's turn) and then calls
 * `advanceToDecision`, which accrues `speed` CT per tick for EVERY unit until the
 * next actor is up. So the CT read after a commit is `settled + speed × ticks`;
 * subtracting the accrual recovers the settle value. Linear only while the unit
 * carries no CT-modifying status — the test asserts that precondition.
 */
function ctAtSettle(ct: number, speed: number, ticksElapsed: number): number {
  return ct - speed * ticksElapsed;
}

test("playable: staging a move then clicking an enemy commits ONE folded command", async ({
  page,
}) => {
  await playToFlankDecision(page);

  const before = await page.evaluate(() => {
    const s = window.tuh.getState();
    const a = s.units.find((u) => u.id === "archer");
    return { n: window.tuh.commands().length, tick: s.tick, ct: a?.ct ?? -1, statuses: a?.statuses.length ?? -1 };
  });
  expect(before.ct).toBe(107);
  expect(before.statuses).toBe(0); // no Haste/Slow ⇒ CT accrual is linear in speed

  // Stage a tile, then click the foe. Selecting the target IS the confirm gesture
  // (docs/10 §3) — two clicks, ONE command.
  //
  // The tile and the foe are DISCOVERED, not written down: this gesture was retargeted
  // twice (brawler → mage, then again) because demo content moved under the hard-coded
  // coordinates, and neither retarget changed the property being tested. See
  // {@link findArcPair}.
  const pair = await findArcPair(page);
  const targetHpBefore = await page.evaluate(
    (id) => window.tuh.getState().units.find((u) => u.id === id)!.hp,
    pair.foeId,
  );
  await page.evaluate(
    ({ stage, foe }) => {
      window.tuh.clickTile(stage.x, stage.y);
      window.tuh.clickTile(foe.x, foe.y);
    },
    { stage: pair.b.tile, foe: pair.foeTile },
  );

  const after = await page.evaluate(
    (id) => {
      const s = window.tuh.getState();
      const a = s.units.find((u) => u.id === "archer");
      const log = window.tuh.commands();
      return {
        n: log.length,
        last: log[log.length - 1],
        tick: s.tick,
        archer: { ct: a?.ct ?? -1, speed: a?.speed ?? -1, pos: a?.pos },
        targetHp: s.units.find((u) => u.id === id)?.hp ?? -1,
        targetHpBefore: 0,
      };
    },
    pair.foeId,
  );
  after.targetHpBefore = targetHpBefore;

  // ── the discriminator: a move command + an act command would make this 2.
  expect(after.n - before.n).toBe(1);

  const last = after.last;
  expect(last?.kind).toBe("act");
  if (last?.kind !== "act") throw new Error("unreachable — narrowed above");
  expect(last.move).not.toBeUndefined();
  expect(last.move).toEqual({ to: pair.b.tile, order: "before" });
  expect(last.target).toEqual({ unitId: pair.foeId });

  // ── the price: the whole turn settled ONCE at −100 (docs/01 AC-02).
  expect(ctAtSettle(after.archer.ct, after.archer.speed, after.tick - before.tick)).toBe(
    before.ct - 100,
  );

  // ── and it really was a move THEN an act from the destination.
  expect(after.archer.pos).toEqual(pair.b.tile);
  // ── and the blow LANDED. Derived, not a written-down HP number: the target must have
  // lost health, which a move-only command (or an act resolved from the origin, out of
  // range) could not produce.
  expect(after.targetHp).toBeLessThan(after.targetHpBefore);
});

// ───────────────────────────────────────────────────────────────────────────────
// 3. The preview recomputes from the STAGED tile — the reason the fold is a choice.
// ───────────────────────────────────────────────────────────────────────────────

test("playable: the preview recomputes from the STAGED tile, not the origin", async ({ page }) => {
  await playToFlankDecision(page);

  // THE FIXTURE IS DISCOVERED, NOT WRITTEN DOWN. Hard-coded tiles here were re-aimed
  // twice as demo content moved, and the second note in this file predicted a third
  // time; there was one. {@link findArcPair} asks the board for any foe reachable from
  // two different arcs, so the test survives content changes that do not touch the
  // property it tests.
  //
  // ⚠ HALF THE ORIGINAL DISCRIMINATOR IS STILL MISSING. The first version of this pair
  // read front 75% vs rear 100%, so BOTH the arc name and the hit % moved with the
  // staged tile. Whether the discovered foe has directional evasion is not guaranteed,
  // so the hit % may or may not move; the arc NAME moving is asserted unconditionally
  // and is what proves recomputation. Stated rather than assumed — a caption claiming
  // two signals while resting on one is the failure mode CLAUDE.md logs.
  const pair = await findArcPair(page);

  const previewFrom = (tile: { x: number; y: number }, foe: { x: number; y: number }) =>
    page.evaluate(
      ({ t, f }) => {
        const staged = window.tuh.draft()?.move?.to;
        if (staged) window.tuh.clickTile(staged.x, staged.y); // unstage whatever is held
        window.tuh.clickTile(t.x, t.y);
        window.tuh.hoverTile(f.x, f.y);
        return window.tuh.preview();
      },
      { t: tile, f: foe },
    );

  const fromA = await previewFrom(pair.a.tile, pair.foeTile);
  const fromB = await previewFrom(pair.b.tile, pair.foeTile);

  expect(fromA).not.toBeNull();
  expect(fromB).not.toBeNull();

  // Same actor, same target, same ability, same CT price — ONLY the staged tile
  // differs. So any difference below is attributable to the staged tile alone.
  expect(fromA!.actorId).toBe(fromB!.actorId);
  expect(fromA!.targetId).toBe(fromB!.targetId);
  expect(fromA!.targetId).toBe(pair.foeId);
  expect(fromA!.abilityId).toBe(fromB!.abilityId);
  expect(fromA!.turn.cost).toBe(100);
  expect(fromB!.turn.cost).toBe(100);
  expect(fromA!.from).toEqual(pair.a.tile);
  expect(fromB!.from).toEqual(pair.b.tile);
  expect(fromA!.from).not.toEqual(fromB!.from);

  // ── THE DISCRIMINATOR. A preview computed once from the ORIGIN could only ever
  // return ONE arc for both stagings; these differ, so the arc is genuinely re-read
  // from the staged tile.
  expect(fromA!.facing).toBe(pair.a.facing);
  expect(fromB!.facing).toBe(pair.b.facing);
  expect(fromA!.facing).not.toBe(fromB!.facing);
});

// ───────────────────────────────────────────────────────────────────────────────
// 4. Illegal click ⇒ reason chip, nothing else.
// ───────────────────────────────────────────────────────────────────────────────

test("playable: an illegal click is refused with a reason and changes nothing", async ({ page }) => {
  await playToFlankDecision(page);

  const before = await saveString(page);
  const cmdsBefore = await commandCount(page);
  expect(await page.evaluate(() => window.tuh.reason())).toBeNull();

  // (0,0) is far outside the Archer's 25-tile `moveRange` from (5,5).
  await page.evaluate(() => window.tuh.clickTile(0, 0));

  expect(await page.evaluate(() => window.tuh.reason())).toBe("Out of Move range");
  await expect(page.getByTestId("reason")).toContainText("Out of Move range");
  await expect(page.getByTestId("reason")).toHaveClass(/warn/);

  // Never a throw, never a state change, never a consumed command (docs/10 §3).
  expect(await saveString(page)).toBe(before);
  expect(await commandCount(page)).toBe(cmdsBefore);
  expect(await phase(page)).toBe("PLAYER_IDLE");
  expect(await page.evaluate(() => window.tuh.draft())).toBeNull();
});

// ───────────────────────────────────────────────────────────────────────────────
// 4b. docs/10 §1: a viewer/sim FORK reaches the SCREEN, not just the console.
// ───────────────────────────────────────────────────────────────────────────────

test("playable: a viewer/sim fork paints the fatal chip instead of freezing the board", async ({
  page,
}) => {
  await playToFlankDecision(page);
  const chipBefore = await page.getByTestId("reason").textContent();

  // CONSTRUCTING A GENUINE FORK. There is none in normal play, by design: the
  // viewer and the driver both ask `moveRange` on the same state. So we make them
  // disagree about WHO IS ACTING — `applyCommand` re-runs `advanceToDecision`
  // internally, and `getState()` hands back the LIVE state object, so raising the
  // Mage's CT gives the turn to the Mage while the viewer still holds the
  // Archer's move range on screen. The Archer's legal destination is then applied
  // to a unit four steps away with `move: 3`, and the driver really throws.
  const thrown = await page.evaluate(() => {
    const live = window.tuh.getState();
    window.tuh.clickTile(2, 5); // inside the ARCHER's moveRange
    if (window.tuh.phase() !== "MOVE_STAGED") return `not staged: ${window.tuh.phase()}`;
    const mage = live.units.find((u) => u.id === "mage");
    if (!mage) return "no mage";
    mage.ct = 500;
    try {
      window.tuh.endTurn();
      return "no throw";
    } catch (err) {
      return String(err);
    }
  });

  // The sim really rejected it — the fork is genuine, not simulated by a stub.
  expect(thrown).toMatch(/illegal move for mage/);

  // ── THE DISCRIMINATOR. `Session.commit` records `fatal` and RETHROWS; the DOM
  // handler must still repaint on the way out. A handler written as
  // `session.endTurn(); refresh();` skips that repaint, leaving the player with
  // the STALE chip below and a frozen board while the message goes only to the
  // console — which is precisely "swallowed" in the sense docs/10 §1 forbids.
  await expect(page.getByTestId("reason")).toHaveClass(/fatal/);
  await expect(page.getByTestId("reason")).toContainText("viewer/sim fork");
  await expect(page.getByTestId("reason")).toContainText("illegal move for mage");
  expect(await page.getByTestId("reason").textContent()).not.toBe(chipBefore);
});

// ───────────────────────────────────────────────────────────────────────────────
// 5. Accessibility: keyboard-reachable End Turn, Escape cancels for free.
// ───────────────────────────────────────────────────────────────────────────────

test("accessibility: End Turn is keyboard-reachable and Escape cancels a staged draft", async ({
  page,
}) => {
  await page.goto("/viewer.html");
  await expect(page.getByTestId("grid")).toBeVisible();
  await page.evaluate(() => window.tuh.step()); // → the Archer's first turn
  expect(await phase(page)).toBe("PLAYER_IDLE");

  // ── ESCAPE CANCELS A DRAFT, and the sim was never touched.
  const before = await saveString(page);
  const cmdsBefore = await commandCount(page);
  await page.evaluate(() => window.tuh.clickTile(4, 5));

  // Non-vacuity: the draft really existed and really changed what End Turn costs.
  expect(await phase(page)).toBe("MOVE_STAGED");
  expect(await page.evaluate(() => window.tuh.draft())).toEqual({
    actorId: "archer",
    move: { to: { x: 4, y: 5 } },
    act: null,
  });
  await expect(page.getByTestId("end-turn")).toContainText("moved only");

  await page.keyboard.press("Escape");

  expect(await phase(page)).toBe("PLAYER_IDLE");
  expect(await page.evaluate(() => window.tuh.draft())).toBeNull();
  expect(await saveString(page)).toBe(before); // byte-identical: tick, rngCounter, turnLog
  expect(await commandCount(page)).toBe(cmdsBefore);
  // Escape put the draft back, so the button must be quoting the CHEAPER price again —
  // which is the assertion that Escape actually undid something, not just the wording.
  await expect(page.getByTestId("end-turn")).toContainText("waited");

  // ── TAB REACHES THE CONTROL, WITH A VISIBLE RING (docs/04 §7, docs/10 §3).
  // Tab order is asserted explicitly rather than looped-until-found, so a control
  // that becomes reachable only after ten tabs still fails. The FIRST stop is the
  // "Play the campaign" link in the header (the game shell, docs/11 M0 item 1) —
  // named here rather than skipped, because a silent `Tab` that lands nowhere in
  // particular is how a tab-order regression hides.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /Play the campaign/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("grid")).toBeFocused(); // the board itself is focusable
  await page.keyboard.press("Tab");
  const endTurn = page.getByTestId("end-turn");
  await expect(endTurn).toBeFocused();

  // "Visible focus" is a rendered ring, not merely `document.activeElement` — a
  // `:focus-visible { outline: none }` regression must fail this.
  const ring = await endTurn.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      focusVisible: el.matches(":focus-visible"),
      style: cs.outlineStyle,
      width: cs.outlineWidth,
    };
  });
  expect(ring.focusVisible).toBe(true);
  expect(ring.style).toBe("solid");
  expect(parseFloat(ring.width)).toBeGreaterThan(0);

  // ── ENTER COMMITS from the keyboard alone.
  await page.keyboard.press("Enter");
  expect(await commandCount(page)).toBe(cmdsBefore + 1);
  const committed = await page.evaluate(() => window.tuh.commands());
  expect(committed[committed.length - 1]).toEqual({ kind: "wait" });
});

// ───────────────────────────────────────────────────────────────────────────────
// The proof sheet — STATIC images that have to carry the argument on their own.
//
// CLAUDE.md's verified on-device finding: the GitHub mobile app displays NO motion
// format for a private repo (no inline images, no video player, GIFs do not
// animate); static images via tap-through are the only medium it shows. So these
// are shot in a NARROW, single-column layout (viewer.html collapses `.cols` below
// 720px) at deviceScaleFactor 2 — the transparency panel then spans the full frame
// width at 2× pixel density instead of sitting in a third of a 1000px desktop
// shot, which is the difference between legible and not on a phone.
//
// Each shot's claim is ASSERTED in the same test that captures it, so a caption can
// never outlive the state it describes.
// ───────────────────────────────────────────────────────────────────────────────

test.describe("playable — the static proof sheet", () => {
  test.use({ viewport: { width: 700, height: 1500 }, deviceScaleFactor: 2 });

  const PAD = 10;

  /** Screenshot the union of some elements' boxes (+ padding), full-page-relative. */
  async function clipShot(page: Page, file: string, selectors: string[]): Promise<void> {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (const sel of selectors) {
      const box = await page.locator(sel).first().boundingBox();
      if (box) boxes.push(box);
    }
    expect(boxes.length).toBe(selectors.length);
    const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - PAD);
    const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - PAD);
    const right = Math.max(...boxes.map((b) => b.x + b.width)) + PAD;
    const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + PAD;
    await page.screenshot({
      path: `${SHOTS}/${file}`,
      fullPage: true,
      clip: { x, y, width: right - x, height: bottom - y },
    });
  }

  const STAGE = ".stage";
  // Single-column layout (viewport < 720px), so `.cols`' panels stack in source
  // order: [0] the resolution preview, [1] the turn log.
  const PREVIEW_PANEL = ".cols > .panel:nth-child(1)";
  const LOG_PANEL = ".cols > .panel:nth-child(2)";

  test("proof sheet: player turn, the staged-tile preview pair, refusal, the fold, the AI turn", async ({
    page,
  }) => {
    await mkdir(SHOTS, { recursive: true });
    await playToFlankDecision(page);

    // ── 10: the player's turn. Move range painted, End Turn states its price, and
    // THE ARCHER CAN SHOOT — which is this frame's argument now, and it is the
    // opposite of what it used to be. Until the Archer carried `aim.aimed-shot` its
    // only action was a range-1 swing, so nothing was ever targetable from where it
    // stood and the frame argued "you must spend your move to buy an attack".
    // `docs/10` §5 recorded that as a known limitation whose blocker was unmodeled
    // weapon range; the real blocker was that the Archer had no bow SKILL, which
    // needs no equipment layer. With one, the frame shows the genuinely more
    // interesting choice: shoot the Mage from here for −80, or spend the move to
    // flank the Brawler for −100 (frames 11–14).
    //
    // Asserted, because an earlier caption on this frame claimed "the one enemy it
    // could reach is tinted red" — there is no target tint here at all; the
    // red/orange parallelogram is the enemy Mage's in-flight charge reticle.
    //
    // THE RETICLE MOVED (2026-08-12). It used to sit on the tile the Archer was
    // standing on; since `ai.ts` learned the move+act fold, the Mage aims at the
    // KNIGHT at (5,1) instead. That is the second time this frame's prose has drifted
    // from what it depicts, so the reticle's tile is pinned to the Knight explicitly
    // rather than to "the Archer" — if it moves again, this fails loudly instead of
    // leaving a caption that quietly lies.
    await expect(page.getByTestId("status")).toContainText("Active Archer (you)");
    await expect(page.getByTestId("end-turn")).toContainText("End Turn · waited");
    expect(await page.evaluate(() => window.tuh.getState().units.length)).toBe(4);
    const reach = await page.evaluate(() => {
      const s = window.tuh.getState();
      const posOf = (id: string) => s.units.find((u) => u.id === id)!.pos;
      // Hover each FOE in turn through the shipped seam and keep its preview, so
      // "both foes are legal targets" is read from the sim's own answer rather than
      // re-derived here (docs/10 §1: the sim owns legality).
      const previewOf = (id: string) => {
        const p = posOf(id);
        window.tuh.hoverTile(p.x, p.y);
        return window.tuh.preview();
      };
      const mage = previewOf("mage");
      const brawler = previewOf("brawler");
      return {
        preview: mage,
        brawlerPreview: brawler,
        charge: s.chargeQueue.map((c) => c.targetTile),
        // Which team each charge is aimed AT, derived rather than named — see below.
        chargeAimedAtPlayerUnit: s.chargeQueue.map((c) =>
          s.units.some(
            (u) => u.teamId === 0 && u.pos.x === c.targetTile.x && u.pos.y === c.targetTile.y,
          ),
        ),
        archer: posOf("archer"),
        knight: posOf("knight"),
        mage: posOf("mage"),
      };
    });
    // Hovers a REAL foe: this used to hover (6,3), which the Brawler has vacated, so
    // the old "none is targetable" claim was being made over empty ground — true, but
    // for the wrong reason and provable by nothing.
    //
    // THE DISCRIMINATING PART is which ability answers. A preview alone would appear
    // for a melee archer too if a foe happened to be adjacent, so assert that the shot
    // is the BOW, fired across a gap no range-1 swing could cross, without moving.
    expect(reach.preview).not.toBeNull();
    expect(reach.preview?.abilityId).toBe("aim.aimed-shot");
    expect(reach.preview?.targetId).toBe("mage");
    expect(reach.preview?.moved).toBe(false); // fired from where it stands
    expect(reach.preview?.turn.cost).toBe(80); // act-only, not the −100 fold
    // Chebyshev distance from the Archer to its target is strictly greater than the
    // range-1 swing could reach — so this frame is impossible without the bow.
    const gap = Math.max(
      Math.abs((reach.archer?.x ?? 0) - (reach.mage?.x ?? 0)),
      Math.abs((reach.archer?.y ?? 0) - (reach.mage?.y ?? 0)),
    );
    expect(gap).toBeGreaterThan(1);
    // BOTH foes answer, which is what the frame shows (two red-tinted units) and what
    // its caption claims — the bow reaches the whole enemy line from a standstill.
    expect(reach.brawlerPreview).not.toBeNull();
    expect(reach.brawlerPreview?.abilityId).toBe("aim.aimed-shot");
    // THE ORANGE SHAPE IS AN INCOMING SPELL, NOT A TARGET MARKER. An early caption on
    // this frame read "the one enemy it could reach is tinted red", which had a reviewer
    // reading an incoming nuke as an attack option. The claim is asserted, but WITHOUT
    // naming the victim: it has now moved three times (the Archer's tile → the Knight →
    // the Archer again) as demo content shifted, and each time a test that named a unit
    // went red for a reason that had nothing to do with the property. What must hold is
    // that exactly one charge is in flight and it is aimed at one of YOUR units.
    expect(reach.charge).toHaveLength(1);
    expect(reach.chargeAimedAtPlayerUnit).toEqual([true]);
    await clipShot(page, "10-player-turn.png", [STAGE]);

    // ── 13: an illegal click, from a clean idle board. Reason chip up, nothing
    // else moves. Captured before anything is staged so the frame shows the
    // refusal alone rather than a refusal plus a leftover ghost.
    const beforeRefusal = await saveString(page);
    await page.evaluate(() => window.tuh.clickTile(0, 0));
    await expect(page.getByTestId("reason")).toContainText("Out of Move range");
    await expect(page.getByTestId("reason")).toHaveClass(/warn/);
    expect(await saveString(page)).toBe(beforeRefusal);
    expect(await phase(page)).toBe("PLAYER_IDLE");
    await clipShot(page, "13-illegal.png", [STAGE]);

    // ── 11 / 12: THE PAIR. Same actor, same target, same ability, two staged tiles,
    // two arcs. The tiles are DISCOVERED ({@link findArcPair}) rather than written down:
    // this pair was re-aimed twice on hard-coded coordinates and broke a third time, and
    // none of those breakages involved the property under test. The arc NAME moving is
    // the assertion; whether the hit % also moves depends on the discovered foe's
    // directional evasion, so the caption must not imply two signals.
    const pair = await findArcPair(page);
    const arcText = (f: string): string => `${f.toUpperCase()} arc`;

    await page.evaluate(
      ({ t, f }) => {
        window.tuh.clickTile(t.x, t.y);
        window.tuh.hoverTile(f.x, f.y);
      },
      { t: pair.a.tile, f: pair.foeTile },
    );
    await expect(page.getByTestId("preview")).toContainText(arcText(pair.a.facing));
    await clipShot(page, "11-preview-a.png", [STAGE, PREVIEW_PANEL]);

    await page.evaluate(
      ({ a, b, f }) => {
        window.tuh.clickTile(a.x, a.y); // unstage
        window.tuh.clickTile(b.x, b.y); // stage the other arc's tile instead
        window.tuh.hoverTile(f.x, f.y);
      },
      { a: pair.a.tile, b: pair.b.tile, f: pair.foeTile },
    );
    await expect(page.getByTestId("preview")).toContainText(arcText(pair.b.facing));
    await clipShot(page, "12-preview-b.png", [STAGE, PREVIEW_PANEL]);

    // ── 14: the fold, committed — one click on the foe from the staged tile.
    expect(await phase(page)).toBe("MOVE_STAGED");
    const nBefore = await commandCount(page);
    const foeHpBefore = (await state(page)).units.find((u) => u.id === pair.foeId)!.hp;
    await page.evaluate((f) => window.tuh.clickTile(f.x, f.y), pair.foeTile);
    expect(await commandCount(page)).toBe(nBefore + 1);
    const post = await state(page);
    expect(post.units.find((u) => u.id === "archer")?.pos).toEqual(pair.b.tile);
    expect(post.units.find((u) => u.id === pair.foeId)!.hp).toBeLessThan(foeHpBefore);
    // The turn log is included here and only here: it is the one place a STILL can
    // show that the move and the strike were ONE turn ("move 7,3" then "hit
    // mage" at the same tick), which is the whole claim of the fold.
    //
    // THE SAME TICK IS THE CLAIM, SO IT IS ASSERTED — not left to the caption.
    // Both halves of the fold land at one tick because neither sub-phase advances
    // the clock; that is cheap to assert and it is exactly what a regression to
    // two separate commands would break.
    const foldEntries = post.turnLog.filter((e) => e.unitId === "archer").slice(-2);
    expect(foldEntries[0]!.action).toBe(`move ${pair.b.tile.x},${pair.b.tile.y}`);
    // The strike's log line is `hit <id> −N` or `KO <id>` depending on whether the blow
    // was lethal — which depends on the roster's HP, so match the half that is the
    // claim (a landed blow on THIS foe) rather than the half that is tuning.
    expect(foldEntries[1]!.action).toContain(pair.foeId);
    expect(foldEntries[1]!.action).toMatch(/^(hit|KO) /);
    const foldTick = foldEntries[0]!.tick;
    expect(foldEntries[1]!.tick).toBe(foldTick);
    // Non-vacuity: the log's ticks are NOT all the same, so the equality above is
    // a property of THIS turn rather than of a clock that never moves.
    expect(new Set(post.turnLog.map((e) => e.tick)).size).toBeGreaterThan(1);
    // …and the FRAME shows that tick on both rows, so the caption cannot drift
    // from the picture it describes.
    // The panel resolves unit IDS inside the action text to display names (a playtest
    // found the campaign log reading "hit red-brigand-1 −137" under a chip that said
    // "Brigand"). Expected text is built from the DEMO'S OWN label table, which is an
    // independent source rather than a second copy of `nameIdsIn`.
    const DEMO_LABELS: Record<string, string> = {
      knight: "Knight",
      archer: "Archer",
      brawler: "Brawler",
      mage: "Mage",
    };
    const asRead = (action: string): string => {
      let out = action;
      for (const [id, label] of Object.entries(DEMO_LABELS)) out = out.split(id).join(label);
      return out;
    };
    await expect(page.locator(LOG_PANEL)).toContainText(
      `t${foldTick} · Archer · ${asRead(foldEntries[0]!.action)}`,
    );
    await expect(page.locator(LOG_PANEL)).toContainText(
      `t${foldTick} · Archer · ${asRead(foldEntries[1]!.action)}`,
    );
    await clipShot(page, "14-committed.png", [STAGE, LOG_PANEL]);

    // ── 15: an AI turn, with input inert. Reached by ending the player's turn; the
    // board still carries the damage the fold dealt, so the frame shows an AI turn IN
    // a fight rather than the opening deploy. WHICH AI unit is up is not asserted —
    // that is a function of the roster's Speeds and has already invalidated this frame
    // once; the claim is that it is an AI turn and that input is inert.
    expect(await phase(page)).toBe("PLAYER_IDLE");
    await page.evaluate(() => window.tuh.endTurn());
    expect(await phase(page)).toBe("AI_TURN");
    await expect(page.getByTestId("status")).toContainText("(AI)");
    await expect(page.getByTestId("end-turn")).toBeDisabled();

    // Input really is inert: a click that would be legal on a player turn does not
    // move the state or the log.
    const beforeAi = await saveString(page);
    const nAi = await commandCount(page);
    await page.evaluate(() => window.tuh.clickTile(7, 4));
    expect(await page.evaluate(() => window.tuh.reason())).toBe("Not your turn");
    expect(await saveString(page)).toBe(beforeAi);
    expect(await commandCount(page)).toBe(nAi);
    await clipShot(page, "15-ai-turn.png", [STAGE]);
  });
});
